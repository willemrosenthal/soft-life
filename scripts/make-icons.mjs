#!/usr/bin/env node
/**
 * Draws the app icons into public/icons/: three cells in an L, merged into one blob with the same
 * circle-and-neck geometry the board uses (src/render.ts), on the Meadow background. The corner cell
 * has a critter eye (src/critters.ts) glancing down at the tail.
 *   node scripts/make-icons.mjs
 */
import { existsSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const BG = [0xf3, 0xf5, 0xef];
const INK = [0x3e, 0x9a, 0x47];
const RADIUS = 0.47;
const WAIST = 0.29;
/** Cell centres, in cell units. */
const CELLS = [[0, 0], [1, 0], [1, 1]];

// The eye, sized like Eye.draw in critters.ts (eye 0.437 of a cell, white 0.78 of the eye, pupil
// 0.146 of a cell), a little larger, with the pupil pushed toward the tail.
const WHITE = [0xff, 0xff, 0xff];
const PUPIL = [0x16, 0x16, 0x16];
const EYE_AT = [1, 0];
const EYE_SIZE = 1.08;
const EYE_WHITE = 0.437 * EYE_SIZE * 0.78;
const EYE_PUPIL = 0.146 * EYE_SIZE;
const GLANCE = [-0.55, 0.75];
const REACH = EYE_WHITE - EYE_PUPIL - 0.012;
const PUPIL_AT = [EYE_AT[0] + GLANCE[0] * REACH, EYE_AT[1] + GLANCE[1] * REACH];

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

/** The colour at a point, in cell units. */
function colourAt(x, y) {
  if ((x - PUPIL_AT[0]) ** 2 + (y - PUPIL_AT[1]) ** 2 <= EYE_PUPIL * EYE_PUPIL) return PUPIL;
  if ((x - EYE_AT[0]) ** 2 + (y - EYE_AT[1]) ** 2 <= EYE_WHITE * EYE_WHITE) return WHITE;
  return inside(x, y) ? INK : BG;
}

/** `scale`: the blob's width as a share of the icon (smaller for maskable icons, which get cropped). */
function icon(size, scale, opaque = false) {
  const extent = 1 + 2 * RADIUS; // the L spans this many cell units
  const unit = (size * scale) / extent;
  const SS = 4; // 4×4 samples per pixel for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (pxi + (sx + 0.5) / SS - size / 2) / unit + 0.5;
          const y = (py + (sy + 0.5) / SS - size / 2) / unit + 0.5;
          const c = colourAt(x, y);
          for (let k = 0; k < 3; k++) sum[k] += c[k];
        }
      }
      const o = (py * size + pxi) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(sum[k] / (SS * SS));
      px[o + 3] = 255;
    }
  }
  return png(size, px, opaque);
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
/** `opaque`: write RGB with no alpha channel, which the App Store requires of the app icon. */
function png(size, rgba, opaque = false) {
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc((size * ch + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let k = 0; k < ch; k++) raw[y * (size * ch + 1) + 1 + x * ch + k] = rgba[(y * size + x) * 4 + k];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = opaque ? 2 : 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const [name, size, scale] of [['icon-192', 192, 0.64], ['icon-512', 512, 0.64], ['maskable-512', 512, 0.48], ['apple-touch-icon', 180, 0.58]]) {
  writeFileSync(new URL(`${name}.png`, OUT), icon(size, scale));
}
console.log('Wrote icons to public/icons/');

// The iOS app (once `npx cap add ios` has made ios/): the App Store icon and the launch screen.
const IOS = new URL('../ios/App/App/Assets.xcassets/', import.meta.url);
if (existsSync(IOS)) {
  writeFileSync(new URL('AppIcon.appiconset/AppIcon-512@2x.png', IOS), icon(1024, 0.64, true));
  const splash = icon(2732, 0.1, true);
  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    writeFileSync(new URL(`Splash.imageset/${name}`, IOS), splash);
  }
  console.log('Wrote the iOS app icon and launch screen');
}
