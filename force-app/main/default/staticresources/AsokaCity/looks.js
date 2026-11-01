// Your character's own features on top of a Rocketbox look: hair style and colour, skin tone, eye colour and
// shape, nose, ears and tattoos. Everything is baked into the player's own copies of the avatar's geometry and
// textures in the rig's bind pose, so the pedestrians sharing that avatar are untouched. The rig's facial bones
// and skin weights tell us where the eyes, nose, ears, scalp, brows and limbs are on every avatar.
import * as THREE from "./three.module.min.js";
import { loadPerson, PEOPLE } from "./people.js";
import { clamp } from "./util.js";

export const SKIN_TONES = ["#f6dccb", "#ecc8ac", "#e0b393", "#d09c79", "#bd8763", "#a87252", "#946044", "#7f5038", "#6a4230", "#573629"];
export const EYE_COLOURS = [["brown", "#5b3418"], ["hazel", "#806c2e"], ["amber", "#b37a1c"], ["green", "#3f7d3a"], ["blue", "#3b78bf"], ["grey", "#7d8c96"], ["violet", "#7a4fae"]];
export const HAIR_COLOURS = [["black", "#141110"], ["espresso", "#2c1c12"], ["brown", "#5a3a22"], ["chestnut", "#7c4526"], ["auburn", "#8f381c"], ["ginger", "#c4622a"], ["dark blonde", "#9c7a4a"], ["blonde", "#dcbc7c"], ["platinum", "#ece4d0"], ["grey", "#9a9a98"], ["white", "#f0f0ec"], ["red", "#c42828"], ["pink", "#e65c9e"], ["purple", "#7a3cb8"], ["electric blue", "#2a62dc"], ["teal", "#1f9c94"]];
export const SLIDERS = [
  ["eyeSize", "Eye size"], ["eyeTilt", "Eye tilt"],
  ["nose", "Nose size"], ["noseLen", "Nose length"], ["noseW", "Nose width"],
  ["ears", "Ear size"], ["earsOut", "Ears stick out"],
];
// Avatars that come without a hair mesh (their hair is painted on the scalp).
const NO_HAIR = new Set(["Business_Male_04", "Business_Male_05", "Business_Male_06", "Business_Male_07"]);
export const HAIR_STYLES = ["own", "buzz", "shaved", ...PEOPLE.filter((p) => !NO_HAIR.has(p.id)).map((p) => p.id)];
export function hairName(id) {
  if (id === "own") return "This look's own";
  if (id === "buzz") return "Buzz cut";
  if (id === "shaved") return "Shaved";
  return `Cut ${HAIR_STYLES.indexOf(id) - 2}`;
}

export const DEFAULT_STYLE = { hair: "own", hairCol: null, skin: null, eyeCol: null, eyeSize: 0, eyeTilt: 0, nose: 0, noseLen: 0, noseW: 0, ears: 0, earsOut: 0, ink: {}, inkCol: false };
export const styleOf = (s) => Object.assign({}, DEFAULT_STYLE, s || {}, { ink: Object.assign({}, (s && s.ink) || {}) });

// Tattoo spots. Limbs wrap a design round the bone (cyl: from -> to is the design's downward direction);
// flat spots project it straight on (plane: the bone it sits by, off: [left, up] in cm, face: the way it faces).
export const SPOTS = [
  { id: "rfore", name: "Right forearm", mesh: "body", cyl: ["R_Forearm", "R_Hand"], at: 0.5, size: 8, face: "up", bones: ["R_Forearm", "R_Hand", "R_UpperArm"] },
  { id: "lfore", name: "Left forearm", mesh: "body", cyl: ["L_Forearm", "L_Hand"], at: 0.5, size: 8, face: "up", bones: ["L_Forearm", "L_Hand", "L_UpperArm"] },
  { id: "rupper", name: "Right upper arm", mesh: "body", cyl: ["R_UpperArm", "R_Forearm"], at: 0.55, size: 9, face: "up", bones: ["R_UpperArm", "R_Forearm", "R_Clavicle"] },
  { id: "lupper", name: "Left upper arm", mesh: "body", cyl: ["L_UpperArm", "L_Forearm"], at: 0.55, size: 9, face: "up", bones: ["L_UpperArm", "L_Forearm", "L_Clavicle"] },
  { id: "rhand", name: "Back of right hand", mesh: "body", hand: "R", size: 5.5, bones: ["R_Hand", "R_Finger1", "R_Finger2", "R_Finger3", "R_Finger4", "R_Finger0", "R_Forearm"] },
  { id: "chest", name: "Chest", mesh: "body", plane: "Spine2", off: [8, 6], size: 11, face: "fwd", bones: ["Spine2", "Spine1", "Neck", "L_Clavicle", "R_Clavicle", "L_UpperArm", "R_UpperArm"] },
  { id: "back", name: "Upper back", mesh: "body", plane: "Spine2", off: [0, 4], size: 20, face: "back", bones: ["Spine2", "Spine1", "Spine", "Neck", "L_Clavicle", "R_Clavicle"] },
  { id: "neck", name: "Neck", mesh: "head", cyl: ["Head", "Neck"], at: 0.55, size: 5, face: "left", bones: ["Neck", "Head", "Spine2"] },
  { id: "face", name: "Under the eye", mesh: "head", plane: "LEye", off: [0.6, -2.9], size: 1.9, face: "fwd", bones: ["Head", "LCheek", "LEyeBlinkBottom"] },
  { id: "rcalf", name: "Right calf", mesh: "body", cyl: ["R_Calf", "R_Foot"], at: 0.4, size: 9, face: "back", bones: ["R_Calf", "R_Foot", "R_Thigh"] },
  { id: "lcalf", name: "Left calf", mesh: "body", cyl: ["L_Calf", "L_Foot"], at: 0.4, size: 9, face: "back", bones: ["L_Calf", "L_Foot", "L_Thigh"] },
];

