// DHOLE (Cuon alpinus - Indian Wild Dog) — ultra-realistic procedural model and custom shader.
// Addresses user feedback from screenshots 2 & 3:
//  * Rich rusty copper-red / fiery auburn coat
//  * Striking creamy-white throat, chin, chest, belly, and inner limbs
//  * Jet-black bushy tail ('black-tailed hunter')
//  * Rounded cup-shaped ears with thick white inner fur (not pointed fox/wolf ears!)
//  * Compact, athletic, deep-chested hypercarnivore canid frame
//  * Pack coordination, springy trotting gait, and bird-like whistling chirps ('whistling hunter')
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
  chestWhite: 10,
  innerEar: 11,
  claw: 12,
  jaw: 13,
  throatWhite: 14
};

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

/** Torso cross-sections: [z, half-width, half-height, centre-y] (rump -> chest -> neck).
 *  Compact, athletic, deep ribcage, tucked flank.
 */
const DHOLE_TORSO = [
  [-0.48, 0.115, 0.135, 0.48], // rump / tail insertion
  [-0.34, 0.130, 0.155, 0.50], // pelvic girdle
  [-0.16, 0.120, 0.145, 0.52], // tucked waist / flank
  [ 0.04, 0.145, 0.185, 0.51], // deep athletic ribcage
  [ 0.20, 0.150, 0.195, 0.53], // chest between shoulders
  [ 0.34, 0.135, 0.180, 0.55], // withers
  [ 0.44, 0.105, 0.140, 0.56]  // neck transition
];

function torsoAt(z) {
  let i = 0;
  while (i < DHOLE_TORSO.length - 2 && DHOLE_TORSO[i + 1][0] < z) i++;
  const a = DHOLE_TORSO[i], b = DHOLE_TORSO[i + 1];
  const t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  const s = t * t * (3 - 2 * t);
  return [
    a[1] + (b[1] - a[1]) * s,
    a[2] + (b[2] - a[2]) * s,
    a[3] + (b[3] - a[3]) * s
  ];
}

