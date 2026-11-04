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
// Street lamps and headlights near the camera (main.js picks them each frame). xyz + range; a spot's
// direction + cos(cone) in uPD, or w < -1.5 for a lamp lighting all round.
uniform vec4 uPL[10]; uniform vec4 uPD[10]; uniform vec3 uPC[10];
vec3 lamps(vec3 wp, vec3 n) {
  vec3 s = vec3(0.);
  for (int i = 0; i < 10; i++) {
    float r = uPL[i].w;
    if (r <= 0.) continue;
    vec3 d = uPL[i].xyz - wp;
    float dl = length(d);
    if (dl >= r) continue;
    vec3 l = d / max(dl, .001);
    float k = 1. - dl / r;
    bool spot = uPD[i].w > -1.5;
    // A street lamp's head shines down, so nothing above it is lit (walls glowed up to the roofline).
    float cone = spot ? smoothstep(uPD[i].w, uPD[i].w + .1, dot(-l, uPD[i].xyz)) : smoothstep(-.1, .35, l.y);
    // A headlight's beam is focused, so it carries much further than a bare lamp.
    s += uPC[i] * (k * k / (1. + dl * dl * (spot ? .004 : .03))) * cone * (max(dot(n, l), 0.) * .8 + .2);
  }
  return s;
}
// How worn a place is, 0 (just built) to 1 (decades of neglect), by district (mirrors districtAt in
// map.js): the Pipeline's docks oldest, then the Cadence deco quarter, the gardens suburbs and Scratch
// Key; the Console downtown and Preview Point newest. A slow drift across each softens the borders.
float ageAt(vec2 p) {
  float x = p.x, z = p.y, a;
  if (x > 1800.) a = z < -1190. ? .6 : z < 710. ? .35 : .1;
  else if (z < -2304.) a = .4;
  else if (z > 2304. && x > -3328.) a = .9;
  else if (x < -1536. && z < -1024.) a = .5;
  else if (x >= -3328. && x <= -1792. && z >= -1024. && z <= 896.) a = .4;
  else if (x > -1000. && x < 1100. && z > -1024. && z < 900.) a = .15;
  else if (z < -1024.) a = .45;
  else if (x < -1300.) a = .6;
  else if (z > 900.) a = .7;
  else a = .45;
  return clamp(a + (vnoise(p * .004) - .5) * .3, 0., 1.);
}
// Hairline cracks: in a few cells of size s (a share d of them), a wandering line with a branch off it.
// Fades out before it's thinner than a pixel.
float cracks(vec2 p, float s, float d, float seed) {
  // The pixel's footprint first, before any branch, so the derivatives are always defined.
  float fw = max(fwidth(p.x), fwidth(p.y)) / s, fa = clamp(1. - 60. * fw, 0., 1.);
  vec2 c = floor(p / s), q = fract(p / s) - .5;
  float h = hash12(c + seed * 7.7);
  if (h >= d || fa <= 0.) return 0.;
  float k = h / d, ang = k * 6.2832 + seed;
  vec2 dir = vec2(cos(ang), sin(ang)), off = (vec2(hash12(c + 3.1), hash12(c + 5.3)) - .5) * .3;
  vec2 r = q - off;
  float al = dot(r, dir), ac = dot(r, vec2(-dir.y, dir.x));
  ac += (vnoise(vec2(al * 7., k * 40.)) - .5) * .12 + (vnoise(vec2(al * 29., k * 17.)) - .5) * .035;
  float len = .2 + .2 * fract(k * 7.3);
  float w = fw * 1.2 + .003;
  float line = (1. - smoothstep(0., w, abs(ac))) * (1. - smoothstep(len * .7, len, abs(al)));
  // The branch: from partway along, off at an angle, shorter.
  vec2 b0 = off + dir * len * (fract(k * 13.) - .5), bd = vec2(cos(ang + .9), sin(ang + .9));
  vec2 rb = q - b0;
  float bl = dot(rb, bd), bc = dot(rb, vec2(-bd.y, bd.x)) + (vnoise(vec2(bl * 11., k * 23.)) - .5) * .08;
  line = max(line, (1. - smoothstep(0., w, abs(bc))) * step(0., bl) * (1. - smoothstep(len * .35, len * .5, bl)));
  return line * fa;
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
  // Older districts: more cracks, sunken and broken flags, weeds and stains (see ageAt).
  float age = ageAt(vW.xz), close = 1. - smoothstep(70., 140., length(vW - uCam));
  if (vPat < .5) {
    c *= .7 + .45 * n1 + .15 * n2 + .1 * n3;
    // Worn ground: bare earth where people cut across, sparse clover and the odd darker tuft.
    float worn = smoothstep(.68, .8, vnoise(vW.xz * .045 + 4.) * .6 + vnoise(vW.xz * .4) * .4);
    c = mix(c, lin(vec3(.45, .38, .27)) * (.8 + .3 * n3), worn * (.35 + .4 * age));
    c *= 1. - .12 * step(.93, hash12(floor(vW.xz * 2.3))) * close;
  } else if (vPat < 1.5) {
    // Pavement: concrete flags with joints, each a slightly different tone, stains, gum, the odd crack.
    vec2 g = fract(vW.xz / 2.2), cell = floor(vW.xz / 2.2);
    float fa = clamp(1. - 10. * fwidth(vW.x), 0., 1.);
    float line = max(1. - smoothstep(.02, .05, g.x), 1. - smoothstep(.02, .05, g.y));
    float hs = hash12(cell);
    c *= (1. - .18 * line) * (.86 + .14 * n2) * (.92 + .12 * n1) * (.94 + .1 * n3) * (.93 + .1 * hs);
    c *= 1. - .14 * smoothstep(.6, .82, vnoise(vW.xz * .35 + 11.));
    vec2 gc = vW.xz * 7.;
    c *= 1. - .45 * step(.985, hash12(floor(gc))) * (1. - smoothstep(.12, .2, length(fract(gc) - .5))) * fa;
    c *= 1. + .12 * (hash12(floor(vW.xz * 25.)) - .5) * fa;
    if (hs > .84) {
      vec2 q = g - .5;
      float d = abs(q.x * .8 + q.y * .6 - (hs - .92) * 2.) * 2.2;
      c *= 1. - .35 * (1. - smoothstep(0., .015 + fwidth(d), d)) * fa;
    }
    // Age: a sunken flag, shaded down one side as it tips; a broken one patched with tarmac;
    // weeds pushing up through the joints; cracks across the flags; dark oil and drink stains.
    float hk = hash12(cell + 17.3);
    if (hk < age * .06) c *= .82 + .2 * (g.x * .6 + g.y * .4);
    else if (hk > 1. - age * .025) c = mix(c, lin(vec3(.2, .21, .22)) * (.85 + .3 * n3), fa);
    float weed = line * smoothstep(.72 - .25 * age, .82 - .25 * age, vnoise(vW.xz * 1.6 + 9.)) * age;
    c = mix(c, lin(vec3(.26, .34, .14)) * (.7 + .6 * n3), weed * fa * .9);
    c *= 1. - .45 * cracks(vW.xz, 2.2, .03 + .35 * age * age, 3.) * close;
    c *= 1. - .2 * smoothstep(.78 - .1 * age, .84 - .1 * age, vnoise(vW.xz * .7 + 31.)) * (.4 + age);
    spec = .25;
  } else if (vPat > 5.5 && vPat < 6.5) {
    // Kerbstones: speckled granite in 1.2 m lengths.
    float fa = clamp(1. - 10. * fwidth(vW.x), 0., 1.);
    vec2 g = fract(vW.xz / 1.2);
    float joint = max(1. - smoothstep(.0, .02, g.x), 1. - smoothstep(.0, .02, g.y));
    c *= (.9 + .12 * n2) * (1. + .3 * (hash12(floor(vW.xz * 30.)) - .5) * fa) * (1. - .25 * joint);
    // Chipped kerbs where cars have clipped them, more of them in older streets.
    c *= 1. - .35 * step(1. - (.02 + .08 * age), hash12(floor(vW.xz / 1.2) + 5.)) * step(.55, vnoise(vW.xz * 4.)) * fa;
    spec = .35;
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
    // Cracked slabs and a few replaced in a not-quite-matching stone.
    c *= 1. - .45 * cracks(vW.xz, 6., .05 + .4 * age * age, 8.) * close;
    float rt = hash12(floor(vW.xz / 6.) + 41.);
    c *= rt < age * .08 ? .86 : 1.;
    c *= 1. - .15 * smoothstep(.75, .85, vnoise(vW.xz * .5 + 13.)) * age;
    spec = .4;
  }
  // Pale paving reads as glare under a strong sun; real stone and concrete reflect far less.
  if (vPat > .5 && vPat < 3.5 || vPat > 4.5) c *= .62;
  float sh = shadowAt(vW, n);
  vec3 col = c * (light(n, sh) + lamps(vW, n)) + emi;
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
    mw = max(mw, lineAt(au, hw - .75, .08, aa));
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
  // Asphalt detail: aggregate, cracks, patched trenches, an oil strip down each lane.
  float fa = clamp(1. - 20. * fwidth(vW.x), 0., 1.);
  float spk = hash12(floor(vW.xz * 40.));
  c *= 1. + fa * (spk > .93 ? .2 : spk < .06 ? -.15 : 0.);
  float cn = vnoise(vW.xz * .55 + 3.1) * .65 + vnoise(vW.xz * 2.3) * .35;
  float crack = (1. - smoothstep(0., fwidth(cn) * 1.3 + .003, abs(cn - .5))) * smoothstep(.55, .75, vnoise(vW.xz * .07 + 7.)) * clamp(1. - 3. * fwidth(vW.x), 0., 1.);
  float gloss = 0.;
  float age = ageAt(vW.xz), close = 1. - smoothstep(80., 160., length(vW - uCam)), hole = 0.;
  if (ty < 8.5) {
    // Old asphalt: crazed into small slabs where it's tired (fatigue cracking), and more cracks.
    float tired = smoothstep(mix(.97, .74, age), mix(1., .8, age), vnoise(vW.xz * .11 + 17.));
    vec2 aj = vW.xz * 3.2 + vec2(vnoise(vW.xz * 7.), vnoise(vW.xz * 7. + 5.)) * .35;
    vec2 aq = fract(aj);
    float afw = max(fwidth(aj.x), fwidth(aj.y));
    float craze = (1. - smoothstep(0., afw * 1.2 + .03, min(min(aq.x, 1. - aq.x), min(aq.y, 1. - aq.y)))) * tired * clamp(1. - 3. * afw, 0., 1.) * .7;
    crack = max(crack, max(craze, cracks(vW.xz, 3.5, .04 + .3 * age * age, 4.) * close));
    // Potholes in the lanes of older roads: a dark broken hollow with a ragged rim, holding water.
    vec2 hc = floor(vW.xz / 9.), hq = fract(vW.xz / 9.) - .5;
    float hh = hash12(hc + 91.);
    if (hh < age * age * .06 && au < hw - 1.) {
      vec2 hp = (hq - (vec2(hash12(hc + 1.7), hash12(hc + 2.9)) - .5) * .5) * 9.;
      float r = length(hp * vec2(1., .8)) + (vnoise(hp * 3. + hh * 50.) - .5) * .25;
      float R0 = .3 + .45 * fract(hh * 37.);
      hole = 1. - smoothstep(R0 - .05, R0, r);
      float rim = (1. - smoothstep(R0, R0 + .18, r)) * (1. - hole);
      c = mix(c * (1. + .15 * rim), lin(vec3(.12, .12, .12)) * (.7 + .5 * vnoise(hp * 9.)), hole);
    }
    vec2 pc = vec2(floor((u + hw) / 3.), floor(v / 11.));
    float ph = hash12(pc + hw * 1.7 + ty);
    if (ph > .86 - .12 * age) {
      vec2 pf = vec2(fract((u + hw) / 3.), fract(v / 11.));
      vec2 lo = vec2(.1 + .3 * hash12(pc + 1.), .1 + .4 * hash12(pc + 2.)), hi = lo + vec2(.5, .3);
      float inP = step(lo.x, pf.x) * step(pf.x, hi.x) * step(lo.y, pf.y) * step(pf.y, hi.y);
      vec2 dm = min(pf - lo, hi - pf) * vec2(3., 11.);
      float seam = inP * (1. - smoothstep(0., .05 + aa, min(dm.x, dm.y)));
      c = mix(c, c * (ph > .93 ? .7 : 1.16), inP);
      c *= 1. - .45 * seam;
      crack *= 1. - inP;
    }
    float oil = (1. - smoothstep(.2, .6, abs(fract(au / 3.6 - .25) - .5) * 3.6)) * smoothstep(.3, .7, vnoise(vec2(u * 2., v * .2)));
    c *= 1. - .16 * oil; gloss = oil;
    // Concrete gutter along the kerb, jointed every 3 m.
    float gut = smoothstep(hw - .48, hw - .44, au);
    vec3 conc = lin(vec3(.5, .49, .47)) * (.85 + .2 * g) * (1. - .3 * (1. - smoothstep(0., .03 + fwidth(v), abs(fract(v / 3.) - .5) * 3. - 1.47)));
    c = mix(c, conc, gut);
    mw *= 1. - gut;
    // Storm drains in the gutter.
    float dv = mod(v + hw * 3., 31.) - 15.5;
    if (gut > .5 && abs(dv) < .5) {
      float slot = step(.5, fract(dv * 9.));
      c = mix(c, lin(vec3(.1, .1, .1)) * (.6 + .5 * slot), step(au, hw - .08));
    }
    // A manhole cover or two per block.
    float seg = floor(v / 37.), mh = hash12(vec2(seg, hw * 3.1 + ty + vR.z * .01));
    vec2 mc = vec2((mh - .5) * max(hw * 2. - 4., 0.), (seg + .5) * 37.);
    float md = length(vec2(u, v) - mc);
    if (mh > .25 && md < .7) {
      float ring = smoothstep(.55, .58, md);
      float hatch = step(.5, fract((u - mc.x + v - mc.y) * 5.)) * step(.5, fract((u - mc.x - v + mc.y) * 5.));
      vec3 iron = lin(vec3(.19, .18, .17)) * (.8 + .3 * hatch);
      c = mix(iron, lin(vec3(.32, .31, .3)), ring);
      crack = 0.; mw = 0.; mg = 0.; gloss = .8;
    }
    // Turn arrows painted in the lanes before the stop lines.
    if (ty < 1.5) {
      float lc = ty < .5 ? 1.7 : (au < 3.7 ? 1.95 : 5.6);
      float dS = vR.z >= 0. && u > 0. ? v - vR.z : vR.w >= 0. && u < 0. ? vR.w - v : -1.;
      if (dS > 6. && dS < 12. && au < hw - 2.) {
        float x = abs(au - lc);
        float head = step(dS, 7.6) * step(x, .5 * (dS - 6.) / 1.6);
        float shaft = step(7.6, dS) * step(dS, 11.6) * step(x, .13);
        mw = max(mw, max(head, shaft));
      }
    }
  }
  c *= 1. - .5 * crack;
  // Markings wear thin and patchy with age, and are gone where the surface has broken up.
  float wear = (.65 + .35 * vnoise(vW.xz * .45)) * (1. - crack) * mix(1., .35 + .65 * smoothstep(.3, .7, vnoise(vW.xz * 1.1 + 2.)), age) * (1. - hole);
  c = mix(c, white, mw * wear);
  c = mix(c, gold, mg * wear);
  vec3 n = vec3(0., 1., 0.);
  float sh = shadowAt(vW, n);
  vec3 col = c * (light(n, sh) + lamps(vW, n));
  // Wet asphalt: puddles reflect the sky and the sun or moon.
  vec3 V = normalize(vW - uCam);
  float puddle = max(smoothstep(.45, .7, vnoise(vW.xz * .09) * .7 + vnoise(vW.xz * .5) * .3) * (1. - mw), hole);
  float wet = clamp(uWet * (.55 + .45 * puddle) + tyre * uWet * .3, 0., 1.);
  float fres = .03 + .97 * pow(1. - abs(V.y), 5.);
  vec3 R = reflect(V, n);
  col = mix(col, col * .55, wet * .6);
  col += skyRefl(R) * fres * (.08 + wet * .9 + gloss * .25);
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

// What glass sees: open sky above a skyline of other towers, each with its own grid of windows
// (lit at night), and the street below the horizon.
vec3 cityRefl(vec3 r) {
  vec3 sky = mix(uFogCol, uZenith, clamp(r.y * 2.2, 0., 1.)) + uSunGlow * pow(max(dot(r, uSunDir), 0.), 10.) * .6;
  if (r.y < -.02) return mix(uGndAmb * .45, uFogCol * .3, .4) + uNight * vec3(.05, .035, .02);
  float az = atan(r.x, r.z) * 7.64;   // 48 tower slots round the horizon
  float slot = floor(az), hh = hash12(vec2(slot, 7.));
  float sl = .03 + .38 * hh * hh;
  if (r.y > sl) return sky;
  vec3 tc = mix(uFogCol * .5, mix(uGndAmb, uSkyAmb, .5) * .55, hash12(vec2(slot, 3.)));
  float gx = fract(az) * 7., gy = r.y * 70.;
  float fade = clamp(1. - 1.5 * max(fwidth(gx), fwidth(gy)), 0., 1.);
  float w = step(.3, fract(gx)) * step(.35, fract(gy)) * fade;
  float lit = step(.62, hash12(vec2(floor(gx) + slot * 9., floor(gy))));
  vec3 c = mix(tc, tc * .55, w * .7) + w * lit * uNight * vec3(1., .74, .42) * .8;
  return mix(c, sky, .3);   // haze
}

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
  glow *= mix(.6, 1., hit.y / max(fh, .01));
  return c;
}

