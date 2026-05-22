const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ==================== 数据结构 ====================

/** 匹配队列 */
const matchQueue = [];

/** 活跃房间：roomId → { black, white, state } */
const rooms = new Map();

let roomSeq = 0;

// ==================== WebSocket 服务器 ====================

const wss = new WebSocketServer({ port: PORT });
console.log(`[Server] 成三棋服务器启动，端口 ${PORT}`);

wss.on('connection', (ws, req) => {
  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[Server] 新连接: ${clientId} (${req.socket.remoteAddress})`);

  ws._clientId = clientId;
  ws._roomId = null;
  ws._color = null;

  send(ws, { type: 'connected', clientId });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    handleMessage(ws, msg);
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });

  ws.on('error', (err) => {
    console.error(`[Server] ${clientId} 连接错误:`, err.message);
  });
});

// ==================== 消息处理 ====================

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'match_request':
      handleMatchRequest(ws);
      break;
    case 'cancel_match':
      handleCancelMatch(ws);
      break;
    case 'place':
    case 'move':
    case 'remove':
    case 'surrender':
    case 'rematch_request':
      forwardToOpponent(ws, msg);
      break;
    case 'ping':
      send(ws, { type: 'pong' });
      break;
    default:
      console.log(`[Server] 未知消息类型: ${msg.type}`);
  }
}

// ==================== 匹配逻辑 ====================

function handleMatchRequest(ws) {
  // 防止重复匹配
  if (ws._roomId) {
    send(ws, { type: 'error', message: '你已在房间中' });
    return;
  }

  // 从队列中移除旧请求（如果有）
  const idx = matchQueue.findIndex((s) => s._clientId === ws._clientId);
  if (idx >= 0) matchQueue.splice(idx, 1);

  // 检查队列中是否有人在等待
  if (matchQueue.length > 0) {
    const opponent = matchQueue.shift();
    // 确保对手还没断开
    if (opponent.readyState !== ws.OPEN) {
      handleMatchRequest(ws); // 重新匹配
      return;
    }

    const roomId = `room_${++roomSeq}`;
    rooms.set(roomId, { black: opponent, white: ws });

    // 分配颜色：先到队列的为黑方（先手）
    opponent._roomId = roomId;
    opponent._color = 'black';
    ws._roomId = roomId;
    ws._color = 'white';

    send(opponent, { type: 'matched', color: 'black', opponentId: ws._clientId });
    send(ws, { type: 'matched', color: 'white', opponentId: opponent._clientId });

    console.log(`[Server] 匹配成功: ${opponent._clientId}(黑) vs ${ws._clientId}(白) 房间=${roomId}`);
  } else {
    // 加入等待队列
    matchQueue.push(ws);
    send(ws, { type: 'waiting', message: '正在匹配对手...', queuePosition: matchQueue.length });
    console.log(`[Server] ${ws._clientId} 加入匹配队列 (位置 ${matchQueue.length})`);
  }
}

function handleCancelMatch(ws) {
  const idx = matchQueue.indexOf(ws);
  if (idx >= 0) {
    matchQueue.splice(idx, 1);
    send(ws, { type: 'match_cancelled' });
    console.log(`[Server] ${ws._clientId} 取消匹配`);
  }
}

// ==================== 消息转发 ====================

function forwardToOpponent(ws, msg) {
  if (!ws._roomId) return;

  const room = rooms.get(ws._roomId);
  if (!room) return;

  const opponent = ws._color === 'black' ? room.white : room.black;
  if (!opponent || opponent.readyState !== ws.OPEN) return;

  // 包装消息，添加发送方标记
  const forwardMsg = {
    ...msg,
    fromColor: ws._color,
  };

  // 对于 move/place/remove 添加 game 前缀区分对手动作
  if (['place', 'move', 'remove', 'surrender', 'rematch_request'].includes(msg.type)) {
    send(opponent, { type: `opponent_${msg.type}`, ...msg });
  } else {
    send(opponent, forwardMsg);
  }
}

// ==================== 断线处理 ====================

function handleDisconnect(ws) {
  console.log(`[Server] ${ws._clientId} 断开连接`);

  // 从匹配队列移除
  const qIdx = matchQueue.indexOf(ws);
  if (qIdx >= 0) matchQueue.splice(qIdx, 1);

  // 通知对手
  if (ws._roomId) {
    const room = rooms.get(ws._roomId);
    if (room) {
      const opponent = ws._color === 'black' ? room.white : room.black;
      if (opponent && opponent.readyState === ws.OPEN) {
        send(opponent, { type: 'opponent_disconnected' });
        opponent._roomId = null;
        opponent._color = null;
      }
      rooms.delete(ws._roomId);
    }
  }
}

// ==================== 工具函数 ====================

function send(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// 定期清理断开的连接
setInterval(() => {
  // 清理匹配队列中断开的连接
  for (let i = matchQueue.length - 1; i >= 0; i--) {
    if (matchQueue[i].readyState !== matchQueue[i].OPEN) {
      matchQueue.splice(i, 1);
    }
  }
  // 清理空房间
  for (const [id, room] of rooms) {
    if (
      (!room.black || room.black.readyState !== room.black.OPEN) &&
      (!room.white || room.white.readyState !== room.white.OPEN)
    ) {
      rooms.delete(id);
    }
  }
}, 30000);
