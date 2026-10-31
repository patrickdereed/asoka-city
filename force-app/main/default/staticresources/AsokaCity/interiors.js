// Rooms you can walk into. Each is built once per kind and shared by every venue of that kind.
// Local frame: the street door is at the origin in the wall z = 0, the room runs toward -z,
// x spans -W/2..W/2, y is up from the floor.
import * as THREE from "./three.module.min.js";
import { Geo } from "./geo.js";
import { ROOM_VS, ROOM_FS } from "./shaders.js";
import { WEAPONS, weaponGeometry } from "./weapons.js";
import { hex, rng } from "./util.js";

const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

class Room {
  constructor(W, D, H) {
    this.W = W; this.D = D; this.H = H;
    this.g = new Geo({ cdata: 2 });
    this.g.e.cdata = [0, 0];
    this.boxes = []; this.lights = []; this.spots = []; this.extra = [];
  }

  // Box by its bottom centre; solid boxes block walking.
  box(x, y, z, sx, sy, sz, col, e = 0, solid = false, yaw = 0) {
    this.g.e.cdata = [0, e];
    this.g.box(0, sy / 2, 0, sx, sy, sz, hex(col), yaw, x, y, z);
    this.g.e.cdata = [0, 0];
    if (solid) {
      const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
      const hx = (sx * c + sz * s) / 2, hz = (sx * s + sz * c) / 2;
      this.boxes.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y1: y + sy });
    }
  }

  tube(a, b, r0, r1, col, n = 8) { this.g.tube(a, b, r0, r1, hex(col), n); }

  light(x, y, z, col, k, r) { this.lights.push({ x, y, z, col: hex(col).map((c) => Math.pow(c, 2.2) * k * 1.5), r: r * 1.6 }); }

  // Merge a prebuilt geometry (a weapon model) into the room.
  merge(geo, x, y, z, yaw = 0, pitch = 0, roll = 0, scale = 1) {
    if (!geo) return;
    e3.set(pitch, yaw, roll, "YXZ"); q4.setFromEuler(e3);
    m4.compose(v3.set(x, y, z), q4, one.clone().multiplyScalar(scale));
    const P = geo.attributes.position.array, N = geo.attributes.normal.array, Cc = geo.attributes.color.array, D = geo.attributes.cdata.array;
    const nm = new THREE.Matrix3().getNormalMatrix(m4), p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.length / 3; i++) {
      p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(m4);
      n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix3(nm).normalize();
      this.g.pos.push(p.x, p.y, p.z); this.g.nrm.push(n.x, n.y, n.z);
      this.g.col.push(Cc[i * 3], Cc[i * 3 + 1], Cc[i * 3 + 2]);
      this.g.ex.cdata.push(D[i * 2], D[i * 2 + 1]);
    }
  }

  // Floor, ceiling and walls with the street door in the z = 0 wall.
  shell({ floor, floor2 = null, tile = 1, wall, wainscot = null, ceiling, doorGlass = 0xfff1d6, windows = [] }) {
    const { W, D, H } = this;
    if (floor2 != null) {
      for (let z = 0; z < D; z += tile) for (let x = 0; x < W; x += tile) {
        const k = (Math.floor(x / tile) + Math.floor(z / tile)) % 2;
        this.box(-W / 2 + x + tile / 2, -0.1, -z - tile / 2, tile, 0.1, tile, k ? floor : floor2);
      }
    } else this.box(0, -0.1, -D / 2, W, 0.1, D, floor);
    this.box(0, H, -D / 2, W + 0.4, 0.12, D + 0.4, ceiling);
    const T = 0.2;
    const wallZ = (z, x0, x1, y0, y1, col) => this.box((x0 + x1) / 2, y0, z, x1 - x0, y1 - y0, T, col, 0, y0 < 0.5);
    const wallX = (x, z0, z1, y0, y1, col) => this.box(x, y0, (z0 + z1) / 2, T, y1 - y0, z1 - z0, col, 0, y0 < 0.5);
    const band = wainscot != null;
    // Back and sides, with window cut-outs on request: { wall: "back"|"left"|"right", a, b, y0, y1 }.
    const sideWall = (which) => {
      const wins = windows.filter((w) => w.wall === which).sort((p, q) => p.a - q.a);
      const len = which === "back" ? W : D;
      const at = (a0, a1, y0, y1, col) => {
        if (a1 - a0 < 0.01 || y1 - y0 < 0.01) return;
        if (which === "back") wallZ(-D - T / 2, -W / 2 + a0, -W / 2 + a1, y0, y1, col);
        else wallX(which === "left" ? -W / 2 - T / 2 : W / 2 + T / 2, -a1, -a0, y0, y1, col);
      };
      let a = 0;
      for (const w of [...wins, { a: len, b: len, y0: 0, y1: 0 }]) {
        if (band) { at(a, w.a, 0, 1.1, wainscot); at(a, w.a, 1.1, H, wall); } else at(a, w.a, 0, H, wall);
        if (w.b > w.a) {
          if (band && w.y0 > 1.1) { at(w.a, w.b, 0, 1.1, wainscot); at(w.a, w.b, 1.1, w.y0, wall); } else at(w.a, w.b, 0, w.y0, band ? wainscot : wall);
          at(w.a, w.b, w.y1, H, wall);
          // The glass: a view out.
          if (which === "back") this.box(-W / 2 + (w.a + w.b) / 2, w.y0, -D - 0.12, w.b - w.a, w.y1 - w.y0, 0.04, 0xffffff, 5);
          else this.box(which === "left" ? -W / 2 - 0.12 : W / 2 + 0.12, w.y0, -(w.a + w.b) / 2, 0.04, w.y1 - w.y0, w.b - w.a, 0xffffff, 5);
          this.box(which === "back" ? -W / 2 + (w.a + w.b) / 2 : which === "left" ? -W / 2 + 0.1 : W / 2 - 0.1, w.y0 - 0.06, which === "back" ? -D + 0.1 : -(w.a + w.b) / 2, which === "back" ? w.b - w.a + 0.1 : 0.25, 0.06, which === "back" ? 0.25 : w.b - w.a + 0.1, 0xefe3d2);
        }
        a = w.b;
      }
    };
    sideWall("back"); sideWall("left"); sideWall("right");
    // Front wall around the door (1.8 m wide, 2.6 m high).
    const dw = 0.9;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -W / 2 : dw, x1 = s < 0 ? -dw : W / 2;
      if (band) { wallZ(T / 2, x0, x1, 0, 1.1, wainscot); wallZ(T / 2, x0, x1, 1.1, H, wall); } else wallZ(T / 2, x0, x1, 0, H, wall);
    }
    wallZ(T / 2, -dw, dw, 2.6, H, wall);
    this.box(0, 0, 0.16, 1.8, 2.6, 0.04, doorGlass, 4);
    for (const s of [-1, 1]) this.box(s * 0.9, 0, 0.05, 0.12, 2.65, 0.14, 0x283f43);
    this.box(0, 2.6, 0.05, 1.92, 0.12, 0.14, 0x283f43);
    this.box(0, -0.09, -0.6, 1.6, 0.1, 1.0, 0x3d4a4c);
  }

  stripLight(x, z, len, along = "x", col = 0xfff4e0, k = 2.2, r = 7) {
    const H = this.H;
    this.box(x, H - 0.06, z, along === "x" ? len : 0.22, 0.06, along === "x" ? 0.22 : len, col, 4);
    this.light(x, H - 0.4, z, col, k, r);
  }

  build(U) {
    const geo = this.g.build();
    const PL = Array.from({ length: 8 }, (_, i) => { const l = this.lights[i]; return l ? new THREE.Vector4(l.x, l.y, l.z, l.r) : new THREE.Vector4(0, -50, 0, 0.01); });
    const PC = Array.from({ length: 8 }, (_, i) => { const l = this.lights[i]; return l ? new THREE.Vector3(...l.col) : new THREE.Vector3(); });
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPL: { value: PL }, uPC: { value: PC }, uRoomAmb: { value: new THREE.Vector3(...this.amb) }, uCam: U.uCam, uTime: U.uTime, uZenith: U.uZenith, uFogCol: U.uFogCol, uNight: U.uNight },
      vertexShader: ROOM_VS, fragmentShader: ROOM_FS, vertexColors: true, side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    for (const o of this.extra) group.add(o);
    this.group = group;
    this.mat = mat;
    return this;
  }
}

