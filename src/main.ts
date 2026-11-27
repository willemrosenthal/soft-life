import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { BRUSH_MAX, BRUSH_MIN, brushCells, brushCentre, strokePoints, type Point } from './brush';
import { Drawer, DrawerStack } from './drawers';
import { Life, parseRule, type Rule } from './life';
import { PALETTES, type Palette, type PaletteId } from './palettes';
import { PATTERNS, type PatternCategory } from './patterns';
import { BoardRenderer, drawCells, type View } from './render';
import {
  NAME_MAX, PRESETS, TREND_LABELS, TrendWatcher, formatRule, loadRules, mutateRule, nextRuleName, pickSurprise, ruleName,
  saveRules, seededRandom, type SavedRule, type Trend,
} from './rules';
import { DENSITY_MAX, DENSITY_MIN, loadSettings, saveSettings, type Settings } from './settings';
import { GAPS_MAX, GAPS_MIN, MELT_MAX, MELT_MIN } from './melt';
import { STICKINESS_MAX, STICKINESS_MIN } from './slime';
import { decodeBoard, encodeBoard, sharedColony } from './share';

/** Wait this long after the board stops changing size before adding or removing rows. */
const REGRID_DELAY = 120;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

function el<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}

const settings: Settings = loadSettings();
let rule: Rule = parseRule(settings.rule)!;
/** The player's own rules, made in the Rule lab. */
let savedRules: SavedRule[] = loadRules();
/** Drawing colour: a colony index (0-based) or the eraser. */
let brush: number | 'erase' = 0;
let running = true;

const app = el('#app');
const board = el('#board');
const canvas = el<HTMLCanvasElement>('#cv');
const ctx = canvas.getContext('2d')!;
const life = new Life(settings.density, 1);
const renderer = new BoardRenderer();
const view: View = { width: 0, height: 0, cell: 0, ox: 0, oy: 0 };
/** Time of the last generation, and whether the picture needs redrawing even with nothing animating. */
let lastStep = 0;
let lastT = 1;
let dirty = true;

const palette = (): Palette => PALETTES[settings.palette];
const save = () => saveSettings(settings);

// ---------------------------------------------------------------------------------------------
// Board size

/** Match the canvas to the screen. Columns come from the density setting; cells stay square. */
function fitCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = board.clientWidth;
  const h = board.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.width = w;
  view.height = h;
  view.cell = w / settings.density;
  centreGrid();
}

/** The grid runs edge to edge: the part-rows that don't fit are cut evenly at top and bottom. */
function centreGrid(): void {
  view.ox = 0;
  view.oy = (view.height - life.rows * view.cell) / 2;
  dirty = true;
}

/** Add or remove rows (and columns, after a density change) so the grid fills the screen. Life.resize keeps the pattern centred. */
function fitGrid(): void {
  const rows = Math.max(1, Math.ceil(view.height / view.cell));
  if (rows === life.rows && settings.density === life.cols) return;
  life.resize(settings.density, rows);
  centreGrid();
  updateStats();
  syncBoardPop();
}

// While the window is dragged or the phone rotates, the canvas follows every frame but rows are
// only added once things settle: resizing the grid a row at a time would let the pattern drift.
let regridTimer = 0;
new ResizeObserver(() => {
  fitCanvas();
  clearTimeout(regridTimer);
  regridTimer = window.setTimeout(fitGrid, REGRID_DELAY);
}).observe(board);

// ---------------------------------------------------------------------------------------------
// Loop

function frame(now: number): void {
  const interval = 1000 / settings.speed;
  if (running && now - lastStep >= interval) {
    life.step(rule, settings.wrap);
    lastStep = now;
    updateStats();
  }
  const t = !settings.smooth || reducedMotion.matches ? 1 : Math.min(1, (now - lastStep) / Math.min(260, interval * 0.85));
  renderer.critters.calm = reducedMotion.matches;
  // Critters' eyes move on their own, so while any are showing the board redraws every frame.
  if (t < 1 || lastT < 1 || dirty || (settings.critters && renderer.critters.active)) {
    renderer.draw(ctx, life, view, palette(), settings, t, now);
    dirty = false;
  }
  lastT = t;
  if (labDrawer.amount > 0) runPreview(now);
  requestAnimationFrame(frame);
}

const genEl = el('#gen');
const popEl = el('#popCount');
function updateStats(): void {
  genEl.textContent = `Gen ${life.gen}`;
  popEl.textContent = `Pop ${life.population()}`;
}

/** Call after changing the board by hand, so the next generation waits a full beat. */
function boardChanged(): void {
  lastStep = performance.now();
  dirty = true;
  updateStats();
}

// ---------------------------------------------------------------------------------------------
// Drawing on the board

