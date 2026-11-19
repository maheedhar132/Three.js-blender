// BENGAL TIGER — quality benchmark model (approval checkpoint).
// Built procedurally (no external assets) but at a much higher standard than the other animals:
//  * anatomical skeleton: hips + chest (flexing spine), neck, head, ears, 3-segment legs, 4-segment tail
//  * heavier adult anatomy: deep rib cage, full shoulders/haunches, thick legs and broad paws
//  * more developed feline face: eye sockets, amber irises, vertical pupils, ears, cheek ruffs, muzzle, nose and whiskers
//  * irregular 3D-warped stripe shader, white underside/face zones and dark tail rings
//  * layered fur shells for a softer silhouette; for true photorealism, combine with high-resolution fur/normal maps
import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { Rig } from './models.js';
import { V3, loft, ellipsoid, clamp, sstep } from '../core/util.js';

const PART = { body: 0, head: 1, leg: 2, tail: 3, ear: 4, iris: 5, pupil: 6, nose: 7, paw: 8, cheek: 9, muzzle: 10, chin: 11, brow: 12, whisker: 13, mouth: 14, claw: 15, eyeRim: 16, earInner: 17 };

// Small helper for fine, tapered curves (whiskers, mouth lines and facial detail).
function tube(points, radius, radialSegments = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => p.isVector3 ? p : new V3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, radialSegments, false);
}

function tag(geo, part, tone = 0, fur = 1) {
  if (geo.index) geo = geo.toNonIndexed();
  const n = geo.attributes.position.count, P = new Float32Array(n), T = new Float32Array(n), F = new Float32Array(n);
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) { P[i] = part; T[i] = typeof tone === 'function' ? tone(pos.getX(i), pos.getY(i), pos.getZ(i)) : tone; F[i] = typeof fur === 'function' ? fur(pos.getX(i), pos.getY(i), pos.getZ(i)) : fur; }
  geo.setAttribute('aPart', new THREE.BufferAttribute(P, 1)); geo.setAttribute('aTone', new THREE.BufferAttribute(T, 1)); geo.setAttribute('aFur', new THREE.BufferAttribute(F, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

/** Torso cross-sections: [z, half-width, half-height, centre-y] (rump -> shoulders). */
const TORSO = [
  // [z, half-width, half-height, centre-y] — broad rib cage, deep chest and powerful hindquarters.
  [-1.02, 0.13, 0.17, 0.83], [-0.88, 0.20, 0.25, 0.84],
  [-0.64, 0.245, 0.31, 0.83], [-0.36, 0.235, 0.30, 0.82],
  [-0.06, 0.25, 0.33, 0.81], [0.25, 0.285, 0.38, 0.83],
  [0.53, 0.30, 0.40, 0.87], [0.78, 0.255, 0.35, 0.91],
  [1.00, 0.17, 0.25, 0.94]
];
function torsoAt(z) { let i = 0; while (i < TORSO.length - 2 && TORSO[i + 1][0] < z) i++; const a = TORSO[i], b = TORSO[i + 1], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1), s = t * t * (3 - 2 * t); return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s]; }

