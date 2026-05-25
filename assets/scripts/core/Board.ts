import {
  Player, BOARD_SIZE, ADJACENCY, MILL_LINES,
  BoardState, MillLine,
} from './GameTypes';

/**
 * 棋盘逻辑控制器
 * 管理棋盘状态，提供查询和修改接口
 */
export class Board {
  /** board[i] = Player.None | Player.Black | Player.White */
  private _board: Player[];
  /** 被吃掉的棋子：位置 → 打子方（谁吃了这枚棋子） */
  private _blockedCells: Map<number, Player>;

  constructor() {
    this._board = new Array(BOARD_SIZE).fill(Player.None);
    this._blockedCells = new Map<number, Player>();
  }

  /** 深拷贝当前棋盘状态 */
  clone(): Board {
    const b = new Board();
    b._board = [...this._board];
    b._blockedCells = new Map(this._blockedCells);
    return b;
  }

  /** 获取某个位置的棋子 */
  getPiece(index: number): Player {
    if (index < 0 || index >= BOARD_SIZE) return Player.None;
    return this._board[index];
  }

  /** 整个棋盘数组（只读） */
  get board(): readonly Player[] {
    return this._board;
  }

  /** 被吃棋子信息（只读）：位置 → 打子方 */
  get blockedCells(): ReadonlyMap<number, Player> {
    return this._blockedCells;
  }

  /**
   * 在指定位置放置棋子（下棋阶段）
   * @returns 是否成功
   */
  placePiece(index: number, player: Player): boolean {
    if (!this.isValidPosition(index)) return false;
    if (this._board[index] !== Player.None) return false;
    if (this._blockedCells.has(index)) return false;
    this._board[index] = player;
    return true;
  }

  /**
   * 移动棋子（走棋阶段）
   * @returns 是否成功
   */
  movePiece(from: number, to: number): boolean {
    if (!this.isValidPosition(from) || !this.isValidPosition(to)) return false;
    if (this._board[to] !== Player.None) return false;
    if (this._blockedCells.has(to)) return false;
    if (!ADJACENCY[from].includes(to)) return false; // 必须相邻

    this._board[to] = this._board[from];
    this._board[from] = Player.None;
    return true;
  }

  /**
   * 移除棋子（吃子或撤销）
   * @param capturer 打子方，传 null 表示不标记（用于撤销）
   */
  removePiece(index: number, capturer: Player | null = null): boolean {
    if (!this.isValidPosition(index)) return false;
    if (this._board[index] === Player.None) return false;
    this._board[index] = Player.None;
    if (capturer !== null) {
      this._blockedCells.set(index, capturer);
    }
    return true;
  }

  /**
   * 检查某次放置或移动后是否形成"成三"
   * @param lastPoint 最后放置/移动的目标位置
   * @param player 玩家
   * @returns 返回新形成的 mill lines
   */
  checkNewMills(lastPoint: number, player: Player): MillLine[] {
    const newMills: MillLine[] = [];
    const playerName = player === Player.Black ? '黑方' : '白方';
    for (const line of MILL_LINES) {
      if (!line.includes(lastPoint)) continue;
      const values = line.map((p) => `[${p}]=${this._board[p]}`);
      const isMill = line.every((p) => this._board[p] === player);
      console.log(`[成三检测] ${playerName} 落子${lastPoint}, 检查线 ${line}: ${values.join(' ')} → ${isMill ? '成三!' : '未成三'}`);
      // 检查这条线上的三个点是否都被同一玩家占据
      if (isMill) {
        newMills.push(line);
      }
    }
    return newMills;
  }

  /**
   * 获取玩家所有已经形成"成三"的点位
   * @returns 处于成三状态的点位集合
   */
  getPlayerMillPieces(player: Player): Set<number> {
    const millPieces = new Set<number>();
    for (const line of MILL_LINES) {
      if (line.every((p) => this._board[p] === player)) {
        for (const p of line) {
          millPieces.add(p);
        }
      }
    }
    return millPieces;
  }

  /**
   * 获取玩家所有可被吃的棋子
   * 规则：对方任何棋子都可以被吃（包括已成三的棋子）
   */
  getRemovablePieces(player: Player): number[] {
    const removable: number[] = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (this._board[i] === player && !this._blockedCells.has(i)) {
        removable.push(i);
      }
    }
    return removable;
  }

  /**
   * 获取玩家所有可移动的棋子及目标位置
   * @returns Map<fromIndex, toIndex[]>
   */
  getAvailableMoves(player: Player): Map<number, number[]> {
    const moves = new Map<number, number[]>();
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (this._board[i] !== player) continue;
      if (this._blockedCells.has(i)) continue;

      const targets: number[] = [];
      for (const adj of ADJACENCY[i]) {
        if (this._board[adj] === Player.None && !this._blockedCells.has(adj)) {
          targets.push(adj);
        }
      }
      if (targets.length > 0) {
        moves.set(i, targets);
      }
    }
    return moves;
  }

  /**
   * 玩家是否还有可用走法
   */
  hasAvailableMoves(player: Player): boolean {
    return this.getAvailableMoves(player).size > 0;
  }

  /**
   * 获取所有空位（用于下棋阶段）
   */
  getEmptyPositions(): number[] {
    const empty: number[] = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (this._board[i] === Player.None && !this._blockedCells.has(i)) {
        empty.push(i);
      }
    }
    return empty;
  }

  /** 清空棋盘 */
  reset(): void {
    this._board = new Array(BOARD_SIZE).fill(Player.None);
    this._blockedCells.clear();
  }

  /** 清除所有被吃标记（进入走棋阶段时调用） */
  clearBlockedCells(): void {
    this._blockedCells.clear();
  }

  /** 索引是否有效 */
  private isValidPosition(index: number): boolean {
    return index >= 0 && index < BOARD_SIZE;
  }

  /** 统计某方在棋盘上的棋子数 */
  countPiecesOnBoard(player: Player): number {
    let count = 0;
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (this._board[i] === player) count++;
    }
    return count;
  }
}
