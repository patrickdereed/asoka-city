// Turns world chunks into meshes, streams them around the camera, and owns the shared
// materials, sky, sea, landmark tower, signs and light glows.
import * as THREE from "./three.module.min.js";
import * as S from "./shaders.js";
import { Geo, propLamp, propPalm, propTree, propHut, propUmbrella, propCrane } from "./geo.js";
import { HALF, CHUNK, NCH, HN, HRES, DECK, ST, PAL, NEON, SIGNS, TOWER, shoreDist, districtAt } from "./map.js";
import { hex, clamp, lerp, hash2 } from "./util.js";

// ------------------------------------------------------------------------------- uniforms

export function makeUniforms() {
  const v3 = () => ({ value: new THREE.Vector3() });
  return {
    uLightDir: v3(), uLightCol: v3(), uSkyAmb: v3(), uGndAmb: v3(), uFogCol: v3(), uZenith: v3(),
    uSunDir: v3(), uSunGlow: v3(), uMoonDir: v3(), uCam: v3(),
    uFogDen: { value: 0.0004 }, uNight: { value: 0 }, uTime: { value: 0 },
  };
}

// Time-of-day keyframes: hour, zenith, horizon, sun glow, light colour/intensity,
// sky ambient, ground ambient, fog density, night.
const KEYS = [
  [0, 0x08161a, 0x1d3a40, 0x1d3a40, 0x8fb0c8, 0.2, 0x2f5560, 0.5, 0x182224, 0.42, 0.00055, 1],
  [4.6, 0x0b1c22, 0x23424a, 0x2a4850, 0x8fb0c8, 0.18, 0x2f5560, 0.48, 0x182224, 0.4, 0.00055, 1],
  [5.8, 0x2d4766, 0xc98a7a, 0xff9a6a, 0xffb48a, 0.3, 0x7c8296, 0.55, 0x3a3430, 0.45, 0.0005, 0.55],
  [6.9, 0x5f93bd, 0xffd2aa, 0xffb070, 0xffd6a8, 0.5, 0x9fb3c0, 0.62, 0x6b6255, 0.5, 0.00042, 0],
  [9, 0x4d93c9, 0xf6eee2, 0xfff1d6, 0xfff3e0, 0.55, 0xb2c9d6, 0.64, 0x8a8070, 0.55, 0.00034, 0],
  [12.5, 0x3f8dc8, 0xfff7ee, 0xfffaf0, 0xfffaf0, 0.56, 0xb9d0dc, 0.65, 0x8a8070, 0.56, 0.0003, 0],
  [16, 0x4a8fc0, 0xfbe9d4, 0xffe6c4, 0xfff0d8, 0.55, 0xa9bfcc, 0.64, 0x7c7366, 0.55, 0.00034, 0],
  [17.6, 0x4f7fb0, 0xffc596, 0xff9a52, 0xffc68a, 0.55, 0x9aa6b8, 0.6, 0x6e5f52, 0.52, 0.0004, 0],
  [18.4, 0x3a4f80, 0xff7a3c, 0xff6018, 0xff8a4a, 0.5, 0x8a7d96, 0.56, 0x4a3a36, 0.48, 0.00045, 0.22],
  [19.1, 0x1f2b4a, 0xb5507a, 0xe0506a, 0xc07090, 0.25, 0x4f4a6a, 0.5, 0x2a2430, 0.44, 0.0005, 0.7],
  [20.2, 0x0b1a20, 0x24434a, 0x2c4a50, 0x8fb0c8, 0.2, 0x2f5560, 0.5, 0x182224, 0.42, 0.00055, 1],
  [24, 0x08161a, 0x1d3a40, 0x1d3a40, 0x8fb0c8, 0.2, 0x2f5560, 0.5, 0x182224, 0.42, 0.00055, 1],
];

function mixHex(a, b, t, k = 1) {
  const A = hex(a), B = hex(b);
  return [lerp(A[0], B[0], t) * k, lerp(A[1], B[1], t) * k, lerp(A[2], B[2], t) * k];
}

export function applyTimeOfDay(U, hour, fogScale = 1) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((hour - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t);
  U.uZenith.value.set(...mixHex(a[1], b[1], s));
  U.uFogCol.value.set(...mixHex(a[2], b[2], s));
  U.uSunGlow.value.set(...mixHex(a[3], b[3], s));
  U.uLightCol.value.set(...mixHex(a[4], b[4], s, lerp(a[5], b[5], s)));
  U.uSkyAmb.value.set(...mixHex(a[6], b[6], s, lerp(a[7], b[7], s)));
  U.uGndAmb.value.set(...mixHex(a[8], b[8], s, lerp(a[9], b[9], s)));
  U.uFogDen.value = lerp(a[10], b[10], s) * fogScale;
  U.uNight.value = lerp(a[11], b[11], s);
  const ang = ((hour - 6) / 12) * Math.PI;
  const sun = new THREE.Vector3(Math.cos(ang), Math.sin(ang) * 0.95, 0.35).normalize();
  U.uSunDir.value.copy(sun);
  const moon = new THREE.Vector3(-Math.cos(ang), -Math.sin(ang) * 0.9, -0.3).normalize();
  U.uMoonDir.value.copy(moon);
  const ld = sun.y > -0.02 ? sun.clone() : moon.clone();
  ld.y = Math.max(ld.y, 0.12);
  U.uLightDir.value.copy(ld.normalize());
}

// ------------------------------------------------------------------------------ materials

