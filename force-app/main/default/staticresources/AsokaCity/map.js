// Asoka City world generator. Everything is derived from a seed and plain maths, so the whole
// 8 x 8 km map costs almost nothing to download. No three.js here: the tests run it under node.
//
// Coordinates are metres. x runs west to east, z runs north to south (north is -z), y is up.
// The map spans -4096..4096 on both axes and is streamed in 256 m chunks.

import { clamp, lerp, smoothstep, hash2, fbm, rng } from "./util.js";

export const SIZE = 8192, HALF = 4096, CHUNK = 256, NCH = 32, GRID = 128, NG = 64;
export const HRES = 8, HN = SIZE / HRES + 1;
export const DECK = 4.5;           // bridge and causeway deck height above the sea
const RAMP = 0.06;                 // bridge approach grade
const AVE_HW = 9, ST_HW = 6, HILL_HW = 5.5;

export const DISTRICTS = {
  console:  { name: "The Console",       map: "#d9cdbd" },
  uptown:   { name: "Commit Row",        map: "#e3d8c8" },
  cadence:  { name: "Cadence Quarter",   map: "#ecdcc8" },
  gardens:  { name: "Sprint Gardens",    map: "#d8dcc6" },
  park:     { name: "Instinct Park",     map: "#b9cdae" },
  meridian: { name: "Meridian Heights",  map: "#d6dfdc" },
  hills:    { name: "Guideline Hills",   map: "#c4cfb0" },
  docks:    { name: "The Pipeline",      map: "#cfc8bd" },
  scratch:  { name: "Scratch Key",       map: "#efe2c9" },
  sandbox:  { name: "Sandbox Isles",     map: "#f1e4c8" },
  preview:  { name: "Preview Point",     map: "#eee0c6" },
};

// ---------------------------------------------------------------------------- land and water

const coastX = (z) => 1350 + 90 * Math.sin(z / 480) + 60 * Math.sin(z / 170 + 1.3);
const southZ = (x) => 3260 + 70 * Math.sin(x / 400 + 0.5);
const islW = (z) => 2060 + 40 * Math.sin(z / 300);
const islE = (z) => 2760 + 60 * Math.sin(z / 520 + 2);
export const riverX = (z) => -1250 + 140 * Math.sin(z / 650 + 0.7);
const INLETS = [[-1250, -1130], [650, 770]];
const BASINS = [-2240, -1600, -960, -320, 320].map((c) => [c - 64, c + 64]);
const LAKE = { x: -2560, z: -64, rx: 250, rz: 330 };
const PARK = { x0: -3328, x1: -1792, z0: -1024, z1: 896 };
export const PLAZA = { x0: 0, x1: 256, z0: -384, z1: -128, cx: 128, cz: -256 };
export const TOWER = { x: 128, z: -256, base: 200, height: 174, depth: 24, ringY: 60, ringR: 44, coreR: 30 };

// Signed distance to the shoreline, roughly in metres: positive on land, negative in water.
export function shoreDist(x, z) {
  const main = Math.min(coastX(z) - x, southZ(x) - z);
  let isl = Math.min(x - islW(z), islE(z) - x, z + 3350, 2900 - z);
  for (const [a, b] of INLETS) isl = Math.min(isl, Math.abs(z - (a + b) / 2) - (b - a) / 2);
  let d = Math.max(main, isl);
  if (z > -3700) d = Math.min(d, Math.abs(x - riverX(z)) - 42);
  for (const [a, b] of BASINS) {
    if (x > a - 300 && x < b + 300) d = Math.min(d, Math.max(a - x, x - b, 2700 - z));
  }
  const ex = (x - LAKE.x) / LAKE.rx, ez = (z - LAKE.z) / LAKE.rz;
  d = Math.min(d, (Math.sqrt(ex * ex + ez * ez) - 1) * Math.min(LAKE.rx, LAKE.rz));
  return d;
}

function shoreSlope(x, z) {
  if (z > 2300 && x < 1400) return 1.5;                 // dock quays are walls
  if (x > 2300) return 0.035;                            // wide ocean beaches on the isles
  if (Math.abs(x - riverX(z)) < 220) return 0.3;         // river banks
  if (x > 1800) return 0.12;                             // bay side of the isles
  return 0.1;
}

function baseHeight(x, z) {
  const und = 1.6 + 2.2 * fbm(x / 900 + 11, z / 900 - 7, 3);
  const hillM = smoothstep(-2250, -3150, z) * (x < 1500 ? 1 : smoothstep(1900, 1500, x));
  const westM = smoothstep(-3450, -4000, x);
  const m = Math.max(hillM, westM);
  return und + m * (30 + 150 * fbm(x / 650 - 3, z / 650 + 5, 4));
}

function rawHeight(x, z) {
  const d = shoreDist(x, z);
  if (d < 0) return Math.max(-9, -0.6 + d * 0.12);
  return Math.min(baseHeight(x, z), -0.6 + d * shoreSlope(x, z));
}

export function districtAt(x, z) {
  if (x > 1800) return z < -1190 ? "scratch" : z < 710 ? "sandbox" : "preview";
  if (z < -2304) return "hills";
  if (z > 2304 && x > -3328) return "docks";
  if (x < -1536 && z < -1024) return "meridian";
  if (x >= PARK.x0 && x <= PARK.x1 && z >= PARK.z0 && z <= PARK.z1) return "park";
  if (x > -1000 && x < 1100 && z > -1024 && z < 900) return "console";
  if (z < -1024) return "uptown";
  if (x < -1300) return "gardens";
  if (z > 900) return "cadence";
  return "uptown";
}

// --------------------------------------------------------------------------------- palettes

export const PAL = {
  cream: 0xfff7ee, cream2: 0xf3e6d3, cream3: 0xefe3d2, sand: 0xcdbba2, taupe: 0xa7957d, stone: 0x8a8073,
  spruce: 0x2f757c, spruceL: 0x5599a0, spruceD: 0x283f43, spruceX: 0x182b2e, orange: 0xff6018,
  gold: 0xd7a03d, clay: 0xb8544f, plum: 0xa4517b, moss: 0x5d8f5e, dusty: 0x507fa7,
};
const PASTEL = [0xfff7ee, 0xf6c6a6, 0xfbe7d8, 0xcbd3c4, 0xd3e0e1, 0xffe9dc, 0xf7ede0, 0xe0a08f, 0xf5d7b0, 0xc9dcd6];
const TOWERC = [0x283f43, 0x365155, 0x507fa7, 0x8fabaf, 0xd3e0e1, 0xa7957d, 0xefe3d2, 0x2f757c];
const HOUSEC = [0xfff7ee, 0xf3e6d3, 0xf6c6a6, 0xcbd3c4, 0xd3e0e1, 0xe0a08f, 0xefe3d2, 0xf5d7b0];
export const NEON = [0xff6a2e, 0xff6a2e, 0x3fd0c9, 0xffc667, 0xcc75a0, 0xfffdf9];
export const SIGNS = ["ASOKA", "GO-LIVE", "INSTINCTS", "THE CONSOLE", "SANDBOX ISLES", "MERIDIAN HEALTH", "PIPELINE FREIGHT", "COMMIT ROW", "CADENCE", "GUIDELINE HILLS", "SYSENG", "READY TO PROMOTE"];

