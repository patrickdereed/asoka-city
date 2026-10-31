// Go-Live: Asoka City. Entry point: loading, title screen, main loop, camera and car lights, and the
// on-foot game: money, weapons, the shops and homes you walk into, and the save.
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
import { Combat } from "./combat.js";
import { Arsenal } from "./arsenal.js";
import { interiorFor } from "./interiors.js";
import { openShop, lookName } from "./shops.js";
import { WEAPON, weaponGeometry, fmtMoney } from "./weapons.js";

THREE.ColorManagement.enabled = false;

const QUALITY = {
  low: { radius: 4, near: 2.0, ratio: 1, traffic: 22, shadow: 0, msaa: 0, bloom: true, crowd: 10 },
  medium: { radius: 5, near: 2.4, ratio: 1.25, traffic: 32, shadow: 2048, msaa: 4, bloom: true, crowd: 24 },
  high: { radius: 7, near: 2.8, ratio: 2, traffic: 44, shadow: 4096, msaa: 4, bloom: true, crowd: 36 },
};
const SAVE_KEY = `asokacity.${window.AC_USER || "local"}`;
const START_MONEY = 2500;

const $ = (id) => document.getElementById(id);
const ui = $("ui"), loading = $("loading");
const prefs = (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } })();
const savePrefs = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(prefs)); } catch (e) { /* private mode */ } };
prefs.quality = prefs.quality || "medium";
// The save: money, health, weapons, homes and outfits owned, cash already picked up.
const save = (prefs.save = Object.assign({ money: START_MONEY, hp: 100, armor: 0, weapons: {}, cur: "fists", homes: [], outfits: [], look: null, found: [], home: null, landmarks: [] }, prefs.save || {}));

const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x182b2e);
const scene = new THREE.Scene();
const roomScene = new THREE.Scene();
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
let crowd, walker, me = null, mode = "drive", creatorLook = 0, combat, arsenal;
const PRONOUNS = { man: "he/him", woman: "she/her", nonbinary: "they/them" };
prefs.character = prefs.character || null;
let playerMesh, wheels = [], trafficMeshes = [], parkedMeshes = [], kits = [], carGlow, carGlowMesh, shadows;
let hour = 18.0, time = 0, camMode = 0, camYaw = 0, camPitch = -0.12, camPos = new THREE.Vector3(), shake = 0;
let state = "loading", acc = 0, last = performance.now(), mapOpen = false;
let inside = null, shop = null, previewMesh = null, hitT = 0, aimPoint = new THREE.Vector3(), creatorSpin = 0, fade, saveT = 0;
let cashMesh, boards = new Map(), deadT = 0;

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
  hud.venues = world.venues; hud.owned = save.homes; hud.pickups = []; hud.landmarks = world.landmarks; hud.found = save.landmarks;
  bigmap = new BigMap($("bigmap"), world, mapImg);
  input = new Input();
  audio = new Audio();
  traffic = new Traffic(world);
  traffic.max = QUALITY[prefs.quality].traffic;
  fade = document.createElement("div"); fade.className = "fade"; $("ac").appendChild(fade);

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
  combat = new Combat({ scene, world, U, mats, audio });
  combat.crowd = crowd; combat.traffic = traffic; combat.playerCar = player;
  combat.onShake = (k) => { shake = Math.min(1.2, shake + k); };
  combat.onPlayerHit = (dmg) => hurtPlayer(dmg);
  arsenal = new Arsenal(save, mats, U, combat, audio);
  scene.add(arsenal.mesh);
  if (prefs.character) {
    if (!save.look) save.look = prefs.character.look;
    if (!save.outfits.includes(save.look)) save.outfits.push(save.look);
    await setCharacter(save.look);
  }

  carGlow = glowGeometry(900);
  carGlowMesh = new THREE.Mesh(carGlow, mats.glow);
  carGlowMesh.frustumCulled = false; carGlowMesh.renderOrder = 6;
  scene.add(carGlowMesh);
  shadows = makeShadows(80);
  scene.add(shadows);
  cashMesh = makeCash();
  scene.add(cashMesh);

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
  // Allocate the depth texture now. A shadow sampler bound to a never-rendered depth texture makes
  // WebGL reject every draw that uses it (everything but the sky), e.g. with the sun on the horizon.
  renderer.setRenderTarget(shadow.rt);
  renderer.clear(true, true, false);
  renderer.setRenderTarget(null);
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

