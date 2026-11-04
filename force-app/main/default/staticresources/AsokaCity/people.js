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
        uniforms: { ...U, uMap: { value: m.map }, uAlphaCut: { value: kind === "hair" ? 0.5 : kind === "glasses" ? 0.3 : 0 }, uSkin: { value: kind === "head" ? 1 : 0.4 }, uSoft: { value: 0 } },
        vertexShader: PERSON_VS, fragmentShader: PERSON_FS,
        side: kind === "hair" || kind === "glasses" ? THREE.DoubleSide : THREE.FrontSide,
      }));
    }
    o.material = cache.get(m);
  });
}

const X = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _el = new THREE.Vector3(), _t = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

// Turn a bone so its child direction `from` (world) points along `to` (world).
function aimBone(bone, from, to) {
  _qa.setFromUnitVectors(from.normalize(), to.normalize());
  bone.parent.getWorldQuaternion(_qp);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_qa);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

// Two-bone reach: upper arm and forearm so the hand lands on target, the elbow bending toward pole.
function reach(upper, fore, hand, target, pole) {
  upper.getWorldPosition(_S); fore.getWorldPosition(_E); hand.getWorldPosition(_H);
  const a = _S.distanceTo(_E), b = _E.distanceTo(_H);
  _d.subVectors(target, _S);
  const d = clamp(_d.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  _d.normalize();
  const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  _el.copy(_S).addScaledVector(_d, a * cosA).addScaledVector(_p, a * sinA);
  aimBone(upper, _v1.subVectors(_E, _S), _v2.subVectors(_el, _S));
  fore.getWorldPosition(_E); hand.getWorldPosition(_H);
  _t.copy(_S).addScaledVector(_d, d);
  aimBone(fore, _v1.subVectors(_H, _E), _v2.subVectors(_t, _E));
}

const LEGS = ["Bip01_L_Thigh", "Bip01_R_Thigh", "Bip01_L_Calf", "Bip01_R_Calf", "Bip01_L_Foot", "Bip01_R_Foot", "Bip01_L_Toe0", "Bip01_R_Toe0"];

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
    this.arms = null;   // optional pose: (person) => ({ w, right, left, poleR, poleL }) in world space
    this.down = 0;      // 0 standing .. 1 lying flat
  }

  // World-space shoulders and the body's axes, for posing the arms.
  frame() {
    const B = this.bones;
    const r = B.Bip01_R_UpperArm.getWorldPosition(new THREE.Vector3()), l = B.Bip01_L_UpperArm.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.holder.quaternion);
    const right = new THREE.Vector3().subVectors(r, l).normalize();
    return { r, l, fwd, right, up: new THREE.Vector3(0, 1, 0), chest: r.clone().add(l).multiplyScalar(0.5) };
  }

  hand(side = "R") { return this.bones[`Bip01_${side}_Hand`].getWorldPosition(new THREE.Vector3()); }

  applyArms() {
    const pose = this.arms && this.arms(this);
    if (!pose || pose.w < 0.01) return;
    const B = this.bones;
    const sides = [["R", pose.right, pose.poleR]];
    if (pose.left) sides.push(["L", pose.left, pose.poleL]);
    for (const [s, target, pole] of sides) {
      const up = B[`Bip01_${s}_UpperArm`], fo = B[`Bip01_${s}_Forearm`], ha = B[`Bip01_${s}_Hand`];
      const q0 = up.quaternion.clone(), q1 = fo.quaternion.clone();
      reach(up, fo, ha, target, pole);
      if (pose.w < 0.999) { up.quaternion.slerpQuaternions(q0, up.quaternion.clone(), pose.w); fo.quaternion.slerpQuaternions(q1, fo.quaternion.clone(), pose.w); up.updateMatrixWorld(true); }
    }
  }

  async init() {
    const g = this.info.g;
    const idle = await loadClip(`${g}_idle_neutral`) || await loadClip("m_idle_neutral");
    // The legs' neutral pose (straight, feet forward), before the idle clip spreads them.
    this.legRest = LEGS.map((n) => this.bones[n]).filter(Boolean).map((b) => [b, b.quaternion.clone()]);
    this.inner.updateMatrixWorld(true);
    const wp = (n) => this.bones[n].getWorldPosition(new THREE.Vector3());
    this.legLen = wp("Bip01_L_Thigh").distanceTo(wp("Bip01_L_Foot")) || 0.9;
    this.lt = wp("Bip01_L_Thigh").distanceTo(wp("Bip01_L_Calf")) || this.legLen / 2;    // hip to knee
    this.lc = wp("Bip01_L_Calf").distanceTo(wp("Bip01_L_Foot")) || this.legLen / 2;     // knee to ankle
    this.toeLen = this.bones.Bip01_L_Toe0 ? wp("Bip01_L_Foot").distanceTo(wp("Bip01_L_Toe0")) : 0.13;   // ankle to the ball of the foot
    if (idle) { this.idle = this.mixer.clipAction(idle); this.idle.play(); this.idle.time = Math.random() * idle.duration; }
    this.mixer.update(0);
    this.inner.updateMatrixWorld(true);
    // Face the avatar down -z: its forward is square to the hips and shoulders (feet splay out, so they'd
    // turn the body ten degrees off the way it walks).
    const B = this.bones;
    const side = (s) => B[`Bip01_${s}_Thigh`].getWorldPosition(new THREE.Vector3()).add(B[`Bip01_${s}_UpperArm`].getWorldPosition(new THREE.Vector3()));
    const lr = side("L").sub(side("R")).setY(0).normalize();
    const fw = new THREE.Vector3(-lr.z, 0, lr.x);
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
    // How high the ankles sit standing with the legs straight: the gait keeps a planted one there.
    const idleQ = (this.legRest || []).map(([b]) => b.quaternion.clone());
    for (const [b, q] of this.legRest || []) b.quaternion.copy(q);
    this.inner.updateMatrixWorld(true);
    this.ankle0 = (B.Bip01_L_Foot.getWorldPosition(new THREE.Vector3()).y + B.Bip01_R_Foot.getWorldPosition(new THREE.Vector3()).y) / 2 - this.holder.position.y;
    (this.legRest || []).forEach(([b], i) => b.quaternion.copy(idleQ[i]));
    this.inner.updateMatrixWorld(true);
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
    // One cycle is two steps. Walking it's about 1.45 m. Runners lengthen the stride with speed but
    // keep the cadence near 170-190 steps a minute, so a jog never turns into a frantic patter.
    const runCycle = (2 * Math.max(speed, 2.5)) / ((2.6 + 0.08 * speed) * Math.sqrt(0.9 / (this.legLen || 0.9)));
    const stride = lerp(1.45, runCycle, this.runW);
    this.phase += ((speed / stride) * Math.PI * 2) * dt;
    if (this.down > 0) return;
    this.mixer.update(dt);
    if (this.walkW < 0.01 && this.dive <= 0) {
      this.inner.position.y = this.hipY = 0;
      if (this.arms) { this.holder.updateMatrixWorld(true); this.applyArms(); }
      return;
    }
    this.holder.updateMatrixWorld(true);
    const B = this.bones, w = this.walkW, r = this.runW, L = this.L;
    const hq = this.holder.quaternion;
    // The idle clip stands with the feet apart and turned out; walking from that leaves every leg
    // canted. Ease the legs back to neutral as the walk comes in, then swing them.
    for (const [b, q] of this.legRest || []) b.quaternion.slerp(q, Math.min(1, w));
    // A gait, not a pendulum. Each leg is planted for part of the cycle (stance) and swings through
    // the rest. While it's planted the hip angle is solved, frame by frame, so the foot stays exactly
    // where it landed as the body passes over it, with the knee giving a little to take the weight.
    // Walking, a foot is down 60% of the time (both, briefly, at each step). Running, only about 30%:
    // it lands just ahead of the hips with the knee already bent, sinks into mid-stance, and pushes off
    // behind; then the knee folds tight (heel up towards the seat), the thigh drives forward, and the
    // lower leg reaches out and pulls back just before the next landing. Between steps both feet are off
    // the ground and the body rises. The hips ride on whichever foot is lowest, so the planted one is
    // always on the ground and nothing dangles.
    const Ll = this.legLen || 0.9, lt = this.lt || Ll / 2, lc = this.lc || Ll / 2;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    // The faster the run, the shorter each foot is down: about a third of the cycle jogging, under 30% fast.
    const beta = lerp(0.6, clamp(0.4 - 0.03 * speed, 0.24, 0.34), r);
    const D = Math.min(beta * stride, lerp(0.95, 1.0, r) * Ll);        // ground the body covers over a planted foot
    const x0 = lerp(0.5, 0.4, r) * D;                                   // it lands this far ahead of the hip
    const kC = lerp(0.06, 0.25, r), kM = lerp(0.24, 0.8, r), kO = lerp(0.12, 0.2, r);   // knee: landing, mid-stance, toe-off
    const kStance = (u) => lerp(kC, kO, u) + (kM - (kC + kO) / 2) * Math.sin(Math.PI * u);
    // The hip angle that puts the ankle x metres ahead of the hip with the knee bent k.
    const solve = (x, k) => {
      let a = Math.asin(clamp(x / (lt + lc), -1, 1)) + (k * lc) / (lt + lc);
      for (let i = 0; i < 3; i++) {
        const f = lt * Math.sin(a) + lc * Math.sin(a - k) - x, df = lt * Math.cos(a) + lc * Math.cos(a - k);
        a -= f / Math.max(df, 0.2);
      }
      return a;
    };
    const aC = solve(x0, kC), aO = solve(x0 - D, kO);
    const aMax = lerp(aC + 0.04, 0.82, r);                              // knee drive: thigh at its highest
    const kPk = lerp(1.05, 1.45 + 0.09 * speed, r);                     // swing knee at its tightest
    // Swing timing: when the thigh is highest, when the knee is tightest, when it starts to open out
    // and when it's straight again for the landing. Running, the knee stays folded until late.
    const qa = lerp(0.85, 0.68, r), qk = lerp(0.4, 0.36, r), qo = lerp(0.4, 0.62, r), qe = lerp(1, 0.95, r);
    const leg = (p) => {
      let a, k, push, heel;
      if (p < beta) {
        const u = p / beta;
        k = kStance(u);
        a = solve(x0 - D * u, k);
        heel = lerp(0.18, 0.05, r) * (1 - smooth(0, 0.18, u));        // heel strike walking, midfoot running
        push = lerp(0.5, 0.6, r) * smooth(0.65, 1, u);                 // and off the toes
      } else {
        const q = (p - beta) / (1 - beta);
        a = q < qa ? lerp(aO, aMax, smooth(0, qa, q)) : lerp(aMax, aC, smooth(qa, 1, q));
        k = q < qk ? lerp(kO, kPk, smooth(0, qk, q)) : q < qo ? kPk : lerp(kPk, kC, smooth(qo, qe, q));
        push = lerp(0.5, 0.6, r) * (1 - smooth(0, 0.25, q));
        heel = lerp(0.12, 0.04, r) * smooth(0.45, 1, q);                // toes up, ready to land
      }
      return { a: a * w, k: k * w, push: push * w, heel: heel * w, stance: p < beta };
    };
    const TAU = Math.PI * 2, pL = ((this.phase / TAU) % 1 + 1) % 1, pR = (pL + 0.5) % 1;
    const legs = [["L", leg(pL)], ["R", leg(pR)]];
    for (const [side, g] of legs) {
      turn(B[`Bip01_${side}_Thigh`], L, this.sThigh * g.a, hq);
      turn(B[`Bip01_${side}_Calf`], L, this.sCalf * g.k, hq);
      // Keep the sole level whatever the hip and knee are doing, then roll it heel-to-toe.
      turn(B[`Bip01_${side}_Foot`], L, -(this.sThigh * g.a + this.sCalf * g.k) + this.sCalf * (g.push - g.heel), hq);
    }
    // Where the ankles actually are now, measured on the skeleton (each avatar's legs differ), as heights
    // above where they'd be standing still.
    this.inner.position.y = 0;
    this.inner.updateMatrixWorld(true);
    const hy = this.holder.position.y;
    const ankle = (side) => B[`Bip01_${side}_Foot`].getWorldPosition(tv).y - hy - this.ankle0;
    const hL = ankle("L"), hR = ankle("R");
    const sL = legs[0][1].stance, sR = legs[1][1].stance;
    // The hips sit on the planted leg (the lower foot when both are down, walking). In a run's flight
    // the lowest foot rises and falls a few centimetres: the body is in the air between steps.
    let lift = 0, fp = 0;
    if (!sL && !sR) { fp = clamp(((pL % 0.5) - beta) / (0.5 - beta), 0, 1); lift = 0.055 * r * w * Math.sin(Math.PI * fp); }
    // Pushing off, the heel comes up and the ankle rises with it while the toes stay down (and it
    // eases off again just after the foot leaves, so the flight starts where the push ended).
    const up = (g) => (this.toeLen || 0.13) * Math.sin(g.push);
    const aL = hL - up(legs[0][1]), aR = hR - up(legs[1][1]);
    // In flight, hand over smoothly from the foot that just left (the one earlier in its swing) to the
    // one about to land, so the hips don't jump at either end.
    const flightBase = Math.min(pL < pR ? lerp(aL, aR, smooth(0, 1, fp)) : lerp(aR, aL, smooth(0, 1, fp)), aL, aR);
    const base = sL && sR ? Math.min(aL, aR) : sL ? aL : sR ? aR : flightBase;
    const drop = base - lift;
    // A swinging foot that would still dip below the ground (as it passes under the body): fold its knee more.
    for (const [side, g] of legs) {
      const h = (side === "L" ? hL : hR) - drop;
      if (g.stance || h > 0.03) continue;
      const extra = clamp((0.03 - h) * 2.4, 0, 0.7);
      turn(B[`Bip01_${side}_Calf`], L, this.sCalf * extra, hq);
      turn(B[`Bip01_${side}_Foot`], L, -this.sCalf * extra, hq);
    }
    // Arms swing against the legs. Walking: a loose swing from the shoulder, elbows soft. Running: the
    // elbows held at about a right angle, closing a little as each arm comes forward, and the arms
    // driven more forward than back.
    const armA = lerp(0.36, 0.55, r) * w, bias = 0.1 * r * w;
    const elbow = lerp(0.3, 1.45, r) * w, elbowSw = lerp(0.18, 0.22, r) * w;
    const cL = Math.cos(TAU * pL);
    turn(B.Bip01_L_UpperArm, L, this.sArmL * (-armA * cL + bias), hq);
    turn(B.Bip01_R_UpperArm, L, this.sArmR * (armA * cL + bias), hq);
    turn(B.Bip01_L_Forearm, L, this.sFore * (elbow - elbowSw * cL), hq);
    turn(B.Bip01_R_Forearm, L, this.sForeR * (elbow + elbowSw * cL), hq);
    // The chest turns against the hips and leans into a run. That's Spine1: in these Biped rigs the
    // thighs hang off Bip01_Spine, so turning that swung the legs with the torso (and tipped them back).
    const chest = B.Bip01_Spine1 || B.Bip01_Spine;
    if (chest) {
      turn(chest, Y, 0.08 * w * cL, hq);
      turn(chest, L, -this.sThigh * 0.16 * r * w, hq);
    }
    // Eased, not snapped, so a foot taking over from the other never pops the body; it rises faster
    // than it settles, so a planted foot never sinks into the ground.
    const target = -drop * Math.min(1, w * 2);
    if (this.hipY == null) this.hipY = target;
    this.hipY += (target - this.hipY) * (1 - Math.exp(-dt * (target > this.hipY ? 70 : 30)));
    this.inner.position.y = this.hipY;
    if (this.dive > 0) {
      // Jumping out of the way: a quick sideways hop with the arms up.
      const k = Math.sin(Math.min(1, this.dive) * Math.PI);
      this.inner.position.y += 0.25 * k;
    }
    if (this.arms) { this.holder.updateMatrixWorld(true); this.applyArms(); }
  }
}