// ------------------------------------------------------------------------------- furniture

function counter(R, x, z, len, depth, h, top, base, along = "x", solid = true) {
  const sx = along === "x" ? len : depth, sz = along === "x" ? depth : len;
  R.box(x, 0, z, sx, h - 0.05, sz, base, 0, solid);
  R.box(x, h - 0.05, z, sx + 0.06, 0.05, sz + 0.06, top);
}

function shelfUnit(R, x, z, len, h, along, r, palette) {
  const sx = along === "x" ? len : 0.7, sz = along === "x" ? 0.7 : len;
  R.box(x, 0, z, sx, 0.12, sz, 0x283f43, 0, true);
  R.box(x, 0, z, along === "x" ? len : 0.06, h, along === "x" ? 0.06 : len, 0xd3e0e1);
  for (let y = 0.35; y < h; y += 0.42) {
    R.box(x, y, z, sx, 0.03, sz, 0xefe3d2);
    for (const side of [-1, 1]) {
      for (let a = -len / 2 + 0.15; a < len / 2 - 0.1; a += r.range(0.16, 0.3)) {
        const w = r.range(0.1, 0.22), ht = r.range(0.14, 0.32);
        const px = along === "x" ? x + a : x + side * 0.2, pz = along === "x" ? z + side * 0.2 : z - a;
        R.box(px, y + 0.03, pz, along === "x" ? w : 0.22, ht, along === "x" ? 0.22 : w, r.pick(palette));
      }
    }
  }
  R.boxes.push(along === "x" ? { x0: x - len / 2, x1: x + len / 2, z0: z - 0.4, z1: z + 0.4, y1: h } : { x0: x - 0.4, x1: x + 0.4, z0: z - len / 2, z1: z + len / 2, y1: h });
}

