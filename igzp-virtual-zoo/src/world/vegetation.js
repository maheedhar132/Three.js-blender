// Trees, shrubs, grass, flower beds, butterflies, and drifting leaf particles.
// Features hierarchical GPU vertex tree wind physics, Indian botanical varieties
// (Banyan with prop roots, Gulmohar, Date Palms, Acacia, Neem, flowering bushes),
// near/far LOD instancing, and wind-blown falling leaf particles.
import * as THREE from 'three';
import { PATHS } from '../data/zoo-layout.js';
import { toWorld } from '../config.js';
import { V3, UP, rand, rr, pick, clamp, lerp, sstep, fbm2, noise2, noise3, paint, merge, loft, limb, ellipsoid, mat4, seed, pointInPoly, insetPoly, smoothLine } from '../core/util.js';
import { NOISE_GLSL } from './terrain.js';

// ---------------- textures ----------------
function leafTex(kind) {
  const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  const leaves = (n, cols, size, spread, ry = 0.42) => {
    for (let i = 0; i < n; i++) {
      const r = Math.pow(rand(), 0.7) * spread * S / 2, a = rand() * 6.28;
      g.save(); g.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); g.rotate(rand() * 6.28);
      g.fillStyle = pick(cols); g.globalAlpha = rr(0.85, 1);
      g.beginPath(); g.ellipse(0, 0, size * rr(0.6, 1.2), size * ry * rr(0.8, 1.2), 0, 0, 6.28); g.fill(); g.restore();
    }
    g.globalAlpha = 1;
  };
  const twigs = n => { g.strokeStyle = '#4a3a28'; g.lineWidth = 1.5; for (let i = 0; i < n; i++) { const a = rand() * 6.28; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * 0.4, S / 2 + Math.sin(a) * S * 0.4); g.stroke(); } };
  const G = ['#3d5a22', '#4a6a28', '#557a2e', '#2f4a1c', '#62862f', '#45622a', '#6d8a38'];

  if (kind === 'broad') {
    twigs(10);
    leaves(320, G, 8, 0.95);
    leaves(90, ['#7e9a40', '#8aa44a'], 6, 0.8);
  } else if (kind === 'banyan') {
    twigs(12);
    // Dark glossy banyan leaves with subtle fig spots
    const BG = ['#233a14', '#2d481b', '#385822', '#1e3210', '#446828'];
    leaves(340, BG, 9, 0.96, 0.46);
    leaves(80, ['#5a7e32', '#6b923c'], 7, 0.85, 0.42);
    leaves(35, ['#b9381c', '#d24824', '#942b14'], 4, 0.75, 0.9);
  } else if (kind === 'gulmohar') {
    twigs(8);
    // Delicate bipinnate feathery leaflets
    leaves(180, ['#456d20', '#548028', '#385818', '#629230'], 6, 0.92, 0.28);
    // Intense flame of the forest petals (scarlet, orange-red, gold)
    const FG = ['#dc2626', '#ea580c', '#e11d48', '#f97316', '#b91c1c', '#fbbf24', '#f59e0b'];
    leaves(230, FG, 8, 0.90, 0.48);
  } else if (kind === 'acacia') {
    twigs(10);
    // Fine bipinnate savanna leaflets
    leaves(260, ['#476822', '#567a2c', '#3c581a', '#688e36'], 5, 0.95, 0.25);
    // Soft golden-yellow puffball blossoms
    leaves(85, ['#eab308', '#facc15', '#fde047', '#ca8a04'], 5.5, 0.85, 0.85);
  } else if (kind === 'datePalm' || kind === 'palm') {
    // Arching pinnate feather frond: central keel + leaflets
    g.strokeStyle = '#9a8a42'; g.lineWidth = 4; g.beginPath(); g.moveTo(S / 2, S); g.lineTo(S / 2, 0); g.stroke();
    for (let y = 4; y < S; y += 3) {
      const L = (S * 0.48) * Math.sin(Math.PI * (1 - y / S) * 0.93 + 0.1);
      g.strokeStyle = pick(['#456822', '#547a2a', '#669034', '#3d5c1e', '#759e3e']);
      g.lineWidth = 2.4;
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(S / 2, y);
        g.lineTo(S / 2 + s * L, y - L * 0.38);
        g.stroke();
      }
    }
  } else if (kind === 'flower') {
    twigs(8);
    leaves(200, ['#4f7a2a', '#5f8a30', '#3f6a24'], 5, 0.95, 0.3);
    leaves(180, ['#d8432a', '#e5602c', '#c9341d', '#ee8433', '#b52a1c', '#fbbf24'], 6.5, 0.88);
  } else if (kind === 'shrub') {
    leaves(220, G, 9, 0.95);
    leaves(95, ['#db2777', '#e11d48', '#f43f5e', '#be185d', '#9d174d'], 7.5, 0.88, 0.5);
  } else if (kind === 'bamboo') {
    twigs(6);
    leaves(240, ['#6f8a34', '#7d9a3a', '#5a7a2c', '#8fa548'], 13, 0.95, 0.16);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------- tree geometry ----------------
const BARK = new THREE.Color('#5a4a3c');
const barkCol = (tone = BARK) => (c, x, y, z) => { c.copy(tone).multiplyScalar(0.7 + 0.5 * noise3(x * 3, y * 1.2, z * 3)); };

/** Leaf cards scattered through crown clusters. Normals point out of the crown (soft, volumetric shading). */
function cards(clusters, count, size, crown) {
  const P = [], N = [], UV = [], I = [];
  for (let i = 0; i < count; i++) {
    const cl = clusters[i % clusters.length];
    const p = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)); if (p.lengthSq() > 1) p.normalize().multiplyScalar(rand());
    p.multiply(cl.r).add(cl.c);
    const n = new V3(rr(-1, 1), rr(-0.3, 1), rr(-1, 1)).normalize();
    const t = new V3().crossVectors(n, Math.abs(n.y) > 0.9 ? new V3(1, 0, 0) : UP).normalize(), b = new V3().crossVectors(n, t);
    const s = size * rr(0.75, 1.25), o = new V3().subVectors(p, crown).add(new V3(0, 0.6, 0)).normalize();
    const base = P.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const q = p.clone().addScaledVector(t, (u - 0.5) * s).addScaledVector(b, (v - 0.5) * s);
      P.push(q.x, q.y, q.z); N.push(o.x, o.y, o.z); UV.push(u, v);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
  return g;
}

function farGeo(clusters, trunkH, trunkR, col) {
  const parts = [];
  if (trunkH > 0) parts.push(paint(limb(new V3(0, 0, 0), new V3(0, trunkH, 0), trunkR, trunkR * 0.6, 5), BARK));
  for (const cl of clusters.slice(0, 3)) {
    const g = new THREE.IcosahedronGeometry(1, 0); g.scale(cl.r.x * 1.15, cl.r.y * 1.1, cl.r.z * 1.15); g.translate(cl.c.x, cl.c.y, cl.c.z);
    parts.push(paint(g, (c, x, y) => c.copy(col).multiplyScalar(0.75 + 0.35 * clamp((y - cl.c.y) / cl.r.y * 0.5 + 0.5, 0, 1))));
  }
  const g = merge(parts); g.computeVertexNormals(); return g;
}