// Cash envelopes on the pavements: spinning, glowing, worth picking up.
function makeCash() {
  const geo = new THREE.BoxGeometry(0.42, 0.04, 0.26);
  const n = geo.attributes.position.count, col = new Float32Array(n * 3), cd = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { col.set([0.84, 0.63, 0.24], i * 3); cd.set([0, 4], i * 2); }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("cdata", new THREE.BufferAttribute(cd, 2));
  const m = new THREE.InstancedMesh(geo, mats.prop, 24);
  m.count = 0; m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------------------ screens

function showTitle() {
  state = "title";
  const home = save.home && world.venues.find((v) => v.id === save.home);
  ui.innerHTML = `
    <div class="title">
      <div class="title-card">
        ${LOGO}
        <h1>GO-LIVE</h1>
        <h2>Asoka City</h2>
        <p class="lede">An 8 × 8 km city of towers, isles, docks and hills. Walk into the shops, arm yourself at
        Breakpoint Arms, buy a home. The story and the Audit patrols come next.</p>
        <button class="btn primary" id="t-start">${prefs.character ? `Play as ${esc(prefs.character.name)}${home ? ` · from your ${esc(home.name)}` : ""}` : "Create your character"}</button>
        ${prefs.character ? '<button class="btn" id="t-char">Change your character</button>' : ""}
        <div class="title-row">
          <label>Detail <select id="t-q">${Object.keys(QUALITY).map((k) => `<option ${k === prefs.quality ? "selected" : ""}>${k}</option>`).join("")}</select></label>
          <label>Start at <select id="t-time"><option value="18">Golden hour</option><option value="21.5">Night</option><option value="6.4">Sunrise</option><option value="12">Midday</option></select></label>
        </div>
        <ul class="keys">
          <li><kbd>W</kbd><kbd>S</kbd> drive / walk</li><li><kbd>A</kbd><kbd>D</kbd> steer / sidestep</li><li><kbd>F</kbd> get out / in</li>
          <li><kbd>E</kbd> enter, shop, use</li><li>Mouse: look, aim (right), fire (left)</li><li><kbd>Q</kbd> or wheel: weapon</li>
          <li><kbd>R</kbd> reload (on foot) / reset car</li><li><kbd>Shift</kbd> jog</li><li><kbd>C</kbd> camera · <kbd>M</kbd> map</li><li><kbd>H</kbd> horn · <kbd>[</kbd><kbd>]</kbd> time</li>
        </ul>
        <p class="fine">Click the city to steer the camera with the mouse. Gamepads: sticks move and look, triggers aim and fire, X to use.</p>
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
    if (home && !startedOnce) startAtHome(home);
    else if (!startedOnce) hud.toast(`Welcome to Asoka City. You have ${fmtMoney(save.money)}: gun stores, shops and homes are on the map (M).`, 7);
    startedOnce = true;
  };
}
let startedOnce = false;

function startAtHome(v) {
  const r = world.nearestRoad(v.x, v.z);
  if (r) { const p = world.edgePoint(r.e, r.s, r.e.laneOff[0]); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); }
  walker.place(v.x, v.z, v.yawOut);
  mode = "foot";
  me.holder.visible = true;
  camYaw = v.yawOut;
  hud.toast(`Back at your ${v.name}. Your car is parked on the street.`, 5);
}

function showPause() {
  state = "pause";
  releaseMouse();
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
      <p class="fine">Money ${fmtMoney(save.money)} · ${save.homes.length} home${save.homes.length === 1 ? "" : "s"} · ${Object.keys(save.weapons).length} weapon${Object.keys(save.weapons).length === 1 ? "" : "s"} · ${save.found.filter((id) => id < 1000).length} of ${world.pickups.filter((p) => !p.lm).length} cash envelopes · ${save.landmarks.length} of ${world.landmarks.length} landmarks</p>
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

// The lead character: identity and pronouns are the player's choice and are independent of the look.
async function setCharacter(lookId) {
  const p = await Person.create(lookId, U);
  if (!p) return;
  const parent = me && me.holder.parent;
  const vis = me ? me.holder.visible : false;
  if (me) me.holder.removeFromParent();
  me = p;
  me.holder.visible = vis;
  (parent || scene).add(me.holder);
  me.arms = (person) => (mode === "foot" && state !== "creator" ? arsenal.pose(person) : null);
  walker.person = me;
}

// First time: every look is free to pick. Afterwards the look list is your wardrobe; Sandbox Threads sells the rest.
function showCreator(fromPause = false) {
  state = "creator";
  creatorSpin = 0;
  releaseMouse();
  $("hud").classList.add("hidden");
  const first = !prefs.character;
  const c = prefs.character || { name: window.AC_NAME || "Alex", identity: "man", pronouns: "he/him", look: (PEOPLE.find((p) => p.g === "m") || PEOPLE[0]).id };
  const looks = first ? PEOPLE : PEOPLE.filter((p) => save.outfits.includes(p.id));
  creatorLook = Math.max(0, looks.findIndex((p) => p.id === (save.look || c.look)));
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
        <p class="fine">${first ? "Every look is open to everyone, whoever you are. Drag to turn around." : "These are the looks you own. Sandbox Threads sells the rest."}</p>
        <button class="btn primary" id="c-go">${fromPause ? "Done" : "Start in Asoka City"}</button>
      </div>
    </div>`;
  ui.classList.remove("hidden");
  const showLook = () => {
    const p = looks[creatorLook];
    $("c-look").textContent = `${lookName(p, PEOPLE.indexOf(p))} · ${creatorLook + 1} of ${looks.length}`;
    setCharacter(p.id).then(() => { if (me) me.holder.visible = true; });
  };
  document.querySelectorAll('input[name="c-id"]').forEach((r) => r.onchange = () => { $("c-pro").value = PRONOUNS[r.value]; });
  $("c-prev").onclick = () => { creatorLook = (creatorLook + looks.length - 1) % looks.length; showLook(); };
  $("c-next").onclick = () => { creatorLook = (creatorLook + 1) % looks.length; showLook(); };
  $("c-go").onclick = () => {
    const identity = document.querySelector('input[name="c-id"]:checked').value;
    const look = looks[creatorLook].id;
    prefs.character = { name: $("c-name").value.trim() || "Alex", identity, pronouns: $("c-pro").value, look };
    save.look = look;
    if (!save.outfits.includes(look)) save.outfits.push(look);
    savePrefs();
    if (me) me.holder.visible = mode === "foot";
    if (fromPause) { $("hud").classList.remove("hidden"); resume(); return; }
    showTitle();
    $("t-start").click();
  };
  showLook();
}

const CREATOR_SPOT = { x: PLAZA.cx, z: PLAZA.z1 - 40 };
// Turn the character in the creator by dragging.
let drag = null;
addEventListener("pointerdown", (e) => { if (state === "creator" && e.target === canvas) drag = e.clientX; });
addEventListener("pointermove", (e) => { if (drag != null) { creatorSpin += (e.clientX - drag) * 0.01; drag = e.clientX; } });
addEventListener("pointerup", () => { drag = null; });

// Pointer lock for mouse look on foot; dragging with the right button works without it.
canvas.addEventListener("click", () => {
  if (state === "play" && !mapOpen && (mode === "foot" || inside) && !document.pointerLockElement) {
    try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed in this frame */ }
  }
});
function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }

