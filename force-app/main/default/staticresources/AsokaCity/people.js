// People: Microsoft Rocketbox avatars (MIT; see AsokaCityPeople*/ROCKETBOX-LICENSE.md) on the pavements and as
// the player's own character. Standing poses come from Rocketbox motion capture; walking and jogging are
// generated here on the Bip01 rig, with each joint rotated about the body's own axes (measured from the
// rest pose), so the same gait fits every avatar.
import * as THREE from "./three.module.min.js";
import { GLTFLoader } from "./GLTFLoader.js";
import { clone as cloneSkinned } from "./SkeletonUtils.js";
import { PERSON_VS, PERSON_FS } from "./shaders.js";
import { PEOPLE } from "./peoplelist.js";
import { HALF, CHUNK, NCH } from "./map.js";
import { clamp, lerp, rng, angleWrap } from "./util.js";

export { PEOPLE };
const loader = new GLTFLoader();
const glbs = new Map();
const clips = new Map();

function resOf(pack) { return (window.AC_RES || {})[pack]; }

export function loadPerson(id) {
  if (!glbs.has(id)) {
    const p = PEOPLE.find((x) => x.id === id);
    glbs.set(id, p && resOf(p.pack) ? loader.loadAsync(`${resOf(p.pack)}/${id}.glb`).catch((e) => { console.warn("person failed", id, e); return null; }) : Promise.resolve(null));
  }
  return glbs.get(id);
}

function decodeClip(j) {
  const tracks = [], times = new Float32Array(j.frames);
  for (let i = 0; i < j.frames; i++) times[i] = i / j.fps;
  for (const t of j.tracks) {
    if (!t.b.startsWith("Bip01") || /Footsteps/.test(t.b) || t.b === "Bip01") continue;
    const name = `${t.b}.${t.p === "q" ? "quaternion" : "position"}`;
    if (t.p === "p" && t.b !== "Bip01_Pelvis") continue;
    if (t.c) { tracks.push(t.p === "q" ? new THREE.QuaternionKeyframeTrack(name, [0], t.c) : new THREE.VectorKeyframeTrack(name, [0], t.c)); continue; }
    const bin = Uint8Array.from(atob(t.d), (c) => c.charCodeAt(0));
    if (t.p === "q") { const i16 = new Int16Array(bin.buffer), f = new Float32Array(i16.length); for (let i = 0; i < f.length; i++) f[i] = i16[i] / 32767; tracks.push(new THREE.QuaternionKeyframeTrack(name, times, f)); }
    else tracks.push(new THREE.VectorKeyframeTrack(name, times, new Float32Array(bin.buffer)));
  }
  return new THREE.AnimationClip(j.name, j.duration, tracks);
}

export function loadClip(name) {
  if (!clips.has(name)) {
    const base = resOf("AsokaCityMoves");
    clips.set(name, base ? fetch(`${base}/${name}.json`).then((r) => r.json()).then(decodeClip).catch(() => null) : Promise.resolve(null));
  }
  return clips.get(name);
}

// One shader material per avatar texture, sharing the city's lighting uniforms.
function personMaterials(root, U) {
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.layers.enable(1);
    const m = o.material;
    if (!cache.has(m)) {
      const kind = m.name;
      cache.set(m, new THREE.ShaderMaterial({
        uniforms: { ...U, uMap: { value: m.map }, uAlphaCut: { value: kind === "hair" ? 0.5 : kind === "glasses" ? 0.3 : 0 }, uSkin: { value: kind === "head" ? 1 : 0.4 } },
        vertexShader: PERSON_VS, fragmentShader: PERSON_FS,
        side: kind === "hair" || kind === "glasses" ? THREE.DoubleSide : THREE.FrontSide,
      }));
    }
    o.material = cache.get(m);
  });
}

const X = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3();

// Rotate a bone about an axis given in the person's own frame (the holder's local space).
function turn(bone, axisLocal, angle, holderQ) {
  if (!angle) return;
  bone.parent.getWorldQuaternion(tq);
  tq.invert();
  tv.copy(axisLocal).applyQuaternion(holderQ).applyQuaternion(tq).normalize();
  tq2.setFromAxisAngle(tv, angle);
  bone.quaternion.premultiply(tq2);
}

export class Person {
  static async create(id, U) {
    const g = await loadPerson(id);
    if (!g) return null;
    const p = new Person(id, g, U);
    await p.init();
    return p;
  }

