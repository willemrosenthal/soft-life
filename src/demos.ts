import { brushCells, type Point } from './brush';
import { Life, type Rule } from './life';
import type { Palette } from './palettes';
import { BoardRenderer, type Look, type View } from './render';
import { formatSpeed, SPEED_STEPS } from './settings';

/**
 * The little animated scenes behind each (i) button. Every scene is a handful of hand-placed cells
 * drawn with the real renderer, so it looks exactly like the board in the player's theme.
 *
 *  - Slider demos sweep their value back and forth on their own, like a short video. Dragging the
 *    slider takes over; Auto hands it back. A marker shows the player's own setting.
 *  - The rules player walks through one generation in six steps: count one spot, count every
 *    spot, mark births, mark survivors and deaths, then change everything at once.
 *
 * Demos draw only when `tick` is called, which main.ts does while the demo's sheet is open.
 */

export type DemoKey = 'stickiness' | 'melt' | 'gaps' | 'density' | 'speed' | 'labSpeed' | 'brush' | 'rules';

/** What a demo needs from the app. Read fresh each time, so demos follow theme and setting changes. */
export interface DemoHost {
  palette(): Palette;
  style(): Look['style'];
  /** The player's current values, for the "yours" marker. */
  value(key: Exclude<DemoKey, 'rules'>): number;
  /** The rule the rules player starts with. */
  rule(): Rule;
  reducedMotion(): boolean;
}

export interface Demo {
  readonly el: HTMLElement;
  readonly title: string;
  tick(now: number): void;
  /** Called each time the demo's sheet opens; `start` names a step for the rules player (see STEPS). */
  shown(start?: string): void;
}

export const DEMO_TITLES: Record<DemoKey, string> = {
  stickiness: 'Stickiness', melt: 'Colour melt', gaps: 'Gaps', density: 'Density', speed: 'Speed',
  labSpeed: 'Preview speed', brush: 'Draw size', rules: 'How a generation works',
};

/** One renderer for every demo: only one is ever showing, and each melt renderer is a GPU context. */
const renderer = new BoardRenderer();

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l10.4-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2Z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>';
const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const ease = (t: number) => t * t * (3 - 2 * t);

interface Surface { ctx: CanvasRenderingContext2D; w: number; h: number }

