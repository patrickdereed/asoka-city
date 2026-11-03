// The story's working vehicles: the Audit's patrol car, Brittle Systems' security SUV, a Pipeline freight
// truck, an armoured cash-in-transit truck, a Code Blue ambulance and an Asoka courier van. All original.
// The patrol car is the `urban` model in an Audit livery with a light bar; the rest are built here from
// boxes and tubes. Each comes out shaped like a baked kit from carkits.js ({ id, body, wheelGeo, traffic,
// wheels, lamps, spec }), plus `livery` (a texture for its painted panels, or null) and `beacons` (roof
// lights for the game to flash: [x, y, z, colour]).
//
// Geometry: Geo({ cdata: 2, luv: 2 }) like the kits. cdata[0] = 1 marks a painted panel (it takes the
// livery through luv, or a solid colour), cdata[1] is the lamp code (1 head, 2 brake, 3 lit at night,
// 4 always glowing). Cars face -z with +x to the right; y = 0 is the road.
import * as THREE from "./three.module.min.js";
import { Geo } from "./geo.js";
import { hex } from "./util.js";

const GLASS = hex(0x1a2125), RUBBER = hex(0x141516), TRIM = hex(0x2b2f31), CHROME = hex(0xb9c0c4), GRILLE = hex(0x1c1f21);
const LAMP = hex(0xfff1d6), RED = hex(0xc0281d), AMBER = hex(0xffb347);

// ------------------------------------------------------------------------------ building

class Body {
  constructor() { this.g = new Geo({ cdata: 2, luv: 2 }); this.head = []; this.tail = []; }
  set(paint, emi) { this.g.e.cdata = [paint, emi]; this.g.e.luv = [0, 0]; }
  // Axis-aligned box from (x0, y0, z0) to (x1, y1, z1).
  box(x0, y0, z0, x1, y1, z1, col, emi = 0) {
    this.set(0, emi);
    this.g.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col);
  }
  // The same box on both sides of the car (x0..x1 given for the right side).
  pair(x0, y0, z0, x1, y1, z1, col, emi = 0) { this.box(x0, y0, z0, x1, y1, z1, col, emi); this.box(-x1, y0, z0, -x0, y1, z1, col, emi); }
  hexa(v, col, emi = 0) { this.set(0, emi); this.g.hexa(v, col); }
  tube(a, b, r0, r1, col, n = 8, emi = 0) { this.set(0, emi); this.g.tube(a, b, r0, r1, col, n); }
  // A slab tapering on top: bottom spans zb0..zb1 at y0, top spans zt0..zt1 at y1, top inset in x.
  slab(hw, y0, y1, zb0, zb1, zt0, zt1, inset, col, emi = 0) {
    const t = hw - inset;
    this.hexa([[-hw, y0, zb0], [hw, y0, zb0], [hw, y0, zb1], [-hw, y0, zb1], [-t, y1, zt0], [t, y1, zt0], [t, y1, zt1], [-t, y1, zt1]], col, emi);
  }
  // A lamp: a lit box, its centre recorded for the light glows (just proud of its outer face).
  lamp(kind, x0, y0, z0, x1, y1, z1, both = true) {
    const emi = kind === "head" ? 1 : 2;
    const put = (a, b) => {
      this.box(a, y0, z0, b, y1, z1, kind === "head" ? LAMP : RED, emi);
      const c = [(a + b) / 2, (y0 + y1) / 2, kind === "head" ? Math.min(z0, z1) - 0.03 : Math.max(z0, z1) + 0.03];
      (kind === "head" ? this.head : this.tail).push(c);
    };
    put(x0, x1);
    if (both) put(-x1, -x0);
  }
  // A painted panel showing part of the livery canvas. face: "left" | "right" | "rear" | "front";
  // the panel is the rectangle a0..a1 (z for the sides, x for the ends) by y0..y1 on the plane at `at`;
  // rect is [u0, v0, u1, v1] in 0..1 (top-left to bottom-right of the picture as it should be read).
  panel(face, at, a0, a1, y0, y1, rect) {
    const [u0, v0, u1, v1] = rect;
    let P;
    // Corners in reading order: top-left, top-right, bottom-right, bottom-left (as seen from outside).
    if (face === "left") P = [[at, y1, a0], [at, y1, a1], [at, y0, a1], [at, y0, a0]];        // nose on the viewer's left
    else if (face === "right") P = [[at, y1, a1], [at, y1, a0], [at, y0, a0], [at, y0, a1]];  // nose on the viewer's right
    else if (face === "rear") P = [[a0, y1, at], [a1, y1, at], [a1, y0, at], [a0, y0, at]];
    else P = [[a1, y1, at], [a0, y1, at], [a0, y0, at], [a1, y0, at]];
    const UV = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const out = face === "left" ? [-1, 0, 0] : face === "right" ? [1, 0, 0] : face === "rear" ? [0, 0, 1] : [0, 0, -1];
    const g = this.g;
    g.e.cdata = [1, 0];
    for (const idx of [[0, 1, 2], [0, 2, 3]]) {
      let tri = idx;
      const a = P[tri[0]], b = P[tri[1]], c = P[tri[2]];
      const n = cross(sub(b, a), sub(c, a));
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) tri = [tri[0], tri[2], tri[1]];
      for (const k of tri) { g.e.luv = UV[k]; g.vert(P[k], out, hex(0xffffff)); }
    }
    g.e.luv = [0, 0];
  }
  // A body side from za to zb, y0 to y1, cut away over the wheels (up to the top of the arch), the first
  // piece optionally chamfered into the nose.
  sill(hw, y0, y1, za, zb, wheels, wr, col, chamfer = 0, inset = 0.03) {
    const c = wr + 0.1, top = Math.min(2 * wr + 0.1, y1 - 0.04);
    const cuts = [];
    for (const z of [...new Set(wheels.map((w) => w.z))].sort((a, b) => a - b)) {
      const last = cuts[cuts.length - 1];
      if (last && z - c <= last[1]) last[1] = z + c; else cuts.push([z - c, z + c]);
    }
    let z = za, first = true;
    const piece = (a, b, lo) => {
      if (b - a < 0.01 || y1 - lo < 0.01) return;
      if (first && chamfer && lo === y0) this.slab(hw, lo, y1, a, b, a + chamfer, b, inset, col);
      else this.box(-hw, lo, a, hw, y1, b, col);
      first = false;
    };
    for (const [c0, c1] of cuts) {
      if (c1 <= za || c0 >= zb) continue;
      piece(z, Math.max(z, c0), y0);
      piece(Math.max(za, c0), Math.min(zb, c1), top);
      z = Math.min(zb, c1);
    }
    piece(z, zb, y0);
  }
  // Wheel arches: a dark lip round the top of each opening, and a dark well behind each axle.
  arches(hw, wheels, wr) {
    for (const z of [...new Set(wheels.map((w) => w.z))]) this.box(-(hw - 0.32), 0.12, z - wr - 0.06, hw - 0.32, 2 * wr + 0.1, z + wr + 0.06, hex(0x0b0c0d));
    for (const w of wheels) {
      if (w.inner) continue;
      for (let k = 0; k < 5; k++) {
        const a0 = Math.PI * (0.1 + (k / 5) * 0.8), a1 = Math.PI * (0.1 + ((k + 1) / 5) * 0.8);
        const r = wr + 0.08;
        const p0 = [w.z - Math.cos(a0) * r, wr + Math.sin(a0) * r], p1 = [w.z - Math.cos(a1) * r, wr + Math.sin(a1) * r];
        const s = Math.sign(w.x);
        this.set(0, 0);
        this.g.hexa([[s * (hw - 0.02), p0[1], p0[0]], [s * (hw + 0.05), p0[1], p0[0]], [s * (hw + 0.05), p1[1], p1[0]], [s * (hw - 0.02), p1[1], p1[0]],
          [s * (hw - 0.02), p0[1] + 0.07, p0[0]], [s * (hw + 0.05), p0[1] + 0.07, p0[0]], [s * (hw + 0.05), p1[1] + 0.07, p1[0]], [s * (hw - 0.02), p1[1] + 0.07, p1[0]]], TRIM);
      }
    }
  }
  mirror(x, y, z, col) {
    for (const s of [-1, 1]) { this.box(s * x, y, z, s * (x + 0.16), y + 0.17, z + 0.08, col); this.box(s * (x - 0.08), y + 0.05, z + 0.02, s * x, y + 0.09, z + 0.06, TRIM); }
  }
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// A wheel like the kits': tyre, rim and five spokes, axle along x.
function wheelGeometry(wr, ww, rimCol = [0.72, 0.74, 0.75], spokes = 5) {
  const g = new Geo({ cdata: 2, luv: 2 });
  g.e.cdata = [0, 0]; g.e.luv = [0, 0];
  const tyre = [0.09, 0.09, 0.1];
  g.tube([-ww / 2, 0, 0], [ww / 2, 0, 0], wr, wr, tyre, 16);
  for (const s of [-1, 1]) {
    g.tube([(s * ww) / 2, 0, 0], [(s * (ww + 0.01)) / 2, 0, 0], wr * 0.64, wr * 0.64, rimCol, 12);
    g.tube([(s * (ww + 0.01)) / 2, 0, 0], [(s * (ww + 0.03)) / 2, 0, 0], wr * 0.16, wr * 0.12, [0.3, 0.31, 0.32], 8);
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      g.box((s * (ww + 0.016)) / 2, Math.cos(a) * wr * 0.33, Math.sin(a) * wr * 0.33, 0.02, wr * 0.5, 0.07, [0.45, 0.47, 0.48], 0, 0, 0, 0);
    }
  }
  return g.build();
}