export function makeMaterials(U) {
  const mk = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms: U, vertexShader: vs, fragmentShader: fs, ...extra });
  const m = {
    ground: mk(S.GROUND_VS, S.GROUND_FS, { vertexColors: true }),
    slab: mk(S.GROUND_VS, S.GROUND_FS, { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    road: mk(S.ROAD_VS, S.ROAD_FS, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    build: mk(S.BUILD_VS, S.BUILD_FS, { vertexColors: true }),
    prop: mk(S.PROP_VS, S.PROP_FS, { vertexColors: true, side: THREE.DoubleSide, uniforms: { ...U, uBrake: { value: 0 }, uLights: { value: 0 } } }),
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
  cv.width = 2048; cv.height = 1024;
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
  lamp: { col: [1, 0.78, 0.48], size: 1.5, day: 0, i: 1 },
  pool: { col: [1, 0.68, 0.36], size: 8.5, day: 0, i: 0.55 },
  beacon: { col: [1, 0.12, 0.08], size: 2.8, day: 0.65, i: 1.2 },
  amber: { col: [1, 0.62, 0.22], size: 1.2, day: 0, i: 0.9 },
  ring: { col: [1, 0.42, 0.16], size: 9, day: 0.15, i: 0.5 },
  neon: { col: [1, 0.42, 0.18], size: 3.2, day: 0, i: 0.5 },
};

export function glowGeometry(capacity) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute("iCol", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  g.setAttribute("iP", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  g.instanceCount = 0;
  return g;
}

export function setGlow(g, i, x, y, z, col, day, size, mode, blink, inten) {
  const P = g.attributes.iPos.array, Cc = g.attributes.iCol.array, Q = g.attributes.iP.array;
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
  for (const s of data.slabs) {
    const col = hex(s.color);
    g.e.pat = [s.pat];
    const lift = SLAB_Y + (s.pat === 4 ? 0.05 : s.pat === 0 ? -0.02 : 0);
    const nx = Math.max(1, Math.ceil((s.x1 - s.x0) / 16)), nz = Math.max(1, Math.ceil((s.z1 - s.z0) / 16));
    const P = (i, j) => { const x = lerp(s.x0, s.x1, i / nx), z = lerp(s.z0, s.z1, j / nz); return [x, world.height(x, z) + lift, z]; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      g.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), col, null, [0, 1, 0]);
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

function buildStreet(data, knocked) {
  const g = new Geo({ cdata: 2 });
  const ranges = new Map();
  for (const p of data.props) {
    const start = g.count;
    if (p.kind === "lamp") { if (knocked.has(p.id)) continue; propLamp(g, p); }
    else if (p.kind === "hut") propHut(g, p);
    else if (p.kind === "umbrella") propUmbrella(g, p);
    else continue;
    ranges.set(p.id, [start, g.count - start]);
  }
  return g.count ? { geo: g.build(), ranges } : null;
}

function buildSigns(data) {
  if (!data.signs.length) return null;
  const pos = [], nrm = [], uv = [], col = [];
  for (const s of data.signs) {
    const nx = -Math.sin(s.rot) * 0, nz = s.rot === 0 ? -1 : 1;
    const rx = -nz, rz = 0;
    const c = hex(s.color);
    const k = s.text, cu = (k % 2) * 0.5, cv = 1 - (Math.floor(k / 2) * 170) / 1024;
    const u0 = cu + 0.02, u1 = cu + 0.48, v0 = cv - 160 / 1024, v1 = cv - 10 / 1024;
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
    const blink = o.kind === "beacon" ? hash2(Math.round(o.x), Math.round(o.z)) : -1;
    list.push([o.x, o.y, o.z, k.col, k.day, k.size, 0, blink, k.i, o.id]);
    if (o.kind === "lamp") {
      const gy = world.ground(o.x, o.z, o.y);
      list.push([o.x, gy + 0.12, o.z, GLOW_KIND.pool.col, 0, GLOW_KIND.pool.size, 1, -1, GLOW_KIND.pool.i, o.id]);
    }
  }
  for (const b of data.buildings) {
    if (b.neon < 0 || b.style !== ST.DECO) continue;
    const c = hex(NEON[b.neon]);
    for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]) list.push([x, b.gy + b.h - 0.8, z, c, 0, 3.4, 0, -1, 0.45, -1]);
  }
  if (!list.length) return null;
  const g = glowGeometry(list.length);
  const ids = new Map();
  list.forEach((o, i) => {
    setGlow(g, i, o[0], o[1], o[2], o[3], o[4], o[5], o[6], o[7], o[8]);
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
      setGlow(gg, k++, T.x + Math.cos(a) * T.ringR, gy + T.ringY + Math.sin(a) * T.ringR, zf, GLOW_KIND.ring.col, 0.15, 7, 0, -1, 0.35);
      if (i % 2 === 0) setGlow(gg, k++, T.x + Math.cos(a) * T.coreR, gy + T.ringY + Math.sin(a) * T.coreR, zf, GLOW_KIND.ring.col, 0.15, 6, 0, -1, 0.3);
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
    const add = (geo, mat, order = 0) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.matrixAutoUpdate = false; group.add(m); return m; };
    add(buildGround(this.w, cx, cz), this.m.ground);
    add(buildSlabs(this.w, data), this.m.slab);
    add(buildRoads(this.w, data), this.m.road);
    add(buildBuildings(this.w, data), this.m.build);
    add(buildFlora(data), this.m.prop);
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
