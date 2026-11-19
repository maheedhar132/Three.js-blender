// PRIMATES (Callitrichidae, Cercopithecidae, Hominidae, Lemuridae)
// High-fidelity procedural primate models, behaviors, visibility perches, and procedural Web Audio soundscape.
//
// Addresses user complaints:
// 1. Marmoset visibility:
//    - Visible ~0.35m body + 0.45m banded tail, iconic radiating white ear tufts and white forehead blaze.
//    - Eye-level viewing branches and feeding tray fixtures installed at visitor eye-level in full view.
// 2. Differentiate all monkey shapes:
//    - Chimp: heavy hunched shoulders, long muscular arms, bare wrinkled face, knuckle-walking.
//    - Baboon: dog-like muzzle, male silver cape/mantle, pink rump callosities, arched tail.
//    - Bonnet Macaque: radiating crown cap whorl, slender body, whip tail.
//    - Rhesus Macaque: stocky build, red-orange rump, pink face.
//    - Stump-tailed Macaque: shaggy coat, bright crimson face, stump tail.
//    - Langur: tall slender silvery body, jet-black face with white fur halo, arching tail.
//    - Ring-tailed Lemur: bold black/white ringed tail, dark eye masks, sunbathing pose.
// 3. Behaviors & Audio:
//    - Social grooming (grooming pairs with fur parting / picking motions).
//    - Branch leaping with parabolic trajectory and landing cushion.
//    - Procedural Web Audio: monkey chatter, high screech, chimp pant-hoot, marmoset trill.

import * as THREE from 'three';
import { V3, loft, ellipsoid, limb, clamp, lerp, sstep, rr, rand, noise3, paint, merge } from '../core/util.js';

export class Rig {
  constructor() { this.joints = []; this.parts = []; this.meta = {}; }
  joint(name, parent, pos) { this.joints.push({ name, parent, pos: pos.clone() }); return this; }
  idx(n) { const i = this.joints.findIndex(j => j.name === n); if (i < 0) throw new Error('joint ' + n); return i; }
  add(geo, joint, color) { const g = paint(geo, color); this.parts.push({ geo: g, b: this.idx(joint) }); return this; }
  addBlend(geo, weightFn, color) { const g = paint(geo, color); this.parts.push({ geo: g, fn: weightFn }); return this; }
  build() {
    const counts = this.parts.map(p => p.geo.attributes.position.count), n = counts.reduce((a, b) => a + b, 0);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); let o = 0;
    this.parts.forEach((p, k) => {
      const pos = p.geo.attributes.position;
      for (let i = 0; i < counts[k]; i++, o++) {
        if (p.fn) { const w = p.fn(pos.getX(i), pos.getY(i), pos.getZ(i)); si[o * 4] = w[0]; sw[o * 4] = w[1]; si[o * 4 + 1] = w[2]; sw[o * 4 + 1] = w[3]; }
        else { si[o * 4] = p.b; sw[o * 4] = 1; }
      }
    });
    const extra = ['aPart', 'aTone', 'aFur'].filter(a => this.parts.some(p => p.geo.attributes[a]));
    const geo = merge(this.parts.map(p => p.geo), extra);
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    return { geo, joints: this.joints, meta: this.meta };
  }
}

const C = col => new THREE.Color(col);

function fur(c, x, y, z, amt = 0.22, freq = 35) {
  const n = noise3(x * freq, y * freq, z * freq);
  c.multiplyScalar(1 - amt / 2 + n * amt);
}

// ----------------------------------------------------------------
// 1. MARMOSET MODEL BENCHMARK (Common Marmoset, Callithrix jacchus)
// Scaled to visible ~0.35m body + 0.45m banded tail with iconic white ear tufts & forehead blaze.
// ----------------------------------------------------------------

export const MARMOSET_BENCHMARK = {
  enabled: true,
  build: buildMarmoset
};

