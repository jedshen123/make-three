import { _decorator, Component } from 'cc';
import { Player } from '../core/GameTypes';
const { ccclass, property } = _decorator;

/** 匹配状态 */
export enum CloudState {
  Idle = 'idle',
  Matching = 'matching',
  Matched = 'matched',
  Playing = 'playing',
  Error = 'error',
}

/** 游戏操作 */
interface GameMove {
  openid: string;
  type: 'place' | 'move' | 'remove';
  position?: number;
  from?: number;
  to?: number;
  seq: number;
  timestamp: number;
}

/** 检测是否在微信小游戏环境 */
function isWechatGame(): boolean {
  return typeof wx !== 'undefined' && typeof wx.cloud !== 'undefined';
}

/**
 * 云开发网络管理器
 *
 * 无需自建服务器，使用微信云开发实现实时对战：
 *   - 匹配：云函数 matchPlayer
 *   - 同步：数据库 game_rooms/{roomId}.moves 数组 + watch() 监听
 */
@ccclass('CloudNetworkManager')
export class CloudNetworkManager extends Component {
  @property({ tooltip: '云开发环境 ID（在微信开发者工具 → 云开发 中获取）' })
  envId: string = '';

  private _state: CloudState = CloudState.Idle;
  private _db: any = null;
  private _myColor: Player = Player.None;
  private _roomId: string = '';
  private _openid: string = '';
  private _lastSeq: number = -1;
  private _watcher: any = null;
  private _heartbeatTimer: number | null = null;

  // ==================== 回调 ====================

  onStateChanged: ((state: CloudState) => void) | null = null;
  onMatched: ((myColor: Player) => void) | null = null;
  onOpponentPlace: ((position: number) => void) | null = null;
  onOpponentMove: ((from: number, to: number) => void) | null = null;
  onOpponentRemove: ((position: number) => void) | null = null;
  onOpponentSurrender: (() => void) | null = null;
  onOpponentDisconnected: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  // ==================== 公共属性 ====================

  get state(): CloudState { return this._state; }
  get myColor(): Player { return this._myColor; }
  get roomId(): string { return this._roomId; }

  // ==================== 初始化 ====================

  /** 初始化云开发（必须在匹配前调用） */
  async init(): Promise<boolean> {
    if (!isWechatGame()) {
      this.onError?.('云开发仅在微信小游戏环境中可用');
      return false;
    }

    try {
      wx.cloud.init({ env: this.envId });
      this._db = wx.cloud.database();
      return true;
    } catch (e: any) {
      this.onError?.('云开发初始化失败: ' + e.message);
      return false;
    }
  }

  // ==================== 匹配 ====================

  /** 开始匹配 */
  async startMatch(): Promise<void> {
    if (!isWechatGame() || !this._db) {
      this.onError?.('云开发未初始化');
      return;
    }

    this._setState(CloudState.Matching);

    try {
      const res = await wx.cloud.callFunction({
        name: 'matchPlayer',
        data: { action: 'match' },
      });

      const data = res.result as any;

      if (data.success && data.matched) {
        this._roomId = data.roomId;
        this._myColor = data.color === 'black' ? Player.Black : Player.White;
        this._setState(CloudState.Matched);
        this._startGameWatch();
        this.onMatched?.(this._myColor);
      } else if (data.success && !data.matched) {
        // 在队列中等待，启动心跳轮询
        this._startHeartbeat();
      } else {
        this._setState(CloudState.Error);
        this.onError?.(data.message || '匹配失败');
      }
    } catch (e: any) {
      this._setState(CloudState.Error);
      this.onError?.('匹配请求失败: ' + e.message);
    }
  }

  /** 取消匹配 */
  async cancelMatch(): Promise<void> {
    this._stopHeartbeat();
    if (isWechatGame()) {
      await wx.cloud.callFunction({
        name: 'matchPlayer',
        data: { action: 'cancel' },
      });
    }
    this._setState(CloudState.Idle);
  }