// Building styles understood by the building shader.
export const ST = { GLASS: 0, DECO: 1, OFFICE: 2, HOUSE: 3, WARE: 4, BOX: 5, HOSP: 6, LOGO: 7, VILLA: 8, CONC: 9, NEON: 10, STEEL: 11 };
const CELLW = [1.7, 3.6, 3.0, 3.2, 6, 6, 3.4, 4, 4.5, 8, 8, 8];

// ---------------------------------------------------------------------------- hill roads

const HILL_NODES = {
  G1: [-2560, -2304], G2: [-1024, -2304], G3: [512, -2304], G4: [1024, -2304],
  J1: [-2300, -2900], J2: [-1000, -3000], J3: [300, -3200], J4: [-400, -3560], J5: [1000, -2900],
};
const HILL_EDGES = [
  ["G1", "J1", [[-2500, -2600]]],
  ["J1", "J2", [[-1800, -3050], [-1400, -2900]]],
  ["G2", "J2", [[-1100, -2600], [-900, -2800]]],
  ["J2", "J3", [[-600, -3150], [-100, -3100]]],
  ["J3", "J4", [[100, -3450]]],
  ["J2", "J4", [[-800, -3400]]],
  ["G3", "J3", [[450, -2600], [250, -2900]]],
  ["J3", "J5", [[700, -3250]]],
  ["J5", "G4", [[1150, -2650]]],
];

function catmull(points, step) {
  const out = [];
  const P = [points[0], ...points, points[points.length - 1]];
  for (let k = 1; k < P.length - 2; k++) {
    const [p0, p1, p2, p3] = [P[k - 1], P[k], P[k + 1], P[k + 2]];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1].slice());
  return out;
}

function ellipse(cx, cz, rx, rz, a0, a1, step) {
  const out = [];
  const n = Math.ceil((Math.abs(a1 - a0) * (rx + rz)) / 2 / step);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
  }
  return out;
}

// ---------------------------------------------------------------------------------- world

export class World {
  constructor(seed = 7) {
    this.seed = seed;
    this.H = new Float32Array(HN * HN);
    for (let j = 0; j < HN; j++) {
      for (let i = 0; i < HN; i++) this.H[i + j * HN] = rawHeight(-HALF + i * HRES, -HALF + j * HRES);
    }
    this.nodes = [];
    this.edges = [];
    this.nodeAt = new Map();
    this.hEdge = new Map();
    this.vEdge = new Map();
    this.chunkSegs = Array.from({ length: NCH * NCH }, () => []);
    this.deckHash = new Map();
    this.cache = new Map();
    this.buildPolylineRoads();
    this.buildGrid();
    this.finishGraph();
  }

  // Height of the terrain mesh, interpolated exactly the way its triangles are.
  height(x, z) {
    const fx = clamp((x + HALF) / HRES, 0, HN - 1.0001), fz = clamp((z + HALF) / HRES, 0, HN - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const H = this.H, k = i + j * HN;
    const h00 = H[k], h10 = H[k + 1], h01 = H[k + HN], h11 = H[k + HN + 1];
    return u > v ? h00 + (h10 - h00) * u + (h11 - h10) * v : h00 + (h11 - h01) * u + (h01 - h00) * v;
  }

  normal(x, z) {
    const e = 2;
    const dx = this.height(x + e, z) - this.height(x - e, z), dz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    return [-dx / l, (2 * e) / l, -dz / l];
  }

  // Drivable surface height: terrain, or a bridge deck when the point is on one and the
  // car is not far below it. Sets this.onDeck.
  ground(x, z, yRef = Infinity) {
    let g = this.height(x, z);
    this.onDeck = false;
    const list = this.deckHash.get(deckKey(x, z));
    if (list) {
      for (const d of list) {
        const dx = d.x1 - d.x0, dz = d.z1 - d.z0, L2 = dx * dx + dz * dz;
        const t = ((x - d.x0) * dx + (z - d.z0) * dz) / L2;
        if (t < -0.02 || t > 1.02) continue;
        const tc = clamp(t, 0, 1);
        const lat = Math.hypot(x - (d.x0 + dx * tc), z - (d.z0 + dz * tc));
        if (lat > d.hw + 0.4) continue;
        const y = lerp(d.y0, d.y1, tc);
        if (y > g && yRef >= y - 2.2) { g = y; this.onDeck = true; }
      }
    }
    return g;
  }

  // Bridge side walls near a point, for collision.
  deckWalls(x, z) {
    return this.deckHash.get(deckKey(x, z))?.walls || [];
  }

  isWater(x, z) { return this.height(x, z) < 0; }

  district(x, z) { return districtAt(x, z); }

  // ------------------------------------------------------------------------ road network

  addNode(x, z, key) {
    const n = { id: this.nodes.length, x, z, y: 0, edges: [], hx: 0, hz: 0, poly: 0, grid: key != null, water: false };
    this.nodes.push(n);
    if (key != null) this.nodeAt.set(key, n);
    return n;
  }

  gridNode(i, j) {
    const key = i * 100 + j;
    return this.nodeAt.get(key) || this.addNode(-HALF + i * GRID, -HALF + j * GRID, key);
  }

  addEdge(a, b, pts2, hw, opts) {
    const e = { id: this.edges.length, a, b, pts2, hw, lanes: opts.lanes || 1, type: opts.type, dir: opts.dir || null, poly: !!opts.poly, bridge: false, profile: opts.profile || null };
    this.edges.push(e);
    a.edges.push(e);
    b.edges.push(e);
    return e;
  }

  buildPolylineRoads() {
    // Hill roads and the park loop are smooth curves. Their height profile is smoothed and
    // grade-limited, then carved into the terrain so they climb at a drivable grade.
    const named = {};
    const nodeFor = (k) => {
      if (named[k]) return named[k];
      const [x, z] = HILL_NODES[k];
      const n = k[0] === "G" ? this.gridNode((x + HALF) / GRID, (z + HALF) / GRID) : this.addNode(x, z, null);
      n.y = this.smoothRaw(x, z);
      named[k] = n;
      return n;
    };
    const roads = [];
    for (const [ka, kb, ctrl] of HILL_EDGES) {
      const a = nodeFor(ka), b = nodeFor(kb);
      roads.push({ a, b, pts: catmull([[a.x, a.z], ...ctrl, [b.x, b.z]], 8), hw: HILL_HW, type: 2 });
    }
    // Instinct Park: a loop around the lake, joined to the avenues north and south.
    const top = this.addNode(LAKE.x, LAKE.z - 780, null), bot = this.addNode(LAKE.x, LAKE.z + 780, null);
    const north = this.gridNode((LAKE.x + HALF) / GRID, (PARK.z0 + HALF) / GRID);
    const south = this.gridNode((LAKE.x + HALF) / GRID, (PARK.z1 + HALF) / GRID);
    for (const n of [top, bot, north, south]) n.y = this.smoothRaw(n.x, n.z);
    roads.push({ a: top, b: bot, pts: ellipse(LAKE.x, LAKE.z, 600, 780, -Math.PI / 2, Math.PI / 2, 8), hw: HILL_HW, type: 2 });
    roads.push({ a: bot, b: top, pts: ellipse(LAKE.x, LAKE.z, 600, 780, Math.PI / 2, (3 * Math.PI) / 2, 8), hw: HILL_HW, type: 2 });
    roads.push({ a: north, b: top, pts: [[north.x, north.z], [top.x, top.z]], hw: HILL_HW, type: 2 });
    roads.push({ a: bot, b: south, pts: [[bot.x, bot.z], [south.x, south.z]], hw: HILL_HW, type: 2 });

    const target = new Float32Array(HN * HN), weight = new Float32Array(HN * HN);
    for (const r of roads) {
      r.pts = densify(r.pts, 8);
      const n = r.pts.length;
      const y = new Float32Array(n), wet = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const [x, z] = r.pts[i];
        wet[i] = shoreDist(x, z) < 4 ? 1 : 0;
        y[i] = wet[i] ? NaN : this.smoothRaw(x, z);
      }
      fillGaps(y);
      for (let i = 0; i < n; i++) if (wet[i]) y[i] = Math.max(y[i], DECK - 0.5);
      const sm = smoothArr(y, 9);
      sm[0] = r.a.y; sm[n - 1] = r.b.y;
      gradeLimit(sm, 8, 0.1);
      r.y = sm;
      r.bridge = wet.some((w) => w);
      // Carve: within 11 m the terrain takes the road height, blending out to 30 m.
      for (let i = 0; i < n; i++) {
        if (wet[i]) continue;
        const [x, z] = r.pts[i];
        const ci = Math.round((x + HALF) / HRES), cj = Math.round((z + HALF) / HRES);
        for (let dj = -4; dj <= 4; dj++) {
          for (let di = -4; di <= 4; di++) {
            const gi = ci + di, gj = cj + dj;
            if (gi < 0 || gj < 0 || gi >= HN || gj >= HN) continue;
            const d = Math.hypot(-HALF + gi * HRES - x, -HALF + gj * HRES - z);
            const w = d < r.hw + 5 ? 1 : smoothstep(30, r.hw + 5, d);
            const c = gi + gj * HN;
            if (w > weight[c]) { weight[c] = w; target[c] = sm[i]; }
          }
        }
      }
    }
    for (let c = 0; c < HN * HN; c++) {
      if (weight[c] > 0 && this.H[c] > 0) this.H[c] = lerp(this.H[c], target[c], weight[c]);
    }
    for (const r of roads) {
      const e = this.addEdge(r.a, r.b, r.pts, r.hw, { type: r.type, poly: true, profile: r.y });
      e.bridge = r.bridge;
    }
  }

