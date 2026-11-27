/**
 * Drawers that slide in from the right edge over the board. The board never resizes for them.
 *
 * A drawer follows the finger while it's dragged and, when let go, opens or closes depending on
 * where it was and how fast it was moving. Modal drawers (patterns, settings) dim the board behind
 * a shade; a tap on the shade closes them. The tool rail is a non-modal drawer: the board stays
 * usable while it's out.
 */

/** Width of the strip along the right edge that opens the edge drawer when swiped. */
const EDGE = 18;
/** How far a press must move before it counts as a swipe (px). */
const SLOP = 6;
/** How far ahead a flick carries the drawer, per px/ms of speed. */
const FLING = 220;
/** Extra distance past the edge for closed drawers: more than their shadow's reach. */
const CLOSED_EXTRA = 72;

export class Drawer {
  /** How far open, in px (0 = closed, `width` = open). */
  private p = 0;
  private target = false;
  /** Set by the stack: called whenever the drawer moves. */
  moved: (animate: boolean) => void = () => {};

  constructor(
    readonly el: HTMLElement,
    readonly modal: boolean,
    /** Called when the drawer settles open or closed (not during a drag). */
    private readonly onToggle: (open: boolean) => void = () => {},
  ) {}

  get isOpen(): boolean { return this.target; }
  get width(): number { return this.el.offsetWidth; }
  /** 0 (closed) to 1 (open), for the shade. */
  get amount(): number { return this.width ? Math.min(1, this.p / this.width) : 0; }
  get openPx(): number { return this.p; }

  setOpen(open: boolean, animate = true): void {
    const changed = open !== this.target;
    this.target = open;
    this.p = open ? this.width : 0;
    this.place(animate);
    if (changed) this.onToggle(open);
  }

  toggle(): void { this.setOpen(!this.target); }

  /** Follow a drag: `p` px open. A little give past fully open. */
  drag(p: number): void {
    const w = this.width;
    this.p = p > w ? w + (p - w) * 0.25 : Math.max(0, p);
    this.place(false);
  }

  /** Finish a drag; `velocity` in px/ms, positive while opening. */
  release(velocity: number): void {
    this.setOpen(this.p + velocity * FLING > this.width / 2);
  }

  /** Re-place after the screen changes size, without animating. */
  refit(): void { this.setOpen(this.target, false); }

  private place(animate: boolean): void {
    const { el } = this;
    el.classList.toggle('animating', animate);
    // Closed drawers sit further out than their own width, so their shadow doesn't peek in.
    el.style.transform = `translateX(${this.width - this.p + (this.p < 0.5 ? CLOSED_EXTRA : 0)}px)`;
    el.inert = !this.target && this.p < 0.5;
    this.moved(animate);
  }
}

interface Gesture {
  drawer: Drawer;
  pointerId: number;
  x0: number;
  y0: number;
  p0: number;
  /** What a press without a swipe does. */
  tap: 'toggle' | 'close' | 'edge' | null;
  dragging: boolean;
  down: PointerEvent;
  samples: [number, number][];
}

export interface StackOptions {
  /** The drawer the right edge of the board opens. */
  edgeDrawer: Drawer;
  /** The board's canvas: presses on its right edge may open the edge drawer. */
  canvas: HTMLElement;
  /**
   * A press on the board's right edge turned out not to be a swipe: hand it back as drawing.
   * `ended` is true for a plain tap (the pointer is already up).
   */
  onEdgeDraw: (down: PointerEvent, ended: boolean) => void;
}

/**
 * Owns the drawers, the shade and the swipe gestures. Swipe sources:
 *  - an element with `data-drag="<drawer id>"` (with `data-tap-toggle`, a tap opens or closes it);
 *  - anywhere inside an open modal drawer, to swipe it shut;
 *  - the shade (a tap closes);
 *  - the board's right edge, for the edge drawer.
 */
export class DrawerStack {
  private readonly drawers = new Map<string, Drawer>();
  private g: Gesture | null = null;
  private suppressClick = false;

