/**
 * 成三棋 - 类型定义
 *
 * 棋盘拓扑：三个嵌套正方形，共24个落子点
 *  0──1──2
 *  │     │
 *  7  8──9──10 3
 *  │  │     │  │
 *  15 16─17─18 11
 *  │  │     │  │
 *  14 23─22─21 12
 *  │     │
 *  6──5──4
 */

/** 玩家颜色 */
export enum Player {
  None = 0,
  Black = 1, // 先手（通常黑色）
  White = 2, // 后手（通常白色）
}

/** 游戏阶段 */
export enum GamePhase {
  /** 下棋阶段（布子） */
  Placing = 'placing',
  /** 走棋阶段（行棋） */
  Moving = 'moving',
  /** 游戏结束 */
  GameOver = 'gameOver',
}

/** 游戏模式 */
export enum GameMode {
  /** 本地双人（热座） */
  LocalTwoPlayer = 'localTwoPlayer',
  /** 人机对战 */
  AI = 'ai',
  /** 在线对战 */
  Online = 'online',
}

/** 游戏结束原因 */
export enum GameOverReason {
  /** 棋子不足（≤2枚） */
  InsufficientPieces = 'insufficientPieces',
  /** 无步可走 */
  NoAvailableMoves = 'noAvailableMoves',
  /** 对方认输 */
  Surrender = 'surrender',
}

/** 棋盘点位坐标描述 */
export interface BoardPosition {
  x: number;
  y: number;
}

/** 一条"三连"线（mill），包含3个点索引 */
export type MillLine = [number, number, number];

/** 棋盘状态快照 */
export interface BoardState {
  /** board[pointIndex] = Player.None | Player.Black | Player.White */
  board: Player[];
  /** 标记为不可放置的位置（被吃掉后标记的位置） */
  blockedCells: Set<number>;
}

/** 一步操作 */
export interface Move {
  /** 将棋子放在此位置（下棋阶段） */
  placeAt?: number;
  /** 从 from 移动棋子到 to（走棋阶段） */
  from?: number;
  to?: number;
  /** 如果本次操作成三，需要吃掉对方哪个棋子 */
  removePiece?: number;
}

/** 游戏完整状态（用于同步/存档） */
export interface GameState {
  board: Player[];
  blockedCells: number[];
  currentPlayer: Player;
  phase: GamePhase;
  winner: Player;
  gameOverReason: GameOverReason | null;
  /** 双方剩余未下的棋子数 */
  piecesInHand: { [Player.Black]: number; [Player.White]: number };
  /** 双方在棋盘上的棋子数 */
  piecesOnBoard: { [Player.Black]: number; [Player.White]: number };
  /** 操作历史 */
  history: Move[];
  /** 当前操作是否还需要吃子（成三后必须吃子） */
  mustRemovePiece: boolean;
}

/** 棋盘常量 */
export const BOARD_SIZE = 24;

/** 所有相邻连接关系：adjacency[pointIndex] = 相邻点索引数组 */
export const ADJACENCY: number[][] = buildAdjacency();

/**
 * 所有"三连"线（mill lines），共16条
 * 包括：
 *   - 外圈4条边 + 中圈4条边 + 内圈4条边（12条）
 *   - 纵向/横向连接线（4条：四个方向的角点和对中点连线）
 *
 * 注意：只有3层完整连接的才是mill线
 * 角：0-8-16, 2-10-18, 4-12-20, 6-14-22
 * 中点：不是每条中点线都能成三（比如1-9-17是成三线吗？）
 *
 * 在标准规则中，中点连线也构成mill：
 * 1-9-17（上中点）、3-11-19（右中点）、5-13-21（下中点）、7-15-23（左中点）
 *
 * 加上每层4条边 = 12 + 4 + 4 = 20？不对
 *
 * 重新梳理标准规则：
 * 外圈：4条边（每条3个点）
 * 中圈：4条边（每条3个点）
 * 内圈：4条边（每条3个点）
 * 三层之间的垂直/水平连线：
 *   左上角：0-8-16
 *   上中点：1-9-17
 *   右上角：2-10-18
 *   右中点：3-11-19
 *   右下角：4-12-20
 *   下中点：5-13-21
 *   左下角：6-14-22
 *   左中点：7-15-23
 *
 * 总共 12 + 8 = 20条？这跟Wikipedia说的不一样
 *
 * 实际上在标准Nine Men's Morris中，只有16条mill lines：
 * 外圈4条 + 中圈4条 + 内圈4条 + 连接线4条
 * 连接线只有4条（四个方向的角点连线？还是中点连线？）
 *
 * Wikipedia: There are 16 lines of 3 points each - 
 * 8 on the outer square, 4 on the middle, 4 on the inner
 *
 * 实际上8条在外圈不太对...
 *
 * 标准规则应该是：
 * 外圈4条边（水平2条，垂直2条）：(0,1,2), (2,3,4), (4,5,6), (6,7,0)
 * 中圈4条边：(8,9,10), (10,11,12), (12,13,14), (14,15,8)
 * 内圈4条边：(16,17,18), (18,19,20), (20,21,22), (22,23,16)
 * 跨层连接线4条：(1,9,17), (7,15,23), (5,13,21), (3,11,19)
 *
 * 让我再确认... 实际上根据用户提供的是中国版本的"成三棋"，不是标准的Nine Men's Morris
 *
 * 用户说的是"三子连成一线（横或竖）"，所以对角线不算
 *
 * 每层正方形的边：
 *   外圈：(0,1,2), (2,3,4), (4,5,6), (6,7,0) - 但等等，正方形的边只有水平2条和垂直2条
 *
 * 让我重新编号：
 *   外圈8个点：左上0、上中1、右上2、右中3、右下4、下中5、左下6、左中7
 *
 * 外圈水平边：
 *   上边：(0,1,2)
 *   下边：(6,5,4) 或 (4,5,6)
 *
 * 外圈垂直边：
 *   左边：(0,7,6)
 *   右边：(2,3,4)
 *
 * 中圈同理：(8,9,10), (14,13,12), (8,15,14), (10,11,12)
 *
 * 内圈同理：(16,17,18), (22,21,20), (16,23,22), (18,19,20)
 *
 * 跨层连接（中点）：
 *   上：1-9-17
 *   下：5-13-21
 *   左：7-15-23
 *   右：3-11-19
 *
 * 总共16条。好，这跟标准Mill一致。
 */