export function buildDhole(male = true) {
  const r = new Rig();
  const k = male ? 1.02 : 0.96; // athletic dhole proportions
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

  // ---------------- SKELETON: COMPACT ATHLETIC CANID FRAME
  r.joint('hips', null, S(new V3(0, 0.49, -0.34)))
   .joint('chest', 'hips', S(new V3(0, 0.53, 0.22)))
   .joint('neck', 'chest', S(new V3(0, 0.59, 0.42)))
   .joint('head', 'neck', S(new V3(0, 0.66, 0.58)))
   .joint('jaw', 'head', S(new V3(0, 0.61, 0.62)))
   .joint('earL', 'head', S(new V3(0.075, 0.76, 0.56)))
   .joint('earR', 'head', S(new V3(-0.075, 0.76, 0.56)));

  // Full, jet-black bushy tail (hangs low, flicks expressively)
  const tailPts = [
    [0, 0.48, -0.48],
    [0, 0.38, -0.60],
    [0, 0.25, -0.72],
    [0, 0.12, -0.84]
  ].map(a => new V3(...a));
  for (let i = 0; i < 4; i++) {
    r.joint('tail' + (i + 1), i ? 'tail' + i : 'hips', S(tailPts[i]));
  }

  // Athletic canid limbs: slender, springy, built for pack endurance
  const LEG = {
    lf: { s:  1, parent: 'chest', p: [[ 0.13, 0.52, 0.22], [ 0.135, 0.29, 0.21], [ 0.13, 0.10, 0.23], [ 0.13, 0.025, 0.26]] },
    rf: { s: -1, parent: 'chest', p: [[-0.13, 0.52, 0.22], [-0.135, 0.29, 0.21], [-0.13, 0.10, 0.23], [-0.13, 0.025, 0.26]] },
    lh: { s:  1, parent: 'hips',  p: [[ 0.125, 0.49, -0.32], [ 0.135, 0.28, -0.22], [ 0.13, 0.11, -0.36], [ 0.13, 0.025, -0.32]] },
    rh: { s: -1, parent: 'hips',  p: [[-0.125, 0.49, -0.32], [-0.135, 0.28, -0.22], [-0.13, 0.11, -0.36], [-0.13, 0.025, -0.32]] },
  };
  for (const [n, L] of Object.entries(LEG)) {
    const p = L.p.map(a => new V3(...a));
    r.joint(n + '1', L.parent, S(p[0]))
     .joint(n + '2', n + '1', S(p[1]))
     .joint(n + '3', n + '2', S(p[2]));
    L.v = p;
  }

  // ---------------- TORSO: SCULPTED CANID ATHLETIC PROFILE
  const tz = [], rx = [], ry = [];
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const z = -0.48 + (i / steps) * 0.92;
    const [w, h, y] = torsoAt(z);
    tz.push(new V3(0, y, z));
    rx.push(w);
    ry.push(h);
  }
  const hi = r.idx('hips'), ch = r.idx('chest');
  const spineW = (x, y, z) => {
    const t = sstep(-0.20, 0.15, z);
    return [hi, 1 - t, ch, t];
  };
  // Underbelly white fur gradient
  const bellyTone = (x, y, z) => {
    const [w, h, cy] = torsoAt(z);
    return sstep(cy - h * 0.35, cy - h * 0.95, y) * 0.95;
  };
  addBlend(loft(tz, rx, ry, 22), spineW, PART.body, bellyTone, 1.0);

  // Muscular shoulders and haunches
  for (const side of [-1, 1]) {
    add(ellipsoid(new V3(side * 0.125, 0.53, 0.20), 0.085, 0.155, 0.145, 18, 14), 'chest', PART.body, (x, y) => sstep(0.48, 0.38, y) * 0.3, 1.0);
    add(ellipsoid(new V3(side * 0.115, 0.49, -0.31), 0.088, 0.165, 0.140, 18, 14), 'hips', PART.body, (x, y) => sstep(0.44, 0.34, y) * 0.35, 1.0);
  }

  // ---------------- CONTRASTING WHITE THROAT & CHEST
  // Dholes have a striking, pure white/cream bib and chest
  add(ellipsoid(new V3(0, 0.48, 0.26), 0.095, 0.125, 0.135, 18, 14), 'chest', PART.chestWhite, 1.0, 1.2);
  add(ellipsoid(new V3(0, 0.56, 0.44), 0.075, 0.085, 0.115, 16, 12), 'neck', PART.throatWhite, 1.0, 1.2);

  // ---------------- NECK & COMPACT CANID HEAD
  // Slender, alert neck held high
  add(loft([
    new V3(0, 0.56, 0.38),
    new V3(0, 0.60, 0.48),
    new V3(0, 0.64, 0.56)
  ], [0.11, 0.10, 0.088], [0.14, 0.13, 0.115], 18), 'neck', PART.body, (x, y, z) => sstep(0.58, 0.46, y) * 0.95, 1.1);

  // Cranial skull: rounded canid braincase
  add(ellipsoid(new V3(0, 0.665, 0.61), 0.095, 0.085, 0.105, 22, 16), 'head', PART.head, 0, 0.85);

  // Snout: shorter, more compact than grey wolf (dholes have fewer molars, shorter rostrum)
  add(loft([
    new V3(0, 0.655, 0.66),
    new V3(0, 0.635, 0.73),
    new V3(0, 0.620, 0.79)
  ], [0.055, 0.046, 0.038], [0.048, 0.042, 0.034], 16), 'head', PART.snout, 0, 0.4);

  // Lower jaw & white chin
  add(ellipsoid(new V3(0, 0.585, 0.71), 0.045, 0.028, 0.065, 14, 10), 'jaw', PART.jaw, 1.0, 0.5);

  // Black nose leather
  add(ellipsoid(new V3(0, 0.622, 0.802), 0.025, 0.018, 0.016, 14, 10), 'head', PART.nose, 0, 0);

  // Expressive dark amber eyes with dark eyeliner
  for (const side of [-1, 1]) {
    add(ellipsoid(new V3(side * 0.048, 0.655, 0.685), 0.024, 0.019, 0.014, 14, 10), 'head', PART.head, 0, 0); // eye socket
    add(ellipsoid(new V3(side * 0.048, 0.655, 0.696), 0.016, 0.014, 0.008, 12, 8), 'head', PART.eye, 0, 0);   // warm amber iris
    add(ellipsoid(new V3(side * 0.048, 0.655, 0.701), 0.007, 0.007, 0.004, 8, 6), 'head', PART.pupil, 0, 0); // round pupil
    add(ellipsoid(new V3(side * 0.051, 0.660, 0.704), 0.0025, 0.0025, 0.002, 6, 4), 'head', PART.pupil, 1, 0); // catchlight
  }

  // ---------------- ROUNDED CUP-SHAPED EARS WITH WHITE INNER FUR
  // Distinctive Dhole feature: rounded at apex (NOT pointed like a wolf or jackal), lined with fluffy white fur!
  for (const side of [-1, 1]) {
    // Outer rounded ear shell (rich copper red)
    const eg = new THREE.SphereGeometry(1, 22, 14);
    eg.scale(0.048, 0.076, 0.024);
    eg.rotateZ(-side * 0.22);
    eg.rotateX(0.08);
    eg.translate(side * 0.082, 0.765, 0.565);
    add(eg, side > 0 ? 'earL' : 'earR', PART.ear, 0, 0.6);

    // Inner cup: dense, fluffy white fur
    const inner = new THREE.SphereGeometry(1, 16, 10);
    inner.scale(0.034, 0.058, 0.014);
    inner.rotateZ(-side * 0.22);
    inner.rotateX(0.08);
    inner.translate(side * 0.082, 0.765, 0.578);
    add(inner, side > 0 ? 'earL' : 'earR', PART.innerEar, 1.0, 0.4);
  }

  // ---------------- LEGS & PAWS: AGILE CANID ARTICULATION
  for (const [n, L] of Object.entries(LEG)) {
    const [a, b, c, d] = L.v, front = n[1] === 'f';
    const upperR = front ? [0.082, 0.072, 0.058] : [0.088, 0.076, 0.062];
    const lowerR = front ? [0.056, 0.050, 0.042] : [0.058, 0.052, 0.044];

    // Inner legs have white highlights
    const legTone = (x, y) => Math.abs(x) < Math.abs(a.x) - 0.025 ? 0.8 : 0.0;

    add(loft([a.clone().add(new V3(0, 0.05, 0)), a, b], upperR, upperR, 16), n + '1', PART.leg, legTone, 0.9);
    add(loft([b, b.clone().lerp(c, 0.5), c], lowerR, lowerR, 14), n + '2', PART.leg, legTone, 0.8);
    add(loft([c, c.clone().lerp(d, 0.5), d], [0.044, 0.044, 0.040], [0.044, 0.042, 0.038], 12), n + '3', PART.leg, legTone, 0.6);

    // Compact canid paw pad
    add(ellipsoid(new V3(d.x, 0.038, d.z + 0.022), 0.055, 0.032, 0.065, 16, 10), n + '3', PART.paw, 0.2, 0.4);
    // 4 compact canid toes with small dark claws
    for (let t = 0; t < 4; t++) {
      const tx = d.x + (t - 1.5) * 0.024;
      add(ellipsoid(new V3(tx, 0.028, d.z + 0.058 - Math.abs(t - 1.5) * 0.006), 0.015, 0.018, 0.022, 10, 8), n + '3', PART.paw, 0.2, 0.2);
      add(ellipsoid(new V3(tx, 0.022, d.z + 0.076 - Math.abs(t - 1.5) * 0.006), 0.006, 0.006, 0.012, 8, 6), n + '3', PART.claw, 0, 0);
    }
  }

  // ---------------- JET-BLACK BUSHY TAIL
  // Dholes are famous for their thick, bushy jet-black tail
  const tp = [], tr = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, f = t * (tailPts.length - 1), j = Math.min(tailPts.length - 2, Math.floor(f)), u = f - j;
    tp.push(tailPts[j].clone().lerp(tailPts[j + 1], u));
    // Plump bushy taper
    tr.push((0.052 + Math.sin(t * Math.PI) * 0.018) * (1 - t * 0.25));
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
  addBlend(loft(tp, tr, tr, 14), tailW, PART.tail, 0, 2.0);

  const tpl = r.build();
  tpl.meta = {
    L: 1.05 * k,
    D: 0.42 * k,
    W: 0.30 * k,
    leg: 0.54 * k,
    bodyY0: 0.50 * k,
    legs: Object.keys(LEG),
    k,
    dhole: true,
    quality: 'ultra-realistic-dhole'
  };
  tpl.fam = 'dhole';
  tpl.beh = 'dhole';
  return tpl;
}

