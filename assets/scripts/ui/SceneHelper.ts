import { _decorator, Component, Node, Label, Graphics, Button, Color, UITransform, Size, Vec3, Canvas, director, sys } from 'cc';
import { BoardRenderer } from './BoardRenderer';
import { UIManager } from './UIManager';
import { GameManager } from './GameManager';
const { ccclass, property } = _decorator;

/**
 * 场景搭建助手 —— 一键自搭建
 *
 * ══════════════════════════════════════════
 * 使用方法（编辑器只需这一步）：
 *   1. 创建空场景 → 在 Canvas 节点挂上此组件
 *   2. 勾选 autoSetup = true
 *   3. 运行
 *
 * 场景自动识别：
 *   - 场景名含 "Menu" → 搭建主菜单（模式选择）
 *   - 场景名含 "Game" → 搭建游戏界面（棋盘+UI+引擎）
 * ══════════════════════════════════════════
 */
@ccclass('SceneHelper')
export class SceneHelper extends Component {
  @property({ type: Boolean, tooltip: '勾选后运行时自动搭建场景' })
  autoSetup: boolean = false;

  @property
  designWidth: number = 750;

  @property
  designHeight: number = 1334;

  private _initialized: boolean = false;

  onLoad(): void {
    if (!this.autoSetup || this._initialized) return;
    this._initialized = true;

    this._setupCanvas();

    const sceneName = director.getScene()?.name || '';
    if (sceneName.toLowerCase().includes('menu')) {
      this.buildMainMenu();
    } else {
      this.buildGame();
    }
  }

  // ==================== 画布适配 ====================

  private _setupCanvas(): void {
    let canvasNode = this.node;
    if (!this.node.getComponent(Canvas)) {
      const c = director.getScene()?.getComponentInChildren(Canvas);
      if (c) canvasNode = c.node;
    }

    const uiTransform = canvasNode.getComponent(UITransform);
    if (uiTransform) {
      uiTransform.setContentSize(new Size(this.designWidth, this.designHeight));
    }

    // 设置 Canvas 背景色（木色底，棋盘线条才可见）
    const bg = canvasNode.getComponent(Graphics) || canvasNode.addComponent(Graphics);
    bg.fillColor = new Color(245, 225, 180, 255); // 暖木色
    bg.rect(-this.designWidth / 2, -this.designHeight / 2, this.designWidth, this.designHeight);
    bg.fill();
  }

  // ==================== 游戏场景搭建 ====================

  buildGame(): void {
    const canvasNode = this._findCanvasNode();

    // 创建游戏根节点
    const gameRoot = this._createNode('GameRoot', canvasNode);
    const rootTransform = gameRoot.addComponent(UITransform);
    rootTransform.setContentSize(new Size(this.designWidth, this.designHeight));

    // ── 棋盘 ──
    const boardRenderer = this._buildBoard(gameRoot);

    // ── UI 层 ──
    const uiManager = this._buildUI(gameRoot);

    // ── 游戏管理器 ──
    const gmNode = this._createNode('GameManager', gameRoot);
    const gameManager = gmNode.addComponent(GameManager);
    gameManager.boardRenderer = boardRenderer;
    gameManager.uiManager = uiManager;

    console.log('[SceneHelper] 场景自搭建完成');
  }

  // ==================== 棋盘搭建 ====================

  private _buildBoard(parent: Node): BoardRenderer {
    const boardNode = this._createNode('BoardNode', parent);
    const boardTransform = boardNode.addComponent(UITransform);
    boardTransform.setContentSize(new Size(this.designWidth, this.designHeight));

    // 子容器
    const pieceContainer = this._createNode('PieceContainer', boardNode);
    pieceContainer.addComponent(UITransform).setContentSize(new Size(0, 0));

    const labelContainer = this._createNode('LabelContainer', boardNode);
    labelContainer.addComponent(UITransform).setContentSize(new Size(0, 0));

    // BoardRenderer 组件
    const renderer = boardNode.addComponent(BoardRenderer);
    renderer.graphics = boardNode.addComponent(Graphics);
    renderer.pieceContainer = pieceContainer;
    renderer.labelContainer = labelContainer;

    return renderer;
  }

  // ==================== UI 搭建 ====================

