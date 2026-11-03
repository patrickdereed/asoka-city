// Turns world chunks into meshes, streams them around the camera, and owns the shared
// materials, sky, sea, landmark tower, signs and light glows.
import * as THREE from "./three.module.min.js";
import * as S from "./shaders.js";
import { Geo, propLamp, propPalm, propTree, propHut, propUmbrella, propCrane } from "./geo.js";
import { HALF, CHUNK, NCH, HN, HRES, DECK, ST, PAL, NEON, SIGNS, TOWER, shoreDist, districtAt } from "./map.js";
import { hex, clamp, lerp, hash2 } from "./util.js";
import { CAR_TYPES, trafficGeometry } from "./cars.js";

// ------------------------------------------------------------------------------- uniforms

// Real lights the shaders take (see lamps() in shaders.js).
export const NLAMP = 10;

export function makeUniforms() {
  const v3 = () => ({ value: new THREE.Vector3() });
  return {
    uLightDir: v3(), uLightCol: v3(), uSkyAmb: v3(), uGndAmb: v3(), uFogCol: v3(), uZenith: v3(),
    uSunDir: v3(), uSunGlow: v3(), uMoonDir: v3(), uCam: v3(),
    uFogDen: { value: 0.0004 }, uNight: { value: 0 }, uTime: { value: 0 }, uWet: { value: 0 },
    uShadow: { value: null }, uShadowMat: { value: new THREE.Matrix4() }, uShadowOn: { value: 0 }, uShadowTexel: { value: 1 / 2048 },
    uPL: { value: Array.from({ length: NLAMP }, () => new THREE.Vector4()) },
    uPD: { value: Array.from({ length: NLAMP }, () => new THREE.Vector4(0, -1, 0, -2)) },
    uPC: { value: Array.from({ length: NLAMP }, () => new THREE.Vector3()) },
  };
}

// Time-of-day keyframes (colours sRGB, converted to linear): hour, zenith, horizon, sun glow,
// light colour/intensity, sky ambient/intensity, ground ambient/intensity, fog, night, exposure.
const KEYS = [
  [0, 0x08161a, 0x1d3a40, 0x1d3a40, 0x8fb0c8, 0.3, 0x2f5560, 0.24, 0x182224, 0.12, 0.00055, 1, 1.7],
  [4.6, 0x0b1c22, 0x23424a, 0x2a4850, 0x8fb0c8, 0.28, 0x2f5560, 0.24, 0x182224, 0.12, 0.00055, 1, 1.7],
  [5.8, 0x2d4766, 0xc98a7a, 0xff9a6a, 0xffb48a, 1.0, 0x7c8296, 0.4, 0x3a3430, 0.2, 0.0005, 0.55, 1.1],
  [6.9, 0x5f93bd, 0xffd2aa, 0xffb070, 0xffd6a8, 2.4, 0x9fb3c0, 0.6, 0x6b6255, 0.3, 0.00042, 0, 0.88],
  [9, 0x4d93c9, 0xf6eee2, 0xfff1d6, 0xfff3e0, 3.0, 0xb2c9d6, 0.72, 0x8a8070, 0.34, 0.00034, 0, 0.82],
  [12.5, 0x3f8dc8, 0xfff7ee, 0xfffaf0, 0xfffaf0, 3.1, 0xb9d0dc, 0.75, 0x8a8070, 0.35, 0.0003, 0, 0.8],
  [16, 0x4a8fc0, 0xfbe9d4, 0xffe6c4, 0xfff0d8, 3.0, 0xa9bfcc, 0.72, 0x7c7366, 0.34, 0.00034, 0, 0.82],
  [17.6, 0x4f7fb0, 0xffc596, 0xff9a52, 0xffc68a, 2.7, 0x9aa6b8, 0.62, 0x6e5f52, 0.3, 0.0004, 0, 0.86],
  [18.4, 0x3a4f80, 0xff7a3c, 0xff6018, 0xff8a4a, 2.1, 0x8a7d96, 0.5, 0x4a3a36, 0.24, 0.00045, 0.22, 0.98],
  [19.1, 0x1f2b4a, 0xb5507a, 0xe0506a, 0xc07090, 0.7, 0x4f4a6a, 0.34, 0x2a2430, 0.16, 0.0005, 0.7, 1.3],
  [20.2, 0x0b1a20, 0x24434a, 0x2c4a50, 0x8fb0c8, 0.3, 0x2f5560, 0.24, 0x182224, 0.12, 0.00055, 1, 1.7],
  [24, 0x08161a, 0x1d3a40, 0x1d3a40, 0x8fb0c8, 0.3, 0x2f5560, 0.24, 0x182224, 0.12, 0.00055, 1, 1.7],
];

function mixHex(a, b, t, k = 1) {
  const A = hex(a), B = hex(b);
  return [0, 1, 2].map((i) => Math.pow(lerp(A[i], B[i], t), 2.2) * k);
}

export function applyTimeOfDay(U, hour, fogScale = 1) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t);
  const night = lerp(a[11], b[11], s);
  const skyK = lerp(1.35, 1.0, night);
  U.uZenith.value.set(...mixHex(a[1], b[1], s, skyK));
  U.uFogCol.value.set(...mixHex(a[2], b[2], s, skyK));
  U.uSunGlow.value.set(...mixHex(a[3], b[3], s, skyK * 1.2));
  U.uLightCol.value.set(...mixHex(a[4], b[4], s, lerp(a[5], b[5], s)));
  U.uSkyAmb.value.set(...mixHex(a[6], b[6], s, lerp(a[7], b[7], s)));
  U.uGndAmb.value.set(...mixHex(a[8], b[8], s, lerp(a[9], b[9], s)));
  U.uFogDen.value = lerp(a[10], b[10], s) * fogScale;
  U.uNight.value = night;
  U.uWet.value = 0.1 + 0.75 * night;
  const ang = ((hour - 6) / 12) * Math.PI;
  const sun = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.95, 0.35).normalize();
  U.uSunDir.value.copy(sun);
  const moon = new THREE.Vector3(-Math.cos(ang), -Math.sin(ang) * 0.9, -0.3).normalize();
  U.uMoonDir.value.copy(moon);
  const ld = sun.y > -0.02 ? sun.clone() : moon.clone();
  ld.y = Math.max(ld.y, 0.12);
  U.uLightDir.value.copy(ld.normalize());
  U.uShadowOn.value = U._shadowEnabled ? (sun.y > 0 ? clamp(sun.y * 6, 0, 1) : 0.35) : 0;
  return lerp(a[12], b[12], s);
}

// ------------------------------------------------------------------------------ materials

export function makeMaterials(U) {
  const mk = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, ...extra });
  const m = {
    ground: mk(S.GROUND_VS, S.GROUND_FS, { vertexColors: true }),
    slab: mk(S.GROUND_VS, S.GROUND_FS, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    road: mk(S.ROAD_VS, S.ROAD_FS, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    build: mk(S.BUILD_VS, S.BUILD_FS, { vertexColors: true }),
    prop: mk(S.PROP_VS, S.PROP_FS, { vertexColors: true, side: THREE.DoubleSide, uniforms: { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 0 } } }),
    glow: mk(S.GLOW_VS, S.GLOW_FS, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }),
  };
  m.road.extensions = { derivatives: true };
  m.build.extensions = { derivatives: true };
  return m;
}

// --------------------------------------------------------------------------- sky & sea

export function makeSky(U) {
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: S.SKY_VS, fragmentShader: S.SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

export function makeSea(U, world) {
  const data = new Uint8Array(HN * HN);
  for (let k = 0; k < HN * HN; k++) data[k] = clamp(Math.round((-world.H[k] / 12) * 255), 0, 255);
  const tex = new THREE.DataTexture(data, HN, HN, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uDepth: { value: tex } }, vertexShader: S.WATER_VS, fragmentShader: S.WATER_FS });
  const geo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(geo, mat);
  sea.frustumCulled = false;
  return sea;
}

// ------------------------------------------------------------------------------- signs