// Get out of the car on the driver's side, or back in when close to it.
function toggleFoot() {
  if (!me) { hud.toast("Your character is still loading.", 2); return; }
  if (mode === "drive") {
    if (player.speed > 4) { hud.toast("Slow down to get out.", 2); return; }
    const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw);
    walker.place(player.x - rx * (player.hw + 0.7), player.z - rz * (player.hw + 0.7), player.yaw);
    mode = "foot";
    me.holder.visible = true;
    camYaw = player.yaw; camPitch = -0.15;
  } else {
    if (Math.hypot(walker.x - player.x, walker.z - player.z) > 4) { hud.toast("Walk up to your car to get in.", 2); return; }
    mode = "drive";
    me.holder.visible = false;
    releaseMouse();
  }
}

function toggleMap(open = !mapOpen) {
  mapOpen = open;
  $("bigmap").classList.toggle("hidden", !open);
  if (open) { releaseMouse(); bigmap.draw(mode === "foot" ? walker : player, world.venues, save.homes, world.landmarks, save.landmarks); }
}

function respawn() {
  const r = world.nearestRoad(player.x, player.z);
  if (!r) { player.place(SPAWN.x, SPAWN.z, SPAWN.yaw); return; }
  const p = world.edgePoint(r.e, r.s, r.e.laneOff[0]);
  player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz));
  hud.toast("Back on the road.", 2);
}

// ---------------------------------------------------------------------------- money and health

function saveNow() { prefs.save = save; savePrefs(); }
function spend(n) { if (save.money < n) return false; save.money -= n; return true; }
function earn(n) { save.money += n; audio.cash(true); }
function heal(n) { save.hp = Math.min(100, save.hp + n); }

function hurtPlayer(dmg) {
  if (state !== "play" || deadT > 0) return;
  const soak = Math.min(save.armor, dmg * 0.7);
  save.armor -= soak;
  save.hp -= dmg - soak;
  shake = Math.min(1.2, shake + 0.4);
  if (save.hp <= 0) knockedOut();
}

// Knocked out: wake at the nearest Meridian Clinic with a bill.
function knockedOut() {
  save.hp = 0; deadT = 3.2;
  releaseMouse();
  const ov = document.createElement("div"); ov.className = "wasted"; ov.innerHTML = "<b>ROLLED BACK</b>"; ov.id = "ko";
  $("ac").appendChild(ov);
}

function wakeAtClinic() {
  $("ko") && $("ko").remove();
  const at = mode === "foot" ? walker : player;
  const clinics = world.venues.filter((v) => v.kind === "clinic").sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
  const v = clinics[0];
  const bill = Math.min(save.money, Math.max(100, Math.round(save.money * 0.05)));
  save.money -= bill; save.hp = 100; save.armor = 0;
  if (inside) leaveVenue(true);
  const r = world.nearestRoad(v.x, v.z);
  if (r) { const p = world.edgePoint(r.e, r.s, r.e.laneOff[0]); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); }
  walker.place(v.x + v.nx * 1.5, v.z + v.nz * 1.5, v.yawOut);
  mode = "foot"; me.holder.visible = true; camYaw = v.yawOut;
  saveNow();
  hud.toast(`Meridian Clinic patched you up. The bill: ${fmtMoney(bill)}.`, 5);
}

// ---------------------------------------------------------------------------- walking in

// Nearest venue door within reach of the player on foot.
function venueNear(x, z, r = 2.2) {
  let best = null, bd = r;
  for (const v of world.venues) { const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = v; } }
  return best;
}

async function fadeThrough(fn) {
  fade.classList.add("on");
  await new Promise((r) => setTimeout(r, 300));
  await fn();
  await frame();
  fade.classList.remove("on");
}

const KEEPERS = { arms: "Male_Adult_04", mart: "Female_Adult_06", threads: "Business_Female_03", clinic: "Female_Adult_02" };

function enterVenue(v) {
  if (inside || state !== "play") return;
  fadeThrough(async () => {
    const room = interiorFor(v, U);
    inside = { v, room, keeper: null, owned: v.kind !== "home" || save.homes.includes(v.id) };
    roomScene.add(room.group);
    roomScene.add(me.holder); roomScene.add(arsenal.mesh);
    combat.attach(roomScene);
    combat.room = { ...room, ox: 0, oy: 0, oz: 0 };
    walker.room = combat.room;
    walker.place(0, -1.5, 0);
    walker.x = 0; walker.y = 0; walker.z = -1.5;
    camYaw = 0; camPitch = -0.18; camPos.set(0, 1.9, 1);
    me.holder.visible = true;
    if (room.keeper) {
      const id = KEEPERS[v.kind] || PEOPLE[0].id;
      Person.create(id, U).then((k) => {
        if (!k || !inside || inside.room !== room) return;
        k.holder.position.set(room.keeper.x, 0, room.keeper.z);
        k.holder.rotation.y = room.keeper.yaw;
        if (k.info.g === "m") k.playIdle("m_gestic_listen_neutral");
        roomScene.add(k.holder);
        inside.keeper = k;
      });
    }
    if (v.kind === "home") {
      if (!inside.owned) hud.toast(`Viewing the ${v.name}: ${fmtMoney(v.price)}. Look around; press E by the door to buy.`, 7);
      else hud.toast(`Home. Sleep in the bed to save.`, 4);
      if (v.tier === "penthouse") hud.toast(inside.owned ? "The lift opens onto your penthouse. Sleep in the bed to save." : `The lift opens onto the penthouse: ${fmtMoney(v.price)}. Press E by the lift to buy.`, 7);
    }
  });
}