function canvas(w = 1024, h = 512) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  return [cv, cv.getContext("2d")];
}
function texture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false; t.anisotropy = 4;
  return t;
}
const FONT = (px, w = 700) => `${w} ${px}px "Space Grotesk", system-ui, sans-serif`;
// Fit a line of text into a width.
function fitText(g, text, x, y, maxW, px, w = 700) {
  let size = px;
  g.font = FONT(size, w);
  while (g.measureText(text).width > maxW && size > 10) { size -= 2; g.font = FONT(size, w); }
  g.fillText(text, x, y);
}
// Brittle Systems' cracked square, centred at (x, y), `s` across.
function drawBrittle(g, x, y, s, col, crack = "#14171a") {
  g.save(); g.translate(x, y);
  g.strokeStyle = col; g.lineWidth = s * 0.12; g.lineJoin = "miter";
  g.strokeRect(-s / 2 + s * 0.06, -s / 2 + s * 0.06, s * 0.88, s * 0.88);
  g.strokeStyle = crack; g.lineWidth = s * 0.07;
  g.beginPath();
  for (const [u, v] of [[-0.08, -0.5], [0.03, -0.22], [-0.1, -0.05], [0.12, 0.12], [0.02, 0.28], [0.5, 0.36]]) g.lineTo(u * s, v * s);
  g.stroke();
  g.restore();
}
// The Asoka mark: a triangle with a ring.
function drawAsoka(g, x, y, s, fill, ring) {
  g.save(); g.translate(x, y);
  g.fillStyle = fill;
  g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(s * 0.5, s * 0.42); g.lineTo(-s * 0.5, s * 0.42); g.closePath(); g.fill();
  g.strokeStyle = ring; g.lineWidth = s * 0.09;
  g.beginPath(); g.arc(0, s * 0.12, s * 0.2, 0, Math.PI * 2); g.stroke();
  g.restore();
}

// ------------------------------------------------------------------------------- vehicles

