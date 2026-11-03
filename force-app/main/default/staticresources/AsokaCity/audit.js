// The Audit: the city's enforcers. Crimes the Audit hears about raise an escalation level from 0 to 5.
// Each level sends more: cruisers that chase and ram at 1–2 (their officers get out to audit you, which
// costs a fine), armed officers at 3, faster guns at 4, Brittle security joining at 5. Out of sight of
// every unit long enough and the level steps down. A mission can suspend all of it.
import { HOSTILE, snapRoad } from "./actors.js";
import { clamp } from "./util.js";

const STEP = [0, 1, 3, 6, 10, 15];                 // heat needed for each level
const CRIME = { shots: 0.35, hit: 0.5, down: 1.4, car: 0.12, blast: 1.2, audit: 2.5, jack: 0.6 };
const CARS = [0, 1, 2, 3, 3, 4];
const GUNS = [null, null, null, "hotfix9", "asyncqueue", "pipeline"];

export class Audit {
  constructor({ world, actors, audio, hud }) {
    Object.assign(this, { w: world, actors, audio, hud });
    this.heat = 0; this.level = 0;
    this.seenT = 0; this.unseen = 0; this.spawnT = 0; this.bustT = 0; this.t = 0;
    this.suspended = false;
    this.units = [];
    this.onBusted = null;
    actors.auditCalm = () => this.level === 0;
    // A cruiser's crew, once out, are units too.
    actors.onCrew = (car, p) => { if (car.audit) { p.audit = true; this.units.push(p); } };
  }

  get seen() { return this.seenT > 0; }

  // Something happened. `who` is the person or car on the receiving end, where there is one.
  crime(kind, at, who) {
    if (this.suspended) return;
    let k = CRIME[kind] || 0.3;
    // Fighting the Legacy Crew or Brittle's people draws less attention than hurting bystanders,
    // and hurting an officer draws the most.
    if (who && who.team) k *= who.audit ? 1.8 : HOSTILE.has(who.team) ? 0.35 : 1;
    if (who && who.audit) k = Math.max(k, CRIME.audit);
    // Nobody saw a thing out in the hills at night... unless an officer is right there.
    // Someone calls it in: the Audit knows where it happened, not where you went next.
    if (at && (!this.seen || !this.last)) this.last = { x: at.x, z: at.z };
    this.add(k);
  }

  add(k) {
    this.heat = Math.min(STEP[5] + 3, this.heat + k);
    const lv = STEP.reduce((n, s, i) => (this.heat >= s && i > n ? i : n), 0);
    if (lv > this.level) { this.level = lv; this.unseen = 0; if (this.hud) this.hud.toast(lv === 1 ? "The Audit has opened a ticket on you." : `Escalation ${lv}. ${lv >= 5 ? "Brittle security is joining in." : lv >= 3 ? "Officers are armed." : ""}`, 2.5); }
  }

  // A mission (or a cheat for testing) sets it outright.
  set(level) {
    this.level = clamp(level | 0, 0, 5);
    this.heat = STEP[this.level];
    this.unseen = 0; this.need = null;
    if (this.level === 0) { this.clearUnits(); this.last = null; }
  }

  clearUnits() {
    for (const u of this.units) {
      if (u.isCar) { u.ai = "cruise"; u.release = true; u.lights = false; }
      else { u.release = true; u.alert = 0; }
    }
    this.units = [];
  }

