// Car physics: a bicycle model with saturating tyre forces, a simple drivetrain, ground
// following with jumps, and collision against buildings, props, bridge walls and other cars.
// Yaw is a rotation about +y; forward is (-sin yaw, -cos yaw) in (x, z), left is -right.
import { clamp, lerp } from "./util.js";
import { HALF, CHUNK, NCH, ROAD_LIFT } from "./map.js";

export const DT = 1 / 120;
const G = 9.81;

export function obb(x, z, yaw, hl, hw) {
  return { x, z, fx: -Math.sin(yaw), fz: -Math.cos(yaw), hl, hw };
}

// Separating-axis test between two oriented boxes. Returns the push for `a` out of `b`.
export function sat(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  let best = Infinity, nx = 0, nz = 0;
  const axes = [[a.fx, a.fz], [a.fz, -a.fx], [b.fx, b.fz], [b.fz, -b.fx]];
  for (const [ux, uz] of axes) {
    const ra = a.hl * Math.abs(a.fx * ux + a.fz * uz) + a.hw * Math.abs(a.fz * ux - a.fx * uz);
    const rb = b.hl * Math.abs(b.fx * ux + b.fz * uz) + b.hw * Math.abs(b.fz * ux - b.fx * uz);
    const d = dx * ux + dz * uz;
    const o = ra + rb - Math.abs(d);
    if (o <= 0) return null;
    if (o < best) { best = o; const s = d < 0 ? -1 : 1; nx = ux * s; nz = uz * s; }
  }
  return { nx, nz, depth: best };
}

export function corners(o) {
  const rx = o.fz, rz = -o.fx;
  const out = [];
  for (const [sf, sr] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) out.push([o.x + o.fx * o.hl * sf + rx * o.hw * sr, o.z + o.fz * o.hl * sf + rz * o.hw * sr]);
  return out;
}

export class Vehicle {
  constructor(world, spec, opts = {}) {
    this.w = world;
    this.setSpec(spec);
    this.power = opts.power || 210000;
    this.mu = opts.mu || 1.05;
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0;
    this.vx = 0; this.vz = 0; this.vy = 0; this.r = 0;
    this.steer = 0; this.airborne = false; this.air = 0;
    this.pitch = 0; this.roll = 0; this.spin = 0;
    this.inWater = 0; this.events = [];
    this.slip = 0; this.rpm = 900; this.gear = 1; this.throttle = 0; this.braking = false; this.hold = 0;
    this.knocked = opts.knocked || (() => {});
  }

  // A different body: size, mass and the axles' spacing.
  setSpec(spec) {
    this.spec = spec;
    this.m = spec.mass;
    this.hl = spec.L / 2;
    this.hw = spec.W / 2;
    this.a = spec.L * 0.28;
    this.b = spec.L * 0.31;
    this.I = this.m * (spec.L * spec.L + spec.W * spec.W) / 11;
    this.C = this.m * 52;   // tyre cornering stiffness follows the car's weight
  }

