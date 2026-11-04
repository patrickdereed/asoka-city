// Modelled cars: CC BY 4.0 Sketchfab models (see the AsokaCityCars*/CREDITS.txt files), already converted to
// car space by Rally Legends' build-cars tool. Each model is baked into one mesh for the game's own shader:
// textures are sampled into vertex colours, paint is flagged so traffic can take any colour (and the player's
// car an Asoka livery through the livery UVs), lamps get emissive codes, and wheels are added at the axles.
import * as THREE from "./three.module.min.js";
import { GLTFLoader } from "./GLTFLoader.js";
import { Geo } from "./geo.js";

export const KIT_PACKS = {
  thunderbolt: "AsokaCityCars", toyama: "AsokaCityCars", mv6: "AsokaCityCars",
  asti: "AsokaCityCars2", lasley: "AsokaCityCars2", eagle: "AsokaCityCars2",
  doutrive: "AsokaCityCars3", stinger: "AsokaCityCars3",
  urban: "AsokaCityCars4", sialia: "AsokaCityCars4",
  fairheaven: "AsokaCityCars5", sanremo: "AsokaCityCars5",
};
export const PLAYER_KIT = "thunderbolt";

const SKIP = /Numberplates|Carbadges/i;
const GLASS = /glass|transperent|^glas$/i;

function pixelsOf(tex, cache) {
  if (!tex || !tex.image) return null;
  if (cache.has(tex.uuid)) return cache.get(tex.uuid);
  const img = tex.image;
  const w = img.width, h = img.height;
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = { w, h, data: g.getImageData(0, 0, w, h).data };
  cache.set(tex.uuid, px);
  return px;
}

function sample(px, u, v) {
  u -= Math.floor(u); v -= Math.floor(v);
  const x = Math.min(px.w - 1, Math.floor(u * px.w)), y = Math.min(px.h - 1, Math.floor(v * px.h));
  const o = (x + y * px.w) * 4;
  return [px.data[o] / 255, px.data[o + 1] / 255, px.data[o + 2] / 255];
}

function bake(id, gltf) {
  const rl = (gltf.scene.userData && gltf.scene.userData.rl) || {};
  const g = new Geo({ cdata: 2, luv: 2 });
  const cache = new Map();
  // Lamp vertices by kind and side, for the light glows: [x, y, z, n] sums and the extreme z.
  const lamp = { 1: [null, null], 2: [null, null] };
  gltf.scene.updateMatrixWorld(true);
  const nm = new THREE.Matrix3();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
    nm.getNormalMatrix(o.matrixWorld);
    const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, UV1 = geo.attributes.uv1;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      const name = mat.name || "";
      if (SKIP.test(name)) continue;
      const paint = name === "paint";
      const emi = name === "lamp_head" ? 1 : name === "lamp_brake" ? 2 : 0;
      const glass = !emi && !paint && (mat.transparent || mat.opacity < 1) && GLASS.test(name);
      const px = paint || glass ? null : pixelsOf(mat.map, cache);
      const base = mat.color ? [mat.color.r, mat.color.g, mat.color.b] : [1, 1, 1];
      // GLTFLoader gives linear colour factors; vertex colours here are sRGB.
      const fac = base.map((c) => Math.pow(c, 1 / 2.2));
      for (let t = gr.start; t < gr.start + gr.count; t += 3) {
        let cu = 0, cv = 0;
        if (UV) { for (let k = 0; k < 3; k++) { cu += UV.getX(t + k) / 3; cv += UV.getY(t + k) / 3; } }
        for (let k = 0; k < 3; k++) {
          const i = t + k;
          v.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld);
          if (N) n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
          let col;
          if (paint) col = [1, 1, 1];
          else if (glass) col = [0.1, 0.13, 0.15];
          else if (px && UV) {
            const s = sample(px, UV.getX(i) * 0.35 + cu * 0.65, UV.getY(i) * 0.35 + cv * 0.65);
            col = [s[0] * fac[0], s[1] * fac[1], s[2] * fac[2]];
          } else col = fac;
          g.e.cdata = [paint ? 1 : 0, emi];
          g.e.luv = paint && UV1 ? [UV1.getX(i), UV1.getY(i)] : [0, 0];
          // Model space has x = left and z = forward; the game's cars face -z with +x to the right.
          g.vert([-v.x, v.y, -v.z], [-n.x, n.y, -n.z], col);
          if (emi) {
            const side = -v.x < 0 ? 0 : 1, L = lamp[emi];
            if (!L[side]) L[side] = { x: 0, y: 0, z: 0, n: 0, zMin: Infinity, zMax: -Infinity };
            const q = L[side]; q.x += -v.x; q.y += v.y; q.z += -v.z; q.n++;
            q.zMin = Math.min(q.zMin, -v.z); q.zMax = Math.max(q.zMax, -v.z);
          }
        }
      }
    }
  });
  // Wheels at the measured axles (the models' own aren't used). The axle is along x. A tyre tread
  // and both sidewalls; on each face a bright rim lip round a darker dish set back into the wheel,
  // five spokes running out from the hub to the lip, and a hub cap.
  const wr = rl.wheelR || 0.32, ww = rl.wheelW || 0.23;
  const tyre = [0.09, 0.09, 0.1], sidewall = [0.12, 0.12, 0.13], lip = [0.78, 0.8, 0.81];
  const dish = [0.2, 0.21, 0.22], spoke = [0.64, 0.66, 0.68], hub = [0.48, 0.5, 0.52];
  const wheels = [];
  for (const k of ["FL", "FR", "RL", "RR"]) {
    const w = rl.wheels && rl.wheels[k];
    if (!w) continue;
    wheels.push({ x: -w[0], y: w[1], z: -w[2], front: k[0] === "F" });
  }
  const wheelGeo = new Geo({ cdata: 2, luv: 2 });
  wheelGeo.e.cdata = [0, 0];
  const NS = 18, at = (x, r, a) => [x, Math.cos(a) * r, Math.sin(a) * r];
  // A flat ring on the wheel face at x, from radius r0 to r1, facing s (+1 or -1 along x).
  const ring = (x, r0, r1, col, s) => {
    for (let i = 0; i < NS; i++) {
      const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2;
      wheelGeo.quad(at(x, r0, a0), at(x, r1, a0), at(x, r1, a1), at(x, r0, a1), col, null, [s, 0, 0]);
    }
  };
  for (let i = 0; i < NS; i++) {
    const a0 = (i / NS) * Math.PI * 2, a1 = ((i + 1) / NS) * Math.PI * 2, am = (a0 + a1) / 2;
    wheelGeo.quad(at(-ww / 2, wr, a0), at(ww / 2, wr, a0), at(ww / 2, wr, a1), at(-ww / 2, wr, a1), tyre, null, [0, Math.cos(am), Math.sin(am)]);
  }
  for (const s of [-1, 1]) {
    const x = (s * ww) / 2;
    ring(x, wr * 0.7, wr, sidewall, s);
    ring(x + s * 0.004, wr * 0.62, wr * 0.7, lip, s);
    ring(x - s * 0.012, 0.001, wr * 0.62, dish, s);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      const d = [Math.cos(a), Math.sin(a)], t = [-Math.sin(a), Math.cos(a)];
      const r0 = wr * 0.15, r1 = wr * 0.63, h0 = wr * 0.08, h1 = wr * 0.05;
      const pt = (xx, r, h) => [xx, d[0] * r + t[0] * h, d[1] * r + t[1] * h];
      const xf = x + s * 0.006, xb = x - s * 0.012;
      wheelGeo.quad(pt(xf, r0, -h0), pt(xf, r1, -h1), pt(xf, r1, h1), pt(xf, r0, h0), spoke, null, [s, 0, 0]);
      wheelGeo.quad(pt(xb, r0, h0), pt(xb, r1, h1), pt(xf, r1, h1), pt(xf, r0, h0), spoke.map((c) => c * 0.8), null, [0, t[0], t[1]]);
      wheelGeo.quad(pt(xb, r0, -h0), pt(xb, r1, -h1), pt(xf, r1, -h1), pt(xf, r0, -h0), spoke.map((c) => c * 0.8), null, [0, -t[0], -t[1]]);
    }
    ring(x + s * 0.01, 0.001, wr * 0.17, hub, s);
  }
  const body = g.build();
  const wheelOnly = wheelGeo.build();
  // Every car spins its own wheels: traffic and parked cars draw them as instances.
  const traffic = g.build();
  const L = (rl.nose || 2.2) - (rl.tail || -2.2), W = (rl.hw || 0.95) * 2;
  // Where the glows go: the middle of each lamp, just proud of its outer face.
  const spots = (k, front) => lamp[k].filter(Boolean).map((q) => [q.x / q.n, q.y / q.n, front ? q.zMin - 0.03 : q.zMax + 0.03]);
  const lamps = { head: spots(1, true), tail: spots(2, false) };
  return {
    id, body, wheelGeo: wheelOnly, traffic, wheels, lamps,
    spec: { id, L, W, wr, belt: rl.belt || 0.9, roof: rl.roofY || 1.4, mass: 1150 + L * 60, wheelbase: (rl.zF || 1.3) - (rl.zR || -1.3) },
  };
}

