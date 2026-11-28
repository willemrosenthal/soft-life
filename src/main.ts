import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import { BRUSH_MAX, BRUSH_MIN, brushAt, brushCells, brushCentre, newStrokeSeed, strokePoints, type Point } from './brush';
import { ABUNDANCE_MAX, ABUNDANCE_MIN } from './critters';
import { Drawer, DrawerStack } from './drawers';
import { Life, parseRule, type Rule } from './life';
import 'vanilla-colorful/hex-color-picker.js';
import { PALETTES, type Palette } from './palettes';
import {
  CELL_COUNT, derivePalette, NAME_MAX as THEME_NAME_MAX, surpriseTheme, hardToSee, isDark, isHex, loadThemes, resolvePalette, saveThemes, standOut, themeKey,
  type CustomTheme,
} from './themes';
import { CATEGORY_INFO, LIFE, PATTERNS, type PatternCategory } from './patterns';
import { BoardRenderer, drawCells, type View } from './render';
import { MiniBoard } from './miniboard';
import {
  NAME_MAX, PRESETS, QuietWatcher, TREND_LABELS, TrendWatcher, formatRule, loadRules, mutateRule, nextRuleName, pickSurprise, ruleName,
  saveRules, seededRandom, type SavedRule, type Trend,
} from './rules';
import { DENSITY_MAX, DENSITY_MIN, formatSpeed, loadSettings, saveSettings, SPEED_STEPS, type Settings } from './settings';
import { GAPS_MAX, GAPS_MIN, MELT_MAX, MELT_MIN } from './melt';
import { DIAGONALS_MAX, DIAGONALS_MIN, STICKINESS_MAX, STICKINESS_MIN } from './slime';
import { decodeBoard, encodeBoard, sharedColony } from './share';
import { createDemo, type Demo, type DemoHost, type DemoKey } from './demos';
import { isNative, matchStatusBar, nativeShare, PUBLIC_URL, tapLight, tapMedium, tick } from './native';

/** Wait this long after the board stops changing size before adding or removing rows. */
const REGRID_DELAY = 120;

// iOS Safari ignores the viewport's no-zoom setting for pinches; its own gesture events can still be cancelled.
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

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
/** The player's own themes, made in the theme editor. */
let customThemes: CustomTheme[] = loadThemes();
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

/** The theme in use; applyTheme updates it. */
let activePalette: Palette = resolvePalette(settings.palette, customThemes);
const palette = (): Palette => activePalette;
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

/**
 * How far through the latest step's transition a board is, 0 to 1. Transitions take most of a
 * step, but never more than 260ms, so slow speeds still snap rather than drift.
 */
function tween(now: number, last: number, interval: number): number {
  if (!settings.smooth || reducedMotion.matches) return 1;
  return Math.min(1, (now - last) / Math.min(260, interval * 0.85));
}

/** Small live boards (the lab preview, the theme editor's), redrawn whenever the look changes. */
const miniBoards: MiniBoard[] = [];
function miniBoard(canvas: HTMLCanvasElement, cols: number, rows: number): MiniBoard {
  const b = new MiniBoard(canvas, cols, rows, tween);
  miniBoards.push(b);
  return b;
}
function redrawMiniBoards(): void {
  for (const b of miniBoards) b.invalidate();
}

function frame(now: number): void {
  const interval = 1000 / settings.speed;
  if (running && now - lastStep >= interval) {
    life.step(rule, settings.wrap);
    lastStep = now;
    updateStats();
  }
  const t = tween(now, lastStep, interval);
  renderer.critters.calm = reducedMotion.matches;
  // Critters' eyes move on their own, so while any are showing the board redraws every frame.
  if (t < 1 || lastT < 1 || dirty || (settings.critters && renderer.critters.active)) {
    renderer.draw(ctx, life, view, palette(), settings, t, now);
    dirty = false;
  }
  lastT = t;
  if (labDrawer.amount > 0) runPreview(now);
  if (themeDrawer.amount > 0) runThemePreview(now);
  if (setDrawer.amount > 0) runStylePreview(now);
  activeDemo?.tick(now);
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
/** Picks the airbrush's holes: new for each stroke, kept for its length so a drag doesn't fill them in. */
let strokeSeed = 0;
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
  // Erasing clears the whole footprint, even with an airbrush.
  for (const i of brushCells(p, brushAt(settings.brushStep), life.cols, life.rows, settings.wrap, paintColony === 0, strokeSeed)) life.setCell(i, paintColony);
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
  strokeSeed = newStrokeSeed();
  painting = true;
  tapLight();
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
  // Rotate: a stroke that drew in a colour (not one that erased) moves the brush on to the next colour.
  if (painting && settings.rotateColours && brush !== 'erase' && paintColony !== 0) {
    brush = (brush + 1) % palette().cells.length;
    buildSwatches();
    drawBrushPreview();
  }
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
  renderer.brushRing = hover && (hoverIsMouse || painting) ? { ...brushCentre(hover, brushAt(settings.brushStep)), size: brushAt(settings.brushStep).width, colour: brush === 'erase' ? null : palette().cells[brush]! } : null;
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
    // Panels without a close button (the theme editor has Save there) focus their first header button.
    (panel.querySelector<HTMLElement>('[data-close]') ?? el<HTMLElement>('.panel-head button', panel)).focus({ preventScroll: true });
    if (panel === libPanel) drawThumbnails();
    if (panel === setPanel) resetStylePreview();
    if (panel === labPanel) labBoard.fit();
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
const labDrawer = stack.add('lab', new Drawer(labPanel, true, (open) => {
  if (!open) showLabInfo(false);
  panelToggled(labPanel, setButton, open);
}));
// The theme editor opens from Settings too.
const themePanel = el('#themePanel');
const themeDrawer = stack.add('theme', new Drawer(themePanel, true, (open) => {
  if (!open) pickColour(null);
  panelToggled(themePanel, setButton, open);
  if (open) themeBoard.fit();
  else clearEditorColours();
}));

railTab.addEventListener('click', () => rail.setOpen(true));
libButton.addEventListener('click', () => {
  followBoardRule();
  buildLibrary();
  stack.openModal(libDrawer);
});
setButton.addEventListener('click', () => stack.openModal(setDrawer));
for (const [panel, drawer] of [[libPanel, libDrawer], [setPanel, setDrawer], [labPanel, labDrawer], [themePanel, themeDrawer]] as const) {
  panel.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-close]')) drawer.setOpen(false);
  });
}