function sofa(R, x, z, yaw, len, col) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = L(0, 0); R.box(p[0], 0, p[1], len, 0.45, 0.9, col, 0, true, yaw);
  p = L(0, 0.35); R.box(p[0], 0.45, p[1], len, 0.45, 0.2, col, 0, false, yaw);
  for (const sx of [-1, 1]) { p = L(sx * (len / 2 - 0.1), 0); R.box(p[0], 0.45, p[1], 0.2, 0.2, 0.9, col, 0, false, yaw); }
  for (let k = 0; k < Math.round(len / 0.9); k++) { p = L(-len / 2 + 0.45 + k * 0.9, -0.05); R.box(p[0], 0.45, p[1], 0.82, 0.1, 0.7, hex2(col, 1.12), 0, false, yaw); }
}

function hex2(h, k) {
  const c = hex(h).map((v) => Math.min(1, v * k));
  return (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
}

function bed(R, x, z, yaw, w, l, sheet) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  let p = L(0, 0); R.box(p[0], 0, p[1], w, 0.35, l, 0x5a4636, 0, true, yaw);
  R.box(p[0], 0.35, p[1], w - 0.06, 0.22, l - 0.06, 0xfffdf9, 0, false, yaw);
  p = L(0, 0.25); R.box(p[0], 0.57, p[1], w - 0.02, 0.06, l * 0.62, sheet, 0, false, yaw);
  p = L(0, -l / 2 + 0.06); R.box(p[0], 0, p[1], w + 0.1, 1.05, 0.1, 0x5a4636, 0, false, yaw);
  for (const sx of [-1, 1]) { p = L(sx * w / 4, -l / 2 + 0.38); R.box(p[0], 0.57, p[1], w / 2 - 0.14, 0.14, 0.4, 0xefe3d2, 0, false, yaw); }
}

function rug(R, x, z, sx, sz, col, col2) { R.box(x, 0, z, sx, 0.015, sz, col); R.box(x, 0.012, z, sx - 0.3, 0.012, sz - 0.3, col2); }

function plant(R, x, z, s = 1) {
  R.box(x, 0, z, 0.4 * s, 0.4 * s, 0.4 * s, 0xb8544f, 0, true);
  R.tube([x, 0.4 * s, z], [x, 0.9 * s, z], 0.03, 0.03, 0x5a4636, 5);
  R.g.blob(x, 1.1 * s, z, 0.38 * s, 0.42 * s, 0.38 * s, hex(0x5d8f5e), x * 3 + z);
}

