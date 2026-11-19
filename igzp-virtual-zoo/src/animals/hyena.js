// STRIPED HYENA (Hyaena hyaena) — ultra-realistic procedural model and custom shader.
// Addresses user feedback from screenshots 2 & 3:
//  * Iconic hyena anatomy: powerful towering shoulders sloping steeply down to low hindquarters (~20° spine slope)
//  * Thick, muscular neck thrust forward and low
//  * Broad bone-crushing skull with wide zygomatic arches and deep crushing jaw
//  * Large rounded bat-like ears (not pointed wolf ears!)
//  * Prominent erect bristling dorsal mane running along the spine
//  * Pale straw/buff coat with distinct dark vertical stripes, dark leg bars, dark throat bib, and dark muzzle mask
//  * Pacing/loping gait with rocking hunchbacked stride, head carried low, scavenging, and laughing cackle/whoop audio
import * as THREE from 'three';
import { Rig } from './models.js';
import { V3, loft, ellipsoid, clamp, sstep } from '../core/util.js';

export const PART = {
  body: 0,
  head: 1,
  leg: 2,
  tail: 3,
  ear: 4,
  eye: 5,
  pupil: 6,
  nose: 7,
  paw: 8,
  snout: 9,
  throat: 10,
  mane: 11,
  claw: 12,
  innerEar: 13,
  jaw: 14,
  cheek: 15
};

// Small helper for tapered curves and whiskers / mouth contours
function tube(points, radius, radialSegments = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => p.isVector3 ? p : new V3(...p)));
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 6), radius, radialSegments, false);
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

/** Torso cross-sections: [z, half-width, half-height, centre-y] (rump -> withers -> neck).
 *  Note the dramatic slope: y rises from 0.62m at rump to 0.88m at withers (+0.26m incline)!
 */
const HYENA_TORSO = [
  [-0.66, 0.155, 0.185, 0.62],  // pelvic drop / croup
  [-0.50, 0.180, 0.220, 0.66],  // hips / rump
  [-0.28, 0.190, 0.245, 0.72],  // tucked abdomen / flank waist
  [-0.04, 0.235, 0.295, 0.78],  // posterior ribcage
  [ 0.18, 0.265, 0.335, 0.84],  // deep muscular chest between forelegs
  [ 0.38, 0.275, 0.355, 0.88],  // towering withers / shoulder hump
  [ 0.54, 0.230, 0.295, 0.86],  // anterior chest
  [ 0.66, 0.185, 0.240, 0.83]   // thick base of neck
];

function torsoAt(z) {
  let i = 0;
  while (i < HYENA_TORSO.length - 2 && HYENA_TORSO[i + 1][0] < z) i++;
  const a = HYENA_TORSO[i], b = HYENA_TORSO[i + 1];
  const t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t);
  return [
    a[1] + (b[1] - a[1]) * s,
    a[2] + (b[2] - a[2]) * s,
    a[3] + (b[3] - a[3]) * s
  ];
}

