// The story and side quests, run from the data in story.js: contacts waiting on the map, briefings,
// objectives one step at a time (with markers, the route on the map, timers), passing and failing, rewards
// and saved progress. Step and place vocabulary: docs/missions-contract.md.
import * as THREE from "./three.module.min.js";
import { planRoute, snapRoad, HOSTILE } from "./actors.js";
import { TOWER, PLAZA, SPAWN, districtAt } from "./map.js";
import { WEAPON } from "./weapons.js";
import { clamp, hash2 } from "./util.js";

const PRONOUN = {
  "he/him": { they: "he", them: "him", their: "his", theyre: "he's" },
  "she/her": { they: "she", them: "her", their: "her", theyre: "she's" },
  "they/them": { they: "they", them: "them", their: "their", theyre: "they're" },
};
const SPEAKER_COL = { you: "#c9f0b8", asoka: "#ffc667" };
const strHash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; };

// ---------------------------------------------------------------------------------- markers

const BEAM_VS = /* glsl */ `varying float vH; void main() { vH = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const BEAM_FS = /* glsl */ `uniform vec3 uCol; uniform float uTime; varying float vH;
void main() { float a = pow(1. - clamp(vH, 0., 1.), 1.6) * (.55 + .12 * sin(uTime * 3. + vH * 9.)); gl_FragColor = vec4(pow(uCol, vec3(2.2)) * a * 1.6, 1.); }`;

class Markers {
  constructor(scene) {
    this.scene = scene;
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true).translate(0, 0.5, 0);
    this.ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);
    this.chevGeo = new THREE.ConeGeometry(0.38, 0.6, 4).rotateX(Math.PI);
    this.pool = [];
    this.used = 0;
    this.time = { value: 0 };
  }
  mat(col) {
    return new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(col) }, uTime: this.time }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }
  begin(t) { this.used = 0; this.time.value = t; }
  get(kind) {
    let m = this.pool[this.used];
    if (!m) {
      const g = new THREE.Group();
      const beam = new THREE.Mesh(this.beamGeo, this.mat("#ffc667"));
      const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: "#ffc667", transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      const chev = new THREE.Mesh(this.chevGeo, new THREE.MeshBasicMaterial({ color: "#ffc667" }));
      for (const o of [beam, ring, chev]) o.frustumCulled = false;
      g.add(beam, ring, chev);
      this.scene.add(g);
      m = { g, beam, ring, chev };
      this.pool.push(m);
    }
    this.used++;
    m.g.visible = true;
    m.beam.visible = kind === "beam"; m.ring.visible = kind === "beam"; m.chev.visible = kind === "chev";
    return m;
  }
  beam(x, y, z, r, col, h = 30) {
    const m = this.get("beam");
    m.g.position.set(x, y + 0.05, z);
    m.beam.scale.set(r, h, r); m.ring.scale.set(r, 1, r);
    m.beam.material.uniforms.uCol.value.set(col); m.ring.material.color.set(col);
  }
  chev(x, y, z, col) {
    const m = this.get("chev");
    m.g.position.set(x, y + 0.25 * Math.sin(this.time.value * 3), z);
    m.chev.rotation.y = this.time.value * 2;
    m.chev.material.color.set(col);
  }
  end() { for (let i = this.used; i < this.pool.length; i++) this.pool[i].g.visible = false; }
}

// ---------------------------------------------------------------------------------- missions

export class Missions {
  constructor(g, story) {
    this.g = g;
    this.story = story;
    this.CONTACTS = story.CONTACTS || {};
    this.MAIN = story.MAIN || [];
    this.SIDE = story.SIDE || [];
    const s = g.save;
    this.prog = s.story = Object.assign({ done: [], side: {}, unlocks: [], acts: [] }, s.story || {});
    this.cur = null;
    this.say = [];        // dialogue queue: { who, text, t }
    this.sayT = 0;
    this.markers = new Markers(g.scene);
    this.contactPeople = new Map();
    this.gpsT = 0;
    this.t = 0;
    this.retry = null;    // the mission to offer again after a failure
    this.roads = new Map();
    this.prompt = "";
  }

  // ---------------------------------------------------------------- availability

  isDone(id) { return this.prog.done.includes(id); }
  openMain() {
    return this.MAIN.filter((m, i) => !this.isDone(m.id) && (m.after ? m.after : i ? [this.MAIN[i - 1].id] : []).every((a) => this.isDone(a)));
  }
  // Side jobs stay open once you've finished them (paying half, round again from the first stage), all but
  // the collections: the bugs and the postcards are only there once.
  openSide() {
    return this.SIDE.filter((q) => (!q.open || this.isDone(q.open)) && ((this.prog.side[q.id] || 0) < q.stages.length || !ONCE.has(q.id)));
  }
  // Contacts with something to offer, and where to find them.
  offers() {
    const out = [];
    const byContact = new Map();
    for (const m of this.openMain()) if (!byContact.has(m.contact)) byContact.set(m.contact, m);
    for (const [cid, m] of byContact) {
      const p = this.place(`contact:${cid}`);
      out.push({ main: true, def: m, x: p.x, y: p.y, z: p.z, contact: cid, letter: (this.CONTACTS[cid]?.name || cid)[0].toUpperCase(), label: `${this.CONTACTS[cid]?.name || cid}: ${m.title}` });
    }
    for (const q of this.openSide()) {
      const at = q.at || `contact:${q.contact}`;
      const p = this.place(at, q.id);
      const n = this.prog.side[q.id] || 0, L = q.stages.length, again = n >= L;
      // Side jobs from a story contact wait a little to the side of them.
      const off = q.contact && byContact.has(q.contact) ? 4 : 0;
      out.push({ main: false, def: q, stage: n % L, again, x: p.x + off, y: p.y, z: p.z + off, contact: q.contact, letter: q.title[0].toUpperCase(), label: again ? `${q.title} (again, half pay)` : `${q.title} ${n + 1}/${L}` });
    }
    return out;
  }

  // ---------------------------------------------------------------- places

  // A place from the story to a point on the ground: { x, y, z, yaw? }.
  place(spec, salt = "") {
    const g = this.g, w = g.world;
    if (spec && typeof spec === "object") {
      if (spec.x != null) return { x: spec.x, y: spec.y ?? w.ground(spec.x, spec.z, 999), z: spec.z };
      const base = spec.near === "player" || !spec.near ? g.me() : this.place(spec.near, salt);
      const h = spec.rand ? Math.random() : hash2(strHash(String(salt)), strHash(JSON.stringify(spec)), 17);
      // Out at sea or off the end of an island there may be no road that far: come in closer.
      for (const d of [spec.d || 300, (spec.d || 300) * 0.6, (spec.d || 300) * 0.3, 40]) for (let k = 0; k < 8; k++) {
        const a = (h + k * 0.127) * Math.PI * 2;
        const r = snapRoad(w, base.x + Math.cos(a) * d, base.z + Math.sin(a) * d);
        if (!r || r.d > 60) continue;
        const p = w.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), r.e.laneOff[0], {});
        return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.tx, -p.tz) };
      }
      return { x: base.x, y: base.y, z: base.z };
    }
    const str = String(spec || "plaza");
    const ground = (x, z) => ({ x, y: w.ground(x, z, 999), z });
    // Out on Console Plaza in front of the tower, a short walk from the street.
    if (str === "tower") return ground(TOWER.x, PLAZA.z1 - 16);
    if (str === "plaza") return ground(PLAZA.cx, PLAZA.cz + 70);
    if (str === "spawn") return ground(SPAWN.x, SPAWN.z);
    if (str === "player") return g.me();
    const [kind, rest = ""] = str.split(":");
    if (kind === "contact") {
      const c = this.CONTACTS[rest];
      return c ? this.place(c.at, rest) : this.place("plaza");
    }
    if (kind === "site") {
      const [id, anchor] = rest.split(".");
      const site = w.sites && w.sites[id];
      if (site) {
        const a = anchor && site.anchors && site.anchors[anchor];
        if (a) return { x: a.x, y: a.y != null ? a.y : w.ground(a.x, a.z, 999), z: a.z };
        const a0 = site.anchors && (site.anchors.gate || site.anchors.door || site.anchors.office || Object.values(site.anchors)[0]);
        return a0 && !anchor ? { x: a0.x, y: a0.y ?? w.ground(a0.x, a0.z, 999), z: a0.z } : ground(site.x, site.z);
      }
      // Not built: somewhere on a road in its district.
      return this.place(`road:${SITE_DISTRICT[id] || "console"}/${strHash(rest) & 7}`);
    }
    if (kind === "landmark") {
      const [d, top] = rest.split(".");
      const l = w.landmarks.find((q) => q.district === d || q.id === d);
      if (!l) return this.place("plaza");
      if (top && l.prize) return { x: l.prize.x, y: l.prize.y, z: l.prize.z };
      // The way in: the nearest road to it.
      const r = snapRoad(w, l.x, l.z);
      if (r && r.d > 25) { const p = w.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), (r.e.hw + 3) * (hash2(l.x | 0, l.z | 0) < 0.5 ? 1 : -1), {}); return { x: p.x, y: w.ground(p.x, p.z, 999), z: p.z }; }
      return ground(l.x, l.z);
    }
    if (kind === "venue") {
      const [vk, d] = rest.split("@");
      const me = g.me();
      const list = w.venues.filter((v) => v.kind === vk && (!d || districtAt(v.x, v.z) === d));
      const v = d ? list[0] : list.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (!v) return this.place("plaza");
      return ground(v.x + v.nx * 3, v.z + v.nz * 3);
    }
    if (kind === "road") {
      const [d, n] = rest.split("/");
      const list = this.roadsIn(d);
      if (!list.length) return this.place("plaza");
      const k = Math.floor(hash2(strHash(d), +n || 0, 29) * list.length);
      const { e, s } = list[k];
      const p = w.edgePoint(e, s, e.laneOff[0], {});
      return { x: p.x, y: p.y, z: p.z, yaw: Math.atan2(-p.tx, -p.tz) };
    }
    return this.place("plaza");
  }

  // Main-road spots in a district, a few per street, in a fixed order.
  roadsIn(d) {
    if (this.roads.has(d)) return this.roads.get(d);
    const w = this.g.world, out = [];
    for (const e of w.edges) {
      if (!e.main || e.bridge) continue;
      for (let s = e.sA + 10; s < e.sB - 10; s += 60) {
        const p = w.edgePoint(e, s, 0, {});
        if (districtAt(p.x, p.z) === d && p.y - w.height(p.x, p.z) < 0.5) out.push({ e, s });
      }
    }
    this.roads.set(d, out);
    return out;
  }

  // ---------------------------------------------------------------- dialogue

  speaker(who) {
    if (who === "you") return { name: this.g.name() || "You", col: SPEAKER_COL.you };
    if (who === "asoka") return { name: "Asoka", col: SPEAKER_COL.asoka };
    const c = this.CONTACTS[who];
    return c ? { name: c.name, col: c.col || "#ffb08a" } : { name: who, col: "#d3e0e1" };
  }
  fill(text) {
    const P = PRONOUN[this.g.pronouns()] || PRONOUN["they/them"];
    let t = String(text).replace(/\{name\}/g, this.g.name() || "you");
    for (const k of ["theyre", "they", "them", "their"]) t = t.replace(new RegExp(`\\{${k}\\}`, "g"), P[k]);
    // Capitalise sentence starts the pronouns may have left lower case.
    return t.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }
  queue(lines) {
    for (const [who, text] of lines || []) this.say.push({ who, text: this.fill(text) });
  }
  get talking() { return this.say.length > 0; }

  // ---------------------------------------------------------------- running a mission

  // A contact's marker: E to start.
  start(offer) {
    const def = offer.main ? offer.def : offer.def.stages[offer.stage];
    const quest = offer.main ? null : offer.def;
    this.cur = { def, quest, stage: offer.stage, again: !!offer.again, i: -1, st: null, t: 0, kept: [], startAt: { x: offer.x, z: offer.z } };
    this.retry = null;
    const g = this.g;
    g.actors.release();
    // The contact stays where they were for the briefing, and is gone once you've left.
    for (const p of this.contactPeople.values()) p.release = true;
    this.contactPeople.clear();
    if (def.setHour != null) g.setHour(def.setHour);
    g.audit.suspended = def.heat === false;
    if (g.audit.level > 0 && def.heat === false) g.audit.set(0);
    const title = quest ? `${quest.title}${quest.stages.length > 1 ? ` · ${offer.stage + 1} of ${quest.stages.length}` : ""}` : def.title;
    const kicker = quest ? "Side job" : `Act ${def.act || this.actOf(def)} · ${this.MAIN.indexOf(def) + 1} of ${this.MAIN.length}`;
    g.hud.banner(kicker, quest && def.title ? def.title : title, quest ? title : "", 3.2);
    g.audio.cue("start");
    this.say = []; this.sayT = 0;
    this.queue(def.brief);
    this.next();
  }

  actOf(def) { return Math.floor(this.MAIN.indexOf(def) / 12) + 1; }

  next() {
    const c = this.cur;
    c.i++;
    if (c.i >= c.def.steps.length) { this.pass(); return; }
    const step = c.def.steps[c.i];
    c.st = { step, t: 0, left: step.time != null ? step.time : null, n: 0, hold: 0, spot: 0, out: 0, far: 0 };
    if (c.i > 0) this.g.audio.cue("step");
    this.queue(step.say);
    this.init(c.st);
  }

  // Everything a step needs resolved once, as it starts.
  init(st) {
    const s = st.step, g = this.g, A = g.actors, salt = `${this.cur.def.id || this.cur.quest?.id}:${this.cur.i}`;
    const at = (p, k = "") => this.place(p, salt + k);
    if (s.at) st.at = at(s.at);
    if (s.to) st.to = at(s.to, "to");
    switch (s.do) {
      case "spawn": {
        const jobs = [];
        (s.cars || []).forEach((c, k) => {
          const p = at(c.at || "player", `c${k}`);
          const car = A.spawnCar({ ...c, to: c.to ? at(c.to, `ct${k}`) : null, route: c.route ? c.route.map((q, j) => at(q, `r${j}`)) : null, keep: c.keep || (this.cur.def.keep || []).includes(c.tag) }, p.x, p.z, c.yaw != null ? c.yaw : p.yaw);
          if (car.race) car.race = car.race.slice();
        });
        (s.people || []).forEach((q, k) => {
          const p = at(q.at || "player", `p${k}`);
          jobs.push(A.spawnPeople({ ...q, keep: (this.cur.def.keep || []).includes(q.tag) }, p.x, p.z, p.yaw || 0).then((list) => {
            if (q.ride || q.team === "vip") for (const x of list) x.ride = true;
          }));
        });
        (s.items || []).forEach((it, k) => { const p = at(it.at || "player", `i${k}`); A.spawnItem({ ...it, y: p.y }, p.x, p.z); });
        st.wait = Promise.all(jobs).then(() => { st.ready = true; });
        break;
      }
      case "race": {
        st.route = (s.route || []).map((q, j) => at(q, `rr${j}`));
        st.cp = 0; st.count = 3;
        for (const tag of s.tags || []) for (const c of A.byTag(tag).cars) { c.race = st.route.slice(); c.path = null; c.ai = "park"; c.held = true; }
        A.raceProgress = () => st.cp / Math.max(1, st.route.length);
        A.onFinish = (c) => { if ((s.tags || []).includes(c.tag) && st.cp < st.route.length) st.lost = true; };
        break;
      }
      case "ride": for (const p of A.byTag(s.vip).people) p.ride = true; break;
      case "heat": g.audit.suspended = false; g.audit.set(s.level || 1); break;
      case "despawn": A.despawn(s.tags || []); break;
      case "defend": st.waves = (s.waves || []).map((wv) => ({ ...wv, sent: false })); break;
      case "photo": if (s.at) st.at = at(s.at); break;
      default: break;
    }
  }

  // Each frame: is the step done, has the mission failed?
  update(dt) {
    this.t += dt;
    const g = this.g;
    // Dialogue plays line by line.
    if (this.say.length) {
      const L = this.say[0];
      if (!L.shown) { L.shown = true; const sp = this.speaker(L.who); g.hud.say(sp.name, sp.col, L.text); this.sayT = 1.6 + L.text.length * 0.052; }
      this.sayT -= dt;
      if (this.sayT <= 0) { this.say.shift(); if (!this.say.length) g.hud.say(null); }
    }
    this.markers.begin(this.t);
    if (this.cur) this.tick(dt);
    else this.idle(dt);
    this.markers.end();
    g.hud.blips = g.actors.blips();
  }

  // No mission running: contacts wait at their markers.
  idle(dt) {
    const g = this.g, me = g.me();
    const offers = this.offers();
    g.hud.contacts = offers;
    g.hud.goal = null; g.hud.gps = null; g.hud.objective(null); g.hud.timer(null); g.hud.progress(null);
    this.prompt = "";
    let near = null, nd = Infinity;
    for (const o of offers) {
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d < 300) this.markers.beam(o.x, o.y, o.z, 1.3, o.main ? "#ff6018" : "#2f9e98", 14);
      if (d < 3.2 && Math.abs(o.y - me.y) < 3 && d < nd) { nd = d; near = o; }
    }
    // The contacts themselves, standing by their markers.
    const want = new Set();
    for (const o of offers) {
      if (!o.main || !o.contact) continue;
      const d = Math.hypot(o.x - me.x, o.z - me.z);
      if (d > 140) continue;
      want.add(o.contact);
      if (!this.contactPeople.has(o.contact) && !this.loadingContact) {
        const c = this.CONTACTS[o.contact];
        this.loadingContact = true;
        const a = hash2(strHash(o.contact), 3) * Math.PI * 2;
        g.actors.spawnPerson({ team: "civil", ai: "stand", look: c && c.look, blip: false }, o.x + Math.cos(a) * 2.2, o.z + Math.sin(a) * 2.2, Math.atan2(Math.cos(a), Math.sin(a)))
          .then((p) => { if (p) { p.contactId = o.contact; this.contactPeople.set(o.contact, p); p.hp = 1e9; } })
          .finally(() => { this.loadingContact = false; });
      }
    }
    for (const [id, p] of this.contactPeople) if (!want.has(id)) { g.actors.removePerson(p); this.contactPeople.delete(id); }
    if (near && !g.driving()) {
      this.prompt = near.main ? `<kbd>E</kbd> ${near.label}` : `<kbd>E</kbd> Side job: ${near.label}`;
      if (g.pressed("KeyE")) this.start(near);
    } else if (near && g.driving()) this.prompt = "Get out to talk";
    if (this.retry && g.pressed("KeyY")) { const r = this.retry; this.retry = null; g.teleport(r.startAt.x, r.startAt.z); this.start(r.offer); }
  }

  tick(dt) {
    const c = this.cur, st = c.st, s = st.step, g = this.g, A = g.actors, me = g.me();
    c.t += dt; st.t += dt;
    g.hud.contacts = [];
    let goal = null, text = s.text || "", sub = "";
    // Time limits.
    if (st.left != null) { st.left -= dt; g.hud.timer(st.left); if (st.left <= 0) return this.fail("Out of time."); } else g.hud.timer(null);
    // What must not be lost.
    for (const tag of c.def.keep || []) {
      const T = A.byTag(tag);
      if (T.people.some((p) => A.isDown(p)) || T.cars.some((x) => A.isDead(x))) return this.fail(`${this.label(tag)} was lost.`);
    }
    const tagged = (tags, fn) => { for (const t of tags || []) { const T = A.byTag(t); for (const p of T.people) fn(p, "p"); for (const x of T.cars) fn(x, "c"); for (const i of T.items) fn(i, "i"); } };
    const near = (p, r) => Math.hypot(p.x - me.x, p.z - me.z) < r && (p.y == null || Math.abs((p.y || 0) - me.y) < (p.y - g.world.height(p.x, p.z) > 2.5 ? 2.2 : 5));
    const inTagged = (tag) => g.driving() && g.carTag() === tag;
    const carOf = (tag) => A.byTag(tag).cars[0] || (g.carTag() === tag ? g.car() : null);
    let res = null;
    switch (s.do) {
      case "talk": if (!this.talking) res = "pass"; break;
      case "wait": if (st.t >= (s.time || 2)) res = "pass"; st.left = null; break;
      case "spawn": case "heat": case "despawn": if (s.do !== "spawn" || st.ready) res = "pass"; break;
      case "goto": {
        goal = st.at;
        const r = s.r || 6;
        this.markers.beam(goal.x, goal.y, goal.z, r * 0.5 + 0.6, "#ffc667");
        const carOK = s.car == null ? true : s.car === true ? g.driving() : s.car === false ? !g.driving() : inTagged(s.car);
        if (near(goal, r)) { if (carOK) res = "pass"; else sub = s.car === false ? "Get out of the car." : s.car === true ? "You need a car." : `You need the ${this.label(s.car)}.`; }
        if (typeof s.car === "string" && !inTagged(s.car)) { const x = carOf(s.car); if (x && !x.taken) { goal = x; this.markers.chev(x.x, x.y + 2.6, x.z, "#ffc667"); sub = sub || `Get back in the ${this.label(s.car)}.`; } }
        break;
      }
      case "enter": {
        const x = carOf(s.car);
        if (!x || A.isDead(x)) return this.fail(`The ${this.label(s.car)} was wrecked.`);
        if (inTagged(s.car)) res = "pass";
        else { goal = x; this.markers.chev(x.x, x.y + 2.6, x.z, "#ffc667"); }
        break;
      }
      case "kill": {
        let left = 0, total = 0, nearest = null, nd = Infinity;
        tagged(s.tags, (x, k) => {
          if (k === "i") return;
          total++;
          const down = k === "p" ? A.isDown(x) : A.isDead(x);
          if (down) return;
          left++;
          this.markers.chev(x.x, x.y + (k === "p" ? 2.3 : 2.6), x.z, "#e0453a");
          const d = Math.hypot(x.x - me.x, x.z - me.z);
          if (d < nd) { nd = d; nearest = x; }
        });
        if (total && !left && st.t > 0.5) res = "pass";
        if (nearest && nd > 60) goal = nearest;
        sub = total ? `${left} left` : "";
        break;
      }
      case "collect": {
        let left = 0, nearest = null, nd = Infinity;
        tagged(s.tags, (x, k) => {
          if (k !== "i" || x.taken) return;
          left++;
          this.markers.beam(x.x, x.y, x.z, 0.9, "#ffc667", 8);
          const d = Math.hypot(x.x - me.x, x.z - me.z);
          if (d < nd) { nd = d; nearest = x; }
        });
        const T = (s.tags || []).every((t) => A.byTag(t).items.length || A.carried.has(t));
        if (T && !left && st.t > 0.2) res = "pass";
        goal = nearest; sub = left > 1 ? `${left} left` : "";
        break;
      }
      case "deliver": {
        goal = st.to;
        const r = s.r || 6;
        let have = true;
        if (s.car) {
          const x = carOf(s.car);
          if (!x || A.isDead(x) || (g.carTag() === s.car && g.car().hp <= 0)) return this.fail(`The ${this.label(s.car)} was wrecked.`);
          if (!inTagged(s.car)) { have = false; if (!x.taken) { goal = x; this.markers.chev(x.x, x.y + 2.6, x.z, "#ffc667"); sub = `Get in the ${this.label(s.car)}.`; } }
        }
        if (s.item && !A.carried.has(s.item)) { have = false; const it = A.byTag(s.item).items.find((i) => !i.taken); if (it) { goal = it; this.markers.beam(it.x, it.y, it.z, 0.9, "#ffc667", 8); sub = "Pick it up first."; } }
        if (s.vip) {
          const v = A.byTag(s.vip).people;
          if (!v.length || v.some((p) => A.isDown(p))) return this.fail(`${this.label(s.vip)} didn't make it.`);
          const onboard = v.every((p) => p.riding) || (!g.driving() && v.every((p) => Math.hypot(p.x - me.x, p.z - me.z) < 8));
          if (!onboard) { have = false; goal = v[0]; this.markers.chev(v[0].x, v[0].y + 2.3, v[0].z, "#5fbf6a"); sub = g.driving() ? "Pull up next to them." : "They're following you."; }
        }
        if (have) { this.markers.beam(goal.x, goal.y, goal.z, r * 0.5 + 0.6, "#ffc667"); if (near(goal, r)) res = "pass"; }
        break;
      }
      case "ride": {
        const v = A.byTag(s.vip).people;
        if (!v.length && st.t > 3) { res = "pass"; break; }
        if (v.some((p) => A.isDown(p))) return this.fail(`${this.label(s.vip)} didn't make it.`);
        if (v.length && v.every((p) => p.riding)) res = "pass";
        else if (v.length) { goal = v[0]; this.markers.chev(v[0].x, v[0].y + 2.3, v[0].z, "#5fbf6a"); sub = g.driving() ? "Stop next to them." : "Get a car and pull up next to them."; }
        break;
      }
      case "tail": {
        const x = carOf(s.tag);
        if (!x || A.isDead(x)) return this.fail("They were wrecked: no way to follow them now.");
        goal = x; this.markers.chev(x.x, x.y + 2.6, x.z, "#ffc667");
        const d = Math.hypot(x.x - me.x, x.z - me.z);
        // A few seconds' grace to catch up before they're gone.
        if (d > (s.max || 160)) { st.far += dt; sub = "Catch up!"; if (st.far > 6) return this.fail("You lost them."); } else st.far = 0;
        if (d < (s.min || 15)) { st.spot += dt; sub = "Too close: back off."; if (st.spot > 4) return this.fail("They spotted you."); } else st.spot = Math.max(0, st.spot - dt * 0.5);
        if (x.arrived) res = "pass";
        break;
      }
      case "chase": {
        const x = carOf(s.tag);
        if (!x) { res = "pass"; break; }
        goal = x; this.markers.chev(x.x, x.y + 2.6, x.z, "#e0453a");
        if (A.carOut(x)) res = "pass";
        else if (Math.hypot(x.x - me.x, x.z - me.z) > (s.escape || 500)) { st.far += dt; if (st.far > 5) return this.fail("They got away."); } else st.far = 0;
        sub = `${Math.round(Math.hypot(x.x - me.x, x.z - me.z))} m`;
        break;
      }
      case "escort": {
        const x = carOf(s.tag);
        if (!x || A.isDead(x)) return this.fail(`The ${this.label(s.tag)} was destroyed.`);
        goal = x.arrived ? null : x; this.markers.chev(x.x, x.y + 2.6, x.z, "#5fbf6a");
        if (Math.hypot(x.x - me.x, x.z - me.z) > (s.max || 200)) { st.far += dt; sub = "Catch up with them!"; if (st.far > 8) return this.fail("You fell too far behind."); } else st.far = 0;
        if (x.arrived) res = "pass";
        break;
      }
      case "race": {
        const R = st.route;
        if (st.count > 0) {
          st.count -= dt;
          sub = st.count > 0 ? `${Math.ceil(st.count)}` : "Go!";
          if (st.count <= 0) for (const tag of s.tags || []) for (const x of A.byTag(tag).cars) { x.ai = "race"; x.held = false; }
        }
        if (st.lost) return this.fail("You lost the race.");
        const cp = R[st.cp];
        if (cp) {
          goal = cp;
          this.markers.beam(cp.x, cp.y, cp.z, 5, st.cp === R.length - 1 ? "#fffdf9" : "#ffc667", 18);
          const nx = R[st.cp + 1]; if (nx) this.markers.beam(nx.x, nx.y, nx.z, 3, "#ffc667", 8);
          if (st.count <= 0 && Math.hypot(cp.x - me.x, cp.z - me.z) < 11) { st.cp++; g.audio.cue("step"); }
          if (st.count <= 0) sub = `Checkpoint ${Math.min(st.cp + 1, R.length)} of ${R.length}`;
        } else res = "pass";
        break;
      }
      case "defend": {
        goal = st.at;
        const r = s.r || 35;
        this.markers.beam(st.at.x, st.at.y, st.at.z, r, "#ffc667", 2);
        for (const wv of st.waves) {
          if (wv.sent || st.t < (wv.t || 0)) continue;
          wv.sent = true;
          (wv.people || []).forEach((q, k) => {
            const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 20;
            const p = q.at ? this.place(q.at, `${this.cur.i}w${k}`) : { x: st.at.x + Math.cos(a) * d, z: st.at.z + Math.sin(a) * d };
            A.spawnPeople({ ai: "attack", ...q }, p.x, p.z, 0);
          });
        }
        if (Math.hypot(st.at.x - me.x, st.at.z - me.z) > r) { st.out += dt; sub = "Get back to the spot!"; if (st.out > 10) return this.fail("You left your post."); } else st.out = 0;
        const T = s.time || 60;
        if (st.left == null) g.hud.timer(T - st.t);
        if (st.t >= T) res = "pass";
        break;
      }
      case "hold": {
        goal = st.at;
        const r = s.r || 3;
        this.markers.beam(st.at.x, st.at.y, st.at.z, r * 0.6, "#ffc667", 6);
        if (near(st.at, r) && !g.driving()) st.hold += dt; else if (st.hold > 0) sub = "Stay on the spot.";
        g.hud.progress(st.hold / (s.time || 5));
        if (st.hold >= (s.time || 5)) { g.hud.progress(null); res = "pass"; }
        break;
      }
      case "photo": {
        let tgt = st.at;
        if (s.tag) { const T = A.byTag(s.tag); tgt = T.people[0] || T.cars[0] || null; if (tgt) tgt = { x: tgt.x, y: tgt.y + 1.2, z: tgt.z }; }
        if (!tgt) { res = "pass"; break; }
        goal = tgt;
        const look = tgt.y != null ? tgt : { ...tgt, y: g.world.ground(tgt.x, tgt.z, 999) + 2 };
        this.markers.chev(look.x, look.y + 1.8, look.z, "#ffc667");
        const aim = g.aim();
        const range = s.range || 60;
        let on = false;
        if (aim && aim.aiming && !g.driving()) {
          const d = new THREE.Vector3(look.x - aim.from.x, look.y - aim.from.y, look.z - aim.from.z);
          const L = d.length();
          on = L < range && d.normalize().dot(aim.dir) > Math.cos(Math.max(0.05, Math.atan2(4, L)));
        }
        if (on) st.hold += dt; else st.hold = Math.max(0, st.hold - dt);
        g.hud.progress(st.hold > 0 ? st.hold / 1.5 : null);
        sub = Math.hypot(look.x - me.x, look.z - me.z) > range ? "Get closer." : "Aim at it (right mouse) and hold steady.";
        if (st.hold >= 1.5) { g.hud.progress(null); res = "pass"; }
        break;
      }
      case "lose": if (g.audit.level === 0) res = "pass"; else sub = g.audit.seen ? "They can see you." : "Stay out of sight."; break;
      case "buy": {
        if (g.save.weapons[s.weapon]) { res = "pass"; break; }
        const p = this.place("venue:arms");
        goal = p;
        this.markers.beam(p.x, p.y, p.z, 1.5, "#ff6018", 14);
        sub = WEAPON[s.weapon] ? `${WEAPON[s.weapon].name} at Breakpoint Arms` : "";
        break;
      }
      default: res = "pass";
    }
    // Hold the mission's own people and cars in markers too.
    if (res === "pass") { this.next(); return; }
    if (typeof res === "string" && res.startsWith("fail")) return this.fail(res.slice(5));
    g.hud.objective(text ? this.fill(text) : null, sub);
    if (s.do !== "defend" && st.left == null && s.do !== "race") g.hud.timer(null);
    if (s.do !== "hold" && s.do !== "photo") g.hud.progress(null);
    g.hud.goal = goal ? { x: goal.x, z: goal.z } : null;
    // The route there, refreshed every couple of seconds.
    this.gpsT -= dt;
    if (goal && this.gpsT <= 0) {
      this.gpsT = 2;
      g.hud.gps = Math.hypot(goal.x - me.x, goal.z - me.z) > 60 && g.driving() ? planRoute(g.world, me, goal) : null;
    }
    if (!goal) g.hud.gps = null;
  }

  label(tag) {
    const t = String(tag || "").replace(/[_-]+/g, " ").replace(/\d+$/, "").trim();
    return t ? t[0].toUpperCase() + t.slice(1) : "It";
  }

  // ---------------------------------------------------------------- endings

  pass() {
    const c = this.cur, g = this.g, def = c.def;
    this.cur = null;
    const reward = Math.round(((def.reward || 0) * (c.again ? 0.5 : 1)) / 50) * 50;
    if (reward) g.earn(reward);
    if (c.quest) this.prog.side[c.quest.id] = (this.prog.side[c.quest.id] || 0) + 1;
    else if (!this.prog.done.includes(def.id)) this.prog.done.push(def.id);
    for (const u of def.unlock || []) if (!this.prog.unlocks.includes(u)) this.prog.unlocks.push(u);
    g.audit.suspended = false;
    g.actors.release();
    this.queue(def.outro);
    g.hud.objective(null); g.hud.timer(null); g.hud.progress(null); g.hud.goal = null; g.hud.gps = null;
    const questDone = c.quest && !c.again && this.prog.side[c.quest.id] === c.quest.stages.length;
    g.hud.banner(questDone ? `${c.quest.title} complete` : "Mission passed", reward ? `+$${reward.toLocaleString("en-US")}` : "Done", (def.unlock || []).length ? `New at Breakpoint Arms: ${def.unlock.map((u) => WEAPON[u]?.name || u).join(", ")}` : "", 4.5, "pass");
    g.audio.cue("pass");
    // A new act.
    if (!c.quest) {
      const act = this.actOf(def);
      const all = this.MAIN.filter((m) => this.actOf(m) === act).every((m) => this.isDone(m.id));
      const A = this.story.ACTS || [];
      if (all && !this.prog.acts.includes(act)) {
        this.prog.acts.push(act);
        const nx = A[act];
        setTimeout(() => {
          if (this.cur) return;
          if (nx) g.hud.banner(`Act ${nx.n || act + 1}`, nx.title, nx.blurb || "", 6, "act");
          else g.hud.banner("Go-Live", "The end", "Asoka City is live. Thanks for playing. The city is yours: side jobs and landmarks are still out there.", 8, "act");
        }, 5200);
      }
    }
    g.saveNow();
  }

  fail(reason) {
    const c = this.cur, g = this.g;
    if (!c) return;
    this.cur = null;
    g.audit.suspended = false;
    g.actors.release();
    this.say = []; g.hud.say(null);
    g.hud.objective(null); g.hud.timer(null); g.hud.progress(null); g.hud.goal = null; g.hud.gps = null;
    this.retry = { offer: c.quest ? { main: false, def: c.quest, stage: c.stage, again: c.again } : { main: true, def: c.def }, startAt: c.startAt };
    g.hud.banner("Mission failed", reason || "", "Press Y to try again", 6, "fail");
    g.audio.cue("fail");
    setTimeout(() => { if (this.retry && !this.cur) g.hud.toast("Press Y to retry the mission.", 4); }, 6000);
    setTimeout(() => { if (!this.cur) this.retry = null; }, 30000);
  }

  // The player was knocked out or audited.
  playerDown(why) { if (this.cur) this.fail(why); }

  // For testing: finish the current step at once.
  skipStep() { if (this.cur) this.next(); }
}

const ONCE = new Set(["s05", "s12"]);
const SITE_DISTRICT = { brittle_hq: "preview", audit_hq: "meridian", legacy_yard: "docks", datacenter: "hills", garage: "uptown", club: "cadence", motel: "gardens" };
export { HOSTILE };
