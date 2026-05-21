import { Player, BOARD_SIZE } from './GameTypes';
import { GameEngine } from './GameEngine';

/** AI难度等级 */
export enum AIDifficulty {
  Easy = 'easy',
  Medium = 'medium',
  Hard = 'hard',
}

/**
 * AI控制器
 * 不同难度级别使用不同的策略
 */
export class AIController {
  private _engine: GameEngine;
  private _aiPlayer: Player;
  private _difficulty: AIDifficulty;
  private _isThinking: boolean = false;

  constructor(engine: GameEngine, aiPlayer: Player, difficulty: AIDifficulty = AIDifficulty.Medium) {
    this._engine = engine;
    this._aiPlayer = aiPlayer;
    this._difficulty = difficulty;
  }

  get aiPlayer(): Player { return this._aiPlayer; }
  get isThinking(): boolean { return this._isThinking; }

  /** AI执行下一步操作（异步，模拟思考时间） */
  async makeMove(): Promise<void> {
    if (this._isThinking) return;
    if (this._engine.currentPlayer !== this._aiPlayer) return;

    this._isThinking = true;

    // 模拟思考延迟
    const delay = this._difficulty === AIDifficulty.Easy ? 300 :
                  this._difficulty === AIDifficulty.Medium ? 600 : 800;
    await this._delay(delay);

    try {
      // 如果当前需要吃子
      if (this._engine.mustRemovePiece) {
        this._doRemovePiece();
      } else if (this._engine.phase === 'placing') {
        this._doPlacePiece();
      } else if (this._engine.phase === 'moving') {
        this._doMovePiece();
      }
    } catch (e) {
      console.error('AI makeMove error:', e);
    } finally {
      this._isThinking = false;
    }
  }

  /**
   * 评估棋盘得分（从AI视角）
   * 正分对AI有利，负分对对手有利
   */
  evaluateBoard(): number {
    const opponent = this._aiPlayer === Player.Black ? Player.White : Player.Black;

    // AI的棋子数
    const aiPieces = this._engine.board.countPiecesOnBoard(this._aiPlayer);
    const oppPieces = this._engine.board.countPiecesOnBoard(opponent);

    if (oppPieces <= 2) return 10000; // 必胜
    if (aiPieces <= 2) return -10000; // 必败

    // 检查对手是否有可用走法
    if (this._engine.phase === 'moving') {
      if (!this._engine.board.hasAvailableMoves(opponent)) return 10000;
      if (!this._engine.board.hasAvailableMoves(this._aiPlayer)) return -10000;
    }

    let score = 0;

    // 棋子数量差（权重较高）
    score += (aiPieces - oppPieces) * 100;

    // AI成三数量
    const aiMills = this._engine.board.getPlayerMillPieces(this._aiPlayer);
    const oppMills = this._engine.board.getPlayerMillPieces(opponent);
    score += (aiMills.size - oppMills.size) * 50;

    // 移动性（可用走法数量）
    if (this._engine.phase === 'moving') {
      const aiMoves = this._engine.board.getAvailableMoves(this._aiPlayer);
      const oppMoves = this._engine.board.getAvailableMoves(opponent);
      score += (aiMoves.size - oppMoves.size) * 10;
    }

    // 中心位置权重（内圈位置价值更高）
    const centerPositions = [16, 17, 18, 19, 20, 21, 22, 23];
    for (const pos of centerPositions) {
      if (this._engine.board.getPiece(pos) === this._aiPlayer) score += 15;
      if (this._engine.board.getPiece(pos) === opponent) score -= 15;
    }

    return score;
  }

  // ==================== 私有方法 ====================

