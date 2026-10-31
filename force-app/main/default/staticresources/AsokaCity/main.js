// Go-Live: Asoka City. Entry point: loading, title screen, main loop, camera and car lights.
import * as THREE from "./three.module.min.js";
import { World, SPAWN, HALF, CHUNK, NCH, TOWER, PLAZA, districtAt } from "./map.js";
import { Crowd, Person, PEOPLE } from "./people.js";
import { Walker } from "./walker.js";
import { makeUniforms, makeMaterials, makeSky, makeSea, makeSignTexture, makeSignMaterial, buildTower, CityView, applyTimeOfDay, glowGeometry, setGlow, KIT_PARKED } from "./render.js";
import { Vehicle, DT } from "./vehicle.js";
import { Traffic } from "./traffic.js";
import { CAR_TYPES, PLAYER_CAR, trafficGeometry, playerGeometry, wheelGeometry } from "./cars.js";
import { HUD, BigMap, drawMapImage } from "./hud.js";
import { loadKits, asokaLivery, PLAYER_KIT } from "./carkits.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";
import { clamp, lerp, angleWrap, hex } from "./util.js";
import { Post } from "./post.js";
import { SunShadow } from "./shadow.js";

THREE.ColorManagement.enabled = false;

const QUALITY = {
  low: { radius: 4, near: 2.0, ratio: 1, traffic: 22, shadow: 0, msaa: 0, bloom: true, crowd: 10 },
  medium: { radius: 5, near: 2.4, ratio: 1.25, traffic: 32, shadow: 2048, msaa: 4, bloom: true, crowd: 24 },
  high: { radius: 7, near: 2.8, ratio: 2, traffic: 44, shadow: 4096, msaa: 4, bloom: true, crowd: 36 },
};
const SAVE_KEY = `asokacity.${window.AC_USER || "local"}`;

const $ = (id) => document.getElementById(id);
const ui = $("ui"), loading = $("loading");
const prefs = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ } };
prefs.quality = prefs.quality || "medium";

const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x182b2e);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.8, 9000);
camera.rotation.order = "YXZ";

