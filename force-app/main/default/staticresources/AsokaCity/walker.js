// The player on foot: walks and jogs relative to the camera, bumps off buildings, props and cars,
// stops at the water's edge, and inside a room keeps to its walls and furniture.
import { clamp, lerp, angleWrap } from "./util.js";
import { HALF, CHUNK, NCH } from "./map.js";
import { sat } from "./vehicle.js";

const R = 0.35, R0 = 0.3, STEP = 0.6;

export class Walker {
  constructor(world) {
    this.w = world;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.speed = 0; this.run = 0; this.person = null;
    this.room = null;   // { W, D, boxes, ox, oy, oz } while indoors
    this.vy = 0; this.on = null; this.fall = 0;   // fall: damage from the last landing, read by the game
  }

  // What's underfoot at (x, z) for someone at height y: the terrain or a bridge deck, or a walkable
  // deck, stair or roof no more than a step above.
  support(x, z, y) {
    const g = this.w.ground(x, z, y + 1), deck = this.w.onDeck;
    let h = deck ? g : g + 0.15, on = null, water = !deck && g < 0.05;
    const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
    if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return { h, on, water };
    const c = this.w.chunk(cx, cz);
    const k = clamp(Math.floor((x - c.x0) / 32), 0, 7) + clamp(Math.floor((z - c.z0) / 32), 0, 7) * 8;
    for (const s of c.wgrid[k]) {
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      const t = s.ax === 1 ? (x - s.x0) / (s.x1 - s.x0) : s.ax === 2 ? (z - s.z0) / (s.z1 - s.z0) : 0;
      const hs = s.y0 + (s.y1 - s.y0) * t;
      if (hs <= y + STEP && hs > h) { h = hs; on = s; water = false; }
    }
    for (const o of c.grid[k]) {
      if (o.r != null || o.y1 == null || x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
      if (o.y1 <= y + STEP && o.y1 > h) { h = o.y1; on = o; water = false; }
    }
    return { h, on, water };
  }

  place(x, z, yaw, y = null) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = y != null ? y : this.w.ground(x, z, 999) + 0.15;
    this.speed = 0; this.vy = 0; this.on = null; this.fall = 0;
    if (y != null) this.on = this.support(x, z, y).on;
  }

  get fwdSpeed() { return this.speed; }

  // inp: { mx, mz } a world-space direction scaled 0..1, run, and face: a yaw to hold (aiming) or null.
  step(dt, inp, obstacles) {
    const mag = Math.min(1, Math.hypot(inp.mx, inp.mz));
    const aiming = inp.face != null;
    if (aiming) this.yaw += angleWrap(inp.face - this.yaw) * Math.min(1, dt * 16);
    else if (mag > 0.05) this.yaw += angleWrap(Math.atan2(-inp.mx, -inp.mz) - this.yaw) * Math.min(1, dt * 10);
    const want = mag * (inp.run && !aiming ? 5.4 : aiming ? 1.4 : 1.65) * (this.room ? 0.85 : 1);
    this.speed += clamp(want - this.speed, -10 * dt, 6 * dt);
    this.run = lerp(this.run, inp.run && !aiming && mag > 0.3 ? 1 : 0, Math.min(1, dt * 5));
    const dx = mag > 0.05 ? inp.mx / mag : 0, dz = mag > 0.05 ? inp.mz / mag : 0;
    // Facing forward this is the gait's speed; walking backwards while aiming it still animates.
    const ox = this.x, oz = this.z;
    this.x += dx * this.speed * dt;
    this.z += dz * this.speed * dt;
    if (this.room) { this.collideRoom(); return; }
    this.x = clamp(this.x, -HALF + 60, HALF - 60);
    this.z = clamp(this.z, -HALF + 60, HALF - 60);
    this.collide(obstacles);
    // No walking into the sea, and railed decks and stairs keep you on them.
    let sup = this.support(this.x, this.z, this.y);
    if (sup.water || (this.on && this.on.rail && sup.h < this.y - STEP)) {
      this.x = ox; this.z = oz;
      sup = this.support(ox, oz, this.y);
    }
    if (sup.h >= this.y - 0.3) {
      if (this.vy < -11) this.fall += (-this.vy - 11) * 9;
      this.vy = 0;
      this.y += (sup.h - this.y) * Math.min(1, dt * 16);
      this.on = sup.on;
    } else {
      // Off an edge: fall, and land hard from high enough.
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      this.on = null;
      if (this.y <= sup.h) {
        if (this.vy < -11) this.fall += (-this.vy - 11) * 9;
        this.y = sup.h; this.vy = 0; this.on = sup.on;
      }
    }
  }

