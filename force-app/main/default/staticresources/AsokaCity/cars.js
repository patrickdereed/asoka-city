// Low-poly car bodies. Local frame: forward is -z, ground at y = 0. Vertices flagged as paint
// take the instance colour (traffic) and lights carry an emissive code for the prop shader.
import { Geo } from "./geo.js";
import { hex } from "./util.js";

const GLASS = hex(0x1d2a2e), DARK = hex(0x1c1f20), TRIM = hex(0x3a4446), HUB = hex(0x9aa3a4);

export const CAR_TYPES = [
  { id: "sedan", L: 4.6, W: 1.82, belt: 0.95, roof: 1.45, cf: -0.55, cr: 1.0, rf: -0.15, rr: 0.72, wr: 0.33, mass: 1350 },
  { id: "hatch", L: 3.9, W: 1.74, belt: 0.95, roof: 1.5, cf: -0.35, cr: 1.85, rf: 0.0, rr: 1.75, wr: 0.31, mass: 1100 },
  { id: "van", L: 5.0, W: 1.98, belt: 1.05, roof: 2.2, cf: -1.7, cr: 2.45, rf: -1.25, rr: 2.45, wr: 0.36, mass: 2000 },
  { id: "pickup", L: 5.3, W: 1.95, belt: 1.12, roof: 1.88, cf: -0.95, cr: 0.35, rf: -0.6, rr: 0.35, wr: 0.39, mass: 1900 },
  { id: "cab", L: 4.6, W: 1.82, belt: 0.95, roof: 1.45, cf: -0.55, cr: 1.0, rf: -0.15, rr: 0.72, wr: 0.33, mass: 1350, sign: true },
];

export const TRAFFIC_COLORS = [0xfff7ee, 0xcdbba2, 0x2f757c, 0x507fa7, 0xb8544f, 0xd7a03d, 0xa4517b, 0x8a8073, 0xfffdf9, 0x283f43, 0x5d8f5e, 0xe9e4da];

function body(g, t, paint, opts = {}) {
  const { L, W, belt } = t, cl = 0.3, hl = L / 2, hw = W / 2;
  g.e.cdata = [1, 0];
  g.hexa([
    [-hw, cl, -hl], [hw, cl, -hl], [hw, cl, hl], [-hw, cl, hl],
    [-hw + 0.05, belt - (opts.hood ?? 0.14), -hl], [hw - 0.05, belt - (opts.hood ?? 0.14), -hl], [hw, belt, hl - 0.1], [-hw, belt, hl - 0.1],
  ], paint);
  g.e.cdata = [0, 0];
  g.hexa([
    [-hw * 0.94, belt, t.cf], [hw * 0.94, belt, t.cf], [hw * 0.94, belt, t.cr], [-hw * 0.94, belt, t.cr],
    [-hw * 0.82, t.roof, t.rf], [hw * 0.82, t.roof, t.rf], [hw * 0.82, t.roof, t.rr], [-hw * 0.82, t.roof, t.rr],
  ], GLASS);
  g.e.cdata = [1, 0];
  g.hexa([
    [-hw * 0.83, t.roof - 0.01, t.rf - 0.02], [hw * 0.83, t.roof - 0.01, t.rf - 0.02], [hw * 0.83, t.roof - 0.01, t.rr + 0.02], [-hw * 0.83, t.roof - 0.01, t.rr + 0.02],
    [-hw * 0.8, t.roof + 0.05, t.rf + 0.03], [hw * 0.8, t.roof + 0.05, t.rf + 0.03], [hw * 0.8, t.roof + 0.05, t.rr - 0.03], [-hw * 0.8, t.roof + 0.05, t.rr - 0.03],
  ], paint);
  g.e.cdata = [0, 0];
  g.box(0, cl + 0.12, -hl - 0.04, W - 0.1, 0.24, 0.12, TRIM);
  g.box(0, cl + 0.12, hl + 0.04, W - 0.1, 0.24, 0.12, TRIM);
  g.e.cdata = [0, 1];
  for (const s of [-1, 1]) g.box(s * (hw - 0.32), belt - 0.27, -hl - 0.02, 0.42, 0.14, 0.06, hex(0xfff6e0));
  g.e.cdata = [0, 2];
  for (const s of [-1, 1]) g.box(s * (hw - 0.3), belt - 0.18, hl + 0.02, 0.4, 0.12, 0.06, hex(0xc4161c));
  g.e.cdata = [0, 0];
}

