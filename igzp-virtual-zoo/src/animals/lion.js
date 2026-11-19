// PANTHERA LEO — Ultra-Realistic African Lion & Lioness.
// Procedural big-cat benchmark featuring:
//  * Male Lion:
//    - Muscular feline body: powerful shoulders, deep thoracic ribcage, taut flank waist-tuck, and broad padded paws with separate toes and claws.
//    - Magnificent multi-layered mane (NOT a single ellipsoid donut!):
//      1. Sweeping cranial ruffs crowning the skull and sweeping over the nape.
//      2. Cheek frills flaring laterally along the jawline.
//      3. Throat beard hanging beneath the chin and along ventral neck.
//      4. Pectoral mane draping down the chest and between forelegs.
//      5. Dark ventral belly fringe along the sternum/belly between chest and hips.
//    - Sculpted facial features: squared boxy muzzle, fleshy whisker pads with follicular spots, deep glowing amber eyes with eyeliner rims & tear lines, mottled carnivore nose leather, rounded ears, and an articulated jaw with fangs and tongue for open-mouthed roaring.
//    - Long tail ending in a voluminous jet-black tuft.
//  * Female Lioness:
//    - Sleek athletic predator build, defined scapulae and muscular thighs, streamlined feline skull (no mane), warm tawny coat with cream countershading, and black-tufted tail.
//  * Volumetric fur-shell standard materials and custom GLSL shading.

import * as THREE from 'three';
import { Rig } from './models.js';
import { V3, loft, ellipsoid, clamp, sstep } from '../core/util.js';

// Lion behavioral locomotion & AI constants:
// Roar action is ultra rare (~0.015 probability, once or twice maximum in a full day cycle).
// Lions spend almost all their time resting, pacing, walking, or sleeping.
export const LION_BEHAVIOR = {
  roarFrequency: 0.015,
  walkSpeed: 0.95,
  turnSpeed: 1.5,
  states: { rest: 0.44, pace: 0.28, walk: 0.22, idle: 0.045, roar: 0.015 },
};

export const LION_PART = {
  body: 0,
  head: 1,
  leg: 2,
  tail: 3,
  ear: 4,
  iris: 5,
  pupil: 6,
  nose: 7,
  paw: 8,
  cheek: 9,
  muzzle: 10,
  chin: 11,
  brow: 12,
  whisker: 13,
  mouth: 14,
  claw: 15,
  eyeRim: 16,
  earInner: 17,
  maneCranial: 18,
  maneCheek: 19,
  maneThroat: 20,
  maneChest: 21,
  maneBelly: 22,
  tailTuft: 23,
  fang: 24,
  tongue: 25,
};

function tube(points, radius, radialSegments = 6) {
  const pts = points.map(p => (p.isVector3 ? p : new V3(...p)));
  if (THREE.CatmullRomCurve3 && THREE.TubeGeometry) {
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, Math.max(6, pts.length * 4), radius, radialSegments, false);
  }
  // Fallback to loft if TubeGeometry is not available
  const r = Array(pts.length).fill(radius);
  return loft(pts, r, r, radialSegments, true);
}

function tag(geo, part, tone = 0, fur = 1) {
  if (geo.index) geo = geo.toNonIndexed();
  const n = geo.attributes.position.count;
  const P = new Float32Array(n), T = new Float32Array(n), F = new Float32Array(n);
  const pos = geo.attributes.position;
  for (let i = 0; i < n; i++) {
    P[i] = part;
    T[i] = typeof tone === 'function' ? tone(pos.getX(i), pos.getY(i), pos.getZ(i)) : tone;
    F[i] = typeof fur === 'function' ? fur(pos.getX(i), pos.getY(i), pos.getZ(i)) : fur;
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(P, 1));
  geo.setAttribute('aTone', new THREE.BufferAttribute(T, 1));
  geo.setAttribute('aFur', new THREE.BufferAttribute(F, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  return geo;
}

// Torso cross sections: [z, half-width, half-height, centre-y] (rump -> shoulders)
const TORSO_MALE = [
  [-1.04, 0.14, 0.18, 0.84], // rump taper
  [-0.88, 0.22, 0.27, 0.85], // haunches
  [-0.64, 0.26, 0.33, 0.85], // pelvis / hips
  [-0.34, 0.22, 0.29, 0.83], // taut flank (distinct waist-tuck)
  [-0.04, 0.25, 0.35, 0.82], // mid-ribcage
  [0.26, 0.30, 0.41, 0.85],  // deep thoracic chest
  [0.55, 0.32, 0.43, 0.90],  // powerful withers / broad shoulders
  [0.80, 0.27, 0.38, 0.94],  // anterior chest
  [1.02, 0.19, 0.28, 0.97],  // neck base
];

const TORSO_FEMALE = [
  [-1.00, 0.12, 0.16, 0.83],
  [-0.86, 0.19, 0.25, 0.84],
  [-0.62, 0.23, 0.30, 0.84],
  [-0.32, 0.19, 0.25, 0.82], // tighter flank tuck
  [-0.04, 0.22, 0.31, 0.81],
  [0.24, 0.26, 0.37, 0.84],
  [0.52, 0.27, 0.39, 0.88],
  [0.76, 0.23, 0.33, 0.91],
  [0.98, 0.16, 0.24, 0.94],
];

function torsoAt(z, male = true) {
  const T = male ? TORSO_MALE : TORSO_FEMALE;
  let i = 0;
  while (i < T.length - 2 && T[i + 1][0] < z) i++;
  const a = T[i], b = T[i + 1];
  const t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t);
  return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s];
}

