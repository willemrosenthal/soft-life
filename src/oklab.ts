/**
 * OKLab: a colour space where equal steps look equal, so mixing two colours in it keeps the middle
 * as bright and clean as the ends (an RGB average of pink and green goes grey-brown).
 */

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** #RRGGBB (or #RRGGBBAA) → [L, a, b]. */
export function hexToOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16); // any alpha digits are ignored
  const r = toLinear(((n >> 16) & 255) / 255);
  const g = toLinear(((n >> 8) & 255) / 255);
  const b = toLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** A colour as lightness (0–1), chroma (colourfulness, 0 to about 0.37) and hue (degrees). */
export interface Lch { l: number; c: number; h: number }

export function hexToLch(hex: string): Lch {
  const [l, a, b] = hexToOklab(hex);
  return { l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** Lch → #RRGGBB. Colours a screen can't show lose chroma until they fit, keeping lightness and hue. */
export function lchToHex({ l, c, h }: Lch): string {
  const hr = (h * Math.PI) / 180;
  for (let cc = Math.max(0, c); ; cc = Math.max(0, cc - 0.005)) {
    const a = cc * Math.cos(hr);
    const b = cc * Math.sin(hr);
    const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const rgb = [
      4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
      -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
      -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
    ];
    if (cc === 0 || rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) {
      return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    }
  }
}

/** How different two colours look, counting lightness and colourfulness: their distance in OKLab. */
export function difference(x: string, y: string): number {
  const [l1, a1, b1] = hexToOklab(x);
  const [l2, a2, b2] = hexToOklab(y);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** WCAG contrast ratio, 1 (same) to 21 (black on white). Lightness only. */
export function contrast(x: string, y: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1, 7), 16);
    return 0.2126 * toLinear(((n >> 16) & 255) / 255) + 0.7152 * toLinear(((n >> 8) & 255) / 255) + 0.0722 * toLinear((n & 255) / 255);
  };
  const [a, b] = [lum(x), lum(y)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