  private _buildUI(parent: Node): UIManager {
    const uiRoot = this._createNode('UIRoot', parent);

    const uiManager = uiRoot.addComponent(UIManager);

    // ── 顶部状态栏 ──
    const topBar = this._createNode('TopBar', uiRoot);
    topBar.addComponent(UITransform).setContentSize(new Size(this.designWidth, 110));
    topBar.setPosition(0, (this.designHeight - 110) / 2, 0);

    // 深色背景条
    const topBg = topBar.addComponent(Graphics);
    topBg.fillColor = new Color(20, 15, 10, 200);
    topBg.rect(-this.designWidth / 2, -55, this.designWidth, 110);
    topBg.fill();

    const phaseLabel = this._createLabel('PhaseLabel', topBar, '成三棋', 26, new Color(200, 180, 140, 255));
    phaseLabel.setPosition(0, 30, 0);

    const statusLabel = this._createLabel('StatusLabel', topBar, '黑方回合', 36, Color.WHITE);
    statusLabel.setPosition(0, -5, 0);
    // 默认黑棋颜色（深色底上需要亮色文字）
    // 回合切换时动态改变

    uiManager.phaseLabel = phaseLabel.getComponent(Label)!;
    uiManager.statusLabel = statusLabel.getComponent(Label)!;

    // ── 棋子信息栏 ──
    const infoBar = this._createNode('InfoBar', uiRoot);
    infoBar.addComponent(UITransform).setContentSize(new Size(this.designWidth, 50));
    infoBar.setPosition(0, (this.designHeight - 110) / 2 - 70, 0);

    const blackLabel = this._createLabel('PiecesBlack', infoBar, '● 黑方: 手 12 | 盘 0', 22, new Color(60, 60, 60, 255));
    blackLabel.setPosition(-this.designWidth / 4, 0, 0);

    const whiteLabel = this._createLabel('PiecesWhite', infoBar, '○ 白方: 手 12 | 盘 0', 22, new Color(180, 180, 180, 255));
    whiteLabel.setPosition(this.designWidth / 4, 0, 0);

    uiManager.piecesBlackLabel = blackLabel.getComponent(Label)!;
    uiManager.piecesWhiteLabel = whiteLabel.getComponent(Label)!;

    // ── 底部按钮栏 ──
    const bottomBar = this._createNode('BottomBar', uiRoot);
    bottomBar.addComponent(UITransform).setContentSize(new Size(this.designWidth, 70));
    bottomBar.setPosition(0, (-this.designHeight + 70) / 2 + 15, 0);

    const btnWidth = 130;
    const btnGap = 20;
    const btnY = 0;
    const totalWidth = btnWidth * 4 + btnGap * 3;
    const startX = -totalWidth / 2 + btnWidth / 2;

    uiManager.undoButton = this._createButton('UndoBtn', bottomBar, '撤销', startX, btnY, btnWidth, 48);
    uiManager.restartButton = this._createButton('RestartBtn', bottomBar, '重来', startX + (btnWidth + btnGap), btnY, btnWidth, 48);
    uiManager.surrenderButton = this._createButton('SurrenderBtn', bottomBar, '认输', startX + (btnWidth + btnGap) * 2, btnY, btnWidth, 48);
    uiManager.backButton = this._createButton('BackBtn', bottomBar, '返回', startX + (btnWidth + btnGap) * 3, btnY, btnWidth, 48);

    // ── 游戏结束面板 ──
    const gameOverPanel = this._createNode('GameOverPanel', uiRoot);
    gameOverPanel.addComponent(UITransform).setContentSize(new Size(this.designWidth, this.designHeight));
    gameOverPanel.active = false;

    // 遮罩背景
    const overlay = this._createNode('Overlay', gameOverPanel);
    overlay.addComponent(UITransform).setContentSize(new Size(this.designWidth, this.designHeight));
    const ovGraphics = overlay.addComponent(Graphics);
    ovGraphics.fillColor = new Color(0, 0, 0, 200);
    ovGraphics.rect(-this.designWidth / 2, -this.designHeight / 2, this.designWidth, this.designHeight);
    ovGraphics.fill();

    const winnerLabel = this._createLabel('WinnerLabel', gameOverPanel, '', 52, new Color(255, 215, 0, 255));
    winnerLabel.setPosition(0, 60, 0);

    const reasonLabel = this._createLabel('ReasonLabel', gameOverPanel, '', 28, new Color(255, 255, 255, 220));
    reasonLabel.setPosition(0, 0, 0);

    // 再来一局按钮（游戏结束面板内）
    const replayBtn = this._createButton('ReplayBtn', gameOverPanel, '再来一局', 0, -80, 200, 54);
    replayBtn.node.on(Button.EventType.CLICK, () => {
      const gm = director.getScene()?.getComponentInChildren(GameManager);
      gm?.engine?.restart();
      gameOverPanel.active = false;
    });

    uiManager.gameOverPanel = gameOverPanel;
    uiManager.gameOverLabel = winnerLabel.getComponent(Label)!;
    uiManager.gameOverReasonLabel = reasonLabel.getComponent(Label)!;

    // ── 消息弹窗 ──
    const messagePopup = this._createNode('MessagePopup', uiRoot);
    messagePopup.addComponent(UITransform).setContentSize(new Size(this.designWidth, 0));
    messagePopup.setPosition(0, this.designHeight * 0.25, 0);
    messagePopup.active = false;

    const msgBgNode = this._createNode('MsgBg', messagePopup);
    msgBgNode.addComponent(UITransform).setContentSize(new Size(380, 70));
    const msgBg = msgBgNode.addComponent(Graphics);
    msgBg.fillColor = new Color(0, 0, 0, 210);
    msgBg.roundRect(-190, -35, 380, 70, 12);
    msgBg.fill();
    msgBgNode.setSiblingIndex(-1);

    const msgLabel = this._createLabel('MsgLabel', messagePopup, '', 30, Color.WHITE);

    uiManager.messagePopup = messagePopup;
    uiManager.messagePopupLabel = msgLabel.getComponent(Label)!;

    return uiManager;
  }