export function buildHyena(male = true) {
  const r = new Rig();
  const k = male ? 1.04 : 0.98; // adult striped hyena scale
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

  // ---------------- SKELETON: ICONIC STEEP HYENA SLOPE
  // Hips at 0.64m, chest/withers at 0.86m — forequarters tower over hindquarters!
  r.joint('hips', null, S(new V3(0, 0.64, -0.48)))
   .joint('chest', 'hips', S(new V3(0, 0.86, 0.36)))
   .joint('neck', 'chest', S(new V3(0, 0.82, 0.64)))
   .joint('head', 'neck', S(new V3(0, 0.76, 0.88)))
   .joint('jaw', 'head', S(new V3(0, 0.70, 0.91)))
   .joint('earL', 'head', S(new V3(0.12, 0.94, 0.84)))
   .joint('earR', 'head', S(new V3(-0.12, 0.94, 0.84)));

  // Drooping tail: hangs low between haunches
  const tailPts = [
    [0, 0.58, -0.66],
    [0, 0.44, -0.78],
    [0, 0.30, -0.88],
    [0, 0.18, -0.96]
  ].map(a => new V3(...a));
  for (let i = 0; i < 3; i++) {
    r.joint('tail' + (i + 1), i ? 'tail' + i : 'hips', S(tailPts[i]));
  }

  // LEGS: High long front legs, significantly shorter angled hind legs!
  const LEG = {
    lf: { s:  1, parent: 'chest', p: [[ 0.20, 0.84, 0.36], [ 0.21, 0.48, 0.34], [ 0.20, 0.16, 0.38], [ 0.20, 0.04, 0.42]] },
    rf: { s: -1, parent: 'chest', p: [[-0.20, 0.84, 0.36], [-0.21, 0.48, 0.34], [-0.20, 0.16, 0.38], [-0.20, 0.04, 0.42]] },
    lh: { s:  1, parent: 'hips',  p: [[ 0.18, 0.63, -0.46], [ 0.19, 0.38, -0.32], [ 0.18, 0.16, -0.52], [ 0.18, 0.04, -0.48]] },
    rh: { s: -1, parent: 'hips',  p: [[-0.18, 0.63, -0.46], [-0.19, 0.38, -0.32], [-0.18, 0.16, -0.52], [-0.18, 0.04, -0.48]] },
  };
  for (const [n, L] of Object.entries(LEG)) {
    const p = L.p.map(a => new V3(...a));
    r.joint(n + '1', L.parent, S(p[0]))
     .joint(n + '2', n + '1', S(p[1]))
     .joint(n + '3', n + '2', S(p[2]));
    L.v = p;
  }

  // ---------------- TORSO: LOFTED WITH ICONIC DOWNWARD SLOPE
  const tz = [], rx = [], ry = [];
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const z = -0.66 + (i / steps) * 1.32;
    const [w, h, y] = torsoAt(z);
    tz.push(new V3(0, y, z));
    rx.push(w);
    ry.push(h);
  }
  const hi = r.idx('hips'), ch = r.idx('chest');
  const spineW = (x, y, z) => {
    const t = sstep(-0.30, 0.25, z);
    return [hi, 1 - t, ch, t];
  };
  const bellyTone = (x, y, z) => {
    const [w, h, cy] = torsoAt(z);
    return sstep(cy - h * 0.45, cy - h * 0.95, y) * 0.85;
  };
  addBlend(loft(tz, rx, ry, 24), spineW, PART.body, bellyTone, 1.0);

  // Muscular shoulder humps & haunches
  for (const side of [-1, 1]) {
    // Bulging shoulder mass (massively developed in hyenas)
    add(ellipsoid(new V3(side * 0.19, 0.86, 0.34), 0.13, 0.24, 0.22, 22, 16), 'chest', PART.body, 0.15, 1.1);
    // Lower, leaner pelvic haunches
    add(ellipsoid(new V3(side * 0.16, 0.62, -0.44), 0.12, 0.20, 0.18, 20, 14), 'hips', PART.body, 0.25, 1.0);
  }

  // ---------------- ERECT DORSAL MANE (BRISTLING CREST FROM HEAD TO TAIL)
  // Striped hyenas have a prominent coarse erectile mane running down the spine.
  const manePts = [], maneW = [], maneH = [];
  const maneSteps = 28;
  for (let i = 0; i <= maneSteps; i++) {
    const u = i / maneSteps;
    const z = -0.56 + u * 1.28; // from rump up to nape/head
    const [w, h, cy] = torsoAt(Math.min(0.66, z));
    const crestH = (0.12 + 0.07 * Math.sin(u * Math.PI)) * (u > 0.4 ? 1.15 : 0.9);
    manePts.push(new V3(0, cy + h + crestH * 0.45, z));
    maneW.push(0.038 - u * 0.012);
    maneH.push(crestH);
  }
  const maneSpineW = (x, y, z) => {
    if (z > 0.60) return [r.idx('neck'), 0.45, r.idx('head'), 0.55];
    const t = sstep(-0.25, 0.28, z);
    return [hi, 1 - t, ch, t];
  };
  addBlend(loft(manePts, maneW, maneH, 16), maneSpineW, PART.mane, 0, 2.2);

  // ---------------- NECK & SKULL: THICK, BROAD BONE-CRUSHING HEAD
  // Thick muscular neck thrust forward and low
  add(loft([
    new V3(0, 0.85, 0.54),
    new V3(0, 0.81, 0.68),
    new V3(0, 0.77, 0.82)
  ], [0.19, 0.175, 0.15], [0.24, 0.22, 0.19], 20), 'neck', PART.body, (x, y, z) => sstep(0.82, 0.68, y) * 0.8, 1.3);

  // Broad cranial vault with wide sagittal crest
  add(ellipsoid(new V3(0, 0.835, 0.88), 0.155, 0.135, 0.165, 26, 20), 'head', PART.head, 0, 0.9);

  // Wide zygomatic arches (cheeks) supporting massive crushing jaw muscles
  for (const side of [-1, 1]) {
    add(ellipsoid(new V3(side * 0.115, 0.785, 0.90), 0.065, 0.082, 0.095, 18, 14), 'head', PART.cheek, 0.1, 0.8);
  }

  // Broad, heavy, blunt snout (shorter than wolf, broad for bone crushing)
  add(loft([
    new V3(0, 0.815, 0.95),
    new V3(0, 0.775, 1.05),
    new V3(0, 0.750, 1.13)
  ], [0.085, 0.075, 0.062], [0.075, 0.065, 0.052], 18), 'head', PART.snout, 0, 0.4);

  // Deep powerful crushing lower jaw
  add(ellipsoid(new V3(0, 0.695, 1.01), 0.075, 0.048, 0.095, 18, 12), 'jaw', PART.jaw, 0.2, 0.4);

  // Dark muzzle leather and nose
  add(ellipsoid(new V3(0, 0.755, 1.145), 0.042, 0.028, 0.025, 16, 12), 'head', PART.nose, 0, 0);

  // Eyes: dark socket surround, dark amber iris, round pupil
  for (const side of [-1, 1]) {
    add(ellipsoid(new V3(side * 0.072, 0.815, 0.99), 0.034, 0.028, 0.020, 16, 12), 'head', PART.snout, 0, 0); // dark surround
    add(ellipsoid(new V3(side * 0.072, 0.815, 1.004), 0.022, 0.020, 0.010, 14, 10), 'head', PART.eye, 0, 0);   // amber iris
    add(ellipsoid(new V3(side * 0.072, 0.815, 1.011), 0.009, 0.009, 0.005, 10, 8), 'head', PART.pupil, 0, 0); // pupil
    add(ellipsoid(new V3(side * 0.076, 0.822, 1.015), 0.0035, 0.0035, 0.002, 8, 6), 'head', PART.pupil, 1, 0); // catchlight
  }

  // ---------------- LARGE ROUNDED BAT EARS (NOT POINTED WOLF EARS!)
  // Striped hyenas have very large, rounded, cup-like bat ears flaring outwards and up.
  for (const side of [-1, 1]) {
    // Outer rounded ear pinna
    const eg = new THREE.SphereGeometry(1, 24, 16);
    eg.scale(0.068, 0.115, 0.038);
    eg.rotateZ(-side * 0.32);
    eg.rotateX(0.12);
    eg.translate(side * 0.135, 0.94, 0.83);
    add(eg, side > 0 ? 'earL' : 'earR', PART.ear, 0, 0.6);

    // Pale buff inner ear hollow
    const inner = new THREE.SphereGeometry(1, 18, 12);
    inner.scale(0.045, 0.088, 0.018);
    inner.rotateZ(-side * 0.32);
    inner.rotateX(0.12);
    inner.translate(side * 0.135, 0.94, 0.845);
    add(inner, side > 0 ? 'earL' : 'earR', PART.innerEar, 0, 0.3);
  }

  // Throat bib: dark patch beneath the chin/throat
  add(ellipsoid(new V3(0, 0.725, 0.78), 0.085, 0.095, 0.12, 18, 14), 'neck', PART.throat, 0, 0.8);

  // ---------------- LEGS & PAWS: WEIGHT-BEARING FORELEGS, LOWER HIND HOCKS
  for (const [n, L] of Object.entries(LEG)) {
    const [a, b, c, d] = L.v, front = n[1] === 'f';
    const upperR = front ? [0.125, 0.115, 0.095] : [0.115, 0.100, 0.085];
    const lowerR = front ? [0.088, 0.078, 0.068] : [0.078, 0.070, 0.062];

    add(loft([a.clone().add(new V3(0, 0.08, 0)), a, b], upperR, upperR, 18), n + '1', PART.leg, 0, 0.9);
    add(loft([b, b.clone().lerp(c, 0.5), c], lowerR, lowerR, 16), n + '2', PART.leg, 0, 0.8);
    add(loft([c, c.clone().lerp(d, 0.5), d], [0.065, 0.065, 0.060], [0.065, 0.065, 0.055], 14), n + '3', PART.leg, 0, 0.6);

    // Wide paw pad
    add(ellipsoid(new V3(d.x, 0.055, d.z + 0.03), 0.085, 0.048, 0.095, 18, 12), n + '3', PART.paw, 0.3, 0.4);
    // 4 non-retractile blunt dark claws
    for (let t = 0; t < 4; t++) {
      const tx = d.x + (t - 1.5) * 0.038;
      add(ellipsoid(new V3(tx, 0.042, d.z + 0.085 - Math.abs(t - 1.5) * 0.009), 0.022, 0.026, 0.032, 12, 8), n + '3', PART.paw, 0.3, 0.2);
      add(ellipsoid(new V3(tx, 0.032, d.z + 0.112 - Math.abs(t - 1.5) * 0.009), 0.009, 0.009, 0.018, 8, 6), n + '3', PART.claw, 0, 0);
    }
  }

  // ---------------- TAIL: BUSHY, LOW DROOP WITH DARK TIP
  const tp = [], tr = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, f = t * (tailPts.length - 1), j = Math.min(tailPts.length - 2, Math.floor(f)), u = f - j;
    tp.push(tailPts[j].clone().lerp(tailPts[j + 1], u));
    tr.push(0.068 - t * 0.022);
  }
  const tIdx = [1, 2, 3].map(i => r.idx('tail' + i));
  const tailW = (x, y, z) => {
    let best = 0, bd = 1e9;
    tailPts.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    const b = Math.min(2, best);
    return [tIdx[Math.max(0, b - 1)], 0.4, tIdx[b], 0.6];
  };
  addBlend(loft(tp, tr, tr, 14), tailW, PART.tail, 0, 1.8);

  const tpl = r.build();
  tpl.meta = {
    L: 1.25 * k,
    D: 0.68 * k,
    W: 0.44 * k,
    leg: 0.82 * k,
    bodyY0: 0.78 * k,
    legs: Object.keys(LEG),
    k,
    hyena: true,
    quality: 'ultra-realistic-striped-hyena'
  };
  tpl.fam = 'hyena';
  tpl.beh = 'hyena';
  return tpl;
}

