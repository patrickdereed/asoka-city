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
  { id: "harddelete", name: "Hard Delete", kind: "Rocket launcher", cls: "rocket", slot: 7, price: 32000, dmg: 260, rate: 0.6, mag: 1, ammo: 12, ammoPack: 3, ammoPrice: 600, range: 300, reload: 2.8, long: true, proj: "rocket" },
  { id: "dataloader", name: "Data Loader", kind: "Rotary minigun", cls: "minigun", slot: 7, price: 60000, dmg: 26, rate: 30, auto: true, mag: 500, ammo: 1500, ammoPack: 500, ammoPrice: 900, spread: 0.045, range: 150, reload: 5, long: true, spin: true },

  { id: "mergeconflict", name: "Merge Conflict", kind: "Fragmentation grenade", cls: "grenade", slot: 8, price: 0, dmg: 180, rate: 1, mag: 1, ammo: 20, ammoPack: 5, ammoPrice: 500, range: 40, reload: 0.6, proj: "grenade", throw: true },
];
export const WEAPON = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const ARMOUR = { name: "Body armour", price: 500, amount: 100 };
export const CATEGORIES = [
  ["Melee", [1]], ["Pistols", [2]], ["SMGs", [3]], ["Shotguns", [4]], ["Rifles", [5, 6]], ["Heavy", [7]], ["Explosives", [8]],
];

const C = (h) => hex(h);
const GUN = C(0x2b2f31), POLY = C(0x3d4a4c), STEEL = C(0x8d969a), WOOD = C(0x8a6a4c), DARKW = C(0x5a4636);
const ORANGE = C(0xff6018), OLIVE = C(0x5d6b4a), SAND = C(0xa7957d), BLACK = C(0x1a1d1e), CREAM = C(0xefe3d2);

function tubeZ(g, x, y, z0, z1, r, col, n = 8) { g.tube([x, y, z0], [x, y, z1], r, r, col, n); }