function leaveVenue(instant = false) {
  if (!inside) return;
  const go = () => {
    const { v, room, keeper } = inside;
    closeShop();
    roomScene.remove(room.group);
    if (keeper) roomScene.remove(keeper.holder);
    scene.add(me.holder); scene.add(arsenal.mesh);
    combat.room = null;
    combat.attach(scene);
    walker.room = null;
    inside = null;
    walker.place(v.x, v.z, v.yawOut);
    camYaw = v.yawOut; camPitch = -0.12;
    camPos.set(v.x - Math.sin(v.yawOut) * -4, walker.y + 2, v.z - Math.cos(v.yawOut) * -4);
  };
  if (instant) go(); else fadeThrough(go);
}

// The spot inside the room the player is standing at, if any.
function roomSpot() {
  if (!inside) return null;
  const lx = walker.x, lz = walker.z;
  if (lz > -1.4 && Math.abs(lx) < 1.2) return { kind: inside.v.kind === "home" && !inside.owned ? "buy" : "door" };
  for (const s of inside.room.spots) {
    if (s.kind === "buy") continue;
    if (Math.hypot(s.x - lx, s.z - lz) < s.r) return s;
  }
  return null;
}

function useSpot(s) {
  const v = inside.v;
  if (s.kind === "door") { leaveVenue(); return; }
  if (s.kind === "buy") { if (inside.owned) leaveVenue(); else showShop("home"); return; }
  if (v.kind === "home" && !inside.owned) { hud.toast("Buy the place first: press E by the door.", 3); return; }
  if (s.kind === "shop") showShop(v.kind);
  else if (s.kind === "heal") showShop("clinic");
  else if (s.kind === "wardrobe") showShop("wardrobe");
  else if (s.kind === "bed") sleep();
}

function sleep() {
  fadeThrough(async () => {
    hour = 8;
    save.hp = 100;
    save.home = inside.v.id;
    saveNow();
    await new Promise((r) => setTimeout(r, 500));
    hud.toast("Saved. Good morning: it's 08:00.", 4);
  });
}

function showShop(kind) {
  state = "shop";
  releaseMouse();
  hud.status(0, { money: save.money, hp: save.hp, armor: save.armor, onFoot: true, inside: true, prompt: "", weapon: null });
  const room = inside.room;
  // Stand at the counter or the mirror while browsing.
  if ((kind === "threads" || kind === "wardrobe") && room.mirror) { walker.x = room.mirror.x; walker.z = room.mirror.z; walker.yaw = room.mirror.yaw + Math.PI; walker.speed = 0; }
  shop = openShop(kind, {
    root: ui, venue: inside.v, save, arsenal,
    money: () => save.money, spend, earn, heal, hp: () => save.hp, armor: () => save.armor, setArmor: (n) => { save.armor = n; },
    previewWeapon: (id) => {
      if (!previewMesh) { previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), arsenal.mat); previewMesh.frustumCulled = false; }
      if (!id || !room.pad) { previewMesh.visible = false; return; }
      previewMesh.geometry = weaponGeometry(id) || new THREE.BufferGeometry();
      previewMesh.visible = true;
      const w = WEAPON[id];
      previewMesh.scale.setScalar(w.long ? 0.9 : w.slot <= 1 ? 1.1 : 2);
      previewMesh.position.set(room.pad.x, room.pad.y + (w.long ? 0.08 : 0.12), room.pad.z);
      roomScene.add(previewMesh);
    },
    previewLook: (id) => { if (me && me.id !== id) setCharacter(id).then(() => { me.holder.visible = true; }); },
    wear: (id) => { save.look = id; if (prefs.character) prefs.character.look = id; saveNow(); if (me.id !== id) setCharacter(id).then(() => { me.holder.visible = true; }); },
    buyHome: () => {
      save.homes.push(inside.v.id); inside.owned = true; save.home = inside.v.id;
      saveNow(); closeShop();
      hud.toast(`The ${inside.v.name} is yours. Sleep in the bed to save.`, 6);
    },
    close: closeShop, toast: (m) => hud.toast(m, 3), sound: (up) => audio.cash(up), saveNow,
  });
  shop.kind = kind;
}

function closeShop() {
  if (!shop) return;
  if ((shop.kind === "threads" || shop.kind === "wardrobe") && me && me.id !== save.look) setCharacter(save.look).then(() => { me.holder.visible = true; });
  shop = null;
  if (previewMesh) { previewMesh.visible = false; previewMesh.removeFromParent(); }
  ui.innerHTML = ""; ui.classList.add("hidden");
  if (state === "shop") { state = "play"; last = performance.now(); }
}

// ---------------------------------------------------------------------------------- main loop