  // Average raw terrain around a point, so polyline roads ignore small bumps.
  smoothRaw(x, z) {
    let s = 0;
    for (const [dx, dz] of [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]]) s += Math.max(0.5, rawHeight(x + dx, z + dz));
    return s / 5;
  }

  buildGrid() {
    const causeway = new Set([16, 30, 44]);
    const plazaCut = new Set(["v33,29", "v33,30", "h32,30", "h33,30"]);
    const try2 = (i0, j0, i1, j1, dir) => {
      const line = dir === "x" ? j0 : i0;
      const ave = line % 2 === 0;
      const x0 = -HALF + i0 * GRID, z0 = -HALF + j0 * GRID, x1 = -HALF + i1 * GRID, z1 = -HALF + j1 * GRID;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (plazaCut.has(`${dir === "x" ? "h" : "v"}${i0},${j0}`)) return;
      if (mx > PARK.x0 && mx < PARK.x1 && mz > PARK.z0 && mz < PARK.z1) return;
      if (Math.min(z0, z1) < -2304) return;
      const dist = districtAt(mx, mz);
      if ((dist === "docks" || dist === "meridian") && !ave) return;
      const isCause = dir === "x" && causeway.has(j0) && Math.min(x0, x1) >= 1000 && Math.max(x0, x1) <= 2400;
      if (!ave && !isCause && ["gardens", "uptown", "cadence", "sandbox", "scratch", "preview"].includes(dist)) {
        if (hash2(i0 * 3 + (dir === "x" ? 1 : 2), j0, this.seed) < 0.08) return;
      }
      let wetRun = 0, maxWet = 0, wet = false, prevH = null, maxH = -1e9;
      for (let k = 0; k <= 16; k++) {
        const x = lerp(x0, x1, k / 16), z = lerp(z0, z1, k / 16);
        const h = this.height(x, z);
        const w = shoreDist(x, z) < 1.5;
        if (w) { wet = true; wetRun += 8; maxWet = Math.max(maxWet, wetRun); } else wetRun = 0;
        if (!w) {
          maxH = Math.max(maxH, h);
          if (prevH != null && Math.abs(h - prevH) > 8 * 0.14) return;
          prevH = h;
        }
      }
      if (maxH > 45) return;
      const endWet = shoreDist(x0, z0) < 3 || shoreDist(x1, z1) < 3;
      if (wet && !isCause) {
        if (endWet || maxWet > 170) return;
        if (dist === "docks" && Math.abs(mx - riverX(mz)) > 140) return;
      }
      const a = this.gridNode(i0, j0), b = this.gridNode(i1, j1);
      const e = this.addEdge(a, b, [[x0, z0], [x1, z1]], ave ? AVE_HW : ST_HW, { type: ave ? 1 : 0, lanes: ave ? 2 : 1, dir });
      e.bridge = wet;
      (dir === "x" ? this.hEdge : this.vEdge).set(i0 * 100 + j0, e);
    };
    for (let j = 1; j < NG; j++) for (let i = 1; i < NG - 1; i++) try2(i, j, i + 1, j, "x");
    for (let i = 1; i < NG; i++) for (let j = 1; j < NG - 1; j++) try2(i, j, i, j + 1, "z");
  }

  finishGraph() {
    // Drop isolated nodes and find the largest connected network (traffic and spawns use it).
    const alive = this.nodes.filter((n) => n.edges.length);
    const comp = new Map();
    let best = null, bestSize = 0;
    for (const n of alive) {
      if (comp.has(n)) continue;
      const stack = [n], members = [];
      comp.set(n, members);
      while (stack.length) {
        const c = stack.pop();
        members.push(c);
        for (const e of c.edges) {
          const o = e.a === c ? e.b : e.a;
          if (!comp.has(o)) { comp.set(o, members); stack.push(o); }
        }
      }
      if (members.length > bestSize) { bestSize = members.length; best = members; }
    }
    const main = new Set(best);
    for (const e of this.edges) e.main = main.has(e.a);
    for (const n of alive) n.main = main.has(n);
    this.nodes = alive;
    this.nodes.forEach((n, i) => (n.id = i));

    for (const n of this.nodes) {
      n.water = shoreDist(n.x, n.z) < 3;
      if (n.grid && !n.edges.some((e) => e.poly)) n.y = n.water ? DECK : this.height(n.x, n.z);
      for (const e of n.edges) {
        if (e.poly) n.poly = Math.max(n.poly, e.hw + 1);
        else if (e.dir === "z") n.hx = Math.max(n.hx, e.hw);
        else n.hz = Math.max(n.hz, e.hw);
      }
      if (!n.hx) n.hx = n.hz;
      if (!n.hz) n.hz = n.hx;
      if (n.poly) { n.hx = n.hz = Math.max(n.hx, n.hz, n.poly); }
      if (n.grid && n.edges.some((e) => e.poly)) n.y = this.height(n.x, n.z);
    }

    for (const e of this.edges) this.buildEdgeGeometry(e);
    this.chunkNodes = Array.from({ length: NCH * NCH }, () => []);
    for (const n of this.nodes) { const c = chunkIndex(n.x, n.z); if (c >= 0) this.chunkNodes[c].push(n); }
  }

  trimFor(n, e) {
    if (e.poly || n.poly) return Math.max(n.hx, n.hz);
    return e.dir === "x" ? n.hx : n.hz;
  }

  buildEdgeGeometry(e) {
    // Dense centreline with heights, the trimmed ribbon used for drawing, lanes for traffic,
    // and deck segments + walls for physics where the road leaves the ground.
    const P = e.poly ? e.pts2 : densify(e.pts2, 8);
    const n = P.length;
    const s = new Float32Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const L = s[n - 1];
    e.len = L;
    e.trimA = this.trimFor(e.a, e);
    e.trimB = this.trimFor(e.b, e);
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = this.roadY(e, P[i][0], P[i][1], s[i], i);
    e.x = Float32Array.from(P, (p) => p[0]);
    e.z = Float32Array.from(P, (p) => p[1]);
    e.y = y;
    e.s = s;

    // Physics decks and walls from the full centreline (covers causeway intersections too).
    for (let i = 0; i < n - 1; i++) {
      const h0 = this.height(P[i][0], P[i][1]), h1 = this.height(P[i + 1][0], P[i + 1][1]);
      const up0 = y[i] - h0, up1 = y[i + 1] - h1;
      if (Math.max(up0, up1) < 0.35) continue;
      const d = { x0: P[i][0], z0: P[i][1], y0: y[i], x1: P[i + 1][0], z1: P[i + 1][1], y1: y[i + 1], hw: e.hw, e };
      const cells = new Set();
      for (const t of [0, 0.5, 1]) {
        const px = lerp(d.x0, d.x1, t), pz = lerp(d.z0, d.z1, t);
        for (const [ox, oz] of [[0, 0], [e.hw + 2, 0], [-e.hw - 2, 0], [0, e.hw + 2], [0, -e.hw - 2]]) cells.add(deckKey(px + ox, pz + oz));
      }
      const wall = Math.min(up0, up1) > 1.0;
      for (const k of cells) {
        let list = this.deckHash.get(k);
        if (!list) { list = []; list.walls = []; this.deckHash.set(k, list); }
        list.push(d);
        if (wall) {
          const dx = d.x1 - d.x0, dz = d.z1 - d.z0, l = Math.hypot(dx, dz), rx = -dz / l, rz = dx / l;
          for (const side of [-1, 1]) {
            const o = (e.hw + 0.2) * side;
            list.walls.push({ x0: d.x0 + rx * o, z0: d.z0 + rz * o, x1: d.x1 + rx * o, z1: d.z1 + rz * o, y: (d.y0 + d.y1) / 2 });
          }
        }
      }
    }

    // Ribbon between the trimmed ends.
    const sA = Math.min(e.trimA, L / 2 - 0.5), sB = Math.max(L - e.trimB, L / 2 + 0.5);
    const rib = [];
    rib.push(this.sampleEdge(e, sA));
    for (let i = 0; i < n; i++) if (s[i] > sA + 0.5 && s[i] < sB - 0.5) rib.push({ x: P[i][0], z: P[i][1], y: y[i], s: s[i] });
    rib.push(this.sampleEdge(e, sB));
    for (let i = 0; i < rib.length; i++) {
      const p = rib[Math.max(0, i - 1)], q = rib[Math.min(rib.length - 1, i + 1)];
      const dx = q.x - p.x, dz = q.z - p.z, l = Math.hypot(dx, dz) || 1;
      rib[i].tx = dx / l; rib[i].tz = dz / l;
    }
    e.rib = rib;
    e.sA = sA; e.sB = sB;
    e.cross = [this.crossAt(e.a), this.crossAt(e.b)];
    for (let i = 0; i < rib.length - 1; i++) {
      const mx = (rib[i].x + rib[i + 1].x) / 2, mz = (rib[i].z + rib[i + 1].z) / 2;
      const c = chunkIndex(mx, mz);
      if (c >= 0) this.chunkSegs[c].push({ e, i });
    }
    // Traffic lanes: offsets to the right of travel, metres.
    e.laneOff = e.lanes === 2 ? [2.0, 5.4] : [e.hw > 6 ? 2.4 : 2.3];
  }

  crossAt(n) {
    return n.grid && n.edges.length >= 3 && !n.water;
  }

  roadY(e, x, z, s, i) {
    if (e.profile) return e.profile[i] + 0.08;
    const h = this.height(x, z);
    if (!e.bridge) return h + 0.08;
    const ya = e.a.water ? DECK : this.height(e.a.x, e.a.z);
    const yb = e.b.water ? DECK : this.height(e.b.x, e.b.z);
    const L = Math.hypot(e.pts2[1][0] - e.pts2[0][0], e.pts2[1][1] - e.pts2[0][1]);
    const tA = e.a.water ? 0 : this.trimFor(e.a, e), tB = e.b.water ? 0 : this.trimFor(e.b, e);
    const ramp = Math.min(DECK, ya + Math.max(0, s - tA) * RAMP, yb + Math.max(0, L - tB - s) * RAMP);
    return Math.max(h, ramp) + 0.08;
  }

  sampleEdge(e, s) {
    // Point on an edge's centreline at distance s (before geometry is fully built we use pts2).
    const P = e.x ? null : e.poly ? e.pts2 : densify(e.pts2, 8);
    const xs = e.x || Float32Array.from(P, (p) => p[0]), zs = e.z || Float32Array.from(P, (p) => p[1]);
    const ss = e.s, ys = e.y;
    let i = 0;
    while (i < ss.length - 2 && ss[i + 1] < s) i++;
    const t = clamp((s - ss[i]) / (ss[i + 1] - ss[i] || 1), 0, 1);
    return { x: lerp(xs[i], xs[i + 1], t), z: lerp(zs[i], zs[i + 1], t), y: lerp(ys[i], ys[i + 1], t), s };
  }

  // Point, tangent and height at distance s along an edge, with a lateral offset to the right.
  edgePoint(e, s, off = 0, out = {}) {
    const ss = e.s;
    let lo = 0, hi = ss.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ss[m] <= s) lo = m; else hi = m; }
    const t = clamp((s - ss[lo]) / (ss[hi] - ss[lo] || 1), 0, 1);
    const dx = e.x[hi] - e.x[lo], dz = e.z[hi] - e.z[lo], l = Math.hypot(dx, dz) || 1;
    out.tx = dx / l; out.tz = dz / l;
    out.x = lerp(e.x[lo], e.x[hi], t) - out.tz * off;
    out.z = lerp(e.z[lo], e.z[hi], t) + out.tx * off;
    out.y = lerp(e.y[lo], e.y[hi], t);
    return out;
  }

  nearestRoad(x, z, mainOnly = true) {
    let best = null, bd = Infinity;
    const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
    for (let r = 0; r < 6 && !best; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const c = cx + dx, k = cz + dz;
        if (c < 0 || k < 0 || c >= NCH || k >= NCH) continue;
        for (const { e, i } of this.chunkSegs[c + k * NCH]) {
          if (mainOnly && !e.main) continue;
          const p = e.rib[i];
          const d = Math.hypot(p.x - x, p.z - z);
          if (d < bd) { bd = d; best = { e, s: p.s, d }; }
        }
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------- chunks

  chunk(cx, cz) {
    const key = cx + cz * NCH;
    let c = this.cache.get(key);
    if (!c) { c = this.genChunk(cx, cz); this.cache.set(key, c); }
    return c;
  }

  genChunk(cx, cz) {
    const x0 = -HALF + cx * CHUNK, z0 = -HALF + cz * CHUNK;
    const r = rng(hash2(cx, cz, this.seed) * 4294967296);
    const out = {
      cx, cz, x0, z0, buildings: [], slabs: [], props: [], glows: [], signs: [],
      boxes: [], circles: [], segs: this.chunkSegs[cx + cz * NCH], tower: null,
      nodes: this.chunkNodes[cx + cz * NCH],
    };
    const natural = [];
    for (let bj = 0; bj < 2; bj++) {
      for (let bi = 0; bi < 2; bi++) {
        const i = cx * 2 + bi, j = cz * 2 + bj;
        if (!this.genBlock(i, j, r, out)) natural.push([-HALF + i * GRID, -HALF + j * GRID]);
      }
    }
    this.genRoadside(out, r);
    this.genNature(out, natural, r);
    if (cx === Math.floor((TOWER.x + HALF) / CHUNK) && cz === Math.floor((TOWER.z + HALF) / CHUNK)) this.genTower(out);
    // Collision grid for the chunk: 8 x 8 buckets of 32 m.
    out.grid = Array.from({ length: 64 }, () => []);
    const put = (o, ax0, az0, ax1, az1) => {
      const i0 = clamp(Math.floor((ax0 - x0) / 32), 0, 7), i1 = clamp(Math.floor((ax1 - x0) / 32), 0, 7);
      const j0 = clamp(Math.floor((az0 - z0) / 32), 0, 7), j1 = clamp(Math.floor((az1 - z0) / 32), 0, 7);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.grid[i + j * 8].push(o);
    };
    for (const b of out.boxes) put(b, b.x0, b.z0, b.x1, b.z1);
    for (const c of out.circles) put(c, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
    return out;
  }

  sideRoad(i, j, side) {
    // Edge along a block side: 0 west, 1 east, 2 north, 3 south.
    if (side === 0) return this.vEdge.get(i * 100 + j);
    if (side === 1) return this.vEdge.get((i + 1) * 100 + j);
    if (side === 2) return this.hEdge.get(i * 100 + j);
    return this.hEdge.get(i * 100 + j + 1);
  }

  landOK(x0, z0, x1, z1, margin = 3) {
    let lo = Infinity, hi = -Infinity;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      if (shoreDist(x, z) < margin) return null;
      const h = this.height(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 5) return null;
    return { lo, hi, avg: (lo + hi) / 2 };
  }

  addBuilding(out, b) {
    // b: x0 z0 x1 z1 h style color seed roof neon tiers
    const land = this.landOK(b.x0, b.z0, b.x1, b.z1, 2);
    if (!land) return false;
    b.gy = land.hi + 0.1;
    b.y0 = land.lo - 1.2;
    out.buildings.push(b);
    out.boxes.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y1: b.gy + b.h });
    return true;
  }

  genBlock(i, j, r, out) {
    if (i <= 0 || j <= 0 || i >= NG - 1 || j >= NG - 1) return false;
    const x0 = -HALF + i * GRID, z0 = -HALF + j * GRID, x1 = x0 + GRID, z1 = z0 + GRID;
    const cxm = x0 + GRID / 2, czm = z0 + GRID / 2;
    const dist = districtAt(cxm, czm);
    if (dist === "hills" || dist === "park") return false;
    if (cxm > PLAZA.x0 && cxm < PLAZA.x1 && czm > PLAZA.z0 && czm < PLAZA.z1) {
      // Console Plaza around the Asoka tower (one slab over the four blocks).
      if (i === 32 && j === 29) out.slabs.push({ x0: PLAZA.x0 + 9, z0: PLAZA.z0 + 9, x1: PLAZA.x1 - 9, z1: PLAZA.z1 - 9, pat: 5, color: 0xefe3d2 });
      return true;
    }
    const sides = [0, 1, 2, 3].map((s) => this.sideRoad(i, j, s));
    if (!sides.some(Boolean)) return false;
    if (shoreDist(cxm, czm) < -20) return false;
    const hwOf = (s, line) => (sides[s] ? sides[s].hw : 2) + (sides[s] ? 0.3 : 0);
    const ix0 = x0 + hwOf(0), ix1 = x1 - hwOf(1), iz0 = z0 + hwOf(2), iz1 = z1 - hwOf(3);
    const walk = 4.5;
    const lx0 = ix0 + (sides[0] ? walk : 0), lx1 = ix1 - (sides[1] ? walk : 0);
    const lz0 = iz0 + (sides[2] ? walk : 0), lz1 = iz1 - (sides[3] ? walk : 0);
    const coastal = shoreDist(cxm, czm) < 90;
    const slab = (pat, color, a = ix0, b = iz0, c = ix1, d = iz1) => out.slabs.push({ x0: a, z0: b, x1: c, z1: d, pat, color });

    const gen = BLOCKS[dist] || BLOCKS.uptown;
    const ok = gen.call(this, { out, r, i, j, ix0, ix1, iz0, iz1, lx0, lx1, lz0, lz1, sides, slab, coastal, dist, cxm, czm });
    return ok !== false;
  }

  genRoadside(out, r) {
    // Street lamps every 32 m (both sides of avenues, one side of streets) and palms on the
    // boulevards of the isles and the Cadence Quarter.
    for (const { e, i } of out.segs) {
      const p = e.rib[i], q = e.rib[i + 1];
      const first = Math.ceil((p.s - 16) / 32) * 32 + 16;
      for (let s = first; s < q.s; s += 32) {
        if (s < p.s) continue;
        const t = (s - p.s) / (q.s - p.s || 1);
        const x = lerp(p.x, q.x, t), z = lerp(p.z, q.z, t), y = lerp(p.y, q.y, t);
        const tx = p.tx, tz = p.tz;
        const elevated = y - this.height(x, z) > 0.6;
        const k = Math.round(s / 32);
        const dist = districtAt(x, z);
        const palmy = ["sandbox", "scratch", "preview", "cadence"].includes(dist) || (dist === "console" && e.type === 1);
        for (const side of e.type === 1 ? [-1, 1] : [k % 2 ? 1 : -1]) {
          const off = e.hw + (elevated ? 0.1 : 1.1);
          const px = x - tz * off * side, pz = z + tx * off * side;
          if (!elevated && shoreDist(px, pz) < 1) continue;
          const py = elevated ? y : this.height(px, pz) + 0.15;
          const id = out.props.length;
          out.props.push({ kind: "lamp", x: px, z: pz, y: py, ax: tz * side, az: -tx * side, id });
          out.glows.push({ kind: "lamp", x: px + tz * side * 1.6, z: pz - tx * side * 1.6, y: py + 7.6, id });
          if (!elevated) out.circles.push({ x: px, z: pz, r: 0.22, kind: "lamp", id, y1: py + 8 });
          if (palmy && !elevated && e.type !== 2) {
            const qx = x - tz * (off + 0.2) * side + tx * 16, qz = z + tx * (off + 0.2) * side + tz * 16;
            if (shoreDist(qx, qz) > 1 && !this.nearRoad(qx, qz, out, 1.5)) this.addPalm(out, r, qx, qz);
          }
        }
        if (elevated && e.bridge) out.glows.push({ kind: "amber", x, z, y: y + 0.3, id: -1 });
      }
    }
  }

  addPalm(out, r, x, z, h) {
    h = h || r.range(8, 13);
    const y = this.height(x, z);
    out.props.push({ kind: "palm", x, z, y, h, lean: r.range(-0.18, 0.18), rot: r.range(0, 6.28), id: out.props.length });
    out.circles.push({ x, z, r: 0.38, kind: "tree", y1: y + h });
  }

  addTree(out, r, x, z, s, kind = "tree") {
    const y = this.height(x, z);
    out.props.push({ kind, x, z, y, s, rot: r.range(0, 6.28), id: out.props.length, tone: r() });
    out.circles.push({ x, z, r: 0.45 * s, kind: "tree", y1: y + 8 * s });
  }

  // Is (x, z) within pad metres of any road or junction? Checks neighbouring chunks too,
  // because road pieces belong to the chunk that holds their midpoint.
  nearRoad(x, z, out, pad) {
    const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = cx + dx, k = cz + dz;
      if (c < 0 || k < 0 || c >= NCH || k >= NCH) continue;
      for (const { e, i } of this.chunkSegs[c + k * NCH]) {
        const p = e.rib[i];
        if (Math.abs(p.x - x) > 40 || Math.abs(p.z - z) > 40) continue;
        const q = e.rib[i + 1];
        const ddx = q.x - p.x, ddz = q.z - p.z, L2 = ddx * ddx + ddz * ddz || 1;
        const t = clamp(((x - p.x) * ddx + (z - p.z) * ddz) / L2, 0, 1);
        if (Math.hypot(x - p.x - ddx * t, z - p.z - ddz * t) < e.hw + pad) return true;
      }
      for (const n of this.chunkNodes[c + k * NCH]) {
        if (Math.abs(n.x - x) < n.hx + pad + 2 && Math.abs(n.z - z) < n.hz + pad + 2) return true;
      }
    }
    return false;
  }

  genNature(out, natural, r) {
    // Unbuilt blocks: hills get villas along the roads and pine woods, the park gets trees,
    // everything else a scatter of trees on grass. Beaches get palms and lifeguard huts.
    for (const [bx, bz] of natural) {
      const dist = districtAt(bx + 64, bz + 64);
      const density = dist === "park" ? 0.16 : dist === "hills" ? 0.22 : 0.08;
      for (let gz = 0; gz < 8; gz++) {
        for (let gx = 0; gx < 8; gx++) {
          if (r() > density) continue;
          const x = bx + gx * 16 + r.range(2, 14), z = bz + gz * 16 + r.range(2, 14);
          if (shoreDist(x, z) < 4) continue;
          if (this.nearRoad(x, z, out, 3)) continue;
          const n = this.normal(x, z);
          if (n[1] < 0.8) continue;
          this.addTree(out, r, x, z, r.range(0.8, 1.5), dist === "hills" || this.height(x, z) > 40 ? "pine" : "tree");
        }
      }
    }
    // Villas along hill roads.
    for (const { e, i } of out.segs) {
      if (e.type !== 2 || districtAt(e.rib[i].x, e.rib[i].z) !== "hills") continue;
      const p = e.rib[i];
      if (hash2(Math.round(p.s / 8), e.id, 77) > 0.13) continue;
      const side = hash2(e.id, Math.round(p.s), 3) < 0.5 ? -1 : 1;
      const off = e.hw + 22;
      const x = p.x - p.tz * off * side, z = p.z + p.tx * off * side;
      if (this.nearRoad(x, z, out, 12)) continue;
      const w = r.range(16, 24), d = r.range(12, 18);
      this.addBuilding(out, { x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2, h: r.range(6, 9.5), style: ST.VILLA, color: r.pick([0xfff7ee, 0xfffdf9, 0xefe3d2, 0xf3e6d3]), seed: r(), roof: 0, neon: -1 });
    }
    // Beach dressing on the ocean side of the isles.
    if (out.x0 + CHUNK > 2500 && out.x0 < 2900) {
      for (let k = 0; k < 6; k++) {
        const z = out.z0 + r.range(0, CHUNK);
        let x = islE(z) - 70 + r.range(-25, 25);
        if (x < out.x0 || x >= out.x0 + CHUNK || shoreDist(x, z) < 6 || this.nearRoad(x, z, out, 4)) continue;
        if (r() < 0.25) {
          out.props.push({ kind: "hut", x, z, y: this.height(x, z), rot: Math.PI / 2, id: out.props.length });
          out.boxes.push({ x0: x - 2, z0: z - 2, x1: x + 2, z1: z + 2, y1: this.height(x, z) + 5 });
        } else if (r() < 0.6) {
          this.addPalm(out, r, x, z);
        } else {
          out.props.push({ kind: "umbrella", x, z, y: this.height(x, z), rot: 0, tone: r(), id: out.props.length });
        }
      }
    }
  }

  genTower(out) {
    const T = TOWER;
    out.tower = T;
    const gy = this.height(T.x, T.z);
    out.boxes.push({ x0: T.x - T.base / 2, z0: T.z - T.depth / 2, x1: T.x + T.base / 2, z1: T.z + T.depth / 2, y1: gy + T.height, tower: true });
    out.glows.push({ kind: "beacon", x: T.x, z: T.z, y: gy + T.height + 2, id: -1 });
    // Palms around the plaza.
    const r = rng(99);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const x = T.x + Math.cos(a) * 112, z = T.z + Math.sin(a) * 104;
      if (Math.abs(z - T.z) < 20) continue;
      this.addPalm(out, r, x, z, 11);
    }
  }
}

