/**
 * 音效管理器
 * 使用 Web Audio API 动态生成落子音效，无需外部音频文件
 * 微信小游戏环境同样支持 Web Audio API
 */
export class SoundManager {
  private static _instance: SoundManager | null = null;
  private _ctx: AudioContext | null = null;
  private _muted: boolean = false;

  static get instance(): SoundManager {
    if (!SoundManager._instance) {
      SoundManager._instance = new SoundManager();
    }
    return SoundManager._instance;
  }

  get muted(): boolean {
    return this._muted;
  }

  /** 初始化音频上下文（需要在用户交互后调用） */
  init(): void {
    if (this._ctx) return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this._ctx = new AudioCtx();
      }
    } catch (e) {
      console.warn('[SoundManager] 音频初始化失败:', e);
    }
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    return this._muted;
  }

  /** 落子音效：清脆的 "嗒" */
  playPlace(): void {
    this._playTone(880, 0.08, 'sine', 0.3);
  }

  /** 走棋音效：稍低的滑动感 */
  playMove(): void {
    this._playTone(660, 0.1, 'sine', 0.25);
  }

  /** 吃子音效：低沉有力 */
  playCapture(): void {
    this._playTone(440, 0.15, 'triangle', 0.35);
    setTimeout(() => this._playTone(330, 0.12, 'triangle', 0.3), 60);
  }

  /** 成三特效音 */
  playMill(): void {
    const now = this._ctx?.currentTime || 0;
    // 上行三个音符
    [660, 880, 1100].forEach((freq, i) => {
      this._playTone(freq, 0.12, 'sine', 0.3, i * 0.08);
    });
  }

  /** 游戏结束音效 */
  playGameOver(): void {
    const now = this._ctx?.currentTime || 0;
    [523, 659, 784, 1047].forEach((freq, i) => {
      setTimeout(() => this._playTone(freq, 0.2, 'sine', 0.3), i * 150);
    });
  }

  /** 按钮点击音效 */
  playButtonClick(): void {
    this._playTone(600, 0.04, 'sine', 0.15);
  }

  private _playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume: number = 0.3,
    delay: number = 0,
  ): void {
    if (this._muted || !this._ctx) return;

    try {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();

      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, this._ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + delay + duration);

      osc.connect(gain);
      gain.connect(this._ctx.destination);

      osc.start(this._ctx.currentTime + delay);
      osc.stop(this._ctx.currentTime + delay + duration);
    } catch (e) {
      // 静默处理
    }
  }
}