export function buildTiger(male = true) {
  const r = new Rig(), k = 1.0;   // adult tiger proportions; caller may scale the finished individual
  const S = v => v.clone().multiplyScalar(k);
  // tag first (tone functions use unscaled coordinates), then scale the tigress down
  const add = (geo, joint, part, tone, fur) => { const g = tag(geo, part, tone, fur); g.scale(k, k, k); r.parts.push({ geo: g, b: r.idx(joint) }); };
  const addBlend = (geo, fn, part, tone, fur) => { const g = tag(geo, part, tone, fur); g.scale(k, k, k); r.parts.push({ geo: g, fn: (x, y, z) => fn(x / k, y / k, z / k) }); };
  // ---------------- skeleton
  r.joint('hips', null, S(new V3(0, 0.8, -0.6))).joint('chest', 'hips', S(new V3(0, 0.84, 0.42)));
  r.joint('neck', 'chest', S(new V3(0, 0.9, 0.9))).joint('head', 'neck', S(new V3(0, 0.99, 1.13)));
  r.joint('earL', 'head', S(new V3(0.1, 1.13, 1.18))).joint('earR', 'head', S(new V3(-0.1, 1.13, 1.18)));
  const tailPts = [[0, 0.82, -1.00], [0, 0.68, -1.20], [0, 0.49, -1.42], [0, 0.34, -1.64], [0, 0.33, -1.86], [0, 0.40, -2.08]].map(a => new V3(...a));
  for (let i = 0; i < 4; i++) r.joint('tail' + (i + 1), i ? 'tail' + i : 'hips', S(tailPts[i]));
  const LEG = {
    lf: { s: 1, parent: 'chest', p: [[0.22, 0.82, 0.52], [0.23, 0.47, 0.49], [0.225, 0.13, 0.56], [0.225, 0.035, 0.68]] },
    rf: { s: -1, parent: 'chest', p: [[-0.22, 0.82, 0.52], [-0.23, 0.47, 0.49], [-0.225, 0.13, 0.56], [-0.225, 0.035, 0.68]] },
    lh: { s: 1, parent: 'hips', p: [[0.205, 0.80, -0.64], [0.225, 0.51, -0.47], [0.215, 0.235, -0.75], [0.215, 0.035, -0.67]] },
    rh: { s: -1, parent: 'hips', p: [[-0.205, 0.80, -0.64], [-0.225, 0.51, -0.47], [-0.215, 0.235, -0.75], [-0.215, 0.035, -0.67]] },
  };
  for (const [n, L] of Object.entries(LEG)) { const p = L.p.map(a => new V3(...a)); r.joint(n + '1', L.parent, S(p[0])).joint(n + '2', n + '1', S(p[1])).joint(n + '3', n + '2', S(p[2])); L.v = p; }
  // ---------------- torso (smoothly weighted between hips and chest -> the spine flexes)
  const tz = [], rx = [], ry = []; for (let i = 0; i <= 48; i++) { const z = -1.02 + i / 48 * 2.02, [w, h, y] = torsoAt(z); tz.push(new V3(0, y, z)); rx.push(w); ry.push(h); }
  const hi = r.idx('hips'), ch = r.idx('chest');
  const spineW = (x, y, z) => { const t = sstep(-0.35, 0.35, z); return [hi, 1 - t, ch, t]; };
  const bellyTone = (x, y, z) => { const [w, h, cy] = torsoAt(z); return sstep(cy - h * 0.45, cy - h * 0.95, y) * 0.95 + sstep(0.7, 0.95, z) * sstep(cy - h * 0.3, cy - h * 0.9, y) * 0.15; };
  addBlend(loft(tz, rx, ry, 28), spineW, PART.body, bellyTone, 1);
  // shoulder blades and haunches (muscle masses)
  for (const side of [-1, 1]) {
    // Subtle overlapping muscle masses create the heavy shoulder and haunch silhouette.
    add(ellipsoid(new V3(side * 0.205, 0.91, 0.48), 0.125, 0.265, 0.245, 24, 18), 'chest', PART.body, (x, y) => sstep(0.78, 0.58, y) * 0.28, 1);
    add(ellipsoid(new V3(side * 0.185, 0.77, -0.59), 0.135, 0.285, 0.235, 24, 18), 'hips', PART.body, (x, y) => sstep(0.60, 0.43, y) * 0.34, 1);
  }
  // ---------------- neck + head: broad feline skull, cheek ruff and articulated muzzle
  add(loft([new V3(0, 0.89, 0.79), new V3(0, 0.98, 0.98), new V3(0, 1.035, 1.16)], [0.18, 0.19, 0.17], [0.25, 0.245, 0.20], 22), 'neck', PART.body, (x, y, z) => sstep(0.91, 0.76, y + (z - 0.95) * 0.28) * 0.86, 1.25);

  // Main skull and tapered lower face.
  add(ellipsoid(new V3(0, 1.105, 1.255), 0.205, 0.175, 0.215, 32, 24), 'head', PART.head, 0, 1.0);
  add(ellipsoid(new V3(0, 1.035, 1.385), 0.135, 0.105, 0.135, 28, 20), 'head', PART.muzzle, 0.82, 0.55);
  add(ellipsoid(new V3(0, 1.075, 1.315), 0.128, 0.062, 0.115, 24, 16), 'head', PART.brow, 0.05, 0.7);

  for (const side of [-1, 1]) {
    // Broad cheek ruffs frame the face and make the head read as a mature tiger.
    add(ellipsoid(new V3(side * 0.145, 1.015, 1.245), 0.095, 0.135, 0.125, 24, 18), 'head', PART.cheek, 0.88, 1.1);
    add(ellipsoid(new V3(side * 0.065, 0.995, 1.445), 0.068, 0.055, 0.075, 24, 16), 'head', PART.muzzle, 1.0, 0.45);

    // Dark eye socket, warm iris, vertical feline pupil and catchlight.
    add(ellipsoid(new V3(side * 0.092, 1.105, 1.425), 0.044, 0.032, 0.022, 20, 14), 'head', PART.eyeRim, 0, 0);
    add(ellipsoid(new V3(side * 0.092, 1.105, 1.443), 0.030, 0.023, 0.012, 20, 14), 'head', PART.iris, 0, 0);
    add(ellipsoid(new V3(side * 0.092, 1.105, 1.453), 0.0065, 0.018, 0.006, 14, 10), 'head', PART.pupil, 0, 0);
    add(ellipsoid(new V3(side * 0.101, 1.116, 1.459), 0.0045, 0.0045, 0.003, 10, 8), 'head', PART.eyeRim, 1, 0);
    add(ellipsoid(new V3(side * 0.095, 1.145, 1.405), 0.051, 0.025, 0.047, 20, 12), 'head', PART.brow, 0.0, 0.75);

    // Rounded ears with dark backs and pale inner fur.
    const eg = new THREE.SphereGeometry(1, 24, 16);
    eg.scale(0.064, 0.071, 0.038); eg.rotateZ(-side * 0.18); eg.translate(side * 0.145, 1.245, 1.205);
    add(eg, side > 0 ? 'earL' : 'earR', PART.ear, 0, 0.65);
    const innerEar = new THREE.SphereGeometry(1, 18, 12);
    innerEar.scale(0.037, 0.043, 0.012); innerEar.translate(side * 0.145, 1.246, 1.239);
    add(innerEar, side > 0 ? 'earL' : 'earR', PART.earInner, 0, 0.25);

    // Fine pale whiskers; several gently diverging strands on both sides.
    add(tube([[side * 0.075, 0.995, 1.493], [side * 0.17, 1.005, 1.515], [side * 0.285, 1.035, 1.51]], 0.0022), 'head', PART.whisker, 0, 0);
    add(tube([[side * 0.080, 0.982, 1.49], [side * 0.19, 0.972, 1.505], [side * 0.30, 0.975, 1.475]], 0.0018), 'head', PART.whisker, 0, 0);
    add(tube([[side * 0.078, 0.969, 1.485], [side * 0.18, 0.935, 1.49], [side * 0.275, 0.92, 1.445]], 0.0016), 'head', PART.whisker, 0, 0);
  }

  // Nose bridge, broad nose leather, lower jaw and mouth line.
  add(loft([new V3(0, 1.105, 1.36), new V3(0, 1.045, 1.46), new V3(0, 1.015, 1.50)], [0.07, 0.060, 0.052], [0.06, 0.05, 0.04], 18), 'head', PART.head, 0.08, 0.5);
  add(ellipsoid(new V3(0, 1.012, 1.515), 0.043, 0.029, 0.025, 20, 14), 'head', PART.nose, 0, 0);
  add(ellipsoid(new V3(0, 0.935, 1.435), 0.085, 0.043, 0.075, 22, 14), 'head', PART.chin, 1, 0.55);
  add(tube([[-0.055, 0.955, 1.49], [0, 0.928, 1.505], [0.055, 0.955, 1.49]], 0.003), 'head', PART.mouth, 0, 0);
  add(tube([[0, 0.935, 1.50], [0, 0.91, 1.495]], 0.0025), 'head', PART.mouth, 0, 0);

  // ---------------- legs: thick, weight-bearing forelegs and powerful feline hindquarters
  for (const [n, L] of Object.entries(LEG)) {
    const [a, b, c, d] = L.v, front = n[1] === 'f';
    const upperX = front ? [0.135, 0.125, 0.105] : [0.145, 0.135, 0.105];
    const upperY = front ? [0.155, 0.135, 0.105] : [0.17, 0.145, 0.105];
    const lowerX = front ? [0.105, 0.092, 0.075] : [0.095, 0.085, 0.072];
    const lowerY = front ? [0.115, 0.092, 0.075] : [0.095, 0.082, 0.07];
    const tone = (x, y) => Math.min(1, (Math.abs(x) < Math.abs(a.x) - 0.045 ? 0.46 : 0) + sstep(0.28, 0.055, y) * 0.18);
    add(loft([a.clone().add(new V3(0, 0.10, 0)), a, b], upperX, upperY, 20), n + '1', PART.leg, tone, 1.05);
    add(loft([b, b.clone().lerp(c, 0.48), c], lowerX, lowerY, 18), n + '2', PART.leg, tone, 0.95);
    add(loft([c, c.clone().lerp(d, 0.55), d.clone().add(new V3(0, 0.015, -0.025))], [0.072, 0.075, 0.07], [0.075, 0.07, 0.06], 16), n + '3', PART.leg, tone, 0.82);
    // Wide paws with separate toes; the toe forms stay low and broad rather than claw-like.
    add(ellipsoid(new V3(d.x, 0.062, d.z + 0.035), 0.105, 0.062, 0.12, 22, 16), n + '3', PART.paw, 0.24, 0.55);
    for (let t = 0; t < 4; t++) {
      const tx = d.x + (t - 1.5) * 0.046;
      add(ellipsoid(new V3(tx, 0.048, d.z + 0.105 - Math.abs(t - 1.5) * 0.012), 0.029, 0.034, 0.039, 14, 10), n + '3', PART.paw, 0.28, 0.35);
      add(ellipsoid(new V3(tx, 0.035, d.z + 0.139 - Math.abs(t - 1.5) * 0.012), 0.010, 0.012, 0.023, 10, 8), n + '3', PART.claw, 0, 0);
    }
  }
  // ---------------- tail (4 bones, smoothly weighted) with rings and a black tip
  const tp = [], tr = []; for (let i = 0; i <= 30; i++) { const t = i / 30, f = t * (tailPts.length - 1), j = Math.min(tailPts.length - 2, Math.floor(f)), u = f - j; tp.push(tailPts[j].clone().lerp(tailPts[j + 1], u)); tr.push(0.060 - t * 0.021); }
  const tIdx = [1, 2, 3, 4].map(i => r.idx('tail' + i));
  const tailW = (x, y, z) => { let best = 0, bd = 1e9; tailPts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }); const b = Math.min(3, best); return [tIdx[Math.max(0, b - 1)], 0.35, tIdx[b], 0.65]; };
  addBlend(loft(tp, tr, tr, 12), tailW, PART.tail, 0, 0.8);
  const tpl = r.build();
  tpl.meta = { L: 2.08 * k, D: 0.78 * k, W: 0.62 * k, leg: 0.82 * k, bodyY0: 0.82 * k, legs: Object.keys(LEG), k, tiger: true, quality: 'adult-bengal-benchmark' };
  tpl.fam = 'tiger'; tpl.beh = 'cat';
  return tpl;
}