export function buildLion(male = true) {
  const r = new Rig();
  // Adult male lion is ~1.05 scale (220kg), lioness is ~0.94 scale (140kg)
  const k = male ? 1.05 : 0.94;
  const S = v => v.clone().multiplyScalar(k);
  const add = (geo, joint, part, tone, fur) => {
    const g = tag(geo, part, tone, fur);
    g.scale(k, k, k);
    r.parts.push({ geo: g, b: r.idx(joint) });
  };
  const addBlend = (geo, fn, part, tone, fur) => {
    const g = tag(geo, part, tone, fur);
    g.scale(k, k, k);
    r.parts.push({ geo: g, fn: (x, y, z) => fn(x / k, y / k, z / k) });
  };

  // ---------------- SKELETON
  r.joint('hips', null, S(new V3(0, 0.82, -0.62)));
  r.joint('chest', 'hips', S(new V3(0, 0.87, 0.44)));
  r.joint('neck', 'chest', S(new V3(0, 0.93, 0.92)));
  r.joint('head', 'neck', S(new V3(0, 1.04, 1.18)));
  // Articulated jaw joint for realistic open-mouthed roaring
  r.joint('jaw', 'head', S(new V3(0, 0.96, 1.30)));
  r.joint('earL', 'head', S(new V3(male ? 0.13 : 0.11, male ? 1.19 : 1.14, male ? 1.22 : 1.19)));
  r.joint('earR', 'head', S(new V3(male ? -0.13 : -0.11, male ? 1.19 : 1.14, male ? 1.22 : 1.19)));

  const tailPts = [
    [0, 0.84, -1.02],
    [0, 0.70, -1.24],
    [0, 0.48, -1.48],
    [0, 0.32, -1.72],
    [0, 0.30, -1.94],
    [0, 0.37, -2.14]
  ].map(a => new V3(...a));

  for (let i = 0; i < 4; i++) {
    r.joint('tail' + (i + 1), i ? 'tail' + i : 'hips', S(tailPts[i]));
  }

  const LEG = {
    lf: { s: 1, parent: 'chest', p: [[male ? 0.24 : 0.21, 0.85, 0.54], [male ? 0.245 : 0.215, 0.48, 0.50], [male ? 0.24 : 0.21, 0.13, 0.58], [male ? 0.24 : 0.21, 0.035, 0.70]] },
    rf: { s: -1, parent: 'chest', p: [[male ? -0.24 : -0.21, 0.85, 0.54], [male ? -0.245 : -0.215, 0.48, 0.50], [male ? -0.24 : -0.21, 0.13, 0.58], [male ? -0.24 : -0.21, 0.035, 0.70]] },
    lh: { s: 1, parent: 'hips', p: [[male ? 0.22 : 0.195, 0.82, -0.64], [male ? 0.24 : 0.21, 0.52, -0.46], [male ? 0.22 : 0.195, 0.24, -0.76], [male ? 0.22 : 0.195, 0.035, -0.68]] },
    rh: { s: -1, parent: 'hips', p: [[male ? -0.22 : -0.195, 0.82, -0.64], [male ? -0.24 : -0.21, 0.52, -0.46], [male ? -0.22 : -0.195, 0.24, -0.76], [male ? -0.22 : -0.195, 0.035, -0.68]] },
  };

  for (const [n, L] of Object.entries(LEG)) {
    const p = L.p.map(a => new V3(...a));
    r.joint(n + '1', L.parent, S(p[0]))
      .joint(n + '2', n + '1', S(p[1]))
      .joint(n + '3', n + '2', S(p[2]));
    L.v = p;
  }

  // ---------------- TORSO (Smoothly weighted between hips and chest for flexible feline spine)
  const tz = [], rx = [], ry = [];
  const zMin = male ? -1.04 : -1.00, zMax = male ? 1.02 : 0.98;
  for (let i = 0; i <= 48; i++) {
    const z = zMin + (i / 48) * (zMax - zMin);
    const [w, h, y] = torsoAt(z, male);
    tz.push(new V3(0, y, z));
    rx.push(w);
    ry.push(h);
  }

  const hi = r.idx('hips'), ch = r.idx('chest');
  const spineW = (x, y, z) => {
    const t = sstep(-0.35, 0.35, z);
    return [hi, 1 - t, ch, t];
  };

  // Countershaded belly tone (pale buff/cream underside)
  const bellyTone = (x, y, z) => {
    const [w, h, cy] = torsoAt(z, male);
    return sstep(cy - h * 0.40, cy - h * 0.95, y) * 0.95 + sstep(0.7, 0.98, z) * sstep(cy - h * 0.25, cy - h * 0.90, y) * 0.15;
  };

  addBlend(loft(tz, rx, ry, 28), spineW, LION_PART.body, bellyTone, 1.0);

  // Muscular shoulder blades (scapulae) and powerful feline haunches
  for (const side of [-1, 1]) {
    if (male) {
      // Powerful male shoulders with high withers
      add(ellipsoid(new V3(side * 0.21, 0.93, 0.50), 0.13, 0.28, 0.25, 24, 18), 'chest', LION_PART.body, (x, y) => sstep(0.80, 0.60, y) * 0.3, 1.0);
      // Heavy male haunches
      add(ellipsoid(new V3(side * 0.19, 0.79, -0.60), 0.14, 0.29, 0.24, 24, 18), 'hips', LION_PART.body, (x, y) => sstep(0.62, 0.44, y) * 0.35, 1.0);
    } else {
      // Sleek athletic lioness shoulders
      add(ellipsoid(new V3(side * 0.18, 0.90, 0.48), 0.11, 0.25, 0.22, 24, 18), 'chest', LION_PART.body, (x, y) => sstep(0.78, 0.58, y) * 0.3, 1.0);
      // Muscular predator thighs
      add(ellipsoid(new V3(side * 0.16, 0.77, -0.58), 0.12, 0.26, 0.22, 24, 18), 'hips', LION_PART.body, (x, y) => sstep(0.60, 0.42, y) * 0.35, 1.0);
    }
  }

  // ---------------- NECK
  if (male) {
    add(loft([new V3(0, 0.91, 0.81), new V3(0, 1.01, 1.01), new V3(0, 1.06, 1.20)], [0.20, 0.21, 0.19], [0.27, 0.26, 0.22], 22), 'neck', LION_PART.body, (x, y, z) => sstep(0.92, 0.75, y + (z - 0.95) * 0.28) * 0.88, 1.3);
  } else {
    // Sleek, muscular female neck
    add(loft([new V3(0, 0.88, 0.78), new V3(0, 0.97, 0.97), new V3(0, 1.02, 1.15)], [0.16, 0.17, 0.15], [0.22, 0.21, 0.18], 22), 'neck', LION_PART.body, (x, y, z) => sstep(0.89, 0.74, y + (z - 0.92) * 0.28) * 0.88, 1.0);
  }

  // ---------------- HEAD & SCULPTED FACIAL FEATURES
  // Cranial skull: broad, slightly flattened top with prominent zygomatic arches
  const skullPos = male ? new V3(0, 1.13, 1.28) : new V3(0, 1.08, 1.24);
  const skullW = male ? 0.21 : 0.17, skullH = male ? 0.18 : 0.15, skullL = male ? 0.22 : 0.19;
  add(ellipsoid(skullPos, skullW, skullH, skullL, 32, 24), 'head', LION_PART.head, 0, 1.0);

  // Heavy supraorbital brow arches giving the intense lion gaze
  const browPos = male ? new V3(0, 1.11, 1.35) : new V3(0, 1.06, 1.30);
  add(ellipsoid(browPos, male ? 0.14 : 0.12, male ? 0.07 : 0.06, male ? 0.12 : 0.10, 24, 16), 'head', LION_PART.brow, 0.05, 0.7);

  // Squared, powerful feline muzzle
  const muzzlePts = male
    ? [new V3(0, 1.11, 1.38), new V3(0, 1.05, 1.50), new V3(0, 1.02, 1.56)]
    : [new V3(0, 1.06, 1.33), new V3(0, 1.01, 1.44), new V3(0, 0.98, 1.50)];
  const mRx = male ? [0.095, 0.088, 0.078] : [0.078, 0.072, 0.064];
  const mRy = male ? [0.085, 0.075, 0.065] : [0.070, 0.062, 0.054];
  add(loft(muzzlePts, mRx, mRy, 20), 'head', LION_PART.muzzle, 0.85, 0.5);

  // Mottled carnivore nose leather with flared nostrils
  const nosePos = male ? new V3(0, 1.035, 1.575) : new V3(0, 0.995, 1.515);
  add(ellipsoid(nosePos, male ? 0.048 : 0.040, male ? 0.032 : 0.026, male ? 0.028 : 0.024, 20, 14), 'head', LION_PART.nose, 0, 0);

  // Bilateral facial features: eyes, whisker pads, ears, whiskers, fangs
  for (const side of [-1, 1]) {
    // Fleshy whisker pads with follicular spots
    const wpPos = male ? new V3(side * 0.075, 1.015, 1.505) : new V3(side * 0.062, 0.98, 1.45);
    add(ellipsoid(wpPos, male ? 0.072 : 0.060, male ? 0.058 : 0.048, male ? 0.082 : 0.070, 24, 16), 'head', LION_PART.muzzle, 1.0, 0.45);

    // Deep amber eyes with black eyeliner rim and anterior tear line
    const eyeX = side * (male ? 0.102 : 0.088);
    const eyeY = male ? 1.125 : 1.075;
    const eyeZ = male ? 1.45 : 1.39;
    // Eye socket / eyeliner rim
    add(ellipsoid(new V3(eyeX, eyeY, eyeZ), 0.046, 0.034, 0.024, 20, 14), 'head', LION_PART.eyeRim, 0, 0);
    // Glowing warm amber iris
    add(ellipsoid(new V3(eyeX, eyeY, eyeZ + 0.018), 0.032, 0.025, 0.013, 20, 14), 'head', LION_PART.iris, 0, 0);
    // Black pupil
    add(ellipsoid(new V3(eyeX, eyeY, eyeZ + 0.028), 0.009, 0.018, 0.007, 14, 10), 'head', LION_PART.pupil, 0, 0);
    // Specular catchlight
    add(ellipsoid(new V3(eyeX + side * 0.009, eyeY + 0.010, eyeZ + 0.034), 0.005, 0.005, 0.003, 10, 8), 'head', LION_PART.eyeRim, 1, 0);
    // Brow ridge shadow over eye
    add(ellipsoid(new V3(eyeX, eyeY + 0.042, eyeZ - 0.02), 0.054, 0.028, 0.050, 20, 12), 'head', LION_PART.brow, 0.0, 0.75);

    // Rounded feline ears with dark velvety backs and pale inner fur
    const earX = side * (male ? 0.155 : 0.135);
    const earY = male ? 1.27 : 1.21;
    const earZ = male ? 1.23 : 1.19;
    const eg = new THREE.SphereGeometry(1, 24, 16);
    eg.scale(male ? 0.068 : 0.058, male ? 0.075 : 0.065, male ? 0.038 : 0.032);
    eg.rotateZ(-side * 0.22);
    eg.translate(earX, earY, earZ);
    add(eg, side > 0 ? 'earL' : 'earR', LION_PART.ear, 0, 0.65);

    const innerEar = new THREE.SphereGeometry(1, 18, 12);
    innerEar.scale(male ? 0.040 : 0.034, male ? 0.046 : 0.039, male ? 0.014 : 0.012);
    innerEar.translate(earX, earY + 0.002, earZ + 0.032);
    add(innerEar, side > 0 ? 'earL' : 'earR', LION_PART.earInner, 0, 0.35);

    // Fine divergent vibrissae (whiskers)
    const wz = male ? 1.54 : 1.48;
    const wy = male ? 1.02 : 0.98;
    const wx = side * (male ? 0.082 : 0.068);
    add(tube([[wx, wy, wz], [side * (male ? 0.18 : 0.15), wy + 0.01, wz + 0.02], [side * (male ? 0.30 : 0.26), wy + 0.03, wz - 0.01]], 0.0024), 'head', LION_PART.whisker, 0, 0);
    add(tube([[wx, wy - 0.015, wz - 0.005], [side * (male ? 0.20 : 0.17), wy - 0.03, wz + 0.01], [side * (male ? 0.32 : 0.28), wy - 0.04, wz - 0.03]], 0.0020), 'head', LION_PART.whisker, 0, 0);
    add(tube([[wx, wy - 0.030, wz - 0.010], [side * (male ? 0.19 : 0.16), wy - 0.06, wz], [side * (male ? 0.29 : 0.25), wy - 0.08, wz - 0.05]], 0.0017), 'head', LION_PART.whisker, 0, 0);

    // Upper long canine fangs (attached to maxilla on head)
    const uFangX = side * (male ? 0.050 : 0.042);
    const uFangY = male ? 1.025 : 0.985;
    const uFangZ = male ? 1.52 : 1.46;
    add(tube([[uFangX, uFangY, uFangZ], [uFangX * 1.05, uFangY - (male ? 0.048 : 0.040), uFangZ - 0.005]], 0.0048), 'head', LION_PART.fang, 0, 0);

    // Lower canine fangs (attached to mandible on jaw)
    const lFangX = side * (male ? 0.046 : 0.038);
    const lFangY = male ? 0.96 : 0.92;
    const lFangZ = male ? 1.525 : 1.465;
    add(tube([[lFangX, lFangY, lFangZ], [lFangX * 1.05, lFangY + (male ? 0.042 : 0.035), lFangZ - 0.005]], 0.0044), 'jaw', LION_PART.fang, 0, 0);
  }

  // ---------------- ARTICULATED JAW, MOUTH, CHIN, AND TONGUE
  // Mandible (chin) bound to jaw joint: rotates down during roar!
  const chinPos = male ? new V3(0, 0.945, 1.48) : new V3(0, 0.905, 1.42);
  add(ellipsoid(chinPos, male ? 0.088 : 0.075, male ? 0.048 : 0.040, male ? 0.082 : 0.070, 22, 14), 'jaw', LION_PART.chin, 1.0, 0.55);

  // Lower lip line
  const lipY = male ? 0.965 : 0.925;
  const lipZ = male ? 1.535 : 1.475;
  const lipW = male ? 0.058 : 0.048;
  add(tube([[-lipW, lipY, lipZ], [0, lipY - 0.025, lipZ + 0.020], [lipW, lipY, lipZ]], 0.0034), 'jaw', LION_PART.mouth, 0, 0);

  // Tongue inside lower jaw
  const tonguePos = male ? new V3(0, 0.965, 1.45) : new V3(0, 0.925, 1.39);
  add(ellipsoid(tonguePos, male ? 0.038 : 0.032, male ? 0.015 : 0.012, male ? 0.055 : 0.045, 16, 10), 'jaw', LION_PART.tongue, 0, 0);

  // Upper mouth line (roof of mouth and upper lip line)
  const uLipY = male ? 1.015 : 0.975;
  const uLipZ = male ? 1.545 : 1.485;
  add(tube([[-lipW, uLipY, uLipZ], [0, uLipY + 0.015, uLipZ + 0.020], [lipW, uLipY, uLipZ]], 0.0034), 'head', LION_PART.mouth, 0, 0);

  // ---------------- MAGNIFICENT MULTI-LAYERED MANE (Male Lion Only!)
  if (male) {
    // 1. Sweeping Cranial Ruffs: crowns forehead and curves back over skull and dorsal nape
    // Upper crown ruff
    add(loft([new V3(0, 1.24, 1.26), new V3(0, 1.28, 1.12), new V3(0, 1.25, 0.96)], [0.19, 0.23, 0.26], [0.13, 0.17, 0.19], 22), 'head', LION_PART.maneCranial, 0.15, 2.8);
    // Cranial swept wings past ears
    for (const side of [-1, 1]) {
      add(ellipsoid(new V3(side * 0.18, 1.21, 1.15), 0.14, 0.18, 0.22, 22, 16), 'head', LION_PART.maneCranial, 0.20, 2.7);
    }
    // Dorsal nape crest extending back along neck
    add(loft([new V3(0, 1.23, 0.98), new V3(0, 1.19, 0.80), new V3(0, 1.13, 0.62)], [0.23, 0.27, 0.29], [0.17, 0.21, 0.23], 22), 'neck', LION_PART.maneCranial, 0.35, 2.9);

    // 2. Cheek Frills: flaring outward and downward from jawline and cheeks
    for (const side of [-1, 1]) {
      // Upper cheek flare
      add(ellipsoid(new V3(side * 0.21, 1.05, 1.26), 0.12, 0.17, 0.16, 22, 16), 'head', LION_PART.maneCheek, 0.40, 2.6);
      // Lower jawline flare
      add(ellipsoid(new V3(side * 0.19, 0.94, 1.34), 0.11, 0.15, 0.15, 20, 14), 'head', LION_PART.maneCheek, 0.45, 2.6);
    }

    // 3. Throat Beard: dense hanging fur mass beneath chin and along ventral neck
    // Submandibular chin beard
    add(ellipsoid(new V3(0, 0.88, 1.38), 0.12, 0.15, 0.16, 22, 16), 'neck', LION_PART.maneThroat, 0.50, 2.7);
    // Ventral throat mantle
    add(loft([new V3(0, 0.86, 1.32), new V3(0, 0.77, 1.10), new V3(0, 0.71, 0.88)], [0.15, 0.19, 0.22], [0.16, 0.20, 0.23], 22), 'neck', LION_PART.maneThroat, 0.60, 2.8);

    // 4. Pectoral Mane: massive chest mantle draping down shoulders and between forelegs
    // Front chest drapery
    add(loft([new V3(0, 0.88, 0.82), new V3(0, 0.75, 0.60), new V3(0, 0.57, 0.44)], [0.25, 0.29, 0.27], [0.21, 0.25, 0.23], 24), 'chest', LION_PART.maneChest, 0.75, 3.0);
    // Lateral shoulder mantles
    for (const side of [-1, 1]) {
      add(ellipsoid(new V3(side * 0.24, 0.88, 0.52), 0.15, 0.26, 0.25, 22, 16), 'chest', LION_PART.maneChest, 0.65, 2.8);
    }
    // Inter-limb ventral apron
    add(ellipsoid(new V3(0, 0.52, 0.50), 0.18, 0.21, 0.27, 22, 16), 'chest', LION_PART.maneChest, 0.80, 2.9);

    // 5. Dark Ventral Belly Fringe: mature pride male dark fringe extending back along belly
    const bellyFringeGeo = loft([new V3(0, 0.52, 0.42), new V3(0, 0.49, 0.08), new V3(0, 0.52, -0.24)], [0.14, 0.13, 0.09], [0.12, 0.10, 0.08], 20);
    addBlend(bellyFringeGeo, spineW, LION_PART.maneBelly, 0.95, 2.5);
  }

  // ---------------- LEGS & BROAD PADDED PAWS
  for (const [n, L] of Object.entries(LEG)) {
    const [a, b, c, d] = L.v, front = n[1] === 'f';
    const upperX = front ? (male ? [0.145, 0.135, 0.115] : [0.125, 0.115, 0.095]) : (male ? [0.155, 0.145, 0.115] : [0.135, 0.125, 0.095]);
    const upperY = front ? (male ? [0.165, 0.145, 0.115] : [0.145, 0.125, 0.095]) : (male ? [0.180, 0.155, 0.115] : [0.155, 0.135, 0.095]);
    const lowerX = front ? (male ? [0.115, 0.100, 0.082] : [0.095, 0.082, 0.068]) : (male ? [0.105, 0.092, 0.078] : [0.088, 0.078, 0.065]);
    const lowerY = front ? (male ? [0.125, 0.100, 0.082] : [0.105, 0.082, 0.068]) : (male ? [0.105, 0.090, 0.076] : [0.088, 0.076, 0.065]);

    const legTone = (x, y) => Math.min(1, (Math.abs(x) < Math.abs(a.x) - 0.045 ? 0.50 : 0) + sstep(0.30, 0.055, y) * 0.20);

    add(loft([a.clone().add(new V3(0, 0.10, 0)), a, b], upperX, upperY, 20), n + '1', LION_PART.leg, legTone, 1.05);
    add(loft([b, b.clone().lerp(c, 0.48), c], lowerX, lowerY, 18), n + '2', LION_PART.leg, legTone, 0.95);
    add(loft([c, c.clone().lerp(d, 0.55), d.clone().add(new V3(0, 0.015, -0.025))], [0.078, 0.080, 0.075], [0.080, 0.075, 0.065], 16), n + '3', LION_PART.leg, legTone, 0.82);

    // Broad padded feline paws
    add(ellipsoid(new V3(d.x, 0.064, d.z + 0.038), male ? 0.115 : 0.095, 0.065, male ? 0.128 : 0.108, 22, 16), n + '3', LION_PART.paw, 0.25, 0.55);

    // 4 separate digital toe pads with retractile claws
    for (let t = 0; t < 4; t++) {
      const tx = d.x + (t - 1.5) * (male ? 0.048 : 0.040);
      const tzOffset = d.z + 0.11 - Math.abs(t - 1.5) * 0.012;
      // Toe pad
      add(ellipsoid(new V3(tx, 0.050, tzOffset), male ? 0.031 : 0.026, male ? 0.036 : 0.030, male ? 0.042 : 0.035, 14, 10), n + '3', LION_PART.paw, 0.30, 0.35);
      // Retractile claw tip
      add(ellipsoid(new V3(tx, 0.036, tzOffset + 0.035), 0.010, 0.013, 0.024, 10, 8), n + '3', LION_PART.claw, 0, 0);
    }
  }

  // ---------------- TAIL WITH VOLUMINOUS BLACK TUFT
  const tp = [], tr = [];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const f = t * (tailPts.length - 1);
    const j = Math.min(tailPts.length - 2, Math.floor(f));
    const u = f - j;
    tp.push(tailPts[j].clone().lerp(tailPts[j + 1], u));
    tr.push(0.062 - t * 0.023);
  }

  const tIdx = [1, 2, 3, 4].map(i => r.idx('tail' + i));
  const tailW = (x, y, z) => {
    let best = 0, bd = 1e9;
    tailPts.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    const b = Math.min(3, best);
    return [tIdx[Math.max(0, b - 1)], 0.35, tIdx[b], 0.65];
  };

  addBlend(loft(tp, tr, tr, 12), tailW, LION_PART.tail, 0, 0.8);

  // Voluminous jet-black tail tuft at the tip of tail4
  const lastTailPt = tailPts[tailPts.length - 1];
  const tuftGeo = ellipsoid(lastTailPt.clone().add(new V3(0, 0.04, -0.04)), male ? 0.078 : 0.064, male ? 0.082 : 0.068, male ? 0.135 : 0.110, 20, 16);
  add(tuftGeo, 'tail4', LION_PART.tailTuft, 0, 2.6);

  const tpl = r.build();
  tpl.meta = {
    L: (male ? 2.15 : 1.95) * k,
    D: (male ? 0.82 : 0.72) * k,
    W: (male ? 0.68 : 0.58) * k,
    leg: (male ? 0.84 : 0.78) * k,
    bodyY0: (male ? 0.84 : 0.78) * k,
    legs: Object.keys(LEG),
    k,
    lion: true,
    male,
    quality: 'ultra-realistic-panthera-leo'
  };
  tpl.fam = 'lion';
  tpl.beh = 'lion';
  return tpl;
}

