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
      <div class="hud-toast" id="hd-toast"></div>
      <div class="hud-help" id="hd-help">W/S drive · A/D steer · Space handbrake · C camera · M map · R reset · [ ] time · Esc pause</div>`;
    this.el = {
      district: root.querySelector("#hd-district"), dname: root.querySelector("#hd-district b"),
      clock: root.querySelector("#hd-clock"), sky: root.querySelector("#hd-sky"),
      mini: root.querySelector("#hd-mini"), north: root.querySelector("#hd-north"),
      speed: root.querySelector("#hd-speed"), gear: root.querySelector("#hd-gear"),
      toast: root.querySelector("#hd-toast"), help: root.querySelector("#hd-help"),
    };
    this.g = this.el.mini.getContext("2d");
    this.cur = null; this.pending = null; this.pendingT = 0; this.cardT = 0; this.toastT = 0;
    setTimeout(() => this.el.help.classList.add("fade"), 12000);
  }

  toast(msg, secs = 3) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add("on");
    this.toastT = secs;
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
    root.innerHTML = `<div class="bigmap-card"><header><b>Asoka City</b><span>8 × 8 km · press M or Esc to close</span></header><canvas width="1024" height="1024"></canvas></div>`;
    this.cv = root.querySelector("canvas");
  }

  draw(car) {
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
    const px = (car.x + HALF) / M_PER_PX, py = (car.z + HALF) / M_PER_PX;
    g.save(); g.translate(px, py); g.rotate(-car.yaw);
    g.fillStyle = "#ff6018"; g.strokeStyle = "#fffdf9"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
}