// Pop-ups beside the rail: colour, draw size, density, speed, and the board actions (soup, clear, share).

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

playButton.addEventListener('click', () => { tick(); setRunning(!running); });
el('#btnStep').addEventListener('click', () => {
  setRunning(false);
  life.step(rule, settings.wrap);
  boardChanged();
});
el('#btnRand').addEventListener('click', () => {
  life.soup();
  boardChanged();
  tapMedium();
  toast('New random soup');
});
el('#btnClear').addEventListener('click', () => {
  life.clear();
  boardChanged();
  tapMedium();
  setRunning(false);
  toast('Cleared. Draw something');
});
el('#btnShare').addEventListener('click', () => void share());
// Each board action closes the pop-up it lives in.
el('#actionsPop').addEventListener('click', (e) => {
  if ((e.target as Element).closest('button')) closePops();
});

/** A range input bound to a numeric setting, with its readout. */
function bindRange(id: string, key: 'density' | 'brushStep' | 'stickiness' | 'diagonals' | 'melt' | 'gaps' | 'critterAbundance', min: number, max: number, onChange: () => void): HTMLInputElement {
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
  speedOut.textContent = formatSpeed(settings.speed);
  densityOut.textContent = `${life.cols} × ${life.rows}`;
}
function syncSize(): void {
  const b = brushAt(settings.brushStep);
  sizeOut.textContent = b.name;
  sizeBadge.textContent = String(b.width);
  drawBrushPreview();
  updateRing();
}

/** A speed slider: it walks SPEED_STEPS, so the slow end can offer fractions of a step per second. */
function bindSpeed(id: string, key: 'speed' | 'labSpeed', onChange: () => void): void {
  const input = el<HTMLInputElement>(`#${id}`);
  input.min = '0';
  input.max = String(SPEED_STEPS.length - 1);
  input.value = String(Math.max(0, SPEED_STEPS.indexOf(settings[key])));
  input.addEventListener('input', () => {
    settings[key] = SPEED_STEPS[Number(input.value)] ?? settings[key];
    save();
    onChange();
  });
}

bindSpeed('speed', 'speed', syncBoardPop);
bindRange('density', 'density', DENSITY_MIN, DENSITY_MAX, () => {
  fitCanvas();
  fitGrid();
});
bindRange('size', 'brushStep', BRUSH_MIN, BRUSH_MAX, syncSize);

const stickyOut = el('#stickyOut');
const diagOut = el('#diagOut');
const meltOut = el('#meltOut');
const gapsOut = el('#gapsOut');
/** Stickiness, diagonals and colour melt only mean something in the goo style, and gaps only with melt on. */
function syncGoo(): void {
  el('#stickyRow').hidden = settings.style !== 'goo';
  el('#diagRow').hidden = settings.style !== 'goo';
  el('#meltRow').hidden = settings.style !== 'goo';
  el('#gapsRow').hidden = settings.style !== 'goo' || settings.melt === 0;
  const gp = settings.gaps;
  gapsOut.textContent = gp < 15 ? 'Closed' : gp < 40 ? 'Tiny' : gp < 65 ? 'Pinholes' : gp < 90 ? 'Holes' : 'Wide';
  const s = settings.stickiness;
  stickyOut.textContent = s < 25 ? 'Tight' : s < 45 ? 'Soft' : s < 65 ? 'Gooey' : s < 85 ? 'Gloopy' : 'Sticky';
  const dg = settings.diagonals;
  diagOut.textContent = dg === 0 ? 'Apart' : dg < 15 ? 'Leaning' : dg < 40 ? 'Threads' : dg < 65 ? 'Strands' : dg < 90 ? 'Bridged' : 'Thick';
  const m = settings.melt;
  meltOut.textContent = m === 0 ? 'Off' : m < 25 ? 'Faint' : m < 50 ? 'Loose' : m < 75 ? 'Even' : m < 95 ? 'Strong' : 'Merged';
}
bindRange('stickiness', 'stickiness', STICKINESS_MIN, STICKINESS_MAX, () => {
  syncGoo();
  restyle();
});
bindRange('diagonals', 'diagonals', DIAGONALS_MIN, DIAGONALS_MAX, () => {
  syncGoo();
  restyle();
});
// Only the boards melt colours; the thumbnails stay plain goo.
const redrawBoards = () => {
  syncGoo();
  redrawMiniBoards();
  dirty = true;
};

// The cell style preview in Settings, since the panel hides most of the real board. It starts
// hidden behind a button. "Shapes" is a few unmoving shapes, each showing off a slider: one-colour
// shapes for stickiness, colours side by side for melt, mixed-colour blocks for gaps. "Live" is a
// soup at the board's own speed.
/** [x, y, colony]. Rows 0–1 stay clear for the controls over the preview. */
const STYLE_SHAPES: readonly (readonly [number, number, number])[] = [
  [1, 2, 1], [1, 3, 1], [2, 3, 1], [3, 3, 1], // an L
  [6, 2, 1], [7, 3, 1], // a diagonal pair
  [10, 2, 2], [11, 2, 2], [10, 3, 2], [11, 3, 2], // a block
  [14, 2, 1], [15, 2, 5], [14, 3, 5], [15, 3, 1], // a mixed block
  [1, 6, 3], [2, 6, 3], [3, 6, 6], [4, 6, 6], // two colours side by side
  [7, 6, 4], [8, 6, 4], [9, 6, 4], // a line
  [13, 6, 6], [14, 6, 2], [13, 7, 2], [14, 7, 6], [15, 7, 6], // a mixed block with a tail
];
/** Grid sizes [cols, rows] for each mode. */
const STYLE_GRID = { shapes: [17, 9], live: [18, 10] } as const;