function lampFloor(R, x, z, col = 0xffd9a8) {
  R.tube([x, 0, z], [x, 1.5, z], 0.025, 0.025, 0x283f43, 6);
  R.box(x, 0, z, 0.3, 0.04, 0.3, 0x283f43);
  R.g.e.cdata = [0, 4]; R.tube([x, 1.45, z], [x, 1.75, z], 0.2, 0.13, hex(col), 10); R.g.e.cdata = [0, 0];
  R.light(x, 1.6, z, col, 1.4, 5);
}

function tv(R, x, z, yaw, w = 1.6) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  R.box(x, 0, z, 1.8 * Math.abs(c) + 0.5 * Math.abs(s), 0.5, 0.5 * Math.abs(c) + 1.8 * Math.abs(s), 0x283f43, 0, true);
  R.box(x, 0.85, z, w * Math.abs(c) + 0.06 * Math.abs(s), w * 0.56, 0.06 * Math.abs(c) + w * Math.abs(s), 0x101414);
  R.box(x - s * 0.04, 0.88, z - c * 0.04, (w - 0.08) * Math.abs(c) + 0.02 * Math.abs(s), w * 0.5, 0.02 * Math.abs(c) + (w - 0.08) * Math.abs(s), 0x6fb7c4, 6);
}

function table(R, x, z, sx, sz, col = 0x8a6a4c, h = 0.76) {
  R.box(x, h - 0.05, z, sx, 0.05, sz, col, 0, true);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) R.box(x + a * (sx / 2 - 0.06), 0, z + b * (sz / 2 - 0.06), 0.05, h - 0.05, 0.05, 0x3d4a4c);
}

function chair(R, x, z, yaw, col = 0x2f757c) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  R.box(x, 0, z, 0.45, 0.45, 0.45, col, 0, true, yaw);
  R.box(x + s * 0.2, 0.45, z + c * 0.2, 0.45 * Math.abs(c) + 0.06 * Math.abs(s), 0.45, 0.06 * Math.abs(c) + 0.45 * Math.abs(s), col);
}

function kitchen(R, x0, x1, z, depth, col, top) {
  counter(R, (x0 + x1) / 2, z, x1 - x0, depth, 0.92, top, col);
  R.box((x0 + x1) / 2, 1.5, z - depth / 2 + 0.18, x1 - x0, 0.7, 0.35, col);
  R.box(x1 - 0.45, 0, z, 0.8, 1.9, depth, 0xd3e0e1, 0, true);
  R.box(x0 + 0.6, 0.92, z, 0.5, 0.02, 0.4, 0x8d969a);
  R.box(x0 + 1.6, 0.92, z, 0.6, 0.02, 0.5, 0x182b2e);
}

// -------------------------------------------------------------------------------- the rooms