const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e3 = new THREE.Euler(0, 0, 0, "YXZ"), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1);

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === "play" && deadT > 0) {
    deadT -= dt; time += dt;
    if (deadT <= 0) wakeAtClinic();
  } else if (state === "play" && !mapOpen) {
    if (input.hit("Escape", 9)) { showPause(); input.endFrame(); render(dt); return; }
    tick(dt);
  } else if (state === "play" && mapOpen) {
    if (input.hit("KeyM", 8) || input.hit("Escape", 9)) toggleMap(false);
  } else if (state === "pause") {
    if (input.hit("Escape", 9)) resume();
  } else if (state === "shop") {
    time += dt;
    if (input.hit("Escape", 9)) closeShop();
    me.update(dt, 0);
    if (inside && inside.keeper) inside.keeper.update(dt, 0);
    if (previewMesh && previewMesh.visible) previewMesh.rotation.y += dt * 0.8;
    me.holder.position.set(walker.x, walker.y, walker.z);
    me.holder.rotation.y = walker.yaw;
  } else if (state === "creator") {
    time += dt;
    if (drag == null) creatorSpin *= 1 - Math.min(1, dt * 1.5);
    if (me) {
      me.holder.position.set(CREATOR_SPOT.x, world.height(CREATOR_SPOT.x, CREATOR_SPOT.z) + 0.15, CREATOR_SPOT.z);
      // Face the camera (which sits 1.2 m right and 3.6 m south of the spot).
      me.holder.rotation.y = Math.atan2(-1.2, -3.6) + creatorSpin;
      me.update(dt, 0);
    }
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
  if (input.hit("KeyC")) camMode = (camMode + 1) % 3;
  if (input.hit("KeyM", 8)) toggleMap(true);
  const onFoot = mode === "foot";
  if (input.hit("KeyR", 1)) { if (onFoot) arsenal.reload(); else respawn(); }
  if (input.hit("KeyF", 3) && !inside) toggleFoot();
  audio.horn(mode === "drive" && input.down.has("KeyH"));

  // Weapons: wheel, Q, number keys, shoulder buttons.
  const cb = input.combat();
  if (onFoot) {
    if (cb.wheel) arsenal.cycle(cb.wheel > 0 ? 1 : -1);
    if (input.hit("KeyQ", 5)) arsenal.cycle(1);
    if (input.hit("KeyZ", 4)) arsenal.cycle(-1);
    for (let k = 0; k <= 8; k++) if (input.hit(`Digit${k}`)) { if (k === 0) arsenal.select("fists"); else if (!arsenal.slot(k)) hud.toast("Nothing in that slot. Breakpoint Arms has the stock.", 2); }
  }

  const inp = mode === "drive" ? input.drive(dt) : { throttle: 0, brake: 1, steer: 0, handbrake: true };
  if (!inside) {
    acc += dt;
    while (acc >= DT) { player.step(DT, inp); acc -= DT; }
  }
  const focus = mode === "drive" ? player : walker;
  let prompt = "", aiming = false;
  if (onFoot) {
    const look = input.look(dt);
    camYaw -= look.x * 0.0026;
    camPitch = clamp(camPitch - look.y * 0.0022, -1.1, 0.75);
    const f = input.foot();
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const w = arsenal.w;
    aiming = !inside && (cb.aim || (cb.held && !!w.mag));
    // Without the mouse, the camera drifts in behind the walk.
    if (!look.recent && !aiming && Math.abs(f.fwd) + Math.abs(f.side) > 0.1 && !inside) camYaw += angleWrap(walker.yaw - camYaw) * Math.min(1, dt * 1.2);
    const obs = inside ? [] : [{ x: player.x, z: player.z, fx: -Math.sin(player.yaw), fz: -Math.cos(player.yaw), hl: player.hl, hw: player.hw }];
    if (!inside) for (const c of traffic.cars) if (Math.abs(c.x - walker.x) < 6 && Math.abs(c.z - walker.z) < 6) obs.push({ x: c.x, z: c.z, fx: -Math.sin(c.yaw), fz: -Math.cos(c.yaw), hl: c.hl, hw: c.hw });
    walker.step(dt, { mx: fx * f.fwd + rx * f.side, mz: fz * f.fwd + rz * f.side, run: f.run, face: aiming || arsenal.act > 0 ? camYaw : null }, obs);
    if (walker.fall > 0) { const d = walker.fall; walker.fall = 0; audio.bang(Math.min(18, d / 4)); hurtPlayer(d); }
    me.holder.position.set(walker.x, walker.y, walker.z);
    me.holder.rotation.y = walker.yaw;
    me.update(dt, Math.abs(walker.speed), walker.run);

    // Aim: whatever is under the crosshair.
    const cd = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
    const start = camPos.clone().addScaledVector(cd, Math.max(0.5, camPos.distanceTo(me.holder.position) - 0.2));
    const h = combat.ray(start, cd, w.range > 3 ? w.range : 60);
    aimPoint.set(h.x, h.y, h.z);
    const chest = new THREE.Vector3(walker.x, walker.y + 1.4, walker.z);
    const aimDir = aimPoint.clone().sub(chest).normalize();
    if (w.range <= 3 || w.throw) aimDir.copy(cd);
    const res = arsenal.update(dt, { person: me, aiming, held: cb.held && !inside, pressed: cb.pressed && !inside, aimPoint, aimDir, inside: !!inside });
    if (res && res.kick) { camPitch += res.kick; camYaw += (Math.random() - 0.5) * res.kick * 0.5; }
    if (res && res.hits) hitT = 0.15;
    hitT = Math.max(0, hitT - dt);
    arsenal.place(me, me.holder.visible && !(aiming && w.scope));
    combat.player = { x: walker.x, y: walker.y + 1, z: walker.z };

    if (inside) {
      const s = roomSpot();
      if (s) prompt = s.kind === "door" ? "<kbd>E</kbd> Leave" : s.kind === "buy" ? `<kbd>E</kbd> Buy this home · ${fmtMoney(inside.v.price)} &nbsp; <kbd>W</kbd> back out to leave` : `<kbd>E</kbd> ${s.label}`;
      if (input.hit("KeyE", 2) && s) useSpot(s);
    } else {
      const v = venueNear(walker.x, walker.z);
      if (v) {
        const owned = save.homes.includes(v.id);
        prompt = v.kind === "home" ? (owned ? `<kbd>E</kbd> Go home · ${esc(v.name)}` : `<kbd>E</kbd> View ${esc(v.name)} · for sale ${fmtMoney(v.price)}`) : `<kbd>E</kbd> Enter ${esc(v.name)}`;
        if (input.hit("KeyE", 2)) enterVenue(v);
      } else if (Math.hypot(walker.x - player.x, walker.z - player.z) < 4) prompt = "<kbd>F</kbd> Get in";
    }
  } else {
    arsenal.place(me, false);
    combat.player = { x: player.x, y: player.y + 1, z: player.z };
  }
  if (inside && inside.keeper) inside.keeper.update(dt, 0);

  if (!inside) {
    traffic.update(dt, mode === "drive" ? player : { x: walker.x, z: walker.z, hl: 0.5 }, focus.x, focus.z, 140, 470);
    traffic.collidePlayer(player);
    crowd.update(dt, camera.position, mode === "drive" ? player : null, mode === "foot" ? walker : null);
    collectCash(mode === "drive" ? player : walker, mode === "drive" ? 2.6 : 1.3);
    discover(mode === "drive" ? player : walker);
  }
  combat.update(dt, camera, renderer.getDrawingBufferSize(v3.set(0, 0, 0)).y);
  for (const ev of player.events) {
    if (ev.type === "impact" || ev.type === "land") { audio.bang(ev.mag); shake = Math.min(1, shake + ev.mag / 20); }
    if (ev.type === "knock") audio.bang(ev.mag, "knock");
  }
  player.events.length = 0;
  if (player.inWater > 2.2 && mode === "drive") { hud.toast("Asoka cars don't swim. Back to the road.", 3); respawn(); }
  if (onFoot && !inside && walker.y < -0.5) hurtPlayer(dt * 20);
  audio.update(mode === "drive" ? player : { rpm: 900, throttle: 0, slip: 0, airborne: false }, focus === player ? player.speed * 3.6 : 0);
  const at = inside ? { x: inside.v.x, z: inside.v.z, yaw: inside.v.yawOut, fwdSpeed: 0, gear: "·" } : mode === "drive" ? player : { x: walker.x, z: walker.z, yaw: walker.yaw, fwdSpeed: walker.speed, gear: "·" };
  hud.update(dt, at, camYaw, hour);
  const w = arsenal.w, st = arsenal.state;
  hud.status(dt, {
    money: save.money, hp: save.hp, armor: save.armor, onFoot, inside: !!inside, prompt, hitT,
    cross: onFoot && !inside && (aiming || arsenal.act > 0) && !(aiming && w.scope), scope: onFoot && aiming && !!w.scope && !inside,
    weapon: onFoot && !inside ? { name: w.name, kind: w.kind, mag: w.mag ? st.mag : null, ammo: w.mag ? st.ammo : null, reloading: arsenal.reloadT > 0 } : null,
  });
  saveT += dt;
  if (saveT > 15) { saveT = 0; saveNow(); }
}

