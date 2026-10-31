// Geometry builder: flat-shaded triangles with per-vertex colour and extra attributes,
// plus the low-poly prop shapes (lamps, palms, trees, cranes) used across the city.
import * as THREE from "./three.module.min.js";
import { hex } from "./util.js";

export class Geo {
  constructor(extras = {}) {
    this.pos = []; this.nrm = []; this.col = [];
    this.size = extras;
    this.ex = {};
    this.e = {};
    for (const k in extras) { this.ex[k] = []; this.e[k] = new Array(extras[k]).fill(0); }
  }

  get count() { return this.pos.length / 3; }

  vert(p, n, c) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    for (const k in this.size) { const v = this.e[k], a = this.ex[k]; for (let i = 0; i < v.length; i++) a.push(v[i]); }
  }

  // Triangle with a flat normal; uvs optionally per vertex.
  tri(a, b, c, col, uvs) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const n = [nx / l, ny / l, nz / l];
    const pts = [a, b, c];
    for (let i = 0; i < 3; i++) {
      if (uvs && this.e.uv) this.e.uv = uvs[i];
      this.vert(pts[i], n, col);
    }
  }

  // Quad a-b-c-d; flips winding so the face points along `out` when given.
  quad(a, b, c, d, col, uvs, out) {
    if (out) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * out[0] + ny * out[1] + nz * out[2] < 0) {
        [b, d] = [d, b];
        if (uvs) uvs = [uvs[0], uvs[3], uvs[2], uvs[1]];
      }
    }
    this.tri(a, b, c, col, uvs && [uvs[0], uvs[1], uvs[2]]);
    this.tri(a, c, d, col, uvs && [uvs[0], uvs[2], uvs[3]]);
  }

  // Axis-aligned box in a local frame (yaw about y, then translate).
  box(cx, cy, cz, sx, sy, sz, col, yaw = 0, ox = 0, oy = 0, oz = 0, skip = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (x, y, z) => {
      const lx = cx + x, lz = cz + z;
      return [ox + lx * c + lz * s, oy + cy + y, oz - lx * s + lz * c];
    };
    const R = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz), P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)];
    this.quad(v[0], v[1], v[2], v[3], col, null, R(0, 0, -1));
    this.quad(v[5], v[4], v[7], v[6], col, null, R(0, 0, 1));
    this.quad(v[4], v[0], v[3], v[7], col, null, R(-1, 0, 0));
    this.quad(v[1], v[5], v[6], v[2], col, null, R(1, 0, 0));
    if (!skip.top) this.quad(v[3], v[2], v[6], v[7], col, null, [0, 1, 0]);
    if (!skip.bottom) this.quad(v[4], v[5], v[1], v[0], col, null, [0, -1, 0]);
  }

  // Hexahedron from 8 corners (bottom 4 then top 4, counter-clockwise from above).
  hexa(v, col, cols) {
    const C = (i) => (cols && cols[i] != null ? cols[i] : col);
    const ctr = [0, 1, 2].map((k) => v.reduce((a, p) => a + p[k], 0) / 8);
    const face = (a, b, c, d, ci) => {
      const m = [0, 1, 2].map((k) => (a[k] + b[k] + c[k] + d[k]) / 4 - ctr[k]);
      this.quad(a, b, c, d, C(ci), null, m);
    };
    face(v[0], v[1], v[2], v[3], 0);
    face(v[4], v[5], v[6], v[7], 1);
    face(v[0], v[1], v[5], v[4], 2);
    face(v[1], v[2], v[6], v[5], 3);
    face(v[2], v[3], v[7], v[6], 4);
    face(v[3], v[0], v[4], v[7], 5);
  }

  // Prism (n sides) between two points.
  tube(a, b, r0, r1, col, n = 6) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d);
    const t = d.map((x) => x / l);
    const up = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let u = [t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]];
    const ul = Math.hypot(...u); u = u.map((x) => x / ul);
    const w = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
    const ring = (p, r) => Array.from({ length: n }, (_, i) => {
      const a2 = (i / n) * Math.PI * 2, c = Math.cos(a2) * r, s = Math.sin(a2) * r;
      return [p[0] + u[0] * c + w[0] * s, p[1] + u[1] * c + w[1] * s, p[2] + u[2] * c + w[2] * s];
    });
    const A = ring(a, r0), B = ring(b, r1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mid = [(A[i][0] + A[j][0]) / 2 - a[0], (A[i][1] + A[j][1]) / 2 - a[1], (A[i][2] + A[j][2]) / 2 - a[2]];
      this.quad(A[i], A[j], B[j], B[i], col, null, mid);
    }
    if (r1 > 0.01) for (let i = 1; i < n - 1; i++) this.tri(B[0], B[i], B[i + 1], col);
  }

  // Low-poly blob (for tree crowns): a jittered octahedron-ish ellipsoid.
  blob(cx, cy, cz, rx, ry, rz, col, seed = 0) {
    const n = 6, rings = 3;
    const pts = [];
    for (let j = 0; j <= rings + 1; j++) {
      const phi = (j / (rings + 1)) * Math.PI;
      const row = [];
      for (let i = 0; i < n; i++) {
        const th = (i / n) * Math.PI * 2 + (j % 2) * 0.5;
        const jit = 1 + (Math.sin(seed * 13.1 + i * 7.3 + j * 3.7) * 0.12);
        row.push([cx + Math.sin(phi) * Math.cos(th) * rx * jit, cy + Math.cos(phi) * ry, cz + Math.sin(phi) * Math.sin(th) * rz * jit]);
      }
      pts.push(row);
    }
    for (let j = 0; j <= rings; j++) {
      for (let i = 0; i < n; i++) {
        const k = (i + 1) % n;
        const a = pts[j][i], b = pts[j][k], c = pts[j + 1][k], d = pts[j + 1][i];
        const shade = 0.82 + 0.22 * (1 - j / rings);
        const cc = [col[0] * shade, col[1] * shade, col[2] * shade];
        const m = [(a[0] + c[0]) / 2 - cx, (a[1] + c[1]) / 2 - cy, (a[2] + c[2]) / 2 - cz];
        if (j === 0) this.tri(a, c, d, cc); else if (j === rings) this.quad(a, b, c, d, cc, null, m);
        else this.quad(a, b, c, d, cc, null, m);
      }
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(this.col), 3));
    for (const k in this.size) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(this.ex[k]), this.size[k]));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------- props