function kitOf(id, B, wheels, wheelGeo, spec, livery = null, beacons = []) {
  const body = B.g.build();
  return { id, body, wheelGeo, traffic: body, wheels, lamps: { head: B.head, tail: B.tail }, spec: { id, ...spec }, livery, beacons };
}
const W4 = (x, zf, zr, wr) => [{ x: -x, y: wr, z: zf, front: true }, { x, y: wr, z: zf, front: true }, { x: -x, y: wr, z: zr, front: false }, { x, y: wr, z: zr, front: false }];

// Brittle Systems security: a tall, square-edged graphite SUV with the cracked square on its doors.
function brittleSUV() {
  const L = 4.9, hw = 1.0, wr = 0.4, zf = -1.5, zr = 1.45;
  const B = new Body();
  const paint = hex(0x2b3036), dark = hex(0x1f2327), wheels = W4(hw - 0.12, zf, zr, wr);
  // Lower body, with the bonnet sloping into the nose.
  B.sill(hw, 0.36, 1.12, -L / 2, L / 2, wheels, wr, paint, 0.18);
  B.slab(hw - 0.03, 1.12, 1.2, -L / 2 + 0.18, -0.95, -L / 2 + 0.25, -0.95, 0.02, paint);
  // Glasshouse: dark glass, then pillars and the roof over it.
  B.slab(hw - 0.06, 1.12, 1.8, -0.95, L / 2 - 0.05, -0.45, L / 2 - 0.12, 0.08, GLASS);
  B.slab(hw - 0.1, 1.8, 1.86, -0.47, L / 2 - 0.1, -0.42, L / 2 - 0.14, 0.02, paint);
  for (const s of [-1, 1]) {
    B.hexa([[s * (hw - 0.07), 1.12, -0.97], [s * (hw - 0.02), 1.12, -0.97], [s * (hw - 0.02), 1.12, -0.85], [s * (hw - 0.07), 1.12, -0.85], [s * (hw - 0.14), 1.82, -0.5], [s * (hw - 0.09), 1.82, -0.5], [s * (hw - 0.09), 1.82, -0.38], [s * (hw - 0.14), 1.82, -0.38]], paint);
    for (const z of [0.45, 1.55]) B.box(s * (hw - 0.13), 1.12, z - 0.07, s * (hw - 0.04), 1.82, z + 0.07, paint);
    B.box(s * (hw - 0.14), 1.12, L / 2 - 0.25, s * (hw - 0.04), 1.82, L / 2 - 0.08, paint);
  }
  B.box(-hw + 0.3, 1.86, -0.3, hw - 0.3, 1.88, -0.25, paint);
  for (const s of [-1, 1]) B.tube([s * 0.72, 1.93, -0.3], [s * 0.72, 1.93, 2.1], 0.03, 0.03, CHROME, 6);
  for (const s of [-1, 1]) for (const z of [-0.3, 2.1]) B.box(s * 0.68, 1.85, z - 0.04, s * 0.76, 1.94, z + 0.04, TRIM);
  // Nose: grille, lamps, bumper with a skid plate.
  B.box(-0.62, 0.55, -L / 2 - 0.02, 0.62, 0.98, -L / 2 + 0.02, GRILLE);
  for (let k = 0; k < 4; k++) B.box(-0.6, 0.6 + k * 0.1, -L / 2 - 0.04, 0.6, 0.63 + k * 0.1, -L / 2 - 0.01, CHROME);
  B.lamp("head", 0.66, 0.8, -L / 2 - 0.03, 0.94, 0.97, -L / 2 + 0.01);
  B.box(-hw - 0.03, 0.26, -L / 2 - 0.12, hw + 0.03, 0.55, -L / 2 + 0.12, dark);
  B.box(-0.55, 0.2, -L / 2 - 0.16, 0.55, 0.3, -L / 2 + 0.2, CHROME);
  B.pair(0.4, 0.38, -L / 2 - 0.13, 0.62, 0.46, -L / 2 - 0.11, LAMP, 3);
  // Tail: lamps up the corners, a spare wheel on the tailgate, bumper.
  B.lamp("tail", hw - 0.14, 0.82, L / 2 - 0.02, hw - 0.02, 1.16, L / 2 + 0.02);
  B.tube([0, 0.98, L / 2], [0, 0.98, L / 2 + 0.24], 0.36, 0.36, RUBBER, 14);
  B.tube([0, 0.98, L / 2 + 0.24], [0, 0.98, L / 2 + 0.26], 0.25, 0.25, dark, 12);
  B.box(-hw - 0.03, 0.3, L / 2 - 0.12, hw + 0.03, 0.56, L / 2 + 0.12, dark);
  // Sides: skirts, door handles and seams, arches, mirrors.
  B.pair(hw - 0.02, 0.3, -1.0, hw + 0.04, 0.42, 1.0, dark);
  for (const z of [-0.85, 0.45, 1.55]) B.pair(hw, 0.45, z - 0.005, hw + 0.006, 1.1, z + 0.005, dark);
  for (const z of [-0.25, 0.95]) B.pair(hw, 0.95, z, hw + 0.025, 0.99, z + 0.16, CHROME);
  B.arches(hw, wheels, wr);
  B.mirror(hw, 1.18, -0.82, paint);
  // The company mark and name on the front doors.
  for (const face of ["left", "right"]) B.panel(face, (face === "left" ? -1 : 1) * (hw + 0.008), -0.78, 0.38, 0.62, 0.9, [0, 0, 1, 1]);
  const [cv, g] = canvas(512, 128);
  g.fillStyle = "#2b3036"; g.fillRect(0, 0, 512, 128);
  drawBrittle(g, 64, 64, 86, "#b9c0c4");
  g.fillStyle = "#c9d0d3"; g.textAlign = "left"; g.textBaseline = "middle";
  fitText(g, "BRITTLE SECURITY", 124, 66, 370, 56);
  return kitOf("brittle_suv", B, wheels, wheelGeometry(wr, 0.26, [0.3, 0.32, 0.34], 6), { L: L + 0.3, W: hw * 2, wr, belt: 1.12, roof: 1.88, mass: 2200, wheelbase: zr - zf }, texture(cv));
}