// ---------------------------------------------------------------- SHADER & MATERIALS
const LION_GLSL = /* glsl */`
varying vec3 vP; varying float vPart; varying float vTone; varying float vFur;
uniform float uIsMale;

float th3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float tn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(th3(i), th3(i + vec3(1,0,0)), f.x), mix(th3(i + vec3(0,1,0)), th3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(th3(i + vec3(0,0,1)), th3(i + vec3(1,0,1)), f.x), mix(th3(i + vec3(0,1,1)), th3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 lionColor(vec3 p, float part, float tone, float isMale){
  // Authentic African lion palette: rich golden tawny coat with warm cream underside
  vec3 tawnyA = vec3(0.78, 0.54, 0.28);  // warm golden amber
  vec3 tawnyB = vec3(0.88, 0.64, 0.36);  // sunlit buff
  vec3 tawnyC = vec3(0.68, 0.44, 0.22);  // deeper ochre
  vec3 cream  = vec3(0.95, 0.91, 0.82);  // warm cream belly / chin / muzzle
  vec3 darkMane = vec3(0.12, 0.07, 0.04); // deep dark chestnut / charcoal
  vec3 black = vec3(0.025, 0.020, 0.018);

  // Multi-frequency noise for organic coat grain
  float n = tn3(p * 16.0);
  float broad = tn3(p * 3.8 + 2.5);
  vec3 coat = mix(tawnyA, tawnyB, smoothstep(0.25, 0.85, broad));
  coat = mix(coat, tawnyC, smoothstep(0.65, 0.95, n) * 0.25);
  coat *= 0.94 + 0.08 * tn3(p * 36.0);

  // Countershading transition to cream underside
  vec3 c = mix(coat, cream, smoothstep(0.48, 0.88, tone));

  // Dedicated facial & anatomical materials
  // Glowing amber iris with radiant depth
  if (part > 4.5 && part < 5.5) {
    float irisRing = length(p.xy - vec2(p.x > 0.0 ? 0.102 : -0.102, 1.125));
    return mix(vec3(0.96, 0.65, 0.14), vec3(0.82, 0.45, 0.08), smoothstep(0.01, 0.035, irisRing)) * (0.92 + 0.08 * n);
  }
  // Black pupil
  if (part > 5.5 && part < 6.5) return vec3(0.012, 0.009, 0.006);
  // Eye rim / eyeliner (distinct dark outline and tear line)
  if (part > 15.5 && part < 16.5) return mix(black, cream, clamp(tone, 0.0, 1.0));
  // Mottled carnivore nose leather
  if (part > 6.5 && part < 7.5) {
    float mottling = smoothstep(0.45, 0.75, tn3(p * 80.0));
    return mix(vec3(0.44, 0.28, 0.26), vec3(0.18, 0.14, 0.13), mottling) * (0.92 + 0.08 * n);
  }
  // Whisker pads (cream with follicular spots)
  if (part > 9.5 && part < 10.5) {
    float freckles = step(0.80, tn3(p * 90.0 + 3.0));
    return mix(cream * (0.95 + 0.05 * n), vec3(0.12, 0.08, 0.06), freckles * 0.55);
  }
  // Chin & lower jaw
  if (part > 10.5 && part < 11.5) return cream * (0.94 + 0.06 * n);
  // Whiskers
  if (part > 12.5 && part < 13.5) return vec3(0.92, 0.89, 0.82);
  // Mouth interior / lips
  if (part > 13.5 && part < 14.5) return vec3(0.14, 0.05, 0.04);
  // Fangs / canines (ivory)
  if (part > 23.5 && part < 24.5) return vec3(0.94, 0.92, 0.84);
  // Tongue (carnivore pink)
  if (part > 24.5 && part < 25.5) return vec3(0.68, 0.25, 0.28) * (0.95 + 0.05 * n);
  // Claws
  if (part > 14.5 && part < 15.5) return vec3(0.18, 0.14, 0.12);
  // Paw plantar pads
  if (part > 7.5 && part < 8.5) return mix(tawnyC, vec3(0.22, 0.16, 0.14), smoothstep(0.06, 0.02, p.y));
  // Ear backs (black patch on outer surface)
  if (part > 3.5 && part < 4.5) {
    float back = smoothstep(-0.005, 0.005, -(p.z - 1.23));
    return mix(tawnyB, black, back * 0.92);
  }
  // Inner ear
  if (part > 16.5 && part < 17.5) return vec3(0.72, 0.52, 0.40);
  // Voluminous tail tuft (full black)
  if (part > 22.5 && part < 23.5) return black;

  // MULTI-LAYERED MANE (Male Lion):
  // 1. Cranial ruffs: golden ochre at forehead to deep chestnut at nape
  if (part > 17.5 && part < 18.5) {
    float nape = smoothstep(1.20, 0.70, p.z);
    vec3 maneGold = mix(tawnyC, vec3(0.48, 0.28, 0.12), broad);
    return mix(maneGold, darkMane, nape * 0.75) * (0.90 + 0.10 * n);
  }
  // 2. Cheek frills: warm tawny-gold tips, dark roots
  if (part > 18.5 && part < 19.5) {
    return mix(darkMane, tawnyB, smoothstep(0.14, 0.24, abs(p.x))) * (0.92 + 0.08 * n);
  }
  // 3. Throat beard: chestnut to dark umber
  if (part > 19.5 && part < 20.5) {
    return mix(vec3(0.38, 0.22, 0.11), darkMane, smoothstep(1.30, 0.90, p.z)) * (0.90 + 0.10 * n);
  }
  // 4. Pectoral mane: deep chocolate to charcoal
  if (part > 20.5 && part < 21.5) {
    return mix(vec3(0.28, 0.16, 0.09), darkMane, smoothstep(0.85, 0.50, p.y)) * (0.90 + 0.10 * n);
  }
  // 5. Ventral belly fringe: dark charcoal / black
  if (part > 21.5 && part < 22.5) {
    return mix(darkMane, black, 0.65) * (0.88 + 0.12 * n);
  }

  return c;
}
`;

