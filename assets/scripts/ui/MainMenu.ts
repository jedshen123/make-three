import { _decorator, Component, Node, Label, Button, director, sys } from 'cc';
import { GameMode } from '../core/GameTypes';
const { ccclass, property } = _decorator;

/** 游戏模式选择事件 */
export interface GameModeEvent {
  mode: GameMode;
}

/**
 * 主菜单
 * 提供游戏模式选择（双人对战 / AI对战 / 在线对战）
 */
@ccclass('MainMenu')
export class MainMenu extends Component {
  @property({ type: Node })
  menuRoot!: Node;

  @property({ type: Button })
  btnLocal!: Button;

  @property({ type: Button })
  btnAI!: Button;

  @property({ type: Button })
  btnOnline!: Button;

  @property({ type: Label })
  titleLabel!: Label;

  /** 选中的游戏模式 */
  selectedMode: GameMode = GameMode.LocalTwoPlayer;

  onLoad(): void {
    if (this.btnLocal) {
      this.btnLocal.node.on(Button.EventType.CLICK, () => {
        this.selectedMode = GameMode.LocalTwoPlayer;
        this.startGame();
      });
    }

    if (this.btnAI) {
      this.btnAI.node.on(Button.EventType.CLICK, () => {
        this.selectedMode = GameMode.AI;
        this.startGame();
      });
    }

    if (this.btnOnline) {
      this.btnOnline.node.on(Button.EventType.CLICK, () => {
        this.selectedMode = GameMode.Online;
        this.startGame();
      });
    }
  }

  /** 开始游戏 */
  private startGame(): void {
    // 保存选中的模式
    if (typeof sys !== 'undefined' && sys.localStorage) {
      sys.localStorage.setItem('gameMode', this.selectedMode);
    }

    // 加载游戏场景
    director.loadScene('Game', (err) => {
      if (err) {
        console.error('Failed to load Game scene:', err);
      }
    });
  }

  /** 显示菜单 */
  show(): void {
    this.menuRoot.active = true;
  }

  /** 隐藏菜单 */
  hide(): void {
    this.menuRoot.active = false;
  }
}
