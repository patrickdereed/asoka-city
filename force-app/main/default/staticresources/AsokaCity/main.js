// Go-Live: Asoka City. Entry point: loading, title screen, main loop, camera and car lights, and the
// on-foot game: money, weapons, the shops and homes you walk into, and the save.
import * as THREE from "./three.module.min.js";
import { World, SPAWN, HALF, CHUNK, NCH, TOWER, PLAZA, districtAt } from "./map.js";
import { Crowd, Person, PEOPLE, pockets } from "./people.js";
import { Walker } from "./walker.js";
import { makeUniforms, makeMaterials, makeSky, makeSea, makeSignTexture, makeSignMaterial, buildTower, CityView, applyTimeOfDay, glowGeometry, setGlow, KIT_PARKED } from "./render.js";
import { Vehicle, DT } from "./vehicle.js";
import { Traffic } from "./traffic.js";
import { CAR_TYPES, PLAYER_CAR, trafficGeometry, playerGeometry, wheelGeometry } from "./cars.js";
import { HUD, BigMap, drawMapImage } from "./hud.js";
import { loadKits, asokaLivery, PLAYER_KIT } from "./carkits.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";
import { clamp, lerp, angleWrap, hex, rng } from "./util.js";
import { Geo } from "./geo.js";
import { Post } from "./post.js";
import { SunShadow } from "./shadow.js";
import { Combat } from "./combat.js";
import { Arsenal } from "./arsenal.js";
import { interiorFor } from "./interiors.js";
import { openShop, lookName } from "./shops.js";
import { WEAPON, weaponGeometry, fmtMoney } from "./weapons.js";
import { dress, styleOf, SKIN_TONES, EYE_COLOURS, HAIR_COLOURS, HAIR_STYLES, hairName, SLIDERS, SPOTS, TATTOOS } from "./looks.js";
import { Actors } from "./actors.js";
import { Audit } from "./audit.js";
import { Missions } from "./missions.js";

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
let playerMesh, wheels = [], trafficMeshes = [], parkedMeshes = [], wheelMeshes = [], kits = [], carGlow, carGlowMesh, shadows;
let hour = 18.0, time = 0, camMode = 0, camYaw = 0, camPitch = -0.12, camPos = new THREE.Vector3(), shake = 0;
const CAM_PITCH = -0.12;
let lookIdle = 0, carLook = { yaw: 0, pitch: 0, idle: 0 };   // mouse look on foot and from the car
let state = "loading", acc = 0, last = performance.now(), mapOpen = false;
let inside = null, shop = null, previewMesh = null, hitT = 0, aimPoint = new THREE.Vector3(), creatorSpin = 0, fade, saveT = 0;
let drops = [], ammoGeo = null;   // what knocked-out people dropped: cash, guns, ammo boxes
let cashMesh, boards = new Map(), deadT = 0, pmat, carNow = { k: -1, color: null, livery: true };
let doorPivot = null, doorInfo = null, doorOpen = 0, jack = null, thrown = [], timeScale = 1;
let actors, audit, missions, ownStart = 0, asokaTex = null, carTag = null, lastAim = null, carFireT = 0, keyE = false;

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
  applyPicture();
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
  pmat = mats.prop.clone();
  pmat.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: 1 }, uLivery: { value: pkit ? asokaLivery() : null }, uUseLivery: { value: pkit ? 1 : 0 }, uPaint: { value: new THREE.Vector3(1, 1, 1) } };
  playerMesh = new THREE.Group();
  playerMesh.rotation.order = "YXZ";
  if (pkit) setPlayerCar(kits.indexOf(pkit), null, true);
  else carBody(playerGeometry(), [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ x: sx * (PLAYER_CAR.W / 2 - 0.12), y: PLAYER_CAR.wr, z: sz * (PLAYER_CAR.L / 2 - 0.85), front: sz < 0 })), wheelGeometry(PLAYER_CAR.wr));
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
    for (const k of kits) wheelMeshes.push(inst(k.wheelGeo, (40 + 24) * k.wheels.length));
    traffic.types = bodies.map((b) => b.spec);
    traffic.cabType = Math.max(0, kits.findIndex((k) => k.id === "toyama"));
  }
  // The fleet (Audit cruisers, trucks, vans): drawn as their own meshes, after the instanced kits.
  ownStart = kits.length;
  try {
    const F = await import("./fleet.js");
    for (const k of F.buildFleet(kits)) kits.push(k);
  } catch (e) { console.warn("fleet unavailable", e); }
  crowd = new Crowd(world, scene, U, districtAt);
  crowd.max = QUALITY[prefs.quality].crowd;
  // Running someone over: a thump, a jolt, and it counts as putting them down.
  crowd.onDrop = dropLoot;
  crowd.onHit = (p, v, down) => {
    audio.bang(Math.min(10, v * 0.5));
    shake = Math.max(shake, Math.min(0.6, v * 0.03));
    if (down && combat && combat.onCrime) combat.onCrime("down", p);
  };
  walker = new Walker(world);
  combat = new Combat({ scene, world, U, mats, audio });
  combat.crowd = crowd; combat.traffic = traffic; combat.playerCar = player;
  combat.onShake = (k) => { shake = Math.min(1.2, shake + k); };
  combat.onPlayerHit = (dmg) => hurtPlayer(dmg);
  arsenal = new Arsenal(save, mats, U, combat, audio);
  scene.add(arsenal.mesh);
  // Missions: the people and cars they spawn, the Audit, and the story itself.
  actors = new Actors({ world, scene, U, mats, crowd, traffic, combat, audio, kits, ownStart });
  actors.onHitMe = (dmg) => hurtPlayer(dmg);
  actors.onPickup = (it) => { audio.cash(true); if (it.kind === "cash" && it.value) earn(it.value); hud.toast(it.kind === "cash" ? `+${fmtMoney(it.value)}` : `Picked up the ${it.kind === "drive" ? "hard drive" : it.kind === "case" ? "briefcase" : it.kind}.`, 2); };
  actors.onBoard = (p) => hud.toast(p.team === "vip" ? "They're in." : "Your backup is in the car.", 1.6);
  audit = new Audit({ world, actors, audio, hud });
  audit.onBusted = () => {
    const fine = Math.min(save.money, Math.max(200, Math.round(save.money * 0.08)));
    save.money -= fine;
    hud.toast(`Audited. The fine: ${fmtMoney(fine)}.`, 4);
    missions && missions.playerDown("You were audited.");
  };
  combat.onCrime = (kind, who, silent) => {
    if (silent && kind !== "car") return;
    const at = who && who.x != null ? who : combat.player;
    audit.crime(kind, at, who && who.obj ? who.obj : who);
    if (kind === "shots" || kind === "blast") actors.noise(at.x, at.z, kind === "blast" ? 70 : 45);
  };
  combat.onCarHit = (dmg) => damageCar(dmg);
  let story = {};
  try { story = await import("./story.js"); } catch (e) { console.warn("story unavailable", e); }
  missions = new Missions({
    world, actors, audit, hud, audio, save, scene, U,
    me: () => (mode === "foot" ? { x: walker.x, y: walker.y, z: walker.z } : { x: player.x, y: player.y, z: player.z }),
    driving: () => mode === "drive" && !inside,
    car: () => player, carTag: () => carTag,
    aim: () => lastAim,
    earn: (n) => earn(n), setHour: (h) => (hour = h), saveNow: () => saveNow(),
    name: () => (prefs.character && prefs.character.name) || "", pronouns: () => (prefs.character && prefs.character.pronouns) || "they/them",
    pressed: (code) => (code === "KeyE" ? keyE : input.hit(code)),
    teleport: (x, z) => teleport(x, z),
  }, story);
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
  const m = new THREE.InstancedMesh(geo, mats.prop, 48);
  m.count = 0; m.frustumCulled = false;
  return m;
}

// A box of ammunition: olive with a cream label band.
function makeAmmoGeo() {
  const g = new Geo({ cdata: 2 });
  g.e.cdata = [0, 0];
  g.box(0, 0.08, 0, 0.32, 0.16, 0.18, hex(0x5d6b4a));
  g.box(0, 0.165, 0, 0.12, 0.02, 0.05, hex(0x3d4a4c));
  g.box(0, 0.09, 0.091, 0.2, 0.05, 0.004, hex(0xefe3d2));
  return g.build();
}

// Knocked-out people's belongings: their cash rises out of the body and hangs over its chest (they
// topple away from the hit, head first), anything else lands round them.
function dropLoot(p, items) {
  const reach = ((p.person && p.person.height) || 1.6) * 0.55;
  items.forEach((it, i) => {
    const over = it.kind === "cash";
    const a = i * 2.1 + Math.random() * 1.5;
    const x = over ? p.x + Math.sin(p.fallYaw || 0) * reach : p.x + Math.cos(a) * 0.8;
    const z = over ? p.z + Math.cos(p.fallYaw || 0) * reach : p.z + Math.sin(a) * 0.8;
    const d = { ...it, x, z, y: world.ground(x, z, p.y + 1) + 0.15, t: 0, lift: over ? 0.4 : 0, mesh: null };
    if (it.kind === "gun") d.mesh = new THREE.Mesh(weaponGeometry(it.id), arsenal.mat);
    else if (it.kind === "ammo") d.mesh = new THREE.Mesh(ammoGeo || (ammoGeo = makeAmmoGeo()), mats.prop);
    if (d.mesh) { d.mesh.frustumCulled = false; scene.add(d.mesh); }
    drops.push(d);
  });
  while (drops.length > 30) removeDrop(drops[0]);
}
function removeDrop(d) {
  if (d.mesh) scene.remove(d.mesh);
  drops = drops.filter((q) => q !== d);
}