function resize() {
  const q = QUALITY[prefs.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (post) {
    const v = renderer.getDrawingBufferSize(new THREE.Vector2());
    post.setSize(v.x, v.y, q.msaa);
  }
}
addEventListener("resize", resize);

function setLoading(msg) { loading.classList.remove("hidden"); loading.innerHTML = `<div class="ld"><span class="ld-mark"></span><b>${msg}</b></div>`; }
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

const LOGO = `<svg viewBox="0 0 100 90" class="logo" aria-hidden="true"><path d="M50 2 L98 88 L2 88 Z" fill="currentColor"/><circle cx="50" cy="61" r="19" fill="none" stroke="var(--cream)" stroke-width="7"/></svg>`;

let world, U, mats, city, sky, sea, hud, bigmap, input, audio, traffic, player, post, shadow, exposure = 1;
let crowd, walker, me = null, mode = "drive", creatorLook = 0;
const PRONOUNS = { man: "he/him", woman: "she/her", nonbinary: "they/them" };
prefs.character = prefs.character || null;
let playerMesh, wheels = [], trafficMeshes = [], parkedMeshes = [], kits = [], carGlow, carGlowMesh, shadows;
let hour = 18.0, time = 0, camMode = 0, camYaw = 0, camPos = new THREE.Vector3(), shake = 0;
let state = "loading", acc = 0, last = performance.now(), mapOpen = false;

async function boot() {
  setLoading("Generating Asoka City");
  await frame();
  world = new World(7);
  U = makeUniforms();
  mats = makeMaterials(U);
  setLoading("Lighting the skyline");
  await frame();
  sky = makeSky(U); scene.add(sky);
  sea = makeSea(U, world); scene.add(sea);
  const signTex = await makeSignTexture();
  city = new CityView(world, scene, mats, makeSignMaterial(U, signTex));
  post = new Post(renderer);
  applyQuality();
  scene.add(buildTower(world, mats));
  const mapImg = drawMapImage(world);
  hud = new HUD($("hud"), world, mapImg);
  bigmap = new BigMap($("bigmap"), world, mapImg);
  input = new Input();
  audio = new Audio();
  traffic = new Traffic(world);
  traffic.max = QUALITY[prefs.quality].traffic;

  // Car models (CC BY, shared with Rally Legends). Falls back to the built-in low-poly bodies if they can't load.
  setLoading("Fetching the cars");
  await frame();
  kits = await loadKits((d, n) => setLoading(`Fetching the cars · ${d}/${n}`));
  KIT_PARKED.on = kits.length > 0;
  const pkit = kits.find((k) => k.id === PLAYER_KIT);
  const pspec = pkit ? { ...PLAYER_CAR, L: pkit.spec.L, W: pkit.spec.W, wr: pkit.spec.wr } : PLAYER_CAR;

  // Player car
  player = new Vehicle(world, pspec, { knocked: (chunk, c) => city.knock(chunk, c) });
  player.place(SPAWN.x, SPAWN.z, SPAWN.yaw);
  const pmat = mats.prop.clone();
  pmat.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 1 }, uLivery: { value: pkit ? asokaLivery() : null }, uUseLivery: { value: pkit ? 1 : 0 } };
  playerMesh = new THREE.Group();
  playerMesh.add(new THREE.Mesh(pkit ? pkit.body : playerGeometry(), pmat));
  const wheelSpots = pkit ? pkit.wheels : [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * (PLAYER_CAR.W / 2 - 0.12), y: PLAYER_CAR.wr, z: sz * (PLAYER_CAR.L / 2 - 0.85), front: sz < 0 }));
  const wg = pkit ? pkit.wheelGeo : wheelGeometry(PLAYER_CAR.wr);
  wheelSpots.sort((p, q) => (q.front ? 1 : 0) - (p.front ? 1 : 0));
  for (const ws of wheelSpots) {
    const w = new THREE.Mesh(wg, pmat);
    w.position.set(ws.x, ws.y, ws.z);
    w.rotation.order = "YXZ";
    w.layers.enable(1);
    playerMesh.add(w); wheels.push(w);
  }
  playerMesh.children[0].layers.enable(1);
  playerMesh.rotation.order = "YXZ";
  scene.add(playerMesh);

  // Traffic and parked cars: one instanced mesh per body.
  const tmat = mats.prop.clone();
  tmat.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 0.75 }, uLivery: { value: null }, uUseLivery: { value: 0 } };
  const bodies = kits.length ? kits.map((k) => ({ geo: k.traffic, spec: k.spec })) : CAR_TYPES.map((t) => ({ geo: trafficGeometry(t), spec: t }));
  const inst = (geo, n) => {
    const im = new THREE.InstancedMesh(geo, tmat, n);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    im.count = 0; im.frustumCulled = false;
    im.layers.enable(1);
    scene.add(im);
    return im;
  };
  for (const b of bodies) trafficMeshes.push(inst(b.geo, 40));
  if (kits.length) {
    for (const b of bodies) parkedMeshes.push(inst(b.geo, 24));
    traffic.types = bodies.map((b) => b.spec);
    traffic.cabType = Math.max(0, kits.findIndex((k) => k.id === "toyama"));
  }
  crowd = new Crowd(world, scene, U, districtAt);
  crowd.max = QUALITY[prefs.quality].crowd;
  walker = new Walker(world);
  if (prefs.character) await setCharacter(prefs.character.look);

  carGlow = glowGeometry(600);
  carGlowMesh = new THREE.Mesh(carGlow, mats.glow);
  carGlowMesh.frustumCulled = false; carGlowMesh.renderOrder = 6;
  scene.add(carGlowMesh);
  shadows = makeShadows(80);
  scene.add(shadows);

  // Build the area around the spawn before showing anything.
  exposure = applyTimeOfDay(U, hour);
  camPos.set(SPAWN.x, 4, SPAWN.z + 9);
  let pending = 1, guard = 0;
  while (pending > 0 && guard++ < 200) {
    pending = city.update({ x: SPAWN.x, z: SPAWN.z }, 40);
    setLoading(`Streaming city blocks · ${pending} to go`);
    await frame();
  }
  loading.classList.add("hidden");
  showTitle();
  requestAnimationFrame(loop);
}