function wheels(g, t) {
  const hw = t.W / 2, hl = t.L / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * (hw - 0.14), z = sz * (hl - 0.85);
    g.tube([x - 0.12, t.wr, z], [x + 0.12, t.wr, z], t.wr, t.wr, DARK, 8);
  }
}

export function trafficGeometry(t) {
  const g = new Geo({ cdata: 2 });
  body(g, t, [1, 1, 1]);
  wheels(g, t);
  if (t.sign) {
    g.e.cdata = [0, 3];
    g.box(0, t.roof + 0.2, 0.25, 0.8, 0.26, 0.3, hex(0xfff7ee));
    g.e.cdata = [0, 0];
  }
  return g.build();
}

// The player's car: the Asoka fleet coupe, cream with an orange stripe and spruce trim.
export const PLAYER_CAR = { id: "volt", L: 4.4, W: 1.9, belt: 0.86, roof: 1.24, cf: -0.35, cr: 0.95, rf: 0.05, rr: 0.62, wr: 0.34, mass: 1300 };

export function playerGeometry() {
  const t = PLAYER_CAR, g = new Geo({ cdata: 2 });
  const cream = hex(0xfff7ee), orange = hex(0xff6018), spruce = hex(0x2f757c), ink = hex(0x182b2e);
  body(g, t, cream, { hood: 0.18 });
  const hl = t.L / 2, hw = t.W / 2;
  g.e.cdata = [0, 0];
  // Stripe over hood, roof and boot.
  g.hexa([[-0.22, 0.69, -hl + 0.02], [0.22, 0.69, -hl + 0.02], [0.22, 0.87, t.cf], [-0.22, 0.87, t.cf], [-0.22, 0.72, -hl + 0.02], [0.22, 0.72, -hl + 0.02], [0.22, 0.9, t.cf], [-0.22, 0.9, t.cf]], orange);
  g.box(0, t.roof + 0.065, (t.rf + t.rr) / 2, 0.44, 0.03, t.rr - t.rf - 0.08, orange);
  g.box(0, t.belt + 0.015, (t.cr + hl) / 2, 0.44, 0.03, hl - t.cr - 0.12, orange);
  // Spruce side skirts, spoiler and a small Asoka triangle on the nose.
  for (const s of [-1, 1]) g.box(s * (hw + 0.01), 0.38, 0, 0.04, 0.16, t.L - 1.4, spruce);
  g.box(0, t.belt + 0.2, hl - 0.18, t.W - 0.3, 0.05, 0.3, spruce);
  for (const s of [-0.6, 0.6]) g.box(s, t.belt + 0.1, hl - 0.18, 0.06, 0.2, 0.12, spruce);
  g.tri([0, 0.74, -hl + 0.25], [-0.16, 0.73, -hl + 0.53], [0.16, 0.73, -hl + 0.53], ink);
  return g.build();
}

export function wheelGeometry(r) {
  const g = new Geo({ cdata: 2 });
  g.tube([-0.13, 0, 0], [0.13, 0, 0], r, r, DARK, 10);
  g.tube([0.131, 0, 0], [0.14, 0, 0], r * 0.62, r * 0.62, HUB, 6);
  g.tube([-0.131, 0, 0], [-0.14, 0, 0], r * 0.62, r * 0.62, HUB, 6);
  return g.build();
}