export function buildMarmoset(male = true) {
  const r = new Rig();
  const k = male ? 1.0 : 0.95; // ~0.35m body length benchmark
  const S = v => v.clone().multiplyScalar(k);
  const L = 0.35 * k, D = 0.18 * k, W = 0.16 * k, leg = 0.18 * k;
  const hipH = leg, shH = leg * 1.05;
  const bodyY = z => lerp(hipH, shH, clamp((z + L / 2) / L, 0, 1)) + D * 0.18;
  const meta = { L, D, W, leg, bodyY0: bodyY(0), legs: ['lf', 'rf', 'lh', 'rh'] };
  r.meta = meta;

  // Joints
  const bodyPos = new V3(0, bodyY(0), 0);
  r.joint('body', null, bodyPos);

  // Torso: compact, rounded Callitrichid trunk with soft dappled agouti-grey/brown fur
  const torsoPts = [];
  const rx = [], ry = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const z = -L / 2 + t * L;
    const yC = bodyY(z);
    torsoPts.push(new V3(0, yC, z));
    const profileW = Math.sin(t * Math.PI) * 0.55 + 0.45;
    const profileD = Math.sin(t * Math.PI) * 0.58 + 0.42;
    rx.push((W / 2) * profileW);
    ry.push((D / 2) * profileD);
  }
  const marmosetCoatCol = (c, x, y, z) => {
    c.set('#6e6658').lerp(C('#8c7e68'), noise3(x * 25, y * 25, z * 25));
    // Dappled agouti flecks across back and flanks
    if (Math.sin(z * 40 + y * 20) > 0.3) c.lerp(C('#483e32'), 0.5);
    fur(c, x, y, z, 0.28, 45);
  };
  r.add(loft(torsoPts, rx, ry, 12), 'body', marmosetCoatCol);

  // Neck
  const nb = new V3(0, bodyY(L / 2) + D * 0.2, L / 2 - D * 0.15);
  const ne = nb.clone().add(new V3(0, 0.05 * k, 0.06 * k));
  r.joint('neck', 'body', nb);
  r.add(limb(nb, ne, W * 0.38, W * 0.32, 8), 'neck', marmosetCoatCol);

  // Head
  const headPos = ne.clone().add(new V3(0, 0.02 * k, 0.02 * k));
  r.joint('head', 'neck', headPos);
  const headR = 0.052 * k;
  // Cranium
  r.add(ellipsoid(headPos.clone().add(new V3(0, 0.015 * k, 0)), headR * 0.95, headR * 0.92, headR * 0.95, 10, 8), 'head', marmosetCoatCol);

  // Bare face mask (greyish-brown)
  const faceC = headPos.clone().add(new V3(0, -0.006 * k, headR * 0.72));
  r.add(ellipsoid(faceC, headR * 0.62, headR * 0.58, headR * 0.35, 8, 6), 'head', C('#544a42'));

  // Distinct dark button eyes with reflective catchlight
  for (const s of [-1, 1]) {
    const eyeP = headPos.clone().add(new V3(s * headR * 0.42, 0.008 * k, headR * 0.75));
    r.add(ellipsoid(eyeP, 0.013 * k, 0.013 * k, 0.012 * k, 6, 5), 'head', C('#140f0c'));
    r.add(ellipsoid(eyeP.clone().add(new V3(s * 0.002, 0.003, 0.005)), 0.004 * k, 0.004 * k, 0.004 * k, 4, 3), 'head', C('#dcd4b8'));
  }

  // Small dark rhinarium nose
  const noseP = faceC.clone().add(new V3(0, -0.008 * k, headR * 0.25));
  r.add(ellipsoid(noseP, 0.012 * k, 0.009 * k, 0.008 * k, 6, 4), 'head', C('#241c18'));

  // ICONIC WHITE FOREHEAD BLAZE (bright white diamond/star mark between eyes)
  const blazeP = headPos.clone().add(new V3(0, 0.024 * k, headR * 0.68));
  r.add(ellipsoid(blazeP, 0.018 * k, 0.022 * k, 0.010 * k, 7, 5), 'head', C('#faf7f0'));

  // ICONIC RADIATING WHITE EAR TUFTS (fluffy white ear tufts on each side)
  for (const s of [-1, 1]) {
    const earBase = headPos.clone().add(new V3(s * headR * 0.88, 0.018 * k, -0.004 * k));
    // Core ear disc
    r.add(ellipsoid(earBase, 0.014 * k, 0.020 * k, 0.016 * k, 6, 4), 'head', C('#544a42'));
    // Radiating fluffy white tuft fans
    for (let j = 0; j < 6; j++) {
      const ang = (j / 5 - 0.5) * 1.4;
      const tuftDir = new V3(s * Math.cos(ang), Math.sin(ang), (j % 2 === 0 ? 0.2 : -0.2)).normalize();
      const tuftTip = earBase.clone().addScaledVector(tuftDir, 0.042 * k);
      r.add(limb(earBase, tuftTip, 0.014 * k, 0.004 * k, 5), 'head', C('#faf7f2'));
    }
  }

  // Limbs with delicate clawed digits (tegulae claws)
  const rU = leg * 0.16, rL = rU * 0.78;
  const legDefs = [
    ['lf',  1,  L * 0.32, shH,  true],
    ['rf', -1,  L * 0.32, shH,  true],
    ['lh',  1, -L * 0.34, hipH, false],
    ['rh', -1, -L * 0.34, hipH, false]
  ];
  for (const [n, s, z, jh, front] of legDefs) {
    const x = s * W * 0.34;
    const top = new V3(x, jh, z);
    const knee = new V3(x, jh * 0.48, z + (front ? 0.015 : -0.04) * jh);
    const foot = new V3(x, 0.012 * k, z + (front ? 0 : -0.02) * jh);
    r.joint(n + '1', 'body', top).joint(n + '2', n + '1', knee);
    r.add(limb(top, knee, rU, rU * 0.82, 6), n + '1', marmosetCoatCol);
    r.add(limb(knee, foot, rL, rL * 0.75, 6), n + '2', marmosetCoatCol);

    // Clawed grasping paw / foot
    const pawP = foot.clone().add(new V3(0, rL * 0.2, rL * 0.35));
    r.add(ellipsoid(pawP, rL * 0.9, rL * 0.45, rL * 1.1, 6, 4), n + '2', C('#483e35'));
    // Claws
    for (let cIdx = -1; cIdx <= 1; cIdx++) {
      const cPos = pawP.clone().add(new V3(cIdx * rL * 0.38, -rL * 0.2, rL * 0.7));
      r.add(ellipsoid(cPos, 0.004 * k, 0.004 * k, 0.008 * k, 4, 3), n + '2', C('#1e1814'));
    }
  }

  // 0.45m BANDED TAIL (iconic alternating light and dark bands)
  const tailBase = new V3(0, bodyY(-L / 2) + D * 0.24, -L / 2 + 0.02);
  const tailLen = 0.45 * k;
  const tailRadius = 0.016 * k;
  const tailPts = [];
  const nTailSegs = 16;
  for (let i = 0; i <= nTailSegs; i++) {
    const t = i / nTailSegs;
    const tz = -t * tailLen * 0.82;
    const ty = -Math.sin(t * Math.PI * 0.65) * tailLen * 0.52 - t * t * 0.08 * tailLen;
    tailPts.push(tailBase.clone().add(new V3(0, ty, tz)));
  }
  const tMid = tailPts[Math.floor(nTailSegs * 0.4)];
  r.joint('tail1', 'body', tailBase).joint('tail2', 'tail1', tMid);

  // Banded tail paint: 14+ alternating dark charcoal and cream-white rings
  const bandedTailPaint = (c, x, y, z) => {
    const distAlong = Math.hypot(x - tailBase.x, y - tailBase.y, z - tailBase.z);
    const ringPhase = Math.sin(distAlong * 65.0);
    if (ringPhase > 0.15) {
      c.set('#241f1c'); // dark band
    } else {
      c.set('#e8e2d4'); // cream-white band
    }
    fur(c, x, y, z, 0.18, 50);
  };
  const tailRxs = tailPts.map((_, i) => tailRadius * (1.1 - i / (nTailSegs * 1.4)));
  r.add(loft(tailPts.slice(0, Math.floor(nTailSegs * 0.45) + 1), tailRxs.slice(0, Math.floor(nTailSegs * 0.45) + 1), tailRxs.slice(0, Math.floor(nTailSegs * 0.45) + 1), 8), 'tail1', bandedTailPaint);
  r.add(loft(tailPts.slice(Math.floor(nTailSegs * 0.4)), tailRxs.slice(Math.floor(nTailSegs * 0.4)), tailRxs.slice(Math.floor(nTailSegs * 0.4)), 8), 'tail2', bandedTailPaint);

  const tpl = r.build();
  tpl.fam = 'quad'; tpl.beh = 'primate';   // Animal needs a family pose and a behaviour profile
  return tpl;
}

