// Headless physics and traffic: acceleration, braking, cornering, a building crash, a causeway
// crossing, and 60 s of traffic without NaNs or pile-ups.
import { World, SPAWN } from "../force-app/main/default/staticresources/AsokaCity/map.js";
import { Vehicle, DT } from "../force-app/main/default/staticresources/AsokaCity/vehicle.js";
import { Traffic } from "../force-app/main/default/staticresources/AsokaCity/traffic.js";
import { PLAYER_CAR } from "../force-app/main/default/staticresources/AsokaCity/cars.js";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } else console.log("ok  ", m); };
const w = new World(7);
const car = new Vehicle(w, PLAYER_CAR);
const run = (secs, inp) => { for (let t = 0; t < secs; t += DT) car.step(DT, inp); };
const kmh = () => (car.fwdSpeed * 3.6).toFixed(0);

// 0-100 km/h on the flat (avenue x=0 heading south from the plaza area).
car.place(-2.4, -60, Math.PI);
let t = 0;
while (car.fwdSpeed < 27.8 && t < 20) { car.step(DT, { throttle: 1, brake: 0, steer: 0, handbrake: false }); t += DT; }
console.log(`0-100 km/h in ${t.toFixed(1)} s`);
ok(t > 3.5 && t < 8, "0-100 between 3.5 and 8 s");

// Top speed on a long straight (the causeway at z=-256 heading east).
car.place(600, -256 + 2.0, -Math.PI / 2);
run(40, { throttle: 1, brake: 0, steer: 0, handbrake: false });
console.log(`after 40 s flat out east: ${kmh()} km/h at x=${car.x.toFixed(0)} y=${car.y.toFixed(2)} deck=${w.onDeck}`);
ok(car.fwdSpeed * 3.6 > 170 && car.fwdSpeed * 3.6 < 260, "top speed 170-260 km/h");
ok(car.x > 2100, "crossed the causeway to the isles");
ok(car.inWater === 0, "stayed out of the water");

// Braking from 100.
car.place(-2.4, -60, Math.PI);
car.vx = 0; car.vz = 27.8;
let d0 = car.z; t = 0;
while (car.fwdSpeed > 0.3 && t < 10) { car.step(DT, { throttle: 0, brake: 1, steer: 0, handbrake: false }); t += DT; }
console.log(`100-0 in ${(car.z - d0).toFixed(1)} m`);
ok(car.z - d0 > 28 && car.z - d0 < 55, "braking distance 28-55 m");

// Keep holding brake after the stop: a short hold, then it reverses.
run(0.2, { throttle: 0, brake: 1, steer: 0, handbrake: false });
ok(Math.abs(car.fwdSpeed) < 0.6, `holds briefly at the stop (${car.fwdSpeed.toFixed(2)} m/s)`);
run(3, { throttle: 0, brake: 1, steer: 0, handbrake: false });
ok(car.fwdSpeed < -4, `holding brake reverses (${kmh()} km/h)`);
run(6, { throttle: 0, brake: 1, steer: 0, handbrake: false });
ok(car.fwdSpeed > -10, `reverse speed is capped (${kmh()} km/h)`);
// From a standstill, brake reverses straight away.
car.place(-2.4, -60, Math.PI); car.hold = 0;
run(1.5, { throttle: 0, brake: 1, steer: 0, handbrake: false });
ok(car.fwdSpeed < -2, `reverses from a standstill (${kmh()} km/h)`);
// An empty car (brake + handbrake) stays put.
car.place(-2.4, -60, Math.PI); car.hold = 0;
run(5, { throttle: 0, brake: 1, steer: 0, handbrake: true });
ok(Math.abs(car.fwdSpeed) < 0.6, `parked car stays put (${car.fwdSpeed.toFixed(2)} m/s)`);

// Keyboard steering on open, flat ground: no spin-outs, on or off the throttle (handbrake aside).
{
  const flat = { onDeck: false, ground: () => 0, paveLift: () => 0, normal: () => [0, 1, 0], deckWalls: () => [], chunk: (cx, cz) => ({ x0: -4096 + cx * 256, z0: -4096 + cz * 256, grid: Array.from({ length: 64 }, () => []) }) };
  let worst = 0;
  for (const kmh of [30, 60, 100]) for (const thr of [0, 1]) for (const hold of [0.4, 1.5]) {
    const c = new Vehicle(flat, PLAYER_CAR); c.place(0, 0, Math.PI); c.vz = kmh / 3.6;
    let k = 0;
    for (let t = 0; t < 3; t += DT) {
      k = t < hold ? Math.min(1, k + 4 * DT) : Math.max(0, k - 5 * DT);
      c.step(DT, { throttle: thr, brake: 0, steer: k, handbrake: false });
      const u = c.fwdSpeed, vl = c.vx * -Math.cos(c.yaw) + c.vz * Math.sin(c.yaw);
      if (c.speed > 2) worst = Math.max(worst, Math.abs(Math.atan2(vl, Math.abs(u))) * 57.3);
    }
  }
  ok(worst < 20, `no spin-outs when steering (worst slide ${worst.toFixed(0)} deg)`);
}

// Steady cornering: full lock at 60 km/h should turn, not spin out or explode.
car.place(-2.4, -60, Math.PI);
car.vz = 16.7;
const yaw0 = car.yaw;
run(2, { throttle: 0.4, brake: 0, steer: 1, handbrake: false });
ok(Number.isFinite(car.x) && Math.abs(car.yaw - yaw0) > 0.8, `turns under full lock (yaw change ${(car.yaw - yaw0).toFixed(2)})`);

// Crash into a building: should stop at the wall, not pass through.
const c = w.chunk(16, 15);
const b = w.chunk(16, 16).buildings.find((x) => x.x1 - x.x0 > 20 && x.h > 20);
if (b) {
  car.place((b.x0 + b.x1) / 2, b.z1 + 12, 0);
  car.vz = -20;
  run(2, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  ok(car.z > b.z1 - 0.5, `stopped by building (car z ${car.z.toFixed(1)} vs wall ${b.z1.toFixed(1)})`);
}
void c;

// Spawn point is on the road and level.
car.place(SPAWN.x, SPAWN.z, SPAWN.yaw);
run(1, { throttle: 0, brake: 0, steer: 0, handbrake: false });
ok(Math.abs(car.vx) + Math.abs(car.vz) < 0.5, "car sits still at spawn");

// Traffic
const tr = new Traffic(w);
tr.max = 45;
let worst = 0, nan = 0, moved = 0;
const start = new Map();
for (let k = 0; k < 60 * 30; k++) {
  const t0 = performance.now();
  tr.update(1 / 30, null, 0, 0, 120, 470);
  worst = Math.max(worst, performance.now() - t0);
  for (const cc of tr.cars) {
    if (!Number.isFinite(cc.x) || !Number.isFinite(cc.z)) nan++;
    if (!start.has(cc)) start.set(cc, [cc.x, cc.z]);
  }
}
for (const [cc, [x, z]] of start) if (tr.cars.includes(cc) && Math.hypot(cc.x - x, cc.z - z) > 50) moved++;
const live = tr.cars.length;
console.log(`traffic: ${live} cars, ${moved} moved > 50 m, worst update ${worst.toFixed(2)} ms`);
ok(nan === 0, "no NaN traffic positions");
ok(live >= 30, "traffic fills up");
ok(moved / live > 0.5, "most traffic is moving");
const stopped = tr.cars.filter((cc) => cc.v < 0.5).length;
ok(stopped / live < 0.4, `few cars stuck (${stopped}/${live} stopped)`);
process.exit(bad ? 1 : 0);