/** Size a canvas to its box at the screen's resolution. Null while it has no size (sheet closed). */
function surface(c: HTMLCanvasElement): Surface | null {
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return null;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Where a cols × rows grid sits, centred in a w × h box (with `pad` cells of margin). */
function fitView(w: number, h: number, cols: number, rows: number, pad = 0): View {
  const cell = Math.min(w / (cols + pad), h / (rows + pad));
  return { width: w, height: h, cell, ox: (w - cols * cell) / 2, oy: (h - rows * cell) / 2 };
}

/** A board with the given live cells: [x, y, colony]. */
function scene(cols: number, rows: number, cells: readonly (readonly [number, number, number])[]): Life {
  const life = new Life(cols, rows);
  for (const [x, y, c] of cells) life.setCell(y * cols + x, c);
  return life;
}

function look(host: DemoHost, over: Partial<Look> = {}): Look {
  return { style: host.style(), mode: 'colonies', critters: false, stickiness: 50, melt: 0, gaps: 50, wrap: false, ...over };
}

function label(ctx: CanvasRenderingContext2D, pal: Palette, text: string, x: number, y: number): void {
  ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = pal.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------------------------------------
// Slider demos

interface SliderSpec {
  key: Exclude<DemoKey, 'rules'>;
  min: number;
  max: number;
  /** Whole steps only (an index into SPEED_STEPS, a dot count). */
  whole?: boolean;
  ends: [string, string];
  /** One full sweep, there and back, in ms. */
  period: number;
  badge(v: number): string;
  caption(v: number): string;
  draw(s: Surface, v: number, now: number, host: DemoHost): void;
}

const speedAt = (v: number) => SPEED_STEPS[Math.round(v)] ?? 1;
const speedCaption = (v: number) => {
  const s = speedAt(v);
  if (s < 1) return `<b>Slow motion.</b> One generation ${formatSpeed(s)}: time to watch each change.`;
  if (s === 1) return '<b>1 generation a second.</b> Easy to follow each step.';
  return s <= 10 ? `<b>${s} generations a second.</b> Easy to follow a pattern as it moves.` : `<b>${s} generations a second.</b> Patterns blur into motion.`;
};

/** A glider on a small wrapping board, stepping at the chosen speed, with a ruler of recent steps. */
function speedScene(): SliderSpec['draw'] {
  const cols = 16;
  const rows = 8;
  const life = scene(cols, rows, [[3, 2, 1], [4, 3, 1], [2, 4, 1], [3, 4, 1], [4, 4, 1]]);
  const glider: Rule = { born: new Set([3]), survive: new Set([2, 3]) };
  let last = 0;
  let ticks: number[] = [];
  return ({ ctx, w, h }, v, now, host) => {
    const interval = 1000 / speedAt(v);
    if (!last) last = now;
    if (now - last >= interval) {
      life.step(glider, true);
      last = now;
      ticks.push(now);
    }
    ticks = ticks.filter((t) => now - t < 3000);
    const t = host.reducedMotion() ? 1 : Math.min(1, (now - last) / Math.min(260, interval * 0.85));
    const pal = host.palette();
    renderer.draw(ctx, life, fitView(w, h - 34, cols, rows), pal, look(host, { wrap: true }), t, now);
    // A three-second ruler: one tick per generation, sliding left as it ages.
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, h - 34, w, 34);
    const y = h - 12;
    const x0 = 14;
    const x1 = w - 14;
    ctx.fillStyle = pal.line;
    ctx.fillRect(x0, y - 1, x1 - x0, 2);
    ctx.fillStyle = pal.fg;
    for (const tick of ticks) {
      const age = (now - tick) / 3000;
      ctx.globalAlpha = 1 - age;
      ctx.fillRect(x1 - age * (x1 - x0) - 1, y - 6, 2, 12);
    }
    ctx.globalAlpha = 1;
    label(ctx, pal, 'last 3 seconds', w / 2, y - 24);
  };
}

/** The board's speed and the lab preview's: the same steps and scene, the second with a note. */
function speedSpec(key: 'speed' | 'labSpeed', note?: string): SliderSpec {
  return {
    key, min: 0, max: SPEED_STEPS.length - 1, whole: true, ends: ['Every 3s', '30/s'], period: 12000,
    badge: (v) => formatSpeed(speedAt(v)),
    caption: (v) => speedCaption(v) + (note ? ` <span class="demo-note">${note}</span>` : ''),
    draw: speedScene(),
  };
}

const SLIDERS: Record<Exclude<DemoKey, 'rules'>, () => SliderSpec> = {
  stickiness: () => {
    const life = scene(12, 4, [[1, 1, 1], [2, 1, 1], [5, 1, 1], [6, 2, 1], [9, 1, 1], [10, 1, 1], [9, 2, 1], [10, 2, 1]]);
    return {
      key: 'stickiness', min: 0, max: 100, ends: ['Tight', 'Gloopy'], period: 9000,
      badge: (v) => `Stickiness ${Math.round(v)}`,
      caption: (v) => v < 30 ? '<b>Tight.</b> Side-by-side cells join with a thin neck, like beads on a string.'
        : v < 70 ? '<b>Soft.</b> Necks fill out, so neighbours read as one blob.'
          : '<b>Gloopy.</b> Thick necks, and diagonal cells lean toward each other. They never quite join, so patterns stay readable.',
      draw: ({ ctx, w, h }, v, now, host) => {
        const view = fitView(w, h, 12, 4, 0.5);
        const pal = host.palette();
        renderer.draw(ctx, life, view, pal, look(host, { style: 'goo', stickiness: v }), 1, now);
        const y = view.oy + 3.2 * view.cell;
        label(ctx, pal, 'side by side', view.ox + 2 * view.cell, y);
        label(ctx, pal, 'diagonal', view.ox + 6 * view.cell, y);
        label(ctx, pal, 'block', view.ox + 10 * view.cell, y);
      },
    };
  },
  melt: () => {
    const life = scene(7, 4, [[1, 1, 1], [2, 1, 1], [1, 2, 1], [3, 1, 5], [4, 1, 5], [4, 2, 5], [2, 2, 6], [3, 2, 6]]);
    return {
      key: 'melt', min: 0, max: 100, ends: ['Never', 'Freely'], period: 8000,
      badge: (v) => `Melt ${Math.round(v)}`,
      caption: (v) => v < 10 ? '<b>Separate.</b> Different colours never join: each keeps its own outline, even when touching.'
        : v < 60 ? '<b>Starting to join.</b> Colours reach for each other and blend where they meet.'
          : '<b>Freely.</b> Colours join as easily as one colour does, with a smooth blend across.',
      draw: ({ ctx, w, h }, v, now, host) => {
        renderer.draw(ctx, life, fitView(w, h, 7, 4, 0.5), host.palette(), look(host, { style: 'goo', melt: v, stickiness: host.value('stickiness') }), 1, now);
      },
    };
  },
  gaps: () => {
    const life = scene(8, 4, [[1, 1, 1], [2, 1, 5], [1, 2, 5], [2, 2, 1], [5, 1, 6], [6, 1, 1], [5, 2, 1], [6, 2, 6]]);
    return {
      key: 'gaps', min: 0, max: 100, ends: ['Closed', 'Wide'], period: 8000,
      badge: (v) => `Gaps ${Math.round(v)}`,
      caption: (v) => (v < 30 ? '<b>Closed.</b> Where four cells of mixed colours meet, the middle fills in solid.'
        : v < 65 ? '<b>Pinhole.</b> A small hole stays open where the colours meet.'
          : '<b>Wide.</b> The hole opens up, so mixed blocks look like lace.')
        + ' <span class="demo-note">Only where colours melt together.</span>',
      draw: ({ ctx, w, h }, v, now, host) => {
        const melt = Math.max(60, host.value('melt'));
        renderer.draw(ctx, life, fitView(w, h, 8, 4, 0.5), host.palette(), look(host, { style: 'goo', melt, gaps: v, stickiness: host.value('stickiness') }), 1, now);
      },
    };
  },
  density: () => {
    let life: Life | null = null;
    return {
      key: 'density', min: 12, max: 48, whole: true, ends: ['Chunky', 'Fine'], period: 9000,
      badge: (v) => `${Math.round(v)} dots across`,
      caption: (v) => v < 20 ? '<b>Few dots.</b> Big, chunky cells. Patterns fill the screen fast.'
        : v < 36 ? '<b>In between.</b> Room for a few patterns side by side.'
          : '<b>Many dots.</b> Tiny cells and lots of room for big patterns.',
      draw: ({ ctx, w, h }, v, now, host) => {
        // The box is the screen: more dots across means smaller cells; the glider stays five cells.
        const cols = Math.round(v);
        const rows = Math.max(3, Math.ceil(h / (w / cols)));
        if (!life || life.cols !== cols || life.rows !== rows) {
          const x = Math.floor(cols / 2) - 1;
          const y = Math.floor(rows / 2) - 1;
          life = scene(cols, rows, [[x + 1, y, 1], [x + 2, y + 1, 1], [x, y + 2, 1], [x + 1, y + 2, 1], [x + 2, y + 2, 1]]);
        }
        const cell = w / cols;
        renderer.draw(ctx, life, { width: w, height: h, cell, ox: 0, oy: (h - rows * cell) / 2 }, host.palette(), look(host), 1, now);
      },
    };
  },
  speed: () => speedSpec('speed'),
  labSpeed: () => speedSpec('labSpeed', 'Only the preview: the board keeps its own speed.'),
  brush: () => {
    const cols = 22;
    const rows = 11;
    const life = new Life(cols, rows);
    return {
      key: 'brush', min: 1, max: 7, whole: true, ends: ['1 dot', '7 dots'], period: 9000,
      badge: (v) => (Math.round(v) === 1 ? '1 dot wide' : `${Math.round(v)} dots wide`),
      caption: (v) => {
        const n = Math.round(v);
        return n === 1 ? '<b>1 dot.</b> Place single cells exactly, for building patterns by hand.'
          : n < 5 ? `<b>${n} dots wide.</b> A soft round brush for quick shapes.` : `<b>${n} dots wide.</b> Paint big areas and let them break apart.`;
      },
      draw: ({ ctx, w, h }, v, now, host) => {
        // A stroke drawn along a wave over four seconds, then wiped and drawn again.
        const n = Math.round(v);
        const t = (now % 4000) / 4000;
        const at = (u: number): Point => ({ x: 3 + u * (cols - 6), y: rows / 2 + Math.sin(u * Math.PI * 2) * 2.4 });
        life.clear();
        for (let k = 0; k <= 60; k++) for (const i of brushCells(at((k / 60) * t), n, cols, rows, false)) life.setCell(i, 1);
        const p = at(t);
        renderer.brushRing = { x: p.x, y: p.y, size: n, colour: host.palette().cells[0]! };
        renderer.draw(ctx, life, fitView(w, h, cols, rows), host.palette(), look(host), 1, now);
        renderer.brushRing = null;
      },
    };
  },
};

class SliderDemo implements Demo {
  readonly el: HTMLElement;
  readonly title: string;
  private readonly canvas: HTMLCanvasElement;
  private readonly input: HTMLInputElement;
  private readonly autoBtn: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly cap: HTMLElement;
  private readonly yours: HTMLElement;
  private auto = true;
  private t0 = 0;
  private value: number;
  private lastCaption = '';

  constructor(private readonly spec: SliderSpec, private readonly host: DemoHost) {
    this.title = DEMO_TITLES[spec.key];
    this.el = document.createElement('div');
    this.el.className = 'demo';
    this.el.innerHTML = `
      <div class="demo-stage"><canvas aria-hidden="true"></canvas><span class="demo-badge"></span>
        <button type="button" class="demo-auto" hidden>${ICON_PLAY}Auto</button></div>
      <div class="demo-scrub"><span class="demo-yours">yours</span>
        <input type="range" min="${spec.min}" max="${spec.max}" step="${spec.whole ? 1 : 'any'}" aria-label="Try ${this.title.toLowerCase()}">
        <div class="demo-ends"><span>${spec.ends[0]}</span><span>${spec.ends[1]}</span></div></div>
      <p class="demo-cap" aria-live="polite"></p>`;
    const q = <T extends Element>(s: string) => this.el.querySelector<T>(s)!;
    this.canvas = q('canvas');
    this.input = q('input');
    this.autoBtn = q('.demo-auto');
    this.badge = q('.demo-badge');
    this.cap = q('.demo-cap');
    this.yours = q('.demo-yours');
    this.value = host.value(spec.key);
    this.input.addEventListener('input', () => {
      this.setAuto(false);
      this.value = Number(this.input.value);
    });
    this.autoBtn.addEventListener('click', () => this.setAuto(true));
  }

  shown(): void {
    // Start from the player's own setting, sweeping from there.
    const yours = this.host.value(this.spec.key);
    const { min, max } = this.spec;
    this.yours.style.left = `${((yours - min) / (max - min)) * 100}%`;
    this.value = yours;
    this.input.value = String(yours);
    this.setAuto(!this.host.reducedMotion());
  }

  private setAuto(on: boolean): void {
    this.auto = on;
    this.autoBtn.hidden = on;
    if (on) {
      // Pick the point in the sweep that matches the current value, so it carries on smoothly.
      const { min, max, period } = this.spec;
      const u = clamp((this.value - min) / (max - min), 0, 1);
      this.t0 = performance.now() - (Math.acos(1 - 2 * u) / (2 * Math.PI)) * period;
    }
  }

  tick(now: number): void {
    const { min, max, period, whole } = this.spec;
    if (this.auto) {
      const p = ((now - this.t0) % period) / period;
      const v = min + (max - min) * (0.5 - 0.5 * Math.cos(p * 2 * Math.PI));
      this.value = whole ? Math.round(v) : v;
      this.input.value = String(this.value);
    }
    const s = surface(this.canvas);
    if (s) this.spec.draw(s, this.value, now, this.host);
    this.badge.textContent = this.spec.badge(this.value);
    const html = this.spec.caption(this.value);
    if (html !== this.lastCaption) this.cap.innerHTML = this.lastCaption = html;
  }
}

// ---------------------------------------------------------------------------------------------
// The rules player

type StepKey = 'board' | 'focus' | 'count' | 'born' | 'survive' | 'next';

/** The mark on a cell about to die. Red reads as "gone" in every theme, so it isn't a palette colour. */
const DEATH_MARK = '#D9443A';

/**
 * How many of each spot's eight neighbours are alive, with spots past the edge counting as empty,
 * and what each spot becomes under `rule`. The same sums Life.step does without wrapping, kept
 * apart here because the player shows them.
 */
export function generation(cells: ArrayLike<number>, cols: number, rows: number, rule: Rule): { counts: Uint8Array; next: Uint8Array } {
  const counts = new Uint8Array(cols * rows);
  const next = new Uint8Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if ((dx || dy) && xx >= 0 && yy >= 0 && xx < cols && yy < rows && cells[yy * cols + xx]) n++;
        }
      }
      const i = y * cols + x;
      counts[i] = n;
      next[i] = cells[i] ? (rule.survive.has(n) ? 1 : 0) : (rule.born.has(n) ? 1 : 0);
    }
  }
  return { counts, next };
}

