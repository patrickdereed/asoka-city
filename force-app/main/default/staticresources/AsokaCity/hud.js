// HUD: minimap, speed, clock, district cards, toasts and the full-screen map.
import { HALF, HN, DISTRICTS, TOWER, districtAt } from "./map.js";
import { clamp } from "./util.js";

const MAP_PX = 1024;
const M_PER_PX = 8192 / MAP_PX;

function hexRGB(s) { const n = parseInt(s.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export function drawMapImage(world) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = MAP_PX;
  const g = cv.getContext("2d");
  const img = g.createImageData(MAP_PX, MAP_PX);
  const colors = {};
  for (const k in DISTRICTS) colors[k] = hexRGB(DISTRICTS[k].map);
  for (let py = 0; py < MAP_PX; py++) {
    for (let px = 0; px < MAP_PX; px++) {
      const i = Math.min(HN - 1, px), j = Math.min(HN - 1, py);
      const h = world.H[i + j * HN];
      const o = (px + py * MAP_PX) * 4;
      let c;
      if (h < 0) {
        const t = clamp(-h / 7, 0, 1);
        c = [86 - 50 * t, 150 - 70 * t, 152 - 60 * t];
      } else {
        const x = -HALF + px * M_PER_PX, z = -HALF + py * M_PER_PX;
        c = colors[districtAt(x, z)].slice();
        const shade = 1 - clamp(h / 220, 0, 0.35);
        const hx = world.H[Math.min(HN - 1, i + 1) + j * HN] - h;
        const lit = clamp(1 - hx * 0.08, 0.75, 1.15);
        c = c.map((v) => v * shade * lit);
        if (h < 2.6 && world.H[i + j * HN] > 0 && x > 1800 && x > 2300) c = [240, 226, 196];
      }
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.lineCap = "round"; g.lineJoin = "round";
  const P = (x, z) => [(x + HALF) / M_PER_PX, (z + HALF) / M_PER_PX];
  for (const pass of [0, 1]) {
    for (const e of world.edges) {
      if (!e.main) continue;
      g.strokeStyle = pass ? (e.type === 1 ? "#fffdf9" : "#f6efe4") : "rgba(24,43,46,0.35)";
      g.lineWidth = ((e.hw * 2) / M_PER_PX) * (pass ? 1.05 : 1.7) + (pass ? 0.4 : 0.8);
      g.beginPath();
      for (let k = 0; k < e.x.length; k++) {
        const [px, py] = P(e.x[k], e.z[k]);
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
    }
  }
  // The Asoka tower.
  const [tx, ty] = P(TOWER.x, TOWER.z);
  g.fillStyle = "#182b2e";
  g.beginPath(); g.moveTo(tx - 14, ty + 10); g.lineTo(tx + 14, ty + 10); g.lineTo(tx, ty - 14); g.closePath(); g.fill();
  g.strokeStyle = "#ff6018"; g.lineWidth = 3;
  g.beginPath(); g.arc(tx, ty + 2, 5, 0, Math.PI * 2); g.stroke();
  return cv;
}

// Map icons, shared by the minimap and the full map.
export const ICONS = {
  arms: { bg: "#ff6018", fg: "#fffdf9", label: "Breakpoint Arms (weapons)" },
  mart: { bg: "#2f9e98", fg: "#fffdf9", label: "Deploy Mart (food, first aid)" },
  threads: { bg: "#cc75a0", fg: "#fffdf9", label: "Sandbox Threads (outfits)" },
  clinic: { bg: "#fffdf9", fg: "#2f757c", label: "Meridian Clinic (healing)" },
  home: { bg: "#fff7ee", fg: "#3f7f45", label: "Home for sale" },
  owned: { bg: "#3f7f45", fg: "#fffdf9", label: "Your home (save)" },
  landmark: { bg: "#182b2e", fg: "#ffc667", label: "Landmark, found" },
  unfound: { bg: "#182b2e", fg: "#8fa6a8", label: "Landmark, not yet found" },
};

export function drawIcon(g, kind, x, y, r) {
  const I = ICONS[kind];
  g.save();
  g.translate(x, y);
  g.fillStyle = I.bg; g.strokeStyle = "#182b2e"; g.lineWidth = Math.max(1.5, r * 0.18);
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = I.fg; g.strokeStyle = I.fg; g.lineWidth = Math.max(1.5, r * 0.16); g.lineCap = "round";
  const k = r * 0.55;
  if (kind === "arms") {
    g.beginPath(); g.arc(0, 0, k * 0.72, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-k, 0); g.lineTo(-k * 0.35, 0); g.moveTo(k, 0); g.lineTo(k * 0.35, 0); g.moveTo(0, -k); g.lineTo(0, -k * 0.35); g.moveTo(0, k); g.lineTo(0, k * 0.35); g.stroke();
  } else if (kind === "mart") {
    g.fillRect(-k * 0.75, -k * 0.35, k * 1.5, k * 1.15);
    g.beginPath(); g.arc(0, -k * 0.35, k * 0.42, Math.PI, 0); g.stroke();
  } else if (kind === "threads") {
    g.beginPath(); g.moveTo(-k, -k * 0.45); g.lineTo(-k * 0.45, -k * 0.8); g.lineTo(k * 0.45, -k * 0.8); g.lineTo(k, -k * 0.45); g.lineTo(k * 0.65, -k * 0.1); g.lineTo(k * 0.45, -k * 0.25); g.lineTo(k * 0.45, k * 0.85); g.lineTo(-k * 0.45, k * 0.85); g.lineTo(-k * 0.45, -k * 0.25); g.lineTo(-k * 0.65, -k * 0.1); g.closePath(); g.fill();
  } else if (kind === "landmark" || kind === "unfound") {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? k * 0.45 : k * 1.05; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
  } else if (kind === "clinic") {
    g.fillRect(-k * 0.28, -k * 0.85, k * 0.56, k * 1.7); g.fillRect(-k * 0.85, -k * 0.28, k * 1.7, k * 0.56);
  } else {
    g.beginPath(); g.moveTo(-k * 0.9, -k * 0.05); g.lineTo(0, -k * 0.9); g.lineTo(k * 0.9, -k * 0.05); g.lineTo(k * 0.65, -k * 0.05); g.lineTo(k * 0.65, k * 0.8); g.lineTo(-k * 0.65, k * 0.8); g.lineTo(-k * 0.65, -k * 0.05); g.closePath(); g.fill();
  }
  g.restore();
}

const iconKind = (v, owned) => (v.kind === "home" ? (owned && owned.includes(v.id) ? "owned" : "home") : v.kind);

const LABELS = [
  ["console", 128, -40], ["uptown", 100, -1650], ["cadence", 100, 1550], ["gardens", -2300, 1650],
  ["park", -2560, -64], ["meridian", -2600, -1650], ["hills", -900, -3350], ["docks", -900, 2850],
  ["scratch", 2400, -2400], ["sandbox", 2400, -300], ["preview", 2400, 1700],
];

export class HUD {
  constructor(root, world, mapImg) {
    this.w = world;
    this.map = mapImg;
    root.innerHTML = `
      <div class="hud-district" id="hd-district"><span class="hd-kicker">Now entering</span><b></b></div>
      <div class="hud-clock"><b id="hd-clock">18:00</b><span id="hd-sky">Golden hour</span></div>
      <div class="hud-mini"><canvas id="hd-mini" width="440" height="440"></canvas><span class="hud-north" id="hd-north">N</span></div>
      <div class="hud-speed"><b id="hd-speed">0</b><span>km/h</span><i id="hd-gear">1</i></div>
      <div class="hud-stats"><b id="hd-money">$0</b><i id="hd-delta"></i>
        <div class="hud-bar hp" title="Health"><span id="hd-hp"></span></div><div class="hud-bar ar" title="Armour"><span id="hd-ar"></span></div></div>
      <div class="hud-weapon" id="hd-weapon"><span id="hd-wkind"></span><b id="hd-wname"></b><i id="hd-ammo"></i></div>
      <div class="hud-cross" id="hd-cross"><span></span></div>
      <div class="hud-scope" id="hd-scope"></div>
      <div class="hud-prompt" id="hd-prompt"></div>
      <div class="hud-toast" id="hd-toast"></div>
      <div class="hud-help" id="hd-help">W/S drive · A/D steer · F get out · E enter · mouse aim and fire · Q weapon · M map · Esc pause</div>`;
    this.el = {
      district: root.querySelector("#hd-district"), dname: root.querySelector("#hd-district b"),
      clock: root.querySelector("#hd-clock"), sky: root.querySelector("#hd-sky"),
      mini: root.querySelector("#hd-mini"), north: root.querySelector("#hd-north"),
      speed: root.querySelector("#hd-speed"), gear: root.querySelector("#hd-gear"),
      toast: root.querySelector("#hd-toast"), help: root.querySelector("#hd-help"),
      money: root.querySelector("#hd-money"), delta: root.querySelector("#hd-delta"), hp: root.querySelector("#hd-hp"), ar: root.querySelector("#hd-ar"),
      weapon: root.querySelector("#hd-weapon"), wname: root.querySelector("#hd-wname"), wkind: root.querySelector("#hd-wkind"), ammo: root.querySelector("#hd-ammo"),
      cross: root.querySelector("#hd-cross"), scope: root.querySelector("#hd-scope"), prompt: root.querySelector("#hd-prompt"),
      speedBox: root.querySelector(".hud-speed"), miniBox: root.querySelector(".hud-mini"),
    };
    this.shownMoney = null; this.deltaT = 0;
    this.g = this.el.mini.getContext("2d");
    this.cur = null; this.pending = null; this.pendingT = 0; this.cardT = 0; this.toastT = 0;
    setTimeout(() => this.el.help.classList.add("fade"), 12000);
  }

  toast(msg, secs = 3) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("on");
    this.toastT = secs;
  }

  // The player's state: money, health, armour, weapon, crosshair and the action prompt.
  status(dt, st) {
    const E = this.el;
    if (this.shownMoney == null) this.shownMoney = st.money;
    if (st.money !== this.shownMoney) {
      const diff = st.money - this.shownMoney;
      E.delta.textContent = `${diff > 0 ? "+" : "−"}$${Math.abs(diff).toLocaleString("en-US")}`;
      E.delta.className = diff > 0 ? "up on" : "down on";
      this.deltaT = 2.2;
      this.shownMoney = st.money;
    }
    if (this.deltaT > 0) { this.deltaT -= dt; if (this.deltaT <= 0) E.delta.classList.remove("on"); }
    E.money.textContent = `$${Math.round(st.money).toLocaleString("en-US")}`;
    E.hp.style.width = `${clamp(st.hp, 0, 100)}%`;
    E.hp.parentNode.classList.toggle("low", st.hp < 30);
    E.ar.style.width = `${clamp(st.armor, 0, 100)}%`;
    E.ar.parentNode.classList.toggle("hidden", st.armor <= 0);
    const w = st.weapon;
    E.weapon.classList.toggle("hidden", !w);
    if (w) {
      E.wname.textContent = w.name; E.wkind.textContent = w.kind;
      E.ammo.textContent = w.reloading ? "Reloading" : w.mag != null ? `${w.mag} / ${w.ammo}` : "";
    }
    E.cross.classList.toggle("on", !!st.cross);
    E.cross.classList.toggle("hit", !!st.hitT);
    E.scope.classList.toggle("on", !!st.scope);
    E.prompt.innerHTML = st.prompt || "";
    E.prompt.classList.toggle("on", !!st.prompt);
    E.speedBox.classList.toggle("hidden", !!st.onFoot);
    E.miniBox.classList.toggle("hidden", !!st.inside);
  }

  update(dt, car, camYaw, hour) {
    const kmh = Math.round(Math.abs(car.fwdSpeed) * 3.6);
    this.el.speed.textContent = String(kmh).padStart(3, "0");
    this.el.gear.textContent = car.fwdSpeed < -0.5 ? "R" : car.gear;
    const hh = Math.floor(hour) % 24, mm = Math.floor((hour % 1) * 60);
    this.el.clock.textContent = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    this.el.sky.textContent = hour < 5 || hour >= 20.5 ? "Night" : hour < 7 ? "Sunrise" : hour < 17 ? "Day" : hour < 19 ? "Golden hour" : "Dusk";

    const d = districtAt(car.x, car.z);
    if (d !== this.cur) {
      if (d !== this.pending) { this.pending = d; this.pendingT = 0; }
      this.pendingT += dt;
      if (this.pendingT > 0.8 || this.cur == null) {
        this.cur = d;
        this.el.dname.textContent = DISTRICTS[d].name;
        this.el.district.classList.remove("on"); void this.el.district.offsetWidth; this.el.district.classList.add("on");
        this.cardT = 4;
      }
    } else this.pending = null;
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.el.district.classList.remove("on"); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove("on"); }

    // Minimap: map image rotated so the camera's heading is up.
    const g = this.g, S = 440, R = S / 2;
    const zoom = clamp(1.6 - Math.abs(car.fwdSpeed) / 60, 0.85, 1.6);
    g.save();
    g.clearRect(0, 0, S, S);
    g.beginPath(); g.arc(R, R, R - 6, 0, Math.PI * 2); g.clip();
    g.fillStyle = "#2a5b63"; g.fillRect(0, 0, S, S);
    g.translate(R, R);
    g.rotate(camYaw);
    g.scale(zoom * 1.6, zoom * 1.6);
    g.translate(-(car.x + HALF) / M_PER_PX, -(car.z + HALF) / M_PER_PX);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.map, 0, 0);
    g.restore();
    // Shops, gun stores and homes nearby, kept upright.
    const sc = zoom * 1.6 / M_PER_PX, cs = Math.cos(camYaw), sn = Math.sin(camYaw);
    for (const v of this.venues || []) {
      const dx = (v.x - car.x) * sc, dz = (v.z - car.z) * sc;
      const px = dx * cs - dz * sn, py = dx * sn + dz * cs;
      const d = Math.hypot(px, py);
      if (d > R - 14) {
        if (v.kind !== "arms" || d > R * 3.2) continue;
        drawIcon(g, iconKind(v, this.owned), R + (px / d) * (R - 16), R + (py / d) * (R - 16), 9);
        continue;
      }
      drawIcon(g, iconKind(v, this.owned), R + px, R + py, 15);
    }
    for (const l of this.landmarks || []) {
      const dx = (l.x - car.x) * sc, dz = (l.z - car.z) * sc;
      const px = dx * cs - dz * sn, py = dx * sn + dz * cs, d = Math.hypot(px, py);
      const k = this.found && this.found.includes(l.id) ? "landmark" : "unfound";
      if (d > R - 14) drawIcon(g, k, R + (px / d) * (R - 16), R + (py / d) * (R - 16), 10);
      else drawIcon(g, k, R + px, R + py, 17);
    }
    for (const p of this.pickups || []) {
      const dx = (p.x - car.x) * sc, dz = (p.z - car.z) * sc;
      if (Math.hypot(dx, dz) > Math.min(R - 10, 60 * sc)) continue;
      g.fillStyle = "#d7a03d"; g.font = '700 26px "Space Mono", monospace'; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("$", R + dx * cs - dz * sn, R + dx * sn + dz * cs);
    }
    // Player arrow.
    g.save();
    g.translate(R, R);
    g.rotate(camYaw - car.yaw);
    g.fillStyle = "#ff6018"; g.strokeStyle = "#fffdf9"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -20); g.lineTo(14, 16); g.lineTo(-14, 16); g.closePath(); g.fill(); g.stroke();
    g.restore();
    const na = camYaw;
    this.el.north.style.transform = `translate(${Math.sin(na) * 92}px, ${-Math.cos(na) * 92}px)`;
  }
}