// ---------------------------------------------------------------- shader (shared by body + fur shells)
const TIGER_GLSL = /* glsl */`
varying vec3 vP; varying float vPart; varying float vTone; varying float vFur;
float th3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(th3(i), th3(i + vec3(1,0,0)), f.x), mix(th3(i + vec3(0,1,0)), th3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(th3(i + vec3(0,0,1)), th3(i + vec3(1,0,1)), f.x), mix(th3(i + vec3(0,1,1)), th3(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 tigerColor(vec3 p, float part, float tone){
  vec3 orangeA = vec3(0.70, 0.255, 0.055);
  vec3 orangeB = vec3(0.94, 0.47, 0.105);
  vec3 orangeC = vec3(0.82, 0.335, 0.065);
  vec3 cream = vec3(0.96, 0.91, 0.82);
  vec3 warmWhite = vec3(0.86, 0.79, 0.68);
  vec3 black = vec3(0.025, 0.020, 0.018);
  float n = tn3(p * 18.0);
  float broadNoise = tn3(p * 4.1 + 3.7);
  vec3 coat = mix(orangeA, orangeB, smoothstep(0.18, 0.88, broadNoise));
  coat = mix(coat, orangeC, smoothstep(0.68, 0.96, n) * 0.22);
  coat *= 0.94 + 0.08 * tn3(p * 38.0);
  vec3 c = mix(coat, warmWhite, smoothstep(0.50, 0.90, tone) * 0.92);
  c = mix(c, cream, smoothstep(0.83, 1.0, tone));

  // Dedicated facial and detail materials.
  if (part > 4.5 && part < 5.5) return vec3(0.92, 0.55, 0.12) * (0.86 + 0.14 * n);
  if (part > 5.5 && part < 6.5) return vec3(0.012, 0.009, 0.006);
  if (part > 6.5 && part < 7.5) return vec3(0.30, 0.12, 0.09) * (0.90 + 0.10 * n);
  if (part > 12.5 && part < 13.5) return vec3(0.91, 0.87, 0.80); // whiskers
  if (part > 13.5 && part < 14.5) return vec3(0.12, 0.045, 0.035); // mouth
  if (part > 14.5 && part < 15.5) return vec3(0.18, 0.14, 0.12); // claws
  if (part > 15.5 && part < 16.5) return mix(vec3(0.11, 0.055, 0.035), vec3(1.0, 0.94, 0.82), clamp(tone, 0.0, 1.0)); // eye rim / catchlight
  if (part > 16.5 && part < 17.5) return vec3(0.68, 0.43, 0.34); // inner ear
  if (part > 7.5 && part < 8.5) return mix(orangeC, cream, 0.34) * (0.94 + 0.06 * n);

  // White cheek ruff with broken dark facial bars.
  if (part > 8.5 && part < 9.5) {
    float cheekBar = abs(sin(p.y * 31.0 + p.z * 19.0 + tn3(p * 22.0) * 1.4));
    float barMask = (1.0 - smoothstep(0.10, 0.23, cheekBar)) * smoothstep(0.12, 0.22, abs(p.x));
    c = mix(mix(orangeC, cream, 0.63), cream, smoothstep(0.96, 1.04, p.y));
    return mix(c, black, barMask * 0.82);
  }
  if (part > 9.5 && part < 10.5) {
    float freckles = step(0.82, tn3(p * 95.0 + 2.0));
    c = cream * (0.95 + 0.05 * n);
    c = mix(c, vec3(0.12, 0.075, 0.055), freckles * 0.42);
    return c;
  }
  if (part > 10.5 && part < 11.5) return cream * (0.94 + 0.06 * n);
  if (part > 3.5 && part < 4.5) {
    float back = smoothstep(-0.005, 0.005, -(p.z - 1.205));
    float spot = 1.0 - smoothstep(0.018, 0.032, length(vec2(abs(p.x) - 0.145, p.y - 1.245)));
    return mix(vec3(0.86, 0.78, 0.67), mix(black, cream, spot), back);
  }

  // Irregular, tapered tiger striping: the phase is warped in 3D so bands
  // branch, narrow and break instead of reading as evenly spaced rings.
  float stripePhase;
  float stripeWidth = mix(0.105, 0.245, tn3(p * vec3(3.1, 4.3, 2.4) + 7.0));
  if (part > 1.5 && part < 2.5) {
    stripePhase = p.y * 4.8 + p.z * 1.35 + abs(p.x) * 2.0 + broadNoise * 1.2;
    stripeWidth *= 0.82;
  } else if (part > 2.5 && part < 3.5) {
    stripePhase = -p.z * 6.4 + p.y * 1.8 + broadNoise * 0.35;
    stripeWidth = 0.28;
  } else if (part > 0.5 && part < 1.5) {
    stripePhase = p.z * 16.0 + abs(p.x) * 24.0 + broadNoise * 1.7 + sin(p.y * 8.0) * 0.45;
    stripeWidth *= 0.72;
  } else {
    float warp = tn3(p * vec3(5.0, 7.0, 4.0) + 1.8);
    stripePhase = p.z * 6.0 + p.y * 1.0 + abs(p.x) * 2.2 + warp * 1.35 + sin(p.y * 7.0 + p.z * 3.2) * 0.34;
    stripeWidth *= mix(1.15, 0.62, smoothstep(0.50, 1.12, p.y));
  }
  float stripeDist = abs(fract(stripePhase) - 0.5) * 2.0;
  float edgeNoise = tn3(p * vec3(11.0, 17.0, 8.0) + 4.0);
  float stripe = 1.0 - smoothstep(stripeWidth + edgeNoise * 0.065, stripeWidth + 0.17, stripeDist);
  float broken = smoothstep(0.20, 0.42, tn3(p * vec3(2.2, 8.0, 2.5) + 6.0));
  stripe *= mix(0.42, 1.0, broken);
  stripe *= 1.0 - smoothstep(0.62, 0.94, tone) * 0.93;

  // Head stripes concentrate on the crown and taper toward the eyes/muzzle.
  if (part > 0.5 && part < 1.5) {
    float crown = smoothstep(1.00, 1.16, p.y) * (1.0 - smoothstep(1.30, 1.48, p.z));
    stripe *= crown;
    float cheekTear = 1.0 - smoothstep(0.035, 0.09, abs(p.x) - 0.055);
    cheekTear *= smoothstep(1.02, 1.09, p.y) * (1.0 - smoothstep(1.16, 1.34, p.z));
    stripe = max(stripe, cheekTear * 0.78);
  }
  if (part > 2.5 && part < 3.5 && p.z < -1.88) stripe = 1.0;
  return mix(c, black, clamp(stripe, 0.0, 1.0));
}`