// -------------------------------------------------------------------- block generators

function split(x0, x1, n, gap) {
  const w = (x1 - x0 - gap * (n - 1)) / n, out = [];
  for (let k = 0; k < n; k++) out.push([x0 + k * (w + gap), x0 + k * (w + gap) + w]);
  return out;
}

function frontage(B, depth, unit, gap, make) {
  // Buildings along each block side that faces a road, leaving the corners to the side with
  // the bigger road. make(x0, z0, x1, z1, faceSide) returns a building or null.
  const { lx0, lx1, lz0, lz1, sides } = B;
  const runs = [];
  if (sides[2]) runs.push({ side: 2, a: lx0, b: lx1, fixed: [lz0, lz0 + depth] });
  if (sides[3]) runs.push({ side: 3, a: lx0, b: lx1, fixed: [lz1 - depth, lz1] });
  const zTop = sides[2] ? lz0 + depth + gap : lz0, zBot = sides[3] ? lz1 - depth - gap : lz1;
  if (sides[0]) runs.push({ side: 0, a: zTop, b: zBot, fixed: [lx0, lx0 + depth] });
  if (sides[1]) runs.push({ side: 1, a: zTop, b: zBot, fixed: [lx1 - depth, lx1] });
  for (const run of runs) {
    const len = run.b - run.a;
    if (len < unit * 0.6) continue;
    const n = Math.max(1, Math.round(len / unit));
    for (const [a, b] of split(run.a, run.b, n, gap)) {
      if (run.side >= 2) make(a, run.fixed[0], b, run.fixed[1], run.side);
      else make(run.fixed[0], a, run.fixed[1], b, run.side);
    }
  }
}

