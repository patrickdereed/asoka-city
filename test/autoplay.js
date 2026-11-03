// Browser smoke test for the story: paste into the console of the local page (node test/serve.mjs) once the
// game is running, or load it from the test harness. Each mission is started and every step satisfied by
// cheating (teleporting, knocking targets down, marking arrivals), checking the engine runs every step type
// in every mission without throwing and reaches "Mission passed". Results land in window.__autoplay.
window.autoplay = async function autoplay(ids, opts = {}) {
  const a = window.__ac, M = a.missions, A = a.actors;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = [];
  const errors = [];
  const onErr = (e) => errors.push(String(e.message || e));
  window.addEventListener("error", onErr);
  window.__fails = [];
  if (!M._f) { M._f = M.fail.bind(M); M.fail = (r) => { window.__fails.push([M.cur?.def.id || M.cur?.quest?.id, M.cur?.i, M.cur?.st.step.do, r]); return M._f(r); }; }
  const footAt = async (x, z, y) => {
    if (a.mode === "drive") { a.player.vx = a.player.vz = 0; a.toggleFoot(); await sleep(1100); }
    a.walker.place(x, z, 0, y);
  };
  const carAt = async (x, z) => {
    if (a.mode !== "drive") { a.walker.place(a.player.x + 2.4, a.player.z, 0); await sleep(150); a.toggleFoot(); await sleep(2300); }
    const P = a.player; P.x = x; P.z = z; P.vx = P.vz = 0; P.y = a.world.ground(x, z, 999);
  };
  const list = ids || [...M.MAIN.map((m) => m.id), ...M.SIDE.flatMap((q) => q.stages.map((_, k) => `${q.id}#${k}`))];
  for (const id of list) {
    const [qid, k] = id.split("#");
    errors.length = 0;
    a.audit.set(0);
    a.save.hp = 100;
    // Start where a player would: at the contact's marker.
    const def = M.MAIN.find((m) => m.id === qid) || M.SIDE.find((q) => q.id === qid);
    const cp = M.place(def.at || (def.contact ? `contact:${def.contact}` : "plaza"), qid);
    await footAt(cp.x, cp.z, cp.y);
    const r0 = a.world.nearestRoad(cp.x, cp.z);
    if (r0) { const p = a.world.edgePoint(r0.e, r0.s, r0.e.laneOff[0], {}); a.player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); }
    await sleep(300);
    const fails0 = (window.__fails || []).length;
    try { a.startMission(qid, +k || 0); } catch (e) { out.push([id, "start threw", String(e)]); continue; }
    let guard = 0, last = -1, same = 0;
    while (M.cur && guard++ < 400) {
      const c = M.cur, st = c.st, s = st.step;
      if (c.i === last) same++; else { same = 0; last = c.i; }
      if (same > 25) { out.push([id, `stuck at step ${c.i} ${s.do}`]); M.fail("autoplay: stuck"); break; }
      M.say = [];
      const goal = st.at || st.to;
      const T = (t) => A.byTag(t);
      switch (s.do) {
        case "goto": case "hold": case "defend":
          if (s.car === false || s.do !== "goto") await footAt(goal.x, goal.z, goal.y);
          else if (typeof s.car === "string") { const x = T(s.car).cars[0]; if (x && a.carTag !== s.car) { a.takeCar(x); await sleep(200); } await carAt(goal.x, goal.z); }
          else if (s.car === true) await carAt(goal.x, goal.z);
          else await footAt(goal.x, goal.z, goal.y);
          if (s.do !== "goto") st.t = 1e4, st.hold = 1e4;
          break;
        case "enter": { const x = T(s.car).cars[0]; if (x) a.takeCar(x); break; }
        case "kill": for (const t of s.tags) { for (const p of T(t).people) if (!p.downT) a.crowd.knock(p, p.x + 1, p.z, true); for (const x of T(t).cars) a.combat.damageCar(x, 1e5, x); } break;
        case "collect": for (const t of s.tags) for (const it of T(t).items) if (!it.taken) { it.taken = true; A.carried.add(t); } break;
        case "deliver":
          if (s.item) A.carried.add(s.item);
          if (s.vip) for (const p of T(s.vip).people) if (!p.riding) A.board(p);
          if (s.car) { const x = T(s.car).cars[0]; if (x && a.carTag !== s.car) { a.takeCar(x); await sleep(200); } }
          if (s.car || s.vip) await carAt(goal.x, goal.z); else await footAt(goal.x, goal.z, goal.y);
          break;
        case "ride": for (const p of T(s.vip).people) { if (a.mode !== "drive") await carAt(p.x + 3, p.z); A.board(p); } break;
        case "tail": case "escort": for (const x of T(s.tag).cars) { x.arrived = true; await carAt(x.x + 30, x.z); } break;
        case "chase": for (const x of T(s.tag).cars) x.disabled = true; break;
        case "race": if (st.route) st.cp = st.route.length; break;
        case "photo": case "talk": case "wait": M.skipStep(); break;
        case "lose": a.audit.set(0); break;
        case "buy": a.arsenal.give(s.weapon); break;
        default: break;
      }
      await sleep(opts.dt || 220);
    }
    const passed = M.prog.done.includes(qid) || (M.prog.side[qid] || 0) > (+k || 0);
    const why = (window.__fails || []).slice(fails0).map((f) => `step ${f[1]} ${f[2]}: ${f[3]}`);
    out.push([id, passed ? "passed" : M.cur ? "running" : "failed", ...why, ...errors.slice(0, 2)]);
    if (M.cur) M.fail("autoplay: timeout");
    M.retry = null;
    await sleep(300);
  }
  window.removeEventListener("error", onErr);
  window.__autoplay = out;
  return out;
};