function arms(U) {
  const R = new Room(12, 16, 4.2);
  R.amb = [0.16, 0.15, 0.14];
  R.shell({ floor: 0x3a3f40, floor2: 0x2f3435, tile: 1, wall: 0x6b5a48, wainscot: 0x283f43, ceiling: 0x1f2a2c });
  for (const z of [-3, -7.5, -12, -15]) R.stripLight(0, z, 8);
  R.light(0, 2.4, -9, 0xffc38a, 1.5, 5);
  R.light(-5, 3, -12, 0xfff4e0, 1.2, 6);
  // Glass counter across the shop with pistols inside.
  counter(R, -1, -9, 8, 0.9, 1.0, 0x9fd3d8, 0x283f43);
  R.box(-1, 0.55, -9, 7.8, 0.38, 0.8, 0x6fb7c4, 4);
  const pistols = WEAPONS.filter((w) => w.slot === 2);
  pistols.forEach((w, k) => R.merge(weaponGeometry(w.id), -4 + k * 2.4, 0.72, -9, Math.PI / 2, 0, Math.PI / 2));
  counter(R, 4, -11.5, 6, 0.9, 1.0, 0x9fd3d8, 0x283f43, "z");
  // Pegboard and racks on the back and side walls, holding the real stock.
  R.box(0, 1.3, -15.88, 11.6, 2.5, 0.06, 0x8a6a4c);
  const long = WEAPONS.filter((w) => w.long);
  long.forEach((w, k) => {
    const row = k % 3, col = Math.floor(k / 3);
    R.merge(weaponGeometry(w.id), -4.5 + col * 1.9, 1.7 + row * 0.7, -15.8, Math.PI / 2, 0, 0);
    R.box(-4.5 + col * 1.9 - 0.3, 1.62 + row * 0.7, -15.8, 0.06, 0.06, 0.1, 0x8d969a);
    R.box(-4.5 + col * 1.9 + 0.3, 1.62 + row * 0.7, -15.8, 0.06, 0.06, 0.1, 0x8d969a);
  });
  R.box(-5.88, 1.2, -6, 0.06, 2.2, 7, 0x8a6a4c);
  WEAPONS.filter((w) => w.slot === 3 || w.slot === 1).forEach((w, k) => R.merge(weaponGeometry(w.id), -5.8, 1.6 + (k % 3) * 0.6, -3.6 - Math.floor(k / 3) * 2.2, Math.PI, 0, 0));
  // Ammo crates and the featured launcher on a plinth.
  for (let k = 0; k < 5; k++) R.box(4.4 - (k % 2) * 0.1, Math.floor(k / 2) * 0.45, -2.5 - (k % 2) * 0.7, 0.9, 0.42, 0.6, k % 2 ? 0x5d6b4a : 0x4a5a3a, 0, true);
  R.box(4.2, 0, -6.2, 1.2, 0.8, 1.2, 0x182b2e, 0, true);
  R.box(4.2, 0.8, -6.2, 1.25, 0.04, 1.25, 0xff6018, 4);
  R.merge(weaponGeometry("harddelete"), 4.2, 0.95, -6.2, 0.6, 0, 0);
  R.light(4.2, 2.6, -6.2, 0xff8a4a, 1.6, 3.5);
  rug(R, 0, -3, 3, 2.2, 0x182b2e, 0xff6018);
  R.spots.push({ kind: "shop", x: -1, z: -7.7, r: 1.8, label: "Shop at Breakpoint Arms" });
  R.keeper = { x: -1, z: -10.2, yaw: Math.PI };
  R.pad = { x: -1, y: 1.12, z: -9 };
  R.shopCam = { x: -0.2, y: 1.75, z: -7.2 };
  return R.build(U);
}

function mart(U) {
  const R = new Room(12, 14, 3.6);
  R.amb = [0.32, 0.34, 0.34];
  R.shell({ floor: 0xf3efe6, floor2: 0xd8d0c4, tile: 0.6, wall: 0xfffdf9, wainscot: 0x3fd0c9, ceiling: 0xefe3d2 });
  for (const z of [-2.5, -6.5, -10.5]) for (const x of [-3, 3]) R.stripLight(x, z, 3.2, "z", 0xf2fbff, 1.6, 6);
  const r = rng(5);
  const goods = [0xff6018, 0x3fd0c9, 0xd7a03d, 0xb8544f, 0x507fa7, 0x5d8f5e, 0xa4517b, 0xfff7ee, 0xffc667, 0x2f757c];
  for (const x of [-3.2, -0.4]) shelfUnit(R, x, -8, 7, 1.7, "z", r, goods);
  // Fridges along the left wall, lit from inside.
  for (let k = 0; k < 6; k++) {
    const z = -3.5 - k * 1.5;
    R.box(-5.55, 0, z, 0.9, 2.1, 1.4, 0xd3e0e1, 0, true);
    R.box(-5.08, 0.15, z, 0.04, 1.8, 1.25, 0xe6fbff, 4);
    for (let y = 0.4; y < 1.9; y += 0.45) for (let a = -0.5; a < 0.6; a += 0.22) R.box(-5.3, y, z + a, 0.2, 0.28, 0.14, r.pick(goods));
  }
  // Checkout by the door.
  counter(R, 3.6, -3, 3.6, 0.9, 1.0, 0xfffdf9, 0x3fd0c9, "z");
  R.box(3.6, 1.0, -2.2, 0.4, 0.3, 0.35, 0x182b2e);
  R.box(3.6, 1.05, -3.6, 0.5, 0.02, 0.4, 0x182b2e);
  shelfUnit(R, 4.8, -9.5, 4, 1.5, "z", r, goods);
  plant(R, -5.4, -0.8, 0.9);
  R.spots.push({ kind: "shop", x: 2.5, z: -3, r: 1.6, label: "Shop at Deploy Mart" });
  R.keeper = { x: 4.6, z: -3, yaw: Math.PI / 2 };
  R.shopCam = { x: 0.6, y: 1.7, z: -1.4 };
  R.pad = { x: 3.6, y: 1.1, z: -3 };
  return R.build(U);
}

