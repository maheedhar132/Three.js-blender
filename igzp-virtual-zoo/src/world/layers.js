// Rasterises the traced map layout into grids used everywhere else:
//  - mask (R = tar road, G = walking path / plaza, B = enclosure floor)  -> terrain shading + map
//  - walkable grid                                                       -> collision + navigation
//  - water (raw + softened)                                              -> carving, water surface, shores
//  - heightAt(x, z)                                                      -> terrain, placement
import { WORLD, toWorld } from '../config.js';
import { ROADS, PATHS, PLAZAS, WATER, HILLS, EXHIBITS, HIGHWAY, RESTRICTED } from '../data/zoo-layout.js';
import { fbm2, sstep, lerp, clamp, blob, smoothLine, seed, rand, rr, pointInPoly } from '../core/util.js';

const FLOOR = { dirt: 235, rock: 170, forest: 120, grass: 70, water: 150, aviary: 130, pit: 255, primate: 160 };
// Containment style per species (virtual design, not a claim about the real zoo's construction):
//  moat  = open habitat: visitor parapet + dry moat on the viewing side, tall mesh only at the back
//  glass = viewing-glass panels on the viewing side, fine mesh at the back
export const ENCLOSURE_STYLE = {
  bengal_tiger: 'moat', white_tiger: 'moat', lion: 'moat', himalayan_black_bear: 'moat', sloth_bear: 'moat',
  leopard: 'glass', small_cat: 'glass', sun_bear: 'glass', striped_hyena: 'glass', dhole: 'glass', grey_wolf: 'glass', golden_jackal: 'glass',
};

function distToSegmentSq(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return (px - x1) ** 2 + (py - y1) ** 2;
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (px - (x1 + t * (x2 - x1))) ** 2 + (py - (y1 + t * (y2 - y1))) ** 2;
}