function patchLion(sh, shell, isMale) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aTone; attribute float aFur;\nvarying vec3 vP; varying float vPart; varying float vTone; varying float vFur;\nuniform float uShell; uniform float uFurLen; uniform float uIsMale;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vP = position; vPart = aPart; vTone = aTone; vFur = aFur;
      transformed += normal * uShell * uFurLen * aFur;
      transformed.y -= uShell * uShell * uFurLen * aFur * 0.35;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uShell;\n' + LION_GLSL)   // LION_GLSL declares uIsMale itself
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 tc = lionColor(vP, vPart, vTone, uIsMale);
      ${shell
        ? `float strand = tn3(floor(vP * vec3(360.0, 520.0, 360.0))); float mask = smoothstep(0.16, 0.62, strand); if (vFur < 0.01 || mask < 0.18 + uShell * 0.46) discard; tc *= mix(0.72, 1.04, uShell);`
        : 'tc *= 0.96;'}
      diffuseColor.rgb = tc;`);
}

/** Materials: one base (opaque coat) and N fur shells. */
export function lionMaterials(shells = 6, isMale = true) {
  const make = (shell, level) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    m.envMapIntensity = 0.55;
    if (m.color && m.color.setRGB) m.color.setRGB(1, 1, 1);
    m.side = THREE.FrontSide;
    const u = {
      uShell: { value: level },
      uFurLen: { value: isMale ? 0.024 : 0.016 },
      uIsMale: { value: isMale ? 1.0 : 0.0 },
    };
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      patchLion(sh, shell, isMale);
    };
    m.customProgramCacheKey = () => 'lion' + (isMale ? 'm' : 'f') + (shell ? 's' : 'b');
    return m;
  };
  const shellCount = Math.max(0, Math.min(8, Math.floor(shells)));
  return {
    base: make(false, 0),
    shells: Array.from({ length: shellCount }, (_, i) => make(true, (i + 1) / shellCount)),
  };
}
