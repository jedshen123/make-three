import { _decorator, Component, Node, Graphics, Color, UITransform, Size, Vec3, Input, EventTouch, Label, director, Prefab, instantiate } from 'cc';
import { Player, GamePhase, BOARD_SIZE, POINT_POSITIONS, ADJACENCY } from '../core/GameTypes';
import { GameEngine } from '../core/GameEngine';
const { ccclass, property } = _decorator;

/**
 * 棋盘渲染器
 * 负责绘制棋盘网格线条、棋盘点位标记，并处理触摸交互
 */
@ccclass('BoardRenderer')
export class BoardRenderer extends Component {
  @property({ type: Graphics })
  graphics!: Graphics;

  @property({ type: Node })
  pieceContainer!: Node; // 棋子节点容器

  @property({ type: Prefab })
  piecePrefab: Prefab | null = null; // 棋子预制体

  @property({ type: Node })
  labelContainer!: Node; // 被吃标记容器

  /** 棋盘边长（像素），根据屏幕自适应 */
  private _boardSize: number = 600;

  /** 逻辑坐标 → 本地坐标的缩放系数 */
  private _scale: number = 300;

  /** 游戏引擎引用 */
  private _engine: GameEngine | null = null;

  /** 棋子节点映射：pointIndex -> Node */
  private _pieceNodes: Map<number, Node> = new Map();

  /** 被吃标记节点映射 */
  private _blockedNodes: Map<number, Node> = new Map();

  /** 当前选中的棋子（走棋阶段） */
  private _selectedPiece: number = -1;

  /** 高亮指示器 */
  private _highlightNode: Node | null = null;

  /** 可走目标指示器 */
  private _moveTargetNodes: Node[] = [];

  /** 点击回调 */
  onPointClick: ((pointIndex: number) => void) | null = null;

  onLoad(): void {
    this._setupTouchListener();
  }

  start(): void {
    this._calculateBoardLayout();
    this._drawBoard();
  }

  setEngine(engine: GameEngine): void {
    this._engine = engine;
    engine.onStateChanged = () => this.refreshBoard();
    engine.onMustRemovePiece = () => {
      // 高亮可吃棋子
    };
  }

  /** 计算棋盘布局参数 */
  private _calculateBoardLayout(): void {
    const uiTransform = this.node.getComponent(UITransform);

    let screenWidth = 750;
    let screenHeight = 1334;

    if (uiTransform && uiTransform.width > 0 && uiTransform.height > 0) {
      screenWidth = uiTransform.width;
      screenHeight = uiTransform.height;
    }

    this._boardSize = Math.min(screenWidth, screenHeight) * 1.0;
    this._scale = this._boardSize / 2; // 逻辑坐标 0~2 映射到 -boardSize/2 ~ +boardSize/2
  }

  /**
   * 将逻辑坐标转换为节点本地坐标（中心为原点）
   * 逻辑坐标范围 0~2，棋盘中心在 (1, 1) 映射到本地 (0, 0)
   */
  getPixelPosition(pointIndex: number): Vec3 {
    const logicPos = POINT_POSITIONS[pointIndex];
    const px = (logicPos.x - 1) * this._scale;
    const py = (logicPos.y - 1) * this._scale;
    return new Vec3(px, py, 0);
  }

  /** 绘制棋盘线条 */
  private _drawBoard(): void {
    if (!this.graphics) return;

    const g = this.graphics;
    g.clear();

    const lineColor = new Color(80, 45, 20, 255); // 深木色，在浅色底上清晰
    const lineWidth = 6;

    // 收集所有要画的线段
    const drawnEdges = new Set<string>();
    const edges: [Vec3, Vec3][] = [];

    for (let i = 0; i < BOARD_SIZE; i++) {
      for (const j of ADJACENCY[i]) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (drawnEdges.has(key)) continue;
        drawnEdges.add(key);

        const p1 = this.getPixelPosition(i);
        const p2 = this.getPixelPosition(j);
        edges.push([p1, p2]);
      }
    }

    // 绘制线段
    for (const [p1, p2] of edges) {
      g.lineWidth = lineWidth;
      g.strokeColor = lineColor;
      g.moveTo(p1.x, p1.y);
      g.lineTo(p2.x, p2.y);
      g.stroke();
    }

