/**
 * 成三棋 - 索引文件
 * 统一导出所有核心模块
 */

export { Player, GamePhase, GameMode, GameOverReason } from './core/GameTypes';
export type { BoardPosition, MillLine, BoardState, Move, GameState } from './core/GameTypes';
export { BOARD_SIZE, ADJACENCY, MILL_LINES, POINT_POSITIONS } from './core/GameTypes';
export { Board } from './core/Board';
export { GameEngine } from './core/GameEngine';
export { AIController, AIDifficulty } from './core/AIController';