// Tattoo designs, drawn into a 256 px square on a transparent ground. `col` is false for black ink only.
const INK = "#16181d", RED = "#c33a2b", GREEN = "#2f7d43", GOLD = "#d6a22a", BLUE = "#2b5aa6";
const star = (c, x, y, r, r2, n = 5, rot = -Math.PI / 2) => { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, rr = i % 2 ? r2 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); };
export const TATTOOS = [
  { id: "mark", name: "Asoka mark", draw(c, col) {
    c.lineWidth = 12; c.strokeStyle = INK; c.lineJoin = "round";
    c.beginPath(); c.moveTo(128, 22); c.lineTo(234, 220); c.lineTo(22, 220); c.closePath();
    if (col) { c.fillStyle = BLUE; c.fill(); } c.stroke();
    c.beginPath(); c.arc(128, 158, 44, 0, 7); c.lineWidth = 16; c.strokeStyle = col ? "#e8742c" : INK; c.stroke();
  } },
  { id: "anchor", name: "Anchor", draw(c, col) {
    c.strokeStyle = INK; c.lineWidth = 16; c.lineCap = "round";
    c.beginPath(); c.arc(128, 40, 18, 0, 7); c.stroke();
    c.beginPath(); c.moveTo(128, 58); c.lineTo(128, 226); c.moveTo(84, 92); c.lineTo(172, 92); c.stroke();
    c.beginPath(); c.arc(128, 150, 80, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(128 + s * 57, 207); c.lineTo(128 + s * 82, 176); c.lineTo(128 + s * 50, 184); c.closePath(); c.fillStyle = INK; c.fill(); }
    if (col) { c.strokeStyle = RED; c.lineWidth = 7; c.beginPath(); c.moveTo(96, 70); c.bezierCurveTo(180, 100, 60, 140, 160, 170); c.stroke(); }
  } },
  { id: "swallow", name: "Swallow", draw(c, col) {
    c.fillStyle = col ? BLUE : INK; c.strokeStyle = INK; c.lineWidth = 6;
    c.beginPath(); c.moveTo(30, 150); c.quadraticCurveTo(90, 60, 150, 112); c.quadraticCurveTo(200, 70, 236, 40); c.quadraticCurveTo(214, 110, 170, 140);
    c.quadraticCurveTo(200, 180, 236, 214); c.quadraticCurveTo(170, 196, 140, 168); c.quadraticCurveTo(80, 196, 30, 150); c.fill(); c.stroke();
    if (col) { c.fillStyle = RED; c.beginPath(); c.ellipse(60, 146, 18, 12, -0.3, 0, 7); c.fill(); c.fillStyle = "#f2e6d0"; c.beginPath(); c.ellipse(112, 160, 30, 12, -0.2, 0, 7); c.fill(); }
    c.fillStyle = "#fff"; c.beginPath(); c.arc(52, 138, 5, 0, 7); c.fill();
  } },
  { id: "rose", name: "Rose", draw(c, col) {
    c.strokeStyle = INK; c.lineWidth = 7;
    c.fillStyle = col ? GREEN : "rgba(0,0,0,0)";
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(128 + s * 58, 176, 44, 20, s * 0.5, 0, 7); c.fill(); c.stroke(); }
    c.fillStyle = col ? RED : "rgba(0,0,0,0)";
    c.beginPath(); c.arc(128, 112, 74, 0, 7); c.fill(); c.stroke();
    for (const r of [52, 32, 14]) { c.beginPath(); c.arc(128 + r * 0.15, 112 - r * 0.1, r, 0.4, 5.6); c.stroke(); }
  } },
  { id: "stars", name: "Nautical star", draw(c, col) {
    star(c, 128, 128, 116, 46);
    c.fillStyle = INK; c.fill();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
      c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); c.lineTo(128 + Math.cos(a + Math.PI / 5) * 46, 128 + Math.sin(a + Math.PI / 5) * 46); c.closePath();
      c.fillStyle = col ? (i % 2 ? RED : "#f2e6d0") : "#d8d4cc"; c.fill();
    }
  } },
  { id: "heart", name: "Heart & banner", draw(c, col) {
    c.fillStyle = col ? RED : "rgba(0,0,0,0)"; c.strokeStyle = INK; c.lineWidth = 9;
    c.beginPath(); c.moveTo(128, 222); c.bezierCurveTo(20, 150, 10, 60, 72, 44); c.bezierCurveTo(104, 36, 124, 58, 128, 80); c.bezierCurveTo(132, 58, 152, 36, 184, 44); c.bezierCurveTo(246, 60, 236, 150, 128, 222); c.fill(); c.stroke();
    c.fillStyle = col ? "#f2e6d0" : "#e8e4dc"; c.beginPath(); c.moveTo(14, 112); c.lineTo(242, 112); c.lineTo(230, 136); c.lineTo(242, 160); c.lineTo(14, 160); c.lineTo(26, 136); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.font = "700 34px 'Space Grotesk', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("GO-LIVE", 128, 138);
  } },
  { id: "dagger", name: "Dagger", draw(c, col) {
    c.strokeStyle = INK; c.lineWidth = 7; c.fillStyle = col ? "#c9ccd2" : "rgba(0,0,0,0)";
    c.beginPath(); c.moveTo(128, 246); c.lineTo(146, 96); c.lineTo(110, 96); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = col ? GOLD : INK; c.fillRect(70, 82, 116, 16); c.fillRect(118, 24, 20, 60); c.beginPath(); c.arc(128, 20, 13, 0, 7); c.fill();
    c.beginPath(); c.moveTo(128, 120); c.lineTo(128, 220); c.lineWidth = 3; c.stroke();
  } },
  { id: "wave", name: "Wave", draw(c, col) {
    c.strokeStyle = INK; c.lineWidth = 9; c.fillStyle = col ? BLUE : "rgba(0,0,0,0)";
    c.beginPath(); c.moveTo(12, 220); c.bezierCurveTo(30, 120, 120, 40, 200, 70); c.bezierCurveTo(250, 90, 230, 160, 180, 150); c.bezierCurveTo(150, 144, 150, 110, 176, 108); c.bezierCurveTo(140, 96, 110, 150, 140, 220); c.closePath(); c.fill(); c.stroke();
    c.lineWidth = 5; for (const y of [150, 180, 205]) { c.beginPath(); c.moveTo(30, y + 10); c.quadraticCurveTo(70, y - 30, 120, y); c.stroke(); }
  } },
  { id: "code", name: "{ } brackets", draw(c, col) {
    c.fillStyle = col ? "#e8742c" : INK; c.font = "700 200px 'Space Mono', monospace"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("{}", 128, 132);
  } },
  { id: "bolt", name: "Lightning", draw(c, col) {
    c.fillStyle = col ? GOLD : INK; c.strokeStyle = INK; c.lineWidth = 8; c.lineJoin = "round";
    c.beginPath(); c.moveTo(150, 10); c.lineTo(60, 140); c.lineTo(122, 140); c.lineTo(96, 246); c.lineTo(198, 102); c.lineTo(134, 102); c.closePath(); c.fill(); c.stroke();
  } },
  { id: "compass", name: "Compass", draw(c, col) {
    c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.arc(128, 128, 96, 0, 7); c.stroke(); c.beginPath(); c.arc(128, 128, 80, 0, 7); c.lineWidth = 3; c.stroke();
    star(c, 128, 128, 120, 22, 4); c.fillStyle = INK; c.fill();
    star(c, 128, 128, 70, 16, 4, -Math.PI / 4); c.fillStyle = col ? RED : "#77736c"; c.fill();
  } },
  { id: "band", name: "Arm band", band: true, draw(c, col) {
    c.fillStyle = INK; c.fillRect(0, 70, 256, 18); c.fillRect(0, 168, 256, 18);
    for (let i = 0; i < 8; i++) { const x = i * 32; c.beginPath(); c.moveTo(x, 92); c.lineTo(x + 16, 128); c.lineTo(x, 164); c.lineTo(x + 12, 164); c.lineTo(x + 28, 128); c.lineTo(x + 12, 92); c.closePath(); c.fillStyle = col && i % 2 ? RED : INK; c.fill(); }
  } },
];
const designs = new Map();
function design(id, col) {
  const key = id + (col ? "+" : "");
  if (!designs.has(key)) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 256;
    const t = TATTOOS.find((d) => d.id === id);
    if (t) t.draw(cv.getContext("2d"), col);
    designs.set(key, cv);
  }
  return designs.get(key);
}

