// HDR post-processing: the scene renders into a multisampled half-float target, then a
// bloom mip chain, filmic tone mapping, an Asoka colour grade, vignette and dither.
import * as THREE from "./three.module.min.js";

const VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const PREFILTER = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 c = (tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.))) * .25;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * .5;
  float soft = clamp(br - uThreshold + knee, 0., 2. * knee);
  soft = soft * soft / (4. * knee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(60.)), 1.);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 c = tap(vec2(0.)) * .125;
  c += (tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.))) * .125;
  c += (tap(vec2(-2., 0.)) + tap(vec2(2., 0.)) + tap(vec2(0., -2.)) + tap(vec2(0., 2.))) * .0625;
  c += (tap(vec2(-2., -2.)) + tap(vec2(2., -2.)) + tap(vec2(-2., 2.)) + tap(vec2(2., 2.))) * .03125;
  gl_FragColor = vec4(c, 1.);
}`;

const UP = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uWeight;
varying vec2 vUv;
vec3 tap(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main() {
  vec3 c = tap(vec2(0.)) * 4.;
  c += (tap(vec2(-1., 0.)) + tap(vec2(1., 0.)) + tap(vec2(0., -1.)) + tap(vec2(0., 1.))) * 2.;
  c += tap(vec2(-1., -1.)) + tap(vec2(1., -1.)) + tap(vec2(-1., 1.)) + tap(vec2(1., 1.));
  gl_FragColor = vec4(c / 16. * uWeight, 1.);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure;
uniform float uTime; uniform vec2 uRes; uniform float uVignette; uniform float uGrade; uniform float uBright; uniform float uContrast;
varying vec2 vUv;
vec3 aces(vec3 x) {
  const mat3 m1 = mat3(.59719, .07600, .02840, .35458, .90834, .13383, .04823, .01566, .83777);
  const mat3 m2 = mat3(1.60475, -.10208, -.00327, -.53108, 1.10813, -.07276, -.07367, -.00605, 1.07602);
  vec3 v = m1 * x;
  vec3 a = v * (v + .0245786) - .000090537;
  vec3 b = v * (.983729 * v + .4329510) + .238081;
  return clamp(m2 * (a / b), 0., 1.);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * uBloom;
  // The player's brightness setting: half as more exposure, half as a lift in the shadows.
  float b = sqrt(uBright);
  c = aces(c * uExposure * b);
  c = pow(c, vec3(1. / (2.2 * b)));
  // Asoka grade: spruce in the shadows, warm cream in the highlights.
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(c, c * vec3(.9, 1.03, 1.05), (1. - l) * .35 * uGrade);
  c = mix(c, c * vec3(1.05, 1.0, .93), l * .3 * uGrade);
  c = mix(vec3(l), c, 1. + .1 * uGrade);
  c = clamp((c - .5) * uContrast + .5, 0., 1.);
  vec2 q = vUv - .5;
  c *= 1. - uVignette * dot(q, q) * 1.6;
  c += (hash(vUv * uRes + fract(uTime)) - .5) / 255.;
  gl_FragColor = vec4(c, 1.);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    tri.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.quad = new THREE.Mesh(tri, null);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    const mk = (fs, u, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false, ...extra });
    this.pre = mk(PREFILTER, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 2.4 } });
    this.down = mk(DOWN, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mk(UP, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uWeight: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true });
    this.comp = mk(COMPOSITE, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.55 }, uExposure: { value: 1 },
      uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uVignette: { value: 0.32 }, uGrade: { value: 1 },
      uBright: { value: 1 }, uContrast: { value: 1 },
    });
    this.bright = 1; this.contrast = 1;
    this.levels = 6;
    this.samples = 4;
    this.size = new THREE.Vector2();
  }

  setSize(w, h, samples) {
    if (this.rt && this.size.x === w && this.size.y === h && this.samples === samples) return;
    this.size.set(w, h);
    this.samples = samples;
    this.dispose();
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rt = new THREE.WebGLRenderTarget(w, h, { ...opt, depthBuffer: true, samples });
    this.mips = [];
    let mw = w >> 1, mh = h >> 1;
    for (let i = 0; i < this.levels; i++) {
      this.mips.push(new THREE.WebGLRenderTarget(Math.max(1, mw), Math.max(1, mh), opt));
      mw >>= 1; mh >>= 1;
    }
    this.comp.uniforms.uRes.value.set(w, h);
  }

  dispose() {
    if (this.rt) this.rt.dispose();
    for (const m of this.mips || []) m.dispose();
  }

  pass(mat, target, clear = true) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    if (clear) this.r.clear(true, false, false);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, time, exposure, bloomOn = true) {
    const r = this.r;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    const auto = r.autoClear;
    r.autoClear = false;
    if (bloomOn) {
      this.pre.uniforms.tSrc.value = this.rt.texture;
      this.pre.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
      this.pass(this.pre, this.mips[0]);
      for (let i = 1; i < this.levels; i++) {
        const src = this.mips[i - 1];
        this.down.uniforms.tSrc.value = src.texture;
        this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.pass(this.down, this.mips[i]);
      }
      for (let i = this.levels - 1; i > 0; i--) {
        const src = this.mips[i];
        this.up.uniforms.tSrc.value = src.texture;
        this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.up.uniforms.uWeight.value = 1;
        this.pass(this.up, this.mips[i - 1], false);
      }
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.rt.texture;
    u.tBloom.value = this.mips[0].texture;
    u.uBloom.value = bloomOn ? 0.5 : 0;
    u.uExposure.value = exposure;
    u.uBright.value = this.bright; u.uContrast.value = this.contrast;
    u.uTime.value = time;
    this.pass(this.comp, null);
    r.autoClear = auto;
  }
}