  collideRoom() {
    const R = this.room;
    let lx = this.x - R.ox, lz = this.z - R.oz;
    for (const o of R.boxes) {
      const px = clamp(lx, o.x0, o.x1), pz = clamp(lz, o.z0, o.z1);
      const dx = lx - px, dz = lz - pz, d = Math.hypot(dx, dz);
      if (d < R0 && d > 1e-4) { lx = px + (dx / d) * R0; lz = pz + (dz / d) * R0; }
      else if (d <= 1e-4) {
        const e = [lx - o.x0, o.x1 - lx, lz - o.z0, o.z1 - lz], k = e.indexOf(Math.min(...e));
        if (k === 0) lx = o.x0 - R0; else if (k === 1) lx = o.x1 + R0; else if (k === 2) lz = o.z0 - R0; else lz = o.z1 + R0;
      }
    }
    lx = clamp(lx, -R.W / 2 + R0, R.W / 2 - R0);
    lz = clamp(lz, -R.D + R0, -0.25);
    this.x = lx + R.ox; this.z = lz + R.oz; this.y = R.oy;
  }

  collide(obstacles) {
    const cx0 = Math.floor((this.x - 1 + HALF) / CHUNK), cx1 = Math.floor((this.x + 1 + HALF) / CHUNK);
    const cz0 = Math.floor((this.z - 1 + HALF) / CHUNK), cz1 = Math.floor((this.z + 1 + HALF) / CHUNK);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
      const c = this.w.chunk(cx, cz);
      const i = clamp(Math.floor((this.x - c.x0) / 32), 0, 7), j = clamp(Math.floor((this.z - c.z0) / 32), 0, 7);
      for (const o of c.grid[i + j * 8]) {
        if (o.down) continue;
        if (o.r != null) {
          const dx = this.x - o.x, dz = this.z - o.z, d = Math.hypot(dx, dz), m = o.r + R;
          if (d < m && d > 1e-4) { this.x = o.x + (dx / d) * m; this.z = o.z + (dz / d) * m; }
        } else if (this.y < o.y1 - 0.35) {
          const px = clamp(this.x, o.x0, o.x1), pz = clamp(this.z, o.z0, o.z1);
          const dx = this.x - px, dz = this.z - pz, d = Math.hypot(dx, dz);
          if (d < R) {
            if (d > 1e-4) { this.x = px + (dx / d) * R; this.z = pz + (dz / d) * R; }
            else {
              // Inside the box: leave by the nearest face.
              const e = [this.x - o.x0, o.x1 - this.x, this.z - o.z0, o.z1 - this.z], k = e.indexOf(Math.min(...e));
              if (k === 0) this.x = o.x0 - R; else if (k === 1) this.x = o.x1 + R; else if (k === 2) this.z = o.z0 - R; else this.z = o.z1 + R;
            }
          }
        }
      }
    }
    for (const o of obstacles) {
      const hit = sat({ x: this.x, z: this.z, fx: 0, fz: -1, hl: R, hw: R }, o);
      if (hit) { this.x += hit.nx * hit.depth; this.z += hit.nz * hit.depth; }
    }
  }
}