export class Layers {
  constructor() {
    seed(42);
    const R = WORLD.layerRes; this.R = R;
    this.W = WORLD.sizeX / R; this.H = WORLD.sizeZ / R;
    this.x0 = -WORLD.sizeX / 2; this.z0 = -WORLD.sizeZ / 2;
    this.blockers = [];   // circles that block movement (building footprints on plazas, gate pillars...)
    this.enclosurePonds = [];
    this.hills = HILLS.map((h, i) => { const [x, z] = toWorld(...h.at); return { ...h, x, z, rx: h.rx * WORLD.scale, rz: h.ry * WORLD.scale, seed: i * 7.3 }; });
    this._buildPaths();
    this._buildWater();
    this._buildEnclosures();
    this._buildViewingAprons();
    this._finish();
  }
  // map px polyline -> canvas px
  _cv(pts) { return pts.map(([px, py]) => { const [x, z] = toWorld(px, py); return [(x - this.x0) / this.R, (z - this.z0) / this.R]; }); }
  _canvas() { const c = document.createElement('canvas'); c.width = this.W; c.height = this.H; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H); g.lineCap = g.lineJoin = 'round'; return [c, g]; }
  _stroke(g, pts, width, color) { const s = smoothLine(this._cv(pts), 6); g.strokeStyle = color; g.lineWidth = width * WORLD.scale / this.R; g.beginPath(); s.forEach(([u, v], i) => (i ? g.lineTo(u, v) : g.moveTo(u, v))); g.stroke(); }
  _fillPoly(g, poly, color) { g.fillStyle = color; g.beginPath(); poly.forEach(([x, z], i) => { const u = (x - this.x0) / this.R, v = (z - this.z0) / this.R; i ? g.lineTo(u, v) : g.moveTo(u, v); }); g.closePath(); g.fill(); }
  _circle(g, px, py, r, color) { const [x, z] = toWorld(px, py); g.fillStyle = color; g.beginPath(); g.arc((x - this.x0) / this.R, (z - this.z0) / this.R, r * WORLD.scale / this.R, 0, Math.PI * 2); g.fill(); }

  _buildPaths() {
    const [c, g] = this._canvas(); this.maskCanvas = c; this.maskCtx = g;
    g.globalCompositeOperation = 'lighter';
    for (const r of ROADS) this._stroke(g, r.pts, r.width, '#ff0000');
    for (const p of PATHS) this._stroke(g, p.pts, p.width, '#00ff00');
    for (const p of PLAZAS) this._circle(g, ...p.at, p.r, p.parking ? '#ff0000' : '#00ff00');
    const d = g.getImageData(0, 0, this.W, this.H).data, N = this.W * this.H;
    this.walk = new Uint8Array(N);
    for (let i = 0; i < N; i++) this.walk[i] = (d[i * 4] > 90 || d[i * 4 + 1] > 90) ? 1 : 0;
    this.roadRaw = new Uint8Array(N); for (let i = 0; i < N; i++) this.roadRaw[i] = d[i * 4] > 140 ? 1 : 0;
  }
  _buildWater() {
    const [c, g] = this._canvas(); this.waterCanvas = c; this.waterCtx = g;
    for (const w of WATER) {
      if (w.kind === 'stream') this._stroke(g, w.pts, w.width, '#fff');
      else if (w.kind === 'pond') this._circle(g, ...w.at, w.r, '#fff');
      else { const pts = smoothLine(w.pts.concat([w.pts[0]]), 5).map(p => toWorld(...p)); this._fillPoly(g, pts, '#fff'); }
    }
    const d = g.getImageData(0, 0, this.W, this.H).data;
    this.waterMain = new Uint8Array(this.W * this.H); for (let i = 0; i < this.waterMain.length; i++) this.waterMain[i] = d[i * 4] > 120 ? 1 : 0;
  }
  _grid(arr, x, z) { const u = Math.round((x - this.x0) / this.R), v = Math.round((z - this.z0) / this.R); if (u < 0 || v < 0 || u >= this.W || v >= this.H) return 0; return arr[v * this.W + u]; }
  /** True if any walkable cell lies within r metres (sampled ring). */
  nearWalk(x, z, r) {
    if (this._grid(this.walk, x, z)) return true;
    for (const k of [0.5, 1]) for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; if (this._grid(this.walk, x + Math.cos(t) * r * k, z + Math.sin(t) * r * k)) return true; }
    return false;
  }
  nearMainWater(x, z, r) { for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; if (this._grid(this.waterMain, x + Math.cos(t) * r, z + Math.sin(t) * r)) return true; } return !!this._grid(this.waterMain, x, z); }

  _buildEnclosures() {
    this.enclosures = [];
    const g = this.maskCtx, wg = this.waterCtx;
    g.globalCompositeOperation = 'lighter';
    const [mc, mg] = this._canvas(); this.moatCanvas = mc; mg.lineCap = mg.lineJoin = 'round';
    for (const ex of EXHIBITS) {
      let [cx, cz] = toWorld(...ex.at); const r = ex.r * WORLD.scale;
      // 1. if the mapped spot is squeezed between paths, slide the enclosure away from them (max ~30 m)
      const ox = cx, oz = cz;
      for (let it = 0; it < 20 && this.nearWalk(cx, cz, r * 0.6 + 4); it++) {
        let ax = 0, az = 0;
        for (let a = 0; a < 16; a++) { const t = a / 16 * 6.283, d = r * 0.6 + 4; if (this._grid(this.walk, cx + Math.cos(t) * d, cz + Math.sin(t) * d)) { ax -= Math.cos(t); az -= Math.sin(t); } }
        const l = Math.hypot(ax, az); if (!l) break;
        cx += ax / l * 1.5; cz += az / l * 1.5;
        if (Math.hypot(cx - ox, cz - oz) > 30) break;
      }
      let poly = blob(cx, cz, r, 30, 0.16, rr(0.85, 1.15), rr(0, 3.14), rand() * 10);
      // 2. pull each vertex toward the centre until it clears paths (4.5 m buffer) and the main lake
      poly = poly.map(([x, z]) => {
        let t = 1, px = x, pz = z;
        while (t > 0.45 && (this.nearWalk(px, pz, 4.5) || this.nearMainWater(px, pz, 2))) { t -= 0.04; px = cx + (x - cx) * t; pz = cz + (z - cz) * t; }
        return [px, pz];
      });
      for (let k = 0; k < 2; k++) poly = poly.map((p, i) => { const a = poly[(i + poly.length - 1) % poly.length], b = poly[(i + 1) % poly.length]; return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4]; });
      // 2b. a path may still cross the INTERIOR of a large enclosure: pull the vertices in that
      //     direction back so the path (plus a 5 m verge) stays outside.
      for (let it = 0; it < 12; it++) {
        const bad = [], ext = Math.max(...poly.map(p => Math.hypot(p[0] - cx, p[1] - cz)));
        for (let z = cz - ext; z <= cz + ext; z += this.R) for (let x = cx - ext; x <= cx + ext; x += this.R) if (this._grid(this.walk, x, z) && pointInPoly(x, z, poly)) bad.push([x, z]);
        if (!bad.length) break;
        poly = poly.map(([x, z]) => {
          const ang = Math.atan2(z - cz, x - cx); let rad = Math.hypot(x - cx, z - cz);
          for (const [bx, bz] of bad) { const a2 = Math.atan2(bz - cz, bx - cx), da = Math.abs(Math.atan2(Math.sin(a2 - ang), Math.cos(a2 - ang))); if (da < 0.5) rad = Math.min(rad, Math.max(3, Math.hypot(bx - cx, bz - cz) - 5)); }
          return [cx + Math.cos(ang) * rad, cz + Math.sin(ang) * rad];
        });
      }
      // 3. visitor-facing edges (edge i = v[i] -> v[i+1]) are those within ~11 m of a public path
      const front = poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return this.nearWalk((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 11); });
      const style = ENCLOSURE_STYLE[ex.species] || null;
      const v = FLOOR[ex.habitat] || 100;
      this._fillPoly(g, poly, `rgb(0,0,${v})`);
      // 4. dry moat just inside the visitor-facing edges (open-habitat look for big predators and bears)
      if (style === 'moat') {
        const [pcx, pcz] = [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
        const inner = p => { const dx = pcx - p[0], dz = pcz - p[1], l = Math.hypot(dx, dz) || 1; return [p[0] + dx / l * 3.6, p[1] + dz / l * 3.6]; };
        mg.strokeStyle = '#fff'; mg.lineWidth = 4.2 / this.R;
        for (let i = 0; i < poly.length; i++) if (front[i]) { const a = inner(poly[i]), b = inner(poly[(i + 1) % poly.length]); mg.beginPath(); mg.moveTo((a[0] - this.x0) / this.R, (a[1] - this.z0) / this.R); mg.lineTo((b[0] - this.x0) / this.R, (b[1] - this.z0) / this.R); mg.stroke(); }
      }
      let pool = null;
      if (ex.pool) {
        const [dx, dy, pr] = ex.pool;
        // keep the pond inside the (possibly path-shrunk) enclosure outline: distance to the nearest wall
        const wallD = (x, z) => {
          let d = 1e9;
          for (let i = 0; i < poly.length; i++) {
            const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], ex2 = bx - ax, ez2 = bz - az, l2 = ex2 * ex2 + ez2 * ez2 || 1;
            const t = clamp(((x - ax) * ex2 + (z - az) * ez2) / l2, 0, 1);
            d = Math.min(d, Math.hypot(x - ax - ex2 * t, z - az - ez2 * t));
          }
          return pointInPoly(x, z, poly) ? d : -d;
        };
        let poolX = cx + dx * WORLD.scale, poolZ = cz + dy * WORLD.scale, edgeD = wallD(poolX, poolZ);
        // if the mapped spot is cramped, move the pond to the roomiest point in the enclosure
        if (edgeD < pr * WORLD.scale + 1) {
          for (let gx = -20; gx <= 20; gx += 1.5) for (let gz = -20; gz <= 20; gz += 1.5) {
            const x = cx + gx, z = cz + gz, d = wallD(x, z);
            if (d > edgeD) { edgeD = d; poolX = x; poolZ = z; }
          }
        }
        const poolR = Math.max(3, Math.min(pr * WORLD.scale, edgeD - 1.0));   // water edge stays 1 m inside the wall
        const baseH = this._baseHeightAt(poolX, poolZ);
        // the basin can only be carved DOWN, so the surface must sit below the lowest ground on its rim
        let rimH = baseH; for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2; rimH = Math.min(rimH, this._baseHeightAt(poolX + Math.cos(t) * poolR * 1.1, poolZ + Math.sin(t) * poolR * 1.1)); }
        const fit = Math.round((rimH - 0.03) * 100) / 100;   // highest surface the rim can still hold
        const waterLevel = Math.max(0.2, ex.waterLevel != null ? Math.min(ex.waterLevel, fit) : Math.round((rimH - 0.15) * 100) / 100);
        const depth = ex.id === 'swan' ? 0.55 : Math.min(0.65, Math.max(0.4, poolR * 0.08));
        const bedLevel = waterLevel - depth;
        pool = { x: poolX, z: poolZ, r: poolR, waterLevel, bedLevel, enclosureId: ex.id };
        this.enclosurePonds.push(pool);
        this._fillPoly(wg, blob(pool.x, pool.z, pool.r, 20, 0.2, 1.2, rand() * 3, rand() * 10), '#fff');
      }
      this.enclosures.push({ ...ex, cx, cz, r: Math.max(...poly.map(p => Math.hypot(p[0] - cx, p[1] - cz))) / WORLD.scale, poly, pool, pondWaterLevel: pool?.waterLevel, front, style, shifted: Math.round(Math.hypot(cx - ox, cz - oz)) });
    }
    for (const rz of RESTRICTED) {
      const [x, z] = toWorld(...rz.at);
      this._fillPoly(g, blob(x, z, rz.r, 24, 0.15, 1.3, 0.2, 3), 'rgb(0,0,90)');
      if (rz.id === 'wild-dog-breeding') this._fillPoly(wg, blob(x + 6, z + 4, rz.r * 0.55, 20, 0.2, 1.6, 0.1, 5), '#fff');
    }
    // the public highway outside the zoo: drawn as road but never walkable
    this._stroke(g, HIGHWAY.pts, HIGHWAY.width, '#ff0000');
  }

  /**
   * Extends the walkable mask with viewing aprons/verges extending from paths
   * right up to the physical enclosure fences (within 0.5m of the barrier),
   * while strictly masking out enclosure interiors.
   */
  _buildViewingAprons() {
    const W = this.W, H = this.H, R = this.R, x0 = this.x0, z0 = this.z0;
    const g = this.maskCtx;

    // 1. Extend walkable mask from paths right up to visitor-facing enclosure fences
    for (const en of this.enclosures) {
      for (let i = 0; i < en.poly.length; i++) {
        if (!en.front[i]) continue;
        const p1 = en.poly[i], p2 = en.poly[(i + 1) % en.poly.length];
        const minX = Math.min(p1[0], p2[0]) - 8, maxX = Math.max(p1[0], p2[0]) + 8;
        const minZ = Math.min(p1[1], p2[1]) - 8, maxZ = Math.max(p1[1], p2[1]) + 8;
        const u0 = Math.max(0, Math.floor((minX - x0) / R));
        const u1 = Math.min(W - 1, Math.ceil((maxX - x0) / R));
        const v0 = Math.max(0, Math.floor((minZ - z0) / R));
        const v1 = Math.min(H - 1, Math.ceil((maxZ - z0) / R));

        for (let v = v0; v <= v1; v++) {
          for (let u = u0; u <= u1; u++) {
            const idx = v * W + u;
            const x = x0 + (u + 0.5) * R;
            const z = z0 + (v + 0.5) * R;

            const edgeD = Math.sqrt(distToSegmentSq(x, z, p1[0], p1[1], p2[0], p2[1]));
            if (edgeD >= 0.5 && edgeD <= 8.0 && this.nearWalk(x, z, 4.0)) {
              if (this.nearMainWater(x, z, 2.5)) continue;
              this.walk[idx] = 1;
              g.fillStyle = '#00ff00';
              g.fillRect(u, v, 1, 1);
            }
          }
        }
      }
    }

    // 2. Strictly ensure no cell inside ANY enclosure is walkable
    for (const en of this.enclosures) {
      const minX = Math.min(...en.poly.map(p => p[0]));
      const maxX = Math.max(...en.poly.map(p => p[0]));
      const minZ = Math.min(...en.poly.map(p => p[1]));
      const maxZ = Math.max(...en.poly.map(p => p[1]));
      const u0 = Math.max(0, Math.floor((minX - x0) / R));
      const u1 = Math.min(W - 1, Math.ceil((maxX - x0) / R));
      const v0 = Math.max(0, Math.floor((minZ - z0) / R));
      const v1 = Math.min(H - 1, Math.ceil((maxZ - z0) / R));

      for (let v = v0; v <= v1; v++) {
        for (let u = u0; u <= u1; u++) {
          const idx = v * W + u;
          if (!this.walk[idx]) continue;
          const x = x0 + (u + 0.5) * R;
          const z = z0 + (v + 0.5) * R;
          if (pointInPoly(x, z, en.poly)) this.walk[idx] = 0;
        }
      }
    }
  }

  _finish() {
    const N = this.W * this.H;
    const md = this.maskCtx.getImageData(0, 0, this.W, this.H).data;
    this.mask = md;
    const wd = this.waterCtx.getImageData(0, 0, this.W, this.H).data;
    let a = new Float32Array(N), b = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = wd[i * 4] / 255;
    this.waterRaw = a.slice();
    // separable box blur (radius 3 px = 6 m), twice -> soft shore gradient
    const W = this.W, H = this.H, rad = 3;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) { let s = 0; for (let x = -rad; x <= rad; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { b[y * W + x] = s / (2 * rad + 1); s += a[y * W + Math.min(W - 1, x + rad + 1)] - a[y * W + Math.max(0, x - rad)]; } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -rad; y <= rad; y++) s += b[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * rad + 1); s += b[Math.min(H - 1, y + rad + 1) * W + x] - b[Math.max(0, y - rad) * W + x]; } }
    }
    this.waterSoft = a;
    // water cells are never walkable (paths across streams are treated as bridges by keeping path pixels)
    for (let i = 0; i < N; i++) if (this.waterRaw[i] > 0.5 && !(md[i * 4 + 1] > 90 || md[i * 4] > 90)) this.walk[i] = 0;
    // a walkable "softness" field for flattening terrain under roads
    this.flat = new Float32Array(N); for (let i = 0; i < N; i++) this.flat[i] = Math.max(md[i * 4], md[i * 4 + 1]) / 255;
    // dry moats (softened slightly so the banks slope)
    const mo = this.moatCanvas.getContext('2d').getImageData(0, 0, W, H).data;
    this.moat = new Float32Array(N); for (let i = 0; i < N; i++) this.moat[i] = mo[i * 4] / 255;
    // public cells that cross water are bridges: they keep the visitor route continuous
    // A deck is needed wherever a public cell would otherwise stand below deck level (1.0 m): this makes
    // the deck meet the banks exactly where the terrain rises to deck height (no steps at the ends).
    this.bridgeMask = new Uint8Array(N); this.bridgeCells = 0;
    for (let i = 0; i < N; i++) if (this.walk[i] && this.waterSoft[i] > 0.04) {
      const x = this.x0 + (i % W + 0.5) * this.R, z = this.z0 + (((i / W) | 0) + 0.5) * this.R;
      if (this.heightAt(x, z) < 0.98) { this.bridgeMask[i] = 1; this.bridgeCells++; }
    }
  }
  /** Road-only grid (tar roads + parking), used by the guided safari vehicle. */
  roadGrid() {
    if (!this._road) { const N = this.W * this.H, m = this.mask; this._road = new Uint8Array(N); for (let i = 0; i < N; i++) this._road[i] = this.walk[i] && this.roadRaw[i] ? 1 : 0; }
    return this._road;
  }
  /** Bilinear sample of a Float32/Uint8 grid. */
  sample(arr, x, z, scale = 1) {
    let u = (x - this.x0) / this.R - 0.5, v = (z - this.z0) / this.R - 0.5;
    if (u < 0) u = 0; if (v < 0) v = 0; if (u > this.W - 1.001) u = this.W - 1.001; if (v > this.H - 1.001) v = this.H - 1.001;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, W = this.W;
    const a = arr[j * W + i], b = arr[j * W + i + 1], c = arr[(j + 1) * W + i], d = arr[(j + 1) * W + i + 1];
    return ((a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + d * fu) * fv) * scale;
  }
  /** Register a solid obstacle: blocks movement and removes its cells from the route grid. */
  block(x, z, r) {
    this.blockers.push({ x, z, r });
    const R = this.R, rr = Math.ceil(r / R) + 1, u0 = Math.round((x - this.x0) / R - 0.5), v0 = Math.round((z - this.z0) / R - 0.5);
    for (let v = v0 - rr; v <= v0 + rr; v++) for (let u = u0 - rr; u <= u0 + rr; u++) {
      if (u < 0 || v < 0 || u >= this.W || v >= this.H) continue;
      const cx = this.x0 + (u + 0.5) * R, cz = this.z0 + (v + 0.5) * R;
      if ((cx - x) ** 2 + (cz - z) ** 2 < (r + 0.6) ** 2) this.walk[v * this.W + u] = 0;
    }
  }
  water(x, z) { return this.sample(this.waterSoft, x, z); }
  /** 0 inside the zoo grounds, 1 in the surrounding forest (organic, noisy boundary). Mirrored in the terrain shader. */
  forestness(x, z) { const e = Math.hypot(x / 640, z / 430) * (1 + (fbm2(x * 0.006, z * 0.006, 2) - 0.5) * 0.25); return sstep(0.92, 1.05, e); }
  isWalkable(x, z) {
    if (this.sample(this.walk, x, z) < 0.35) return false;
    for (const b of this.blockers) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return false;
    if (this.enclosures) {
      for (let i = 0; i < this.enclosures.length; i++) {
        const en = this.enclosures[i];
        if (Math.hypot(x - en.cx, z - en.cz) < en.r + 0.2 && pointInPoly(x, z, en.poly)) return false;
      }
    }
    return true;
  }
  isBridge(x, z) { return this.sample(this.bridgeMask, x, z) > 0.5; }
  /** Height a visitor stands at: terrain, or the bridge deck where a public route crosses water. */
  walkHeight(x, z) { const h = this.heightAt(x, z); return this.sample(this.bridgeMask, x, z) > 0.3 ? Math.max(h + 0.04, 1.0) : h; }
  maskAt(x, z) { const u = Math.round((x - this.x0) / this.R), v = Math.round((z - this.z0) / this.R); if (u < 0 || v < 0 || u >= this.W || v >= this.H) return [0, 0, 0]; const i = (v * this.W + u) * 4; return [this.mask[i] / 255, this.mask[i + 1] / 255, this.mask[i + 2] / 255]; }

  /** Water surface level: elevated for enclosure ponds, WORLD.waterLevel (0) for lakes. */
  waterLevelAt(x, z) {
    if (this.enclosurePonds) {
      for (let i = 0; i < this.enclosurePonds.length; i++) {
        const p = this.enclosurePonds[i];
        if (Math.hypot(x - p.x, z - p.z) <= p.r * 1.15) return p.waterLevel;
      }
    }
    return WORLD.waterLevel;
  }

  /** Terrain base height before water carving and moats. */
  _baseHeightAt(x, z) {
    let h = 0.9 + fbm2(x * 0.004 + 11, z * 0.004 - 3, 3) * 3.2;
    const flat = this.flat ? this.sample(this.flat, x, z) : 0;
    h += (fbm2(x * 0.03, z * 0.03, 2) - 0.5) * 1.6 * (1 - flat);
    for (const hl of this.hills) {
      const dx = x - hl.x, dz = z - hl.z, c = Math.cos(hl.rot), s = Math.sin(hl.rot);
      const lx = (dx * c + dz * s) / hl.rx, lz = (-dx * s + dz * c) / hl.rz, d = Math.hypot(lx, lz);
      if (d < 1.3) h += hl.h * Math.pow(sstep(1.25, 0.15, d), 1.3) * (0.75 + 0.5 * fbm2(x * 0.012 + hl.seed, z * 0.012, 3)) * (1 - flat * 0.6);
    }
    const e = Math.hypot(x / 690, z / 500);
    if (e > 0.95) h += sstep(0.98, 1.45, e) * 52 * (0.6 + 0.8 * fbm2(x * 0.006 + 3, z * 0.006, 3));
    return h;
  }

  /** Terrain height in metres. Gentle plain + Seethakonda hills + outer forested ridges, carved by water. */
  heightAt(x, z) {
    let h = this._baseHeightAt(x, z);

    // Natural recessed water bowl for enclosure ponds
    let pondCarved = false;
    if (this.enclosurePonds) {
      for (let i = 0; i < this.enclosurePonds.length; i++) {
        const p = this.enclosurePonds[i];
        const dist = Math.hypot(x - p.x, z - p.z);
        const R = p.r * 1.18; // smooth margin to mud/pebble shores
        if (dist < R) {
          const normD = dist / R;
          const rimRatio = p.r / R;
          let targetH;
          if (normD < rimRatio) {
            // Recessed water bowl: smooth paraboloid bowl from bedLevel to waterLevel
            const u = normD / rimRatio; // 0 at center, 1 at water rim
            targetH = p.bedLevel + (p.waterLevel - p.bedLevel) * (u * u);
          } else {
            // Mud/pebble shore transition meeting surrounding terrain
            const u = (normD - rimRatio) / (1.0 - rimRatio);
            targetH = lerp(p.waterLevel, h, sstep(0.0, 1.0, u));
          }
          h = Math.min(h, targetH);
          pondCarved = true;
          break;
        }
      }
    }

    if (!pondCarved) {
      const w = this.water(x, z);
      if (w > 0.2) h = lerp(h, -1.8, sstep(0.25, 0.9, w));     // water runs under bridges (decks are separate geometry)
    }

    const m = this.sample(this.moat, x, z);
    if (m > 0.01) h -= 3.0 * sstep(0.05, 0.75, m);
    return h;
  }
}
