import * as THREE from 'three';
export const V3 = THREE.Vector3;
export const UP = new V3(0, 1, 0);

// ---------- seeded random ----------
let _seed = 1977;
export function seed(s) { _seed = s | 0; }
export function rand() { _seed = (_seed + 0x6D2B79F5) | 0; let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
export const rr = (a, b) => a + (b - a) * rand();
export const pick = a => a[Math.floor(rand() * a.length)];
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- noise ----------
const fade = t => t * t * (3 - 2 * t);
export function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function hash3(x, y, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440670441)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = fade(x - xi), v = fade(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, o = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * noise2(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 - 9.3; a *= 0.5; } return s / n; }
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const c = (i, j, k) => hash3(xi + i, yi + j, zi + k), l = lerp;
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
export function fbm3(x, y, z, o = 3) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * noise3(x, y, z); n += a; x *= 2.02; y *= 2.02; z *= 2.02; a *= 0.5; } return s / n; }

// ---------- 2D polygons ----------
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}
/** Organic closed outline around a centre (world metres). */
export function blob(cx, cz, r, n = 28, wobble = 0.18, aspect = 1, rot = 0, s = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const k = 1 + wobble * (noise2(Math.cos(a) * 1.3 + s, Math.sin(a) * 1.3 + s * 2) * 2 - 1);
    const x = Math.cos(a) * r * k * aspect, z = Math.sin(a) * r * k;
    pts.push([cx + x * Math.cos(rot) - z * Math.sin(rot), cz + x * Math.sin(rot) + z * Math.cos(rot)]);
  }
  return pts;
}
export function polyCentroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export function insetPoly(p, d) { const [cx, cz] = polyCentroid(p); return p.map(([x, z]) => { const l = Math.hypot(x - cx, z - cz) || 1; const k = Math.max(0.1, (l - d) / l); return [cx + (x - cx) * k, cz + (z - cz) * k]; }); }
export function polyLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
/** Catmull-Rom smoothing of a 2D polyline. */
export function smoothLine(pts, steps = 6) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// ---------- geometry helpers ----------
const _c = new THREE.Color();
/** Add a per-vertex colour attribute from a constant or fn(color, x, y, z). Converts to non-indexed. */
export function paint(geo, c) {
  if (geo.index) geo = geo.toNonIndexed();
  const p = geo.attributes.position, n = p.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (typeof c === 'function') c(_c, p.getX(i), p.getY(i), p.getZ(i)); else _c.copy(c);
    arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
/** Concatenate geometries (position, normal, uv, color + any extra float attributes of size 1..4). */
export function merge(geos, extra = []) {
  geos = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const names = ['position', 'normal', 'uv', 'color', ...extra];
  const sizes = { position: 3, normal: 3, uv: 2, color: 3 };
  for (const e of extra) sizes[e] = geos.find(g => g.attributes[e])?.attributes[e].itemSize || 1;
  const out = {}; for (const a of names) out[a] = new Float32Array(n * sizes[a]);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    for (const a of names) {
      if (g.attributes[a]) out[a].set(g.attributes[a].array, o * sizes[a]);
      else if (a === 'color') out[a].fill(1, o * 3, (o + c) * 3);
    }
    o += c; g.dispose();
  }
  const res = new THREE.BufferGeometry();
  for (const a of names) res.setAttribute(a, new THREE.BufferAttribute(out[a], sizes[a]));
  res.computeBoundingSphere();
  return res;
}
export function weld(geo) {
  const p = geo.attributes.position, map = new Map(), verts = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = Math.round(x * 1e4) + '_' + Math.round(y * 1e4) + '_' + Math.round(z * 1e4);
    let k = map.get(key); if (k === undefined) { k = verts.length / 3; map.set(key, k); verts.push(x, y, z); }
    idx.push(k);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx);
  return g;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3();