let painting = false;
let paintColony = 0;
let lastPoint: Point | null = null;
/** Where the pointer is over the board, for the brush ring; and whether it's a mouse (rings show on hover). */
let hover: Point | null = null;
let hoverIsMouse = false;

/** The pointer's position in grid units: cell (0, 0) spans 0..1. */
function gridPoint(e: PointerEvent): Point {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.ox) / view.cell, y: (e.clientY - r.top - view.oy) / view.cell };
}

function cellAt(p: Point): number {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  return x < 0 || y < 0 || x >= life.cols || y >= life.rows ? -1 : y * life.cols + x;
}

function dab(p: Point): void {
  for (const i of brushCells(p, settings.brushSize, life.cols, life.rows, settings.wrap)) life.setCell(i, paintColony);
}

function startPaint(e: PointerEvent): void {
  const p = gridPoint(e);
  const i = cellAt(p);
  if (i < 0) return;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // The pointer is already up (a tap handed over from the edge): nothing to capture.
  }
  // Starting on a live cell erases for the whole stroke; otherwise it draws in the chosen colour.
  paintColony = brush === 'erase' || life.cur[i] ? 0 : brush + 1;
  painting = true;
  lastPoint = p;
  dab(p);
  setHover(p, e.pointerType === 'mouse');
  renderer.critters.pointer = p;
  renderer.critters.poke(p.x, p.y);
  dirty = true;
  updateStats();
}

function continuePaint(p: Point): void {
  // Fill in between pointer events, so a fast stroke leaves a solid line.
  for (const q of strokePoints(lastPoint ?? p, p)) dab(q);
  lastPoint = p;
  dirty = true;
  updateStats();
}

function endPaint(): void {
  painting = false;
  lastPoint = null;
  updateRing();
}

/** The dashed ring showing what the brush will cover: on hover with a mouse, under the finger while drawing. */
function setHover(p: Point | null, isMouse: boolean): void {
  hover = p;
  hoverIsMouse = isMouse;
  updateRing();
}
function updateRing(): void {
  renderer.brushRing = hover && (hoverIsMouse || painting) ? { ...brushCentre(hover, settings.brushSize), size: settings.brushSize, colour: brush === 'erase' ? null : palette().cells[brush]! } : null;
  dirty = true;
}

canvas.addEventListener('pointerdown', startPaint);
canvas.addEventListener('pointermove', (e) => {
  const p = gridPoint(e);
  // Critters watch the pointer (or a finger while it's down).
  renderer.critters.pointer = p;
  setHover(p, e.pointerType === 'mouse');
  if (painting) continuePaint(p);
});
/** The stroke is over. A finger or pen has also left the screen, so nothing should follow it any more. */
function pointerDone(e: PointerEvent): void {
  endPaint();
  if (e.pointerType !== 'mouse') {
    renderer.critters.pointer = null;
    setHover(null, false);
  }
}
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, pointerDone);
canvas.addEventListener('pointerleave', () => {
  renderer.critters.pointer = null;
  if (!painting) setHover(null, false);
});

// ---------------------------------------------------------------------------------------------
// Rail and drawers

const railEl = el('#rail');
const railTab = el('#railTab');
const libPanel = el('#libPanel');
const setPanel = el('#setPanel');
const labPanel = el('#labPanel');
const libButton = el('#btnLib');
const setButton = el('#btnSet');

function railToggled(open: boolean): void {
  settings.railHidden = !open;
  save();
  app.classList.toggle('rail-hidden', !open);
  railTab.setAttribute('aria-expanded', String(open));
  if (!open) closePops();
}

/**
 * A panel opened or closed: focus moves in, and back to the rail button that opened it. While a
 * panel is open the rail behind it is inert, so Tab stays in the panel.
 */
function panelToggled(panel: HTMLElement, opener: HTMLElement, open: boolean): void {
  railEl.inert = open || !rail.isOpen;
  if (open) {
    closePops();
    el<HTMLElement>('[data-close]', panel).focus({ preventScroll: true });
    if (panel === libPanel) drawThumbnails();
    if (panel === labPanel) fitPreview();
  } else if (panel.contains(document.activeElement)) {
    opener.focus({ preventScroll: true });
  }
}

const rail = new Drawer(railEl, false, railToggled);
const stack = new DrawerStack(app, el('#shade'), {
  edgeDrawer: rail,
  canvas,
  onEdgeDraw: (down, ended) => {
    startPaint(down);
    if (ended) pointerDone(down);
  },
});
stack.add('rail', rail);
const libDrawer = stack.add('lib', new Drawer(libPanel, true, (open) => panelToggled(libPanel, libButton, open)));
const setDrawer = stack.add('set', new Drawer(setPanel, true, (open) => panelToggled(setPanel, setButton, open)));
// The Rule lab opens from Settings, so closing it hands focus back to the Settings button.
const labDrawer = stack.add('lab', new Drawer(labPanel, true, (open) => panelToggled(labPanel, setButton, open)));