  constructor(id, gltf, U) {
    this.id = id;
    this.info = PEOPLE.find((x) => x.id === id);
    this.holder = new THREE.Group();     // position + heading in the world (forward is -z)
    this.inner = cloneSkinned(gltf.scene);
    personMaterials(this.inner, U);
    this.holder.add(this.inner);
    this.bones = {};
    this.inner.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    this.mixer = new THREE.AnimationMixer(this.inner);
    this.phase = Math.random() * 6.28;
    this.walkW = 0; this.runW = 0; this.lean = 0; this.dive = 0;
  }

  async init() {
    const g = this.info.g;
    const idle = await loadClip(`${g}_idle_neutral`) || await loadClip("m_idle_neutral");
    if (idle) { this.idle = this.mixer.clipAction(idle); this.idle.play(); this.idle.time = Math.random() * idle.duration; }
    this.mixer.update(0);
    this.inner.updateMatrixWorld(true);
    // Face the avatar down -z: its forward is the foot -> toe direction.
    const B = this.bones;
    const foot = B.Bip01_L_Foot, toe = B.Bip01_L_Toe0;
    const fw = new THREE.Vector3();
    if (foot && toe) fw.copy(toe.getWorldPosition(tv)).sub(foot.getWorldPosition(tv2)).setY(0).normalize();
    else fw.set(0, 0, 1);
    this.inner.rotation.y = Math.PI - Math.atan2(fw.x, fw.z);
    this.inner.updateMatrixWorld(true);
    // Left is from the right thigh to the left thigh; the gait's swing axis.
    const l = B.Bip01_L_Thigh.getWorldPosition(new THREE.Vector3()).sub(B.Bip01_R_Thigh.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    this.L = l;
    this.F = new THREE.Vector3(0, 0, -1);
    const hq = new THREE.Quaternion();
    // Signs: which way each joint must turn for the knee/hand to go forward.
    const probe = (bone, child, wantForward) => {
      const before = child.getWorldPosition(new THREE.Vector3());
      const save = bone.quaternion.clone();
      turn(bone, this.L, 0.3, hq);
      this.inner.updateMatrixWorld(true);
      const after = child.getWorldPosition(new THREE.Vector3());
      bone.quaternion.copy(save);
      this.inner.updateMatrixWorld(true);
      const d = after.sub(before).dot(this.F);
      return (d > 0) === wantForward ? 1 : -1;
    };
    this.sThigh = probe(B.Bip01_L_Thigh, B.Bip01_L_Calf, true);
    this.sCalf = probe(B.Bip01_L_Calf, B.Bip01_L_Foot, false);
    this.sArmL = probe(B.Bip01_L_UpperArm, B.Bip01_L_Hand, true);
    this.sArmR = probe(B.Bip01_R_UpperArm, B.Bip01_R_Hand, true);
    this.sFore = probe(B.Bip01_L_Forearm, B.Bip01_L_Hand, true);
    this.sForeR = probe(B.Bip01_R_Forearm, B.Bip01_R_Hand, true);
    this.height = B.Bip01_Head ? B.Bip01_Head.getWorldPosition(new THREE.Vector3()).y : 1.6;
  }

  playIdle(name) {
    loadClip(name).then((c) => {
      if (!c) return;
      const a = this.mixer.clipAction(c);
      a.reset().play();
      if (this.idle && this.idle !== a) a.crossFadeFrom(this.idle, 0.4, false);
      this.idle = a;
    });
  }

  // speed in m/s; run = 0..1 blend toward a jog.
  update(dt, speed, run = 0) {
    const want = clamp(speed / 1.2, 0, 1);
    this.walkW = lerp(this.walkW, want, Math.min(1, dt * 6));
    this.runW = lerp(this.runW, run, Math.min(1, dt * 4));
    const stride = lerp(1.45, 2.6, this.runW);
    this.phase += ((speed / stride) * Math.PI * 2) * dt;
    this.mixer.update(dt);
    if (this.walkW < 0.01 && this.dive <= 0) return;
    this.holder.updateMatrixWorld(true);
    const B = this.bones, w = this.walkW, r = this.runW, ph = this.phase, L = this.L;
    const hq = this.holder.quaternion;
    const thighA = lerp(0.4, 0.78, r) * w, calfA = lerp(0.95, 1.45, r) * w;
    const armA = lerp(0.32, 0.62, r) * w, foreA = lerp(0.22, 1.35, r) * w;
    const s = Math.sin(ph), c = Math.cos(ph);
    turn(B.Bip01_L_Thigh, L, this.sThigh * thighA * s, hq);
    turn(B.Bip01_R_Thigh, L, -this.sThigh * thighA * s, hq);
    turn(B.Bip01_L_Calf, L, this.sCalf * (calfA * Math.pow(Math.max(0, c), 1.4) + 0.06 * w), hq);
    turn(B.Bip01_R_Calf, L, this.sCalf * (calfA * Math.pow(Math.max(0, -c), 1.4) + 0.06 * w), hq);
    turn(B.Bip01_L_Foot, L, -this.sCalf * 0.22 * w * Math.max(0, -s), hq);
    turn(B.Bip01_R_Foot, L, -this.sCalf * 0.22 * w * Math.max(0, s), hq);
    turn(B.Bip01_L_UpperArm, L, -this.sArmL * armA * s, hq);
    turn(B.Bip01_R_UpperArm, L, this.sArmR * armA * s, hq);
    turn(B.Bip01_L_Forearm, L, this.sFore * (foreA * 0.6 + foreA * 0.4 * Math.max(0, -s)), hq);
    turn(B.Bip01_R_Forearm, L, this.sForeR * (foreA * 0.6 + foreA * 0.4 * Math.max(0, s)), hq);
    if (B.Bip01_Spine) {
      turn(B.Bip01_Spine, Y, 0.07 * w * s, hq);
      turn(B.Bip01_Spine, L, -this.sThigh * 0.16 * r * w, hq);
    }
    this.inner.position.y = -0.03 * w * (1 - Math.abs(Math.cos(ph))) * (1 + r);
    if (this.dive > 0) {
      // Jumping out of the way: a quick sideways hop with the arms up.
      const k = Math.sin(Math.min(1, this.dive) * Math.PI);
      this.inner.position.y += 0.25 * k;
    }
  }
}

// ------------------------------------------------------------------------------------- crowd

const URBAN = new Set(["console", "uptown", "cadence", "sandbox", "scratch", "preview", "gardens", "meridian", "park", "docks"]);
const tmp = {};

export class Crowd {
  constructor(world, scene, U, districtAt) {
    this.w = world; this.scene = scene; this.U = U; this.districtAt = districtAt;
    this.people = [];
    this.pool = [];
    this.max = 26;
    this.r = rng(91);
    this.spawning = false;
  }

