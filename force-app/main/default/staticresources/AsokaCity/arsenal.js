// The player's weapons: what they own, ammo in the magazine and in reserve, reloading, firing and
// throwing, and how the character holds each one (arm targets for the two-bone reach in people.js).
import * as THREE from "./three.module.min.js";
import { WEAPON, WEAPONS, weaponGeometry, muzzleOf } from "./weapons.js";
import { clamp, lerp } from "./util.js";

const LONG = new Set(["smg-long", "shotgun", "rifle", "sniper", "lmg", "launcher", "rocket"]);
const v = () => new THREE.Vector3();

export class Arsenal {
  // save.weapons: { id: { mag, ammo } }; save.cur: selected id.
  constructor(save, mats, U, combat, audio) {
    this.s = save; this.combat = combat; this.audio = audio;
    this.s.weapons = this.s.weapons || {};
    this.s.cur = this.s.cur && (this.s.cur === "fists" || this.s.weapons[this.s.cur]) ? this.s.cur : "fists";
    this.mat = mats.prop.clone();
    this.mat.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 0.45 }, uLivery: { value: null }, uUseLivery: { value: 0 } };
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.cool = 0; this.reloadT = 0; this.aimW = 0; this.act = 0; this.actT = 0; this.spin = 0;
    this.aimDir = new THREE.Vector3(0, 0, -1);
    this.gunDir = new THREE.Vector3(0, 0, -1);
    this.holstered = false;
    this.setMesh();
  }

  get w() { return WEAPON[this.s.cur]; }
  get state() { return this.s.weapons[this.s.cur]; }
  owned() { return WEAPONS.filter((w) => w.id === "fists" || (this.s.weapons[w.id] && (!w.throw || this.s.weapons[w.id].ammo + this.s.weapons[w.id].mag > 0))); }
  long() { const w = this.w; return LONG.has(w.cls) || (w.cls === "smg" && w.long); }

  setMesh() {
    const geo = weaponGeometry(this.s.cur);
    this.mesh.geometry = geo || new THREE.BufferGeometry();
    this.hasMesh = !!geo;
  }

  select(id) {
    if (id === this.s.cur) return;
    this.s.cur = id; this.reloadT = 0; this.cool = 0.25; this.act = 0;
    this.setMesh();
  }

  cycle(dir) {
    const list = this.owned();
    const i = list.findIndex((w) => w.id === this.s.cur);
    this.select(list[(i + dir + list.length) % list.length].id);
  }

  slot(n) {
    const list = this.owned().filter((w) => w.slot === n);
    if (!list.length) return false;
    const i = list.findIndex((w) => w.id === this.s.cur);
    this.select(list[(i + 1) % list.length].id);
    return true;
  }

  // Buying: a new weapon comes with a full magazine and one pack; buying again adds ammo.
  give(id, packs = 1) {
    const w = WEAPON[id];
    const st = this.s.weapons[id] || (this.s.weapons[id] = { mag: 0, ammo: 0 });
    if (w.mag) {
      st.ammo = Math.min(w.ammo, st.ammo + (w.ammoPack || 0) * packs + (st.mag === 0 && !w.throw ? w.mag : 0));
      if (st.mag === 0) { const take = Math.min(w.mag, st.ammo); st.mag = take; st.ammo -= take; }
    }
  }

  ammoFull(id) { const w = WEAPON[id], st = this.s.weapons[id]; return !!st && st.ammo + st.mag >= w.ammo + (w.throw ? 0 : w.mag) - 0.5; }

  reload() {
    const w = this.w, st = this.state;
    if (!w.mag || !st || this.reloadT > 0 || st.mag >= w.mag || st.ammo <= 0 || w.throw) return;
    this.reloadT = w.reload;
    if (this.audio) this.audio.reload();
  }

  // ctx: { person, aiming, held, pressed, aimPoint, camDir, inside }
  update(dt, ctx) {
    const w = this.w, st = this.state;
    this.holstered = !!ctx.inside;
    const melee = !w.mag;
    const wantAim = !this.holstered && (ctx.aiming || (ctx.held && !melee) || this.act > 0);
    this.aimW = lerp(this.aimW, wantAim ? 1 : 0, Math.min(1, dt * (wantAim ? 14 : 6)));
    this.aimDir.copy(ctx.aimDir);
    this.cool = Math.max(0, this.cool - dt);
    if (this.act > 0) this.act = Math.max(0, this.act - dt / this.actT);
    if (w.spin) this.spin = clamp(this.spin + (ctx.held && !this.holstered ? dt * 2.5 : -dt * 1.5), 0, 1);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { const take = Math.min(w.mag - st.mag, st.ammo); st.mag += take; st.ammo -= take; }
      return null;
    }
    if (this.holstered || !ctx.person) return null;
    const trigger = w.auto ? ctx.held : ctx.pressed;
    if (!trigger || this.cool > 0) return null;
    if (w.spin && this.spin < 0.6) return null;
    if (melee) {
      this.cool = 1 / w.rate; this.act = 1; this.actT = 0.32;
      setTimeout(() => this.combat.swing(w, ctx.person.holder.position.x, ctx.person.holder.position.y, ctx.person.holder.position.z, ctx.aimDir.x, ctx.aimDir.z), 120);
      return { kind: "swing" };
    }
    if (st.mag <= 0) {
      if (st.ammo > 0) this.reload(); else if (ctx.pressed && this.audio) this.audio.click();
      return null;
    }
    this.cool = 1 / w.rate;
    if (w.throw) {
      st.mag--;
      this.act = 1; this.actT = 0.55;
      const camDir = ctx.aimDir.clone();
      setTimeout(() => {
        const from = ctx.person.hand("R");
        const vel = camDir.clone().setY(0).normalize().multiplyScalar(14).add(new THREE.Vector3(0, 6 + camDir.y * 10, 0));
        this.combat.launch("grenade", from, vel);
        if (st.mag === 0 && st.ammo > 0) { st.mag = 1; st.ammo--; }
      }, 300);
      return { kind: "throw" };
    }
    st.mag--;
    const from = this.muzzle();
    if (w.proj) {
      const d = new THREE.Vector3().subVectors(ctx.aimPoint, from).normalize();
      this.combat.launch(w.proj === "rocket" ? "rocket" : "shell", from, d.multiplyScalar(w.proj === "rocket" ? 55 : 30).add(new THREE.Vector3(0, w.proj === "shell" ? 3 : 0, 0)));
      this.combat.flash(from, 1.6);
    }
    const hits = w.proj ? 0 : this.combat.shot(w, from, ctx.aimPoint);
    this.act = 1; this.actT = Math.min(0.25, 0.6 / w.rate);
    if (st.mag === 0 && st.ammo > 0) setTimeout(() => this.reload(), 250);
    return { kind: "shot", hits, kick: { pistol: 0.012, revolver: 0.03, smg: 0.006, shotgun: 0.045, rifle: 0.01, sniper: 0.05, lmg: 0.008, minigun: 0.004, launcher: 0.03, rocket: 0.05 }[w.cls] || 0.01 };
  }

  muzzle() {
    const m = muzzleOf(this.w);
    this.mesh.updateMatrixWorld(true);
    return new THREE.Vector3(...m).applyMatrix4(this.mesh.matrixWorld);
  }

  // Arm targets for the current weapon, blending a relaxed carry into the aim.
  pose(person) {
    const w = this.w;
    if (this.holstered) return null;
    const F = person.frame();
    const { fwd, right, up, chest } = F;
    const aim = this.aimW, act = this.act;
    const poleR = v().addScaledVector(up, -1).addScaledVector(right, 0.7).addScaledVector(fwd, -0.3);
    const poleL = v().addScaledVector(up, -1).addScaledVector(right, -0.7).addScaledVector(fwd, -0.3);
    const ready = v().addScaledVector(fwd, 0.62).addScaledVector(up, -0.78).normalize();
    const d = v().lerpVectors(ready, this.aimDir, aim).normalize();
    this.gunDir.copy(d);
    if (w.cls === "fists") {
      if (aim < 0.05 && act <= 0) return null;
      const jab = Math.sin(act * Math.PI);
      const g = (s, k) => v().copy(chest).addScaledVector(fwd, 0.22 + k * 0.32).addScaledVector(right, s * 0.12).addScaledVector(up, 0.02);
      return { w: Math.max(aim, act > 0 ? 1 : 0), right: g(1, jab), left: g(-1, 0), poleR, poleL };
    }
    if (w.cls === "bat" || w.cls === "blade") {
      const two = w.cls === "bat";
      const t = act > 0 ? 1 - act : 0;
      const raised = v().addScaledVector(up, 0.85).addScaledVector(fwd, -0.35).addScaledVector(right, 0.25).normalize();
      const swung = v().addScaledVector(fwd, 1).addScaledVector(right, -0.7).addScaledVector(up, -0.25).normalize();
      const k = act > 0 ? clamp(t * 1.6, 0, 1) : 0;
      const bd = v().lerpVectors(raised, swung, k * k).normalize();
      this.gunDir.copy(bd);
      const hand = v().copy(chest).addScaledVector(right, lerp(0.2, -0.05, k)).addScaledVector(fwd, lerp(0.18, 0.42, k)).addScaledVector(up, lerp(-0.02, -0.12, k));
      return { w: 1, right: hand, left: two ? hand.clone().addScaledVector(bd, -0.1).addScaledVector(right, -0.03) : null, poleR, poleL };
    }
    if (w.throw) {
      const t = act > 0 ? 1 - act : -1;
      let hand;
      if (t < 0) hand = v().copy(F.r).addScaledVector(up, -0.5).addScaledVector(fwd, 0.12);
      else if (t < 0.5) hand = v().copy(F.r).addScaledVector(up, 0.3 * (t / 0.5)).addScaledVector(fwd, -0.25 * (t / 0.5)).addScaledVector(right, 0.1);
      else hand = v().copy(chest).addScaledVector(fwd, 0.5).addScaledVector(up, 0.1 - (t - 0.5) * 0.4);
      this.gunDir.copy(fwd);
      return { w: 1, right: hand, left: null, poleR, poleL };
    }
    if (w.cls === "minigun") {
      this.gunDir.copy(aim > 0.05 ? v().lerpVectors(fwd, this.aimDir, aim).normalize() : fwd);
      const hand = v().copy(chest).addScaledVector(right, 0.22).addScaledVector(up, -0.32).addScaledVector(fwd, 0.22);
      return { w: 1, right: hand, left: hand.clone().addScaledVector(this.gunDir, 0.28).addScaledVector(up, 0.12).addScaledVector(right, -0.08), poleR, poleL };
    }
    const kick = act > 0 ? Math.sin(act * Math.PI) : 0;
    if (this.long()) {
      const rocket = w.cls === "rocket";
      const gripAim = rocket
        ? v().copy(F.r).addScaledVector(d, 0.14).addScaledVector(up, -0.17).addScaledVector(right, -0.06)
        : v().copy(chest).addScaledVector(right, 0.13).addScaledVector(d, 0.2 - kick * 0.05).addScaledVector(up, -0.07);
      const gripReady = v().copy(chest).addScaledVector(right, 0.2).addScaledVector(up, -0.24).addScaledVector(fwd, 0.16);
      const grip = v().lerpVectors(gripReady, gripAim, aim);
      if (this.reloadT > 0) grip.addScaledVector(up, -0.08);
      const fore = grip.clone().addScaledVector(d, rocket ? 0.3 : w.cls === "sniper" ? 0.4 : 0.32).addScaledVector(up, -0.02);
      return { w: 1, right: grip, left: fore, poleR, poleL };
    }
    // Pistols and the micro SMG: one hand at the hip, both hands out front to aim.
    const handAim = v().copy(chest).addScaledVector(right, 0.04).addScaledVector(d, 0.5 - kick * 0.06).addScaledVector(up, 0.06 + kick * 0.03);
    const handReady = v().copy(F.r).addScaledVector(up, -0.52).addScaledVector(fwd, 0.14).addScaledVector(right, 0.02);
    const hand = v().lerpVectors(handReady, handAim, aim);
    if (this.reloadT > 0) hand.addScaledVector(up, -0.1);
    return { w: 1, right: hand, left: aim > 0.5 ? hand.clone().addScaledVector(right, -0.05).addScaledVector(up, -0.035).addScaledVector(d, -0.02) : null, poleR, poleL };
  }

  // Put the model in the right hand, pointing along the pose's direction.
  place(person, visible) {
    this.mesh.visible = visible && this.hasMesh && !this.holstered;
    if (!this.mesh.visible) return;
    const hand = person.hand("R");
    const d = this.gunDir, up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(d.y) > 0.97) up.set(0, 0, 1);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), d, up);
    this.mesh.quaternion.setFromRotationMatrix(m);
    const w = this.w;
    const off = w.cls === "bat" || w.cls === "blade" ? 0.05 : w.throw ? 0.06 : 0.07;
    this.mesh.position.copy(hand).addScaledVector(d, off).addScaledVector(up, w.cls === "bat" || w.cls === "blade" ? 0 : -0.06);
  }
}