// ---------------------------------------------------------------- SHADER (PALE COAT WITH DARK STRIPES)
const HYENA_GLSL = /* glsl */`
varying vec3 vP; varying float vPart; varying float vTone; varying float vFur;
float hth3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float htn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hth3(i), hth3(i + vec3(1,0,0)), f.x), mix(hth3(i + vec3(0,1,0)), hth3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hth3(i + vec3(0,0,1)), hth3(i + vec3(1,0,1)), f.x), mix(hth3(i + vec3(0,1,1)), hth3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 hyenaColor(vec3 p, float part, float tone){
  // Pale straw / buff / dusty ochre ground coat
  vec3 buffA = vec3(0.22, 0.19, 0.14);   // linear-space grey-buff (the old values rendered near-white)
  vec3 buffB = vec3(0.27, 0.24, 0.18);
  vec3 buffC = vec3(0.16, 0.14, 0.10);
  vec3 bellyCream = vec3(0.38, 0.35, 0.29);
  vec3 darkStripe = vec3(0.12, 0.10, 0.09);
  vec3 black = vec3(0.04, 0.03, 0.03);

  float n = htn3(p * 18.0);
  float macroNoise = htn3(p * 3.8 + 2.1);
  vec3 coat = mix(buffA, buffB, smoothstep(0.2, 0.8, macroNoise));
  coat = mix(coat, buffC, smoothstep(0.65, 0.95, n) * 0.25);
  coat *= 0.92 + 0.12 * htn3(p * 45.0);

  // Lighten belly and ventral zones
  coat = mix(coat, bellyCream, smoothstep(0.45, 0.85, tone));

  // Dedicated facial & feature parts
  if (part > 4.5 && part < 5.5) return vec3(0.82, 0.52, 0.14) * (0.88 + 0.12 * n); // amber iris
  if (part > 5.5 && part < 6.5) return black; // pupil
  if (part > 6.5 && part < 7.5) return vec3(0.12, 0.10, 0.09); // dark nose leather
  if (part > 11.5 && part < 12.5) return vec3(0.14, 0.12, 0.10); // claws
  if (part > 12.5 && part < 13.5) return vec3(0.88, 0.82, 0.72); // pale inner ear fur
  if (part > 7.5 && part < 8.5) return mix(buffC, darkStripe, 0.4); // paws

  // Dark throat bib / chevron
  if (part > 9.5 && part < 10.5) return mix(darkStripe, black, 0.5) * (0.9 + 0.1 * n);

  // Dark muzzle & mask
  if (part > 8.5 && part < 9.5) {
    float mask = smoothstep(0.95, 1.12, p.z);
    return mix(coat, darkStripe, mask * 0.92);
  }

  // Erect dorsal mane: bristling coarse hairs with dark tips and buff roots
  if (part > 10.5 && part < 11.5) {
    float strandNoise = htn3(p * vec3(40.0, 15.0, 50.0));
    float darkTip = smoothstep(0.85, 1.05, p.y);
    vec3 maneCol = mix(buffB, darkStripe, darkTip * 0.85 + strandNoise * 0.25);
    return maneCol;
  }

  // Outer ear: dark rim with buff back
  if (part > 3.5 && part < 4.5) {
    float rim = smoothstep(0.04, 0.08, length(vec2(abs(p.x) - 0.135, p.y - 0.94)));
    return mix(buffA, darkStripe, rim);
  }

  // Tail: pale buff base, bushy pitch-black tip
  if (part > 2.5 && part < 3.5) {
    float blackTip = smoothstep(-0.76, -0.92, p.z);
    return mix(coat, black, blackTip);
  }

  // STRIPED HYENA MARKINGS: BOLD VERTICAL STRIPES ACROSS FLANKS & HORIZONTAL LEG BARS
  float stripeMask = 0.0;
  if (part > 1.5 && part < 2.5) {
    // Horizontal dark bars on legs
    float legPhase = p.y * 16.0 + abs(p.x) * 3.0 + htn3(p * 8.0) * 0.4;
    float legDist = abs(fract(legPhase) - 0.5) * 2.0;
    stripeMask = 1.0 - smoothstep(0.18, 0.36, legDist);
  } else {
    // Vertical wavy stripes across the body/flanks
    float warp = htn3(p * vec3(4.5, 6.0, 4.0) + 3.2);
    float stripePhase = p.z * 11.0 + p.y * 1.5 + warp * 1.2;
    float stripeDist = abs(fract(stripePhase) - 0.5) * 2.0;
    float stripeWidth = mix(0.14, 0.26, htn3(p * vec3(3.0, 5.0, 3.0) + 1.5));
    float bodyStripe = 1.0 - smoothstep(stripeWidth, stripeWidth + 0.16, stripeDist);
    // Suppress stripes on lower belly and throat
    bodyStripe *= (1.0 - smoothstep(0.55, 0.88, tone));
    stripeMask = bodyStripe;
  }

  return mix(coat, darkStripe, clamp(stripeMask * 0.88, 0.0, 1.0));
}`;

