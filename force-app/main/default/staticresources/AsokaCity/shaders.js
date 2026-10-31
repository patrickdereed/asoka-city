// GLSL for the city. Lighting is done in display space with per-face normals, distance fog
// that warms toward the sun, and procedural detail (windows, road markings, waves) so no
// textures need to be downloaded.

export const COMMON = /* glsl */ `
uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uSkyAmb; uniform vec3 uGndAmb;
uniform vec3 uFogCol; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunGlow;
uniform float uFogDen; uniform float uNight; uniform float uTime; uniform vec3 uCam;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
vec3 light(vec3 n) { float d = max(dot(n, uLightDir), 0.); return mix(uGndAmb, uSkyAmb, n.y * .5 + .5) + uLightCol * d; }
float fogF(vec3 wp) { float d = length(wp - uCam); return clamp(1. - exp(-d * d * uFogDen * uFogDen), 0., 1.); }
vec3 fogCol(vec3 wp) { vec3 v = normalize(wp - uCam); float s = pow(max(dot(v, uSunDir), 0.), 6.); return mix(uFogCol, uSunGlow, s * .85); }
vec3 fog(vec3 c, vec3 wp) { return mix(c, fogCol(wp), fogF(wp)); }
`;

const STD_VERT = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vCol;
`;

export const GROUND_VS = /* glsl */ `
${STD_VERT}
attribute float pat; flat varying float vPat;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz; vN = normal; vCol = color; vPat = pat;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const GROUND_FS = /* glsl */ `
${COMMON}
${STD_VERT}
flat varying float vPat;
void main() {
  vec3 c = vCol;
  float n1 = vnoise(vW.xz * .07), n2 = vnoise(vW.xz * .9);
  vec3 emi = vec3(0.);
  if (vPat < .5) {
    c *= .82 + .26 * n1 + .1 * n2;
  } else if (vPat < 1.5) {
    vec2 g = fract(vW.xz / 2.2);
    float line = max(step(g.x, .045), step(g.y, .045));
    c *= (1. - .1 * line) * (.92 + .1 * n2) * (.95 + .08 * n1);
  } else if (vPat < 4.5 && vPat > 3.5) {
    float ca = vnoise(vW.xz * 1.3 + uTime * .6) * vnoise(vW.xz * 1.1 - uTime * .5);
    c = mix(c, vec3(.85, .97, 1.), smoothstep(.25, .5, ca) * .5);
    emi = uNight * vec3(.05, .28, .33);
  } else {
    vec2 g = fract(vW.xz / 6.);
    float line = max(step(g.x, .02), step(g.y, .02));
    float tile = step(.5, hash12(floor(vW.xz / 6.)));
    c *= (1. - .12 * line) * (.95 + .06 * tile) * (.96 + .06 * n2);
  }
  vec3 col = c * light(normalize(vN)) + emi;
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const ROAD_VS = /* glsl */ `
varying vec3 vW; varying vec2 vUv; varying vec4 vR;
attribute vec4 rinfo;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz; vUv = uv; vR = rinfo;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ROAD_FS = /* glsl */ `
${COMMON}
varying vec3 vW; varying vec2 vUv; varying vec4 vR;
float lineAt(float x, float c, float w, float aa) { return 1. - smoothstep(w, w + aa, abs(x - c)); }
void main() {
  float u = vUv.x, v = vUv.y, hw = vR.x, ty = vR.y, au = abs(u);
  float g = vnoise(vW.xz * 1.9) * .5 + vnoise(vW.xz * .11) * .5;
  vec3 c = vec3(.25, .26, .27) * (.78 + .38 * g);
  float aa = fwidth(u) + .01;
  vec3 white = vec3(.93, .91, .86), gold = vec3(.95, .74, .3);
  float mw = 0., mg = 0.;
  if (ty < 8.5) {
    mw = max(mw, lineAt(au, hw - .45, .08, aa));
    float tyre = smoothstep(.0, .6, abs(fract(au / 3.6) - .5)) * .06;
    c *= 1. - tyre;
  }
  if (ty < .5) {
    mw = max(mw, step(fract(v / 7.), .5) * lineAt(au, 0., .07, aa));
  } else if (ty < 1.5) {
    mg = max(mg, lineAt(au, .2, .07, aa));
    mw = max(mw, step(fract(v / 9.), .4) * lineAt(au, 3.7, .07, aa));
  } else if (ty < 2.5) {
    mg = max(mg, step(fract(v / 8.), .55) * lineAt(au, 0., .08, aa));
  }
  if (ty < 1.5) {
    bool cs = vR.z >= 0. && v - vR.z < 3.6;
    bool ce = vR.w >= 0. && vR.w - v < 3.6;
    if ((cs || ce) && au < hw - .8) mw = max(mw, step(.5, fract(u / 1.1)));
    bool ss = vR.z >= 0. && v - vR.z > 4.2 && v - vR.z < 4.6 && u > 0.;
    bool se = vR.w >= 0. && vR.w - v > 4.2 && vR.w - v < 4.6 && u < 0.;
    if (ss || se) mw = 1.;
  }
  float wear = .72 + .28 * vnoise(vW.xz * .45);
  c = mix(c, white, mw * wear);
  c = mix(c, gold, mg * wear);
  vec3 col = c * light(vec3(0., 1., 0.));
  vec3 V = normalize(vW - uCam);
  float fres = pow(1. - abs(V.y), 5.);
  col += (uNight * .4 + .08) * fres * uFogCol;
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const BUILD_VS = /* glsl */ `
${STD_VERT}
varying vec2 vUv; varying vec3 vB;
attribute vec3 bdata;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz; vN = normal; vCol = color; vUv = uv; vB = bdata;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const BUILD_FS = /* glsl */ `
${COMMON}
${STD_VERT}
varying vec2 vUv; varying vec3 vB;
const vec3 NEON[6] = vec3[6](vec3(1., .42, .18), vec3(1., .42, .18), vec3(.25, .82, .79), vec3(1., .78, .4), vec3(.8, .46, .63), vec3(1., .99, .97));
void main() {
  vec3 n = normalize(vN);
  float st = vB.x, top = vB.z;
  float neonI = floor(vB.y) - 1., seed = fract(vB.y);
  vec3 base = vCol;
  float nz = vnoise(vW.xz * .23 + vW.y * .17);
  vec3 lc = light(n);
  vec3 col; vec3 emi = vec3(0.);
  if (n.y > .5) {
    col = base * (.9 + .15 * nz) * lc;
    if (st > 9.5 && st < 10.5) emi = base * (.35 + uNight * 1.1);
  } else if (n.y < -.5) {
    col = base * .5 * lc;
  } else if (st > 8.5) {
    float stain = smoothstep(.4, .9, vnoise(vec2(vW.x + vW.z, vW.y * 3.) * .3)) * .15;
    col = base * (.88 + .16 * nz - stain) * lc;
    if (st > 9.5 && st < 10.5) emi = base * (.35 + uNight * 1.1);
  } else {
    vec2 uv = vUv;
    float fh = st == 3. ? 3. : st == 0. ? 3.4 : st == 8. ? 3.5 : 3.6;
    float fy = uv.y / fh, fl = floor(fy), fyF = fract(fy);
    float cx = floor(uv.x), cxF = fract(uv.x);
    float win = 0., avg = 0., litP = .5;
    vec3 wall = base * (.9 + .14 * nz);
    if (st == 0.) {
      win = step(.07, cxF) * step(cxF, .93) * step(.12, fyF) * step(fyF, .95); avg = .76; litP = .55;
    } else if (st == 1.) {
      win = fl < .5 ? step(.06, cxF) * step(cxF, .94) * step(.1, fyF) * step(fyF, .8)
                    : step(.38, fyF) * step(fyF, .78) * step(.08, cxF) * step(cxF, .92);
      avg = .32; litP = .45;
    } else if (st == 2.) {
      win = step(.22, cxF) * step(cxF, .78) * step(.3, fyF) * step(fyF, .82); avg = .3;
    } else if (st == 3.) {
      win = step(.3, cxF) * step(cxF, .7) * step(.35, fyF) * step(fyF, .8) * step(.35, hash12(vec2(cx, fl) + seed * 31.)); avg = .14; litP = .4;
    } else if (st == 4.) {
      wall *= .88 + .12 * sin(uv.x * 62.83);
      if (uv.y < 5.5 && mod(cx, 3.) == 1.) wall *= .55;
      win = step(top - 3.4, uv.y) * step(uv.y, top - 2.) * step(.1, cxF) * step(cxF, .9); avg = .08; litP = .7;
    } else if (st == 5.) {
      wall *= .8 + .2 * smoothstep(-.2, .9, sin(uv.x * 251.3));
      if (fract(uv.y / 2.6) > .93) wall *= .7;
    } else if (st == 6.) {
      win = step(.42, fyF) * step(fyF, .86) * step(.04, cxF) * step(cxF, .96); avg = .42; litP = .75;
    } else if (st == 7.) {
      win = step(.05, cxF) * step(cxF, .95) * step(.06, fyF) * step(fyF, .97); avg = .85; litP = .12;
    } else if (st == 8.) {
      win = fl < .5 ? step(.06, cxF) * step(cxF, .94) * step(.06, fyF) * step(fyF, .88)
                    : step(.25, cxF) * step(cxF, .75) * step(.3, fyF) * step(fyF, .8);
      avg = .45; litP = .7;
    }
    if (st != 5. && st != 4.) wall *= mix(.68, 1., smoothstep(0., 5., uv.y));
    float aa = clamp(1. - 1.6 * max(fwidth(uv.x), fwidth(fy)), 0., 1.);
    float wA = mix(avg, win, aa);
    vec3 V = normalize(vW - uCam);
    float fres = .2 + .8 * pow(1. - abs(dot(V, n)), 3.);
    vec3 sky = mix(uFogCol, uZenith, .45);
    vec3 glass = mix(vec3(.13, .18, .2), sky, fres * .85);
    if (st == 0. || st == 7.) glass = mix(glass, base * .7, .35);
    if (st == 6.) glass = mix(glass, vec3(.2, .45, .48), .4);
    glass *= 1. - uNight * .75;
    float sunSpec = pow(max(dot(reflect(V, n), uLightDir), 0.), 40.) * (1. - uNight);
    col = mix(wall * lc, glass + uLightCol * sunSpec * .8, wA);
    float lit = step(1. - litP, hash12(vec2(cx, fl) + seed * 91.7));
    float flick = .85 + .15 * step(.5, hash12(vec2(cx, fl) + floor(uTime * .1)));
    vec3 lcol = mix(vec3(1., .8, .52), vec3(.78, .9, 1.), step(.62, hash12(vec2(fl, cx) + seed * 13.1)));
    if (hash12(vec2(cx * 3., fl) + seed) > .97) lcol = vec3(1., .5, .25);
    emi += lcol * mix(litP, lit * flick, aa) * win * uNight * .95 + lcol * avg * litP * (1. - aa) * uNight * .9;
    if (neonI >= 0. && uv.y > top - 1.2 && uv.y < top - .35) {
      vec3 nc = NEON[int(neonI)];
      col = nc * lc * .8;
      emi += nc * (.2 + uNight * 1.25);
    }
    if (st == 1. && neonI >= 0. && uv.y > 3.9 && uv.y < 4.25) {
      vec3 nc = NEON[int(mod(neonI + 2., 6.))];
      emi += nc * uNight * 1.1;
    }
  }
  gl_FragColor = vec4(fog(col + emi, vW), 1.);
}`;