  // ==================== 主菜单搭建 ====================

  /** 搭建主菜单（可选，也可在单独的 MainMenu 场景中使用） */
  buildMainMenu(): void {
    const canvasNode = this._findCanvasNode();

    // 背景
    const bg = canvasNode.addComponent(Graphics);
    bg.fillColor = new Color(40, 30, 20, 255);
    bg.rect(-this.designWidth / 2, -this.designHeight / 2, this.designWidth, this.designHeight);
    bg.fill();

    // 标题
    const title = this._createLabel('Title', canvasNode, '成 三 棋', 64, new Color(220, 180, 100, 255));
    title.setPosition(0, 200, 0);

    // 副标题
    const subtitle = this._createLabel('Subtitle', canvasNode, 'Nine Men\'s Morris', 28, new Color(180, 150, 120, 200));
    subtitle.setPosition(0, 140, 0);

    // 按钮
    const btnW = 280;
    const btnH = 60;
    const btnGap = 20;

    const localBtn = this._createButton('LocalBtn', canvasNode, '🎮  双人对战', 0, 20, btnW, btnH);
    localBtn.node.on(Button.EventType.CLICK, () => this._startGame('localTwoPlayer'));

    const aiBtn = this._createButton('AIBtn', canvasNode, '🤖  人机对战', 0, -(btnH + btnGap), btnW, btnH);
    aiBtn.node.on(Button.EventType.CLICK, () => this._startGame('ai'));

    const onlineBtn = this._createButton('OnlineBtn', canvasNode, '🌐  在线对战', 0, -(btnH + btnGap) * 2, btnW, btnH);
    onlineBtn.node.on(Button.EventType.CLICK, () => this._startGame('online'));

    console.log('[SceneHelper] 主菜单搭建完成');
  }

  // ==================== 工具方法 ====================

  private _findCanvasNode(): Node {
    const c = this.node.getComponent(Canvas);
    if (c) return this.node;
    const found = director.getScene()?.getComponentInChildren(Canvas);
    return found ? found.node : this.node;
  }

  private _createNode(name: string, parent: Node): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    return node;
  }

  private _createLabel(name: string, parent: Node, text: string, fontSize: number, color: Color): Node {
    const node = this._createNode(name, parent);
    node.addComponent(UITransform).setContentSize(new Size(0, 0));
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.color = color;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.lineHeight = fontSize;
    label.overflow = Label.Overflow.NONE;
    return node;
  }

  private _createButton(name: string, parent: Node, text: string, x: number, y: number, width: number, height: number): Button {
    const btnNode = this._createNode(name, parent);
    btnNode.setPosition(x, y, 0);
    btnNode.addComponent(UITransform).setContentSize(new Size(width, height));

    // 按钮背景
    const btnBg = btnNode.addComponent(Graphics);
    btnBg.fillColor = new Color(80, 60, 40, 220);
    btnBg.roundRect(-width / 2, -height / 2, width, height, 10);
    btnBg.fill();

    btnBg.strokeColor = new Color(180, 150, 100, 200);
    btnBg.lineWidth = 1.5;
    btnBg.roundRect(-width / 2, -height / 2, width, height, 10);
    btnBg.stroke();

    // 按钮文字
    const btnLabel = this._createLabel(`${name}_Label`, btnNode, text, 28, Color.WHITE);

    const btn = btnNode.addComponent(Button);
    btn.target = btnNode;
    btn.transition = Button.Transition.COLOR;
    btn.normalColor = new Color(255, 255, 255, 255);
    btn.hoverColor = new Color(230, 200, 150, 255);
    btn.pressedColor = new Color(180, 150, 100, 255);

    return btn;
  }

  private _startGame(mode: string): void {
    // 保存模式到本地存储
    if (sys && sys.localStorage) {
      sys.localStorage.setItem('gameMode', mode);
    }
    director.loadScene('Game');
  }
}