railTab.addEventListener('click', () => rail.setOpen(true));
libButton.addEventListener('click', () => stack.openModal(libDrawer));
setButton.addEventListener('click', () => stack.openModal(setDrawer));
for (const [panel, drawer] of [[libPanel, libDrawer], [setPanel, setDrawer], [labPanel, labDrawer]] as const) {
  panel.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-close]')) drawer.setOpen(false);
  });
}

// Pop-ups beside the rail: colour, draw size, density and speed.

const popButtons = [...railEl.querySelectorAll<HTMLElement>('[data-pop]')];
const pops = popButtons.map((b) => el(`#${b.dataset.pop}`));

/** Close any open pop-up; with `restoreFocus`, focus goes back to the rail button that opened it. */
function closePops(restoreFocus = false): void {
  const opener = popButtons.find((b) => b.getAttribute('aria-expanded') === 'true');
  pops.forEach((p) => { p.hidden = true; });
  popButtons.forEach((b) => b.setAttribute('aria-expanded', 'false'));
  if (restoreFocus) opener?.focus({ preventScroll: true });
}

function togglePop(button: HTMLElement): void {
  const pop = el(`#${button.dataset.pop}`);
  const wasOpen = !pop.hidden;
  closePops();
  if (wasOpen) return;
  pop.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  // Beside the rail, level with its button, kept on screen.
  const a = app.getBoundingClientRect();
  const r = el('.rail', railEl).getBoundingClientRect();
  const b = button.getBoundingClientRect();
  pop.style.right = `${a.right - r.left + 10}px`;
  const top = b.top - a.top + b.height / 2 - pop.offsetHeight / 2;
  pop.style.top = `${Math.max(12, Math.min(top, a.height - pop.offsetHeight - 12))}px`;
  if (pop.id === 'sizePop') drawBrushPreview();
  // Pop-ups come after the rail in the page, so move focus in or a keyboard could never reach them.
  el<HTMLElement>('input, button', pop).focus({ preventScroll: true });
}

popButtons.forEach((b) => b.addEventListener('click', () => togglePop(b)));
// A press anywhere outside an open pop-up (and its button) closes it.
document.addEventListener('pointerdown', (e) => {
  const t = e.target as Element;
  if (pops.some((p) => !p.hidden && !p.contains(t)) && !t.closest('[data-pop]')) closePops();
}, true);
window.addEventListener('resize', () => closePops());

// ---------------------------------------------------------------------------------------------
// Controls

const playIcon = el('#icoPlay');
const playButton = el('#btnPlay');
const ICON_PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/>';
const ICON_PLAY = '<path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l10.4-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2Z"/>';

function setRunning(on: boolean): void {
  running = on;
  playIcon.innerHTML = on ? ICON_PAUSE : ICON_PLAY;
  playButton.setAttribute('aria-label', on ? 'Pause' : 'Play');
  lastStep = performance.now();
}

playButton.addEventListener('click', () => setRunning(!running));
el('#btnStep').addEventListener('click', () => {
  setRunning(false);
  life.step(rule, settings.wrap);
  boardChanged();
});
el('#btnRand').addEventListener('click', () => {
  life.soup();
  boardChanged();
  toast('New random soup');
});
el('#btnClear').addEventListener('click', () => {
  life.clear();
  boardChanged();
  setRunning(false);
  toast('Cleared. Draw something');
});
el('#btnShare').addEventListener('click', () => void share());

/** A range input bound to a numeric setting, with its readout. */
function bindRange(id: string, key: 'speed' | 'density' | 'brushSize' | 'stickiness' | 'melt' | 'gaps', min: number, max: number, onChange: () => void): HTMLInputElement {
  const input = el<HTMLInputElement>(`#${id}`);
  input.min = String(min);
  input.max = String(max);
  input.value = String(settings[key]);
  input.addEventListener('input', () => {
    settings[key] = Number(input.value);
    save();
    onChange();
  });
  return input;
}

const speedOut = el('#speedOut');
const densityOut = el('#densityOut');
const sizeOut = el('#sizeOut');
const sizeBadge = el('#sizeBadge');

function syncBoardPop(): void {
  speedOut.textContent = `${settings.speed}/s`;
  densityOut.textContent = `${life.cols} × ${life.rows}`;
}
function syncSize(): void {
  sizeOut.textContent = settings.brushSize === 1 ? '1 dot' : `${settings.brushSize} dots`;
  sizeBadge.textContent = String(settings.brushSize);
  drawBrushPreview();
  updateRing();
}

bindRange('speed', 'speed', 1, 30, syncBoardPop);
bindRange('density', 'density', DENSITY_MIN, DENSITY_MAX, () => {
  fitCanvas();
  fitGrid();
});
bindRange('size', 'brushSize', BRUSH_MIN, BRUSH_MAX, syncSize);

