// Mission buildings for the story: Brittle Systems' tower, the Audit's precinct, the Legacy Crew's yard,
// the Coldline data centre, Dex's garage, Lupe's club and the Lazy Loader Motel. Pure JS like
// structures.js: map.js (planSites) picks a lot, these builders fill it with parts, buildings and walk
// surfaces, and each returns its name and the named points the missions use (`anchors`).

import { Parts, fireEscape } from "./structures.js";

const IRON = 0x2b3133, STEEL = 0x8d969a, CONC = 0xc9c2b6, ORANGE = 0xff6018, WOOD = 0x8a6a4c, PLANK = 0xa7835f;
const CREAM = 0xfff7ee, SPRUCE = 0x2f757c, YELLOW = 0xd7a03d, WHITE = 0xfffdf9, GREEN = 0x5d8f5e, INK = 0x182b2e;
const ASPHALT = 0x3f4446, GLASS = 0x8fc3dc, GRAPHITE = 0x2b3440, SLATE = 0x4a5258;
// Building styles, as map.js numbers them.
const S = { GLASS: 0, DECO: 1, OFFICE: 2, HOUSE: 3, WARE: 4, BOX: 5, HOSP: 6, CONC: 9 };
// Sign texts (indices into SIGNS in map.js).
export const SITE_SIGNS = ["BRITTLE SYSTEMS", "THE AUDIT", "MERGE CONFLICT MOTORS", "THE STANDUP", "LAZY LOADER MOTEL", "COLDLINE DATA CENTRE", "LEGACY"];
const SIGN = { brittle: 16, audit: 17, garage: 18, club: 19, motel: 20, coldline: 21, legacy: 22 };

// A site laid out from the road it faces: `a` runs along the frontage (0..W, in the direction of
// increasing world x or z) and `d` runs in from the road (0..D). side is the lot side on the road:
// 0 west (x0), 1 east (x1), 2 north (z0), 3 south (z1).
export class Frame {
  constructor(lot, side, W, D, shift = 0) {
    this.side = side;
    const alongX = side >= 2;
    this.alongX = alongX;
    const A0 = alongX ? lot.x0 : lot.z0, A1 = alongX ? lot.x1 : lot.z1;
    this.W = Math.min(W, A1 - A0);
    this.D = Math.min(D, alongX ? lot.z1 - lot.z0 : lot.x1 - lot.x0);
    const mid = (A0 + A1) / 2 + (shift * (A1 - A0 - this.W)) / 2;
    this.a0 = mid - this.W / 2;
    this.front = side === 0 ? lot.x0 : side === 1 ? lot.x1 : side === 2 ? lot.z0 : lot.z1;
    this.sgn = side === 0 || side === 2 ? 1 : -1;
  }
  p(a, d) { const u = this.a0 + a, v = this.front + this.sgn * d; return this.alongX ? [u, v] : [v, u]; }
  // A rectangle from (a0, d0) to (a1, d1), as world { x0, z0, x1, z1 }.
  r(a0, d0, a1, d1) {
    const [xa, za] = this.p(a0, d0), [xb, zb] = this.p(a1, d1);
    return { x0: Math.min(xa, xb), z0: Math.min(za, zb), x1: Math.max(xa, xb), z1: Math.max(za, zb) };
  }
  // A face of a rectangle as a fire-escape side index (0 -x, 1 +x, 2 -z, 3 +z): front faces the road.
  face(f) {
    const front = this.side, back = { 0: 1, 1: 0, 2: 3, 3: 2 }[this.side];
    if (f === "front") return front;
    if (f === "back") return back;
    if (f === "lo") return this.alongX ? 0 : 2;
    return this.alongX ? 1 : 3;
  }
  // Rotation for a sign facing out of that face (signs face (-sin rot, -cos rot)).
  rot(f) { const [nx, nz] = OUT[this.face(f)]; return Math.atan2(-nx, -nz); }
  out(f) { return OUT[this.face(f)]; }
  // The axis that depth runs along, and which way, for ramps (y0 is at the low-coordinate end).
  rampD(P, a0, a1, dLow, dHigh, yLow, yHigh, col, rails, o) {
    const R = this.r(a0, dLow, a1, dHigh);
    const ax = this.alongX ? "z" : "x";
    const lowFirst = this.sgn > 0 === dLow < dHigh;
    P.ramp(R.x0, R.z0, R.x1, R.z1, ax, lowFirst ? yLow : yHigh, lowFirst ? yHigh : yLow, col, rails, o);
  }
  rampA(P, aLow, aHigh, d0, d1, yLow, yHigh, col, rails, o) {
    const R = this.r(aLow, d0, aHigh, d1);
    const ax = this.alongX ? "x" : "z";
    P.ramp(R.x0, R.z0, R.x1, R.z1, ax, aLow < aHigh ? yLow : yHigh, aLow < aHigh ? yHigh : yLow, col, rails, o);
  }
  // Rail letters for the named local sides of a rectangle (front/back/lo/hi -> n/s/w/e).
  rails(...fs) { return fs.map((f) => ({ 0: "w", 1: "e", 2: "n", 3: "s" })[this.face(f)]).join(""); }
}
const OUT = { 0: [-1, 0], 1: [1, 0], 2: [0, -1], 3: [0, 1] };

// ------------------------------------------------------------------------------- helpers

