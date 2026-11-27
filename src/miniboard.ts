import { Life, type Rule } from './life';
import type { Palette } from './palettes';
import { BoardRenderer, type Look, type View } from './render';

/**
 * A small live board in its own canvas: the Rule lab's preview and the theme editor's. It keeps its
 * canvas sized to its box, steps on its own clock and redraws only while something is moving.
 */
export class MiniBoard {
  readonly life: Life;
  private readonly renderer = new BoardRenderer();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly view: View = { width: 0, height: 0, cell: 0, ox: 0, oy: 0 };
  private lastStep = 0;
  private lastT = 1;
  private dirty = true;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    cols: number,
    rows: number,
    /** How far cells have grown in or melted away, 0 → 1, `now - last` ms into an `interval`-ms step. */
    private readonly tween: (now: number, last: number, interval: number) => number,
  ) {
    this.life = new Life(cols, rows);
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.fit()).observe(canvas);
  }

  /** Match the canvas to its box. Also call it when the board comes into view. */
  fit(): void {
    const { canvas, life, view } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.width = w;
    view.height = h;
    view.cell = Math.min(w / life.cols, h / life.rows);
    view.ox = (w - life.cols * view.cell) / 2;
    view.oy = (h - life.rows * view.cell) / 2;
    this.dirty = true;
  }

  /** Fresh random soup, starting a full beat from now. */
  restart(): void {
    this.life.soup();
    this.lastStep = performance.now();
    this.dirty = true;
  }

  /** Redraw on the next run even if nothing moved (the colours or the look changed). */
  invalidate(): void { this.dirty = true; }

  /** Step if one is due, then redraw if anything moved. Returns whether a generation passed. */
  run(now: number, rule: Rule, speed: number, pal: Palette, look: Look): boolean {
    const interval = 1000 / speed;
    const stepped = now - this.lastStep >= interval;
    if (stepped) {
      this.life.step(rule, look.wrap);
      this.lastStep = now;
    }
    const t = this.tween(now, this.lastStep, interval);
    if (t < 1 || this.lastT < 1 || this.dirty) {
      this.renderer.draw(this.ctx, this.life, this.view, pal, look, t, now);
      this.dirty = false;
    }
    this.lastT = t;
    return stepped;
  }
}
