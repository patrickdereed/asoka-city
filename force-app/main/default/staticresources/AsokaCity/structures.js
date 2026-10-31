// Things you can climb: fire escapes, scaffolding, and one landmark per district. Pure JS, no three.js:
// map.js places them, render.js draws the parts, walker.js walks on the surfaces.
//
// Walk surfaces are axis-aligned rectangles: flat decks, or ramps rising along x or z
// ({ x0, z0, x1, z1, y0, y1, ax: 0 flat | 1 along x | 2 along z, rail }). y0 is the height at the
// low-coordinate end. A railed surface won't let you step off it onto anything lower.

const IRON = 0x2b3133, STEEL = 0x8d969a, CONC = 0xc9c2b6, ORANGE = 0xff6018, WOOD = 0x8a6a4c, PLANK = 0xa7835f;
const CREAM = 0xfff7ee, SPRUCE = 0x2f757c, YELLOW = 0xd7a03d, WHITE = 0xfffdf9, GREEN = 0x5d8f5e;
const NEONS = [0xff6a2e, 0x3fd0c9, 0xffc667, 0xcc75a0, 0xfffdf9];
// Building styles, as map.js numbers them.
const S = { GLASS: 0, DECO: 1, OFFICE: 2, HOUSE: 3, WARE: 4, BOX: 5, HOSP: 6, CONC: 9 };

export class Parts {
  constructor() {
    this.parts = []; this.walk = []; this.boxes = []; this.circles = []; this.buildings = []; this.glows = []; this.signs = [];
  }

  // Box by its bottom centre. e: 0 plain, 3 lit at night, 4 always glowing.
  box(cx, y, cz, sx, sy, sz, col, e = 0, yaw = 0) { this.parts.push([0, cx, y, cz, sx, sy, sz, col, e, yaw]); }
  tube(ax, ay, az, bx, by, bz, r, col, e = 0, n = 6, r1 = r) { this.parts.push([1, ax, ay, az, bx, by, bz, r, r1, col, e, n]); }
  blob(cx, cy, cz, rx, ry, rz, col, e = 0) { this.parts.push([2, cx, cy, cz, rx, ry, rz, col, e]); }
  hexa(corners, col, e = 0) { this.parts.push([3, corners, col, e]); }
  quad(corners, col, e = 0) { this.parts.push([4, corners, col, e]); }
  solid(x0, z0, x1, z1, y1) { this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y1 }); }
  glow(kind, x, y, z, col) { this.glows.push({ kind, x, y, z, id: -1, col }); }

  // Railings along the named sides of a rectangle (n = -z, s = +z, w = -x, e = +x).
  rails(x0, z0, x1, z1, y, sides, col, h = 1.05) {
    for (const s of sides) {
      const [ax, az, bx, bz] = s === "n" ? [x0, z0, x1, z0] : s === "s" ? [x0, z1, x1, z1] : s === "w" ? [x0, z0, x0, z1] : [x1, z0, x1, z1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / 2.6));
      for (let k = 0; k <= n; k++) { const t = k / n; this.tube(ax + (bx - ax) * t, y, az + (bz - az) * t, ax + (bx - ax) * t, y + h, az + (bz - az) * t, 0.035, col, 0, 4); }
      this.tube(ax, y + h, az, bx, y + h, bz, 0.04, col, 0, 4);
    }
  }

  deck(x0, z0, x1, z1, y, col, rails = "", o = {}) {
    const t = o.t || 0.12;
    this.box((x0 + x1) / 2, y - t, (z0 + z1) / 2, x1 - x0, t, z1 - z0, col);
    if (rails) this.rails(x0, z0, x1, z1, y, rails, o.railCol || col);
    this.walk.push({ x0, z0, x1, z1, y0: y, y1: y, ax: 0, rail: o.rail != null ? o.rail : true });
  }

  // Stairs (or a smooth slope) over a rectangle, y0 at the low-coordinate end of `ax`.
  ramp(x0, z0, x1, z1, ax, y0, y1, col, rails = "", o = {}) {
    const alongX = ax === "x";
    const len = alongX ? x1 - x0 : z1 - z0;
    if (o.smooth) {
      const lo = Math.min(y0, y1) - 0.05, b = o.base != null ? o.base : lo;
      const c = alongX
        ? [[x0, b, z0], [x1, b, z0], [x1, b, z1], [x0, b, z1], [x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]]
        : [[x0, b, z0], [x1, b, z0], [x1, b, z1], [x0, b, z1], [x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1]];
      this.hexa(c, col);
    } else {
      const n = Math.max(2, Math.ceil(Math.abs(y1 - y0) / 0.21));
      // Treads as flat panels: cheap, and the material is double-sided.
      for (let k = 0; k < n; k++) {
        const a0 = k / n, a1 = (k + 1) / n, top = y0 + (y1 - y0) * (y1 > y0 ? (k + 1) / n : k / n);
        if (alongX) { const xa = x0 + len * a0, xb = x0 + len * a1; this.quad([[xa, top, z0], [xb, top, z0], [xb, top, z1], [xa, top, z1]], col); }
        else { const za = z0 + len * a0, zb = z0 + len * a1; this.quad([[x0, top, za], [x1, top, za], [x1, top, zb], [x0, top, zb]], col); }
      }
      const sc = o.railCol || col;
      for (const side of [0, 1]) {
        if (alongX) { const z = side ? z1 : z0; this.tube(x0, y0 - 0.25, z, x1, y1 - 0.25, z, 0.05, sc, 0, 4); }
        else { const x = side ? x1 : x0; this.tube(x, y0 - 0.25, z0, x, y1 - 0.25, z1, 0.05, sc, 0, 4); }
      }
    }
    for (const s of rails) {
      const rc = o.railCol || col;
      let ax0, az0, bx0, bz0;
      if (alongX) { const z = s === "n" ? z0 : z1; ax0 = x0; bx0 = x1; az0 = bz0 = z; }
      else { const x = s === "w" ? x0 : x1; az0 = z0; bz0 = z1; ax0 = bx0 = x; }
      this.tube(ax0, y0 + 1, az0, bx0, y1 + 1, bz0, 0.04, rc, 0, 4);
      for (const t of [0, 1]) this.tube(ax0 + (bx0 - ax0) * t, y0 + (y1 - y0) * t, az0 + (bz0 - az0) * t, ax0 + (bx0 - ax0) * t, y0 + (y1 - y0) * t + 1, az0 + (bz0 - az0) * t, 0.035, rc, 0, 4);
    }
    this.walk.push({ x0, z0, x1, z1, y0, y1, ax: alongX ? 1 : 2, rail: o.rail != null ? o.rail : true });
  }

  // Switchback stairs filling a rectangle: landings at the x0/z0 end (E0) on each level and at the far
  // end half way up. ys are the level heights. `open(k)` names the E0 landing sides left open.
  stairs(x0, z0, x1, z1, ax, ys, col, o = {}) {
    const alongX = ax === "x", pad = 1.2;
    const rc = o.railCol || col;
    const open = o.open || (() => "");
    const lane = alongX ? [[z0, (z0 + z1) / 2], [(z0 + z1) / 2, z1]] : [[x0, (x0 + x1) / 2], [(x0 + x1) / 2, x1]];
    const outerA = alongX ? "n" : "w", outerB = alongX ? "s" : "e", endE0 = alongX ? "w" : "n", endE1 = alongX ? "e" : "s";
    const rect = (a0, a1, l) => (alongX ? [a0, l[0], a1, l[1]] : [l[0], a0, l[1], a1]);
    const A0 = alongX ? x0 : z0, A1 = alongX ? x1 : z1;
    const full = alongX ? [z0, z1] : [x0, x1];
    for (let k = 0; k < ys.length; k++) {
      const sides = [outerA, outerB, endE0].filter((s) => !open(k).includes(s)).join("");
      this.deck(...rect(A0, A0 + pad, full), ys[k], col, k === 0 ? "" : sides, { railCol: rc, rail: k > 0 });
      if (k === ys.length - 1) break;
      const ym = (ys[k] + ys[k + 1]) / 2;
      this.ramp(...rect(A0 + pad, A1 - pad, lane[0]), ax, ys[k], ym, col, outerA, { railCol: rc });
      this.deck(...rect(A1 - pad, A1, full), ym, col, outerA + outerB + endE1, { railCol: rc });
      this.ramp(...rect(A0 + pad, A1 - pad, lane[1]), ax, ys[k + 1], ym, col, outerB, { railCol: rc });
    }
    // Corner posts.
    const top = ys[ys.length - 1];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.tube(x, ys[0], z, x, top + 1.05, z, 0.07, rc, 0, 4);
  }
}