// ----------------------------------------------------------------
// 2. DIFFERENTIATED MONKEY ANATOMY EXTRAS & PROFILES
// ----------------------------------------------------------------

/** Torso cross sections for heavy hunched chimpanzee shoulders */
export const CHIMP_PROF = [
  [0,    0.48, 0.56, 0.02],  // haunches/pelvis
  [0.18, 0.58, 0.68, 0.02],  // lumbar
  [0.45, 0.78, 0.88, 0.04],  // deep barrel chest
  [0.72, 0.98, 1.05, 0.08],  // broad muscular shoulders
  [0.88, 0.94, 0.98, 0.10],  // massive hunched withers
  [1.0,  0.58, 0.65, 0.08]   // thick cervical base
];

/** Chimpanzee wrinkled face, heavy brow ridge, and bare ears */
export function chimpFaceExtra(r, m, col) {
  const hb = m.headBase, hd = m.hd, H = m.head || { len: 0.28, w: 0.12, h: 0.13 };
  const fCol = C('#2c241e'); // bare dark wrinkled skin

  // Heavy prominent supraorbital brow ridge
  const browP = hb.clone().addScaledVector(hd, H.len * 0.42).add(new V3(0, H.h * 0.58, 0));
  r.add(ellipsoid(browP, H.w * 0.92, H.h * 0.28, H.len * 0.28, 8, 6), 'head', fCol);

  // Sunken orbital eye sockets
  for (const s of [-1, 1]) {
    const eyeP = hb.clone().addScaledVector(hd, H.len * 0.42).add(new V3(s * H.w * 0.42, H.h * 0.38, 0));
    r.add(ellipsoid(eyeP, H.w * 0.22, H.h * 0.20, H.len * 0.18, 6, 5), 'head', C('#140f0c'));
    // Warm deep amber/brown iris
    r.add(ellipsoid(eyeP.clone().add(new V3(s * 0.005, 0, 0.012)), H.w * 0.11, H.h * 0.11, H.len * 0.08, 5, 4), 'head', C('#8c5224'));
  }

  // Fleshy bare muzzle with wrinkled lips
  const muzzleP = hb.clone().addScaledVector(hd, H.len * 0.75).add(new V3(0, H.h * 0.12, 0));
  r.add(ellipsoid(muzzleP, H.w * 0.78, H.h * 0.72, H.len * 0.38, 8, 6), 'head', fCol);
  // Lower jaw / chin
  const chinP = muzzleP.clone().add(new V3(0, -H.h * 0.25, -H.len * 0.04));
  r.add(ellipsoid(chinP, H.w * 0.65, H.h * 0.42, H.len * 0.28, 7, 5), 'head', fCol);

  // Large cupped bare ears set laterally
  for (const s of [-1, 1]) {
    const earP = hb.clone().addScaledVector(hd, H.len * 0.22).add(new V3(s * H.w * 1.15, H.h * 0.42, -H.len * 0.08));
    r.add(ellipsoid(earP, H.w * 0.42, H.h * 0.85, H.len * 0.48, 7, 5), 'head', fCol);
    // Inner ear concha
    const inEar = earP.clone().add(new V3(-s * 0.01, 0, 0.01));
    r.add(ellipsoid(inEar, H.w * 0.28, H.h * 0.65, H.len * 0.28, 6, 4), 'head', C('#1e1814'));
  }

  // Muscular shoulder humps for hunched posture
  for (const s of [-1, 1]) {
    const humpP = new V3(s * m.W * 0.38, m.bodyY0 + m.D * 0.32, m.L * 0.25);
    r.add(ellipsoid(humpP, m.W * 0.28, m.D * 0.28, m.L * 0.26, 8, 6), 'body', col('body'));
  }
}