const stickyOut = el('#stickyOut');
const meltOut = el('#meltOut');
const gapsOut = el('#gapsOut');
/** Stickiness and colour melt only mean something in the goo style, and gaps only with melt on. */
function syncGoo(): void {
  el('#stickyRow').hidden = settings.style !== 'goo';
  el('#meltRow').hidden = settings.style !== 'goo';
  el('#gapsRow').hidden = settings.style !== 'goo' || settings.melt === 0;
  const gp = settings.gaps;
  gapsOut.textContent = gp < 15 ? 'Closed' : gp < 40 ? 'Tiny' : gp < 65 ? 'Pinholes' : gp < 90 ? 'Holes' : 'Wide';
  const s = settings.stickiness;
  stickyOut.textContent = s < 25 ? 'Tight' : s < 45 ? 'Soft' : s < 65 ? 'Gooey' : s < 85 ? 'Gloopy' : 'Sticky';
  const m = settings.melt;
  meltOut.textContent = m === 0 ? 'Off' : m < 25 ? 'Faint' : m < 50 ? 'Loose' : m < 75 ? 'Even' : m < 95 ? 'Strong' : 'Merged';
}
bindRange('stickiness', 'stickiness', STICKINESS_MIN, STICKINESS_MAX, () => {
  syncGoo();
  restyle();
});
// Only the boards melt colours; the thumbnails stay plain goo.
const redrawBoards = () => {
  syncGoo();
  labDirty = true;
  dirty = true;
};
bindRange('melt', 'melt', MELT_MIN, MELT_MAX, redrawBoards);
bindRange('gaps', 'gaps', GAPS_MIN, GAPS_MAX, redrawBoards);
syncGoo();

/** The brush's footprint, drawn in the current colour (or grey for the eraser). */
function drawBrushPreview(): void {
  const c = el<HTMLCanvasElement>('#sizePreview');
  if (!c.clientWidth) return; // pop-up closed: drawn when it opens
  const { ctx: g, w } = fitSmallCanvas(c);
  const n = settings.brushSize;
  const size = new Float32Array(n * n);
  for (const i of brushCells({ x: n / 2, y: n / 2 }, n, n, n, false)) size[i] = 1;
  const cell = w / Math.max(n, 3);
  const offset = (w - cell * n) / 2;
  g.clearRect(0, 0, w, w);
  drawCells(g, {
    cols: n, rows: n, cell, ox: offset, oy: offset, size, colour: new Int8Array(n * n),
    colours: [brush === 'erase' ? palette().muted : palette().cells[brush]!], style: settings.style, stickiness: settings.stickiness,
  });
}

const toastEl = el('#toast');
let toastTimer = 0;
/** A short message at the top. With an action (like Undo) it carries a button and stays a little longer. */
function toast(message: string, action?: { label: string; run: () => void }): void {
  toastEl.textContent = message;
  toastEl.classList.toggle('with-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action.label;
    b.addEventListener('click', () => {
      toastEl.hidden = true;
      action.run();
    });
    toastEl.append(b);
  }
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, action ? 4000 : 1600);
}