export function mat4(pos, rotY = 0, scale = 1, rotX = 0, rotZ = 0) {
  _e.set(rotX, rotY, rotZ, 'YXZ'); _q.setFromEuler(_e);
  if (typeof scale === 'number') _s.set(scale, scale, scale); else _s.copy(scale);
  return new THREE.Matrix4().compose(pos, _q, _s);
}
/** Tapered cylinder between two points. */
export function limb(a, b, ra, rb, radial = 8) {
  const d = new V3().subVectors(b, a), L = d.length();
  const g = new THREE.CylinderGeometry(rb, ra, L, radial, 1, false);
  g.translate(0, L / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new V3(1, 1, 1)));
  return g;
}
export function ellipsoid(c, rx, ry, rz, w = 14, h = 10) { const g = new THREE.SphereGeometry(1, w, h); g.scale(rx, ry, rz); g.translate(c.x, c.y, c.z); return g; }
/**
 * Loft an elliptical tube through points. rx = side radius, ry = "up" radius (per point).
 * Triangles are oriented outward; ends are capped.
 */
export function loft(pts, rx, ry, segs = 10, cap = true) {
  const P = [], I = [], N = pts.length, ring = segs;
  let S = null;
  const T = new V3(), U = new V3(), tmp = new V3();
  for (let i = 0; i < N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
    T.subVectors(b, a).normalize();
    if (!S) { const ref = Math.abs(T.y) > 0.9 ? new V3(1, 0, 0) : UP; S = new V3().crossVectors(ref, T).normalize(); }
    else { S.addScaledVector(T, -S.dot(T)).normalize(); }
    U.crossVectors(T, S).normalize();
    for (let k = 0; k < ring; k++) {
      const ang = k / ring * Math.PI * 2;
      tmp.copy(pts[i]).addScaledVector(S, Math.cos(ang) * rx[i]).addScaledVector(U, Math.sin(ang) * ry[i]);
      P.push(tmp.x, tmp.y, tmp.z);
    }
  }
  const pv = i => new V3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
  const tri = (a, b, c, out) => {      // orient so the face normal points along `out`
    const n = new V3().subVectors(pv(b), pv(a)).cross(new V3().subVectors(pv(c), pv(a)));
    if (n.dot(out) < 0) I.push(a, c, b); else I.push(a, b, c);
  };
  for (let i = 0; i < N - 1; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = i * ring + (k + 1) % ring, c = (i + 1) * ring + k, d = (i + 1) * ring + (k + 1) % ring;
    const out = pv(a).sub(pts[i]);
    tri(a, c, b, out); tri(b, c, d, out);
  }
  if (cap) {
    for (const [i, sign] of [[0, -1], [N - 1, 1]]) {
      const ci = P.length / 3; P.push(pts[i].x, pts[i].y, pts[i].z);
      const dir = new V3().subVectors(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize().multiplyScalar(sign);
      for (let k = 0; k < ring; k++) tri(ci, i * ring + k, i * ring + (k + 1) % ring, dir);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  return g;
}
/** Canvas helper for procedural textures. fn(u, v, x, y, out[r,g,b,a]) with values 0..1. */
export function canvasTex(S, fn, { srgb = true, alpha = false, repeat = true } = {}) {
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S), d = img.data, o = [0, 0, 0, 1];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    o[3] = 1; fn(x / S, y / S, x, y, o); const i = (y * S + x) * 4;
    d[i] = clamp(o[0], 0, 1) * 255; d[i + 1] = clamp(o[1], 0, 1) * 255; d[i + 2] = clamp(o[2], 0, 1) * 255; d[i + 3] = alpha ? clamp(o[3], 0, 1) * 255 : 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Text sign texture. */
export function textTexture(lines, { w = 512, h = 128, bg = '#5b3a22', fg = '#f3e6c8', border = '#3a2414', font = 'bold 54px Georgia, serif' } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(0, Math.random() * h, w, Math.random() * 3); }
  g.strokeStyle = border; g.lineWidth = h * 0.06; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((t, i) => {
    let f = font; g.font = f;
    let size = parseInt(f.match(/(\d+)px/)[1], 10);
    while (g.measureText(t).width > w * 0.9 && size > 10) { size -= 2; f = f.replace(/\d+px/, size + 'px'); g.font = f; }
    g.fillText(t, w / 2, h * (i + 0.5) / L.length + 2);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