const C = (h) => hex(h);
const TRUNK = C(0x8a7158), PALMT = C(0x9b8466), FROND = C(0x5d8f5e), FROND2 = C(0x4f7d4f);
const LEAF = [C(0x6f9a5a), C(0x5d8f5e), C(0x7fa865), C(0x86a86a)];
const PINE = C(0x3f6b4f);
const POLE = C(0x3d4a4c), LAMPHEAD = C(0xfff1d6);

export function propLamp(g, p) {
  const a = Math.atan2(-p.az, p.ax);
  g.e.cdata = [0, 0];
  g.tube([p.x, p.y, p.z], [p.x, p.y + 8, p.z], 0.14, 0.1, POLE, 6);
  g.box(0.9, 7.9, 0, 1.9, 0.12, 0.14, POLE, a, p.x, p.y, p.z);
  g.e.cdata = [0, 3];
  g.box(1.6, 7.75, 0, 0.7, 0.18, 0.34, LAMPHEAD, a, p.x, p.y, p.z);
  g.e.cdata = [0, 0];
}

export function propPalm(g, p) {
  g.e.cdata = [0, 0];
  const segs = 5;
  let px = p.x, py = p.y, pz = p.z;
  const lx = Math.cos(p.rot) * p.lean, lz = Math.sin(p.rot) * p.lean;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const nx = p.x + lx * p.h * t * t, nz = p.z + lz * p.h * t * t, ny = p.y + p.h * t;
    g.tube([px, py, pz], [nx, ny, nz], 0.32 - i * 0.035, 0.29 - i * 0.035, PALMT, 5);
    px = nx; py = ny; pz = nz;
  }
  for (let k = 0; k < 8; k++) {
    const a = p.rot + (k / 8) * Math.PI * 2;
    const len = 4.2 + (k % 3) * 0.5;
    const dx = Math.cos(a), dz = Math.sin(a);
    const tip = [px + dx * len, py - 1.6 - (k % 2) * 0.6, pz + dz * len];
    const mid = [px + dx * len * 0.5, py + 0.5, pz + dz * len * 0.5];
    const sx = -dz * 0.8, sz = dx * 0.8;
    const col = k % 2 ? FROND : FROND2;
    g.tri([px, py, pz], [mid[0] + sx, mid[1], mid[2] + sz], mid, col);
    g.tri([px, py, pz], mid, [mid[0] - sx, mid[1], mid[2] - sz], col);
    g.tri(mid, [mid[0] + sx, mid[1], mid[2] + sz], tip, col);
    g.tri(mid, tip, [mid[0] - sx, mid[1], mid[2] - sz], col);
  }
}