// ---------------------------------------------------------------- SHADER (RUSTY COPPER COAT + WHITE CHEST + JET BLACK TAIL)
const DHOLE_GLSL = /* glsl */`
varying vec3 vP; varying float vPart; varying float vTone; varying float vFur;
float dth3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dtn3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dth3(i), dth3(i + vec3(1,0,0)), f.x), mix(dth3(i + vec3(0,1,0)), dth3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dth3(i + vec3(0,0,1)), dth3(i + vec3(1,0,1)), f.x), mix(dth3(i + vec3(0,1,1)), dth3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 dholeColor(vec3 p, float part, float tone){
  // Radiant rusty copper-red / fiery auburn coat
  vec3 copperA = vec3(0.74, 0.28, 0.09); // deep rusty auburn
  vec3 copperB = vec3(0.88, 0.38, 0.12); // bright fiery copper highlight
  vec3 copperC = vec3(0.62, 0.20, 0.07); // rich dark flank undertone

  // Striking creamy-white underfur
  vec3 whiteFur = vec3(0.95, 0.93, 0.88);
  vec3 warmWhite = vec3(0.88, 0.84, 0.77);

  // Jet-black tail and points
  vec3 jetBlack = vec3(0.04, 0.03, 0.03);

  float n = dtn3(p * 20.0);
  float broadNoise = dtn3(p * 4.2 + 1.8);
  vec3 coat = mix(copperA, copperB, smoothstep(0.25, 0.82, broadNoise));
  coat = mix(coat, copperC, smoothstep(0.68, 0.98, n) * 0.26);
  coat *= 0.93 + 0.10 * dtn3(p * 42.0);

  // Contrast white underbelly & inner thighs
  coat = mix(coat, whiteFur, smoothstep(0.48, 0.88, tone));

  // Dedicated facial & feature parts
  if (part > 4.5 && part < 5.5) return vec3(0.84, 0.52, 0.15) * (0.88 + 0.12 * n); // amber iris
  if (part > 5.5 && part < 6.5) return jetBlack; // pupil
  if (part > 6.5 && part < 7.5) return vec3(0.10, 0.08, 0.08); // dark nose leather
  if (part > 11.5 && part < 12.5) return vec3(0.12, 0.11, 0.10); // claws
  if (part > 10.5 && part < 11.5) return whiteFur * (0.95 + 0.05 * n); // inner ear white fur
  if (part > 9.5 && part < 10.5) return whiteFur * (0.94 + 0.06 * n); // white chest
  if (part > 13.5 && part < 14.5) return whiteFur * (0.94 + 0.06 * n); // white throat
  if (part > 12.5 && part < 13.5) return whiteFur * (0.92 + 0.08 * n); // white chin/jaw

  // Outer ear: rich copper
  if (part > 3.5 && part < 4.5) return mix(copperA, copperC, 0.3) * (0.94 + 0.06 * n);

  // JET-BLACK BUSHY TAIL: copper at very root, transitioning rapidly to solid pitch black
  if (part > 2.5 && part < 3.5) {
    float blackFrac = smoothstep(-0.52, -0.62, p.z);
    return mix(copperA, jetBlack, blackFrac);
  }

  // Snout: warm copper-brown with slight dark shading around muzzle bridge
  if (part > 8.5 && part < 9.5) {
    float muzzleDark = smoothstep(0.72, 0.79, p.z) * 0.35;
    return mix(coat, jetBlack, muzzleDark);
  }

  return coat;
}`;