// A spray-painted tag at street level, in a few bays of older walls: a run of cursive scrawl in one
// bright colour, outlined dark, with a flourish under it. m is metres along the face and up from
// the ground. Returns how much paint covers this point; the colour comes out in tc.
const vec3 TAGC[5] = vec3[5](vec3(.85, .2, .5), vec3(.15, .55, .9), vec3(.95, .75, .1), vec3(.1, .1, .1), vec3(.3, .8, .35));
float tag(vec2 m, float seed, float age, out vec3 tc) {
  float bx = floor(m.x / 5.), h = hash12(vec2(bx, seed * 3.3));
  tc = vec3(0.);
  if (h > age * age * .3 || m.y > 2.6 || m.y < .2) return 0.;
  float L = 1.2 + 1.4 * fract(h * 3.);
  vec2 c = vec2((bx + .5) * 5. + (fract(h * 11.) - .5) * (4.4 - L), 1.1 + .5 * fract(h * 7.));
  vec2 q = m - c;
  if (abs(q.x) > L * .5 + .1 || abs(q.y) > .45) return 0.;
  // The scrawl: a baseline that wobbles like handwriting, with letter-sized loops riding on it.
  float k = 9. + 5. * fract(h * 5.), x = q.x * k;
  float y = .16 * sin(x + h * 20.) + .07 * sin(x * 2.3 + h * 7.) + .03 * sin(x * 5.1);
  float d = abs(q.y - y);
  float ink = 1. - smoothstep(.022, .032, d);
  float edge = (1. - smoothstep(.034, .048, d)) * (1. - ink);
  // A flourish underneath, a little shorter.
  float u = abs(q.y + .3 - .05 * sin(q.x * 3. + h * 9.)) ;
  float under = (1. - smoothstep(.012, .02, u)) * step(abs(q.x), L * .42);
  float fade = 1. - smoothstep(L * .42, L * .5, abs(q.x));
  tc = mix(lin(vec3(.06)), lin(TAGC[int(fract(h * 19.) * 4.99)]), ink + under * (1. - ink));
  return max(max(ink, edge), under) * fade * (.75 + .25 * vnoise(m * 9.));
}