/**
 * 棋盘点位布局（在坐标系中的位置，设计分辨率为 750x1334 或类似比例）
 * 棋盘居中，正方形边长按比例缩放
 *
 *   0──1──2
 *   │     │
 *   7  8──9──10 3
 *   │  │     │  │
 *   15 16─17─18 11
 *   │  │     │  │
 *   14 23─22─21 12
 *   │     │
 *   6──5──4
 */

/** 棋盘24个点位的坐标（归一化坐标，之后根据屏幕适配） */
function buildAdjacency(): number[][] {
  // 24个点的邻接关系
  const adj: number[][] = new Array(24).fill(null).map(() => []);

  // 外圈连接 (0-7)
  const outerEdges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [4, 5], [5, 6], [6, 7], [7, 0],
  ];

  // 中圈连接 (8-15)
  const middleEdges: [number, number][] = [
    [8, 9], [9, 10], [10, 11], [11, 12],
    [12, 13], [13, 14], [14, 15], [15, 8],
  ];

  // 内圈连接 (16-23)
  const innerEdges: [number, number][] = [
    [16, 17], [17, 18], [18, 19], [19, 20],
    [20, 21], [21, 22], [22, 23], [23, 16],
  ];

  // 跨层连接（中点）- 上下左右4条
  const crossEdges: [number, number][] = [
    [1, 9], [9, 17],   // 上中点
    [5, 13], [13, 21], // 下中点
    [7, 15], [15, 23], // 左中点
    [3, 11], [11, 19], // 右中点
  ];

  const allEdges = [...outerEdges, ...middleEdges, ...innerEdges, ...crossEdges];

  for (const [a, b] of allEdges) {
    adj[a].push(b);
    adj[b].push(a);
  }

  // 排序保证一致性
  for (let i = 0; i < 24; i++) {
    adj[i].sort((x, y) => x - y);
  }

  return adj;
}

/** 所有"三连"线（mill lines），共16条 */
export const MILL_LINES: MillLine[] = [
  // 外圈4条边
  [0, 1, 2], [2, 3, 4], [4, 5, 6], [6, 7, 0],
  // 中圈4条边
  [8, 9, 10], [10, 11, 12], [12, 13, 14], [14, 15, 8],
  // 内圈4条边
  [16, 17, 18], [18, 19, 20], [20, 21, 22], [22, 23, 16],
  // 跨层连接线4条
  [1, 9, 17],   // 上中点连线
  [5, 13, 21],  // 下中点连线
  [7, 15, 23],  // 左中点连线
  [3, 11, 19],  // 右中点连线
];

/** 棋盘点位在逻辑坐标中的位置（归一化到棋盘边长） */
export const POINT_POSITIONS: BoardPosition[] = [
  // 外圈 (0-7)
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 },
  { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 1 },
  // 中圈 (8-15)
  { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }, { x: 1.5, y: 0.5 }, { x: 1.5, y: 1 },
  { x: 1.5, y: 1.5 }, { x: 1, y: 1.5 }, { x: 0.5, y: 1.5 }, { x: 0.5, y: 1 },
  // 内圈 (16-23)
  { x: 0.75, y: 0.75 }, { x: 1, y: 0.75 }, { x: 1.25, y: 0.75 }, { x: 1.25, y: 1 },
  { x: 1.25, y: 1.25 }, { x: 1, y: 1.25 }, { x: 0.75, y: 1.25 }, { x: 0.75, y: 1 },
];