// ---------------------------------------------------------------------------------------------------------
// The rig in its bind pose.
const BIP = (n) => "Bip01_" + n;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// Avatar textures are decoded twice on the way to the screen (sRGB texture, then the shader's own gamma), so a
// texture value v shows up about like v * v / 255 would on screen. Swatch colours go in through the inverse.
const albedo = (h) => hexRGB(h).map((c) => Math.sqrt(c * 255));

function skinnedMeshes(root) {
  const out = {};
  root.traverse((o) => { if (o.isSkinnedMesh && !out[o.name]) out[o.name] = o; });
  return out;
}

// Bind-pose positions and per-vertex bone weights of one skinned mesh, plus the rig frame they sit in.
function meshInfo(m) {
  const g = m.geometry, P = g.attributes.position, n = P.count;
  const B = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m.bindMatrix); B[i * 3] = v.x; B[i * 3 + 1] = v.y; B[i * 3 + 2] = v.z; }
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, names = m.skeleton.bones.map((b) => b.name);
  const weight = (i, set) => { let w = 0; for (let k = 0; k < 4; k++) { const s = SW.getComponent(i, k); if (s > 0 && set.has(names[SI.getComponent(i, k)])) w += s; } return w; };
  const index = g.index ? Array.from(g.index.array) : Array.from({ length: n }, (_, i) => i);
  return { m, n, B, weight, index, uv: g.attributes.uv };
}

function rigFrame(meshes) {
  const inv = {};
  for (const m of Object.values(meshes)) m.skeleton.bones.forEach((b, i) => { if (!inv[b.name]) inv[b.name] = m.skeleton.boneInverses[i]; });
  const at = (n) => (inv[BIP(n)] ? new THREE.Vector3().setFromMatrixPosition(inv[BIP(n)].clone().invert()) : null);
  const O = at("Head"), LE = at("LEye"), RE = at("REye"), pel = at("Pelvis");
  const up = O.clone().sub(pel).normalize();
  const mid = LE.clone().add(RE).multiplyScalar(0.5);
  const fwd = mid.clone().sub(O); fwd.addScaledVector(up, -fwd.dot(up)).normalize();
  const lat = new THREE.Vector3().crossVectors(up, fwd).normalize();
  if (lat.dot(LE.clone().sub(RE)) < 0) lat.negate();
  const u = LE.distanceTo(RE) / 6.2;   // one centimetre, from the distance between the eyes
  // Local coordinates [left, up, forward] in centimetres, relative to the head bone.
  const loc = (x, y, z) => { const dx = x - O.x, dy = y - O.y, dz = z - O.z; return [(dx * lat.x + dy * lat.y + dz * lat.z) / u, (dx * up.x + dy * up.y + dz * up.z) / u, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / u]; };
  const world = (l, out = new THREE.Vector3()) => out.copy(O).addScaledVector(lat, l[0] * u).addScaledVector(up, l[1] * u).addScaledVector(fwd, l[2] * u);
  return { inv, at, O, up, fwd, lat, u, loc, world };
}

// Everything we keep about the player's avatar: own geometry copies, original pixels and the landmarks.
function prep(person) {
  if (person._look) return person._look;
  const meshes = skinnedMeshes(person.inner);
  const F = rigFrame(meshes);
  const L = (person._look = { meshes, F, info: {}, src: {}, tex: {}, keys: {} });
  for (const [name, m] of Object.entries(meshes)) {
    m.geometry = m.geometry.clone();
    L.info[name] = meshInfo(m);
    L.info[name].p0 = m.geometry.attributes.position.array.slice();
    L.info[name].i0 = m.geometry.index ? m.geometry.index.array.slice() : null;
  }
  const head = L.info.head;
  const at = (n) => { const p = F.at(n); return p ? F.loc(p.x, p.y, p.z) : null; };
  const LE = at("LEye"), RE = at("REye"), lip = at("MUpperLip") || [0, LE[1] - 6, LE[2]];
  const eyeUp = (LE[1] + RE[1]) / 2, eyeF = (LE[2] + RE[2]) / 2;
  const H = new Set([BIP("Head")]);
  const hl = [];   // head-mesh vertices in local cm, with their head weight
  for (let i = 0; i < head.n; i++) hl.push(F.loc(head.B[i * 3], head.B[i * 3 + 1], head.B[i * 3 + 2]));
  // Eyeballs: centre, radius.
  const eyes = [[LE, "LEye", 1], [RE, "REye", -1]].map(([c, bone, side]) => {
    const set = new Set([BIP(bone)]); let r = 0, k = 0;
    for (let i = 0; i < head.n; i++) if (head.weight(i, set) > 0.5) { r += Math.hypot(hl[i][0] - c[0], hl[i][1] - c[1], hl[i][2] - c[2]); k++; }
    return { c, bone, side, r: k ? r / k : 1.2 };
  });
  // Nose tip: the most forward vertex on the midline between the mouth and the eyes.
  let tip = null;
  for (let i = 0; i < head.n; i++) { const p = hl[i]; if (Math.abs(p[0]) < 0.8 && p[1] < eyeUp && p[1] > lip[1] && (!tip || p[2] > tip[2])) tip = p; }
  tip = tip || [0, eyeUp - 3.5, eyeF + 2];
  // Ears: the widest points of the head between the brow and the mouth, behind the eyes.
  const earBand = (p) => smooth(lip[1] - 2, lip[1] + 0.5, p[1]) * (1 - smooth(eyeUp + 1.5, eyeUp + 4, p[1])) * smooth(eyeF - 15, eyeF - 12, p[2]) * (1 - smooth(eyeF - 6, eyeF - 3.5, p[2]));
  const ears = [1, -1].map((side) => {
    let max = 0;
    for (let i = 0; i < head.n; i++) { const p = hl[i]; if (head.weight(i, H) > 0.5 && earBand(p) > 0.5 && p[0] * side > max) max = p[0] * side; }
    const root = [0, 0, 0]; let k = 0;
    for (let i = 0; i < head.n; i++) { const p = hl[i]; if (head.weight(i, H) > 0.5 && earBand(p) > 0.5 && p[0] * side > max - 0.9) { root[1] += p[1]; root[2] += p[2]; k++; } }
    if (k) { root[1] /= k; root[2] /= k; }
    root[0] = side * (max - 2.4);
    return { side, max, root };
  });
  L.face = { LE, RE, lip, eyeUp, eyeF, eyes, tip, ears, earBand };
  return L;
}

