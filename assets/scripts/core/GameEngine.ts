import {
  Player, GamePhase, GameMode, GameOverReason,
  BoardState, GameState, Move, BOARD_SIZE,
} from './GameTypes';
import { Board } from './Board';

/**
 * 成三棋游戏引擎
 * 负责游戏流程控制、规则判定、状态管理
 */
export class GameEngine {
  private _board: Board;
  private _currentPlayer: Player;
  private _phase: GamePhase;
  private _winner: Player;
  private _gameOverReason: GameOverReason | null;
  private _piecesInHand: { [Player.Black]: number; [Player.White]: number };
  private _piecesOnBoard: { [Player.Black]: number; [Player.White]: number };
  private _history: Move[];
  private _mustRemovePiece: boolean;
  private _gameMode: GameMode;

  /** 回调：游戏状态变更 */
  onStateChanged: (() => void) | null = null;
  /** 回调：需要玩家吃子（进行UI交互） */
  onMustRemovePiece: (() => void) | null = null;
  /** 回调：游戏结束 */
  onGameOver: ((winner: Player, reason: GameOverReason) => void) | null = null;

  constructor(mode: GameMode = GameMode.LocalTwoPlayer) {
    this._board = new Board();
    this._currentPlayer = Player.Black;
    this._phase = GamePhase.Placing;
    this._winner = Player.None;
    this._gameOverReason = null;
    this._piecesInHand = { [Player.Black]: 12, [Player.White]: 12 };
    this._piecesOnBoard = { [Player.Black]: 0, [Player.White]: 0 };
    this._history = [];
    this._mustRemovePiece = false;
    this._gameMode = mode;
  }

  // ==================== 公共只读属性 ====================

  get board(): Board { return this._board; }
  get currentPlayer(): Player { return this._currentPlayer; }
  get phase(): GamePhase { return this._phase; }
  get winner(): Player { return this._winner; }
  get gameOverReason(): GameOverReason | null { return this._gameOverReason; }
  get mustRemovePiece(): boolean { return this._mustRemovePiece; }
  get gameMode(): GameMode { return this._gameMode; }
  get piecesInHand(): Readonly<{ [Player.Black]: number; [Player.White]: number }> {
    return this._piecesInHand;
  }
  get piecesOnBoard(): Readonly<{ [Player.Black]: number; [Player.White]: number }> {
    return this._piecesOnBoard;
  }

  /** 对手颜色 */
  get opponent(): Player {
    return this._currentPlayer === Player.Black ? Player.White : Player.Black;
  }

  // ==================== 操作接口 ====================

  /**
   * 下棋阶段：在指定位置放置棋子
   * @returns 操作结果
   */
  placePiece(position: number): { success: boolean; error?: string; needRemove?: boolean } {
    if (this._phase !== GamePhase.Placing) {
      return { success: false, error: '当前不是下棋阶段' };
    }
    if (this._mustRemovePiece) {
      return { success: false, error: '请先吃掉对方一枚棋子' };
    }
    if (this._piecesInHand[this._currentPlayer] <= 0) {
      return { success: false, error: '手中没有棋子了' };
    }

    const ok = this._board.placePiece(position, this._currentPlayer);
    if (!ok) {
      return { success: false, error: '该位置不可落子' };
    }

    this._piecesInHand[this._currentPlayer]--;
    this._piecesOnBoard[this._currentPlayer]++;

    const move: Move = { placeAt: position };

    // 检查是否成三
    const newMills = this._board.checkNewMills(position, this._currentPlayer);
    if (newMills.length > 0) {
      this._mustRemovePiece = true;
      this._history.push(move);
      this._notifyStateChanged();
      this._notifyMustRemove();
      return { success: true, needRemove: true };
    }

    this._history.push(move);
    this._endTurn();
    return { success: true };
  }

  /**
   * 走棋阶段：移动棋子
   * @returns 操作结果
   */
  movePiece(from: number, to: number): { success: boolean; error?: string; needRemove?: boolean } {
    if (this._phase !== GamePhase.Moving) {
      return { success: false, error: '当前不是走棋阶段' };
    }
    if (this._mustRemovePiece) {
      return { success: false, error: '请先吃掉对方一枚棋子' };
    }
    if (this._board.getPiece(from) !== this._currentPlayer) {
      return { success: false, error: '不能移动对方的棋子' };
    }

    const ok = this._board.movePiece(from, to);
    if (!ok) {
      return { success: false, error: '无法移动到该位置' };
    }

    const move: Move = { from, to };

    // 检查是否成三
    const newMills = this._board.checkNewMills(to, this._currentPlayer);
    if (newMills.length > 0) {
      this._mustRemovePiece = true;
      this._history.push(move);
      this._notifyStateChanged();
      this._notifyMustRemove();
      return { success: true, needRemove: true };
    }

    this._history.push(move);
    this._endTurn();
    return { success: true };
  }

  /**
   * 吃掉对方一枚棋子（在成三后调用）
   * @returns 操作结果
   */
  removePiece(position: number): { success: boolean; error?: string } {
    if (!this._mustRemovePiece) {
      return { success: false, error: '当前不需要吃子' };
    }

    const targetPlayer = this.opponent;

    // 检查是否符合吃子规则
    const removable = this._board.getRemovablePieces(targetPlayer);
    if (!removable.includes(position)) {
      return { success: false, error: '该棋子不能被吃（可能已形成三连且对方有未成三的棋子）' };
    }

    this._board.removePiece(position);
    this._piecesOnBoard[targetPlayer]--;

    // 更新最后一步操作的吃子信息
    if (this._history.length > 0) {
      this._history[this._history.length - 1].removePiece = position;
    }

    this._mustRemovePiece = false;

    // 吃子后检查胜负
    if (this._checkGameOver(targetPlayer)) {
      return { success: true };
    }

    this._endTurn();
    return { success: true };
  }