/** Hamadryas Baboon dog-like angular muzzle */
export function baboonSnoutExtra(r, m, col) {
  const hb = m.headBase, hd = m.hd, H = m.head || { len: 0.28, w: 0.088, h: 0.098 };
  const fCol = C('#c47870'); // bare flesh muzzle

  // Elongated dog-like muzzle with steep nasal bridge
  const snoutBase = hb.clone().addScaledVector(hd, H.len * 0.55).add(new V3(0, H.h * 0.15, 0));
  const snoutTip = hb.clone().addScaledVector(hd, H.len * 1.08).add(new V3(0, -H.h * 0.05, 0));
  const sPts = [snoutBase, snoutBase.clone().lerp(snoutTip, 0.5), snoutTip];
  r.add(loft(sPts, [H.w * 0.72, H.w * 0.58, H.w * 0.46], [H.h * 0.68, H.h * 0.58, H.h * 0.42], 8), 'head', fCol);

  // Heavy squared lower jaw
  const jawBase = hb.clone().addScaledVector(hd, H.len * 0.45).add(new V3(0, -H.h * 0.32, 0));
  const jawTip = hb.clone().addScaledVector(hd, H.len * 0.98).add(new V3(0, -H.h * 0.28, 0));
  r.add(limb(jawBase, jawTip, H.w * 0.52, H.w * 0.38, 6), 'head', fCol);

  // Black nostrils at the terminal snout tip
  const noseP = snoutTip.clone().add(new V3(0, H.h * 0.05, 0.01));
  r.add(ellipsoid(noseP, H.w * 0.28, H.h * 0.18, H.w * 0.15, 6, 4), 'head', C('#241a18'));
}

/** Baboon voluminous male silver cape / mantle */
export function baboonMantleExtra(r, m, col) {
  // Cascades over neck, withers, chest and flanks
  const withers = new V3(0, m.bodyY0 + m.D * 0.28, m.L * 0.28);
  r.add(ellipsoid(withers, m.W * 0.68, m.D * 0.58, m.L * 0.48, 12, 9), 'body', (cc, x, y, z) => {
    cc.set('#d2cebe'); // shimmering silver-white fur
    fur(cc, x, y, z, 0.35, 25);
  });
  // Chest ruff
  const chestRuff = new V3(0, m.bodyY0 - m.D * 0.05, m.L * 0.34);
  r.add(ellipsoid(chestRuff, m.W * 0.58, m.D * 0.48, m.L * 0.38, 10, 8), 'body', (cc, x, y, z) => {
    cc.set('#c8c2b4');
    fur(cc, x, y, z, 0.3, 25);
  });
  // Vivid pink/carmine rump ischial callosities
  for (const s of [-1, 1]) {
    const padP = new V3(s * m.W * 0.24, m.bodyY0 + m.D * 0.08, -m.L / 2 + 0.02);
    r.add(ellipsoid(padP, m.W * 0.18, m.D * 0.16, m.W * 0.12, 7, 5), 'body', C('#e05268'));
  }
}

/** Bonnet Macaque radiating crown cap whorl */
export function bonnetCapExtra(r, m, col) {
  const hb = m.headBase, hd = m.hd, H = m.head || { len: 0.16, w: 0.06, h: 0.065 };
  const crownP = hb.clone().add(new V3(0, H.h * 0.72, -H.len * 0.05));
  // Central dark hair whorl
  r.add(ellipsoid(crownP, H.w * 0.88, H.h * 0.24, H.w * 0.88, 10, 8), 'head', C('#544230'));
  // Radiating hair cap fringe
  for (let a = 0; a < 10; a++) {
    const ang = (a / 10) * Math.PI * 2;
    const rimP = crownP.clone().add(new V3(Math.cos(ang) * H.w * 0.85, -0.005, Math.sin(ang) * H.w * 0.85));
    r.add(ellipsoid(rimP, H.w * 0.22, H.h * 0.12, H.w * 0.22, 5, 4), 'head', C('#6a543e'));
  }
}

/** Rhesus Macaque red-orange rump & haunches */
export function rhesusRumpExtra(r, m, col) {
  // Bright copper/red-orange fur and callosities across rump
  for (const s of [-1, 1]) {
    const rumpP = new V3(s * m.W * 0.26, m.bodyY0 + m.D * 0.12, -m.L * 0.38);
    r.add(ellipsoid(rumpP, m.W * 0.24, m.D * 0.25, m.L * 0.18, 7, 5), 'body', C('#c8542a'));
    const padP = new V3(s * m.W * 0.20, m.bodyY0 + m.D * 0.06, -m.L / 2 + 0.02);
    r.add(ellipsoid(padP, m.W * 0.15, m.D * 0.14, m.W * 0.10, 6, 4), 'body', C('#d45045'));
  }
}