// The Pipeline freight truck: a white cab-over with a long box, the freight company's name down the sides.
function boxTruck() {
  const hw = 1.2, wr = 0.5, zf = -2.55, zr = 2.15, cab0 = -3.8, cab1 = -1.9, box0 = -1.75, box1 = 3.8;
  const B = new Body();
  const white = hex(0xefeee9), grey = hex(0x8d969a), cabCol = hex(0xe7e4dc);
  const wheels = [{ x: -(hw - 0.17), y: wr, z: zf, front: true }, { x: hw - 0.17, y: wr, z: zf, front: true },
    { x: -(hw - 0.17), y: wr, z: zr, front: false }, { x: hw - 0.17, y: wr, z: zr, front: false },
    { x: -(hw - 0.5), y: wr, z: zr, front: false, inner: true }, { x: hw - 0.5, y: wr, z: zr, front: false, inner: true }];
  // Chassis rails, fuel tank and side guards.
  B.pair(0.36, 0.55, cab0 + 0.3, 0.56, 0.82, box1 - 0.1, TRIM);
  B.tube([-(hw - 0.25), 0.72, -1.6], [-(hw - 0.25), 0.72, -0.4], 0.26, 0.26, CHROME, 12);
  B.box(-(hw - 0.05), 0.5, 0.2, -(hw - 0.3), 1.0, 1.4, TRIM);
  for (const y of [0.55, 0.78]) B.pair(hw - 0.12, y, -0.2, hw - 0.05, y + 0.08, 1.55, grey);
  // Cab: lower and upper halves, a raked windscreen, a sleeper visor.
  B.sill(hw, 0.6, 1.6, cab0, cab1, wheels, wr, cabCol, 0.05, 0);
  B.slab(hw - 0.02, 1.6, 2.85, cab0 + 0.05, cab1, cab0 + 0.35, cab1, 0.06, cabCol);
  B.hexa([[-hw + 0.1, 1.68, cab0 + 0.07], [hw - 0.1, 1.68, cab0 + 0.07], [hw - 0.1, 1.68, cab0 + 0.11], [-hw + 0.1, 1.68, cab0 + 0.11], [-hw + 0.16, 2.6, cab0 + 0.3], [hw - 0.16, 2.6, cab0 + 0.3], [hw - 0.16, 2.6, cab0 + 0.34], [-hw + 0.16, 2.6, cab0 + 0.34]], GLASS);
  B.box(-hw + 0.04, 2.72, cab0 + 0.3, hw - 0.04, 2.84, cab0 + 0.5, cabCol);
  for (const s of [-1, 1]) B.box(s * (hw - 0.01), 1.72, cab0 + 0.5, s * (hw + 0.012), 2.5, cab1 - 0.45, GLASS);
  for (const s of [-1, 1]) B.box(s * (hw - 0.01), 0.7, cab1 - 1.1, s * (hw + 0.008), 2.5, cab1 - 1.09, TRIM);
  B.box(-hw + 0.2, 2.85, cab0 + 0.6, hw - 0.2, 3.15, cab1 - 0.1, cabCol);
  // Grille, lamps, bumper, a step under each door.
  B.box(-0.7, 0.85, cab0 - 0.02, 0.7, 1.45, cab0 + 0.02, GRILLE);
  for (let k = 0; k < 5; k++) B.box(-0.68, 0.9 + k * 0.11, cab0 - 0.035, 0.68, 0.93 + k * 0.11, cab0 - 0.01, grey);
  B.lamp("head", 0.78, 0.95, cab0 - 0.03, 1.1, 1.2, cab0 + 0.01);
  B.box(-hw - 0.02, 0.45, cab0 - 0.18, hw + 0.02, 0.8, cab0 + 0.1, grey);
  B.pair(hw - 0.55, 0.55, cab0 + 0.6, hw + 0.02, 0.6, cab0 + 1.0, TRIM);
  B.pair(0.95, 0.82, cab0 - 0.05, 1.12, 0.92, cab0 - 0.01, AMBER, 3);
  B.mirror(hw + 0.1, 1.95, cab0 + 0.5, TRIM);
  for (const s of [-1, 1]) B.tube([s * (hw + 0.02), 2.3, cab0 + 0.55], [s * (hw + 0.2), 2.05, cab0 + 0.55], 0.02, 0.02, TRIM, 4);
  // The box: aluminium corner posts, a roof, a ribbed roller door at the back.
  B.sill(hw, 0.95, 3.45, box0, box1, wheels, wr, white);
  for (const [x, z] of [[-hw, box0], [hw, box0], [-hw, box1], [hw, box1]]) B.box(x - 0.04, 0.93, z - 0.04, x + 0.04, 3.47, z + 0.04, grey);
  B.box(-hw - 0.02, 3.45, box0 - 0.02, hw + 0.02, 3.5, box1 + 0.02, hex(0xd9dcd8));
  B.sill(hw + 0.02, 0.93, 1.0, box0 - 0.02, box1 + 0.02, wheels, wr, grey);
  for (let k = 0; k < 18; k++) B.box(-hw + 0.08, 1.05 + k * 0.13, box1, hw - 0.08, 1.06 + k * 0.13, box1 + 0.012, grey);
  B.box(-0.12, 1.15, box1, 0.12, 1.25, box1 + 0.04, TRIM);
  // Rear lights, underride bar, mud flaps.
  B.lamp("tail", hw - 0.32, 1.02, box1 + 0.02, hw - 0.05, 1.2, box1 + 0.05);
  B.box(-hw + 0.1, 0.45, box1 - 0.05, hw - 0.1, 0.6, box1 + 0.08, hex(0xff6018));
  for (const s of [-1, 1]) B.box(s * (hw - 0.45), 0.15, zr + 0.62, s * (hw - 0.05), 0.75, zr + 0.65, RUBBER);
  B.arches(hw, wheels, wr);
  // Livery down both sides of the box.
  for (const face of ["left", "right"]) B.panel(face, (face === "left" ? -1 : 1) * (hw + 0.006), box0 + 0.15, box1 - 0.15, 1.1, 3.35, [0, 0, 1, 1]);
  const [cv, g] = canvas(1024, 384);
  g.fillStyle = "#efeee9"; g.fillRect(0, 0, 1024, 384);
  g.fillStyle = "#2f757c"; g.fillRect(0, 300, 1024, 84);
  g.fillStyle = "#ff6018"; g.fillRect(0, 286, 1024, 14);
  g.fillStyle = "#182b2e"; g.textAlign = "left"; g.textBaseline = "middle";
  fitText(g, "PIPELINE", 70, 120, 880, 150);
  g.fillStyle = "#2f757c";
  fitText(g, "FREIGHT", 70, 225, 600, 92, 600);
  g.strokeStyle = "#ff6018"; g.lineWidth = 16;
  g.beginPath(); g.moveTo(690, 225); g.lineTo(950, 225); g.moveTo(905, 190); g.lineTo(950, 225); g.lineTo(905, 260); g.stroke();
  g.fillStyle = "#fffdf9"; g.textAlign = "center";
  fitText(g, "THE PIPELINE · ASOKA CITY DOCKS", 512, 343, 900, 40, 600);
  return kitOf("boxtruck", B, wheels, wheelGeometry(wr, 0.3, [0.78, 0.8, 0.8], 8), { L: box1 - cab0 + 0.2, W: hw * 2, wr, belt: 1.6, roof: 3.5, mass: 5000, wheelbase: zr - zf }, texture(cv));
}