/** Generic broadleaf: trunk + branches to crown clusters + leaf cards. */
function broadleaf({ trunkH, trunkR, crownY, crownR, clusters: nc, cards: ncards, cardSize, lean = 0.15, tone = BARK, farCol }) {
  const lx = rr(-lean, lean), lz = rr(-lean, lean);
  const tp = []; for (let i = 0; i <= 6; i++) { const t = i / 6; tp.push(new V3(lx * t * trunkH + Math.sin(t * 3) * 0.12, t * trunkH, lz * t * trunkH + Math.cos(t * 2.5) * 0.1)); }
  const parts = [paint(loft(tp, tp.map((_, i) => trunkR * (i === 0 ? 1.45 : 1 - i / 6 * 0.45)), tp.map((_, i) => trunkR * (i === 0 ? 1.45 : 1 - i / 6 * 0.45)), 8), barkCol(tone))];
  const top = tp[6], crown = new V3(top.x, crownY, top.z), clusters = [];
  for (let i = 0; i < nc; i++) {
    const a = i / nc * 6.28 + rr(-0.4, 0.4), r = i === 0 ? 0 : rr(0.35, 0.75);
    const c = new V3(crown.x + Math.cos(a) * crownR.x * r, crownY + rr(-0.3, 0.45) * crownR.y, crown.z + Math.sin(a) * crownR.z * r);
    clusters.push({ c, r: new V3(crownR.x * rr(0.45, 0.6), crownR.y * rr(0.5, 0.7), crownR.z * rr(0.45, 0.6)) });
    if (i > 0) {   // curved, tapering limb that ends inside its leaf cluster
      const s = top.clone().add(new V3(0, -rr(0.2, 0.8), 0)), e = c.clone().add(new V3(0, -crownR.y * 0.15, 0));
      const m1 = s.clone().lerp(e, 0.45).add(new V3(0, (e.y - s.y) * 0.35 + 0.3, 0));
      parts.push(paint(loft([s, m1, e], [trunkR * 0.42, trunkR * 0.26, trunkR * 0.1], [trunkR * 0.42, trunkR * 0.26, trunkR * 0.1], 6), barkCol(tone)));
    }
  }
  const bark = merge(parts);
  return { bark, leaves: cards(clusters, ncards, cardSize, crown), far: farGeo(clusters, trunkH, trunkR, farCol || new THREE.Color('#3f5a26')) };
}

/** Great Indian Banyan: massive fluted trunk with buttress flares, horizontal spreading limbs, and aerial prop roots. */
function banyan() {
  const parts = [];
  const trunkH = 4.2, trunkR = 0.9;
  const tone = new THREE.Color('#584c40');

  // 1. Massive fluted buttressed trunk
  const tp = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tp.push(new V3(Math.sin(t * 2.0) * 0.15, t * trunkH, Math.cos(t * 1.8) * 0.15));
  }
  const rx = tp.map((_, i) => trunkR * (i === 0 ? 1.6 : 1.15 - i / 6 * 0.35));
  const ry = tp.map((_, i) => trunkR * (i === 0 ? 1.5 : 1.10 - i / 6 * 0.35));
  parts.push(paint(loft(tp, rx, ry, 10), barkCol(tone)));

  // Buttress root flares at ground
  for (let b = 0; b < 4; b++) {
    const a = b / 4 * 6.28 + 0.4;
    const bStart = new V3(Math.cos(a) * trunkR * 1.5, 0.05, Math.sin(a) * trunkR * 1.5);
    const bMid = new V3(Math.cos(a) * trunkR * 1.1, trunkH * 0.35, Math.sin(a) * trunkR * 1.1);
    const bTop = new V3(Math.cos(a) * trunkR * 0.7, trunkH * 0.75, Math.sin(a) * trunkR * 0.7);
    parts.push(paint(loft([bStart, bMid, bTop], [0.35, 0.22, 0.12], [0.4, 0.25, 0.14], 6), barkCol(tone)));
  }

  // 2. Heavy horizontal scaffold limbs spreading outward
  const top = tp[6];
  const crown = new V3(top.x, 7.8, top.z);
  const clusters = [];
  const nLimbs = 6;

  for (let i = 0; i < nLimbs; i++) {
    const a = i / nLimbs * 6.28 + rr(-0.25, 0.25);
    const reach = rr(7.5, 10.5);
    const end = new V3(
      top.x + Math.cos(a) * reach,
      trunkH + rr(1.8, 3.2),
      top.z + Math.sin(a) * reach
    );
    const mid1 = top.clone().lerp(end, 0.35).add(new V3(0, rr(0.4, 0.9), 0));
    const mid2 = top.clone().lerp(end, 0.70).add(new V3(0, rr(-0.2, 0.5), 0));
    parts.push(paint(
      loft([top, mid1, mid2, end], [trunkR * 0.55, trunkR * 0.42, trunkR * 0.28, trunkR * 0.14], [trunkR * 0.55, trunkR * 0.42, trunkR * 0.28, trunkR * 0.14], 8),
      barkCol(tone)
    ));

    // 3. Aerial Prop Roots (pillar roots dropping vertically from limbs down to ground)
    for (const tRoot of [0.45, 0.82]) {
      const bPt = (tRoot < 0.6 ? mid1 : mid2).clone().lerp(end, (tRoot - 0.45) / 0.55);
      const groundPt = new V3(bPt.x + rr(-0.2, 0.2), 0, bPt.z + rr(-0.2, 0.2));
      const midRoot = groundPt.clone().lerp(bPt, 0.5).add(new V3(rr(-0.15, 0.15), 0, rr(-0.15, 0.15)));
      const rRadii = [0.22, 0.16, 0.12];
      parts.push(paint(loft([groundPt, midRoot, bPt], rRadii, rRadii, 6), barkCol(tone)));
    }

    clusters.push({
      c: end.clone().add(new V3(0, rr(0.5, 1.2), 0)),
      r: new V3(rr(2.6, 3.4), rr(1.8, 2.6), rr(2.6, 3.4))
    });
    clusters.push({
      c: mid2.clone().add(new V3(0, rr(0.6, 1.4), 0)),
      r: new V3(rr(2.2, 3.0), rr(1.6, 2.2), rr(2.2, 3.0))
    });
  }

  // Central crown cluster over the trunk top
  clusters.push({
    c: top.clone().add(new V3(0, 1.8, 0)),
    r: new V3(3.5, 2.5, 3.5)
  });

  const bark = merge(parts);
  const leaves = cards(clusters, 140, 2.8, crown);
  const far = farGeo(clusters.slice(0, 5), trunkH, trunkR * 1.2, new THREE.Color('#384e22'));
  return { bark, leaves, far };
}

/** Gulmohar (Royal Poinciana): wide flat-topped umbrella crown bursting with fiery orange-red blossoms. */
function gulmohar() {
  const parts = [];
  const trunkH = 3.4, trunkR = 0.32;
  const tone = new THREE.Color('#64584a');

  // Trunk with flared buttressed base
  const tp = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tp.push(new V3(Math.sin(t * 1.5) * 0.1, t * trunkH, Math.cos(t * 1.2) * 0.08));
  }
  const rx = tp.map((_, i) => trunkR * (i === 0 ? 1.5 : 1.05 - i / 6 * 0.35));
  const ry = tp.map((_, i) => trunkR * (i === 0 ? 1.5 : 1.05 - i / 6 * 0.35));
  parts.push(paint(loft(tp, rx, ry, 8), barkCol(tone)));

  const top = tp[6];
  const crownY = 6.4;
  const crown = new V3(top.x, crownY, top.z);
  const clusters = [];
  const nBranches = 8;

  for (let i = 0; i < nBranches; i++) {
    const a = i / nBranches * 6.28 + rr(-0.25, 0.25);
    const rSpread = rr(4.8, 6.8);
    const end = new V3(
      top.x + Math.cos(a) * rSpread,
      crownY + rr(-0.3, 0.4),
      top.z + Math.sin(a) * rSpread
    );
    const mid = top.clone().lerp(end, 0.45).add(new V3(0, (end.y - top.y) * 0.45 + 0.35, 0));
    parts.push(paint(
      loft([top, mid, end], [trunkR * 0.45, trunkR * 0.28, trunkR * 0.12], [trunkR * 0.45, trunkR * 0.28, trunkR * 0.12], 6),
      barkCol(tone)
    ));

    clusters.push({
      c: end.clone().add(new V3(0, rr(0.1, 0.4), 0)),
      r: new V3(rr(2.2, 3.0), rr(1.1, 1.6), rr(2.2, 3.0))
    });
  }
  clusters.push({
    c: new V3(top.x, crownY + 0.3, top.z),
    r: new V3(3.2, 1.4, 3.2)
  });

  const bark = merge(parts);
  const leaves = cards(clusters, 85, 2.7, crown);
  const far = farGeo(clusters.slice(0, 4), trunkH, trunkR, new THREE.Color('#d44320'));
  return { bark, leaves, far };
}

