// Gunfire and explosions: hit tests against people, cars, buildings and the ground; muzzle flashes,
// tracers, sparks, smoke, rockets and grenades. No blood: people hit hard enough are knocked down.
import * as THREE from "./three.module.min.js";
import { HALF, CHUNK, NCH } from "./map.js";
import { glowGeometry, setGlow } from "./render.js";
import { weaponGeometry } from "./weapons.js";
import { Geo } from "./geo.js";
import { clamp, hex } from "./util.js";

const SMOKE_VS = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aCol;
uniform float uScale; varying float vA; varying vec3 vC;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_PointSize = aSize * uScale / max(-mv.z, .1);
  vA = aAlpha; vC = aCol;
  gl_Position = projectionMatrix * mv;
}`;
const SMOKE_FS = /* glsl */ `
uniform vec3 uSkyAmb; uniform vec3 uLightCol;
varying float vA; varying vec3 vC;
void main() {
  vec2 c = gl_PointCoord * 2. - 1.;
  float d = dot(c, c);
  if (d > 1.) discard;
  vec3 col = pow(vC, vec3(2.2)) * (uSkyAmb * 1.4 + uLightCol * .35);
  gl_FragColor = vec4(col, vA * (1. - d) * (1. - d));
}`;

const TRACER_VS = /* glsl */ `attribute vec3 color; varying vec3 vC; void main() { vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const TRACER_FS = /* glsl */ `varying vec3 vC; void main() { gl_FragColor = vec4(vC, 1.); }`;

const tmpV = new THREE.Vector3();

export class Combat {
  constructor({ scene, world, U, mats, audio }) {
    this.scene = scene; this.w = world; this.U = U; this.audio = audio;
    this.crowd = null; this.traffic = null; this.playerCar = null; this.room = null;
    this.onPlayerHit = null; this.onShake = null; this.onCrime = null; this.onCarHit = null;
    this.player = null;   // { x, y, z } on foot, for blast damage
    this.foot = null;     // the player's body when on foot, for other people's shots: { x, y, z } at the feet
    this.driving = false; // whether the player is in playerCar

    this.glow = glowGeometry(900);
    this.glowMesh = new THREE.Mesh(this.glow, mats.glow);
    this.glowMesh.frustumCulled = false; this.glowMesh.renderOrder = 7;
    scene.add(this.glowMesh);
    this.sparks = [];

    const N = 400;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(N), 1));
    sg.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(N), 1));
    sg.setAttribute("aCol", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sg.setDrawRange(0, 0);
    this.smokeMat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 }, uSkyAmb: U.uSkyAmb, uLightCol: U.uLightCol }, vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false });
    this.smokeMesh = new THREE.Points(sg, this.smokeMat);
    this.smokeMesh.frustumCulled = false; this.smokeMesh.renderOrder = 8;
    scene.add(this.smokeMesh);
    this.smoke = []; this.smokeN = N;

    const T = 96;
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(T * 6), 3));
    tg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(T * 6), 3));
    tg.setDrawRange(0, 0);
    this.tracerMesh = new THREE.LineSegments(tg, new THREE.ShaderMaterial({ vertexShader: TRACER_VS, fragmentShader: TRACER_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracerMesh.frustumCulled = false; this.tracerMesh.renderOrder = 7;
    scene.add(this.tracerMesh);
    this.tracers = []; this.tracerN = T;

    this.projMat = mats.prop.clone();
    this.projMat.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 0.3 }, uLivery: { value: null }, uUseLivery: { value: 0 } };
    const rg = new Geo({ cdata: 2 });
    rg.e.cdata = [0, 0];
    rg.tube([0, 0, 0.25], [0, 0, -0.2], 0.045, 0.045, hex(0x5d6b4a), 8);
    rg.tube([0, 0, -0.2], [0, 0, -0.38], 0.045, 0.005, hex(0xff6018), 8);
    this.rocketGeo = rg.build();
    this.projs = [];
    this.burning = [];
  }

  // Move the effect meshes into whichever scene is being drawn (the city or a room).
  attach(scene) {
    for (const m of [this.glowMesh, this.smokeMesh, this.tracerMesh]) scene.add(m);
    for (const p of this.projs) scene.add(p.mesh);
    this.scene = scene;
  }

  // --------------------------------------------------------------------------- hit tests

  // First thing along a ray from o in unit direction d. Returns { t, kind, obj, x, y, z, nx, ny, nz }.
  ray(o, d, max, ignoreCar = null, shooter = null) {
    let best = { t: max, kind: null };
    const take = (t, kind, obj, n) => { if (t > 0.05 && t < best.t) best = { t, kind, obj, n }; };
    if (this.room) {
      this.rayRoom(o, d, take);
    } else {
      // Someone else's shot can find the player on foot.
      const me = this.foot;
      if (shooter && me) { const t = rayCyl(o, d, me.x, me.z, 0.34, me.y, me.y + 1.8); if (t != null) take(t, "me", me, null); }
      if (this.crowd) for (const p of this.crowd.people) {
        if (p.downT || p.hidden || p === shooter) continue;
        const t = rayCyl(o, d, p.x, p.z, 0.32, p.y, p.y + 1.8);
        if (t != null) take(t, "ped", p, null);
      }
      if (this.traffic) for (const c of this.traffic.cars) {
        if (c === ignoreCar || Math.abs(c.x - o.x) > max + 6 || Math.abs(c.z - o.z) > max + 6) continue;
        const r = rayOBB(o, d, c.x, c.y, c.z, c.yaw, c.hl, c.hw, 1.45);
        if (r) take(r.t, "car", c, r.n);
      }
      const pc = this.playerCar;
      if (pc && pc !== ignoreCar) { const r = rayOBB(o, d, pc.x, pc.y, pc.z, pc.yaw, pc.hl, pc.hw, 1.4); if (r) take(r.t, "mycar", pc, r.n); }
      this.rayWorld(o, d, best.t, take);
    }
    if (!best.kind) return { t: max, kind: null, x: o.x + d.x * max, y: o.y + d.y * max, z: o.z + d.z * max };
    best.x = o.x + d.x * best.t; best.y = o.y + d.y * best.t; best.z = o.z + d.z * best.t;
    return best;
  }

  rayWorld(o, d, max, take) {
    const seen = new Set();
    const steps = Math.ceil(max / 8);
    for (let k = 0; k <= steps; k++) {
      const s = Math.min(max, k * 8);
      const x = o.x + d.x * s, z = o.z + d.z * s;
      for (const [ox, oz] of [[0, 0], [16, 0], [-16, 0], [0, 16], [0, -16]]) {
        const cx = Math.floor((x + ox + HALF) / CHUNK), cz = Math.floor((z + oz + HALF) / CHUNK);
        if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
        const c = this.w.chunk(cx, cz);
        const i = clamp(Math.floor((x + ox - c.x0) / 32), 0, 7), j = clamp(Math.floor((z + oz - c.z0) / 32), 0, 7);
        const cell = c.grid[i + j * 8];
        if (seen.has(cell)) continue;
        seen.add(cell);
        for (const b of cell) {
          if (b.down) continue;
          if (b.r != null) { const t = rayCyl(o, d, b.x, b.z, b.r, -50, b.y1 || 8); if (t != null) take(t, "world", null, null); }
          else { const r = rayAABB(o, d, b.x0, -50, b.z0, b.x1, b.y1, b.z1); if (r) take(r.t, "world", null, r.n); }
        }
      }
    }
    // Ground: march, then refine.
    let prev = 0;
    for (let s = 1; s < max; s += s < 20 ? 0.5 : 2) {
      const x = o.x + d.x * s, y = o.y + d.y * s, z = o.z + d.z * s;
      if (y < this.w.ground(x, z, y + 0.5) && y < this.w.height(x, z) + 0.05 + (this.w.onDeck ? 99 : 0)) {
        let a = prev, b = s;
        for (let it = 0; it < 6; it++) { const m = (a + b) / 2; if (o.y + d.y * m < this.w.height(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m; }
        take(b, "ground", null, [0, 1, 0]);
        return;
      }
      prev = s;
    }
  }

  rayRoom(o, d, take) {
    const R = this.room;
    const lx = o.x - R.ox, lz = o.z - R.oz;
    const lo = { x: lx, y: o.y - R.oy, z: lz };
    for (const b of R.boxes) { const r = rayAABB(lo, d, b.x0, 0, b.z0, b.x1, b.y1, b.z1); if (r) take(r.t, "world", null, r.n); }
    const W = R.W / 2;
    const inside = rayAABBInside(lo, d, -W, 0, -R.D, W, R.H, 0.1);
    if (inside) take(inside.t, "world", null, inside.n);
  }

  // ------------------------------------------------------------------------------ firing

  // One trigger pull: pellets with spread from the muzzle toward the aim point.
  // shooter: "player", "car" (the player firing from the car), or the person firing (a crowd entry).
  // o.dmg scales the damage and o.spread adds to the weapon's own (other people's aim).
  shot(w, from, aim, shooter = "player", o = {}) {
    const dir = tmpV.subVectors(aim, from).normalize().clone();
    const n = w.pellets || 1;
    const mine = shooter === "player" || shooter === "car";
    let hits = 0;
    for (let k = 0; k < n; k++) {
      const d = spreadDir(dir, (w.spread || 0) + (o.spread || 0));
      const h = this.ray(from, d, w.range, shooter === "car" ? this.playerCar : o.ignoreCar || null, mine ? null : shooter);
      this.tracer(from, h, w.cls === "minigun" || w.cls === "lmg" || k === 0);
      this.impact(h, d, w.dmg * (o.dmg || 1), from, mine, w.silent);
      if (h.kind === "ped" || h.kind === "car") hits++;
    }
    this.flash(from, w.silent ? 0.35 : w.cls === "shotgun" || w.cls === "minigun" ? 1.5 : 1);
    if (this.audio) {
      const cam = this.U.uCam.value, dist = Math.hypot(from.x - cam.x, from.z - cam.z);
      this.audio.shot(w.silent ? "silent" : w.cls, mine ? 1 : clamp(1.2 - dist / 120, 0, 0.9));
    }
    // A suppressed shot is heard by nobody; anyone else's draws the street's attention.
    if (!w.silent && this.crowd) this.crowd.alarm(from.x, from.z, 38, from.x, from.z);
    if (mine && !w.silent && this.onCrime) this.onCrime("shots", from);
    return hits;
  }

  impact(h, d, dmg, from, mine = true, silent = false) {
    if (!h.kind) return;
    if (h.kind === "ped") {
      const head = h.y > h.obj.y + 1.55;
      const down = this.crowd.hurt(h.obj, dmg * (head ? 2.2 : 1), from.x, from.z, mine);
      this.puff(h.x, h.y, h.z, 0.25, 0.4, [0.62, 0.6, 0.56], 2);
      if (mine && this.onCrime) this.onCrime(down ? "down" : "hit", h.obj, silent);
      return;
    }
    if (h.kind === "me") { if (this.onPlayerHit) this.onPlayerHit(dmg, from.x, from.z); this.puff(h.x, h.y, h.z, 0.2, 0.3, [0.62, 0.6, 0.56], 2); return; }
    if (h.kind === "car") { this.damageCar(h.obj, dmg, h, mine); this.spark(h.x, h.y, h.z, d, 6, [1, 0.8, 0.45]); return; }
    if (h.kind === "mycar") { if (!mine && this.onCarHit) this.onCarHit(dmg); this.spark(h.x, h.y, h.z, d, 6, [1, 0.8, 0.45]); return; }
    this.spark(h.x, h.y, h.z, d, 4, [1, 0.75, 0.4]);
    this.puff(h.x, h.y, h.z, 0.35, 0.5, h.kind === "ground" ? [0.7, 0.66, 0.58] : [0.78, 0.76, 0.72], 2);
  }

  damageCar(c, dmg, at, mine = true) {
    if (c.hp == null) c.hp = 320;
    if (c.burnt) return;
    c.hp -= dmg;
    // Mission cars keep driving until they're badly hurt, then they're disabled (stall and smoke).
    if (c.ai) { if (c.hp < c.hp0 * 0.3) c.disabled = true; }
    else if (c.mode !== "wreck" && c.hp < 200) { c.mode = "wreck"; c.vx = c.vx || 0; c.vz = c.vz || 0; }
    if (c.hp < (c.ai ? c.hp0 * 0.45 : 140) && !this.burning.includes(c)) this.burning.push(c);
    if (mine && this.onCrime) this.onCrime("car", c);
    if (c.hp <= 0) {
      c.burnt = true;
      c.color = 0x2a2624;
      this.explode(c.x, c.y + 0.8, c.z, 1.2, at);
    }
  }

  // Melee: anyone in a cone in front, close enough.
  swing(w, x, y, z, fx, fz) {
    let hit = false;
    if (this.crowd) for (const p of this.crowd.people) {
      if (p.downT || p.hidden) continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (d > w.range + 0.3 || (dx * fx + dz * fz) / (d || 1) < 0.55) continue;
      this.crowd.hurt(p, w.dmg, x, z, true);
      if (this.onCrime) this.onCrime(p.downT ? "down" : "hit", p);
      hit = true;
    }
    if (this.traffic) for (const c of this.traffic.cars) {
      const dx = c.x - x, dz = c.z - z;
      if (Math.hypot(dx, dz) < w.range + c.hw && (dx * fx + dz * fz) > 0) { this.damageCar(c, w.dmg * 0.4, c); hit = true; }
    }
    if (this.audio) this.audio.swing(hit);
    if (hit && this.crowd) this.crowd.alarm(x, z, 15, x, z);
    return hit;
  }

  // kind: rocket, shell (grenade launcher), grenade, emp (Kill Switch shell), sticky (Sticky Note charge).
  launch(kind, from, vel, by = "player") {
    const geo = kind === "rocket" ? this.rocketGeo : kind === "sticky" ? weaponGeometry("stickynote") || weaponGeometry("mergeconflict") : weaponGeometry("mergeconflict");
    const mesh = new THREE.Mesh(geo, this.projMat);
    mesh.frustumCulled = false;
    if (kind === "shell" || kind === "emp") mesh.scale.setScalar(1.3);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.projs.push({ kind, by, p: from.clone(), v: vel.clone(), mesh, t: 0, fuse: kind === "grenade" ? 2.6 : kind === "sticky" ? Infinity : 8, bounces: 0 });
    if (this.audio) this.audio.launch(kind);
    if (this.crowd && kind === "rocket") this.crowd.alarm(from.x, from.z, 40, from.x, from.z);
  }

  explode(x, y, z, power = 1, at = null, by = "player") {
    const R = 7.5 * power;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * 6.28, r = Math.random() * 1.6 * power;
      this.sparks.push({ x: x + Math.cos(a) * r, y: y + Math.random() * 1.5, z: z + Math.sin(a) * r, vx: Math.cos(a) * 2, vy: 2 + Math.random() * 3, vz: Math.sin(a) * 2, g: -1, life: 0.5 + Math.random() * 0.4, max: 0.9, size: (2.5 + Math.random() * 2.5) * power, col: [1, 0.5 + Math.random() * 0.25, 0.15], k: 5 });
    }
    this.sparks.push({ x, y: y + 0.5, z, vx: 0, vy: 0, vz: 0, g: 0, life: 0.35, max: 0.35, size: 14 * power, col: [1, 0.75, 0.45], k: 8 });
    this.spark(x, y, z, new THREE.Vector3(0, 1, 0), 26, [1, 0.6, 0.25], 14);
    for (let k = 0; k < 16; k++) this.puff(x + (Math.random() - 0.5) * 3, y + Math.random() * 2, z + (Math.random() - 0.5) * 3, 2.4 * power, 3.5 + Math.random() * 2, [0.22, 0.21, 0.2], 1.6 + Math.random() * 1.5);
    if (this.audio) this.audio.boom(power);
    if (this.onShake) this.onShake(clamp(1.4 - Math.hypot(x - this.U.uCam.value.x, z - this.U.uCam.value.z) / 60, 0, 1));
    if (this.crowd) {
      for (const p of this.crowd.people) {
        if (p.hidden) continue;
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < R) { this.crowd.hurt(p, 260 * (1 - d / R), x, z, by === "player"); if (p.downT && by === "player" && this.onCrime) this.onCrime("down", p); }
      }
      this.crowd.alarm(x, z, 60, x, z);
    }
    if (this.traffic) for (const c of this.traffic.cars) {
      if (c.burnt) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < R + 1) {
        if (c.mode !== "wreck") { c.mode = "wreck"; c.vx = 0; c.vz = 0; }
        const k = (1 - d / (R + 1)) * 9;
        c.vx += ((c.x - x) / (d || 1)) * k; c.vz += ((c.z - z) / (d || 1)) * k; c.r += (Math.random() - 0.5) * k * 0.3;
        // Chain reactions, a beat later.
        setTimeout(() => this.damageCar(c, 650 * (1 - d / (R + 1)), c, by === "player"), 180 + Math.random() * 300);
      }
    }
    const pl = this.player;
    if (pl && this.onPlayerHit) {
      const d = Math.hypot(pl.x - x, pl.y - y, pl.z - z);
      // Inside the car the body takes most of it.
      if (d < R) this.onPlayerHit(130 * (1 - d / R) * (this.driving ? 0.25 : 1), x, z);
      if (d < R + 1 && this.driving && this.onCarHit) this.onCarHit(700 * (1 - d / (R + 1)));
    }
    if (by === "player" && this.onCrime) this.onCrime("blast", { x, z });
  }

  // Set off every Sticky Note the player has planted. Returns how many went.
  detonate() {
    let n = 0;
    for (const pr of this.projs) if (pr.kind === "sticky" && pr.stuck && !pr.go) { pr.go = true; n++; }
    return n;
  }
  get planted() { return this.projs.filter((pr) => pr.kind === "sticky" && !pr.dead).length; }

  // The Kill Switch: an electric pulse that stalls every car near it.
  pulse(x, y, z, R = 8) {
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2;
      this.sparks.push({ x, y: y + 0.3, z, vx: Math.cos(a) * 14, vy: 0.6, vz: Math.sin(a) * 14, g: 0, life: 0.45, max: 0.45, size: 0.5, col: [0.45, 0.8, 1], k: 9 });
    }
    this.sparks.push({ x, y: y + 0.5, z, vx: 0, vy: 0, vz: 0, g: 0, life: 0.4, max: 0.4, size: 9, col: [0.5, 0.8, 1], k: 6 });
    if (this.audio) this.audio.boom(0.35);
    const hit = (c) => Math.hypot(c.x - x, c.z - z) < R + (c.hl || 2);
    if (this.traffic) for (const c of this.traffic.cars) if (!c.burnt && hit(c)) c.emp = 8;
    if (this.playerCar && hit(this.playerCar)) this.playerCar.emp = 3;
    if (this.crowd) this.crowd.alarm(x, z, 20, x, z);
  }

  // ---------------------------------------------------------------------------- effects

  flash(p, k = 1) {
    this.sparks.push({ x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, g: 0, life: 0.05, max: 0.05, size: 0.55 * k, col: [1, 0.78, 0.45], k: 12 });
  }

  spark(x, y, z, d, n, col, speed = 5) {
    for (let k = 0; k < n; k++) {
      this.sparks.push({ x, y, z, vx: -d.x * speed * 0.5 + (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.6, vz: -d.z * speed * 0.5 + (Math.random() - 0.5) * speed, g: 9.8, life: 0.15 + Math.random() * 0.3, max: 0.45, size: 0.06 + Math.random() * 0.06, col, k: 6 });
    }
  }

  puff(x, y, z, size, life, col, rise = 1) {
    if (this.smoke.length >= this.smokeN) this.smoke.shift();
    this.smoke.push({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: rise * (0.4 + Math.random() * 0.4), vz: (Math.random() - 0.5) * 0.6, size, grow: size * 0.9, life, max: life, col });
  }

  tracer(from, h, show) {
    if (!show) return;
    if (this.tracers.length >= this.tracerN) this.tracers.shift();
    const len = Math.min(h.t, 400), start = Math.min(1.2, len * 0.3);
    const d = new THREE.Vector3(h.x - from.x, h.y - from.y, h.z - from.z).normalize();
    this.tracers.push({ a: from.clone().addScaledVector(d, start), b: new THREE.Vector3(h.x, h.y, h.z), life: 0.06 });
  }

  update(dt, camera, viewportH) {
    // Projectiles.
    for (const pr of this.projs) {
      pr.t += dt;
      // A planted charge rides whatever it stuck to.
      if (pr.stuck) {
        const s = pr.stuck, c = s.car;
        if (c) {
          if (c !== this.playerCar && !this.traffic.cars.includes(c)) pr.stuck = { car: null };
          else {
            const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
            pr.p.set(c.x + s.lx * cs + s.lz * sn, c.y + s.ly, c.z - s.lx * sn + s.lz * cs);
          }
        }
        pr.mesh.position.copy(pr.p);
        if (pr.go) { this.scene.remove(pr.mesh); pr.dead = true; this.explode(pr.p.x, pr.p.y, pr.p.z, 1.15, null, pr.by); }
        continue;
      }
      const g = pr.kind === "rocket" ? 0 : 9.8;
      pr.v.y -= g * dt;
      const step = pr.v.length() * dt;
      const d = pr.v.clone().normalize();
      const h = this.ray(pr.p, d, step + 0.2);
      if (h.kind && pr.kind === "sticky") {
        // Sticks where it lands: to a car (and moves with it) or to a wall or the road.
        const p = new THREE.Vector3(h.x, h.y, h.z).addScaledVector(d, -0.06);
        pr.p.copy(p); pr.v.set(0, 0, 0);
        const c = h.kind === "car" ? h.obj : h.kind === "mycar" ? this.playerCar : null;
        if (c) {
          const dx = p.x - c.x, dz = p.z - c.z, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
          pr.stuck = { car: c, lx: dx * cs - dz * sn, lz: dx * sn + dz * cs, ly: p.y - c.y };
        } else pr.stuck = { car: null };
        pr.mesh.position.copy(pr.p);
        if (this.audio) this.audio.click();
        continue;
      }
      if (h.kind) {
        if (pr.kind === "grenade" && (h.kind === "world" || h.kind === "ground" || h.kind === "mycar")) {
          const n = new THREE.Vector3(...(h.n || [0, 1, 0]));
          pr.p.set(h.x, h.y, h.z).addScaledVector(n, 0.08);
          pr.v.reflect(n).multiplyScalar(0.38);
          pr.bounces++;
          if (pr.v.length() < 1) pr.v.set(0, 0, 0);
        } else { pr.fuse = 0; pr.p.set(h.x, h.y, h.z).addScaledVector(d, -0.3); }
      } else pr.p.addScaledVector(pr.v, dt);
      if (pr.kind === "grenade" && pr.v.lengthSq() === 0) pr.p.y = Math.max(pr.p.y, (this.room ? this.room.oy : this.w.ground(pr.p.x, pr.p.z, pr.p.y + 1)) + 0.05);
      pr.mesh.position.copy(pr.p);
      if (pr.kind === "rocket") {
        pr.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), d);
        this.sparks.push({ x: pr.p.x, y: pr.p.y, z: pr.p.z, vx: 0, vy: 0, vz: 0, g: 0, life: 0.08, max: 0.08, size: 0.6, col: [1, 0.7, 0.35], k: 8 });
        this.puff(pr.p.x - d.x * 0.4, pr.p.y, pr.p.z - d.z * 0.4, 0.5, 1.4, [0.8, 0.78, 0.74], 0.2);
      } else pr.mesh.rotation.x += dt * 9;
      pr.fuse -= dt;
      if (pr.fuse <= 0 || (pr.t > 9 && pr.kind !== "sticky")) {
        this.scene.remove(pr.mesh);
        pr.dead = true;
        if (pr.kind === "emp") this.pulse(pr.p.x, pr.p.y, pr.p.z);
        else this.explode(pr.p.x, pr.p.y, pr.p.z, pr.kind === "grenade" ? 0.9 : 1.1, null, pr.by);
      }
    }
    this.projs = this.projs.filter((p) => !p.dead);

    // Burning wrecks smoke and flicker.
    this.burning = this.burning.filter((c) => this.traffic && this.traffic.cars.includes(c));
    for (const c of this.traffic ? this.traffic.cars : []) if (c.emp > 0 && Math.random() < dt * 8) this.sparks.push({ x: c.x + (Math.random() - 0.5) * 1.5, y: c.y + 1, z: c.z + (Math.random() - 0.5) * 3, vx: 0, vy: 1, vz: 0, g: 0, life: 0.15, max: 0.15, size: 0.3, col: [0.5, 0.85, 1], k: 8 });
    for (const c of this.burning) {
      if (Math.random() < dt * (c.burnt ? 10 : 4)) this.puff(c.x + (Math.random() - 0.5), c.y + 1.2, c.z + (Math.random() - 0.5), c.burnt ? 1.4 : 0.8, 3, c.burnt ? [0.16, 0.15, 0.14] : [0.45, 0.44, 0.42], 1.4);
      if (c.burnt && Math.random() < dt * 14) this.sparks.push({ x: c.x + (Math.random() - 0.5) * 1.6, y: c.y + 0.9, z: c.z + (Math.random() - 0.5) * 2.4, vx: 0, vy: 1.6, vz: 0, g: -0.5, life: 0.5, max: 0.5, size: 0.7 + Math.random() * 0.6, col: [1, 0.45, 0.12], k: 4 });
    }

    // Glows.
    let n = 0;
    for (const s of this.sparks) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vy -= s.g * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (n < 896) { const f = s.life / s.max; setGlow(this.glow, n++, s.x, s.y, s.z, s.col, 1, s.size * (0.6 + 0.4 * f), 0, -1, s.k * f, s.y - 1); }
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    this.glow.instanceCount = n;
    for (const k of ["iPos", "iCol", "iP", "iG"]) this.glow.attributes[k].needsUpdate = true;

    // Smoke.
    const sg = this.smokeMesh.geometry, P = sg.attributes.position.array, S = sg.attributes.aSize.array, A = sg.attributes.aAlpha.array, Cc = sg.attributes.aCol.array;
    let m = 0;
    for (const s of this.smoke) {
      s.life -= dt;
      if (s.life <= 0) continue;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vy *= 1 - dt * 0.3;
      const f = 1 - s.life / s.max;
      P[m * 3] = s.x; P[m * 3 + 1] = s.y; P[m * 3 + 2] = s.z;
      S[m] = s.size + s.grow * f * 2; A[m] = Math.min(1, (1 - f) * 2.2) * 0.55 * Math.min(1, f * 12);
      Cc[m * 3] = s.col[0]; Cc[m * 3 + 1] = s.col[1]; Cc[m * 3 + 2] = s.col[2];
      m++;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0);
    sg.setDrawRange(0, m);
    for (const k of ["position", "aSize", "aAlpha", "aCol"]) sg.attributes[k].needsUpdate = true;
    this.smokeMat.uniforms.uScale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));

    // Tracers.
    const tg = this.tracerMesh.geometry, TP = tg.attributes.position.array, TC = tg.attributes.color.array;
    let t = 0;
    for (const tr of this.tracers) {
      tr.life -= dt;
      if (tr.life <= 0) continue;
      TP.set([tr.a.x, tr.a.y, tr.a.z, tr.b.x, tr.b.y, tr.b.z], t * 6);
      const k = (tr.life / 0.06) * 6;
      TC.set([k, k * 0.78, k * 0.45, k * 0.25, k * 0.2, k * 0.12], t * 6);
      t++;
    }
    this.tracers = this.tracers.filter((tr) => tr.life > 0);
    tg.setDrawRange(0, t * 2);
    tg.attributes.position.needsUpdate = true; tg.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------- geometry

