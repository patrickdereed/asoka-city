// Mission people, cars and pickups: the Legacy Crew and Brittle security who fight, the Audit's officers,
// allies who follow you and VIPs who ride with you, and cars that drive themselves round the road network
// (fleeing, chasing, racing, driving a route) with crews that get out and fight. People live in the
// crowd (so the crowd's hit tests, falls and drops apply) with `actor` set; cars live in the traffic list
// with `ai` set. missions.js and audit.js decide what to spawn.
import * as THREE from "./three.module.min.js";
import { Person, PEOPLE } from "./people.js";
import { Arsenal } from "./arsenal.js";
import { WEAPON } from "./weapons.js";
import { sat } from "./vehicle.js";
import { Geo } from "./geo.js";
import { ROAD_LIFT, HALF, CHUNK, NCH } from "./map.js";
import { clamp, lerp, angleWrap, hex, rng } from "./util.js";

export const HOSTILE = new Set(["legacy", "brittle", "audit"]);
const FRIENDLY = new Set(["ally", "vip"]);

const LOOKS = {
  legacy: ["Male_Adult_01", "Male_Adult_03", "Male_Adult_05", "Male_Adult_06", "Male_Adult_08", "Male_Adult_10", "Female_Adult_03", "Female_Adult_07"],
  brittle: ["Business_Male_01", "Business_Male_02", "Business_Male_03", "Business_Male_04", "Business_Male_06", "Business_Male_07", "Business_Female_02"],
  audit: ["Business_Male_03", "Business_Female_04", "Male_Adult_04", "Female_Adult_09", "Business_Male_06"],
  ally: ["Male_Adult_02", "Female_Adult_01", "Male_Adult_09", "Female_Adult_10"],
  vip: PEOPLE.map((p) => p.id),
  civil: PEOPLE.map((p) => p.id),
};
// How far each kind of gun likes to fight from.
const RANGE = { fists: 1.2, bat: 1.5, blade: 1.5, pistol: 14, revolver: 16, smg: 12, shotgun: 8, rifle: 24, sniper: 45, lmg: 22, minigun: 18, launcher: 30, rocket: 40, grenade: 18 };
const SPEED = { park: 0, cruise: 13, route: 14, convoy: 11, flee: 23, chase: 24, race: 27 };

const tmp = {};
const v3 = () => new THREE.Vector3();

// ------------------------------------------------------------------------------- road routing

const edgeLen = (e) => e.s[e.s.length - 1];

// The closest point on a main road, measured to the road itself (World.nearestRoad measures to the nearest
// polyline vertex, which on a long straight street can be a hundred metres off). { e, s, d } or null.
export function snapRoad(w, x, z) {
  const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
  let best = null, bd = Infinity;
  for (let R = 1; R <= 3 && (!best || bd > R * CHUNK * 0.5); R++) {
    for (let k = cz - R; k <= cz + R; k++) for (let c = cx - R; c <= cx + R; c++) {
      if (c < 0 || k < 0 || c >= NCH || k >= NCH || (Math.abs(c - cx) < R && Math.abs(k - cz) < R && R > 1)) continue;
      for (const { e, i } of w.chunkSegs[c + k * NCH]) {
        if (!e.main) continue;
        const p = e.rib[i], q = e.rib[i + 1];
        const dx = q.x - p.x, dz = q.z - p.z, L2 = dx * dx + dz * dz || 1;
        const t = clamp(((x - p.x) * dx + (z - p.z) * dz) / L2, 0, 1);
        const d = Math.hypot(p.x + dx * t - x, p.z + dz * t - z);
        if (d < bd) { bd = d; best = { e, s: lerp(p.s, q.s, t), d }; }
      }
    }
  }
  return best;
}

// The way along main roads from one point to another: A* over the junctions, then points every 5 m
// down the right-hand lane.
export function planRoute(world, from, to) {
  const a = snapRoad(world, from.x, from.z), b = snapRoad(world, to.x, to.z);
  if (!a || !b) return [{ x: to.x, z: to.z }];
  const pts = [];
  const lane = (e, s, dir) => { const off = e.laneOff[0]; world.edgePoint(e, clamp(s, e.sA, e.sB), dir > 0 ? off : -off, tmp); pts.push({ x: tmp.x, z: tmp.z }); };
  const run = (e, s0, s1) => {
    const dir = s1 >= s0 ? 1 : -1, n = Math.max(1, Math.ceil(Math.abs(s1 - s0) / 5));
    for (let k = 0; k <= n; k++) lane(e, s0 + ((s1 - s0) * k) / n, dir);
  };
  if (a.e === b.e) { run(a.e, a.s, b.s); return pts; }
  const g = new Map(), prev = new Map(), open = [];
  const push = (n, cost, from, e) => {
    if (g.has(n) && g.get(n) <= cost) return;
    g.set(n, cost); prev.set(n, { from, e });
    open.push({ n, f: cost + Math.hypot(n.x - to.x, n.z - to.z) });
  };
  push(a.e.a, a.s, null, a.e);
  push(a.e.b, edgeLen(a.e) - a.s, null, a.e);
  const done = new Set();
  let goal = null, guard = 0;
  while (open.length && guard++ < 6000) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { n } = open.splice(bi, 1)[0];
    if (done.has(n)) continue;
    done.add(n);
    if (n === b.e.a || n === b.e.b) { goal = n; break; }
    for (const e of n.edges) {
      if (!e.main) continue;
      const o = e.a === n ? e.b : e.a;
      if (!done.has(o)) push(o, g.get(n) + edgeLen(e), n, e);
    }
  }
  if (!goal) { run(a.e, a.s, a.s); pts.push({ x: to.x, z: to.z }); return pts; }
  const chain = [];
  for (let n = goal; n; ) { const p = prev.get(n); chain.unshift({ n, e: p.e }); n = p.from; }
  // First leg: along the start edge to the first junction.
  const first = chain[0];
  run(a.e, a.s, first.n === a.e.a ? 0 : edgeLen(a.e));
  for (let k = 1; k < chain.length; k++) {
    const { n, e } = chain[k], from = chain[k - 1].n;
    run(e, from === e.a ? 0 : edgeLen(e), n === e.a ? 0 : edgeLen(e));
  }
  run(b.e, goal === b.e.a ? 0 : edgeLen(b.e), b.s);
  return pts;
}