const swatchBox = el('#swatches');
const railSwatch = el('#railSw');
function buildSwatches(): void {
  const colours = palette().cells;
  swatchBox.innerHTML =
    colours.map((c, k) => `<button type="button" class="sw" style="--c:${c}" data-brush="${k}" aria-label="Draw in colour ${k + 1}" aria-pressed="${brush === k}"></button>`).join('') +
    `<button type="button" class="sw erase" data-brush="erase" aria-label="Eraser" aria-pressed="${brush === 'erase'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  railSwatch.classList.toggle('erase', brush === 'erase');
  railSwatch.style.setProperty('--c', brush === 'erase' ? 'transparent' : colours[brush]!);
}
swatchBox.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-brush]');
  if (!b) return;
  brush = b.dataset.brush === 'erase' ? 'erase' : Number(b.dataset.brush);
  buildSwatches();
  drawBrushPreview();
  updateRing();
  closePops(true);
});

// ---------------------------------------------------------------------------------------------
// Library

const libGrid = el('#lib');
const libSearch = el<HTMLInputElement>('#q');
let category: PatternCategory | 'all' = 'all';

function buildLibrary(): void {
  const q = libSearch.value.trim().toLowerCase();
  const shown = PATTERNS
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => (category === 'all' || p.category === category) && (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  libGrid.innerHTML = shown
    .map(({ p, index }) => `<button type="button" class="card" data-pattern="${index}"><canvas aria-hidden="true"></canvas><div><b>${p.name}</b><small>${p.category} · ${p.note}</small></div></button>`)
    .join('');
  el('#libCount').textContent = `${shown.length} of ${PATTERNS.length}`;
  el('#libEmpty').hidden = shown.length > 0;
  drawThumbnails();
}

/** Library patterns get a colony by position, so each card has its own colour. */
const patternColony = (index: number) => (index % palette().cells.length) + 1;

function drawThumbnails(): void {
  for (const card of libGrid.querySelectorAll<HTMLElement>('.card')) {
    const index = Number(card.dataset.pattern);
    const cells = PATTERNS[index]!.cells;
    const c = el<HTMLCanvasElement>('canvas', card);
    if (!c.clientWidth) continue;
    const { ctx: g, w, h } = fitSmallCanvas(c);
    const rows = cells.length;
    const cols = cells[0]!.length;
    const cell = Math.min(w / (cols + 3), h / (rows + 3), 15);
    const size = new Float32Array(cols * rows);
    cells.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'O') size[y * cols + x] = 1; }));
    g.fillStyle = palette().bg;
    g.fillRect(0, 0, w, h);
    drawCells(g, {
      cols, rows, cell, ox: (w - cols * cell) / 2, oy: (h - rows * cell) / 2,
      size, colour: new Int8Array(cols * rows), colours: [palette().cells[patternColony(index) - 1]!], style: settings.style, stickiness: settings.stickiness,
    });
  }
}

function fitSmallCanvas(c: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = c.clientWidth;
  const h = c.clientHeight;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: g, w, h };
}

function loadPattern(index: number): void {
  const pattern = PATTERNS[index]!;
  const colony = patternColony(index);
  life.place(pattern.cells, (ch) => (ch === 'O' ? colony : 0));
  boardChanged();
  libDrawer.setOpen(false);
  toast(`Loaded ${pattern.name}`);
}

libSearch.addEventListener('input', buildLibrary);
libGrid.addEventListener('click', (e) => {
  const card = (e.target as Element).closest<HTMLElement>('[data-pattern]');
  if (card) loadPattern(Number(card.dataset.pattern));
});
const chips = el('#chips');
chips.addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('[data-cat]');
  if (!chip) return;
  category = chip.dataset.cat as PatternCategory | 'all';
  for (const c of chips.querySelectorAll('[data-cat]')) c.setAttribute('aria-pressed', String(c === chip));
  buildLibrary();
});

// ---------------------------------------------------------------------------------------------
// Settings

const themesBox = el('#themes');

function buildThemes(): void {
  themesBox.innerHTML = (Object.entries(PALETTES) as [PaletteId, Palette][])
    .map(([id, p]) => `<button type="button" class="theme" data-theme="${id}" aria-pressed="${settings.palette === id}" style="--tb:${p.bg};--tf:${p.fg}"><span class="dots">${p.cells.slice(0, 4).map((c) => `<i style="--c:${c}"></i>`).join('')}</span>${p.name}</button>`)
    .join('');
}
themesBox.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-theme]');
  if (!b) return;
  settings.palette = b.dataset.theme as PaletteId;
  save();
  applyTheme();
});

/** Redraw everything that shows cells after the cell style or stickiness changes. */
function restyle(): void {
  drawThumbnails();
  drawRuleThumbnails();
  drawBrushPreview();
  labDirty = true;
  dirty = true;
}

/** Reflect the settings in the panel's buttons. */
function syncSettingsPanel(): void {
  for (const group of setPanel.querySelectorAll<HTMLElement>('[data-key]')) {
    const key = group.dataset.key as 'style' | 'mode' | 'rule';
    for (const b of group.querySelectorAll<HTMLElement>('[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === settings[key]));
  }
  for (const b of setPanel.querySelectorAll<HTMLElement>('[data-toggle]')) {
    b.setAttribute('aria-checked', String(settings[b.dataset.toggle as 'smooth' | 'critters' | 'wrap']));
  }
}

setPanel.addEventListener('click', (e) => {
  const target = e.target as Element;
  const choice = target.closest<HTMLElement>('[data-v]');
  const group = choice?.closest<HTMLElement>('[data-key]');
  if (choice && group) {
    const key = group.dataset.key as 'style' | 'mode' | 'rule';
    const value = choice.dataset.v!;
    if (key === 'rule') {
      setBoardRule(value);
    } else if (key === 'style') {
      settings.style = value as Settings['style'];
      syncGoo();
      restyle();
    } else {
      settings.mode = value as Settings['mode'];
    }
  }
  const toggle = target.closest<HTMLElement>('[data-toggle]');
  if (toggle) {
    const key = toggle.dataset.toggle as 'smooth' | 'critters' | 'wrap';
    settings[key] = !settings[key];
  }
  if ((choice && group) || toggle) {
    save();
    syncSettingsPanel();
    dirty = true;
  }
  if (target.closest('#openLab')) openLab();
});

const ruleList = el('#ruleList');

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The Rule list in Settings: presets, the player's saved rules, the rule in use if it's neither, and the way into the lab. */
function buildRuleList(): void {
  const row = (name: string, code: string) =>
    `<button type="button" class="row" data-v="${code}"><span>${escapeHtml(name)}<code>${code}</code></span><i class="radio"></i></button>`;
  let html = PRESETS.map((p) => row(p.name, p.rule)).join('');
  if (savedRules.length) html += `<div class="list-sub">My rules</div>${savedRules.map((r) => row(r.name, r.rule)).join('')}`;
  // A rule from a shared link, or one tried in the lab but not saved: list it so the choice stays visible.
  if (![...PRESETS, ...savedRules].some((r) => r.rule === settings.rule)) html += row(ruleName(settings.rule, savedRules) ?? 'Unsaved rule', settings.rule);
  html += `<button type="button" class="row row-action" id="openLab"><span>Make your own rule<small>Try, tweak and save rules in the Rule lab</small></span>`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>`;
  ruleList.innerHTML = html;
  syncSettingsPanel();
}