// Cash in transit: an armoured truck in gunmetal, slit windows, rivets, a push bar, hazard stripes.
function vaultTruck() {
  const hw = 1.15, wr = 0.48, zf = -1.95, zr1 = 1.3, zr2 = 2.3, z0 = -3.1, z1 = 3.15;
  const B = new Body();
  const plate = hex(0x4a5056), plate2 = hex(0x3d4247), yellow = hex(0xd7a03d);
  const wheels = [{ x: -(hw - 0.16), y: wr, z: zf, front: true }, { x: hw - 0.16, y: wr, z: zf, front: true },
    { x: -(hw - 0.16), y: wr, z: zr1, front: false }, { x: hw - 0.16, y: wr, z: zr1, front: false },
    { x: -(hw - 0.16), y: wr, z: zr2, front: false }, { x: hw - 0.16, y: wr, z: zr2, front: false }];
  // Hull: a lower tub, the cab's sloped armour, the strongbox.
  B.sill(hw, 0.5, 1.45, z0, z1, wheels, wr, plate, 0.25, 0.02);
  B.slab(hw - 0.02, 1.45, 2.45, z0 + 0.25, -1.3, z0 + 0.85, -1.3, 0.12, plate);
  B.box(-hw + 0.02, 1.45, -1.32, hw - 0.02, 2.85, z1, plate);
  B.box(-hw + 0.1, 2.85, -1.2, hw - 0.1, 2.93, z1 - 0.1, plate2);
  // Slit windscreen and side slits.
  B.hexa([[-0.9, 1.75, z0 + 0.42], [0.9, 1.75, z0 + 0.42], [0.9, 1.75, z0 + 0.47], [-0.9, 1.75, z0 + 0.47], [-0.86, 2.08, z0 + 0.62], [0.86, 2.08, z0 + 0.62], [0.86, 2.08, z0 + 0.67], [-0.86, 2.08, z0 + 0.67]], GLASS);
  for (const s of [-1, 1]) { B.box(s * (hw - 0.1), 1.85, -2.4, s * (hw - 0.03), 2.1, -1.6, GLASS); for (const z of [-0.5, 1.0, 2.4]) B.box(s * (hw - 0.01), 2.05, z - 0.1, s * (hw + 0.012), 2.15, z + 0.1, hex(0x0b0c0d)); }
  // Plate seams and rivets along the strongbox.
  for (const s of [-1, 1]) {
    for (const z of [-1.3, -0.1, 1.1, 2.3]) B.box(s * (hw - 0.01), 1.45, z - 0.01, s * (hw + 0.004), 2.85, z + 0.01, plate2);
    for (let k = 0; k < 9; k++) for (const y of [1.55, 2.75]) { const z = -1.2 + k * 0.5; B.box(s * (hw - 0.01), y - 0.025, z - 0.025, s * (hw + 0.02), y + 0.025, z + 0.025, plate2); }
  }
  // Rear double doors with a hinge line and a heavy handle; hazard stripes on the bumper.
  B.box(-0.01, 1.5, z1, 0.01, 2.8, z1 + 0.015, plate2);
  for (const s of [-1, 1]) for (const y of [1.7, 2.6]) B.box(s * 0.95, y, z1, s * 1.05, y + 0.12, z1 + 0.04, TRIM);
  B.box(-0.3, 2.05, z1, 0.3, 2.11, z1 + 0.06, CHROME);
  for (let k = 0; k < 8; k++) B.box(-hw + k * 0.2875, 0.45, z1 + 0.02, -hw + (k + 1) * 0.2875, 0.7, z1 + 0.16, k % 2 ? hex(0x111214) : yellow);
  B.lamp("tail", hw - 0.28, 1.05, z1 - 0.02, hw - 0.06, 1.25, z1 + 0.02);
  // Nose: grille, lamps in cages, push bar.
  B.box(-0.6, 0.75, z0 - 0.02, 0.6, 1.3, z0 + 0.02, GRILLE);
  B.lamp("head", 0.7, 0.95, z0 - 0.03, 1.0, 1.15, z0 + 0.01);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) B.box(s * (0.72 + k * 0.1), 0.93, z0 - 0.06, s * (0.73 + k * 0.1), 1.17, z0 - 0.04, TRIM);
  for (const x of [-0.75, 0.75]) B.tube([x, 0.35, z0 - 0.35], [x, 1.25, z0 - 0.28], 0.05, 0.05, TRIM, 6);
  for (const y of [0.5, 0.9, 1.2]) B.tube([-0.85, y, z0 - 0.33], [0.85, y, z0 - 0.33], 0.045, 0.045, TRIM, 6);
  B.box(-hw - 0.02, 0.4, z0 - 0.2, hw + 0.02, 0.72, z0 + 0.1, plate2);
  // Roof hatch, side steps, mirrors.
  B.box(-0.35, 2.93, 0.6, 0.35, 3.05, 1.3, plate2);
  B.pair(hw - 0.3, 0.55, -2.6, hw + 0.06, 0.6, -2.05, TRIM);
  B.mirror(hw, 1.95, -2.55, plate);
  B.arches(hw, wheels, wr);
  return kitOf("vault", B, wheels, wheelGeometry(wr, 0.3, [0.42, 0.44, 0.45], 8), { L: z1 - z0 + 0.4, W: hw * 2, wr, belt: 1.45, roof: 2.95, mass: 7000, wheelbase: (zr1 + zr2) / 2 - zf }, null, [[0, 3.12, 0.95, 0xffb347]]);
}