const stylePreviewEl = el('#stylePreview');
const stylePreviewWrap = el('#stylePreviewWrap');
const styleShow = el('#styleShow');
const styleSoup = el('#styleSoup');
const styleBoard = miniBoard(el<HTMLCanvasElement>('#styleCv'), STYLE_GRID.shapes[0], STYLE_GRID.shapes[1]);
const styleQuiet = new QuietWatcher();

/** Show or hide the preview, fill it for its mode (the shapes, or fresh soup) and set the controls to match. */
function resetStylePreview(): void {
  const { stylePreview: mode, stylePreviewShown: shown } = settings;
  stylePreviewWrap.classList.toggle('open', shown);
  stylePreviewWrap.inert = !shown;
  styleShow.setAttribute('aria-expanded', String(shown));
  el('span', styleShow).textContent = shown ? 'Hide preview' : 'Show preview';
  for (const b of stylePreviewEl.querySelectorAll<HTMLElement>('[data-preview]')) b.setAttribute('aria-pressed', String(b.dataset.preview === mode));
  styleSoup.hidden = mode !== 'live';
  if (!shown) return;
  const [cols, rows] = STYLE_GRID[mode];
  styleBoard.resize(cols, rows);
  if (mode === 'live') {
    styleBoard.restart();
    styleQuiet.reset();
  } else {
    styleBoard.life.clear();
    for (const [x, y, c] of STYLE_SHAPES) styleBoard.life.setCell(y * cols + x, c);
    styleBoard.invalidate();
  }
}

styleShow.addEventListener('click', () => {
  settings.stylePreviewShown = !settings.stylePreviewShown;
  save();
  resetStylePreview();
});
stylePreviewEl.addEventListener('click', (e) => {
  const t = e.target as Element;
  const mode = t.closest<HTMLElement>('[data-preview]')?.dataset.preview as Settings['stylePreview'] | undefined;
  if (mode) settings.stylePreview = mode;
  else if (!t.closest('#styleSoup')) return;
  save();
  resetStylePreview();
});

/** Called from the main loop while Settings is showing. Shapes never step (speed 0); live starts afresh once quiet. */
function runStylePreview(now: number): void {
  if (!settings.stylePreviewShown) return;
  if (settings.stylePreview === 'shapes') {
    styleBoard.run(now, rule, 0, palette(), { ...settings, critters: false, wrap: false });
  } else if (styleBoard.run(now, rule, settings.speed, palette(), { ...settings, wrap: true }) && styleQuiet.update(styleBoard.life.cur)) {
    styleBoard.restart();
    styleQuiet.reset();
  }
}
resetStylePreview();
bindRange('melt', 'melt', MELT_MIN, MELT_MAX, redrawBoards);
bindRange('gaps', 'gaps', GAPS_MIN, GAPS_MAX, redrawBoards);
syncGoo();

const crittersOut = el('#crittersOut');
/** The abundance slider only shows while critters are on. */
function syncCritters(): void {
  el('#crittersRow').hidden = !settings.critters;
  const a = settings.critterAbundance;
  crittersOut.textContent = a < 15 ? 'Rare' : a < 40 ? 'Few' : a < 65 ? 'Some' : a < 90 ? 'Many' : 'Swarm';
}
bindRange('critterAbundance', 'critterAbundance', ABUNDANCE_MIN, ABUNDANCE_MAX, () => {
  syncCritters();
  dirty = true;
});
syncCritters();

