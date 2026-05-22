import { _decorator, Component, Node, director, sys } from 'cc';
import { Player, GameMode, GamePhase, GameOverReason } from '../core/GameTypes';
import { GameEngine } from '../core/GameEngine';
import { AIController, AIDifficulty } from '../core/AIController';
import { BoardRenderer } from './BoardRenderer';
import { UIManager } from './UIManager';
import { NetworkManager, NetworkState } from '../network/NetworkManager';
const { ccclass, property } = _decorator;

/**
 * 游戏管理器（核心组件）
 * 支持：本地双人 / AI对战 / 在线对战
 */
@ccclass('GameManager')
export class GameManager extends Component {
  @property({ type: BoardRenderer })
  boardRenderer!: BoardRenderer;

  @property({ type: UIManager })
  uiManager!: UIManager;

  @property({ type: NetworkManager })
  networkManager!: NetworkManager;

  engine!: GameEngine;

  private _aiController: AIController | null = null;
  private _clickMode: 'placeOrMove' | 'removePiece' = 'placeOrMove';
  private _selectedFrom: number = -1;

  /** 在线模式：我的颜色，只有我的回合才能操作 */
  private _myColor: Player = Player.None;

  onLoad(): void {}

  start(): void {
    // 自动查找未绑定的组件
    if (!this.boardRenderer)
      this.boardRenderer = this.node.parent?.getComponentInChildren(BoardRenderer) || null as any;
    if (!this.uiManager)
      this.uiManager = this.node.parent?.getComponentInChildren(UIManager) || null as any;
    if (!this.networkManager)
      this.networkManager = this.node.parent?.getComponentInChildren(NetworkManager) || null as any;

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

    // 根据模式初始化
    if (mode === GameMode.AI) {
      this._initAIMode();
    } else if (mode === GameMode.Online) {
      this._initOnlineMode();
    }

    this.uiManager?.updateUI();
  }

  // ==================== 模式初始化 ====================

  private _initAIMode(): void {
    this._aiController = new AIController(this.engine, Player.White, AIDifficulty.Medium);
    this.uiManager?.setAIController(this._aiController);
  }

  private _initOnlineMode(): void {
    if (!this.networkManager) {
      this.uiManager?.showMessage('网络模块未配置', 3);
      return;
    }

    this.uiManager?.showOnlineConnecting();

    this.networkManager.connect();

    this.networkManager.onError = (msg) => {
      this.uiManager?.showMessage(msg, 3);
    };

    this.networkManager.onStateChanged = (state) => {
      if (state === NetworkState.Connected) {
        this.networkManager.startMatch();
        this.uiManager?.showOnlineWaiting();
      } else if (state === NetworkState.Waiting) {
        this.uiManager?.showOnlineWaiting();
      }
    };

    this.networkManager.onMatched = (myColor) => {
      this._myColor = myColor;
      this.uiManager?.showOnlineMatched(myColor);

      // 等待一小段后进入游戏
      setTimeout(() => {
        this.uiManager?.hideOnlinePanel();
        this.uiManager?.updateUI();

        // 如果我是白方，需要等待对手先手
        if (myColor === Player.White) {
          this.uiManager?.showMessage('等待对手落子...', 2);
        }
      }, 1500);
    };

    // 对手操作回调
    this.networkManager.onOpponentPlace = (position) => {
      this.engine.placePiece(position);
      this.boardRenderer?.refreshBoard();
      this.uiManager?.updateUI();
    };

    this.networkManager.onOpponentMove = (from, to) => {
      this.engine.movePiece(from, to);
      this.boardRenderer?.refreshBoard();
      this.uiManager?.updateUI();
    };

    this.networkManager.onOpponentRemove = (position) => {
      this.engine.removePiece(position);
      this.boardRenderer?.refreshBoard();
      this.uiManager?.updateUI();
    };

    this.networkManager.onOpponentSurrender = () => {
      this.engine.surrender();
    };

    this.networkManager.onOpponentDisconnected = () => {
      this.uiManager?.showMessage('对手已断开连接', 3);
      this.engine.surrender();
    };
  }

  // ==================== 点击处理 ====================

  private _handlePointClick(index: number): void {
    if (this.engine.phase === GamePhase.GameOver) return;

    // AI 回合不允许操作
    if (this._aiController && this.engine.currentPlayer === this._aiController.aiPlayer) return;

    // 在线模式：不是我的回合不允许操作
    if (this.networkManager && this._myColor !== Player.None) {
      if (this.engine.currentPlayer !== this._myColor) {
        this.uiManager?.showMessage('等待对手操作...', 0.8);
        return;
      }
    }

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

  // ==================== 下棋 ====================

  private _doPlacePiece(index: number): void {
    const result = this.engine.placePiece(index);

    if (result.success) {
      // 在线模式：同步给对手
      if (this.networkManager && this._myColor !== Player.None) {
        this.networkManager.sendPlace(index);
      }

      this.uiManager?.showMessage('落子成功', 0.5);
      if (result.needRemove) {
        this._clickMode = 'removePiece';
        this.boardRenderer?.refreshBoard();
        this.uiManager?.updateUI();
      } else {
        this._afterTurn();
      }
    } else {
      this.uiManager?.showMessage(result.error || '无法落子', 1);
    }
  }

  // ==================== 走棋 ====================

  private _doMovePiece(index: number): void {
    const board = this.engine.board;

    if (this._selectedFrom < 0) {
      if (board.getPiece(index) !== this.engine.currentPlayer) {
        this.uiManager?.showMessage('请选择己方棋子', 0.8);
        return;
      }
      this._selectedFrom = index;
      this.boardRenderer?.selectPiece(index);
      return;
    }

    const result = this.engine.movePiece(this._selectedFrom, index);

    if (result.success) {
      // 在线模式：同步给对手
      if (this.networkManager && this._myColor !== Player.None) {
        this.networkManager.sendMove(this._selectedFrom, index);
      }

      this._selectedFrom = -1;
      if (result.needRemove) {
        this._clickMode = 'removePiece';
        this.boardRenderer?.refreshBoard();
        this.uiManager?.updateUI();
      } else {
        this._afterTurn();
      }
    } else {
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

  // ==================== 吃子 ====================

  private _doRemovePiece(index: number): void {
    const result = this.engine.removePiece(index);

    if (result.success) {
      // 在线模式：同步给对手
      if (this.networkManager && this._myColor !== Player.None) {
        this.networkManager.sendRemove(index);
      }

      this._clickMode = 'placeOrMove';
      this.uiManager?.showMessage('吃子成功', 0.5);
      this.boardRenderer?.refreshBoard();
      this._afterTurn();
    } else {
      this.uiManager?.showMessage(result.error || '无法吃子', 1);
    }
  }

  // ==================== 回合结束 ====================

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

    // 在线模式：提示等待对手
    if (this.networkManager && this._myColor !== Player.None &&
        this.engine.currentPlayer !== this._myColor &&
        this.engine.phase !== GamePhase.GameOver) {
      this.uiManager?.showMessage('等待对手操作...', 2);
    }
  }
}