function applyQuality() {
  const q = QUALITY[prefs.quality];
  city.radius = q.radius;
  city.nearR = q.near;
  if (traffic) traffic.max = q.traffic;
  if (crowd) crowd.max = q.crowd;
  // Always keep a depth texture bound to the shadow sampler; low detail just never renders it.
  if (!shadow) shadow = new SunShadow(renderer, U, q.shadow || 256, 170);
  else shadow.setSize(q.shadow || 256, 170);
  U.uShadow.value = shadow.rt.depthTexture;
  U._shadowEnabled = !!q.shadow;
  resize();
}

function makeShadows(n) {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d");
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), n);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 4;
  return m;
}

// ------------------------------------------------------------------------------ screens

function showTitle() {
  state = "title";
  ui.innerHTML = `
    <div class="title">
      <div class="title-card">
        ${LOGO}
        <h1>GO-LIVE</h1>
        <h2>Asoka City</h2>
        <p class="lede">An 8 × 8 km city of towers, isles, docks and hills. Free roam preview: drive, walk the
        streets, meet the city. The story, missions and the Audit patrols come next.</p>
        <button class="btn primary" id="t-start">${prefs.character ? `Play as ${esc(prefs.character.name)}` : "Create your character"}</button>
        ${prefs.character ? '<button class="btn" id="t-char">Change your character</button>' : ""}
        <div class="title-row">
          <label>Detail <select id="t-q">${Object.keys(QUALITY).map((k) => `<option ${k === prefs.quality ? "selected" : ""}>${k}</option>`).join("")}</select></label>
          <label>Start at <select id="t-time"><option value="18">Golden hour</option><option value="21.5">Night</option><option value="6.4">Sunrise</option><option value="12">Midday</option></select></label>
        </div>
        <ul class="keys">
          <li><kbd>W</kbd><kbd>S</kbd> drive / brake</li><li><kbd>A</kbd><kbd>D</kbd> steer</li><li><kbd>Space</kbd> handbrake</li>
          <li><kbd>F</kbd> get out / in</li><li><kbd>Shift</kbd> jog on foot</li>
          <li><kbd>C</kbd> camera</li><li><kbd>M</kbd> map</li><li><kbd>R</kbd> reset car</li><li><kbd>H</kbd> horn</li><li><kbd>[</kbd><kbd>]</kbd> time of day</li>
        </ul>
        <p class="fine">Gamepads work too: triggers to drive, stick to steer, A for handbrake.</p>
      </div>
    </div>`;
  ui.classList.remove("hidden");
  $("t-q").onchange = (e) => { prefs.quality = e.target.value; savePrefs(); applyQuality(); };
  if ($("t-char")) $("t-char").onclick = () => showCreator();
  $("t-start").onclick = () => {
    if (!prefs.character) { showCreator(); return; }
    hour = parseFloat($("t-time").value);
    audio.start();
    ui.classList.add("hidden");
    $("hud").classList.remove("hidden");
    state = "play";
    hud.toast("Welcome to Asoka City. Explore anywhere: the isles are over the causeways east.", 6);
  };
}