const BUILD = {
  fists() { return null; },
  bat(g) {
    g.tube([0, 0, 0.12], [0, 0, -0.12], 0.018, 0.02, BLACK, 8);
    g.tube([0, 0, -0.12], [0, 0, -0.45], 0.02, 0.032, WOOD, 8);
    g.tube([0, 0, -0.45], [0, 0, -0.82], 0.032, 0.036, WOOD, 8);
    g.tube([0, 0, -0.82], [0, 0, -0.84], 0.036, 0.02, WOOD, 8);
    g.tube([0, 0, 0.12], [0, 0, 0.14], 0.03, 0.03, ORANGE, 8);
  },
  blade(g) {
    g.box(0, 0, 0.02, 0.03, 0.035, 0.13, BLACK);
    g.box(0, 0, -0.06, 0.05, 0.05, 0.02, STEEL);
    g.box(0, 0.01, -0.33, 0.008, 0.06, 0.52, STEEL);
    g.box(0, 0.03, -0.6, 0.008, 0.035, 0.04, STEEL);
  },
  pistol(g, w) {
    const L = w.id === "burstmode" ? 0.22 : 0.19;
    g.box(0, 0.075, -0.06, 0.032, 0.04, L, w.id === "burstmode" ? POLY : GUN);
    g.box(0, 0.045, -0.05, 0.03, 0.025, L * 0.8, POLY);
    g.box(0, -0.01, 0.01, 0.03, 0.11, 0.045, POLY);
    g.box(0, 0.03, -0.035, 0.008, 0.03, 0.03, GUN);
    if (w.id === "burstmode") { g.box(0, -0.09, 0.005, 0.026, 0.08, 0.035, GUN); g.box(0, 0.06, -0.19, 0.02, 0.03, 0.05, GUN); }
    g.box(0, 0.097, -0.06 - L / 2 + 0.01, 0.034, 0.006, 0.014, ORANGE);
  },
  revolver(g) {
    tubeZ(g, 0, 0.08, -0.02, -0.24, 0.014, STEEL);
    g.box(0, 0.095, -0.13, 0.012, 0.012, 0.21, STEEL);
    g.tube([0, 0.065, 0.02], [0, 0.065, -0.04], 0.03, 0.03, STEEL, 6);
    g.box(0, 0.07, 0.03, 0.026, 0.05, 0.05, STEEL);
    g.box(0, -0.02, 0.04, 0.03, 0.11, 0.045, DARKW);
  },
  smg(g, w) {
    const big = w.id === "asyncqueue";
    g.box(0, 0.07, -0.08, 0.045, 0.07, big ? 0.32 : 0.22, big ? SAND : GUN);
    tubeZ(g, 0, 0.08, -0.08 - (big ? 0.16 : 0.11), -0.08 - (big ? 0.3 : 0.2), 0.012, GUN);
    g.box(0, -0.01, 0.0, 0.03, 0.1, 0.04, POLY);
    g.box(0, -0.04, -0.08, 0.028, big ? 0.15 : 0.18, 0.035, GUN);
    if (big) { g.box(0, 0.075, 0.15, 0.03, 0.06, 0.16, POLY); g.box(0, 0.13, -0.1, 0.02, 0.025, 0.1, BLACK); g.box(0, 0.02, -0.18, 0.025, 0.06, 0.03, POLY); }
    else g.box(0, 0.09, 0.08, 0.02, 0.02, 0.12, STEEL);
  },
  shotgun(g, w) {
    if (w.id === "quickfix") {
      for (const x of [-0.013, 0.013]) tubeZ(g, x, 0.07, -0.02, -0.38, 0.013, STEEL);
      g.box(0, 0.06, -0.08, 0.05, 0.035, 0.14, WOOD);
      g.box(0, 0.02, 0.06, 0.04, 0.09, 0.14, DARKW);
      return;
    }
    const auto = w.id === "massupdate";
    tubeZ(g, 0, 0.085, -0.05, -0.62, 0.014, auto ? GUN : STEEL);
    tubeZ(g, 0, 0.055, -0.05, -0.52, 0.013, GUN);
    g.box(0, 0.07, -0.04, 0.045, 0.07, 0.2, auto ? GUN : GUN);
    g.box(0, 0.055, -0.33, 0.045, 0.04, 0.15, auto ? POLY : WOOD);
    g.box(0, -0.01, 0.02, 0.032, 0.09, 0.04, auto ? POLY : DARKW);
    g.box(0, 0.05, 0.22, 0.04, 0.08, 0.3, auto ? POLY : WOOD);
    if (auto) g.box(0, -0.03, -0.06, 0.04, 0.12, 0.09, GUN);
  },
  rifle(g, w) {
    const br = w.id === "governor";
    const body = br ? OLIVE : GUN;
    g.box(0, 0.075, -0.06, 0.045, 0.075, 0.36, body);
    tubeZ(g, 0, 0.085, -0.24, -0.5, 0.017, POLY);
    tubeZ(g, 0, 0.09, -0.5, -0.66, 0.009, GUN);
    g.box(0, 0.135, -0.04, 0.025, 0.025, 0.2, BLACK);
    g.box(0, -0.01, 0.02, 0.03, 0.1, 0.04, POLY);
    g.box(0, -0.05, -0.12, 0.03, br ? 0.12 : 0.16, 0.05, br ? GUN : SAND);
    g.box(0, 0.06, 0.22, 0.04, 0.08, 0.26, POLY);
    g.box(0, 0.085, -0.66, 0.012, 0.03, 0.012, ORANGE);
  },
  sniper(g, w) {
    const marks = w.id === "fieldaudit";
    g.box(0, 0.07, -0.05, 0.05, 0.07, 0.32, marks ? SAND : GUN);
    tubeZ(g, 0, 0.08, -0.2, -0.95, 0.012, GUN);
    tubeZ(g, 0, 0.08, -0.95, -1.02, 0.02, GUN);
    tubeZ(g, 0, 0.16, 0.06, -0.24, 0.022, BLACK);
    tubeZ(g, 0, 0.16, -0.24, -0.29, 0.03, BLACK);
    g.box(0, 0.12, -0.08, 0.016, 0.05, 0.03, BLACK);
    g.box(0, -0.01, 0.02, 0.032, 0.1, 0.04, marks ? POLY : WOOD);
    g.box(0, 0.05, 0.25, 0.045, 0.1, 0.32, marks ? POLY : WOOD);
    if (marks) g.box(0, -0.04, -0.12, 0.03, 0.1, 0.05, GUN);
    for (const x of [-0.03, 0.03]) g.tube([0, 0.05, -0.55], [x, -0.12, -0.6], 0.006, 0.006, GUN, 4);
  },
  lmg(g) {
    g.box(0, 0.08, -0.08, 0.06, 0.1, 0.42, GUN);
    tubeZ(g, 0, 0.09, -0.29, -0.75, 0.02, GUN);
    tubeZ(g, 0, 0.09, -0.75, -0.82, 0.026, BLACK);
    g.box(0.06, 0.02, -0.08, 0.07, 0.12, 0.12, OLIVE);
    g.box(0, 0.16, -0.12, 0.02, 0.04, 0.16, GUN);
    g.box(0, -0.01, 0.02, 0.034, 0.1, 0.045, POLY);
    g.box(0, 0.07, 0.25, 0.05, 0.1, 0.28, POLY);
    for (const x of [-0.04, 0.04]) g.tube([0, 0.06, -0.62], [x, -0.14, -0.66], 0.008, 0.008, GUN, 4);
  },
  launcher(g) {
    g.tube([0, 0.1, 0.02], [0, 0.1, -0.16], 0.07, 0.07, OLIVE, 8);
    tubeZ(g, 0, 0.1, -0.16, -0.46, 0.035, GUN);
    g.box(0, 0.02, 0.0, 0.035, 0.1, 0.045, POLY);
    g.box(0, 0.03, -0.3, 0.03, 0.08, 0.04, POLY);
    g.box(0, 0.1, 0.24, 0.045, 0.08, 0.3, POLY);
    g.box(0, 0.17, -0.1, 0.02, 0.03, 0.08, ORANGE);
  },
  rocket(g) {
    tubeZ(g, 0, 0.16, 0.55, -0.62, 0.055, OLIVE, 10);
    tubeZ(g, 0, 0.16, -0.62, -0.7, 0.068, GUN, 10);
    tubeZ(g, 0, 0.16, 0.55, 0.6, 0.068, GUN, 10);
    g.box(0, 0.02, 0.0, 0.035, 0.12, 0.045, POLY);
    g.box(0, 0.04, -0.22, 0.03, 0.11, 0.04, POLY);
    g.box(-0.07, 0.2, -0.05, 0.03, 0.05, 0.14, BLACK);
    g.tube([0, 0.16, -0.7], [0, 0.16, -0.78], 0.03, 0.005, ORANGE, 8);
  },
  minigun(g) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      tubeZ(g, Math.cos(a) * 0.035, 0.1 + Math.sin(a) * 0.035, -0.18, -0.85, 0.01, GUN, 5);
    }
    tubeZ(g, 0, 0.1, -0.3, -0.34, 0.06, STEEL, 8);
    tubeZ(g, 0, 0.1, -0.75, -0.79, 0.055, STEEL, 8);
    g.box(0, 0.1, -0.05, 0.12, 0.13, 0.28, GUN);
    g.box(0.1, 0.04, -0.02, 0.1, 0.16, 0.18, OLIVE);
    g.box(0, 0.22, -0.08, 0.03, 0.06, 0.2, BLACK);
    g.box(0, 0.0, 0.08, 0.035, 0.12, 0.05, POLY);
  },
  grenade(g) {
    g.blob(0, 0.03, 0, 0.034, 0.045, 0.034, OLIVE, 2);
    g.box(0, 0.085, 0, 0.022, 0.03, 0.022, STEEL);
    g.box(0.015, 0.08, 0.02, 0.006, 0.05, 0.016, STEEL);
    g.tube([-0.02, 0.1, 0], [-0.03, 0.11, 0], 0.012, 0.012, ORANGE, 6);
  },
};

const cache = new Map();
// Geometry for a weapon (PROP material, cdata attribute), cached.
export function weaponGeometry(id) {
  if (cache.has(id)) return cache.get(id);
  const w = WEAPON[id];
  const g = new Geo({ cdata: 2 });
  g.e.cdata = [0, 0];
  const make = BUILD[w.cls === "pistol" ? "pistol" : w.cls];
  if (make) make(g, w);
  const geo = g.count ? g.build() : null;
  cache.set(id, geo);
  return geo;
}

// Where the muzzle is in the model's frame.
export function muzzleOf(w) {
  const L = { pistol: 0.17, revolver: 0.25, smg: 0.32, shotgun: 0.6, rifle: 0.67, sniper: 1.03, lmg: 0.83, launcher: 0.47, rocket: 0.72, minigun: 0.86 }[w.cls] || 0.2;
  const y = { rocket: 0.16, minigun: 0.1, launcher: 0.1 }[w.cls] || 0.08;
  return [0, y, -L];
}

export const fmtMoney = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