/** Indian Wild Date Palm: stout columnar trunk with diamond leaf scars, hanging date fruit bunches, and arching pinnate fronds. */
function datePalm() {
  const parts = [];
  const H = rr(9.5, 12.5), bend = rr(0.5, 1.2), dir = rand() * 6.28;
  const tp = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    tp.push(new V3(Math.cos(dir) * bend * t * t, t * H, Math.sin(dir) * bend * t * t));
  }
  const trunkR = 0.30;
  const ringCol = (c, x, y) => {
    const diamond = Math.sin(y * 14.0 + Math.sin(x * 12.0) * 0.6);
    c.set('#786248').multiplyScalar(0.72 + 0.38 * (diamond > 0.2 ? 0.4 : 1.0));
  };
  const trunkGeo = paint(loft(tp, tp.map((_, i) => trunkR * (i === 0 ? 1.35 : 1.0 - i * 0.02)), tp.map((_, i) => trunkR * (i === 0 ? 1.35 : 1.0 - i * 0.02)), 8), ringCol);
  parts.push(trunkGeo);

  const top = tp[9];

  // Golden date fruit bunches hanging beneath crown
  const fruitCol = new THREE.Color('#d97706');
  for (let b = 0; b < 4; b++) {
    const a = b / 4 * 6.28 + 0.3;
    const stalkStart = top.clone().add(new V3(Math.cos(a) * 0.25, -0.2, Math.sin(a) * 0.25));
    const stalkEnd = stalkStart.clone().add(new V3(Math.cos(a) * 0.65, -0.9, Math.sin(a) * 0.65));
    parts.push(paint(limb(stalkStart, stalkEnd, 0.04, 0.02, 4), (c) => c.set('#e08820')));
    const dateCluster = ellipsoid(stalkEnd.clone().add(new V3(0, -0.25, 0)), 0.28, 0.45, 0.28, 7, 5);
    parts.push(paint(dateCluster, (c) => c.copy(fruitCol).multiplyScalar(0.85 + 0.3 * rand())));
  }

  const bark = merge(parts);

  // Arching pinnate feather fronds in 3 radiating tiers (upper upright, middle arching, lower drooping)
  const P = [], N = [], UV = [], I = [];
  const nFronds = 24;
  for (let f = 0; f < nFronds; f++) {
    const a = f / nFronds * 6.28 + rr(-0.15, 0.15);
    const tier = f % 3;
    const L = rr(3.6, 4.8);
    const droop = tier === 0 ? rr(0.5, 0.8) : tier === 1 ? rr(0.8, 1.2) : rr(1.3, 1.8);
    const pitchOffset = tier === 0 ? 0.9 : tier === 1 ? 0.3 : -0.3;
    const segs = 7, base = P.length / 3;
    const out = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-out.z, 0, out.x);

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const archY = Math.sin(t * Math.PI * 0.55) * pitchOffset * 1.5 - t * t * L * 0.48 * droop;
      const c = top.clone().addScaledVector(out, t * L).add(new V3(0, archY, 0));
      const w = 0.82 * Math.sin(Math.PI * Math.min(1.0, t * 0.92 + 0.08));
      for (const s of [-1, 1]) {
        const q = c.clone().addScaledVector(side, s * w).add(new V3(0, -Math.abs(s) * w * 0.28, 0));
        P.push(q.x, q.y, q.z);
        N.push(0, 1, 0);
        UV.push(s < 0 ? 0 : 1, t);
      }
    }
    for (let i = 0; i < segs; i++) {
      const k = base + i * 2;
      I.push(k, k + 1, k + 3, k, k + 3, k + 2);
    }
  }

  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  leaves.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  leaves.setIndex(I);

  const far = farGeo([{ c: top.clone().add(new V3(0, -0.4, 0)), r: new V3(3.2, 1.2, 3.2) }], H, 0.28, new THREE.Color('#4c6b28'));
  return { bark, leaves, far };
}

/** Acacia (Umbrella Thorn / Babul): flat-topped spreading umbrella crown with dark gnarled bark and feathery leaflets. */
function acacia() {
  const parts = [];
  const trunkH = 3.2, trunkR = 0.28;
  const tone = new THREE.Color('#382d24');

  const tp = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tp.push(new V3(Math.sin(t * 2.2) * 0.22, t * trunkH, Math.cos(t * 1.7) * 0.18));
  }
  const rx = tp.map((_, i) => trunkR * (i === 0 ? 1.4 : 1.0 - i / 6 * 0.3));
  const ry = tp.map((_, i) => trunkR * (i === 0 ? 1.4 : 1.0 - i / 6 * 0.3));
  parts.push(paint(loft(tp, rx, ry, 7), barkCol(tone)));

  const top = tp[6];
  const crownY = 5.6;
  const crown = new V3(top.x, crownY, top.z);
  const clusters = [];
  const nBranches = 6;

  for (let i = 0; i < nBranches; i++) {
    const a = i / nBranches * 6.28 + rr(-0.3, 0.3);
    const rSpread = rr(4.5, 6.6);
    const end = new V3(
      top.x + Math.cos(a) * rSpread,
      crownY + rr(-0.2, 0.25),
      top.z + Math.sin(a) * rSpread
    );
    const mid1 = top.clone().lerp(end, 0.4).add(new V3(rr(-0.3, 0.3), rr(0.3, 0.7), rr(-0.3, 0.3)));
    const mid2 = top.clone().lerp(end, 0.75).add(new V3(rr(-0.2, 0.2), rr(-0.1, 0.3), rr(-0.2, 0.2)));
    parts.push(paint(
      loft([top, mid1, mid2, end], [trunkR * 0.45, trunkR * 0.32, trunkR * 0.20, trunkR * 0.10], [trunkR * 0.45, trunkR * 0.32, trunkR * 0.20, trunkR * 0.10], 6),
      barkCol(tone)
    ));

    clusters.push({
      c: end.clone().add(new V3(0, rr(0.1, 0.35), 0)),
      r: new V3(rr(2.2, 2.9), rr(0.8, 1.2), rr(2.2, 2.9))
    });
  }
  clusters.push({
    c: new V3(top.x, crownY + 0.2, top.z),
    r: new V3(2.8, 0.9, 2.8)
  });

  const bark = merge(parts);
  const leaves = cards(clusters, 68, 2.5, crown);
  const far = farGeo(clusters.slice(0, 4), trunkH, trunkR, new THREE.Color('#586e30'));
  return { bark, leaves, far };
}