// Code Blue: a van-fronted box ambulance, white with a deep blue band, a pulse line and a light bar.
function ambulance() {
  const hw = 1.15, wr = 0.42, zf = -2.1, zr = 1.75, z0 = -3.2, z1 = 3.2;
  const B = new Body();
  const white = hex(0xf3f4f1), blue = hex(0x1f4e8c);
  const wheels = W4(hw - 0.17, zf, zr, wr);
  // Van cab: bonnet, raked screen, roof.
  B.sill(hw - 0.05, 0.42, 1.15, z0, -1.35, wheels, wr, white, 0.2);
  B.slab(hw - 0.08, 1.15, 1.22, z0 + 0.2, -1.95, z0 + 0.3, -1.95, 0.02, white);
  B.hexa([[-hw + 0.1, 1.15, -2.0], [hw - 0.1, 1.15, -2.0], [hw - 0.1, 1.15, -1.95], [-hw + 0.1, 1.15, -1.95], [-hw + 0.16, 2.05, -1.45], [hw - 0.16, 2.05, -1.45], [hw - 0.16, 2.05, -1.4], [-hw + 0.16, 2.05, -1.4]], GLASS);
  B.slab(hw - 0.06, 1.15, 2.1, -1.95, -1.3, -1.45, -1.3, 0.08, white);
  for (const s of [-1, 1]) B.box(s * (hw - 0.09), 1.3, -1.85, s * (hw - 0.05), 1.95, -1.35, GLASS);
  // The box module, its own roof lip and corner lights.
  B.sill(hw, 0.5, 2.95, -1.3, z1, wheels, wr, white);
  B.box(-hw - 0.02, 2.95, -1.32, hw + 0.02, 3.02, z1 + 0.02, hex(0xd9dcd8));
  for (const [x, z] of [[-hw, -1.3], [hw, -1.3], [-hw, z1], [hw, z1]]) {
    B.box(x - 0.04, 0.5, z - 0.04, x + 0.04, 2.97, z + 0.04, hex(0xcfd3d0));
    B.box(x - 0.06, 2.72, z - 0.06, x + 0.06, 2.92, z + 0.06, z > 0 ? RED : hex(0xffffff), 3);
  }
  // Light bar on the cab roof.
  B.box(-0.75, 2.1, -1.75, 0.75, 2.22, -1.5, TRIM);
  for (let k = 0; k < 6; k++) B.box(-0.72 + k * 0.24, 2.13, -1.77, -0.52 + k * 0.24, 2.21, -1.48, k % 3 === 1 ? hex(0xffffff) : RED, 3);
  // Rear doors: two leaves with windows; a step.
  B.box(-0.01, 0.6, z1, 0.01, 2.85, z1 + 0.015, hex(0xcfd3d0));
  for (const s of [-1, 1]) B.box(s * 0.25, 2.0, z1, s * 0.85, 2.55, z1 + 0.012, GLASS);
  B.box(-hw + 0.1, 0.35, z1, hw - 0.1, 0.45, z1 + 0.35, TRIM);
  B.lamp("tail", hw - 0.2, 0.85, z1 - 0.02, hw - 0.04, 1.3, z1 + 0.02);
  // Nose: grille, lamps, bumper.
  B.box(-0.55, 0.6, z0 - 0.02, 0.55, 0.95, z0 + 0.02, GRILLE);
  B.lamp("head", 0.62, 0.82, z0 - 0.03, 0.95, 1.02, z0 + 0.01);
  B.box(-hw + 0.02, 0.3, z0 - 0.14, hw - 0.02, 0.58, z0 + 0.1, hex(0xb9c0c4));
  B.pair(0.4, 0.62, z0 - 0.05, 0.55, 0.7, z0 - 0.01, hex(0x3f8fff), 3);
  B.mirror(hw - 0.05, 1.45, -1.9, white);
  B.pair(hw - 0.02, 0.38, -1.25, hw + 0.03, 0.5, 1.2, TRIM);
  B.arches(hw - 0.04, wheels, wr);
  // Livery: the band, the name and a pulse line on both sides, the name on the back.
  for (const face of ["left", "right"]) B.panel(face, (face === "left" ? -1 : 1) * (hw + 0.006), -1.2, z1 - 0.1, 0.65, 2.8, [0, 0, 1, 0.75]);
  B.panel("rear", z1 + 0.016, -0.95, 0.95, 1.2, 1.75, [0, 0.78, 1, 0.98]);
  const [cv, g] = canvas(1024, 512);
  g.fillStyle = "#f3f4f1"; g.fillRect(0, 0, 1024, 512);
  // Sides (top three quarters of the canvas): a blue band with a white pulse line, the name above it.
  g.fillStyle = "#1f4e8c"; g.fillRect(0, 220, 1024, 90);
  g.fillStyle = "#3fd0c9"; g.fillRect(0, 312, 1024, 14);
  g.strokeStyle = "#ffffff"; g.lineWidth = 10; g.lineJoin = "round";
  g.beginPath();
  for (const [x, y] of [[0, 265], [380, 265], [420, 230], [450, 300], [490, 205], [530, 290], [560, 265], [1024, 265]]) g.lineTo(x, y);
  g.stroke();
  g.fillStyle = "#1f4e8c"; g.textAlign = "center"; g.textBaseline = "middle";
  fitText(g, "CODE BLUE", 512, 120, 820, 130);
  g.fillStyle = "#2f757c";
  fitText(g, "MERIDIAN HEALTH · EMERGENCY", 512, 350, 760, 34, 600);
  // The back doors (the bottom quarter): the name on a blue panel.
  g.fillStyle = "#1f4e8c"; g.fillRect(0, 400, 1024, 100);
  g.fillStyle = "#ffffff";
  fitText(g, "CODE BLUE", 512, 452, 700, 76);
  return kitOf("ambulance", B, wheels, wheelGeometry(wr, 0.26, [0.78, 0.8, 0.8], 6), { L: z1 - z0 + 0.1, W: hw * 2, wr, belt: 1.15, roof: 3.0, mass: 3600, wheelbase: zr - zf }, texture(cv),
    [[-0.66, 2.24, -1.62, 0xff2a1a], [0.66, 2.24, -1.62, 0x3f8fff], [-hw, 2.95, z1, 0xff2a1a], [hw, 2.95, z1, 0xff2a1a], [0, 2.24, -1.62, 0xffffff]]);
}