function patch(sh, shell) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aTone; attribute float aFur;\nvarying vec3 vP; varying float vPart; varying float vTone; varying float vFur;\nuniform float uShell; uniform float uFurLen;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vP = position; vPart = aPart; vTone = aTone; vFur = aFur;
      transformed += normal * uShell * uFurLen * aFur;
      transformed.y -= uShell * uShell * uFurLen * aFur * 0.28;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uShell;\n' + HYENA_GLSL)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 hc = hyenaColor(vP, vPart, vTone);
      ${shell ? `float strand = htn3(floor(vP * vec3(320.0, 480.0, 320.0))); float mask = smoothstep(0.15, 0.60, strand); if (vFur < 0.01 || mask < 0.16 + uShell * 0.44) discard; hc *= 0.86 + 0.14 * uShell;` : 'hc *= 0.96;'}
      diffuseColor.rgb = hc;`);
}

/** Materials: base coat + fur shells for bristling mane and realistic coat. */
export function hyenaMaterials(shells = 4) {
  const make = (shell, level) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    m.envMapIntensity = 0.45;
    m.color.setRGB(1, 1, 1);
    m.side = THREE.FrontSide;
    const u = { uShell: { value: level }, uFurLen: { value: 0.022 } };
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, u); patch(sh, shell); };
    m.customProgramCacheKey = () => 'hyena' + (shell ? 's' : 'b');
    return m;
  };
  const shellCount = Math.max(0, Math.min(8, Math.floor(shells)));
  return {
    base: make(false, 0),
    shells: Array.from({ length: shellCount }, (_, i) => make(true, (i + 1) / shellCount))
  };
}
