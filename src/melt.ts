/**
 * Colour melt: the goo style with different colours allowed to join. Drawn per pixel on the GPU,
 * since the colour changes smoothly across a join, which one flat fill per colour can't do.
 *
 * The fields are the same as slime.ts: each live cell adds a lump to its own colour's field. The
 * shape is the strongest colour's field plus `melt` × all the others, so at melt 0 it is exactly
 * the plain goo outline and at 1 colours join as freely as one colour does. The colour is the
 * colours mixed in OKLab, weighted by their fields, with the weaker colours' share also scaled by
 * melt so the blend fades in with the joins.
 *
 * Needs WebGL 2. Without it (or after the context is lost) `MeltRenderer.create` returns null, or
 * `draw` returns false, and the caller draws plain goo instead.
 */

import { hexToOklab } from './oklab';
import { BLOCK_LUMP_REACH, blockLump, diagonalLump, diagonalStrand, reachFor, thresholdFor, type SlimeLayer } from './slime';

export const MELT_MIN = 0;
export const MELT_MAX = 100;
export const GAPS_MIN = 0;
export const GAPS_MAX = 100;

/** Most colours a palette has (colonies: 6). */
const MAX_COLOURS = 8;
/** GPU pixels per CSS pixel, at most: past 2× the extra sharpness isn't visible, only the cost is. */
const MAX_SCALE = 2;
/** How quickly one colour gives way to the next: 1 is a straight mix of the fields; higher is crisper. */
const BLEND = 1.3;

/**
 * Strength of the lump in the middle of a mixed-colour block, for a gaps setting of 0 to 100. From 0
 * to 50 it goes from filling the pinhole to leaving it alone; past 50 it turns negative and opens
 * the hole wider. The negative side is much gentler and eases in: the middle of a mixed block is
 * already just under the edge level, so even a small push opens a big hole.
 */
export function mixedLumpFor(gaps: number): number {
  const t = gaps / GAPS_MAX;
  const u = 2 * t - 1;
  return t <= 0.5 ? -u : -0.15 * u * u;
}

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uCells; // per cell: size, colour index, block lump, mixed-colour block lump
uniform highp sampler2D uDiag;  // per cell: strand to the cell down-right, and down-left (0 = none)
uniform float uStrandReach;
uniform float uStrandWeight;
uniform ivec2 uGrid;
uniform vec2 uOrigin;           // grid's top-left, in GPU pixels
uniform float uCell;            // GPU pixels per cell
uniform float uHeight;
uniform float uReach;
uniform float uThreshold;
uniform float uMelt;
uniform float uLumpReach;
uniform bool uWrap;
uniform int uCount;
uniform vec3 uLab[${MAX_COLOURS}];
out vec4 outColor;