export const PROP_VS = /* glsl */ `
${STD_VERT}
attribute vec2 cdata; varying float vE;
void main() {
  vec4 lp = vec4(position, 1.);
  vec3 ln = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * ln); vCol = color; vE = cdata.y;
  #ifdef USE_INSTANCING_COLOR
    if (cdata.x > .5) vCol *= instanceColor;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const PROP_FS = /* glsl */ `
${COMMON}
${STD_VERT}
varying float vE; uniform float uBrake; uniform float uLights;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 col = vCol * light(n);
  if (vE > .5) {
    if (vE < 1.5) col = mix(col, vec3(1., .97, .86), clamp(.25 + uNight + uLights, 0., 1.));
    else if (vE < 2.5) col = vec3(.85, .08, .06) * (.55 + .9 * max(uNight * .6, uBrake));
    else col = vCol * (.5 + 1.1 * uNight);
  }
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const WATER_VS = /* glsl */ `
varying vec3 vW;
void main() { vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

export const WATER_FS = /* glsl */ `
${COMMON}
uniform sampler2D uDepth;
varying vec3 vW;
void main() {
  vec2 tuv = (vW.xz + 4096.) / 8192.;
  float depth = texture2D(uDepth, clamp(tuv, 0., 1.)).r * 12.;
  if (tuv.x < 0. || tuv.y < 0. || tuv.x > 1. || tuv.y > 1.) depth = 12.;
  vec2 p = vW.xz; float t = uTime;
  vec3 n = normalize(vec3(
    .045 * cos(p.x * .11 + t * 1.1) + (vnoise(p * .35 + t * .3) - .5) * .22,
    1.,
    .05 * cos(p.y * .13 - t * .9) + (vnoise(p * .31 - t * .27) - .5) * .22));
  vec3 V = normalize(vW - uCam);
  vec3 R = reflect(V, n);
  float fres = .04 + .96 * pow(1. - max(dot(-V, n), 0.), 5.);
  vec3 shallow = vec3(.32, .74, .7), deep = vec3(.06, .24, .29);
  vec3 wc = mix(shallow, deep, smoothstep(.3, 8., depth)) * light(vec3(0., 1., 0.)) * .9;
  vec3 sky = mix(uFogCol, uZenith, clamp(R.y * 2.5, 0., 1.));
  sky += uSunGlow * pow(max(dot(R, uSunDir), 0.), 12.) * .5;
  vec3 col = mix(wc, sky, fres * .85);
  col += uLightCol * pow(max(dot(R, uLightDir), 0.), 160.) * 1.6;
  float foam = smoothstep(.7, 0., depth) * (.55 + .45 * sin(depth * 9. - t * 2. + vnoise(p * .2) * 6.));
  col = mix(col, vec3(.97, .96, .92) * light(vec3(0., 1., 0.)), clamp(foam, 0., 1.) * .85);
  col += uNight * vec3(.3, .17, .08) * pow(vnoise(p * .04 + vec2(t * .02, 0.)), 5.) * .6;
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`;

export const SKY_FS = /* glsl */ `
${COMMON}
uniform vec3 uMoonDir;
varying vec3 vDir;
float fbm3(vec2 p) { return vnoise(p) * .55 + vnoise(p * 2.1) * .3 + vnoise(p * 4.3) * .15; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uFogCol, uZenith, pow(clamp(h, 0., 1.), .5));
  if (h < 0.) col = uFogCol * mix(1., .85, clamp(-h * 4., 0., 1.));
  float s = max(dot(d, uSunDir), 0.);
  col += uSunGlow * (pow(s, 7.) * .55 + pow(s, 80.) * .5);
  col += vec3(1., .95, .85) * smoothstep(.9992, .9995, s);
  if (h > 0.) {
    vec2 cp = d.xz / (h + .12);
    float c = smoothstep(.5, .82, fbm3(cp * vec2(.9, 2.6) + vec2(uTime * .006, 0.)));
    vec3 cc = mix(uFogCol * 1.08, uSunGlow * 1.1, pow(s, 2.5) * .8);
    cc = mix(cc, uZenith * 1.3, uNight * .8);
    col = mix(col, cc, c * .6 * smoothstep(0., .12, h));
  }
  if (uNight > 0.) {
    vec2 sp = vec2(atan(d.z, d.x) * 160., h * 320.);
    float st = step(.9975, hash12(floor(sp))) * smoothstep(.04, .3, h);
    col += st * uNight * (.6 + .4 * sin(uTime * 3. + hash12(floor(sp)) * 40.));
    float m = max(dot(d, uMoonDir), 0.);
    col += vec3(.92, .95, 1.) * smoothstep(.99955, .9997, m) * uNight + vec3(.25, .35, .45) * pow(m, 40.) * uNight * .35;
  }
  gl_FragColor = vec4(col, 1.);
}`;

export const GLOW_VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iP;
uniform float uNight; uniform float uTime; uniform vec3 uCam; uniform float uFogDen;
varying vec3 vCol; varying vec2 vC; varying float vA; varying float vFlat;
void main() {
  float size = iP.x;
  float dist = length(iPos - uCam);
  vec3 wp;
  if (iP.y > .5) {
    float r = iP.y - 1.;
    vec2 c = vec2(cos(r), sin(r)), q = position.xy * vec2(size, size * (iP.y > 1.01 ? 1.9 : 1.));
    wp = iPos + vec3(q.x * c.x - q.y * c.y, 0., q.x * c.y + q.y * c.x);
  } else {
    size = max(size, dist * .0045);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp = iPos + (right * position.x + up * position.y) * size;
  }
  float a = iP.w * max(uNight, iCol.a);
  if (iP.z >= 0.) a *= .15 + .85 * step(.72, fract(uTime * .55 + iP.z));
  a *= exp(-pow(dist * uFogDen * .55, 2.));
  vA = a; vCol = iCol.rgb; vC = position.xy; vFlat = iP.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;

export const GLOW_FS = /* glsl */ `
varying vec3 vCol; varying vec2 vC; varying float vA; varying float vFlat;
void main() {
  float d = length(vC);
  if (d > 1.) discard;
  float g = vFlat > .5 ? pow(1. - d, 2.) * .55 : exp(-d * d * 5.) * .8 + smoothstep(.22, 0., d) * .9;
  gl_FragColor = vec4(vCol * g * vA, 1.);
}`;

export const SIGN_VS = /* glsl */ `
varying vec3 vW; varying vec2 vUv; varying vec3 vCol; varying vec3 vN;
void main() { vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vUv = uv; vCol = color; vN = normal; gl_Position = projectionMatrix * viewMatrix * wp; }`;

export const SIGN_FS = /* glsl */ `
${COMMON}
uniform sampler2D uMap;
varying vec3 vW; varying vec2 vUv; varying vec3 vCol; varying vec3 vN;
void main() {
  float a = texture2D(uMap, vUv).r;
  vec3 panel = vec3(.09, .17, .18) * light(normalize(vN));
  vec3 col = mix(panel, vCol * (.75 + uNight * 1.3), a);
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;