// ---------------------------------------------------------------------------------------------------------
// Shape: eyes, nose and ears, moved vertex by vertex in the head's own frame.
function shapeVertex(L, s, p, isHead) {
  const f = L.face;
  for (const e of f.eyes) {
    const d = Math.hypot(p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2]);
    const w = 1 - smooth(1.45 * e.r, 2.7 * e.r, d);
    if (w <= 0) continue;
    const k = 1 + 0.16 * s.eyeSize * w;
    let x = (p[0] - e.c[0]) * k, y = (p[1] - e.c[1]) * k;
    const a = s.eyeTilt * 0.2 * e.side * w, ca = Math.cos(a), sa = Math.sin(a);
    p[0] = e.c[0] + x * ca - y * sa; p[1] = e.c[1] + x * sa + y * ca; p[2] = e.c[2] + (p[2] - e.c[2]) * k;
  }
  if (!isHead) return;
  const t = f.tip, A = [0, t[1] + 1.2, t[2] - 2.6];
  if (p[2] > A[2] - 0.4) {
    const dy = p[1] - (t[1] + 1.0);
    const q = Math.hypot(p[0] / 2.1, dy / (dy > 0 ? 3.4 : 1.6));
    const w = (1 - smooth(0.55, 1.0, q)) * smooth(A[2] - 0.4, A[2] + 0.8, p[2]);
    if (w > 0) {
      const k = 1 + 0.25 * s.nose * w;
      for (let j = 0; j < 3; j++) p[j] = A[j] + (p[j] - A[j]) * k;
      p[0] *= 1 + 0.32 * s.noseW * w;
      p[2] += s.noseLen * 0.9 * w * clamp((p[2] - A[2]) / (t[2] - A[2]), 0, 1);
    }
  }
  for (const e of f.ears) {
    const out = p[0] * e.side;
    if (out < e.max - 2.6) continue;
    const w = smooth(e.max - 2.6, e.max - 1.3, out) * f.earBand(p);
    if (w <= 0) continue;
    const k = 1 + 0.3 * s.ears * w;
    for (let j = 0; j < 3; j++) p[j] = e.root[j] + (p[j] - e.root[j]) * k;
    p[0] += e.side * s.earsOut * 1.3 * w * clamp((out - (e.max - 2.6)) / 2.4, 0, 1);
  }
}

function shape(L, s) {
  const key = SLIDERS.map(([k]) => s[k]).join();
  if (L.keys.shape === key) return;
  L.keys.shape = key;
  const F = L.F, v = new THREE.Vector3();
  for (const name of ["head", "hair"]) {
    const I = L.info[name];
    if (!I) continue;
    const P = I.m.geometry.attributes.position, inv = I.m.bindMatrix.clone().invert();
    for (let i = 0; i < I.n; i++) {
      const p = F.loc(I.B[i * 3], I.B[i * 3 + 1], I.B[i * 3 + 2]);
      shapeVertex(L, s, p, name === "head");
      F.world(p, v).applyMatrix4(inv);
      P.setXYZ(i, v.x, v.y, v.z);
    }
    P.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Hair: another avatar's hair mesh fitted to this head, or none (buzz cut / shaved). Eyelashes live in the hair
// mesh, skinned to the eyelid bones, so they always stay with the face they belong to.
const LIDS = new Set(["REyeBlinkTop", "LEyeBlinkTop", "REyeBlinkBottom", "LEyeBlinkBottom"].map(BIP));
function subset(I, keep) {
  const idx = I.index, out = [];
  for (let t = 0; t < idx.length; t += 3) if (keep(idx[t], idx[t + 1], idx[t + 2])) out.push(idx[t], idx[t + 1], idx[t + 2]);
  return out;
}
const isLash = (I) => (a, b, c) => I.weight(a, LIDS) > 0.3 || I.weight(b, LIDS) > 0.3 || I.weight(c, LIDS) > 0.3;

// The skull's extent (above the eyes) in the head's own frame, for fitting someone else's hair.
function headBox(info, F) {
  const H = new Set([BIP("Head")]), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  const LE = F.at("LEye"), eyeUp = F.loc(LE.x, LE.y, LE.z)[1];
  for (let i = 0; i < info.n; i++) {
    if (info.weight(i, H) < 0.6) continue;
    const p = F.loc(info.B[i * 3], info.B[i * 3 + 1], info.B[i * 3 + 2]);
    if (p[1] < eyeUp) continue;
    for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], p[j]); hi[j] = Math.max(hi[j], p[j]); }
  }
  lo[1] = eyeUp;
  return { c: lo.map((x, j) => (x + hi[j]) / 2), s: lo.map((x, j) => hi[j] - x) };
}

const donors = new Map();
async function donor(id) {
  if (!donors.has(id)) donors.set(id, loadPerson(id).then((g) => {
    if (!g) return null;
    const meshes = skinnedMeshes(g.scene);
    if (!meshes.hair || !meshes.head) return null;
    const F = rigFrame(meshes), info = meshInfo(meshes.hair), head = meshInfo(meshes.head);
    return { F, info, box: headBox(head, F), map: meshes.hair.material.map, pixels: pixelsOf(meshes.hair.material.map) };
  }));
  return donors.get(id);
}

async function hair(L, person, s) {
  const own = L.info.hair, mine = L.meshes.hair;
  const want = s.hair || "own";
  if (L.keys.hair === want) return;
  // Own hair mesh: everything for "own", only the eyelashes otherwise.
  if (own) {
    if (mine.material.uniforms.uSoft) mine.material.uniforms.uSoft.value = 0.55;
    const g = mine.geometry;
    const tris = want === "own" ? own.index : subset(own, isLash(own));
    g.setIndex(tris);
    mine.visible = tris.length > 0;
  }
  if (L.extra) { L.extra.removeFromParent(); L.extra.geometry.dispose(); L.extra = null; L.donor = null; }
  L.keys.hair = want;
  if (want === "own" || want === "buzz" || want === "shaved") return;
  const D = await donor(want);
  if (!D || L.keys.hair !== want) return;
  const F = L.F, myBox = L.myBox || (L.myBox = headBox(L.info.head, F));
  const geo = D.info.m.geometry.clone();
  const P = geo.attributes.position, head = L.meshes.head, v = new THREE.Vector3(), inv = head.bindMatrix.clone().invert();
  for (let i = 0; i < D.info.n; i++) {
    const l = D.F.loc(D.info.B[i * 3], D.info.B[i * 3 + 1], D.info.B[i * 3 + 2]);
    for (let j = 0; j < 3; j++) l[j] = myBox.c[j] + (l[j] - D.box.c[j]) * clamp(myBox.s[j] / D.box.s[j], 0.85, 1.18);
    F.world(l, v).applyMatrix4(inv);
    P.setXYZ(i, v.x, v.y, v.z);
  }
  geo.setIndex(subset(D.info, (a, b, c) => !isLash(D.info)(a, b, c)));
  const bones = D.info.m.skeleton.bones.map((b) => person.bones[b.name] || person.bones.Bip01_Head);
  const inverses = D.info.m.skeleton.bones.map((b) => (F.inv[b.name] || F.inv.Bip01_Head).clone());
  const hm = head.material;
  const mat = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, hm.uniforms, { uMap: { value: D.map }, uAlphaCut: { value: 0.5 }, uSkin: { value: 0.4 }, uSoft: { value: 0.55 } }),
    vertexShader: hm.vertexShader, fragmentShader: hm.fragmentShader, side: THREE.DoubleSide,
  });
  const m = new THREE.SkinnedMesh(geo, mat);
  m.name = "hair-style"; m.frustumCulled = false; m.layers.enable(1);
  m.position.copy(head.position); m.quaternion.copy(head.quaternion); m.scale.copy(head.scale);
  head.parent.add(m);
  m.bind(new THREE.Skeleton(bones, inverses), head.bindMatrix.clone());
  L.extra = m; L.donor = D;
  L.keys.paint = null;   // the scalp and the new hair's colour need repainting
}