// The Asoka courier: a high-roof panel van in cream, spruce and orange, the mark on its sides.
function courier() {
  const hw = 1.05, wr = 0.4, zf = -1.85, zr = 1.75, z0 = -2.8, z1 = 2.8;
  const B = new Body();
  const cream = hex(0xfff7ee), spruce = hex(0x2f757c);
  const wheels = W4(hw - 0.15, zf, zr, wr);
  B.sill(hw - 0.04, 0.4, 1.12, z0, -1.95, wheels, wr, cream, 0.2, 0.04);
  B.hexa([[-hw + 0.08, 1.12, -2.0], [hw - 0.08, 1.12, -2.0], [hw - 0.08, 1.12, -1.95], [-hw + 0.08, 1.12, -1.95], [-hw + 0.14, 2.0, -1.4], [hw - 0.14, 2.0, -1.4], [hw - 0.14, 2.0, -1.35], [-hw + 0.14, 2.0, -1.35]], GLASS);
  B.sill(hw, 0.4, 1.12, -1.95, z1, wheels, wr, cream);
  B.slab(hw, 1.12, 2.5, -1.95, z1, -1.35, z1, 0, cream);
  for (const s of [-1, 1]) B.box(s * (hw - 0.06), 1.25, -1.85, s * (hw - 0.02), 1.95, -1.15, GLASS);
  B.slab(hw - 0.06, 2.5, 2.56, -1.3, z1 - 0.05, -1.25, z1 - 0.1, 0.03, hex(0xefe3d2));
  // Spruce sills and bumpers, an orange roof marker light row.
  B.box(-hw - 0.01, 0.34, z0 + 0.4, hw + 0.01, 0.55, z1 + 0.01, spruce);
  B.box(-hw + 0.02, 0.3, z0 - 0.12, hw - 0.02, 0.56, z0 + 0.1, spruce);
  B.box(-hw + 0.02, 0.3, z1 - 0.08, hw - 0.02, 0.56, z1 + 0.14, spruce);
  for (let k = 0; k < 3; k++) B.box(-0.3 + k * 0.25, 2.5, -1.4, -0.2 + k * 0.25, 2.56, -1.3, hex(0xff6018), 3);
  // Nose, lamps, sliding door track, rear doors.
  B.box(-0.5, 0.6, z0 - 0.02, 0.5, 0.92, z0 + 0.02, GRILLE);
  B.box(-0.16, 0.66, z0 - 0.04, 0.16, 0.86, z0 - 0.02, hex(0xff6018));
  B.lamp("head", 0.56, 0.78, z0 - 0.03, 0.88, 0.98, z0 + 0.01);
  B.lamp("tail", hw - 0.16, 1.0, z1 - 0.02, hw - 0.03, 1.6, z1 + 0.02);
  B.box(-0.01, 0.6, z1, 0.01, 2.4, z1 + 0.015, hex(0xd8cfc0));
  for (const s of [-1, 1]) B.box(s * 0.2, 1.75, z1, s * 0.75, 2.2, z1 + 0.012, GLASS);
  B.pair(hw, 2.1, -0.95, hw + 0.03, 2.13, 1.0, TRIM);
  B.pair(hw, 0.6, -0.95, hw + 0.012, 2.1, -0.94, TRIM);
  B.mirror(hw - 0.02, 1.35, -1.9, cream);
  B.arches(hw - 0.02, wheels, wr);
  for (const face of ["left", "right"]) B.panel(face, (face === "left" ? -1 : 1) * (hw + 0.006), -1.0, z1 - 0.15, 1.16, 2.42, [0, 0, 1, 0.75]);
  B.panel("rear", z1 + 0.016, -0.45, 0.45, 0.75, 1.6, [0.04, 0.1, 0.24, 0.49]);
  const [cv, g] = canvas(1024, 512);
  g.fillStyle = "#fff7ee"; g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#ff6018"; g.fillRect(0, 300, 1024, 26);
  g.fillStyle = "#2f757c"; g.fillRect(0, 326, 1024, 186);
  drawAsoka(g, 140, 150, 170, "#182b2e", "#ff6018");
  g.fillStyle = "#182b2e"; g.textAlign = "left"; g.textBaseline = "middle";
  fitText(g, "ASOKA", 260, 120, 600, 132);
  g.fillStyle = "#2f757c";
  fitText(g, "COURIER · SAME-DAY DEPLOY", 262, 215, 700, 46, 600);
  g.fillStyle = "#fff7ee";
  fitText(g, "asoka.city", 262, 420, 600, 54, 500);
  return kitOf("courier", B, wheels, wheelGeometry(wr, 0.24, [0.78, 0.8, 0.8], 5), { L: z1 - z0 + 0.25, W: hw * 2, wr, belt: 1.12, roof: 2.56, mass: 2600, wheelbase: zr - zf }, texture(cv));
}