/** Stump-tailed Macaque shaggy coat & bright crimson face */
export function stumpFaceExtra(r, m, col) {
  const hb = m.headBase, hd = m.hd, H = m.head || { len: 0.18, w: 0.075, h: 0.08 };
  // Bright crimson / blood-red bare face mask
  const crimsonCol = C('#c42018');
  const browP = hb.clone().addScaledVector(hd, H.len * 0.38).add(new V3(0, H.h * 0.52, 0));
  r.add(ellipsoid(browP, H.w * 0.85, H.h * 0.28, H.len * 0.24, 8, 6), 'head', crimsonCol);
  const muzzleP = hb.clone().addScaledVector(hd, H.len * 0.74).add(new V3(0, H.h * 0.12, 0));
  r.add(ellipsoid(muzzleP, H.w * 0.72, H.h * 0.68, H.len * 0.32, 8, 6), 'head', crimsonCol);
}

/** Common Langur jet-black face & white fur halo */
export function langurHaloExtra(r, m, col) {
  const hb = m.headBase, hd = m.hd, H = m.head || { len: 0.18, w: 0.07, h: 0.075 };
  // Jet black face
  const blackFace = C('#121110');
  const faceP = hb.clone().addScaledVector(hd, H.len * 0.65).add(new V3(0, H.h * 0.25, 0));
  r.add(ellipsoid(faceP, H.w * 0.78, H.h * 0.72, H.len * 0.35, 8, 6), 'head', blackFace);

  // Striking white/pale fur halo ruff framing the entire head
  const haloC = hb.clone().add(new V3(0, H.h * 0.38, -H.len * 0.08));
  r.add(ellipsoid(haloC, H.w * 1.25, H.h * 1.15, H.len * 0.45, 10, 8), 'head', (cc, x, y, z) => {
    cc.set('#f2eee6'); // snowy white halo
    fur(cc, x, y, z, 0.25, 30);
  });
  // Cheek ruffs
  for (const s of [-1, 1]) {
    const cheekP = haloC.clone().add(new V3(s * H.w * 0.85, -H.h * 0.25, H.len * 0.15));
    r.add(ellipsoid(cheekP, H.w * 0.45, H.h * 0.45, H.len * 0.25, 6, 5), 'head', C('#f4f0e8'));
  }
}

/** Ring-tailed Lemur eye masks & facial markings */
export function lemurFaceExtra(r, m, col) {
  const hb = m.headBase, hd = m.hd, H = m.head || { len: 0.13, w: 0.04, h: 0.045 };
  // White face base
  const faceC = hb.clone().addScaledVector(hd, H.len * 0.5).add(new V3(0, H.h * 0.2, 0));
  r.add(ellipsoid(faceC, H.w * 0.95, H.h * 0.9, H.len * 0.45, 8, 6), 'head', C('#f4f0e6'));

  // Triangular black eye masks encircling warm amber eyes
  for (const s of [-1, 1]) {
    const eyeP = hb.clone().addScaledVector(hd, H.len * 0.42).add(new V3(s * H.w * 0.52, H.h * 0.32, 0));
    r.add(ellipsoid(eyeP, H.w * 0.35, H.h * 0.35, H.len * 0.22, 6, 5), 'head', C('#151311')); // dark mask
    r.add(ellipsoid(eyeP.clone().add(new V3(s * 0.003, 0, 0.008)), H.w * 0.16, H.h * 0.16, H.len * 0.12, 5, 4), 'head', C('#e49a24')); // amber iris
    r.add(ellipsoid(eyeP.clone().add(new V3(s * 0.005, 0, 0.012)), H.w * 0.07, H.h * 0.07, H.len * 0.06, 4, 3), 'head', C('#080605')); // pupil
  }

  // Jet-black muzzle tip and nose
  const noseP = hb.clone().addScaledVector(hd, H.len * 0.95).add(new V3(0, 0, 0));
  r.add(ellipsoid(noseP, H.w * 0.38, H.h * 0.32, H.len * 0.22, 6, 4), 'head', C('#12100e'));
}

// ----------------------------------------------------------------
// 3. MARMOSET EYE-LEVEL VIEWING PERCHES & FEEDING TRAYS
// Places eye-level branches & feeding trays right in front of the visitor viewing point.
// ----------------------------------------------------------------

