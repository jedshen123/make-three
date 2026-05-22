import { _decorator, Component, sys } from 'cc';
import { Player, GameMode } from '../core/GameTypes';
const { ccclass, property } = _decorator;

/** 网络连接状态 */
export enum NetworkState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Waiting = 'waiting',       // 等待匹配中
  Matched = 'matched',       // 匹配成功，等待开始
  Playing = 'playing',       // 游戏中
}

/**
 * 网络管理器 - 通过 WebSocket 实现双人在线对战
 *
 * 协议：
 *   客户端 → 服务器: { type: 'match_request'|'place'|'move'|'remove'|'surrender' }
 *   服务器 → 客户端: { type: 'waiting'|'matched'|'opponent_place'|'opponent_move'|... }
 *
 * 部署：
 *   cd server && npm install && npm start
 *   服务器默认监听 ws://localhost:3000
 */
@ccclass('NetworkManager')
export class NetworkManager extends Component {
  @property({ tooltip: 'WebSocket 服务器地址，部署后改为实际地址' })
  serverUrl: string = 'ws://localhost:3000';

  private _ws: WebSocket | null = null;
  private _state: NetworkState = NetworkState.Disconnected;
  private _myColor: Player = Player.None;
  private _clientId: string = '';
  private _opponentId: string = '';
  private _pingTimer: number | null = null;

  // ==================== 事件回调 ====================

  onStateChanged: ((state: NetworkState) => void) | null = null;
  onMatched: ((myColor: Player) => void) | null = null;
  onOpponentPlace: ((position: number) => void) | null = null;
  onOpponentMove: ((from: number, to: number) => void) | null = null;
  onOpponentRemove: ((position: number) => void) | null = null;
  onOpponentSurrender: (() => void) | null = null;
  onOpponentDisconnected: (() => void) | null = null;
  onRematchRequest: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  // ==================== 公共接口 ====================

  get state(): NetworkState { return this._state; }
  get myColor(): Player { return this._myColor; }
  get clientId(): string { return this._clientId; }

  /** 连接到服务器 */
  connect(): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;

    this._setState(NetworkState.Connecting);

    try {
      this._ws = new WebSocket(this.serverUrl);

      this._ws.onopen = () => {
        console.log('[Net] 已连接到服务器');
        this._setState(NetworkState.Connected);
      };

      this._ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        this._handleMessage(msg);
      };

      this._ws.onclose = () => {
        console.log('[Net] 连接断开');
        this._stopPing();
        this._setState(NetworkState.Disconnected);
      };

      this._ws.onerror = (err) => {
        console.error('[Net] 连接错误:', err);
        this.onError?.('无法连接到服务器，请检查网络或服务器地址');
      };
    } catch (e) {
      console.error('[Net] 创建连接失败:', e);
      this.onError?.('创建连接失败');
    }
  }

  /** 开始匹配对手 */
  startMatch(): void {
    if (this._state === NetworkState.Waiting) return;
    this._send({ type: 'match_request' });
    this._setState(NetworkState.Waiting);
  }

  /** 取消匹配 */
  cancelMatch(): void {
    this._send({ type: 'cancel_match' });
    this._setState(NetworkState.Connected);
  }

  /** 发送下棋操作 */
  sendPlace(position: number): void {
    this._send({ type: 'place', position });
  }

  /** 发送走棋操作 */
  sendMove(from: number, to: number): void {
    this._send({ type: 'move', from, to });
  }

  /** 发送吃子操作 */
  sendRemove(position: number): void {
    this._send({ type: 'remove', position });
  }

  /** 发送认输 */
  sendSurrender(): void {
    this._send({ type: 'surrender' });
  }

  /** 请求重赛 */
  requestRematch(): void {
    this._send({ type: 'rematch_request' });
  }

  /** 断开连接 */
  disconnect(): void {
    this._stopPing();
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._setState(NetworkState.Disconnected);
  }

  // ==================== 内部方法 ====================

  private _handleMessage(msg: any): void {
    switch (msg.type) {
      case 'connected':
        this._clientId = msg.clientId;
        this._startPing();
        break;

      case 'waiting':
        console.log('[Net] 正在匹配...', msg.message);
        break;

      case 'matched':
        this._myColor = msg.color === 'black' ? Player.Black : Player.White;
        this._opponentId = msg.opponentId;
        this._setState(NetworkState.Playing);
        this.onMatched?.(this._myColor);

        // 如果是白方，等待黑方先手
        if (this._myColor === Player.Black) {
          console.log('[Net] 匹配成功！你是黑方（先手）');
        } else {
          console.log('[Net] 匹配成功！你是白方（后手），等待对手落子');
        }
        break;

      case 'opponent_place':
        this.onOpponentPlace?.(msg.position);
        break;

      case 'opponent_move':
        this.onOpponentMove?.(msg.from, msg.to);
        break;

      case 'opponent_remove':
        this.onOpponentRemove?.(msg.position);
        break;

      case 'opponent_surrender':
        this.onOpponentSurrender?.();
        break;

      case 'opponent_disconnected':
        console.log('[Net] 对手断开连接');
        this.onOpponentDisconnected?.();
        break;

      case 'opponent_rematch_request':
        this.onRematchRequest?.();
        break;

      case 'error':
        console.error('[Net] 服务器错误:', msg.message);
        this.onError?.(msg.message);
        break;

      case 'pong':
        // 心跳回复，无需处理
        break;

      default:
        console.log('[Net] 未知消息:', msg);
    }
  }

  private _send(data: object): void {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify(data));
    }
  }

  private _setState(state: NetworkState): void {
    if (this._state !== state) {
      this._state = state;
      this.onStateChanged?.(state);
    }
  }

  /** 心跳保活 */
  private _startPing(): void {
    this._stopPing();
    this._pingTimer = setInterval(() => {
      this._send({ type: 'ping' });
    }, 25000) as unknown as number;
  }

  private _stopPing(): void {
    if (this._pingTimer !== null) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  onDestroy(): void {
    this.disconnect();
  }
}
