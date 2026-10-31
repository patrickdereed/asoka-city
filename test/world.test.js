// World generation: timing, determinism, network connectivity, spawn and causeways.
import { World, NCH, SPAWN, shoreDist, districtAt } from "../force-app/main/default/staticresources/AsokaCity/map.js";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } else console.log("ok  ", m); };

let t = performance.now();
const w = new World(7);
const tw = performance.now() - t;
console.log(`world built in ${tw.toFixed(0)} ms: ${w.nodes.length} nodes, ${w.edges.length} edges`);
ok(tw < 4000, "world builds in under 4 s");
const main = w.edges.filter((e) => e.main);
ok(main.length / w.edges.length > 0.95, `main network has ${main.length}/${w.edges.length} edges`);
const km = main.reduce((a, e) => a + e.len, 0) / 1000;
console.log(`road length ${km.toFixed(0)} km, bridges ${w.edges.filter((e) => e.bridge).length}`);
for (const d of ["scratch", "sandbox", "preview", "hills", "docks", "meridian", "park", "gardens", "cadence", "console", "uptown"]) {
  ok(w.nodes.some((n) => n.main && districtAt(n.x, n.z) === d), `${d} is on the main network`);
}
const sp = w.nearestRoad(SPAWN.x, SPAWN.z);
ok(sp && sp.d < 4, `spawn is on a road (d=${sp && sp.d.toFixed(1)})`);

t = performance.now();
let nb = 0, np = 0, worst = 0;
for (let cz = 0; cz < NCH; cz++) for (let cx = 0; cx < NCH; cx++) {
  const t0 = performance.now();
  const c = w.chunk(cx, cz);
  worst = Math.max(worst, performance.now() - t0);
  nb += c.buildings.length; np += c.props.length;
}
console.log(`all ${NCH * NCH} chunks in ${(performance.now() - t).toFixed(0)} ms (worst ${worst.toFixed(1)} ms): ${nb} buildings, ${np} props`);
ok(worst < 60, "worst chunk under 60 ms");

let overlaps = 0;
for (let cz = 0; cz < NCH; cz++) for (let cx = 0; cx < NCH; cx++) {
  const c = w.chunk(cx, cz);
  for (const b of c.buildings) for (const { e, i } of c.segs) {
    const p = e.rib[i];
    const px = Math.max(b.x0, Math.min(b.x1, p.x)), pz = Math.max(b.z0, Math.min(b.z1, p.z));
    if (Math.hypot(px - p.x, pz - p.z) < e.hw - 0.5) { overlaps++; break; }
  }
}
ok(overlaps === 0, `buildings overlapping roads: ${overlaps}`);

const w2 = new World(7);
ok(w2.edges.length === w.edges.length && w2.chunk(16, 15).buildings.length === w.chunk(16, 15).buildings.length, "same seed, same world");

const g = w.ground(1700, -252, 10);
ok(Math.abs(g - 4.58) < 0.3 && w.onDeck, `causeway deck over the bay (y=${g.toFixed(2)})`);
ok(shoreDist(1700, -256) < 0, "bay is water under the causeway");
process.exit(bad ? 1 : 0);