/** Run the board on this rule (already checked) and remember it. */
function setBoardRule(code: string): void {
  rule = parseRule(code)!;
  settings.rule = formatRule(rule); // one spelling, so it matches the lists
  save();
  buildRuleList();
}

function applyTheme(): void {
  const p = palette();
  const root = document.documentElement.style;
  root.setProperty('--app-bg', p.bg);
  root.setProperty('--app-fg', p.fg);
  root.setProperty('--app-panel', p.panel);
  root.setProperty('--app-line', p.line);
  root.setProperty('--app-muted', p.muted);
  root.setProperty('--app-accent', p.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
  buildThemes();
  buildSwatches();
  drawThumbnails();
  drawRuleThumbnails();
  drawBrushPreview();
  updateRing();
  labDirty = true;
}

// ---------------------------------------------------------------------------------------------
// Rule lab: try a rule on fresh soup, tweak it, save it.

/** The preview's grid: 4:3, like its frame. It always wraps, so every rule gets the same fair test. */
const PREVIEW_COLS = 36;
const PREVIEW_ROWS = 27;
const PREVIEW_SPEED = 10;
/** Saved-rule thumbnails: a small soup run this many generations, the same every time for a given rule. */
const THUMB_COLS = 24;
const THUMB_ROWS = 18;
const THUMB_GENS = 40;

const labCanvas = el<HTMLCanvasElement>('#labCv');
const labCtx = labCanvas.getContext('2d')!;
const labTrendEl = el('#labTrend');
const labGenEl = el('#labGen');
const labLine = el('#labLine');
const labName = el<HTMLInputElement>('#labName');
const labSaveBtn = el('#labSaveBtn');
const labCards = el('#labCards');
const preview = new Life(PREVIEW_COLS, PREVIEW_ROWS);
const previewRenderer = new BoardRenderer();
const previewView: View = { width: 0, height: 0, cell: 0, ox: 0, oy: 0 };
const trendWatcher = new TrendWatcher();
let labRule: Rule = rule;
/** The saved rule being edited, if any: Save updates it instead of adding a new one. */
let labEditing: string | null = null;
let labLastStep = 0;
let labLastT = 1;
let labDirty = true;

function fitPreview(): void {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = labCanvas.clientWidth;
  const h = labCanvas.clientHeight;
  if (!w || !h) return;
  labCanvas.width = Math.round(w * dpr);
  labCanvas.height = Math.round(h * dpr);
  labCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  previewView.width = w;
  previewView.height = h;
  previewView.cell = Math.min(w / PREVIEW_COLS, h / PREVIEW_ROWS);
  previewView.ox = (w - PREVIEW_COLS * previewView.cell) / 2;
  previewView.oy = (h - PREVIEW_ROWS * previewView.cell) / 2;
  labDirty = true;
}
new ResizeObserver(fitPreview).observe(labCanvas);

function showTrend(trend: Trend): void {
  labTrendEl.dataset.trend = trend;
  el('span', labTrendEl).textContent = TREND_LABELS[trend];
}

function restartPreview(): void {
  preview.soup();
  trendWatcher.reset();
  showTrend('starting');
  labGenEl.textContent = 'Gen 0';
  labLastStep = performance.now();
  labDirty = true;
}

/** Called from the main loop while the lab is showing. */
function runPreview(now: number): void {
  const interval = 1000 / PREVIEW_SPEED;
  if (now - labLastStep >= interval) {
    preview.step(labRule, true);
    labLastStep = now;
    showTrend(trendWatcher.update(preview.cur));
    labGenEl.textContent = `Gen ${preview.gen}`;
  }
  const t = !settings.smooth || reducedMotion.matches ? 1 : Math.min(1, (now - labLastStep) / (interval * 0.85));
  if (t < 1 || labLastT < 1 || labDirty) {
    previewRenderer.draw(labCtx, preview, previewView, palette(), { style: settings.style, mode: settings.mode, critters: false, stickiness: settings.stickiness, melt: settings.melt, gaps: settings.gaps, wrap: true }, t, now);
    labDirty = false;
  }
  labLastT = t;
}

// The neighbour-count buttons: born with 1–8 (0 would make the board flash), survive with 0–8.
const countRows = { born: el('#labBorn'), survive: el('#labSurvive') };
for (const [which, row] of Object.entries(countRows) as ['born' | 'survive', HTMLElement][]) {
  row.innerHTML = Array.from({ length: 9 }, (_, n) => {
    const label = `${which === 'born' ? 'Born with' : 'Survives with'} ${n} neighbour${n === 1 ? '' : 's'}`;
    const off = which === 'born' && n === 0;
    return `<button type="button" class="count-btn" data-n="${n}" aria-label="${label}" aria-pressed="false"${off ? ' disabled title="Off: every empty spot would come alive at once and the board would flash"' : ''}>${n}</button>`;
  }).join('');
  row.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-n]');
    if (!b || b.disabled) return;
    const n = Number(b.dataset.n);
    const set = new Set(labRule[which]);
    if (set.has(n)) set.delete(n);
    else set.add(n);
    labRule = { ...labRule, [which]: set };
    labChanged();
  });
}