    // 绘制24个落子点标记（小圆点）
    const dotRadius = 14;
    const dotColor = new Color(120, 65, 30, 200);
    for (let i = 0; i < BOARD_SIZE; i++) {
      const pos = this.getPixelPosition(i);
      g.fillColor = dotColor;
      g.circle(pos.x, pos.y, dotRadius);
      g.fill();
    }
  }

  /** 设置触摸监听 */
  private _setupTouchListener(): void {
    this.node.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
  }

  private _onTouchEnd(event: EventTouch): void {
    if (!this._engine) return;

    const touchPos = event.getUILocation();
    const nodePos = this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(touchPos.x, touchPos.y, 0));

    // 查找最近的棋盘点位
    const nearest = this._findNearestPoint(nodePos.x, nodePos.y);
    if (nearest < 0) {
      console.log(`[触摸] 点击位置(${nodePos.x.toFixed(0)},${nodePos.y.toFixed(0)}) 未命中任何点位`);
      return;
    }

    console.log(`[触摸] 点击点位 #${nearest} 位置(${nodePos.x.toFixed(0)},${nodePos.y.toFixed(0)})`);
    this.onPointClick?.(nearest);
  }

  /** 查找距离触摸点最近的棋盘点位 */
  private _findNearestPoint(x: number, y: number): number {
    const threshold = this._boardSize * 0.12; // 点击判定范围
    let nearest = -1;
    let minDist = Infinity;

    for (let i = 0; i < BOARD_SIZE; i++) {
      const pos = this.getPixelPosition(i);
      const dx = x - pos.x;
      const dy = y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDist && dist < threshold) {
        minDist = dist;
        nearest = i;
      }
    }

    return nearest;
  }

  /** 刷新棋盘显示 */
  refreshBoard(): void {
    if (!this._engine) return;
    this._updatePieces();
    this._updateBlockedMarks();
    this._clearSelection();
  }

  /** 更新棋子显示 */
  private _updatePieces(): void {
    if (!this._engine) return;

    const board = this._engine.board;

    // 清除不存在的棋子
    for (const [idx, node] of this._pieceNodes) {
      if (board.getPiece(idx) === Player.None) {
        node.removeFromParent();
        node.destroy();
        this._pieceNodes.delete(idx);
      }
    }

    // 添加/更新棋子
    for (let i = 0; i < BOARD_SIZE; i++) {
      const player = board.getPiece(i);
      if (player === Player.None) continue;

      if (this._pieceNodes.has(i)) {
        // 更新位置
        const node = this._pieceNodes.get(i)!;
        node.setPosition(this.getPixelPosition(i));
      } else {
        // 创建新棋子节点
        const node = this._createPieceNode(i, player);
        this._pieceNodes.set(i, node);
        this.pieceContainer.addChild(node);
      }
    }
  }

  /** 创建棋子节点 */
  private _createPieceNode(index: number, player: Player): Node {
    if (this.piecePrefab) {
      const node = instantiate(this.piecePrefab);
      node.setPosition(this.getPixelPosition(index));
      this._applyPieceColor(node, player);
      return node;
    }

    // 如果没有预制体，用Graphics动态绘制
    const node = new Node(`Piece_${index}`);
    node.setPosition(this.getPixelPosition(index));

    const graphics = node.addComponent(Graphics);
    const uiTransform = node.addComponent(UITransform);
    const pieceRadius = this._boardSize * 0.07;
    uiTransform.setContentSize(new Size(pieceRadius * 2, pieceRadius * 2));

    // 绘制圆形棋子
    graphics.fillColor = player === Player.Black
      ? new Color(30, 30, 30, 255)
      : new Color(240, 240, 240, 255);
    graphics.circle(0, 0, pieceRadius);
    graphics.fill();

    // 白色棋子加边框
    if (player === Player.White) {
      graphics.strokeColor = new Color(80, 80, 80, 255);
      graphics.lineWidth = 3;
      graphics.circle(0, 0, pieceRadius);
      graphics.stroke();
    }

    return node;
  }

  private _applyPieceColor(node: Node, player: Player): void {
    // 如果预制体中有标记组件，可在此设置
  }

  /** 更新被吃棋子标记 */
  private _updateBlockedMarks(): void {
    if (!this._engine) return;

    // 清除旧标记
    for (const node of this._blockedNodes.values()) {
      node.removeFromParent();
      node.destroy();
    }
    this._blockedNodes.clear();

    // 添加新标记（Map<位置, 打子方>）
    const blockedCells = this._engine.board.blockedCells;
    for (const [idx, capturer] of blockedCells) {
      const markNode = this._createBlockedMark(idx, capturer);
      this._blockedNodes.set(idx, markNode);
      this.labelContainer.addChild(markNode);
    }
  }

  /**
   * 创建被吃标记
   * 底层：正常大小的被吃棋子
   * 顶层：半大小的打子方棋子，盖在上面
   */
  private _createBlockedMark(index: number, capturer: Player): Node {
    const node = new Node(`Blocked_${index}`);
    node.setPosition(this.getPixelPosition(index));

    const graphics = node.addComponent(Graphics);
    const uiTransform = node.addComponent(UITransform);
    const bigRadius = this._boardSize * 0.06;   // 底层（被吃棋子，全尺寸）
    const smallRadius = bigRadius * 0.5;         // 顶层（打子方，半尺寸）
    const containerSize = bigRadius * 2.4;
    uiTransform.setContentSize(new Size(containerSize, containerSize));

    const captured = capturer === Player.Black ? Player.White : Player.Black;

    // ── 底层：被吃棋子（全尺寸，居中） ──
    const bottomColor = captured === Player.Black
      ? new Color(30, 30, 30, 255)
      : new Color(235, 235, 235, 255);
    graphics.fillColor = bottomColor;
    graphics.circle(0, 0, bigRadius);
    graphics.fill();
    if (captured === Player.White) {
      graphics.strokeColor = new Color(80, 80, 80, 255);
      graphics.lineWidth = 2;
      graphics.circle(0, 0, bigRadius);
      graphics.stroke();
    }

    // ── 顶层：打子方棋子（半尺寸，盖在正中间） ──
    const topColor = capturer === Player.Black
      ? new Color(30, 30, 30, 255)
      : new Color(240, 240, 240, 255);
    graphics.fillColor = topColor;
    graphics.circle(0, 0, smallRadius);
    graphics.fill();
    if (capturer === Player.White) {
      graphics.strokeColor = new Color(80, 80, 80, 255);
      graphics.lineWidth = 1.5;
      graphics.circle(0, 0, smallRadius);
      graphics.stroke();
    }

    return node;
  }

  /** 选中棋子（走棋阶段高亮） */
  selectPiece(index: number): void {
    this._clearSelection();
    this._selectedPiece = index;

    const node = this._pieceNodes.get(index);
    if (node) {
      this._highlightNode = new Node('Highlight');
      this._highlightNode.setPosition(node.position);

      const graphics = this._highlightNode.addComponent(Graphics);
      const uiTransform = this._highlightNode.addComponent(UITransform);
      const radius = this._boardSize * 0.075;
      uiTransform.setContentSize(new Size(radius * 2, radius * 2));

      // 半透明金色填充 + 边框
      graphics.fillColor = new Color(255, 215, 0, 80);
      graphics.circle(0, 0, radius);
      graphics.fill();
      graphics.strokeColor = new Color(255, 215, 0, 220);
      graphics.lineWidth = 3;
      graphics.circle(0, 0, radius);
      graphics.stroke();

      this.pieceContainer.addChild(this._highlightNode);
    }
  }

  /** 显示可走目标位置 */
  showMoveTargets(targets: number[]): void {
    this._clearMoveTargets();
    for (const idx of targets) {
      const pos = this.getPixelPosition(idx);
      const node = new Node(`Target_${idx}`);
      node.setPosition(pos);

      const graphics = node.addComponent(Graphics);
      const uiTransform = node.addComponent(UITransform);
      const r = this._boardSize * 0.04;
      uiTransform.setContentSize(new Size(r * 2, r * 2));

      graphics.fillColor = new Color(100, 200, 100, 160);
      graphics.circle(0, 0, r * 0.7);
      graphics.fill();

      this._moveTargetNodes.push(node);
      this.pieceContainer.addChild(node);
    }
  }

  private _clearMoveTargets(): void {
    for (const node of this._moveTargetNodes) {
      node.removeFromParent();
      node.destroy();
    }
    this._moveTargetNodes = [];
  }

  private _clearSelection(): void {
    this._selectedPiece = -1;
    if (this._highlightNode) {
      this._highlightNode.removeFromParent();
      this._highlightNode.destroy();
      this._highlightNode = null;
    }
    this._clearMoveTargets();
  }
}
