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
    addEventListener("blur", () => this.down.clear());
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
    const p = this.pad();
    if (p) this.padPrev = p.buttons.map((b) => b.pressed);
  }

  // On foot: W/S walk, A/D turn, Shift to jog; left stick on a gamepad, A to jog.
  foot() {
    const k = this.down;
    let move = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 0.6 : 0);
    let turn = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    let run = k.has("ShiftLeft") || k.has("ShiftRight");
    const p = this.pad();
    if (p) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.abs(ax) > 0.15) turn = ax;
      if (Math.abs(ay) > 0.15) move = -ay;
      run = run || !!(p.buttons[0] && p.buttons[0].pressed);
    }
    return { move, turn, run };
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