  async spawnOne(cam) {
    const r = this.r;
    const pcx = Math.floor((cam.x + HALF) / CHUNK), pcz = Math.floor((cam.z + HALF) / CHUNK);
    for (let tries = 0; tries < 10; tries++) {
      const cx = pcx + r.int(-1, 1), cz = pcz + r.int(-1, 1);
      if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
      const segs = this.w.chunkSegs[cx + cz * NCH];
      if (!segs.length) continue;
      const { e, i } = segs[r.int(0, segs.length - 1)];
      if (!e.main || e.type === 2) continue;
      const p = e.rib[i];
      if (!URBAN.has(this.districtAt(p.x, p.z)) || p.y - this.w.height(p.x, p.z) > 0.4) continue;
      const side = r() < 0.5 ? -1 : 1;
      const off = (e.hw + 2.4) * side;
      this.w.edgePoint(e, p.s, off, tmp);
      const d = Math.hypot(tmp.x - cam.x, tmp.z - cam.z);
      if (d < 35 || d > 120) continue;
      if (this.people.some((q) => Math.hypot(q.x - tmp.x, q.z - tmp.z) < 4)) continue;
      const id = PEOPLE[r.int(0, PEOPLE.length - 1)].id;
      const person = await Person.create(id, this.U);
      if (!person) return;
      this.scene.add(person.holder);
      const standing = r() < 0.22;
      const dir = r() < 0.5 ? 1 : -1;
      const ped = { person, e, s: p.s, walkSide: side * dir, dir, x: tmp.x, z: tmp.z, y: this.w.height(tmp.x, tmp.z) + 0.15,
        yaw: Math.atan2(-tmp.tx * dir, -tmp.tz * dir), speed: standing ? 0 : r.range(1.1, 1.55), cruise: 0, standing, flee: 0, fleeX: 0, fleeZ: 0 };
      ped.cruise = ped.speed;
      if (standing) {
        ped.yaw = Math.atan2(-tmp.tz * side, tmp.tx * side) + r.range(-0.5, 0.5);
        const g = person.info.g;
        const pick = r();
        person.playIdle(pick < 0.35 && g === "m" ? "m_cell_phone_talk" : pick < 0.6 ? `${g}_gestic_listen_neutral` : `${g}_idle_neutral`);
      }
      this.people.push(ped);
      return;
    }
  }

