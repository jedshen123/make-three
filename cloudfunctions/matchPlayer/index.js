// 云函数：matchPlayer - 成三棋配对
// 部署：在微信开发者工具中右键此目录 → 上传并部署

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || 'match';

  try {
    switch (action) {
      case 'match':
        return await handleMatch(OPENID);
      case 'cancel':
        return await handleCancel(OPENID);
      case 'heartbeat':
        return await handleHeartbeat(OPENID);
      default:
        return { success: false, message: '未知操作' };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }
};

// ==================== 匹配 ====================

async function handleMatch(openid) {
  const queueCol = db.collection('match_queue');

  // 检查是否已在队列中
  const exist = await queueCol.where({ _openid: openid }).get();
  if (exist.data.length > 0) {
    return { success: false, message: '已在匹配队列中' };
  }

  // 查找等待中的对手
  const waiting = await queueCol
    .where({ _openid: _.neq(openid) })
    .orderBy('createTime', 'asc')
    .limit(1)
    .get();

  if (waiting.data.length > 0) {
    // 匹配成功，创建房间
    const opponent = waiting.data[0];
    const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await db.collection('game_rooms').add({
      data: {
        _id: roomId,
        players: [
          { openid: opponent._openid, color: 'black' }, // 先到为黑方
          { openid: openid, color: 'white' },
        ],
        moves: [],
        status: 'playing',
        createTime: Date.now(),
      },
    });

    // 从队列移除两人
    await queueCol.doc(opponent._id).remove();
    await queueCol.where({ _openid: openid }).remove();

    console.log(`匹配成功: ${opponent._openid}(黑) vs ${openid}(白) 房间=${roomId}`);
    return { success: true, matched: true, roomId, color: 'white' };
  }

  // 无人等待，加入队列
  await queueCol.add({
    data: {
      _openid: openid,
      createTime: Date.now(),
    },
  });

  console.log(`${openid} 加入匹配队列`);
  return { success: true, matched: false, message: '已加入匹配队列' };
}

// ==================== 取消匹配 ====================

async function handleCancel(openid) {
  await db.collection('match_queue').where({ _openid: openid }).remove();
  return { success: true, message: '已取消匹配' };
}

// ==================== 心跳（检查是否已匹配） ====================

async function handleHeartbeat(openid) {
  // 检查是否有自己的房间
  const rooms = await db
    .collection('game_rooms')
    .where({
      'players.openid': openid,
      status: _.in(['playing', 'matched']),
    })
    .orderBy('createTime', 'desc')
    .limit(1)
    .get();

  if (rooms.data.length > 0) {
    const room = rooms.data[0];
    const me = room.players.find((p) => p.openid === openid);
    const isFirstPlayer = room.players[0].openid === openid;

    // 首次匹配到的黑方通过 heartbeat 得知
    if (isFirstPlayer && room.status === 'playing') {
      // 更新状态防止重复通知
      await db.collection('game_rooms').doc(room._id).update({
        data: { status: 'matched' },
      });
    }

    return {
      success: true,
      matched: true,
      roomId: room._id,
      color: me ? me.color : 'black',
    };
  }

  return { success: true, matched: false };
}
