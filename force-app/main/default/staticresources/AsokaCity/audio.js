// Synthesised sound: engine, tyre squeal, wind, impacts and a horn. Nothing is downloaded.

export class Audio {
  constructor() {
    this.ctx = null;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = 0.55; this.master.connect(c.destination);

    this.eng = c.createGain(); this.eng.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 3;
    this.engLP = lp;
    this.o1 = c.createOscillator(); this.o1.type = "sawtooth";
    this.o2 = c.createOscillator(); this.o2.type = "square";
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.o1.connect(lp); this.o2.connect(g2); g2.connect(lp); lp.connect(this.eng); this.eng.connect(this.master);
    this.o1.start(); this.o2.start();

    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = noise;
    const src = (gain, type, f, q) => {
      const s = c.createBufferSource(); s.buffer = noise; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(bp); bp.connect(g); g.connect(this.master); s.start();
      return g;
    };
    this.squeal = src(0, "bandpass", 1500, 6);
    this.wind = src(0, "lowpass", 500, 0.5);
    this.city = src(0.035, "lowpass", 220, 0.7);
  }

  update(car, cameraSpeed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = car.rpm / 60 * 2;
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.engLP.frequency.setTargetAtTime(500 + car.throttle * 1600 + car.rpm * 0.12, t, 0.05);
    this.eng.gain.setTargetAtTime(0.09 + car.throttle * 0.1, t, 0.05);
    const sq = car.airborne ? 0 : Math.min(1, Math.max(0, (car.slip - 2.5) / 6));
    this.squeal.gain.setTargetAtTime(sq * 0.22, t, 0.05);
    this.wind.gain.setTargetAtTime(Math.min(0.25, cameraSpeed / 220), t, 0.2);
  }

  bang(mag, kind = "impact") {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = kind === "knock" ? 2400 : 300 + mag * 40;
    const g = c.createGain();
    const v = Math.min(1, mag / 18) * (kind === "knock" ? 0.5 : 0.9);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + mag * 0.01);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 0.6);
    if (kind === "knock") {
      const o = c.createOscillator(); o.type = "triangle"; o.frequency.value = 520;
      const og = c.createGain(); og.gain.setValueAtTime(0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.5);
    }
  }

  horn(on) {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.hornO) {
      const g = c.createGain(); g.gain.value = 0.12;
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = o2.type = "square"; o1.frequency.value = 392; o2.frequency.value = 494;
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1800;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.hornO = [o1, o2, g];
    } else if (!on && this.hornO) {
      for (const o of this.hornO.slice(0, 2)) o.stop();
      this.hornO = null;
    }
  }
}