  constructor(private readonly root: HTMLElement, private readonly shade: HTMLElement, private readonly opts: StackOptions) {
    root.addEventListener('pointerdown', this.onDown, true);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onUp);
    root.addEventListener('click', (e) => {
      if (!this.suppressClick) return;
      this.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    window.addEventListener('resize', () => { for (const d of this.drawers.values()) d.refit(); });
  }

  add(id: string, drawer: Drawer): Drawer {
    this.drawers.set(id, drawer);
    drawer.el.dataset.drawer = id;
    drawer.moved = (animate) => this.updateShade(animate);
    drawer.refit();
    return drawer;
  }

  /** Open one modal drawer, closing any other. */
  openModal(drawer: Drawer): void {
    for (const d of this.drawers.values()) if (d.modal && d !== drawer && d.isOpen) d.setOpen(false);
    drawer.setOpen(true);
  }

  /** The open modal drawer, if any. */
  topModal(): Drawer | undefined {
    return [...this.drawers.values()].filter((d) => d.modal && d.amount > 0).sort((a, b) => b.amount - a.amount)[0];
  }

  private updateShade(animate: boolean): void {
    const a = Math.max(0, ...[...this.drawers.values()].filter((d) => d.modal).map((d) => d.amount));
    this.shade.classList.toggle('animating', animate);
    this.shade.style.opacity = String(a);
    this.shade.style.pointerEvents = a > 0.02 ? 'auto' : 'none';
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (e.button > 0 || this.g) return;
    const t = e.target as Element;
    // Controls that drag sideways keep the gesture: a swipe on them must not move the drawer.
    if (t.closest('input[type="range"], input[type="search"], input[type="text"], hex-color-picker')) return;
    let drawer: Drawer | undefined;
    let tap: Gesture['tap'] = null;
    const handle = t.closest<HTMLElement>('[data-drag]');
    const inside = t.closest<HTMLElement>('[data-drawer]');
    if (t === this.shade) {
      drawer = this.topModal();
      tap = 'close';
    } else if (handle) {
      drawer = this.drawers.get(handle.dataset.drag!);
      tap = handle.hasAttribute('data-tap-toggle') ? 'toggle' : null;
    } else if (inside) {
      const d = this.drawers.get(inside.dataset.drawer!);
      if (d?.modal) drawer = d;
    } else if (t === this.opts.canvas && !this.opts.edgeDrawer.isOpen && e.clientX > this.root.getBoundingClientRect().right - EDGE) {
      drawer = this.opts.edgeDrawer;
      tap = 'edge';
    }
    if (!drawer) return;
    // The shade and the board's edge belong to the drawer: keep the press from drawing.
    if (t === this.shade || tap === 'edge') e.stopPropagation();
    this.g = { drawer, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, p0: drawer.openPx, tap, dragging: false, down: e, samples: [[e.timeStamp, drawer.openPx]] };
  };

  private readonly onMove = (e: PointerEvent): void => {
    const g = this.g;
    if (!g || e.pointerId !== g.pointerId) return;
    const open = g.x0 - e.clientX; // dragging left opens a right-hand drawer
    const cross = e.clientY - g.y0;
    if (!g.dragging) {
      if (Math.abs(open) > SLOP && Math.abs(open) > Math.abs(cross)) {
        g.dragging = true;
        this.root.setPointerCapture(e.pointerId);
      } else if (Math.abs(cross) > SLOP * 2) {
        // A vertical move: not a swipe. On the board's edge that's the start of a stroke.
        this.g = null;
        if (g.tap === 'edge') this.opts.onEdgeDraw(g.down, false);
        return;
      } else {
        return;
      }
    }
    g.drawer.drag(g.p0 + open);
    g.samples.push([e.timeStamp, g.drawer.openPx]);
    if (g.samples.length > 5) g.samples.shift();
  };

  private readonly onUp = (e: PointerEvent): void => {
    const g = this.g;
    if (!g || e.pointerId !== g.pointerId) return;
    this.g = null;
    if (g.dragging) {
      const [t0, p0] = g.samples[0]!;
      const [t1, p1] = g.samples[g.samples.length - 1]!;
      g.drawer.release(t1 > t0 ? (p1 - p0) / (t1 - t0) : 0);
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 0);
      return;
    }
    if (e.type === 'pointercancel') return;
    if (g.tap === 'toggle') g.drawer.toggle();
    else if (g.tap === 'close') g.drawer.setOpen(false);
    else if (g.tap === 'edge') this.opts.onEdgeDraw(g.down, true);
  };
}
