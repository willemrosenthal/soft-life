#!/usr/bin/env node
/**
 * Draws the app icons into public/icons/: three cells in an L, merged into one blob with the same
 * circle-and-neck geometry the board uses (src/render.ts), on the Meadow background.
 *   node scripts/make-icons.mjs
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const BG = [0xf3, 0xf5, 0xef];
const INK = [0x3e, 0x9a, 0x47];
const RADIUS = 0.47;
const WAIST = 0.29;
/** Cell centres, in cell units. */
const CELLS = [[0, 0], [1, 0], [1, 1]];

// Neck between two touching cells (one cell apart), from render.ts's neck(): its sides are arcs
// of radius f centred at (h, ±d), between the tangent points at x = h·q and 1 − h·q.
const f = (0.25 + WAIST * WAIST - RADIUS * RADIUS) / (2 * (RADIUS - WAIST));
const d = WAIST + f;
const q = RADIUS / (RADIUS + f);
const h = 0.5;
function inNeck(along, across) {
  if (along < h * q || along > 1 - h * q) return false;
  const dx = along - h;
  return Math.abs(across) <= d - Math.sqrt(f * f - dx * dx);
}
function inside(x, y) {
  for (const [cx, cy] of CELLS) if ((x - cx) ** 2 + (y - cy) ** 2 <= RADIUS * RADIUS) return true;
  for (const [ax, ay] of CELLS) {
    for (const [bx, by] of CELLS) {
      if (bx === ax + 1 && by === ay && inNeck(x - ax, y - ay)) return true;
      if (bx === ax && by === ay + 1 && inNeck(y - ay, x - ax)) return true;
    }
  }
  return false;
}

/** `scale`: the blob's width as a share of the icon (smaller for maskable icons, which get cropped). */
function icon(size, scale) {
  const extent = 1 + 2 * RADIUS; // the L spans this many cell units
  const unit = (size * scale) / extent;
  const SS = 4; // 4×4 samples per pixel for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxi + (sx + 0.5) / SS - size / 2) / unit + 0.5;
          const y = (py + (sy + 0.5) / SS - size / 2) / unit + 0.5;
          if (inside(x, y)) hits++;
        }
      }
      const a = hits / (SS * SS);
      const o = (py * size + pxi) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(BG[k] + (INK[k] - BG[k]) * a);
      px[o + 3] = 255;
    }
  }
  return png(size, px);
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = ~0; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const [name, size, scale] of [['icon-192', 192, 0.62], ['icon-512', 512, 0.62], ['maskable-512', 512, 0.48], ['apple-touch-icon', 180, 0.58]]) {
  writeFileSync(new URL(`${name}.png`, OUT), icon(size, scale));
}
console.log('Wrote icons to public/icons/');