void main() {
  vec3 n = normalize(vN);
  float st = vB.x, top = vB.z;
  float neonI = floor(vB.y) - 1., seed = fract(vB.y);
  // How old this building is: its district's age, give or take, and glass towers wear least.
  // Older paint has faded towards grey. Wear is drawn only near enough to see it.
  float age = clamp(ageAt(vW.xz) + (fract(seed * 7.13) - .5) * .4, 0., 1.) * (st == 0. || st == 7. ? .35 : 1.);
  vec3 base = mix(vCol, vec3(dot(vCol, vec3(.3, .55, .15))), age * .22) * (1. - age * .06);
  float close = 1. - smoothstep(90., 170., length(vW - uCam));
  float nz = vnoise(vW.xz * .23 + vW.y * .17);
  float sh = shadowAt(vW, n);
  vec3 lc = light(n, sh) + lamps(vW, n);
  vec3 V = normalize(vW - uCam);
  vec3 col; vec3 emi = vec3(0.);
  if (n.y > .5) {
    col = base * (.85 + .25 * nz) * lc;
    float fa = clamp(1. - 8. * fwidth(vW.y + vW.x), 0., 1.);
    if (n.y < .97) {
      // Pitched roofs: overlapping tile courses, each tile a slightly different fired colour.
      vec3 rt = normalize(vec3(-n.z, 0., n.x));
      float along = dot(vW, rt) / .32, row = vW.y / .2;
      float rf = fract(row), tile = hash12(vec2(floor(along + .5 * mod(floor(row), 2.)), floor(row)) + seed * 3.);
      col *= mix(1., (.8 + .3 * tile) * mix(.72, 1.05, smoothstep(0., .35, rf)), fa);
      col *= 1. - .12 * smoothstep(.55, .85, vnoise(vW.xz * .4 + seed * 9.));
      // Old roofs: the odd slipped or missing tile showing the dark felt, and moss in the courses.
      float tk = hash12(vec2(floor(along + .5 * mod(floor(row), 2.)), floor(row)) + seed * 17.);
      col *= 1. - .6 * step(tk, age * age * .05) * fa * close;
      float moss = smoothstep(.55, .8, vnoise(vW.xz * .5 + seed * 21.)) * age * age * (1. - smoothstep(.15, .5, rf));
      col *= mix(vec3(1.), vec3(.6, .74, .42), moss * .8);
    } else {
      // Flat roofs: membrane strips with seams, and some ponding stains.
      float seam = 1. - smoothstep(0., .03 + fwidth(vW.x), abs(fract(vW.x / 1.2) - .5) * 1.2 - .57);
      col *= mix(1., (1. - .2 * seam) * (.9 + .15 * hash12(vec2(floor(vW.x / 1.2), seed))), fa);
      col *= 1. - (.18 + .14 * age) * smoothstep(.6 - .12 * age, .85, vnoise(vW.xz * .15 + seed * 5.));
      // Patched repairs on older roofs: squares of newer, darker membrane with a lapped edge.
      vec2 rc = floor(vW.xz / 5.), rp = fract(vW.xz / 5.);
      float rh = hash12(rc + seed * 13.);
      if (rh < age * .25) {
        vec2 lo = vec2(.1, .15) + .3 * vec2(hash12(rc + 1.), hash12(rc + 2.)), hi = lo + vec2(.35, .3);
        float inR = step(lo.x, rp.x) * step(rp.x, hi.x) * step(lo.y, rp.y) * step(rp.y, hi.y);
        float lap = inR * (1. - smoothstep(0., .02, min(min(rp.x - lo.x, hi.x - rp.x), min(rp.y - lo.y, hi.y - rp.y))));
        col *= mix(1., .72, inR * fa) * (1. + .25 * lap * fa);
      }
      col *= 1. - .4 * cracks(vW.xz, 3.5, .1 * age, seed * 5.) * close;
    }
    if (st > 9.5 && st < 10.5) emi = base * (1. + uNight * 2.);
  } else if (n.y < -.5) {
    col = base * .5 * amb(n);
  } else if (st > 8.5) {
    float stain = smoothstep(.4, .9, vnoise(vec2(vW.x + vW.z, vW.y * 3.) * .3)) * .2;
    col = base * (.85 + .2 * nz - stain) * lc;
    if (st > 9.5 && st < 10.5) emi = base * (1. + uNight * 2.);
  } else {
    vec2 uv = vUv;
    int si = int(st);
    float fh = st == 3. ? 3. : st == 0. ? 3.4 : st == 8. ? 3.5 : 3.6;
    float fy = uv.y / fh, fl = floor(fy), fyF = fract(fy);
    float cx = floor(uv.x), cxF = fract(uv.x);
    vec4 wr = vec4(0.);   // window rect: x0, x1, y0, y1 within the cell
    float avg = 0., litP = .5;
    vec3 wall = base * (.88 + .18 * nz);
    if (st == 0.) { wr = vec4(.03, .97, .3, .98); avg = .78; litP = .55; }
    else if (st == 1.) { wr = fl < .5 ? vec4(.05, .95, .08, .8) : vec4(.1, .9, .38, .8); avg = .32; litP = .45; }
    else if (st == 2.) { wr = vec4(.22, .78, .3, .82); avg = .28; }
    else if (st == 3.) { wr = step(.12, hash12(vec2(cx, fl) + seed * 31.)) * vec4(.28, .72, .33, .82); avg = .18; litP = .4; }
    else if (st == 4.) {
      wall *= .86 + .14 * sin(uv.x * 62.83);
      if (uv.y < 5.5 && mod(cx, 3.) == 1.) wall *= .5;
      if (uv.y > top - 3.4 && uv.y < top - 2.) wr = vec4(.1, .9, 0., 1.);
      avg = .08; litP = .7;
    } else if (st == 5.) {
      wall *= .78 + .22 * smoothstep(-.2, .9, sin(uv.x * 251.3));
      if (fract(uv.y / 2.6) > .93) wall *= .65;
    } else if (st == 6.) { wr = vec4(.04, .96, .42, .86); avg = .42; litP = .75; }
    else if (st == 7.) { wr = vec4(.03, .97, .3, .98); avg = .85; litP = .12; }
    else if (st == 8.) { wr = fl < .5 ? vec4(.05, .95, .05, .9) : vec4(.25, .75, .3, .8); avg = .45; litP = .7; }
    // Houses and villas: no window in a ground-floor bay that has the front door.
    if ((st == 3. || st == 8.) && fl < .5 && hash12(vec2(floor(uv.x), seed * 5.7)) < .3) wr = vec4(0.);
    // No half windows cut off by the roofline or parapet.
    if (st != 4. && st != 5. && (fl + wr.w) * fh > top - .1) wr = vec4(0.);
    if (st != 5. && st != 4.) wall *= mix(.6, 1., smoothstep(0., 5., uv.y));
    float cw = CW[si];
    vec2 m = vec2(uv.x * cw, uv.y);   // metres along the face and up from the ground
    // Wall finish: painted brick on houses and some offices, stone coursing on the rest.
    if ((st == 3. && seed < .6) || (st == 2. && seed < .45) || (st == 8. && seed > .7)) {
      float row = floor(m.y / .15), bx = m.x / .36 + .5 * mod(row, 2.);
      vec2 bf = vec2(fract(bx), fract(m.y / .15));
      float mortar = max(step(bf.x, .06), step(bf.y, .12));
      float f = clamp(1. - 2.5 * max(fwidth(bx), fwidth(m.y / .15)), 0., 1.);
      wall *= mix(1., mix(.88 + .18 * hash12(vec2(floor(bx), row) + seed), 1.1, mortar), f);
    } else if (st == 2. || st == 6. || (st == 1. && seed > .5)) {
      float row = floor(m.y / .6), bx = m.x / 1.2 + .5 * mod(row, 2.);
      vec2 bf = vec2(fract(bx), fract(m.y / .6));
      float joint = max(step(bf.x, .015), step(bf.y, .03));
      float f = clamp(1. - 2. * max(fwidth(bx), fwidth(m.y / .6)), 0., 1.);
      wall *= mix(1., mix(.95 + .07 * hash12(vec2(floor(bx), row) + seed), .8, joint), f);
    }
    // Rain streaks running down from the sills.
    if (st != 0. && st != 7. && st != 4. && st != 5.) {
      float colX = step(wr.x + .05, cxF) * step(cxF, wr.y - .05);
      float below = fyF < wr.z ? (wr.z - fyF) * fh : 0.;
      float streak = colX * step(.001, below) * smoothstep(1.6, 0., below) * smoothstep(.3, .8, vnoise(vec2((cx + cxF) * 9., uv.y * .35) + seed * 17.));
      wall *= 1. - .25 * streak;
    }
    // Weathering: broad blotches across the face and grime washed down from the parapet.
    if (st != 0. && st != 7.) {
      wall *= .9 + .18 * vnoise(m * vec2(.07, .045) + seed * 50.);
      wall *= 1. - .16 * smoothstep(top - 5., top - .3, uv.y) * smoothstep(.35, .75, vnoise(vec2(m.x * .9, uv.y * .04) + seed * 3.));
    }
    // Wear that comes with age, sparse and patchy (none on the curtain walls, which get cleaned):
    // hairline cracks, render fallen away from the block or brick behind, rust and damp running
    // down from fixings, damp and moss rising at the foot of the wall, and the odd tag.
    vec3 tagC = vec3(0.);
    float tagA = 0.;
    if (close > 0. && st != 0. && st != 7.) {
      wall *= .95 + .1 * vnoise(m * 7. + seed * 3.) * close;
      wall *= 1. - .5 * cracks(m, 2.4, .04 + .3 * age * age, seed * 31.) * close;
      // Mostly low down, where knocks and rising damp get it, and rarely up high.
      float sp = (vnoise(m * .32 + seed * 77.) * .65 + vnoise(m * 1.7 + seed * 13.) * .25 + vnoise(m * 6. + seed) * .1) * mix(1., .9, smoothstep(2., 8., m.y));
      float th = mix(.97, .8, age);
      float spall = smoothstep(th, th + .012, sp) * close, rim = smoothstep(th - .025, th, sp) * (1. - spall) * close;
      vec2 bq2 = vec2(m.x / .36 + .5 * mod(floor(m.y / .15), 2.), m.y / .15), bk = floor(bq2), bf2 = fract(bq2);
      float mortar = max(step(bf2.x, .07), step(bf2.y, .14));
      // Metal cladding rusts through instead; render comes away from brick, or from grey blockwork.
      bool metal = st == 4. || st == 5.;
      vec3 brick = mix(lin(vec3(.62, .42, .34)) * (.85 + .25 * hash12(bk + seed)), lin(vec3(.7, .67, .6)), mortar);
      vec3 block = lin(vec3(.55, .54, .5)) * (.9 + .15 * hash12(floor(vec2(m.x / .45, m.y / .225)) + seed)) * (1. - .2 * max(step(fract(m.x / .45), .04), step(fract(m.y / .225), .08)));
      vec3 under = metal ? lin(vec3(.5, .29, .16)) * (.75 + .4 * vnoise(m * 5. + seed)) : seed > .5 ? brick : block;
      wall = mix(wall, under, spall * (metal ? .85 : 1.));
      wall *= 1. + (metal ? -.12 : .18) * rim;
      float sx = floor(m.x / 3.7), sh2 = hash12(vec2(sx, seed * 9.1));
      if (sh2 < .06 + .4 * age) {
        float x0 = (sx + .2 + .6 * fract(sh2 * 17.)) * 3.7, y0 = top * (.25 + .7 * fract(sh2 * 29.));
        float wd = .06 + .22 * fract(sh2 * 41.), dy = y0 - m.y;
        float run = (1. - smoothstep(wd * .4, wd, abs(m.x - x0 + (vnoise(vec2(m.y * .7, sx)) - .5) * .25))) * step(0., dy) * smoothstep(3. + 7. * age, 0., dy);
        wall *= mix(vec3(1.), fract(sh2 * 53.) > .5 ? vec3(.8, .6, .44) : vec3(.7, .73, .7), run * (.35 + .4 * age));
      }
      float foot = (1. - smoothstep(.15, .7 + 1.3 * age, m.y)) * smoothstep(.4, .7, vnoise(m * vec2(.5, 1.6) + seed * 4.));
      wall *= mix(vec3(1.), vec3(.6, .68, .48), foot * age * .85);
      tagA = tag(m, seed, age, tagC) * close;
      wall = mix(wall, tagC, tagA);
    }
    // Windows sit back in the wall: the view ray through the opening meets the glass further
    // in, so you see the reveals at an angle, a lit sill below and the lintel's shadow on the glass.
    float recess = st == 0. || st == 7. ? 0. : st == 3. || st == 8. ? .16 : .24;
    vec3 t = vec3(-n.z, 0., n.x);
    float vn = max(-dot(V, n), .2);
    vec2 pm = vec2(cxF * cw, fyF * fh);
    vec2 gp = pm + vec2(dot(V, t), V.y) / vn * recess;
    vec4 wm = vec4(wr.x * cw, wr.y * cw, wr.z * fh, wr.w * fh);
    float win = step(wr.x, cxF) * step(cxF, wr.y) * step(wr.z, fyF) * step(fyF, wr.w);
    float onGlass = win * step(wm.x, gp.x) * step(gp.x, wm.y) * step(wm.z, gp.y) * step(gp.y, wm.w);
    float reveal = win * (1. - onGlass);
    float fw = st == 0. || st == 7. ? .035 : .055;
    float frame = onGlass * (1. - step(wm.x + fw, gp.x) * step(gp.x, wm.y - fw) * step(wm.z + fw, gp.y) * step(gp.y, wm.w - fw));
    if (wm.y - wm.x > 1.5 && st != 0. && st != 7.) frame = max(frame, onGlass * step(abs(gp.x - (wm.x + wm.y) * .5), .035));
    if (st == 1. || st == 8.) frame = max(frame, onGlass * step(abs(gp.y - mix(wm.z, wm.w, .72)), .03));
    float sill = recess > 0. && wr.y > wr.x ? step(wm.z - .08, pm.y) * step(pm.y, wm.z) * step(wm.x - .07, pm.x) * step(pm.x, wm.y + .07) : 0.;
    float underSill = recess > 0. && wr.y > wr.x ? step(wm.z - .2, pm.y) * step(pm.y, wm.z - .08) * step(wm.x - .07, pm.x) * step(pm.x, wm.y + .07) : 0.;
    float aa = clamp(1. - 1.5 * max(fwidth(uv.x), fwidth(fy)), 0., 1.);
    float h = hash12(vec2(cx, fl) + seed * 91.7);
    // In older buildings the odd window is boarded up (nobody home), or has a cracked pane.
    float hw2 = hash12(vec2(cx * 1.7, fl * 2.3) + seed * 61.);
    float boarded = (st == 1. || st == 2. || st == 3. || st == 4. || st == 8.) && wr.y > wr.x && hw2 < age * age * .07 ? 1. : 0.;
    float broken = st != 0. && st != 7. && wr.y > wr.x && boarded < .5 && hw2 > 1. - age * .05 ? 1. : 0.;
    float lit = step(1. - litP, h) * (1. - boarded);
    vec3 lcol = mix(vec3(1., .72, .4), vec3(.7, .85, 1.), step(.62, hash12(vec2(fl, cx) + seed * 13.1)));
    if (hash12(vec2(cx * 3., fl) + seed) > .97) lcol = vec3(1., .4, .15);
    // Interior seen through the glass.
    vec2 cell = clamp((gp - wm.xz) / max(wm.yw - wm.xz, vec2(.01)), 0., 1.);
    float rg = 0.;
    vec3 rc = vec3(0.);
    if (wr.y > wr.x) rc = room(cell, cw * (wr.y - wr.x), fh * (wr.w - wr.z), V, n, t, h, rg);
    float blinds = step(.7, hash12(vec2(cx, fl * 1.7) + seed)) * step(1. - fract(h * 13.) * .8, cell.y);
    float slats = blinds * (.6 + .4 * step(.5, fract(cell.y * 18.)));
    vec3 inside = mix(rc, vec3(.85, .82, .76), slats);
    float hc = hash12(vec2(cx * 1.3, fl) + seed * 4.1);
    if ((st == 1. || st == 3. || st == 8.) && hc > .45) {
      vec3 cc = lin(hc > .86 ? vec3(.72, .3, .24) : hc > .72 ? vec3(.86, .8, .64) : hc > .6 ? vec3(.36, .46, .56) : vec3(.92, .9, .85));
      float open = .12 + .3 * fract(hc * 17.);
      float cur = max(step(cell.x, open), step(1. - open * .9, cell.x));
      inside = mix(inside, cc * (.8 + .2 * sin(cell.x * 70.)), cur);
    }
    // Now and then someone switches a lamp: each window on its own slow clock, never all at once.
    vec3 insideLit = inside * lcol * rg * 2.6 * lit * (.85 + .15 * step(.5, hash12(vec2(cx, fl) + floor(uTime * .02 + h * 7.))));
    float lintel = recess > 0. ? mix(.55, 1., smoothstep(0., .45, wm.w - gp.y)) : 1.;
    vec3 insideDay = inside * amb(n) * .22 * lintel;
    float fres = .06 + .94 * pow(1. - abs(dot(V, n)), 4.);
    // Each pane sits a hair off true, so reflections break up pane by pane.
    vec3 pn = normalize(n + t * (hash12(vec2(cx, fl) + seed * 5.) - .5) * .05 + vec3(0., 1., 0.) * (hash12(vec2(fl, cx) + seed * 9.) - .5) * .035);
    vec3 R = reflect(V, pn);
    vec3 refl = cityRefl(R) * (st == 0. || st == 7. ? 1. : .8);
    if (st == 0. || st == 7.) refl = mix(refl, refl * base * 1.6, .35);
    if (st == 6.) refl = mix(refl, refl * vec3(.4, .9, .95), .4);
    float sunSpec = pow(max(dot(R, uLightDir), 0.), 200.) * sh;
    float glassRefl = st == 0. || st == 7. ? mix(.35, 1., fres) : max(fres, .12);
    vec3 glass = mix(insideDay, refl * lintel, glassRefl) + uLightCol * sunSpec * 4. * lintel;
    vec3 frameC = st == 0. || st == 7. ? vec3(.42, .44, .45) * lc : st == 3. || st == 8. ? vec3(.85, .83, .78) * lc : wall * lc * .45;
    float topR = step(wm.w, gp.y), botR = step(gp.y, wm.z);
    vec3 revealC = wall * lc * mix(.7, .4, topR) * mix(1., 1.3, botR);
    // Curtain walls: an opaque spandrel panel over each floor slab, with a dark joint at the slab.
    vec3 wallC = wall * lc;
    if (st == 0. || st == 7.) {
      wallC = base * .1 * lc + refl * (.3 + .45 * fres) + uLightCol * sunSpec * 2.;
      wallC *= 1. - .6 * step(fyF, .025);
    }
    if (broken > .5) {
      // Rays out from the impact and a ring round it; a dark hole where the glass has gone.
      vec2 bq = (cell - vec2(.3 + .4 * fract(h * 5.), .3 + .4 * fract(h * 9.))) * vec2(cw * (wr.y - wr.x), fh * (wr.w - wr.z));
      float br = length(bq), ba = atan(bq.y, bq.x) / 6.2832 * 11. + h * 7.;
      float rays = (1. - smoothstep(0., .03, abs(fract(ba) - .5) * br * 1.2)) * (1. - smoothstep(.25, .8, br));
      float ring = 1. - smoothstep(0., .02, abs(br - .16 - .05 * fract(h * 3.)));
      float hole = step(br, .05 + .05 * fract(h * 13.));
      glass = mix(glass, vec3(.75, .78, .8) * lc * .6 + refl * .4, max(rays, ring * .7) * .7);
      glass = mix(glass, vec3(.01), hole);
    }
    if (boarded > .5) {
      // Plywood over the opening, in sheets with screw rows, weathered grey at the edges.
      vec2 bp = gp - wm.xz;
      float sheet = step(.5, fract(bp.x / 1.22)), grain = vnoise(vec2(bp.x * 2., bp.y * 30.) + h * 9.);
      vec3 ply = lin(mix(vec3(.62, .5, .35), vec3(.55, .53, .5), .5 * age + .3 * sheet)) * (.82 + .2 * grain);
      ply *= 1. - .35 * step(abs(fract(bp.x / 1.22) - .5), .008) * step(fract(bp.y / .6), .06);
      glass = ply * lc;
      frame = 0.;
    }
    vec3 near = mix(wallC, glass, onGlass);
    near = mix(near, frameC, frame);
    near = mix(near, revealC, reveal);
    near = mix(near, min(wall * 1.25 + .04, vec3(1.)) * lc, sill);
    near *= 1. - .3 * underSill;
    // A window air-con unit here and there, with a drip stain under it.
    if ((st == 1. || st == 3. || st == 2.) && wr.y > wr.x && hash12(vec2(cx, fl) + seed * 2.7) > .93) {
      vec2 ap = pm - vec2(mix(wm.x, wm.y, .5), wm.z);
      float inU = step(0., ap.x) * step(ap.x, .62) * step(0., ap.y) * step(ap.y, .42);
      float grille = step(.5, fract(ap.y * 22.)) * step(.05, ap.x) * step(ap.x, .32);
      near = mix(near, vec3(.62, .62, .6) * lc * (1. - .35 * grille), inU);
      near *= 1. - .35 * step(0., ap.x) * step(ap.x, .62) * step(-.7, ap.y) * step(ap.y, 0.) * smoothstep(-.7, 0., ap.y);
      onGlass *= 1. - inU;
    }
    vec3 nearE = insideLit * onGlass * (1. - frame) * (1. - glassRefl * .5) * uNight * (1. - boarded);
    vec3 far = mix(wallC, mix(vec3(.02), refl, glassRefl * .8), avg);
    vec3 farE = lcol * avg * litP * 1.4 * uNight;

    // Street level: shopfronts and lobbies on the towers and offices, front doors on the houses.
    if (uv.y < 3.3 && (st < 2.5 || st == 6. || st == 7.)) {
      float bw = 3.6, bay = floor(m.x / bw), bf = fract(m.x / bw);
      float shop = floor(bay / 2.), hs = hash12(vec2(shop, seed * 7.3)), hb = hash12(vec2(bay, seed * 3.1));
      bool tower = st == 0. || st == 7.;
      vec3 granite = tower ? vec3(.07, .075, .08) : vec3(.2, .19, .18) * (.9 + .2 * nz);
      float door = step(hb, .3);
      float gy0 = door > .5 ? 0. : .45, gy1 = 2.55;
      float pier = 1. - step(.05, bf) * step(bf, .95);
      vec2 sp = vec2(bf * bw, uv.y);
      float inGlass = (1. - pier) * step(gy0, uv.y) * step(uv.y, gy1);
      vec2 sg = sp + vec2(dot(V, t), V.y) / vn * .12;
      float sframe = inGlass * (1. - step(.24, sg.x) * step(sg.x, bw - .24) * step(gy0 + .07, sg.y) * step(sg.y, gy1 - .07));
      sframe = max(sframe, inGlass * step(abs(sg.x - bw * .5), .04 + door * .02));
      if (door < .5) sframe = max(sframe, inGlass * step(abs(sg.y - 2.1), .03));
      vec3 shopL = mix(vec3(1., .82, .58), vec3(.92, .95, 1.), step(.55, hs));
      float srg;
      vec3 src = room(clamp((sg - vec2(.24, gy0)) / vec2(bw - .48, gy1 - gy0), 0., 1.), bw - .48, gy1 - gy0, V, n, t, hs * .8, srg);
      vec3 shopGlass = mix(src * shopL * (.5 + .4 * srg) * amb(n) * .9, refl, fres * .8) + uLightCol * sunSpec * 3.;
      float fascia = (1. - pier) * step(gy1 + .07, uv.y);
      vec3 fcol = tower ? vec3(.1, .11, .12) : lin(hs < .25 ? vec3(.17, .25, .26) : hs < .5 ? vec3(.62, .18, .16) : hs < .75 ? vec3(.12, .2, .36) : vec3(.83, .55, .2));
      float fx = fract(m.x / (bw * 2.)) * 16.;
      float letter = (tower ? 0. : 1.) * fascia * step(2.78, uv.y) * step(uv.y, 3.1) * step(.15, fract(fx)) * step(.45, hash12(vec2(floor(fx), shop + seed))) * step(2., fx) * step(fx, 14.);
      vec3 sn = granite * lc;
      sn = mix(sn, shopGlass, inGlass);
      sn = mix(sn, (tower ? vec3(.05) : vec3(.12, .11, .1)) * lc, sframe);
      sn = mix(sn, fcol * lc, fascia);
      sn = mix(sn, vec3(.95, .92, .85) * lc, letter);
      sn = mix(sn, granite * lc * .8, step(uv.y, .45) * (1. - inGlass));
      sn = mix(sn, tagC * lc, tagA * (1. - inGlass) * (1. - fascia));
      // Shutters pulled down over the odd shop that's closed down, rusted in the oldest streets.
      if (hs < age * age * .12 && !tower) {
        float slat = .7 + .3 * step(.5, fract(uv.y * 9.));
        vec3 shut = lin(mix(vec3(.6, .62, .62), vec3(.55, .42, .32), age)) * slat * (.85 + .2 * vnoise(m * vec2(.8, 3.) + hs * 9.));
        sn = mix(sn, shut * lc, inGlass);
        inGlass = 0.;
      }
      float shopOn = step(.15, hs);
      vec3 snE = (src * shopL * srg * 1.1 * inGlass * (1. - sframe) * shopOn + letter * shopL * 2.) * uNight + src * shopL * srg * .35 * inGlass * (1. - sframe) * shopOn * (1. - uNight);
      near = sn; nearE = snE;
      far = mix(granite * lc, shopL * .25 * amb(n), .55);
      farE = shopL * .4 * uNight;
    } else if ((st == 3. || st == 8.) && uv.y < 2.6) {
      float bay = floor(uv.x), hb = hash12(vec2(bay, seed * 5.7));
      if (hb < .3) {
        vec2 dp = vec2(cxF * cw, uv.y);
        float dx0 = cw * .5 - .55, dx1 = cw * .5 + .55;
        float inDoor = step(dx0, dp.x) * step(dp.x, dx1) * step(dp.y, 2.2);
        float edge = inDoor * (1. - step(dx0 + .09, dp.x) * step(dp.x, dx1 - .09) * step(dp.y, 2.11));
        float pane = inDoor * step(abs(dp.x - cw * .5), .22) * step(1.25, dp.y) * step(dp.y, 1.9);
        vec3 wood = lin(hb < .1 ? vec3(.17, .25, .26) : hb < .2 ? vec3(.5, .17, .14) : vec3(.33, .22, .14));
        vec3 dc = mix(wood * (.85 + .15 * step(.5, fract(dp.y * 1.6))), vec3(.92, .9, .85), edge) * lc;
        dc = mix(dc, vec3(.05), pane);
        near = mix(near, dc, inDoor);
        nearE = mix(nearE, vec3(1., .75, .45) * pane * 1.5 * uNight, inDoor);
        // Porch light.
        float lamp = step(length(vec2(dp.x - dx1 - .25, dp.y - 1.95)), .09);
        near = mix(near, vec3(.9, .85, .7) * lc, lamp);
        nearE += vec3(1., .78, .5) * lamp * 6. * uNight;
      }
    }
    col = mix(far, near, aa);
    emi = mix(farE, nearE, aa);
    if (neonI >= 0. && uv.y > top - 1.2 && uv.y < top - .35) {
      vec3 nc = NEON[int(neonI)];
      col = nc * lc * .6;
      emi += nc * (.5 + uNight * 1.5);
    }
    if (st == 1. && neonI >= 0. && uv.y > 3.9 && uv.y < 4.25) {
      emi += NEON[int(mod(neonI + 2., 6.))] * uNight * 1.6;
    }
  }
  gl_FragColor = vec4(fog(col + emi, vW), 1.);
}`;

export const PROP_VS = /* glsl */ `
${STD}
attribute vec2 cdata; attribute vec2 luv; varying float vE; varying float vPaint; varying vec2 vLuv;
void main() {
  vLuv = luv;
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
varying float vE; varying float vPaint; varying vec2 vLuv; uniform float uBrake; uniform float uLights; uniform float uGloss;
uniform sampler2D uLivery; uniform float uUseLivery; uniform vec3 uPaint;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float sh = shadowAt(vW, n);
  vec3 alb = vCol;
  if (uUseLivery > 1.5 && vPaint > .5) alb = lin(uPaint);
  else if (uUseLivery > .5 && vPaint > .5) alb = lin(texture2D(uLivery, vLuv).rgb);
  vec3 col = alb * (light(n, sh) + lamps(vW, n));
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
    else if (vE < 3.5) col = vCol * (.6 + 9. * uNight);
    else col = vCol * (1.1 + 1.1 * uNight);
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
  // Open water mirrors the sky (skyRefl's street-level band is for glass in town, and turns the sea to mud).
  vec3 sky = mix(uFogCol, uZenith, clamp(R.y * 2.2, 0., 1.)) + uSunGlow * pow(max(dot(R, uSunDir), 0.), 10.) * .6;
  vec3 col = mix(wc, sky, fres);
  col += uLightCol * pow(max(dot(R, uLightDir), 0.), 220.) * 14. * sh;
  float foam = smoothstep(.7, 0., depth) * (.55 + .45 * sin(depth * 9. - t * 2. + vnoise(p * .2) * 6.));
  col = mix(col, vec3(.95, .93, .88) * light(vec3(0., 1., 0.), sh), clamp(foam, 0., 1.) * .85);
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
    // A reflection only streaks at a low angle; seen from above it would be a ladder of ripples.
    a = iP.w * uNight * uWet * (1. - smoothstep(.25, .6, (uCam.y - base.y) / max(length(uCam - base), .01)));
  } else if (iP.y > .5) {
    vMode = 1.;
    float r = iP.y - 1.;
    vec2 c = vec2(cos(r), sin(r)), q = position.xy * vec2(size, size * (iP.y > 1.01 ? 1.9 : 1.));
    wp = iPos + vec3(q.x * c.x - q.y * c.y, 0., q.x * c.y + q.y * c.x);
  } else {
    size = max(size, dist * .004);
    // Up close a halo would wash over the wall behind it; the eye sees the bulb, not a fog of light.
    a *= mix(.35, 1., smoothstep(4., 20., dist));
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp = iPos + (right * position.x + up * position.y) * size;
  }
  // Aircraft warning lights: a soft half-second flash every two and a half seconds.
  if (iP.z >= 0.) { float ph = fract(uTime * .4 + iP.z); a *= .05 + .95 * smoothstep(0., .06, ph) * (1. - smoothstep(.12, .24, ph)); }
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
    float rip = .9 + .1 * sin(vC.y * 14. + uTime * 3.);
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
#include <common>
#include <skinning_pars_vertex>
void main() {
  #include <skinbase_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vec4 lp = vec4(transformed, 1.);
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp;
  #endif
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * lp;
}`;

// Skinned people (Rocketbox avatars) in the city's lighting.
export const PERSON_VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main() {
  #include <skinbase_vertex>
  vec3 objectNormal = normal;
  #include <skinnormal_vertex>
  vec3 transformed = position;
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * objectNormal); vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const PERSON_FS = /* glsl */ `
${COMMON}
uniform sampler2D uMap; uniform float uAlphaCut; uniform float uSkin; uniform float uSoft;
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < uAlphaCut) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  // Hair cards: lean the normal upward so light hair doesn't show the cards' facets.
  n = normalize(mix(n, vec3(0., 1., 0.), uSoft));
  float sh = shadowAt(vW, n);
  vec3 alb = lin(t.rgb);
  vec3 col = alb * (light(n, sh) + lamps(vW, n));
  // A little wrap and rim light so faces don't go flat in shade.
  vec3 V = normalize(uCam - vW);
  col += alb * uSkyAmb * pow(1. - max(dot(n, V), 0.), 3.) * .35;
  col += alb * uLightCol * max(dot(n, uLightDir) * .5 + .5, 0.) * .08 * uSkin * sh;
  gl_FragColor = vec4(fog(col, vW), 1.);
}`;

// Rooms you walk into: vertex colours lit by up to eight point lights. cdata.y: 4 glows, 5 is a window
// onto the sky with a skyline, 6 is a screen.
export const ROOM_VS = /* glsl */ `
attribute vec2 cdata;
varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vE;
void main() {
  vec4 lp = vec4(position, 1.);
  vec3 ln = normal;
  #ifdef USE_INSTANCING
    lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
  #endif
  vec4 wp = modelMatrix * lp;
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * ln); vCol = pow(color, vec3(2.2)); vE = cdata.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const ROOM_FS = /* glsl */ `
uniform vec4 uPL[8]; uniform vec3 uPC[8]; uniform vec3 uRoomAmb; uniform vec3 uCam; uniform float uTime;
uniform vec3 uZenith; uniform vec3 uFogCol; uniform float uNight;
varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vE;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(uCam - vW);
  vec3 lit = uRoomAmb * 2.4 * (.6 + .4 * (n.y * .5 + .5));
  vec3 spec = vec3(0.);
  for (int i = 0; i < 8; i++) {
    vec3 L = uPL[i].xyz - vW;
    float d = length(L);
    float att = pow(max(1. - d / max(uPL[i].w, .01), 0.), 2.);
    vec3 l = L / max(d, 1e-3);
    lit += uPC[i] * max(dot(n, l), 0.) * att;
    spec += uPC[i] * pow(max(dot(reflect(-l, n), V), 0.), 40.) * att * .25;
  }
  vec3 col = vCol * lit + spec * (n.y > .9 ? .8 : .3);
  if (vE > 3.5 && vE < 4.5) col = vCol * 2.4;
  else if (vE > 4.5 && vE < 5.5) {
    // A window: sky down to a skyline of towers, lit at night.
    float a = vW.x + vW.z, y = vW.y;
    float b = floor(a * .9);
    float top = 1.2 + h1(b) * 1.6 + step(.8, h1(b + 7.)) * 1.2;
    vec3 sky = mix(uFogCol, uZenith, clamp((y - 1.) / 3., 0., 1.)) * 1.1;
    vec3 tower = mix(vec3(.05, .08, .09), uFogCol * .45, .5);
    float win = step(.55, h1(floor(a * 7.) + floor(y * 6.) * 13.)) * step(.4, fract(a * 7.)) * step(.35, fract(y * 6.));
    tower += win * vec3(1., .7, .4) * uNight * 1.5;
    col = y < top ? tower : sky;
  } else if (vE > 5.5) {
    float f = .7 + .3 * sin(uTime * 3. + vW.x * 4.) * sin(uTime * 1.7);
    col = vCol * 1.8 * f;
  }
  gl_FragColor = vec4(col, 1.);
}`;

export const DEPTH_FS = /* glsl */ `void main() { gl_FragColor = vec4(1.); }`;