  place(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = this.w.ground(x, z, 999);
    if (this.w.onDeck === false) this.y = Math.max(this.y, 0) + ROAD_LIFT;
    this.vx = this.vz = this.vy = this.r = 0;
    this.steer = 0; this.airborne = false; this.inWater = 0;
    this.pitch = this.roll = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fwdSpeed() { return -this.vx * Math.sin(this.yaw) - this.vz * Math.cos(this.yaw); }

  step(dt, inp) {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const lx = -Math.cos(this.yaw), lz = Math.sin(this.yaw);
    let u = this.vx * fx + this.vz * fz;
    let vl = this.vx * lx + this.vz * lz;
    const L = this.a + this.b;

    const maxSteer = 0.62 / (1 + Math.abs(u) / 16);
    const target = -clamp(inp.steer, -1, 1) * maxSteer;
    this.steer += clamp(target - this.steer, -3.2 * dt, 3.2 * dt);
    const d = this.steer;
    this.throttle = inp.throttle;
    this.braking = inp.brake > 0.1 && u > 0.5;

    if (!this.airborne) {
      const Fzf = (this.m * G * this.b) / L, Fzr = (this.m * G * this.a) / L;
      const wet = this.inWater > 0 ? 0.3 : 1;
      let muR = this.mu * wet * (inp.handbrake ? 0.5 : 1), muF = this.mu * wet;

      // Longitudinal force
      let Fx = 0;
      if (inp.throttle > 0) {
        Fx = Math.min((this.power * inp.throttle) / Math.max(Math.abs(u), 2.5), muR * Fzr * 1.05);
        // Traction control: while steering hard, keep some rear grip free for cornering.
        if (!inp.handbrake) Fx = Math.min(Fx, muR * Fzr * (1.05 - 0.6 * Math.min(1, Math.abs(d) / 0.25)));
      }
      if (inp.brake > 0) {
        if (u > 0.6) Fx -= inp.brake * 12500;
        else if (u > -9) Fx -= inp.brake * 5200;
      }
      if (inp.handbrake && Math.abs(u) > 0.3) Fx -= Math.sign(u) * muR * Fzr * 0.6;
      Fx -= 0.62 * u * Math.abs(u) + 38 * u;
      if (!inp.throttle && !inp.brake && Math.abs(u) < 0.5) Fx -= u * this.m * 2;

      // Lateral tyre forces with saturation; the rear shares grip with drive force.
      const den = Math.max(Math.abs(u), 3.5);
      const af = Math.atan2(vl + this.a * this.r, den) - d * Math.sign(u || 1);
      const ar = Math.atan2(vl - this.b * this.r, den);
      const maxF = muF * Fzf;
      const maxR = Math.sqrt(Math.max(0, (muR * Fzr) ** 2 - Math.min(Fx * Fx, (muR * Fzr) ** 2 * 0.9)));
      const Fyf = clamp(-this.C * af, -maxF, maxF);
      const Fyr = clamp(-this.C * ar, -maxR, maxR);
      this.slip = Math.max(Math.abs(Fyr) >= maxR * 0.98 ? Math.abs(vl) : 0, inp.handbrake ? Math.abs(u) * 0.3 : 0);

      const du = (Fx - Fyf * Math.sin(d)) / this.m + vl * this.r;
      const dvl = (Fyf * Math.cos(d) + Fyr) / this.m - u * this.r;
      const dr = (this.a * Fyf * Math.cos(d) - this.b * Fyr) / this.I;
      u += du * dt; vl += dvl * dt; this.r += dr * dt;

      // Stability control: unless the handbrake is on, hold the yaw rate near what the steering asks
      // for and the tyres can give, and let the sideways slide die away. The handbrake still drifts.
      if (!inp.handbrake && Math.abs(u) > 3) {
        const rMax = (this.mu * wet * G * 1.25) / Math.abs(u);   // a little more than true grip: arcade cornering
        const rWant = clamp((u * Math.tan(d)) / L, -rMax, rMax);
        this.r += (rWant - this.r) * Math.min(1, dt * 5);
        vl *= 1 - Math.min(1, dt * 3);
      }

      // At walking pace the tyres just follow the steering.
      if (Math.abs(u) < 2.5) {
        const k = 1 - Math.abs(u) / 2.5;
        this.r = lerp(this.r, (u * Math.tan(d)) / L, k * 0.5);
        vl *= 1 - k * 0.3;
      }
      // Braking to a stop holds the car for a moment, then keep holding S to reverse.
      if (!inp.brake || inp.throttle) this.hold = 0;
      else if (u > 0.6) this.hold = 0.35;
      else if ((this.hold > 0 || inp.handbrake) && u > -0.6) { this.hold -= dt; u *= 0.8; }
      this.yaw += this.r * dt;
      const nfx = -Math.sin(this.yaw), nfz = -Math.cos(this.yaw), nlx = -Math.cos(this.yaw), nlz = Math.sin(this.yaw);
      this.vx = u * nfx + vl * nlx;
      this.vz = u * nfz + vl * nlz;
      // Gravity along the slope.
      const n = this.w.normal(this.x, this.z);
      if (!this.w.onDeck) { this.vx += G * n[0] * dt * 0.9; this.vz += G * n[2] * dt * 0.9; }
      this.air = 0;
    } else {
      this.r *= 1 - 0.4 * dt;
      this.air += dt;
    }

    const ox = this.x, oz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.x = clamp(this.x, -HALF + 60, HALF - 60);
    this.z = clamp(this.z, -HALF + 60, HALF - 60);
    if (this.x !== ox + this.vx * dt) this.vx = 0;
    if (this.z !== oz + this.vz * dt) this.vz = 0;

    // Vertical: follow the ground until it drops away faster than gravity.
    const g = this.w.ground(this.x, this.z, this.y + 0.9);
    const onDeck = this.w.onDeck;
    const water = !onDeck && g < 0;
    // Off the bridges, tyres ride on the road surface, which is drawn a little above the terrain.
    const floor = water ? Math.max(g, -1.4) : onDeck ? g : g + ROAD_LIFT;
    if (this.airborne) {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= floor) {
        if (this.vy < -5) this.events.push({ type: "land", mag: -this.vy });
        this.y = floor; this.vy = 0; this.airborne = false;
      }
    } else {
      const vyN = this.vy - G * dt;
      const yN = this.y + vyN * dt;
      if (yN > floor + 0.04 && !water) {
        this.airborne = true; this.y = yN; this.vy = vyN;
      } else {
        this.vy = clamp((floor - this.y) / dt, -12, 14);
        this.y = floor;
      }
    }
    if (water && this.y < 0.35) {
      this.inWater += dt;
      const k = 1 - 2.2 * dt;
      this.vx *= k; this.vz *= k; this.r *= k;
    } else this.inWater = 0;

    this.collide();

    // Body attitude from the four wheel heights plus weight transfer.
    const fx2 = -Math.sin(this.yaw), fz2 = -Math.cos(this.yaw), rx2 = Math.cos(this.yaw), rz2 = -Math.sin(this.yaw);
    if (!this.airborne) {
      const hF = this.w.ground(this.x + fx2 * 1.3, this.z + fz2 * 1.3, this.y + 1);
      const hB = this.w.ground(this.x - fx2 * 1.3, this.z - fz2 * 1.3, this.y + 1);
      const hR = this.w.ground(this.x + rx2 * 0.8, this.z + rz2 * 0.8, this.y + 1);
      const hL = this.w.ground(this.x - rx2 * 0.8, this.z - rz2 * 0.8, this.y + 1);
      const tp = Math.atan2(hF - hB, 2.6), tr = Math.atan2(hL - hR, 1.6);
      this.pitch = lerp(this.pitch, clamp(tp, -0.6, 0.6), 0.25);
      this.roll = lerp(this.roll, clamp(tr, -0.5, 0.5), 0.25);
    } else {
      this.pitch = lerp(this.pitch, clamp(-this.vy * 0.03, -0.3, 0.3), 0.02);
    }
    const uu = this.fwdSpeed;
    this.spin += (uu / this.spec.wr) * dt;
    // Pretend gearbox for the engine sound.
    const kmh = Math.abs(uu) * 3.6;
    const ratios = [0, 0, 45, 80, 120, 165, 230];
    let gear = 1;
    while (gear < 6 && kmh > ratios[gear + 1] * 0.92) gear++;
    this.gear = gear;
    const lo = ratios[gear] * 0.55, hi = ratios[gear + 1] || 230;
    this.rpm = lerp(this.rpm, 900 + clamp((kmh - lo) / (hi - lo), 0, 1.1) * 6200 * (gear === 1 ? Math.min(1, 0.4 + kmh / 30) : 1) + this.throttle * 600, 0.15);
  }

