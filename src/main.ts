import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { Life, parseRule, type Rule } from './life';
import { PALETTES, type Palette, type PaletteId } from './palettes';
import { PATTERNS, type PatternCategory } from './patterns';
import { BoardRenderer, drawCells, type View } from './render';
import { loadSettings, saveSettings, type Settings } from './settings';
import { decodeBoard, encodeBoard, sharedColony } from './share';

/** Columns are fixed; rows follow the board's height. */
const COLS = 26;
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
/** Drawing colour: a colony index (0-based) or the eraser. */
let brush: number | 'erase' = 0;
let running = true;

const app = el('#app');
const board = el('#board');
const canvas = el<HTMLCanvasElement>('#cv');
const ctx = canvas.getContext('2d')!;
const life = new Life(COLS, 1);
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

/** Match the canvas to the board's size. The grid is centred in whatever space there is. */
function fitCanvas(): void {
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const w = board.clientWidth;
  const h = board.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.width = w;
  view.height = h;
  view.cell = w / COLS;
  centreGrid();
}

function centreGrid(): void {
  view.ox = 0;
  view.oy = (view.height - life.rows * view.cell) / 2;
  dirty = true;
}

/** Add or remove rows so the grid fills the board. Life.resize keeps the pattern centred. */
function fitGrid(): void {
  const rows = Math.max(1, Math.floor(view.height / view.cell));
  if (rows === life.rows) return;
  life.resize(COLS, rows);
  centreGrid();
  updateStats();
}

// While the dock folds or the window is dragged, the canvas follows every frame but rows are
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
  if (t < 1 || lastT < 1 || dirty) {
    renderer.draw(ctx, life, view, palette(), settings, t);
    dirty = false;
  }
  lastT = t;
  requestAnimationFrame(frame);
}

const genEl = el('#gen');
const popEl = el('#pop');
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

function cellAt(e: PointerEvent): number {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left - view.ox) / view.cell);
  const y = Math.floor((e.clientY - r.top - view.oy) / view.cell);
  return x < 0 || y < 0 || x >= life.cols || y >= life.rows ? -1 : y * life.cols + x;
}

function paint(i: number): void {
  if (i < 0) return;
  life.setCell(i, paintColony);
  dirty = true;
  updateStats();
}

canvas.addEventListener('pointerdown', (e) => {
  const i = cellAt(e);
  if (i < 0) return;
  canvas.setPointerCapture(e.pointerId);
  // Starting on a live cell erases for the whole stroke; otherwise it draws in the chosen colour.
  paintColony = brush === 'erase' || life.cur[i] ? 0 : brush + 1;
  painting = true;
  paint(i);
});
canvas.addEventListener('pointermove', (e) => { if (painting) paint(cellAt(e)); });
for (const type of ['pointerup', 'pointercancel'] as const) canvas.addEventListener(type, () => { painting = false; });

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

const speedInput = el<HTMLInputElement>('#speed');
const speedOut = el('#speedOut');
speedInput.value = String(settings.speed);
speedOut.textContent = `${settings.speed}/s`;
speedInput.addEventListener('input', () => {
  settings.speed = Number(speedInput.value);
  speedOut.textContent = `${settings.speed}/s`;
  save();
});

const toastEl = el('#toast');
let toastTimer = 0;
function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toastEl.hidden = true; }, 1600);
}