function collectCash(at, r) {
  for (const p of world.pickups) {
    if (Math.abs(p.x - at.x) > r || Math.abs(p.z - at.z) > r || save.found.includes(p.id)) continue;
    if (Math.hypot(p.x - at.x, p.z - at.z) > r || Math.abs(p.y - at.y) > 2.5) continue;
    save.found.push(p.id);
    earn(p.value);
    const lm = p.lm && world.landmarks.find((l) => l.id === p.lm);
    hud.toast(lm ? `Top of ${lm.name}: +${fmtMoney(p.value)}` : `Unclaimed expenses: +${fmtMoney(p.value)} (${save.found.filter((id) => id < 1000).length} of ${world.pickups.filter((q) => !q.lm).length} found)`, 4);
    saveNow();
  }
  hud.pickups = world.pickups.filter((p) => !save.found.includes(p.id) && Math.abs(p.x - at.x) < 80 && Math.abs(p.z - at.z) < 80);
}

let camHold = null;   // test hook: { pos: [x, y, z], look: [x, y, z] }
// Landmarks: one in every district, each with cash at its highest point.
function discover(at) {
  for (const l of world.landmarks) {
    if (save.landmarks.includes(l.id) || Math.hypot(l.x - at.x, l.z - at.z) > l.r) continue;
    save.landmarks.push(l.id);
    audio.cash(true);
    hud.toast(`Landmark found: ${l.name} (${save.landmarks.length} of ${world.landmarks.length}). There's cash at the top.`, 6);
    saveNow();
  }
}

