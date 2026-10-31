// GLSL for the city. Shading is in linear HDR (tone mapped in post.js): vertex and palette
// colours are sRGB and converted on input, the sun casts a shadow map, windows show lit
// rooms behind the glass, roads get wet at night, and lights bloom.

export const COMMON = /* glsl */ `
uniform vec3 uLightDir; uniform vec3 uLightCol; uniform vec3 uSkyAmb; uniform vec3 uGndAmb;
uniform vec3 uFogCol; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunGlow;
uniform float uFogDen; uniform float uNight; uniform float uTime; uniform vec3 uCam; uniform float uWet;
uniform sampler2DShadow uShadow; uniform mat4 uShadowMat; uniform float uShadowOn; uniform float uShadowTexel;
vec3 lin(vec3 c) { return pow(max(c, 0.), vec3(2.2)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float shadowAt(vec3 wp, vec3 n) {
  if (uShadowOn < .01) return 1.;
  vec4 sp = uShadowMat * vec4(wp + n * .18 + uLightDir * .1, 1.);
  vec3 p = sp.xyz;
  if (p.x <= 0. || p.x >= 1. || p.y <= 0. || p.y >= 1. || p.z >= 1.) return 1.;
  float z = p.z - .0004;
  float s = 0.;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(uShadow, vec3(p.xy + vec2(float(i), float(j)) * uShadowTexel, z));
  s /= 9.;
  vec2 e = min(p.xy, 1. - p.xy);
  return mix(1., s, smoothstep(0., .05, min(e.x, e.y)) * uShadowOn);
}
vec3 amb(vec3 n) { return mix(uGndAmb, uSkyAmb, n.y * .5 + .5); }
vec3 light(vec3 n, float sh) { return amb(n) + uLightCol * max(dot(n, uLightDir), 0.) * sh; }
float fogF(vec3 wp) { float d = length(wp - uCam); return clamp(1. - exp(-d * d * uFogDen * uFogDen), 0., 1.); }
vec3 fogCol(vec3 wp) { vec3 v = normalize(wp - uCam); float s = pow(max(dot(v, uSunDir), 0.), 6.); return mix(uFogCol, uSunGlow, s * .85); }
vec3 fog(vec3 c, vec3 wp) { return mix(c, fogCol(wp), fogF(wp)); }
vec3 skyRefl(vec3 r) {
  vec3 s = mix(uFogCol, uZenith, clamp(r.y * 2.2, 0., 1.));
  s += uSunGlow * pow(max(dot(r, uSunDir), 0.), 10.) * .6;
  // Near the horizon a city reflects other buildings and the street, not open sky.
  vec3 city = mix(uGndAmb * .5, uFogCol * .35, .5) + uNight * vec3(.06, .04, .02);
  return mix(city, s, smoothstep(-.05, .32, r.y));
}
`;

const STD = /* glsl */ `varying vec3 vW; varying vec3 vN; varying vec3 vCol;`;

