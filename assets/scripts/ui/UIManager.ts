import { _decorator, Component, Label, Button, Node, tween, Vec3, Color, director } from 'cc';
import { Player, GamePhase, GameMode, GameOverReason } from '../core/GameTypes';
import { GameEngine } from '../core/GameEngine';
import { AIController, AIDifficulty } from '../core/AIController';
const { ccclass, property } = _decorator;

/**
 * UI 管理器
 * 负责显示游戏状态信息、操作按钮、提示消息
 */
@ccclass('UIManager')
export class UIManager extends Component {
  @property({ type: Label })
  statusLabel!: Label;

  @property({ type: Label })
  phaseLabel!: Label;

  @property({ type: Label })
  piecesBlackLabel!: Label;

  @property({ type: Label })
  piecesWhiteLabel!: Label;

  @property({ type: Label })
  messageLabel!: Label;

  @property({ type: Button })
  undoButton!: Button;

  @property({ type: Button })
  restartButton!: Button;

  @property({ type: Button })
  surrenderButton!: Button;

  @property({ type: Button })
  backButton!: Button;

  @property({ type: Node })
  gameOverPanel!: Node;

  @property({ type: Label })
  gameOverLabel!: Label;

  @property({ type: Label })
  gameOverReasonLabel!: Label;

  @property({ type: Node })
  messagePopup!: Node;

  @property({ type: Label })
  messagePopupLabel!: Label;

  private _engine: GameEngine | null = null;
  private _aiController: AIController | null = null;

  onLoad(): void {
    // SceneHelper 可能在 start 之后才设置属性引用，这里做空保护
    if (this.gameOverPanel) {
      this.gameOverPanel.active = false;
    }
    if (this.messagePopup) {
      this.messagePopup.active = false;
    }

    // 按钮事件通过 SceneHelper 直接创建时绑定，这里只做兜底
    if (this.undoButton) {
      this.undoButton.node.on(Button.EventType.CLICK, this._onUndo, this);
    }
    if (this.restartButton) {
      this.restartButton.node.on(Button.EventType.CLICK, this._onRestart, this);
    }
    if (this.surrenderButton) {
      this.surrenderButton.node.on(Button.EventType.CLICK, this._onSurrender, this);
    }
    if (this.backButton) {
      this.backButton.node.on(Button.EventType.CLICK, this._onBack, this);
    }
  }

  setEngine(engine: GameEngine): void {
    this._engine = engine;
    engine.onStateChanged = () => this.updateUI();
    engine.onGameOver = (winner, reason) => this._showGameOver(winner, reason);
    engine.onMustRemovePiece = () => this._showMustRemove();
  }

  setAIController(ai: AIController): void {
    this._aiController = ai;
  }

  /** 更新整个UI */
  updateUI(): void {
    if (!this._engine) return;

    const state = this._engine.getState();

    // 阶段
    const phaseText = state.phase === GamePhase.Placing ? '下棋阶段' :
                       state.phase === GamePhase.Moving ? '走棋阶段' : '游戏结束';
    if (this.phaseLabel) this.phaseLabel.string = phaseText;

    // 当前玩家
    if (this.statusLabel) {
      if (state.mustRemovePiece) {
        this.statusLabel.string = `${this._playerName(this._engine.currentPlayer)}：请吃掉对方一枚棋子`;
      } else if (state.phase !== GamePhase.GameOver) {
        this.statusLabel.string = `轮到：${this._playerName(this._engine.currentPlayer)}`;
      } else {
        this.statusLabel.string = '';
      }
    }

    // 棋子数
    if (this.piecesBlackLabel) {
      this.piecesBlackLabel.string = `黑方：手中${state.piecesInHand[Player.Black]}  棋盘${state.piecesOnBoard[Player.Black]}`;
    }
    if (this.piecesWhiteLabel) {
      this.piecesWhiteLabel.string = `白方：手中${state.piecesInHand[Player.White]}  棋盘${state.piecesOnBoard[Player.White]}`;
    }

    // 撤销按钮（AI模式或吃子状态不可用）
    if (this.undoButton) {
      const isAI = this._engine.gameMode === GameMode.AI;
      this.undoButton.interactable = !isAI && !state.mustRemovePiece && state.phase !== GamePhase.GameOver;
    }
  }

  /** 显示消息弹窗 */
  showMessage(text: string, duration: number = 1.5): void {
    if (!this.messagePopup || !this.messagePopupLabel) return;

    this.messagePopupLabel.string = text;
    this.messagePopup.active = true;
    this.messagePopup.setScale(new Vec3(0.8, 0.8, 1));

    tween(this.messagePopup)
      .to(0.2, { scale: new Vec3(1, 1, 1) })
      .delay(duration)
      .to(0.2, { scale: new Vec3(0.8, 0.8, 1) })
      .call(() => {
        this.messagePopup.active = false;
      })
      .start();
  }

  private _showMustRemove(): void {
    this.showMessage('成三！请选择吃掉对方一枚棋子', 2);
  }

  private _showGameOver(winner: Player, reason: GameOverReason): void {
    if (!this.gameOverPanel) return;

    const winnerName = this._playerName(winner);
    if (this.gameOverLabel) {
      this.gameOverLabel.string = `${winnerName} 获胜！`;
    }

    const reasonText = reason === GameOverReason.InsufficientPieces ? '对方棋子不足' :
                        reason === GameOverReason.NoAvailableMoves ? '对方无步可走' :
                        reason === GameOverReason.Surrender ? '对方认输' : '';
    if (this.gameOverReasonLabel) {
      this.gameOverReasonLabel.string = reasonText;
    }

    this.gameOverPanel.active = true;
    this.gameOverPanel.setScale(new Vec3(0, 0, 1));
    tween(this.gameOverPanel)
      .to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private _onUndo(): void {
    if (this._engine) {
      this._engine.undo();
    }
  }

  private _onRestart(): void {
    if (this._engine) {
      this._engine.restart();
    }
    if (this.gameOverPanel) {
      this.gameOverPanel.active = false;
    }
  }

  private _onSurrender(): void {
    if (this._engine) {
      this._engine.surrender();
    }
  }

  private _onBack(): void {
    // TODO: 返回主菜单
    if (typeof director !== 'undefined') {
      director.loadScene('MainMenu');
    }
  }

  private _playerName(player: Player): string {
    return player === Player.Black ? '黑方' :
           player === Player.White ? '白方' : '';
  }
}