float toSrgb(float c) {
  c = max(c, 0.0);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 oklabToSrgb(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
}

// ∫ (a² - t²)³ dt. Plain products: pow() is undefined for negative t.
float strandG(float t, float a2) {
  float t2 = t * t;
  return t * (a2 * a2 * a2 - a2 * a2 * t2 + 0.6 * a2 * t2 * t2 - t2 * t2 * t2 / 7.0);
}

// A strand from a cell's centre to its diagonal neighbour at (dir, 1); p is relative to the centre.
// Must match strandLevel in slime.ts.
float strand(vec2 p, float dir) {
  float s = (p.x * dir + p.y) * 0.70710678;
  float r2 = uStrandReach * uStrandReach;
  float h2 = dot(p, p) - s * s;
  if (h2 >= r2) return 0.0;
  float a2 = r2 - h2;
  float a = sqrt(a2);
  float t0 = max(0.0, s - a) - s;
  float t1 = min(1.41421356, s + a) - s;
  if (t1 <= t0) return 0.0;
  return uStrandWeight * 0.70710678 * (strandG(t1, a2) - strandG(t0, a2)) / (r2 * r2 * r2);
}

void main() {
  vec2 g = (vec2(gl_FragCoord.x, uHeight - gl_FragCoord.y) - uOrigin) / uCell;
  ivec2 base = ivec2(floor(g));
  float F[${MAX_COLOURS}];
  for (int k = 0; k < ${MAX_COLOURS}; k++) F[k] = 0.0;
  float mixed = 0.0; // lumps in the middle of mixed-colour blocks (negative opens a gap): shape only
  // A lump reaches at most 1.35 cells, and a strand 1.95 from its cell's centre, so cells two away
  // in each direction are enough.
  for (int dy = -2; dy <= 2; dy++) {
    for (int dx = -2; dx <= 2; dx++) {
      ivec2 c = base + ivec2(dx, dy);
      ivec2 t = c;
      if (uWrap) t = (c + uGrid * 4) % uGrid; // kept positive: % of a negative is undefined
      else if (c.x < 0 || c.y < 0 || c.x >= uGrid.x || c.y >= uGrid.y) continue;
      vec4 cell = texelFetch(uCells, t, 0);
      if (cell.r <= 0.02) continue;
      float r = uReach * cell.r;
      vec2 d = g - (vec2(c) + 0.5);
      float q = 1.0 - dot(d, d) / (r * r);
      float add = q > 0.0 ? q * q * q : 0.0;
      if (cell.b != 0.0 || cell.a != 0.0) { // a is negative when opening gaps
        vec2 e = g - (vec2(c) + 1.0);
        float ql = max(0.0, 1.0 - dot(e, e) / (uLumpReach * uLumpReach));
        add += cell.b * ql * ql * ql;
        mixed += cell.a * ql * ql * ql;
      }
      vec2 diag = texelFetch(uDiag, t, 0).rg;
      if (diag.x > 0.0) add += diag.x * strand(d, 1.0);
      if (diag.y > 0.0) add += diag.y * strand(d, -1.0);
      F[int(cell.g + 0.5)] += add;
    }
  }
  float top = 0.0;
  float sum = 0.0;
  int lead = 0;
  for (int k = 0; k < ${MAX_COLOURS}; k++) {
    if (k >= uCount) break;
    sum += F[k];
    if (F[k] > top) { top = F[k]; lead = k; }
  }
  float shape = top + uMelt * (sum - top + mixed);
  // Antialiased edge, about a pixel wide. fwidth must run before any early return.
  float alpha = clamp((shape - uThreshold) / max(fwidth(shape), 1e-4) + 0.5, 0.0, 1.0);
  if (alpha <= 0.0) { outColor = vec4(0.0); return; }
  vec3 lab = vec3(0.0);
  float total = 0.0;
  for (int k = 0; k < ${MAX_COLOURS}; k++) {
    if (k >= uCount) break;
    if (F[k] <= 0.0) continue;
    float w = pow(F[k], ${BLEND.toFixed(2)}) * (k == lead ? 1.0 : uMelt);
    lab += w * uLab[k];
    total += w;
  }
  outColor = vec4(oklabToSrgb(lab / total) * alpha, alpha); // premultiplied
}`;

export interface MeltLayer extends SlimeLayer {
  colours: readonly string[];
  /** 0 to 100, as in settings. */
  stickiness: number;
  /** 0 to 100, as in settings. */
  melt: number;
  /** 0 to 100, as in settings: how strongly diagonal neighbours of one colour join. */
  diagonals: number;
  /**
   * 0 to 100, as in settings: the holes where four cells of mixed colours meet. 0 fills them,
   * 50 leaves the field as it is (small pinholes), 100 pushes them open wider.
   */
  gaps: number;
}

export class MeltRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly texture: WebGLTexture;
  private readonly diagTexture: WebGLTexture;
  private readonly u: Record<string, WebGLUniformLocation | null>;
  private cells = new Float32Array(0);
  private diag = new Float32Array(0);
  private texCols = 0;
  private texRows = 0;
  private labKey = '';
  private lost = false;

  /** Null when WebGL 2 isn't available or the shader won't build. */
  static create(): MeltRenderer | null {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
      return gl ? new MeltRenderer(canvas, gl) : null;
    } catch (e) {
      console.warn('Colour melt unavailable:', e);
      return null;
    }
  }

  private constructor(private readonly canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = link(gl, VERTEX, FRAGMENT);
    gl.useProgram(this.program);
    // One triangle that covers the screen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const texture = () => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    this.texture = texture();
    this.diagTexture = texture();
    const names = ['uCells', 'uDiag', 'uStrandReach', 'uStrandWeight', 'uGrid', 'uOrigin', 'uCell', 'uHeight', 'uReach', 'uThreshold', 'uMelt', 'uLumpReach', 'uWrap', 'uCount', 'uLab'];
    this.u = Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(this.program, n)]));
    gl.uniform1i(this.u.uCells!, 0);
    gl.uniform1i(this.u.uDiag!, 1);
    canvas.addEventListener('webglcontextlost', () => { this.lost = true; });
  }

  /**
   * Draw the cells onto `ctx`, which is `width` × `height` CSS pixels. Returns false (drawing
   * nothing) if WebGL has gone away, so the caller can fall back.
   */
  draw(ctx: CanvasRenderingContext2D, g: MeltLayer, width: number, height: number): boolean {
    const { gl } = this;
    if (this.lost || gl.isContextLost()) return false;
    const { cols, rows, size, colour } = g;
    if (g.colours.length > MAX_COLOURS) return false;

    const scale = Math.min(MAX_SCALE, ctx.canvas.width / width);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);

    // Cells as a float texture: size, colour, and the lump in the middle of the block it starts:
    // in its own colour if the block is all one colour, else shape-only. Four cells of mixed
    // colours leave a pinhole in the middle; that lump fills it, or makes it wider when negative.
    const n = cols * rows;
    if (this.cells.length !== n * 4) this.cells = new Float32Array(n * 4);
    const data = this.cells;
    const mixedLump = mixedLumpFor(g.gaps);
    if (this.diag.length !== n * 2) this.diag = new Float32Array(n * 2);
    const diag = this.diag;
    const strand = diagonalStrand(g.diagonals);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const s = size[i]!;
        data[i * 4] = s;
        data[i * 4 + 1] = colour[i]!;
        const same = s > 0 ? blockLump(g, x, y) : 0;
        data[i * 4 + 2] = same;
        data[i * 4 + 3] = s > 0 && !same && mixedLump !== 0 ? mixedLump * blockLump(g, x, y, false) : 0;
        diag[i * 2] = strand && s > 0 ? diagonalLump(g, x, y, 1) : 0;
        diag[i * 2 + 1] = strand && s > 0 ? diagonalLump(g, x, y, -1) : 0;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    const resized = cols !== this.texCols || rows !== this.texRows;
    if (resized) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cols, rows, 0, gl.RGBA, gl.FLOAT, data);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.FLOAT, data);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.diagTexture);
    if (resized) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, cols, rows, 0, gl.RG, gl.FLOAT, diag);
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RG, gl.FLOAT, diag);
    this.texCols = cols;
    this.texRows = rows;

    const key = g.colours.join();
    if (key !== this.labKey) {
      const lab = new Float32Array(MAX_COLOURS * 3);
      g.colours.forEach((hex, k) => lab.set(hexToOklab(hex), k * 3));
      gl.uniform3fv(this.u.uLab!, lab);
      this.labKey = key;
    }
    const reach = reachFor(g.stickiness);
    const { u } = this;
    gl.uniform2i(u.uGrid!, cols, rows);
    gl.uniform2f(u.uOrigin!, g.ox * scale, g.oy * scale);
    gl.uniform1f(u.uCell!, g.cell * scale);
    gl.uniform1f(u.uHeight!, h);
    gl.uniform1f(u.uReach!, reach);
    gl.uniform1f(u.uThreshold!, thresholdFor(reach));
    gl.uniform1f(u.uMelt!, g.melt / MELT_MAX);
    gl.uniform1f(u.uLumpReach!, BLOCK_LUMP_REACH);
    gl.uniform1f(u.uStrandReach!, strand?.reach ?? 1);
    gl.uniform1f(u.uStrandWeight!, strand?.weight ?? 0);
    gl.uniform1i(u.uWrap!, g.wrap ? 1 : 0);
    gl.uniform1i(u.uCount!, g.colours.length);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    ctx.drawImage(this.canvas, 0, 0, width, height);
    return true;
  }
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader failed');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed');
  return p;
}
