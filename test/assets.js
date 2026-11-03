// Preview of the mission sites, fleet vehicles and new weapons, without the game around them.
// window.view.site(id, anchor?, dist?, height?), view.fleet(), view.weapons(), view.hour(h), view.cam(pos, look).
import * as THREE from "/res/three.module.min.js";
import { World } from "/res/map.js";
import { makeUniforms, makeMaterials, makeSky, makeSignTexture, makeSignMaterial, CityView, applyTimeOfDay } from "/res/render.js";
import { loadKits } from "/res/carkits.js";
import { buildFleet } from "/res/fleet.js";
import { weaponGeometry } from "/res/weapons.js";
import { Post } from "/res/post.js";
import { SunShadow } from "/res/shadow.js";

const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 9000);
const U = makeUniforms(), mats = makeMaterials(U);
const sky = makeSky(U); scene.add(sky);
const world = new World(7);
const city = new CityView(world, scene, mats, makeSignMaterial(U, await makeSignTexture()));
const post = new Post(renderer);
// The shaders sample a shadow map; keep one bound (and rendered) as the game does.
const shadow = new SunShadow(renderer, U, 2048, 170);
U.uShadow.value = shadow.rt.depthTexture;
let hour = 13, exposure = 1, time = 0;
const kits = await loadKits();
const fleet = buildFleet(kits);
const group = new THREE.Group(); scene.add(group);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); post.setSize(w, h, 4); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
const lab = document.getElementById("lab");
function carMat(kit, gloss = 0.9) {
  const m = mats.prop.clone();
  m.uniforms = { ...U, uBrake: { value: 0 }, uLights: { value: 0 }, uGloss: { value: gloss }, uLivery: { value: kit && kit.livery }, uUseLivery: { value: kit && kit.livery ? 1 : 0 }, uPaint: { value: new THREE.Vector3(1, 1, 1) } };
  return m;
}
function place(kit, x, y, z, yaw) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const m = carMat(kit);
  g.add(new THREE.Mesh(kit.body, m));
  for (const w of kit.wheels) { const wm = new THREE.Mesh(kit.wheelGeo, m); wm.position.set(w.x, w.y, w.z); g.add(wm); }
  group.add(g); return g;
}
let look = null;
window.view = {
  world, list: fleet, kits, scene, camera, U, city,
  cam(pos, at, fov = 55) { camera.position.set(...pos); camera.fov = fov; camera.updateProjectionMatrix(); look = new THREE.Vector3(...at); camera.lookAt(look); },
  hour(h) { hour = h; },
  site(id, anchor = null, dist = 70, height = 40, ang = 0.7) {
    const s = world.sites[id]; if (!s) return "none";
    const a = anchor ? s.anchors[anchor] : { x: s.x, y: world.height(s.x, s.z), z: s.z };
    this.cam([a.x + Math.cos(ang) * dist, a.y + height, a.z + Math.sin(ang) * dist], [a.x, a.y + 2, a.z]);
    lab.textContent = `${s.name} ${anchor || ""}`;
    return [s.x, s.z];
  },
  fleet(x = 130.4, z = 430, hourSet = null) {
    group.clear();
    const y = world.ground(x, z, 99) + 0.08;
    fleet.forEach((k, i) => place(k, x + (i % 2 ? 2.6 : -2.6), y, z - 24 + Math.floor(i / 2) * 9.5 + (i % 2) * 4, 1.25));
    lab.textContent = fleet.map((k) => k.id).join(" · ");
    this.cam([x + 14, y + 4, z + 14], [x, y + 1, z - 6]);
    return fleet.map((k) => ({ id: k.id, spec: k.spec, beacons: k.beacons.length, livery: !!k.livery }));
  },
  car(id, a = Math.PI + 0.7, d = 8, h = 1.8) {
    group.clear();
    const k = fleet.find((f) => f.id === id), x = 130.4, z = 430, y = world.ground(x, z, 99) + 0.08;
    place(k, x, y, z, 0);
    this.cam([x + Math.sin(a) * d, y + h, z + Math.cos(a) * d], [x, y + 1.1, z]);
    lab.textContent = id;
  },
  weapons(ids = ["silentdeploy", "killswitch", "stickynote"]) {
    group.clear();
    const x = 130.4, z = 430, y = world.ground(x, z, 99) + 1.5;
    ids.forEach((id, i) => { const geo = weaponGeometry(id); if (!geo) return; const m = new THREE.Mesh(geo, carMat(null, 0.5)); m.scale.setScalar(5); m.position.set(x - 3 + i * 3, y, z); m.rotation.y = Math.PI / 2; group.add(m); });
    this.cam([x, y + 0.6, z + 7], [x, y, z], 40);
    lab.textContent = ids.join(" · ");
  },
};
function frame(now) {
  time = now / 1000;
  exposure = applyTimeOfDay(U, hour);
  U.uTime.value = time; U.uCam.value.copy(camera.position);
  sky.position.copy(camera.position);
  city.update(camera.position, 4);
  shadow.update(scene, camera);
  post.render(scene, camera, time, exposure, true);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.ready = true;