function bamboo() {
  const parts = [], clusters = [], n = 16;
  for (let i = 0; i < n; i++) {
    const a = rand() * 6.28, H = rr(6, 9.5), lean = rr(0.6, 2.2), r0 = rr(0, 0.5);
    const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(new V3(Math.cos(a) * (r0 + lean * t * t), t * H, Math.sin(a) * (r0 + lean * t * t))); }
    parts.push(paint(loft(pts, pts.map(() => 0.05), pts.map(() => 0.05), 5, false), (c, x, y) => c.set('#8d9a42').multiplyScalar(0.75 + 0.35 * noise2(y * 3, a))));
    clusters.push({ c: pts[5].clone(), r: new V3(1.1, 1.4, 1.1) }, { c: pts[6].clone(), r: new V3(0.9, 0.9, 0.9) });
  }
  const bark = merge(parts);
  return { bark, leaves: cards(clusters, 70, 1.6, new V3(0, 6, 0)), far: farGeo([{ c: new V3(0, 6, 0), r: new V3(2.6, 3, 2.6) }], 0, 0, new THREE.Color('#5d7230')) };
}

function bush(size = 1, kind = 'broad') {
  const clusters = [], crown = new V3(0, 0.9 * size, 0);
  for (let i = 0; i < 4; i++) clusters.push({ c: new V3(rr(-0.7, 0.7) * size, rr(0.6, 1.2) * size, rr(-0.7, 0.7) * size), r: new V3(1.0, 0.8, 1.0).multiplyScalar(size) });
  const bark = paint(limb(new V3(0, 0, 0), new V3(0, 0.7 * size, 0), 0.06, 0.04, 4), BARK);
  const farCol = kind === 'flower' ? new THREE.Color('#9e3a24') :
                 kind === 'shrub' ? new THREE.Color('#942b5a') :
                 new THREE.Color('#3f5624');
  return { bark, leaves: cards(clusters, 28, 1.4 * size, crown), far: farGeo(clusters.slice(0, 2), 0, 0, farCol) };
}

const TYPES = {
  banyan:    { make: banyan, tex: 'banyan' },
  gulmohar:  { make: gulmohar, tex: 'gulmohar' },
  datePalm:  { make: datePalm, tex: 'datePalm' },
  acacia:    { make: acacia, tex: 'acacia' },
  neemA:     { make: () => broadleaf({ trunkH: 3.6, trunkR: 0.28, crownY: 7.0, crownR: new V3(4.4, 3.0, 4.4), clusters: 6, cards: 58, cardSize: 2.6 }), tex: 'broad' },
  neemB:     { make: () => broadleaf({ trunkH: 4.5, trunkR: 0.24, crownY: 8.0, crownR: new V3(3.4, 3.6, 3.4), clusters: 5, cards: 50, cardSize: 2.3, lean: 0.25 }), tex: 'broad' },
  rain:      { make: () => broadleaf({ trunkH: 3.0, trunkR: 0.42, crownY: 7.5, crownR: new V3(7.2, 2.8, 7.2), clusters: 9, cards: 95, cardSize: 3.0, tone: new THREE.Color('#4e4237') }), tex: 'broad' },
  eucalyptus:{ make: () => broadleaf({ trunkH: 11, trunkR: 0.22, crownY: 14, crownR: new V3(2.6, 3.8, 2.6), clusters: 4, cards: 34, cardSize: 2.1, lean: 0.06, tone: new THREE.Color('#a59c8c') }), tex: 'broad' },
  palm:      { make: datePalm, tex: 'datePalm' },
  bamboo:    { make: bamboo, tex: 'bamboo' },
  bushA:     { make: () => bush(1.0), tex: 'broad' },
  bushB:     { make: () => bush(1.5), tex: 'broad' },
  shrub:     { make: () => bush(0.9, 'shrub'), tex: 'shrub' },
  flowerBush:{ make: () => bush(1.1, 'flower'), tex: 'flower' }
};

const WEIGHTS = {
  zoo:    { neemA: 0.13, neemB: 0.10, banyan: 0.08, gulmohar: 0.12, datePalm: 0.08, acacia: 0.09, rain: 0.07, eucalyptus: 0.06, palm: 0.05, bamboo: 0.04, bushA: 0.07, bushB: 0.05, flowerBush: 0.06 },
  forest: { banyan: 0.12, neemA: 0.16, neemB: 0.14, acacia: 0.10, rain: 0.08, eucalyptus: 0.12, bamboo: 0.06, datePalm: 0.04, bushA: 0.10, bushB: 0.08 },
  water:  { bamboo: 0.22, datePalm: 0.20, palm: 0.12, neemA: 0.12, rain: 0.08, bushA: 0.12, flowerBush: 0.14 },
  enclosureOpen: { acacia: 0.30, neemA: 0.22, gulmohar: 0.14, datePalm: 0.14, rain: 0.20 },
  enclosureForest: { banyan: 0.16, neemA: 0.20, neemB: 0.18, rain: 0.15, bamboo: 0.13, bushA: 0.10, bushB: 0.08 },
};
const pickW = w => { let r = rand(), s = 0; for (const k in w) { s += w[k]; if (r <= s) return k; } return Object.keys(w)[0]; };

// ---------------- hierarchical tree wind shader ----------------
const TREE_WIND_GLSL = /* glsl */`
  vec3 ip = vec3(0.0);
  vec2 rotX = vec2(1.0, 0.0);
  vec2 rotZ = vec2(0.0, 1.0);
  #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
    float instScale = length(instanceMatrix[0].xyz);
    if (instScale > 0.001) {
      rotX = instanceMatrix[0].xz / instScale;
      rotZ = instanceMatrix[2].xz / instScale;
    }
  #endif

  // Shared park-wide directional wind field (aligned with meadow breeze)
  vec2 windDir = normalize(vec2(1.0, 0.55));
  vec2 windCross = vec2(-windDir.y, windDir.x);
  vec2 treePos = ip.xz;

  // Multi-harmonic dynamic wind wave gusts across park
  float wavePhase1 = dot(treePos, windDir) * 0.09 - uTime * 2.2;
  float wave1 = sin(wavePhase1);
  float rollSwell = wave1 * 0.5 + 0.5;
  rollSwell = rollSwell * rollSwell;

  float wavePhase2 = dot(treePos, windDir * 0.72 + windCross * 0.48) * 0.22 - uTime * 3.1 + 1.25;
  float wave2 = sin(wavePhase2);

  float wavePhase3 = dot(treePos, windDir * 0.35 - windCross * 0.80) * 0.55 - uTime * 4.4;
  float wave3 = sin(wavePhase3);

  float gust = 0.65 + 0.55 * (rollSwell * 0.52 + (wave2 * 0.5 + 0.5) * 0.30 + wave3 * 0.18);
  vec2 currentWind = windDir * gust + windCross * (wave2 * 0.20 + wave3 * 0.12);

  // a) Trunk movement: low-frequency sway scaling with height (strictly 0.0 rooted at terrain)
  float h = max(position.y, 0.0);
  float trunkFlex = pow(clamp(h / 10.0, 0.0, 2.5), 1.85);
  float trunkTime = uTime * 1.35 + dot(treePos, windDir) * 0.06;
  float trunkOsc = sin(trunkTime) * 0.72 + sin(trunkTime * 0.62 + 1.3) * 0.28;
  vec2 trunkDisp = currentWind * (trunkOsc * 0.13 + 0.06) * trunkFlex;
  float trunkDroop = dot(trunkDisp, trunkDisp) * 0.04;

  // b) Branch bending: medium-frequency sway scaling with distance from trunk axis
  float branchDist = length(position.xz);
  float branchFlex = smoothstep(0.4, 3.8, branchDist) * smoothstep(1.2, 4.5, h);
  float branchAngle = atan(position.z, position.x);
  float branchTime = uTime * 2.85 + branchAngle * 1.4 + h * 0.45;
  float branchOsc = sin(branchTime) * 0.65 + sin(branchTime * 1.35 + dot(treePos, vec2(0.25, 0.18))) * 0.35;
  vec2 branchDisp = currentWind * (branchOsc * 0.075 * branchFlex * gust);
  float branchVert = sin(branchTime * 0.95) * 0.045 * branchFlex * gust;

  // Combined world displacement for trunk and branch
  vec2 totalDispWorld = trunkDisp + branchDisp;
  float totalVertDisp = -trunkDroop + branchVert;

  // Transform world displacement into instance local space
  transformed.x += dot(totalDispWorld, rotX);
  transformed.z += dot(totalDispWorld, rotZ);
  transformed.y += totalVertDisp;
`;

