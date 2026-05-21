import { _decorator, Component } from 'cc';
import { Player, GameMode, GamePhase, GameOverReason, GameState } from '../core/GameTypes';
import { GameEngine } from '../core/GameEngine';
const { ccclass, property } = _decorator;

/**
 * 网络连接状态
 */
export enum NetworkState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Matched = 'matched',
  Playing = 'playing',
}

/**
 * 网络管理器
 * 管理在线对战的匹配、房间、消息同步
 *
 * 实现方案：
 * 1. WebSocket + 自定义后端服务（自建Node.js/Go服务器）
 * 2. 腾讯云 CloudBase 实时数据库（适合微信小游戏）
 * 3. 第三方服务如 Colyseus、Photon 等
 *
 * 当前框架预留接口，具体实现根据后端方案填充
 */
@ccclass('NetworkManager')
export class NetworkManager extends Component {
  /** 网络状态 */
  private _state: NetworkState = NetworkState.Disconnected;

  /** 游戏引擎引用 */
  private _engine: GameEngine | null = null;

  /** 本局游戏ID */
  private _gameId: string = '';

  /** 玩家在房间中的索引（1P / 2P） */
  private _playerIndex: number = 0;

  /** 服务器地址 */
  private _serverUrl: string = 'ws://localhost:3000';

  // ==================== 事件回调 ====================

  onMatched: (() => void) | null = null;
  onOpponentMove: ((state: GameState) => void) | null = null;
  onOpponentDisconnected: (() => void) | null = null;
  onError: ((message: string) => void) | null = null;

  // ==================== 公共接口 ====================

  get state(): NetworkState { return this._state; }
  get gameId(): string { return this._gameId; }
  get myColor(): Player {
    return this._playerIndex === 0 ? Player.Black : Player.White;
  }

  setEngine(engine: GameEngine): void {
    this._engine = engine;
  }

  /**
   * 开始匹配
   */
  async startMatch(): Promise<void> {
    this._state = NetworkState.Connecting;

    // TODO: 连接服务器，发送匹配请求
    // 模拟：通过 WebSocket 发送 { type: 'match', gameId: '', options: {} }
    // 服务器返回 { type: 'matched', gameId, playerIndex, opponentId }
    //
    // 示例实现：
    // const ws = new WebSocket(this._serverUrl);
    // ws.onopen = () => {
    //   ws.send(JSON.stringify({ type: 'match' }));
    // };
    // ws.onmessage = (event) => {
    //   const msg = JSON.parse(event.data);
    //   if (msg.type === 'matched') {
    //     this._gameId = msg.gameId;
    //     this._playerIndex = msg.playerIndex;
    //     this._state = NetworkState.Matched;
    //     this.onMatched?.();
    //   }
    // };

    // 当前框架：直接设置为已匹配（待后端实现）
    this._state = NetworkState.Matched;
    this.onMatched?.();
  }

  /**
   * 发送棋盘状态（在己方操作完成后调用）
   */
  syncGameState(): void {
    if (!this._engine || this._state !== NetworkState.Playing) return;

    const state = this._engine.getState();

    // TODO: 发送状态到服务器
    // ws.send(JSON.stringify({
    //   type: 'move',
    //   gameId: this._gameId,
    //   state: state,
    // }));
  }

  /**
   * 接收对方状态更新
   */
  private _onReceiveState(state: GameState): void {
    if (!this._engine) return;

    // 校验：确保是对方回合的操作
    if (state.currentPlayer !== this._engine.currentPlayer) return;

    this._engine.loadState(state);
    this.onOpponentMove?.(state);
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this._state = NetworkState.Disconnected;
    this._gameId = '';

    // TODO: ws.close();
  }

  // ==================== 生命周期 ====================

  onDestroy(): void {
    this.disconnect();
  }
}
