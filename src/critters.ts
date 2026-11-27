import type { Life } from './life';

/**
 * Critters: some long-lived cells open an eye, and the eye has a little life of its own. It glances
 * around, blinks, follows the pointer, flinches when a neighbour dies, squints happily when one is
 * born, and slowly dozes off as the cell gets old. Still 2×2 blocks get a pair of eyes.
 *
 * Eyes run on wall-clock time, not on generations, so they stay alive when the board is paused or slow.
 * The eye has no visible rim: its lids are filled in the cell's own colour and clipped to the eye, so a
 * blink or a closed eye melts into the blob.
 */

const TAU = Math.PI * 2;
export const ABUNDANCE_MIN = 0;
export const ABUNDANCE_MAX = 100;
export const DEFAULT_ABUNDANCE = 60;

export interface CritterOdds {
  /** A cell must have been alive this many generations before it can open an eye. */
  age: number;
  /** Share of qualifying cells that open an eye, and of qualifying still blocks that get a face. */
  single: number;
  pair: number;
}

/**
 * How readily critters appear, from the 0–100 abundance setting. More abundant critters need less
 * stability: at the top a cell only has to survive a few generations, so eyes show up in busy,
 * chaotic regions too, not just on still lifes.
 */
export function critterOdds(abundance: number): CritterOdds {
  const e = Math.max(0, Math.min(1, abundance / 100));
  return {
    age: Math.round(36 - 33 * e),
    single: 0.03 + 0.62 * e,
    pair: Math.min(1, 0.15 + 0.85 * e),
  };
}
/** The age a cell needs at the default abundance. */
export const CRITTER_AGE = critterOdds(DEFAULT_ABUNDANCE).age;
/** Eye radius (lids included), as a fraction of a cell. Cells are drawn at 0.47. */
const EYE = 0.437;
const EYE_MAX = 0.46;
/** The white, as a fraction of the eye. */
const WHITE = 0.78;
const PUPIL = 0.146;

/** A stable pseudo-random number in [0, 1) for a grid position, so a critter keeps its traits. */
export function positionHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------------------------
// Traits

export interface Traits {
  /** Eye size and pupil size, relative to the classic eye. */
  size: number;
  pupil: number;
  /** How far the upper lid hangs at rest, 0 (open) to 1. */
  lidRest: number;
  /** A coloured iris around the pupil. */
  iris: boolean;
  /** Looks away from the pointer instead of at it, and down more often. */
  shy: boolean;
  /** Multipliers on how often it glances around and blinks. */
  saccade: number;
  blink: number;
}

const CLASSIC: Traits = { size: 1, pupil: 1, lidRest: 0, iris: false, shy: false, saccade: 1, blink: 1 };
export const TRAITS = {
  classic: CLASSIC,
  wide: { ...CLASSIC, size: 1.22, pupil: 1.18, saccade: 0.8 },
  beady: { ...CLASSIC, size: 0.82, pupil: 0.72, saccade: 1.5 },
  heavy: { ...CLASSIC, pupil: 1.05, lidRest: 0.38, saccade: 0.6, blink: 0.7 },
  tinted: { ...CLASSIC, size: 1.05, pupil: 0.78, iris: true },
  shy: { ...CLASSIC, size: 0.95, lidRest: 0.12, shy: true },
  pair: { ...CLASSIC, size: 0.82 },
} satisfies Record<string, Traits>;

export type TraitName = keyof typeof TRAITS;

function traitsAt(x: number, y: number): TraitName {
  const r = positionHash(x + 31, y + 17);
  return r < 0.38 ? 'classic' : r < 0.52 ? 'wide' : r < 0.66 ? 'beady' : r < 0.78 ? 'heavy' : r < 0.9 ? 'tinted' : 'shy';
}

// ---------------------------------------------------------------------------------------------
// Where critters are

export interface Spot {
  /** Stable id: the cell index for a single eye, minus (index + 1) of the top-left cell for a pair. */
  key: number;
  kind: 'single' | 'pair';
  /** The cells it sits on. */
  cells: number[];
  /** Centre, in grid units (cell (0, 0) spans 0..1). */
  x: number;
  y: number;
  traits: TraitName;
}

/**
 * Which cells have a critter right now. Fixed by position, so eyes don't flicker. Pairs only in the
 * goo style, where a block is drawn as one solid blob.
 */