// Walk (or drive) over a drop to take it.
function collectDrops(at, r) {
  for (const d of [...drops]) {
    d.t += 1 / 60;
    if (Math.hypot(d.x - at.x, d.z - at.z) > 320) { removeDrop(d); continue; }
    if (Math.hypot(d.x - at.x, d.z - at.z) > r || Math.abs(d.y - at.y) > 2.5) continue;
    if (d.kind === "cash") {
      earn(d.value); hud.toast(`Picked up ${fmtMoney(d.value)}`, 2);
    } else {
      const w = WEAPON[d.id], st = save.weapons[d.id];
      if (d.kind === "gun") {
        arsenal.give(d.id);
        hud.toast(st ? `${w.name}: +${w.ammoPack} rounds` : `Picked up a ${w.name} (${w.kind.toLowerCase()})`, 3);
      } else if (st) {
        st.ammo = Math.min(w.ammo, st.ammo + w.ammoPack);
        hud.toast(`${w.name}: +${w.ammoPack} rounds`, 2);
      } else {
        if (!d.warned) hud.toast(`${w.name} ammo. No use without a ${w.kind.toLowerCase()}.`, 3);
        d.warned = true;
        continue;
      }
      audio.cash(true);
    }
    removeDrop(d);
  }
}

// ------------------------------------------------------------------------------ screens