const BLOCKS = {
  console(B) {
    const { out, r, lx0, lx1, lz0, lz1, slab, cxm, czm } = B;
    slab(1, 0xd9d2c7);
    const dens = clamp(1 - Math.hypot(cxm - 128, czm + 256) / 1500, 0.15, 1);
    const n = r() < 0.3 ? 1 : 2, m = r() < 0.5 ? 1 : 2;
    for (const [a, b] of split(lx0, lx1, n, 6)) {
      for (const [c, d] of split(lz0, lz1, m, 6)) {
        const h = 28 + dens * r.range(30, 190) * (n * m > 2 ? 0.7 : 1);
        const glass = r() < 0.62;
        const color = glass ? r.pick(TOWERC) : r.pick([0xefe3d2, 0xcdbba2, 0xd9cdbd, 0xa7957d, 0xfff7ee]);
        const inset = 2;
        const base = { x0: a + inset, z0: c + inset, x1: b - inset, z1: d - inset, h, style: glass ? ST.GLASS : ST.OFFICE, color, seed: r(), roof: 0, neon: -1 };
        if (!this.addBuilding(out, base)) continue;
        base.tiers = [];
        if (h > 70 && r() < 0.65) {
          let tx0 = base.x0, tz0 = base.z0, tx1 = base.x1, tz1 = base.z1, top = h;
          base.h = h * r.range(0.45, 0.65);
          let y = base.h;
          for (let k = 0; k < 2; k++) {
            const sx = (tx1 - tx0) * r.range(0.1, 0.2), sz = (tz1 - tz0) * r.range(0.1, 0.2);
            tx0 += sx; tx1 -= sx; tz0 += sz; tz1 -= sz;
            const th = k === 1 ? top : y + (top - y) * r.range(0.5, 0.7);
            base.tiers.push({ x0: tx0, z0: tz0, x1: tx1, z1: tz1, y0: y, y1: th });
            y = th;
            if (th >= top) break;
          }
        }
        const topY = base.tiers.length ? base.tiers[base.tiers.length - 1].y1 : base.h;
        if (topY > 90) out.glows.push({ kind: "beacon", x: (a + b) / 2, z: (c + d) / 2, y: base.gy + topY + 1.5, id: -1 });
        if (topY > 60 && r() < 0.28) {
          out.signs.push({ x: (a + b) / 2, z: c + inset - 0.3, y: base.gy + base.h - 6, w: Math.min(28, b - a - 6), h: 6, rot: 0, text: r.int(0, SIGNS.length - 1), color: r.pick(NEON) });
        }
      }
    }
  },

  uptown(B) {
    const { out, r, lx0, lx1, lz0, lz1, slab } = B;
    slab(1, 0xddd5c9);
    const n = r.int(2, 3), m = r.int(1, 2);
    for (const [a, b] of split(lx0, lx1, n, 4)) {
      for (const [c, d] of split(lz0, lz1, m, 4)) {
        const pick = r();
        const style = pick < 0.35 ? ST.OFFICE : pick < 0.7 ? ST.DECO : ST.GLASS;
        const color = style === ST.GLASS ? r.pick(TOWERC) : r.pick(PASTEL);
        this.addBuilding(out, { x0: a + 1, z0: c + 1, x1: b - 1, z1: d - 1, h: r.range(12, 46), style, color, seed: r(), roof: 0, neon: style === ST.DECO && r() < 0.5 ? r.int(0, NEON.length - 1) : -1 });
      }
    }
  },

  cadence(B) {
    const { out, r, slab, lx0, lx1, lz0, lz1 } = B;
    slab(1, 0xe6dccd);
    slab(0, 0x9db58c, lx0 + 20, lz0 + 20, lx1 - 20, lz1 - 20);
    frontage(B, 18, 22, 1, (a, c, b, d) => {
      this.addBuilding(out, { x0: a, z0: c, x1: b, z1: d, h: r.range(9, 26), style: ST.DECO, color: r.pick(PASTEL), seed: r(), roof: 0, neon: r() < 0.75 ? r.int(0, NEON.length - 1) : -1 });
    });
    for (let k = 0; k < 4; k++) this.addPalm(out, r, r.range(lx0 + 24, lx1 - 24), r.range(lz0 + 24, lz1 - 24));
  },

  gardens(B) {
    const { out, r, slab, lx0, lx1, lz0, lz1, ix0, ix1, iz0, iz1 } = B;
    slab(0, 0x93ad7f);
    // sidewalk rings are drawn as four strips over the lawn
    const w = 4.5;
    if (B.sides[0]) slab(1, 0xd8d0c4, ix0, iz0, ix0 + w, iz1);
    if (B.sides[1]) slab(1, 0xd8d0c4, ix1 - w, iz0, ix1, iz1);
    if (B.sides[2]) slab(1, 0xd8d0c4, ix0, iz0, ix1, iz0 + w);
    if (B.sides[3]) slab(1, 0xd8d0c4, ix0, iz1 - w, ix1, iz1);
    frontage(B, 30, 24, 0, (a, c, b, d, side) => {
      const W = b - a, D = d - c;
      const hw = Math.min(W, D) * 0.5;
      const ww = Math.min(14, (side >= 2 ? W : D) - 6), dd = 11;
      let x0, z0, x1, z1;
      const mx = (a + b) / 2, mz = (c + d) / 2;
      if (side === 2) { x0 = mx - ww / 2; x1 = mx + ww / 2; z0 = c + 6; z1 = z0 + dd; }
      else if (side === 3) { x0 = mx - ww / 2; x1 = mx + ww / 2; z1 = d - 6; z0 = z1 - dd; }
      else if (side === 0) { z0 = mz - ww / 2; z1 = mz + ww / 2; x0 = a + 6; x1 = x0 + dd; }
      else { z0 = mz - ww / 2; z1 = mz + ww / 2; x1 = b - 6; x0 = x1 - dd; }
      if (ww < 7 || hw < 4) return;
      this.addBuilding(out, { x0, z0, x1, z1, h: r.range(5.5, 7.5), style: ST.HOUSE, color: r.pick(HOUSEC), seed: r(), roof: side >= 2 ? 1 : 2, neon: -1 });
      if (r() < 0.25) {
        const px = side < 2 ? (side === 0 ? x1 + 4 : x0 - 10) : mx - 3, pz = side >= 2 ? (side === 2 ? z1 + 3 : z0 - 7) : mz - 3;
        slab(4, 0x5fb3c0, px, pz, px + 6, pz + 4);
      }
      if (r() < 0.6) this.addTree(out, r, mx + r.range(-8, 8), mz + r.range(-6, 6) + (side === 2 ? 9 : side === 3 ? -9 : 0), r.range(0.8, 1.2));
    });
  },

  meridian(B) {
    const { out, r, slab, lx0, lx1, lz0, lz1, i, j } = B;
    slab(0, 0x9fbb93);
    slab(5, 0xe9e1d4, lx0 + 6, lz0 + 6, lx1 - 6, lz1 - 6);
    const big = (i + j) % 3 === 0;
    const pad = big ? 10 : 18;
    const b = { x0: lx0 + pad, z0: lz0 + pad, x1: lx1 - pad, z1: lz1 - pad, h: big ? r.range(36, 58) : r.range(18, 30), style: ST.HOSP, color: r.pick([0xfffdf9, 0xfff7ee, 0xd3e0e1, 0xefe3d2]), seed: r(), roof: 0, neon: -1 };
    if (this.addBuilding(out, b) && big) {
      out.signs.push({ x: (b.x0 + b.x1) / 2, z: b.z1 + 0.3, y: b.gy + b.h - 5, w: Math.min(34, b.x1 - b.x0 - 8), h: 5, rot: Math.PI, text: 5, color: 0x3fd0c9 });
      out.glows.push({ kind: "beacon", x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, y: b.gy + b.h + 1.5, id: -1 });
    }
    for (let k = 0; k < 6; k++) this.addTree(out, r, r.range(lx0 + 4, lx1 - 4), r() < 0.5 ? lz0 + 5 : lz1 - 5, 1);
  },

  docks(B) {
    const { out, r, slab, lx0, lx1, lz0, lz1, coastal } = B;
    slab(1, 0xb9b3aa);
    if (r() < 0.45) {
      // Warehouse
      this.addBuilding(out, { x0: lx0 + 4, z0: lz0 + 6, x1: lx1 - 4, z1: lz1 - r.range(10, 40), h: r.range(9, 15), style: ST.WARE, color: r.pick([0xa7957d, 0x8fabaf, 0xcdbba2, 0xb8544f, 0x5599a0]), seed: r(), roof: 0, neon: -1 });
      if (r() < 0.4) out.signs.push({ x: (lx0 + lx1) / 2, z: lz0 + 5.7, y: this.height((lx0 + lx1) / 2, lz0) + 10, w: 26, h: 4, rot: 0, text: 6, color: 0xff6a2e });
    } else {
      // Container yard: rows of stacks.
      const cols = [0xff6018, 0x2f757c, 0xd7a03d, 0xb8544f, 0x507fa7, 0x5d8f5e, 0xa4517b, 0xefe3d2];
      for (let z = lz0 + 6; z + 3 < lz1 - 4; z += 6.2) {
        for (let x = lx0 + 4; x + 12.2 < lx1 - 4; x += 15) {
          if (r() < 0.2) continue;
          const tiers = r.int(1, 4);
          this.addBuilding(out, { x0: x, z0: z, x1: x + 12.2, z1: z + 2.5, h: 2.6 * tiers, style: ST.BOX, color: r.pick(cols), seed: r(), roof: 0, neon: -1 });
        }
      }
    }
    if (coastal) {
      const x = r.range(lx0 + 20, lx1 - 20), z = lz1 - 8;
      if (this.landOK(x - 9, z - 6, x + 9, z + 6, 0.5)) {
        out.props.push({ kind: "crane", x, z, y: this.height(x, z), rot: 0, id: out.props.length });
        for (const [dx, dz] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) out.circles.push({ x: x + dx, z: z + dz, r: 0.8, kind: "post", y1: 40 });
        out.glows.push({ kind: "beacon", x, z: z + 30, y: this.height(x, z) + 46, id: -1 });
      }
    }
  },

  isles(B) {
    const { out, r, slab, lx0, lx1, lz0, lz1, cxm } = B;
    slab(1, 0xeee3d3);
    const oceanSide = cxm > 2500;
    frontage(B, oceanSide ? 26 : 20, oceanSide ? 30 : 22, 2, (a, c, b, d) => {
      const tall = oceanSide && r() < 0.6;
      this.addBuilding(out, { x0: a, z0: c, x1: b, z1: d, h: tall ? r.range(18, 38) : r.range(8, 18), style: ST.DECO, color: r.pick(PASTEL), seed: r(), roof: 0, neon: r() < 0.85 ? r.int(0, NEON.length - 1) : -1 });
    });
    slab(4, 0x4fb0bd, (lx0 + lx1) / 2 - 9, (lz0 + lz1) / 2 - 5, (lx0 + lx1) / 2 + 9, (lz0 + lz1) / 2 + 5);
    for (let k = 0; k < 5; k++) this.addPalm(out, r, r.range(lx0 + 30, lx1 - 30), r.range(lz0 + 30, lz1 - 30));
  },
};
BLOCKS.scratch = BLOCKS.isles;
BLOCKS.sandbox = BLOCKS.isles;
BLOCKS.preview = BLOCKS.isles;