export function findSpots(life: Life, pairs: boolean, odds: CritterOdds = critterOdds(DEFAULT_ABUNDANCE)): Spot[] {
  const { cols, rows, cur, prev, ages } = life;
  const ok = (i: number) => cur[i]! > 0 && prev[i]! > 0 && ages[i]! >= odds.age;
  const spots: Spot[] = [];
  const used = new Uint8Array(cols * rows);
  if (pairs) {
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const i = y * cols + x;
        // Cheap checks first: this runs every frame, over every cell.
        if (!ok(i) || used[i] || positionHash(x, y + 99) >= odds.pair) continue;
        const cells = [i, i + 1, i + cols, i + cols + 1];
        if (!cells.every((j) => ok(j) && !used[j] && cur[j] === cur[i])) continue;
        for (const j of cells) used[j] = 1;
        spots.push({ key: -(i + 1), kind: 'pair', cells, x: x + 1, y: y + 1, traits: 'pair' });
      }
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (used[i] || !ok(i) || positionHash(x, y) >= odds.single) continue;
      spots.push({ key: i, kind: 'single', cells: [i], x: x + 0.5, y: y + 0.5, traits: traitsAt(x, y) });
    }
  }
  return spots;
}

// ---------------------------------------------------------------------------------------------
// Colour

const creaseCache = new Map<string, string>();
/**
 * The line drawn where a closed eye's lids meet: the cell's colour, deeper (or lighter on near-black
 * cells), so a sleeping eye still shows. Expects #RRGGBB.
 */
