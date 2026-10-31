// Keyboard and gamepad. Keyboard steering ramps in and out so a tap isn't a full lock.
import { clamp } from "./util.js";

export class Input {
  constructor() {
    this.down = new Set();
    this.hits = new Set();
    this.steerK = 0;
    this.padPrev = [];
    addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.hits.add(e.code);
      this.down.add(e.code);
    });
    addEventListener("keyup", (e) => this.down.delete(e.code));
    addEventListener("blur", () => { this.down.clear(); this.buttons.clear(); });
    // Mouse: look (pointer lock when granted, otherwise drag with the right button), buttons, wheel.
    this.buttons = new Set(); this.clicks = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0; this.lastMouse = 0;
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement || this.buttons.has(2)) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; this.lastMouse = performance.now(); }
    });
    addEventListener("mousedown", (e) => {
      if (e.target && e.target.closest && e.target.closest("button, input, select, .shop, .creator")) return;
      if (!this.buttons.has(e.button)) this.clicks.add(e.button);
      this.buttons.add(e.button);
      this.lastMouse = performance.now();
    });
    addEventListener("mouseup", (e) => this.buttons.delete(e.button));
    addEventListener("contextmenu", (e) => { if (!(e.target && e.target.closest && e.target.closest("input"))) e.preventDefault(); });
    addEventListener("wheel", (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  // Mouse look since the last call, in pixels; the right stick counts too.
  look(dt) {
    let x = this.mdx, y = this.mdy;
    this.mdx = 0; this.mdy = 0;
    const p = this.pad();
    if (p) {
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (Math.abs(rx) > 0.15) x += rx * 900 * dt;
      if (Math.abs(ry) > 0.15) y += ry * 600 * dt;
    }
    if (this.down.has("ArrowLeft")) x -= 700 * dt;
    if (this.down.has("ArrowRight")) x += 700 * dt;
    return { x, y, recent: performance.now() - this.lastMouse < 1500 || (p && Math.hypot(p.axes[2] || 0, p.axes[3] || 0) > 0.15) };
  }

  // Combat buttons: aim (right mouse, left trigger), fire (left mouse, right trigger, Space on foot).
  combat() {
    const p = this.pad();
    const aim = this.buttons.has(2) || this.down.has("KeyK") || !!(p && p.buttons[6] && p.buttons[6].value > 0.3);
    const held = this.buttons.has(0) || this.down.has("Space") || !!(p && p.buttons[7] && p.buttons[7].value > 0.3);
    let pressed = this.clicks.has(0) || this.hits.has("Space");
    if (p && p.buttons[7]) { const now = p.buttons[7].value > 0.3; if (now && !this.padPrev[7]) pressed = true; }
    const wheel = this.wheel; this.wheel = 0;
    return { aim, held, pressed, wheel };
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Edge-triggered actions: keyboard codes plus gamepad buttons.
  hit(code, button) {
    let h = this.hits.has(code);
    const p = this.pad();
    if (p && button != null) {
      const now = !!(p.buttons[button] && p.buttons[button].pressed);
      if (now && !this.padPrev[button]) h = true;
    }
    return h;
  }

  endFrame() {
    this.hits.clear();
    this.clicks.clear();
    const p = this.pad();
    if (p) this.padPrev = p.buttons.map((b) => b.pressed);
  }

  // On foot, relative to the camera: W/S forward and back, A/D sideways, Shift to jog;
  // left stick on a gamepad, A to jog.
  foot() {
    const k = this.down;
    let fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    let side = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    let run = k.has("ShiftLeft") || k.has("ShiftRight");
    const p = this.pad();
    if (p) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0.15) side = ax;
      if (Math.abs(ay) > 0.15) fwd = -ay;
      run = run || !!(p.buttons[0] && p.buttons[0].pressed);
    }
    const l = Math.hypot(fwd, side);
    if (l > 1) { fwd /= l; side /= l; }
    return { fwd, side, run };
  }

  drive(dt) {
    const k = this.down;
    const left = k.has("KeyA") || k.has("ArrowLeft"), right = k.has("KeyD") || k.has("ArrowRight");
    const want = (right ? 1 : 0) - (left ? 1 : 0);
    if (want === 0) this.steerK -= Math.sign(this.steerK) * Math.min(Math.abs(this.steerK), 5 * dt);
    else this.steerK = clamp(this.steerK + want * (Math.sign(want) !== Math.sign(this.steerK) ? 9 : 4) * dt, -1, 1);
    let throttle = k.has("KeyW") || k.has("ArrowUp") ? 1 : 0;
    let brake = k.has("KeyS") || k.has("ArrowDown") ? 1 : 0;
    let handbrake = k.has("Space");
    let steer = this.steerK;
    const p = this.pad();
    if (p) {
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * ((Math.abs(ax) - 0.12) / 0.88) ** 1.4;
      throttle = Math.max(throttle, p.buttons[7] ? p.buttons[7].value : 0);
      brake = Math.max(brake, p.buttons[6] ? p.buttons[6].value : 0);
      handbrake = handbrake || !!(p.buttons[0] && p.buttons[0].pressed);
    }
    return { throttle, brake, steer, handbrake };
  }
}
