// The arsenal: what each weapon does and costs, and its low-poly model. Models are built in the
// hand's frame: the grip at the origin, the barrel toward -z, up is +y. All designs are original.
import { Geo } from "./geo.js";
import { hex } from "./util.js";

// cls decides the pose and the sound; slot is the number key that selects it.
// dmg per hit (people have 100 health), rate in shots a second, spread in radians, range in metres.
export const WEAPONS = [
  { id: "fists", name: "Fists", kind: "Bare hands", cls: "fists", slot: 0, price: 0, dmg: 12, rate: 2.5, range: 1.4 },
  { id: "debugger", name: "Debugger", kind: "Baseball bat", cls: "bat", slot: 1, price: 150, dmg: 40, rate: 1.4, range: 2.2 },
  { id: "patchblade", name: "Patch Blade", kind: "Machete", cls: "blade", slot: 1, price: 350, dmg: 60, rate: 1.7, range: 2 },

  { id: "hotfix9", name: "Hotfix 9", kind: "Compact 9 mm pistol", cls: "pistol", slot: 2, price: 500, dmg: 24, rate: 4, mag: 12, ammo: 96, ammoPack: 24, ammoPrice: 40, spread: 0.012, range: 90, reload: 1.2 },
  { id: "rootcause", name: "Root Cause .44", kind: "Revolver", cls: "revolver", slot: 2, price: 1400, dmg: 68, rate: 1.6, mag: 6, ammo: 48, ammoPack: 12, ammoPrice: 70, spread: 0.008, range: 120, reload: 2.2 },
  { id: "burstmode", name: "Burst Mode", kind: "Machine pistol", cls: "pistol", slot: 2, price: 2200, dmg: 18, rate: 14, auto: true, mag: 20, ammo: 160, ammoPack: 40, ammoPrice: 60, spread: 0.035, range: 70, reload: 1.4 },
  { id: "silentdeploy", name: "Silent Deploy", kind: "Suppressed pistol", cls: "pistol", slot: 2, price: 2600, dmg: 30, rate: 3, mag: 15, ammo: 90, ammoPack: 15, ammoPrice: 60, spread: 0.01, range: 85, reload: 1.4, silent: true, unlock: true },

  { id: "batchjob", name: "Batch Job", kind: "Micro SMG", cls: "smg", slot: 3, price: 1900, dmg: 17, rate: 13, auto: true, mag: 30, ammo: 240, ammoPack: 60, ammoPrice: 70, spread: 0.04, range: 70, reload: 1.6 },
  { id: "asyncqueue", name: "Async Queue", kind: "Tactical SMG", cls: "smg", slot: 3, price: 3800, dmg: 21, rate: 12, auto: true, mag: 32, ammo: 256, ammoPack: 64, ammoPrice: 90, spread: 0.022, range: 95, reload: 1.8, long: true },

  { id: "quickfix", name: "Quick Fix", kind: "Sawn-off double barrel", cls: "shotgun", slot: 4, price: 900, dmg: 15, pellets: 9, rate: 2.5, mag: 2, ammo: 40, ammoPack: 10, ammoPrice: 45, spread: 0.11, range: 22, reload: 1.8 },
  { id: "rollback12", name: "Rollback 12", kind: "Pump-action shotgun", cls: "shotgun", slot: 4, price: 1200, dmg: 14, pellets: 8, rate: 1.2, mag: 8, ammo: 56, ammoPack: 16, ammoPrice: 60, spread: 0.07, range: 35, reload: 2.6, long: true },
  { id: "massupdate", name: "Mass Update", kind: "Automatic shotgun", cls: "shotgun", slot: 4, price: 4500, dmg: 12, pellets: 8, rate: 4, auto: true, mag: 12, ammo: 72, ammoPack: 24, ammoPrice: 110, spread: 0.08, range: 30, reload: 2.4, long: true },

  { id: "pipeline", name: "Pipeline Carbine", kind: "Assault carbine", cls: "rifle", slot: 5, price: 6000, dmg: 30, rate: 10, auto: true, mag: 30, ammo: 270, ammoPack: 60, ammoPrice: 120, spread: 0.012, range: 160, reload: 2, long: true },
  { id: "governor", name: "Governor Limit", kind: "Battle rifle", cls: "rifle", slot: 5, price: 9500, dmg: 46, rate: 6, auto: true, mag: 20, ammo: 180, ammoPack: 40, ammoPrice: 150, spread: 0.009, range: 200, reload: 2.3, long: true },

  { id: "longquery", name: "Long-Running Query", kind: "Bolt-action sniper rifle", cls: "sniper", slot: 6, price: 12000, dmg: 160, rate: 0.75, mag: 5, ammo: 40, ammoPack: 10, ammoPrice: 200, spread: 0.0008, range: 600, reload: 3, long: true, scope: 9 },
  { id: "fieldaudit", name: "Field Audit", kind: "Marksman rifle", cls: "sniper", slot: 6, price: 16000, dmg: 85, rate: 2.5, mag: 10, ammo: 80, ammoPack: 20, ammoPrice: 240, spread: 0.002, range: 450, reload: 2.6, long: true, scope: 5 },

  { id: "bulkapi", name: "Bulk API", kind: "Light machine gun", cls: "lmg", slot: 7, price: 18000, dmg: 34, rate: 11, auto: true, mag: 100, ammo: 500, ammoPack: 100, ammoPrice: 300, spread: 0.03, range: 170, reload: 4.2, long: true },
  { id: "cascade", name: "Cascade", kind: "Grenade launcher", cls: "launcher", slot: 7, price: 24000, dmg: 160, rate: 1.4, mag: 6, ammo: 30, ammoPack: 6, ammoPrice: 450, range: 60, reload: 3.4, long: true, proj: "shell" },
  { id: "killswitch", name: "Kill Switch", kind: "EMP launcher", cls: "launcher", slot: 7, price: 15000, dmg: 0, rate: 0.8, mag: 3, ammo: 15, ammoPack: 3, ammoPrice: 400, range: 80, reload: 3, long: true, proj: "emp", unlock: true },
  { id: "harddelete", name: "Hard Delete", kind: "Rocket launcher", cls: "rocket", slot: 7, price: 32000, dmg: 260, rate: 0.6, mag: 1, ammo: 12, ammoPack: 3, ammoPrice: 600, range: 300, reload: 2.8, long: true, proj: "rocket" },
  { id: "dataloader", name: "Data Loader", kind: "Rotary minigun", cls: "minigun", slot: 7, price: 60000, dmg: 26, rate: 30, auto: true, mag: 500, ammo: 1500, ammoPack: 500, ammoPrice: 900, spread: 0.045, range: 150, reload: 5, long: true, spin: true },

  { id: "mergeconflict", name: "Merge Conflict", kind: "Fragmentation grenade", cls: "grenade", slot: 8, price: 0, dmg: 180, rate: 1, mag: 1, ammo: 20, ammoPack: 5, ammoPrice: 500, range: 40, reload: 0.6, proj: "grenade", throw: true },
  { id: "stickynote", name: "Sticky Note", kind: "Remote charge", cls: "grenade", slot: 8, price: 0, dmg: 220, rate: 1.2, mag: 1, ammo: 8, ammoPack: 4, ammoPrice: 700, range: 25, reload: 0.6, proj: "sticky", throw: true, remote: true, unlock: true },
];
export const WEAPON = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const ARMOUR = { name: "Body armour", price: 500, amount: 100 };
export const CATEGORIES = [
  ["Melee", [1]], ["Pistols", [2]], ["SMGs", [3]], ["Shotguns", [4]], ["Rifles", [5, 6]], ["Heavy", [7]], ["Explosives", [8]],
];

const C = (h) => hex(h);
const GUN = C(0x2b2f31), BLUED = C(0x1f2629), POLY = C(0x34393b), POLY2 = C(0x454b4d), STEEL = C(0x9aa3a7), BRUSH = C(0x6d7477);
const WOOD = C(0x8a5a3c), WOOD2 = C(0x6b4430), DARKW = C(0x4e3426), OLIVE = C(0x5d6b4a), OD2 = C(0x4a5639), SAND = C(0xb59f7c), SAND2 = C(0x9c8868);
const BLACK = C(0x16191a), RUBBER = C(0x0f1112), BRASS = C(0xc9a24a), RED = C(0xa8281d), ORANGE = C(0xff6018), CREAM = C(0xefe3d2);
const LENS = C(0x1d3b52), HOLE = C(0x050606), EDGE = C(0xc9d0d3), DOT = C(0xff3020);

// Small vector helpers for parts set at an angle.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// Metal parts are glossier than polymer and wood; a few parts glow (red-dot reticles).
const metal = (g) => { g.e.cdata = [1, 0]; };
const matte = (g) => { g.e.cdata = [0, 0]; };
const glow = (g) => { g.e.cdata = [0, 4]; };