// --------------------------------------------------------------------------------- pickups

const ITEM_COL = { case: [0.16, 0.17, 0.18], package: [0.72, 0.56, 0.36], drive: [0.24, 0.27, 0.3], bug: [0.36, 0.78, 0.36], cash: [0.38, 0.62, 0.38] };
function itemGeometry(kind) {
  const g = new Geo({ cdata: 2 });
  g.e.cdata = [0, 0];
  const c = ITEM_COL[kind] || ITEM_COL.package;
  if (kind === "case") {
    g.box(0, 0.2, 0, 0.46, 0.34, 0.12, c, 0, 0, 0, 0);
    g.box(0, 0.4, 0, 0.16, 0.05, 0.03, [0.08, 0.08, 0.08], 0, 0, 0, 0);
    g.box(0, 0.2, 0.065, 0.42, 0.02, 0.01, [0.7, 0.66, 0.5], 0, 0, 0, 0);
  } else if (kind === "drive") {
    g.box(0, 0.08, 0, 0.3, 0.12, 0.22, c, 0, 0, 0, 0);
    g.box(0.1, 0.15, 0.09, 0.05, 0.02, 0.02, [1, 0.38, 0.1], 0, 0, 0, 0);
  } else if (kind === "bug") {
    g.box(0, 0.12, 0, 0.18, 0.1, 0.26, c, 0, 0, 0, 0);
    g.box(0, 0.12, -0.16, 0.12, 0.08, 0.08, [0.1, 0.12, 0.1], 0, 0, 0, 0);
    for (const s of [-1, 1]) for (const z of [-0.08, 0, 0.08]) g.box(s * 0.13, 0.06, z, 0.1, 0.02, 0.02, [0.1, 0.12, 0.1], 0, 0, 0, 0);
  } else if (kind === "cash") {
    for (let k = 0; k < 3; k++) g.box(0, 0.03 + k * 0.05, 0, 0.32, 0.045, 0.16, c, 0, 0, 0, 0);
  } else {
    g.box(0, 0.2, 0, 0.5, 0.4, 0.4, c, 0, 0, 0, 0);
    g.box(0, 0.401, 0, 0.08, 0.005, 0.41, [0.86, 0.8, 0.64], 0, 0, 0, 0);
  }
  return g.build();
}

// ------------------------------------------------------------------------------------ actors

