// Ambient traffic. Cars live on the main road network near the player: they follow lanes,
// take random turns at junctions on a cubic curve, keep their distance from whatever is in
// front, and become free-sliding wrecks when the player hits them.
import { clamp, lerp, rng } from "./util.js";
import { HALF, CHUNK, NCH } from "./map.js";
import { CAR_TYPES, TRAFFIC_COLORS } from "./cars.js";
import { sat } from "./vehicle.js";

const SPEED = { 0: 11, 1: 15, 2: 13 };
const tmp = {};

export class Traffic {
  constructor(world, seed = 3) {
    this.w = world;
    this.cars = [];
    this.r = rng(seed);
    this.max = 40;
    this.spawnT = 0;
  }

  laneStart(e, dir, lane) {
    const off = e.laneOff[Math.min(lane, e.laneOff.length - 1)];
    const s = dir > 0 ? e.sA : e.sB;
    this.w.edgePoint(e, s, dir > 0 ? off : -off, tmp);
    return { x: tmp.x, z: tmp.z, y: tmp.y, tx: tmp.tx * dir, tz: tmp.tz * dir };
  }

  spawn(px, pz, near, far) {
    const r = this.r;
    const pcx = Math.floor((px + HALF) / CHUNK), pcz = Math.floor((pz + HALF) / CHUNK);
    for (let tries = 0; tries < 12; tries++) {
      const cx = pcx + r.int(-2, 2), cz = pcz + r.int(-2, 2);
      if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
      const segs = this.w.chunkSegs[cx + cz * NCH];
      if (!segs.length) continue;
      const { e, i } = segs[r.int(0, segs.length - 1)];
      if (!e.main) continue;
      const p = e.rib[i];
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < near || d > far) continue;
      const dir = r() < 0.5 ? 1 : -1, lane = r.int(0, e.laneOff.length - 1);
      const off = e.laneOff[lane];
      this.w.edgePoint(e, p.s, dir > 0 ? off : -off, tmp);
      if (this.cars.some((c) => Math.hypot(c.x - tmp.x, c.z - tmp.z) < 14)) continue;
      const type = r() < 0.12 ? 4 : r.int(0, 3);
      const t = CAR_TYPES[type];
      const car = {
        mode: "lane", e, dir, lane, s: p.s, type, spec: t, m: t.mass,
        color: type === 4 ? 0xff6018 : r.pick(TRAFFIC_COLORS),
        x: tmp.x, z: tmp.z, y: tmp.y, yaw: Math.atan2(-tmp.tx * dir, -tmp.tz * dir),
        v: (SPEED[e.type] || 12) * 0.8, cruise: (SPEED[e.type] || 12) * r.range(0.85, 1.12),
        vx: 0, vz: 0, r: 0, stuck: 0, ignore: 0, hl: t.L / 2, hw: t.W / 2, spin: 0, brake: false,
      };
      this.cars.push(car);
      return car;
    }
    return null;
  }

  pickNext(c) {
    const node = c.dir > 0 ? c.e.b : c.e.a;
    const opts = node.edges.filter((e) => e !== c.e && e.main);
    if (!opts.length) return { e: c.e, dir: -c.dir };
    // Prefer going straight on.
    const cur = this.laneStart(c.e, -c.dir, 0);
    const inX = -cur.tx, inZ = -cur.tz;
    let best = null, bw = -1;
    for (const e of opts) {
      const dir = e.a === node ? 1 : -1;
      const s = this.laneStart(e, dir, 0);
      const dot = inX * s.tx + inZ * s.tz;
      const w = (dot > 0.7 ? 2.2 : 1) * this.r.range(0.2, 1);
      if (w > bw) { bw = w; best = { e, dir }; }
    }
    return best;
  }

  update(dt, player, px, pz, near, far) {
    const r = this.r;
    this.spawnT -= dt;
    if (this.cars.length < this.max && this.spawnT <= 0) {
      this.spawn(px, pz, near, far);
      this.spawnT = 0.05;
    }
    this.cars = this.cars.filter((c) => Math.hypot(c.x - px, c.z - pz) < far + 80);

    for (const c of this.cars) {
      if (c.mode === "wreck") {
        const k = Math.max(0, 1 - 4.5 * dt / Math.max(Math.hypot(c.vx, c.vz), 0.5));
        c.vx *= k; c.vz *= k; c.r *= 1 - 3 * dt;
        c.x += c.vx * dt; c.z += c.vz * dt; c.yaw += c.r * dt;
        c.y = this.w.ground(c.x, c.z, c.y + 1);
        if (c.y < -0.5) c.y = -0.5;
        c.brake = true;
        continue;
      }
      // Look ahead for anything in the way.
      const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
      let gap = Infinity;
      c.ignore = Math.max(0, c.ignore - dt);
      const look = 8 + c.v * 2.2;
      const check = (o, isPlayer) => {
        const dx = o.x - c.x, dz = o.z - c.z;
        if (Math.abs(dx) > look + 6 || Math.abs(dz) > look + 6) return;
        const along = dx * fx + dz * fz;
        if (along <= 0 || along > look) return;
        const lat = Math.abs(dx * fz - dz * fx);
        if (lat > (isPlayer ? 2.6 : 2.1)) return;
        gap = Math.min(gap, along - (o.hl || 2.3) - c.hl);
      };
      if (!c.ignore) for (const o of this.cars) if (o !== c) check(o, false);
      if (player) check({ x: player.x, z: player.z, hl: player.hl }, true);
      let target = c.cruise;
      if (c.mode === "turn") target = Math.min(target, c.turnV);
      else {
        const left = c.dir > 0 ? c.e.sB - c.s : c.s - c.e.sA;
        if (left < 25 && c.next && c.nextTurn) target = Math.min(target, lerp(6.5, target, clamp(left / 25, 0, 1)));
      }
      if (gap < Infinity) target = Math.min(target, Math.max(0, (gap - 2.5) * 0.9));
      c.brake = target < c.v - 0.5;
      c.v += clamp(target - c.v, -9 * dt, 2.8 * dt);
      if (c.v < 0.3) { c.stuck += dt; if (c.stuck > 6) { c.ignore = 2; c.stuck = 0; } } else c.stuck = 0;
      c.spin += (c.v / c.spec.wr) * dt;

      if (c.mode === "lane") {
        if (!c.next) {
          c.next = this.pickNext(c);
          const a = this.laneStart(c.e, -c.dir, 0), b = this.laneStart(c.next.e, c.next.dir, 0);
          c.nextTurn = -a.tx * b.tx - a.tz * b.tz < 0.8;
        }
        c.s += c.v * dt * c.dir;
        const end = c.dir > 0 ? c.e.sB : c.e.sA;
        const off = c.e.laneOff[Math.min(c.lane, c.e.laneOff.length - 1)];
        if ((c.dir > 0 && c.s >= end) || (c.dir < 0 && c.s <= end)) {
          this.w.edgePoint(c.e, end, c.dir > 0 ? off : -off, tmp);
          const p0 = { x: tmp.x, z: tmp.z, y: tmp.y, tx: tmp.tx * c.dir, tz: tmp.tz * c.dir };
          const { e, dir } = c.next;
          const lane = Math.min(c.lane, e.laneOff.length - 1);
          const p1 = this.laneStart(e, dir, lane);
          const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          c.mode = "turn";
          c.curve = { p0, p1, c0: [p0.x + p0.tx * d / 3, p0.z + p0.tz * d / 3], c1: [p1.x - p1.tx * d / 3, p1.z - p1.tz * d / 3], len: Math.max(d * 1.05, 1), t: 0 };
          c.turnV = c.nextTurn ? 7 : c.cruise;
          c.e = e; c.dir = dir; c.lane = lane; c.next = null;
        } else {
          this.w.edgePoint(c.e, c.s, c.dir > 0 ? off : -off, tmp);
          c.x = tmp.x; c.z = tmp.z; c.y = tmp.y;
          c.yaw = Math.atan2(-tmp.tx * c.dir, -tmp.tz * c.dir);
        }
      }
      if (c.mode === "turn") {
        const k = c.curve;
        k.t += (c.v * dt) / k.len;
        const t = Math.min(k.t, 1), u = 1 - t;
        const bx = u * u * u * k.p0.x + 3 * u * u * t * k.c0[0] + 3 * u * t * t * k.c1[0] + t * t * t * k.p1.x;
        const bz = u * u * u * k.p0.z + 3 * u * u * t * k.c0[1] + 3 * u * t * t * k.c1[1] + t * t * t * k.p1.z;
        const dx = 3 * u * u * (k.c0[0] - k.p0.x) + 6 * u * t * (k.c1[0] - k.c0[0]) + 3 * t * t * (k.p1.x - k.c1[0]);
        const dz = 3 * u * u * (k.c0[1] - k.p0.z) + 6 * u * t * (k.c1[1] - k.c0[1]) + 3 * t * t * (k.p1.z - k.c1[1]);
        c.x = bx; c.z = bz; c.y = lerp(k.p0.y, k.p1.y, t);
        if (Math.hypot(dx, dz) > 1e-3) c.yaw = Math.atan2(-dx, -dz);
        if (k.t >= 1) {
          c.mode = "lane";
          c.s = c.dir > 0 ? c.e.sA : c.e.sB;
        }
      }
      c.vx = -Math.sin(c.yaw) * c.v; c.vz = -Math.cos(c.yaw) * c.v;
    }
    void r;
  }

  // Player against traffic: push apart, exchange momentum, and turn the other car into a wreck.
  collidePlayer(p) {
    for (const c of this.cars) {
      if (Math.abs(c.x - p.x) > 7 || Math.abs(c.z - p.z) > 7 || Math.abs(c.y - p.y) > 2.5) continue;
      const o = { x: c.x, z: c.z, fx: -Math.sin(c.yaw), fz: -Math.cos(c.yaw), hl: c.hl, hw: c.hw };
      const hit = sat(p.obb(), o);
      if (!hit) continue;
      const share = p.m / (p.m + c.m);
      const pushed = { nx: hit.nx, nz: hit.nz, depth: hit.depth * (1 - share) };
      const J = p.resolve(pushed, 0.25, "car", c);
      c.x -= hit.nx * hit.depth * share; c.z -= hit.nz * hit.depth * share;
      if (c.mode !== "wreck") { c.mode = "wreck"; c.v = 0; }
      if (J) {
        c.vx -= (J * hit.nx) / c.m; c.vz -= (J * hit.nz) / c.m;
        const px = p.x - c.x, pz = p.z - c.z;
        c.r += ((pz * -hit.nx - px * -hit.nz) * J) / (c.m * 3) * 0.3;
      }
    }
    // Wrecks shove other wrecks and parked traffic.
    for (const a of this.cars) {
      if (a.mode !== "wreck" || Math.hypot(a.vx, a.vz) < 0.5) continue;
      for (const b of this.cars) {
        if (a === b || Math.abs(a.x - b.x) > 7 || Math.abs(a.z - b.z) > 7) continue;
        const hit = sat({ x: a.x, z: a.z, fx: -Math.sin(a.yaw), fz: -Math.cos(a.yaw), hl: a.hl, hw: a.hw }, { x: b.x, z: b.z, fx: -Math.sin(b.yaw), fz: -Math.cos(b.yaw), hl: b.hl, hw: b.hw });
        if (!hit) continue;
        a.x += hit.nx * hit.depth / 2; a.z += hit.nz * hit.depth / 2;
        b.x -= hit.nx * hit.depth / 2; b.z -= hit.nz * hit.depth / 2;
        const vn = (a.vx - b.vx) * hit.nx + (a.vz - b.vz) * hit.nz;
        if (vn < 0) {
          const j = -vn * 0.6;
          a.vx += hit.nx * j; a.vz += hit.nz * j;
          if (b.mode !== "wreck") { b.mode = "wreck"; b.vx = b.vx || 0; b.vz = b.vz || 0; }
          b.vx -= hit.nx * j; b.vz -= hit.nz * j;
        }
      }
    }
  }
}
