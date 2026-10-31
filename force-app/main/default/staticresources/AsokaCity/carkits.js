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
        }
      }
    }
  });
  // Wheels at the measured axles: tyre, rim and a darker hub face.
  const wr = rl.wheelR || 0.32, ww = rl.wheelW || 0.23;
  const tyre = [0.09, 0.09, 0.1], rim = [0.72, 0.74, 0.75];
  const wheels = [];
  for (const k of ["FL", "FR", "RL", "RR"]) {
    const w = rl.wheels && rl.wheels[k];
    if (!w) continue;
    wheels.push({ x: -w[0], y: w[1], z: -w[2], front: k[0] === "F" });
  }
  const wheelGeo = new Geo({ cdata: 2, luv: 2 });
  wheelGeo.e.cdata = [0, 0];
  wheelGeo.tube([-ww / 2, 0, 0], [ww / 2, 0, 0], wr, wr, tyre, 14);
  for (const s of [-1, 1]) {
    wheelGeo.tube([(s * ww) / 2, 0, 0], [(s * (ww + 0.01)) / 2, 0, 0], wr * 0.68, wr * 0.68, rim, 10);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      wheelGeo.box((s * (ww + 0.016)) / 2, Math.cos(a) * wr * 0.34, Math.sin(a) * wr * 0.34, 0.02, wr * 0.55, 0.07, [0.45, 0.47, 0.48], 0, 0, 0, 0);
    }
  }
  const body = g.build();
  const wheelOnly = wheelGeo.build();
  // Traffic gets the wheels merged into the body; the player's car spins its own.
  const merged = new Geo({ cdata: 2, luv: 2 });
  merged.pos = g.pos.slice(); merged.nrm = g.nrm.slice(); merged.col = g.col.slice();
  merged.ex.cdata = g.ex.cdata.slice(); merged.ex.luv = g.ex.luv.slice();
  for (const w of wheels) {
    for (let i = 0; i < wheelGeo.pos.length; i += 3) {
      merged.pos.push(wheelGeo.pos[i] + w.x, wheelGeo.pos[i + 1] + w.y, wheelGeo.pos[i + 2] + w.z);
    }
    merged.nrm.push(...wheelGeo.nrm); merged.col.push(...wheelGeo.col);
    merged.ex.cdata.push(...wheelGeo.ex.cdata); merged.ex.luv.push(...wheelGeo.ex.luv);
  }
  const L = (rl.nose || 2.2) - (rl.tail || -2.2), W = (rl.hw || 0.95) * 2;
  return {
    id, body, wheelGeo: wheelOnly, traffic: merged.build(), wheels,
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