// The Audit patrol car: the `urban` saloon in cream and spruce with AUDIT on the doors, a light bar and a
// push bar. Its livery canvas follows the kits' livery UVs: rows down the left side (underside 0, sill 64,
// door 128, shoulder 192, roof 256), mirrored below 256 for the right, u from nose to tail.
function cruiser(kits) {
  const base = kits.find((k) => k.id === "urban") || kits[0];
  if (!base) return null;
  const pos = base.body.attributes.position.array;
  let top = -Infinity, nose = Infinity;
  for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
  let zs = 0, n = 0, xm = 0;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] > top - 0.06) { zs += pos[i + 2]; n++; xm = Math.max(xm, Math.abs(pos[i])); }
    nose = Math.min(nose, pos[i + 2]);
  }
  const rz = n ? zs / n : 0;
  const B = new Body();
  // Light bar: a dark base, red and blue lenses, white takedown lamps in the middle.
  B.box(-0.62, top - 0.01, rz - 0.15, 0.62, top + 0.07, rz + 0.15, TRIM);
  for (let k = 0; k < 6; k++) {
    const x0 = -0.6 + k * 0.2, col = k < 2 ? hex(0xd02a20) : k > 3 ? hex(0x2a5bd0) : hex(0xf4f4f0);
    B.box(x0 + 0.01, top + 0.07, rz - 0.13, x0 + 0.19, top + 0.17, rz + 0.13, col, 3);
  }
  for (const s of [-1, 1]) B.box(s * 0.5, top - 0.03, rz - 0.04, s * 0.56, top + 0.01, rz + 0.04, TRIM);
  // Push bar on the nose.
  for (const x of [-0.42, 0.42]) B.tube([x, 0.3, nose - 0.18], [x, 0.85, nose - 0.12], 0.035, 0.035, TRIM, 6);
  for (const y of [0.42, 0.78]) B.tube([-0.5, y, nose - 0.17], [0.5, y, nose - 0.17], 0.03, 0.03, TRIM, 6);
  B.box(-0.55, 0.28, nose - 0.2, 0.55, 0.36, nose - 0.02, TRIM);
  const extra = B.g.build();
  const body = mergeGeo(base.body, extra);
  const [cv, g] = canvas(1024, 512);
  g.fillStyle = "#fff7ee"; g.fillRect(0, 0, 1024, 512);
  for (const flip of [false, true]) {
    const R = (row) => (flip ? 512 - row : row);
    const band = (r0, r1, col) => { g.fillStyle = col; const a = R(r0), b = R(r1); g.fillRect(0, Math.min(a, b), 1024, Math.abs(b - a)); };
    band(0, 72, "#2f757c");          // spruce sills and lower doors
    band(72, 82, "#ff6018");         // an orange pinstripe
    band(232, 256, "#2f757c");       // spruce roof edge
    // AUDIT on the doors, upright on both sides; the right side reads nose-to-tail mirrored.
    g.save();
    g.translate(470, R(150));
    if (!flip) g.scale(1, -1);
    if (flip) g.scale(-1, 1);
    g.fillStyle = "#182b2e"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = FONT(78);
    g.fillText("AUDIT", 0, 0);
    g.restore();
    // A small city crest behind the rear door: an orange ring.
    g.strokeStyle = "#ff6018"; g.lineWidth = 9;
    g.beginPath(); g.arc(760, R(150), 26, 0, Math.PI * 2); g.stroke();
  }
  const spec = { ...base.spec, id: "cruiser", mass: base.spec.mass + 150 };
  return { id: "cruiser", body, wheelGeo: base.wheelGeo, traffic: body, wheels: base.wheels, lamps: base.lamps, spec, livery: texture(cv),
    beacons: [[-0.45, top + 0.12, rz, 0xff2a1a], [0.45, top + 0.12, rz, 0x2a6bff]] };
}

// Concatenate two non-indexed geometries with the same attributes.
function mergeGeo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(a.attributes)) {
    const A = a.attributes[k], Bt = b.attributes[k];
    if (!Bt) continue;
    const arr = new Float32Array(A.array.length + Bt.array.length);
    arr.set(A.array, 0); arr.set(Bt.array, A.array.length);
    g.setAttribute(k, new THREE.BufferAttribute(arr, A.itemSize));
  }
  g.computeBoundingSphere();
  return g;
}

export const FLEET_IDS = ["cruiser", "brittle_suv", "boxtruck", "vault", "ambulance", "courier"];

// Every fleet vehicle (the patrol car needs the modelled kits; it's left out if they didn't load).
export function buildFleet(kits = []) {
  return [cruiser(kits), brittleSUV(), boxTruck(), vaultTruck(), ambulance(), courier()].filter(Boolean);
}