export class Actors {
  constructor({ world, scene, U, mats, crowd, traffic, combat, audio, kits, ownStart }) {
    Object.assign(this, { w: world, scene, U, mats, crowd, traffic, combat, audio, kits });
    this.ownStart = ownStart;   // kits from this index on are drawn as their own meshes (the fleet)
    this.people = [];           // actor crowd entries
    this.cars = [];             // ai traffic entries
    this.items = [];
    this.r = rng(4242);
    this.t = 0;
    this.carried = new Set();   // item tags the player is carrying
    this.riders = [];           // people in the player's car
    this.itemGeo = {};
    this.itemMat = mats.prop.clone();
    this.itemMat.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 0.6 }, uLivery: { value: null }, uUseLivery: { value: 0 } };
    this.onLost = null;         // (entry) a kept person or car was lost
    crowd.onHurt = (p, dmg, fx, fz, byPlayer) => {
      if (byPlayer && HOSTILE.has(p.team)) this.alert(p);
      if (byPlayer && p.team === "civil") p.flee = 0;
    };
  }

  // ------------------------------------------------------------------- spawning

  kitIndex(id) { const k = this.kits.findIndex((q) => q.id === id); return k >= 0 ? k : 0; }

  async spawnPerson(spec, x, z, yaw = 0) {
    const team = spec.team || "legacy";
    const looks = LOOKS[team] || LOOKS.civil;
    const look = spec.look && PEOPLE.some((p) => p.id === spec.look) ? spec.look : looks[this.r.int(0, looks.length - 1)];
    const person = await Person.create(look, this.U);
    if (!person) return null;
    const y = this.w.ground(x, z, 999) + 0.15;
    const p = {
      person, actor: true, tag: spec.tag || null, team, ai: spec.ai || (HOSTILE.has(team) ? "guard" : team === "civil" ? "stand" : "follow"),
      x, z, y, yaw, hp: spec.hp || (team === "brittle" ? 140 : team === "audit" ? 160 : 100), downT: 0, panic: 0, flee: 0, hitT: 0,
      home: { x, z }, alert: spec.ai === "attack" ? 1 : 0, acc: spec.accuracy != null ? spec.accuracy : 0.5, fireT: 0, burst: 0, seeT: this.r() * 0.3, los: false,
      aSpeed: 0, aRun: 0, blip: spec.blip !== false, friendly: FRIENDLY.has(team), keep: !!spec.keep, weapon: spec.weapon || null,
      alertT: this.t, cash: HOSTILE.has(team) ? this.r.int(20, 160) : this.r.int(0, 60), gun: spec.weapon && WEAPON[spec.weapon] && WEAPON[spec.weapon].mag && !WEAPON[spec.weapon].throw ? spec.weapon : null,
      strafe: this.r() * 6.28, spawnT: this.t,
    };
    p.hp0 = p.hp;
    if (p.weapon && WEAPON[p.weapon]) {
      const w = WEAPON[p.weapon];
      const ars = new Arsenal({ weapons: { [w.id]: { mag: w.mag || 0, ammo: 99999 } }, cur: w.id }, this.mats, this.U, this.combat, this.audio);
      ars.shooter = p;
      // Their aim is rougher than yours, and their rounds hurt less: a fair fight, not a firing squad.
      ars.shotOpts = { dmg: team === "ally" ? 0.6 : 0.32, spread: lerp(0.09, 0.02, p.acc) };
      this.scene.add(ars.mesh);
      p.ars = ars;
      person.arms = (q) => ars.pose(q);
    }
    if (team === "civil" || team === "vip") {
      const g = person.info.g;
      person.playIdle(`${g}_idle_neutral`);
    }
    person.holder.position.set(x, y, z);
    person.holder.rotation.y = yaw;
    this.scene.add(person.holder);
    this.crowd.people.push(p);
    this.people.push(p);
    return p;
  }

  // n people spread round a point.
  async spawnPeople(spec, x, z, yaw = 0) {
    const n = spec.n || 1, spread = spec.spread != null ? spec.spread : 5, out = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.r() * 0.6, d = n > 1 ? spread * (0.4 + 0.6 * this.r()) : 0;
      const p = await this.spawnPerson(spec, x + Math.cos(a) * d, z + Math.sin(a) * d, yaw);
      if (p) out.push(p);
    }
    return out;
  }

  // A car on the nearest road to (x, z), facing yaw (or along the road).
  spawnCar(spec, x, z, yaw = null) {
    const kid = spec.kit || "mv6";
    const k = this.kitIndex(kid), kit = this.kits[k];
    const r = snapRoad(this.w, x, z);
    let px = x, pz = z, py = this.w.ground(x, z, 999);
    if (r && r.d < 160) {
      const off = r.e.laneOff[0];
      this.w.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), off, tmp);
      px = tmp.x; pz = tmp.z; py = tmp.y;
      if (yaw == null) yaw = Math.atan2(-tmp.tx, -tmp.tz);
      // Keep clear of anything already there.
      for (let tries = 0; tries < 6 && this.traffic.cars.some((c) => Math.hypot(c.x - px, c.z - pz) < 6.5); tries++) {
        this.w.edgePoint(r.e, clamp(r.s + 8 * (tries + 1), r.e.sA, r.e.sB), off, tmp);
        px = tmp.x; pz = tmp.z; py = tmp.y;
      }
    }
    const sp = kit.spec;
    const hp = spec.hp || (kid === "vault" ? 1400 : kid === "boxtruck" ? 900 : kid === "brittle_suv" || kid === "cruiser" ? 650 : 400);
    const c = {
      ai: spec.ai || "park", tag: spec.tag || null, team: spec.team || (kid === "cruiser" ? "audit" : kid === "brittle_suv" ? "brittle" : null),
      mode: "ai", type: k, kit, spec: sp, m: sp.mass, hl: sp.L / 2, hw: sp.W / 2,
      color: spec.color != null ? spec.color : kit.livery ? 0xfffdf9 : 0x6a7378, livery: !!kit.livery,
      x: px, z: pz, y: py + ROAD_LIFT, yaw: yaw || 0, v: 0, vx: 0, vz: 0, r: 0, spin: 0, brake: false, stuck: 0, ignore: 0,
      hp, hp0: hp, speedK: spec.speed || 1, to: spec.to || null, path: null, pi: 0, replanT: 0, arrived: false,
      crew: spec.crew ? { n: spec.crew.n || 2, team: spec.crew.team || spec.team || "legacy", weapon: spec.crew.weapon || "hotfix9" } : null,
      bailed: false, blip: spec.blip !== false, kvx: 0, kvz: 0, fireT: 1 + this.r(), siren: kid === "cruiser" || kid === "ambulance",
      race: spec.route || null, lap: 0, keep: !!spec.keep, flash: this.r(),
    };
    if (k >= this.ownStart) this.makeMesh(c);
    this.traffic.cars.push(c);
    this.cars.push(c);
    return c;
  }

  // Fleet vehicles (and anything with a livery) get their own mesh rather than an instance.
  makeMesh(c) {
    const kit = c.kit;
    const mat = this.mats.prop.clone();
    mat.uniforms = { ...this.U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 0.8 }, uLivery: { value: kit.livery || null }, uUseLivery: { value: kit.livery ? 1 : 2 }, uPaint: { value: new THREE.Vector3(...hex(c.color)) } };
    const g = new THREE.Group();
    g.rotation.order = "YXZ";
    const body = new THREE.Mesh(kit.body, mat);
    body.layers.enable(1);
    g.add(body);
    c.wheelM = [];
    for (const ws of kit.wheels) {
      const w = new THREE.Mesh(kit.wheelGeo, mat);
      w.position.set(ws.x, ws.y, ws.z); w.rotation.order = "YXZ";
      g.add(w); c.wheelM.push([w, ws]);
    }
    c.mesh = g; c.mat = mat;
    this.scene.add(g);
  }

  spawnItem(spec, x, z) {
    const kind = spec.kind || "package";
    if (!this.itemGeo[kind]) this.itemGeo[kind] = itemGeometry(kind);
    const mesh = new THREE.Mesh(this.itemGeo[kind], this.itemMat);
    mesh.frustumCulled = false;
    const y = spec.y != null ? spec.y : this.w.ground(x, z, 999) + 0.15;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const it = { tag: spec.tag || null, kind, x, y, z, value: spec.value || 0, mesh, taken: false };
    this.items.push(it);
    return it;
  }

  // ---------------------------------------------------------------------- queries

  byTag(tag) {
    return { people: this.people.filter((p) => p.tag === tag && !p.gone), cars: this.cars.filter((c) => c.tag === tag && !c.gone), items: this.items.filter((i) => i.tag === tag) };
  }
  // A person counts as down once knocked out (or lying down at all, for a minor knock in the middle of a fight
  // they won't get up from in time to matter: only `out`).
  isDown(p) { return p.gone || (p.downT > 0 && p.out); }
  isDead(c) { return c.gone || c.burnt; }
  carOut(c) { return this.isDead(c) || c.disabled; }

  // A gunshot or explosion: guards nearby hear it.
  noise(x, z, r = 45) {
    for (const p of this.people) if (HOSTILE.has(p.team) && !p.downT && Math.hypot(p.x - x, p.z - z) < r) this.alert(p);
  }

  alert(p) {
    if (p.alert >= 1) return;
    p.alert = 1; p.alertT = this.t;
    // Everyone they're with joins in.
    for (const q of this.people) if (q !== p && q.team === p.team && !q.downT && !q.alert && Math.hypot(q.x - p.x, q.z - p.z) < 35) { q.alert = 1; q.alertT = this.t; }
  }

  // ---------------------------------------------------------------------- update

  // ctx: { me: { x, y, z } feet of whoever the player is, car: the player's Vehicle, driving: bool, inside: bool }
  update(dt, ctx) {
    this.t += dt;
    const me = ctx.me;
    for (const p of this.people) {
      if (p.gone) continue;
      if (p.release && Math.hypot(p.x - me.x, p.z - me.z) > 130) { this.removePerson(p); continue; }
      if (p.hidden) { if (p.riding) { p.x = ctx.car.x; p.z = ctx.car.z; } continue; }
      if (p.downT) { p.aSpeed = 0; if (p.ars) p.ars.aimW = 0; continue; }
      this.think(p, dt, ctx);
    }
    // VIPs climb out when you do.
    if (!ctx.driving && this.riders.length) {
      for (const p of this.riders) {
        p.hidden = false; p.riding = false; p.person.holder.visible = true;
        const a = this.r() * 6.28;
        p.x = me.x + Math.cos(a) * 1.4; p.z = me.z + Math.sin(a) * 1.4; p.y = me.y;
      }
      this.riders = [];
    }
    for (const c of this.cars) {
      if (c.gone) continue;
      if (c.release && Math.hypot(c.x - me.x, c.z - me.z) > 160) { this.removeCar(c); continue; }
      if (c.taken) continue;   // the player is driving it
      this.drive(c, dt, ctx);
    }
    this.bumpCars();
    // Pickups: walk or drive over them.
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 1.6;
      it.mesh.position.y = it.y + 0.12 + Math.sin(this.t * 2.5 + it.x) * 0.06;
      const r = ctx.driving ? 3 : 1.5;
      if (Math.abs(it.x - me.x) < r && Math.abs(it.z - me.z) < r && Math.abs(it.y - me.y) < 2.5) {
        it.taken = true; this.scene.remove(it.mesh);
        if (it.tag) this.carried.add(it.tag);
        if (this.onPickup) this.onPickup(it);
      }
    }
  }

  // One person's decisions: who to fight, where to stand, when to shoot.
  think(p, dt, ctx) {
    const me = ctx.me;
    const hostile = HOSTILE.has(p.team);
    let tx = null, tz = null, ty = 0, targetIsMe = false, targetPed = null;
    if (hostile) {
      // The player, or an ally if one is nearer.
      let bd = Math.hypot(me.x - p.x, me.z - p.z);
      tx = me.x; tz = me.z; ty = me.y; targetIsMe = true;
      for (const q of this.people) {
        if (!q.friendly || q.downT || q.hidden) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bd - 4) { bd = d; tx = q.x; tz = q.z; ty = q.y; targetIsMe = false; targetPed = q; }
      }
      // An Audit officer only fights while the Audit is after you, and only where they think you are.
      if (p.audit && this.auditCalm && this.auditCalm()) { p.alert = 0; this.idle(p, dt); return; }
      if (p.audit && p.hunt) {
        const hx = p.hunt.x - p.x, hz = p.hunt.z - p.z, hd = Math.hypot(hx, hz);
        if (hd > 2) this.run(p, dt, hx, hz, hd > 12 ? 3.6 : 1.4); else this.idle(p, dt);
        if (hd > 2 && hd <= 12) p.aRun = 0;
        if (p.ars) p.ars.update(dt, { person: p.person, aiming: false, held: false, pressed: false, aimPoint: v3(), aimDir: new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), inside: false });
        return;
      }
    } else if (p.team === "ally") {
      let bd = 34;
      for (const q of this.people) {
        if (!HOSTILE.has(q.team) || q.downT || q.hidden) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < bd) { bd = d; tx = q.x; tz = q.z; ty = q.y; targetPed = q; }
      }
    }
    const d = tx == null ? Infinity : Math.hypot(tx - p.x, tz - p.z);
    // Line of sight, a few times a second.
    p.seeT -= dt;
    if (p.seeT <= 0 && tx != null) {
      p.seeT = 0.3 + this.r() * 0.15;
      p.los = d < 80 && this.sight(p, tx, ty + 1.3, tz, targetPed);
    }
    if (hostile && !p.alert) {
      // Guards spot you when you're close and in view, or very close.
      if ((p.los && d < (ctx.driving ? 22 : 32)) || d < 6) this.alert(p);
    }
    const w = p.ars ? p.ars.w : null;
    const fight = (hostile && p.alert) || (p.team === "ally" && targetPed);
    if (p.ai === "flee" || (p.team === "civil" && p.ai !== "stand")) { this.run(p, dt, p.x - me.x, p.z - me.z, 4.4); return; }
    if ((p.team === "vip" || (p.team === "ally" && !targetPed)) && p.ai !== "stand") { this.follow(p, dt, ctx); return; }
    if (!fight || p.ai === "stand") { this.idle(p, dt); return; }

    const want = w ? RANGE[w.cls] || 12 : 1.2;
    const dx = tx - p.x, dz = tz - p.z;
    p.strafe += dt * 0.8;
    let mx = 0, mz = 0, speed = 0;
    if (!p.los || d > want + 3) { mx = dx; mz = dz; speed = d > 14 ? 4.2 : 2.4; }
    else if (d < want - 5 && w && w.cls !== "shotgun") { mx = -dx; mz = -dz; speed = 1.4; }
    else if (w && w.mag) { const s = Math.sin(p.strafe) > 0 ? 1 : -1; mx = -dz * s; mz = dx * s; speed = 0.9; }
    // Guards don't wander off their post far.
    if (p.ai === "guard" && Math.hypot(p.x - p.home.x, p.z - p.home.z) > 28 && (mx * (p.home.x - p.x) + mz * (p.home.z - p.z)) < 0) speed = 0;
    if (speed > 0) {
      const l = Math.hypot(mx, mz) || 1;
      p.x += (mx / l) * speed * dt; p.z += (mz / l) * speed * dt;
    }
    p.aSpeed = speed; p.aRun = speed > 3 ? 1 : 0;
    // Face the fight.
    p.yaw += angleWrap(Math.atan2(-dx, -dz) - p.yaw) * Math.min(1, dt * 8);
    if (!w || !w.mag) {
      // Fists and blades: close in and swing.
      p.fireT -= dt;
      if (p.noMelee) return;
      if (d < 1.5 && p.fireT <= 0) {
        p.fireT = 1.1;
        if (targetIsMe) { if (this.onHitMe) this.onHitMe(w ? 14 : 7, p.x, p.z); }
        else if (targetPed) this.crowd.hurt(targetPed, w ? 30 : 14, p.x, p.z, false);
      }
      return;
    }
    // Guns: bursts while they can see the target, pauses between.
    p.fireT -= dt;
    let firing = false;
    if (p.los && d < Math.min(w.range, want * 3.2)) {
      if (p.burst > 0) { p.burst -= dt; firing = true; if (p.burst <= 0) p.fireT = 0.7 + this.r() * 1.1; }
      else if (p.fireT <= 0) p.burst = w.auto ? 0.5 + this.r() * 0.7 : 0.05;
    }
    // A moment to react after spotting you, so a guard round the corner can't drop you instantly.
    if (this.t - (p.alertT || 0) < 0.6) firing = false;
    const chest = new THREE.Vector3(tx, ty + 1.25, tz);
    const from = new THREE.Vector3(p.x, p.y + 1.45, p.z);
    const aimDir = chest.clone().sub(from).normalize();
    p.ars.update(dt, { person: p.person, aiming: true, held: firing, pressed: firing, aimPoint: chest, aimDir, inside: false });
  }

  idle(p, dt) {
    p.aSpeed = 0; p.aRun = 0;
    if (p.ars) p.ars.update(dt, { person: p.person, aiming: false, held: false, pressed: false, aimPoint: v3(), aimDir: new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), inside: false });
  }

  run(p, dt, dx, dz, speed) {
    const l = Math.hypot(dx, dz) || 1;
    p.x += (dx / l) * speed * dt; p.z += (dz / l) * speed * dt;
    p.yaw += angleWrap(Math.atan2(-dx, -dz) - p.yaw) * Math.min(1, dt * 6);
    p.aSpeed = speed; p.aRun = 1;
  }

  // Allies and VIPs stay with you, and get in your car when you pull up beside them.
  follow(p, dt, ctx) {
    const me = ctx.me;
    if (ctx.driving && p.ride) {
      const car = ctx.car, d = Math.hypot(car.x - p.x, car.z - p.z);
      if (d < 16 && car.speed < 2.5) {
        if (d < car.hw + 1.4) { this.board(p); return; }
        this.run(p, dt, car.x - p.x, car.z - p.z, d > 5 ? 3.6 : 1.6);
        return;
      }
      this.idle(p, dt);
      return;
    }
    if (ctx.driving) { this.idle(p, dt); return; }
    const d = Math.hypot(me.x - p.x, me.z - p.z);
    if (d > 3) this.run(p, dt, me.x - p.x, me.z - p.z, d > 9 ? 4.2 : 1.5);
    else this.idle(p, dt);
    if (d > 3 && d <= 9) p.aRun = 0;
  }

  board(p) {
    p.hidden = true; p.riding = true; p.person.holder.visible = false;
    if (!this.riders.includes(p)) this.riders.push(p);
    if (this.onBoard) this.onBoard(p);
  }

  // Clear line from an eye to a point: no wall or hill in between.
  sight(p, x, y, z, ignore) {
    const o = new THREE.Vector3(p.x, p.y + 1.6, p.z);
    const d = new THREE.Vector3(x - o.x, y - o.y, z - o.z);
    const L = d.length();
    if (L < 1) return true;
    d.multiplyScalar(1 / L);
    let blocked = false;
    this.combat.rayWorld(o, d, L - 0.5, (t) => { if (t > 0.3 && t < L - 0.5) blocked = true; });
    void ignore;
    return !blocked;
  }

  // ------------------------------------------------------------------------- cars

  drive(c, dt, ctx) {
    const me = ctx.me;
    if (c.burnt) {
      c.v = Math.max(0, c.v - 12 * dt);
      this.coast(c, dt);
      return;
    }
    const dme = Math.hypot(me.x - c.x, me.z - c.z);
    // Crews get out to fight once the car stops (or is stopped).
    // A chase that has you pinned (it has rammed you twice, or you've stopped beside it) turns into a fight.
    if (c.ai === "chase" && !c.target && dme < 16 && (ctx.speed || 0) < 4) c.pinT = (c.pinT || 0) + dt; else if (c.pinT) c.pinT = Math.max(0, c.pinT - dt);
    if (c.crew && !c.bailed && (c.disabled || c.emp > 0 || (c.arrived && c.ai !== "flee") || (c.ai === "park" && dme < 18) || (c.ai === "chase" && (c.pinT > 2 || (dme < 14 && c.v < 5))))) this.bail(c);
    if (c.bailed && c.ai === "chase") { c.v = Math.max(0, c.v - 11 * dt); c.brake = true; this.coast(c, dt); return; }
    if (c.backT > 0) {
      c.backT -= dt;
      c.v = Math.max(-5, c.v - 16 * dt);
      c.brake = true;
      this.coast(c, dt);
      return;
    }
    if (c.emp > 0) c.emp -= dt;
    const stalled = c.disabled || c.emp > 0 || c.ai === "park" || c.arrived;
    if (stalled) {
      c.v = Math.max(0, c.v - 11 * dt);
      c.brake = true;
      this.coast(c, dt);
      return;
    }
    // Where it's going: plan (and re-plan) the route.
    c.replanT -= dt;
    if (!c.path || c.replanT <= 0 || (c.pi >= c.path.length - 1 && c.ai !== "route" && c.ai !== "convoy" && c.ai !== "race")) this.plan(c, ctx);
    let tx, tz;
    // Only ram what it can see: an Audit car that has lost you drives its search instead.
    const ram = c.ai === "chase" && !c.target && dme < 26;
    if (c.target && c.ai === "chase" && (!c.lastTarget || c.lastTarget.x !== c.target.x || c.lastTarget.z !== c.target.z)) { c.lastTarget = c.target; c.replanT = 0; }
    if (ram) {
      const lead = ctx.driving ? 0.45 : 0.2;
      tx = me.x + (ctx.driving ? ctx.car.vx || 0 : 0) * lead; tz = me.z + (ctx.driving ? ctx.car.vz || 0 : 0) * lead;
    } else {
      const L = 6 + c.v * 0.65;
      const P = c.path;
      while (c.pi < P.length - 1 && Math.hypot(P[c.pi].x - c.x, P[c.pi].z - c.z) < L) c.pi++;
      tx = P[c.pi].x; tz = P[c.pi].z;
      // Wandered off the route (shunted, or the plan was poor): plan again from here.
      if (Math.hypot(tx - c.x, tz - c.z) > 60) c.replanT = 0;
      // The end of a route.
      if (c.pi >= P.length - 1 && Math.hypot(tx - c.x, tz - c.z) < 7) {
        if (c.ai === "race") { c.arrived = true; if (this.onFinish) this.onFinish(c); }
        else if (c.ai === "route" || c.ai === "convoy") { c.arrived = true; if (this.onArrive) this.onArrive(c); }
      }
    }
    const want = Math.atan2(-(tx - c.x), -(tz - c.z));
    const dy = angleWrap(want - c.yaw);
    const rate = clamp(c.v / 5.5 + 0.35, 0.35, 1.7);
    c.yaw += clamp(dy, -rate * dt, rate * dt);
    let target = (SPEED[c.ai] || 13) * c.speedK * (c.kit.id === "boxtruck" || c.kit.id === "vault" ? 0.8 : 1);
    target *= 1 - 0.6 * Math.min(1, Math.abs(dy) / 0.9);
    if (c.ai === "race") {
      // Stay in the race: a little faster when behind, a little slower when well ahead.
      const lead = (c.pi / Math.max(1, c.path.length)) - (this.raceProgress ? this.raceProgress() : 0);
      target *= lead < -0.03 ? 1.12 : lead > 0.06 ? 0.9 : 1;
    }
    if (c.ai === "flee" && dme > 220) target *= 0.7;
    // Closing in to ram: only a little faster than you, so it shunts rather than flattens you.
    if (ram && dme < 12) target = Math.min(target, (ctx.speed || 0) + 7);
    // On foot, a chaser stops short and lets the crew out.
    if (ram && !ctx.driving && dme < 18) target = Math.min(target, Math.max(0, dme - 9));
    if ((c.ai === "route" || c.ai === "convoy") && c.path) {
      const left = (c.path.length - 1 - c.pi) * 5;
      target = Math.min(target, Math.max(3, left * 0.6));
    }
    // Ordinary drivers keep their distance; chases and getaways barge through.
    if (c.ai === "cruise" || c.ai === "route" || c.ai === "convoy") {
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      for (const o of this.traffic.cars) {
        if (o === c || Math.abs(o.x - c.x) > 22 || Math.abs(o.z - c.z) > 22) continue;
        const ox = o.x - c.x, oz = o.z - c.z, along = ox * fx + oz * fz;
        if (along > 0 && along < 8 + c.v * 1.4 && Math.abs(ox * fz - oz * fx) < 2.2) target = Math.min(target, Math.max(0, (along - c.hl - (o.hl || 2.3) - 2) * 0.9));
      }
      if (ctx.driving) {
        const ox = ctx.car.x - c.x, oz = ctx.car.z - c.z, along = ox * fx + oz * fz;
        if (along > 0 && along < 8 + c.v * 1.4 && Math.abs(ox * fz - oz * fx) < 2.4) target = Math.min(target, Math.max(0, (along - c.hl - ctx.car.hl - 2) * 0.9));
      }
    }
    c.brake = target < c.v - 0.5;
    c.v += clamp(target - c.v, -11 * dt, (c.ai === "chase" || c.ai === "flee" || c.ai === "race" ? 6 : 3.5) * dt);
    this.coast(c, dt);
    // Shooting from the car.
    if (c.crew && !c.bailed && HOSTILE.has(c.crew.team) && dme < 40 && dme > 5) {
      c.fireT -= dt;
      if (c.fireT <= 0) {
        const w = WEAPON[c.crew.weapon] || WEAPON.hotfix9;
        if (w.mag && !w.proj) {
          const dir = new THREE.Vector3(me.x - c.x, 0, me.z - c.z).normalize();
          const from = new THREE.Vector3(c.x + dir.x * (c.hw + 0.4), c.y + 1.35, c.z + dir.z * (c.hw + 0.4));
          const aim = new THREE.Vector3(me.x, me.y + 1.1, me.z);
          this.combat.shot(w, from, aim, c, { dmg: 0.25, spread: 0.06, ignoreCar: c });
        }
        c.fireT = w.auto ? 0.12 : 0.6 + this.r() * 0.5;
        if (this.r() < (w.auto ? 0.08 : 0.25)) c.fireT += 1.2 + this.r() * 1.5;
      }
    }
  }

  // Move with the current speed and heading, plus any shove, and sit on the road.
  coast(c, dt) {
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    c.x += (fx * c.v + c.kvx) * dt; c.z += (fz * c.v + c.kvz) * dt;
    const k = Math.exp(-3 * dt);
    c.kvx *= k; c.kvz *= k;
    c.vx = fx * c.v + c.kvx; c.vz = fz * c.v + c.kvz;
    c.y = this.w.ground(c.x, c.z, c.y + 1);
    if (!this.w.onDeck) c.y += Math.max(ROAD_LIFT, this.w.paveLift(c.x, c.z));
    c.spin += (c.v / (c.spec.wr || 0.33)) * dt;
  }

  plan(c, ctx) {
    const me = ctx.me;
    c.replanT = c.ai === "chase" ? 1.2 : c.ai === "flee" ? 5 : 30;
    let to;
    if (c.ai === "chase") to = c.target || { x: me.x, z: me.z };
    else if (c.ai === "route" || c.ai === "convoy") to = c.to || { x: c.x, z: c.z };
    else if (c.ai === "race") {
      if (!c.path) {
        // The whole course, checkpoint to checkpoint.
        const pts = [];
        let from = { x: c.x, z: c.z };
        for (const q of c.race) { pts.push(...planRoute(this.w, from, q)); from = q; }
        c.path = pts; c.pi = 0;
      }
      c.replanT = 1e9;
      return;
    } else {
      // Cruise and flee: somewhere far, and for a getaway, somewhere away from you.
      let best = null, bs = -Infinity;
      for (let k = 0; k < 40; k++) {
        const n = this.w.nodes[this.r.int(0, this.w.nodes.length - 1)];
        if (!n.main) continue;
        const d = Math.hypot(n.x - c.x, n.z - c.z);
        if (d < 300 || d > 900) continue;
        let s = this.r();
        if (c.ai === "flee") {
          const ax = c.x - me.x, az = c.z - me.z, al = Math.hypot(ax, az) || 1;
          s = ((n.x - c.x) * ax + (n.z - c.z) * az) / (d * al) + this.r() * 0.3;
        }
        if (s > bs) { bs = s; best = n; }
      }
      to = best ? { x: best.x, z: best.z } : { x: c.x + 300, z: c.z };
    }
    c.path = planRoute(this.w, { x: c.x, z: c.z }, to);
    c.pi = 0;
  }

  // The crew climbs out, guns ready.
  async bail(c) {
    c.bailed = true;
    const n = c.crew.n;
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1, along = (Math.floor(k / 2) - 0.5) * 1.4;
      const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      const x = c.x + rx * side * (c.hw + 0.8) + fx * along, z = c.z + rz * side * (c.hw + 0.8) + fz * along;
      const p = await this.spawnPerson({ tag: c.tag, team: c.crew.team, weapon: c.crew.weapon === "fists" ? null : c.crew.weapon, ai: "attack" }, x, z, c.yaw);
      if (!p) continue;
      if (c.release) p.release = true;
      if (this.onCrew) this.onCrew(c, p);
    }
  }

  // Mission cars shove ambient traffic aside, and each other.
  bumpCars() {
    for (const a of this.cars) {
      if (a.gone || a.taken) continue;
      const A = { x: a.x, z: a.z, fx: -Math.sin(a.yaw), fz: -Math.cos(a.yaw), hl: a.hl, hw: a.hw };
      for (const b of this.traffic.cars) {
        if (b === a || b.taken || Math.abs(a.x - b.x) > 8 || Math.abs(a.z - b.z) > 8 || Math.abs(a.y - b.y) > 2.5) continue;
        const hit = sat(A, { x: b.x, z: b.z, fx: -Math.sin(b.yaw), fz: -Math.cos(b.yaw), hl: b.hl, hw: b.hw });
        if (!hit) continue;
        const share = a.m / (a.m + b.m);
        a.x += hit.nx * hit.depth * (1 - share); a.z += hit.nz * hit.depth * (1 - share);
        b.x -= hit.nx * hit.depth * share; b.z -= hit.nz * hit.depth * share;
        const vn = (a.vx - (b.vx || 0)) * hit.nx + (a.vz - (b.vz || 0)) * hit.nz;
        if (vn < 0) {
          if (b.ai) { b.kvx -= hit.nx * vn * share; b.kvz -= hit.nz * vn * share; }
          else { if (b.mode !== "wreck" && b.mode !== "parked") { b.mode = "wreck"; } b.vx = (b.vx || 0) - hit.nx * vn * share; b.vz = (b.vz || 0) - hit.nz * vn * share; }
          a.v *= 0.85;
        }
      }
    }
  }

  // ------------------------------------------------------------------------- drawing

  // After the crowd has posed everyone: guns into hands, fleet meshes onto their cars.
  place(dt, night) {
    for (const p of this.people) {
      if (!p.ars) continue;
      p.ars.place(p.person, !p.gone && !p.hidden && !p.downT && p.person.holder.visible);
    }
    for (const c of this.cars) {
      if (!c.mesh) continue;
      c.mesh.visible = !c.gone && !c.taken;
      if (!c.mesh.visible) continue;
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.set(0, c.yaw, 0);
      for (const [w, ws] of c.wheelM) { w.rotation.x = -c.spin; w.rotation.y = ws.front ? clamp((c.steerV || 0), -0.5, 0.5) : 0; }
      c.mat.uniforms.uBrake.value = c.brake ? 1 : 0;
      c.mat.uniforms.uLights.value = night > 0.2 && !c.burnt ? 1 : 0;
      if (c.burnt && !c.charred) { c.charred = true; c.mat.uniforms.uUseLivery.value = 2; c.mat.uniforms.uPaint.value.set(0.16, 0.15, 0.14); }
    }
  }

  // Roof beacons on cruisers and ambulances, flashing when they're on a call.
  glows(put) {
    for (const c of this.cars) {
      if (c.gone || c.burnt || c.taken || !c.kit.beacons || !c.kit.beacons.length) continue;
      const on = c.siren && (c.ai === "chase" || c.ai === "flee" || c.ai === "route" || c.lights);
      if (!on) continue;
      const ph = Math.floor((this.t + c.flash) * 6) % 2;
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      c.kit.beacons.forEach(([bx, by, bz, col], i) => {
        if ((i + ph) % 2) return;
        put(c.x + bx * cs + bz * sn, c.y + by, c.z - bx * sn + bz * cs, hex(col));
      });
    }
  }

  // ------------------------------------------------------------------------ clearing up

  removePerson(p) {
    p.gone = true;
    this.scene.remove(p.person.holder);
    if (p.ars) this.scene.remove(p.ars.mesh);
    this.riders = this.riders.filter((q) => q !== p);
  }
  removeCar(c) {
    c.gone = true;
    if (c.mesh) this.scene.remove(c.mesh);
  }

  // Take away everything with these tags at once.
  despawn(tags) {
    const T = new Set(tags);
    for (const p of this.people) if (T.has(p.tag) && !p.gone) this.removePerson(p);
    for (const c of this.cars) if (T.has(c.tag) && !c.gone && !c.taken) this.removeCar(c);
    for (const it of this.items) if (T.has(it.tag) && !it.taken) { it.taken = true; this.scene.remove(it.mesh); }
    this.tidy();
  }

  // When a mission ends: leftovers stay put until you're out of sight of them, then go. Pickups go now.
  release() {
    for (const p of this.people) if (!p.audit && !p.contactId) { p.release = true; if (HOSTILE.has(p.team) && !p.downT) p.alert = 0; if (p.team === "vip" || p.team === "ally") this.removePerson(p); }
    for (const c of this.cars) if (!c.audit) { c.release = true; c.tag = null; if (c.ai === "chase" || c.ai === "race") c.ai = "cruise"; }
    for (const it of this.items) if (!it.taken) { it.taken = true; this.scene.remove(it.mesh); }
    this.items = []; this.carried.clear();
    for (const p of this.people) if (p.release) p.tag = null;
    this.tidy();
  }

  tidy() {
    this.people = this.people.filter((p) => !p.gone);
    this.cars = this.cars.filter((c) => !c.gone);
    this.items = this.items.filter((i) => !i.taken || i.tag);
  }

  // Map dots: [{ x, z, kind }].
  blips() {
    const out = [];
    for (const p of this.people) {
      if (p.gone || p.hidden || !p.blip || (p.downT && p.out)) continue;
      if (HOSTILE.has(p.team) && (!p.audit || !this.auditCalm || !this.auditCalm())) out.push({ x: p.x, z: p.z, kind: p.audit ? "audit" : "enemy" });
      else if (p.friendly) out.push({ x: p.x, z: p.z, kind: "ally" });
    }
    for (const c of this.cars) {
      if (c.gone || c.taken || !c.blip || c.burnt) continue;
      if (c.audit) out.push({ x: c.x, z: c.z, kind: "audit" });
      else if (c.tag) out.push({ x: c.x, z: c.z, kind: c.team && HOSTILE.has(c.team) ? "enemycar" : "car" });
    }
    for (const it of this.items) if (!it.taken) out.push({ x: it.x, z: it.z, kind: "item" });
    return out;
  }
}