const mid = (R) => [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2];
function slab(P, R, y, col, t = 0.1) { P.box((R.x0 + R.x1) / 2, y - t + 0.08, (R.z0 + R.z1) / 2, R.x1 - R.x0, t, R.z1 - R.z0, col); }
function block(P, R, y, h, col, e = 0) { P.box((R.x0 + R.x1) / 2, y, (R.z0 + R.z1) / 2, R.x1 - R.x0, h, R.z1 - R.z0, col, e); }
function building(P, R, h, style, color, gy, o = {}) {
  const b = { x0: R.x0, z0: R.z0, x1: R.x1, z1: R.z1, h, style, color, seed: o.seed != null ? o.seed : ((R.x0 * 0.137 + R.z0 * 0.291) % 1 + 1) % 1, roof: o.roof || 0, neon: o.neon != null ? o.neon : -1, gy, y0: gy - 1.5, lm: true };
  if (o.tiers) b.tiers = o.tiers;
  if (o.bareRoof) b.bareRoof = true;
  P.buildings.push(b);
  if (!o.noSolid) P.solid(R.x0, R.z0, R.x1, R.z1, gy + h);
  return b;
}
function lamp(P, x, z, y, h = 6, col = 0x3d4a4c) {
  P.tube(x, y, z, x, y + h, z, 0.1, col, 0, 6);
  P.box(x, y + h - 0.1, z, 0.55, 0.2, 0.55, 0xfff1d6, 4);
  P.glow("lamp", x, y + h - 0.25, z);
  P.circles.push({ x, z, r: 0.18, kind: "post", y1: y + h });
}
// A wall from a to b with an optional opening [t0, t1] (fractions along it).
function wall(P, ax, az, bx, bz, y, h, t, col, gaps = [], cap = null) {
  const len = Math.hypot(bx - ax, bz - az);
  const spans = [];
  let s = 0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > s) spans.push([s, g0]); s = g1; }
  if (s < 1) spans.push([s, 1]);
  for (const [u0, u1] of spans) {
    const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
    const alongX = Math.abs(bx - ax) > Math.abs(bz - az);
    const R = alongX ? { x0: Math.min(x0, x1), z0: z0 - t / 2, x1: Math.max(x0, x1), z1: z0 + t / 2 } : { x0: x0 - t / 2, z0: Math.min(z0, z1), x1: x0 + t / 2, z1: Math.max(z0, z1) };
    const n = Math.max(1, Math.round((len * (u1 - u0)) / 4));
    // Panels with a slight colour step between them, so long walls don't read as one slab.
    for (let k = 0; k < n; k++) {
      const f0 = k / n, f1 = (k + 1) / n;
      const r = alongX ? { x0: R.x0 + (R.x1 - R.x0) * f0, z0: R.z0, x1: R.x0 + (R.x1 - R.x0) * f1, z1: R.z1 } : { x0: R.x0, z0: R.z0 + (R.z1 - R.z0) * f0, x1: R.x1, z1: R.z0 + (R.z1 - R.z0) * f1 };
      block(P, r, y, h, Array.isArray(col) ? col[k % col.length] : col);
    }
    if (cap) block(P, { x0: R.x0 - 0.06, z0: R.z0 - 0.06, x1: R.x1 + 0.06, z1: R.z1 + 0.06 }, y + h, 0.12, cap);
    P.solid(R.x0, R.z0, R.x1, R.z1, y + h);
  }
}
// Chain-link fence: posts, rails and a see-through-ish mesh (a dark thin panel), optionally topped with wire.
function fence(P, ax, az, bx, bz, y, h, gaps = [], wire = false) {
  const len = Math.hypot(bx - ax, bz - az);
  const spans = [];
  let s = 0;
  for (const [g0, g1] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (g0 > s) spans.push([s, g0]); s = g1; }
  if (s < 1) spans.push([s, 1]);
  for (const [u0, u1] of spans) {
    const x0 = ax + (bx - ax) * u0, z0 = az + (bz - az) * u0, x1 = ax + (bx - ax) * u1, z1 = az + (bz - az) * u1;
    const L = len * (u1 - u0), n = Math.max(1, Math.ceil(L / 2.8));
    for (let k = 0; k <= n; k++) { const t = k / n; P.tube(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, x0 + (x1 - x0) * t, y + h + 0.1, z0 + (z1 - z0) * t, 0.045, 0x6f7678, 0, 4); }
    for (const yy of [y + 0.1, y + h]) P.tube(x0, yy, z0, x1, yy, z1, 0.03, 0x6f7678, 0, 4);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const R = alongX ? { x0: Math.min(x0, x1), z0: z0 - 0.02, x1: Math.max(x0, x1), z1: z0 + 0.02 } : { x0: x0 - 0.02, z0: Math.min(z0, z1), x1: x0 + 0.02, z1: Math.max(z0, z1) };
    block(P, R, y + 0.12, h - 0.15, 0x7d8587);
    if (wire) for (let k = 0; k < 3; k++) P.tube(x0, y + h + 0.25 + k * 0.12, z0, x1, y + h + 0.25 + k * 0.12, z1, 0.02, 0xaab0b2, 0, 3);
    P.solid(R.x0 - 0.05, R.z0 - 0.05, R.x1 + 0.05, R.z1 + 0.05, y + h);
  }
}
// The four sides of a rectangle as segments, front first: [ax, az, bx, bz, face].
function sides(F, a0, d0, a1, d1) {
  const P0 = F.p(a0, d0), P1 = F.p(a1, d0), P2 = F.p(a1, d1), P3 = F.p(a0, d1);
  return [[...P0, ...P1, "front"], [...P1, ...P2, "hi"], [...P2, ...P3, "back"], [...P3, ...P0, "lo"]];
}
// A sign on a building face: centred at (a, d) on that face, outward by 0.3 m.
function faceSign(P, F, a, d, y, w, h, face, text, color) {
  const [x, z] = F.p(a, d), [nx, nz] = F.out(face);
  P.signs.push({ x: x + nx * 0.3, z: z + nz * 0.3, y, w, h, rot: F.rot(face), text, color });
}
// Painted parking bays in a row along `a`, opening toward d0.
function bays(P, F, a0, a1, d0, d1, y, w = 2.7) {
  const n = Math.floor((a1 - a0) / w);
  for (let k = 0; k <= n; k++) block(P, F.r(a0 + k * w - 0.06, d0, a0 + k * w + 0.06, d1), y + 0.02, 0.03, WHITE);
}
function drum(P, x, z, y, col) { P.tube(x, y, z, x, y + 0.9, z, 0.3, col, 0, 8); P.circles.push({ x, z, r: 0.32, kind: "post", y1: y + 0.9 }); }
function tyres(P, x, z, y, n) { for (let k = 0; k < n; k++) P.tube(x, y + k * 0.24, z, x, y + k * 0.24 + 0.22, z, 0.34, 0x1c1d1e, 0, 10); P.circles.push({ x, z, r: 0.36, kind: "post", y1: y + n * 0.24 }); }
function tree(P, x, z, y, s = 1) {
  P.tube(x, y, z, x, y + 2.6 * s, z, 0.16 * s, 0x8a7158, 0, 5);
  P.blob(x, y + 3.6 * s, z, 2 * s, 1.7 * s, 2 * s, 0x6f9a5a);
  P.circles.push({ x, z, r: 0.25, kind: "tree", y1: y + 5 * s });
}
// A cracked square: Brittle Systems' mark, drawn in a vertical plane facing (nx, nz).
function brittleMark(P, x, y, z, size, nx, nz, col = 0xb9c0c4, e = 3) {
  const rx = -nz, rz = nx, t = size * 0.11, h = size / 2;
  const at = (u, v) => [x + rx * u, y + v, z + rz * u];
  const bar = (u0, v0, u1, v1) => { const a = at(u0, v0), b = at(u1, v1); P.tube(a[0], a[1], a[2], b[0], b[1], b[2], t / 2, col, e, 4); };
  bar(-h, -h, h, -h); bar(h, -h, h, h); bar(h, h, -h, h); bar(-h, h, -h, -h);
  // The crack: a jagged line from the top edge down to the right side.
  const crack = [[-h * 0.15, h], [h * 0.05, h * 0.45], [-h * 0.2, h * 0.1], [h * 0.25, -h * 0.25], [h * 0.05, -h * 0.55], [h, -h * 0.7]];
  for (let k = 0; k < crack.length - 1; k++) { const a = at(...crack[k]), b = at(...crack[k + 1]); P.tube(a[0] + nx * 0.06, a[1], a[2] + nz * 0.06, b[0] + nx * 0.06, b[1], b[2] + nz * 0.06, t * 0.28, 0x1a1d20, 0, 4); }
}

// --------------------------------------------------------------------------------- sites
// Each takes (P, s, world) with s = { F (a Frame), gy, lot, lo, hi } and returns { name, anchors }.