function updateCamera(dt) {
  const p = player;
  if (camHold) {
    camera.position.set(...camHold.pos); camera.lookAt(...camHold.look);
    camera.fov = 50; camera.updateProjectionMatrix();
    return;
  }
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
  if (state === "shop" && inside) {
    const room = inside.room, c = room.shopCam;
    if (shop && (shop.kind === "threads" || shop.kind === "wardrobe")) {
      camera.position.lerp(v3.set(walker.x + Math.sin(walker.yaw + Math.PI) * -2.4, 1.55, walker.z + Math.cos(walker.yaw + Math.PI) * -2.4), Math.min(1, dt * 6));
      camera.lookAt(walker.x, 1.1, walker.z);
    } else if (c) {
      camera.position.lerp(v3.set(c.x, c.y, c.z), Math.min(1, dt * 6));
      const t = room.pad || room.keeper;
      camera.lookAt(t.x, room.pad ? room.pad.y + 0.15 : 1.4, t.z);
    }
    camera.fov = lerp(camera.fov, 48, Math.min(1, dt * 4)); camera.updateProjectionMatrix();
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
  addShake(dt);
  camera.lookAt(look);
  const fov = 60 + clamp(spd - 10, 0, 50) * 0.28;
  camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 3));
  camera.updateProjectionMatrix();
}

function addShake(dt) {
  if (shake <= 0) return;
  camera.position.x += (Math.random() - 0.5) * shake * 0.3;
  camera.position.y += (Math.random() - 0.5) * shake * 0.3;
  shake = Math.max(0, shake - dt * 2.5);
}

// Third person on foot, orbiting with the mouse; over the shoulder when aiming.
let aimCam = 0;
function footCamera(dt) {
  const w = walker, wp = arsenal.w;
  const aiming = state === "play" && !inside && (input.buttons.has(2) || input.down.has("KeyK") || arsenal.aimW > 0.6);
  aimCam = lerp(aimCam, aiming ? 1 : 0, Math.min(1, dt * 10));
  const scoped = aiming && wp.scope && aimCam > 0.8;
  const dist = inside ? 2.7 : lerp(4.2, 1.9, aimCam), side = lerp(0, 0.6, aimCam), h = lerp(1.75, 1.6, aimCam);
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  const fx = -Math.sin(camYaw) * cp, fz = -Math.cos(camYaw) * cp, fy = sp;
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  const pivot = new THREE.Vector3(w.x + rx * side, w.y + h, w.z + rz * side);
  let target = new THREE.Vector3(pivot.x - fx * dist, pivot.y - fy * dist + 0.25, pivot.z - fz * dist);
  if (scoped) target = new THREE.Vector3(w.x + fx * 0.3, w.y + 1.62, w.z + fz * 0.3);
  if (inside) {
    const R = inside.room;
    target.x = clamp(target.x, -R.W / 2 + 0.25, R.W / 2 - 0.25);
    target.z = clamp(target.z, -R.D + 0.25, -0.15);
    target.y = clamp(target.y, 0.4, R.H - 0.2);
  } else if (!scoped) {
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, x = lerp(pivot.x, target.x, t), z = lerp(pivot.z, target.z, t), y = lerp(pivot.y, target.y, t);
      if (insideBox(x, y, z)) { target.set(lerp(pivot.x, target.x, (i - 1.5) / 8), lerp(pivot.y, target.y, (i - 1.5) / 8), lerp(pivot.z, target.z, (i - 1.5) / 8)); break; }
    }
    const gy = world.ground(target.x, target.z, target.y) + 0.3;
    if (target.y < gy) target.y = gy;
  }
  camPos.lerp(target, Math.min(1, dt * (aiming || inside ? 20 : 12)));
  camera.position.copy(camPos);
  addShake(dt);
  camera.lookAt(camPos.x + fx * 10, camPos.y + fy * 10, camPos.z + fz * 10);
  const fov = scoped ? 55 / wp.scope : inside ? 64 : 58 + w.run * 6 - aimCam * 10;
  camera.fov = lerp(camera.fov, fov, Math.min(1, dt * (scoped ? 20 : 4)));
  camera.updateProjectionMatrix();
  me.holder.visible = !scoped && mode === "foot";
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

// A "for sale" board by each home that isn't yours yet.
function saleBoard(v) {
  if (boards.has(v.id)) return boards.get(v.id);
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 160;
  const g = cv.getContext("2d");
  g.fillStyle = "#fff7ee"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#3f7f45"; g.fillRect(0, 0, 256, 50);
  g.fillStyle = "#fffdf9"; g.font = '700 34px "Space Grotesk", sans-serif'; g.textAlign = "center"; g.fillText("FOR SALE", 128, 38);
  g.fillStyle = "#182b2e"; g.font = '700 40px "Space Mono", monospace'; g.fillText(fmtMoney(v.price), 128, 100);
  g.font = '500 18px "Space Grotesk", sans-serif'; g.fillText(v.tier[0].toUpperCase() + v.tier.slice(1), 128, 138);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.81), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.55, 0.55, 0.55), side: THREE.DoubleSide }));
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x1c1c1c }));
  const grp = new THREE.Group();
  m.position.y = 1.5; post.position.y = 0.6;
  grp.add(m, post);
  const tx = v.nz, tz = -v.nx;
  grp.position.set(v.x + tx * 2.2, v.gy, v.z + tz * 2.2);
  grp.rotation.y = Math.atan2(v.nx, v.nz);
  boards.set(v.id, grp);
  return grp;
}