export function propTree(g, p) {
  g.e.cdata = [0, 0];
  const s = p.s;
  if (p.kind === "pine") {
    g.tube([p.x, p.y, p.z], [p.x, p.y + 2.2 * s, p.z], 0.25 * s, 0.2 * s, TRUNK, 5);
    for (let k = 0; k < 3; k++) {
      const y0 = p.y + (1.6 + k * 2.1) * s, r = (2.6 - k * 0.7) * s;
      g.tube([p.x, y0, p.z], [p.x, y0 + 3.2 * s, p.z], r, 0.02, PINE.map((c) => c * (0.9 + k * 0.08)), 7);
    }
    return;
  }
  g.tube([p.x, p.y, p.z], [p.x, p.y + 3 * s, p.z], 0.22 * s, 0.16 * s, TRUNK, 5);
  const col = LEAF[Math.floor(p.tone * LEAF.length) % LEAF.length];
  g.blob(p.x, p.y + 4.4 * s, p.z, 2.6 * s, 2.2 * s, 2.6 * s, col, p.tone * 10);
}

export function propHut(g, p) {
  g.e.cdata = [0, 0];
  const O = C(0xff6018), W = C(0xfff7ee), S = C(0x2f757c);
  for (const [dx, dz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) g.box(dx, 1.2, dz, 0.2, 2.4, 0.2, W, 0, p.x, p.y, p.z);
  g.box(0, 2.5, 0, 3.6, 0.2, 3.6, W, 0, p.x, p.y, p.z);
  g.box(0, 3.6, 0, 3, 2, 3, O, 0, p.x, p.y, p.z);
  g.box(0, 4.75, 0, 3.6, 0.3, 3.6, S, 0, p.x, p.y, p.z);
  g.box(-2.6, 1.3, 0, 2.2, 0.15, 0.8, W, 0.6, p.x, p.y, p.z);
}

export function propUmbrella(g, p) {
  g.e.cdata = [0, 0];
  g.tube([p.x, p.y, p.z], [p.x, p.y + 2.4, p.z], 0.05, 0.05, C(0xfff7ee), 4);
  const cols = p.tone < 0.5 ? [C(0xff6018), C(0xfff7ee)] : [C(0x2f757c), C(0xfff7ee)];
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
    g.tri([p.x, p.y + 2.8, p.z], [p.x + Math.cos(a1) * 1.6, p.y + 2.2, p.z + Math.sin(a1) * 1.6], [p.x + Math.cos(a0) * 1.6, p.y + 2.2, p.z + Math.sin(a0) * 1.6], cols[k % 2]);
  }
  g.box(1.2, 0.2, 0.3, 1.9, 0.12, 0.7, C(0xfffdf9), 0.4, p.x, p.y, p.z);
}

export function propCrane(g, p) {
  g.e.cdata = [0, 0];
  const O = C(0xff6018), S = C(0x283f43);
  for (const [dx, dz] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) g.box(dx, 18, dz, 1.2, 36, 1.2, O, 0, p.x, p.y, p.z);
  g.box(0, 34, -5, 17.2, 1.4, 1.2, O, 0, p.x, p.y, p.z);
  g.box(0, 34, 5, 17.2, 1.4, 1.2, O, 0, p.x, p.y, p.z);
  g.box(0, 37, 6, 3, 3, 64, O, 0, p.x, p.y, p.z);
  g.box(0, 40.5, -18, 6, 4, 8, S, 0, p.x, p.y, p.z);
  g.box(0, 33.5, 22, 3.4, 2.2, 3, S, 0, p.x, p.y, p.z);
  g.tube([p.x, p.y + 33, p.z + 22], [p.x, p.y + 14, p.z + 22], 0.06, 0.06, S, 4);
}