export class BigMap {
  constructor(root, world, mapImg) {
    this.root = root; this.w = world; this.img = mapImg;
    root.innerHTML = `<div class="bigmap-card"><header><b>Asoka City</b><span>8 × 8 km · press M or Esc to close</span></header><canvas width="1024" height="1024"></canvas><ul class="legend"></ul></div>`;
    this.cv = root.querySelector("canvas");
    this.legend = root.querySelector(".legend");
  }

  draw(car, venues = [], owned = [], landmarks = [], found = []) {
    const g = this.cv.getContext("2d");
    g.drawImage(this.img, 0, 0);
    g.textAlign = "center"; g.textBaseline = "middle";
    for (const [k, x, z] of LABELS) {
      const px = (x + HALF) / M_PER_PX, py = (z + HALF) / M_PER_PX;
      g.font = '700 22px "Space Grotesk", system-ui, sans-serif';
      g.lineWidth = 5; g.strokeStyle = "rgba(255,253,249,0.85)"; g.fillStyle = "#182b2e";
      const t = DISTRICTS[k].name.toUpperCase();
      g.strokeText(t, px, py); g.fillText(t, px, py);
    }
    const counts = {};
    for (const v of venues) {
      const k = iconKind(v, owned);
      counts[k] = (counts[k] || 0) + 1;
      drawIcon(g, k, (v.x + HALF) / M_PER_PX, (v.z + HALF) / M_PER_PX, 9);
    }
    for (const l of landmarks) {
      const k = found.includes(l.id) ? "landmark" : "unfound";
      counts[k] = (counts[k] || 0) + 1;
      drawIcon(g, k, (l.x + HALF) / M_PER_PX, (l.z + HALF) / M_PER_PX, 13);
      if (found.includes(l.id)) {
        g.font = '600 15px "Space Grotesk", system-ui, sans-serif'; g.lineWidth = 4; g.strokeStyle = "rgba(255,253,249,0.9)"; g.fillStyle = "#182b2e";
        g.strokeText(l.name, (l.x + HALF) / M_PER_PX, (l.z + HALF) / M_PER_PX + 22); g.fillText(l.name, (l.x + HALF) / M_PER_PX, (l.z + HALF) / M_PER_PX + 22);
      }
    }
    this.legend.innerHTML = Object.keys(ICONS).filter((k) => counts[k]).map((k) => {
      const c = document.createElement("canvas"); c.width = c.height = 36;
      drawIcon(c.getContext("2d"), k, 18, 18, 15);
      return `<li><img src="${c.toDataURL()}" alt=""><span>${ICONS[k].label}</span><b>${counts[k]}</b></li>`;
    }).join("");
    const px = (car.x + HALF) / M_PER_PX, py = (car.z + HALF) / M_PER_PX;
    g.save(); g.translate(px, py); g.rotate(-car.yaw);
    g.fillStyle = "#ff6018"; g.strokeStyle = "#fffdf9"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