  // ==================== 游戏操作 ====================

  sendPlace(position: number): void {
    this._appendMove({ type: 'place', position });
  }

  sendMove(from: number, to: number): void {
    this._appendMove({ type: 'move', from, to });
  }

  sendRemove(position: number): void {
    this._appendMove({ type: 'remove', position });
  }

  sendSurrender(): void {
    if (!this._roomId) return;
    this._db.collection('game_rooms').doc(this._roomId).update({
      data: { status: 'surrender' },
    });
  }

  /** 清理 */
  destroy(): void {
    this._stopHeartbeat();
    this._stopWatcher();
  }

  // ==================== 内部 ====================

  private async _appendMove(move: Omit<GameMove, 'openid' | 'seq' | 'timestamp'>): Promise<void> {
    if (!this._roomId || !this._db) return;

    const doc = this._db.collection('game_rooms').doc(this._roomId);

    try {
      // 读取当前 moves 长度作为 seq
      const snap = await doc.get();
      const moves = snap.data?.moves || [];
      const seq = moves.length;

      await doc.update({
        data: {
          moves: this._db.command.push({
            openid: this._openid,
            ...move,
            seq,
            timestamp: Date.now(),
          }),
        },
      });
    } catch (e: any) {
      console.error('[Cloud] 写入操作失败:', e);
    }
  }

  /** 启动游戏数据监听 */
  private _startGameWatch(): void {
    if (!this._roomId || !this._db) return;

    this._stopWatcher();

    const watcher = this._db
      .collection('game_rooms')
      .doc(this._roomId)
      .watch({
        onChange: (snapshot: any) => {
          this._handleRoomChange(snapshot);
        },
        onError: (err: any) => {
          console.error('[Cloud] watch 错误:', err);
        },
      });

    this._watcher = watcher;
    this._setState(CloudState.Playing);
  }

  private _handleRoomChange(snapshot: any): void {
    if (snapshot.docChanges) {
      for (const change of snapshot.docChanges) {
        const data = change.doc;

        // 检查认输
        if (data.status === 'surrender') {
          this.onOpponentSurrender?.();
          return;
        }

        // 处理新操作
        const moves: GameMove[] = data.moves || [];
        if (moves.length > 0 && this._lastSeq < moves.length - 1) {
          for (let i = this._lastSeq + 1; i < moves.length; i++) {
            const move = moves[i];
            // 只处理对手的操作
            if (move.openid === this._openid) continue;

            switch (move.type) {
              case 'place':
                this.onOpponentPlace?.(move.position!);
                break;
              case 'move':
                this.onOpponentMove?.(move.from!, move.to!);
                break;
              case 'remove':
                this.onOpponentRemove?.(move.position!);
                break;
            }
          }
          this._lastSeq = moves.length - 1;
        }
      }
    }
  }

  /** 心跳轮询（等待匹配成功） */
  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(async () => {
      if (!isWechatGame()) return;

      try {
        const res = await wx.cloud.callFunction({
          name: 'matchPlayer',
          data: { action: 'heartbeat' },
        });

        const data = res.result as any;
        if (data.success && data.matched) {
          this._stopHeartbeat();
          this._roomId = data.roomId;
          this._myColor = data.color === 'black' ? Player.Black : Player.White;
          this._setState(CloudState.Matched);
          this._startGameWatch();
          this.onMatched?.(this._myColor);
        }
      } catch (e) {
        // 忽略心跳错误
      }
    }, 2000) as unknown as number;
  }

  private _stopHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  private _stopWatcher(): void {
    if (this._watcher) {
      try { this._watcher.close(); } catch (e) {}
      this._watcher = null;
    }
  }

  private _setState(state: CloudState): void {
    if (this._state !== state) {
      this._state = state;
      this.onStateChanged?.(state);
    }
  }

  onDestroy(): void {
    this.destroy();
  }
}