// ------------------------------------------------------------------------------------- crowd

const URBAN = new Set(["console", "uptown", "cadence", "sandbox", "scratch", "preview", "gardens", "meridian", "park", "docks"]);
const tmp = {};
const PED_R = 0.32;
// What a few of the people on the street are carrying, concealed.
export const STREET_GUNS = ["hotfix9", "hotfix9", "hotfix9", "rootcause", "burstmode", "batchjob", "quickfix"];
export function pockets(r, rich = 1) {
  return { cash: Math.round(r.range(4, 60) * (r() < 0.12 ? 6 : 1) * rich), gun: r() < 0.14 ? STREET_GUNS[r.int(0, STREET_GUNS.length - 1)] : null };
}

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
      ped.hp = 100; ped.panic = 0; ped.downT = 0;
      Object.assign(ped, pockets(r));
      if (!standing) { person.walkW = 1; person.runW = 0; }
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
    // Carry on round the corner on the same pavement: of the new street's two pavements, take
    // the one nearer where they are now (keeping the side by direction could mean the far one).
    const off = e.hw + 2.4;
    const a = this.w.edgePoint(e, ped.s, off, {}), b = this.w.edgePoint(e, ped.s, -off, {});
    const side = Math.hypot(a.x - ped.x, a.z - ped.z) <= Math.hypot(b.x - ped.x, b.z - ped.z) ? 1 : -1;
    ped.walkSide = side * dir;
  }

  // Shot, hit or caught in a blast: knocked down at zero health, otherwise running.
  hurt(p, dmg, fx, fz, byPlayer = true) {
    if (p.downT) return false;
    p.hp -= dmg;
    if (p.actor && this.onHurt) this.onHurt(p, dmg, fx, fz, byPlayer);
    if (p.hp <= 0) { this.knock(p, fx, fz, true); return true; }
    this.alarm(p.x, p.z, 6, fx, fz);
    return false;
  }

  // Knocked off their feet: a minor knock and they lie a moment, get up and run; a bad one and they
  // pass out where they fall and drop what they were carrying.
  knock(p, fx, fz, out) {
    p.downT = 0.001; p.fallYaw = Math.atan2(p.x - fx, p.z - fz); p.out = out; p.from = [fx, fz];
    p.upAt = out ? Infinity : 1.5 + this.r() * 1.5;
    p.flee = 0; p.person.dive = 0; p.detour = null;
    if (out) {
      if (this.onDown) this.onDown(p);
      this.drop(p);
      this.alarm(p.x, p.z, 30, fx, fz);
    } else this.alarm(p.x, p.z, 8, fx, fz);
  }

  // Their cash, and if they were carrying, the gun or a box of its ammo.
  drop(p) {
    if (!this.onDrop || p.dropped) return;
    p.dropped = true;
    const items = [];
    if (p.cash > 0) items.push({ kind: "cash", value: p.cash });
    if (p.gun) items.push({ kind: this.r() < 0.5 ? "gun" : "ammo", id: p.gun });
    if (items.length) this.onDrop(p, items);
  }

  // Everyone near a threat runs away from it along their pavement.
  alarm(x, z, radius, fx, fz) {
    for (const p of this.people) {
      if (p.actor || p.downT || Math.hypot(p.x - x, p.z - z) > radius) continue;
      p.panic = 7 + this.r() * 6;
      p.standing = false;
      this.w.edgePoint(p.e, p.s, 0, tmp);
      const away = (p.x - fx) * tmp.tx + (p.z - fz) * tmp.tz;
      const side = p.walkSide * p.dir;
      p.dir = away >= 0 ? 1 : -1;
      p.walkSide = side * p.dir;
    }
  }

  update(dt, cam, car, walker) {
    if (!this.spawning && this.people.filter((p) => !p.actor).length < this.max) {
      this.spawning = true;
      this.spawnOne(cam).finally(() => { this.spawning = false; });
    }
    this.people = this.people.filter((p) => {
      // Mission people (actors.js) come and go with their mission, not with the camera.
      if (p.actor) return !p.gone;
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < 150 && !(p.downT > 40)) return true;
      this.scene.remove(p.person.holder);
      return false;
    });
    const carSpeed = car ? Math.hypot(car.vx, car.vz) : 0;
    for (const p of this.people) {
      if (p.hidden) continue;   // an actor riding in a car
      if (p.downT) {
        // Knocked down: topple over and lie there; after a minor knock, get back up and run.
        p.downT += dt;
        let k = Math.min(1, p.downT / 0.55); k *= k;
        if (p.downT > p.upAt) {
          const u = Math.min(1, (p.downT - p.upAt) / 0.8);
          k = 1 - u * u;
          if (u >= 1) {
            p.downT = 0; p.person.down = 0; p.yaw = p.fallYaw + Math.PI;
            p.person.holder.rotation.set(0, p.yaw, 0);
            p.standing = false;
            if (p.actor) continue;
            this.rejoin(p);
            this.alarm(p.x, p.z, 0.5, p.from[0], p.from[1]);
            continue;
          }
        }
        p.person.down = Math.max(0.001, k);
        p.person.holder.rotation.order = "YXZ";
        p.person.holder.rotation.set(-p.person.down * Math.PI / 2, p.fallYaw + Math.PI, 0);
        p.person.holder.position.set(p.x, p.y + 0.12 * p.person.down, p.z);
        continue;
      }
      // Cars coming at you: get out of the way, if you've seen it coming (it's somewhere ahead of
      // you, not behind). Anyone looking the other way gets hit.
      if (car && carSpeed > 3 && !p.flee && !p.actor) {
        const dx = p.x - car.x, dz = p.z - car.z, d = Math.hypot(dx, dz);
        const sees = (-Math.sin(p.yaw) * -dx + -Math.cos(p.yaw) * -dz) / Math.max(d, 0.01) > -0.25;
        if (sees && d < 4 + carSpeed * 0.5) {
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
      } else if (p.actor) {
        // actors.js moved them already this frame.
        speed = p.aSpeed || 0; run = p.aRun || 0;
      } else if (!p.standing && p.detour) {
        speed = p.panic > 0 ? 4.3 : p.speed; run = p.panic > 0 ? 1 : 0;
        if (p.panic > 0) p.panic -= dt;
        this.walkDetour(p, speed, dt);
      } else if (!p.standing) {
        if (p.panic > 0) { p.panic -= dt; speed = 4.3; run = 1; } else speed = p.speed;
        p.s += speed * dt * p.dir;
        const end = p.dir > 0 ? p.e.sB : p.e.sA;
        if ((p.dir > 0 && p.s >= end) || (p.dir < 0 && p.s <= end)) this.nextEdge(p);
        this.w.edgePoint(p.e, p.s, (p.e.hw + 2.4) * p.walkSide * p.dir, tmp);
        // Walk to the point on the path at walking pace (never glide or jump), and let the path
        // wait for anyone who has fallen behind it, round a corner or after a shove.
        const mx = tmp.x - p.x, mz = tmp.z - p.z, md = Math.hypot(mx, mz), step = (speed * 1.2 + 0.2) * dt;
        if (md > 1.5) p.s -= speed * dt * p.dir;
        if (md > step) { p.x += (mx / md) * step; p.z += (mz / md) * step; } else { p.x = tmp.x; p.z = tmp.z; }
        const ty = md > 0.3 ? Math.atan2(-mx, -mz) : Math.atan2(-tmp.tx * p.dir, -tmp.tz * p.dir);
        p.yaw += angleWrap(ty - p.yaw) * Math.min(1, dt * 5);
      }
      // Bumped by the player on foot.
      if (walker) {
        const dx = p.x - walker.x, dz = p.z - walker.z, d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-3) { p.x += (dx / d) * (0.7 - d); p.z += (dz / d) * (0.7 - d); }
      }
      this.solid(p);
      // Hit by the car: thrown down if it's going fast, otherwise shoved aside and off running.
      if (p.hitT > 0) p.hitT -= dt;
      if (car && carSpeed > 2 && !p.downT && !(p.hitT > 0)) {
        const fx = -Math.sin(car.yaw), fz = -Math.cos(car.yaw), dx = p.x - car.x, dz = p.z - car.z;
        const lz = dx * fx + dz * fz, lx = dx * fz - dz * fx;
        if (Math.abs(lz) < car.hl + 0.25 && Math.abs(lx) < car.hw + 0.25) {
          const push = Math.sign(lx || 1) * (car.hw + 0.3 - Math.abs(lx));
          p.x += fz * push; p.z += -fx * push;
          p.hitT = 0.6;
          const fx2 = car.x - car.vx, fz2 = car.z - car.vz;
          p.hp -= carSpeed * 9;
          const out = p.hp <= 0;
          if (out || carSpeed > 2.5) this.knock(p, fx2, fz2, out); else this.alarm(p.x, p.z, 6, fx2, fz2);
          if (this.onHit) this.onHit(p, carSpeed, out);
          if (p.downT) continue;
        }
      }
      // After the hit test, which needs the overlap: then out of any car they're inside.
      this.solidCars(p, dt);
      this.solid(p);
      p.y = lerp(p.y, this.w.height(p.x, p.z) + 0.15, Math.min(1, dt * 8));
      p.person.holder.position.set(p.x, p.y, p.z);
      p.person.holder.rotation.y = p.yaw;
      if (Math.hypot(p.x - cam.x, p.z - cam.z) < 90) p.person.update(dt, speed, run);
    }
  }

  // Walls, lamp posts and trees push people out, the same way they stop the player.
  solid(p) {
    const cx = Math.floor((p.x + HALF) / CHUNK), cz = Math.floor((p.z + HALF) / CHUNK);
    if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return;
    const c = this.w.chunk(cx, cz);
    const i = clamp(Math.floor((p.x - c.x0) / 32), 0, 7), j = clamp(Math.floor((p.z - c.z0) / 32), 0, 7);
    for (const o of c.grid[i + j * 8]) {
      if (o.down) continue;
      if (o.r != null) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = o.r + PED_R;
        if (d < m && d > 1e-4) { p.x = o.x + (dx / d) * m; p.z = o.z + (dz / d) * m; }
      } else if (p.y < o.y1 - 0.35) {
        const px = clamp(p.x, o.x0, o.x1), pz = clamp(p.z, o.z0, o.z1);
        const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
        if (d >= PED_R) continue;
        if (d > 1e-4) { p.x = px + (dx / d) * PED_R; p.z = pz + (dz / d) * PED_R; }
        else {
          const e = [p.x - o.x0, o.x1 - p.x, p.z - o.z0, o.z1 - p.z], k = e.indexOf(Math.min(...e));
          if (k === 0) p.x = o.x0 - PED_R; else if (k === 1) p.x = o.x1 + PED_R; else if (k === 2) p.z = o.z0 - PED_R; else p.z = o.z1 + PED_R;
        }
      }
    }
  }

  // Cars are solid too, parked or moving: anyone who walks into one, or that one rolls into, is
  // pushed back out and steps along it to get round. this.cars is set by the game each frame.
  solidCars(p, dt) {
    for (const c of this.cars || []) {
      if (c.gone || c.hidden || c.taken) continue;
      const dx = p.x - c.x, dz = p.z - c.z;
      if (Math.abs(dx) > c.hl + 1 || Math.abs(dz) > c.hl + 1 || Math.abs(p.y - (c.y || 0)) > 1.6) continue;
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = -fz, rz = fx;
      const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
      const ex = lf - clamp(lf, -c.hl, c.hl), ez = lr - clamp(lr, -c.hw, c.hw), d = Math.hypot(ex, ez);
      if (d >= PED_R) continue;
      if (d > 1e-4) {
        const k = (PED_R - d) / d;
        p.x += (ex * fx + ez * rx) * k; p.z += (ex * fz + ez * rz) * k;
        if (p.actor) {
          // Mission people are steered elsewhere: just slide along it, towards the nearer end.
          if (Math.abs(ez) > Math.abs(ex)) { const g = Math.sign(lf || 1) * 1.4 * dt; p.x += fx * g; p.z += fz * g; }
          else { const g = Math.sign(lr || 1) * 1.4 * dt; p.x += rx * g; p.z += rz * g; }
        } else if (!p.detour && !p.standing && !(p.flee > 0)) this.planDetour(p, c, fx, fz, rx, rz, lf, lr, Math.abs(ez) > Math.abs(ex));
      } else if (c.hl - Math.abs(lf) < c.hw - Math.abs(lr)) {
        const k = Math.sign(lf || 1) * (c.hl - Math.abs(lf) + PED_R);
        p.x += fx * k; p.z += fz * k;
      } else {
        const k = Math.sign(lr || 1) * (c.hw - Math.abs(lr) + PED_R);
        p.x += rx * k; p.z += rz * k;
      }
    }
  }

  // Walked into a car: go round it by its corners, round whichever end isn't against a wall, and
  // if both are, turn back the way they came.
  planDetour(p, c, fx, fz, rx, rz, lf, lr, side) {
    const sg = Math.sign(lf || 1), sd = Math.sign(lr || 1), L = c.hl + 0.6, W = c.hw + 0.6;
    const at = (a, b) => ({ x: c.x + fx * a + rx * b, z: c.z + fz * a + rz * b });
    // Into its side: round an end (the nearer first) to the far side. Into an end: down a side to the other end.
    const routes = side ? [[at(sg * L, sd * W), at(sg * L, -sd * W)], [at(-sg * L, sd * W), at(-sg * L, -sd * W)]]
      : [[at(sg * L, sd * W), at(-sg * L, sd * W)], [at(sg * L, -sd * W), at(-sg * L, -sd * W)]];
    const pts = routes.find((r) => r.every((q) => !this.walled(q.x, q.z)));
    if (pts) p.detour = { pts, t: 6 };
    else { p.dir = -p.dir; p.detour = null; }
  }

  walkDetour(p, speed, dt) {
    const q = p.detour.pts[0], mx = q.x - p.x, mz = q.z - p.z, md = Math.hypot(mx, mz), step = (speed * 1.2 + 0.2) * dt;
    if (md > step) { p.x += (mx / md) * step; p.z += (mz / md) * step; }
    if (md > 0.05) p.yaw += angleWrap(Math.atan2(-mx, -mz) - p.yaw) * Math.min(1, dt * 6);
    if (md < 0.3) p.detour.pts.shift();
    // Round it (or given up): back on the path from here.
    if (!p.detour.pts.length || (p.detour.t -= dt) <= 0) { p.detour = null; p.s = this.onEdge(p).s; }
  }

  // Is there a wall or prop where someone would stand at (x, z)?
  walled(x, z) {
    const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
    if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return true;
    const c = this.w.chunk(cx, cz);
    const i = clamp(Math.floor((x - c.x0) / 32), 0, 7), j = clamp(Math.floor((z - c.z0) / 32), 0, 7);
    return c.grid[i + j * 8].some((o) => !o.down && (o.r != null ? Math.hypot(x - o.x, z - o.z) < o.r + PED_R : x > o.x0 - PED_R && x < o.x1 + PED_R && z > o.z0 - PED_R && z < o.z1 + PED_R));
  }

  // The point on the person's current road closest to where they are now.
  onEdge(p) {
    const e = p.e;
    let best = 0, bd = Infinity;
    for (let k = 0; k < e.s.length - 1; k++) {
      const ax = e.x[k], az = e.z[k], dx = e.x[k + 1] - ax, dz = e.z[k + 1] - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((p.x - ax) * dx + (p.z - az) * dz) / l2, 0, 1);
      const d = Math.hypot(ax + dx * t - p.x, az + dz * t - p.z);
      if (d < bd) { bd = d; best = lerp(e.s[k], e.s[k + 1], t); }
    }
    return { e, s: clamp(best, e.sA, e.sB) };
  }

  // After dodging, carry on along the pavement they were on (the nearest road can be
  // behind a building); people with no pavement yet take the nearest road.
  rejoin(p) {
    const n = p.e ? this.onEdge(p) : this.w.nearestRoad(p.x, p.z, true);
    if (!n) return;
    p.e = n.e; p.s = n.s;
    const pt = this.w.edgePoint(n.e, n.s, 0);
    const side = ((p.x - pt.x) * -pt.tz + (p.z - pt.z) * pt.tx) >= 0 ? 1 : -1;
    p.dir = 1; p.walkSide = side;
  }
}