/** "3", "2 or 3", "3, 6 or 7", "nothing". */
export function countList(set: ReadonlySet<number>): string {
  const xs = [...set].sort((a, b) => a - b).map(String);
  if (!xs.length) return 'nothing';
  return xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;
}

const STEPS: readonly { key: StepKey; ms: number; name: string; text: (r: Rule) => string }[] = [
  { key: 'board', ms: 1800, name: 'The board', text: () => 'Each spot is alive (a cell) or empty.' },
  { key: 'focus', ms: 3600, name: 'Count', text: () => 'Take one spot and count how many of its eight neighbours are alive.' },
  { key: 'count', ms: 2400, name: 'Count every spot', text: () => 'Every spot does the same count, at the same moment.' },
  { key: 'born', ms: 2800, name: 'Born with', text: (r) => r.born.size ? `Empty spots with a count of ${countList(r.born)} get a new cell.` : 'Born with is empty, so no new cells appear.' },
  { key: 'survive', ms: 2800, name: 'Survives with', text: (r) => r.survive.size ? `Living cells with a count of ${countList(r.survive)} stay. Every other cell dies.` : 'Survives with is empty, so every living cell dies.' },
  { key: 'next', ms: 1800, name: 'Next generation', text: () => 'All the changes happen at once. That is one generation.' },
];