function leafMaterial(tex, U, aa) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 });
  m.alphaToCoverage = aa;
  m.envMapIntensity = 0.25;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vWindShimmer;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${TREE_WIND_GLSL}
        // c) Leaf flutter: high-frequency flutter and wind shimmer on foliage vertices
        float leafSeed = dot(position.xyz, vec3(4.1, 7.3, 3.7)) + dot(treePos, vec2(1.3, 2.1));
        float leafTime = uTime * 6.5 + leafSeed;
        float flutter1 = sin(leafTime) * 0.042 * (1.0 + 0.7 * gust);
        float flutter2 = sin(leafTime * 2.15 + 0.8) * 0.024;
        float flutter3 = cos(leafTime * 3.4 + 1.4) * 0.015;

        transformed.x += (rotX.x * windCross.x + rotX.y * windCross.y) * flutter1 + flutter3;
        transformed.z += (rotZ.x * windCross.x + rotZ.y * windCross.y) * flutter1 + flutter2;
        transformed.y += flutter2 + flutter1 * 0.35;

        // Leaf wind shimmer varying for fragment shader
        vWindShimmer = clamp((rollSwell * 0.5 + 0.5) * (sin(leafTime * 1.5) * 0.5 + 0.5), 0.0, 1.0);
      `);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWindShimmer;')
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Foliage wind shimmer: sun glint through fluttering canopy leaves
        vec3 sunShimmerCol = vec3(1.0, 0.96, 0.75);
        diffuseColor.rgb += sunShimmerCol * vWindShimmer * 0.18;
      `);
  };
  m.customProgramCacheKey = () => 'leaf_wind';
  return m;
}

function createBarkMaterial(U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  m.envMapIntensity = 0.3;
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TREE_WIND_GLSL}`);
  };
  m.customProgramCacheKey = () => 'bark_wind';
  return m;
}

function createFarMaterial(U) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        vec2 windDir = normalize(vec2(1.0, 0.55));
        vec2 treePos = ip.xz;
        float wavePhase1 = dot(treePos, windDir) * 0.09 - uTime * 2.2;
        float gust = 0.7 + 0.5 * sin(wavePhase1);
        float h = max(position.y, 0.0);
        float trunkFlex = pow(clamp(h / 10.0, 0.0, 2.0), 1.8);
        float trunkTime = uTime * 1.35 + dot(treePos, windDir) * 0.06;
        float trunkOsc = sin(trunkTime) * 0.12 * trunkFlex * gust;
        transformed.x += windDir.x * trunkOsc;
        transformed.z += windDir.y * trunkOsc;
      `);
  };
  m.customProgramCacheKey = () => 'far_tree_wind';
  return m;
}