/** The brush's footprint, drawn in the current colour (or grey for the eraser). */
function drawBrushPreview(): void {
  const c = el<HTMLCanvasElement>('#sizePreview');
  if (!c.clientWidth) return; // pop-up closed: drawn when it opens
  const { ctx: g, w } = fitSmallCanvas(c);
  const b = brushAt(settings.brushStep);
  const n = b.width;
  const size = new Float32Array(n * n);
  // A fixed seed, so the preview doesn't change its holes every time it redraws.
  for (const i of brushCells({ x: n / 2, y: n / 2 }, b, n, n, false, brush === 'erase', 1)) size[i] = 1;
  const cell = w / Math.max(n, 3);
  const offset = (w - cell * n) / 2;
  g.clearRect(0, 0, w, w);
  drawCells(g, {
    cols: n, rows: n, cell, ox: offset, oy: offset, size, colour: new Int8Array(n * n),
    colours: [brush === 'erase' ? palette().muted : palette().cells[brush]!], style: settings.style, stickiness: settings.stickiness, diagonals: settings.diagonals,
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
const rotateBtn = el('#rotate');
rotateBtn.addEventListener('click', () => {
  settings.rotateColours = !settings.rotateColours;
  save();
  buildSwatches();
});
function buildSwatches(): void {
  const colours = palette().cells;
  swatchBox.innerHTML =
    colours.map((c, k) => `<button type="button" class="sw" style="--c:${c}" data-brush="${k}" aria-label="Draw in colour ${k + 1}" aria-pressed="${brush === k}"></button>`).join('') +
    `<button type="button" class="sw erase" data-brush="erase" aria-label="Eraser" aria-pressed="${brush === 'erase'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>`;
  rotateBtn.setAttribute('aria-pressed', String(settings.rotateColours));
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
const libRules = el('#libRules');
let category: PatternCategory | 'all' = 'all';

/** The rules the library has patterns for, with their names from the Rule list. */
const LIBRARY_RULES = PRESETS.filter((p) => PATTERNS.some((pattern) => pattern.rules.includes(p.rule)));
/** Which rule's patterns are showing. Follows the board's rule when the library opens, if it has patterns for it. */
let libRule = LIFE;

const libRuleName = (code: string) => LIBRARY_RULES.find((r) => r.rule === code)?.name ?? code;

for (const r of LIBRARY_RULES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.rule = r.rule;
  b.textContent = r.name;
  libRules.append(b);
}

/** Show the board's rule in the library when there are patterns for it; otherwise keep the last one picked. */
function followBoardRule(): void {
  if (LIBRARY_RULES.some((r) => r.rule === settings.rule)) libRule = settings.rule;
}

function buildLibrary(): void {
  for (const b of libRules.querySelectorAll<HTMLElement>('[data-rule]')) b.setAttribute('aria-pressed', String(b.dataset.rule === libRule));
  const note = el('#libRuleNote');
  note.hidden = libRule === settings.rule;
  note.textContent = `The board is running ${ruleName(settings.rule, savedRules) ?? settings.rule}. Loading a pattern marked “Switches” changes it to ${libRuleName(libRule)}.`;

  const forRule = PATTERNS.map((p, index) => ({ p, index })).filter(({ p }) => p.rules.includes(libRule));
  // Only offer the categories this rule has patterns in; fall back to All if the picked one has none.
  const cats = new Set(forRule.map(({ p }) => p.category));
  for (const chip of chips.querySelectorAll<HTMLElement>('[data-cat]')) chip.hidden = chip.dataset.cat !== 'all' && !cats.has(chip.dataset.cat as PatternCategory);
  if (category !== 'all' && !cats.has(category)) pickCategory('all');

  const q = libSearch.value.trim().toLowerCase();
  const shown = forRule
    .filter(({ p }) => (category === 'all' || p.category === category) && (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));
  libGrid.innerHTML = shown
    .map(({ p, index }) => `<button type="button" class="card" data-pattern="${index}"><canvas aria-hidden="true"></canvas><div><b>${p.name}</b><small>${p.category} · ${p.note}</small>`
      + `${p.rules.includes(settings.rule) ? '' : `<small class="card-switch">Switches to ${escapeHtml(libRuleName(libRule))}</small>`}</div></button>`)
    .join('');
  el('#libCount').textContent = `${shown.length} of ${forRule.length}`;
  el('#libEmpty').hidden = shown.length > 0;
  drawThumbnails();
}

/**
 * A library pattern as it should sit on this board: turned a quarter turn clockwise when its long
 * side runs the other way to the board's (a wide pattern on a portrait board, or a tall one on a
 * landscape board), so it fits better. Life-like rules don't care about orientation, so the pattern
 * behaves the same either way.
 */
function orientedCells(cells: readonly string[]): readonly string[] {
  const rows = cells.length;
  const cols = Math.max(0, ...cells.map((r) => r.length));
  const boardTall = life.rows > life.cols;
  if (cols === rows || boardTall === rows > cols) return cells;
  return Array.from({ length: cols }, (_, x) => Array.from({ length: rows }, (_, y) => cells[rows - 1 - y]![x] ?? '.').join(''));
}

/** Library patterns get a colony by position, so each card has its own colour. */
const patternColony = (index: number) => (index % palette().cells.length) + 1;

function drawThumbnails(): void {
  // Portrait boards show patterns turned upright, so the thumbnails go upright too.
  libGrid.classList.toggle('portrait', life.rows > life.cols);
  for (const card of libGrid.querySelectorAll<HTMLElement>('.card')) {
    const index = Number(card.dataset.pattern);
    const cells = orientedCells(PATTERNS[index]!.cells);
    const c = el<HTMLCanvasElement>('canvas', card);
    if (!c.clientWidth) continue;
    const { ctx: g, w, h } = fitSmallCanvas(c);
    const rows = cells.length;
    const cols = Math.max(0, ...cells.map((r) => r.length));
    const cell = Math.min(w / (cols + 3), h / (rows + 3), 15);
    const size = new Float32Array(cols * rows);
    cells.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'O') size[y * cols + x] = 1; }));
    g.fillStyle = palette().bg;
    g.fillRect(0, 0, w, h);
    drawCells(g, {
      cols, rows, cell, ox: (w - cols * cell) / 2, oy: (h - rows * cell) / 2,
      size, colour: new Int8Array(cols * rows), colours: [palette().cells[patternColony(index) - 1]!], style: settings.style, stickiness: settings.stickiness, diagonals: settings.diagonals,
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
  // A pattern only does its thing under its own rule, so loading it switches the board over if needed.
  const switched = !pattern.rules.includes(settings.rule);
  if (switched) setBoardRule(libRule);
  life.place(orientedCells(pattern.cells), (ch) => (ch === 'O' ? colony : 0));
  boardChanged();
  tapMedium();
  libDrawer.setOpen(false);
  toast(switched ? `Loaded ${pattern.name} and switched to ${libRuleName(libRule)}` : `Loaded ${pattern.name}`);
}

libSearch.addEventListener('input', buildLibrary);
libGrid.addEventListener('click', (e) => {
  const card = (e.target as Element).closest<HTMLElement>('[data-pattern]');
  if (card) loadPattern(Number(card.dataset.pattern));
});
const chips = el('#chips');
function pickCategory(cat: PatternCategory | 'all'): void {
  category = cat;
  for (const c of chips.querySelectorAll<HTMLElement>('[data-cat]')) c.setAttribute('aria-pressed', String(c.dataset.cat === cat));
  const info = el('#catInfo');
  info.textContent = cat === 'all' ? '' : CATEGORY_INFO[cat];
  info.hidden = cat === 'all';
}

chips.addEventListener('click', (e) => {
  const chip = (e.target as Element).closest<HTMLElement>('[data-cat]');
  if (!chip) return;
  pickCategory(chip.dataset.cat as PatternCategory | 'all');
  buildLibrary();
});
libRules.addEventListener('click', (e) => {
  const b = (e.target as Element).closest<HTMLElement>('[data-rule]');
  if (!b || b.dataset.rule === libRule) return;
  libRule = b.dataset.rule!;
  buildLibrary();
});

// ---------------------------------------------------------------------------------------------
// Settings

const themesBox = el('#themes');

const ICON_EDIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
const ICON_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

/** The theme cards: built-in, then the player's own (each with an edit button), then New. */
function buildThemes(): void {
  const card = (key: string, p: Palette) =>
    `<button type="button" class="theme" data-theme="${key}" aria-pressed="${settings.palette === key}" style="--tb:${p.bg};--tf:${p.fg}">`
    + `<span class="dots">${p.cells.slice(0, 4).map((c) => `<i style="--c:${c}"></i>`).join('')}</span><span class="theme-name">${escapeHtml(p.name)}</span></button>`;
  themesBox.innerHTML = Object.entries(PALETTES).map(([id, p]) => card(id, p)).join('')
    + customThemes.map((t) => {
      const p = derivePalette(t);
      return `<div class="theme-wrap" style="--tf:${p.fg}">${card(themeKey(t), p)}<button type="button" class="theme-edit" data-edit-theme="${t.id}" aria-label="Edit ${escapeHtml(t.name)}">${ICON_EDIT}</button></div>`;
    }).join('')
    + `<button type="button" class="theme theme-new" data-new-theme>${ICON_ADD}New</button>`;
}
themesBox.addEventListener('click', (e) => {
  const t = e.target as Element;
  const edit = t.closest<HTMLElement>('[data-edit-theme]');
  if (edit) return openThemeEditor(customThemes.find((x) => x.id === edit.dataset.editTheme) ?? null);
  if (t.closest('[data-new-theme]')) return openThemeEditor(null);
  const b = t.closest<HTMLElement>('[data-theme]');
  if (!b) return;
  settings.palette = b.dataset.theme!;
  save();
  applyTheme();
});

/** Redraw everything that shows cells after the cell style, stickiness or diagonals change. */
function restyle(): void {
  drawThumbnails();
  drawRuleThumbnails();
  drawBrushPreview();
  redrawMiniBoards();
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
    syncCritters();
  }
  if ((choice && group) || toggle) {
    save();
    syncSettingsPanel();
    redrawMiniBoards();
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
  const p = resolvePalette(settings.palette, customThemes);
  // A custom theme that's been deleted: back to Meadow, and remember that.
  if (p === PALETTES.meadow && settings.palette !== 'meadow') {
    settings.palette = 'meadow';
    save();
  }
  activePalette = p;
  const root = document.documentElement.style;
  root.setProperty('--app-bg', p.bg);
  root.setProperty('--app-fg', p.fg);
  root.setProperty('--app-panel', p.panel);
  root.setProperty('--app-line', p.line);
  root.setProperty('--app-muted', p.muted);
  root.setProperty('--app-accent', p.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.bg);
  // For the loading screen in index.html, which runs before anything else. It's only a cache, so it
  // goes straight to localStorage rather than through store.ts and its native mirror.
  root.setProperty('--boot-bg', p.bg);
  root.setProperty('--boot-ink', p.cells[0]!);
  try { localStorage.setItem('softlife:boot', JSON.stringify({ bg: p.bg, ink: p.cells[0] })); } catch { /* not kept */ }
  matchStatusBar(p.bg);
  buildThemes();
  buildSwatches();
  drawThumbnails();
  drawRuleThumbnails();
  drawBrushPreview();
  updateRing();
  redrawMiniBoards();
}

// ---------------------------------------------------------------------------------------------
// Rule lab: try a rule on fresh soup, tweak it, save it.

/** The preview's grid: 4:3, like its frame. It always wraps, so every rule gets the same fair test. */
const PREVIEW_COLS = 36;
const PREVIEW_ROWS = 27;
/** Saved-rule thumbnails: a small soup run this many generations, the same every time for a given rule. */
const THUMB_COLS = 24;
const THUMB_ROWS = 18;
const THUMB_GENS = 40;

const labCanvas = el<HTMLCanvasElement>('#labCv');
const labTrendEl = el('#labTrend');
const labGenEl = el('#labGen');
const labLine = el('#labLine');
const labName = el<HTMLInputElement>('#labName');
const labSaveBtn = el('#labSaveBtn');
const labCards = el('#labCards');
const labBoard = miniBoard(labCanvas, PREVIEW_COLS, PREVIEW_ROWS);
const trendWatcher = new TrendWatcher();
let labRule: Rule = rule;
/** The saved rule being edited, if any: Save updates it instead of adding a new one. */
let labEditing: string | null = null;

function showTrend(trend: Trend): void {
  labTrendEl.dataset.trend = trend;
  el('span', labTrendEl).textContent = TREND_LABELS[trend];
}

function restartPreview(): void {
  labBoard.restart();
  trendWatcher.reset();
  showTrend('starting');
  labGenEl.textContent = 'Gen 0';
}

/** Called from the main loop while the lab is showing. It always wraps, so every rule gets the same fair test. */
function runPreview(now: number): void {
  if (labBoard.run(now, labRule, settings.labSpeed, palette(), { ...settings, critters: false, wrap: true })) {
    showTrend(trendWatcher.update(labBoard.life.cur));
    labGenEl.textContent = `Gen ${labBoard.life.gen}`;
  }
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

// The preview's own speed, on the same steps as the board's, remembered between visits.
const labSpeedOut = el('#labSpeedOut');
const syncLabSpeed = () => { labSpeedOut.textContent = formatSpeed(settings.labSpeed); };
bindSpeed('labSpeed', 'labSpeed', syncLabSpeed);
syncLabSpeed();

// How rules work: a page over the lab. The lab behind it is inert, so Tab stays on the page.
const labInfo = el('#labInfo');
const labInfoBtn = el('#labInfoBtn');
const labMain = [el('.panel-head', labPanel), el('.panel-body', labPanel)];
function showLabInfo(open: boolean): void {
  if (open === !labInfo.hidden) return;
  labInfo.hidden = !open;
  labInfoBtn.setAttribute('aria-expanded', String(open));
  for (const part of labMain) part.inert = open;
  if (open) {
    el('.panel-body', labInfo).scrollTop = 0;
    el<HTMLElement>('#labInfoBack').focus({ preventScroll: true });
  } else if (labDrawer.isOpen) {
    labInfoBtn.focus({ preventScroll: true });
  }
}
labInfoBtn.addEventListener('click', () => showLabInfo(true));
el('#labInfoBack').addEventListener('click', () => showLabInfo(false));
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
    drawCells(g, { cols: THUMB_COLS, rows: THUMB_ROWS, cell, ox: (w - THUMB_COLS * cell) / 2, oy: (h - THUMB_ROWS * cell) / 2, size, colour, colours: palette().cells, style: settings.style, stickiness: settings.stickiness, diagonals: settings.diagonals, wrap: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Theme editor: pick seven colours (the background and one per colony); themes.ts works out the rest.

const THEME_PREVIEW_COLS = 24;
const THEME_PREVIEW_ROWS = 18;
const THEME_PREVIEW_SPEED = 6;
/** Swatch -1 is the background; 0–5 are the colony colours. */
const BG = -1;

const themeSwatches = el('#themeSwatches');
const themeNote = el('#themeNote');
const themeName = el<HTMLInputElement>('#themeName');
themeName.maxLength = THEME_NAME_MAX;
const themeDelete = el('#themeDelete');
const colourEdit = el('#colourEdit');
const colourPicker = el<HTMLElementTagNameMap['hex-color-picker']>('#colourPicker');
const colourHex = el<HTMLInputElement>('#colourHex');
const colourFix = el('#colourFix');
const colourNote = el('#colourNote');
const themeBoard = miniBoard(el<HTMLCanvasElement>('#themeCv'), THEME_PREVIEW_COLS, THEME_PREVIEW_ROWS);
const themeQuiet = new QuietWatcher();
/** The theme being edited; `editingTheme` is its id once saved, so Save updates instead of adding. */
let draft: CustomTheme = { id: '', name: '', bg: PALETTES.meadow.bg, cells: [...PALETTES.meadow.cells] };
let draftPalette: Palette = derivePalette(draft);
let editingTheme: string | null = null;
/** The colour the picker is open on, or null while it's folded away. */
let colourTarget: number | null = null;
const EDITOR_VARS = ['bg', 'fg', 'panel', 'line', 'muted', 'accent'] as const;

const colourOf = (i: number) => (i === BG ? draft.bg : draft.cells[i]!);
const colourName = (i: number) => (i === BG ? 'Background' : `Colour ${i + 1}`);

const themeSave = el<HTMLButtonElement>('#themeSave');
/** Save is greyed out while a new theme has no name. */
function syncThemeSave(): void {
  themeSave.disabled = editingTheme === null && !themeName.value.trim();
}
themeName.addEventListener('input', syncThemeSave);

function openThemeEditor(theme: CustomTheme | null): void {
  const p = palette();
  editingTheme = theme?.id ?? null;
  // A new theme starts from the colours in use.
  draft = theme ? { ...theme, cells: [...theme.cells] } : { id: '', name: '', bg: p.bg.slice(0, 7).toUpperCase(), cells: p.cells.slice(0, CELL_COUNT).map((c) => c.toUpperCase()) };
  el('#themeTitle').textContent = theme ? 'Edit theme' : 'New theme';
  themeName.value = theme?.name ?? '';
  // A new theme needs a name before it can be saved; an existing one keeps its old name if the field is cleared.
  themeName.placeholder = theme?.name ?? 'Name your theme';
  syncThemeSave();
  themeDelete.hidden = !theme;
  resetSurpriseHistory();
  pickColour(null);
  restartThemePreview();
  stack.openModal(themeDrawer);
}

/** The editor wears the theme being made, so its buttons and panels show it too. */
function paintEditor(p: Palette): void {
  for (const k of EDITOR_VARS) themePanel.style.setProperty(`--app-${k}`, p[k]);
}
function clearEditorColours(): void {
  for (const k of EDITOR_VARS) themePanel.style.removeProperty(`--app-${k}`);
}

/** The seven swatches; the one the picker is open on is pressed. */
function swatchRow(): string {
  return [BG, ...draft.cells.keys()].map((i) => {
    const hex = colourOf(i);
    const weak = i !== BG && hardToSee(hex, draft.bg);
    return `<div class="tsw-col"><button type="button" class="tsw${i === BG ? ' tsw-bg' : ''}" data-colour="${i}" aria-pressed="${colourTarget === i}" aria-controls="colourEdit" style="--c:${hex}" aria-label="${colourName(i)} ${hex}${weak ? ', hard to see' : ''}">`
      + `${weak ? '<span class="tsw-warn" aria-hidden="true">!</span>' : ''}</button><small>${i === BG ? 'Background' : i + 1}</small></div>`;
  }).join('');
}

/** Everything that shows the draft. `fromPicker` leaves the picker alone while it's being dragged. */
function renderEditor(fromPicker = false): void {
  draftPalette = derivePalette(draft);
  paintEditor(draftPalette);
  themeBoard.invalidate();
  themeSwatches.innerHTML = swatchRow();
  const weak = draft.cells.filter((c) => hardToSee(c, draft.bg)).length;
  themeNote.className = weak ? 'theme-note warn' : 'theme-note';
  themeNote.textContent = weak
    ? `${weak} colour${weak > 1 ? 's are' : ' is'} hard to see on the background. Tap ${weak > 1 ? 'one' : 'it'} to fix.`
    : 'Text, panels and the rest are worked out from these seven.';
  colourEdit.hidden = colourTarget === null;
  if (colourTarget === null) return;
  const hex = colourOf(colourTarget);
  el('#colourTitle').textContent = colourName(colourTarget);
  if (!fromPicker) colourPicker.color = hex;
  if (document.activeElement !== colourHex) colourHex.value = hex;
  const cellWeak = colourTarget !== BG && hardToSee(hex, draft.bg);
  colourFix.hidden = !cellWeak;
  colourNote.className = cellWeak ? 'theme-note warn' : 'theme-note';
  colourNote.textContent = cellWeak ? 'Hard to see on this background. Fix contrast changes its lightness and keeps the hue.'
    : colourTarget !== BG ? 'Shows up well on your background.'
      : isDark(hex) ? 'A dark background: text and panels turn light to match.' : 'A light background: text and panels stay dark.';
}

function setColour(hex: string, fromPicker = false): void {
  if (colourTarget === null) return;
  hex = hex.toUpperCase();
  if (hex === colourOf(colourTarget)) return;
  if (colourTarget === BG) draft.bg = hex;
  else draft.cells[colourTarget] = hex;
  renderEditor(fromPicker);
}

/** Open the picker under the swatches on colour `i`, or fold it away (null). */
function pickColour(i: number | null): void {
  colourTarget = i;
  renderEditor();
  if (i !== null) colourEdit.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}

/** Fold the picker away and put focus back on the swatch it was open on. */
function closePicker(): void {
  const was = colourTarget;
  pickColour(null);
  if (was !== null) el<HTMLElement>(`[data-colour="${was}"]`, themeSwatches).focus({ preventScroll: true });
}

themeSwatches.addEventListener('click', (e) => {
  const sw = (e.target as Element).closest<HTMLElement>('[data-colour]');
  if (!sw) return;
  const i = Number(sw.dataset.colour);
  // Tapping the colour that's open folds the picker away.
  pickColour(i === colourTarget ? null : i);
});
el('#colourDone').addEventListener('click', closePicker);
colourPicker.addEventListener('color-changed', (e) => setColour((e as CustomEvent<{ value: string }>).detail.value, true));
colourHex.addEventListener('input', () => {
  const v = colourHex.value.trim();
  const hex = v.startsWith('#') ? v : `#${v}`;
  if (isHex(hex)) setColour(hex);
});
colourHex.addEventListener('blur', () => { if (colourTarget !== null) colourHex.value = colourOf(colourTarget); });
colourFix.addEventListener('click', () => { if (colourTarget !== null) setColour(standOut(colourOf(colourTarget), draft.bg)); });
el('#themeBack').addEventListener('click', () => stack.openModal(setDrawer));
// Seven new colours that go together. It replaces all of them, so the toast can put them back.
// Each press is remembered (only while the editor is open), so back and forward can return to one you liked.
type ThemeColours = Pick<CustomTheme, 'bg' | 'cells'>;
const surpriseHistory: ThemeColours[] = [];
let surpriseAt = -1;
const themeHistBack = el<HTMLButtonElement>('#themeHistBack');
const themeHistFwd = el<HTMLButtonElement>('#themeHistFwd');
const snapshot = (): ThemeColours => ({ bg: draft.bg, cells: [...draft.cells] });

function updateSurpriseNav(): void {
  themeHistBack.disabled = surpriseAt <= 0;
  themeHistFwd.disabled = surpriseAt >= surpriseHistory.length - 1;
}
function resetSurpriseHistory(): void {
  surpriseHistory.length = 0;
  surpriseAt = -1;
  updateSurpriseNav();
}
/** Move through the history. Hand edits made since are kept in the entry being left. */
function stepSurprise(by: number): void {
  const to = surpriseAt + by;
  if (to < 0 || to >= surpriseHistory.length) return;
  surpriseHistory[surpriseAt] = snapshot();
  surpriseAt = to;
  const { bg, cells } = surpriseHistory[to]!;
  Object.assign(draft, { bg, cells: [...cells] });
  updateSurpriseNav();
  renderEditor();
}

el('#themeSurprise').addEventListener('click', () => {
  // A new press after stepping back drops the ones ahead, like a browser's history.
  if (surpriseAt < 0) surpriseAt = 0;
  surpriseHistory.splice(surpriseAt, Infinity, snapshot());
  Object.assign(draft, surpriseTheme());
  surpriseHistory.push(snapshot());
  surpriseAt = surpriseHistory.length - 1;
  updateSurpriseNav();
  renderEditor();
});
themeHistBack.addEventListener('click', () => stepSurprise(-1));
themeHistFwd.addEventListener('click', () => stepSurprise(1));

function restartThemePreview(): void {
  themeBoard.restart();
  themeQuiet.reset();
}
el('#themeSoup').addEventListener('click', restartThemePreview);

/**
 * Called from the main loop while the editor is showing: a soup in the draft's colours. Once it has
 * settled down, thinned out or died for a while, it starts afresh, so there's always colour to judge.
 */
function runThemePreview(now: number): void {
  if (themeBoard.run(now, rule, THEME_PREVIEW_SPEED, draftPalette, { ...settings, mode: 'colonies', wrap: true }) && themeQuiet.update(themeBoard.life.cur)) {
    restartThemePreview();
  }
}

themeSave.addEventListener('click', () => {
  if (themeSave.disabled) return;
  const name = (themeName.value.trim() || themeName.placeholder).slice(0, THEME_NAME_MAX);
  const existing = customThemes.find((t) => t.id === editingTheme);
  const theme: CustomTheme = { id: existing?.id ?? Date.now().toString(36), name, bg: draft.bg, cells: [...draft.cells] };
  if (existing) customThemes[customThemes.indexOf(existing)] = theme;
  else customThemes.push(theme);
  saveThemes(customThemes);
  settings.palette = themeKey(theme);
  save();
  applyTheme();
  stack.openModal(setDrawer);
  toast(`Saved ${name}`);
});

themeDelete.addEventListener('click', () => {
  const at = customThemes.findIndex((t) => t.id === editingTheme);
  if (at < 0) return;
  const [gone] = customThemes.splice(at, 1);
  const wasInUse = settings.palette === themeKey(gone!);
  saveThemes(customThemes);
  applyTheme(); // a deleted theme in use falls back to Meadow
  stack.openModal(setDrawer);
  toast(`Deleted ${gone!.name}`, {
    label: 'Undo',
    run: () => {
      customThemes.splice(Math.min(at, customThemes.length), 0, gone!);
      saveThemes(customThemes);
      if (wasInUse) {
        settings.palette = themeKey(gone!);
        save();
      }
      applyTheme();
    },
  });
});

// ---------------------------------------------------------------------------------------------
// Sharing

async function share(): Promise<void> {
  const fragment = encodeBoard(life, settings.rule);
  if (!fragment) {
    toast('Draw something to share');
    return;
  }
  // In the app the page lives at capacitor://localhost, so links point at the web version instead.
  const url = isNative ? `${PUBLIC_URL}#${fragment}` : `${location.origin}${location.pathname}#${fragment}`;
  history.replaceState(null, '', `#${fragment}`);
  if (await nativeShare(url)) return;
  // Phones get the share sheet; elsewhere the link goes to the clipboard.
  if (matchMedia('(pointer: coarse)').matches && navigator.share) {
    try {
      await navigator.share({ title: 'Bloop Life pattern', url });
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
    if (activeDemo) closeDemo();
    else if (pops.some((p) => !p.hidden)) closePops(true);
    else if (colourTarget !== null && themeDrawer.isOpen) closePicker();
    else if (!labInfo.hidden) showLabInfo(false);
    else stack.topModal()?.setOpen(false);
    return;
  }
  if (stack.topModal() || activeDemo) return;
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
// Demos: the (i) beside a slider or rule row opens a sheet with an animated scene (demos.ts).

const demoSheet = el('#demoSheet');
const demoScrim = el('#demoScrim');
const demoBody = el('#demoBody');
const demos = new Map<DemoKey, Demo>();
let activeDemo: Demo | null = null;
/** Where focus goes back to when the sheet closes. */
let demoOpener: HTMLElement | null = null;
/** While the sheet is open everything else is inert; this remembers what already was. */
let inertBefore = new Map<HTMLElement, boolean>();

const demoHost: DemoHost = {
  palette,
  style: () => settings.style,
  value: (key) => {
    if (key === 'speed') return Math.max(0, SPEED_STEPS.indexOf(settings.speed));
    if (key === 'labSpeed') return Math.max(0, SPEED_STEPS.indexOf(settings.labSpeed));
    if (key === 'brush') return settings.brushStep;
    return settings[key];
  },
  // From the lab, the rule being made there; anywhere else, the board's.
  rule: () => (labDrawer.isOpen ? labRule : rule),
  reducedMotion: () => reducedMotion.matches,
};

function openDemo(button: HTMLElement): void {
  const key = button.dataset.demo as DemoKey;
  // A pop-up closes for the sheet, so focus comes back to the rail button that opened it.
  const pop = button.closest<HTMLElement>('.pop');
  demoOpener = pop ? popButtons.find((b) => b.dataset.pop === pop.id) ?? null : button;
  if (pop) closePops();
  let demo = demos.get(key);
  if (!demo) {
    demo = createDemo(key, demoHost);
    demos.set(key, demo);
  }
  el('#demoTitle').textContent = demo.title;
  demoBody.replaceChildren(demo.el);
  inertBefore = new Map();
  for (const child of app.children) {
    if (child instanceof HTMLElement && child !== demoSheet && child !== demoScrim) {
      inertBefore.set(child, child.inert);
      child.inert = true;
    }
  }
  demoSheet.hidden = false;
  demoScrim.hidden = false;
  demoSheet.scrollTop = 0;
  demo.shown(button.dataset.start);
  activeDemo = demo;
  el<HTMLElement>('[data-demo-close]', demoSheet).focus({ preventScroll: true });
}

function closeDemo(): void {
  if (!activeDemo) return;
  activeDemo = null;
  demoSheet.hidden = true;
  demoScrim.hidden = true;
  for (const [child, was] of inertBefore) child.inert = was;
  demoOpener?.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const opener = t.closest<HTMLElement>('[data-demo]');
  if (opener) {
    openDemo(opener);
  } else if (t.closest('[data-demo-close]') || t === demoScrim) {
    closeDemo();
  }
});

// ---------------------------------------------------------------------------------------------
// Start

applyTheme();
setBoardRule(settings.rule);
followBoardRule();
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

// The styles are in, so show the app under the loading screen (index.html), then fade that out
// once the board has drawn its first frame.
document.documentElement.classList.remove('booting');
requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 400);
})));

// The app ships its files inside itself, so only the web version needs the offline worker.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isNative) {
  const register = () => { void navigator.serviceWorker.register('./sw.js'); };
  // main.ts now loads after boot.ts, possibly after the page's load event has already fired.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