function showTitle() {
  state = "title";
  const home = save.home && world.venues.find((v) => v.id === save.home);
  const resume = !startedOnce && prefs.character && save.where;
  ui.innerHTML = `
    <div class="title">
      <div class="title-card">
        ${LOGO}
        <h1>GO-LIVE</h1>
        <h2>Asoka City</h2>
        <p class="lede">An 8 × 8 km city of towers, isles, docks and hills. Walk into the shops, arm yourself at
        Breakpoint Arms, buy a home. The story and the Audit patrols come next.</p>
        <button class="btn primary" id="t-start">${prefs.character ? `Play as ${esc(prefs.character.name)}${resume ? " · where you left off" : home ? ` · from your ${esc(home.name)}` : ""}` : "Create your character"}</button>
        ${prefs.character ? '<button class="btn" id="t-char">Change your character</button>' : ""}
        <div class="title-row">
          <label>Detail <select id="t-q">${Object.keys(QUALITY).map((k) => `<option ${k === prefs.quality ? "selected" : ""}>${k}</option>`).join("")}</select></label>
          <label>Start at <select id="t-time">${resume ? '<option value="resume" selected>Where you left off</option>' : ""}<option value="18">Golden hour</option><option value="21.5">Night</option><option value="6.4">Sunrise</option><option value="12">Midday</option></select></label>
        </div>
        <ul class="keys">
          <li><kbd>W</kbd><kbd>S</kbd> drive / walk</li><li><kbd>A</kbd><kbd>D</kbd> steer / sidestep</li><li><kbd>F</kbd> get out / in</li>
          <li><kbd>E</kbd> enter, shop, use</li><li>Hold a mouse button: look; right aims, left fires while aiming</li><li><kbd>Q</kbd> or wheel: weapon</li>
          <li><kbd>R</kbd> reload (on foot) / reset car</li><li><kbd>Shift</kbd> jog</li><li><kbd>C</kbd> camera · <kbd>M</kbd> map</li><li><kbd>H</kbd> horn · <kbd>[</kbd><kbd>]</kbd> time</li>
        </ul>
        <p class="fine">Hold a mouse button to look around; let go and the camera swings back behind you. Gamepads: sticks move and look, triggers aim and fire, X to use. Press <kbd>?</kbd> in the city for every control, and Esc for brightness and contrast.</p>
      </div>
    </div>`;
  ui.classList.remove("hidden");
  $("t-q").onchange = (e) => { prefs.quality = e.target.value; savePrefs(); applyQuality(); };
  if ($("t-char")) $("t-char").onclick = () => showCreator();
  $("t-start").onclick = async () => {
    if (!prefs.character) { showCreator(); return; }
    const t = $("t-time").value, back = resume && t === "resume";
    hour = back ? save.where.hour : parseFloat(t);
    audio.start();
    ui.classList.add("hidden");
    if (back) await streamAround(save.where.foot && save.where.at ? save.where.at : save.where.car);
    $("hud").classList.remove("hidden");
    state = "play";
    if (back && !startedOnce) resumeWhere(save.where);
    else if (home && !startedOnce) startAtHome(home);
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

// Build the blocks round a spot before play starts there, behind the loading card, as boot does.
let streamTo = null;   // while set, the city streams round here, not round the camera
async function streamAround(p) {
  if (!p || !isFinite(p.x) || !isFinite(p.z)) return;
  streamTo = { x: p.x, z: p.z };
  loading.classList.remove("hidden");
  let pending = 1, guard = 0;
  while (pending > 0 && guard++ < 200) {
    pending = city.update({ x: p.x, z: p.z }, 40);
    setLoading(`Back to where you left off · ${pending} to go`);
    await frame();
  }
  streamTo = null;
  loading.classList.add("hidden");
}

// Where you are, kept with the save so the next session starts there: on foot or driving, which
// car and how knocked about it is, the time of day and the way you face. In a shop or a home it's
// the street door; mid-jump, mid-jack or knocked out, the last good spot stands.
function snapshot() {
  if ((state !== "play" && state !== "pause") || jack || deadT > 0 || save.hp <= 0) return;
  const v = inside && inside.v, foot = mode === "foot" || !!v;
  if (foot && !v && walker.vy < -0.5) return;
  const prev = save.where || {};
  const car = player.inWater > 0 ? prev.car : { x: player.x, z: player.z, yaw: player.yaw, k: carNow.k, color: carNow.color, livery: carNow.livery, hp: player.hp0 ? player.hp / player.hp0 : 1 };
  const at = v ? { x: v.x, y: null, z: v.z, yaw: v.yawOut } : foot ? { x: walker.x, y: walker.y, z: walker.z, yaw: walker.yaw } : null;
  save.where = { foot, hour, at, car, t: Date.now() };
}

// Start the session back there. Anything that no longer makes sense (off the map, in the water) falls
// back to the nearest road. Missions under way start again from their contact; the Audit forgets.
function resumeWhere(w) {
  const ok = (p) => p && isFinite(p.x) && isFinite(p.z) && Math.abs(p.x) < HALF - 60 && Math.abs(p.z) < HALF - 60;
  const toRoad = (x, z) => { const r = world.nearestRoad(x, z); return r ? world.edgePoint(r.e, r.s, r.e.laneOff[0]) : null; };
  const c = w.car;
  if (ok(c)) {
    if (c.k != null && c.k >= 0 && kits[c.k] && c.k !== carNow.k) setPlayerCar(c.k, c.color, c.livery);
    player.place(c.x, c.z, c.yaw);
    if (!world.onDeck && player.y < 0.25) { const p = toRoad(c.x, c.z); if (p) player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); }
    if (c.hp != null && player.hp0) player.hp = player.hp0 * clamp(c.hp, 0.05, 1);
  }
  if (w.foot && ok(w.at) && me) {
    walker.place(w.at.x, w.at.z, w.at.yaw, w.at.y);
    if (walker.support(walker.x, walker.z, walker.y).water) { const p = toRoad(w.at.x, w.at.z); if (p) walker.place(p.x, p.z, w.at.yaw); }
    mode = "foot"; me.holder.visible = true;
    camYaw = walker.yaw; camPitch = -0.12;
    camPos.set(walker.x + Math.sin(walker.yaw) * 4, walker.y + 2, walker.z + Math.cos(walker.yaw) * 4);
  } else {
    mode = "drive"; if (me) me.holder.visible = false;
    camYaw = player.yaw;
    camPos.set(player.x + Math.sin(player.yaw) * 7, player.y + 2.5, player.z + Math.cos(player.yaw) * 7);
  }
  hud.toast("Back where you left off.", 4);
}

// Every control, for the pause menu and the in-game list (? key): keyboard and mouse, gamepad, what it does.
const CONTROLS = [
  ["On foot", [["W A S D", "Left stick", "Walk"], ["Shift", "A", "Jog"], ["Hold mouse, ← →", "Right stick", "Look (recentres on release)"], ["Right mouse, K", "LT", "Aim"],
    ["Left mouse, Space (aiming)", "RT (with LT)", "Fire, punch"], ["R", "B", "Reload"], ["Q, Z, wheel", "RB, LB", "Next, previous weapon"], ["1 to 8, 0", "", "Weapon slot, fists"],
    ["E", "X", "Go into a shop or home, use; talk to a contact"], ["F", "Y", "Get in, steal or break into a car"]]],
  ["Driving", [["W, ↑", "RT", "Accelerate"], ["S, ↓", "LT", "Brake, reverse"], ["A D, ← →", "Left stick", "Steer"], ["Hold mouse", "Right stick", "Look around"], ["Space", "A", "Handbrake"],
    ["H", "", "Horn"], ["F", "Y", "Get out"], ["R", "B", "Back on the road"]]],
  ["Any time", [["C", "", "Camera"], ["M", "Back", "Map"], ["Y", "", "Retry a failed mission"], ["[ ]", "", "Hour back, forward"], ["?", "", "Show or hide this list"], ["Esc", "Start", "Pause, picture settings"]]],
];
const keyCaps = (t) => t ? t.split(", ").map((k) => `<kbd>${esc(k)}</kbd>`).join(" ") : "";
function controlsHTML() {
  const sec = ([h, rows]) => `<h3>${h}</h3><table>${rows.map(([k, p, what]) => `<tr><td>${keyCaps(k)}</td><td class="pad">${keyCaps(p)}</td><td>${what}</td></tr>`).join("")}</table>`;
  return `<div class="ctl"><section>${sec(CONTROLS[0])}</section><section>${CONTROLS.slice(1).map(sec).join("")}</section></div>`;
}

// The in-game list: stays up over play until ? again.
let keysPanel = null;
function toggleKeys(on = !keysPanel || keysPanel.classList.contains("hidden")) {
  if (!keysPanel) {
    keysPanel = document.createElement("div");
    keysPanel.className = "keys-panel hidden";
    keysPanel.innerHTML = `<div class="kp-head"><b>Controls</b><span><kbd>?</kbd> to hide</span></div>${controlsHTML()}`;
    $("ac").appendChild(keysPanel);
  }
  keysPanel.classList.toggle("hidden", !on);
}

// Picture settings, kept per player: brightness and contrast on top of the time of day's own exposure.
function applyPicture() {
  post.bright = prefs.bright || 1;
  post.contrast = prefs.contrast || 1;
}
const pct = (v) => `${Math.round(v * 100)}%`;

function showControls() {
  ui.innerHTML = `
    <div class="title"><div class="title-card wide">
      <h2>Controls</h2>
      ${controlsHTML()}
      <p class="fine">Press <kbd>?</kbd> while you play to see this list without pausing.</p>
      <button class="btn primary" id="k-back">Back</button>
    </div></div>`;
  $("k-back").onclick = showPause;
}

function showPause() {
  state = "pause";
  releaseMouse();
  saveNow();
  ui.innerHTML = `
    <div class="title"><div class="title-card small">
      ${LOGO}<h2>Paused</h2>
      <button class="btn primary" id="p-go">Resume</button>
      <button class="btn" id="p-map">Map</button>
      <button class="btn" id="p-keys">Controls</button>
      <button class="btn" id="p-reset">Put the car back on the road</button>
      <button class="btn" id="p-char">Change your character</button>
      <div class="pic">
        <label>Brightness <input type="range" id="p-bright" min="0.5" max="2.5" step="0.05" value="${prefs.bright || 1}"><span id="p-bright-v">${pct(prefs.bright || 1)}</span></label>
        <label>Contrast <input type="range" id="p-con" min="0.6" max="1.5" step="0.05" value="${prefs.contrast || 1}"><span id="p-con-v">${pct(prefs.contrast || 1)}</span></label>
        <button class="btn mini" id="p-pic">Reset picture</button>
      </div>
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
  $("p-keys").onclick = showControls;
  const pic = (id, key) => {
    $(id).oninput = (e) => { prefs[key] = parseFloat(e.target.value); $(`${id}-v`).textContent = pct(prefs[key]); applyPicture(); };
    $(id).onchange = savePrefs;
  };
  pic("p-bright", "bright"); pic("p-con", "contrast");
  $("p-pic").onclick = () => { prefs.bright = 1; prefs.contrast = 1; savePrefs(); applyPicture(); showPause(); };
  $("p-char").onclick = () => showCreator(true);
  $("p-q").onchange = (e) => { prefs.quality = e.target.value; savePrefs(); applyQuality(); };
  $("p-time").onchange = (e) => { if (e.target.value) hour = parseFloat(e.target.value); };
}

function resume() { ui.classList.add("hidden"); state = "play"; last = performance.now(); }

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The lead character: identity and pronouns are the player's choice and are independent of the look. Their
// own features (hair, skin, eyes, nose, ears, tattoos) go on top of whichever look they wear.
async function setCharacter(lookId) {
  const p = await Person.create(lookId, U);
  if (!p) return;
  await dress(p, prefs.character && prefs.character.style);
  const parent = me && me.holder.parent;
  const vis = me ? me.holder.visible : false;
  if (me) me.holder.removeFromParent();
  me = p;
  me.holder.visible = vis;
  (parent || scene).add(me.holder);
  me.arms = (person) => (mode === "foot" && state !== "creator" ? (jack ? jackArms(person) : arsenal.pose(person)) : null);
  walker.person = me;
}

// First time: every look is free to pick. Afterwards the look list is your wardrobe; Sandbox Threads sells the rest.
// Hair, skin, face and tattoos can be changed any time from here.
const CREATOR_TABS = [["you", "You"], ["look", "Look & skin"], ["hair", "Hair"], ["face", "Face"], ["ink", "Tattoos"]];
let creatorTab = "you", creatorZoom = 0;
function showCreator(fromPause = false) {
  state = "creator";
  creatorSpin = 0;
  releaseMouse();
  $("hud").classList.add("hidden");
  const first = !prefs.character;
  const c = prefs.character || { name: window.AC_NAME || "Alex", identity: "man", pronouns: "he/him", look: (PEOPLE.find((p) => p.g === "m") || PEOPLE[0]).id };
  const style = styleOf(c.style);
  const looks = first ? PEOPLE : PEOPLE.filter((p) => save.outfits.includes(p.id));
  creatorLook = Math.max(0, looks.findIndex((p) => p.id === (save.look || c.look)));
  const swatches = (key, list, natural) => `<div class="swatches" role="radiogroup" data-key="${key}">
      <button class="sw natural" data-v="" aria-label="${natural}" title="${natural}"></button>
      ${list.map(([n, h]) => `<button class="sw" data-v="${h}" style="--c:${h}" aria-label="${n}" title="${n}"></button>`).join("")}
    </div>`;
  ui.innerHTML = `
    <div class="creator">
      <div class="title-card small creator-card">
        ${LOGO}
        <h2>Your character</h2>
        <nav class="ctabs" role="tablist">${CREATOR_TABS.map(([k, l]) => `<button role="tab" data-tab="${k}">${l}</button>`).join("")}</nav>
        <section data-tab="you">
          <label class="field">Name<input id="c-name" maxlength="24" value="${esc(c.name)}" autocomplete="off"></label>
          <fieldset class="seg"><legend>I am</legend>
            ${[["man", "A man"], ["woman", "A woman"], ["nonbinary", "Non-binary"]].map(([v, l]) => `<label><input type="radio" name="c-id" value="${v}" ${c.identity === v ? "checked" : ""}><span>${l}</span></label>`).join("")}
          </fieldset>
          <label class="field">Pronouns the story uses<select id="c-pro">${["he/him", "she/her", "they/them"].map((v) => `<option ${c.pronouns === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        </section>
        <section data-tab="look">
          <p class="lbl">Look</p>
          <div class="look"><button class="btn" id="c-prev" aria-label="Previous look">‹</button><span id="c-look"></span><button class="btn" id="c-next" aria-label="Next look">›</button></div>
          <p class="fine">${first ? "Every look is open to everyone, whoever you are." : "These are the looks you own. Sandbox Threads sells the rest."}</p>
          <p class="lbl">Skin tone</p>
          ${swatches("skin", SKIN_TONES.map((h, i) => [`Tone ${i + 1}`, h]), "This look's own skin tone")}
        </section>
        <section data-tab="hair">
          <p class="lbl">Style</p>
          <div class="look"><button class="btn" id="h-prev" aria-label="Previous hair style">‹</button><span id="h-name"></span><button class="btn" id="h-next" aria-label="Next hair style">›</button></div>
          <p class="lbl">Colour</p>
          ${swatches("hairCol", HAIR_COLOURS, "Natural colour")}
          <p class="fine">The colour also goes on your brows.</p>
        </section>
        <section data-tab="face">
          <p class="lbl">Eye colour</p>
          ${swatches("eyeCol", EYE_COLOURS, "This look's own eye colour")}
          ${SLIDERS.map(([k, l]) => `<label class="slider"><span>${l}</span><input type="range" min="-1" max="1" step="0.05" data-key="${k}" value="${style[k]}"></label>`).join("")}
          <button class="btn mini" id="f-reset">Reset face</button>
        </section>
        <section data-tab="ink">
          <div class="seg"><label><input type="radio" name="ink-col" value="0" ${style.inkCol ? "" : "checked"}><span>Black ink</span></label><label><input type="radio" name="ink-col" value="1" ${style.inkCol ? "checked" : ""}><span>Colour</span></label></div>
          <div class="ink-list">${SPOTS.map((sp) => `<label class="ink-row"><span>${sp.name}<small data-spot="${sp.id}"></small></span><select data-spot="${sp.id}"><option value="">None</option>${TATTOOS.map((t) => `<option value="${t.id}" ${style.ink[sp.id] === t.id ? "selected" : ""}>${t.name}</option>`).join("")}</select></label>`).join("")}</div>
          <p class="fine">Tattoos show on bare skin, so some outfits cover them.</p>
        </section>
        <p class="fine">Drag to turn around.</p>
        <button class="btn primary" id="c-go">${fromPause ? "Done" : "Start in Asoka City"}</button>
      </div>
    </div>`;
  ui.classList.remove("hidden");
  const setTab = (k) => {
    creatorTab = k;
    ui.querySelectorAll(".ctabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === k));
    ui.querySelectorAll(".creator-card section").forEach((sec) => { sec.hidden = sec.dataset.tab !== k; });
  };
  ui.querySelectorAll(".ctabs button").forEach((b) => b.onclick = () => setTab(b.dataset.tab));
  setTab(first ? "you" : creatorTab);
  // Every change restyles the character in place.
  let busy = Promise.resolve();
  const restyle = () => {
    const snap = styleOf(style);
    busy = busy.then(() => dress(me, snap)).then((rep) => {
      ui.querySelectorAll(".ink-row small").forEach((el) => { el.textContent = rep && rep.covered.includes(el.dataset.spot) ? " · covered by this outfit" : ""; });
    }).catch((e) => console.warn("restyle", e));
  };
  const markSwatches = () => ui.querySelectorAll(".swatches").forEach((g) => g.querySelectorAll(".sw").forEach((b) => b.setAttribute("aria-checked", (style[g.dataset.key] || "") === b.dataset.v)));
  ui.querySelectorAll(".swatches").forEach((g) => g.querySelectorAll(".sw").forEach((b) => b.onclick = () => { style[g.dataset.key] = b.dataset.v || null; markSwatches(); restyle(); }));
  markSwatches();
  let slideT = null;
  ui.querySelectorAll(".slider input").forEach((r) => r.oninput = () => { style[r.dataset.key] = parseFloat(r.value); clearTimeout(slideT); slideT = setTimeout(restyle, 40); });
  $("f-reset").onclick = () => { for (const [k] of SLIDERS) style[k] = 0; style.eyeCol = null; ui.querySelectorAll(".slider input").forEach((r) => { r.value = 0; }); markSwatches(); restyle(); };
  const showHair = () => { $("h-name").textContent = `${hairName(style.hair)} · ${HAIR_STYLES.indexOf(style.hair) + 1} of ${HAIR_STYLES.length}`; };
  const stepHair = (d) => { const i = Math.max(0, HAIR_STYLES.indexOf(style.hair)); style.hair = HAIR_STYLES[(i + d + HAIR_STYLES.length) % HAIR_STYLES.length]; showHair(); restyle(); };
  $("h-prev").onclick = () => stepHair(-1);
  $("h-next").onclick = () => stepHair(1);
  showHair();
  ui.querySelectorAll('input[name="ink-col"]').forEach((r) => r.onchange = () => { style.inkCol = r.value === "1"; restyle(); });
  ui.querySelectorAll(".ink-list select").forEach((sel) => sel.onchange = () => { if (sel.value) style.ink[sel.dataset.spot] = sel.value; else delete style.ink[sel.dataset.spot]; restyle(); });
  const showLook = () => {
    const p = looks[creatorLook];
    $("c-look").textContent = `${lookName(p, PEOPLE.indexOf(p))} · ${creatorLook + 1} of ${looks.length}`;
    if (prefs.character) prefs.character.style = styleOf(style);
    busy = busy.then(() => setCharacter(p.id)).then(() => { if (me) me.holder.visible = true; restyle(); });
  };
  document.querySelectorAll('input[name="c-id"]').forEach((r) => r.onchange = () => { $("c-pro").value = PRONOUNS[r.value]; });
  $("c-prev").onclick = () => { creatorLook = (creatorLook + looks.length - 1) % looks.length; showLook(); };
  $("c-next").onclick = () => { creatorLook = (creatorLook + 1) % looks.length; showLook(); };
  $("c-go").onclick = () => {
    const identity = document.querySelector('input[name="c-id"]:checked').value;
    const look = looks[creatorLook].id;
    prefs.character = { name: $("c-name").value.trim() || "Alex", identity, pronouns: $("c-pro").value, look, style: styleOf(style) };
    save.look = look;
    if (!save.outfits.includes(look)) save.outfits.push(look);
    savePrefs();
    if (me) me.holder.visible = mode === "foot";
    if (fromPause) { $("hud").classList.remove("hidden"); resume(); return; }
    showTitle();
    $("t-start").click();
  };
  if (first || !me || me.id !== looks[creatorLook].id) showLook();
  else { me.holder.visible = true; restyle(); }
}

const CREATOR_SPOT = { x: PLAZA.cx, z: PLAZA.z1 - 40 };
// Turn the character in the creator by dragging.
let drag = null;
addEventListener("pointerdown", (e) => { if (state === "creator" && e.target === canvas) drag = e.clientX; });
addEventListener("pointermove", (e) => { if (drag != null) { creatorSpin += (e.clientX - drag) * 0.01; drag = e.clientX; } });
addEventListener("pointerup", () => { drag = null; });

// Mouse look while a button is held: pointer lock for the hold so the view can turn all the
// way round, released with the button (dragging still works if the lock is refused).
canvas.addEventListener("mousedown", () => {
  if (state === "play" && !mapOpen && !document.pointerLockElement) {
    try { const r = canvas.requestPointerLock && canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed in this frame */ }
  }
});
addEventListener("mouseup", () => { if (!input.buttons.size) releaseMouse(); });
function releaseMouse() { if (document.pointerLockElement) document.exitPointerLock(); }

// Get out of the car on the driver's side, or back in when close to it.
// ------------------------------------------------------------------------------------- cars

// The player's car body and its four spinning wheels (front pair first, for steering), with the driver's
// door on its own hinge when the model has one.
function carBody(body, spots, wheelGeo, split = null) {
  for (const c of [...playerMesh.children]) playerMesh.remove(c);
  wheels = [];
  const m = new THREE.Mesh(split ? split.rest : body, pmat);
  m.layers.enable(1);
  playerMesh.add(m);
  doorPivot = null; doorInfo = split;
  if (split) {
    doorPivot = new THREE.Group();
    doorPivot.position.set(...split.pivot);
    const d = new THREE.Mesh(split.door, pmat);
    d.layers.enable(1);
    doorPivot.add(d);
    playerMesh.add(doorPivot);
  }
  for (const ws of [...spots].sort((p, q) => (q.front ? 1 : 0) - (p.front ? 1 : 0))) {
    const w = new THREE.Mesh(wheelGeo, pmat);
    w.position.set(ws.x, ws.y, ws.z);
    w.rotation.order = "YXZ";
    w.layers.enable(1);
    playerMesh.add(w); wheels.push(w);
  }
}

// Drive a different model: the Asoka livery, or a plain paint colour.
function setPlayerCar(k, color, livery = false) {
  const kit = kits[k];
  carNow = { k, color, livery };
  player.setSpec({ ...PLAYER_CAR, L: kit.spec.L, W: kit.spec.W, wr: kit.spec.wr, mass: kit.spec.mass > PLAYER_CAR.mass * 1.6 ? kit.spec.mass : PLAYER_CAR.mass });
  player.hp = player.hp0 = kit.spec.mass > 4000 ? 1800 : kit.spec.mass > 2000 ? 1200 : 1000;
  player.smoke = 0;
  // The Asoka car wears the fleet livery; fleet vehicles their own.
  if (!asokaTex) asokaTex = pmat.uniforms.uLivery.value;
  pmat.uniforms.uLivery.value = kit.livery || asokaTex;
  if (kit.livery) livery = true;
  pmat.uniforms.uUseLivery.value = livery ? 1 : 2;
  if (!livery) pmat.uniforms.uPaint.value.set(...hex(color));
  carBody(kit.body, kit.wheels, kit.wheelGeo, splitDoor(kit));
}

// Cut each model's driver door out of the body, once, so it can swing open. Traffic drives on the right, so
// the driver sits on the left (-x); the door runs back from the front wheel arch about half way to the rear.
function splitDoor(kit) {
  if (kit.split !== undefined) return kit.split;
  const src = kit.body, A = src.attributes, P = A.position.array;
  src.computeBoundingBox();
  const bb = src.boundingBox, wr = kit.spec.wr;
  const zF = Math.min(...kit.wheels.map((w) => w.z)), zR = Math.max(...kit.wheels.map((w) => w.z));
  const zA = zF + wr + 0.2, len = clamp((zR - wr - 0.1 - zA) * 0.55, 0.85, 1.2);
  const x1 = bb.min.x * 0.6, y0 = wr * 0.95, y1 = bb.max.y - 0.07, e = 0.05;
  // Whole triangles only: a long one reaching past the outline stays on the body rather than tearing off a spike.
  const inside = (o) => P[o] < x1 && P[o + 2] > zA - e && P[o + 2] < zA + len + e && P[o + 1] > y0 - e && P[o + 1] < y1;
  const names = Object.keys(A), rest = {}, door = {};
  for (const n of names) { rest[n] = []; door[n] = []; }
  for (let t = 0; t < P.length / 9; t++) {
    const o = t * 9;
    const out = inside(o) && inside(o + 3) && inside(o + 6) ? door : rest;
    for (const n of names) { const a = A[n], k = a.itemSize; for (let i = t * 3 * k; i < (t * 3 + 3) * k; i++) out[n].push(a.array[i]); }
  }
  if (door.position.length < 90) { kit.split = null; return null; }
  for (let i = 0; i < door.position.length; i += 3) { door.position[i] -= bb.min.x; door.position[i + 2] -= zA; }
  const geo = (d) => {
    const g = new THREE.BufferGeometry();
    for (const n of names) g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(d[n]), A[n].itemSize));
    g.computeBoundingSphere();
    return g;
  };
  kit.split = { rest: geo(rest), door: geo(door), pivot: [bb.min.x, 0, zA], hw: -bb.min.x, zA, len };
  return kit.split;
}

const parkedKit = (p) => Math.floor(Math.abs(p.x * 7.13 + p.z * 3.71)) % parkedMeshes.length;

// How far a point is from a car's footprint.
function carGap(x, z, c, hl, hw) {
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), dx = x - c.x, dz = z - c.z;
  return Math.hypot(Math.max(Math.abs(dx * fx + dz * fz) - hl, 0), Math.max(Math.abs(dx * fz - dz * fx) - hw, 0));
}

// The car you'd get into from here: your own first, then the nearest one in traffic or at the kerb.
function carNear(x, z) {
  if (carGap(x, z, player, player.hl, player.hw) < 2) return { kind: "own" };
  if (!kits.length) return null;
  let best = null, bd = 1.4;
  for (const c of traffic.cars) {
    if (c.burnt || Math.abs(c.x - x) > 8 || Math.abs(c.z - z) > 8) continue;
    const d = carGap(x, z, c, c.hl, c.hw);
    if (d < bd) { bd = d; best = { kind: c.mode === "parked" || (c.ai && (c.tag || c.ai === "park" || c.arrived || c.disabled || c.v < 0.5)) ? "left" : "traffic", c }; }
  }
  for (const v of city.views.values()) {
    if (!v.street) continue;
    const d0 = v.data;
    if (x < d0.x0 - 8 || x > d0.x0 + CHUNK + 8 || z < d0.z0 - 8 || z > d0.z0 + CHUNK + 8) continue;
    for (const p of d0.parked) {
      if (Math.abs(p.x - x) > 8 || Math.abs(p.z - z) > 8) continue;
      const k = parkedKit(p), sp = kits[k].spec;
      const d = carGap(x, z, p, sp.L / 2, sp.W / 2);
      if (d < bd) { bd = d; best = { kind: "parked", p, list: d0.parked, k }; }
    }
  }
  return best;
}

const CAR_PROMPT = { own: "<kbd>F</kbd> Get in", left: "<kbd>F</kbd> Get in", traffic: "<kbd>F</kbd> Steal this car", parked: "<kbd>F</kbd> Break in" };

// Take another car. The one you were driving stays at the kerb until something shunts it or you leave it behind.
function takeCar(t) {
  const old = { ...carNow, x: player.x, y: player.y, z: player.z, yaw: player.yaw };
  let next;
  if (t.kind === "parked") {
    const p = t.p;
    t.list.splice(t.list.indexOf(p), 1);
    p.box.x1 = p.box.x0 - 1; p.box.y1 = -999;
    next = { k: t.k, color: p.color, livery: false, x: p.x, z: p.z, yaw: p.yaw };
    crowd.alarm(p.x, p.z, 12, p.x, p.z);
    hud.toast("You force the door and hot-wire it.", 2.5);
  } else {
    const c = t.c;
    traffic.cars.splice(traffic.cars.indexOf(c), 1);
    next = { k: c.type, color: c.color, livery: !!c.livery, x: c.x, z: c.z, yaw: c.yaw, tag: c.tag || null, hp: c.ai ? c.hp / c.hp0 : 1 };
    if (c.ai) { c.taken = true; if (c.mesh) c.mesh.visible = false; c.gone = true; if (c.mesh) scene.remove(c.mesh); }
    if (t.kind === "traffic") {
      crowd.alarm(c.x, c.z, 25, c.x, c.z);
      if (!c.ai || !c.tag) combat.onCrime("jack", { x: c.x, z: c.z });
    }
  }
  const t0 = kits[old.k] && traffic.types.indexOf(kits[old.k].spec);
  // A mission car, or one of the fleet, stays a mission car when you leave it.
  if (carTag || old.k >= ownStart) {
    const c = actors.spawnCar({ kit: kits[old.k].id, tag: carTag, color: old.color ?? 0xfffdf9, ai: "park", blip: !!carTag }, old.x, old.z, old.yaw);
    c.x = old.x; c.z = old.z; c.y = old.y; c.yaw = old.yaw;
    c.hp = c.hp0 * clamp(player.hp / (player.hp0 || 1000), 0.05, 1);
  } else if (t0 >= 0) {
    const sp = traffic.types[t0];
    traffic.cars.push({ mode: "parked", type: t0, spec: sp, m: sp.mass, color: old.color ?? 0xfffdf9, livery: old.livery,
      x: old.x, y: old.y, z: old.z, yaw: old.yaw, v: 0, vx: 0, vz: 0, r: 0, stuck: 0, ignore: 0, hl: sp.L / 2, hw: sp.W / 2, spin: 0, brake: false });
  }
  setPlayerCar(next.k, next.color, next.livery);
  if (next.hp != null) player.hp = player.hp0 * clamp(next.hp, 0.05, 1);
  carTag = next.tag || null;
  player.place(next.x, next.z, next.yaw);
}

function toggleFoot() {
  if (!me) { hud.toast("Your character is still loading.", 2); return; }
  if (jack) return;
  if (mode === "drive") {
    if (player.speed > 4) { hud.toast("Slow down to get out.", 2); return; }
    mode = "foot";
    camYaw = player.yaw; camPitch = -0.15;
    startJack("out");
  } else {
    const t = carNear(walker.x, walker.z);
    if (!t) { hud.toast("Walk up to a car to get in.", 2); return; }
    if (t.kind !== "own") takeCar(t);
    startJack(t.kind === "traffic" ? "traffic" : t.kind === "parked" ? "parked" : "own");
  }
}

// Getting in and out goes through the driver's door: walk up, open it (forcing it on a parked car, or
// dragging the driver out of one in traffic), climb in and pull it shut. Times in seconds.
const JACK = {
  own: { walk: 0.45, open: [0.45, 0.8], into: [0.8, 1.2], close: [1.15, 1.5] },
  parked: { walk: 0.45, jimmy: [0.45, 1.1], open: [1.1, 1.45], into: [1.45, 1.85], close: [1.8, 2.15] },
  traffic: { walk: 0.4, open: [0.4, 0.75], pull: [0.75, 1.2], into: [1.35, 1.75], close: [1.7, 2.05] },
  out: { walk: 0, open: [0, 0.3], out: [0.15, 0.6], close: [0.65, 0.95] },
};
const DOOR_ANGLE = 1.35;

// A point beside the player's car: lx to the right, lz toward the back.
function carPt(lx, lz) {
  const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
  return { x: player.x + c * lx + s * lz, z: player.z - s * lx + c * lz };
}

function startJack(kind) {
  jack = { kind, T: JACK[kind], t: 0, x0: walker.x, z0: walker.z, yaw0: walker.yaw, hand: null, hand2: null, handW: 0, snd: 0, driver: null };
  const d = doorInfo || { hw: player.hw, zA: -0.35, len: 1 };
  if (kind === "out") { const p = carPt(-d.hw * 0.4, d.zA + 0.6 * d.len); walker.place(p.x, p.z, player.yaw + Math.PI / 2); me.holder.visible = false; }
  if (kind === "traffic") {
    // Someone who's already loaded for the pavements, so they're there in time.
    const ids = crowd.people.map((p) => p.person.id);
    const id = ids.length ? ids[Math.floor(Math.random() * ids.length)] : PEOPLE[Math.floor(Math.random() * PEOPLE.length)].id;
    const j = jack;
    Person.create(id, U).then((p) => {
      if (!p || jack !== j || j.t > j.T.pull[0]) return;
      j.driver = p; p.holder.visible = false; scene.add(p.holder);
    });
  }
}

function updateJack(dt) {
  const j = jack, T = j.T, d = doorInfo || { hw: player.hw, zA: -0.35, len: 1 };
  j.t += dt;
  const t = j.t, ph = (r) => (r ? clamp((t - r[0]) / (r[1] - r[0]), 0, 1) : 0), ease = (k) => k * k * (3 - 2 * k);
  const spot = carPt(-(d.hw + 0.5), d.zA + 1.05 * d.len), seat = carPt(-d.hw * 0.4, d.zA + 0.6 * d.len);
  const face = player.yaw - Math.PI / 2;
  doorOpen = ease(ph(T.open)) * (1 - ease(ph(T.close)));
  // In the seat you sit low, so you climb in and out rather than standing through the roof.
  let px, pz, sit;
  if (j.kind === "out") {
    const k = ease(ph(T.out));
    px = lerp(seat.x, spot.x, k); pz = lerp(seat.z, spot.z, k);
    sit = 1 - ease(Math.min(1, k * 1.5));
    me.holder.visible = t >= T.out[0];
  } else {
    const k = ease(clamp(t / T.walk, 0, 1)), ki = ease(ph(T.into));
    px = lerp(lerp(j.x0, spot.x, k), seat.x, ki); pz = lerp(lerp(j.z0, spot.z, k), seat.z, ki);
    sit = ease(Math.max(0, ki * 1.5 - 0.5));
    walker.yaw = j.yaw0 + angleWrap(face - j.yaw0) * k;
    me.holder.visible = ki < 0.9;
  }
  const speed = Math.hypot(px - walker.x, pz - walker.z) / Math.max(dt, 1e-3);
  walker.x = px; walker.z = pz;
  me.holder.position.set(walker.x, walker.y - 0.55 * sit, walker.z);
  me.holder.rotation.y = walker.yaw;

  // Sounds: the lock giving, the door.
  if (T.jimmy && j.snd === 0 && t > T.jimmy[0] + 0.2) { j.snd = 1; audio.bang(2.5, "knock"); }
  if (T.jimmy && j.snd === 1 && t > T.jimmy[1] - 0.15) { j.snd = 2; audio.bang(4, "knock"); }
  if (j.snd < 3 && t > T.open[0]) { j.snd = 3; audio.bang(1.5, "knock"); }
  if (j.snd < 4 && t > T.close[1] - 0.08) { j.snd = 4; audio.bang(3, "knock"); }

  // The driver: hauled out past the open door, then thrown down on the road.
  const D = j.driver;
  if (D && T.pull) {
    const k = ph(T.pull);
    D.holder.visible = t >= T.pull[0];
    const from = carPt(-d.hw * 0.4, d.zA + 0.62 * d.len), to = carPt(-(d.hw + 1.25), d.zA + 0.62 * d.len);
    const x = lerp(from.x, to.x, ease(k)), z = lerp(from.z, to.z, ease(k));
    D.holder.position.set(x, world.height(x, z) + 0.15 - 0.55 * (1 - ease(Math.min(1, k * 1.6))), z);
    D.holder.rotation.set(0, face, 0);
    D.update(dt, 0);
    D.holder.updateMatrixWorld(true);
    if (k >= 1) {
      const ax = to.x - from.x, az = to.z - from.z, l = Math.hypot(ax, az) || 1;
      thrown.push({ person: D, t: 0, x, z, y: world.height(x, z) + 0.15, vx: (ax / l) * 2.2, vz: (az / l) * 2.2, fallYaw: Math.atan2(ax, az) });
      j.driver = null;
      hud.toast("You drag the driver out and take the car.", 2.5);
    }
  }

  // Hands: on the door handle while it opens, then on the driver's collar.
  j.hand = j.hand2 = null; j.handW = 0;
  const w = (a, b) => clamp(Math.min((t - a) / 0.15, (b - t) / 0.15), 0, 1);
  if (doorPivot && j.kind !== "out") {
    const a = T.walk - 0.12, b = T.open[0] + 0.2;
    if (w(a, b) > 0) { playerMesh.updateMatrixWorld(true); j.hand = doorPivot.localToWorld(new THREE.Vector3(-0.04, 0.95, d.len * 0.85)); j.handW = w(a, b); }
  }
  if (D && T.pull && t > T.pull[0] - 0.15 && t < T.pull[1]) {
    j.hand = D.bones.Bip01_L_UpperArm.getWorldPosition(new THREE.Vector3());
    j.hand2 = D.bones.Bip01_R_UpperArm.getWorldPosition(new THREE.Vector3());
    j.handW = w(T.pull[0] - 0.15, T.pull[1]);
  }
  me.update(dt, Math.min(speed, 3), 0);

  if (t >= T.close[1]) {
    jack = null; doorOpen = 0;
    if (j.kind === "out") walker.place(walker.x, walker.z, walker.yaw);
    else { mode = "drive"; me.holder.visible = false; releaseMouse(); }
    if (j.driver) scene.remove(j.driver.holder);
  }
}

function jackArms(person) {
  if (!jack || !jack.hand || jack.handW < 0.01) return null;
  const F = person.frame();
  const poleR = F.up.clone().multiplyScalar(-1).addScaledVector(F.right, 0.7).addScaledVector(F.fwd, -0.3);
  const poleL = F.up.clone().multiplyScalar(-1).addScaledVector(F.right, -0.7).addScaledVector(F.fwd, -0.3);
  return { w: jack.handW, right: jack.hand, left: jack.hand2, poleR, poleL };
}

// Drivers you've thrown out: down on the road, back up, then off down the pavement as fast as they can.
function updateThrown(dt) {
  thrown = thrown.filter((d) => {
    d.t += dt;
    const P = d.person;
    if (d.t < 2.3) {
      const slide = Math.max(0, 1 - d.t / 0.45);
      d.x += d.vx * slide * dt; d.z += d.vz * slide * dt;
      const fall = Math.min(1, d.t / 0.5), up = clamp((d.t - 1.7) / 0.6, 0, 1);
      P.down = Math.max(0.001, fall * fall * (1 - up * up));
      P.holder.rotation.order = "YXZ";
      P.holder.rotation.set(-P.down * Math.PI / 2, d.fallYaw + Math.PI, 0);
      P.holder.position.set(d.x, d.y + 0.12 * P.down, d.z);
      return true;
    }
    P.down = 0;
    P.holder.rotation.set(0, d.fallYaw + Math.PI, 0);
    const ped = { person: P, e: null, s: 0, walkSide: 1, dir: 1, x: d.x, z: d.z, y: d.y, yaw: d.fallYaw + Math.PI, speed: 1.3, cruise: 1.3, standing: false, flee: 0, fleeX: 0, fleeZ: 0, hp: 100, panic: 12, downT: 0, ...pockets(rng(Math.random() * 1e9), 1.6) };
    crowd.rejoin(ped);
    if (ped.e) crowd.people.push(ped); else scene.remove(P.holder);
    return false;
  });
}

function toggleMap(open = !mapOpen) {
  mapOpen = open;
  $("bigmap").classList.toggle("hidden", !open);
  if (open) { releaseMouse(); bigmap.draw(mode === "foot" ? walker : player, world.venues, save.homes, world.landmarks, save.landmarks, { contacts: hud.contacts, goal: hud.goal, gps: hud.gps }); }
}

function respawn() {
  const r = world.nearestRoad(player.x, player.z);
  if (!r) { player.place(SPAWN.x, SPAWN.z, SPAWN.yaw); return; }
  const p = world.edgePoint(r.e, r.s, r.e.laneOff[0]);
  player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz));
  hud.toast("Back on the road.", 2);
}