  nextEdge(ped) {
    const node = ped.dir > 0 ? ped.e.b : ped.e.a;
    const opts = node.edges.filter((x) => x !== ped.e && x.main && x.type !== 2);
    if (!opts.length) { ped.dir = -ped.dir; return; }
    const e = opts[this.r.int(0, opts.length - 1)];
    const dir = e.a === node ? 1 : -1;
    ped.e = e; ped.dir = dir; ped.s = dir > 0 ? e.sA : e.sB;
  }

  update(dt, cam, car, walker) {
    if (!this.spawning && this.people.length < this.max) {
      this.spawning = true;
      this.spawnOne(cam).finally(() => { this.spawning = false; });
    }
    this.people = this.people.filter((p) => {
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < 150) return true;
      this.scene.remove(p.person.holder);
      return false;
    });
    const carSpeed = car ? Math.hypot(car.vx, car.vz) : 0;
    for (const p of this.people) {
      // Cars coming at you: get out of the way.
      if (car && carSpeed > 3 && !p.flee) {
        const dx = p.x - car.x, dz = p.z - car.z, d = Math.hypot(dx, dz);
        if (d < 4 + carSpeed * 0.5) {
          const vx = car.vx / carSpeed, vz = car.vz / carSpeed;
          const ahead = dx * vx + dz * vz, lat = dx * vz - dz * vx;
          if (ahead > -1 && Math.abs(lat) < 3.2) {
            const sgn = lat >= 0 ? 1 : -1;
            p.flee = 1.4; p.fleeX = vz * sgn; p.fleeZ = -vx * sgn;
            p.person.dive = 0.01;
          }
        }
      }
      let speed = p.speed, run = 0;
      if (p.flee > 0) {
        p.flee = Math.max(0, p.flee - dt);
        const k = Math.min(1, p.flee);
        p.x += p.fleeX * 5.5 * k * dt; p.z += p.fleeZ * 5.5 * k * dt;
        p.yaw = Math.atan2(-p.fleeX, -p.fleeZ);
        p.person.dive = p.flee > 0.8 ? 1 - (p.flee - 0.8) / 0.6 : 0;
        speed = 3.5 * k; run = 1;
        if (p.flee === 0) { p.person.dive = 0; this.rejoin(p); }
      } else if (!p.standing) {
        p.s += p.speed * dt * p.dir;
        const end = p.dir > 0 ? p.e.sB : p.e.sA;
        if ((p.dir > 0 && p.s >= end) || (p.dir < 0 && p.s <= end)) this.nextEdge(p);
        this.w.edgePoint(p.e, p.s, (p.e.hw + 2.4) * p.walkSide * p.dir, tmp);
        const ty = Math.atan2(-tmp.tx * p.dir, -tmp.tz * p.dir);
        p.yaw += angleWrap(ty - p.yaw) * Math.min(1, dt * 5);
        p.x = lerp(p.x, tmp.x, Math.min(1, dt * 4)); p.z = lerp(p.z, tmp.z, Math.min(1, dt * 4));
      }
      // Bumped by the player on foot.
      if (walker) {
        const dx = p.x - walker.x, dz = p.z - walker.z, d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-3) { p.x += (dx / d) * (0.7 - d); p.z += (dz / d) * (0.7 - d); }
      }
      p.y = lerp(p.y, this.w.height(p.x, p.z) + 0.15, Math.min(1, dt * 8));
      p.person.holder.position.set(p.x, p.y, p.z);
      p.person.holder.rotation.y = p.yaw;
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < 90) p.person.update(dt, speed, run);
    }
  }

  // After dodging, carry on along the nearest pavement.
  rejoin(p) {
    const n = this.w.nearestRoad(p.x, p.z, true);
    if (!n) return;
    p.e = n.e; p.s = n.s;
    const pt = this.w.edgePoint(n.e, n.s, 0);
    const side = ((p.x - pt.x) * -pt.tz + (p.z - pt.z) * pt.tx) >= 0 ? 1 : -1;
    p.dir = 1; p.walkSide = side;
  }
}