export function setupMarmosetViewingPerches(en, scene, layers) {
  if (!en || en.species !== 'marmoset') return;
  en.perches = en.perches || [];

  // Compute viewing center & direction from en.view
  const viewX = en.view ? en.view.x : en.cx;
  const viewZ = en.view ? en.view.z : en.cz + en.r;
  const dirX = viewX - en.cx;
  const dirZ = viewZ - en.cz;
  const len = Math.hypot(dirX, dirZ) || 1;
  const uX = dirX / len;
  const uZ = dirZ / len;
  const pX = -uZ; // perpendicular vector along viewing fence
  const pZ = uX;

  // Position ~1.8m back from fence perimeter inside the exhibit, facing the visitor
  const fenceDist = Math.max(2.5, en.r * 0.68);
  const frontCX = en.cx + uX * fenceDist;
  const frontCZ = en.cz + uZ * fenceDist;
  const groundH = layers.heightAt(frontCX, frontCZ);

  // Eye-level height for human visitors standing at railing: ground + ~1.5m to 1.7m
  const eyeLevelY = groundH + 1.55;

  // 1. Central feeding tray platform
  const trayPos = new V3(frontCX, eyeLevelY, frontCZ);

  // 2. Lateral perching branches at eye-level extending across viewing angle
  const branchL = new V3(frontCX + pX * 2.2, eyeLevelY + 0.12, frontCZ + pZ * 2.2);
  const branchR = new V3(frontCX - pX * 2.2, eyeLevelY - 0.08, frontCZ - pZ * 2.2);
  const branchMidL = new V3(frontCX + pX * 0.9, eyeLevelY + 0.04, frontCZ + pZ * 0.9);
  const branchMidR = new V3(frontCX - pX * 0.9, eyeLevelY - 0.02, frontCZ - pZ * 0.9);

  // Put eye-level front perches FIRST in en.perches so marmosets actively favor them!
  en.perches.unshift(trayPos, branchMidL, branchMidR, branchL, branchR);

  // Build 3D visual geometry for the eye-level feeding station & branches
  if (scene) {
    const fixtureGroup = new THREE.Group();
    fixtureGroup.name = 'marmoset_viewing_station';

    // Supporting wooden post from ground to tray
    const postGeo = limb(new V3(frontCX, groundH - 0.2, frontCZ), new V3(frontCX, eyeLevelY, frontCZ), 0.075, 0.065, 8);
    const woodMat = new THREE.MeshStandardMaterial({ color: '#5a4634', roughness: 0.85 });
    fixtureGroup.add(new THREE.Mesh(postGeo, woodMat));

    // Wooden feeding tray platform
    const trayGeo = new THREE.CylinderGeometry(0.55, 0.50, 0.05, 12);
    trayGeo.translate(frontCX, eyeLevelY, frontCZ);
    const trayMat = new THREE.MeshStandardMaterial({ color: '#7a5e42', roughness: 0.8 });
    fixtureGroup.add(new THREE.Mesh(trayGeo, trayMat));

    // Raised rim around tray
    const rimGeo = new THREE.TorusGeometry(0.52, 0.025, 6, 16);
    rimGeo.rotateX(Math.PI / 2);
    rimGeo.translate(frontCX, eyeLevelY + 0.035, frontCZ);
    fixtureGroup.add(new THREE.Mesh(rimGeo, trayMat));

    // Sliced fruit pieces on feeding tray (apples, bananas, melon slices)
    const fruitColors = ['#d43828', '#f2d040', '#e06050', '#7db838', '#f09040'];
    for (let f = 0; f < 9; f++) {
      const fAng = (f / 9) * Math.PI * 2 + 0.3;
      const fDist = 0.15 + (f % 3) * 0.11;
      const fx = frontCX + Math.cos(fAng) * fDist;
      const fz = frontCZ + Math.sin(fAng) * fDist;
      const fruitGeo = new THREE.DodecahedronGeometry(0.045, 0);
      fruitGeo.translate(fx, eyeLevelY + 0.045, fz);
      const fruitMat = new THREE.MeshStandardMaterial({ color: fruitColors[f % fruitColors.length], roughness: 0.6 });
      fixtureGroup.add(new THREE.Mesh(fruitGeo, fruitMat));
    }

    // Branch rails connecting to tray
    const branchMat = new THREE.MeshStandardMaterial({ color: '#4a3828', roughness: 0.9 });
    const b1 = limb(trayPos, branchL, 0.042, 0.028, 6);
    const b2 = limb(trayPos, branchR, 0.042, 0.028, 6);
    fixtureGroup.add(new THREE.Mesh(b1, branchMat));
    fixtureGroup.add(new THREE.Mesh(b2, branchMat));

    scene.add(fixtureGroup);
  en.marmosetPerchesGroup = fixtureGroup;   // referenced by the visibility check
  }
}

// ----------------------------------------------------------------
// 4. PRIMATE BEHAVIORS (Social Grooming, Leaping, Knuckle-Walking, Sunbathing)
// ----------------------------------------------------------------

/**
 * Procedural update for mutual social grooming between adjacent primates.
 * One primate acts as groomer with rhythmic fur-picking finger motions; partner relaxes with head tilted.
 */
export function updatePrimateGrooming(a, partner, dt, t) {
  if (a.mixer && a.actions) return; // Driven by rigged Chimpanzee GLB AnimationMixer
  if (!a.bone || !a.bone.body) return;
  const isGroomer = a.groomRole !== 'receiver';

  if (isGroomer) {
    // Lean forward towards partner
    a.bone.body.rotation.x = -0.35 + Math.sin(t * 1.5) * 0.04;
    // Rhythmic picking / parting motions with arms and hands
    if (a.bone.lf1 && a.bone.rf1) {
      const pickL = Math.sin(t * 6.0);
      const pickR = Math.cos(t * 6.0);
      a.bone.lf1.rotation.set(-0.75 + pickL * 0.15, 0, 0.2);
      a.bone.lf2.rotation.set(1.45 + pickL * 0.25, 0, 0);
      a.bone.rf1.rotation.set(-0.75 + pickR * 0.15, 0, -0.2);
      a.bone.rf2.rotation.set(1.45 + pickR * 0.25, 0, 0);
    }
    // Head angled down looking closely into fur
    if (a.bone.neck) a.bone.neck.rotation.set(0.45 + Math.sin(t * 2.0) * 0.05, 0, 0);
    if (a.bone.head) a.bone.head.rotation.set(0.35, Math.sin(t * 1.8) * 0.12, 0);
  } else {
    // Receiver relaxes blissfully with head tilted up/back and limp limbs
    a.bone.body.rotation.set(0.15, 0, 0);
    if (a.bone.neck) a.bone.neck.rotation.set(-0.35 + Math.sin(t * 0.8) * 0.03, 0.25, 0);
    if (a.bone.head) a.bone.head.rotation.set(-0.25, 0.2, Math.sin(t * 0.5) * 0.08);
    if (a.bone.lf1 && a.bone.rf1) {
      a.bone.lf1.rotation.set(0.4, 0, 0.2);
      a.bone.rf1.rotation.set(0.4, 0, -0.2);
    }
  }
}