function patch(sh, shell) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aTone; attribute float aFur;\nvarying vec3 vP; varying float vPart; varying float vTone; varying float vFur;\nuniform float uShell; uniform float uFurLen;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vP = position; vPart = aPart; vTone = aTone; vFur = aFur;
      transformed += normal * uShell * uFurLen * aFur;
      transformed.y -= uShell * uShell * uFurLen * aFur * 0.35;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uShell;\n' + TIGER_GLSL)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 tc = tigerColor(vP, vPart, vTone);
      ${shell ? `float strand = tn3(floor(vP * vec3(360.0, 520.0, 360.0))); float mask = smoothstep(0.16, 0.62, strand); if (vFur < 0.01 || mask < 0.18 + uShell * 0.46) discard; tc *= 0.88 + 0.12 * uShell;` : 'tc *= 0.96;'}
      diffuseColor.rgb = tc;`);
}

/** Materials: one base (opaque skin/coat) and N fur shells. */
export function tigerMaterials(shells = 6) {
  const make = (shell, level) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    m.envMapIntensity = 0.55;
    m.color.setRGB(1, 1, 1);
    m.side = THREE.FrontSide;
    const u = { uShell: { value: level }, uFurLen: { value: 0.018 } };
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, u); patch(sh, shell); };
    m.customProgramCacheKey = () => 'tiger' + (shell ? 's' : 'b');
    return m;
  };
  const shellCount = Math.max(0, Math.min(8, Math.floor(shells)));
  return { base: make(false, 0), shells: Array.from({ length: shellCount }, (_, i) => make(true, (i + 1) / shellCount)) };
}

// ---------------------------------------------------------------- White Bengal Tiger
const WHITE_TIGER_GLSL = /* glsl */`
varying vec3 vP; varying float vPart; varying float vTone; varying float vFur;
float th3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tn3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(th3(i), th3(i + vec3(1,0,0)), f.x), mix(th3(i + vec3(0,1,0)), th3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(th3(i + vec3(0,0,1)), th3(i + vec3(1,0,1)), f.x), mix(th3(i + vec3(0,1,1)), th3(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec3 whiteTigerColor(vec3 p, float part, float tone){
  vec3 ivory = vec3(0.96, 0.94, 0.91);
  vec3 pureWhite = vec3(1.0, 1.0, 1.0);
  vec3 cream = vec3(0.97, 0.95, 0.93);
  vec3 sepia = vec3(0.10, 0.075, 0.065);
  float n = tn3(p * 18.0);
  vec3 coat = mix(ivory, cream, smoothstep(0.2, 0.8, n));
  vec3 c = mix(coat, pureWhite, smoothstep(0.45, 0.90, tone));

  // Ice-blue sapphire eyes
  if (part > 4.5 && part < 5.5) return vec3(0.18, 0.54, 0.88);
  // Pupil
  if (part > 5.5 && part < 6.5) return vec3(0.015, 0.015, 0.015);
  // Soft pink nose leather
  if (part > 6.5 && part < 7.5) return vec3(0.94, 0.60, 0.66) * (0.92 + 0.08 * n);
  // Whiskers
  if (part > 12.5 && part < 13.5) return vec3(1.0, 1.0, 1.0);
  // Mouth
  if (part > 13.5 && part < 14.5) return vec3(0.14, 0.06, 0.05);
  // Retractable claws
  if (part > 14.5 && part < 15.5) return vec3(0.22, 0.18, 0.16);
  // Eyeliner / catchlight
  if (part > 15.5 && part < 16.5) return mix(vec3(0.06, 0.05, 0.04), vec3(1.0, 1.0, 1.0), clamp(tone, 0.0, 1.0));
  // Inner ear
  if (part > 16.5 && part < 17.5) return vec3(0.88, 0.74, 0.70);

  // Transverse sepia striping
  float broadNoise = tn3(p * 4.1 + 3.7);
  float stripePhase;
  float stripeWidth = mix(0.11, 0.22, tn3(p * vec3(3.1, 4.3, 2.4) + 7.0));
  if (part > 1.5 && part < 2.5) {
    stripePhase = p.y * 4.8 + p.z * 1.35 + abs(p.x) * 2.0 + broadNoise * 1.2;
    stripeWidth *= 0.82;
  } else if (part > 2.5 && part < 3.5) {
    stripePhase = -p.z * 6.4 + p.y * 1.8 + broadNoise * 0.35;
    stripeWidth = 0.28;
  } else if (part > 0.5 && part < 1.5) {
    stripePhase = p.z * 16.0 + abs(p.x) * 24.0 + broadNoise * 1.7 + sin(p.y * 8.0) * 0.45;
    stripeWidth *= 0.72;
  } else {
    float warp = tn3(p * vec3(5.0, 7.0, 4.0) + 1.8);
    stripePhase = p.z * 6.0 + p.y * 1.0 + abs(p.x) * 2.2 + warp * 1.35 + sin(p.y * 7.0 + p.z * 3.2) * 0.34;
    stripeWidth *= mix(1.15, 0.62, smoothstep(0.50, 1.12, p.y));
  }
  float stripeDist = abs(fract(stripePhase) - 0.5) * 2.0;
  float edgeNoise = tn3(p * vec3(11.0, 17.0, 8.0) + 4.0);
  float stripe = 1.0 - smoothstep(stripeWidth + edgeNoise * 0.065, stripeWidth + 0.17, stripeDist);
  float broken = smoothstep(0.20, 0.42, tn3(p * vec3(2.2, 8.0, 2.5) + 6.0));
  stripe *= mix(0.42, 1.0, broken);
  stripe *= 1.0 - smoothstep(0.62, 0.94, tone) * 0.93;

  if (part > 2.5 && part < 3.5 && p.z < -1.88) stripe = 1.0;
  return mix(c, sepia, clamp(stripe, 0.0, 1.0));
}`;

function patchWhiteTiger(sh, shell) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aTone; attribute float aFur;\nvarying vec3 vP; varying float vPart; varying float vTone; varying float vFur;\nuniform float uShell; uniform float uFurLen;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vP = position; vPart = aPart; vTone = aTone; vFur = aFur;
      transformed += normal * uShell * uFurLen * aFur;
      transformed.y -= uShell * uShell * uFurLen * aFur * 0.35;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uShell;\n' + WHITE_TIGER_GLSL)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 tc = whiteTigerColor(vP, vPart, vTone);
      ${shell ? `float strand = tn3(floor(vP * vec3(360.0, 520.0, 360.0))); float mask = smoothstep(0.16, 0.62, strand); if (vFur < 0.01 || mask < 0.18 + uShell * 0.46) discard; tc *= 0.92 + 0.08 * uShell;` : 'tc *= 0.98;'}
      diffuseColor.rgb = tc;`);
}

export function whiteTigerMaterials(shells = 6) {
  const make = (shell, level) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    m.envMapIntensity = 0.55;
    m.color.setRGB(1, 1, 1);
    m.side = THREE.FrontSide;
    const u = { uShell: { value: level }, uFurLen: { value: 0.018 } };
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, u); patchWhiteTiger(sh, shell); };
    m.customProgramCacheKey = () => 'wtiger' + (shell ? 's' : 'b');
    return m;
  };
  const shellCount = Math.max(0, Math.min(8, Math.floor(shells)));
  return { base: make(false, 0), shells: Array.from({ length: shellCount }, (_, i) => make(true, (i + 1) / shellCount)) };
}