  // ctx: { me: { x, y, z }, driving, car, speed }
  update(dt, ctx) {
    this.t += dt;
    const me = ctx.me;
    this.units = this.units.filter((u) => !u.gone);
    if (this.suspended && this.level > 0) this.set(0);
    // Each unit has to see you for itself: close enough, and nothing in the way. Right beside one, it
    // hears you. What one sees, the rest hear about on the radio.
    let near = Infinity, sees = false;
    for (const u of this.units) {
      if (u.burnt || (u.downT && u.out) || u.hidden) continue;
      const d = Math.hypot(u.x - me.x, u.z - me.z);
      near = Math.min(near, d);
      u.lookT = (u.lookT || Math.random() * 0.4) - dt;
      if (u.lookT <= 0) {
        u.lookT = 0.35;
        const range = u.isCar ? 150 : 90;
        u.sees = d < 10 || (d < range && this.actors.sight({ x: u.x, y: u.y + (u.isCar ? 0.2 : 0), z: u.z }, me.x, me.y + 1.1, me.z));
      }
      if (u.sees) sees = true;
    }
    const was = this.seen;
    if (sees) { this.seenT = 1; this.last = { x: me.x, z: me.z }; }
    this.seenT = Math.max(0, this.seenT - dt);
    if (this.audio) this.audio.siren(this.level > 0 && near < 260 ? clamp(1 - near / 260, 0, 1) : 0);
    if (this.hud) this.hud.search = this.level > 0 && !this.seen && this.last ? { x: this.last.x, z: this.last.z, r: 130 } : null;
    if (this.level === 0) return;
    // Lost sight of you: how long until they give up varies, and it goes faster the further you get
    // from where they last saw you, slower while they're searching right on top of you.
    if (!this.seen) {
      if (was || this.need == null) { this.need = this.lose(); if (was && this.hud) this.hud.toast("Out of sight. They're searching where they last saw you.", 2.5); }
      const far = this.last ? Math.hypot(me.x - this.last.x, me.z - this.last.z) : 300;
      this.unseen += dt * (1 + clamp((far - 120) / 250, 0, 2)) * (near < 35 ? 0.4 : 1);
      if (this.unseen > this.need) {
        this.unseen = 0;
        this.level--; this.heat = STEP[this.level]; this.need = this.lose();
        if (this.hud) this.hud.toast(this.level === 0 ? "The Audit closed your ticket." : `Escalation down to ${this.level}.`, 2.5);
        if (this.level === 0) { this.clearUnits(); return; }
      }
    } else { this.unseen = 0; this.need = null; }
    // Keep the right number of cruisers on the case, sent to where you were last seen.
    const cars = this.units.filter((u) => u.isCar && !u.burnt && !u.disabled);
    this.spawnT -= dt;
    if (cars.length < CARS[this.level] && this.spawnT <= 0) { this.spawnT = 3.5; this.spawnCruiser(this.last || me, me, this.level >= 5 && cars.length % 2); }
    for (const u of cars) {
      u.crew.weapon = GUNS[this.level] || "fists";
      if (Math.hypot(u.x - me.x, u.z - me.z) > 700) { this.actors.removeCar(u); continue; }
      // Seen: run you down. Not: drive to the last sighting, then cruise the streets round it.
      if (this.seen) u.target = null;
      else u.target = this.searchPoint(u);
    }
    // Officers on foot: armed at 3+, otherwise they come to audit you. Out of sight, they search on foot.
    for (const u of this.units) {
      if (u.isCar || u.downT) continue;
      u.ai = "attack"; u.alert = 1; u.noMelee = this.level < 3;
      u.hunt = this.seen ? null : this.searchPoint(u, 25);
      if (this.level < 3 && this.seen && !ctx.driving && Math.hypot(u.x - me.x, u.z - me.z) < 1.6) this.bustT += dt * 3;
    }
    // Boxed in by a cruiser at walking pace in the car.
    if (this.level < 3 && this.seen && ctx.driving && ctx.speed < 1.2 && cars.some((u) => Math.hypot(u.x - me.x, u.z - me.z) < 7)) this.bustT += dt;
    else this.bustT = Math.max(0, this.bustT - dt * 0.5);
    if (this.bustT > 3) { this.bustT = 0; this.busted(); }
  }

  // Seconds out of sight it takes to drop a level: longer the higher it is, never quite the same twice.
  lose() { return (8 + this.level * 4) * (0.65 + Math.random() * 0.8); }

  // Where a unit should look next: the last sighting, then spots round it, a new one each time it gets there.
  searchPoint(u, reach = 30) {
    const L = this.last;
    if (!L) return null;
    if (!u.spot || Math.hypot(u.x - u.spot.x, u.z - u.spot.z) < reach || this.t - (u.spotT || 0) > 14) {
      const first = !u.spot || Math.hypot(u.x - L.x, u.z - L.z) > 60;
      const a = Math.random() * Math.PI * 2, d = first ? 0 : 40 + Math.random() * 110;
      const r = u.isCar ? snapRoad(this.w, L.x + Math.cos(a) * d, L.z + Math.sin(a) * d) : null;
      const p = r ? this.w.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), 0, {}) : { x: L.x + Math.cos(a) * d * 0.4, z: L.z + Math.sin(a) * d * 0.4 };
      u.spot = { x: p.x, z: p.z }; u.spotT = this.t;
    }
    return u.spot;
  }

  busted() {
    this.set(0);
    if (this.onBusted) this.onBusted();
  }

  // A cruiser out of view down the road from where you were last seen, on its way there.
  spawnCruiser(from, me, brittle) {
    const w = this.w;
    let at = null;
    for (let tries = 0; tries < 20 && !at; tries++) {
      const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * 110;
      const r = snapRoad(w, from.x + Math.cos(a) * d, from.z + Math.sin(a) * d);
      if (!r || r.d > 40) continue;
      const p = w.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), 0, {});
      if (Math.hypot(p.x - me.x, p.z - me.z) < 110) continue;
      at = p;
    }
    if (!at) return;
    const c = this.actors.spawnCar({ kit: brittle ? "brittle_suv" : "cruiser", ai: "chase", team: brittle ? "brittle" : "audit", crew: { n: 2, team: brittle ? "brittle" : "audit", weapon: GUNS[this.level] || "fists" }, speed: 0.95 + this.level * 0.04 }, at.x, at.z);
    c.audit = true; c.isCar = true; c.lights = true;
    this.units.push(c);
  }
}