function spreadDir(d, s) {
  if (!s) return d.clone();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s;
  const up = Math.abs(d.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(d, up).normalize(), v = new THREE.Vector3().crossVectors(u, d);
  return d.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r).normalize();
}

function rayCyl(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z, b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - r * r;
  if (a < 1e-8) return null;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const y = o.y + d.y * t;
  return y >= y0 && y <= y1 ? t : null;
}

function rayAABB(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, n = null;
  const ax = [[o.x, d.x, x0, x1, 0], [o.y, d.y, y0, y1, 1], [o.z, d.z, z0, z1, 2]];
  for (const [p, v, lo, hi, i] of ax) {
    if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    const tn = v > 0 ? (lo - p) / v : (hi - p) / v, tf = v > 0 ? (hi - p) / v : (lo - p) / v;
    if (tn > tmin) { tmin = tn; n = [0, 0, 0]; n[i] = v > 0 ? -1 : 1; }
    tmax = Math.min(tmax, tf);
    if (tmin > tmax) return null;
  }
  if (tmin < 0) return null;
  return { t: tmin, n };
}

// Leaving a box from inside (the walls, floor and ceiling of a room).
function rayAABBInside(o, d, x0, y0, z0, x1, y1, z1) {
  let t = Infinity, n = null;
  const ax = [[o.x, d.x, x0, x1, 0], [o.y, d.y, y0, y1, 1], [o.z, d.z, z0, z1, 2]];
  for (const [p, v, lo, hi, i] of ax) {
    if (Math.abs(v) < 1e-9) continue;
    const tt = v > 0 ? (hi - p) / v : (lo - p) / v;
    if (tt < t) { t = tt; n = [0, 0, 0]; n[i] = v > 0 ? -1 : 1; }
  }
  return t < Infinity ? { t, n } : null;
}

function rayOBB(o, d, cx, cy, cz, yaw, hl, hw, h) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // Car frame: forward (-sin, -cos), right (cos, -sin).
  const px = o.x - cx, pz = o.z - cz;
  const lo = { x: px * c - pz * s, y: o.y - cy, z: px * s + pz * c };
  const ld = { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c };
  const r = rayAABB(lo, ld, -hw, 0.1, -hl, hw, h, hl);
  if (!r) return null;
  const n = r.n;
  return { t: r.t, n: [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c] };
}
