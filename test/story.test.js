// The story against the real city: every place in every mission resolves to somewhere sensible, cars spawn
// on roads, drives have a route, and dialogue fills in cleanly for every pronoun choice.
import * as THREE from "../force-app/main/default/staticresources/AsokaCity/three.module.min.js";
import { World, HALF } from "../force-app/main/default/staticresources/AsokaCity/map.js";
import { Missions } from "../force-app/main/default/staticresources/AsokaCity/missions.js";
import { planRoute, snapRoad } from "../force-app/main/default/staticresources/AsokaCity/actors.js";
import * as story from "../force-app/main/default/staticresources/AsokaCity/story.js";

let bad = 0, warn = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } return c; };
const note = (m) => { warn++; if (warn <= 30) console.log("warn", m); };

const w = new World(7);
let at = { x: 0, y: 0, z: 0 }, pron = "they/them";
const g = { world: w, save: {}, scene: new THREE.Scene(), me: () => at, name: () => "Sam", pronouns: () => pron };
const M = new Missions(g, story);

ok(story.MAIN.length === 60, `60 main missions (${story.MAIN.length})`);
ok(story.SIDE.length === 12, `12 side quests (${story.SIDE.length})`);
for (const id of ["brittle_hq", "audit_hq", "legacy_yard", "datacenter", "garage", "club", "motel"]) if (!w.sites || !w.sites[id]) note(`site ${id} not built: places fall back to a road`);

const onMap = (p) => p && isFinite(p.x) && isFinite(p.z) && Math.abs(p.x) < HALF && Math.abs(p.z) < HALF && isFinite(p.y);
const speakers = new Set([...Object.keys(story.CONTACTS), "you", "asoka"]);
let places = 0, routes = 0;
const lines = [];

function check(def, label) {
  const cp = M.place(def.contact ? `contact:${def.contact}` : def.at || "plaza");
  at = cp;
  for (const L of [...(def.brief || []), ...(def.outro || [])]) lines.push(L);
  def.steps.forEach((s, i) => {
    const salt = `${label}:${i}`;
    for (const L of s.say || []) lines.push(L);
    const P = (spec, k, why, opts = {}) => {
      const p = M.place(spec, salt + k);
      places++;
      if (!ok(onMap(p), `${label} step ${i} ${why}: ${JSON.stringify(spec)} resolves on the map`)) return p;
      const high = p.y - w.height(p.x, p.z) > 2.5;
      const r = snapRoad(w, p.x, p.z);
      if (opts.car && !(r && r.d < 30)) note(`${label} step ${i} ${why} ${JSON.stringify(spec)}: car spawns ${r ? r.d.toFixed(0) : "?"} m from a road`);
      if (opts.drive && !high) {
        const R = planRoute(w, at, p);
        routes++;
        const end = R[R.length - 1];
        if (!end || Math.hypot(end.x - p.x, end.z - p.z) > 80) note(`${label} step ${i} ${why}: route ends ${end ? Math.hypot(end.x - p.x, end.z - p.z).toFixed(0) : "?"} m short`);
      }
      return p;
    };
    if (s.at) { const p = P(s.at, "", s.do, { drive: s.car !== false }); if (s.do === "goto" || s.do === "hold" || s.do === "defend") at = p; }
    if (s.to) { at = P(s.to, "to", `${s.do} to`, { drive: true }); }
    (s.route || []).forEach((q, j) => { at = P(q, `rr${j}`, `race checkpoint ${j}`, { drive: true }); });
    (s.cars || []).forEach((c, k) => {
      P(c.at || "player", `c${k}`, `car ${c.tag}`, { car: true });
      if (c.to) P(c.to, `ct${k}`, `car ${c.tag} to`, { drive: true });
      (c.route || []).forEach((q, j) => P(q, `r${j}`, `car ${c.tag} route ${j}`));
    });
    (s.people || []).forEach((q, k) => P(q.at || "player", `p${k}`, `people ${q.tag}`));
    (s.items || []).forEach((it, k) => P(it.at || "player", `i${k}`, `item ${it.tag}`));
    for (const wv of s.waves || []) (wv.people || []).forEach((q, k) => { if (q.at) P(q.at, `w${k}`, "wave"); });
  });
}

for (const m of story.MAIN) check(m, m.id);
for (const q of story.SIDE) q.stages.forEach((st, k) => check({ ...st, contact: q.contact, at: q.at }, `${q.id}/${k + 1}`));
console.log(`ok   ${places} places resolved, ${routes} routes planned`);

let unknown = 0, leftovers = 0;
for (const [who, text] of lines) {
  if (!speakers.has(who) && !(typeof who === "string" && who.length < 24)) unknown++;
  for (const p of ["he/him", "she/her", "they/them"]) { pron = p; if (/[{}]/.test(M.fill(text))) leftovers++; }
}
ok(unknown === 0, `every speaker is known or a short label (${unknown} not)`);
ok(leftovers === 0, `dialogue fills in for every pronoun choice (${leftovers} lines left a token)`);
console.log(`ok   ${lines.length} lines of dialogue`);

console.log(bad ? `${bad} failed, ${warn} warnings` : `all passed, ${warn} warnings`);
process.exit(bad ? 1 : 0);