const PLAYER_COLS = 9;
const PLAYER_ROWS = 7;
/** Start again after this many generations, so a glider doesn't just leave. */
const PLAYER_GENS = 8;
const SCENES: Record<string, readonly (readonly [number, number])[] | null> = {
  Blinker: [[3, 3], [4, 3], [5, 3]],
  Glider: [[2, 1], [3, 2], [1, 3], [2, 3], [3, 3]],
  Random: null,
};

class RulesPlayer implements Demo {
  readonly el: HTMLElement;
  readonly title = DEMO_TITLES.rules;
  private readonly canvas: HTMLCanvasElement;
  private life = new Life(PLAYER_COLS, PLAYER_ROWS);
  private born = new Set<number>();
  private survive = new Set<number>();
  private sceneName = 'Blinker';
  /** Per spot: live neighbours, and what it becomes next generation (see `generation`). */
  private counts: Uint8Array = new Uint8Array(0);
  private nextCells: Uint8Array = new Uint8Array(0);
  private focus = 0;
  private gens = 0;
  private step = 0;
  /** 0 → 1 through the current step. */
  private t = 0;
  private playing = true;
  private last = 0;
  /** Whether the board has been advanced for the current "next" step. */
  private stepped = false;

  constructor(private readonly host: DemoHost) {
    this.el = document.createElement('div');
    this.el.className = 'demo';
    const chips = (which: 'born' | 'survive') => Array.from({ length: 9 }, (_, n) =>
      `<button type="button" class="count-btn" data-n="${n}" aria-pressed="false"${which === 'born' && n === 0 ? ' disabled' : ''} aria-label="${which === 'born' ? 'Born with' : 'Survives with'} ${n}">${n}</button>`).join('');
    this.el.innerHTML = `
      <div class="demo-stage demo-stage-tall"><canvas aria-hidden="true"></canvas><span class="demo-badge">Gen 0</span></div>
      <div class="demo-steps">${STEPS.map((s, i) => `<button type="button" data-step="${i}" aria-label="Step ${i + 1}: ${s.name}"><i></i></button>`).join('')}</div>
      <div class="demo-step-cap" aria-live="polite"><span class="demo-step-n"></span><span class="demo-step-t"></span></div>
      <div class="demo-controls">
        <button type="button" class="ib" data-act="prev" aria-label="Previous step">${ICON_PREV}</button>
        <button type="button" class="ib demo-play" data-act="play" aria-label="Pause"></button>
        <button type="button" class="ib" data-act="next" aria-label="Next step">${ICON_NEXT}</button>
        <div class="demo-scenes">${Object.keys(SCENES).map((k) => `<button type="button" data-scene="${k}">${k}</button>`).join('')}</div>
      </div>
      <div class="demo-rule">
        <span class="demo-rule-lbl">Born with</span><div class="counts born" data-which="born">${chips('born')}</div>
        <span class="demo-rule-lbl">Survives with</span><div class="counts" data-which="survive">${chips('survive')}</div>
      </div>
      <p class="demo-note">Try the numbers here: the next steps show what changes. Your rule in the lab stays as it is.</p>`;
    this.canvas = this.el.querySelector('canvas')!;
    this.el.addEventListener('click', (e) => this.onClick(e));
  }