// Somewhere else at once (a mission retry): on foot there, with the car at the nearest kerb.
function teleport(x, z) {
  if (inside) leaveVenue(true);
  const r = world.nearestRoad(x, z);
  if (r) { const p = world.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), r.e.laneOff[0]); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); }
  walker.place(x, z, walker.yaw);
  if (mode !== "foot") { mode = "foot"; me.holder.visible = true; }
  camYaw = walker.yaw;
}

// The car takes hits from crashes, gunfire and blasts. Badly hurt it smokes; at nothing it burns out, you
// bail, and Asoka's fleet service leaves a replacement round the corner.
function damageCar(dmg) {
  if (player.hp == null) player.hp = player.hp0 = 1000;
  if (player.hp <= 0) return;
  player.hp -= dmg;
  if (player.hp <= 0) {
    player.hp = 0;
    const x = player.x, y = player.y, z = player.z, yaw = player.yaw, k = carNow.k, tag = carTag;
    combat.explode(x, y + 0.8, z, 1.1, null, "npc");
    // The burnt-out shell stays where it was.
    const c = actors.spawnCar({ kit: kits[k].id, tag, color: 0x2a2624, ai: "park", blip: false }, x, z, yaw);
    c.x = x; c.z = z; c.y = y; c.yaw = yaw; c.burnt = true; c.hp = 0;
    if (c.mat) { c.mat.uniforms.uUseLivery.value = 2; c.mat.uniforms.uPaint.value.set(0.16, 0.15, 0.14); }
    if (mode === "drive") {
      mode = "foot"; me.holder.visible = true;
      walker.place(x + Math.cos(yaw) * 2.5, z - Math.sin(yaw) * 2.5, yaw);
      hurtPlayer(25);
    }
    carTag = null;
    const r = world.nearestRoad(x - Math.sin(yaw) * -45, z - Math.cos(yaw) * -45);
    const pk = kits.findIndex((q) => q.id === PLAYER_KIT);
    if (pk >= 0) setPlayerCar(pk, null, true);
    if (r) { const p = world.edgePoint(r.e, clamp(r.s, r.e.sA, r.e.sB), r.e.laneOff[0]); player.place(p.x, p.z, Math.atan2(-p.tx, -p.tz)); }
    hud.toast("That car's done for. Asoka fleet services left a replacement just down the road.", 4);
  }
}