function showPause() {
  state = "pause";
  ui.innerHTML = `
    <div class="title"><div class="title-card small">
      ${LOGO}<h2>Paused</h2>
      <button class="btn primary" id="p-go">Resume</button>
      <button class="btn" id="p-map">Map</button>
      <button class="btn" id="p-reset">Put the car back on the road</button>
      <button class="btn" id="p-char">Change your character</button>
      <div class="title-row">
        <label>Detail <select id="p-q">${Object.keys(QUALITY).map((k) => `<option ${k === prefs.quality ? "selected" : ""}>${k}</option>`).join("")}</select></label>
        <label>Time <select id="p-time"><option value="">Keep</option><option value="6.4">Sunrise</option><option value="12">Midday</option><option value="18">Golden hour</option><option value="21.5">Night</option></select></label>
      </div>
    </div></div>`;
  ui.classList.remove("hidden");
  $("p-go").onclick = resume;
  $("p-map").onclick = () => { resume(); toggleMap(true); };
  $("p-reset").onclick = () => { respawn(); resume(); };
  $("p-char").onclick = () => showCreator(true);
  $("p-q").onchange = (e) => { prefs.quality = e.target.value; savePrefs(); applyQuality(); };
  $("p-time").onchange = (e) => { if (e.target.value) hour = parseFloat(e.target.value); };
}

function resume() { ui.classList.add("hidden"); state = "play"; last = performance.now(); }

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The lead character: identity and pronouns are the player's choice and are independent of the look;
// every look is open to everyone.
async function setCharacter(lookId) {
  const p = await Person.create(lookId, U);
  if (!p) return;
  if (me) scene.remove(me.holder);
  me = p;
  me.holder.visible = false;
  scene.add(me.holder);
  walker.person = me;
}