/** The lab's rule changed: update the buttons, the summary and the cards, and give the rule a fresh start. */
function labChanged(restart = true): void {
  for (const [which, row] of Object.entries(countRows) as ['born' | 'survive', HTMLElement][]) {
    for (const b of row.querySelectorAll<HTMLElement>('[data-n]')) b.setAttribute('aria-pressed', String(labRule[which].has(Number(b.dataset.n))));
  }
  const code = formatRule(labRule);
  const name = ruleName(code, savedRules);
  labLine.innerHTML = `<code>${code}</code><span>${name ? escapeHtml(name) : 'A new rule, not saved yet'}</span>`;
  labName.placeholder = ruleName(code, []) ?? nextRuleName(savedRules);
  labSaveBtn.textContent = labEditing ? 'Save changes' : 'Save';
  for (const card of labCards.querySelectorAll<HTMLElement>('[data-id]')) {
    card.setAttribute('aria-current', String(savedRules.find((r) => r.id === card.dataset.id)?.rule === code));
  }
  if (restart) restartPreview();
}

/** Put a rule in the lab. `saved` means it's one of the player's rules, to be edited in place. */
function loadIntoLab(code: string, saved: SavedRule | null): void {
  labRule = parseRule(code)!;
  labEditing = saved?.id ?? null;
  labName.value = saved?.name ?? '';
  labChanged();
}

function openLab(): void {
  loadIntoLab(settings.rule, savedRules.find((r) => r.rule === settings.rule) ?? null);
  buildRuleCards();
  stack.openModal(labDrawer);
}

el('#labBack').addEventListener('click', () => stack.openModal(setDrawer));
el('#labSoup').addEventListener('click', restartPreview);
el('#labMutate').addEventListener('click', () => {
  labRule = mutateRule(labRule);
  labChanged();
});
el('#labSurprise').addEventListener('click', () => {
  const pick = pickSurprise(formatRule(labRule));
  loadIntoLab(pick.rule, null);
  toast(`Trying ${pick.name}`);
});
el('#labUse').addEventListener('click', () => {
  const code = formatRule(labRule);
  setBoardRule(code);
  labDrawer.setOpen(false);
  toast(`Board now runs ${ruleName(code, savedRules) ?? code}`);
});
el('#labSave').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = formatRule(labRule);
  const preset = PRESETS.find((p) => p.rule === code);
  const twin = savedRules.find((r) => r.rule === code && r.id !== labEditing);
  if (preset) return toast(`That's ${preset.name}, already in Settings`);
  if (twin) return toast(`Already saved as ${twin.name}`);
  const name = (labName.value.trim() || labName.placeholder).slice(0, NAME_MAX);
  const editing = savedRules.find((r) => r.id === labEditing);
  if (editing) {
    editing.name = name;
    editing.rule = code;
  } else {
    labEditing = `r${Date.now().toString(36)}`;
    savedRules.push({ id: labEditing, name, rule: code });
  }
  labName.value = name;
  rulesChanged();
  labChanged(false);
  toast(`Saved ${name}`);
});

/** The saved list changed: keep it, and refresh everything that shows it. */
function rulesChanged(): void {
  saveRules(savedRules);
  buildRuleList();
  buildRuleCards();
}