  shown(start?: string): void {
    const r = this.host.rule();
    this.born = new Set(r.born);
    this.survive = new Set(r.survive);
    this.load();
    this.playing = !this.host.reducedMotion();
    this.goto(Math.max(0, STEPS.findIndex((s) => s.key === start)));
    this.last = performance.now();
  }

  private get rule(): Rule { return { born: this.born, survive: this.survive }; }

  private load(): void {
    const cells = SCENES[this.sceneName];
    this.life = new Life(PLAYER_COLS, PLAYER_ROWS);
    if (cells) for (const [x, y] of cells) this.life.setCell(y * PLAYER_COLS + x, 1);
    else for (let i = 0; i < PLAYER_COLS * PLAYER_ROWS; i++) if (Math.random() < 0.3) this.life.setCell(i, 1);
    this.gens = 0;
    this.compute();
  }

  /** Counts and the coming generation for the board as it stands. */
  private compute(): void {
    const { cols, rows, cur } = this.life;
    ({ counts: this.counts, next: this.nextCells } = generation(cur, cols, rows, this.rule));
    // The spot counted by hand: one about to be born if there is one, else a living cell.
    let f = this.nextCells.findIndex((v, i) => v > 0 && !cur[i]);
    if (f < 0) f = cur.findIndex((v) => v > 0);
    this.focus = f < 0 ? Math.floor(cols * rows / 2) : f;
  }