export function buildWhiteTiger(male = true) {
  const tpl = buildTiger(male);
  tpl.fam = 'white_tiger';
  tpl.species = 'white_tiger';
  tpl.meta = { ...tpl.meta, whiteTiger: true, quality: 'adult-white-bengal-benchmark' };
  return tpl;
}

/**
 * Attaches rigged & animated WhiteTiger-Rigged.glb to all white tigers in the zoo.
 * Integrates Three.js AnimationMixer with 5 lifelike baked actions:
 *   - 'walk'     : 4-beat predatory low-shoulder stalking walk with dynamic speed scaling
 *   - 'standing' : Alert stance with idle breathing and tail flick
 *   - 'sitting'  : Seated haunches pose with upright spine and alert gaze
 *   - 'sleeping' : Relaxed resting posture curled on ground with slow diaphragmatic breathing
 *   - 'chuff'    : Prusten greeting vocalization with pulsed open-mouth and vibrissae flutter
 */
export async function attachWhiteTigerGLB(animals) {
  const tigers = animals.list.filter(a => a.species === 'white_tiger' || a.fam === 'white_tiger' || a.id === 'white-tiger' || (a.en && a.en.species === 'white_tiger'));
  if (!tigers.length) return [];

  const loader = new GLTFLoader();
  const URL_WHITE_TIGER_GLB = './WhiteTiger-Rigged.glb';
  let gltf;
  try {
    gltf = await loader.loadAsync(URL_WHITE_TIGER_GLB);
  } catch (err) {
    console.warn('[igzp] Could not load WhiteTiger-Rigged.glb:', err.message);
    return [];
  }

  const HEIGHT_TIGER = 1.12; // Natural adult Bengal tiger shoulder height (metres)
  const attached = [];

  for (let idx = 0; idx < tigers.length; idx++) {
    const tiger = tigers[idx];
    let model = idx === 0 ? gltf.scene : gltf.scene.clone();

    model.traverse(o => {
      if (o.isMesh) {
        if (o.name.includes('Icosphere')) {
          o.visible = false;
          return;
        }
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) {
          o.material.roughness = 0.80;
          o.material.metalness = 0.02;
          o.material.needsUpdate = true;
        }
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = (HEIGHT_TIGER / (size.y || 1)) / (tiger.k || 1);
    model.scale.setScalar(scale);
    model.rotation.y = 0; // Model faces +Z in glTF

    // Hide all procedural geometry across the entire hierarchy
    if (tiger.mesh.material) {
      tiger.mesh.material.visible = false;
    }
    const modelMeshes = new Set();
    model.traverse(c => { if (c.isMesh) modelMeshes.add(c); });
    tiger.mesh.traverse(c => {
      if (c.isMesh && !modelMeshes.has(c)) {
        c.visible = false;
      }
    });
    tiger.mesh.add(model);

    // Three.js AnimationMixer with baked animations
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) {
      const key = clip.name.toLowerCase();
      actions[key] = mixer.clipAction(clip);
    }

    const animStanding = actions['standing'] || actions['idle'] || Object.values(actions)[0];
    const animWalk = actions['walk'] || actions['walking'] || animStanding;
    const animSitting = actions['sitting'] || animStanding;
    const animSleeping = actions['sleeping'] || animSitting;
    const animChuff = actions['chuff'] || null;

    let currentAction = animStanding;
    if (currentAction) currentAction.play();

    function playAction(nextAction, fadeDur = 0.35) {
      if (!nextAction || nextAction === currentAction) return;
      if (currentAction) currentAction.fadeOut(fadeDur);
      nextAction.reset().fadeIn(fadeDur).play();
      currentAction = nextAction;
    }

    const origUpdate = tiger.update.bind(tiger);
    tiger.glb = model;
    tiger.mixer = mixer;
    tiger.actions = actions;

    tiger.update = function (dt, t, player) {
      origUpdate(dt, t, player);

      if (this.state === 'walk' || this.state === 'pace') {
        const baseWalkSpeed = this.P?.walk || 0.95;
        const curSpeed = (this.speed && this.speed > 0.05) ? this.speed : baseWalkSpeed;
        const speedRatio = Math.max(0.35, Math.min(2.0, curSpeed / baseWalkSpeed));
        if (animWalk) {
          animWalk.timeScale = speedRatio * (this.state === 'pace' ? 1.15 : 1.0);
        }
        playAction(animWalk, 0.35);
      } else if (this.state === 'rest') {
        if (this.timer > 8) {
          playAction(animSleeping, 0.6);
        } else {
          playAction(animSitting, 0.5);
        }
      } else if (this.state === 'sit') {
        playAction(animSitting, 0.4);
      } else if (this.state === 'chuff' && animChuff) {
        playAction(animChuff, 0.25);
      } else {
        // 'idle', 'alert', 'look', etc.
        // Occasional chuff greeting when visitor is close
        if (player && animChuff && currentAction === animStanding) {
          const pp = player.pos || player;   // Animals.update passes the camera position (a Vector3)
          const dPlayer = Math.hypot(this.pos.x - pp.x, this.pos.z - pp.z);
          if (dPlayer < 12 && (!this.chuffCooldown || t > this.chuffCooldown)) {
            this.chuffCooldown = t + 25.0;
            playAction(animChuff, 0.3);
            setTimeout(() => { if (currentAction === animChuff) playAction(animStanding, 0.4); }, 2000);
          }
        }
        if (currentAction !== animChuff) playAction(animStanding, 0.35);   // let a started chuff finish
      }

      mixer.update(dt);
    };

    attached.push(tiger);
  }

  console.info(`[igzp] Attached rigged & animated White Tiger GLB to ${tigers.length} tiger(s) with animations:`, Object.keys(tigers[0]?.actions || {}));
  return attached;
}