export async function loadKits(onProgress) {
  const res = window.AC_RES || {};
  const loader = new GLTFLoader();
  const ids = Object.keys(KIT_PACKS);
  let done = 0;
  const out = await Promise.all(ids.map(async (id) => {
    const base = res[KIT_PACKS[id]];
    if (!base) return null;
    try {
      const gltf = await loader.loadAsync(`${base}/${id}.glb`);
      const kit = bake(id, gltf);
      onProgress && onProgress(++done, ids.length);
      return kit;
    } catch (e) {
      console.warn("car model failed to load", id, e);
      return null;
    }
  }));
  return out.filter(Boolean);
}

// The Asoka fleet livery on the livery canvas (rows: underside 0, sill 64, door 128, shoulder 192, roof 256;
// the right side mirrors below row 256; u runs nose to tail).
export function asokaLivery() {
  const cv = document.createElement("canvas");
  cv.width = 1024; cv.height = 512;
  const g = cv.getContext("2d");
  const cream = "#fff7ee", orange = "#ff6018", spruce = "#2f757c", ink = "#182b2e";
  g.fillStyle = cream; g.fillRect(0, 0, 1024, 512);
  for (const flip of [false, true]) {
    const R = (row) => (flip ? 512 - row : row);
    const band = (r0, r1, col) => { g.fillStyle = col; const a = R(r0), b = R(r1); g.fillRect(0, Math.min(a, b), 1024, Math.abs(b - a)); };
    band(0, 80, spruce);
    band(80, 88, orange);
    band(234, 256, orange);
    band(226, 232, ink);
    // The Asoka triangle on each door, pointing up the body.
    const cx = 470, cy = R(140), h = 46, up = flip ? 1 : -1;
    g.fillStyle = ink;
    g.beginPath();
    g.moveTo(cx, cy + up * h * 0.62);
    g.lineTo(cx - h * 0.62, cy - up * h * 0.46);
    g.lineTo(cx + h * 0.62, cy - up * h * 0.46);
    g.closePath(); g.fill();
    g.strokeStyle = orange; g.lineWidth = 7;
    g.beginPath(); g.arc(cx, cy - up * h * 0.1, 12, 0, Math.PI * 2); g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.anisotropy = 4;
  return tex;
}