  /** Move on to the next generation, starting over when the board empties or has run a while. */
  private advance(): void {
    if (!this.stepped) this.life.step(this.rule, false);
    this.stepped = false;
    this.gens++;
    if (!this.life.population() || this.gens >= PLAYER_GENS) this.load();
    else {
      // The change has played: settle the picture before counting again.
      this.life.prev.set(this.life.cur);
      this.compute();
    }
  }

  private goto(i: number): void {
    this.step = (i + STEPS.length) % STEPS.length;
    this.t = 0;
    this.sync();
  }

  private forward(): void {
    if (STEPS[this.step]!.key === 'next') this.advance();
    this.goto(this.step + 1);
  }

  private onClick(e: Event): void {
    const b = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!b) return;
    const { act, step, scene: name, n } = b.dataset;
    if (act === 'play') {
      this.playing = !this.playing;
      this.last = performance.now();
    } else if (act === 'next') {
      this.playing = false;
      this.forward();
    } else if (act === 'prev') {
      this.playing = false;
      if (STEPS[this.step]!.key === 'next' && this.stepped) this.undoStep();
      this.goto(Math.max(0, this.step - 1));
    } else if (step !== undefined) {
      this.playing = false;
      if (this.stepped) this.undoStep();
      this.goto(Number(step));
    } else if (name) {
      this.sceneName = name;
      this.load();
      this.goto(0);
    } else if (n !== undefined && !b.disabled) {
      const set = b.closest<HTMLElement>('[data-which]')!.dataset.which === 'born' ? this.born : this.survive;
      const k = Number(n);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      if (this.stepped) this.undoStep();
      this.compute();
    }
    this.sync();
  }

  /** Put back the board as it was before the "next" step changed it. */
  private undoStep(): void {
    this.life.cur.set(this.life.prev);
    this.stepped = false;
  }

  private sync(): void {
    const s = STEPS[this.step]!;
    this.el.querySelector('.demo-step-n')!.textContent = `Step ${this.step + 1} of ${STEPS.length} · ${s.name}`;
    this.el.querySelector('.demo-step-t')!.textContent = s.text(this.rule);
    this.el.querySelectorAll<HTMLElement>('[data-step] i').forEach((bar, i) => { bar.style.width = i < this.step ? '100%' : i > this.step ? '0' : bar.style.width; });
    const play = this.el.querySelector('[data-act="play"]')!;
    play.innerHTML = this.playing ? ICON_PAUSE : ICON_PLAY;
    play.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-n]')) {
      const set = b.closest<HTMLElement>('[data-which]')!.dataset.which === 'born' ? this.born : this.survive;
      b.setAttribute('aria-pressed', String(set.has(Number(b.dataset.n))));
    }
    for (const b of this.el.querySelectorAll<HTMLElement>('[data-scene]')) b.setAttribute('aria-pressed', String(b.dataset.scene === this.sceneName));
    this.el.querySelector('.demo-badge')!.textContent = `Gen ${this.gens}`;
  }

  tick(now: number): void {
    const dt = Math.min(100, now - (this.last || now));
    this.last = now;
    const s = STEPS[this.step]!;
    if (this.playing) {
      this.t += dt / s.ms;
      if (this.t >= 1) {
        this.forward();
        return;
      }
    } else {
      // A step chosen by hand still plays its animation, quickly.
      this.t = Math.min(1, this.t + dt / 600);
    }
    const bar = this.el.querySelectorAll<HTMLElement>('[data-step] i')[this.step];
    if (bar) bar.style.width = `${(this.playing ? this.t : 1) * 100}%`;
    if (s.key === 'next' && !this.stepped) {
      this.life.step(this.rule, false);
      this.stepped = true;
    }
    this.draw(now, s.key);
  }

  private draw(now: number, key: StepKey): void {
    const sf = surface(this.canvas);
    if (!sf) return;
    const { ctx, w, h } = sf;
    const pal = this.host.palette();
    const view = fitView(w, h, PLAYER_COLS, PLAYER_ROWS);
    const { cell, ox, oy } = view;
    const t = clamp(this.t, 0, 1);
    const e = ease(Math.min(1, t * 1.6));
    const reduce = this.host.reducedMotion();
    renderer.draw(ctx, this.life, view, pal, look(this.host), key === 'next' ? (reduce ? 1 : e) : 1, now);
    if (key === 'next' || key === 'board') return;

    const cur = this.life.cur;
    const R = cell * 0.44;
    const cx = (i: number) => ox + ((i % PLAYER_COLS) + 0.5) * cell;
    const cy = (i: number) => oy + (Math.floor(i / PLAYER_COLS) + 0.5) * cell;
    const ring = (i: number, colour: string, dashed: boolean, width: number, r = R) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.setLineDash(dashed ? [4, 3] : []);
      ctx.beginPath();
      ctx.arc(cx(i), cy(i), r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const num = (i: number, n: number, colour: string, alpha = 1, size = 0.42) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colour;
      ctx.font = `600 ${Math.round(cell * size)}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n), cx(i), cy(i) + 1);
      ctx.globalAlpha = 1;
    };

    if (key === 'focus') {
      const f = this.focus;
      const fx = f % PLAYER_COLS;
      const fy = Math.floor(f / PLAYER_COLS);
      // Veil everything outside the 3×3 neighbourhood, then outline it.
      const bx = ox + (fx - 1) * cell + 2;
      const by = oy + (fy - 1) * cell + 2;
      const bs = cell * 3 - 4;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.roundRect(bx, by, bs, bs, cell * 0.4);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = pal.bg;
      ctx.fill('evenodd');
      ctx.restore();
      ctx.strokeStyle = pal.fg;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.roundRect(bx, by, bs, bs, cell * 0.4);
      ctx.stroke();
      ctx.setLineDash([]);
      // Neighbours light up one at a time, clockwise from the top left; the count ticks up.
      const order = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]] as const;
      const progress = clamp((t - 0.12) / 0.7, 0, 1) * 8;
      const shown = reduce ? 8 : Math.floor(progress + 0.999);
      let n = 0;
      order.forEach(([dx, dy], k) => {
        const x = fx + dx;
        const y = fy + dy;
        if (k >= shown || x < 0 || y < 0 || x >= PLAYER_COLS || y >= PLAYER_ROWS) return;
        const j = y * PLAYER_COLS + x;
        if (cur[j]) {
          n++;
          ring(j, pal.fg, false, 2.5, R + 2);
          if (k === shown - 1 && !reduce) {
            ctx.globalAlpha = 1 - (progress % 1) * 0.6;
            label(ctx, pal, '+1', cx(j), cy(j) - R - 15);
            ctx.globalAlpha = 1;
          }
        } else {
          ring(j, pal.muted, true, 1.5, R * 0.55);
        }
      });
      ring(f, pal.fg, !cur[f], 2.5, R + 3);
      num(f, n, cur[f] ? pal.panel : pal.fg, 1, 0.5);
      return;
    }

    for (let i = 0; i < cur.length; i++) {
      const n = this.counts[i]!;
      const alive = cur[i]! > 0;
      if (key === 'count') {
        const appear = reduce ? 1 : clamp(t * 2.2 - Math.floor(i / PLAYER_COLS) * 0.12, 0, 1);
        if (appear && (n || alive)) num(i, n, alive ? pal.panel : pal.fg, appear * (n ? 1 : 0.5));
      } else if (key === 'born') {
        if (!alive && this.born.has(n)) {
          ctx.globalAlpha = 0.3 * e;
          ctx.fillStyle = pal.cells[0]!;
          ctx.beginPath();
          ctx.arc(cx(i), cy(i), R * (0.6 + (reduce ? 0 : 0.12 * Math.sin(now / 220))), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ring(i, pal.accent, true, 2.5);
          num(i, n, pal.fg);
        } else if (!alive && n) num(i, n, pal.muted, 0.35);
        else if (alive) num(i, n, pal.panel, 0.7);
      } else if (key === 'survive') {
        if (alive && this.survive.has(n)) {
          ring(i, pal.fg, false, 2.5, R + 2);
          num(i, n, pal.panel);
        } else if (alive) {
          num(i, n, pal.panel, 0.9);
          const d = R * 0.7;
          ctx.globalAlpha = e;
          ctx.strokeStyle = DEATH_MARK;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx(i) - d, cy(i) - d);
          ctx.lineTo(cx(i) + d, cy(i) + d);
          ctx.moveTo(cx(i) + d, cy(i) - d);
          ctx.lineTo(cx(i) - d, cy(i) + d);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else if (this.born.has(n)) {
          ring(i, pal.accent, true, 2, R * 0.7);
        }
      }
    }
  }
}

export function createDemo(key: DemoKey, host: DemoHost): Demo {
  return key === 'rules' ? new RulesPlayer(host) : new SliderDemo(SLIDERS[key](), host);
}