// ---------------------------------------------------------------------------------------------------------
// Paint: skin tone, hair and brow colour, eye colour and tattoos, into the player's own copies of the textures.
function pixelsOf(tex) {
  const img = tex && tex.image;
  if (!img) return null;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, c.width, c.height);
}

// A canvas the size of a texture with the given triangles filled in white (alpha is the mask).
function triMask(I, W, H, keep, grow = 1.5) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = x.strokeStyle = "#fff"; x.lineWidth = grow * 2; x.lineJoin = "round";
  x.beginPath();
  const uv = I.uv, idx = I.index;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2];
    if (!keep(a, b, d)) continue;
    x.moveTo(uv.getX(a) * W, uv.getY(a) * H); x.lineTo(uv.getX(b) * W, uv.getY(b) * H); x.lineTo(uv.getX(d) * W, uv.getY(d) * H); x.closePath();
  }
  x.fill(); if (grow) x.stroke();
  const d = x.getImageData(0, 0, W, H).data, m = new Float32Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] / 255;
  return m;
}

function blurMask(m, W, H, px) {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d", { willReadFrequently: true }), d = new ImageData(W, H);
  for (let i = 0; i < m.length; i++) { d.data[i * 4 + 3] = m[i] * 255; }
  const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H; tmp.getContext("2d").putImageData(d, 0, 0);
  x.filter = `blur(${px}px)`; x.drawImage(tmp, 0, 0);
  const o = x.getImageData(0, 0, W, H).data, out = new Float32Array(m.length);
  for (let i = 0; i < out.length; i++) out[i] = o[i * 4 + 3] / 255;
  return out;
}

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const cbcr = (r, g, b) => [-0.1687 * r - 0.3313 * g + 0.5 * b, 0.5 * r - 0.4187 * g - 0.0813 * b];

// Median colour of the pixels under a mask.
function median(px, mask) {
  const r = [], g = [], b = [];
  for (let i = 0; i < mask.length; i += 3) if (mask[i] > 0.5 && px.data[i * 4 + 3] > 200) { r.push(px.data[i * 4]); g.push(px.data[i * 4 + 1]); b.push(px.data[i * 4 + 2]); }
  if (!r.length) return null;
  const mid = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [mid(r), mid(g), mid(b)];
}

// How skin-like each pixel is, compared with this texture's own reference skin colour.
function skinMask(px, ref) {
  const d = px.data, n = d.length / 4, m = new Float32Array(n);
  const [cb0, cr0] = cbcr(...ref), y0 = lum(...ref);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const cb = -0.1687 * r - 0.3313 * g + 0.5 * b, cr = 0.5 * r - 0.4187 * g - 0.0813 * b, k = lum(r, g, b) / y0;
    m[i] = (1 - smooth(7, 17, Math.hypot(cb - cb0, cr - cr0))) * smooth(0.22, 0.42, k) * (1 - smooth(1.5, 1.9, k));
  }
  return m;
}

function meanLum(px, mask) {
  let s = 0, w = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 0.05) { s += lum(px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2]) * mask[i]; w += mask[i]; }
  return w ? s / w : 128;
}

// Dye: the target colour, keeping each pixel's light and dark relative to the average.
function dye(d, i, T, mean, w, k = 1) {
  if (w <= 0) return;
  // Gentle: the double gamma turns small texture ratios into big on-screen ones.
  const f = clamp(Math.pow(lum(d[i], d[i + 1], d[i + 2]) / mean, 0.25), 0.75, 1.2) * k;
  for (let j = 0; j < 3; j++) d[i + j] += (clamp(T[j] * f, 0, 255) - d[i + j]) * w;
}