  obb() { return obb(this.x, this.z, this.yaw, this.hl, this.hw); }

  collide() {
    for (let pass = 0; pass < 2; pass++) {
      const me = this.obb();
      const R = this.hl + 1;
      const cx0 = Math.floor((this.x - R + HALF) / CHUNK), cx1 = Math.floor((this.x + R + HALF) / CHUNK);
      const cz0 = Math.floor((this.z - R + HALF) / CHUNK), cz1 = Math.floor((this.z + R + HALF) / CHUNK);
      const seen = new Set();
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) continue;
        const c = this.w.chunk(cx, cz);
        const i0 = clamp(Math.floor((this.x - R - c.x0) / 32), 0, 7), i1 = clamp(Math.floor((this.x + R - c.x0) / 32), 0, 7);
        const j0 = clamp(Math.floor((this.z - R - c.z0) / 32), 0, 7), j1 = clamp(Math.floor((this.z + R - c.z0) / 32), 0, 7);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          for (const o of c.grid[i + j * 8]) {
            if (seen.has(o)) continue;
            seen.add(o);
            if (o.y1 != null && this.y > o.y1 - 0.2) continue;
            if (o.r != null) this.hitCircle(o, c);
            else this.hitBox(o);
          }
        }
      }
      for (const wl of this.w.deckWalls(this.x, this.z)) {
        if (Math.abs(this.y - wl.y) > 2.5) continue;
        const dx = wl.x1 - wl.x0, dz = wl.z1 - wl.z0, l = Math.hypot(dx, dz);
        const o = { x: (wl.x0 + wl.x1) / 2, z: (wl.z0 + wl.z1) / 2, fx: dx / l, fz: dz / l, hl: l / 2 + 0.05, hw: 0.2 };
        const hit = sat(this.obb(), o);
        if (hit) this.resolve(hit, 0.15, "wall");
      }
      void me;
    }
  }

  hitBox(b) {
    const o = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, fx: 0, fz: -1, hl: (b.z1 - b.z0) / 2, hw: (b.x1 - b.x0) / 2 };
    const hit = sat(this.obb(), o);
    if (hit) this.resolve(hit, 0.25, "wall");
  }

  hitCircle(c, chunk) {
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const dx = c.x - this.x, dz = c.z - this.z;
    const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
    const cf = clamp(lf, -this.hl, this.hl), cr = clamp(lr, -this.hw, this.hw);
    const ex = lf - cf, ez = lr - cr;
    const dist = Math.hypot(ex, ez);
    if (dist >= c.r && !(ex === 0 && ez === 0)) return;
    if (c.kind === "lamp" && this.speed > 3) {
      if (!c.down) {
        c.down = true;
        this.knocked(chunk, c);
        this.events.push({ type: "knock", mag: this.speed, x: c.x, z: c.z });
        this.vx *= 0.9; this.vz *= 0.9;
      }
      return;
    }
    if (c.down) return;
    let nx, nz, depth;
    if (dist > 1e-4) {
      // normal from circle toward the car, in world space
      const wx = (ex * fx + ez * rx) / dist, wz = (ex * fz + ez * rz) / dist;
      nx = -wx; nz = -wz; depth = c.r - dist;
    } else {
      const pf = this.hl - Math.abs(lf), pr = this.hw - Math.abs(lr);
      if (pf < pr) { nx = -fx * Math.sign(lf); nz = -fz * Math.sign(lf); depth = pf + c.r; }
      else { nx = -rx * Math.sign(lr); nz = -rz * Math.sign(lr); depth = pr + c.r; }
    }
    this.resolve({ nx, nz, depth }, 0.2, c.kind);
  }

  // Push out along n and apply an impulse at the most penetrating corner.
  resolve(hit, e, kind, other) {
    const { nx, nz, depth } = hit;
    this.x += nx * depth;
    this.z += nz * depth;
    const cs = corners(this.obb());
    let cp = cs[0], best = Infinity;
    for (const c of cs) { const d = (c[0] - this.x) * nx + (c[1] - this.z) * nz; if (d < best) { best = d; cp = c; } }
    const px = cp[0] - this.x, pz = cp[1] - this.z;
    const vpx = this.vx + this.r * pz, vpz = this.vz - this.r * px;
    let vn = vpx * nx + vpz * nz;
    if (other) vn -= other.vx * nx + other.vz * nz;
    if (vn >= 0) return 0;
    const rn = pz * nx - px * nz;
    const invM = 1 / this.m + (other ? 1 / other.m : 0);
    const J = (-(1 + e) * vn) / (invM + (rn * rn) / this.I);
    this.vx += (J * nx) / this.m;
    this.vz += (J * nz) / this.m;
    this.r += (rn * J) / this.I * 0.6;
    // Scrape: kill some of the sliding speed along the wall.
    const tx = -nz, tz = nx;
    const vt = this.vx * tx + this.vz * tz;
    const fr = Math.min(Math.abs(vt), (0.35 * J) / this.m) * Math.sign(vt);
    this.vx -= fr * tx; this.vz -= fr * tz;
    if (-vn > 2) this.events.push({ type: "impact", mag: -vn, kind });
    return J;
  }
}