// ---------------------------------------------------------------------------- money and health

function saveNow() { snapshot(); prefs.save = save; savePrefs(); }
// Leaving the page (closing the tab, switching away, the Salesforce tab navigating off) saves too.
addEventListener("pagehide", () => saveNow());
document.addEventListener("visibilitychange", () => { if (document.hidden) saveNow(); });
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
  if (missions) missions.playerDown("You were rolled back.");
  if (audit) audit.set(0);
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
const wm4 = new THREE.Matrix4(), wq4 = new THREE.Quaternion(), we3 = new THREE.Euler(0, 0, 0, "YXZ"), wv3 = new THREE.Vector3();
// A car's four wheels as instances, placed in the car's frame: steered about y, then rolled about the axle.
function putWheels(k, carM, counts, spin, steer) {
  const im = wheelMeshes[k];
  if (!im) return;
  const max = im.instanceMatrix.count;
  for (const w of kits[k].wheels) {
    const i = counts[k];
    if (i >= max) return;
    counts[k]++;
    we3.set(-spin, w.front ? steer : 0, 0);
    wq4.setFromEuler(we3);
    wv3.set(w.x, w.y, w.z);
    wm4.compose(wv3, wq4, s3).premultiply(carM);
    im.setMatrixAt(i, wm4);
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
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
    creatorZoom += ((creatorTab === "hair" || creatorTab === "face" ? 1 : 0) - creatorZoom) * Math.min(1, dt * 5);
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
  if (input.hit("Slash")) toggleKeys();
  const onFoot = mode === "foot";
  if (input.hit("KeyR", 1)) { if (onFoot) arsenal.reload(); else respawn(); }
  if (input.hit("KeyF", 3) && !inside && !jack) toggleFoot();
  updateThrown(dt);
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
  // Stalled by a Kill Switch pulse.
  if (player.emp > 0) { player.emp -= dt; inp.throttle = 0; }
  keyE = false;
  if (!inside) {
    acc += dt;
    while (acc >= DT) { player.step(DT, inp); acc -= DT; }
  }
  const focus = mode === "drive" ? player : walker;
  let prompt = "", aiming = false;
  if (onFoot && jack) {
    const look = input.look(dt);
    camYaw -= look.x * 0.0026;
    camPitch = clamp(camPitch - look.y * 0.0022, -1.1, 0.75);
    updateJack(dt);
    arsenal.place(me, false);
    combat.player = { x: walker.x, y: walker.y + 1, z: walker.z };
  } else if (onFoot) {
    const look = input.look(dt);
    camYaw -= look.x * 0.0026;
    camPitch = clamp(camPitch - look.y * 0.0022, -1.1, 0.75);
    const f = input.foot();
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    const w = arsenal.w;
    // Attacks only while aiming: on its own the left button just looks around.
    aiming = !inside && cb.aim;
    // Let go of the mouse and the camera swings back in behind the character.
    lookIdle = look.held || aiming ? 0 : lookIdle + dt;
    if (lookIdle > 0.15) {
      const k = Math.min(1, dt * 3);
      camYaw += angleWrap(walker.yaw - camYaw) * k;
      camPitch += (CAM_PITCH - camPitch) * k;
    }
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
    lastAim = { aiming: aiming && !inside, from: camPos.clone(), dir: cd.clone() };
    const res = arsenal.update(dt, { person: me, aiming, held: cb.held && aiming, pressed: cb.pressed && aiming, aimPoint, aimDir, inside: !!inside });
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
      if (!v && missions && missions.prompt) {
        prompt = missions.prompt;
        keyE = input.hit("KeyE", 2);
      } else if (v) {
        const owned = save.homes.includes(v.id);
        prompt = v.kind === "home" ? (owned ? `<kbd>E</kbd> Go home · ${esc(v.name)}` : `<kbd>E</kbd> View ${esc(v.name)} · for sale ${fmtMoney(v.price)}`) : `<kbd>E</kbd> Enter ${esc(v.name)}`;
        if (input.hit("KeyE", 2)) enterVenue(v);
      } else {
        const t = carNear(walker.x, walker.z);
        if (t) prompt = CAR_PROMPT[t.kind];
      }
    }
  } else {
    arsenal.place(me, false);
    combat.player = { x: player.x, y: player.y + 1, z: player.z };
    lastAim = null;
    if (missions && missions.prompt && !inside) prompt = missions.prompt;
  }
  combat.foot = onFoot && !inside ? { x: walker.x, y: walker.y, z: walker.z } : null;
  combat.driving = mode === "drive";
  if (inside && inside.keeper) inside.keeper.update(dt, 0);

  if (!inside) {
    traffic.update(dt, mode === "drive" ? player : { x: walker.x, z: walker.z, hl: 0.5 }, focus.x, focus.z, 140, 470);
    traffic.collidePlayer(player);
    const actx = { me: mode === "foot" ? { x: walker.x, y: walker.y, z: walker.z } : { x: player.x, y: player.y, z: player.z }, car: player, driving: mode === "drive", speed: player.speed };
    actors.update(dt, actx);
    audit.update(dt, actx);
    crowd.cars = inside ? [] : [...traffic.cars, player];
    crowd.update(dt, camera.position, mode === "drive" ? player : null, mode === "foot" ? walker : null);
    actors.place(dt, U.uNight.value);
    collectCash(mode === "drive" ? player : walker, mode === "drive" ? 2.6 : 1.3);
    collectDrops(mode === "drive" ? player : walker, mode === "drive" ? 2.6 : 1.3);
    discover(mode === "drive" ? player : walker);
  }
  combat.update(dt, camera, renderer.getDrawingBufferSize(v3.set(0, 0, 0)).y);
  if (!inside && missions) missions.update(dt);
  hud.heat(audit.level, audit.seen);
  // A badly damaged car smokes.
  if (player.hp != null && player.hp < player.hp0 * 0.35 && Math.random() < dt * (player.hp < player.hp0 * 0.15 ? 14 : 5)) {
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    combat.puff(player.x + fx * player.hl * 0.8, player.y + 0.9, player.z + fz * player.hl * 0.8, 0.7, 2.2, player.hp < player.hp0 * 0.15 ? [0.2, 0.19, 0.18] : [0.6, 0.6, 0.58], 1.2);
  }
  for (const ev of player.events) {
    if (ev.type === "impact" && ev.mag > 5 && time - (player.hitAt || 0) > 0.35) { player.hitAt = time; damageCar((ev.mag - 5) * (ev.kind === "car" ? 12 : 9)); }
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
  if (saveT > 10) { saveT = 0; saveNow(); }
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

let camHold = null;   // test hook: { pos: [x, y, z], look: [x, y, z], fov? }
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
  // The creator's close-up sits well inside the usual near plane.
  camera.near = state === "creator" ? 0.05 : 0.8;
  if (camHold) {
    camera.position.set(...camHold.pos); camera.lookAt(...camHold.look);
    camera.fov = camHold.fov || 50; camera.updateProjectionMatrix();
    return;
  }
  if (state === "creator") {
    // Whole body, or a close-up of the head for hair and face.
    const gy = world.height(CREATOR_SPOT.x, CREATOR_SPOT.z) + 0.15, hy = gy + (me ? me.height : 1.6) + 0.11, z = creatorZoom;
    const dx = 0.316, dz = 0.949;
    camera.position.set(lerp(CREATOR_SPOT.x + 1.2, CREATOR_SPOT.x + dx * 0.75, z), lerp(gy + 1.5, hy + 0.03, z), lerp(CREATOR_SPOT.z + 3.6, CREATOR_SPOT.z + dz * 0.75, z));
    camera.lookAt(lerp(CREATOR_SPOT.x - 0.5, CREATOR_SPOT.x - 0.949 * 0.2, z), lerp(gy + 1.0, hy - 0.01, z), lerp(CREATOR_SPOT.z, CREATOR_SPOT.z + 0.316 * 0.2, z));
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
  // Hold a mouse button to look around the car; let go and it swings back behind.
  const lk = state === "play" ? input.look(dt, false) : { x: 0, y: 0, held: false };
  if (lk.held) {
    carLook.idle = 0;
    carLook.yaw = angleWrap(carLook.yaw - lk.x * 0.0026);
    carLook.pitch = clamp(carLook.pitch - lk.y * 0.0022, -0.35, 0.6);
  } else if ((carLook.idle += dt) > 0.15) {
    const k = Math.min(1, dt * 3);
    carLook.yaw -= carLook.yaw * k; carLook.pitch -= carLook.pitch * k;
  }
  const viewYaw = camYaw + carLook.yaw;
  const cfx = -Math.sin(viewYaw), cfz = -Math.cos(viewYaw);
  let target, look;
  if (camMode === 2) {
    target = new THREE.Vector3(p.x + fx * 0.3, p.y + 1.15, p.z + fz * 0.3);
    const ly = p.yaw + carLook.yaw;
    look = new THREE.Vector3(target.x - Math.sin(ly) * 20, p.y + 1.0 + Math.sin(carLook.pitch) * 20, target.z - Math.cos(ly) * 20);
    camPos.copy(target);
  } else {
    const dist = camMode === 0 ? 7.2 : 11.5, h = camMode === 0 ? 2.5 : 3.8;
    target = new THREE.Vector3(p.x - cfx * dist, p.y + h - Math.sin(carLook.pitch) * dist * 0.9, p.z - cfz * dist);
    // Keep the camera out of buildings and other cars: pulled in in front of whatever's in the way.
    const pivot = new THREE.Vector3(p.x, p.y + 1.5, p.z);
    const t = camClear(pivot, target, p);
    if (t < 1) target.set(lerp(pivot.x, target.x, t), Math.max(target.y * t + pivot.y * (1 - t), pivot.y), lerp(pivot.z, target.z, t));
    const gy = world.ground(target.x, target.z, target.y) + 0.8;
    if (target.y < gy) target.y = gy;
    camPos.lerp(target, Math.min(1, dt * 10));
    // Easing in from where it was mustn't take it through a wall either.
    const t2 = camClear(pivot, camPos, p);
    if (t2 < 1) camPos.lerpVectors(pivot, camPos, t2);
    look = new THREE.Vector3(p.x + cfx * 3, p.y + 1.25 + Math.sin(carLook.pitch) * 4, p.z + cfz * 3);
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
  let pivot = new THREE.Vector3(w.x + rx * side, w.y + h, w.z + rz * side);
  // Shoulder against a wall: look from over the head instead, not from inside the wall.
  if (!inside && camClear(new THREE.Vector3(w.x, w.y + h, w.z), pivot, null) < 1) pivot = new THREE.Vector3(w.x, w.y + h, w.z);
  let target = new THREE.Vector3(pivot.x - fx * dist, pivot.y - fy * dist + 0.25, pivot.z - fz * dist);
  if (scoped) target = new THREE.Vector3(w.x + fx * 0.3, w.y + 1.62, w.z + fz * 0.3);
  if (inside) {
    const R = inside.room;
    target.x = clamp(target.x, -R.W / 2 + 0.25, R.W / 2 - 0.25);
    target.z = clamp(target.z, -R.D + 0.25, -0.15);
    target.y = clamp(target.y, 0.4, R.H - 0.2);
  } else if (!scoped) {
    // Keep the camera out of buildings and cars: pulled in in front of whatever's in the way.
    const t = camClear(pivot, target, null);
    if (t < 1) target.lerpVectors(pivot, target, t);
    const gy = world.ground(target.x, target.z, target.y) + 0.3;
    if (target.y < gy) target.y = gy;
  }
  camPos.lerp(target, Math.min(1, dt * (aiming || inside ? 20 : 12)));
  // Easing in from where it was mustn't take it through a wall either.
  if (!inside && !scoped) { const t2 = camClear(pivot, camPos, null); if (t2 < 1) camPos.lerpVectors(pivot, camPos, t2); }
  camera.position.copy(camPos);
  addShake(dt);
  camera.lookAt(camPos.x + fx * 10, camPos.y + fy * 10, camPos.z + fz * 10);
  const fov = scoped ? 55 / wp.scope : inside ? 64 : 58 + w.run * 6 - aimCam * 10;
  camera.fov = lerp(camera.fov, fov, Math.min(1, dt * (scoped ? 20 : 4)));
  camera.updateProjectionMatrix();
  // Backed up against a wall, the camera ends up at the head: hide the body rather than look out from inside it.
  me.holder.visible = !scoped && mode === "foot" && Math.hypot(camPos.x - w.x, camPos.z - w.z, camPos.y - w.y - h) > 0.7;
}

// How far along from `a` (the player) to `b` (where the camera wants to be) it can go before it would
// be inside a building or a car, sampled every 20 cm: 1 when the whole way is clear. `skip` is the car
// the camera is following. It keeps 60 cm off walls so the 0.8 m near plane doesn't slice into
// them, but only 25 cm within the first metre (less than the player's own 35 cm, so just standing
// against a wall doesn't count as the view being blocked).
function camClear(a, b, skip) {
  const L = a.distanceTo(b);
  if (L < 1e-3) return 1;
  const n = Math.ceil(L / 0.2);
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    const m = t * L < 1 ? 0.25 : 0.6;
    if (insideBox(x, y, z, m) || insideCar(x, y, z, skip, m * 0.75)) return Math.max(0, (i - 1) / n - 0.05 / L);
  }
  return 1;
}

// Inside (or within m of) a car's body.
function insideCar(x, y, z, skip, m = 0.25) {
  for (const c of [...traffic.cars, player]) {
    if (c === skip || c.gone || c.taken || (c === player && mode === "drive")) continue;
    const dx = x - c.x, dz = z - c.z;
    if (Math.abs(dx) > c.hl + 1 || Math.abs(dz) > c.hl + 1) continue;
    const top = (c.y || 0) + ((c.spec && c.spec.roof) || 1.5) + m;
    if (y > top || y < (c.y || 0) - 0.3) continue;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    if (Math.abs(dx * fx + dz * fz) < c.hl + m && Math.abs(dx * fz - dz * fx) < c.hw + m) return true;
  }
  return false;
}

function insideBox(x, y, z, m = 0.25) {
  const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
  if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return false;
  const c = world.chunk(cx, cz);
  const i = clamp(Math.floor((x - c.x0) / 32), 0, 7), j = clamp(Math.floor((z - c.z0) / 32), 0, 7);
  for (const o of c.grid[i + j * 8]) {
    if (o.r != null || o.x0 == null) continue;
    if (x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m && y < o.y1 + m) return true;
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

// After dark the nearest street lamps and headlights light the street, the people and the cars for real
// (the glow sprites only paint the bulbs and pools). Lamps fade out toward the edge of the chosen set.
const LAMP_COL = [1, 0.8, 0.52], HEAD_COL = [1, 0.93, 0.8];
function pickLamps(night) {
  const PL = U.uPL.value, PD = U.uPD.value, PC = U.uPC.value;
  for (const v of PL) v.w = 0;
  if (night < 0.05 || inside || !player) return;
  let n = 0;
  const put = (x, y, z, r, col, k, dir = null, cone = -2) => {
    PL[n].set(x, y, z, r);
    if (dir) PD[n].set(dir[0], dir[1], dir[2], cone); else PD[n].set(0, -1, 0, -2);
    PC[n].set(col[0] * k, col[1] * k, col[2] * k);
    n++;
  };
  const head = (c, r, k) => {
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), l = Math.hypot(fx, fz, 0.16);
    put(c.x + fx * (c.hl + 0.2), c.y + 0.75, c.z + fz * (c.hl + 0.2), r, HEAD_COL, k * night, [fx / l, -0.16 / l, fz / l], 0.82);
  };
  head(player, 30, 3);
  const f = mode === "foot" ? walker : player;
  const near = traffic.cars.filter((c) => !c.burnt && Math.abs(c.x - f.x) < 45 && Math.abs(c.z - f.z) < 45)
    .sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z));
  for (const c of near.slice(0, 2)) head(c, 22, 2);
  const R = 80, cand = [];
  for (const v of city.views.values()) {
    const d = v.data;
    if (f.x < d.x0 - R || f.x > d.x0 + CHUNK + R || f.z < d.z0 - R || f.z > d.z0 + CHUNK + R) continue;
    const kn = city.knockedSet(v.cx, v.cz);
    for (const o of d.glows) {
      if (o.kind !== "lamp" || kn.has(o.id) || Math.abs(o.x - f.x) > R || Math.abs(o.z - f.z) > R) continue;
      cand.push([Math.hypot(o.x - f.x, o.z - f.z), o]);
    }
  }
  cand.sort((a, b) => a[0] - b[0]);
  const room = PL.length - n, edge = cand.length > room ? cand[room][0] : R;
  for (const [d, o] of cand.slice(0, room)) put(o.x, o.y, o.z, 17, LAMP_COL, 2.4 * night * clamp((edge - d) / (edge * 0.3), 0, 1));
}

function render(dt) {
  if (!world) return;
  exposure = applyTimeOfDay(U, hour);
  pickLamps(U.uNight.value);
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
  city.update(streamTo || (state === "title" ? { x: TOWER.x, z: TOWER.z } : state === "creator" ? CREATOR_SPOT : camera.position), 5);
  const night = U.uNight.value;

  // Player car
  playerMesh.position.set(player.x, player.y, player.z);
  // The body rides its springs; the wheels stay on the road.
  playerMesh.children[0].position.y = player.sus;
  if (doorPivot) doorPivot.position.y = doorInfo.pivot[1] + player.sus;
  playerMesh.rotation.set(player.pitch, player.yaw, player.roll);
  if (doorPivot) doorPivot.rotation.y = -DOOR_ANGLE * doorOpen;
  wheels.forEach((w, i) => {
    w.rotation.x = -player.spin;
    w.rotation.y = i < 2 ? player.steer : 0;
  });
  playerMesh.children[0].material.uniforms.uBrake.value = player.braking ? 1 : 0;
  playerMesh.children[0].material.uniforms.uLights.value = night > 0.2 ? 1 : 0;

  // Traffic instances. Wheels roll with the speed and steer into the turn, and the body leans out of it.
  const counts = trafficMeshes.map(() => 0);
  const wcounts = wheelMeshes.map(() => 0);
  for (const c of traffic.cars) {
    const im = trafficMeshes[c.type];
    if (!im) continue;
    const i = counts[c.type]++;
    if (i >= 40) continue;
    const yr = dt > 0 && c.pyaw != null ? angleWrap(c.yaw - c.pyaw) / dt : 0;
    c.pyaw = c.yaw;
    const v = Math.abs(c.v || 0), wb = c.spec.wheelbase || 2.6;
    c.steerV = lerp(c.steerV || 0, v > 0.5 ? clamp(Math.atan((wb * yr) / v), -0.6, 0.6) : c.steerV || 0, Math.min(1, dt * 8));
    c.lean = lerp(c.lean || 0, clamp(-v * yr * 0.008, -0.05, 0.05), Math.min(1, dt * 5));
    e3.set(0, c.yaw, c.burnt ? 0 : c.lean);
    q4.setFromEuler(e3);
    v3.set(c.x, c.y, c.z);
    m4.compose(v3, q4, s3);
    im.setMatrixAt(i, m4);
    putWheels(c.type, m4, wcounts, c.spin || 0, c.steerV);
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
        const k = parkedKit(p);
        if (pc[k] >= 24) continue;
        const i = pc[k]++;
        e3.set(0, p.yaw, 0); q4.setFromEuler(e3); v3.set(p.x, p.y, p.z);
        m4.compose(v3, q4, s3);
        parkedMeshes[k].setMatrixAt(i, m4);
        putWheels(k, m4, wcounts, 0, 0);
        const col = hex(p.color);
        parkedMeshes[k].instanceColor.setXYZ(i, col[0], col[1], col[2]);
      }
    }
    parkedMeshes.forEach((im, k) => { im.count = pc[k]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
  }
  wheelMeshes.forEach((im, k) => { im.count = wcounts[k]; im.instanceMatrix.needsUpdate = true; });

  // Car lights and blob shadows.
  let n = 0, sh = 0;
  const lights = (x, y, z, yaw, hl, hw, brake, isPlayer, dead, kit) => {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    // The glows sit on the model's own lamps (measured when the kit was baked); the generic
    // corners are only for bodies without marked lamps.
    const L = kit && kit.lamps;
    const head = L && L.head.length ? L.head : [[-(hw - 0.32), 0.68, -(hl + 0.1)], [hw - 0.32, 0.68, -(hl + 0.1)]];
    const tail = L && L.tail.length ? L.tail : [[-(hw - 0.3), 0.78, hl + 0.1], [hw - 0.3, 0.78, hl + 0.1]];
    const at = (p) => [x + rx * p[0] - fx * p[2], y + p[1], z + rz * p[0] - fz * p[2]];
    if (!dead) {
      for (const p of head) {
        const [hx, hy, hz] = at(p);
        setGlow(carGlow, n++, hx, hy, hz, [1, 0.95, 0.82], 0.008, 0.42, 0, -1, 2.4, y);
        if (night > 0.3) setGlow(carGlow, n++, hx, hy, hz, [1, 0.92, 0.75], 0, 0.5, -1, -1, 0.7, y);
      }
      for (const p of tail) {
        const [tx, ty, tz] = at(p);
        setGlow(carGlow, n++, tx, ty, tz, [1, 0.1, 0.06], brake ? 0.3 : 0.015, brake ? 0.75 : 0.42, 0, -1, brake ? 4 : 2, y);
        if (night > 0.3) setGlow(carGlow, n++, tx, ty, tz, [1, 0.12, 0.06], 0, 0.6, -1, -1, brake ? 1.2 : 0.6, y);
      }
    }
    // The player's headlights are a real light (pickLamps); traffic further off gets a painted pool.
    if (night > 0.2 && !dead && !isPlayer) {
      const d = 8;
      setGlow(carGlow, n++, x + fx * d, world.ground(x + fx * d, z + fz * d, y + 1) + 0.15, z + fz * d, [1, 0.92, 0.75], 0, 4, 1 + 2 * Math.PI + Math.atan2(-fx, fz), -1, 0.45, y);
    }
    const sm = new THREE.Matrix4().compose(new THREE.Vector3(x, y + 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(hw * 2.6, 1, hl * 2.3));
    if (sh < 80) shadows.setMatrixAt(sh++, sm);
  };
  lights(player.x, player.y, player.z, player.yaw, player.hl, player.hw, player.braking, true, false, kits[carNow.k]);
  for (const c of traffic.cars) {
    if (n > 760) break;
    if (Math.hypot(c.x - camera.position.x, c.z - camera.position.z) > 420) continue;
    lights(c.x, c.y, c.z, c.yaw, c.hl, c.hw, c.brake, false, c.burnt, kits[c.type]);
  }
  // Roof beacons on cruisers and ambulances, and the Asoka car's own when it's a fleet vehicle.
  if (actors) actors.glows((x, y, z, col) => { if (n < 880) setGlow(carGlow, n++, x, y, z, col, 0.25, 0.55, 0, -1, 4.5, y); });
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
  for (const d of drops) {
    const spin = time * 1.6 + d.x, bob = 0.35 + Math.sin(time * 3 + d.z) * 0.06;
    if (d.kind === "cash") {
      if (cn >= 48) continue;
      // Floats up out of the body over its first half second as they go down.
      const u = Math.min(1, d.t / 0.6), rise = d.lift * u * u * (3 - 2 * u);
      e3.set(0, spin, 0); q4.setFromEuler(e3); v3.set(d.x, d.y + bob + rise, d.z);
      m4.compose(v3, q4, s3); cashMesh.setMatrixAt(cn++, m4);
      if (d.lift && n < 896) setGlow(carGlow, n++, d.x, d.y + bob + rise, d.z, [1, 0.8, 0.35], 1, 0.6, 0, -1, 1.4, d.y);
    } else if (d.mesh) {
      d.mesh.position.set(d.x, d.y + bob, d.z);
      d.mesh.rotation.set(0, spin, d.kind === "gun" ? 0 : 0);
    }
    const col = d.kind === "cash" ? [1, 0.8, 0.35] : d.kind === "gun" ? [0.6, 0.85, 1] : [1, 0.6, 0.25];
    if (n < 896) setGlow(carGlow, n++, d.x, d.y + 0.02, d.z, col, 1, 0.9, 1, -1, 1.1, d.y);
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
  get drops() { return drops; }, get actors() { return actors; }, get audit() { return audit; }, get missions() { return missions; }, get kits() { return kits; },
  get carTag() { return carTag; }, damageCar: (n) => damageCar(n), teleport: (x, z) => teleport(x, z),
  takeCar: (c) => { takeCar({ kind: "left", c }); mode = "drive"; me.holder.visible = false; }, get mode() { return mode; },
  // Start a story mission or side-quest stage by id, from wherever the player is.
  startMission: (id, stage = 0) => {
    const m = missions.MAIN.find((q) => q.id === id), q = missions.SIDE.find((x) => x.id === id);
    const me0 = missions.g.me();
    missions.start(m ? { main: true, def: m, x: me0.x, z: me0.z } : { main: false, def: q, stage, x: me0.x, z: me0.z });
  },
  setCam: (yaw, pitch) => { camYaw = yaw; camPitch = pitch; }, get state() { return state; }, holdCam: (h) => { camHold = h; },
  showCreator: (p) => showCreator(p), set timeScale(k) { timeScale = k; }, get jack() { return jack; }, dress: (s) => dress(me, s), get prefs() { return prefs; },
};