// ---------------------------------------------------------------------------- helpers

export function chunkIndex(x, z) {
  const cx = Math.floor((x + HALF) / CHUNK), cz = Math.floor((z + HALF) / CHUNK);
  if (cx < 0 || cz < 0 || cx >= NCH || cz >= NCH) return -1;
  return cx + cz * NCH;
}

function deckKey(x, z) {
  return Math.floor((x + HALF) / 64) * 1000 + Math.floor((z + HALF) / 64);
}

function densify(pts, step) {
  const out = [pts[0].slice()];
  for (let k = 1; k < pts.length; k++) {
    const [ax, az] = pts[k - 1], [bx, bz] = pts[k];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
    for (let i = 1; i <= n; i++) out.push([lerp(ax, bx, i / n), lerp(az, bz, i / n)]);
  }
  return out;
}

function fillGaps(y) {
  const n = y.length;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(y[i])) continue;
    if (last >= 0 && i - last > 1) for (let k = last + 1; k < i; k++) y[k] = lerp(y[last], y[i], (k - last) / (i - last));
    else if (last < 0) for (let k = 0; k < i; k++) y[k] = y[i];
    last = i;
  }
  for (let k = last + 1; k < n; k++) y[k] = last >= 0 ? y[last] : 2;
}

function smoothArr(y, rad) {
  const n = y.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - rad); k <= Math.min(n - 1, i + rad); k++) { s += y[k]; c++; }
    out[i] = s / c;
  }
  return out;
}

function gradeLimit(y, ds, g) {
  const n = y.length, d = ds * g;
  for (let i = 1; i < n - 1; i++) y[i] = clamp(y[i], y[i - 1] - d, y[i - 1] + d);
  for (let i = n - 2; i > 0; i--) y[i] = clamp(y[i], y[i + 1] - d, y[i + 1] + d);
}

export const SPAWN = { x: 130.4, z: 430, yaw: 0 };
