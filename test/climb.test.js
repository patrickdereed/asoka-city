// Walking up and down fire escapes and landmark stairs: a walker steered through each flight's
// ends must reach the roof and come back to the street.
import { World, NCH } from "../force-app/main/default/staticresources/AsokaCity/map.js";
import { Walker } from "../force-app/main/default/staticresources/AsokaCity/walker.js";

let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } else console.log("ok  ", m); };
const w = new World(7);

// The ends of a walk surface, low end first.
function ends(s) {
  const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
  if (s.ax === 1) return s.y0 <= s.y1 ? [[s.x0 + 0.2, cz], [s.x1 - 0.2, cz]] : [[s.x1 - 0.2, cz], [s.x0 + 0.2, cz]];
  if (s.ax === 2) return s.y0 <= s.y1 ? [[cx, s.z0 + 0.2], [cx, s.z1 - 0.2]] : [[cx, s.z1 - 0.2], [cx, s.z0 + 0.2]];
  return [[cx, cz]];
}

function walkTo(wk, pts) {
  for (const [x, z] of pts) {
    for (let t = 0; t < 1200; t++) {
      const dx = x - wk.x, dz = z - wk.z, d = Math.hypot(dx, dz);
      if (d < 0.15) break;
      wk.step(1 / 60, { mx: dx / d * Math.min(1, d), mz: dz / d * Math.min(1, d), run: false, face: null }, []);
    }
  }
}

// Route through a stairs() walk list: E0 landing, flight A, far landing, flight B, next E0 landing...
function route(walk, up) {
  const pts = [];
  for (const s of walk) pts.push(...ends(s));
  return up ? pts : pts.reverse();
}

let tried = 0, climbed = 0, back = 0;
for (let cz = 8; cz < NCH && tried < 12; cz++) for (let cx = 8; cx < NCH && tried < 12; cx++) {
  for (const b of w.chunk(cx, cz).buildings) {
    if (b.escape !== "escape" || tried >= 12) continue;
    tried++;
    const wk = new Walker(w);
    const first = b.escWalk[0];
    wk.place((first.x0 + first.x1) / 2, (first.z0 + first.z1) / 2, 0);
    walkTo(wk, route(b.escWalk, true));
    if (Math.abs(wk.y - (b.gy + b.h)) < 0.3) climbed++;
    walkTo(wk, route(b.escWalk, false));
    if (Math.abs(wk.y - w.height(wk.x, wk.z) - 0.15) < 0.4) back++;
    if (wk.fall) console.log("  fell taking damage", wk.fall.toFixed(0));
  }
}
ok(tried > 5 && climbed === tried, `fire escapes climbed to the roof: ${climbed}/${tried}`);
ok(back === tried, `and back down to the street: ${back}/${tried}`);

// Every landmark's prize stands on something you can reach.
for (const l of w.landmarks) {
  const wk = new Walker(w);
  const s = wk.support(l.prize.x, l.prize.z, l.prize.y + 0.1);
  ok(Math.abs(s.h - l.prize.y) < 0.35, `${l.name}: prize on a surface (${s.h.toFixed(1)} vs ${l.prize.y.toFixed(1)})`);
}
process.exit(bad ? 1 : 0);