export const SITES = {
  // Brittle Systems HQ: a dark glass tower behind a walled plaza, a car port, and an outside fire stair
  // all the way to the helipad on the roof.
  brittle_hq(P, s) {
    const { F, gy } = s, W = F.W, D = F.D, am = W / 2;
    slab(P, F.r(0, 0, W, D), gy, 0x6b7174);
    // Plaza paving bands.
    for (let d = 8; d < D - 50; d += 6) block(P, F.r(4, d, W - 4, d + 0.4), gy + 0.03, 0.03, 0x8d969a);
    // Perimeter wall with the gate on the road.
    const gap = 12 / (W - 2);
    for (const [ax, az, bx, bz, f] of sides(F, 1, 1, W - 1, D - 1)) {
      wall(P, ax, az, bx, bz, gy, 2.4, 0.5, [0x3a3f44, 0x40464b], f === "front" ? [[0.5 - gap / 2, 0.5 + gap / 2]] : [], 0x8d969a);
    }
    // Gatehouse and barrier.
    const gh = F.r(am + 8, 3, am + 12, 7);
    building(P, gh, 3.2, S.GLASS, 0x39424c, gy, { bareRoof: true });
    block(P, { x0: gh.x0 - 0.3, z0: gh.z0 - 0.3, x1: gh.x1 + 0.3, z1: gh.z1 + 0.3 }, gy + 3.2, 0.25, GRAPHITE);
    { const [bx, bz] = F.p(am + 6, 2), [ex, ez] = F.p(am - 2, 2); P.tube(bx, gy + 1, bz, ex, gy + 1 + 4.5, ez, 0.07, WHITE, 0, 6); P.box(bx, gy, bz, 0.5, 1.1, 0.5, 0xd7a03d); }
    for (const a of [am - 6.6, am + 6.6]) { const [x, z] = F.p(a, 1); P.box(x, gy, z, 1.2, 3.4, 1.2, 0x3a3f44); P.box(x, gy + 3.4, z, 1.4, 0.3, 1.4, 0x8d969a); brittleMark(P, x + F.out("front")[0] * 0.62, gy + 2.2, z + F.out("front")[1] * 0.62, 0.9, ...F.out("front")); }
    // The tower: 30 m square to 84 m, then a 24 m crown to 110 m with the helipad.
    const tR = F.r(am - 15, D - 44, am + 15, D - 14);
    const inset = 3;
    const crown = { x0: tR.x0 + inset, z0: tR.z0 + inset, x1: tR.x1 - inset, z1: tR.z1 - inset, y0: 84, y1: 110 };
    const tower = building(P, tR, 84, S.GLASS, GRAPHITE, gy, { tiers: [crown], bareRoof: true, seed: 0.41 });
    P.solid(crown.x0, crown.z0, crown.x1, crown.z1, gy + 110);
    // Its mark high on the front and back faces, lit at night.
    for (const face of ["front", "back"]) {
      const [nx, nz] = F.out(face), d = face === "front" ? D - 44 : D - 14, [x, z] = F.p(am, d);
      brittleMark(P, x + nx * (inset + 0.5), gy + 96, z + nz * (inset + 0.5), 11, nx, nz);
      brittleMark(P, x + nx * 0.5, gy + 74, z + nz * 0.5, 8, nx, nz);
    }
    // The outside fire stair: base to the 84 m roof, then up the crown to the helipad.
    const stairFace = F.face("hi");
    fireEscape(P, tower, stairFace, "escape", gy + 0.15, 0, 0x3a3f44);
    fireEscape(P, { x0: crown.x0, z0: crown.z0, x1: crown.x1, z1: crown.z1, gy: gy + 84, h: 26 }, stairFace, "escape", gy + 84, 0, 0x3a3f44);
    // Helipad.
    const [hx, hz] = mid(crown), ry = gy + 110;
    P.tube(hx, ry, hz, hx, ry + 0.06, hz, 9, 0x3d4a4c, 0, 24);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, b2 = ((k + 1) / 24) * Math.PI * 2; P.tube(hx + Math.cos(a) * 8, ry + 0.08, hz + Math.sin(a) * 8, hx + Math.cos(b2) * 8, ry + 0.08, hz + Math.sin(b2) * 8, 0.16, WHITE, 0, 4); }
    // A cracked-square pad marking, flat on the deck.
    for (const [ax, az, bx, bz] of [[-3, -3, 3, -3], [3, -3, 3, 3], [3, 3, -3, 3], [-3, 3, -3, -3], [-0.5, -3, 0.3, -1], [0.3, -1, -0.6, 0.4], [-0.6, 0.4, 3, 1.8]]) P.tube(hx + ax, ry + 0.09, hz + az, hx + bx, ry + 0.09, hz + bz, 0.2, YELLOW, 0, 4);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; P.glow("lamp", hx + Math.cos(a) * 9.3, ry + 0.3, hz + Math.sin(a) * 9.3, 0x7fe08a); }
    for (const [x, z] of [[crown.x0 + 0.6, crown.z0 + 0.6], [crown.x1 - 0.6, crown.z1 - 0.6], [crown.x0 + 0.6, crown.z1 - 0.6], [crown.x1 - 0.6, crown.z0 + 0.6]]) P.glow("beacon", x, ry + 1.6, z);
    // Windsock.
    P.tube(crown.x0 + 1.5, ry, crown.z0 + 1.5, crown.x0 + 1.5, ry + 4, crown.z0 + 1.5, 0.05, STEEL, 0, 4);
    P.tube(crown.x0 + 1.5, ry + 3.8, crown.z0 + 1.5, crown.x0 + 3.2, ry + 3.6, crown.z0 + 1.5, 0.28, ORANGE, 0, 6, 0.12);
    // The lobby: a two-storey glass box under a long canopy, with the company's name over the door.
    const lR = F.r(am - 13, D - 53, am + 13, D - 44);
    building(P, lR, 8.5, S.GLASS, 0x39424c, gy, { bareRoof: true, seed: 0.77 });
    const cR = F.r(am - 9, D - 57, am + 9, D - 53);
    block(P, cR, gy + 4.6, 0.35, GRAPHITE);
    for (const a of [am - 8.4, am + 8.4]) { const [x, z] = F.p(a, D - 56.6); P.tube(x, gy, z, x, gy + 4.6, z, 0.14, STEEL, 0, 8); P.circles.push({ x, z, r: 0.15, kind: "post", y1: gy + 4.6 }); }
    faceSign(P, F, am, D - 53, gy + 6.4, 16, 1.6, "front", SIGN.brittle, 0xc9d2d6);
    for (const a of [am - 5, am + 5]) { const [x, z] = F.p(a, D - 56.8); P.glow("lamp", x, gy + 4.4, z, 0xd8ecff); }
    // Fountain and planters on the plaza.
    const [fx, fz] = F.p(am, 26);
    P.tube(fx, gy, fz, fx, gy + 0.6, fz, 6, 0x8d969a, 0, 20);
    P.tube(fx, gy + 0.55, fz, fx, gy + 0.62, fz, 5.6, 0x3c7f8f, 3, 20);
    P.tube(fx, gy, fz, fx, gy + 2.2, fz, 0.5, 0x8d969a, 0, 10);
    P.circles.push({ x: fx, z: fz, r: 6, kind: "post", y1: gy + 0.6 });
    for (const a of [10, 24, W - 24, W - 10]) for (const d of [12, 36]) {
      const [x, z] = F.p(a, d);
      P.box(x, gy, z, 3, 0.7, 3, 0x3a3f44); tree(P, x, z, gy + 0.7, 0.8);
      P.solid(x - 1.5, z - 1.5, x + 1.5, z + 1.5, gy + 0.7);
    }
    for (const a of [am - 3, am, am + 3]) { const [x, z] = F.p(a, 6); P.tube(x, gy, z, x, gy + 9, z, 0.07, STEEL, 0, 6); P.box(x + F.out("lo")[0] * 0.9, gy + 7.6, z + F.out("lo")[1] * 0.9, F.alongX ? 1.8 : 0.05, 1.2, F.alongX ? 0.05 : 1.8, a === am ? 0x6b7174 : 0xb9c0c4); P.circles.push({ x, z, r: 0.1, kind: "post", y1: gy + 9 }); }
    // The car port: a concrete deck on columns along the low side, bays beneath.
    const gR = F.r(5, 18, 29, D - 8);
    block(P, gR, gy + 3.6, 0.45, 0x8d969a);
    block(P, { x0: gR.x0, z0: gR.z0, x1: gR.x1, z1: gR.z1 }, gy + 4.05, 0.9, 0x3a3f44);
    for (let a = 5; a <= 29.01; a += 8) for (let d = 18; d <= D - 7.99; d += 8) { const [x, z] = F.p(a, d); P.box(x, gy, z, 0.6, 3.6, 0.6, 0x9a9a94); P.circles.push({ x, z, r: 0.35, kind: "post", y1: gy + 3.6 }); }
    bays(P, F, 7, 27, 20, 25, gy); bays(P, F, 7, 27, D - 15, D - 10, gy);
    for (let d = 26; d < D - 12; d += 12) { const [x, z] = F.p(17, d); P.glow("lamp", x, gy + 3.4, z, 0xd8ecff); }
    faceSign(P, F, 17, 18, gy + 4.5, 10, 0.8, "front", SIGN.brittle, 0xc9d2d6);
    for (const [a, d] of [[4, 4], [W - 4, 4], [4, D - 4], [W - 4, D - 4], [am - 14, 18], [am + 14, 18]]) { const [x, z] = F.p(a, d); lamp(P, x, z, gy, 6, 0x3a3f44); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    return {
      name: "Brittle Systems HQ",
      anchors: { gate: A(am, 2.5), plaza: A(am, 16), lobby: A(am, D - 58.5), garage: A(17, D / 2 + 4), roof: { x: hx + 4, y: ry, z: hz + 4 } },
    };
  },

  // The Audit: a blocky precinct, a holding block behind, and a fenced yard for patrol cars and the impound.
  audit_hq(P, s) {
    const { F, gy } = s, W = F.W, D = F.D;
    slab(P, F.r(0, 0, W, D), gy, 0xb9b3aa);
    const pa = W * 0.62;
    // The precinct: three storeys of stone with a spruce band and a deep entrance canopy.
    const pR = F.r(pa - 22, 12, pa + 22, 32);
    const b = building(P, pR, 12.6, S.OFFICE, 0xd3cbbd, gy, { seed: 0.23 });
    const band = (y0, y1, col) => block(P, { x0: pR.x0 - 0.12, z0: pR.z0 - 0.12, x1: pR.x1 + 0.12, z1: pR.z1 + 0.12 }, gy + y0, y1 - y0, col);
    band(3.4, 4, SPRUCE); band(12.3, 12.9, SPRUCE);
    const cR = F.r(pa - 7, 7, pa + 7, 12);
    block(P, cR, gy + 4.2, 0.4, SPRUCE);
    for (const a of [pa - 6.4, pa - 2.2, pa + 2.2, pa + 6.4]) { const [x, z] = F.p(a, 7.6); P.tube(x, gy, z, x, gy + 4.2, z, 0.22, CREAM, 0, 10); P.circles.push({ x, z, r: 0.24, kind: "post", y1: gy + 4.2 }); }
    for (let k = 0; k < 3; k++) block(P, F.r(pa - 7, 9.2 + k * 0.9, pa + 7, 12), gy, 0.18 * (k + 1), 0xc9c2b6);
    faceSign(P, F, pa, 12, gy + 6.6, 14, 2.2, "front", SIGN.audit, 0xfff7ee);
    for (const a of [pa - 5, pa + 5]) { const [x, z] = F.p(a, 7.4); P.glow("lamp", x, gy + 4, z, 0xfff1d6); }
    // Flags in Asoka City's colours.
    for (const [a, col] of [[pa - 12, ORANGE], [pa + 12, SPRUCE]]) {
      const [x, z] = F.p(a, 5);
      P.tube(x, gy, z, x, gy + 10, z, 0.06, STEEL, 0, 6); P.circles.push({ x, z, r: 0.08, kind: "post", y1: gy + 10 });
      const [lx, lz] = F.out("lo");
      P.box(x + lx * 1.1, gy + 8.4, z + lz * 1.1, F.alongX ? 2.1 : 0.05, 1.3, F.alongX ? 0.05 : 2.1, col);
    }
    // Holding block behind, with the cells' door at the back.
    // Holding block beside it, its door (the cells) on the street side, slit windows above.
    const ha0 = pa + 25, ha1 = Math.min(W - 3, pa + 37);
    const hR = F.r(ha0, 15, ha1, 32);
    building(P, hR, 7, S.CONC, 0xb9b3aa, gy, { seed: 0.61 });
    for (let k = 0; k < 4; k++) { const a = ha0 + 1.5 + k * ((ha1 - ha0 - 3) / 3); const [x, z] = F.p(a, 14.95); P.box(x, gy + 4.2, z, F.alongX ? 1 : 0.06, 0.35, F.alongX ? 0.06 : 1, 0x2b3133); }
    const cellsA = (ha0 + ha1) / 2, [cdx, cdz] = F.p(cellsA, 14.95);
    P.box(cdx, gy, cdz, F.alongX ? 1.6 : 0.1, 2.4, F.alongX ? 0.1 : 1.6, 0x4a5258);
    P.glow("lamp", cdx + F.out("front")[0] * 0.4, gy + 2.8, cdz + F.out("front")[1] * 0.4, 0xfff1d6);
    // A fire escape up the back of the precinct to the roof, and a radio mast up there.
    fireEscape(P, b, F.face("back"), "escape", gy + 0.15, -0.55, SPRUCE);
    const [mx, mz] = F.p(pa + 16, 16);
    P.tube(mx, gy + 12.6, mz, mx, gy + 30, mz, 0.3, 0xb8544f, 0, 6, 0.12);
    for (const y of [17, 23]) P.box(mx, gy + y, mz, 1.6, 0.15, 1.6, WHITE);
    P.glow("beacon", mx, gy + 30.6, mz);
    // The yard: fenced, lit, painted bays and a maintenance shed; its gate faces the road.
    const ya0 = 4, ya1 = pa - 25, yd0 = 4, yd1 = D - 4;
    slab(P, F.r(ya0, yd0, ya1, yd1), gy + 0.02, ASPHALT);
    const gw = 9 / (ya1 - ya0);
    for (const [ax, az, bx, bz, f] of sides(F, ya0, yd0, ya1, yd1)) fence(P, ax, az, bx, bz, gy, 2.8, f === "front" ? [[0.5 - gw / 2, 0.5 + gw / 2]] : [], true);
    for (let d = 14; d < yd1 - 10; d += 12) bays(P, F, ya0 + 2, ya1 - 2, d, d + 5, gy);
    const sR = F.r(ya0 + 2, yd1 - 14, ya1 - 2, yd1 - 2);
    building(P, sR, 5.2, S.WARE, 0x8fabaf, gy, { seed: 0.35 });
    for (const [a, d] of [[ya0 + 1.5, 20], [ya1 - 1.5, 40], [ya0 + 1.5, 60]]) { if (d > yd1 - 16) continue; const [x, z] = F.p(a, d); lamp(P, x, z, gy, 8, 0x3d4a4c); }
    for (let k = 0; k < 6; k++) { const [x, z] = F.p(ya0 + 4 + k * 1.2, 7); P.tube(x, gy, z, x, gy + 0.7, z, 0.18, ORANGE, 0, 6, 0.03); }
    // Behind the precinct: the records annex, and the staff car park between them.
    const xR = F.r(ya1 + 6, D - 30, W - 4, D - 6);
    building(P, xR, 15.2, S.OFFICE, 0xc9c2b6, gy, { seed: 0.87 });
    block(P, { x0: xR.x0 - 0.12, z0: xR.z0 - 0.12, x1: xR.x1 + 0.12, z1: xR.z1 + 0.12 }, gy + 3.4, 0.5, SPRUCE);
    faceSign(P, F, (ya1 + 6 + W - 4) / 2, D - 30, gy + 12, 12, 1.6, "front", SIGN.audit, 0xfff7ee);
    slab(P, F.r(ya1 + 4, 50, W - 4, D - 33), gy + 0.02, ASPHALT);
    for (const d of [52, 60]) bays(P, F, ya1 + 6, W - 6, d, d + 5, gy);
    for (let a = ya1 + 8; a < W - 6; a += 9) { const [x, z] = F.p(a, 58.4); tree(P, x, z, gy, 0.7); }
    for (const a of [ya1 + 5, W - 5]) { const [x, z] = F.p(a, 56); lamp(P, x, z, gy, 7); }
    // Hedges and lamps along the front.
    for (const [a0, a1] of [[ya1 + 3, pa - 9], [pa + 9, W - 3]]) block(P, F.r(a0, 2, a1, 3.4), gy, 1.1, 0x5d8f5e);
    for (const a of [ya1 + 4, W - 4]) { const [x, z] = F.p(a, 6); lamp(P, x, z, gy); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    const [rx, rz] = mid(pR);
    return {
      name: "The Audit",
      anchors: { gate: A((ya0 + ya1) / 2, 2), yard: A((ya0 + ya1) / 2, D / 2), roof: { x: rx, y: gy + 12.6, z: rz }, cells: A(cellsA, 13.6) },
    };
  },

  // The Legacy Crew's yard: a corrugated wall, two warehouses, container stacks, a portacabin office,
  // a watchtower and a quay at the back.
  legacy_yard(P, s) {
    const { F, gy } = s, W = F.W, D = F.D, am = W / 2;
    slab(P, F.r(0, 0, W, D), gy + 0.01, 0x8f8a80);
    // Oil stains.
    for (let k = 0; k < 9; k++) { const a = 12 + ((k * 37) % (W - 24)), d = 14 + ((k * 23) % (D - 28)); block(P, F.r(a, d, a + 2 + (k % 3), d + 1.5 + (k % 2)), gy + 0.04, 0.02, 0x5c574f); }
    const rust = [0x7a4a36, 0x5a4636, 0x6d5a48, 0x844f39];
    const gap = 11 / (W - 2);
    for (const [ax, az, bx, bz, f] of sides(F, 1, 1, W - 1, D - 1)) wall(P, ax, az, bx, bz, gy, 3.2, 0.35, rust, f === "front" ? [[0.5 - gap / 2, 0.5 + gap / 2]] : [], 0x3b3027);
    // Razor wire along the top of the wall.
    for (const [ax, az, bx, bz] of sides(F, 1, 1, W - 1, D - 1)) for (let k = 0; k < 2; k++) P.tube(ax, gy + 3.45 + k * 0.18, az, bx, gy + 3.45 + k * 0.18, bz, 0.03, 0xaab0b2, 0, 3);
    // A gate, left half open.
    { const [x0, z0] = F.p(am - 5.5, 0.8), [x1, z1] = F.p(am - 1.5, 3.5); P.tube(x0, gy + 1.5, z0, x1, gy + 1.5, z1, 0.06, IRON, 0, 4); P.tube(x0, gy + 2.8, z0, x1, gy + 2.8, z1, 0.06, IRON, 0, 4); P.tube(x0, gy + 0.2, z0, x1, gy + 0.2, z1, 0.06, IRON, 0, 4); }
    // Warehouses.
    const wA = F.r(8, 40, 42, 66), wB = F.r(W - 38, 52, W - 8, 76);
    building(P, wA, 10, S.WARE, 0x8a8073, gy, { seed: 0.12 });
    building(P, wB, 8.5, S.WARE, 0x5599a0, gy, { seed: 0.58 });
    for (const [R, a] of [[wA, 25], [wB, W - 23]]) { const d = R === wA ? 40 : 52; const [x, z] = F.p(a, d - 0.05); P.box(x, gy, z, F.alongX ? 8 : 0.1, 5.5, F.alongX ? 0.1 : 8, 0x2b2622); }
    faceSign(P, F, 25, 40, gy + 7.6, 12, 2, "front", SIGN.legacy, 0xff6a2e);
    // Container stacks between them.
    const cols = [0xff6018, 0x2f757c, 0xd7a03d, 0xb8544f, 0x507fa7, 0x5d8f5e, 0xa4517b];
    // Containers in stacks either side of the lane in from the gate.
    let ci = 0;
    for (const [a0, a1] of [[21, am - 7], [am + 7, W - 6]]) for (let a = a0; a + 12.2 <= a1; a += 13) for (const d of [16, 18.7, 29, 31.7]) {
      if (a + 12.2 > W - 40 && d > 28 && a > am) continue;
      const t = 1 + ((ci * 7 + Math.round(a)) % 3);
      building(P, F.r(a, d, a + 12.2, d + 2.5), 2.6 * t, S.BOX, cols[ci++ % cols.length], gy, { seed: (ci * 0.37) % 1 });
    }
    // The office: two portacabins, stacked, with a stair to the upper one.
    const o1 = F.r(W - 26, 8, W - 14, 12);
    building(P, o1, 2.8, S.BOX, 0xefe3d2, gy, { seed: 0.9 });
    building(P, o1, 2.8, S.BOX, 0xd8c39a, gy + 2.8, { seed: 0.2 });
    F.rampA(P, W - 8, W - 13.6, 8, 9.6, gy, gy + 2.8, IRON, F.rails("front"), { railCol: YELLOW });
    P.deck(...Object.values(F.r(W - 14, 8, W - 13.6, 12)), gy + 2.8, IRON, "", { rail: false });
    for (const a of [W - 22, W - 18]) { const [x, z] = F.p(a, 7.95); P.box(x, gy + 1, z, F.alongX ? 1.4 : 0.05, 0.8, F.alongX ? 0.05 : 1.4, GLASS, 3); }
    const [odx, odz] = F.p(W - 16, 7.95);
    P.box(odx, gy, odz, F.alongX ? 0.9 : 0.06, 2, F.alongX ? 0.06 : 0.9, 0x5a4636);
    // Watchtower inside the gate: switchback stairs to a cabin deck at 9.6 m.
    // (The stairs' top landing is at their low-coordinate end, so the cabin deck sits on that side.)
    const tR = F.r(10, 8, 18, 12.4);
    const ys = [gy, gy + 3.2, gy + 6.4, gy + 9.6];
    P.stairs(tR.x0, tR.z0, tR.x1, tR.z1, F.alongX ? "x" : "z", ys, IRON, { railCol: YELLOW, open: (k) => (k === ys.length - 1 ? F.rails("lo") : "") });
    const dR = F.r(4.8, 7, 10, 13.4);
    P.deck(dR.x0, dR.z0, dR.x1, dR.z1, gy + 9.6, PLANK, F.rails("front", "back", "lo"), { railCol: IRON });
    for (const [a, d] of [[4.8, 7], [10, 7], [4.8, 13.4], [10, 13.4]]) { const [x, z] = F.p(a, d); P.tube(x, gy, z, x, gy + 12.2, z, 0.09, IRON, 0, 4); P.circles.push({ x, z, r: 0.1, kind: "post", y1: gy + 12 }); }
    block(P, { x0: dR.x0 - 0.3, z0: dR.z0 - 0.3, x1: dR.x1 + 0.3, z1: dR.z1 + 0.3 }, gy + 12.2, 0.2, 0x5a4636);
    { const [x, z] = F.p(7.4, 7.2); P.box(x, gy + 11.4, z, 0.6, 0.4, 0.6, 0xfff1d6, 4); P.glow("lamp", x, gy + 11.3, z); }
    // The quay along the back: a concrete edge, bollards and a little crane.
    block(P, F.r(2, D - 5, W - 2, D - 1.6), gy + 0.02, 0.15, 0xb9b3aa);
    for (let a = 8; a < W - 6; a += 10) { const [x, z] = F.p(a, D - 3); P.tube(x, gy, z, x, gy + 0.7, z, 0.2, IRON, 0, 8); P.circles.push({ x, z, r: 0.22, kind: "post", y1: gy + 0.7 }); }
    const [kx, kz] = F.p(am + 10, D - 8);
    P.box(kx, gy, kz, 1.4, 9, 1.4, YELLOW); P.solid(kx - 0.7, kz - 0.7, kx + 0.7, kz + 0.7, gy + 9);
    { const [bx, bz] = F.out("back"); P.tube(kx, gy + 9, kz, kx + bx * 9, gy + 12, kz + bz * 9, 0.3, YELLOW, 0, 4); P.tube(kx + bx * 9, gy + 12, kz + bz * 9, kx + bx * 9, gy + 4, kz + bz * 9, 0.02, IRON, 0, 3); }
    // Wrecks, drums and burning barrels.
    for (const [a, d] of [[am - 12, 26], [am + 16, 36]]) { const [x, z] = F.p(a, d); P.box(x, gy, z, 1.9, 1.2, 4.3, 0x2a2624, 0, 0.4); P.box(x, gy + 1.2, z, 1.6, 0.5, 2.2, 0x1e1c1b, 0, 0.4); P.solid(x - 1.4, z - 1.4, x + 1.4, z + 1.4, gy + 1.5); }
    for (let k = 0; k < 7; k++) { const [x, z] = F.p(46 + (k % 4) * 0.8, 35 + Math.floor(k / 4) * 0.8); drum(P, x, z, gy, k % 2 ? 0x2f757c : 0x8a3a2a); }
    for (const [a, d] of [[am - 4, 22], [W - 20, 30]]) { const [x, z] = F.p(a, d); drum(P, x, z, gy, 0x3b3027); P.glow("amber", x, gy + 1.1, z); P.glow("amber", x, gy + 1.3, z); }
    for (const [a, d] of [[3, 3], [W - 3, 3], [3, D - 8], [W - 3, D - 8], [am, 36]]) { const [x, z] = F.p(a, d); lamp(P, x, z, gy, 8, IRON); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    // The dock anchor at the end of the quay nearer a side street.
    const dockA = s.lot.sides && s.lot.sides[F.face("lo")] ? 8 : W - 8;
    return {
      name: "Legacy yard",
      anchors: { gate: A(am, 2), yard: A(am, 26), office: A(W - 16, 6.8), tower: { ...A(7.4, 10.2), y: gy + 9.6 }, dock: A(dockA, D - 3.2, gy + 0.17) },
    };
  },

  // Coldline Data Centre: two long halls with chillers on the roof, a fenced generator yard and a gate.
  datacenter(P, s, world) {
    const { F, gy, lo } = s, W = F.W, D = F.D, am = W / 2;
    // A concrete terrace levels the hillside, with a ramp up from the road to the gate.
    const pad = F.r(0, 0, W, D), top = gy + 0.08;
    P.box((pad.x0 + pad.x1) / 2, Math.min(lo, gy) - 0.6, (pad.z0 + pad.z1) / 2, pad.x1 - pad.x0, top - Math.min(lo, gy) + 0.6, pad.z1 - pad.z0, 0xb9b3aa);
    const raised = gy - lo > 0.3;
    if (raised) P.solid(pad.x0, pad.z0, pad.x1, pad.z1, top);
    // A driveway from the road, following the ground.
    for (let d = -4.6; d > -(s.drive || 0) - 1; d -= 2) {
      const [x, z] = F.p(am, d - 1), y = world.height(x, z);
      block(P, F.r(am - 3, d - 2.05, am + 3, d + 0.05), y + 0.02, 0.12, ASPHALT);
    }
    const [rfx, rfz] = F.p(am, -4.6), foot = world.height(rfx, rfz) + 0.15;
    if (top - foot > 0.25) {
      F.rampD(P, am - 3.5, am + 3.5, -4.6, 0, foot, top, 0xb9b3aa, "", { smooth: true, base: foot - 1.5, rail: false });
      for (const a of [am - 3.6, am + 3.6]) { const [ax, az] = F.p(a, -4.6), [bx, bz] = F.p(a, 0); P.tube(ax, foot + 1, az, bx, top + 1, bz, 0.04, STEEL, 0, 4); }
    }
    const gw = 8 / (W - 1);
    for (const [ax, az, bx, bz, f] of sides(F, 0.5, 0.5, W - 0.5, D - 0.5)) fence(P, ax, az, bx, bz, gy + 0.08, 2.6, f === "front" ? [[0.5 - gw / 2, 0.5 + gw / 2]] : [], true);
    // Guard booth by the gate.
    const bR = F.r(am + 5, 2, am + 8, 5);
    building(P, bR, 2.8, S.GLASS, 0x39424c, gy, { bareRoof: true });
    block(P, { x0: bR.x0 - 0.3, z0: bR.z0 - 0.3, x1: bR.x1 + 0.3, z1: bR.z1 + 0.3 }, gy + 2.8, 0.2, WHITE);
    // The halls.
    const hA = F.r(5, 9, W - 18, 21), hB = F.r(5, 25, W - 18, 37);
    const halls = [building(P, hA, 7.2, S.WARE, 0xd9dcd8, gy, { bareRoof: true, seed: 0.33 }), building(P, hB, 7.2, S.WARE, 0xcfd3d0, gy, { bareRoof: true, seed: 0.71 })];
    for (const R of [hA, hB]) {
      // A spruce band and louvres along the long faces.
      block(P, { x0: R.x0 - 0.1, z0: R.z0 - 0.1, x1: R.x1 + 0.1, z1: R.z1 + 0.1 }, gy + 6.4, 0.5, SPRUCE);
      // Chillers in two rows on the roof, each with two fans.
      const [cx, cz] = mid(R);
      const along = F.alongX, L = along ? R.x1 - R.x0 : R.z1 - R.z0;
      for (let k = 0; k < Math.floor((L - 6) / 4.2); k++) for (const off of [-2.6, 2.6]) {
        const t = -L / 2 + 4 + k * 4.2;
        const x = along ? cx + t : cx + off, z = along ? cz + off : cz + t;
        P.box(x, gy + 7.2, z, 3.2, 1.4, 2.2, 0xaeb3b0);
        for (const u of [-0.75, 0.75]) { const fx = along ? x + u : x, fz = along ? z : z + u; P.tube(fx, gy + 8.6, fz, fx, gy + 8.7, fz, 0.6, 0x2b3133, 0, 10); }
      }
    }
    faceSign(P, F, (5 + W - 18) / 2, 9, gy + 5, 18, 1.4, "front", SIGN.coldline, 0x3fd0c9);
    const [hdx, hdz] = F.p(18, 8.95);
    P.box(hdx, gy, hdz, F.alongX ? 2.2 : 0.1, 2.6, F.alongX ? 0.1 : 2.2, 0x3a3f44);
    P.glow("lamp", hdx + F.out("front")[0] * 0.5, gy + 3, hdz + F.out("front")[1] * 0.5, 0xd8ecff);
    // Steel stair up the low end of hall A to its roof.
    fireEscape(P, halls[0], F.face("lo"), "escape", gy + 0.15, 0, STEEL);
    // Generator yard: three gensets with stacks, a fuel tank, its own fence.
    const ga0 = W - 15, ga1 = W - 2;
    for (let k = 0; k < 3; k++) {
      const R = F.r(ga0 + 1.5, 9 + k * 8, ga1 - 1.5, 14 + k * 8);
      building(P, R, 2.7, S.BOX, 0x5d8f5e, gy, { seed: 0.2 + k * 0.3 });
      const [x, z] = mid(R);
      P.tube(x, gy + 2.7, z, x, gy + 5.2, z, 0.25, 0x3a3f44, 0, 8);
    }
    const [tx, tz] = F.p((ga0 + ga1) / 2, D - 4.5);
    if (F.alongX) P.tube(tx - 4.5, gy + 1.5, tz, tx + 4.5, gy + 1.5, tz, 1.4, WHITE, 0, 12); else P.tube(tx, gy + 1.5, tz - 4.5, tx, gy + 1.5, tz + 4.5, 1.4, WHITE, 0, 12);
    P.solid(tx - 4.6, tz - 4.6, tx + 4.6, tz + 4.6, gy + 2.9);
    for (const [ax, az, bx, bz, f] of sides(F, ga0, 7.5, ga1, D - 1)) if (f === "lo") fence(P, ax, az, bx, bz, gy + 0.08, 2.2, [[0.1, 0.25]]);
    for (const [a, d] of [[2, 2], [W - 2, 2], [2, D - 2], [W - 16, D - 2], [am, 23]]) { const [x, z] = F.p(a, d); lamp(P, x, z, gy, 7, 0x3d4a4c); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    const [rx, rz] = mid(hA);
    return {
      name: "Coldline Data Centre",
      anchors: { gate: A(am, 1.5, raised ? top : gy + 0.15), hall: A(18, 7.6, raised ? top : gy + 0.15), roof: { x: rx, y: gy + 7.2, z: rz }, generators: A(ga0 - 1.2, 20, raised ? top : gy + 0.15) },
    };
  },

  // Merge Conflict Motors: a brick workshop with three roller doors, a lot of cars out front.
  garage(P, s) {
    const { F, gy } = s, W = F.W, D = F.D;
    slab(P, F.r(0, 0, W, D), gy + 0.02, ASPHALT);
    const wR = F.r(3, 22, W - 3, D - 2);
    building(P, wR, 7.4, S.WARE, 0xb8544f, gy, { seed: 0.44 });
    const n = 3, dw = 5.4;
    for (let k = 0; k < n; k++) {
      const a = 3 + ((W - 6) * (k + 0.5)) / n, open = k === 1;
      const [x, z] = F.p(a, 21.95);
      if (open) {
        P.box(x, gy, z, F.alongX ? dw : 0.1, 4.4, F.alongX ? 0.1 : dw, 0x141617);
        P.box(x, gy + 3.9, z, F.alongX ? dw : 0.16, 0.5, F.alongX ? 0.16 : dw, 0x8d969a);
        P.glow("lamp", x, gy + 3.4, z, 0xfff1d6);
      } else for (let r = 0; r < 11; r++) P.box(x, gy + r * 0.4, z, F.alongX ? dw : 0.12, 0.36, F.alongX ? 0.12 : dw, r % 2 ? 0x8d969a : 0x9aa3a4);
      // Steel frame round each door.
      for (const u of [-dw / 2 - 0.15, dw / 2 + 0.15]) { const [fx, fz] = F.p(a + u, 21.9); P.box(fx, gy, fz, 0.3, 4.5, 0.3, 0x2b3133); }
    }
    faceSign(P, F, W / 2, 22, gy + 5.6, Math.min(20, W - 8), 1.5, "front", SIGN.garage, 0xffc667);
    for (const a of [5, W - 5]) { const [x, z] = F.p(a, 21.6); P.glow("lamp", x, gy + 4.9, z); }
    // The lot: bays, a car lift, tyres, drums and a low fence.
    bays(P, F, 3, W - 3, 4, 10, gy, 3);
    const [lx, lz] = F.p(W - 7, 16);
    for (const u of [-1.6, 1.6]) { const [px, pz] = F.p(W - 7 + u, 16); P.box(px, gy, pz, 0.35, 2.4, 0.35, 0xd7a03d); P.circles.push({ x: px, z: pz, r: 0.25, kind: "post", y1: gy + 2.4 }); }
    P.box(lx, gy + 1.6, lz, F.alongX ? 3.6 : 4.4, 0.12, F.alongX ? 4.4 : 3.6, 0x3a3f44);
    // Customers' cars under covers in the bays, and a stripped shell up on the lift.
    for (const a of [4.5, 10.5, 16.5]) {
      const [x, z] = F.p(a, 7);
      const ax = F.alongX;
      P.blob(x, gy + 0.75, z, ax ? 1.0 : 2.3, 0.7, ax ? 2.3 : 1.0, a === 10.5 ? 0x8d969a : 0x5f7f86);
      P.box(x, gy + 0.05, z, ax ? 1.9 : 4.4, 0.7, ax ? 4.4 : 1.9, a === 10.5 ? 0x7d8587 : 0x55727a);
      P.solid(x - (ax ? 1 : 2.2), z - (ax ? 2.2 : 1), x + (ax ? 1 : 2.2), z + (ax ? 2.2 : 1), gy + 1.4);
    }
    {
      const ax = F.alongX;
      P.box(lx, gy + 1.72, lz, ax ? 1.8 : 4, 0.9, ax ? 4 : 1.8, 0xb8544f);
      P.box(lx, gy + 2.62, lz + (ax ? 0.4 : 0), ax ? 1.6 : 2, 0.6, ax ? 2 : 1.6, 0x1a2125);
    }
    for (let k = 0; k < 4; k++) { const [x, z] = F.p(4 + k * 0.8, 19); tyres(P, x, z, gy, 3 + (k % 2)); }
    for (let k = 0; k < 3; k++) { const [x, z] = F.p(W - 4.5 - k * 0.75, 20.5); drum(P, x, z, gy, [0x2f757c, 0xff6018, 0xd7a03d][k]); }
    { const [x, z] = F.p(9, 20.2); P.box(x, gy, z, 1.2, 1, 0.6, 0xb8544f); P.solid(x - 0.6, z - 0.4, x + 0.6, z + 0.4, gy + 1); }
    for (const [ax, az, bx, bz, f] of sides(F, 0.5, 0.5, W - 0.5, 21)) if (f !== "back") fence(P, ax, az, bx, bz, gy, 1.2, f === "front" ? [[0.3, 0.7]] : []);
    for (const a of [1.5, W - 1.5]) { const [x, z] = F.p(a, 1.5); lamp(P, x, z, gy); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    return { name: "Merge Conflict Motors", anchors: { door: A(W / 2, 20.4), lot: A(W / 2, 11) } };
  },

  // The Standup: a deco club with a neon canopy, an alley behind, and a terrace with a stage on the roof.
  club(P, s) {
    const { F, gy } = s, W = F.W, D = F.D;
    slab(P, F.r(0, 0, W, D), gy + 0.01, 0x6b5d5a);
    const H = 11;
    const cR = F.r(3, 5, W - 3, D - 8);
    const b = building(P, cR, H, S.DECO, 0x5a2f4a, gy, { neon: 4, bareRoof: true, seed: 0.52 });
    // Canopy edged in neon, a red carpet and rope posts.
    const kR = F.r(W / 2 - 6, 1.5, W / 2 + 6, 5);
    block(P, kR, gy + 3.4, 0.35, 0x1d1a1f);
    for (const [ax, az, bx, bz] of sides(F, W / 2 - 6, 1.5, W / 2 + 6, 5)) { P.tube(ax, gy + 3.55, az, bx, gy + 3.55, bz, 0.06, 0xcc75a0, 4, 4); P.tube(ax, gy + 3.72, az, bx, gy + 3.72, bz, 0.05, 0x3fd0c9, 4, 4); }
    block(P, F.r(W / 2 - 1.6, 0.5, W / 2 + 1.6, 5), gy + 0.02, 0.03, 0xa3262e);
    for (const u of [-2.4, 2.4]) for (let k = 0; k < 4; k++) { const [x, z] = F.p(W / 2 + u, 1 + k * 1.2); P.tube(x, gy, z, x, gy + 1, z, 0.05, YELLOW, 0, 6); P.circles.push({ x, z, r: 0.08, kind: "post", y1: gy + 1 }); if (k) { const [px, pz] = F.p(W / 2 + u, k * 1.2 - 0.2); P.tube(px, gy + 0.85, pz, x, gy + 0.85, z, 0.04, 0xa3262e, 0, 4); } }
    faceSign(P, F, W / 2, 5, gy + 5.8, Math.min(16, W - 8), 2.2, "front", SIGN.club, 0xcc75a0);
    // Vertical neon blade sign at the corner.
    { const [x, z] = F.p(4, 4.6); P.box(x, gy + 4.5, z, 0.3, 5.5, 0.3, 0x1d1a1f); for (let k = 0; k < 5; k++) P.box(x, gy + 4.8 + k * 1.05, z, 0.36, 0.7, 0.36, k % 2 ? 0x3fd0c9 : 0xcc75a0, 4); }
    // Alley: bins, crates, a back door and a light.
    for (const [a, col] of [[5, 0x3f6b4f], [8, 0x3f6b4f], [W - 6, 0x4a5258]]) { const [x, z] = F.p(a, D - 5.6); P.box(x, gy, z, F.alongX ? 2 : 1.3, 1.3, F.alongX ? 1.3 : 2, col); P.solid(x - 1, z - 1, x + 1, z + 1, gy + 1.3); }
    for (let k = 0; k < 3; k++) { const [x, z] = F.p(W / 2 + 3 + k * 0.9, D - 6.4); P.box(x, gy + (k === 2 ? 0.7 : 0), z, 0.8, 0.7, 0.8, PLANK); }
    const [bdx, bdz] = F.p(W / 2 - 2, D - 7.95);
    P.box(bdx, gy, bdz, F.alongX ? 1.2 : 0.08, 2.3, F.alongX ? 0.08 : 1.2, 0x2b3133);
    P.glow("lamp", bdx + F.out("back")[0] * 0.4, gy + 2.8, bdz + F.out("back")[1] * 0.4);
    // Fire escape from the alley to the roof terrace.
    fireEscape(P, b, F.face("back"), "escape", gy + 0.15, 0.6, 0x2b3133);
    // Roof terrace: boards, rails, a bar, a little stage and string lights.
    const ry = gy + H;
    block(P, { x0: cR.x0 + 0.3, z0: cR.z0 + 0.3, x1: cR.x1 - 0.3, z1: cR.z1 - 0.3 }, ry, 0.06, PLANK);
    P.rails(cR.x0 + 0.2, cR.z0 + 0.2, cR.x1 - 0.2, cR.z1 - 0.2, ry, F.rails("front", "lo", "hi"), IRON);
    const barR = F.r(5, 7, 12, 8.6);
    block(P, barR, ry, 1.1, 0x5a2f4a); block(P, { x0: barR.x0 - 0.1, z0: barR.z0 - 0.1, x1: barR.x1 + 0.1, z1: barR.z1 + 0.1 }, ry + 1.1, 0.08, WOOD);
    P.solid(barR.x0, barR.z0, barR.x1, barR.z1, ry + 1.1);
    const stR = F.r(W / 2 - 3, D - 14, W / 2 + 3, D - 10.5);
    block(P, stR, ry, 0.4, 0x1d1a1f); P.solid(stR.x0, stR.z0, stR.x1, stR.z1, ry + 0.4);
    for (const u of [-3.4, 3.4]) { const [x, z] = F.p(W / 2 + u, D - 12); P.box(x, ry, z, 0.8, 1.6, 0.8, 0x111214); }
    for (let k = 0; k < 4; k++) { const [x, z] = F.p(W / 2 - 1.5 + k, D - 10.4); P.glow("lamp", x, ry + 3, z, [0xcc75a0, 0x3fd0c9, 0xffc667, 0xff6a2e][k]); }
    for (let k = 0; k < 7; k++) { const [x, z] = F.p(5 + ((W - 10) * k) / 6, 6.2 + ((D - 20) * (k % 2)) / 1.2); P.glow("amber", x, ry + 2.6, z); }
    for (let k = 0; k < 4; k++) { const [x, z] = F.p(14 + k * 2.4, 13); P.tube(x, ry, z, x, ry + 0.75, z, 0.4, 0xefe3d2, 0, 8); }
    for (const a of [1.2, W - 1.2]) { const [x, z] = F.p(a, 1.2); lamp(P, x, z, gy, 5); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    return {
      name: "The Standup",
      anchors: { door: A(W / 2, 0.8), alley: A(W / 2 + 4, D - 4), roof: { ...A(W / 2, (5 + D - 8) / 2 - 1), y: ry }, stage: { ...A(W / 2, D - 12.2), y: ry + 0.4 } },
    };
  },

  // The Lazy Loader Motel: two storeys of rooms round a car park, a walkway along the upper floor, an office.
  motel(P, s) {
    const { F, gy } = s, W = F.W, D = F.D;
    slab(P, F.r(0, 0, W, D), gy + 0.02, ASPHALT);
    const H = 6.4, wy = gy + 3.2;
    const back = F.r(4, D - 11, W - 4, D - 3), left = F.r(4, 11, 12, D - 11), right = F.r(W - 12, 11, W - 4, D - 11);
    for (const [R, seed] of [[back, 0.15], [left, 0.45], [right, 0.75]]) building(P, R, H, S.HOUSE, 0xf3d9b5, gy, { seed });
    // Upper walkway along the back wing's inner face, with a rail and a stair at each end.
    const wR = F.r(12, D - 13, W - 12, D - 11);
    P.deck(wR.x0, wR.z0, wR.x1, wR.z1, wy, CONC, "", { t: 0.25 });
    { const R = F.r(13.6, D - 13, W - 13.6, D - 11); P.rails(R.x0, R.z0, R.x1, R.z1, wy, F.rails("front"), SPRUCE); }
    block(P, { x0: wR.x0, z0: wR.z0, x1: wR.x1, z1: wR.z1 }, gy + H, 0.2, 0xb8544f);
    for (let a = 12; a <= W - 12; a += 5) { const [x, z] = F.p(a, D - 13); P.tube(x, gy, z, x, gy + H, z, 0.08, SPRUCE, 0, 6); P.circles.push({ x, z, r: 0.1, kind: "post", y1: gy + H }); }
    F.rampD(P, 12, 13.6, D - 21, D - 13, gy, wy, CONC, F.rails("hi"), { railCol: SPRUCE });
    F.rampD(P, W - 13.6, W - 12, D - 21, D - 13, gy, wy, CONC, F.rails("lo"), { railCol: SPRUCE });
    // Room doors on both floors of every wing, numbered by colour.
    const doorCols = [0x2f757c, 0xb8544f, 0xd7a03d, 0x507fa7];
    for (let k = 0; k < 8; k++) {
      const a = 14 + ((W - 28) * (k + 0.5)) / 8;
      for (const y of [gy, wy]) { const [x, z] = F.p(a, D - 11.05); P.box(x, y, z, F.alongX ? 1 : 0.06, 2.1, F.alongX ? 0.06 : 1, doorCols[k % 4]); P.glow("lamp", x + F.out("front")[0] * 0.3, y + 2.5, z + F.out("front")[1] * 0.3, 0xfff1d6); }
    }
    for (const face of ["hi", "lo"]) for (let k = 0; k < 4; k++) {
      const d = 13 + ((D - 26) * (k + 0.5)) / 4;
      const a = face === "hi" ? 12.05 : W - 12.05;
      const [x, z] = F.p(a, d);
      P.box(x, gy, z, F.alongX ? 0.06 : 1, 2.1, F.alongX ? 1 : 0.06, doorCols[(k + 1) % 4]);
    }
    // Car park bays, a vending machine and the ice machine.
    bays(P, F, 14, W - 14, D - 20, D - 15, gy, 2.8);
    { const [x, z] = F.p(W - 13.4, D - 15); P.box(x, gy, z, 0.9, 1.9, 0.8, 0xb8544f); P.box(x, gy + 0.8, z, 0.92, 0.9, 0.82, 0xfff1d6, 3); P.solid(x - 0.45, z - 0.4, x + 0.45, z + 0.4, gy + 1.9); }
    // The office out front, and the big sign on a pole by the road.
    const oR = F.r(4, 2, 15, 9);
    building(P, oR, 3.8, S.DECO, 0xfff7ee, gy, { seed: 0.31 });
    const [ox, oz] = F.p(9.5, 1.95);
    P.box(ox, gy, oz, F.alongX ? 1.2 : 0.06, 2.2, F.alongX ? 0.06 : 1.2, 0x2f757c);
    const [px, pz] = F.p(W - 4, 2.5);
    P.tube(px, gy, pz, px, gy + 9, pz, 0.18, 0x3d4a4c, 0, 8); P.circles.push({ x: px, z: pz, r: 0.2, kind: "post", y1: gy + 9 });
    const [nx, nz] = F.out("front");
    P.box(px, gy + 7, pz, F.alongX ? 7 : 0.5, 2.4, F.alongX ? 0.5 : 7, 0x2f757c);
    P.signs.push({ x: px + nx * 0.3, z: pz + nz * 0.3, y: gy + 8.2, w: 6.6, h: 1.4, rot: F.rot("front"), text: SIGN.motel, color: 0xffc667 });
    P.box(px, gy + 6.4, pz, F.alongX ? 4 : 0.55, 0.5, F.alongX ? 0.55 : 4, 0xff6a2e, 4);
    for (const [a, d] of [[2, 10], [W - 2, 10], [W / 2, D / 2 - 2]]) { const [x, z] = F.p(a, d); lamp(P, x, z, gy, 6); }
    for (let k = 0; k < 3; k++) { const [x, z] = F.p(18 + k * 6, 2); tree(P, x, z, gy, 0.8); }
    const A = (a, d, y = gy + 0.15) => { const [x, z] = F.p(a, d); return { x, y, z }; };
    return { name: "Lazy Loader Motel", anchors: { office: A(9.5, 0.9), room: { ...A(W / 2 + 1, D - 12), y: wy }, lot: A(W / 2, D / 2 - 4) } };
  },
};

// Where each goes: district, preferred point, footprint along the road x depth, and whether it takes a
// whole block (big) or sits on a roadside lot of its own (hills).
export const SITE_PLAN = [
  { id: "brittle_hq", district: "preview", at: [2420, 1350], whole: true },
  { id: "audit_hq", district: "meridian", at: [-2250, -1450], whole: true },
  { id: "legacy_yard", district: "docks", at: [-650, 3000], whole: true, coastal: true },
  { id: "garage", district: "uptown", at: [150, -1250], W: 36, D: 40 },
  { id: "club", district: "cadence", at: [700, 1400], W: 30, D: 36 },
  { id: "motel", district: "gardens", at: [-1900, 1300], W: 48, D: 44 },
  { id: "datacenter", district: "hills", at: [-1200, -2900], W: 70, D: 44, roadside: true, slope: 3.2 },
];

export { Parts };
