import { _decorator, Component, sys } from 'cc';
import { Player, GameMode } from '../core/GameTypes';
const { ccclass, property } = _decorator;

/** 网络连接状态 */
export enum NetworkState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Waiting = 'waiting',
  Matched = 'matched',
  Playing = 'playing',
}

/** 检测运行环境 */
function isWechatGame(): boolean {
  return typeof wx !== 'undefined' && typeof wx.connectSocket === 'function';
}

/**
 * 跨平台 Socket 包装
 * 自动适配：浏览器 WebSocket / 微信小游戏 wx.connectSocket
 */
class CrossSocket {
  private _ws: WebSocket | any = null;
  private _isWx: boolean;
  private _ready: boolean = false;

  onopen: (() => void) | null = null;
  onmessage: ((data: string) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((err: any) => void) | null = null;

  constructor(url: string) {
    this._isWx = isWechatGame();

    if (this._isWx) {
      const task = wx.connectSocket({ url, header: { 'content-type': 'application/json' } });
      this._ws = task;

      task.onOpen(() => {
        this._ready = true;
        this.onopen?.();
      });
      task.onMessage((res: any) => {
        const data = typeof res.data === 'string' ? res.data : (res.data instanceof ArrayBuffer ? new TextDecoder().decode(res.data) : '');
        this.onmessage?.(data);
      });
      task.onClose(() => this.onclose?.());
      task.onError((err: any) => this.onerror?.(err));
    } else {
      try {
        this._ws = new WebSocket(url);
        this._ws.onopen = () => { this._ready = true; this.onopen?.(); };
        this._ws.onmessage = (event: MessageEvent) => this.onmessage?.(event.data);
        this._ws.onclose = () => this.onclose?.();
        this._ws.onerror = (e: any) => this.onerror?.(e);
      } catch (e) {
        this.onerror?.(e);
      }
    }
  }

  get readyState(): number {
    if (!this._ws) return 3; // CLOSED
    if (this._isWx) return this._ready ? 1 : 0; // OPEN or CONNECTING
    return this._ws.readyState;
  }

  send(data: string): void {
    if (!this._ws) return;
    if (this._isWx) {
      this._ws.send({ data });
    } else {
      this._ws.send(data);
    }
  }

  close(): void {
    if (!this._ws) return;
    if (this._isWx) {
      this._ws.close({});
    } else {
      this._ws.close();
    }
  }
}

/**
 * 网络管理器
 * 支持：浏览器 WebSocket / 微信小游戏 wx.connectSocket
 */
@ccclass('NetworkManager')
export class NetworkManager extends Component {
  @property({ tooltip: 'WebSocket 地址（小游戏必须用 wss://）' })
  serverUrl: string = isWechatGame() ? 'wss://your-server.com/ws' : 'ws://localhost:3000';

  private _ws: CrossSocket | null = null;
  private _state: NetworkState = NetworkState.Disconnected;
  private _myColor: Player = Player.None;
  private _clientId: string = '';
  private _pingTimer: number | null = null;

  // ==================== 回调 ====================

  onStateChanged: ((state: NetworkState) => void) | null = null;
  onMatched: ((myColor: Player) => void) | null = null;
  onOpponentPlace: ((position: number) => void) | null = null;
  onOpponentMove: ((from: number, to: number) => void) | null = null;
  onOpponentRemove: ((position: number) => void) | null = null;
  onOpponentSurrender: (() => void) | null = null;
  onOpponentDisconnected: (() => void) | null = null;
  onRematchRequest: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  // ==================== 公共属性 ====================

  get state(): NetworkState { return this._state; }
  get myColor(): Player { return this._myColor; }
  get clientId(): string { return this._clientId; }

  // ==================== 连接 ====================

  connect(): void {
    if (this._ws && this._ws.readyState === 1) return;

    this._setState(NetworkState.Connecting);

    const url = this.serverUrl;
    console.log(`[Net] 连接服务器: ${url}`);

    try {
      this._ws = new CrossSocket(url);

      this._ws.onopen = () => {
        console.log('[Net] 已连接');
        this._setState(NetworkState.Connected);
      };

      this._ws.onmessage = (raw) => {
        let msg: any;
        try { msg = JSON.parse(raw); } catch { return; }
        this._handleMessage(msg);
      };

      this._ws.onclose = () => {
        console.log('[Net] 连接断开');
        this._stopPing();
        this._setState(NetworkState.Disconnected);
      };

      this._ws.onerror = (err: any) => {
        const msg = isWechatGame()
          ? '连接失败，请检查服务器地址是否以 wss:// 开头'
          : '无法连接到服务器';
        console.error(`[Net] 连接错误: ${msg}`, err);
        this.onError?.(msg);
      };
    } catch (e) {
      this.onError?.('创建连接失败');
    }
  }

  // ==================== 操作 ====================

  startMatch(): void {
    if (this._state === NetworkState.Waiting) return;
    this._send({ type: 'match_request' });
    this._setState(NetworkState.Waiting);
  }

  cancelMatch(): void {
    this._send({ type: 'cancel_match' });
    this._setState(NetworkState.Connected);
  }

  sendPlace(position: number): void { this._send({ type: 'place', position }); }
  sendMove(from: number, to: number): void { this._send({ type: 'move', from, to }); }
  sendRemove(position: number): void { this._send({ type: 'remove', position }); }
  sendSurrender(): void { this._send({ type: 'surrender' }); }
  requestRematch(): void { this._send({ type: 'rematch_request' }); }

  disconnect(): void {
    this._stopPing();
    if (this._ws) { this._ws.close(); this._ws = null; }
    this._setState(NetworkState.Disconnected);
  }

  // ==================== 内部 ====================

  private _handleMessage(msg: any): void {
    switch (msg.type) {
      case 'connected':
        this._clientId = msg.clientId;
        this._startPing();
        break;
      case 'waiting':
        break;
      case 'matched':
        this._myColor = msg.color === 'black' ? Player.Black : Player.White;
        this._setState(NetworkState.Playing);
        this.onMatched?.(this._myColor);
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
        this.onOpponentDisconnected?.();
        break;
      case 'opponent_rematch_request':
        this.onRematchRequest?.();
        break;
      case 'error':
        this.onError?.(msg.message);
        break;
      case 'pong':
        break;
    }
  }

  private _send(data: object): void {
    if (this._ws && this._ws.readyState === 1) {
      this._ws.send(JSON.stringify(data));
    }
  }

  private _setState(state: NetworkState): void {
    if (this._state !== state) {
      this._state = state;
      this.onStateChanged?.(state);
    }
  }

  private _startPing(): void {
    this._stopPing();
    this._pingTimer = setInterval(() => this._send({ type: 'ping' }), 25000) as unknown as number;
  }

  private _stopPing(): void {
    if (this._pingTimer !== null) { clearInterval(this._pingTimer); this._pingTimer = null; }
  }

  onDestroy(): void { this.disconnect(); }
}