  private _doPlacePiece(): void {
    const emptyPositions = this._engine.board.getEmptyPositions();

    if (this._difficulty === AIDifficulty.Easy) {
      // 简单：随机放置
      if (emptyPositions.length > 0) {
        const pos = emptyPositions[Math.floor(Math.random() * emptyPositions.length)];
        this._engine.placePiece(pos);
      }
      return;
    }

    // 中等/困难：尝试找最佳位置
    let bestPos = -1;
    let bestScore = -Infinity;

    for (const pos of emptyPositions) {
      // 模拟放置
      const board = this._engine.board;
      board.placePiece(pos, this._aiPlayer);

      // 检查是否成三
      const mills = board.checkNewMills(pos, this._aiPlayer);
      let score = mills.length > 0 ? 500 : 0;

      // 评估棋盘位置
      score += this._evaluatePosition(pos);

      // 检查是否会帮对手成三
      board.removePiece(pos); // 先移除再评估？不需要，直接还原即可
      // board已经变了，我们需要重新创建...但这太复杂了
      // 简化处理：先用启发式方法

      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }

      // 还原（重新设置该位置为空）
      board.removePiece(pos);
    }

    if (bestPos >= 0) {
      this._engine.placePiece(bestPos);
    } else if (emptyPositions.length > 0) {
      // fallback: 随机
      this._engine.placePiece(emptyPositions[Math.floor(Math.random() * emptyPositions.length)]);
    }
  }

  private _doMovePiece(): void {
    const moves = this._engine.board.getAvailableMoves(this._aiPlayer);

    if (moves.size === 0) return;

    if (this._difficulty === AIDifficulty.Easy) {
      // 简单：随机走
      const fromArr = Array.from(moves.keys());
      const from = fromArr[Math.floor(Math.random() * fromArr.length)];
      const targets = moves.get(from)!;
      const to = targets[Math.floor(Math.random() * targets.length)];
      this._engine.movePiece(from, to);
      return;
    }

    let bestFrom = -1;
    let bestTo = -1;
    let bestScore = -Infinity;

    for (const [from, targets] of moves) {
      for (const to of targets) {
        const board = this._engine.board;
        board.movePiece(from, to);

        const mills = board.checkNewMills(to, this._aiPlayer);
        let score = mills.length > 0 ? 500 : 0;
        score += this._evaluatePosition(to);

        if (score > bestScore) {
          bestScore = score;
          bestFrom = from;
          bestTo = to;
        }

        // 还原
        board.movePiece(to, from);
      }
    }

    if (bestFrom >= 0 && bestTo >= 0) {
      this._engine.movePiece(bestFrom, bestTo);
    } else {
      // fallback
      const fromArr = Array.from(moves.keys());
      const from = fromArr[Math.floor(Math.random() * fromArr.length)];
      const targets = moves.get(from)!;
      const to = targets[Math.floor(Math.random() * targets.length)];
      this._engine.movePiece(from, to);
    }
  }

  private _doRemovePiece(): void {
    const opponent = this._aiPlayer === Player.Black ? Player.White : Player.Black;
    const removable = this._engine.board.getRemovablePieces(opponent);

    if (removable.length === 0) return;

    if (this._difficulty === AIDifficulty.Easy) {
      this._engine.removePiece(removable[Math.floor(Math.random() * removable.length)]);
      return;
    }

    // 优先吃位置价值高的棋子
    let bestPos = removable[0];
    let bestValue = -Infinity;

    for (const pos of removable) {
      const value = this._evaluatePosition(pos);
      if (value > bestValue) {
        bestValue = value;
        bestPos = pos;
      }
    }

    this._engine.removePiece(bestPos);
  }

  /** 评估某个位置的价值 */
  private _evaluatePosition(pos: number): number {
    // 中心位置
    const centerSet = new Set([16, 17, 18, 19, 20, 21, 22, 23]);
    // 中层位置
    const middleSet = new Set([8, 9, 10, 11, 12, 13, 14, 15]);
    // 角位置
    const cornerSet = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    const sideSet = new Set([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);

    let value = 0;
    if (centerSet.has(pos)) value += 30;
    if (middleSet.has(pos)) value += 20;
    if (cornerSet.has(pos)) value += 15; // 角位置连接更多
    // side位置不加奖励

    return value;
  }

  private _delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
