import { describe, expect, it } from 'vitest';
import { Drawer } from '../src/drawers';

/** Just enough of an element for a Drawer: a width, a style, a class list and `inert`. */
function fakePanel(width = 300) {
  return { offsetWidth: width, style: { transform: '' }, classList: { toggle: () => {} }, inert: false } as unknown as HTMLElement;
}

describe('Drawer', () => {
  it('reports opening and closing, but only real changes', () => {
    const seen: boolean[] = [];
    const d = new Drawer(fakePanel(), true, (open) => seen.push(open));
    d.setOpen(true);
    d.setOpen(true);
    d.setOpen(false);
    expect(seen).toEqual([true, false]);
  });

  it('settles by position when let go slowly, and by direction when flicked', () => {
    const d = new Drawer(fakePanel(300), true);
    d.drag(200);
    d.release(0);
    expect(d.isOpen).toBe(true);

    d.drag(100);
    d.release(0);
    expect(d.isOpen).toBe(false);

    d.drag(60); // barely out, but flicked open
    d.release(1.2);
    expect(d.isOpen).toBe(true);
  });

  it('gives a little past fully open, never past closed, and is inert while closed', () => {
    const el = fakePanel(300);
    const d = new Drawer(el, false);
    d.drag(400);
    expect(d.openPx).toBe(325);
    d.drag(-50);
    expect(d.openPx).toBe(0);
    d.setOpen(false);
    expect(el.inert).toBe(true);
    d.setOpen(true);
    expect(el.inert).toBe(false);
  });
});