// Tattoo: project the design onto the triangles under the spot and draw each into texture space.
function inkSpot(L, I, spot, ctx, W, H, img) {
  const F = L.F, at = (n) => F.at(n), set = new Set(spot.bones.map(BIP));
  const dirOf = (f) => (f === "up" ? F.up.clone() : f === "fwd" ? F.fwd.clone() : f === "back" ? F.fwd.clone().negate() : F.lat.clone());
  let proj;
  const D = new THREE.Vector3(), N = new THREE.Vector3(), R = new THREE.Vector3(), p = new THREE.Vector3();
  const band = TATTOOS.find((t) => t.id === img.id)?.band;
  if (spot.cyl) {
    const A = at(spot.cyl[0]), B = at(spot.cyl[1]);
    if (!A || !B) return 0;
    const len = A.distanceTo(B); D.subVectors(B, A).normalize();
    N.copy(dirOf(spot.face)); N.addScaledVector(D, -N.dot(D)).normalize();
    R.crossVectors(D.clone().negate(), N).normalize();
    const c0 = spot.at * len, size = spot.size * F.u;
    let rad = 0, k = 0;
    for (let i = 0; i < I.n; i++) {
      if (I.weight(i, set) < 0.35) continue;
      p.set(I.B[i * 3], I.B[i * 3 + 1], I.B[i * 3 + 2]).sub(A);
      const al = p.dot(D);
      if (Math.abs(al - c0) > size) continue;
      p.addScaledVector(D, -al); rad += p.length(); k++;
    }
    rad = k ? rad / k : 3 * F.u;
    proj = (i) => {
      p.set(I.B[i * 3], I.B[i * 3 + 1], I.B[i * 3 + 2]).sub(A);
      const al = p.dot(D); p.addScaledVector(D, -al);
      const th = Math.atan2(p.dot(R), p.dot(N));
      return band ? [th / (2 * Math.PI) + 0.5, (al - c0) / (size * 0.6) + 0.5, Math.abs(th)] : [(th * rad) / size + 0.5, (al - c0) / size + 0.5, Math.abs(th)];
    };
  } else {
    let C, down;
    if (spot.hand) {
      const h = at(spot.hand + "_Hand"), f2 = at(spot.hand + "_Finger2") || at(spot.hand + "_Finger1");
      if (!h || !f2) return 0;
      down = f2.clone().sub(h).normalize();
      C = h.clone().lerp(f2, 0.55);
      N.copy(F.up).addScaledVector(down, -F.up.dot(down)).normalize();
    } else {
      C = at(spot.plane);
      if (!C) return 0;
      C.addScaledVector(F.lat, spot.off[0] * F.u).addScaledVector(F.up, spot.off[1] * F.u);
      N.copy(dirOf(spot.face)); down = F.up.clone().negate();
    }
    D.copy(down);
    R.crossVectors(D.clone().negate(), N).normalize();
    const size = spot.size * F.u;
    proj = (i) => { p.set(I.B[i * 3], I.B[i * 3 + 1], I.B[i * 3 + 2]).sub(C); return [p.dot(R) / size + 0.5, p.dot(D) / size + 0.5, p.dot(N) / size]; };
  }
  const nrm = I.m.geometry.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(I.m.bindMatrix), tn = new THREE.Vector3();
  const facing = (i) => tn.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize().dot(N);
  const uv = I.uv, idx = I.index, S = img.width;
  const cache = new Map(), pr = (i) => { if (!cache.has(i)) cache.set(i, proj(i)); return cache.get(i); };
  let drawn = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]];
    if (v.some((i) => I.weight(i, set) < 0.35)) continue;
    const q = v.map(pr);
    if (Math.max(q[0][0], q[1][0], q[2][0]) < 0 || Math.min(q[0][0], q[1][0], q[2][0]) > 1) continue;
    if (Math.max(q[0][1], q[1][1], q[2][1]) < 0 || Math.min(q[0][1], q[1][1], q[2][1]) > 1) continue;
    if (spot.cyl) { if (q.some((x) => x[2] > (band ? 3.0 : 2.4))) continue; }
    else { if (q.some((x) => Math.abs(x[2]) > 0.9)) continue; if (facing(v[0]) + facing(v[1]) + facing(v[2]) < 0.6) continue; }
    texTri(ctx, img, q.map((x) => [x[0] * S, x[1] * S]), v.map((i) => [uv.getX(i) * W, uv.getY(i) * H]));
    drawn++;
  }
  return drawn;
}

function texTri(ctx, img, s, d) {
  const [[x0, y0], [x1, y1], [x2, y2]] = s, [[X0, Y0], [X1, Y1], [X2, Y2]] = d;
  const dx1 = x1 - x0, dy1 = y1 - y0, dx2 = x2 - x0, dy2 = y2 - y0, den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return;
  const a = ((X1 - X0) * dy2 - (X2 - X0) * dy1) / den, c = ((X2 - X0) * dx1 - (X1 - X0) * dx2) / den;
  const b = ((Y1 - Y0) * dy2 - (Y2 - Y0) * dy1) / den, e = ((Y2 - Y0) * dx1 - (Y1 - Y0) * dx2) / den;
  // Grow the clip a little so neighbouring triangles meet without hairline gaps.
  const cx = (X0 + X1 + X2) / 3, cy = (Y0 + Y1 + Y2) / 3, g = (X, Y) => { const l = Math.hypot(X - cx, Y - cy) || 1; return [X + ((X - cx) / l) * 0.8, Y + ((Y - cy) / l) * 0.8]; };
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...g(X0, Y0)); ctx.lineTo(...g(X1, Y1)); ctx.lineTo(...g(X2, Y2)); ctx.closePath(); ctx.clip();
  ctx.setTransform(a, b, c, e, X0 - a * x0 - c * y0, Y0 - b * x0 - e * y0);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// The texture we paint into for one mesh: a canvas texture with the original's sampling settings.
function target(L, name, W, H) {
  if (!L.tex[name]) {
    const mesh = L.meshes[name], orig = mesh.material.uniforms.uMap.value;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const t = new THREE.CanvasTexture(c);
    for (const k of ["flipY", "colorSpace", "wrapS", "wrapT", "magFilter", "minFilter", "anisotropy", "generateMipmaps"]) t[k] = orig[k];
    L.tex[name] = { c, ctx: c.getContext("2d", { willReadFrequently: true }), t, orig };
    mesh.material.uniforms.uMap.value = t;
  }
  return L.tex[name];
}