export class Vegetation {
  constructor(scene, layers, Q, U, enclosures) {
    seed(777);
    this.scene = scene; this.layers = layers; this.Q = Q;
    const texes = {
      broad: leafTex('broad'),
      banyan: leafTex('banyan'),
      gulmohar: leafTex('gulmohar'),
      acacia: leafTex('acacia'),
      datePalm: leafTex('datePalm'),
      palm: leafTex('datePalm'),
      flower: leafTex('flower'),
      shrub: leafTex('shrub'),
      bamboo: leafTex('bamboo')
    };
    const leafMats = {}; for (const k in texes) leafMats[k] = leafMaterial(texes[k], U, Q.aa);
    const depthMats = {};
    for (const k in texes) {
      const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texes[k], alphaTest: 0.42 });
      dm.onBeforeCompile = sh => {
        sh.uniforms.uTime = U.uTime;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TREE_WIND_GLSL}`);
      };
      dm.customProgramCacheKey = () => 'leaf_depth_' + k;
      depthMats[k] = dm;
    }
    const barkMat = createBarkMaterial(U);
    const barkDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    barkDepthMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${TREE_WIND_GLSL}`);
    };
    barkDepthMat.customProgramCacheKey = () => 'bark_depth_wind';
    const farMat = createFarMaterial(U);

    // ---- placement
    const items = {}; for (const k in TYPES) items[k] = [];
    const add = (type, x, z, s = rr(0.75, 1.3), tint = null) => {
      const y = layers.heightAt(x, z);
      items[type].push({ x, z, m: mat4(new V3(x, y - 0.1, z), rr(0, 6.28), s), c: tint || new THREE.Color().setHSL(rr(0.2, 0.3), rr(0.15, 0.4), rr(0.42, 0.58)).multiplyScalar(1.6) });
    };
    const excl = layers.exclusions || [];
    // sight-line corridors from each public viewing point to its enclosure centre (6 m wide)
    const corridors = enclosures.filter(en => en.view).map(en => [en.view.x, en.view.z, en.cx, en.cz]);
    const inViewCorridor = (x, z) => corridors.some(([ax, az, bx, bz]) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1); return Math.hypot(x - ax - dx * t, z - az - dz * t) < 3; });
    const blocked = (x, z, r) => { for (const e of excl) if ((x - e.x) ** 2 + (z - e.z) ** 2 < (e.r + r) ** 2) return true; return false; };
    const X0 = layers.x0 + 10, X1 = -layers.x0 - 10, Z0 = layers.z0 + 10, Z1 = -layers.z0 - 10;
    for (let z = Z0; z < Z1; z += 7) for (let x = X0; x < X1; x += 7) {
      const px = x + rr(-3, 3), pz = z + rr(-3, 3);
      const h = layers.heightAt(px, pz), forest = layers.forestness(px, pz) > 0.5 || h > 9;
      const wat = layers.water(px, pz); if (wat > 0.1) continue;
      const m = layers.maskAt(px, pz);
      if (m[2] > 0.15 || m[0] > 0.2) continue;                       // enclosure floors / roads (incl. highway)
      if (layers.nearWalk(px, pz, 3.4)) continue;
      if (blocked(px, pz, 3)) continue;
      if (layers.sample(layers.moat, px, pz) > 0.05) continue;
      if (inViewCorridor(px, pz)) continue;                            // keep sight lines to exhibits open
      const clump = fbm2(px * 0.012, pz * 0.012, 3);
      const p = (forest ? 0.6 + clump * 0.4 : 0.24 + sstep(0.4, 0.68, clump) * 0.5) * Q.trees;
      if (rand() > p) continue;
      const nearWater = layers.water(px + 8, pz) + layers.water(px - 8, pz) + layers.water(px, pz + 8) + layers.water(px, pz - 8) > 0.2;
      add(pickW(nearWater ? WEIGHTS.water : forest ? WEIGHTS.forest : WEIGHTS.zoo), px, pz);
      // understory: shrubs and young trees clustered around the canopy trees
      const nu = forest ? 0 : 1;   // forest already dense; understory where visitors see it
      for (let u = 0; u < nu; u++) if (rand() < 0.6 * Q.trees) {
        const a = rand() * 6.28, rd = rr(2.5, 5.5), ux = px + Math.cos(a) * rd, uz = pz + Math.sin(a) * rd;
        if (!layers.nearWalk(ux, uz, 2.4) && layers.water(ux, uz) < 0.1 && layers.maskAt(ux, uz)[2] < 0.15 && !blocked(ux, uz, 1) && !inViewCorridor(ux, uz)) add(rand() < 0.75 ? (rand() < 0.5 ? 'bushA' : 'bushB') : 'neemB', ux, uz, rr(0.55, 0.9));
      }
    }
    // shade trees inside enclosures (habitat dependent); remembered as shade spots for animals
    for (const en of enclosures) {
      en.shade = [];
      const area = Math.PI * en.r * en.r;
      const per = { forest: 140, primate: 260, grass: 650, dirt: 500, rock: 420, water: 900, aviary: 0, pit: 0 }[en.habitat] || 0;
      let n = per ? Math.round(area / per) : 0; if (en.habitat === 'aviary' || en.habitat === 'pit') n = 0;
      const inner = insetPoly(en.poly, 3);
      for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
        const x = en.cx + rr(-1, 1) * en.r, z = en.cz + rr(-1, 1) * en.r;
        if (!pointInPoly(x, z, inner) || layers.water(x, z) > 0.1 || inViewCorridor(x, z)) continue;
        add(pickW(en.habitat === 'forest' || en.habitat === 'primate' ? WEIGHTS.enclosureForest : WEIGHTS.enclosureOpen), x, z, rr(0.8, 1.2));
        en.shade.push([x, z]); i++;
      }
    }
    // flowering shrubs lining the walking paths, and a dense flower garden in the Butterfly Park
    for (const p of PATHS) {
      const pts = smoothLine(p.pts.map(q => toWorld(...q)), 4);
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / L, nz = (bx - ax) / L;
        for (let d = 0; d < L; d += 7) for (const s of [-1, 1]) {
          if (rand() > 0.45) continue;
          const x = ax + (bx - ax) * d / L + nx * s * rr(3.4, 4.5), z = az + (bz - az) * d / L + nz * s * rr(3.4, 4.5);
          if (layers.isWalkable(x, z) || layers.nearWalk(x, z, 2.2) || layers.water(x, z) > 0.1 || layers.maskAt(x, z)[2] > 0.15 || blocked(x, z, 1)) continue;
          add(rand() < 0.45 ? 'shrub' : (rand() < 0.5 ? 'flowerBush' : 'bushA'), x, z, rr(0.6, 0.95));
        }
      }
    }
    const [bpx, bpz] = toWorld(870, 404);
    this.garden = { x: bpx, z: bpz };
    for (let i = 0; i < 70; i++) {
      const a = rand() * 6.28, r = rr(6, 18), x = bpx + Math.cos(a) * r, z = bpz + Math.sin(a) * r;
      if (layers.nearWalk(x, z, 1.6) || layers.water(x, z) > 0.1 || blocked(x, z, 1)) continue;
      add(rand() < 0.5 ? 'flowerBush' : 'shrub', x, z, rr(0.6, 1.1));
    }

    // ---- meshes (near: detailed, shadow-casting; far: blobs)
    this.groups = [];
    for (const k in TYPES) {
      if (!items[k].length) continue;
      const geo = TYPES[k].make(), n = items[k].length;
      const nearBark = new THREE.InstancedMesh(geo.bark, barkMat, n);
      const nearLeaf = new THREE.InstancedMesh(geo.leaves, leafMats[TYPES[k].tex], n);
      const far = new THREE.InstancedMesh(geo.far, farMat, n);
      nearBark.customDepthMaterial = barkDepthMat;
      nearLeaf.customDepthMaterial = depthMats[TYPES[k].tex];
      for (const m of [nearBark, nearLeaf]) { m.castShadow = Q.shadows; m.receiveShadow = true; m.frustumCulled = false; m.count = 0; }
      far.frustumCulled = false; far.count = 0;
      items[k].forEach((it, i) => { nearLeaf.setColorAt(i, it.c); far.setColorAt(i, it.c); });
      scene.add(nearBark, nearLeaf, far);
      this.groups.push({ type: k, items: items[k], nearBark, nearLeaf, far });
    }
    this.count = Object.values(items).reduce((s, a) => s + a.length, 0);
    this.last = new V3(1e9, 0, 0);
    this._buildGrass(U, Q);
    this._buildButterflies();
    this._buildDriftingLeaves(U, Q);
  }

  /** Re-split trees into near/far instance lists when the camera has moved far enough. */
  update(camera, force = false) {
    const p = camera.position;
    if (!force && Math.hypot(p.x - this.last.x, p.z - this.last.z) < 10) return;
    this.last.copy(p);
    const R2 = this.Q.nearTrees ** 2;
    for (const g of this.groups) {
      let n = 0, f = 0;
      const nb = g.nearBark.instanceMatrix.array, nl = g.nearLeaf.instanceMatrix.array, fa = g.far.instanceMatrix.array;
      const nlc = g.nearLeaf.instanceColor.array, fc = g.far.instanceColor.array;
      for (const it of g.items) {
        const d2 = (it.x - p.x) ** 2 + (it.z - p.z) ** 2, e = it.m.elements;
        if (d2 < R2) { nb.set(e, n * 16); nl.set(e, n * 16); nlc[n * 3] = it.c.r; nlc[n * 3 + 1] = it.c.g; nlc[n * 3 + 2] = it.c.b; n++; }
        else { fa.set(e, f * 16); fc[f * 3] = it.c.r; fc[f * 3 + 1] = it.c.g; fc[f * 3 + 2] = it.c.b; f++; }
      }
      g.nearBark.count = g.nearLeaf.count = n; g.far.count = f;
      for (const m of [g.nearBark, g.nearLeaf, g.far]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
  }

  _buildGrass(U, Q) {
    const L = this.layers, T = this.terrain;
    // one instance = a tuft of 5 thin blades leaning outwards (x/z offsets baked in, y = 0..1 height factor)
    const blade = new THREE.InstancedBufferGeometry();
    const pos = [], uvs = [], idx = [];
    for (let b = 0; b < 5; b++) {
      const a = b / 5 * 6.28 + rand(), ox = Math.cos(a) * 0.07, oz = Math.sin(a) * 0.07, lean = rr(0.18, 0.38), hk = rr(0.7, 1.15), base = pos.length / 3;
      const px = -Math.sin(a), pz = Math.cos(a);
      for (let i = 0; i <= 2; i++) {
        const t = i / 2, w = 0.015 * (1 - t * 0.72);
        // Left vertex
        pos.push(ox + Math.cos(a) * lean * t * t + px * w, t * hk, oz + Math.sin(a) * lean * t * t + pz * w);
        uvs.push(0.0, t);
        // Right vertex
        pos.push(ox + Math.cos(a) * lean * t * t - px * w, t * hk, oz + Math.sin(a) * lean * t * t - pz * w);
        uvs.push(1.0, t);
      }
      // Tip vertex
      pos.push(ox + Math.cos(a) * lean * 1.25, hk * 1.14, oz + Math.sin(a) * lean * 1.25);
      uvs.push(0.5, 1.0);
      for (let i = 0; i < 2; i++) {
        const k = base + i * 2;
        idx.push(k, k + 1, k + 3, k, k + 3, k + 2);
      }
      idx.push(base + 4, base + 5, base + 6);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    blade.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    blade.setIndex(idx);
    const N = Q.grass, off = new Float32Array(N * 2), rnd = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      off[i * 2] = rand();
      off[i * 2 + 1] = rand();
      rnd[i * 2] = rand() * 6.28;
      rnd[i * 2 + 1] = rand();
    }
    blade.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
    blade.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 2));
    blade.instanceCount = N;
    this.grassUniforms = {
      uTime: U.uTime,
      uCam: { value: new THREE.Vector2() },
      uP: { value: Q.grassRange * 2 },
      uSun: { value: new V3(-0.45, 0.62, 0.38).normalize() }
    };
    this.grassBlade = blade;
  }

  /** Called once terrain textures exist. */
  attachGrass(scene, terrain) {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: /* glsl */`
        uniform float uTime, uP;
        uniform vec2 uCam, uOrigin, uSize, uGrid;
        uniform sampler2D uHeight, uMask, uWater;
        uniform vec3 uSun;
        attribute vec2 aOff, aRnd;
        varying float vH;
        varying vec3 vCol;
        varying float vAmt;
        varying float vShimmer;

        #include <fog_pars_vertex>
        ${NOISE_GLSL}

        void main() {
          // Toroidal wrap around camera
          vec2 wp = uCam + (fract(aOff - uCam / uP) - 0.5) * uP;
          vec2 luv = (wp - uOrigin) / uSize;
          vec2 huv = (luv * (uGrid - 1.0) + 0.5) / uGrid;
          float ground = texture2D(uHeight, huv).r;
          vec4 m = texture2D(uMask, luv);
          float wtr = texture2D(uWater, luv).r;

          // Masking & density checks
          float amt = (1.0 - smoothstep(0.15, 0.45, max(m.r, m.g)))
                    * (1.0 - smoothstep(0.05, 0.20, wtr))
                    * (1.0 - 0.75 * smoothstep(0.55, 0.90, m.b));
          float d = distance(wp, uCam);
          amt *= 1.0 - smoothstep(uP * 0.32, uP * 0.49, d);
          amt *= smoothstep(0.20, 0.50, vnoise(wp * 0.07) + 0.20) * (1.0 - smoothstep(8.0, 14.0, ground));

          // Blade height scaling
          float h = (0.18 + 0.26 * aRnd.y) * (0.65 + 0.75 * vnoise(wp * 0.25)) * amt;

          // Local position & tuft orientation
          vec3 p = position;
          float normH = uv.y; // 0.0 at root, 1.0 at tip
          float c = cos(aRnd.x), s = sin(aRnd.x);
          vec3 lp = vec3(p.x * c - p.z * s, p.y * h, p.x * s + p.z * c);

          // 1. Dynamic Meadow Breeze (Multi-harmonic wind waves across savanna and grasslands)
          vec2 windDir = normalize(vec2(1.0, 0.55));
          vec2 windCross = vec2(-windDir.y, windDir.x);

          // Harmonic 1: Long rolling wave swell (creates visible rolling wave crests across fields)
          float phase1 = dot(wp, windDir) * 0.11 - uTime * 2.1;
          float wave1 = sin(phase1);
          float roll1 = wave1 * 0.5 + 0.5;
          roll1 = roll1 * roll1; // sharpened rolling crest

          // Harmonic 2: Diagonal turbulent gusts
          float phase2 = dot(wp, windDir * 0.75 + windCross * 0.45) * 0.26 - uTime * 3.3 + 1.25;
          float wave2 = sin(phase2);

          // Harmonic 3: High-frequency ripple across grass tips
          float phase3 = dot(wp, windDir * 0.35 - windCross * 0.80) * 0.62 - uTime * 4.7;
          float wave3 = sin(phase3);

          // Harmonic 4: Micro blade flutter & tuft jitter
          float flutter = sin(uTime * 6.2 + aRnd.x * 4.2 + dot(wp, vec2(0.25, -0.35))) * 0.22;

          // Combined rolling gust intensity
          float waveSum = roll1 * 0.52 + (wave2 * 0.5 + 0.5) * 0.30 + wave3 * 0.18;
          float rollingGust = clamp(waveSum, 0.0, 1.0);
          float forwardPush = 0.20 + 0.55 * rollingGust + flutter * 0.10;
          float crossPush = (wave2 * 0.22 + wave3 * 0.14 + flutter * 0.12) * 0.35;
          vec2 windDisp = windDir * forwardPush + windCross * crossPush;

          // 2. Height-Dependent Sway: cantilever bending (tips bend, blade roots remain anchored)
          float bendK = pow(normH, 2.0); // strictly 0.0 at root (normH = 0)
          float swayScale = (0.30 + 0.15 * aRnd.y) * h * bendK;
          lp.x += windDisp.x * swayScale;
          lp.z += windDisp.y * swayScale;

          // Vertical tip droop under wind bending (preserves blade curvature, roots anchored)
          float dispMag = length(windDisp) * swayScale;
          lp.y -= dispMag * dispMag * 0.45 * normH;

          // World position
          vec3 world = vec3(wp.x, ground, wp.y) + lp;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          // 3. Color Gradient: earthy shaded tone at the base, vibrant sunlit gradient toward tips
          // Base: earthy dark loam/peat base (ground ambient occlusion & soil shade)
          vec3 baseDark = vec3(0.045, 0.075, 0.022);
          vec3 baseSoil = vec3(0.095, 0.068, 0.038);
          vec3 baseCol = mix(baseDark, baseSoil, smoothstep(0.35, 0.70, vnoise(wp * 0.05)));

          // Mid-blade: dry season savanna gold vs lush emerald paddock grass
          float dryNoise = vnoise(wp * 0.012) * 0.65 + vnoise(wp * 0.10) * 0.45;
          float dryK = smoothstep(0.42, 0.78, dryNoise);
          vec3 lushGreen = vec3(0.20, 0.40, 0.09);
          vec3 savannaGold = vec3(0.45, 0.40, 0.15);
          vec3 midCol = mix(lushGreen, savannaGold, dryK) * (0.85 + 0.30 * aRnd.y);

          // Tips: vibrant sunlit translucent gradient
          vec3 tipLush = vec3(0.52, 0.74, 0.17);
          vec3 tipGold = vec3(0.72, 0.66, 0.23);
          vec3 tipCol = mix(tipLush, tipGold, dryK) * (0.95 + 0.25 * aRnd.y);

          // Vertical color interpolation across blade height
          vec3 bladeCol = mix(baseCol, midCol, smoothstep(0.0, 0.40, normH));
          bladeCol = mix(bladeCol, tipCol, smoothstep(0.45, 1.0, normH));
          vCol = bladeCol;

          // 4. Wind Shimmer: dynamic specular & wave-crest sun highlight on swaying tips
          vec3 sunDir = normalize(uSun);
          vec3 bentNormal = normalize(vec3(-windDisp.x * 0.75, 1.0 - length(windDisp) * 0.45, -windDisp.y * 0.75));
          vec3 viewDirView = normalize(-mvPosition.xyz);
          vec3 sunDirView = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
          vec3 normalView = normalize((viewMatrix * vec4(bentNormal, 0.0)).xyz);
          vec3 halfView = normalize(sunDirView + viewDirView);

          float spec = max(0.0, dot(normalView, halfView));
          float shimmerSpec = pow(spec, 14.0) * 0.70;
          float waveCatch = rollingGust * max(0.0, dot(bentNormal, sunDir)) * 0.40;
          vShimmer = (shimmerSpec + waveCatch) * pow(normH, 2.2);

          vH = normH;
          vAmt = amt;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        varying float vH;
        varying vec3 vCol;
        varying float vAmt;
        varying float vShimmer;

        #include <fog_pars_fragment>

        void main() {
          if (vAmt < 0.02) discard;

          // Base color with vertical gradient from vertex shader
          vec3 col = vCol;

          // Wind shimmer: sun glint on swaying wave crest tips
          vec3 sunShimmerCol = vec3(1.0, 0.96, 0.74);
          col += sunShimmerCol * vShimmer * 0.65;

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      side: THREE.DoubleSide,
      fog: true,
    });
    mat.customProgramCacheKey = () => 'grass';
    Object.assign(mat.uniforms, this.grassUniforms, {
      uHeight: { value: terrain.heightTex },
      uMask: { value: terrain.maskTex },
      uWater: { value: terrain.waterTex },
      uOrigin: terrain.shared.uOrigin,
      uSize: terrain.shared.uSize,
      uGrid: { value: new THREE.Vector2(...terrain.grid) }
    });
    const mesh = new THREE.Mesh(this.grassBlade, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    this.grassMesh = mesh;
  }

  _buildButterflies() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.04, 0.09, 0.02, 0.06, 0.08, 0, -0.04, 0, 0, -0.04, 0, 0, 0.04, -0.09, 0.02, 0.06, -0.08, 0, -0.04, 0, 0, -0.04], 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 7, 6, 4, 6, 5]); g.computeVertexNormals();
    const N = 46, mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 }), N);
    const cols = ['#e8862a', '#f2c230', '#3a6fd0', '#f5f0e0', '#d2462a', '#2a2a2a'];
    this.flies = [];
    for (let i = 0; i < N; i++) { mesh.setColorAt(i, new THREE.Color(pick(cols))); this.flies.push({ p: new V3(this.garden.x + rr(-14, 14), 1.5, this.garden.z + rr(-14, 14)), v: new V3(), t: new V3(), ph: rand() * 6.28, timer: 0 }); }
    mesh.frustumCulled = false; this.scene.add(mesh); this.flyMesh = mesh;
  }

  /** Drifting falling leaf particles caught in the meadow breeze along wooded routes and canopies. */
  _buildDriftingLeaves(U, Q) {
    // Low-poly aerodynamic curved leaf blade geometry
    const pos = [
      0, 0, -0.10,       // 0: stem base
      -0.07, 0.02, 0.0,  // 1: left margin
      0.07, 0.02, 0.0,   // 2: right margin
      0, 0.015, 0.12,    // 3: leaf apex
      0, -0.01, 0.0      // 4: central keel
    ];
    const uvs = [0.5, 0, 0, 0.5, 1, 0.5, 0.5, 1, 0.5, 0.5];
    const idx = [
      0, 1, 4,
      0, 4, 2,
      4, 1, 3,
      4, 3, 2
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const N = 160;
    const mat = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.8,
      metalness: 0.05
    });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.frustumCulled = false;

    const leafPalette = [
      '#4d7c0f', '#65a30d', '#557a2e', // Neem & fresh broadleaf green
      '#ea580c', '#dc2626', '#f97316', // Gulmohar fiery flame petals
      '#d97706', '#b45309', '#f59e0b', // Golden dry savanna amber
      '#78350f', '#854d0e', '#92400e'  // Deep banyan ochre
    ];

    this.leafParticles = [];
    const windDir = new THREE.Vector2(1.0, 0.55).normalize();

    for (let i = 0; i < N; i++) {
      mesh.setColorAt(i, new THREE.Color(pick(leafPalette)));
      this.leafParticles.push({
        p: new V3(rr(-120, 120), 10, rr(-120, 120)),
        v: new V3(windDir.x * 2.0, -rr(0.35, 0.75), windDir.y * 2.0),
        rot: new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28),
        rotV: new V3(rr(-3.5, 3.5), rr(-2.5, 2.5), rr(-3.5, 3.5)),
        phase: rand() * 6.28,
        scale: rr(0.8, 1.3)
      });
    }

    this.scene.add(mesh);
    this.leafMesh = mesh;
  }

  animate(dt, t, camera) {
    this.grassUniforms.uCam.value.set(camera.position.x, camera.position.z);

    // Dynamic drifting leaf particles caught in meadow breeze
    if (this.leafMesh && this.leafParticles) {
      const windDir = new THREE.Vector2(1.0, 0.55).normalize();
      const windCross = new THREE.Vector2(-windDir.y, windDir.x);
      const camP = camera.position;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3();

      for (let i = 0; i < this.leafParticles.length; i++) {
        const lp = this.leafParticles[i];

        // Shared dynamic meadow wind gusting
        const phase = (lp.p.x * windDir.x + lp.p.z * windDir.y) * 0.10 - t * 2.2;
        const gust = 0.75 + 0.55 * Math.sin(phase);
        const windSpeed = 2.6 * gust;

        // Aerodynamic drift & vortex lift
        const targetVx = windDir.x * windSpeed + Math.cos(t * 3.2 + lp.phase) * 0.45;
        const targetVz = windDir.y * windSpeed + Math.sin(t * 2.8 + lp.phase) * 0.45;
        const updraft = Math.sin(t * 4.0 + lp.phase * 2.0) * 0.35 * gust;
        const targetVy = -0.52 + updraft;

        lp.v.x += (targetVx - lp.v.x) * dt * 2.5;
        lp.v.y += (targetVy - lp.v.y) * dt * 3.0;
        lp.v.z += (targetVz - lp.v.z) * dt * 2.5;

        lp.p.addScaledVector(lp.v, dt);

        // Tumbling rotation
        lp.rot.x += lp.rotV.x * dt * (0.8 + 0.5 * gust);
        lp.rot.y += lp.rotV.y * dt;
        lp.rot.z += lp.rotV.z * dt * (0.8 + 0.5 * gust);

        // Ground collision & boundary respawn upwind
        const groundY = this.layers.heightAt(lp.p.x, lp.p.z);
        const dx = lp.p.x - camP.x, dz = lp.p.z - camP.z;
        const distSq = dx * dx + dz * dz;

        if (lp.p.y < groundY + 0.05 || distSq > 65 * 65) {
          const spawnDist = rr(25, 55);
          const spread = rr(-28, 28);
          lp.p.x = camP.x - windDir.x * spawnDist - windCross.x * spread;
          lp.p.z = camP.z - windDir.y * spawnDist - windCross.y * spread;
          const gh = this.layers.heightAt(lp.p.x, lp.p.z);
          lp.p.y = gh + rr(4.0, 11.0);
          lp.v.set(windDir.x * windSpeed, -rr(0.35, 0.70), windDir.y * windSpeed);
        }

        q.setFromEuler(lp.rot);
        s.set(lp.scale, lp.scale, lp.scale);
        m.compose(lp.p, q, s);
        this.leafMesh.setMatrixAt(i, m);
      }
      this.leafMesh.instanceMatrix.needsUpdate = true;
    }

    // Butterfly fluttering in garden
    if (Math.hypot(camera.position.x - this.garden.x, camera.position.z - this.garden.z) > 160) { this.flyMesh.visible = false; return; }
    this.flyMesh.visible = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(1, 1, 1), e = new THREE.Euler();
    this.flies.forEach((f, i) => {
      f.timer -= dt;
      if (f.timer < 0) { f.t.set(this.garden.x + rr(-15, 15), 0, this.garden.z + rr(-15, 15)); f.t.y = this.layers.heightAt(f.t.x, f.t.z) + rr(0.4, 2.2); f.timer = rr(1, 4); }
      f.v.lerp(f.t.clone().sub(f.p).normalize().multiplyScalar(1.1), 1 - Math.exp(-dt * 2));
      f.p.addScaledVector(f.v, dt); f.p.y += Math.sin(t * 7 + f.ph) * 0.01;
      const flap = Math.sin(t * 22 + f.ph);
      e.set(0, Math.atan2(f.v.x, f.v.z), 0); q.setFromEuler(e);
      s.set(Math.abs(flap) * 0.9 + 0.15, 1, 1);
      m.compose(f.p, q, s); this.flyMesh.setMatrixAt(i, m);
    });
    this.flyMesh.instanceMatrix.needsUpdate = true;
  }
}