function showCreator(fromPause = false) {
  state = "creator";
  const c = prefs.character || { name: window.AC_NAME || "Alex", identity: "nonbinary", pronouns: "they/them", look: PEOPLE[0].id };
  creatorLook = Math.max(0, PEOPLE.findIndex((p) => p.id === c.look));
  ui.innerHTML = `
    <div class="creator">
      <div class="title-card small">
        ${LOGO}
        <h2>Your character</h2>
        <label class="field">Name<input id="c-name" maxlength="24" value="${esc(c.name)}" autocomplete="off"></label>
        <fieldset class="seg"><legend>I am</legend>
          ${[["man", "A man"], ["woman", "A woman"], ["nonbinary", "Non-binary"]].map(([v, l]) => `<label><input type="radio" name="c-id" value="${v}" ${c.identity === v ? "checked" : ""}><span>${l}</span></label>`).join("")}
        </fieldset>
        <label class="field">Pronouns the story uses<select id="c-pro">${["he/him", "she/her", "they/them"].map((v) => `<option ${c.pronouns === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <div class="look"><button class="btn" id="c-prev" aria-label="Previous look">‹</button><span id="c-look"></span><button class="btn" id="c-next" aria-label="Next look">›</button></div>
        <p class="fine">Every look is open to everyone, whoever you are.</p>
        <button class="btn primary" id="c-go">${fromPause ? "Done" : "Start in Asoka City"}</button>
      </div>
    </div>`;
  ui.classList.remove("hidden");
  const showLook = () => {
    const p = PEOPLE[creatorLook];
    $("c-look").textContent = `Look ${creatorLook + 1} of ${PEOPLE.length} · ${p.kind === "business" ? "Business" : "Casual"}`;
    setCharacter(p.id).then(() => { if (me) me.holder.visible = true; });
  };
  document.querySelectorAll('input[name="c-id"]').forEach((r) => r.onchange = () => { $("c-pro").value = PRONOUNS[r.value]; });
  $("c-prev").onclick = () => { creatorLook = (creatorLook + PEOPLE.length - 1) % PEOPLE.length; showLook(); };
  $("c-next").onclick = () => { creatorLook = (creatorLook + 1) % PEOPLE.length; showLook(); };
  $("c-go").onclick = () => {
    const identity = document.querySelector('input[name="c-id"]:checked').value;
    prefs.character = { name: $("c-name").value.trim() || "Alex", identity, pronouns: $("c-pro").value, look: PEOPLE[creatorLook].id };
    savePrefs();
    if (me) me.holder.visible = mode === "foot";
    if (fromPause) { resume(); return; }
    showTitle();
    $("t-start").click();
  };
  showLook();
}

const CREATOR_SPOT = { x: PLAZA.cx, z: PLAZA.z1 - 40 };

// Get out of the car on the driver's side, or back in when close to it.
function toggleFoot() {
  if (!me) { hud.toast("Your character is still loading.", 2); return; }
  if (mode === "drive") {
    if (player.speed > 4) { hud.toast("Slow down to get out.", 2); return; }
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    walker.place(player.x - rx * (player.hw + 0.7), player.z - rz * (player.hw + 0.7), player.yaw);
    mode = "foot";
    me.holder.visible = true;
  } else {
    if (Math.hypot(walker.x - player.x, walker.z - player.z) > 4) { hud.toast("Walk up to your car to get in.", 2); return; }
    mode = "drive";
    me.holder.visible = false;
  }
}

function toggleMap(open = !mapOpen) {
  mapOpen = open;
  $("bigmap").classList.toggle("hidden", !open);
  if (open) bigmap.draw(mode === "foot" ? walker : player);
}

function respawn() {
  const r = world.nearestRoad(player.x, player.z);
  if (!r) { player.place(SPAWN.x, SPAWN.z, SPAWN.yaw); return; }
  const p = world.edgePoint(r.e, r.s, r.e.laneOff[0]);
  player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz));
  hud.toast("Back on the road.", 2);
}

// --------------------------------------------------------------------------- main loop

const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler(0, 0, 0, "YXZ"), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === "play" && !mapOpen) {
    if (input.hit("Escape", 9)) { showPause(); input.endFrame(); render(dt); return; }
    tick(dt);
  } else if (state === "play" && mapOpen) {
    if (input.hit("KeyM", 8) || input.hit("Escape", 9)) toggleMap(false);
  } else if (state === "pause") {
    if (input.hit("Escape", 9)) resume();
  } else if (state === "creator") {
    time += dt;
    if (me) { me.holder.position.set(CREATOR_SPOT.x, world.height(CREATOR_SPOT.x, CREATOR_SPOT.z) + 0.15, CREATOR_SPOT.z); me.holder.rotation.y = Math.PI + Math.sin(time * 0.4) * 0.5; me.update(dt, 0); }
  } else if (state === "title") {
    if (input.hit("Enter")) $("t-start").click();
    time += dt;
    camYaw += dt * 0.05;
  }
  input.endFrame();
  render(dt);
}

function tick(dt) {
  time += dt;
  hour = (hour + dt / 60) % 24;
  if (input.hit("BracketRight")) hour = (hour + 1) % 24;
  if (input.hit("BracketLeft")) hour = (hour + 23) % 24;
  if (input.hit("KeyC", 3)) camMode = (camMode + 1) % 3;
  if (input.hit("KeyM", 8)) toggleMap(true);
  if (input.hit("KeyR", 1)) { if (mode === "foot") toggleFootHome(); else respawn(); }
  if (input.hit("KeyF", 2)) toggleFoot();
  audio.horn(mode === "drive" && input.down.has("KeyH"));

  const inp = mode === "drive" ? input.drive(dt) : { throttle: 0, brake: 1, steer: 0, handbrake: true };
  acc += dt;
  while (acc >= DT) {
    player.step(DT, inp);
    acc -= DT;
  }
  const focus = mode === "drive" ? player : walker;
  if (mode === "foot") {
    const obs = [{ x: player.x, z: player.z, fx: -Math.sin(player.yaw), fz: -Math.cos(player.yaw), hl: player.hl, hw: player.hw }];
    for (const c of traffic.cars) if (Math.abs(c.x - walker.x) < 6 && Math.abs(c.z - walker.z) < 6) obs.push({ x: c.x, z: c.z, fx: -Math.sin(c.yaw), fz: -Math.cos(c.yaw), hl: c.hl, hw: c.hw });
    walker.step(dt, input.foot(), obs);
    me.holder.position.set(walker.x, walker.y, walker.z);
    me.holder.rotation.y = walker.yaw;
    me.update(dt, Math.abs(walker.speed), walker.run);
  }
  traffic.update(dt, mode === "drive" ? player : { x: walker.x, z: walker.z, hl: 0.5 }, focus.x, focus.z, 140, 470);
  traffic.collidePlayer(player);
  crowd.update(dt, camera.position, mode === "drive" ? player : null, mode === "foot" ? walker : null);
  for (const ev of player.events) {
    if (ev.type === "impact" || ev.type === "land") { audio.bang(ev.mag); shake = Math.min(1, shake + ev.mag / 20); }
    if (ev.type === "knock") audio.bang(ev.mag, "knock");
  }
  player.events.length = 0;
  if (player.inWater > 2.2) { hud.toast("Asoka cars don't swim. Back to the road.", 3); respawn(); }
  audio.update(mode === "drive" ? player : { rpm: 900, throttle: 0, slip: 0, airborne: false }, focus === player ? player.speed * 3.6 : 0);
  hud.update(dt, mode === "drive" ? player : { x: walker.x, z: walker.z, yaw: walker.yaw, fwdSpeed: walker.speed, gear: "·" }, camYaw, hour);
}

function toggleFootHome() {
  walker.place(player.x - Math.cos(player.yaw) * (player.hw + 0.7), player.z + Math.sin(player.yaw) * (player.hw + 0.7), player.yaw);
  hud.toast("Back by your car.", 2);
}

function updateCamera(dt) {
  const p = player;
  if (state === "creator") {
    const gy = world.height(CREATOR_SPOT.x, CREATOR_SPOT.z);
    camera.position.set(CREATOR_SPOT.x + 1.2, gy + 1.65, CREATOR_SPOT.z + 3.6);
    camera.lookAt(CREATOR_SPOT.x - 0.5, gy + 1.15, CREATOR_SPOT.z);
    camera.fov = 45; camera.updateProjectionMatrix();
    return;
  }
  if (state === "title") {
    // Slow orbit of the Asoka tower.
    const r = 420, a = camYaw;
    camera.position.set(TOWER.x + Math.sin(a) * r, 120, TOWER.z + Math.cos(a) * r);
    camera.lookAt(TOWER.x, 70, TOWER.z);
    camera.fov = 55; camera.updateProjectionMatrix();
    return;
  }
  if (mode === "foot") return footCamera(dt);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
  const spd = p.speed;
  const moveYaw = spd > 4 && p.fwdSpeed < -2 ? p.yaw + Math.PI : p.yaw;
  camYaw += angleWrap(moveYaw - camYaw) * Math.min(1, dt * (camMode === 2 ? 20 : 3.2));
  const cfx = -Math.sin(camYaw), cfz = -Math.cos(camYaw);
  let target, look;
  if (camMode === 2) {
    target = new THREE.Vector3(p.x + fx * 0.3, p.y + 1.15, p.z + fz * 0.3);
    look = new THREE.Vector3(p.x + fx * 20, p.y + 1.0, p.z + fz * 20);
    camPos.copy(target);
  } else {
    const dist = camMode === 0 ? 7.2 : 11.5, h = camMode === 0 ? 2.5 : 3.8;
    target = new THREE.Vector3(p.x - cfx * dist, p.y + h, p.z - cfz * dist);
    // Keep the camera out of buildings.
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = lerp(p.x, target.x, t), z = lerp(p.z, target.z, t), y = lerp(p.y + 1.5, target.y, t);
      if (insideBox(x, y, z)) { target.set(lerp(p.x, target.x, (i - 1.5) / steps), target.y, lerp(p.z, target.z, (i - 1.5) / steps)); break; }
    }
    const gy = world.ground(target.x, target.z, target.y) + 0.8;
    if (target.y < gy) target.y = gy;
    camPos.lerp(target, Math.min(1, dt * 10));
    look = new THREE.Vector3(p.x + cfx * 3, p.y + 1.25, p.z + cfz * 3);
  }
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.3;
    camera.position.y += (Math.random() - 0.5) * shake * 0.3;
    shake = Math.max(0, shake - dt * 2.5);
  }
  camera.lookAt(look);
  const fov = 60 + clamp(spd - 10, 0, 50) * 0.28;
  camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 3));
  camera.updateProjectionMatrix();
}

function footCamera(dt) {
  const w = walker;
  camYaw += angleWrap(w.yaw - camYaw) * Math.min(1, dt * 4);
  const cfx = -Math.sin(camYaw), cfz = -Math.cos(camYaw);
  const target = new THREE.Vector3(w.x - cfx * 4.2, w.y + 2.0, w.z - cfz * 4.2);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8, x = lerp(w.x, target.x, t), z = lerp(w.z, target.z, t);
    if (insideBox(x, w.y + 1.6, z)) { target.set(lerp(w.x, target.x, (i - 1.5) / 8), target.y, lerp(w.z, target.z, (i - 1.5) / 8)); break; }
  }
  camPos.lerp(target, Math.min(1, dt * 8));
  camera.position.copy(camPos);
  camera.lookAt(w.x + cfx * 1.5, w.y + 1.45, w.z + cfz * 1.5);
  camera.fov = lerp(camera.fov, 58 + w.run * 6, Math.min(1, dt * 3));
  camera.updateProjectionMatrix();
}

function insideBox(x, y, z) {
  const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
  if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return false;
  const c = world.chunk(cx, cz);
  const i = clamp(Math.floor((x - c.x0) / 32), 0, 7), j = clamp(Math.floor((z - c.z0) / 32), 0, 7);
  for (const o of c.grid[i + j * 8]) {
    if (o.r != null || o.x0 == null) continue;
    if (x > o.x0 - 0.5 && x < o.x1 + 0.5 && z > o.z0 - 0.5 && z < o.z1 + 0.5 && y < o.y1 + 0.5) return true;
  }
  return false;
}

function render(dt) {
  if (!world) return;
  exposure = applyTimeOfDay(U, hour);
  U.uTime.value = time;
  updateCamera(dt);
  U.uCam.value.copy(camera.position);
  sky.position.copy(camera.position);
  sea.position.set(camera.position.x, 0, camera.position.z);
  city.update(state === "title" ? { x: TOWER.x, z: TOWER.z } : state === "creator" ? CREATOR_SPOT : camera.position, 5);
  const night = U.uNight.value;

  // Player car
  playerMesh.position.set(player.x, player.y, player.z);
  playerMesh.rotation.set(player.pitch, player.yaw, player.roll);
  wheels.forEach((w, i) => {
    w.rotation.x = -player.spin;
    w.rotation.y = i < 2 ? player.steer : 0;
  });
  playerMesh.children[0].material.uniforms.uBrake.value = player.braking ? 1 : 0;
  playerMesh.children[0].material.uniforms.uLights.value = night > 0.2 ? 1 : 0;

  // Traffic instances
  const counts = trafficMeshes.map(() => 0);
  for (const c of traffic.cars) {
    const im = trafficMeshes[c.type];
    if (!im) continue;
    const i = counts[c.type]++;
    if (i >= 40) continue;
    e3.set(0, c.yaw, 0);
    q4.setFromEuler(e3);
    v3.set(c.x, c.y, c.z);
    m4.compose(v3, q4, s3);
    im.setMatrixAt(i, m4);
    const col = hex(c.color);
    im.instanceColor.setXYZ(i, col[0], col[1], col[2]);
  }
  trafficMeshes.forEach((im, k) => { im.count = Math.min(40, counts[k]); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
  if (parkedMeshes.length) {
    const pc = parkedMeshes.map(() => 0);
    const cx = camera.position.x, cz = camera.position.z, R = 190;
    for (const v of city.views.values()) {
      if (!v.street) continue;
      for (const p of v.data.parked) {
        if (Math.abs(p.x - cx) > R || Math.abs(p.z - cz) > R) continue;
        const k = (Math.floor(Math.abs(p.x * 7.13 + p.z * 3.71)) % parkedMeshes.length);
        if (pc[k] >= 24) continue;
        const i = pc[k]++;
        e3.set(0, p.yaw, 0); q4.setFromEuler(e3); v3.set(p.x, p.y, p.z);
        m4.compose(v3, q4, s3);
        parkedMeshes[k].setMatrixAt(i, m4);
        const col = hex(p.color);
        parkedMeshes[k].instanceColor.setXYZ(i, col[0], col[1], col[2]);
      }
    }
    parkedMeshes.forEach((im, k) => { im.count = pc[k]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
  }

  // Car lights and blob shadows.
  let n = 0, sh = 0;
  const lights = (x, y, z, yaw, hl, hw, brake, isPlayer) => {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const s of [-1, 1]) {
      const hx = x + fx * (hl + 0.1) + rx * s * (hw - 0.32), hz = z + fz * (hl + 0.1) + rz * s * (hw - 0.32);
      const tx = x - fx * (hl + 0.1) + rx * s * (hw - 0.3), tz = z - fz * (hl + 0.1) + rz * s * (hw - 0.3);
      setGlow(carGlow, n++, hx, y + 0.68, hz, [1, 0.95, 0.82], 0.008, 0.9, 0, -1, 3, y);
      setGlow(carGlow, n++, tx, y + 0.78, tz, [1, 0.1, 0.06], brake ? 0.3 : 0.015, brake ? 0.9 : 0.55, 0, -1, brake ? 4 : 2, y);
      if (night > 0.3) {
        setGlow(carGlow, n++, hx, y + 0.68, hz, [1, 0.92, 0.75], 0, 1.6, -1, -1, 1.2, y);
        setGlow(carGlow, n++, tx, y + 0.78, tz, [1, 0.12, 0.06], 0, 1.4, -1, -1, brake ? 1.6 : 0.8, y);
      }
    }
    if (night > 0.2) {
      const d = isPlayer ? 11 : 8;
      setGlow(carGlow, n++, x + fx * d, world.ground(x + fx * d, z + fz * d, y + 1) + 0.15, z + fz * d, [1, 0.92, 0.75], 0, isPlayer ? 6 : 4, 1 + 2 * Math.PI + Math.atan2(-fx, fz), -1, isPlayer ? 1.2 : 0.7, y);
    }
    const sm = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(hw * 2.6, 1, hl * 2.3));
    if (sh < 80) shadows.setMatrixAt(sh++, sm);
  };
  lights(player.x, player.y, player.z, player.yaw, player.hl, player.hw, player.braking, true);
  for (const c of traffic.cars) {
    if (n > 590) break;
    if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) > 420) continue;
    lights(c.x, c.y, c.z, c.yaw, c.hl, c.hw, c.brake, false);
  }
  carGlow.instanceCount = n;
  for (const k of ["iPos", "iCol", "iP"]) carGlow.attributes[k].needsUpdate = true;
  shadows.count = sh;
  shadows.instanceMatrix.needsUpdate = true;
  playerMesh.visible = camMode !== 2 && state !== "title";

  const q = QUALITY[prefs.quality];
  if (q.shadow && U.uShadowOn.value > 0.01) shadow.update(scene, camera);
  post.render(scene, camera, time, exposure, q.bloom);
}

boot().catch((err) => {
  console.error(err);
  setLoading(`Something went wrong loading the city: ${String(err.message || err).replace(/</g, "&lt;")}`);
});

// Exposed for the local test page.
window.__ac = { scene, camera, get me() { return me; }, get walker() { return walker; }, get crowd() { return crowd; }, toggleFoot: () => toggleFoot(), get post() { return post; }, get U() { return U; }, get world() { return world; }, get player() { return player; }, get traffic() { return traffic; }, get city() { return city; }, setHour: (h) => (hour = h), get renderer() { return renderer; } };