// ------------------------------------------------------------------------- fire escapes

// Rectangle `d0..d1` metres out from a building face, `a0..a1` along it.
function faceRect(b, side, a0, a1, d0, d1) {
  if (side === 2) return [a0, b.z0 - d1, a1, b.z0 - d0];
  if (side === 3) return [a0, b.z1 + d0, a1, b.z1 + d1];
  if (side === 0) return [b.x0 - d1, a0, b.x0 - d0, a1];
  return [b.x1 + d0, a0, b.x1 + d1, a1];
}
export function escapeFootprint(b, side, kind, shift = 0) {
  const sc = kind === "scaffold";
  const faceLen = side >= 2 ? b.x1 - b.x0 : b.z1 - b.z0;
  const L = sc ? Math.min(faceLen - 1, 14) : Math.min(8.4, faceLen - 2);
  const mid = (side >= 2 ? b.x0 + b.x1 : b.z0 + b.z1) / 2 + shift * (faceLen - L) * 0.4;
  const depth = sc ? 2.6 : 2.4;
  return { L, a0: mid - L / 2, a1: mid + L / 2, depth, rect: faceRect(b, side, mid - L / 2, mid + L / 2, 0, depth) };
}

// A fire escape (or a scaffold) up a building face to the roof: switchback stairs with a landing
// against the wall on every floor. groundY: terrain plus slab at its foot.
export function fireEscape(P, b, side, kind, groundY, shift = 0, col = IRON) {
  const sc = kind === "scaffold";
  const { L, a0, a1, depth, rect } = escapeFootprint(b, side, kind, shift);
  if (L < 6) return false;
  const F = sc ? 2.5 : 3.6, top = b.gy + b.h;
  const ys = [groundY];
  for (let y = b.gy + F; y < top - F * 0.55; y += F) ys.push(y);
  ys.push(top);
  const alongX = side >= 2;
  const wallSide = { 2: "s", 3: "n", 0: "e", 1: "w" }[side];
  const deckCol = sc ? PLANK : col, railCol = sc ? STEEL : col;
  P.stairs(rect[0], rect[1], rect[2], rect[3], alongX ? "x" : "z", ys, deckCol, { railCol, open: (k) => (k === ys.length - 1 ? wallSide : "") });
  // Brackets back to the wall under each landing.
  if (!sc) for (let k = 1; k < ys.length; k++) for (const a of [a0 + 0.3, a1 - 0.3]) {
    const [px, pz] = pt(b, side, a, depth - 0.1), [wx, wz] = pt(b, side, a, 0);
    P.tube(px, ys[k] - 0.15, pz, wx, ys[k] - 1.2, wz, 0.04, col, 0, 4);
  }
  if (sc) {
    // Standards, ledgers at each lift, diagonal braces, toe boards and a banner.
    const n = Math.max(1, Math.round((a1 - a0) / 2.4));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      for (const d of [0.05, depth]) { const [x, z] = pt(b, side, a, d); P.tube(x, groundY - 0.1, z, x, top + 1.1, z, 0.05, STEEL, 0, 4); }
    }
    for (let k = 1; k < ys.length; k++) {
      const [xa, za] = pt(b, side, a0, depth), [xb, zb] = pt(b, side, a1, depth);
      P.tube(xa, ys[k] + 0.1, za, xb, ys[k] + 0.1, zb, 0.18, ORANGE, 0, 4);
      P.tube(xa, ys[k - 1], za, xb, ys[k], zb, 0.04, STEEL, 0, 4);
    }
    const [bx, bz] = pt(b, side, (a0 + a1) / 2, depth + 0.08);
    P.box(bx, b.gy + 1.4, bz, alongX ? Math.min(8, L - 2) : 0.04, 1.6, alongX ? 0.04 : Math.min(8, L - 2), ORANGE, 0);
  }
  for (const a of [a0, a1]) { const [x, z] = pt(b, side, a, depth); P.circles.push({ x, z, r: 0.12, kind: "post", y1: top }); }
  return true;
}
function pt(b, side, a, d) {
  if (side === 2) return [a, b.z0 - d];
  if (side === 3) return [a, b.z1 + d];
  if (side === 0) return [b.x0 - d, a];
  return [b.x1 + d, a];
}

// --------------------------------------------------------------------------------- props

function building(P, x0, z0, x1, z1, h, style, color, gy, o = {}) {
  const b = { x0, z0, x1, z1, h, style, color, seed: o.seed != null ? o.seed : ((x0 * 0.137 + z0 * 0.291) % 1 + 1) % 1, roof: o.roof || 0, neon: o.neon != null ? o.neon : -1, gy, y0: gy - 1.5, lm: true };
  P.buildings.push(b);
  if (!o.noSolid) P.solid(x0, z0, x1, z1, gy + h);
  return b;
}

function lampPost(P, x, z, y, col = 0x3d4a4c) {
  P.tube(x, y, z, x, y + 4.2, z, 0.08, col, 0, 6);
  P.box(x, y + 4.15, z, 0.45, 0.18, 0.45, 0xfff1d6, 4);
  P.glow("lamp", x, y + 4.0, z);
  P.circles.push({ x, z, r: 0.15, kind: "post", y1: y + 4.2 });
}

function tree(P, x, z, y, s = 1) {
  P.tube(x, y, z, x, y + 2.6 * s, z, 0.18 * s, 0x8a7158, 0, 5);
  P.blob(x, y + 3.8 * s, z, 2.2 * s, 1.9 * s, 2.2 * s, 0x6f9a5a);
}

function bench(P, x, z, y, alongX = true) {
  const sx = alongX ? 1.8 : 0.5, sz = alongX ? 0.5 : 1.8;
  P.box(x, y + 0.42, z, sx, 0.08, sz, WOOD);
  P.box(x, y, z, alongX ? 0.1 : 0.4, 0.42, alongX ? 0.4 : 0.1, IRON);
}

function stall(P, x, z, y, col, alongX = true) {
  const w = 3, d = 2;
  const sx = alongX ? w : d, sz = alongX ? d : w;
  P.box(x, y, z, sx, 0.9, sz, WOOD);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.tube(x + (dx * sx) / 2.1, y, z + (dz * sz) / 2.1, x + (dx * sx) / 2.1, y + 2.4, z + (dz * sz) / 2.1, 0.04, IRON, 0, 4);
  for (let k = 0; k < 6; k++) {
    const t = -0.5 + (k + 0.5) / 6;
    if (alongX) P.box(x + t * sx, y + 2.4, z, sx / 6 + 0.01, 0.06, sz + 0.4, k % 2 ? CREAM : col);
    else P.box(x, y + 2.4, z + t * sz, sx + 0.4, 0.06, sz / 6 + 0.01, k % 2 ? CREAM : col);
  }
  for (let k = 0; k < 5; k++) P.box(x + (alongX ? -1.1 + k * 0.55 : 0), y + 0.9, z + (alongX ? 0 : -1.1 + k * 0.55), 0.4, 0.18, 0.4, [0xff6018, 0xd7a03d, 0x5d8f5e, 0xb8544f, 0xffc667][k]);
  P.solid(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2, y + 0.9);
}