function patch(sh, shell) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute float aPart; attribute float aTone; attribute float aFur;\nvarying vec3 vP; varying float vPart; varying float vTone; varying float vFur;\nuniform float uShell; uniform float uFurLen;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vP = position; vPart = aPart; vTone = aTone; vFur = aFur;
      transformed += normal * uShell * uFurLen * aFur;
      transformed.y -= uShell * uShell * uFurLen * aFur * 0.24;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uShell;\n' + DHOLE_GLSL)
    .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 dc = dholeColor(vP, vPart, vTone);
      ${shell ? `float strand = dtn3(floor(vP * vec3(340.0, 500.0, 340.0))); float mask = smoothstep(0.16, 0.62, strand); if (vFur < 0.01 || mask < 0.16 + uShell * 0.44) discard; dc *= 0.88 + 0.12 * uShell;` : 'dc *= 0.96;'}
      diffuseColor.rgb = dc;`);
}

/** Materials: base coat + fur shells for lush bushy tail and silky coat. */
export function dholeMaterials(shells = 4) {
  const make = (shell, level) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
    m.envMapIntensity = 0.50;
    m.color.setRGB(1, 1, 1);
    m.side = THREE.FrontSide;
    const u = { uShell: { value: level }, uFurLen: { value: 0.018 } };
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, u); patch(sh, shell); };
    m.customProgramCacheKey = () => 'dhole' + (shell ? 's' : 'b');
    return m;
  };
  const shellCount = Math.max(0, Math.min(8, Math.floor(shells)));
  return {
    base: make(false, 0),
    shells: Array.from({ length: shellCount }, (_, i) => make(true, (i + 1) / shellCount))
  };
}