function paint(L, s) {
  const donorId = L.donor ? s.hair : "";
  const key = JSON.stringify([s.hairCol, s.skin, s.eyeCol, s.hair === "shaved", donorId, s.ink, s.inkCol]);
  if (L.keys.paint === key) return L.report;
  L.keys.paint = key;
  const report = { covered: [] };
  const F = L.F, f = L.face;
  // Masks and references are worked out once per avatar.
  if (!L.masks) {
    const M = (L.masks = {});
    for (const name of ["head", "body"]) {
      const I = L.info[name], orig = L.meshes[name].material.uniforms.uMap.value;
      L.src[name] = pixelsOf(orig);
      M[name] = { W: L.src[name].width, H: L.src[name].height };
    }
    const hd = L.info.head, bd = L.info.body, Hs = new Set([BIP("Head")]);
    const loc = (I, i) => F.loc(I.B[i * 3], I.B[i * 3 + 1], I.B[i * 3 + 2]);
    const all3 = (I, pred) => (a, b, c) => pred(a) && pred(b) && pred(c);
    // Reference skin: the cheeks on the head, the hands on the body.
    const cheek = triMask(hd, M.head.W, M.head.H, all3(hd, (i) => { const p = loc(hd, i); return hd.weight(i, Hs) > 0.5 && Math.abs(p[0]) > 2 && Math.abs(p[0]) < 5 && p[1] < f.eyeUp - 1.5 && p[1] > f.lip[1] && p[2] > f.eyeF - 3; }), 0);
    const HANDS = new Set([BIP("R_Hand"), BIP("L_Hand")]), BROWS = new Set(["RInnerEyebrow", "LInnerEyebrow", "MMiddleEyebrow", "ROuterEyebrow", "LOuterEyebrow"].map(BIP));
    const hands = triMask(bd, M.body.W, M.body.H, all3(bd, (i) => bd.weight(i, HANDS) > 0.6), 0);
    M.head.ref = median(L.src.head, cheek) || [200, 150, 125];
    M.body.ref = median(L.src.body, hands) || M.head.ref;
    M.head.skin = skinMask(L.src.head, M.head.ref);
    M.body.skin = skinMask(L.src.body, M.body.ref);
    // Painted hair on the scalp. The region comes from a typical hairline on the head's geometry (forehead top,
    // temples, behind the ears down to the nape); inside it, a painted head of hair has strand detail that bare
    // skin doesn't. Near the edge of the region, colour and brightness decide.
    const earOf = (p) => f.ears.some((e) => p[0] * e.side > e.max - 2.6 && f.earBand(p) > 0.3);
    const region = triMask(hd, M.head.W, M.head.H, all3(hd, (i) => {
      const p = loc(hd, i);
      if (hd.weight(i, Hs) < 0.5 || earOf(p)) return false;
      return p[1] > f.eyeUp + 6 || (p[1] > f.eyeUp + 1 && p[2] < f.eyeF - 5.5) || (p[1] > f.lip[1] - 3 && p[2] < f.eyeF - 11);
    }), 2);
    const y0 = lum(...M.head.ref), hd0 = L.src.head.data, W0 = M.head.W;
    const L0 = (i) => lum(hd0[i * 4], hd0[i * 4 + 1], hd0[i * 4 + 2]);
    const detail = (mask) => { let s = 0, n = 0; for (let i = W0 + 1; i < mask.length - W0 - 1; i += 7) if (mask[i] > 0.9) { s += Math.abs(L0(i) - L0(i + 1)) + Math.abs(L0(i) - L0(i + W0)); n++; } return n ? s / n : 0; };
    const hairy = detail(region) > 1.6 * detail(cheek);
    // Colour alone decides over a looser area that reaches the temples and sideburns.
    const loose = triMask(hd, M.head.W, M.head.H, (a, b, c) => [a, b, c].some((i) => {
      const p = loc(hd, i);
      return hd.weight(i, Hs) > 0.5 && !earOf(p) && (p[1] > f.eyeUp + 1.5 || (p[2] < f.eyeF - 4 && p[1] > f.lip[1] - 4));
    }), 3);
    const guess = loose.map((v, i) => v * Math.max(1 - M.head.skin[i], 1 - smooth(0.5, 0.72, L0(i) / y0)));
    const inner = blurMask(region, M.head.W, M.head.H, 6);
    M.head.hair = hairy ? guess.map((v, i) => Math.max(v, region[i] * smooth(0.6, 0.95, inner[i]))) : guess;
    for (let i = 0; i < M.head.skin.length; i++) M.head.skin[i] *= 1 - M.head.hair[i];
    const brows = triMask(hd, M.head.W, M.head.H, (a, b, c) => hd.weight(a, BROWS) > 0.25 || hd.weight(b, BROWS) > 0.25 || hd.weight(c, BROWS) > 0.25, 3);
    M.head.brow = brows.map((v, i) => v * (1 - M.head.skin[i]) * (1 - smooth(0.7, 0.9, lum(L.src.head.data[i * 4], L.src.head.data[i * 4 + 1], L.src.head.data[i * 4 + 2]) / y0)));
    const LIPS = new Set(["MUpperLip", "MBottomLip", "LUpperlip", "RUpperlip", "LMouthCorner", "RMouthCorner", "LMouthBottom", "RMouthBottom"].map(BIP));
    M.head.lips = triMask(hd, M.head.W, M.head.H, (a, b, c) => hd.weight(a, LIPS) > 0.3 && hd.weight(b, LIPS) > 0.3 && hd.weight(c, LIPS) > 0.3, 2);
    M.head.hairMean = meanLum(L.src.head, M.head.hair);
    M.head.browMean = meanLum(L.src.head, M.head.brow);
    M.head.irises = irises(L);
    if (L.info.hair) {
      const hI = L.info.hair, orig = L.meshes.hair.material.uniforms.uMap.value;
      L.src.hair = pixelsOf(orig);
      const W = L.src.hair.width, H = L.src.hair.height, lash = triMask(hI, W, H, isLash(hI), 2);
      const a = new Float32Array(W * H);
      for (let i = 0; i < a.length; i++) a[i] = (L.src.hair.data[i * 4 + 3] / 255) * (1 - lash[i]);
      M.hair = { W, H, a, lash, mean: meanLum(L.src.hair, a) };
    }
  }
  const M = L.masks;
  // The hair colour: the chosen dye, or a new style's own colour so the painted scalp matches it.
  let T = s.hairCol ? albedo(s.hairCol) : null;
  if (!T && L.donor) T = donorColour(L.donor);
  const S = s.skin ? albedo(s.skin) : null;
  const shaved = s.hair === "shaved";

  for (const name of ["head", "body"]) {
    const m = M[name], src = L.src[name], out = new ImageData(new Uint8ClampedArray(src.data), m.W, m.H), d = out.data;
    const skin = m.skin.slice();
    // Lips follow the skin tone most of the way.
    if (m.lips) for (let i = 0; i < skin.length; i++) skin[i] = Math.max(skin[i], 0.8 * m.lips[i] * (1 - m.hair[i]));
    if (name === "head") {
      for (let i = 0; i < skin.length; i++) {
        const h = m.hair[i], o = i * 4;
        if (h > 0.02) {
          if (shaved) {
            const f2 = 0.97 + 0.03 * clamp(lum(d[o], d[o + 1], d[o + 2]) / m.hairMean - 1, -1, 1);
            for (let j = 0; j < 3; j++) d[o + j] += (m.ref[j] * 0.93 * f2 - d[o + j]) * h;
            skin[i] = Math.max(skin[i], h);
          } else if (T) dye(d, o, T, m.hairMean, h);
        }
        if (T && m.brow[i] > 0.02) dye(d, o, T, m.browMean, m.brow[i], 0.85);
      }
      if (s.eyeCol) for (const ir of m.irises) paintIris(d, m.W, m.H, ir, albedo(s.eyeCol));
    }
    if (S) {
      const k = [0, 1, 2].map((j) => S[j] / Math.max(1, m.ref[j]));
      for (let i = 0; i < skin.length; i++) { const w = skin[i], o = i * 4; if (w > 0.01) for (let j = 0; j < 3; j++) d[o + j] += (clamp(d[o + j] * k[j], 0, 255) - d[o + j]) * w; }
    }
    const tx = target(L, name, m.W, m.H);
    tx.ctx.globalCompositeOperation = "source-over";
    tx.ctx.putImageData(out, 0, 0);
    // Tattoos sit in the skin only, so clothes cover them.
    const spots = SPOTS.filter((sp) => sp.mesh === name && s.ink[sp.id]);
    if (spots.length) {
      const ink = document.createElement("canvas"); ink.width = m.W; ink.height = m.H;
      const ic = ink.getContext("2d", { willReadFrequently: true });
      const skinC = document.createElement("canvas"); skinC.width = m.W; skinC.height = m.H;
      const sd = new ImageData(m.W, m.H);
      for (let i = 0; i < skin.length; i++) { sd.data[i * 4] = sd.data[i * 4 + 1] = sd.data[i * 4 + 2] = 255; sd.data[i * 4 + 3] = smooth(0.15, 0.6, skin[i]) * 255; }
      skinC.getContext("2d").putImageData(sd, 0, 0);
      for (const sp of spots) {
        ic.globalCompositeOperation = "source-over";
        ic.clearRect(0, 0, m.W, m.H);
        const img = design(s.ink[sp.id], s.inkCol);
        img.id = s.ink[sp.id];
        if (!inkSpot(L, L.info[name], sp, ic, m.W, m.H, img)) { report.covered.push(sp.id); continue; }
        const before = alphaSum(ic, m.W, m.H);
        ic.globalCompositeOperation = "destination-in";
        ic.drawImage(skinC, 0, 0);
        if (alphaSum(ic, m.W, m.H) < before * 0.2) report.covered.push(sp.id);
        tx.ctx.globalCompositeOperation = "multiply";
        tx.ctx.drawImage(ink, 0, 0);
      }
      tx.ctx.globalCompositeOperation = "source-over";
    }
    tx.t.needsUpdate = true;
  }
  // Hair textures: this look's own hair and a new style's.
  if (M.hair) {
    const tx = target(L, "hair", M.hair.W, M.hair.H);
    const out = new ImageData(new Uint8ClampedArray(L.src.hair.data), M.hair.W, M.hair.H);
    // Transparent texels are dyed as well: filtering and mipmaps blend their colour into the strands' edges.
    if (s.hairCol) for (let i = 0; i < M.hair.a.length; i++) dye(out.data, i * 4, T, M.hair.mean, 1 - M.hair.lash[i]);
    tx.ctx.putImageData(out, 0, 0); tx.t.needsUpdate = true;
  }
  if (L.extra) {
    const D = L.donor;
    if (!s.hairCol) L.extra.material.uniforms.uMap.value = D.map;
    else {
      const W = D.pixels.width, H = D.pixels.height;
      if (!L.extraTex || L.extraTex.c.width !== W || L.extraTex.c.height !== H) {
        const c = document.createElement("canvas"); c.width = W; c.height = H;
        const t = new THREE.CanvasTexture(c);
        for (const k of ["flipY", "colorSpace", "wrapS", "wrapT", "magFilter", "minFilter", "anisotropy", "generateMipmaps"]) t[k] = D.map[k];
        L.extraTex = { c, t };
      }
      const a = donorAlpha(D), out = new ImageData(new Uint8ClampedArray(D.pixels.data), W, H);
      for (let i = 0; i < a.a.length; i++) dye(out.data, i * 4, T, a.mean, 1);
      L.extraTex.c.getContext("2d").putImageData(out, 0, 0);
      L.extraTex.t.needsUpdate = true;
      L.extra.material.uniforms.uMap.value = L.extraTex.t;
    }
  }
  L.report = report;
  return report;
}