// --------------------------------------------------------------------------------- landmarks
// Each takes a site from map.js and returns { name, x, z, r, prize: { x, y, z, value } }.

export const LANDMARKS = {
  // The Console: a tower going up, open floors, a stair core and a tower crane.
  console(P, s) {
    const { x0, z0, x1, z1, gy } = s;
    P.box((x0 + x1) / 2, gy - 0.02, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, 0x9a8a72);
    // Hoarding with a gate on the south side.
    const cx = (x0 + x1) / 2;
    const wall = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 6);
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const px = ax + (bx - ax) * (t0 + t1) / 2, pz = az + (bz - az) * (t0 + t1) / 2;
        const sx = Math.abs(bx - ax) / n || 0.2, sz = Math.abs(bz - az) / n || 0.2;
        P.box(px, gy, pz, sx, 2.4, sz, k % 2 ? CREAM : ORANGE);
      }
      P.solid(Math.min(ax, bx) - 0.1, Math.min(az, bz) - 0.1, Math.max(ax, bx) + 0.1, Math.max(az, bz) + 0.1, gy + 2.4);
    };
    wall(x0 + 1, z0 + 1, x1 - 1, z0 + 1); wall(x0 + 1, z0 + 1, x0 + 1, z1 - 1); wall(x1 - 1, z0 + 1, x1 - 1, z1 - 1);
    wall(x0 + 1, z1 - 1, cx - 6, z1 - 1); wall(cx + 6, z1 - 1, x1 - 1, z1 - 1);
    // The frame: nine floors on a 6.5 m grid, a stair core in the north-west bay.
    const T = 26, tx0 = cx - T / 2, tz0 = (z0 + z1) / 2 - T / 2 - 6, tx1 = tx0 + T, tz1 = tz0 + T, F = 4.2, N = 9;
    const ys = [gy]; for (let k = 1; k <= N; k++) ys.push(gy + k * F);
    P.stairs(tx0, tz0, tx0 + 8, tz0 + 4.4, "x", ys, 0x8d969a, { railCol: ORANGE, open: (k) => (k > 0 ? "s" : "") });
    for (let k = 1; k <= N; k++) {
      const y = ys[k];
      P.deck(tx0 + 8, tz0, tx1, tz0 + 4.4, y, CONC, "ne", { railCol: ORANGE, t: 0.3 });
      P.deck(tx0, tz0 + 4.4, tx1, tz1, y, CONC, "wse", { railCol: ORANGE, t: 0.3 });
      for (const [ax, az, bx, bz] of [[tx0, tz0, tx1, tz0], [tx0, tz1, tx1, tz1], [tx0, tz0, tx0, tz1], [tx1, tz0, tx1, tz1]]) P.tube(ax, y - 0.45, az, bx, y - 0.45, bz, 0.18, 0xb8544f, 0, 4);
    }
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const x = tx0 + i * 6.5, z = tz0 + j * 6.5;
      if (x < tx0 + 8.6 && z < tz0 + 5) continue;
      const h = (i + j) % 3 === 0 ? N * F + 3 : N * F;
      P.box(x, gy, z, 0.5, h + 1.2, 0.5, 0xb8544f);
      P.solid(x - 0.3, z - 0.3, x + 0.3, z + 0.3, gy + h + 1.2);
    }
    P.signs.push({ x: cx, z: tz1 + 0.6, y: gy + 5 * F + 1.8, w: 16, h: 3, rot: Math.PI, text: 1, color: 0xff6a2e });
    // Tower crane.
    const kx = tx1 + 9, kz = tz0 + 8, H = 66;
    P.box(kx, gy, kz, 2.2, H, 2.2, YELLOW);
    P.solid(kx - 1.2, kz - 1.2, kx + 1.2, kz + 1.2, gy + H);
    P.box(kx - 20, gy + H, kz, 58, 1.8, 1.6, YELLOW);
    P.box(kx + 15, gy + H - 1.2, kz, 6, 3, 2.6, 0x8a8073);
    P.box(kx + 1.6, gy + H - 3.4, kz, 2.4, 2.6, 2.4, CREAM);
    P.tube(kx - 38, gy + H, kz, kx - 38, gy + 22, kz, 0.04, IRON, 0, 4);
    P.box(kx - 38, gy + 21, kz, 1.2, 1, 1.2, ORANGE);
    P.glow("beacon", kx - 49, gy + H + 2.4, kz); P.glow("beacon", kx, gy + H + 3, kz);
    // Site cabins, pipes, sand and floodlights.
    for (let k = 0; k < 3; k++) { P.box(x0 + 9, gy + (k === 2 ? 2.8 : 0), z1 - 10 - (k % 2) * 3.4, 7, 2.7, 3, CREAM); P.box(x0 + 9, gy + 1.2 + (k === 2 ? 2.8 : 0), z1 - 8.45 - (k % 2) * 3.4, 4, 0.9, 0.06, 0x8fc3dc, 3); }
    P.solid(x0 + 5.5, z1 - 15, x0 + 12.5, z1 - 8.5, gy + 5.5);
    for (let k = 0; k < 6; k++) P.tube(x1 - 18, gy + 0.5 + (k % 3) * 0.95, z1 - 10 + Math.floor(k / 3) * 1, x1 - 6, gy + 0.5 + (k % 3) * 0.95, z1 - 10 + Math.floor(k / 3) * 1, 0.45, 0x8a8073, 0, 8);
    P.solid(x1 - 18, z1 - 10.6, x1 - 6, z1 - 8, gy + 2.8);
    P.blob(x1 - 12, gy, z0 + 12, 5, 2.6, 4, 0xd8c39a);
    for (const [x, z] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) lampPost(P, x, z, gy);
    return { name: "Go-Live Tower site", x: cx, z: (z0 + z1) / 2, r: 75, prize: { x: tx0 + 18, y: gy + N * F, z: tz1 - 6, value: 3000 } };
  },

  // Commit Row: four buildings round a courtyard, roofs joined by bridges, gardens and a bar on top.
  uptown(P, s) {
    const { x0, z0, x1, z1, gy } = s;
    const xm = (x0 + x1) / 2, zm = (z0 + z1) / 2, g = 5;
    const hs = [12, 16, 21, 14];
    const cols = [0xf6c6a6, 0xcbd3c4, 0xd3e0e1, 0xfbe7d8];
    const B = [
      building(P, x0 + 6, z0 + 6, xm - g, zm - g, hs[0], S.DECO, cols[0], gy, { neon: 2 }),
      building(P, xm + g, z0 + 6, x1 - 6, zm - g, hs[1], S.OFFICE, cols[1], gy),
      building(P, xm + g, zm + g, x1 - 6, z1 - 6, hs[2], S.DECO, cols[2], gy, { neon: 0 }),
      building(P, x0 + 6, zm + g, xm - g, z1 - 6, hs[3], S.OFFICE, cols[3], gy),
    ];
    fireEscape(P, B[0], 1, "escape", gy + 0.15, -0.8, 0x2f757c);
    fireEscape(P, B[3], 2, "escape", gy + 0.15, -0.8, 0x2f757c);
    // Rope-and-plank bridges between the roofs.
    const bw = 1.8;
    P.ramp(xm - g, zm - g - 12 - bw / 2, xm + g, zm - g - 12 + bw / 2, "x", gy + hs[0], gy + hs[1], PLANK, "ns", { railCol: WOOD });
    P.ramp(xm + g + 10 - bw / 2, zm - g, xm + g + 10 + bw / 2, zm + g, "z", gy + hs[1], gy + hs[2], PLANK, "we", { railCol: WOOD });
    P.ramp(xm - g, zm + g + 12 - bw / 2, xm + g, zm + g + 12 + bw / 2, "x", gy + hs[3], gy + hs[2], PLANK, "ns", { railCol: WOOD });
    // Roof gardens on the first, solar and a tank on the second, the bar on the tallest.
    const r0 = gy + hs[0];
    for (let k = 0; k < 5; k++) { const x = B[0].x0 + 4 + k * 5; P.box(x, r0, B[0].z0 + 4, 3.4, 0.7, 1.4, WOOD); P.blob(x, r0 + 0.9, B[0].z0 + 4, 1.5, 0.6, 0.6, GREEN); }
    tree(P, B[0].x0 + 8, B[0].z0 + 14, r0, 0.8); tree(P, B[0].x0 + 18, B[0].z0 + 16, r0, 0.7);
    bench(P, B[0].x0 + 12, B[0].z0 + 10, r0);
    const r1 = gy + hs[1];
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) P.box(B[1].x0 + 6 + k * 4.5, r1, B[1].z0 + 6 + j * 4, 3.6, 0.5, 2.6, 0x283f6a);
    P.tube(B[1].x1 - 6, r1, B[1].z0 + 6, B[1].x1 - 6, r1 + 4, B[1].z0 + 6, 1.8, WOOD, 0, 10);
    const r2 = gy + hs[2], bx = (B[2].x0 + B[2].x1) / 2, bz = (B[2].z0 + B[2].z1) / 2;
    P.box(bx, r2, bz - 4, 8, 1.1, 1.2, 0x182b2e); P.box(bx, r2 + 1.1, bz - 4, 8.3, 0.08, 1.5, WOOD);
    P.solid(bx - 4, bz - 4.6, bx + 4, bz - 3.4, r2 + 1.1);
    for (let k = 0; k < 6; k++) P.tube(bx - 3.5 + k * 1.4, r2, bz - 2.5, bx - 3.5 + k * 1.4, r2 + 0.8, bz - 2.5, 0.2, ORANGE, 0, 6);
    for (const [ux, uz] of [[bx - 6, bz + 4], [bx + 4, bz + 5]]) { P.tube(ux, r2, uz, ux, r2 + 2.4, uz, 0.05, CREAM, 0, 4); P.tube(ux, r2 + 2.3, uz, ux, r2 + 2.8, uz, 1.6, ORANGE, 0, 8, 0.05); }
    for (let k = 0; k <= 8; k++) P.glow("amber", B[2].x0 + 2 + k * ((B[2].x1 - B[2].x0 - 4) / 8), r2 + 3, bz + Math.sin(k) * 0.5);
    for (const x of [B[2].x0 + 1, B[2].x1 - 1]) P.tube(x, r2, bz, x, r2 + 3.2, bz, 0.05, IRON, 0, 4);
    // Courtyard fountain.
    P.tube(xm, gy, zm, xm, gy + 0.6, zm, 3, CONC, 0, 12); P.tube(xm, gy + 0.6, zm, xm, gy + 0.65, zm, 2.7, 0x5fb3c0, 4, 12);
    P.tube(xm, gy, zm, xm, gy + 2, zm, 0.3, CONC, 0, 8); P.solid(xm - 3, zm - 3, xm + 3, zm + 3, gy + 0.6);
    for (const [x, z] of [[xm - 3, z0 + 3], [xm + 3, z1 - 3]]) lampPost(P, x, z, gy);
    return { name: "The Merge roof gardens", x: xm, z: zm, r: 70, prize: { x: bx + 3, y: r2, z: bz + 2, value: 2500 } };
  },

  // Cadence Quarter: a lane between two rows of deco blocks, neon arches, stalls and a stage.
  cadence(P, s) {
    const { x0, z0, x1, z1, gy } = s;
    const zm = (z0 + z1) / 2, aw = 7;
    const pastel = [0xf6c6a6, 0xfbe7d8, 0xe0a08f, 0xc9dcd6, 0xf5d7b0, 0xffe9dc];
    const rows = [];
    for (const [za, zb, face] of [[z0 + 2, zm - aw, 3], [zm + aw, z1 - 2, 2]]) {
      const n = 3, w = (x1 - x0 - 4 - (n - 1)) / n;
      for (let k = 0; k < n; k++) {
        const bx0 = x0 + 2 + k * (w + 1);
        const b = building(P, bx0, za, bx0 + w, zb, 10 + ((k * 7 + face) % 3) * 3, S.DECO, pastel[(k + face) % pastel.length], gy, { neon: (k + face) % 6 });
        rows.push([b, face]);
      }
    }
    fireEscape(P, rows[1][0], 3, "escape", gy + 0.15, -1, 0x5a4636);
    fireEscape(P, rows[4][0], 2, "escape", gy + 0.15, -1, 0x5a4636);
    P.box((x0 + x1) / 2, gy + 0.02, zm, x1 - x0 - 2, 0.05, aw * 2, 0x8a6b55);
    // Neon arches over the lane.
    for (let x = x0 + 10, k = 0; x < x1 - 14; x += 10, k++) {
      const col = NEONS[k % NEONS.length];
      const pts = [];
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; pts.push([x, gy + 5.2 + Math.sin(a) * 1.4, zm - Math.cos(a) * (aw - 0.6)]); }
      P.tube(x, gy, zm - aw + 0.6, x, gy + 5.2, zm - aw + 0.6, 0.08, IRON, 0, 4);
      P.tube(x, gy, zm + aw - 0.6, x, gy + 5.2, zm + aw - 0.6, 0.08, IRON, 0, 4);
      for (let i = 0; i < 8; i++) P.tube(...pts[i], ...pts[i + 1], 0.09, col, 4, 5);
      P.glow("neon", ...pts[4], col);
    }
    // Stalls along the lane, lanterns across it, a stage at the east end.
    for (let k = 0; k < 5; k++) stall(P, x0 + 20 + k * 16, zm + (k % 2 ? 3.4 : -3.4), gy, NEONS[k % 4]);
    for (let x = x0 + 8; x < x1 - 6; x += 8) P.glow("amber", x, gy + 4.4 + Math.sin(x) * 0.2, zm);
    for (let x = x0 + 4; x < x1 - 4; x += 1.6) P.box(x, gy + 4.3 + Math.sin(x) * 0.2, zm, 0.22, 0.28, 0.22, [0xffc667, 0xff6a2e, 0xfff1d6][Math.floor(x) % 3], 3);
    const sx = x1 - 10;
    P.deck(sx - 4, zm - 5, sx + 4, zm + 5, gy + 0.9, 0x182b2e, "", { rail: false });
    P.ramp(sx - 6, zm - 1.5, sx - 4, zm + 1.5, "x", gy + 0.1, gy + 0.9, 0x182b2e, "", { rail: false });
    for (const z of [zm - 4.4, zm + 4.4]) { P.box(sx + 2, gy + 0.9, z, 1.1, 2, 1.1, 0x101414); P.glow("neon", sx + 2, gy + 3.1, z, 0xcc75a0); }
    P.box(sx + 3.8, gy + 0.9, zm, 0.3, 4, 10, 0x182b2e);
    P.signs.push({ x: sx + 3.6, z: zm, y: gy + 3.6, w: 8, h: 1.6, rot: Math.PI / 2, text: 8, color: 0xcc75a0 });
    const roof = rows[1][0];
    return { name: "Neon Lane", x: (x0 + x1) / 2, z: zm, r: 65, prize: { x: (roof.x0 + roof.x1) / 2, y: roof.gy + roof.h, z: (roof.z0 + roof.z1) / 2, value: 2000 } };
  },

  // Sprint Gardens: a skate park with a half pipe, a funbox, quarter pipes and bleachers.
  gardens(P, s) {
    const { x0, z0, x1, z1, gy } = s;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    P.box(cx, gy - 0.02, cz, x1 - x0 - 8, 0.12, z1 - z0 - 8, 0xb8b2a6);
    const C1 = 0xd9d2c7, C2 = 0xc0b8aa;
    // Half pipe across z: decks at both ends, slopes down to a flat bottom.
    const hx0 = cx - 24, hx1 = cx - 8, hz0 = cz - 14, hz1 = cz + 14, H = 2.8;
    P.deck(hx0, hz0, hx1, hz0 + 2.5, gy + H, C1, "nwe", { rail: true, railCol: IRON });
    P.ramp(hx0, hz0 + 2.5, hx1, hz0 + 7.5, "z", gy + H, gy + 0.1, C2, "", { smooth: true, rail: false, base: gy });
    P.ramp(hx0, hz1 - 7.5, hx1, hz1 - 2.5, "z", gy + 0.1, gy + H, C2, "", { smooth: true, rail: false, base: gy });
    P.deck(hx0, hz1 - 2.5, hx1, hz1, gy + H, C1, "swe", { rail: true, railCol: IRON });
    P.box((hx0 + hx1) / 2, gy, hz0 + 1.25, hx1 - hx0, H - 0.12, 2.5, C2); P.box((hx0 + hx1) / 2, gy, hz1 - 1.25, hx1 - hx0, H - 0.12, 2.5, C2);
    P.ramp(hx1, hz1 - 2.5, hx1 + 5, hz1, "x", gy + H, gy + 0.1, C2, "", { rail: false });
    // Funbox.
    const fx = cx + 12, fz = cz - 6, fh = 1.2;
    P.deck(fx - 3, fz - 3, fx + 3, fz + 3, gy + fh, C1, "", { rail: false });
    P.box(fx, gy, fz, 6, fh - 0.12, 6, C2);
    P.ramp(fx - 7, fz - 3, fx - 3, fz + 3, "x", gy + 0.1, gy + fh, C2, "", { smooth: true, rail: false, base: gy });
    P.ramp(fx + 3, fz - 3, fx + 7, fz + 3, "x", gy + fh, gy + 0.1, C2, "", { smooth: true, rail: false, base: gy });
    P.ramp(fx - 3, fz - 7, fx + 3, fz - 3, "z", gy + 0.1, gy + fh, C2, "", { smooth: true, rail: false, base: gy });
    P.ramp(fx - 3, fz + 3, fx + 3, fz + 7, "z", gy + fh, gy + 0.1, C2, "", { smooth: true, rail: false, base: gy });
    P.tube(fx - 2.6, gy + fh + 0.4, fz, fx + 2.6, gy + fh + 0.4, fz, 0.05, YELLOW, 0, 6);
    // Quarter pipes and a grind ledge.
    P.ramp(cx + 6, cz + 10, cx + 22, cz + 14, "z", gy + 0.1, gy + 1.8, C2, "", { smooth: true, rail: false, base: gy });
    P.deck(cx + 6, cz + 14, cx + 22, cz + 16, gy + 1.8, C1, "s", { rail: true, railCol: IRON });
    P.box(cx + 14, gy, cz + 15, 16, 1.68, 2, C2);
    P.box(cx + 2, gy, cz + 2, 8, 0.45, 0.6, CONC); P.solid(cx - 2, cz + 1.7, cx + 6, cz + 2.3, gy + 0.45);
    // Bleachers and painted walls.
    for (let k = 0; k < 4; k++) { P.deck(x0 + 6, z1 - 8 - k * 1, x0 + 22, z1 - 7 - k * 1, gy + 0.45 * (k + 1), [0x2f757c, 0xff6018][k % 2], "", { rail: false }); P.box(x0 + 14, gy, z1 - 7.5 - k, 16, 0.45 * (k + 1) - 0.12, 1, C2); }
    const paint = [0xff6018, 0x3fd0c9, 0xcc75a0, 0xffc667, 0x2f757c, 0x5d8f5e, 0x507fa7];
    for (let k = 0; k < 10; k++) {
      const x = x1 - 26 + k * 2.2;
      P.box(x, gy, z0 + 6, 2.2, 2.6, 0.4, 0xd9d2c7);
      P.box(x, gy + 0.3 + (k % 3) * 0.5, z0 + 6.22, 1.4 + (k % 2) * 0.6, 0.6 + ((k * 3) % 4) * 0.3, 0.05, paint[k % paint.length]);
    }
    P.solid(x1 - 27.1, z0 + 5.8, x1 - 4.9, z0 + 6.2, gy + 2.6);
    for (const [x, z] of [[x0 + 5, z0 + 5], [x1 - 5, z1 - 5], [x0 + 5, z1 - 5], [x1 - 5, z0 + 12]]) lampPost(P, x, z, gy);
    return { name: "Kickflip Skate Park", x: cx, z: cz, r: 60, prize: { x: (hx0 + hx1) / 2, y: gy + H, z: hz0 + 1.2, value: 1500 } };
  },

  // Instinct Park: a boardwalk across the lake to a pavilion, and a lookout tower on the shore.
  park(P, s, world) {
    const { x: sx, z: sz } = s;   // east shore of the lake
    const Y = 1.2, w = 1.8;
    const land = world.height(sx + 4, sz) + 0.15;
    P.ramp(sx - 2, sz - w, sx + 6, sz + w, "x", Y, Math.max(Y, land), PLANK, "ns", { railCol: WOOD, rail: true });
    P.deck(sx - 110, sz - w, sx - 2, sz + w, Y, PLANK, "ns", { railCol: WOOD });
    for (let x = sx - 108; x < sx; x += 6) for (const z of [sz - w, sz + w]) P.tube(x, -4, z, x, Y - 0.1, z, 0.12, WOOD, 0, 5);
    for (let x = sx - 100; x < sx; x += 18) { lampPost(P, x, sz + w + 0.3, Y, WOOD); }
    // Pavilion.
    const px0 = sx - 124, px1 = sx - 110, pz0 = sz - 7, pz1 = sz + 7;
    P.deck(px0, pz0, px1, pz1, Y, PLANK, "nsw", { railCol: WOOD });
    P.deck(px1 - 0.01, pz0, px1, sz - w, Y, PLANK, "e", { railCol: WOOD });
    P.deck(px1 - 0.01, sz + w, px1, pz1, Y, PLANK, "e", { railCol: WOOD });
    for (let x = px0 + 0.5; x < px1; x += 6.5) for (const z of [pz0 + 0.5, pz1 - 0.5]) P.tube(x, Y, z, x, Y + 3.4, z, 0.14, CREAM, 0, 6);
    P.hexa([[px0 - 1, Y + 3.4, pz0 - 1], [px1 + 1, Y + 3.4, pz0 - 1], [px1 + 1, Y + 3.4, pz1 + 1], [px0 - 1, Y + 3.4, pz1 + 1], [(px0 + px1) / 2, Y + 6.2, sz], [(px0 + px1) / 2 + 0.01, Y + 6.2, sz], [(px0 + px1) / 2 + 0.01, Y + 6.2, sz + 0.01], [(px0 + px1) / 2, Y + 6.2, sz + 0.01]], SPRUCE);
    for (let x = px0 + 2; x < px1 - 1; x += 4) { bench(P, x, pz0 + 1.5, Y); bench(P, x, pz1 - 1.5, Y); }
    // Lookout tower among the trees on the shore.
    const tx = sx + 18, tz = sz - 20, gy = world.height(tx, tz) + 0.15;
    const ys = [gy, gy + 4, gy + 8, gy + 12, gy + 16];
    P.stairs(tx - 2.6, tz - 4, tx + 2.6, tz + 4, "z", ys, WOOD, { railCol: WOOD, open: (k) => (k === ys.length - 1 ? "n" : "") });
    P.deck(tx - 4, tz - 10, tx + 4, tz - 4, gy + 16, PLANK, "nwe", { railCol: WOOD });
    for (const [x, z] of [[tx - 4, tz - 10], [tx + 4, tz - 10]]) P.tube(x, gy, z, x, gy + 16, z, 0.15, WOOD, 0, 6);
    P.hexa([[tx - 4.6, gy + 18.8, tz - 10.6], [tx + 4.6, gy + 18.8, tz - 10.6], [tx + 4.6, gy + 18.8, tz - 3.4], [tx - 4.6, gy + 18.8, tz - 3.4], [tx, gy + 21, tz - 7], [tx + 0.01, gy + 21, tz - 7], [tx + 0.01, gy + 21, tz - 6.99], [tx, gy + 21, tz - 6.99]], 0x3f6b4f);
    for (const [x, z] of [[tx - 4, tz - 3.4], [tx + 4, tz - 3.4]]) P.tube(x, gy + 16, z, x, gy + 18.8, z, 0.1, WOOD, 0, 5);
    P.tube(tx + 2.5, gy + 16, tz - 9, tx + 2.5, gy + 17.1, tz - 9, 0.06, IRON, 0, 4);
    P.tube(tx + 2.5, gy + 17.2, tz - 9.2, tx + 2.5, gy + 17.3, tz - 9.8, 0.12, IRON, 0, 6);
    return { name: "Lakeside Lookout", x: sx - 40, z: sz, r: 90, prize: { x: tx, y: gy + 16, z: tz - 8, value: 2000 } };
  },

  // Meridian Heights: a hospital tower with a fire escape up to the helipad.
  meridian(P, s) {
    const { x0, z0, x1, z1, gy } = s;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, T = 32, H = 44;
    const b = building(P, cx - T / 2, cz - T / 2, cx + T / 2, cz + T / 2, H, S.HOSP, WHITE, gy);
    fireEscape(P, b, 3, "escape", gy + 0.15, 0.7, SPRUCE);
    building(P, cx - 26, cz + T / 2 + 2, cx - 10, cz + T / 2 + 14, 9, S.HOSP, 0xd3e0e1, gy);
    P.box(cx, gy + 4, cz - T / 2 - 3, 12, 0.3, 6, SPRUCE);
    for (const x of [cx - 5.5, cx + 5.5]) P.tube(x, gy, cz - T / 2 - 5.8, x, gy + 4, cz - T / 2 - 5.8, 0.12, CREAM, 0, 6);
    P.signs.push({ x: cx, z: cz - T / 2 - 0.4, y: gy + H - 4, w: 22, h: 3.2, rot: 0, text: 5, color: 0x3fd0c9 });
    const r = gy + H;
    P.tube(cx, r, cz, cx, r + 0.06, cz, 9, 0x3d4a4c, 0, 24);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, b2 = ((k + 1) / 24) * Math.PI * 2; P.tube(cx + Math.cos(a) * 8, r + 0.08, cz + Math.sin(a) * 8, cx + Math.cos(b2) * 8, r + 0.08, cz + Math.sin(b2) * 8, 0.18, YELLOW, 0, 4); }
    P.box(cx - 2.2, r + 0.07, cz, 0.8, 0.03, 6, WHITE); P.box(cx + 2.2, r + 0.07, cz, 0.8, 0.03, 6, WHITE); P.box(cx, r + 0.07, cz, 3.6, 0.03, 0.8, WHITE);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.glow("lamp", cx + Math.cos(a) * 9.3, r + 0.3, cz + Math.sin(a) * 9.3, 0x7fe08a); }
    // A Meridian air ambulance on the pad.
    const hx = cx + 5, hz = cz + 9;
    P.blob(hx, r + 1.6, hz, 1.4, 1.2, 2.6, WHITE);
    P.box(hx, r + 1.2, hz - 1.2, 1.5, 0.6, 1.2, 0x8fc3dc, 3);
    P.tube(hx, r + 1.8, hz + 2.2, hx, r + 2.1, hz + 7.2, 0.25, WHITE, 0, 6, 0.12);
    P.box(hx, r + 2.1, hz + 7.2, 0.1, 1.4, 0.9, 0x3fd0c9);
    for (const x of [hx - 1.1, hx + 1.1]) P.tube(x, r + 0.15, hz - 2, x, r + 0.15, hz + 2, 0.05, IRON, 0, 4);
    P.tube(hx, r + 2.7, hz, hx, r + 3.1, hz, 0.08, IRON, 0, 4);
    P.box(hx, r + 3.1, hz, 11, 0.05, 0.3, IRON); P.box(hx, r + 3.1, hz, 0.3, 0.05, 11, IRON);
    P.solid(hx - 1.5, hz - 2.7, hx + 1.5, hz + 7.5, r + 3);
    P.glow("beacon", cx - T / 2 + 1, r + 1.2, cz - T / 2 + 1); P.glow("beacon", cx + T / 2 - 1, r + 1.2, cz + T / 2 - 1);
    for (const [ax, az, bx, bz] of [[cx - T / 2, cz - T / 2, cx + T / 2, cz - T / 2], [cx - T / 2, cz + T / 2, cx + T / 2, cz + T / 2], [cx - T / 2, cz - T / 2, cx - T / 2, cz + T / 2], [cx + T / 2, cz - T / 2, cx + T / 2, cz + T / 2]]) P.tube(ax, r + 0.6, az, bx, r + 0.6, bz, 0.05, STEEL, 0, 4);
    return { name: "Meridian Helipad", x: cx, z: cz, r: 70, prize: { x: cx - 4, y: r, z: cz - 4, value: 2500 } };
  },

  // Guideline Hills: an observatory, a lookout, a radio mast and a giant Asoka mark on the summit.
  hills(P, s, world) {
    const { x: sx, z: sz } = s, gy = world.height(sx, sz) + 0.1;
    P.box(sx, gy - 0.2, sz, 34, 0.3, 26, CONC);
    P.tube(sx - 6, gy, sz, sx - 6, gy + 7, sz, 6, WHITE, 0, 18);
    P.blob(sx - 6, gy + 7, sz, 6.2, 5.2, 6.2, 0xefe3d2);
    P.box(sx - 6, gy + 7, sz - 5.2, 1.4, 4.6, 1.6, 0x283f43);
    P.solid(sx - 12, sz - 6, sx, sz + 6, gy + 12);
    P.box(sx - 6, gy, sz + 6.2, 2, 2.4, 0.2, SPRUCE);
    const ys = [gy, gy + 4.5, gy + 9, gy + 13.5, gy + 18];
    P.stairs(sx + 6, sz - 3, sx + 14, sz + 3, "x", ys, IRON, { railCol: ORANGE, open: (k) => (k === ys.length - 1 ? "w" : "") });
    P.deck(sx + 0.5, sz - 4, sx + 6, sz + 4, gy + 18, PLANK, "nsw", { railCol: ORANGE });
    for (const [x, z] of [[sx + 0.5, sz - 4], [sx + 0.5, sz + 4]]) P.tube(x, gy, z, x, gy + 18, z, 0.15, IRON, 0, 6);
    for (const z of [sz - 2.5, sz + 2.5]) { P.tube(sx + 1.4, gy + 18, z, sx + 1.4, gy + 19.1, z, 0.05, IRON, 0, 4); P.tube(sx + 1.3, gy + 19.2, z - 0.15, sx + 1.3, gy + 19.2, z + 0.15, 0.1, IRON, 0, 6); }
    // Radio mast.
    const mx = sx + 6, mz = sz + 12;
    P.tube(mx, gy, mz, mx, gy + 64, mz, 0.55, 0xb8544f, 0, 6, 0.2);
    for (const y of [16, 32, 48]) P.box(mx, gy + y, mz, 2.4, 0.2, 2.4, WHITE);
    for (const [dx, dz] of [[-14, 0], [10, -10], [8, 12]]) P.tube(mx, gy + 40, mz, mx + dx, gy, mz + dz, 0.03, IRON, 0, 3);
    P.solid(mx - 0.7, mz - 0.7, mx + 0.7, mz + 0.7, gy + 64);
    P.glow("beacon", mx, gy + 65, mz); P.glow("beacon", mx, gy + 33, mz);
    // The mark: a triangle with a ring, 30 m tall, facing the city.
    const lz = sz + 34, ly = world.height(sx, lz) - 0.5;
    const A = [sx - 17, ly, lz], Bp = [sx + 17, ly, lz], Ap = [sx, ly + 30, lz];
    for (const [p, q] of [[A, Bp], [Bp, Ap], [Ap, A]]) P.tube(...p, ...q, 0.7, ORANGE, 3, 6);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2, b2 = ((k + 1) / 20) * Math.PI * 2;
      P.tube(sx + Math.cos(a) * 5.4, ly + 10 + Math.sin(a) * 5.4, lz, sx + Math.cos(b2) * 5.4, ly + 10 + Math.sin(b2) * 5.4, lz, 0.6, CREAM, 3, 5);
    }
    for (const x of [sx - 17, sx + 17, sx]) P.solid(x - 0.8, lz - 0.8, x + 0.8, lz + 0.8, ly + 3);
    bench(P, sx + 2, sz + 9, gy); bench(P, sx - 14, sz + 9, gy);
    return { name: "Summit Observatory", x: sx, z: sz, r: 90, prize: { x: sx + 3, y: gy + 18, z: sz, value: 3000 } };
  },

  // The Pipeline: stacked containers you can climb, catwalks across the aisle and a gantry cab.
  docks(P, s) {
    const { x0, z0, x1, gy } = s;
    const cols = [0xff6018, 0x2f757c, 0xd7a03d, 0xb8544f, 0x507fa7, 0x5d8f5e, 0xa4517b, 0xefe3d2];
    const rowA = { x0: x0 + 12, x1: x0 + 12 + 12.4 * 5, z0: z0 + 8, z1: z0 + 13.2, t: 3 };
    const rowB = { x0: x0 + 12, x1: x0 + 12 + 12.4 * 4, z0: z0 + 19, z1: z0 + 24.2, t: 4 };
    let ci = 0;
    for (const R of [rowA, rowB]) {
      for (let x = R.x0; x < R.x1 - 1; x += 12.4) for (const z of [R.z0, R.z0 + 2.7]) {
        building(P, x + 0.1, z, x + 12.3, z + 2.5, 2.6 * R.t, S.BOX, cols[ci++ % cols.length], gy, { noSolid: true, seed: (ci * 0.37) % 1 });
      }
      P.solid(R.x0, R.z0, R.x1, R.z1, gy + 2.6 * R.t);
    }
    // Stairs up the west end of row A; catwalks across to row B.
    const ys = [gy, gy + 3.9, gy + 7.8];
    P.stairs(rowA.x0 - 6, rowA.z0, rowA.x0, rowA.z1, "z", ys, YELLOW, { railCol: YELLOW, open: (k) => (k === 2 ? "e" : "") });
    for (const x of [rowA.x0 + 14, rowA.x0 + 40]) {
      P.ramp(x - 1, rowA.z1, x + 1, rowB.z0, "z", gy + 7.8, gy + 10.4, IRON, "we", { railCol: YELLOW });
    }
    // Gantry over row B with an operator's cab.
    const gx = rowB.x0 + 30;
    for (const z of [rowA.z0 - 3, rowB.z1 + 3]) for (const dx of [-5, 5]) { P.box(gx + dx, gy, z, 1.2, 22, 1.2, ORANGE); P.solid(gx + dx - 0.6, z - 0.6, gx + dx + 0.6, z + 0.6, gy + 22); }
    for (const dx of [-5, 5]) P.box(gx + dx, gy + 22, (rowA.z0 + rowB.z1) / 2, 1.4, 1.6, rowB.z1 - rowA.z0 + 7.4, ORANGE);
    P.box(gx, gy + 18.5, rowB.z0, 3, 3, 3, CREAM); P.box(gx, gy + 19.4, rowB.z0 - 1.52, 2.4, 1.2, 0.05, 0x8fc3dc, 3);
    for (const [x, z] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x1 - 4, rowB.z1 + 8]]) { P.tube(x, gy, z, x, gy + 18, z, 0.25, STEEL, 0, 6); P.box(x, gy + 18, z, 2.4, 1, 0.6, 0xfff1d6, 4); P.glow("lamp", x, gy + 17.6, z); }
    return { name: "Container Stacks", x: rowA.x0 + 25, z: (rowA.z0 + rowB.z1) / 2, r: 70, prize: { x: rowB.x1 - 4, y: gy + 10.4, z: (rowB.z0 + rowB.z1) / 2, value: 2000 } };
  },

  // Scratch Key: a lighthouse on the northern tip, climbed by its service stair.
  scratch(P, s, world) {
    const { x: lx, z: lz } = s, gy = world.height(lx, lz) + 0.1, H = 26;
    P.tube(lx, gy, lz, lx, gy + H, lz, 3.8, WHITE, 0, 14, 3.1);
    for (const y of [7, 15]) P.tube(lx, gy + y, lz, lx, gy + y + 2.2, lz, 3.75 - y * 0.026, 0xb8544f, 0, 14, 3.68 - y * 0.026);
    P.solid(lx - 3.8, lz - 3.8, lx + 3.8, lz + 3.8, gy + H);
    P.deck(lx - 4.8, lz - 4.8, lx + 4.8, lz + 4.8, gy + H, IRON, "nwe", { railCol: IRON, t: 0.3 });
    P.deck(lx - 4.8, lz + 4.8 - 0.01, lx - 2.6, lz + 4.8, gy + H, IRON, "s", { railCol: IRON });
    P.deck(lx + 2.6, lz + 4.8 - 0.01, lx + 4.8, lz + 4.8, gy + H, IRON, "s", { railCol: IRON });
    P.tube(lx, gy + H, lz, lx, gy + H + 3, lz, 2.2, 0xfff1c0, 4, 10);
    P.tube(lx, gy + H + 3, lz, lx, gy + H + 4.6, lz, 2.5, 0x182b2e, 0, 10, 0.2);
    P.solid(lx - 2.3, lz - 2.3, lx + 2.3, lz + 2.3, gy + H + 3);
    P.glow("beacon", lx, gy + H + 1.6, lz, 0xffe9a0);
    const ys = [gy, gy + 6.5, gy + 13, gy + 19.5, gy + H];
    P.stairs(lx - 2.5, lz + 4.8, lx + 2.5, lz + 12.8, "z", ys, IRON, { railCol: 0xb8544f, open: (k) => (k === ys.length - 1 ? "n" : "") });
    building(P, lx + 9, lz - 4, lx + 17, lz + 4, 4.5, S.CONC, CREAM, gy, { roof: 2 });
    for (let k = 0; k < 9; k++) { const a = k * 0.8; P.blob(lx + Math.cos(a) * (12 + k % 3 * 3), gy - 0.4, lz - 4 + Math.sin(a) * 9, 2 + (k % 3), 1.2 + (k % 2), 2.2, 0x8a8073); }
    return { name: "Point Scratch Lighthouse", x: lx, z: lz, r: 70, prize: { x: lx + 3.6, y: gy + H, z: lz - 3.6, value: 2500 } };
  },

  // Sandbox Isles: a pier out over the ocean with a big wheel, a carousel and stalls.
  sandbox(P, s, world) {
    const { x: xl, z: pz } = s, Y = 3.2, w = 6;
    const land = world.height(xl - 14, pz) + 0.15;
    P.ramp(xl - 14, pz - 3, xl, pz + 3, "x", land, Y, PLANK, "ns", { railCol: CREAM, smooth: false });
    P.deck(xl, pz - w, xl + 180, pz + w, Y, PLANK, "ns", { railCol: CREAM, t: 0.4 });
    const ex = xl + 180;
    P.deck(ex, pz - 22, ex + 40, pz + 22, Y, PLANK, "nse", { railCol: CREAM, t: 0.4 });
    P.deck(ex - 0.01, pz - 22, ex, pz - w, Y, PLANK, "w", { railCol: CREAM });
    P.deck(ex - 0.01, pz + w, ex, pz + 22, Y, PLANK, "w", { railCol: CREAM });
    for (let x = xl + 4; x < ex + 40; x += 10) for (const z of x < ex ? [pz - w + 0.3, pz + w - 0.3] : [pz - 21, pz, pz + 21]) P.tube(x, -6, z, x, Y - 0.4, z, 0.3, WOOD, 0, 6);
    for (let x = xl + 12; x < ex; x += 24) { lampPost(P, x, pz - w + 0.4, Y, CREAM); lampPost(P, x + 12, pz + w - 0.4, Y, CREAM); }
    for (let k = 0; k < 4; k++) stall(P, xl + 40 + k * 32, pz + (k % 2 ? 3.2 : -3.2), Y, NEONS[k], true);
    // The wheel faces the beach.
    const wx = ex + 28, wy = Y + 19, wz = pz, R = 16;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2, b2 = ((k + 1) / 32) * Math.PI * 2;
      const col = k % 2 ? 0xff6a2e : 0x3fd0c9;
      P.tube(wx, wy + Math.sin(a) * R, wz + Math.cos(a) * R, wx, wy + Math.sin(b2) * R, wz + Math.cos(b2) * R, 0.22, col, 3, 5);
      if (k % 4 === 0) {
        P.tube(wx, wy, wz, wx, wy + Math.sin(a) * R, wz + Math.cos(a) * R, 0.08, WHITE, 0, 4);
        P.box(wx, wy + Math.sin(a) * R - 2.4, wz + Math.cos(a) * R, 1.8, 1.8, 1.8, [0xff6018, 0x2f757c, 0xd7a03d, 0xcc75a0][(k / 4) % 4]);
        P.glow("neon", wx, wy + Math.sin(a) * R, wz + Math.cos(a) * R, col);
      }
    }
    P.tube(wx - 2, wy, wz, wx + 2, wy, wz, 0.9, STEEL, 0, 10);
    for (const [dx, dz] of [[-6, -9], [-6, 9], [6, -9], [6, 9]]) P.tube(wx + dx * 0.15, wy, wz, wx + dx, Y, wz + dz, 0.45, WHITE, 0, 6);
    P.solid(wx - 6.5, wz - 9.5, wx + 6.5, wz + 9.5, Y + 1.2);
    // Carousel.
    const cx = ex + 10, cz = pz - 13;
    P.tube(cx, Y, cz, cx, Y + 0.5, cz, 5.5, 0xfff7ee, 0, 16);
    P.tube(cx, Y + 0.5, cz, cx, Y + 3.6, cz, 0.3, YELLOW, 0, 8);
    P.tube(cx, Y + 3.6, cz, cx, Y + 5.6, cz, 6, 0xcc75a0, 3, 16, 0.3);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.tube(cx + Math.cos(a) * 4.2, Y + 0.5, cz + Math.sin(a) * 4.2, cx + Math.cos(a) * 4.2, Y + 3.6, cz + Math.sin(a) * 4.2, 0.04, YELLOW, 0, 4); P.box(cx + Math.cos(a) * 4.2, Y + 1.3, cz + Math.sin(a) * 4.2, 0.4, 0.7, 1.1, [WHITE, 0xd7a03d, 0x3fd0c9][k % 3], 0, -a); }
    P.solid(cx - 5.5, cz - 5.5, cx + 5.5, cz + 5.5, Y + 3.6);
    return { name: "Sandbox Pier", x: xl + 120, z: pz, r: 110, prize: { x: ex + 36, y: Y, z: pz + 16, value: 2500 } };
  },

  // Preview Point: a marina in the bay, jetties and moored yachts you can step aboard.
  preview(P, s, world) {
    const { x: xs, z: mz } = s, Y = 1.0;
    const land = world.height(xs + 8, mz) + 0.15;
    P.ramp(xs, mz - 2, xs + 8, mz + 2, "x", Y, Math.max(Y, land), PLANK, "", { rail: false });
    P.deck(xs - 96, mz - 2, xs, mz + 2, Y, PLANK, "", { rail: false });
    for (let x = xs - 94; x < xs; x += 5) for (const z of [mz - 2, mz + 2]) P.tube(x, -3, z, x, Y - 0.1, z, 0.12, WOOD, 0, 5);
    const boats = [];
    for (let k = 0; k < 4; k++) {
      const fx = xs - 18 - k * 20;
      for (const sg of [-1, 1]) {
        const fz0 = sg < 0 ? mz - 26 : mz + 2, fz1 = sg < 0 ? mz - 2 : mz + 26;
        P.deck(fx - 1, fz0, fx + 1, fz1, Y, PLANK, "", { rail: false });
        lampPost(P, fx + 0.8, sg < 0 ? fz0 + 1 : fz1 - 1, Y, CREAM);
        boats.push({ x: fx + 5.2, z: sg < 0 ? mz - 15 : mz + 15, big: k === 3 && sg > 0 });
      }
    }
    for (const b of boats) {
      const L = b.big ? 22 : 12, W2 = b.big ? 3 : 2, dy = Y + 0.45;
      const zb = b.z - L / 2, zs = b.z + L / 2, xa = b.x - W2, xb = b.x + W2;
      P.hexa([[xa + 0.5, -0.4, zb + 1], [xb - 0.5, -0.4, zb + 1], [xb - 0.5, -0.4, zs - 0.5], [xa + 0.5, -0.4, zs - 0.5], [xa, dy - 0.1, zb + 2], [xb, dy - 0.1, zb + 2], [xb, dy - 0.1, zs], [xa, dy - 0.1, zs]], WHITE);
      P.hexa([[b.x - 0.3, -0.3, zb - 1.5], [b.x + 0.3, -0.3, zb - 1.5], [xb - 0.5, -0.4, zb + 1], [xa + 0.5, -0.4, zb + 1], [b.x - 0.1, dy - 0.1, zb - 1.5], [b.x + 0.1, dy - 0.1, zb - 1.5], [xb, dy - 0.1, zb + 2], [xa, dy - 0.1, zb + 2]], WHITE);
      P.deck(xa, zb + 2, xb, zs, dy, 0xd8c39a, "", { rail: true });
      P.box(b.x, dy, b.z + L * 0.12, W2 * 1.3, 1.6, L * 0.35, CREAM);
      P.box(b.x, dy + 0.7, b.z + L * 0.12 - L * 0.175 - 0.02, W2 * 1.2, 0.6, 0.05, 0x283f43);
      P.solid(b.x - W2 * 0.65, b.z + L * 0.12 - L * 0.175, b.x + W2 * 0.65, b.z + L * 0.12 + L * 0.175, dy + 1.6);
      if (b.big) {
        P.deck(xa + 0.6, zs - 6.5, xb - 0.6, zs - 1, dy + 2.6, 0xd8c39a, "nwe", { railCol: STEEL });
        P.ramp(b.x - 0.7, zs - 1, b.x + 0.7, zs - 0.01, "z", dy + 2.6, dy, 0xd8c39a, "we", { railCol: STEEL });
        P.box(b.x, dy + 2.6, zs - 5.2, 2.2, 1.0, 1.2, 0x182b2e);
        P.tube(b.x, dy + 1.6, b.z - 2, b.x, dy + 12, b.z - 2, 0.1, STEEL, 0, 5);
        P.glow("lamp", b.x, dy + 12.1, b.z - 2, 0xffffff);
      } else {
        P.tube(b.x, dy + 1.6, b.z, b.x, dy + 9, b.z, 0.07, STEEL, 0, 4);
      }
      P.deck(xa - 1.5, b.z - 0.8, xa, b.z + 0.8, dy, PLANK, "", { rail: false });
    }
    building(P, xs + 10, mz - 7, xs + 20, mz + 3, 5, S.DECO, 0x2f757c, world.height(xs + 15, mz) + 0.1, { neon: 1 });
    const big = boats.find((b) => b.big);
    return { name: "Preview Marina", x: xs - 50, z: mz, r: 90, prize: { x: big.x, y: Y + 0.45 + 2.6, z: big.z + 22 / 2 - 4, value: 2500 } };
  },
};