export const GROUND_VS = /* glsl */ `
${STD}
attribute float pat; flat varying float vPat;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz; vN = normal; vCol = pow(color, vec3(2.2)); vPat = pat;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const GROUND_FS = /* glsl */ `
${COMMON}
${STD}
flat varying float vPat;
void main() {
  vec3 c = vCol;
  vec3 n = normalize(vN);
  float n1 = vnoise(vW.xz * .07), n2 = vnoise(vW.xz * .9), n3 = vnoise(vW.xz * 3.1);
  vec3 emi = vec3(0.);
  float spec = 0.;
  if (vPat < .5) {
    c *= .7 + .45 * n1 + .15 * n2 + .1 * n3;
  } else if (vPat < 1.5) {
    vec2 g = fract(vW.xz / 2.2);
    float line = max(1. - smoothstep(.02, .05, g.x), 1. - smoothstep(.02, .05, g.y));
    c *= (1. - .18 * line) * (.86 + .14 * n2) * (.92 + .12 * n1) * (.94 + .1 * n3);
    spec = .25;
  } else if (vPat > 3.5 && vPat < 4.5) {
    float ca = vnoise(vW.xz * 1.3 + uTime * .6) * vnoise(vW.xz * 1.1 - uTime * .5);
    c = mix(c, vec3(.7, .95, 1.), smoothstep(.25, .5, ca) * .5);
    emi = uNight * vec3(.05, .5, .6) * .8;
    spec = 1.;
  } else {
    vec2 g = fract(vW.xz / 6.);
    float line = max(1. - smoothstep(.01, .025, g.x), 1. - smoothstep(.01, .025, g.y));
    float tile = step(.5, hash12(floor(vW.xz / 6.)));
    c *= (1. - .2 * line) * (.9 + .1 * tile) * (.92 + .1 * n2);
    spec = .4;
  }
  float sh = shadowAt(vW, n);
  vec3 col = c * light(n, sh) + emi;
  vec3 V = normalize(vW - uCam);
  float fres = pow(1. - abs(V.y), 5.);
  col += skyRefl(reflect(V, n)) * fres * spec * (.15 + uWet * .5);
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
  float g = vnoise(vW.xz * 1.9) * .4 + vnoise(vW.xz * .11) * .4 + vnoise(vW.xz * 7.) * .2;
  vec3 c = lin(vec3(.27, .28, .29) * (.74 + .42 * g));
  float aa = fwidth(u) + .01;
  vec3 white = lin(vec3(.93, .91, .86)), gold = lin(vec3(.97, .74, .28));
  float mw = 0., mg = 0.;
  float tyre = 0.;
  if (ty < 8.5) {
    mw = max(mw, lineAt(au, hw - .45, .08, aa));
    tyre = (1. - smoothstep(.0, .5, abs(fract(au / 3.6 + .25) - .5) * 3.6 - .9)) * .25;
    c *= 1. - tyre * .5;
    c *= 1. - .25 * smoothstep(hw - 1.2, hw, au);
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
  float wear = .65 + .35 * vnoise(vW.xz * .45);
  c = mix(c, white, mw * wear);
  c = mix(c, gold, mg * wear);
  vec3 n = vec3(0., 1., 0.);
  float sh = shadowAt(vW, n);
  vec3 col = c * light(n, sh);
  // Wet asphalt: puddles reflect the sky and the sun or moon.
  vec3 V = normalize(vW - uCam);
  float puddle = smoothstep(.45, .7, vnoise(vW.xz * .09) * .7 + vnoise(vW.xz * .5) * .3) * (1. - mw) ;
  float wet = clamp(uWet * (.55 + .45 * puddle) + tyre * uWet * .3, 0., 1.);
  float fres = .03 + .97 * pow(1. - abs(V.y), 5.);
  vec3 R = reflect(V, n);
  col = mix(col, col * .55, wet * .6);
  col += skyRefl(R) * fres * (.08 + wet * .9);
  col += uLightCol * pow(max(dot(R, uLightDir), 0.), 60. + wet * 400.) * (1. + wet * 6.) * sh;
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const BUILD_VS = /* glsl */ `
${STD}
varying vec2 vUv; varying vec3 vB;
attribute vec3 bdata;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.);
  vW = wp.xyz; vN = normal; vCol = pow(color, vec3(2.2)); vUv = uv; vB = bdata;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const BUILD_FS = /* glsl */ `
${COMMON}
${STD}
varying vec2 vUv; varying vec3 vB;
const vec3 NEON[6] = vec3[6](vec3(1., .3, .06), vec3(1., .3, .06), vec3(.08, .75, .7), vec3(1., .6, .15), vec3(.75, .22, .45), vec3(1., .97, .92));
const float CW[12] = float[12](1.7, 3.6, 3.0, 3.2, 6., 6., 3.4, 4., 4.5, 8., 8., 8.);

// A box room behind each window: which wall the view ray hits decides the shade.
vec3 room(vec2 cell, float cw, float fh, vec3 V, vec3 n, vec3 t, float h, out float glow) {
  vec3 d = vec3(dot(V, t), V.y, -dot(V, n));
  vec3 p = vec3(cell.x * cw, cell.y * fh, 0.);
  float depth = 3. + h * 3.;
  float tx = d.x > 0. ? (cw - p.x) / d.x : -p.x / min(d.x, -1e-4);
  float ty = d.y > 0. ? (fh - p.y) / d.y : -p.y / min(d.y, -1e-4);
  float tz = depth / max(d.z, 1e-4);
  float tm = min(tx, min(ty, tz));
  vec3 hit = p + d * tm;
  vec3 wallC = mix(vec3(.82, .76, .66), vec3(.6, .72, .74), step(.6, h));
  vec3 c;
  if (tm == tz) {
    c = wallC;
    // furniture and the odd person on the back wall
    float fx = hit.x / cw;
    if (hit.y < fh * .45 && abs(fx - fract(h * 7.3)) < .22) c *= .35;
    if (h > .82 && abs(fx - .5) < .06 && hit.y < fh * .62) c *= .2;
    glow = .8;
  } else if (tm == ty) {
    c = d.y > 0. ? vec3(.95, .92, .86) : mix(vec3(.35, .27, .2), vec3(.3, .32, .34), step(.5, h));
    glow = d.y > 0. ? 1.3 : .45;
  } else {
    c = wallC * .8;
    glow = .65;
  }
  glow *= mix(.6, 1., hit.y / fh);
  return c;
}

void main() {
  vec3 n = normalize(vN);
  float st = vB.x, top = vB.z;
  float neonI = floor(vB.y) - 1., seed = fract(vB.y);
  vec3 base = vCol;
  float nz = vnoise(vW.xz * .23 + vW.y * .17);
  float sh = shadowAt(vW, n);
  vec3 lc = light(n, sh);
  vec3 V = normalize(vW - uCam);
  vec3 col; vec3 emi = vec3(0.);
  if (n.y > .5) {
    col = base * (.85 + .25 * nz) * lc;
    if (st > 9.5 && st < 10.5) emi = base * (1. + uNight * 6.);
  } else if (n.y < -.5) {
    col = base * .5 * amb(n);
  } else if (st > 8.5) {
    float stain = smoothstep(.4, .9, vnoise(vec2(vW.x + vW.z, vW.y * 3.) * .3)) * .2;
    col = base * (.85 + .2 * nz - stain) * lc;
    if (st > 9.5 && st < 10.5) emi = base * (1. + uNight * 6.);
  } else {
    vec2 uv = vUv;
    int si = int(st);
    float fh = st == 3. ? 3. : st == 0. ? 3.4 : st == 8. ? 3.5 : 3.6;
    float fy = uv.y / fh, fl = floor(fy), fyF = fract(fy);
    float cx = floor(uv.x), cxF = fract(uv.x);
    vec4 wr = vec4(0.);   // window rect: x0, x1, y0, y1 within the cell
    float avg = 0., litP = .5;
    vec3 wall = base * (.88 + .18 * nz);
    if (st == 0.) { wr = vec4(.06, .94, .1, .96); avg = .78; litP = .55; }
    else if (st == 1.) { wr = fl < .5 ? vec4(.05, .95, .08, .8) : vec4(.1, .9, .38, .8); avg = .32; litP = .45; }
    else if (st == 2.) { wr = vec4(.22, .78, .3, .82); avg = .28; }
    else if (st == 3.) { wr = step(.35, hash12(vec2(cx, fl) + seed * 31.)) * vec4(.3, .7, .35, .8); avg = .14; litP = .4; }
    else if (st == 4.) {
      wall *= .86 + .14 * sin(uv.x * 62.83);
      if (uv.y < 5.5 && mod(cx, 3.) == 1.) wall *= .5;
      if (uv.y > top - 3.4 && uv.y < top - 2.) wr = vec4(.1, .9, 0., 1.);
      avg = .08; litP = .7;
    } else if (st == 5.) {
      wall *= .78 + .22 * smoothstep(-.2, .9, sin(uv.x * 251.3));
      if (fract(uv.y / 2.6) > .93) wall *= .65;
    } else if (st == 6.) { wr = vec4(.04, .96, .42, .86); avg = .42; litP = .75; }
    else if (st == 7.) { wr = vec4(.04, .96, .05, .97); avg = .85; litP = .12; }
    else if (st == 8.) { wr = fl < .5 ? vec4(.05, .95, .05, .9) : vec4(.25, .75, .3, .8); avg = .45; litP = .7; }
    if (st != 5. && st != 4.) wall *= mix(.6, 1., smoothstep(0., 5., uv.y));
    float win = step(wr.x, cxF) * step(cxF, wr.y) * step(wr.z, fyF) * step(fyF, wr.w);
    float frame = win * (1. - step(wr.x + .03, cxF) * step(cxF, wr.y - .03) * step(wr.z + .04, fyF) * step(fyF, wr.w - .04));
    float aa = clamp(1. - 1.5 * max(fwidth(uv.x), fwidth(fy)), 0., 1.);
    float h = hash12(vec2(cx, fl) + seed * 91.7);
    float lit = step(1. - litP, h);
    vec3 lcol = mix(vec3(1., .72, .4), vec3(.7, .85, 1.), step(.62, hash12(vec2(fl, cx) + seed * 13.1)));
    if (hash12(vec2(cx * 3., fl) + seed) > .97) lcol = vec3(1., .4, .15);
    // Interior seen through the glass.
    vec3 t = vec3(-n.z, 0., n.x);
    float cw = CW[si];
    vec2 cell = vec2((cxF - wr.x) / max(wr.y - wr.x, .01), (fyF - wr.z) / max(wr.w - wr.z, .01));
    float rg;
    vec3 rc = room(clamp(cell, 0., 1.), cw * (wr.y - wr.x), fh * (wr.w - wr.z), V, n, t, h, rg);
    float blinds = step(.7, hash12(vec2(cx, fl * 1.7) + seed)) * step(1. - fract(h * 13.) * .8, cell.y);
    float slats = blinds * (.6 + .4 * step(.5, fract(cell.y * 18.)));
    vec3 inside = mix(rc, vec3(.85, .82, .76), slats);
    vec3 insideLit = inside * lcol * rg * 2.6 * lit * (.85 + .15 * step(.5, hash12(vec2(cx, fl) + floor(uTime * .1))));
    vec3 insideDay = inside * amb(n) * .22;
    float fres = .06 + .94 * pow(1. - abs(dot(V, n)), 4.);
    vec3 R = reflect(V, n);
    vec3 refl = skyRefl(R) * (st == 0. || st == 7. ? 1. : .8);
    if (st == 0. || st == 7.) refl = mix(refl, refl * base * 1.6, .35);
    if (st == 6.) refl = mix(refl, refl * vec3(.4, .9, .95), .4);
    float sunSpec = pow(max(dot(R, uLightDir), 0.), 200.) * sh;
    float glassRefl = st == 0. || st == 7. ? mix(.35, 1., fres) : fres;
    vec3 glass = mix(insideDay, refl, glassRefl) + uLightCol * sunSpec * 4.;
    vec3 near = mix(wall * lc, glass, win);
    near = mix(near, wall * lc * .45, frame);
    vec3 nearE = insideLit * win * (1. - frame) * (1. - glassRefl * .5) * uNight;
    vec3 far = mix(wall * lc, mix(vec3(.02), skyRefl(R), glassRefl * .8), avg);
    vec3 farE = lcol * avg * litP * 1.4 * uNight;
    col = mix(far, near, aa);
    emi = mix(farE, nearE, aa);
    if (neonI >= 0. && uv.y > top - 1.2 && uv.y < top - .35) {
      vec3 nc = NEON[int(neonI)];
      col = nc * lc * .6;
      emi += nc * (.6 + uNight * 7.);
    }
    if (st == 1. && neonI >= 0. && uv.y > 3.9 && uv.y < 4.25) {
      emi += NEON[int(mod(neonI + 2., 6.))] * uNight * 6.;
    }
  }
  gl_FragColor = vec4(fog(col + emi, vW), 1.);
}`;

export const PROP_VS = /* glsl */ `
${STD}
attribute vec2 cdata; varying float vE; varying float vPaint;
void main() {
  vec4 lp = vec4(position, 1.);
  vec3 ln = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * ln); vCol = color; vE = cdata.y; vPaint = cdata.x;
  #ifdef USE_INSTANCING_COLOR
    if (cdata.x > .5) vCol *= instanceColor;
  #endif
  vCol = pow(vCol, vec3(2.2));
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const PROP_FS = /* glsl */ `
${COMMON}
${STD}
varying float vE; varying float vPaint; uniform float uBrake; uniform float uLights; uniform float uGloss;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float sh = shadowAt(vW, n);
  vec3 col = vCol * light(n, sh);
  vec3 V = normalize(vW - uCam);
  if (uGloss > 0.) {
    vec3 R = reflect(V, n);
    float fres = .04 + .96 * pow(1. - max(dot(-V, n), 0.), 5.);
    float g = vPaint > .5 ? uGloss : uGloss * .6;
    col = mix(col, skyRefl(R) * 1.1, fres * g);
    col += uLightCol * pow(max(dot(R, uLightDir), 0.), 120.) * 3. * g * sh;
  }
  if (vE > .5) {
    if (vE < 1.5) col = mix(col, vec3(4., 3.8, 3.2), clamp(.15 + uNight + uLights, 0., 1.));
    else if (vE < 2.5) col = vec3(.9, .03, .02) * (.4 + 4. * max(uNight * .5, uBrake));
    else col = vCol * (.6 + 9. * uNight);
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
  vec2 w1 = vec2(cos(p.x * .11 + t * 1.1), cos(p.y * .13 - t * .9)) * .05;
  vec2 w2 = vec2(vnoise(p * .35 + t * .3) - .5, vnoise(p * .31 - t * .27) - .5) * .22;
  vec2 w3 = vec2(vnoise(p * 1.7 + t * .9) - .5, vnoise(p * 1.9 - t * .8) - .5) * .08;
  vec3 n = normalize(vec3(w1.x + w2.x + w3.x, 1., w1.y + w2.y + w3.y));
  vec3 V = normalize(vW - uCam);
  vec3 R = reflect(V, n);
  R.y = abs(R.y);
  float fres = .02 + .98 * pow(1. - max(dot(-V, n), 0.), 5.);
  vec3 shallow = lin(vec3(.3, .72, .68)), deep = lin(vec3(.05, .22, .27));
  float sh = shadowAt(vW, vec3(0., 1., 0.));
  vec3 wc = mix(shallow, deep, smoothstep(.3, 8., depth)) * light(vec3(0., 1., 0.), sh) * .8;
  vec3 col = mix(wc, skyRefl(R), fres);
  col += uLightCol * pow(max(dot(R, uLightDir), 0.), 220.) * 14. * sh;
  float foam = smoothstep(.7, 0., depth) * (.55 + .45 * sin(depth * 9. - t * 2. + vnoise(p * .2) * 6.));
  col = mix(col, vec3(.95, .93, .88) * light(vec3(0., 1., 0.), sh), clamp(foam, 0., 1.) * .85);
  col += uNight * vec3(1., .5, .2) * pow(vnoise(p * .04 + vec2(t * .02, 0.)), 5.) * .4;
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`;

export const SKY_FS = /* glsl */ `
${COMMON}
uniform vec3 uMoonDir;
varying vec3 vDir;
float fbm3(vec2 p) { return vnoise(p) * .5 + vnoise(p * 2.1) * .28 + vnoise(p * 4.3) * .14 + vnoise(p * 8.7) * .08; }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uFogCol, uZenith, pow(clamp(h, 0., 1.), .5));
  if (h < 0.) col = uFogCol * mix(1., .8, clamp(-h * 4., 0., 1.));
  float s = max(dot(d, uSunDir), 0.);
  col += uSunGlow * (pow(s, 6.) * .7 + pow(s, 60.) * 1.2);
  col += vec3(1., .92, .8) * smoothstep(.9993, .9996, s) * 40. * (1. - uNight * .9);
  if (h > 0.) {
    vec2 cp = d.xz / (h + .1);
    float c1 = smoothstep(.48, .8, fbm3(cp * vec2(.7, 2.2) + vec2(uTime * .006, 0.)));
    float c2 = smoothstep(.55, .85, fbm3(cp * 1.6 + vec2(-uTime * .004, 3.)));
    float c = max(c1, c2 * .7);
    float lit = pow(s, 2.) * .9 + .25;
    vec3 cc = mix(uFogCol * 1.15, uSunGlow * 1.8, pow(s, 3.) * .8) * (.6 + lit * .6);
    cc += uSunGlow * smoothstep(.3, .0, abs(c - .5)) * pow(s, 4.) * 1.5;
    cc = mix(cc, uZenith * 1.6 + vec3(.01, .012, .015), uNight * .85);
    col = mix(col, cc, c * .75 * smoothstep(0., .1, h));
  }
  if (uNight > 0.) {
    vec2 sp = vec2(atan(d.z, d.x) * 160., h * 320.);
    float st = step(.9975, hash12(floor(sp))) * smoothstep(.04, .3, h);
    col += st * uNight * (1.5 + 1.5 * sin(uTime * 3. + hash12(floor(sp)) * 40.));
    float m = max(dot(d, uMoonDir), 0.);
    col += vec3(.92, .95, 1.) * smoothstep(.99955, .9997, m) * uNight * 6. + vec3(.08, .12, .18) * pow(m, 40.) * uNight;
  }
  gl_FragColor = vec4(col, 1.);
}`;

export const GLOW_VS = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iP; attribute float iG;
uniform float uNight; uniform float uTime; uniform vec3 uCam; uniform float uFogDen; uniform float uWet;
varying vec3 vCol; varying vec2 vC; varying float vA; varying float vMode;
void main() {
  float size = iP.x;
  float dist = length(iPos - uCam);
  vec3 wp;
  float a = iP.w * max(uNight, iCol.a);
  vMode = 0.;
  if (iP.y < -.5) {
    // Wet-road streak: the light's reflection stretched toward the viewer.
    vMode = 2.;
    vec3 base = vec3(iPos.x, iG + .06, iPos.z);
    vec2 dc = uCam.xz - base.xz;
    float dl = length(dc);
    dc = dl > .01 ? dc / dl : vec2(0., 1.);
    float L = min((iPos.y - iG) * 1.6 + 4., dl * .8);
    vec3 along = vec3(dc.x, 0., dc.y), side = vec3(-dc.y, 0., dc.x);
    wp = base + along * (position.y + 1.) * .5 * L + side * position.x * size * .35;
    a = iP.w * uNight * uWet;
  } else if (iP.y > .5) {
    vMode = 1.;
    float r = iP.y - 1.;
    vec2 c = vec2(cos(r), sin(r)), q = position.xy * vec2(size, size * (iP.y > 1.01 ? 1.9 : 1.));
    wp = iPos + vec3(q.x * c.x - q.y * c.y, 0., q.x * c.y + q.y * c.x);
  } else {
    size = max(size, dist * .004);
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp = iPos + (right * position.x + up * position.y) * size;
  }
  if (iP.z >= 0.) a *= .1 + .9 * step(.72, fract(uTime * .55 + iP.z));
  a *= exp(-pow(dist * uFogDen * .5, 2.));
  vA = a; vCol = iCol.rgb; vC = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
}`;

export const GLOW_FS = /* glsl */ `
uniform float uTime;
varying vec3 vCol; varying vec2 vC; varying float vA; varying float vMode;
void main() {
  float g;
  if (vMode > 1.5) {
    float across = exp(-vC.x * vC.x * 5.);
    float along = pow(clamp(1. - (vC.y + 1.) * .5, 0., 1.), 1.3);
    float rip = .75 + .25 * sin(vC.y * 30. + uTime * 3.);
    g = across * along * rip * .9;
  } else {
    float d = length(vC);
    if (d > 1.) discard;
    g = vMode > .5 ? pow(1. - d, 2.) * .6 : exp(-d * d * 6.) * .9 + smoothstep(.2, 0., d) * 3.;
  }
  gl_FragColor = vec4(pow(vCol, vec3(2.2)) * max(g * vA, 0.), 1.);
}`;

export const SIGN_VS = /* glsl */ `
varying vec3 vW; varying vec2 vUv; varying vec3 vCol; varying vec3 vN;
void main() { vec4 wp = modelMatrix * vec4(position, 1.); vW = wp.xyz; vUv = uv; vCol = pow(color, vec3(2.2)); vN = normal; gl_Position = projectionMatrix * viewMatrix * wp; }`;

export const SIGN_FS = /* glsl */ `
${COMMON}
uniform sampler2D uMap;
varying vec3 vW; varying vec2 vUv; varying vec3 vCol; varying vec3 vN;
void main() {
  float a = texture2D(uMap, vUv).r;
  vec3 n = normalize(vN);
  vec3 panel = lin(vec3(.09, .17, .18)) * light(n, shadowAt(vW, n));
  vec3 col = mix(panel, vCol * (1.2 + uNight * 9.), a);
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

export const DEPTH_VS = /* glsl */ `
void main() {
  vec4 lp = vec4(position, 1.);
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
  #endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * lp;
}`;

export const DEPTH_FS = /* glsl */ `void main() { gl_FragColor = vec4(1.); }`;