function alphaSum(ctx, W, H) {
  const d = ctx.getImageData(0, 0, W, H).data;
  let s = 0;
  for (let i = 3; i < d.length; i += 16) s += d[i];
  return s;
}

function donorAlpha(D) {
  if (!D.alpha) {
    const px = D.pixels, a = new Float32Array(px.width * px.height);
    const lash = triMask(D.info, px.width, px.height, isLash(D.info), 2);
    for (let i = 0; i < a.length; i++) a[i] = (px.data[i * 4 + 3] / 255) * (1 - lash[i]);
    D.alpha = { a, mean: meanLum(px, a) };
  }
  return D.alpha;
}

function donorColour(D) {
  if (!D.colour) {
    const { a } = donorAlpha(D), d = D.pixels.data, c = [0, 0, 0];
    let w = 0;
    for (let i = 0; i < a.length; i++) if (a[i] > 0.5) { for (let j = 0; j < 3; j++) c[j] += d[i * 4 + j]; w++; }
    D.colour = w ? c.map((x) => x / w) : [90, 60, 40];
  }
  return D.colour;
}

// Irises: where the front of each eyeball lands in the head texture, and how big the iris is there.
function irises(L) {
  const I = L.info.head, F = L.F, uv = I.uv, out = [], W = L.masks.head.W, H = L.masks.head.H;
  for (const e of L.face.eyes) {
    const set = new Set([BIP(e.bone)]), pts = [];
    for (let i = 0; i < I.n; i++) {
      if (I.weight(i, set) < 0.5) continue;
      const p = F.loc(I.B[i * 3], I.B[i * 3 + 1], I.B[i * 3 + 2]);
      const d = [p[0] - e.c[0], p[1] - e.c[1], p[2] - e.c[2]], l = Math.hypot(...d) || 1;
      pts.push({ cos: d[2] / l, u: uv.getX(i) * W, v: uv.getY(i) * H });
    }
    if (!pts.length) continue;
    const top = Math.max(...pts.map((p) => p.cos));
    const front = pts.filter((p) => p.cos > top - 0.02);
    const cu = front.reduce((s, p) => s + p.u, 0) / front.length, cv = front.reduce((s, p) => s + p.v, 0) / front.length;
    const ks = pts.filter((p) => p.cos < 0.985 && p.cos > 0.6).map((p) => Math.hypot(p.u - cu, p.v - cv) / Math.sqrt(1 - p.cos * p.cos)).sort((a, b) => a - b);
    const K = ks.length ? ks[ks.length >> 1] : 20;
    const r = K * 0.44;   // the iris spans about 26 degrees either side of the front of the eye
    if (!out.some((o) => Math.hypot(o.u - cu, o.v - cv) < 2)) out.push({ u: cu, v: cv, r });
  }
  return out;
}

function paintIris(d, W, H, ir, T) {
  const x0 = Math.max(0, Math.floor(ir.u - ir.r - 2)), x1 = Math.min(W - 1, Math.ceil(ir.u + ir.r + 2));
  const y0 = Math.max(0, Math.floor(ir.v - ir.r - 2)), y1 = Math.min(H - 1, Math.ceil(ir.v + ir.r + 2));
  let s = 0, n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const r = Math.hypot(x - ir.u, y - ir.v); if (r < ir.r && r > ir.r * 0.45) { const o = (y * W + x) * 4; s += lum(d[o], d[o + 1], d[o + 2]); n++; } }
  const mean = n ? s / n : 100;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const r = Math.hypot(x - ir.u, y - ir.v);
    const w = (1 - smooth(ir.r * 0.85, ir.r * 1.05, r)) * smooth(ir.r * 0.3, ir.r * 0.42, r) * 0.85;
    dye(d, (y * W + x) * 4, T, mean, w);
  }
}

// ---------------------------------------------------------------------------------------------------------
// Apply a style to the player's avatar. Safe to call again on every change; only what changed is redone.
export async function dress(person, style) {
  if (!person) return null;
  const s = styleOf(style);
  const L = prep(person);
  const token = (L.token = (L.token || 0) + 1);
  shape(L, s);
  await hair(L, person, s);
  if (token !== L.token) return L.report || null;
  return paint(L, s);
}