const swatchBox = el('#swatches');
function buildSwatches(): void {
  const colours = palette().cells;
  swatchBox.innerHTML =
    colours.map((c, k) => `<button type="button" class="sw" style="--c:${c}" data-brush="${k}" aria-label="Draw in colour ${k + 1}" aria-pressed="${brush === k}"></button>`).join('') +
    `<button type="button" class="sw erase" data-brush="erase" aria-label="Eraser" aria-pressed="${brush === 'erase'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
}
swatchBox.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-brush]');
  if (!b) return;
  brush = b.dataset.brush === 'erase' ? 'erase' : Number(b.dataset.brush);
  buildSwatches();
});

// ---------------------------------------------------------------------------------------------
// Folding the dock away

const dock = el('#dock');
const collapseButton = el('#btnCollapse');
const expandButton = el('#btnExpand');

/** Hide or show the colours, controls and speed, so the board can fill the screen. */
function setDockHidden(hidden: boolean, moveFocus: boolean): void {
  settings.dockHidden = hidden;
  save();
  app.classList.toggle('dock-hidden', hidden);
  // Folded controls can't be tabbed into; the expand button only exists while they're folded.
  dock.inert = hidden;
  for (const b of [collapseButton, expandButton]) b.setAttribute('aria-expanded', String(!hidden));
  if (moveFocus) (hidden ? expandButton : collapseButton).focus({ preventScroll: true });
}
collapseButton.addEventListener('click', () => setDockHidden(true, true));
expandButton.addEventListener('click', () => setDockHidden(false, true));

// ---------------------------------------------------------------------------------------------
// Library

const libSheet = el<HTMLDialogElement>('#libSheet');
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
  if (!libSheet.open) return; // cards have no size until the sheet is showing
  for (const card of libGrid.querySelectorAll<HTMLElement>('.card')) {
    const index = Number(card.dataset.pattern);
    const cells = PATTERNS[index]!.cells;
    const c = el<HTMLCanvasElement>('canvas', card);
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
      size, colour: new Int8Array(cols * rows), colours: [palette().cells[patternColony(index) - 1]!], style: settings.style,
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
  libSheet.close();
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

const setSheet = el<HTMLDialogElement>('#setSheet');
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

/** Reflect the settings in the sheet's buttons. */
function syncSettingsSheet(): void {
  for (const group of setSheet.querySelectorAll<HTMLElement>('[data-key]')) {
    const key = group.dataset.key as 'style' | 'mode' | 'rule';
    for (const b of group.querySelectorAll<HTMLElement>('[data-v]')) b.setAttribute('aria-pressed', String(b.dataset.v === settings[key]));
  }
  for (const b of setSheet.querySelectorAll<HTMLElement>('[data-toggle]')) {
    b.setAttribute('aria-checked', String(settings[b.dataset.toggle as 'smooth' | 'critters' | 'wrap']));
  }
}

setSheet.addEventListener('click', (e) => {
  const target = e.target as Element;
  const choice = target.closest<HTMLElement>('[data-v]');
  const group = choice?.closest<HTMLElement>('[data-key]');
  if (choice && group) {
    const key = group.dataset.key as 'style' | 'mode' | 'rule';
    const value = choice.dataset.v!;
    if (key === 'rule') {
      settings.rule = value;
      rule = parseRule(value)!;
    } else if (key === 'style') {
      settings.style = value as Settings['style'];
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
    syncSettingsSheet();
    dirty = true;
  }
});

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
  drawLogo();
  drawThumbnails();
  dirty = true;
}

function drawLogo(): void {
  const g = el<HTMLCanvasElement>('#logo').getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 36, 36);
  drawCells(g, { cols: 2, rows: 2, cell: 16, ox: 2, oy: 2, size: [1, 1, 0, 1], colour: [0, 0, 0, 0], colours: [palette().fg], style: 'goo' });
}

// ---------------------------------------------------------------------------------------------
// Sheets

function openSheet(sheet: HTMLDialogElement): void {
  sheet.showModal();
  if (sheet === libSheet) drawThumbnails();
}
el('#btnLib').addEventListener('click', () => openSheet(libSheet));
el('#btnSet').addEventListener('click', () => openSheet(setSheet));
for (const sheet of [libSheet, setSheet]) {
  sheet.addEventListener('click', (e) => {
    // A click on the dialog itself (not its contents) is a click on the backdrop.
    if (e.target === sheet || (e.target as Element).closest('[data-close]')) sheet.close();
  });
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
  if (shared.rule && shared.rule !== settings.rule) {
    settings.rule = shared.rule;
    rule = parseRule(shared.rule)!;
    save();
    syncSettingsSheet();
  }
  life.place(shared.cells, sharedColony);
  boardChanged();
  toast('Loaded a shared pattern');
  return true;
}
window.addEventListener('hashchange', () => { loadFromLink(); });

// ---------------------------------------------------------------------------------------------
// Keyboard

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || libSheet.open || setSheet.open) return;
  const target = e.target as Element;
  if (target.closest('input, textarea, select')) return;
  if (e.key === ' ' && !target.closest('button')) {
    e.preventDefault();
    setRunning(!running);
  } else if (e.key === 'h' || e.key === 'H') {
    setDockHidden(!settings.dockHidden, false);
  }
});

// ---------------------------------------------------------------------------------------------
// Start

applyTheme();
syncSettingsSheet();
buildLibrary();
setDockHidden(settings.dockHidden, false);
fitCanvas();
fitGrid();
if (!loadFromLink()) life.soup();
setRunning(true);
updateStats();
// Turn on the dock's fold animation only after the first layout, so a saved "hidden" doesn't animate in.
requestAnimationFrame(() => {
  app.classList.add('ready');
  requestAnimationFrame((t) => { lastStep = t; requestAnimationFrame(frame); });
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
}