function render(dt) {
  if (!world) return;
  exposure = applyTimeOfDay(U, hour);
  if (inside) {
    // Indoor light for people and props: warm, from above, no sun shadows or haze.
    U.uLightDir.value.set(0.3, 1, 0.45).normalize();
    U.uLightCol.value.set(1.05, 0.88, 0.7);
    U.uSkyAmb.value.set(0.42, 0.38, 0.34);
    U.uGndAmb.value.set(0.2, 0.18, 0.16);
    U.uFogDen.value = 0;
    U.uShadowOn.value = 0;
    exposure = 1.05;
  }
  U.uTime.value = time;
  updateCamera(dt);
  U.uCam.value.copy(camera.position);
  if (inside) {
    post.render(roomScene, camera, time, exposure, QUALITY[prefs.quality].bloom);
    return;
  }
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
  const lights = (x, y, z, yaw, hl, hw, brake, isPlayer, dead) => {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    if (!dead) for (const s of [-1, 1]) {
      const hx = x + fx * (hl + 0.1) + rx * s * (hw - 0.32), hz = z + fz * (hl + 0.1) + rz * s * (hw - 0.32);
      const tx = x - fx * (hl + 0.1) + rx * s * (hw - 0.3), tz = z - fz * (hl + 0.1) + rz * s * (hw - 0.3);
      setGlow(carGlow, n++, hx, y + 0.68, hz, [1, 0.95, 0.82], 0.008, 0.9, 0, -1, 3, y);
      setGlow(carGlow, n++, tx, y + 0.78, tz, [1, 0.1, 0.06], brake ? 0.3 : 0.015, brake ? 0.9 : 0.55, 0, -1, brake ? 4 : 2, y);
      if (night > 0.3) {
        setGlow(carGlow, n++, hx, y + 0.68, hz, [1, 0.92, 0.75], 0, 1.6, -1, -1, 1.2, y);
        setGlow(carGlow, n++, tx, y + 0.78, tz, [1, 0.12, 0.06], 0, 1.4, -1, -1, brake ? 1.6 : 0.8, y);
      }
    }
    if (night > 0.2 && !dead) {
      const d = isPlayer ? 11 : 8;
      setGlow(carGlow, n++, x + fx * d, world.ground(x + fx * d, z + fz * d, y + 1) + 0.15, z + fz * d, [1, 0.92, 0.75], 0, isPlayer ? 6 : 4, 1 + 2 * Math.PI + Math.atan2(-fx, fz), -1, isPlayer ? 1.2 : 0.7, y);
    }
    const sm = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(hw * 2.6, 1, hl * 2.3));
    if (sh < 80) shadows.setMatrixAt(sh++, sm);
  };
  lights(player.x, player.y, player.z, player.yaw, player.hl, player.hw, player.braking, true);
  for (const c of traffic.cars) {
    if (n > 760) break;
    if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) > 420) continue;
    lights(c.x, c.y, c.z, c.yaw, c.hl, c.hw, c.brake, false, c.burnt);
  }
  // Door markers for the shops and homes close by, and the cash envelopes.
  const fp = mode === "foot" ? walker : player;
  for (const v of world.venues) {
    const d = Math.hypot(v.x - fp.x, v.z - fp.z);
    const isHome = v.kind === "home", owned = isHome && save.homes.includes(v.id);
    if (isHome && d < 260 && !owned) { const b = saleBoard(v); if (!b.parent) scene.add(b); } else if (isHome && boards.has(v.id) && boards.get(v.id).parent && (owned || d > 300)) boards.get(v.id).removeFromParent();
    if (d > 90 || n > 880) continue;
    const col = hex(owned ? 0x7fd08a : v.accent);
    const bob = Math.sin(time * 2.4 + v.i) * 0.12;
    setGlow(carGlow, n++, v.x, v.gy + 0.08, v.z, col, 1, 1.3, 1, -1, 1.3, v.gy);
    setGlow(carGlow, n++, v.x, v.gy + 1.1 + bob, v.z, col, 1, 0.45, 0, -1, 2.2, v.gy);
  }
  let cn = 0;
  for (const p of hud.pickups || []) {
    if (cn >= 24) break;
    e3.set(0, time * 2 + p.id, 0); q4.setFromEuler(e3); v3.set(p.x, p.y + 0.55 + Math.sin(time * 3 + p.id) * 0.08, p.z);
    m4.compose(v3, q4, s3); cashMesh.setMatrixAt(cn++, m4);
    if (n < 896) setGlow(carGlow, n++, p.x, p.y + 0.55, p.z, [1, 0.8, 0.35], 1, 0.6, 0, -1, 1.4, p.y);
  }
  cashMesh.count = cn; cashMesh.instanceMatrix.needsUpdate = true;
  carGlow.instanceCount = n;
  for (const k of ["iPos", "iCol", "iP", "iG"]) carGlow.attributes[k].needsUpdate = true;
  shadows.count = sh;
  shadows.instanceMatrix.needsUpdate = true;
  playerMesh.visible = (camMode !== 2 || mode === "foot") && state !== "title";

  const q = QUALITY[prefs.quality];
  if (q.shadow && U.uShadowOn.value > 0.01) shadow.update(scene, camera);
  post.render(scene, camera, time, exposure, q.bloom);
}

boot().catch((err) => {
  console.error(err);
  setLoading(`Something went wrong loading the city: ${String(err.message || err).replace(/</g, "&lt;")}`);
});

// Exposed for the local test page.
window.__ac = {
  scene, camera, get me() { return me; }, get walker() { return walker; }, get crowd() { return crowd; }, toggleFoot: () => toggleFoot(), get post() { return post; }, get U() { return U; },
  get world() { return world; }, get player() { return player; }, get traffic() { return traffic; }, get city() { return city; }, setHour: (h) => (hour = h), get renderer() { return renderer; },
  save, get arsenal() { return arsenal; }, get combat() { return combat; }, get inside() { return inside; }, enterVenue: (v) => enterVenue(v), leaveVenue: () => leaveVenue(), showShop: (k) => showShop(k), closeShop: () => closeShop(),
  setCam: (yaw, pitch) => { camYaw = yaw; camPitch = pitch; }, get state() { return state; }, holdCam: (h) => { camHold = h; },
};