/**
 * Ring-tailed Lemur iconic sunbathing pose (upright lotus meditation posture).
 */
export function applyLemurSunbathingPose(a, t) {
  if (!a.bone || !a.bone.body) return;
  // Upright vertical torso exposing pale chest and belly to the sun
  a.bone.body.position.copy(a.rest.body);
  a.bone.body.position.y -= a.meta.leg * 0.42;
  a.bone.body.rotation.set(0.08 + Math.sin(t * 0.8) * 0.02, 0, 0);

  // Hind legs folded outwards in lotus posture
  if (a.bone.lh1 && a.bone.rh1) {
    a.bone.lh1.rotation.set(-1.15, 0, 0.75);
    a.bone.lh2.rotation.set(2.25, 0, 0);
    a.bone.rh1.rotation.set(-1.15, 0, -0.75);
    a.bone.rh2.rotation.set(2.25, 0, 0);
  }

  // Forearms resting relaxed on knees with open hands
  if (a.bone.lf1 && a.bone.rf1) {
    a.bone.lf1.rotation.set(-0.35, 0, 0.65);
    a.bone.lf2.rotation.set(0.65, 0, 0);
    a.bone.rf1.rotation.set(-0.35, 0, -0.65);
    a.bone.rf2.rotation.set(0.65, 0, 0);
  }

  // Head held proud facing upwards/sunwards
  if (a.bone.neck) a.bone.neck.rotation.set(-0.25, 0, 0);
  if (a.bone.head) a.bone.head.rotation.set(-0.15 + Math.sin(t * 0.6) * 0.03, Math.sin(t * 0.3) * 0.08, 0);

  // Striped tail curled elegantly along the ground
  if (a.bone.tail1) a.bone.tail1.rotation.set(0.2, 0.85, 0);
  if (a.bone.tail2) a.bone.tail2.rotation.set(0, 0.75, 0);
}

/**
 * Chimpanzee knuckle-walking locomotion pose.
 */
export function applyChimpKnuckleWalking(a, t, dt, g, ph) {
  if (a.mixer && a.actions) return; // Driven by rigged Chimpanzee GLB AnimationMixer
  if (!a.bone || !a.bone.body) return;
  const B = n => a.bone[n];
  const legH = a.meta.leg;

  // Hunched forward torso slope: withers tower over lower hips
  B('body').position.copy(a.rest.body);
  B('body').position.y += Math.abs(Math.sin(ph)) * 0.035 * legH * g;
  B('body').rotation.set(-0.42 + Math.sin(ph * 2) * 0.03 * g, Math.sin(ph) * 0.04 * g, 0);

  // Knuckle-walking forelimbs bear weight with wrists curled under
  const offs = { lh: 0, lf: Math.PI * 0.5, rh: Math.PI, rf: Math.PI * 1.5 };
  for (const n of a.meta.legs) {
    const front = n[1] === 'f', u = B(n + '1'), l = B(n + '2'), p = ph + offs[n];
    const stance = Math.sin(p);
    const lift = Math.max(0, -Math.cos(p));

    if (front) {
      // Long forelimb swings forward and plants knuckles firmly
      const ux = -stance * 0.52 * g - 0.25;
      const lx = 0.55 + lift * 0.75 * g;
      u.rotation.set(ux, 0, (n[0] === 'l' ? 1 : -1) * 0.12);
      l.rotation.set(lx, 0, 0);
    } else {
      // Shorter hindleg steps with flexed knee
      const ux = -stance * 0.44 * g - 0.20;
      const lx = 1.35 + lift * 0.85 * g;
      u.rotation.set(ux, 0, (n[0] === 'l' ? 1 : -1) * 0.08);
      l.rotation.set(lx, 0, 0);
    }
  }

  // Head held forward with keen gaze
  if (B('neck')) B('neck').rotation.set(0.35 + a.lookP * 0.5, a.look * 0.4, 0);
  if (B('head')) B('head').rotation.set(-0.15 + Math.sin(t * 1.2) * 0.03, a.look * 0.35, 0);
}

// ----------------------------------------------------------------
// 5. PROCEDURAL PRIMATE SOUNDSCAPE (Web Audio API)
// 100% procedural Web Audio synthesis for primate vocalizations.
// ----------------------------------------------------------------

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (window.__soundscape && window.__soundscape.ctx) return window.__soundscape.ctx;
  if (window.AudioContext || window.webkitAudioContext) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!window.__primateAudioCtx) window.__primateAudioCtx = new AC();
    return window.__primateAudioCtx;
  }
  return null;
}

function calculateGainAndPan(ctx, x, z, playerPos, maxDist = 26) {
  if (!ctx || !playerPos) return null;
  const dx = x - playerPos.x;
  const dz = z - playerPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > maxDist) return null;

  // Spatial volume attenuation
  const vol = Math.pow(1 - dist / maxDist, 1.6) * 0.22;
  const gain = ctx.createGain();
  gain.gain.value = vol;

  // Stereo panning based on relative angle to player
  let pan = 0;
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    const yaw = playerPos.yaw || 0;
    const relAngle = Math.atan2(dx, dz) - yaw;
    pan = clamp(Math.sin(relAngle), -0.9, 0.9);
    panner.pan.value = pan;
    gain.connect(panner);
    panner.connect(ctx.destination);
  } else {
    gain.connect(ctx.destination);
  }
  return gain;
}

