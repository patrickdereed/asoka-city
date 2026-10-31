// The player on foot: walks and jogs, turns with A/D, bumps off buildings, props and cars,
// and stops at the water's edge.
import { clamp, lerp } from "./util.js";
import { HALF, CHUNK, NCH } from "./map.js";
import { sat } from "./vehicle.js";

const R = 0.35;

export class Walker {
  constructor(world) {
    this.w = world;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.speed = 0; this.run = 0; this.person = null;
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = this.w.ground(x, z, 999);
    this.speed = 0;
  }

  get fwdSpeed() { return this.speed; }

  step(dt, inp, obstacles) {
    this.yaw -= inp.turn * (2.4 - this.run * 0.6) * dt;
    const want = inp.move * (inp.run ? 5.4 : 1.65);
    this.speed += clamp(want - this.speed, -10 * dt, 6 * dt);
    this.run = lerp(this.run, inp.run && inp.move > 0 ? 1 : 0, Math.min(1, dt * 5));
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ox = this.x, oz = this.z;
    this.x = clamp(this.x + fx * this.speed * dt, -HALF + 60, HALF - 60);
    this.z = clamp(this.z + fz * this.speed * dt, -HALF + 60, HALF - 60);
    this.collide(obstacles);
    // No walking into the sea or off a bridge.
    const g = this.w.ground(this.x, this.z, this.y + 1);
    if ((!this.w.onDeck && g < 0.05) || g - this.y > 0.9 || this.y - g > 3) {
      this.x = ox; this.z = oz;
    } else this.y = lerp(this.y, g + (this.w.onDeck ? 0 : 0.15), Math.min(1, dt * 12));
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
        } else if (this.y < o.y1) {
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