function threads(U) {
  const R = new Room(14, 14, 4);
  R.amb = [0.26, 0.22, 0.22];
  R.shell({ floor: 0xa7835f, floor2: 0x977652, tile: 0.5, wall: 0xfbe7d8, wainscot: 0xcc75a0, ceiling: 0xfffdf9 });
  for (const z of [-3, -7, -11]) R.stripLight(0, z, 8, "x", 0xfff0e6, 1.8, 7);
  const r = rng(9);
  const cloth = [0x182b2e, 0xefe3d2, 0xb8544f, 0x507fa7, 0x2f757c, 0xcc75a0, 0xd7a03d, 0xfffdf9, 0x8a8073, 0xa4517b];
  for (const [x, z] of [[-4, -4], [-4, -8], [1, -5], [1, -9.5]]) {
    R.tube([x - 1.2, 0, z], [x - 1.2, 1.6, z], 0.025, 0.025, 0x8d969a, 6);
    R.tube([x + 1.2, 0, z], [x + 1.2, 1.6, z], 0.025, 0.025, 0x8d969a, 6);
    R.tube([x - 1.2, 1.6, z], [x + 1.2, 1.6, z], 0.02, 0.02, 0x8d969a, 6);
    for (let a = -1.05; a < 1.1; a += 0.13) R.box(x + a, 0.75, z, 0.08, 0.8, 0.5, r.pick(cloth));
    R.boxes.push({ x0: x - 1.3, x1: x + 1.3, z0: z - 0.35, z1: z + 0.35, y1: 1.6 });
  }
  // Mirror wall and a changing booth.
  R.box(-6.86, 0.3, -11, 0.06, 2.6, 2.4, 0xd8eef2, 4);
  R.box(-6.8, 0.25, -11, 0.12, 2.75, 2.6, 0x8a6a4c);
  R.box(5.5, 0, -12.5, 2.4, 2.4, 0.08, 0xcc75a0, 0, true);
  R.box(4.3, 0, -13.2, 0.08, 2.4, 1.5, 0xcc75a0, 0, true);
  counter(R, 4.5, -4, 3.2, 0.8, 1.0, 0xfffdf9, 0x5a4636, "z");
  for (const [x, z] of [[-1.5, -1.6], [3.5, -8.5]]) {
    R.box(x, 0, z, 0.5, 0.1, 0.5, 0x283f43, 0, true);
    R.tube([x, 0.1, z], [x, 1.0, z], 0.03, 0.03, 0x8d969a, 6);
    R.tube([x, 1.0, z], [x, 1.55, z], 0.17, 0.2, r.pick(cloth), 8);
    R.g.blob(x, 1.72, z, 0.1, 0.13, 0.1, hex(0xefe3d2));
  }
  plant(R, 6.3, -0.8);
  rug(R, -3, -11, 3, 3, 0xcc75a0, 0xfbe7d8);
  R.spots.push({ kind: "shop", x: -4.6, z: -11, r: 1.8, label: "Try on outfits" });
  R.keeper = { x: 5.4, z: -4, yaw: -Math.PI / 2 };
  R.mirror = { x: -4.6, z: -11, yaw: Math.PI / 2 };
  R.shopCam = { x: -1.6, y: 1.6, z: -11 };
  return R.build(U);
}