export async function makeSignTexture() {
  try { await document.fonts.load('700 120px "Space Grotesk"'); } catch (e) { /* fall back to system font */ }
  const cv = document.createElement("canvas");
  cv.width = 2048; cv.height = 2048;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
  SIGNS.forEach((t, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = col * 1024 + 512, cy = row * 170 + 85;
    let size = 120;
    g.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`;
    while (g.measureText(t).width > 940 && size > 40) { size -= 4; g.font = `700 ${size}px "Space Grotesk", system-ui, sans-serif`; }
    g.fillText(t, cx, cy + 6);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

export function makeSignMaterial(U, tex) {
  return new THREE.ShaderMaterial({ uniforms: { ...U, uMap: { value: tex } }, vertexShader: S.SIGN_VS, fragmentShader: S.SIGN_FS, vertexColors: true, side: THREE.DoubleSide });
}

// ------------------------------------------------------------------------------- glows

const GLOW_KIND = {
  lamp: { col: [1, 0.8, 0.52], size: 1.6, day: 0, i: 3.5 },
  pool: { col: [1, 0.72, 0.42], size: 9, day: 0, i: 0.8 },
  beacon: { col: [1, 0.15, 0.1], size: 1.1, day: 0.06, i: 3 },
  amber: { col: [1, 0.66, 0.3], size: 1.3, day: 0, i: 2.5 },
  ring: { col: [1, 0.45, 0.2], size: 9, day: 0.12, i: 1.2 },
  neon: { col: [1, 0.45, 0.2], size: 3.2, day: 0, i: 1.4 },
  streak: { i: 1.1 },
};

export function glowGeometry(capacity) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute("iCol", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  g.setAttribute("iP", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  g.setAttribute("iG", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  g.instanceCount = 0;
  return g;
}

export function setGlow(g, i, x, y, z, col, day, size, mode, blink, inten, ground = 0) {
  const P = g.attributes.iPos.array, Cc = g.attributes.iCol.array, Q = g.attributes.iP.array;
  g.attributes.iG.array[i] = ground;
  P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  Cc[i * 4] = col[0]; Cc[i * 4 + 1] = col[1]; Cc[i * 4 + 2] = col[2]; Cc[i * 4 + 3] = day;
  Q[i * 4] = size; Q[i * 4 + 1] = mode; Q[i * 4 + 2] = blink; Q[i * 4 + 3] = inten;
}

// ---------------------------------------------------------------------- chunk builders

const SLAB_Y = 0.15;

function groundColor(world, x, z, h, ny) {
  if (h < -0.2) {
    const t = clamp(-h / 6, 0, 1);
    return [lerp(0.72, 0.3, t), lerp(0.66, 0.37, t), lerp(0.52, 0.36, t)];
  }
  const d = districtAt(x, z);
  const sd = shoreDist(x, z);
  const docks = z > 2300 && x < 1400;
  let c;
  if (h < 2.7 && sd < 110 && !docks && Math.abs(x - (-1250)) > 300) c = [0.91, 0.84, 0.68];
  else if (d === "hills" || d === "park" || d === "meridian" || d === "gardens") {
    const dry = clamp((h - 70) / 80, 0, 1);
    c = [lerp(0.53, 0.66, dry), lerp(0.66, 0.66, dry), lerp(0.43, 0.5, dry)];
  } else if (docks) c = [0.62, 0.6, 0.56];
  else c = [0.64, 0.66, 0.53];
  if (ny < 0.86) { const t = clamp((0.86 - ny) / 0.2, 0, 1); c = [lerp(c[0], 0.55, t), lerp(c[1], 0.52, t), lerp(c[2], 0.47, t)]; }
  return c;
}

function buildGround(world, cx, cz) {
  const n = CHUNK / HRES; // 32 cells
  const i0 = cx * n, j0 = cz * n;
  const V = (n + 1) * (n + 1);
  const pos = new Float32Array(V * 3), nrm = new Float32Array(V * 3), col = new Float32Array(V * 3), pat = new Float32Array(V);
  const H = world.H;
  let k = 0;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const gi = i0 + i, gj = j0 + j;
      const x = -HALF + gi * HRES, z = -HALF + gj * HRES;
      const h = H[gi + gj * HN];
      const hl = H[Math.max(gi - 1, 0) + gj * HN], hr = H[Math.min(gi + 1, HN - 1) + gj * HN];
      const hu = H[gi + Math.max(gj - 1, 0) * HN], hd = H[gi + Math.min(gj + 1, HN - 1) * HN];
      let nx = hl - hr, ny = 2 * HRES, nz = hu - hd;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
      const c = groundColor(world, x, z, h, ny);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      k++;
    }
  }
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = i + j * (n + 1), b = a + 1, c = a + n + 1, d = c + 1;
    // Same diagonal as World.height(): split along (i,j)-(i+1,j+1).
    idx.push(a, d, b, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("pat", new THREE.BufferAttribute(pat, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function buildSlabs(world, data) {
  const g = new Geo({ pat: 1 });
  for (let s of data.slabs) {
    // Pavements reach the road edge: the generator leaves a 0.3 m gap that showed grass.
    if (s.pat === 1) s = { ...s, x0: s.x0 - 0.3, z0: s.z0 - 0.3, x1: s.x1 + 0.3, z1: s.z1 + 0.3 };
    const col = hex(s.color);
    g.e.pat = [s.pat];
    const lift = SLAB_Y + (s.pat === 4 ? 0.05 : s.pat === 0 ? -0.02 : 0);
    const nx = Math.max(1, Math.ceil((s.x1 - s.x0) / 16)), nz = Math.max(1, Math.ceil((s.z1 - s.z0) / 16));
    const P = (i, j) => { const x = lerp(s.x0, s.x1, i / nx), z = lerp(s.z0, s.z1, j / nz); return [x, world.height(x, z) + lift, z]; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      g.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), col, null, [0, 1, 0]);
    }
    // Granite kerbstones round the pavements.
    if (s.pat === 1) {
      g.e.pat = [6];
      const kc = hex(0xbdb9b2), kw = 0.32;
      const strip = (x0, z0, x1, z1) => {
        const n = Math.max(1, Math.ceil(Math.max(x1 - x0, z1 - z0) / 16));
        for (let k = 0; k < n; k++) {
          const ax = lerp(x0, x1, k / n), bx = lerp(x0, x1, (k + 1) / n), az = lerp(z0, z1, k / n), bz = lerp(z0, z1, (k + 1) / n);
          const Y = (x, z) => world.height(x, z) + lift + 0.012;
          if (x1 - x0 > z1 - z0) g.quad([ax, Y(ax, z0), z0], [bx, Y(bx, z0), z0], [bx, Y(bx, z1), z1], [ax, Y(ax, z1), z1], kc, null, [0, 1, 0]);
          else g.quad([x0, Y(x0, az), az], [x1, Y(x1, az), az], [x1, Y(x1, bz), bz], [x0, Y(x0, bz), bz], kc, null, [0, 1, 0]);
        }
      };
      strip(s.x0, s.z0, s.x1, s.z0 + kw); strip(s.x0, s.z1 - kw, s.x1, s.z1);
      strip(s.x0, s.z0 + kw, s.x0 + kw, s.z1 - kw); strip(s.x1 - kw, s.z0 + kw, s.x1, s.z1 - kw);
      g.e.pat = [s.pat];
    }
    // Kerb faces so slabs don't look painted on.
    if (s.pat !== 4) {
      const kerb = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
      const edge = (x0, z0, x1, z1, out) => {
        const a = [x0, world.height(x0, z0) + lift, z0], b = [x1, world.height(x1, z1) + lift, z1];
        g.quad([a[0], a[1] - 0.25, a[2]], [b[0], b[1] - 0.25, b[2]], b, a, kerb, null, out);
      };
      edge(s.x0, s.z0, s.x1, s.z0, [0, 0, -1]);
      edge(s.x1, s.z1, s.x0, s.z1, [0, 0, 1]);
      edge(s.x0, s.z1, s.x0, s.z0, [-1, 0, 0]);
      edge(s.x1, s.z0, s.x1, s.z1, [1, 0, 0]);
    }
  }
  return g.count ? g.build() : null;
}

function buildRoads(world, data) {
  const pos = [], uv = [], ri = [];
  const push = (x, y, z, u, v, info) => { pos.push(x, y, z); uv.push(u, v); ri.push(...info); };
  for (const { e, i } of data.segs) {
    const p = e.rib[i], q = e.rib[i + 1];
    const info = [e.hw, e.type, e.cross[0] ? e.sA : -1, e.cross[1] ? e.sB : -1];
    const pr = [-p.tz, p.tx], qr = [-q.tz, q.tx];
    const a = [p.x - pr[0] * e.hw, p.y, p.z - pr[1] * e.hw], b = [p.x + pr[0] * e.hw, p.y, p.z + pr[1] * e.hw];
    const c = [q.x + qr[0] * e.hw, q.y, q.z + qr[1] * e.hw], d = [q.x - qr[0] * e.hw, q.y, q.z - qr[1] * e.hw];
    // Two triangles, counter-clockwise from above.
    push(...a, -e.hw, p.s, info); push(...c, e.hw, q.s, info); push(...d, -e.hw, q.s, info);
    push(...a, -e.hw, p.s, info); push(...b, e.hw, p.s, info); push(...c, e.hw, q.s, info);
  }
  for (const n of data.nodes) {
    const info = [n.hx, 9, -1, -1];
    const Y = (x, z) => (n.water ? DECK + 0.08 : world.height(x, z) + 0.08);
    const x0 = n.x - n.hx, x1 = n.x + n.hx, z0 = n.z - n.hz, z1 = n.z + n.hz;
    push(x0, Y(x0, z0), z0, 0, 0, info); push(x0, Y(x0, z1), z1, 0, 0, info); push(x1, Y(x1, z1), z1, 0, 0, info);
    push(x0, Y(x0, z0), z0, 0, 0, info); push(x1, Y(x1, z1), z1, 0, 0, info); push(x1, Y(x1, z0), z0, 0, 0, info);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("rinfo", new THREE.BufferAttribute(new Float32Array(ri), 4));
  g.computeBoundingSphere();
  return g;
}

const CELLW = [1.7, 3.6, 3.0, 3.2, 6, 6, 3.4, 4, 4.5, 8, 8, 8];
const ROOF = { [ST.GLASS]: 0x3c4446, [ST.OFFICE]: 0x6f6a62, [ST.HOSP]: 0xc9c2b6, [ST.WARE]: 0x8a8073, [ST.VILLA]: 0xefe3d2, [ST.LOGO]: 0x182b2e };

function boxWalls(g, x0, z0, x1, z1, y0, y1, gy, col, style, packed, top, roofCol, roof = 0) {
  const cw = CELLW[style] || 4;
  const faces = [
    [[x0, z0], [x1, z0], [0, 0, -1]],
    [[x1, z0], [x1, z1], [1, 0, 0]],
    [[x1, z1], [x0, z1], [0, 0, 1]],
    [[x0, z1], [x0, z0], [-1, 0, 0]],
  ];
  g.e.bdata = [style, packed, top];
  for (const [a, b, n] of faces) {
    const W = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cells = Math.max(1, Math.round(W / cw));
    g.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], col,
      [[0, y0 - gy], [cells, y0 - gy], [cells, y1 - gy], [0, y1 - gy]], n);
  }
  if (roof === 0) {
    g.e.uv = [0, 0];
    g.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], roofCol, [[0, 0], [0, 0], [0, 0], [0, 0]], [0, 1, 0]);
  } else {
    // Pitched roof: ridge along x (1) or z (2), gables in wall colour.
    const rh = Math.min(x1 - x0, z1 - z0) * 0.38;
    const zero = [[0, 0], [0, 0], [0, 0]];
    if (roof === 1) {
      const zm = (z0 + z1) / 2;
      g.quad([x0 - 0.4, y1, z0 - 0.5], [x1 + 0.4, y1, z0 - 0.5], [x1 + 0.4, y1 + rh, zm], [x0 - 0.4, y1 + rh, zm], roofCol, [[0, 0], [0, 0], [0, 0], [0, 0]], [0, 1, -1]);
      g.quad([x1 + 0.4, y1, z1 + 0.5], [x0 - 0.4, y1, z1 + 0.5], [x0 - 0.4, y1 + rh, zm], [x1 + 0.4, y1 + rh, zm], roofCol, [[0, 0], [0, 0], [0, 0], [0, 0]], [0, 1, 1]);
      g.e.bdata = [ST.CONC, packed, top];
      g.tri([x0, y1, z0], [x0, y1, z1], [x0, y1 + rh, zm], col, zero);
      g.tri([x1, y1, z1], [x1, y1, z0], [x1, y1 + rh, zm], col, zero);
    } else {
      const xm = (x0 + x1) / 2;
      g.quad([x0 - 0.5, y1, z1 + 0.4], [x0 - 0.5, y1, z0 - 0.4], [xm, y1 + rh, z0 - 0.4], [xm, y1 + rh, z1 + 0.4], roofCol, [[0, 0], [0, 0], [0, 0], [0, 0]], [-1, 1, 0]);
      g.quad([x1 + 0.5, y1, z0 - 0.4], [x1 + 0.5, y1, z1 + 0.4], [xm, y1 + rh, z1 + 0.4], [xm, y1 + rh, z0 - 0.4], roofCol, [[0, 0], [0, 0], [0, 0], [0, 0]], [1, 1, 0]);
      g.e.bdata = [ST.CONC, packed, top];
      g.tri([x0, y1, z0], [x1, y1, z0], [xm, y1 + rh, z0], col, zero);
      g.tri([x1, y1, z1], [x0, y1, z1], [xm, y1 + rh, z1], col, zero);
    }
  }
}

// Ledges, cornices, awnings, water tanks and antennas: geometry that breaks up the boxes.
function band(g, x0, z0, x1, z1, y0, y1, out, col, style = 12) {
  const packed = 0.5;
  boxWalls(g, x0 - out, z0 - out, x1 + out, z1 + out, y0, y1, y0, col, style, packed, 0, col, 0);
  g.e.bdata = [style, packed, 0];
  g.e.uv = [0, 0];
  g.quad([x0 - out, y0, z0 - out], [x1 + out, y0, z0 - out], [x1 + out, y0, z1 + out], [x0 - out, y0, z1 + out], [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7], [[0, 0], [0, 0], [0, 0], [0, 0]], [0, -1, 0]);
}

// A parapet: a low wall round the roof edge with a coping on top, open in the middle so the roof
// itself shows. It can stand proud of the walls by `out`; its inner faces start at the roof (roofY).
function parapet(g, x0, z0, x1, z1, y0, y1, out, wth, col, roofY, style = 12) {
  const X0 = x0 - out, Z0 = z0 - out, X1 = x1 + out, Z1 = z1 + out;
  const i0 = x0 + wth, k0 = z0 + wth, i1 = x1 - wth, k1 = z1 - wth;
  const inner = [col[0] * 0.85, col[1] * 0.85, col[2] * 0.85], under = [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6];
  g.e.bdata = [style, 0.5, 0]; g.e.uv = [0, 0];
  const Q = (a, b, c, d, n, cc = col) => g.quad(a, b, c, d, cc, null, n);
  Q([X0, y0, Z0], [X1, y0, Z0], [X1, y1, Z0], [X0, y1, Z0], [0, 0, -1]);
  Q([X1, y0, Z0], [X1, y0, Z1], [X1, y1, Z1], [X1, y1, Z0], [1, 0, 0]);
  Q([X1, y0, Z1], [X0, y0, Z1], [X0, y1, Z1], [X1, y1, Z1], [0, 0, 1]);
  Q([X0, y0, Z1], [X0, y0, Z0], [X0, y1, Z0], [X0, y1, Z1], [-1, 0, 0]);
  Q([i0, roofY, k0], [i1, roofY, k0], [i1, y1, k0], [i0, y1, k0], [0, 0, 1], inner);
  Q([i1, roofY, k0], [i1, roofY, k1], [i1, y1, k1], [i1, y1, k0], [-1, 0, 0], inner);
  Q([i1, roofY, k1], [i0, roofY, k1], [i0, y1, k1], [i1, y1, k1], [0, 0, -1], inner);
  Q([i0, roofY, k1], [i0, roofY, k0], [i0, y1, k0], [i0, y1, k1], [1, 0, 0], inner);
  const up = [0, 1, 0];
  Q([X0, y1, Z0], [X1, y1, Z0], [X1, y1, k0], [X0, y1, k0], up);
  Q([X0, y1, k1], [X1, y1, k1], [X1, y1, Z1], [X0, y1, Z1], up);
  Q([X0, y1, k0], [i0, y1, k0], [i0, y1, k1], [X0, y1, k1], up);
  Q([i1, y1, k0], [X1, y1, k0], [X1, y1, k1], [i1, y1, k1], up);
  if (out > 0) {
    const dn = [0, -1, 0];
    Q([X0, y0, Z0], [X1, y0, Z0], [X1, y0, z0], [X0, y0, z0], dn, under);
    Q([X0, y0, z1], [X1, y0, z1], [X1, y0, Z1], [X0, y0, Z1], dn, under);
    Q([X0, y0, z0], [x0, y0, z0], [x0, y0, z1], [X0, y0, z1], dn, under);
    Q([x1, y0, z0], [X1, y0, z0], [X1, y0, z1], [x1, y0, z1], dn, under);
  }
}

function detailBuilding(g, b, col, packed) {
  const u = (k) => (b.seed * 9.71 + k * 0.618) % 1;
  const W = b.x1 - b.x0, D = b.z1 - b.z0, top = b.gy + b.h;
  const trim = [Math.min(1, col[0] * 1.08 + 0.04), Math.min(1, col[1] * 1.08 + 0.04), Math.min(1, col[2] * 1.06 + 0.04)];
  if (b.style === ST.DECO || b.style === ST.OFFICE || b.style === ST.HOSP) {
    if (b.h > 12 && !(b.tiers && b.tiers.length)) parapet(g, b.x0, b.z0, b.x1, b.z1, top - 0.2, top + 0.9, 0.35, 0.3, trim, top);
    const every = b.style === ST.OFFICE ? 3 : b.style === ST.HOSP ? 4 : 2;
    for (let f = every; f * 3.6 < b.h - 4; f += every) band(g, b.x0, b.z0, b.x1, b.z1, b.gy + f * 3.6 - 0.12, b.gy + f * 3.6 + 0.18, 0.22, trim);
    if (b.style !== ST.HOSP) band(g, b.x0, b.z0, b.x1, b.z1, b.gy + 3.3, b.gy + 3.7, 0.3, trim);
  }
  if (b.style === ST.DECO && W > 6) {
    // Striped awnings over the shopfronts on the long faces.
    const ac = b.neon >= 0 ? hex(NEON[b.neon]) : hex(PAL.orange);
    const white = hex(0xfff7ee);
    g.e.bdata = [12, 0.5, 0]; g.e.uv = [0, 0];
    for (const [z, dz] of [[b.z0, -1], [b.z1, 1]]) {
      const n = Math.max(2, Math.floor(W / 1.2));
      for (let k = 0; k < n; k++) {
        const xa = b.x0 + 0.6 + ((W - 1.2) * k) / n, xb = b.x0 + 0.6 + ((W - 1.2) * (k + 1)) / n;
        const c = k % 2 ? white : ac;
        g.quad([xa, b.gy + 3.25, z], [xb, b.gy + 3.25, z], [xb, b.gy + 2.75, z + dz * 1.6], [xa, b.gy + 2.75, z + dz * 1.6], c, null, [0, 0.8, dz]);
      }
    }
  }
  if (!b.roof && (b.style === ST.DECO || b.style === ST.OFFICE) && b.h > 14 && b.h < 50 && u(7) < 0.45 && W > 10 && D > 10) {
    // Water tank on legs.
    const x = lerp(b.x0 + 4, b.x1 - 4, u(8)), z = lerp(b.z0 + 4, b.z1 - 4, u(9));
    g.e.bdata = [ST.STEEL, 0.5, 0]; g.e.uv = [0, 0];
    const wood = hex(0x8a6a4c), steel = hex(0x5d6466);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.tube([x + dx, top, z + dz], [x + dx * 0.9, top + 3, z + dz * 0.9], 0.1, 0.1, steel, 4);
    g.tube([x, top + 3, z], [x, top + 6.2, z], 1.7, 1.7, wood, 10);
    g.tube([x, top + 6.2, z], [x, top + 7.4, z], 1.8, 0.05, steel, 10);
  }
  const flat = !b.roof;
  const tiers = b.tiers && b.tiers.length;
  // Corner piers and pilasters between the window bays, from above the shopfronts to the parapet.
  if ((b.style === ST.DECO || b.style === ST.OFFICE || b.style === ST.HOSP) && b.h > 8) {
    const pc = [col[0] * 0.92, col[1] * 0.92, col[2] * 0.9];
    const y1 = top - 0.2, cw = CELLW[b.style];
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]) band(g, x - 0.35, z - 0.35, x + 0.35, z + 0.35, b.gy + 0.3, y1, 0, pc);
    const every = b.style === ST.OFFICE ? 2 : 3;
    if (b.h > 12) for (const [a0, a1, fixed, axis, sgn] of [[b.x0, b.x1, b.z0, 0, -1], [b.x0, b.x1, b.z1, 0, 1], [b.z0, b.z1, b.x0, 1, -1], [b.z0, b.z1, b.x1, 1, 1]]) {
      const cells = Math.max(1, Math.round((a1 - a0) / cw)), step = (a1 - a0) / cells;
      for (let k = every; k < cells - every / 2; k += every) {
        const a = a0 + k * step, f = fixed + sgn * 0.08;
        if (axis === 0) band(g, a - 0.17, f - 0.1, a + 0.17, f + 0.1, b.gy + 3.7, y1, 0, pc);
        else band(g, f - 0.1, a - 0.17, f + 0.1, a + 0.17, b.gy + 3.7, y1, 0, pc);
      }
    }
  }
  // Art deco crowns: stepped piers rising over the parapet in the middle of each long face.
  if (b.style === ST.DECO && flat && !tiers && b.h > 14 && W > 12) {
    const cx = (b.x0 + b.x1) / 2;
    for (const [z, dz] of [[b.z0, 1], [b.z1, -1]]) {
      let y = top + 0.9;
      for (let k = 0; k < 3; k++) {
        const hw = W * (0.16 - k * 0.045), hh = 1.4 - k * 0.3;
        band(g, cx - hw, Math.min(z, z + dz * 1.2), cx + hw, Math.max(z, z + dz * 1.2), y, y + hh, 0, trim);
        y += hh;
      }
    }
  }
  // Glass towers: steel fins up the curtain wall, a lit crown line at the top.
  if ((b.style === ST.GLASS || b.style === ST.LOGO) && b.h > 20) {
    const steel = [0.16, 0.18, 0.2];
    const boxes = [{ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y1: b.h }, ...(b.tiers || [])];
    for (const t of boxes) {
      const ya = b.gy + (t.y0 != null ? t.y0 : 4.2), yb = b.gy + t.y1;
      for (const [a0, a1, fixed, axis, sgn] of [[t.x0, t.x1, t.z0, 0, -1], [t.x0, t.x1, t.z1, 0, 1], [t.z0, t.z1, t.x0, 1, -1], [t.z0, t.z1, t.x1, 1, 1]]) {
        const n = Math.max(1, Math.round((a1 - a0) / 3.4));
        for (let k = 1; k < n; k++) {
          const a = a0 + ((a1 - a0) * k) / n, f = fixed + sgn * 0.14;
          if (axis === 0) band(g, a - 0.07, f - 0.14, a + 0.07, f + 0.14, ya, yb, 0, steel, ST.STEEL);
          else band(g, f - 0.14, a - 0.07, f + 0.14, a + 0.07, ya, yb, 0, steel, ST.STEEL);
        }
      }
    }
    const t = boxes[boxes.length - 1], yb = b.gy + t.y1;
    if (u(11) < 0.6) band(g, t.x0, t.z0, t.x1, t.z1, yb - 0.55, yb - 0.25, 0.06, u(12) < 0.5 ? [0.85, 0.95, 1] : [1, 0.85, 0.6], ST.NEON);
    parapet(g, t.x0, t.z0, t.x1, t.z1, yb, yb + 1.1, 0, 0.25, [0.2, 0.22, 0.24], yb, ST.CONC);
  }
  // Houses: a cornice, and balconies on some.
  if (b.style === ST.HOUSE || b.style === ST.VILLA) {
    if (flat) parapet(g, b.x0, b.z0, b.x1, b.z1, top - 0.3, top + 0.35, 0.28, 0.25, trim, top);
    if (b.h > 7 && u(13) < 0.5) {
      const cw = CELLW[b.style], fh = b.style === ST.HOUSE ? 3 : 3.5, rail = u(14) < 0.5 ? trim : [col[0] * 0.72, col[1] * 0.72, col[2] * 0.7];
      let made = 0;
      for (const [z, dz] of [[b.z0, -1], [b.z1, 1]]) {
        const cells = Math.max(1, Math.round(W / cw)), step = W / cells;
        for (let f = 1; f * fh < b.h - 1.5 && made < 48; f++) for (let k = (f % 2); k < cells && made < 48; k += 2) {
          const xa = b.x0 + k * step + 0.25, xb = b.x0 + (k + 1) * step - 0.25, y = b.gy + f * fh;
          const za = Math.min(z, z + dz * 1.1), zb = Math.max(z, z + dz * 1.1);
          band(g, xa, za, xb, zb, y - 0.15, y, 0, trim);
          const zo = z + dz * 1.05;
          band(g, xa, Math.min(zo, zo - dz * 0.06), xb, Math.max(zo, zo - dz * 0.06), y, y + 0.95, 0, rail);
          made++;
        }
      }
    }
  }
  // Chimneys on pitched roofs.
  if (b.roof && W > 5 && D > 5 && u(16) < 0.75) {
    const rh = Math.min(W, D) * 0.38, brick = u(17) < 0.6 ? [0.55, 0.3, 0.24] : [col[0] * 0.8, col[1] * 0.8, col[2] * 0.78];
    const x = b.roof === 1 ? lerp(b.x0 + 1, b.x1 - 1.8, u(18)) : (b.x0 + b.x1) / 2 + W * 0.12;
    const z = b.roof === 1 ? (b.z0 + b.z1) / 2 + D * 0.12 : lerp(b.z0 + 1, b.z1 - 1.8, u(18));
    band(g, x, z, x + 0.8, z + 0.8, top, top + rh + 0.9, 0, brick, ST.CONC);
    band(g, x - 0.08, z - 0.08, x + 0.88, z + 0.88, top + rh + 0.9, top + rh + 1.05, 0, [0.35, 0.33, 0.32], ST.CONC);
  }
  // Rooftop plant on flat roofs: air-con units, vents, a stair housing, sometimes a mast.
  if (flat && b.style !== ST.HOUSE && b.style !== ST.VILLA && W > 9 && D > 9) {
    const t = tiers ? b.tiers[b.tiers.length - 1] : { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y1: b.h };
    const ty = b.gy + t.y1;
    const tw = t.x1 - t.x0, td = t.z1 - t.z0;
    if (tw > 6 && td > 6) {
      const grey = [0.7, 0.7, 0.68], dark = [0.42, 0.43, 0.42];
      const n = 2 + Math.floor(u(15) * 4);
      for (let k = 0; k < n; k++) {
        const x = lerp(t.x0 + 2, t.x1 - 3.5, u(20 + k)), z = lerp(t.z0 + 2, t.z1 - 3, u(30 + k));
        band(g, x, z, x + 1.6, z + 1.1, ty, ty + 1.1, 0, grey, ST.CONC);
        band(g, x + 0.3, z + 0.15, x + 1.3, z + 0.95, ty + 1.1, ty + 1.2, 0, dark, ST.STEEL);
      }
      for (let k = 0; k < 3; k++) {
        const x = lerp(t.x0 + 1.5, t.x1 - 1.5, u(40 + k)), z = lerp(t.z0 + 1.5, t.z1 - 1.5, u(50 + k));
        g.e.bdata = [ST.STEEL, 0.5, 0]; g.e.uv = [0, 0];
        g.tube([x, ty, z], [x, ty + 1 + u(45 + k), z], 0.14, 0.14, dark, 6);
      }
      if (b.h > 12) {
        const x = lerp(t.x0 + 1.5, t.x1 - 4.5, u(60)), z = lerp(t.z0 + 1.5, t.z1 - 4, u(61));
        band(g, x, z, x + 3, z + 2.5, ty, ty + 2.8, 0, [col[0] * 0.85, col[1] * 0.85, col[2] * 0.83], ST.CONC);
      }
      if (u(62) < 0.3) {
        const x = lerp(t.x0 + 2, t.x1 - 2, u(63)), z = lerp(t.z0 + 2, t.z1 - 2, u(64));
        g.e.bdata = [ST.STEEL, 0.5, 0]; g.e.uv = [0, 0];
        g.tube([x, ty, z], [x, ty + 8 + u(65) * 10, z], 0.18, 0.05, [0.55, 0.57, 0.58], 4);
      }
    }
  }
  const tall = b.tiers && b.tiers.length ? b.tiers[b.tiers.length - 1] : null;
  if (b.style === ST.GLASS && b.h > 70) {
    const t = tall || b, ty = b.gy + (tall ? tall.y1 : b.h);
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    g.e.bdata = [ST.STEEL, 0.5, 0]; g.e.uv = [0, 0];
    if (u(3) < 0.5) {
      g.tube([cx, ty, cz], [cx, ty + 12 + u(4) * 18, cz], 0.5, 0.15, hex(0x9aa3a4), 6);
    } else {
      band(g, t.x0 + 1.5, t.z0 + 1.5, t.x1 - 1.5, t.z1 - 1.5, ty, ty + 2.5, 0, hex(0x3c4446), ST.CONC);
    }
  }
}

function buildBuildings(world, data) {
  const g = new Geo({ uv: 2, bdata: 3 });
  for (const b of data.buildings) {
    const col = hex(b.color);
    const packed = (b.neon + 1) + b.seed * 0.999;
    let roofCol;
    if (b.roof) roofCol = hex(b.seed < 0.6 ? PAL.clay : b.seed < 0.85 ? 0x5f6a6a : PAL.spruce);
    else roofCol = ROOF[b.style] != null ? hex(ROOF[b.style]) : [col[0] * 0.8, col[1] * 0.8, col[2] * 0.78];
    const top = b.gy + b.h;
    boxWalls(g, b.x0, b.z0, b.x1, b.z1, b.y0, top, b.gy, col, b.style, packed, b.h, roofCol, b.roof);
    for (const t of b.tiers || []) boxWalls(g, t.x0, t.z0, t.x1, t.z1, b.gy + t.y0, b.gy + t.y1, b.gy, col, b.style, packed, t.y1, roofCol, 0);
    detailBuilding(g, b, col, packed);
    // Rooftop plant on offices and towers.
    if (!b.roof && (b.style === ST.OFFICE || b.style === ST.GLASS || b.style === ST.HOSP) && b.x1 - b.x0 > 14) {
      const tt = b.tiers && b.tiers.length ? b.tiers[b.tiers.length - 1] : { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y1: b.h };
      const ty = b.gy + tt.y1;
      const u = (k) => (b.seed * 7.3 + k * 0.37) % 1;
      const mx = lerp(tt.x0 + 3, tt.x1 - 7, u(1)), mz = lerp(tt.z0 + 3, tt.z1 - 7, u(2));
      boxWalls(g, mx, mz, mx + 4 + u(3) * 3, mz + 3 + u(4) * 3, ty, ty + 2.2 + u(5) * 1.5, ty, [0.62, 0.62, 0.6], ST.CONC, 0.5, 3, [0.5, 0.5, 0.48]);
    }
  }
  // Bridge decks, parapets and piers.
  const conc = hex(0xc9c2b6), concD = hex(0xa69f93);
  for (const { e, i } of data.segs) {
    const p = e.rib[i], q = e.rib[i + 1];
    const hp = world.height(p.x, p.z), hq = world.height(q.x, q.z);
    if (Math.max(p.y - hp, q.y - hq) < 0.6) continue;
    const pr = [-p.tz, p.tx], qr = [-q.tz, q.tx];
    g.e.bdata = [ST.CONC, 0.3, 0];
    g.e.uv = [0, 0];
    for (const side of [-1, 1]) {
      const o0 = e.hw * side, o1 = (e.hw + 0.45) * side;
      const P = (pt, r, o, dy) => [pt.x + r[0] * o, pt.y + dy, pt.z + r[1] * o];
      const out = [pr[0] * side, 0, pr[1] * side];
      g.quad(P(p, pr, o1, -1.3), P(q, qr, o1, -1.3), P(q, qr, o1, 0.95), P(p, pr, o1, 0.95), conc, null, out);
      g.quad(P(p, pr, o0, 0), P(q, qr, o0, 0), P(q, qr, o0, 0.95), P(p, pr, o0, 0.95), conc, null, [-out[0], 0, -out[2]]);
      g.quad(P(p, pr, o0, 0.95), P(q, qr, o0, 0.95), P(q, qr, o1, 0.95), P(p, pr, o1, 0.95), conc, null, [0, 1, 0]);
    }
    const W = e.hw + 0.45;
    g.quad([p.x - pr[0] * W, p.y - 1.3, p.z - pr[1] * W], [q.x - qr[0] * W, q.y - 1.3, q.z - qr[1] * W], [q.x + qr[0] * W, q.y - 1.3, q.z + qr[1] * W], [p.x + pr[0] * W, p.y - 1.3, p.z + pr[1] * W], concD, null, [0, -1, 0]);
    const first = Math.ceil(p.s / 32) * 32;
    for (let s = first; s < q.s; s += 32) {
      const t = (s - p.s) / (q.s - p.s || 1);
      const x = lerp(p.x, q.x, t), z = lerp(p.z, q.z, t), y = lerp(p.y, q.y, t);
      const h = world.height(x, z);
      if (y - h < 2) continue;
      for (const o of e.hw > 7 ? [-e.hw * 0.55, e.hw * 0.55] : [0]) {
        const px = x - p.tz * o, pz = z + p.tx * o;
        boxWalls(g, px - 1.1, pz - 1.1, px + 1.1, pz + 1.1, Math.min(h, 0) - 3, y - 1.3, 0, conc, ST.CONC, 0.2, 0, concD);
      }
    }
  }
  return g.count ? g.build() : null;
}

function buildFlora(data) {
  const g = new Geo({ cdata: 2 });
  for (const p of data.props) {
    if (p.kind === "palm") propPalm(g, p);
    else if (p.kind === "tree" || p.kind === "pine") propTree(g, p);
    else if (p.kind === "crane") propCrane(g, p);
  }
  return g.count ? g.build() : null;
}

const carGeos = [];
export const KIT_PARKED = { on: false };
function mergeCar(g, p) {
  if (!carGeos[p.type]) carGeos[p.type] = trafficGeometry(CAR_TYPES[p.type]);
  const src = carGeos[p.type];
  const P = src.attributes.position.array, N = src.attributes.normal.array, C = src.attributes.color.array, D = src.attributes.cdata.array;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw), col = hex(p.color);
  for (let i = 0; i < P.length / 3; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    g.pos.push(p.x + x * c + z * s, p.y + y, p.z - x * s + z * c);
    const nx = N[i * 3], nz = N[i * 3 + 2];
    g.nrm.push(nx * c + nz * s, N[i * 3 + 1], -nx * s + nz * c);
    const paint = D[i * 2] > 0.5;
    g.col.push(C[i * 3] * (paint ? col[0] : 1), C[i * 3 + 1] * (paint ? col[1] : 1), C[i * 3 + 2] * (paint ? col[2] : 1));
    g.ex.cdata.push(paint ? 1 : 0, D[i * 2 + 1] === 2 ? 0 : 0);
  }
}

function propFurniture(g, p) {
  g.e.cdata = [0, 0];
  if (p.kind === "bin") {
    g.tube([p.x, p.y, p.z], [p.x, p.y + 0.95, p.z], 0.3, 0.32, hex(0x2f757c), 8);
    g.tube([p.x, p.y + 0.95, p.z], [p.x, p.y + 1.02, p.z], 0.34, 0.3, hex(0x182b2e), 8);
  } else if (p.kind === "hydrant") {
    g.tube([p.x, p.y, p.z], [p.x, p.y + 0.7, p.z], 0.15, 0.15, hex(0xff6018), 6);
    g.tube([p.x, p.y + 0.7, p.z], [p.x, p.y + 0.85, p.z], 0.15, 0.05, hex(0xff6018), 6);
    g.box(0, 0.5, 0, 0.5, 0.1, 0.1, hex(0xd8d0c4), p.rot, p.x, p.y, p.z);
  } else if (p.kind === "pit") {
    // Tree pit: an iron grate round the trunk.
    const iron = hex(0x2b2e2e), soil = hex(0x3a2e24);
    g.box(0, 0.015, 0, 1.4, 0.03, 1.4, iron, p.rot, p.x, p.y, p.z);
    for (let k = -2; k <= 2; k++) g.box(k * 0.26, 0.035, 0, 0.05, 0.02, 1.3, hex(0x45494a), p.rot, p.x, p.y, p.z);
    g.box(0, 0.04, 0, 0.5, 0.02, 0.5, soil, p.rot, p.x, p.y, p.z);
  } else if (p.kind === "meter") {
    const grey = hex(0x5d6466), head = hex(0x283f43);
    g.tube([p.x, p.y, p.z], [p.x, p.y + 1.05, p.z], 0.04, 0.04, grey, 6);
    g.box(0, 1.22, 0, 0.2, 0.34, 0.15, head, p.rot, p.x, p.y, p.z);
    g.box(0, 1.42, 0, 0.16, 0.06, 0.12, grey, p.rot, p.x, p.y, p.z);
    g.e.cdata = [0, 3];
    g.box(0, 1.27, -0.078, 0.12, 0.08, 0.01, hex(0x3fd0c9), p.rot, p.x, p.y, p.z);
    g.e.cdata = [0, 0];
  } else if (p.kind === "shelter") {
    // Bus shelter: local x along the kerb, +z away from the road.
    const steel = hex(0x283f43), glass = hex(0x9fb7bd), wood = hex(0xa7957d);
    const B = (x, y, z, sx, sy, sz, c) => g.box(x, y, z, sx, sy, sz, c, p.rot, p.x, p.y, p.z);
    B(0, 2.5, 0.05, 4.2, 0.1, 1.8, steel);
    for (const x of [-2, 2]) for (const z of [-0.7, 0.75]) B(x, 1.25, z, 0.08, 2.5, 0.08, steel);
    B(0, 1.3, 0.78, 3.9, 2.0, 0.04, glass);
    B(0, 0.25, 0.78, 3.9, 0.08, 0.06, steel);
    B(-2, 1.3, 0.05, 0.04, 2.0, 1.4, glass);
    B(-0.4, 0.46, 0.5, 2.2, 0.06, 0.4, wood);
    for (const x of [-1.4, 0.6]) B(x, 0.22, 0.5, 0.06, 0.44, 0.36, steel);
    // Lit advert panel at the downstream end.
    B(2, 1.25, 0.05, 0.14, 2.1, 1.3, steel);
    g.e.cdata = [0, 3];
    const ad = [hex(0xff6a2e), hex(0x3fd0c9), hex(0xffc667), hex(0xcc75a0)][Math.floor((p.ad || 0) * 4)].map((v) => v * 0.5);
    for (const sx of [-1, 1]) B(2 + sx * 0.075, 1.3, 0.05, 0.01, 1.7, 1.05, ad);
    g.e.cdata = [0, 0];
  } else if (p.kind === "namesign") {
    // Street-name sign: a post with two blades, one along each street.
    const pole = hex(0x5d6466), green = hex(0x1f5c45), white = hex(0xfff7ee);
    g.tube([p.x, p.y, p.z], [p.x, p.y + 3.1, p.z], 0.05, 0.05, pole, 6);
    g.box(-p.sx * 0.55, 3.0, 0, 1.2, 0.22, 0.03, green, 0, p.x, p.y, p.z);
    g.box(-p.sx * 0.55, 3.0, 0, 1.12, 0.03, 0.035, white, 0, p.x, p.y, p.z);
    g.box(0, 2.72, -p.sz * 0.55, 0.03, 0.22, 1.2, green, 0, p.x, p.y, p.z);
    g.box(0, 2.72, -p.sz * 0.55, 0.035, 0.03, 1.12, white, 0, p.x, p.y, p.z);
  } else if (p.kind === "bench") {
    const wood = hex(0xa7957d), iron = hex(0x283f43);
    g.box(0, 0.45, 0, 1.8, 0.08, 0.5, wood, p.rot, p.x, p.y, p.z);
    g.box(0, 0.8, 0.22, 1.8, 0.4, 0.06, wood, p.rot, p.x, p.y, p.z);
    for (const dx of [-0.8, 0.8]) g.box(dx, 0.22, 0, 0.08, 0.45, 0.5, iron, p.rot, p.x, p.y, p.z);
  }
}

// Shopfront on a venue's door face: lit windows, a door, an awning in the brand colour and a
// board behind the sign. Local frame: +z out of the building, +x along the facade.
const WINDOW = { arms: 0xffc38a, mart: 0xe9fbff, threads: 0xffd3e6, clinic: 0xe6fffb, home: 0xffd9a8 };
function storefront(g, v) {
  const yaw = Math.atan2(v.nx, v.nz), W = Math.abs(v.nx) ? v.z1 - v.z0 : v.x1 - v.x0;
  const B = (x, y, z, sx, sy, sz, col, e = 0) => { g.e.cdata = [0, e]; g.box(x, y, z, sx, sy, sz, hex(col), yaw, v.door.x, v.gy, v.door.z); };
  const dark = 0x182b2e, lit = WINDOW[v.kind] || 0xffe0b0;
  if (v.kind === "home") {
    B(0, 1.2, 0.05, 1.3, 2.4, 0.12, 0x5a4636);
    B(0, 1.2, 0.08, 1.5, 2.55, 0.06, 0xefe3d2);
    B(0.45, 1.15, 0.14, 0.08, 0.08, 0.06, 0xd7a03d);
    B(0, 0.08, 0.9, 2.4, 0.16, 1.4, 0xd9d2c7);
    B(1.1, 2.4, 0.15, 0.2, 0.28, 0.12, lit, 4);
    g.e.cdata = [0, 0];
    return;
  }
  const paneW = Math.max(1.5, W / 2 - 2.2), px = W / 4 + 0.55;
  for (const sx of [-1, 1]) {
    B(sx * px, 1.75, 0.05, paneW, 2.5, 0.1, lit, 4);
    B(sx * px, 0.35, 0.1, paneW + 0.2, 0.7, 0.2, dark);
    if (v.kind === "arms") for (let k = -paneW / 2 + 0.2; k < paneW / 2; k += 0.4) B(sx * px + k, 1.75, 0.16, 0.05, 2.5, 0.05, 0x3d4a4c);
  }
  B(0, 1.25, 0.04, 1.8, 2.5, 0.08, lit, 4);
  for (const sx of [-1, 1]) B(sx * 1, 1.3, 0.1, 0.16, 2.6, 0.16, dark);
  B(0, 2.65, 0.1, 2.2, 0.2, 0.16, dark);
  B(0, 3.25, 0.12, W - 0.4, 0.5, 0.2, dark);
  const aw = v.kind === "clinic" ? 0x2f757c : v.accent;
  B(0, 3.55, 0.8, W - 1, 0.14, 1.5, aw);
  B(0, 3.42, 1.55, W - 1, 0.32, 0.06, aw);
  B(0, 4.4, 0.18, Math.min(W - 2, 11) + 0.5, 2.1, 0.3, dark);
  if (v.kind === "clinic") { B(0, 7, 0.2, 2.2, 0.7, 0.2, 0x3fd0c9, 4); B(0, 7, 0.2, 0.7, 2.2, 0.2, 0x3fd0c9, 4); }
  if (v.kind === "mart") B(W / 2 - 1.4, 2.9, 0.2, 1.1, 0.35, 0.08, 0xff6a2e, 4);
  g.e.cdata = [0, 0];
}

// Fire escapes, scaffolding and landmarks arrive from map.js as primitive lists:
// [0 box: cx y cz sx sy sz col e yaw], [1 tube: a b r0 r1 col e n], [2 blob: c r col e], [3 hexa: corners col e].
function drawParts(g, list) {
  for (const p of list) {
    if (p[0] === 0) { g.e.cdata = [0, p[8]]; g.box(0, p[5] / 2, 0, p[4], p[5], p[6], hex(p[7]), p[9], p[1], p[2], p[3]); }
    else if (p[0] === 1) {
      if (Math.hypot(p[4] - p[1], p[5] - p[2], p[6] - p[3]) < 1e-4) continue;
      g.e.cdata = [0, p[10]]; g.tube([p[1], p[2], p[3]], [p[4], p[5], p[6]], p[7], p[8], hex(p[9]), p[11]);
    } else if (p[0] === 2) { g.e.cdata = [0, p[8]]; g.blob(p[1], p[2], p[3], p[4], p[5], p[6], hex(p[7]), p[1] * 0.1); }
    else if (p[0] === 3) { g.e.cdata = [0, p[3]]; g.hexa(p[1], hex(p[2])); }
    else { g.e.cdata = [0, p[3]]; g.quad(p[1][0], p[1][1], p[1][2], p[1][3], hex(p[2]), null, [0, 1, 0]); }
  }
  g.e.cdata = [0, 0];
}

function buildLandmarks(data) {
  if (!data.lparts || !data.lparts.length) return null;
  const g = new Geo({ cdata: 2 });
  drawParts(g, data.lparts);
  return g.count ? g.build() : null;
}

function buildStreet(data, knocked) {
  const g = new Geo({ cdata: 2 });
  const ranges = new Map();
  if (!KIT_PARKED.on) for (const p of data.parked || []) mergeCar(g, p);
  for (const p of data.props) {
    const start = g.count;
    if (p.kind === "lamp") { if (knocked.has(p.id)) continue; propLamp(g, p); }
    else if (p.kind === "hut") propHut(g, p);
    else if (p.kind === "umbrella") propUmbrella(g, p);
    else if (p.kind === "bin" || p.kind === "hydrant" || p.kind === "bench" || p.kind === "pit" || p.kind === "meter" || p.kind === "shelter" || p.kind === "namesign") propFurniture(g, p);
    else continue;
    ranges.set(p.id, [start, g.count - start]);
  }
  for (const v of data.venues || []) storefront(g, v);
  drawParts(g, data.parts || []);
  return g.count ? { geo: g.build(), ranges } : null;
}

function buildSigns(data) {
  if (!data.signs.length) return null;
  const pos = [], nrm = [], uv = [], col = [];
  for (const s of data.signs) {
    // Facing direction (-sin rot, -cos rot); rot 0 faces north. Text runs to the reader's right.
    const nx = -Math.sin(s.rot), nz = -Math.cos(s.rot);
    const rx = -Math.cos(s.rot), rz = Math.sin(s.rot);
    const c = hex(s.color);
    const k = s.text, cu = (k % 2) * 0.5, cv = 1 - (Math.floor(k / 2) * 170) / 2048;
    const u0 = cu + 0.02, u1 = cu + 0.48, v0 = cv - 160 / 2048, v1 = cv - 10 / 2048;
    const hw = s.w / 2, hh = s.h / 2;
    const P = (a, b) => [s.x + rx * a, s.y + b, s.z + rz * a];
    const quad = [[P(-hw, -hh), [u0, v0]], [P(hw, -hh), [u1, v0]], [P(hw, hh), [u1, v1]], [P(-hw, hh), [u0, v1]]];
    for (const idx of [0, 1, 2, 0, 2, 3]) {
      pos.push(...quad[idx][0]); uv.push(...quad[idx][1]); nrm.push(nx, 0, nz); col.push(...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(nrm), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(col), 3));
  g.computeBoundingSphere();
  return g;
}

function buildGlows(world, data, knocked) {
  const list = [];
  for (const o of data.glows) {
    if (o.kind === "lamp" && knocked.has(o.id)) continue;
    const k = GLOW_KIND[o.kind];
    const blink = o.kind === "beacon" && o.col == null ? hash2(Math.round(o.x), Math.round(o.z)) : -1;
    const gy = world.ground(o.x, o.z, o.y);
    list.push([o.x, o.y, o.z, o.col != null ? hex(o.col) : k.col, k.day, k.size, 0, blink, k.i, o.id, gy]);
    if (o.kind === "lamp") {
      list.push([o.x, gy + 0.12, o.z, GLOW_KIND.pool.col, 0, GLOW_KIND.pool.size, 1, -1, GLOW_KIND.pool.i, o.id, gy]);
      list.push([o.x, o.y, o.z, k.col, 0, 2.6, -1, -1, GLOW_KIND.streak.i, o.id, gy]);
    }
  }
  for (const b of data.buildings) {
    if (b.neon < 0 || b.style !== ST.DECO) continue;
    const c = hex(NEON[b.neon]);
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]) list.push([x, b.gy + b.h - 0.8, z, c, 0, 3.4, 0, -1, 1.2, -1, b.gy]);
    const mx = (b.x0 + b.x1) / 2, mz = (b.z0 + b.z1) / 2;
    list.push([mx, b.gy + 4.1, b.z0 - 0.3, c, 0, 5, -1, -1, 0.8, -1, b.gy]);
  }
  for (const v of data.venues || []) {
    if (v.sign == null) continue;
    list.push([v.door.x + v.nx * 1.2, v.gy + 4.4, v.door.z + v.nz * 1.2, hex(v.accent), 0, 6, 0, -1, 0.5, -1, v.gy]);
    list.push([v.door.x + v.nx * 2.2, v.gy + 0.1, v.door.z + v.nz * 2.2, hex(WINDOW[v.kind] || 0xffe0b0), 0, 3.5, 1, -1, 0.9, -1, v.gy]);
  }
  if (!list.length) return null;
  const g = glowGeometry(list.length);
  const ids = new Map();
  list.forEach((o, i) => {
    setGlow(g, i, o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8], o[10]);
    if (o[9] >= 0) { if (!ids.has(o[9])) ids.set(o[9], []); ids.get(o[9]).push(i); }
  });
  g.instanceCount = list.length;
  return { geo: g, ids };
}

// --------------------------------------------------------------------- landmark tower

export function buildTower(world, mats) {
  const T = TOWER;
  const gy = world.height(T.x, T.z);
  const tri = new THREE.Shape();
  tri.moveTo(-T.base / 2, 0); tri.lineTo(T.base / 2, 0); tri.lineTo(0, T.height); tri.lineTo(-T.base / 2, 0);
  const hole = new THREE.Path(); hole.absarc(0, T.ringY, T.ringR, 0, Math.PI * 2, true);
  tri.holes.push(hole);
  const disc = new THREE.Shape(); disc.absarc(0, T.ringY, T.coreR, 0, Math.PI * 2, false);
  const group = new THREE.Group();
  const toBuild = (geo) => {
    geo = geo.toNonIndexed();
    geo.translate(T.x, gy, T.z - T.depth / 2);
    geo.computeVertexNormals();
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, n = P.length / 3;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3), bd = new Float32Array(n * 3);
    const c = hex(0x182b2e);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      uv[i * 2] = (Math.abs(N[i * 3 + 2]) > 0.7 ? x : z + x * 0.3) / 4;
      uv[i * 2 + 1] = y - gy;
      col.set(c, i * 3);
      bd[i * 3] = ST.LOGO; bd[i * 3 + 1] = 0.37; bd[i * 3 + 2] = T.height;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("bdata", new THREE.BufferAttribute(bd, 3));
    return new THREE.Mesh(geo, mats.build);
  };
  group.add(toBuild(new THREE.ExtrudeGeometry(tri, { depth: T.depth, bevelEnabled: false, curveSegments: 48 })));
  group.children[0].layers.enable(1);
  group.add(toBuild(new THREE.ExtrudeGeometry(disc, { depth: T.depth * 0.8, bevelEnabled: false, curveSegments: 40 }).translate(0, 0, T.depth * 0.1)));
  // Neon rings on both faces, and a glow halo around each.
  const ring = new Geo({ cdata: 2 });
  ring.e.cdata = [0, 3];
  const orange = hex(0xff6a2e);
  for (const zf of [T.z - T.depth / 2 - 0.4, T.z + T.depth / 2 + 0.4]) {
    for (const r of [T.ringR, T.coreR]) {
      const n = 64;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        ring.tube([T.x + Math.cos(a0) * r, gy + T.ringY + Math.sin(a0) * r, zf], [T.x + Math.cos(a1) * r, gy + T.ringY + Math.sin(a1) * r, zf], 0.7, 0.7, orange, 5);
      }
    }
  }
  group.add(new THREE.Mesh(ring.build(), mats.prop));
  const gg = glowGeometry(160);
  let k = 0;
  for (const zf of [T.z - T.depth / 2 - 1, T.z + T.depth / 2 + 1]) {
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      setGlow(gg, k++, T.x + Math.cos(a) * T.ringR, gy + T.ringY + Math.sin(a) * T.ringR, zf, GLOW_KIND.ring.col, 0.15, 7, 0, -1, 1.1);
      if (i % 2 === 0) setGlow(gg, k++, T.x + Math.cos(a) * T.coreR, gy + T.ringY + Math.sin(a) * T.coreR, zf, GLOW_KIND.ring.col, 0.15, 6, 0, -1, 0.9);
    }
  }
  gg.instanceCount = k;
  const glow = new THREE.Mesh(gg, mats.glow);
  glow.frustumCulled = false;
  group.add(glow);
  // Floodlights washing the base.
  return group;
}

// ------------------------------------------------------------------------- streaming

export class CityView {
  constructor(world, scene, mats, signMat) {
    this.w = world;
    this.scene = scene;
    this.m = mats;
    this.signMat = signMat;
    this.views = new Map();
    this.radius = 6;
    this.nearR = 2.6;
    this.knocked = new Map();
  }

  knockedSet(cx, cz) {
    const k = cx + cz * NCH;
    if (!this.knocked.has(k)) this.knocked.set(k, new Set());
    return this.knocked.get(k);
  }

  build(cx, cz) {
    const data = this.w.chunk(cx, cz);
    const group = new THREE.Group();
    const add = (geo, mat, order = 0, cast = false) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.matrixAutoUpdate = false; if (cast) m.layers.enable(1); group.add(m); return m; };
    add(buildGround(this.w, cx, cz), this.m.ground);
    add(buildSlabs(this.w, data), this.m.slab);
    add(buildRoads(this.w, data), this.m.road);
    add(buildBuildings(this.w, data), this.m.build, 0, true);
    add(buildFlora(data), this.m.prop, 0, true);
    add(buildLandmarks(data), this.m.prop, 0, true);
    add(buildSigns(data), this.signMat);
    const glows = buildGlows(this.w, data, this.knockedSet(cx, cz));
    let glowMesh = null;
    if (glows) { glowMesh = add(glows.geo, this.m.glow, 5); glowMesh.frustumCulled = false; }
    this.scene.add(group);
    return { cx, cz, group, data, street: null, glows, glowMesh };
  }

  buildStreet(v) {
    const s = buildStreet(v.data, this.knockedSet(v.cx, v.cz));
    if (!s) { v.street = { mesh: null, ranges: new Map() }; return; }
    const mesh = new THREE.Mesh(s.geo, this.m.prop);
    mesh.matrixAutoUpdate = false;
    mesh.layers.enable(1);
    v.group.add(mesh);
    v.street = { mesh, ranges: s.ranges };
  }

  dropStreet(v) {
    if (v.street && v.street.mesh) { v.group.remove(v.street.mesh); v.street.mesh.geometry.dispose(); }
    v.street = null;
  }

  // A lamp was knocked over: hide its mesh and its glows.
  knock(chunk, c) {
    const set = this.knockedSet(chunk.cx, chunk.cz);
    set.add(c.id);
    const v = this.views.get(chunk.cx + chunk.cz * NCH);
    if (!v) return;
    const r = v.street && v.street.ranges.get(c.id);
    if (r && v.street.mesh) {
      const P = v.street.mesh.geometry.attributes.position;
      for (let i = r[0]; i < r[0] + r[1]; i++) P.setXYZ(i, 0, -1000, 0);
      P.needsUpdate = true;
    }
    const idx = v.glows && v.glows.ids.get(c.id);
    if (idx) {
      const Q = v.glows.geo.attributes.iP;
      for (const i of idx) Q.array[i * 4 + 3] = 0;
      Q.needsUpdate = true;
    }
  }

  update(cam, budgetMs = 6) {
    const t0 = performance.now();
    const R = this.radius * CHUNK;
    const want = [];
    const pcx = Math.floor((cam.x + HALF) / CHUNK), pcz = Math.floor((cam.z + HALF) / CHUNK);
    const rr = this.radius + 1;
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
      const mx = -HALF + (cx + 0.5) * CHUNK, mz = -HALF + (cz + 0.5) * CHUNK;
      const d = Math.hypot(mx - cam.x, mz - cam.z);
      if (d < R) want.push([d, cx, cz]);
    }
    want.sort((a, b) => a[0] - b[0]);
    let built = 0;
    for (const [d, cx, cz] of want) {
      const k = cx + cz * NCH;
      let v = this.views.get(k);
      if (!v) {
        if (performance.now() - t0 > budgetMs && built > 0) continue;
        v = this.build(cx, cz);
        this.views.set(k, v);
        built++;
      }
      const near = d < this.nearR * CHUNK;
      if (near && !v.street && (performance.now() - t0 < budgetMs || d < CHUNK)) this.buildStreet(v);
      else if (!near && v.street && d > (this.nearR + 0.7) * CHUNK) this.dropStreet(v);
    }
    for (const [k, v] of this.views) {
      const mx = -HALF + (v.cx + 0.5) * CHUNK, mz = -HALF + (v.cz + 0.5) * CHUNK;
      if (Math.hypot(mx - cam.x, mz - cam.z) > R + CHUNK * 1.2) {
        this.scene.remove(v.group);
        v.group.traverse((o) => o.geometry && o.geometry.dispose());
        this.views.delete(k);
      }
    }
    return want.length - [...want].filter(([, cx, cz]) => this.views.has(cx + cz * NCH)).length;
  }
}