function tubeZ(g, x, y, z0, z1, r, col, n = 10) { g.tube([x, y, z0], [x, y, z1], r, r, col, n); }
function tubeX(g, x0, x1, y, z, r, col, n = 10) { g.tube([x0, y, z], [x1, y, z], r, r, col, n); }
// A box from a to b, w wide (across x) and h deep: grips, magazines, stocks set at an angle.
function bar(g, a, b, w, h, col) {
  const t = norm(sub(b, a));
  const ref = Math.abs(t[0]) > 0.95 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(sub(ref, t.map((v) => v * dot3(ref, t))));
  const v = cross(t, u);
  const c = (p, su, sv) => [p[0] + u[0] * su * w / 2 + v[0] * sv * h / 2, p[1] + u[1] * su * w / 2 + v[1] * sv * h / 2, p[2] + u[2] * su * w / 2 + v[2] * sv * h / 2];
  g.hexa([c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1)], col);
}
// A box with its top edges chamfered (slides, receivers).
function cham(g, x, y, z, sx, sy, sz, ch, col) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2, ix = hx - ch;
  g.hexa([[x - hx, y - hy, z - hz], [x + hx, y - hy, z - hz], [x + hx, y - hy, z + hz], [x - hx, y - hy, z + hz],
    [x - ix, y + hy, z - hz], [x + ix, y + hy, z - hz], [x + ix, y + hy, z + hz], [x - ix, y + hy, z + hz]], col);
}
// A bent rod through points: trigger guards, handles, the pin ring.
function rod(g, pts, r, col, n = 6) {
  // Each segment runs a little past its ends so the joints close up.
  for (let i = 0; i < pts.length - 1; i++) {
    const d = norm(sub(pts[i + 1], pts[i])), e = r * 0.9;
    g.tube([pts[i][0] - d[0] * e, pts[i][1] - d[1] * e, pts[i][2] - d[2] * e], [pts[i + 1][0] + d[0] * e, pts[i + 1][1] + d[1] * e, pts[i + 1][2] + d[2] * e], r, r, col, n);
  }
}
// Picatinny rail: a base with cross-slots every centimetre (z0 rear, z1 front).
function rail(g, y, z0, z1, w = 0.021, col = BLACK) {
  g.box(0, y, (z0 + z1) / 2, w, 0.008, z0 - z1, col);
  for (let z = z1 + 0.004; z < z0 - 0.002; z += 0.01) g.box(0, y + 0.0055, z, w + 0.003, 0.004, 0.0055, col);
}
// A row of slots on both sides of a part (handguard vents, M-LOK slots).
function slots(g, x, y, z0, z1, step, sl, sh, col = HOLE) {
  for (let z = z0; z > z1; z -= step) for (const s of [-1, 1]) g.box(s * x, y, z, 0.0016, sh, sl, col);
}
function trigger(g, z = -0.028, y = 0.035) {
  matte(g);
  bar(g, [0, y, z], [0, y - 0.022, z + 0.006], 0.006, 0.006, BLACK);
}
// Trigger guard: a front post down from the frame, a rounded corner, a bottom bar back to the grip.
function guard(g, zf = -0.058, zr = -0.006, top = 0.042, low = 0.0, col = POLY) {
  const t = 0.0055, w = 0.009, R = 0.01;
  bar(g, [0, top, zf], [0, low + R, zf], w, t, col);
  for (let i = 0; i < 3; i++) {
    const a0 = Math.PI + (i / 3) * (Math.PI / 2), a1 = Math.PI + ((i + 1) / 3) * (Math.PI / 2);
    bar(g, [0, low + R + Math.sin(a0) * R, zf + R + Math.cos(a0) * R], [0, low + R + Math.sin(a1) * R, zf + R + Math.cos(a1) * R], w, t, col);
  }
  bar(g, [0, low, zf + R], [0, low + 0.004, zr], w, t, col);
}
function sling(g, x, y, z, col = BLACK) { rod(g, [[x, y, z - 0.008], [x, y - 0.012, z - 0.006], [x, y - 0.012, z + 0.006], [x, y, z + 0.008]], 0.0018, col, 4); }
// Red-dot sight on a rail: a hooded tube, a tinted lens and a glowing dot.
function redDot(g, y, z) {
  matte(g);
  g.box(0, y + 0.006, z, 0.026, 0.012, 0.045, BLACK);
  tubeZ(g, 0, y + 0.03, z + 0.02, z - 0.025, 0.016, BLACK, 12);
  g.box(0.018, y + 0.03, z, 0.008, 0.012, 0.012, BLACK);
  metal(g); tubeZ(g, 0, y + 0.03, z - 0.0255, z - 0.0265, 0.0125, LENS, 12);
  tubeZ(g, 0, y + 0.03, z + 0.0185, z + 0.0195, 0.0125, LENS, 12);
  glow(g); g.box(0, y + 0.031, z - 0.004, 0.0028, 0.0028, 0.001, DOT);
  matte(g);
}
// A scope: rings, tube, bells, turrets and lenses (z0 rear, z1 front).
function scope(g, y, z0, z1, r = 0.016, bell = 0.025) {
  const L = z0 - z1;
  matte(g);
  for (const z of [z0 - L * 0.3, z1 + L * 0.42]) { tubeZ(g, 0, y, z + 0.01, z - 0.01, r + 0.004, BLACK, 12); g.box(0, y - r - 0.006, z, 0.024, 0.014, 0.02, BLACK); }
  tubeZ(g, 0, y, z0 - 0.05, z1 + 0.08, r, BLACK, 14);
  g.tube([0, y, z1 + 0.08], [0, y, z1 + 0.04], r, bell, BLACK, 14);
  tubeZ(g, 0, y, z1 + 0.04, z1, bell, BLACK, 14);
  g.tube([0, y, z0 - 0.05], [0, y, z0 - 0.02], r, r * 1.3, BLACK, 14);
  tubeZ(g, 0, y, z0 - 0.02, z0, r * 1.3, RUBBER, 14);
  const zt = (z0 + z1) / 2 + 0.01;
  g.tube([0, y + r, zt], [0, y + r + 0.022, zt], 0.011, 0.011, BLACK, 12);
  for (let k = 0; k < 4; k++) g.tube([0, y + r + 0.012 + k * 0.0025, zt], [0, y + r + 0.0135 + k * 0.0025, zt], 0.0118, 0.0118, POLY2, 12);
  tubeX(g, r, r + 0.02, y, zt, 0.0105, BLACK, 12);
  g.box(0, y + r + 0.023, zt, 0.002, 0.001, 0.012, CREAM);
  metal(g);
  tubeZ(g, 0, y, z1 - 0.0005, z1 - 0.0015, bell - 0.003, LENS, 14);
  tubeZ(g, 0, y, z0 + 0.0005, z0 + 0.0015, r * 1.3 - 0.003, LENS, 14);
  matte(g);
}
function muzzleHole(g, y, z, r) { matte(g); tubeZ(g, 0, y, z + 0.001, z - 0.0005, r, HOLE, 10); }
// A slotted muzzle brake (z0 rear, z1 front).
function brake(g, y, z0, z1, r, col = BLACK) {
  metal(g); tubeZ(g, 0, y, z0, z1, r, col, 12);
  matte(g);
  for (let z = z0 - 0.008; z > z1 + 0.006; z -= 0.012) { g.box(r - 0.001, y, z, 0.004, r * 0.9, 0.006, HOLE); g.box(-r + 0.001, y, z, 0.004, r * 0.9, 0.006, HOLE); g.box(0, y + r - 0.001, z, r * 0.8, 0.004, 0.006, HOLE); }
  muzzleHole(g, y, z1, r * 0.45);
}
// A curved box magazine hanging from (y, z), sweeping forward as it drops.
function curvedMag(g, y, z, w, d, len, curve, col) {
  matte(g);
  const pts = [0, 1, 2, 3].map((k) => [0, y - (len * k) / 3, z - curve * (k / 3) ** 2]);
  for (let k = 0; k < 3; k++) bar(g, pts[k], pts[k + 1], w, d, col);
  for (let k = 1; k < 3; k++) bar(g, mix(pts[k], pts[k + 1], 0.1), mix(pts[k], pts[k + 1], 0.2), w + 0.003, d * 0.9, col);
  bar(g, pts[3], mix(pts[3], pts[2], -0.1), w + 0.004, d + 0.006, POLY2);
}
// A shotgun shell lying along z.
function shell(g, x, y, z, len = 0.06) {
  tubeZ(g, x, y, z, z - len * 0.75, 0.0095, RED, 8);
  metal(g); tubeZ(g, x, y, z - len * 0.75, z - len, 0.0098, BRASS, 8); matte(g);
}