function clinic(U) {
  const R = new Room(14, 14, 3.6);
  R.amb = [0.32, 0.36, 0.36];
  R.shell({ floor: 0xe9e1d4, floor2: 0xd3e0e1, tile: 0.8, wall: 0xfffdf9, wainscot: 0x2f757c, ceiling: 0xfffdf9, windows: [{ wall: "left", a: 4, b: 9, y0: 1, y1: 2.6 }] });
  for (const z of [-3, -7, -11]) R.stripLight(0, z, 6, "x", 0xf2fbff, 1.8, 7);
  counter(R, 2.5, -8, 5, 1, 1.1, 0xfffdf9, 0x3fd0c9);
  R.box(2.5, 1.6, -13.9, 3, 1.2, 0.06, 0x2f757c);
  R.box(2.5, 1.95, -13.85, 0.9, 0.3, 0.04, 0x3fd0c9, 4); R.box(2.5, 1.95, -13.85, 0.3, 0.9, 0.04, 0x3fd0c9, 4);
  for (let k = 0; k < 5; k++) chair(R, -4.5, -3 - k * 0.8, Math.PI / 2, 0x3fd0c9);
  for (let k = 0; k < 4; k++) chair(R, -1.5, -10 - k * 0.8, -Math.PI / 2, 0x3fd0c9);
  table(R, -3, -6.6, 1.0, 0.6, 0xefe3d2, 0.45);
  plant(R, 6.2, -0.9); plant(R, -6.2, -13);
  R.spots.push({ kind: "heal", x: 2.5, z: -6.8, r: 1.6, label: "See the nurse" });
  R.keeper = { x: 2.5, z: -9.2, yaw: Math.PI };
  R.shopCam = { x: 1.2, y: 1.7, z: -5 };
  R.pad = { x: 2.5, y: 1.1, z: -8 };
  return R.build(U);
}

// Homes: one generator, five layouts.
const HOME_LOOK = {
  studio:    { W: 8, D: 10, H: 3, floor: 0xa7835f, wall: 0xfbe7d8, accent: 0xff6018, sofa: 0x2f757c, sheet: 0xff6018 },
  bungalow:  { W: 12, D: 11, H: 3, floor: 0x9b7a56, wall: 0xf3e6d3, accent: 0x5d8f5e, sofa: 0x5d8f5e, sheet: 0x507fa7 },
  condo:     { W: 14, D: 12, H: 3.2, floor: 0xefe3d2, wall: 0xfffdf9, accent: 0x3fd0c9, sofa: 0xefe3d2, sheet: 0x3fd0c9 },
  loft:      { W: 16, D: 14, H: 5.5, floor: 0x6b5a48, wall: 0xb8544f, accent: 0xd7a03d, sofa: 0x182b2e, sheet: 0xd7a03d },
  penthouse: { W: 18, D: 16, H: 4.2, floor: 0x283f43, wall: 0xefe3d2, accent: 0xff6018, sofa: 0xfff7ee, sheet: 0x182b2e },
};

