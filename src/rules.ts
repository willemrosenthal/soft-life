import { parseRule, type Rule } from './life';
import { readItem, writeItem } from './store';

/**
 * Named rules, the player's own saved rules, and the helpers behind the Rule lab: mutating a rule,
 * picking a surprise, and reading how a preview is getting on.
 */

export interface NamedRule {
  name: string;
  rule: string;
}

/** The rules offered in Settings. */
export const PRESETS: readonly NamedRule[] = [
  { name: "Conway's Life", rule: 'B3/S23' },
  { name: 'HighLife', rule: 'B36/S23' },
  { name: 'Day & Night', rule: 'B3678/S34678' },
  { name: 'Seeds', rule: 'B2/S' },
];

/** Known rules that do something worth watching: what "Surprise me" picks from. */
export const SURPRISES: readonly NamedRule[] = [
  ...PRESETS,
  { name: 'Maze', rule: 'B3/S12345' },
  { name: 'Coral', rule: 'B3/S45678' },
  { name: '2×2', rule: 'B36/S125' },
  { name: 'Move', rule: 'B368/S245' },
  { name: 'Diamoeba', rule: 'B35678/S5678' },
  { name: 'Amoeba', rule: 'B357/S1358' },
  { name: 'Anneal', rule: 'B4678/S35678' },
  { name: 'Long Life', rule: 'B345/S5' },
  { name: 'Walled Cities', rule: 'B45678/S2345' },
];

/** A rule written the one standard way, digits in order: "B36/S23". */
export function formatRule(rule: Rule): string {
  const digits = (s: ReadonlySet<number>) => [...s].sort((a, b) => a - b).join('');
  return `B${digits(rule.born)}/S${digits(rule.survive)}`;
}

/** Flip one or two neighbour counts, never switching on "born with 0". Returns a new rule. */
export function mutateRule(rule: Rule, random: () => number = Math.random): Rule {
  const born = new Set(rule.born);
  const survive = new Set(rule.survive);
  const flips = random() < 0.4 ? 2 : 1;
  for (let k = 0; k < flips; k++) {
    // 17 switches in all: born 1–8, then survive 0–8.
    const pick = Math.min(16, Math.floor(random() * 17));
    const [set, n] = pick < 8 ? [born, pick + 1] : [survive, pick - 8];
    if (set.has(n)) set.delete(n);
    else set.add(n);
  }
  return { born, survive };
}

/** A known rule other than the current one. */
export function pickSurprise(current: string, random: () => number = Math.random): NamedRule {
  const pool = SURPRISES.filter((r) => r.rule !== current);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!;
}

/** A repeatable random sequence, so a rule's thumbnail looks the same every time. */
export function seededRandom(text: string): () => number {
  let s = 2166136261;
  for (const ch of text) s = Math.imul(s ^ ch.charCodeAt(0), 16777619);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// How a preview is getting on

export type Trend = 'starting' | 'lively' | 'full' | 'settled' | 'dead';

export const TREND_LABELS: Record<Trend, string> = {
  starting: 'Starting',
  lively: 'Lively',
  full: 'Filling up',
  settled: 'Settled down',
  dead: 'Died out',
};

/** More than this share of cells alive reads as "filling up". */
const FULL = 0.55;
/** A board that repeats within this many generations has settled (still lifes, short oscillators). */
const PERIOD = 6;

/** Watches a board generation by generation and sums up what it's doing. */
export class TrendWatcher {
  private recent: number[] = [];

  reset(): void { this.recent = []; }

  /** Call once per generation with the current cells (0 = dead). */
  update(cells: ArrayLike<number>): Trend {
    let alive = 0;
    let hash = 2166136261;
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      alive++;
      hash = Math.imul(hash ^ i, 16777619);
    }
    const seen = this.recent.includes(hash);
    this.recent.push(hash);
    if (this.recent.length > PERIOD) this.recent.shift();
    if (alive === 0) return 'dead';
    if (alive / cells.length > FULL) return 'full';
    return seen ? 'settled' : 'lively';
  }
}

/**
 * Says when a preview has gone quiet long enough to start afresh: settled down, nearly empty or dead
 * for `patience` generations in a row. Previews that only show colours (the theme editor's) use it.
 */
export class QuietWatcher {
  private readonly trend = new TrendWatcher();
  private quiet = 0;

  constructor(private readonly patience = 12, private readonly sparse = 0.06) {}

  reset(): void {
    this.trend.reset();
    this.quiet = 0;
  }

  /** Call once per generation. True when it's time for new soup. */
  update(cells: ArrayLike<number>): boolean {
    const t = this.trend.update(cells);
    let alive = 0;
    for (let i = 0; i < cells.length; i++) if (cells[i]) alive++;
    this.quiet = t === 'settled' || t === 'dead' || alive < this.sparse * cells.length ? this.quiet + 1 : 0;
    return this.quiet >= this.patience;
  }
}

// ---------------------------------------------------------------------------------------------
// Saved rules

export interface SavedRule {
  id: string;
  name: string;
  rule: string;
}

export const NAME_MAX = 32;
const KEY = 'softlife:rules';

/** Saved data may be damaged or from an older version: keep the entries that still make sense. */
export function parseSavedRules(value: unknown): SavedRule[] {
  if (!Array.isArray(value)) return [];
  const out: SavedRule[] = [];
  const ids = new Set<string>();
  for (const v of value as unknown[]) {
    if (typeof v !== 'object' || v === null) continue;
    const { id, name, rule } = v as Record<string, unknown>;
    if (typeof id !== 'string' || !id || ids.has(id) || typeof name !== 'string' || typeof rule !== 'string') continue;
    const parsed = parseRule(rule);
    const trimmed = name.trim().slice(0, NAME_MAX);
    if (!parsed || !trimmed) continue;
    ids.add(id);
    out.push({ id, name: trimmed, rule: formatRule(parsed) });
  }
  return out;
}

/** Storage can be unavailable (private windows, blocked site data): then there are no saved rules. */
export function loadRules(): SavedRule[] {
  try {
    const raw = readItem(KEY);
    return parseSavedRules(raw ? JSON.parse(raw) : null);
  } catch {
    return [];
  }
}

export function saveRules(rules: readonly SavedRule[]): void {
  try {
    writeItem(KEY, JSON.stringify(rules));
  } catch {
    // Not kept; nothing else to do.
  }
}

/** "My rule 3": the first such name not already taken. */
export function nextRuleName(rules: readonly SavedRule[]): string {
  let n = rules.length + 1;
  while (rules.some((r) => r.name === `My rule ${n}`)) n++;
  return `My rule ${n}`;
}

/** What to call a rule: the player's own name for it first, then a known name, else null. */
export function ruleName(rule: string, saved: readonly SavedRule[]): string | null {
  return saved.find((r) => r.rule === rule)?.name ?? SURPRISES.find((r) => r.rule === rule)?.name ?? null;
}