const BUILD = {
  fists() { return null; },
  bat(g) {
    matte(g);
    g.tube([0, 0, 0.15], [0, 0, 0.132], 0.03, 0.03, BLACK, 14);
    g.tube([0, 0, 0.132], [0, 0, 0.12], 0.03, 0.019, BLACK, 14);
    for (let k = 0; k < 9; k++) g.tube([0, 0, 0.12 - k * 0.026], [0, 0, 0.12 - (k + 1) * 0.026], 0.0195, 0.0198, k % 2 ? POLY : BLACK, 12);
    g.tube([0, 0, -0.114], [0, 0, -0.45], 0.0198, 0.031, WOOD, 14);
    g.tube([0, 0, -0.45], [0, 0, -0.8], 0.031, 0.036, WOOD, 14);
    g.tube([0, 0, -0.8], [0, 0, -0.84], 0.036, 0.034, WOOD, 14);
    tubeZ(g, 0, 0, -0.84, -0.843, 0.03, DARKW, 14);
    for (const a of [0.4, 2.1, 3.9, 5.2]) bar(g, [Math.cos(a) * 0.03, Math.sin(a) * 0.03, -0.3], [Math.cos(a) * 0.0355, Math.sin(a) * 0.0355, -0.78], 0.002, 0.0015, WOOD2);
    tubeZ(g, 0, 0, -0.55, -0.58, 0.0345, ORANGE, 14);
    tubeZ(g, 0, 0, -0.585, -0.6, 0.0348, CREAM, 14);
    tubeZ(g, 0, 0, 0.15, 0.152, 0.024, ORANGE, 12);
    return null;
  },
  blade(g) {
    matte(g);
    // Handle: rubber grip with finger grooves, riveted through the full tang.
    g.box(0, 0, 0.03, 0.026, 0.034, 0.13, BLACK);
    for (let k = 0; k < 4; k++) g.box(0, -0.018, 0.075 - k * 0.03, 0.024, 0.006, 0.012, RUBBER);
    g.box(0, 0.005, 0.095, 0.03, 0.04, 0.01, BLACK);
    metal(g);
    for (const z of [0.07, 0.0]) tubeX(g, -0.0145, 0.0145, 0.004, z, 0.0045, STEEL, 8);
    g.box(0, 0.004, -0.04, 0.008, 0.048, 0.04, BRUSH);
    g.box(0, 0.004, -0.058, 0.03, 0.06, 0.008, STEEL);
    // Blade: blackened, thick at the spine, a polished bevel along the edge, clip point at the tip.
    const sp = 0.0032, ed = 0.0008;
    const sec = (z0, z1, t0, t1, b0, b1, col) => g.hexa([[-ed, b0, z0], [ed, b0, z0], [ed, b1, z1], [-ed, b1, z1], [-sp, t0, z0], [sp, t0, z0], [sp, t1, z1], [-sp, t1, z1]], col);
    matte(g);
    sec(-0.062, -0.3, 0.032, 0.034, -0.012, -0.018, GUN);
    sec(-0.3, -0.48, 0.034, 0.034, -0.018, -0.026, GUN);
    sec(-0.48, -0.6, 0.034, 0.008, -0.026, -0.006, GUN);
    sec(-0.6, -0.635, 0.008, -0.003, -0.006, -0.004, GUN);
    metal(g);
    const bev = (z0, z1, b0, b1) => g.hexa([[-ed * 1.2, b0 - 0.0005, z0], [ed * 1.2, b0 - 0.0005, z0], [ed * 1.2, b1 - 0.0005, z1], [-ed * 1.2, b1 - 0.0005, z1], [-0.0018, b0 + 0.007, z0], [0.0018, b0 + 0.007, z0], [0.0018, b1 + 0.007, z1], [-0.0018, b1 + 0.007, z1]], EDGE);
    bev(-0.065, -0.3, -0.012, -0.018); bev(-0.3, -0.48, -0.018, -0.026); bev(-0.48, -0.6, -0.026, -0.006);
    matte(g);
    g.box(0.0034, 0.02, -0.12, 0.0006, 0.004, 0.05, ORANGE);
    return null;
  },
  pistol(g, w) {
    const mp = w.id === "burstmode";
    const L = mp ? 0.22 : 0.19, zf = 0.035 - L, y = 0.077;
    metal(g);
    cham(g, 0, y, (0.035 + zf) / 2, 0.03, 0.034, L, 0.006, GUN);
    matte(g);
    for (let k = 0; k < 7; k++) for (const s of [-1, 1]) g.box(s * 0.0153, y - 0.002, 0.028 - k * 0.005, 0.002, 0.022, 0.0022, BLACK);
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) g.box(s * 0.0153, y - 0.002, zf + 0.03 - k * 0.005, 0.002, 0.022, 0.0022, BLACK);
    g.box(0.004, y + 0.0172, -0.035, 0.014, 0.0012, 0.042, HOLE);
    metal(g); g.box(0.004, y + 0.012, -0.035, 0.012, 0.004, 0.036, BRUSH);
    tubeZ(g, 0, y + 0.001, zf + 0.002, zf - 0.006, 0.0068, STEEL, 12);
    muzzleHole(g, y + 0.001, zf - 0.006, 0.0038);
    // Sights: a white-dot front post, a notched rear.
    g.box(0, y + 0.021, zf + 0.012, 0.004, 0.007, 0.007, BLACK);
    g.box(0, y + 0.022, zf + 0.0085, 0.002, 0.002, 0.001, CREAM);
    g.box(0, y + 0.0185, 0.022, 0.022, 0.003, 0.01, BLACK);
    for (const s of [-1, 1]) { g.box(s * 0.0065, y + 0.0225, 0.022, 0.006, 0.006, 0.009, BLACK); g.box(s * 0.0065, y + 0.0255, 0.0175, 0.0015, 0.0015, 0.001, CREAM); }
    // Frame: dust cover with a short rail, levers, guard, trigger, stippled grip.
    matte(g);
    g.box(0, 0.05, (zf + 0.012) / 2, 0.028, 0.02, -(zf + 0.012), POLY);
    for (let k = 0; k < 4; k++) g.box(0, 0.0385, -0.085 - k * 0.012 - (mp ? 0.02 : 0), 0.029, 0.004, 0.006, POLY);
    g.box(-0.0158, 0.058, -0.03, 0.0025, 0.006, 0.03, BLACK);
    g.box(-0.0158, 0.05, -0.065, 0.0025, 0.005, 0.008, BLACK);
    g.box(-0.0158, 0.03, -0.004, 0.003, 0.009, 0.009, BLACK);
    guard(g, -0.06, -0.01, 0.042, 0.002, POLY);
    trigger(g);
    const ga = [0, 0.045, 0.01], gb = [0, -0.068, 0.032];
    g.box(0, 0.05, 0.016, 0.028, 0.02, 0.04, POLY);
    bar(g, ga, gb, 0.03, 0.046, POLY);
    bar(g, [0, 0.055, 0.034], [0, 0.052, 0.046], 0.022, 0.006, POLY);
    // Grip panels with fine horizontal texture.
    bar(g, mix(ga, gb, 0.14), mix(ga, gb, 0.9), 0.0312, 0.034, POLY2);
    for (let i = 0; i < 12; i++) { const p = mix(ga, gb, 0.17 + i * 0.062); for (const s of [-1, 1]) g.box(s * 0.0157, p[1], p[2], 0.0006, 0.0018, 0.03, POLY); }
    for (let i = 0; i < 3; i++) { const p = mix(ga, gb, 0.3 + i * 0.2); g.box(0, p[1], p[2] - 0.024, 0.026, 0.006, 0.004, POLY2); }
    g.box(0, gb[1] - 0.006, gb[2] + 0.002, 0.032, 0.008, 0.05, ORANGE);
    g.box(0.0153, y - 0.008, zf + 0.06, 0.0008, 0.004, 0.035, ORANGE);
    if (mp) {
      // Machine pistol: extended magazine, compensator, a stub foregrip and a fire selector.
      bar(g, [0, gb[1] - 0.004, gb[2] - 0.004], [0, gb[1] - 0.075, gb[2] + 0.008], 0.024, 0.036, GUN);
      for (let k = 0; k < 3; k++) bar(g, [0, gb[1] - 0.02 - k * 0.02, gb[2] - 0.001 + k * 0.002], [0, gb[1] - 0.024 - k * 0.02, gb[2] - 0.0005 + k * 0.002], 0.026, 0.037, POLY2);
      g.box(0, gb[1] - 0.082, gb[2] + 0.01, 0.028, 0.008, 0.04, ORANGE);
      metal(g); cham(g, 0, y, zf - 0.02, 0.028, 0.03, 0.04, 0.005, GUN);
      matte(g); for (let k = 0; k < 3; k++) g.box(0, y + 0.0152, zf - 0.008 - k * 0.011, 0.012, 0.002, 0.005, HOLE);
      bar(g, [0, 0.04, -0.12], [0, -0.02, -0.11], 0.024, 0.026, POLY);
      g.box(-0.0165, 0.06, 0.01, 0.003, 0.01, 0.006, ORANGE);
      muzzleHole(g, y + 0.001, zf - 0.04, 0.005);
      return [0, y + 0.001, zf - 0.041];
    }
    return [0, y + 0.001, zf - 0.007];
  },
  revolver(g) {
    const y = 0.08;
    metal(g);
    tubeZ(g, 0, y, -0.045, -0.24, 0.011, STEEL, 14);
    g.box(0, y + 0.012, -0.145, 0.012, 0.009, 0.19, STEEL);
    matte(g); for (let k = 0; k < 6; k++) g.box(0, y + 0.0167, -0.07 - k * 0.028, 0.008, 0.0012, 0.014, HOLE);
    metal(g);
    g.box(0, y - 0.014, -0.15, 0.016, 0.018, 0.17, STEEL);
    g.box(0, y + 0.023, -0.228, 0.004, 0.012, 0.02, STEEL);
    matte(g); g.box(0, y + 0.024, -0.226, 0.0045, 0.005, 0.01, ORANGE);
    muzzleHole(g, y, -0.24, 0.0045);
    metal(g);
    // Frame, top strap with the rear notch, and the cylinder: six flutes, six chambers.
    g.box(0, 0.074, 0.006, 0.026, 0.058, 0.072, STEEL);
    g.box(0, 0.101, -0.012, 0.018, 0.008, 0.06, STEEL);
    for (const s of [-1, 1]) g.box(s * 0.005, 0.107, 0.016, 0.004, 0.005, 0.008, STEEL);
    const cy = 0.071;
    tubeZ(g, 0, cy, 0.016, -0.044, 0.023, BRUSH, 18);
    matte(g);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const px = Math.sin(a) * 0.0225, py = cy + Math.cos(a) * 0.0225;
      bar(g, [px, py, 0.006], [px, py, -0.034], 0.005, 0.004, GUN);
      const b = (k / 6) * Math.PI * 2;
      tubeZ(g, Math.sin(b) * 0.013, cy + Math.cos(b) * 0.013, -0.0442, -0.0452, 0.0048, HOLE, 8);
      metal(g); tubeZ(g, Math.sin(b) * 0.013, cy + Math.cos(b) * 0.013, 0.0162, 0.0172, 0.0047, BRASS, 8); matte(g);
    }
    metal(g);
    bar(g, [0, 0.092, 0.036], [0, 0.106, 0.046], 0.006, 0.009, STEEL);
    bar(g, [0, 0.106, 0.044], [0, 0.104, 0.056], 0.008, 0.004, STEEL);
    g.box(-0.014, 0.082, 0.034, 0.003, 0.006, 0.01, STEEL);
    guard(g, -0.03, 0.03, 0.045, 0.012, STEEL);
    trigger(g, 0.0, 0.042);
    // Wooden grip with checkering and a medallion.
    matte(g);
    const ga = [0, 0.058, 0.045], gb = [0, -0.056, 0.064];
    bar(g, ga, gb, 0.032, 0.046, WOOD);
    // Checkering: fine crossed grooves on both panels.
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
      const p = mix(ga, gb, 0.22 + i * 0.07);
      bar(g, [s * 0.0163, p[1] + 0.012, p[2] - 0.016], [s * 0.0163, p[1] - 0.012, p[2] + 0.016], 0.0008, 0.0016, WOOD2);
      bar(g, [s * 0.0164, p[1] - 0.012, p[2] - 0.016], [s * 0.0164, p[1] + 0.012, p[2] + 0.016], 0.0008, 0.0016, WOOD2);
    }
    for (const s of [-1, 1]) g.tube([s * 0.0163, 0.0, 0.054], [s * 0.0175, 0.0, 0.054], 0.006, 0.006, ORANGE, 10);
    metal(g); bar(g, mix(gb, ga, -0.02), mix(gb, ga, 0.06), 0.03, 0.046, STEEL);
    matte(g);
    return [0, y, -0.241];
  },
  smg(g, w) {
    if (w.id !== "asyncqueue") {
      // Micro SMG: magazine in the grip, folding wire stock, vented receiver.
      const y = 0.075;
      metal(g); cham(g, 0, y, -0.065, 0.04, 0.058, 0.23, 0.008, GUN);
      matte(g);
      slots(g, 0.0203, y - 0.008, -0.12, -0.17, 0.012, 0.007, 0.018);
      g.box(0.0202, y + 0.012, -0.03, 0.002, 0.012, 0.04, HOLE);
      g.box(0, y + 0.0315, 0.02, 0.012, 0.006, 0.012, BLACK);
      g.box(0, y + 0.032, -0.165, 0.004, 0.01, 0.006, BLACK);
      g.box(-0.024, y + 0.012, 0.0, 0.01, 0.01, 0.014, BLACK);
      metal(g); tubeZ(g, 0, y + 0.005, -0.18, -0.25, 0.0095, GUN, 12);
      for (let k = 0; k < 5; k++) tubeZ(g, 0, y + 0.005, -0.215 - k * 0.006, -0.218 - k * 0.006, 0.0105, BLACK, 12);
      muzzleHole(g, y + 0.005, -0.25, 0.005);
      const ga = [0, 0.045, 0.0], gb = [0, -0.066, 0.012];
      bar(g, ga, gb, 0.032, 0.044, POLY);
      for (let i = 0; i < 3; i++) { const p = mix(ga, gb, 0.3 + i * 0.2); g.box(0, p[1], p[2] - 0.023, 0.028, 0.006, 0.004, POLY2); }
      metal(g); bar(g, [0, gb[1], gb[2]], [0, gb[1] - 0.05, gb[2] + 0.002], 0.024, 0.034, GUN);
      matte(g); g.box(0, gb[1] - 0.056, gb[2] + 0.002, 0.03, 0.01, 0.042, ORANGE);
      guard(g, -0.06, -0.012, 0.045, 0.004, POLY);
      trigger(g);
      bar(g, [0, 0.045, -0.15], [0, 0.0, -0.145], 0.026, 0.028, POLY);
      metal(g);
      for (const s of [-1, 1]) rod(g, [[s * 0.017, y - 0.01, 0.05], [s * 0.017, y - 0.012, 0.2], [s * 0.017, y - 0.04, 0.215]], 0.003, STEEL);
      bar(g, [0, y - 0.005, 0.215], [0, y - 0.07, 0.215], 0.04, 0.008, BLACK);
      return [0, y + 0.005, -0.251];
    }
    // Tactical SMG: rails, red dot, M-LOK handguard, suppressor, adjustable stock.
    const y = 0.08;
    metal(g); cham(g, 0, y, -0.05, 0.042, 0.06, 0.2, 0.006, SAND);
    matte(g);
    rail(g, y + 0.034, 0.05, -0.36);
    g.box(0, y - 0.002, -0.27, 0.046, 0.054, 0.18, SAND2);
    slots(g, 0.0232, y - 0.004, -0.2, -0.35, 0.03, 0.02, 0.01);
    for (let z = -0.2; z > -0.35; z -= 0.03) g.box(0, y - 0.0292, z, 0.012, 0.0016, 0.02, HOLE);
    g.box(0.0212, y + 0.012, -0.02, 0.002, 0.014, 0.045, HOLE);
    metal(g); g.box(0.0222, y + 0.012, -0.0, 0.004, 0.012, 0.01, BLACK);
    matte(g); g.box(-0.024, y + 0.02, 0.035, 0.014, 0.01, 0.012, BLACK);
    tubeZ(g, 0, y, -0.36, -0.49, 0.018, BLACK, 14);
    for (let k = 0; k < 3; k++) tubeZ(g, 0, y, -0.38 - k * 0.04, -0.383 - k * 0.04, 0.0186, POLY2, 14);
    muzzleHole(g, y, -0.49, 0.006);
    redDot(g, y + 0.038, -0.06);
    curvedMag(g, y - 0.03, -0.1, 0.024, 0.04, 0.13, 0.03, BLACK);
    const ga = [0, 0.05, -0.002], gb = [0, -0.055, 0.022];
    bar(g, ga, gb, 0.03, 0.042, POLY);
    for (let i = 0; i < 3; i++) { const p = mix(ga, gb, 0.3 + i * 0.2); g.box(0, p[1], p[2] - 0.022, 0.026, 0.006, 0.004, POLY2); }
    guard(g, -0.06, -0.012, 0.05, 0.006, POLY);
    trigger(g);
    bar(g, [0, y - 0.03, -0.31], [0, y - 0.1, -0.305], 0.026, 0.03, POLY);
    for (let k = 0; k < 3; k++) g.box(0, y - 0.05 - k * 0.015, -0.322, 0.026, 0.005, 0.006, POLY2);
    metal(g); tubeZ(g, 0, y + 0.005, 0.05, 0.2, 0.013, BLACK, 12);
    matte(g);
    g.box(0, y - 0.005, 0.17, 0.04, 0.07, 0.11, POLY);
    g.box(0, y + 0.03, 0.16, 0.03, 0.012, 0.08, POLY2);
    g.box(0, y - 0.01, 0.228, 0.044, 0.1, 0.012, RUBBER);
    g.box(0, y - 0.047, 0.15, 0.012, 0.006, 0.03, BLACK);
    sling(g, 0, y - 0.04, 0.2);
    return [0, y, -0.491];
  },
  shotgun(g, w) {
    if (w.id === "quickfix") {
      // Sawn-off side-by-side: two barrels and a rib, break-open hinge, checkered forend.
      const y = 0.07;
      metal(g);
      for (const x of [-0.0135, 0.0135]) { tubeZ(g, x, y, -0.02, -0.38, 0.0135, BLUED, 14); }
      g.box(0, y + 0.012, -0.2, 0.01, 0.006, 0.36, BLUED);
      for (const x of [-0.0135, 0.0135]) muzzleHole2(g, x, y, -0.38, 0.009);
      g.box(0, y + 0.0155, -0.375, 0.003, 0.003, 0.003, BRASS);
      g.box(0, y - 0.004, 0.0, 0.042, 0.04, 0.05, STEEL);
      tubeX(g, -0.022, 0.022, y - 0.016, -0.02, 0.008, STEEL, 10);
      g.box(0, y + 0.018, 0.02, 0.012, 0.006, 0.03, STEEL);
      matte(g);
      g.box(0, y - 0.02, -0.1, 0.048, 0.03, 0.14, WOOD);
      for (let k = 0; k < 8; k++) for (const s of [-1, 1]) g.box(s * 0.0243, y - 0.02, -0.05 - k * 0.013, 0.0012, 0.02, 0.006, WOOD2);
      metal(g); guard(g, -0.035, 0.03, 0.048, 0.008, STEEL);
      trigger(g, -0.005, 0.045); trigger(g, 0.01, 0.045);
      matte(g);
      const ga = [0, 0.05, 0.03], gb = [0, -0.06, 0.08];
      bar(g, ga, gb, 0.036, 0.05, WOOD);
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const p = mix(ga, gb, 0.25 + i * 0.12); g.box(s * 0.0183, p[1], p[2], 0.0012, 0.008, 0.03, WOOD2); }
      metal(g); bar(g, mix(gb, ga, -0.02), mix(gb, ga, 0.05), 0.034, 0.05, BLUED);
      matte(g);
      return [0, y, -0.381];
    }
    const auto = w.id === "massupdate";
    if (!auto) {
      // Pump-action: magazine tube, grooved pump, side saddle of shells, wooden stock.
      const y = 0.085;
      metal(g);
      tubeZ(g, 0, y, -0.06, -0.62, 0.0145, BLUED, 14);
      tubeZ(g, 0, y - 0.03, -0.06, -0.54, 0.013, BLUED, 12);
      tubeZ(g, 0, y - 0.03, -0.54, -0.555, 0.0145, STEEL, 12);
      g.box(0, y - 0.015, -0.52, 0.012, 0.03, 0.02, BLUED);
      g.box(0, y + 0.0155, -0.615, 0.004, 0.004, 0.004, BRASS);
      muzzleHole(g, y, -0.62, 0.009);
      cham(g, 0, y - 0.018, -0.045, 0.044, 0.07, 0.2, 0.008, BLUED);
      matte(g);
      g.box(0.0222, y - 0.008, -0.04, 0.002, 0.02, 0.06, HOLE);
      g.box(0, y - 0.0535, -0.06, 0.022, 0.002, 0.07, HOLE);
      for (const s of [-1, 1]) g.box(0, y + 0.0185, 0.03 * s, 0.02, 0.004, 0.006, BLACK);
      matte(g);
      tubeZ(g, 0, y - 0.03, -0.25, -0.42, 0.024, WOOD, 14);
      for (let k = 0; k < 9; k++) tubeZ(g, 0, y - 0.03, -0.265 - k * 0.017, -0.272 - k * 0.017, 0.0255, WOOD2, 14);
      g.box(-0.0245, y - 0.012, -0.05, 0.006, 0.03, 0.09, POLY);
      for (let k = 0; k < 4; k++) {
        const z = -0.08 + k * 0.02;
        g.tube([-0.0305, y - 0.04, z], [-0.0305, y + 0.008, z], 0.0092, 0.0092, RED, 8);
        metal(g); g.tube([-0.0305, y + 0.008, z], [-0.0305, y + 0.02, z], 0.0096, 0.0096, BRASS, 8); matte(g);
      }
      metal(g); guard(g, -0.06, -0.01, 0.045, 0.004, BLUED);
      trigger(g);
      matte(g);
      bar(g, [0, y - 0.01, 0.055], [0, y - 0.07, 0.11], 0.036, 0.05, WOOD);
      bar(g, [0, y - 0.015, 0.06], [0, y - 0.035, 0.36], 0.04, 0.06, WOOD);
      bar(g, [0, y - 0.05, 0.1], [0, y - 0.075, 0.36], 0.038, 0.05, WOOD);
      g.box(0, y - 0.045, 0.368, 0.042, 0.1, 0.016, RUBBER);
      sling(g, 0, y - 0.1, 0.3); sling(g, 0, y - 0.045, -0.5);
      return [0, y, -0.621];
    }
    // Automatic shotgun: box magazine, rail with a red dot, vented shroud, brake, adjustable stock.
    const y = 0.085;
    metal(g); cham(g, 0, y - 0.01, -0.05, 0.048, 0.08, 0.24, 0.008, GUN);
    matte(g);
    rail(g, y + 0.034, 0.06, -0.28);
    g.box(0, y - 0.008, -0.33, 0.05, 0.06, 0.2, POLY);
    for (let z = -0.25; z > -0.42; z -= 0.025) for (const s of [-1, 1]) g.box(s * 0.0252, y - 0.004, z, 0.0016, 0.022, 0.012, HOLE);
    metal(g); tubeZ(g, 0, y + 0.004, -0.43, -0.5, 0.015, GUN, 12);
    brake(g, y + 0.004, -0.5, -0.56, 0.019);
    redDot(g, y + 0.038, -0.07);
    g.box(0.0242, y + 0.006, -0.04, 0.002, 0.024, 0.05, HOLE);
    matte(g);
    g.box(0, y - 0.09, -0.11, 0.05, 0.11, 0.075, BLACK);
    for (let k = 0; k < 4; k++) g.box(0, y - 0.06 - k * 0.022, -0.11, 0.053, 0.004, 0.078, POLY2);
    g.box(0, y - 0.15, -0.11, 0.056, 0.012, 0.08, ORANGE);
    const ga = [0, 0.05, -0.002], gb = [0, -0.055, 0.025];
    bar(g, ga, gb, 0.032, 0.044, POLY);
    guard(g, -0.06, -0.012, 0.045, 0.004, POLY);
    trigger(g);
    metal(g); tubeZ(g, 0, y, 0.07, 0.24, 0.015, BLACK, 12);
    matte(g);
    g.box(0, y - 0.01, 0.2, 0.045, 0.085, 0.13, POLY);
    g.box(0, y + 0.035, 0.19, 0.034, 0.014, 0.09, POLY2);
    g.box(0, y - 0.014, 0.272, 0.048, 0.11, 0.014, RUBBER);
    return [0, y + 0.004, -0.561];
  },
  rifle(g, w) {
    const br = w.id === "governor";
    if (!br) {
      // Carbine: flat-top upper with a toothed rail, M-LOK handguard, holo sight, curved magazine.
      const y = 0.09;
      metal(g); cham(g, 0, y, -0.05, 0.04, 0.036, 0.25, 0.006, GUN);
      g.box(0, y - 0.035, -0.04, 0.036, 0.04, 0.2, GUN);
      g.box(0, y - 0.06, -0.125, 0.04, 0.034, 0.075, GUN);
      matte(g);
      rail(g, y + 0.022, 0.075, -0.46);
      g.box(0.0205, y - 0.002, -0.02, 0.002, 0.014, 0.05, HOLE);
      metal(g); g.box(0.0215, y - 0.012, -0.02, 0.002, 0.006, 0.05, GUN);
      g.tube([0.02, y + 0.004, 0.035], [0.03, y + 0.004, 0.035], 0.008, 0.008, GUN, 8);
      g.box(0, y + 0.012, 0.085, 0.024, 0.01, 0.02, BLACK);
      g.box(-0.021, y - 0.035, -0.0, 0.004, 0.006, 0.016, BLACK);
      g.box(0.0195, y - 0.045, -0.085, 0.004, 0.01, 0.01, BLACK);
      matte(g);
      g.box(0, y - 0.002, -0.32, 0.048, 0.052, 0.29, POLY2);
      slots(g, 0.0242, y - 0.003, -0.2, -0.44, 0.035, 0.022, 0.009);
      for (let z = -0.2; z > -0.44; z -= 0.035) g.box(0, y - 0.0282, z, 0.012, 0.0016, 0.022, HOLE);
      metal(g); tubeZ(g, 0, y, -0.465, -0.6, 0.009, GUN, 12);
      g.box(0, y + 0.005, -0.5, 0.026, 0.018, 0.025, GUN);
      brake(g, y, -0.6, -0.66, 0.012);
      matte(g);
      g.box(0, y + 0.036, -0.44, 0.01, 0.022, 0.012, BLACK);
      g.box(0, y + 0.048, -0.44, 0.002, 0.008, 0.002, BLACK);
      g.box(0, y + 0.034, 0.055, 0.018, 0.018, 0.012, BLACK);
      // Holographic sight: a window frame with a glowing reticle.
      g.box(0, y + 0.032, -0.07, 0.034, 0.008, 0.075, BLACK);
      for (const s of [-1, 1]) g.box(s * 0.0155, y + 0.052, -0.07, 0.003, 0.034, 0.05, BLACK);
      g.box(0, y + 0.07, -0.07, 0.034, 0.004, 0.05, BLACK);
      metal(g); g.box(0, y + 0.052, -0.09, 0.028, 0.03, 0.002, LENS);
      glow(g); g.box(0, y + 0.052, -0.092, 0.003, 0.003, 0.001, DOT);
      matte(g);
      curvedMag(g, y - 0.075, -0.125, 0.024, 0.062, 0.15, 0.03, BLACK);
      const ga = [0, 0.04, -0.008], gb = [0, -0.06, 0.018];
      bar(g, ga, gb, 0.03, 0.042, POLY);
      for (let i = 0; i < 3; i++) { const p = mix(ga, gb, 0.3 + i * 0.2); g.box(0, p[1], p[2] - 0.022, 0.026, 0.006, 0.004, POLY2); }
      guard(g, -0.08, -0.016, 0.05, 0.008, GUN);
      trigger(g, -0.045, 0.05);
      metal(g); tubeZ(g, 0, y - 0.008, 0.075, 0.25, 0.015, BLACK, 14);
      matte(g);
      g.box(0, y - 0.022, 0.215, 0.044, 0.08, 0.13, POLY);
      g.box(0, y + 0.02, 0.2, 0.034, 0.016, 0.1, POLY2);
      g.box(0, y - 0.026, 0.285, 0.048, 0.11, 0.014, RUBBER);
      g.box(0, y - 0.065, 0.19, 0.012, 0.006, 0.04, BLACK);
      sling(g, 0, y - 0.07, 0.25); sling(g, 0, y - 0.03, -0.43);
      g.box(0.0206, y - 0.035, -0.08, 0.0008, 0.006, 0.05, ORANGE);
      return [0, y, -0.661];
    }
    // Battle rifle: olive stock and handguard, carry handle, hooded front sight, straight magazine.
    const y = 0.085;
    metal(g); cham(g, 0, y, -0.06, 0.044, 0.05, 0.3, 0.008, GUN);
    g.box(0, y - 0.04, -0.07, 0.04, 0.035, 0.2, GUN);
    matte(g);
    g.box(0.0222, y + 0.004, -0.04, 0.002, 0.018, 0.06, HOLE);
    metal(g); g.box(0.025, y + 0.004, -0.0, 0.01, 0.01, 0.015, GUN);
    rod(g, [[0, y + 0.024, 0.04], [0, y + 0.06, 0.03], [0, y + 0.062, -0.15], [0, y + 0.024, -0.17]], 0.006, GUN);
    g.box(0, y + 0.07, 0.03, 0.016, 0.016, 0.012, GUN);
    matte(g);
    g.box(0, y - 0.004, -0.36, 0.05, 0.056, 0.26, OLIVE);
    for (let z = -0.26; z > -0.47; z -= 0.03) for (const s of [-1, 1]) g.box(s * 0.0252, y + 0.006, z, 0.0016, 0.012, 0.016, HOLE);
    metal(g); tubeZ(g, 0, y, -0.49, -0.66, 0.0105, GUN, 12);
    tubeZ(g, 0, y - 0.02, -0.49, -0.56, 0.006, GUN, 8);
    g.box(0, y + 0.012, -0.6, 0.02, 0.03, 0.02, GUN);
    tubeZ(g, 0, y + 0.04, -0.592, -0.608, 0.012, GUN, 12);
    matte(g); g.box(0, y + 0.036, -0.6, 0.002, 0.012, 0.004, BLACK);
    brake(g, y, -0.66, -0.73, 0.014);
    g.box(0, y - 0.08, -0.13, 0.034, 0.12, 0.06, GUN);
    for (let k = 0; k < 5; k++) g.box(0, y - 0.05 - k * 0.022, -0.13, 0.036, 0.003, 0.062, POLY);
    g.box(0, y - 0.144, -0.13, 0.038, 0.01, 0.065, OD2);
    const ga = [0, 0.04, -0.005], gb = [0, -0.06, 0.03];
    bar(g, ga, gb, 0.032, 0.046, OD2);
    guard(g, -0.09, -0.014, 0.05, 0.006, GUN);
    trigger(g, -0.05, 0.05);
    bar(g, [0, y - 0.01, 0.06], [0, y - 0.03, 0.37], 0.042, 0.06, OLIVE);
    bar(g, [0, y - 0.05, 0.08], [0, y - 0.085, 0.37], 0.04, 0.05, OLIVE);
    bar(g, [0, y + 0.02, 0.15], [0, y + 0.015, 0.33], 0.034, 0.016, OD2);
    metal(g); g.box(0, y - 0.035, 0.378, 0.044, 0.12, 0.014, GUN);
    matte(g); sling(g, 0, y - 0.12, 0.3); sling(g, 0, y - 0.035, -0.47);
    g.box(-0.023, y - 0.04, -0.03, 0.004, 0.008, 0.014, ORANGE);
    return [0, y, -0.731];
  },
  sniper(g, w) {
    const marks = w.id === "fieldaudit";
    if (!marks) {
      // Bolt-action: fluted heavy barrel, brake, scope on rings, laminated stock, bipod.
      const y = 0.085;
      metal(g);
      tubeZ(g, 0, y, 0.04, -0.17, 0.02, STEEL, 16);
      matte(g); g.box(0.0195, y + 0.006, -0.06, 0.002, 0.012, 0.05, HOLE);
      metal(g);
      g.box(0.016, y, 0.0, 0.01, 0.01, 0.014, STEEL);
      bar(g, [0.02, y, 0.0], [0.052, y - 0.018, 0.012], 0.006, 0.006, STEEL);
      g.tube([0.052, y - 0.018, 0.012], [0.062, y - 0.022, 0.016], 0.01, 0.01, BLACK, 10);
      tubeZ(g, 0, y, -0.17, -0.95, 0.0135, BLUED, 14);
      matte(g);
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; bar(g, [Math.sin(a) * 0.0132, y + Math.cos(a) * 0.0132, -0.4], [Math.sin(a) * 0.0132, y + Math.cos(a) * 0.0132, -0.88], 0.004, 0.003, GUN); }
      brake(g, y, -0.95, -1.03, 0.02);
      rail(g, y + 0.024, 0.05, -0.18);
      scope(g, y + 0.06, 0.09, -0.3, 0.016, 0.026);
      g.box(0, y - 0.04, -0.06, 0.034, 0.04, 0.07, BLACK);
      g.box(0, y - 0.062, -0.06, 0.036, 0.006, 0.072, POLY2);
      // Laminated stock: forend, wrist, butt with cheek riser and pad.
      bar(g, [0, y - 0.02, -0.12], [0, y - 0.02, -0.55], 0.052, 0.05, WOOD);
      for (let k = 0; k < 3; k++) for (const s of [-1, 1]) bar(g, [s * 0.0262, y - 0.03 + k * 0.012, -0.13], [s * 0.0262, y - 0.03 + k * 0.012, -0.54], 0.001, 0.003, WOOD2);
      bar(g, [0, y - 0.02, 0.04], [0, y - 0.03, 0.12], 0.046, 0.06, WOOD);
      const ga = [0, 0.04, 0.035], gb = [0, -0.05, 0.075];
      bar(g, ga, gb, 0.036, 0.05, WOOD);
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const p = mix(ga, gb, 0.3 + i * 0.15); g.box(s * 0.0183, p[1], p[2], 0.0012, 0.008, 0.03, WOOD2); }
      bar(g, [0, y - 0.02, 0.12], [0, y - 0.035, 0.36], 0.048, 0.07, WOOD);
      bar(g, [0, y - 0.06, 0.12], [0, y - 0.095, 0.36], 0.044, 0.06, WOOD);
      g.box(0, y + 0.024, 0.25, 0.036, 0.02, 0.15, WOOD2);
      g.box(0, y - 0.05, 0.37, 0.048, 0.13, 0.018, RUBBER);
      metal(g); guard(g, -0.03, 0.03, 0.045, 0.008, STEEL);
      trigger(g, 0.0, 0.05);
      matte(g);
      tubeZ(g, 0, y - 0.045, -0.5, -0.53, 0.012, BLACK, 10);
      for (const s of [-1, 1]) {
        g.tube([s * 0.006, y - 0.05, -0.52], [s * 0.05, y - 0.2, -0.56], 0.006, 0.005, BLACK, 6);
        g.tube([s * 0.05, y - 0.2, -0.56], [s * 0.052, y - 0.215, -0.563], 0.009, 0.009, RUBBER, 6);
      }
      sling(g, 0, y - 0.13, 0.32); sling(g, 0, y - 0.046, -0.45);
      g.box(0.0242, y - 0.015, -0.3, 0.0008, 0.006, 0.05, ORANGE);
      return [0, y, -1.031];
    }
    // Marksman rifle: sand receiver and handguard, compact scope, box magazine, bipod.
    const y = 0.09;
    metal(g); cham(g, 0, y, -0.05, 0.044, 0.04, 0.26, 0.006, SAND);
    g.box(0, y - 0.038, -0.05, 0.04, 0.04, 0.2, SAND);
    matte(g);
    rail(g, y + 0.024, 0.08, -0.55);
    g.box(0.0222, y - 0.002, -0.02, 0.002, 0.016, 0.055, HOLE);
    g.box(0, y - 0.002, -0.38, 0.05, 0.054, 0.34, SAND2);
    slots(g, 0.0252, y - 0.003, -0.24, -0.53, 0.035, 0.022, 0.009);
    metal(g); tubeZ(g, 0, y, -0.55, -0.8, 0.0115, GUN, 12);
    brake(g, y, -0.8, -0.87, 0.016);
    scope(g, y + 0.058, 0.07, -0.25, 0.015, 0.022);
    g.box(0, y - 0.09, -0.12, 0.036, 0.1, 0.07, BLACK);
    for (let k = 0; k < 3; k++) g.box(0, y - 0.065 - k * 0.022, -0.12, 0.038, 0.003, 0.072, POLY);
    const ga = [0, 0.04, -0.008], gb = [0, -0.06, 0.02];
    bar(g, ga, gb, 0.03, 0.044, SAND2);
    guard(g, -0.08, -0.016, 0.05, 0.008, SAND);
    trigger(g, -0.045, 0.05);
    metal(g); tubeZ(g, 0, y - 0.008, 0.08, 0.26, 0.016, BLACK, 14);
    matte(g);
    g.box(0, y - 0.022, 0.22, 0.046, 0.085, 0.13, SAND2);
    g.box(0, y + 0.024, 0.21, 0.036, 0.02, 0.11, SAND);
    g.box(0, y - 0.026, 0.292, 0.05, 0.115, 0.016, RUBBER);
    for (const s of [-1, 1]) {
      g.tube([s * 0.008, y - 0.03, -0.5], [s * 0.05, y - 0.19, -0.54], 0.006, 0.005, BLACK, 6);
      g.tube([s * 0.05, y - 0.19, -0.54], [s * 0.052, y - 0.205, -0.543], 0.009, 0.009, RUBBER, 6);
    }
    sling(g, 0, y - 0.07, 0.26);
    return [0, y, -0.871];
  },
  lmg(g) {
    // Light machine gun: feed cover, ammo box with a belt into the feed tray, vented heat shield, bipod.
    const y = 0.09;
    metal(g); cham(g, 0, y - 0.01, -0.08, 0.06, 0.09, 0.4, 0.01, GUN);
    g.box(0, y + 0.042, -0.06, 0.056, 0.016, 0.16, GUN);
    // Right side: ejection port, charging handle in its slot, side-plate seams and rivets.
    matte(g);
    g.box(0.0302, y - 0.015, -0.03, 0.002, 0.024, 0.07, HOLE);
    g.box(0.0302, y + 0.01, -0.2, 0.002, 0.008, 0.16, HOLE);
    metal(g); g.box(0.034, y + 0.01, -0.16, 0.012, 0.012, 0.018, STEEL);
    g.tube([0.04, y + 0.01, -0.16], [0.052, y + 0.01, -0.16], 0.008, 0.008, BLACK, 8);
    matte(g);
    for (const yy of [y - 0.045, y + 0.026]) g.box(0.0303, yy, -0.08, 0.0012, 0.0015, 0.38, BLACK);
    for (let k = 0; k < 6; k++) for (const yy of [y - 0.035, y + 0.018]) { metal(g); g.tube([0.03, yy, 0.08 - k * 0.06], [0.0318, yy, 0.08 - k * 0.06], 0.0028, 0.0028, STEEL, 6); }
    matte(g);
    g.box(0.0303, y - 0.012, 0.06, 0.001, 0.006, 0.04, ORANGE);
    metal(g);
    matte(g); for (let k = 0; k < 6; k++) g.box(0, y + 0.0505, -0.0 - k * 0.025, 0.05, 0.002, 0.004, BLACK);
    rail(g, y + 0.055, 0.02, -0.12);
    metal(g);
    rod(g, [[0, y + 0.05, -0.16], [0, y + 0.1, -0.18], [0, y + 0.1, -0.3], [0, y + 0.05, -0.32]], 0.008, BLACK);
    tubeZ(g, 0, y, -0.28, -0.75, 0.016, GUN, 14);
    matte(g);
    g.box(0, y + 0.012, -0.45, 0.044, 0.024, 0.28, POLY2);
    for (let z = -0.33; z > -0.58; z -= 0.024) for (const s of [-1, 1]) g.box(s * 0.0222, y + 0.012, z, 0.0016, 0.012, 0.012, HOLE);
    metal(g); tubeZ(g, 0, y - 0.025, -0.28, -0.62, 0.008, GUN, 10);
    g.box(0, y + 0.03, -0.7, 0.008, 0.035, 0.012, GUN);
    brake(g, y, -0.75, -0.83, 0.022);
    // Ammo box on the left and the belt feeding up into the receiver.
    matte(g);
    g.box(-0.075, y - 0.05, -0.08, 0.075, 0.12, 0.13, OLIVE);
    g.box(-0.075, y + 0.012, -0.08, 0.079, 0.008, 0.134, OD2);
    for (let k = 0; k < 3; k++) g.box(-0.1135, y - 0.07 + k * 0.03, -0.08, 0.002, 0.01, 0.1, OD2);
    g.box(-0.075, y - 0.05, -0.0155, 0.04, 0.02, 0.003, CREAM);
    metal(g);
    for (let k = 0; k < 7; k++) {
      const t = k / 6, bx = -0.06 + t * 0.03, by = y + 0.02 + Math.sin(t * Math.PI * 0.5) * 0.02;
      g.tube([bx, by, -0.065 - k * 0.0], [bx, by, -0.12], 0.005, 0.0035, BRASS, 6);
      g.box(bx, by - 0.006, -0.09, 0.006, 0.004, 0.05, GUN);
    }
    matte(g);
    const ga = [0, 0.04, 0.12], gb = [0, -0.06, 0.145];
    bar(g, ga, gb, 0.034, 0.046, POLY);
    for (let i = 0; i < 3; i++) { const p = mix(ga, gb, 0.3 + i * 0.2); g.box(0, p[1], p[2] - 0.024, 0.03, 0.006, 0.004, POLY2); }
    guard(g, 0.06, 0.112, 0.045, 0.004, GUN);
    trigger(g, 0.09, 0.045);
    // Skeleton stock: top strut and lower strut joined at the butt, a cheek rest on top.
    bar(g, [0, y + 0.01, 0.12], [0, y + 0.0, 0.4], 0.042, 0.03, POLY2);
    bar(g, [0, y - 0.04, 0.12], [0, y - 0.075, 0.4], 0.04, 0.026, POLY2);
    bar(g, [0, y - 0.075, 0.38], [0, y + 0.0, 0.38], 0.042, 0.03, POLY2);
    bar(g, [0, y - 0.03, 0.16], [0, y - 0.0, 0.2], 0.03, 0.012, POLY2);
    g.box(0, y + 0.028, 0.3, 0.036, 0.016, 0.12, POLY);
    g.box(0, y - 0.03, 0.41, 0.05, 0.13, 0.016, RUBBER);
    tubeZ(g, 0, y - 0.04, -0.6, -0.63, 0.014, BLACK, 10);
    for (const s of [-1, 1]) {
      g.tube([s * 0.008, y - 0.045, -0.615], [s * 0.06, y - 0.21, -0.66], 0.007, 0.006, BLACK, 6);
      g.tube([s * 0.06, y - 0.21, -0.66], [s * 0.062, y - 0.225, -0.663], 0.01, 0.01, RUBBER, 6);
    }
    sling(g, 0, y - 0.11, 0.35);
    return [0, y, -0.831];
  },
  launcher(g) {
    // Revolving grenade launcher: six-chamber cylinder in a frame, ladder sight, folding stock.
    const y = 0.1;
    metal(g);
    tubeZ(g, 0, y, 0.03, -0.17, 0.07, OLIVE, 18);
    matte(g);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      tubeZ(g, Math.sin(a) * 0.044, y + Math.cos(a) * 0.044, -0.1705, -0.172, 0.019, HOLE, 10);
      const b = a + Math.PI / 6;
      bar(g, [Math.sin(b) * 0.0705, y + Math.cos(b) * 0.0705, 0.02], [Math.sin(b) * 0.0705, y + Math.cos(b) * 0.0705, -0.16], 0.01, 0.004, OD2);
    }
    metal(g);
    tubeZ(g, 0, y, -0.17, -0.18, 0.074, GUN, 18);
    tubeZ(g, 0, y, 0.03, 0.04, 0.074, GUN, 18);
    for (const s of [-1, 1]) g.box(s * 0.06, y + 0.06, -0.07, 0.012, 0.012, 0.25, GUN);
    tubeZ(g, 0, y + 0.002, -0.18, -0.46, 0.036, GUN, 14);
    matte(g);
    for (let z = -0.22; z > -0.42; z -= 0.035) for (const s of [-1, 1]) g.box(s * 0.0365, y + 0.002, z, 0.002, 0.03, 0.018, HOLE);
    tubeZ(g, 0, y + 0.002, -0.46, -0.47, 0.039, BLACK, 14);
    muzzleHole(g, y + 0.002, -0.47, 0.024);
    g.box(0, y + 0.08, -0.1, 0.022, 0.03, 0.03, BLACK);
    for (const s of [-1, 1]) g.box(s * 0.01, y + 0.105, -0.1, 0.003, 0.03, 0.02, BLACK);
    g.box(0, y + 0.04, -0.44, 0.006, 0.02, 0.008, ORANGE);
    const ga = [0, 0.03, 0.0], gb = [0, -0.07, 0.025];
    bar(g, ga, gb, 0.032, 0.046, POLY);
    guard(g, -0.06, -0.012, 0.035, -0.002, GUN);
    trigger(g, -0.03, 0.03);
    bar(g, [0, y - 0.04, -0.3], [0, y - 0.13, -0.29], 0.03, 0.034, POLY);
    metal(g);
    for (const s of [-1, 1]) rod(g, [[s * 0.025, y - 0.02, 0.04], [s * 0.025, y - 0.02, 0.28]], 0.006, GUN);
    matte(g);
    g.box(0, y - 0.03, 0.29, 0.06, 0.12, 0.02, RUBBER);
    g.box(0.0715, y, -0.07, 0.002, 0.02, 0.08, ORANGE);
    return [0, y + 0.002, -0.471];
  },
  rocket(g) {
    // Rocket launcher: launch tube with flared ends, warhead in the muzzle, optic, grips, shoulder pad.
    const y = 0.16;
    matte(g);
    tubeZ(g, 0, y, 0.5, -0.6, 0.055, OLIVE, 16);
    for (const z of [0.1, -0.3]) tubeZ(g, 0, y, z, z - 0.02, 0.058, OD2, 16);
    g.tube([0, y, 0.5], [0, y, 0.6], 0.055, 0.07, OD2, 16);
    tubeZ(g, 0, y, 0.6, 0.601, 0.066, HOLE, 16);
    g.tube([0, y, -0.6], [0, y, -0.64], 0.055, 0.066, OD2, 16);
    tubeZ(g, 0, y, -0.43, -0.47, 0.0565, ORANGE, 16);
    g.box(0, y + 0.054, -0.15, 0.06, 0.006, 0.08, CREAM);
    tubeZ(g, 0, y, -0.6, -0.66, 0.045, OLIVE, 14);
    g.tube([0, y, -0.66], [0, y, -0.76], 0.045, 0.006, OLIVE, 14);
    tubeZ(g, 0, y, -0.735, -0.765, 0.012, ORANGE, 10);
    const ga = [0, y - 0.05, 0.02], gb = [0, -0.04, 0.04];
    bar(g, ga, gb, 0.032, 0.046, POLY);
    g.box(0, y - 0.065, -0.02, 0.04, 0.03, 0.12, POLY);
    guard(g, -0.08, -0.015, y - 0.08, 0.02, BLACK);
    trigger(g, -0.045, y - 0.085);
    bar(g, [0, y - 0.055, -0.24], [0, -0.0, -0.23], 0.03, 0.036, POLY);
    g.box(0, y - 0.07, 0.25, 0.05, 0.03, 0.18, RUBBER);
    // Optic on the left: bracket, body, lenses, eyecup.
    g.box(-0.065, y + 0.02, -0.05, 0.02, 0.02, 0.05, BLACK);
    tubeZ(g, -0.085, y + 0.03, 0.06, -0.12, 0.018, BLACK, 12);
    tubeZ(g, -0.085, y + 0.03, 0.06, 0.09, 0.02, RUBBER, 12);
    metal(g); tubeZ(g, -0.085, y + 0.03, -0.1205, -0.1215, 0.015, LENS, 12);
    matte(g);
    sling(g, 0, y - 0.055, 0.4); sling(g, 0, y - 0.055, -0.5);
    return [0, y, -0.77];
  },
  minigun(g) {
    // Rotary gun: six barrels in clamps, rotor and motor housings, feed chute from the ammo box, spade grips.
    const y = 0.1;
    metal(g);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, x = Math.cos(a) * 0.035, by = y + Math.sin(a) * 0.035;
      tubeZ(g, x, by, -0.16, -0.85, 0.0095, GUN, 8);
      muzzleHole2(g, x, by, -0.85, 0.005);
    }
    tubeZ(g, 0, y, -0.18, -0.84, 0.012, BLACK, 8);
    for (const z of [-0.32, -0.58, -0.8]) tubeZ(g, 0, y, z, z - 0.025, 0.05, STEEL, 16);
    tubeZ(g, 0, y, -0.02, -0.18, 0.062, BRUSH, 18);
    matte(g);
    for (let k = 0; k < 8; k++) tubeZ(g, 0, y, -0.03 - k * 0.018, -0.036 - k * 0.018, 0.064, GUN, 18);
    metal(g);
    g.box(0, y, 0.07, 0.12, 0.13, 0.18, GUN);
    matte(g);
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) g.box(s * 0.0605, y + 0.01, 0.02 + k * 0.022, 0.002, 0.08, 0.008, HOLE);
    g.box(0.04, y + 0.0, 0.15, 0.05, 0.07, 0.05, OD2);
    // Ammo box on the right, with the chute arching into the housing.
    g.box(0.15, y - 0.05, 0.05, 0.11, 0.17, 0.2, OLIVE);
    g.box(0.15, y + 0.04, 0.05, 0.115, 0.012, 0.205, OD2);
    g.box(0.2065, y - 0.05, 0.05, 0.002, 0.04, 0.08, CREAM);
    const chute = [0, 1, 2, 3, 4, 5].map((k) => { const t = k / 5; return [0.13 - t * 0.07, y + 0.045 + Math.sin(t * Math.PI) * 0.05, 0.0 - t * 0.04]; });
    for (let k = 0; k < chute.length - 1; k++) bar(g, chute[k], chute[k + 1], 0.04, 0.03, BLACK);
    metal(g);
    for (let k = 0; k < 5; k++) g.box(chute[k][0], chute[k][1] + 0.016, chute[k][2], 0.008, 0.005, 0.03, BRASS);
    matte(g);
    rod(g, [[0, y + 0.065, 0.12], [0, y + 0.12, 0.08], [0, y + 0.12, -0.08], [0, y + 0.065, -0.12]], 0.01, BLACK);
    for (const s of [-1, 1]) rod(g, [[s * 0.05, y - 0.02, 0.16], [s * 0.05, y - 0.02, 0.24], [s * 0.05, y - 0.12, 0.24]], 0.011, RUBBER, 6);
    rod(g, [[-0.05, y - 0.12, 0.24], [0.05, y - 0.12, 0.24]], 0.009, GUN);
    g.box(0, y - 0.03, 0.245, 0.03, 0.02, 0.02, ORANGE);
    bar(g, [0, y - 0.06, -0.3], [0, y - 0.14, -0.3], 0.03, 0.03, POLY);
    rod(g, [[0, y - 0.065, -0.24], [0, y - 0.065, -0.32]], 0.008, BLACK);
    return [0, y, -0.851];
  },
  grenade(g) {
    // Fragmentation grenade: ribbed body, fuze, spoon along the side, pin and ring.
    matte(g);
    g.blob(0, 0.03, 0, 0.032, 0.043, 0.032, OLIVE, 2);
    // Grooves that follow the body's curve: four rings round it and eight ribs over it.
    const rad = (yy) => 0.032 * Math.sqrt(Math.max(0.02, 1 - ((yy - 0.03) / 0.043) ** 2)) + 0.0006;
    for (let k = 0; k < 4; k++) {
      const yy = 0.006 + k * 0.016, r = rad(yy);
      g.tube([0, yy, 0], [0, yy + 0.002, 0], r, r, OD2, 12);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const pts = [-0.006, 0.006, 0.018, 0.03, 0.042, 0.054, 0.064].map((yy) => [c * rad(yy), yy, sn * rad(yy)]);
      for (let i = 0; i < pts.length - 1; i++) bar(g, pts[i], pts[i + 1], 0.003, 0.0025, OD2);
    }
    tubeZ(g, 0, 0.034, 0.031, 0.034, 0.008, ORANGE, 8);
    metal(g);
    g.tube([0, 0.07, 0], [0, 0.095, 0], 0.013, 0.012, STEEL, 10);
    bar(g, [0.006, 0.098, 0.004], [0.012, 0.092, 0.024], 0.016, 0.003, BRUSH);
    bar(g, [0.012, 0.092, 0.024], [0.01, 0.03, 0.034], 0.014, 0.003, BRUSH);
    g.tube([-0.004, 0.088, 0], [-0.02, 0.088, 0], 0.0016, 0.0016, STEEL, 4);
    const ring = Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return [-0.032 + Math.cos(a) * 0.012, 0.088 + Math.sin(a) * 0.012, 0]; });
    rod(g, ring, 0.0016, STEEL, 4);
    matte(g);
    return null;
  },
  // Silent Deploy: the compact pistol with a sand slide, a threaded barrel, a long can and a low red dot.
  silentdeploy(g, w) {
    const m = BUILD.pistol(g, w);
    const [, y, zm] = m;
    // A sand cover plate on the front of the slide, so it reads apart from the Hotfix.
    matte(g);
    g.box(0, y + 0.0172, -0.1, 0.0255, 0.0016, 0.08, SAND);
    for (const s of [-1, 1]) g.box(s * 0.0154, y + 0.004, -0.085, 0.0012, 0.012, 0.06, SAND2);
    // Thread protector and adaptor.
    metal(g);
    tubeZ(g, 0, y, zm + 0.002, zm - 0.012, 0.0072, STEEL, 12);
    for (let k = 0; k < 4; k++) tubeZ(g, 0, y, zm - 0.001 - k * 0.003, zm - 0.0025 - k * 0.003, 0.0078, BRUSH, 12);
    // The suppressor: a tube with a knurled grip band, a rear cap, a front cap with its bore.
    const z0 = zm - 0.012, z1 = z0 - 0.165, r = 0.0172;
    g.tube([0, y, z0], [0, y, z0 - 0.01], 0.008, r, GUN, 16);
    tubeZ(g, 0, y, z0 - 0.01, z1 + 0.012, r, GUN, 16);
    matte(g);
    for (let k = 0; k < 14; k++) tubeZ(g, 0, y, z0 - 0.03 - k * 0.0034, z0 - 0.0315 - k * 0.0034, r + 0.0009, BLACK, 16);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; bar(g, [Math.sin(a) * (r + 0.0006), y + Math.cos(a) * (r + 0.0006), z0 - 0.1], [Math.sin(a) * (r + 0.0006), y + Math.cos(a) * (r + 0.0006), z1 + 0.02], 0.0024, 0.0012, POLY2); }
    tubeZ(g, 0, y, z0 - 0.112, z0 - 0.118, r + 0.0012, ORANGE, 16);
    metal(g);
    g.tube([0, y, z1 + 0.012], [0, y, z1], r, r * 0.86, GUN, 16);
    matte(g);
    tubeZ(g, 0, y, z1 + 0.0005, z1 - 0.0008, 0.0055, HOLE, 10);
    // A low-mounted micro red dot on the slide, so the can doesn't block the irons.
    g.box(0, y + 0.0215, -0.03, 0.018, 0.006, 0.026, BLACK);
    g.box(0, y + 0.031, -0.03, 0.02, 0.014, 0.024, BLACK);
    metal(g); g.box(0, y + 0.032, -0.0425, 0.016, 0.01, 0.0008, LENS);
    glow(g); g.box(0, y + 0.033, -0.035, 0.0022, 0.0022, 0.0008, DOT);
    matte(g);
    return [0, y, z1 - 0.001];
  },

  // Kill Switch: a stubby emitter barrel wound with coils, a capacitor bank on top, an emitter dish at
  // the front that glows when charged, a battery pack in the stock.
  killswitch(g) {
    const y = 0.1;
    // Receiver.
    metal(g);
    cham(g, 0, y, -0.06, 0.07, 0.08, 0.26, 0.012, GUN);
    matte(g);
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) g.box(s * 0.0352, y - 0.01, -0.13 + k * 0.024, 0.0016, 0.03, 0.012, HOLE);
    g.box(0.0356, y + 0.012, -0.06, 0.0012, 0.006, 0.2, ORANGE);
    // Barrel: a dark core wound with copper coils, held in three collars.
    metal(g);
    tubeZ(g, 0, y + 0.004, -0.19, -0.48, 0.024, BLUED, 14);
    const COPPER = C(0xb4693a);
    for (let k = 0; k < 18; k++) tubeZ(g, 0, y + 0.004, -0.215 - k * 0.0135, -0.2235 - k * 0.0135, 0.031, COPPER, 14);
    for (const z of [-0.2, -0.34, -0.47]) tubeZ(g, 0, y + 0.004, z + 0.008, z - 0.008, 0.036, GUN, 14);
    matte(g);
    for (const z of [-0.2, -0.34, -0.47]) for (const s of [-1, 1]) g.box(s * 0.036, y + 0.004, z, 0.004, 0.012, 0.01, BLACK);
    // Emitter dish: a bell flaring out to a ring of glowing segments round the bore.
    metal(g);
    g.tube([0, y + 0.004, -0.48], [0, y + 0.004, -0.53], 0.028, 0.058, GUN, 18);
    tubeZ(g, 0, y + 0.004, -0.53, -0.538, 0.06, GUN, 18);
    matte(g);
    tubeZ(g, 0, y + 0.004, -0.5375, -0.539, 0.05, HOLE, 18);
    glow(g);
    const CYAN = C(0x3fd0c9);
    for (let k = 0; k < 10; k++) { const a0 = (k / 10) * Math.PI * 2 + 0.08, a1 = ((k + 1) / 10) * Math.PI * 2 - 0.08; bar(g, [Math.sin(a0) * 0.044, y + 0.004 + Math.cos(a0) * 0.044, -0.5392], [Math.sin(a1) * 0.044, y + 0.004 + Math.cos(a1) * 0.044, -0.5392], 0.006, 0.002, CYAN); }
    tubeZ(g, 0, y + 0.004, -0.539, -0.5395, 0.012, CYAN, 12);
    // Capacitor bank on top: three cans in a cage, charge lamps along the side.
    matte(g);
    g.box(0, y + 0.045, -0.12, 0.05, 0.01, 0.17, BLACK);
    metal(g);
    for (let k = 0; k < 3; k++) tubeZ(g, 0, y + 0.068, -0.05 - k * 0.055, -0.095 - k * 0.055, 0.019, k === 1 ? POLY2 : STEEL, 12);
    matte(g);
    for (const s of [-1, 1]) rod(g, [[s * 0.024, y + 0.05, -0.035], [s * 0.024, y + 0.095, -0.05], [s * 0.024, y + 0.095, -0.2], [s * 0.024, y + 0.05, -0.215]], 0.0025, BLACK, 4);
    rod(g, [[0, y + 0.088, -0.205], [0, y + 0.07, -0.24], [0, y + 0.03, -0.26]], 0.004, RED, 5);
    glow(g); for (let k = 0; k < 4; k++) g.box(-0.0362, y + 0.02, -0.02 - k * 0.012, 0.0012, 0.005, 0.007, k < 3 ? CYAN : DOT);
    matte(g);
    // Rear sight and a ghost-ring front.
    g.box(0, y + 0.1, -0.02, 0.012, 0.012, 0.012, BLACK);
    g.tube([0, y + 0.1, -0.235], [0, y + 0.1, -0.24], 0.008, 0.008, BLACK, 10);
    // Grip, guard, trigger, a vertical foregrip.
    const ga = [0, y - 0.04, 0.0], gb = [0, y - 0.15, 0.025];
    bar(g, ga, gb, 0.032, 0.046, POLY);
    for (let i = 0; i < 8; i++) { const p = mix(ga, gb, 0.2 + i * 0.09); for (const s of [-1, 1]) g.box(s * 0.0162, p[1], p[2], 0.0006, 0.002, 0.034, POLY2); }
    guard(g, -0.06, -0.008, y - 0.04, y - 0.088, GUN);
    trigger(g, -0.03, y - 0.045);
    bar(g, [0, y - 0.04, -0.27], [0, y - 0.15, -0.26], 0.03, 0.034, POLY);
    for (let k = 0; k < 4; k++) bar(g, [0, y - 0.06 - k * 0.022, -0.288], [0, y - 0.07 - k * 0.022, -0.288], 0.031, 0.004, POLY2);
    // Stock with the battery pack: a box with a gauge and a heavy cable to the receiver.
    metal(g);
    for (const s of [-1, 1]) rod(g, [[s * 0.022, y - 0.01, 0.07], [s * 0.022, y - 0.02, 0.27]], 0.006, GUN);
    matte(g);
    g.box(0, y - 0.03, 0.17, 0.06, 0.07, 0.11, OLIVE);
    for (let k = 0; k < 3; k++) g.box(0, y + 0.006, 0.13 + k * 0.03, 0.062, 0.004, 0.006, OD2);
    glow(g); g.box(0.031, y - 0.02, 0.17, 0.0012, 0.02, 0.04, CYAN); matte(g);
    g.box(0, y - 0.04, 0.285, 0.06, 0.12, 0.02, RUBBER);
    rod(g, [[0.03, y - 0.04, 0.12], [0.045, y - 0.07, 0.06], [0.04, y - 0.05, -0.02], [0.036, y - 0.02, -0.06]], 0.005, BLACK, 5);
    return [0, y + 0.004, -0.54];
  },

  // Sticky Note: a block of charge wrapped in orange tape on an adhesive pad, a detonator clipped to it
  // with a stub antenna and a blinking arm lamp.
  stickynote(g) {
    matte(g);
    g.box(0, 0.025, 0, 0.07, 0.04, 0.11, SAND);
    for (const z of [-0.035, 0.035]) g.box(0, 0.025, z, 0.0715, 0.0415, 0.014, ORANGE);
    g.box(0, 0.0035, 0, 0.074, 0.004, 0.114, C(0xffc667));
    // Detonator.
    g.box(0, 0.056, 0.008, 0.044, 0.022, 0.05, BLACK);
    for (const s of [-1, 1]) g.box(s * 0.0225, 0.056, 0.008, 0.002, 0.012, 0.03, POLY2);
    g.box(0, 0.0675, 0.02, 0.016, 0.002, 0.012, POLY2);
    metal(g);
    g.tube([0.014, 0.067, -0.01], [0.014, 0.12, -0.016], 0.0018, 0.0012, STEEL, 5);
    g.tube([0.014, 0.12, -0.016], [0.014, 0.124, -0.0165], 0.0028, 0.0028, BLACK, 6);
    for (const x of [-0.012, 0.0]) rod(g, [[x, 0.05, -0.017], [x, 0.045, -0.03], [x, 0.04, -0.04]], 0.0016, x ? RED : C(0x2f757c), 4);
    glow(g); g.box(-0.012, 0.0685, -0.004, 0.006, 0.002, 0.006, DOT);
    matte(g);
    return null;
  },
};
function muzzleHole2(g, x, y, z, r) { g.e.cdata = [0, 0]; tubeZ(g, x, y, z + 0.001, z - 0.0005, r, HOLE, 8); g.e.cdata = [1, 0]; }

const cache = new Map(), muzzles = new Map();
// Geometry for a weapon (PROP material, cdata attribute), cached.
export function weaponGeometry(id) {
  if (cache.has(id)) return cache.get(id);
  const w = WEAPON[id];
  const g = new Geo({ cdata: 2 });
  g.e.cdata = [0, 0];
  const make = BUILD[id] || BUILD[w.cls === "pistol" ? "pistol" : w.cls];
  const m = make ? make(g, w) : null;
  if (m) muzzles.set(id, m);
  const geo = g.count ? g.build() : null;
  cache.set(id, geo);
  return geo;
}

// Where the muzzle is in the model's frame: the front of the barrel as built.
export function muzzleOf(w) {
  if (!muzzles.has(w.id)) weaponGeometry(w.id);
  return muzzles.get(w.id) || [0, 0.08, -0.2];
}

export const fmtMoney = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