function home(U, tier) {
  const L = HOME_LOOK[tier];
  const { W, D, H } = L;
  const R = new Room(W, D, H);
  R.amb = tier === "loft" ? [0.18, 0.15, 0.13] : [0.22, 0.2, 0.18];
  const big = tier === "condo" || tier === "penthouse";
  const windows = big
    ? [{ wall: "back", a: 1, b: W - 1, y0: tier === "penthouse" ? 0.1 : 0.6, y1: H - 0.3 }, { wall: "right", a: 2, b: D - 1, y0: tier === "penthouse" ? 0.1 : 0.6, y1: H - 0.3 }]
    : [{ wall: "back", a: W / 2 - 1.5, b: W / 2 + 1.5, y0: 1, y1: 2.3 }, { wall: "left", a: D / 2 - 1, b: D / 2 + 1, y0: 1, y1: 2.3 }];
  R.shell({ floor: L.floor, floor2: tier === "loft" || tier === "penthouse" ? null : hex2(L.floor, 0.92), tile: 0.8, wall: L.wall, wainscot: tier === "loft" ? 0x8a4a3f : null, ceiling: 0xfffdf9, doorGlass: 0xffe9cc, windows });
  // Lights: warm pendants.
  const pend = (x, z) => { R.tube([x, H, z], [x, H - 0.8, z], 0.01, 0.01, 0x283f43, 4); R.g.e.cdata = [0, 4]; R.tube([x, H - 0.8, z], [x, H - 1.05, z], 0.06, 0.22, hex(0xffd9a8), 10); R.g.e.cdata = [0, 0]; R.light(x, H - 1.1, z, 0xffd9a8, 1.6, 6.5); };
  // Living area by the door, bed at the back, kitchen on one side.
  const lx = -W / 4, bz = -D + 1.6;
  rug(R, lx, -D * 0.38, 3.2, 2.4, L.accent, hex2(L.accent, 0.8));
  sofa(R, lx, -D * 0.38 + 1.4, 0, tier === "studio" ? 2 : 2.8, L.sofa);
  table(R, lx, -D * 0.38, 1.1, 0.6, 0x5a4636, 0.42);
  tv(R, lx, -D * 0.38 - 1.6, 0, tier === "studio" ? 1.2 : 1.8);
  pend(lx, -D * 0.38);
  bed(R, W / 4, bz, 0, tier === "studio" ? 1.5 : 1.9, 2.2, L.sheet);
  R.box(W / 4 + 1.4, 0, bz - 0.6, 0.5, 0.55, 0.45, 0x5a4636, 0, true);
  lampFloor(R, W / 4 - 1.5, bz - 0.7);
  pend(W / 4, bz + 1.5);
  // Wardrobe against the right wall.
  const wz = tier === "studio" ? -D * 0.45 : -D * 0.55;
  R.box(W / 2 - 0.4, 0, wz, 0.65, 2.2, 1.8, 0x8a6a4c, 0, true);
  R.box(W / 2 - 0.73, 1.1, wz, 0.02, 0.06, 0.06, 0xd7a03d);
  // Kitchen along the left wall near the door.
  if (tier !== "studio") kitchen(R, -W / 2 + 0.3, -W / 2 + 3.6, -1.6, 0.65, 0x2f757c, 0xefe3d2);
  else counter(R, -W / 2 + 1.2, -1.4, 2, 0.6, 0.92, 0xefe3d2, 0x2f757c);
  if (tier !== "studio") { table(R, -W / 2 + 2, -4.2, 1.4, 0.9); chair(R, -W / 2 + 1.5, -3.5, 0); chair(R, -W / 2 + 2.5, -3.5, 0); chair(R, -W / 2 + 1.5, -4.9, Math.PI); chair(R, -W / 2 + 2.5, -4.9, Math.PI); pend(-W / 2 + 2, -4.2); }
  plant(R, W / 2 - 0.6, -0.8);
  if (tier === "bungalow") R.box(1, 0, -D * 0.62, 0.15, H, W * 0.3, 0xf3e6d3, 0, true);
  if (tier === "loft" || tier === "penthouse") {
    // Pool table and a bar.
    const px = 0, pz = -D * 0.6;
    R.box(px, 0, pz, 1.4, 0.7, 2.5, 0x5a4636, 0, true);
    R.box(px, 0.7, pz, 1.3, 0.08, 2.4, 0x2f757c);
    pend(px, pz);
    counter(R, -W / 2 + 0.6, -D + 4, 3.5, 0.6, 1.05, 0x182b2e, 0x8a6a4c, "z");
    for (let k = 0; k < 8; k++) { R.g.e.cdata = [0, 4]; R.tube([-W / 2 + 0.2, 1.4, -D + 2.6 + k * 0.32], [-W / 2 + 0.2, 1.7, -D + 2.6 + k * 0.32], 0.035, 0.02, hex([0xd7a03d, 0x5d8f5e, 0xb8544f, 0x3fd0c9][k % 4]), 6); R.g.e.cdata = [0, 0]; }
    R.box(-W / 2 + 0.2, 1.38, -D + 3.7, 0.3, 0.03, 2.9, 0x8d969a);
    lampFloor(R, W / 2 - 1.2, -2.5, 0xffc38a);
  }
  if (tier === "penthouse") { sofa(R, lx + 3.2, -D * 0.38, -Math.PI / 2, 2.6, 0xfff7ee); plant(R, -W / 2 + 0.6, -D + 0.7, 1.4); }
  R.light(0, H - 0.3, -1.5, 0xffe2c0, 1.1, 5);
  R.spots.push({ kind: "bed", x: W / 4, z: bz + 1.6, r: 1.4, label: "Sleep until morning and save" });
  R.spots.push({ kind: "wardrobe", x: W / 2 - 1.3, z: wz, r: 1.3, label: "Change outfit" });
  R.spots.push({ kind: "buy", x: 0, z: -1.6, r: 1.4, label: "" });
  R.shopCam = { x: W / 2 - 3.3, y: 1.6, z: wz };
  R.mirror = { x: W / 2 - 1.5, z: wz, yaw: -Math.PI / 2 };
  return R.build(U);
}

const BUILDERS = { arms, mart, threads, clinic };
const built = new Map();
export function interiorFor(v, U) {
  const key = v.kind === "home" ? `home-${v.tier}` : v.kind;
  if (!built.has(key)) built.set(key, v.kind === "home" ? home(U, v.tier) : BUILDERS[v.kind](U));
  return built.get(key);
}