export function creaseColour(hex: string): string {
  const cached = creaseCache.get(hex);
  if (cached) return cached;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0, s = 0, l = (max + min) / 2;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  if (l < 0.22) l = Math.min(1, l + 0.26);
  else { l = Math.max(0.08, l * 0.62); s = Math.min(1, s * 1.08); }
  const out = `hsl(${h.toFixed(0)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;
  creaseCache.set(hex, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// One eye

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (u: number) => { const v = 1 - clamp(u, 0, 1); return 1 - v * v * v; };

export interface Vec { x: number; y: number }
export interface EyeInput {
  /** Something to look at, as a direction (length up to 1). */
  attention?: Vec | null;
  /** Another critter to glance at now and then, as a unit direction. */
  peer?: Vec | null;
  /** The pointer is right on it. */
  squint?: boolean;
  /** Reduced motion: blink only. */
  calm?: boolean;
}

type Mood = 'idle' | 'startled' | 'happy';

export class Eye {
  readonly t: Traits;
  /** Gaze (unit disc), its velocity and target. */
  private gx = 0; private gy = 0; private vx = 0; private vy = 0; private tx = 0; private ty = 0;
  private nextSaccade = rand(0.2, 1.2);
  private nextBlink = rand(0.8, 4);
  private blinkT = -1; private blinkDur = 0.17; private pendingDouble = false; private gap = 0;
  private blinkAmt = 0;
  /** Opening when it first appears: a spring that overshoots a little. */
  private open = 0; private openV = 0;
  private lidU = 1; private lidL = 0;
  private widen = 0; private dilate = 1;
  private mood: Mood = 'idle'; private moodT = 0;
  asleep = false;
  sleepiness = 0;
  private time = 0;
  private readonly phase = Math.random() * 10;

  constructor(traits: Traits) { this.t = traits; }

  /** Seconds this eye has been running. */
  get clock(): number { return this.time; }

  blink(dur = 0.17, double = false): void {
    if (this.blinkT >= 0 || this.gap > 0) return;
    this.blinkT = 0;
    this.blinkDur = dur;
    this.pendingDouble = double;
  }

  lookAt(dx: number, dy: number, hold = 1): void {
    const m = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, m) / m;
    this.tx = dx * k;
    this.ty = dy * k;
    this.nextSaccade = hold;
  }

  startle(dx = 0, dy = 0): void {
    this.mood = 'startled';
    this.moodT = 0.9;
    this.lookAt(dx, dy, 1.2);
  }

  delight(): void {
    if (this.mood === 'startled') return;
    this.mood = 'happy';
    this.moodT = 1.1;
  }

  wake(): void {
    if (!this.asleep) return;
    this.asleep = false;
    this.sleepiness = 0;
    this.blink(0.12, true);
  }

  update(dt: number, input: EyeInput = {}): void {
    this.time += dt;
    const T = this.t;
    const calm = !!input.calm;

    this.openV += (120 * (1 - this.open) - 11 * this.openV) * dt;
    this.open += this.openV * dt;

    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0) this.mood = 'idle';
    }

    let att = input.attention ?? null;
    if (att && T.shy) att = { x: -att.x * 0.9, y: Math.abs(att.y) * 0.4 + 0.5 };
    if (calm) {
      this.tx = 0;
      this.ty = 0;
    } else if (!this.asleep) {
      if (att) {
        this.tx = clamp(att.x, -1, 1);
        this.ty = clamp(att.y, -1, 1);
        this.nextSaccade = rand(0.3, 0.9);
      } else {
        this.nextSaccade -= dt * T.saccade;
        if (this.nextSaccade <= 0) this.saccade(input.peer ?? null);
      }
    }

    // Gaze: a fast, slightly underdamped spring, so a glance darts and settles.
    const k = this.asleep ? 20 : 340;
    const damp = 2 * Math.sqrt(k) * 0.72;
    this.vx += (k * (this.tx - this.gx) - damp * this.vx) * dt;
    this.vy += (k * (this.ty - this.gy) - damp * this.vy) * dt;
    this.gx += this.vx * dt;
    this.gy += this.vy * dt;
    const gm = Math.hypot(this.gx, this.gy);
    if (gm > 1) { this.gx /= gm; this.gy /= gm; }

    if (!this.asleep) {
      this.nextBlink -= dt * T.blink;
      if (this.nextBlink <= 0) {
        const slow = this.sleepiness > 0.4 && Math.random() < 0.5;
        this.blink(slow ? 0.5 : 0.17, !slow && Math.random() < 0.22);
        this.nextBlink = rand(2.2, 6);
      }
    }
    this.stepBlink(dt);

    let upper = T.lidRest + this.sleepiness * 0.55;
    let lower = 0;
    if (this.mood === 'happy' || input.squint) { upper = 0.18; lower = 0.48; }
    if (this.mood === 'startled') upper = 0;
    if (this.asleep) { upper = 1; lower = 0; }
    const ls = 1 - Math.exp(-dt * (this.asleep ? 4 : 18));
    this.lidU += (upper - this.lidU) * ls;
    this.lidL += (lower - this.lidL) * ls;

    const wide = this.mood === 'startled' ? 1 : 0;
    this.widen += (wide - this.widen) * (1 - Math.exp(-dt * (wide ? 30 : 6)));
    const pupil = (this.mood === 'startled' ? 0.62 : this.mood === 'happy' ? 1.15 : 1) * (1 + 0.05 * Math.sin(this.time * 0.9 + this.phase));
    this.dilate += (pupil - this.dilate) * (1 - Math.exp(-dt * 8));
  }

  private saccade(peer: Vec | null): void {
    const r = Math.random();
    if (r < 0.22) {
      this.tx = rand(-0.15, 0.15);
      this.ty = rand(-0.1, 0.1);
    } else if (peer && r < 0.45) {
      this.tx = peer.x;
      this.ty = peer.y;
    } else {
      const a = rand(0, TAU);
      const m = rand(0.45, 1);
      this.tx = Math.cos(a) * m;
      this.ty = Math.sin(a) * m * 0.7 + (this.t.shy ? 0.35 : 0);
    }
    this.nextSaccade = rand(0.5, 2.6) * (this.sleepiness > 0.3 ? 1.8 : 1);
    if (Math.random() < 0.18) this.blink();
  }

  /** Blink: close fast, hold a moment, open a little slower. A double blink waits a beat between. */
  private stepBlink(dt: number): void {
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const u = this.blinkT / this.blinkDur;
      this.blinkAmt = u < 0.38 ? Math.sin((u / 0.38) * Math.PI / 2) : u < 0.48 ? 1 : 1 - easeOut((u - 0.48) / 0.52);
      if (u >= 1) {
        this.blinkT = -1;
        this.blinkAmt = 0;
        if (this.pendingDouble) { this.pendingDouble = false; this.gap = 0.07; }
      }
    } else if (this.gap > 0) {
      this.gap -= dt;
      if (this.gap <= 0) { this.blinkT = 0; this.blinkDur = 0.15; }
    }
  }

  /**
   * Draw the eye centred at (cx, cy) on a cell of size `c`, in a cell coloured `skin`. `k` scales it
   * (the cell melting away) and `extraLid` closes it further (dying, or a wink).
   */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, c: number, skin: string, iris: string, k = 1, extraLid = 0): void {
    const T = this.t;
    const sc = T.size * k * (1 + 0.14 * this.widen) * (this.asleep ? 1 + 0.025 * Math.sin(this.time * 2.2 + this.phase) : 1);
    if (sc <= 0.02) return;
    const R = Math.min(c * EYE * sc, c * EYE_MAX * k * (1 + 0.06 * this.widen));
    const Rw = R * WHITE;
    const Rp = Math.min(c * PUPIL * sc * T.pupil * this.dilate, Rw * (T.iris ? 0.44 : 0.62));
    const lidU = clamp(Math.max(this.lidU, this.blinkAmt, 1 - this.open, extraLid), 0, 1);
    const lidL = clamp(this.lidL * (1 - this.blinkAmt), 0, 1 - lidU);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 1 - 0.07 * this.blinkAmt);

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, Rw, 0, TAU);
    ctx.fill();
    const reach = Rw - Rp * (T.iris ? 1.7 : 1) - c * 0.012;
    const px = this.gx * reach;
    const py = this.gy * reach;
    if (T.iris) {
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(px, py, Rp * 1.7, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#161616';
    ctx.beginPath();
    ctx.arc(px, py, Rp, 0, TAU);
    ctx.fill();

    if (lidU > 0.002 || lidL > 0.002) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R + 0.6, 0, TAU);
      ctx.clip();
      ctx.fillStyle = skin;
      const E = R + 2;
      if (lidU > 0.002) {
        // The lid's edge sags in the middle, like a real lid.
        const yc = -R + 2 * R * lidU;
        const sag = R * 0.5 * Math.sin(Math.PI * lidU);
        ctx.beginPath();
        ctx.moveTo(-E, -E); ctx.lineTo(E, -E); ctx.lineTo(E, yc - sag);
        ctx.quadraticCurveTo(0, yc + sag, -E, yc - sag);
        ctx.closePath();
        ctx.fill();
      }
      if (lidL > 0.002) {
        const yc = R - 2 * R * lidL;
        const sag = R * 0.55 * Math.sin(Math.PI * lidL);
        ctx.beginPath();
        ctx.moveTo(-E, E); ctx.lineTo(E, E); ctx.lineTo(E, yc + sag);
        ctx.quadraticCurveTo(0, yc - sag, -E, yc + sag);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      const shut = lidU + lidL;
      if (shut > 0.9) {
        ctx.globalAlpha = clamp((shut - 0.9) * 10, 0, 1) * 0.85;
        ctx.strokeStyle = creaseColour(skin);
        ctx.lineWidth = Math.max(1, c * 0.035 * k);
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (lidL > 0.2) {
          const yy = R - 2 * R * lidL - R * 0.1;
          ctx.moveTo(-R * 0.7, yy + R * 0.15);
          ctx.quadraticCurveTo(0, yy - R * 0.55, R * 0.7, yy + R * 0.15);
        } else {
          ctx.moveTo(-R * 0.72, -R * 0.05);
          ctx.quadraticCurveTo(0, R * 0.45, R * 0.72, -R * 0.05);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// All the critters on the board

interface Critter {
  spot: Spot;
  eye: Eye;
  /** Age (generations) at which it starts to doze. */
  sleepAge: number;
  /** Eye time until which it stays awake after being woken. */
  awakeUntil: number;
  /** Seconds until the next wink (pairs only); negative while winking. */
  winkT: number;
  /** Direction to the nearest other critter, if any is close. */
  peer: Vec | null;
  zTimer: number;
}

/**
 * Wake a critter (with a fluttery double blink if it was asleep) and keep it awake for `seconds`.
 * Without the hold, an old critter would nod straight back off on the next frame.
 */
function rouse(cr: Critter, seconds: number): void {
  cr.eye.wake();
  cr.awakeUntil = Math.max(cr.awakeUntil, cr.eye.clock + seconds);
}

interface Z { x: number; y: number; c: number; t: number; dx: number }

/** Where the grid sits, in canvas units. */
export interface Placement { cell: number; ox: number; oy: number }

export interface CritterFrame {
  life: Life;
  place: Placement;
  /** Wall-clock time in ms (requestAnimationFrame's timestamp). */
  now: number;
  /** Fill colour and drawn size (1 = full, less while melting) of cell i; only asked for live or melting cells. */
  skinOf: (i: number) => string;
  sizeOf: (i: number) => number;
  iris: string;
  /** Colour of the floating z's. */
  ink: string;
  pairs: boolean;
  /** How readily critters appear, 0–100 (see critterOdds). Defaults to DEFAULT_ABUNDANCE. */
  abundance?: number;
}

export class Critters {
  private critters = new Map<number, Critter>();
  private zs: Z[] = [];
  private lastGen = -1;
  private lastNow = -1;
  /** Pointer position in grid units, or null when it's off the board. */
  pointer: Vec | null = null;
  /** Reduced motion: eyes still blink but don't look around. */
  calm = false;

  /** True while anything is on screen that moves by itself, so the board keeps redrawing. */
  get active(): boolean {
    return this.critters.size > 0 || this.zs.length > 0;
  }

  /** The critters' eyes, for inspection. */
  eyes(): Eye[] {
    return [...this.critters.values()].map((cr) => cr.eye);
  }

  reset(): void {
    this.critters.clear();
    this.zs = [];
    this.lastGen = -1;
    this.lastNow = -1;
  }

  /** A tap at (x, y), in grid units: critters close by flinch, and sleepers nearby wake up. */
  poke(x: number, y: number): void {
    if (this.calm) return;
    for (const cr of this.critters.values()) {
      const dx = x - cr.spot.x, dy = y - cr.spot.y, d = Math.hypot(dx, dy);
      if (d < 5) rouse(cr, 6);
      if (d < 2.6) cr.eye.startle(dx, dy);
    }
  }

  draw(ctx: CanvasRenderingContext2D, f: CritterFrame): void {
    const dt = this.lastNow < 0 ? 0 : clamp((f.now - this.lastNow) / 1000, 0, 0.05);
    this.lastNow = f.now;
    const { life, place } = f;
    const { cur, ages } = life;
    const changed = life.gen !== this.lastGen;
    this.lastGen = life.gen;

    this.sync(life, f.pairs, critterOdds(f.abundance ?? DEFAULT_ABUNDANCE), changed);
    if (changed) this.react(life);

    const { cell: c, ox, oy } = place;
    for (const cr of this.critters.values()) {
      const { spot, eye } = cr;
      const lead = spot.cells[0]!;
      // Not every cell alive means it's melting away (sync keeps only those).
      const dying = !spot.cells.every((i) => cur[i]);

      if (!dying) {
        let attention: Vec | null = null;
        let squint = false;
        if (this.pointer && !this.calm) {
          const dx = this.pointer.x - spot.x, dy = this.pointer.y - spot.y, d = Math.hypot(dx, dy);
          if (d < 7) {
            attention = { x: dx / Math.max(d, 1.8), y: dy / Math.max(d, 1.8) };
            rouse(cr, 5);
          }
          if (d < 0.75 && !eye.t.shy) squint = true;
        }
        const awake = eye.clock < cr.awakeUntil;
        const over = (ages[lead] ?? 0) - cr.sleepAge;
        eye.sleepiness = awake || over <= -24 ? 0 : clamp(over / 60 + 0.4, 0, 1);
        if (!awake && over > 40) eye.asleep = true;
        eye.update(dt, { attention, squint, peer: cr.peer, calm: this.calm });
      } else {
        eye.update(dt, { calm: true });
      }

      // While melting, the eye shrinks with its cell and shuts a little ahead of it.
      const k = dying ? f.sizeOf(lead) : 1;
      const extraLid = dying ? clamp((1 - k) * 1.6, 0, 1) : 0;
      const skin = f.skinOf(lead);
      const cx = ox + spot.x * c;
      const cy = oy + spot.y * c;

      if (eye.asleep && !dying && !this.calm) {
        cr.zTimer -= dt;
        if (cr.zTimer < 0) {
          cr.zTimer = rand(1.8, 3);
          this.zs.push({ x: cx + c * 0.2, y: cy - c * 0.35, c, t: 0, dx: rand(0.2, 0.45) });
        }
      }

      if (spot.kind === 'pair') {
        let wink = 0;
        if (!this.calm && !eye.asleep && !dying) {
          cr.winkT -= dt;
          if (cr.winkT < 0) {
            wink = Math.sin(clamp(-cr.winkT / 0.35, 0, 1) * Math.PI);
            if (cr.winkT < -0.35) cr.winkT = rand(6, 14);
          }
        }
        eye.draw(ctx, cx - c * 0.5, cy - c * 0.08, c, skin, f.iris, k, extraLid);
        eye.draw(ctx, cx + c * 0.5, cy - c * 0.08, c, skin, f.iris, k, Math.max(extraLid, wink));
      } else {
        eye.draw(ctx, cx, cy, c, skin, f.iris, k, extraLid);
      }
    }
    this.drawZs(ctx, dt, f.ink);
  }

  /**
   * Match the critters to the board. New spots open an eye; a critter whose cell is melting away
   * stays (and closes) until the melt is done; anything else that no longer qualifies goes.
   */
  private sync(life: Life, pairs: boolean, odds: CritterOdds, changed: boolean): void {
    const spots = findSpots(life, pairs, odds);
    const seen = new Set<number>();
    for (const spot of spots) {
      seen.add(spot.key);
      const have = this.critters.get(spot.key);
      if (have) { have.spot = spot; continue; }
      const gx = Math.floor(spot.x), gy = Math.floor(spot.y);
      this.critters.set(spot.key, {
        spot,
        eye: new Eye(TRAITS[spot.traits]),
        sleepAge: 120 + positionHash(gx + 5, gy) * 260,
        awakeUntil: 0,
        winkT: rand(4, 10),
        peer: null,
        zTimer: rand(0.5, 2),
      });
    }
    const { cur, prev } = life;
    for (const [key, cr] of this.critters) {
      if (seen.has(key)) continue;
      // Out-of-range cells (after a resize) read as undefined, so those critters go too.
      const melting = cr.spot.cells.every((i) => prev[i]) && cr.spot.cells.some((i) => !cur[i]);
      if (!melting) this.critters.delete(key);
    }
    if (changed) this.findPeers();
  }

  private findPeers(): void {
    const list = [...this.critters.values()];
    for (const cr of list) {
      let best: Vec | null = null;
      let bestD = 9;
      for (const o of list) {
        if (o === cr) continue;
        const dx = o.spot.x - cr.spot.x, dy = o.spot.y - cr.spot.y, d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = { x: dx / d, y: dy / d }; }
      }
      cr.peer = best;
    }
  }

  /** Respond to the generation that just happened: births nearby draw a glance or a smile, deaths next door a flinch. */
  private react(life: Life): void {
    if (this.calm) return;
    const { cols, cur, prev } = life;
    const births: Vec[] = [];
    const deaths: Vec[] = [];
    for (let i = 0; i < cur.length; i++) {
      if (cur[i] && !prev[i]) births.push({ x: (i % cols) + 0.5, y: Math.floor(i / cols) + 0.5 });
      else if (prev[i] && !cur[i]) deaths.push({ x: (i % cols) + 0.5, y: Math.floor(i / cols) + 0.5 });
    }
    if (!births.length && !deaths.length) return;
    for (const cr of this.critters.values()) {
      const { eye, spot } = cr;
      if (!spot.cells.every((i) => cur[i])) continue;
      const reach = spot.kind === 'pair' ? 2.1 : 1.6;
      let startle: Vec | null = null;
      for (const d of deaths) {
        const dx = d.x - spot.x, dy = d.y - spot.y;
        if (Math.hypot(dx, dy) < reach) { startle = { x: dx, y: dy }; break; }
      }
      let near: Vec | null = null;
      let nd = Infinity;
      for (const b of births) {
        const dx = b.x - spot.x, dy = b.y - spot.y, d = Math.hypot(dx, dy);
        if (d < nd) { nd = d; near = { x: dx, y: dy }; }
      }
      if (startle && Math.random() < 0.7) {
        rouse(cr, 4);
        eye.startle(startle.x, startle.y);
      } else if (near && nd < reach + 0.3 && Math.random() < 0.5) {
        eye.delight();
      } else if (near && nd < 5 && !eye.asleep && Math.random() < 0.35) {
        eye.lookAt(near.x / 2, near.y / 2, rand(0.6, 1.2));
      }
    }
  }

  private drawZs(ctx: CanvasRenderingContext2D, dt: number, ink: string): void {
    if (!this.zs.length) return;
    this.zs = this.zs.filter((z) => (z.t += dt) < 2.2);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    for (const z of this.zs) {
      const u = z.t / 2.2;
      ctx.globalAlpha = Math.sin(u * Math.PI) * 0.7;
      ctx.font = `800 ${Math.round(z.c * (0.32 + u * 0.22))}px "Bricolage Grotesque", system-ui, sans-serif`;
      ctx.fillText('z', z.x + z.c * z.dx * u * 1.6 + Math.sin(u * 7) * z.c * 0.06, z.y - z.c * u * 1.3);
    }
    ctx.restore();
  }
}