function buildRuleCards(): void {
  const code = formatRule(labRule);
  labCards.innerHTML = savedRules.map((r) => `
    <div class="rule-card" data-id="${r.id}" aria-current="${r.rule === code}">
      <button type="button" class="rule-card-main" data-load="${r.id}" aria-label="Open ${escapeHtml(r.name)} in the lab">
        <canvas aria-hidden="true" data-rule="${r.rule}"></canvas><span><b>${escapeHtml(r.name)}</b><small>${r.rule}</small></span>
      </button>
      <button type="button" class="rule-card-x" data-delete="${r.id}" aria-label="Delete ${escapeHtml(r.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>`).join('');
  el('#labCount').textContent = savedRules.length ? String(savedRules.length) : '';
  el('#labEmpty').hidden = savedRules.length > 0;
  drawRuleThumbnails();
}

labCards.addEventListener('click', (e) => {
  const t = e.target as Element;
  const del = t.closest<HTMLElement>('[data-delete]');
  if (del) {
    const at = savedRules.findIndex((r) => r.id === del.dataset.delete);
    if (at < 0) return;
    const [gone] = savedRules.splice(at, 1);
    if (labEditing === gone!.id) {
      labEditing = null;
      labChanged(false);
    }
    rulesChanged();
    toast(`Deleted ${gone!.name}`, {
      label: 'Undo',
      run: () => {
        savedRules.splice(Math.min(at, savedRules.length), 0, gone!);
        rulesChanged();
      },
    });
    return;
  }
  const load = t.closest<HTMLElement>('[data-load]');
  const saved = load && savedRules.find((r) => r.id === load.dataset.load);
  if (saved) loadIntoLab(saved.rule, saved);
});

/** Each saved rule's thumbnail: what a small soup looks like after a while under it. */
function drawRuleThumbnails(): void {
  for (const c of labCards.querySelectorAll<HTMLCanvasElement>('canvas[data-rule]')) {
    if (!c.clientWidth) continue;
    const code = c.dataset.rule!;
    const sample = new Life(THUMB_COLS, THUMB_ROWS);
    sample.soup(seededRandom(code));
    const r = parseRule(code)!;
    for (let k = 0; k < THUMB_GENS; k++) sample.step(r, true);
    const { ctx: g, w, h } = fitSmallCanvas(c);
    const cell = Math.min(w / THUMB_COLS, h / THUMB_ROWS);
    const n = THUMB_COLS * THUMB_ROWS;
    const size = new Float32Array(n);
    const colour = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      size[i] = sample.cur[i] ? 1 : 0;
      colour[i] = Math.max(0, sample.cur[i]! - 1);
    }
    g.fillStyle = palette().bg;
    g.fillRect(0, 0, w, h);
    drawCells(g, { cols: THUMB_COLS, rows: THUMB_ROWS, cell, ox: (w - THUMB_COLS * cell) / 2, oy: (h - THUMB_ROWS * cell) / 2, size, colour, colours: palette().cells, style: settings.style, stickiness: settings.stickiness, wrap: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Sharing

async function share(): Promise<void> {
  const fragment = encodeBoard(life, settings.rule);
  if (!fragment) {
    toast('Draw something to share');
    return;
  }
  const url = `${location.origin}${location.pathname}#${fragment}`;
  history.replaceState(null, '', `#${fragment}`);
  // Phones get the share sheet; elsewhere the link goes to the clipboard.
  if (matchMedia('(pointer: coarse)').matches && navigator.share) {
    try {
      await navigator.share({ title: 'Softlife pattern', url });
    } catch {
      // Closing the share sheet is not an error worth reporting.
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Pattern link copied');
  } catch {
    toast('Copy the link from the address bar');
  }
}

/** Load the pattern in the address, if there is one. */
function loadFromLink(): boolean {
  const shared = decodeBoard(location.hash);
  if (!shared) return false;
  if (shared.rule && shared.rule !== settings.rule) setBoardRule(shared.rule);
  life.place(shared.cells, sharedColony);
  boardChanged();
  toast('Loaded a shared pattern');
  return true;
}
window.addEventListener('hashchange', () => { loadFromLink(); });

// ---------------------------------------------------------------------------------------------
// Keyboard

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (pops.some((p) => !p.hidden)) closePops(true);
    else stack.topModal()?.setOpen(false);
    return;
  }
  if (stack.topModal()) return;
  const target = e.target as Element;
  if (target.closest('input, textarea, select')) return;
  if (e.key === ' ' && !target.closest('button')) {
    e.preventDefault();
    setRunning(!running);
  } else if (e.key === 'h' || e.key === 'H') {
    rail.toggle();
  }
});

// ---------------------------------------------------------------------------------------------
// Start

applyTheme();
setBoardRule(settings.rule);
buildLibrary();
syncSize();
rail.setOpen(!settings.railHidden, false);
railToggled(rail.isOpen); // setOpen only reports changes, and a rail that starts hidden hasn't changed
fitCanvas();
fitGrid();
syncBoardPop();
if (!loadFromLink()) life.soup();
setRunning(true);
updateStats();
requestAnimationFrame((t) => { lastStep = t; requestAnimationFrame(frame); });

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
}
