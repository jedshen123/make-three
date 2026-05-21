import { _decorator, Component, Node, director, sys } from 'cc';
import { Player, GameMode, GamePhase, GameOverReason } from '../core/GameTypes';
import { GameEngine } from '../core/GameEngine';
import { AIController, AIDifficulty } from '../core/AIController';
import { BoardRenderer } from './BoardRenderer';
import { UIManager } from './UIManager';
const { ccclass, property } = _decorator;

/**
 * 游戏管理器（核心组件）
 * 串联游戏引擎、棋盘渲染和UI管理，处理用户交互
 */
@ccclass('GameManager')
export class GameManager extends Component {
  @property({ type: BoardRenderer })
  boardRenderer!: BoardRenderer;

  @property({ type: UIManager })
  uiManager!: UIManager;

  /** 游戏引擎（公开，供外部访问如 SceneHelper 的 replay 按钮） */
  engine!: GameEngine;

  private _aiController: AIController | null = null;

  /** 当前操作类型（用于区分点击是放棋还是吃子） */
  private _clickMode: 'placeOrMove' | 'removePiece' = 'placeOrMove';

  /** 走棋阶段选中的棋子 */
  private _selectedFrom: number = -1;

  onLoad(): void {
    // SceneHelper 可能在 start() 里才设置引用，这里做延迟启动
  }

  start(): void {
    // 如果外部还未设置 boardRenderer / uiManager，尝试自动查找
    if (!this.boardRenderer) {
      this.boardRenderer = this.node.parent?.getComponentInChildren(BoardRenderer) || null as any;
    }
    if (!this.uiManager) {
      this.uiManager = this.node.parent?.getComponentInChildren(UIManager) || null as any;
    }

    // 获取游戏模式
    let mode = GameMode.LocalTwoPlayer;
    if (sys && sys.localStorage) {
      const savedMode = sys.localStorage.getItem('gameMode');
      if (savedMode === GameMode.AI) mode = GameMode.AI;
      if (savedMode === GameMode.Online) mode = GameMode.Online;
    }

    this.engine = new GameEngine(mode);

    // 绑定渲染器和UI
    if (this.boardRenderer) {
      this.boardRenderer.setEngine(this.engine);
      this.boardRenderer.onPointClick = (pointIndex) => this._handlePointClick(pointIndex);
    }
    if (this.uiManager) {
      this.uiManager.setEngine(this.engine);
    }

    // AI模式初始化
    if (mode === GameMode.AI) {
      this._aiController = new AIController(this.engine, Player.White, AIDifficulty.Medium);
      if (this.uiManager) {
        this.uiManager.setAIController(this._aiController);
      }
    }

    this.uiManager?.updateUI();
  }

  /** 处理棋盘点位点击 */
  private _handlePointClick(index: number): void {
    if (this.engine.phase === GamePhase.GameOver) return;

    // AI回合不允许操作
    if (this._aiController && this.engine.currentPlayer === this._aiController.aiPlayer) return;

    if (this._clickMode === 'removePiece') {
      this._doRemovePiece(index);
      return;
    }

    if (this.engine.phase === GamePhase.Placing) {
      this._doPlacePiece(index);
    } else if (this.engine.phase === GamePhase.Moving) {
      this._doMovePiece(index);
    }
  }

  /** 下棋阶段：放置棋子 */
  private _doPlacePiece(index: number): void {
    const result = this.engine.placePiece(index);

    if (result.success) {
      this.uiManager?.showMessage('落子成功', 0.5);
      if (result.needRemove) {
        this._clickMode = 'removePiece';
        this.boardRenderer?.refreshBoard(); // 成三后刷新棋盘，否则新落棋子不可见
        this.uiManager?.updateUI();
      } else {
        this._afterTurn();
      }
    } else {
      this.uiManager?.showMessage(result.error || '无法落子', 1);
    }
  }

  /** 走棋阶段：移动棋子 */
  private _doMovePiece(index: number): void {
    const board = this.engine.board;

    // 第一步：选择己方棋子
    if (this._selectedFrom < 0) {
      if (board.getPiece(index) !== this.engine.currentPlayer) {
        this.uiManager?.showMessage('请选择己方棋子', 0.8);
        return;
      }
      this._selectedFrom = index;
      this.boardRenderer?.selectPiece(index);
      return;
    }

    // 第二步：选择目标位置
    const result = this.engine.movePiece(this._selectedFrom, index);

    if (result.success) {
      this._selectedFrom = -1;
      if (result.needRemove) {
        this._clickMode = 'removePiece';
        this.boardRenderer?.refreshBoard(); // 成三后刷新棋盘
        this.uiManager?.updateUI();
      } else {
        this._afterTurn();
      }
    } else {
      // 如果点击的是己方棋子，切换选中
      if (board.getPiece(index) === this.engine.currentPlayer) {
        this._selectedFrom = index;
        this.boardRenderer?.selectPiece(index);
      } else {
        this.uiManager?.showMessage(result.error || '无法移动', 1);
        this._selectedFrom = -1;
        this.boardRenderer?.refreshBoard();
      }
    }
  }

  /** 吃子操作 */
  private _doRemovePiece(index: number): void {
    const result = this.engine.removePiece(index);

    if (result.success) {
      this._clickMode = 'placeOrMove';
      this.uiManager?.showMessage('吃子成功', 0.5);
      this.boardRenderer?.refreshBoard();
      this._afterTurn();
    } else {
      this.uiManager?.showMessage(result.error || '无法吃子', 1);
    }
  }

  /** 回合结束后的处理 */
  private _afterTurn(): void {
    this.boardRenderer?.refreshBoard();
    this.uiManager?.updateUI();

    // AI 自动走棋
    if (this._aiController && this.engine.currentPlayer === this._aiController.aiPlayer) {
      if (this.engine.phase !== GamePhase.GameOver) {
        this._aiController.makeMove().then(() => {
          this.boardRenderer?.refreshBoard();
          this.uiManager?.updateUI();
        });
      }
    }
  }
}