  /** 认输 */
  surrender(): void {
    if (this._phase === GamePhase.GameOver) return;
    this._winner = this.opponent;
    this._gameOverReason = GameOverReason.Surrender;
    this._phase = GamePhase.GameOver;
    this._notifyStateChanged();
    this._notifyGameOver();
  }

  /** 重新开始游戏 */
  restart(): void {
    this._board.reset();
    this._currentPlayer = Player.Black;
    this._phase = GamePhase.Placing;
    this._winner = Player.None;
    this._gameOverReason = null;
    this._piecesInHand = { [Player.Black]: 12, [Player.White]: 12 };
    this._piecesOnBoard = { [Player.Black]: 0, [Player.White]: 0 };
    this._history = [];
    this._mustRemovePiece = false;
    this._notifyStateChanged();
  }

  /** 撤销上一步 */
  undo(): boolean {
    if (this._history.length === 0) return false;
    if (this._phase === GamePhase.GameOver) return false;

    // 简化处理：不支持吃子阶段的撤销
    if (this._mustRemovePiece) return false;

    const lastMove = this._history.pop()!;

    if (lastMove.placeAt !== undefined) {
      // 撤销放置
      this._board.removePiece(lastMove.placeAt);
      this._piecesInHand[this.opponent]++;
      this._piecesOnBoard[this.opponent]--;
      this._currentPlayer = this.opponent;
    } else if (lastMove.from !== undefined && lastMove.to !== undefined) {
      // 撤销移动（反向移动）
      const piece = this._board.getPiece(lastMove.to);
      if (piece === Player.None) return false;
      this._board.movePiece(lastMove.to, lastMove.from);
      this._currentPlayer = this.opponent;
    }

    this._notifyStateChanged();
    return true;
  }

  /**
   * 获取当前棋盘快照
   */
  getState(): GameState {
    return {
      board: [...this._board.board],
      blockedCells: Array.from(this._board.blockedCells),
      currentPlayer: this._currentPlayer,
      phase: this._phase,
      winner: this._winner,
      gameOverReason: this._gameOverReason,
      piecesInHand: { ...this._piecesInHand },
      piecesOnBoard: { ...this._piecesOnBoard },
      history: [...this._history],
      mustRemovePiece: this._mustRemovePiece,
    };
  }

  /**
   * 从状态快照恢复（用于网络同步）
   */
  loadState(state: GameState): void {
    this._board.reset();
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (state.board[i] !== Player.None) {
        this._board.placePiece(i, state.board[i]);
      }
    }
    for (const idx of state.blockedCells) {
      this._board.removePiece(idx);
      // 重新标记blocked
      // board.removePiece 已经标记了blockedCells
    }
    this._currentPlayer = state.currentPlayer;
    this._phase = state.phase;
    this._winner = state.winner;
    this._gameOverReason = state.gameOverReason;
    this._piecesInHand = { ...state.piecesInHand };
    this._piecesOnBoard = { ...state.piecesOnBoard };
    this._history = [...state.history];
    this._mustRemovePiece = state.mustRemovePiece;

    // 重新设置blockedCells
    for (const idx of state.blockedCells) {
      this._board.removePiece(idx);
    }

    this._notifyStateChanged();
  }

  // ==================== 私有方法 ====================

  /** 结束当前回合，切换到对方 */
  private _endTurn(): void {
    // 检查是否需要进入走棋阶段
    if (this._phase === GamePhase.Placing) {
      const totalPlaced =
        this._piecesOnBoard[Player.Black] + this._piecesOnBoard[Player.White];

      if (totalPlaced >= 24) {
        // 所有棋子都下完了
        this._phase = GamePhase.Moving;
      }
    }

    // 检查走棋阶段对方是否还有可走步数
    if (this._phase === GamePhase.Moving) {
      if (!this._board.hasAvailableMoves(this.opponent)) {
        this._winner = this._currentPlayer;
        this._gameOverReason = GameOverReason.NoAvailableMoves;
        this._phase = GamePhase.GameOver;
        this._notifyStateChanged();
        this._notifyGameOver();
        return;
      }
    }

    this._currentPlayer = this.opponent;
    this._notifyStateChanged();
  }

  /** 检查对方是否输了（棋子不足） */
  private _checkGameOver(loser: Player): boolean {
    const remaining = this._board.countPiecesOnBoard(loser);
    // 被吃掉超过7枚即只剩2枚或更少（12 - 7 = 5?? 等等...）
    // 用户规则：被吃掉的棋子超过7枚（即剩余≤4? 不对）
    // 用户说：一方被吃掉的棋子超过7枚，在棋盘上只剩2枚或更少棋子
    // 一开始12枚，被吃超过7枚 → 剩余 < 5 枚。但是"只剩2枚或更少"才是判定标准
    if (remaining <= 2) {
      this._winner = this._currentPlayer;
      this._gameOverReason = GameOverReason.InsufficientPieces;
      this._phase = GamePhase.GameOver;
      this._notifyStateChanged();
      this._notifyGameOver();
      return true;
    }
    return false;
  }

  private _notifyStateChanged(): void {
    if (this.onStateChanged) this.onStateChanged();
  }

  private _notifyMustRemove(): void {
    if (this.onMustRemovePiece) this.onMustRemovePiece();
  }

  private _notifyGameOver(): void {
    if (this.onGameOver && this._winner !== Player.None) {
      this.onGameOver(this._winner, this._gameOverReason!);
    }
  }
}