/**
 * Delicate high-pitched twittering trill of the Common Marmoset (~4.8 - 6.2 kHz).
 */
export function playMarmosetTrill(x, z, playerPos) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const outGain = calculateGainAndPan(ctx, x, z, playerPos, 22);
  if (!outGain) return;

  const t0 = ctx.currentTime;
  const dur = 0.35 + Math.random() * 0.15;

  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const g = ctx.createGain();

  // 55 Hz vibrato flutter across high twittering pitch
  lfo.frequency.setValueAtTime(45 + Math.random() * 20, t0);
  lfoGain.gain.setValueAtTime(280, t0);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const baseF = 4600 + Math.random() * 800;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseF, t0);
  osc.frequency.exponentialRampToValueAtTime(baseF * 1.25, t0 + dur * 0.6);
  osc.frequency.exponentialRampToValueAtTime(baseF * 0.95, t0 + dur);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g);
  g.connect(outGain);

  lfo.start(t0);
  osc.start(t0);
  lfo.stop(t0 + dur + 0.05);
  osc.stop(t0 + dur + 0.05);
}

/**
 * Excited staccato monkey chatter (macaques / baboons / langurs).
 */
export function playPrimateChatter(x, z, playerPos) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const outGain = calculateGainAndPan(ctx, x, z, playerPos, 26);
  if (!outGain) return;

  const t0 = ctx.currentTime;
  const nClicks = 3 + Math.floor(Math.random() * 5);

  for (let i = 0; i < nClicks; i++) {
    const clickT = t0 + i * (0.055 + Math.random() * 0.035);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = 1400 + Math.random() * 900;

    osc.type = Math.random() < 0.5 ? 'triangle' : 'sawtooth';
    osc.frequency.setValueAtTime(f0, clickT);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.65, clickT + 0.04);

    g.gain.setValueAtTime(0.0001, clickT);
    g.gain.exponentialRampToValueAtTime(0.09, clickT + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, clickT + 0.045);

    osc.connect(g);
    g.connect(outGain);

    osc.start(clickT);
    osc.stop(clickT + 0.05);
  }
}

/**
 * Sharp high-frequency primate alarm / screech.
 */
export function playPrimateScreech(x, z, playerPos) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const outGain = calculateGainAndPan(ctx, x, z, playerPos, 30);
  if (!outGain) return;

  const t0 = ctx.currentTime;
  const dur = 0.42 + Math.random() * 0.18;

  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();

  const baseF = 1800 + Math.random() * 600;
  osc1.type = 'sawtooth';
  osc1.frequency.setValueAtTime(baseF, t0);
  osc1.frequency.exponentialRampToValueAtTime(baseF * 1.55, t0 + dur * 0.35);
  osc1.frequency.exponentialRampToValueAtTime(baseF * 0.85, t0 + dur);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(baseF * 1.95, t0);
  osc2.frequency.exponentialRampToValueAtTime(baseF * 2.8, t0 + dur * 0.35);
  osc2.frequency.exponentialRampToValueAtTime(baseF * 1.2, t0 + dur);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc1.connect(g);
  osc2.connect(g);
  g.connect(outGain);

  osc1.start(t0);
  osc2.start(t0);
  osc1.stop(t0 + dur + 0.05);
  osc2.stop(t0 + dur + 0.05);
}

/**
 * Chimpanzee pant-hoot: low rhythmic "hoo-hoo-hoo" building to excited scream.
 */
export function playChimpPantHoot(x, z, playerPos) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  const outGain = calculateGainAndPan(ctx, x, z, playerPos, 32);
  if (!outGain) return;

  const t0 = ctx.currentTime;
  const nHoots = 4 + Math.floor(Math.random() * 3);

  // Initial low rhythmic hoots
  for (let i = 0; i < nHoots; i++) {
    const hootT = t0 + i * (0.22 + i * 0.02);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = 160 + i * 35;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, hootT);
    osc.frequency.linearRampToValueAtTime(f0 * 1.4, hootT + 0.12);
    osc.frequency.linearRampToValueAtTime(f0 * 0.9, hootT + 0.18);

    g.gain.setValueAtTime(0.0001, hootT);
    g.gain.exponentialRampToValueAtTime(0.12, hootT + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, hootT + 0.20);

    osc.connect(g);
    g.connect(outGain);

    osc.start(hootT);
    osc.stop(hootT + 0.22);
  }

  // Climax pant-scream
  const screamT = t0 + nHoots * 0.24;
  const sOsc = ctx.createOscillator();
  const sGain = ctx.createGain();
  sOsc.type = 'sawtooth';
  sOsc.frequency.setValueAtTime(450, screamT);
  sOsc.frequency.exponentialRampToValueAtTime(950, screamT + 0.2);
  sOsc.frequency.exponentialRampToValueAtTime(320, screamT + 0.48);

  sGain.gain.setValueAtTime(0.0001, screamT);
  sGain.gain.exponentialRampToValueAtTime(0.14, screamT + 0.04);
  sGain.gain.exponentialRampToValueAtTime(0.0001, screamT + 0.5);

  sOsc.connect(sGain);
  sGain.connect(outGain);

  sOsc.start(screamT);
  sOsc.stop(screamT + 0.52);
}

export { attachChimpanzeeGLB } from './glb-chimpanzee.js';
