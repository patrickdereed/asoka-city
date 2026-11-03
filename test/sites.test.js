// Mission sites: every one the story names is built, its anchors stand on something walkable, and the
// ones on the ground are near a main road.
import { World, districtAt } from "../force-app/main/default/staticresources/AsokaCity/map.js";
import { Walker } from "../force-app/main/default/staticresources/AsokaCity/walker.js";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } else console.log("ok  ", m); };

const w = new World(7);
const walker = new Walker(w);
const WANT = {
  brittle_hq: ["preview", ["gate", "plaza", "lobby", "garage", "roof"]],
  audit_hq: ["meridian", ["gate", "yard", "roof", "cells"]],
  legacy_yard: ["docks", ["gate", "yard", "office", "tower", "dock"]],
  datacenter: ["hills", ["gate", "hall", "roof", "generators"]],
  garage: ["uptown", ["door", "lot"]],
  club: ["cadence", ["door", "alley", "roof", "stage"]],
  motel: ["gardens", ["office", "room", "lot"]],
};
const HIGH = new Set(["roof", "tower", "stage", "room"]);

for (const [id, [dist, anchors]] of Object.entries(WANT)) {
  const s = w.sites[id];
  ok(!!s, `${id} is built`);
  if (!s) continue;
  ok(districtAt(s.x, s.z) === dist, `${id} is in ${dist} (${Math.round(s.x)}, ${Math.round(s.z)})`);
  ok(JSON.stringify(Object.keys(s.anchors).sort()) === JSON.stringify(anchors.slice().sort()), `${id} has anchors ${anchors.join(", ")}`);
  for (const name of anchors) {
    const a = s.anchors[name];
    if (!a) continue;
    // Whatever the walker would stand on at that point, from just above it.
    const sup = walker.support(a.x, a.z, a.y + 0.3);
    ok(Math.abs(sup.h - a.y) < 0.35 && !sup.water, `${id}.${name} stands on something (anchor y ${a.y.toFixed(2)}, support ${sup.h.toFixed(2)})`);
    if (!HIGH.has(name)) {
      const r = w.nearestRoad(a.x, a.z);
      ok(r && r.d < 60, `${id}.${name} is ${r ? r.d.toFixed(0) : "?"} m from a main road`);
    }
  }
}

// Sites keep clear of the shops, homes, landmarks and cash envelopes.
const over = (a, b, pad) => a.x1 > b.x0 - pad && a.x0 < b.x1 + pad && a.z1 > b.z0 - pad && a.z0 < b.z1 + pad;
const zones = Object.values(w.sites).map((s) => s.zone);
ok(!zones.some((z) => w.venues.some((v) => over(z, v, 4))), "no site overlaps a venue");
ok(!zones.some((z) => w.landmarks.some((l) => over(z, l.zone, 2))), "no site overlaps a landmark");
ok(!zones.some((z, i) => zones.some((q, j) => i !== j && over(z, q, 0))), "sites don't overlap each other");
ok(!zones.some((z) => w.pickups.some((p) => p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1)), "no cash envelope inside a site");

// The roofs are reachable: walk up each site's stairs from the ground to the roof anchor.
function climb(site, to, from) {
  // Breadth-first over a 0.5 m grid of walkable points, stepping at most 0.6 m up and 1 m down.
  const key = (x, z, y) => `${Math.round(x * 2)},${Math.round(z * 2)},${Math.round(y * 2)}`;
  const seen = new Set();
  let q = [[from.x, from.z, from.y]];
  const Z = site.zone;
  for (let it = 0; it < 4000 && q.length; it++) {
    const next = [];
    for (const [x, z, y] of q) {
      if (Math.hypot(x - to.x, z - to.z) < 2 && Math.abs(y - to.y) < 0.5) return true;
      for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < Z.x0 - 8 || nx > Z.x1 + 8 || nz < Z.z0 - 8 || nz > Z.z1 + 8) continue;
        const s = walker.support(nx, nz, y);
        if (s.water || s.h < y - 1 || s.h > y + 0.6) continue;
        // Walls: a solid box above the step height blocks the way.
        const c = w.chunk(Math.floor((nx + 4096) / 256), Math.floor((nz + 4096) / 256));
        const k = Math.max(0, Math.min(7, Math.floor((nx - c.x0) / 32))) + Math.max(0, Math.min(7, Math.floor((nz - c.z0) / 32))) * 8;
        if (c.grid[k].some((o) => o.r == null && o.y1 != null && nx > o.x0 && nx < o.x1 && nz > o.z0 && nz < o.z1 && o.y1 > s.h + 0.6)) continue;
        const kk = key(nx, nz, s.h);
        if (seen.has(kk)) continue;
        seen.add(kk);
        next.push([nx, nz, s.h]);
      }
    }
    q = next;
  }
  return false;
}
for (const [id, from, to] of [["brittle_hq", "garage", "roof"], ["audit_hq", "gate", "roof"], ["legacy_yard", "yard", "tower"], ["datacenter", "gate", "roof"], ["club", "alley", "stage"], ["motel", "lot", "room"]]) {
  const s = w.sites[id];
  if (!s) continue;
  ok(climb(s, s.anchors[to], s.anchors[from]), `${id}: ${from} to ${to} on foot`);
}

if (bad) { console.log(`${bad} failed`); process.exit(1); }
