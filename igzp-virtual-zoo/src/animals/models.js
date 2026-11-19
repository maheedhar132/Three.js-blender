// Procedural, rigged animal models. Each species is built ONCE as a skinned geometry
// (rigid per-part bone weights; smooth blending along snake bodies) and instanced per
// individual with its own skeleton, so every animal is a single draw call.
//
// HONESTY NOTE: these are stylised procedural models with species-specific proportions,
// markings and silhouettes. They are not photoreal scans. `SPECIES_MODELS[id].glb` is the
// slot where a properly licensed GLB can replace the procedural model later.
import * as THREE from 'three';
import { V3, UP, clamp, lerp, sstep, noise2, noise3, hash2, paint, merge, loft, limb, ellipsoid } from '../core/util.js';
import { MARMOSET_BENCHMARK, CHIMP_PROF, chimpFaceExtra, baboonSnoutExtra, baboonMantleExtra, bonnetCapExtra, rhesusRumpExtra, stumpFaceExtra, langurHaloExtra, lemurFaceExtra } from './primates.js';

const C = h => new THREE.Color(h);

// ---------------------------------------------------------------- rig builder
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

/** Create one skinned individual from a built template. */
export function instantiate(tpl, material) {
  const bones = tpl.joints.map(j => { const b = new THREE.Bone(); b.name = j.name; return b; });
  const mesh = new THREE.SkinnedMesh(tpl.geo, material);
  tpl.joints.forEach((j, i) => {
    if (!j.parent) { bones[i].position.copy(j.pos); mesh.add(bones[i]); }
    else { const p = tpl.joints.findIndex(q => q.name === j.parent); bones[p].add(bones[i]); bones[i].position.copy(j.pos).sub(tpl.joints[p].pos); }
  });
  mesh.bind(new THREE.Skeleton(bones));
  const bone = {}; bones.forEach(b => (bone[b.name] = b));
  const rest = {}; bones.forEach(b => (rest[b.name] = b.position.clone()));
  mesh.castShadow = true; mesh.receiveShadow = true;
  return { mesh, bone, rest };
}

// ---------------------------------------------------------------- colour helpers
function voro(x, y, s = 1) {
  const xi = Math.floor(x), yi = Math.floor(y); let d1 = 9, d2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i + hash2(xi + i, yi + j + s * 31), cy = yi + j + hash2(xi + i + 17, yi + j + s * 7);
    const d = Math.hypot(x - cx, y - cy); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return [d1, d2];
}
/** Fur/skin noise so flat colours do not look plastic. */
const fur = (c, x, y, z, k = 0.22, f = 9) => c.multiplyScalar(1 - k / 2 + k * noise3(x * f, y * f, z * f));

// ---------------------------------------------------------------- limb & anatomy builders
const CANID_PROF = [
  [0, 0.44, 0.54, 0.04],     // tail base / rump
  [0.16, 0.62, 0.72, 0.05],  // pelvis
  [0.35, 0.48, 0.58, 0.12],  // tucked abdomen / flank waist
  [0.58, 0.82, 1.04, 0.02],  // ribcage posterior
  [0.74, 0.94, 1.24, -0.06], // deep chest between forelegs
  [0.88, 0.86, 1.10, 0.04],  // withers / chest anterior
  [1.0, 0.52, 0.68, 0.08]    // neck insertion
];

const HIPPO_PROF = [
  [0.0, 0.72, 0.76, 0.04],   // rotund rump
  [0.18, 0.96, 1.02, 0.02],  // massive pelvic girth
  [0.38, 1.18, 1.25, -0.08], // bulging belly & flanks
  [0.62, 1.20, 1.28, -0.06], // deep heavy ribcage
  [0.80, 1.08, 1.20, 0.02],  // powerful shoulders
  [0.92, 0.86, 0.98, 0.06],  // thick neck transition
  [1.0, 0.62, 0.74, 0.08]
];

function addCanidPaw(r, n, foot, rL, col) {
  // Main foot / metacarpal pad
  const pad = foot.clone().add(new V3(0, rL * 0.35, rL * 0.2));
  r.add(ellipsoid(pad, rL * 1.1, rL * 0.45, rL * 1.1, 8, 6), n + '2', col('shin'));
  // 4 distinct forward-radiating toe pads
  const toeAngles = [-0.38, -0.12, 0.12, 0.38];
  for (let i = 0; i < 4; i++) {
    const ang = toeAngles[i];
    const tx = pad.x + Math.sin(ang) * rL * 0.95;
    const tz = pad.z + Math.cos(ang) * rL * 1.15;
    const ty = foot.y + rL * 0.22;
    r.add(ellipsoid(new V3(tx, ty, tz), rL * 0.35, rL * 0.26, rL * 0.42, 6, 4), n + '2', col('shin'));
    // Small dark claw tip
    const clawP = new V3(tx + Math.sin(ang) * rL * 0.35, ty - rL * 0.08, tz + Math.cos(ang) * rL * 0.38);
    r.add(ellipsoid(clawP, rL * 0.09, rL * 0.08, rL * 0.15, 5, 4), n + '2', C('#141210'));
  }
}

function addPrimateHand(r, n, foot, rL, s, col, handCol, knuckleWalking) {
  const palm = foot.clone().add(new V3(0, rL * 0.3, rL * 0.1));
  const c = handCol ? C(handCol) : col('shin');
  r.add(ellipsoid(palm, rL * 1.0, rL * 0.4, rL * 1.1, 7, 5), n + '2', c);
  // 4 articulated curved grasping fingers
  for (let i = 0; i < 4; i++) {
    const fx = palm.x + (i - 1.5) * rL * 0.48;
    const f1 = new V3(fx, palm.y - rL * 0.1, palm.z + rL * 0.9);
    const f2 = knuckleWalking
      ? new V3(fx, palm.y - rL * 0.55, palm.z + rL * 0.45) // curled back under as weight-bearing knuckles!
      : new V3(fx, palm.y - rL * 0.45, palm.z + rL * 1.45);
    r.add(limb(f1, f2, rL * (knuckleWalking ? 0.30 : 0.22), rL * 0.16, 5), n + '2', c);
  }
  // Opposable thumb projecting medially
  const t1 = palm.clone().add(new V3(-s * rL * 0.7, 0, rL * 0.2));
  const t2 = palm.clone().add(new V3(-s * rL * 1.35, -rL * 0.3, rL * 0.55));
  r.add(limb(t1, t2, rL * 0.24, rL * 0.18, 5), n + '2', c);
}

function addPrimateFoot(r, n, foot, rL, s, col, footCol) {
  const sole = foot.clone().add(new V3(0, rL * 0.3, -rL * 0.1));
  const c = footCol ? C(footCol) : col('shin');
  r.add(ellipsoid(sole, rL * 0.95, rL * 0.45, rL * 1.4, 7, 5), n + '2', c);
  // 4 articulated climbing toes
  for (let i = 0; i < 4; i++) {
    const tx = sole.x + (i - 1.5) * rL * 0.44;
    const t1 = new V3(tx, sole.y - rL * 0.1, sole.z + rL * 1.1);
    const t2 = new V3(tx, sole.y - rL * 0.4, sole.z + rL * 1.55);
    r.add(limb(t1, t2, rL * 0.22, rL * 0.16, 5), n + '2', c);
  }
  // Opposable hallux (grasping big toe) extending medially
  const h1 = sole.clone().add(new V3(-s * rL * 0.65, 0, rL * 0.25));
  const h2 = sole.clone().add(new V3(-s * rL * 1.35, -rL * 0.3, rL * 0.65));
  r.add(limb(h1, h2, rL * 0.26, rL * 0.2, 5), n + '2', c);
}

function addHippoFoot(r, n, foot, rL, col) {
  const c = col('shin');
  const pad = foot.clone().add(new V3(0, rL * 0.4, rL * 0.15));
  r.add(ellipsoid(pad, rL * 1.4, rL * 0.55, rL * 1.5, 9, 6), n + '2', c);
  // 4 distinct splayed hoofed toes
  const toeAngles = [-0.65, -0.22, 0.22, 0.65];
  for (let i = 0; i < 4; i++) {
    const ang = toeAngles[i];
    const tx = pad.x + Math.sin(ang) * rL * 1.3;
    const tz = pad.z + Math.cos(ang) * rL * 1.35;
    const ty = foot.y + rL * 0.28;
    r.add(ellipsoid(new V3(tx, ty, tz), rL * 0.45, rL * 0.32, rL * 0.52, 6, 4), n + '2', c);
    const nailP = new V3(tx + Math.sin(ang) * rL * 0.4, ty - rL * 0.08, tz + Math.cos(ang) * rL * 0.42);
    r.add(ellipsoid(nailP, rL * 0.22, rL * 0.18, rL * 0.24, 6, 4), n + '2', C('#322826'));
  }
}

// ---------------------------------------------------------------- quadruped
/**
 * o: { L, D, W, leg, legF, prof, canid, primate, hippo, neck:{len,r0,r1,ang}, head:{len,w,h,snout,ang}, tail:{len,r,droop,tuft},
 *      ears:{type,len,w}, hoof, paint(c,x,y,z,part,meta), extra(rig, ctx) }
 */
function quadruped(o) {
  const r = new Rig(), { L, D, W, leg } = o, legF = o.legF || 1;
  const hipH = leg, shH = leg * legF;
  const bodyY = z => lerp(hipH, shH, clamp((z + L / 2) / L, 0, 1)) + D * 0.18;
  const meta = { L, D, W, leg, bodyY0: bodyY(0) };
  const col = part => (c, x, y, z) => o.paint(c, x, y, z, part, meta);
  r.meta = meta;
  // torso
  const prof = o.prof || (o.canid ? CANID_PROF : o.hippo ? HIPPO_PROF : [[0, 0.55, 0.62, 0.02], [0.12, 0.86, 0.9, 0], [0.32, 1, 1, 0], [0.55, 0.98, 1, 0], [0.78, 0.94, 1, 0.04], [0.93, 0.78, 0.86, 0.06], [1, 0.45, 0.55, 0.05]]);
  const pts = [], rx = [], ry = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16; let k = 0; while (k < prof.length - 2 && prof[k + 1][0] < t) k++;
    const a = prof[k], b = prof[k + 1], f = clamp((t - a[0]) / (b[0] - a[0]), 0, 1), s = f * f * (3 - 2 * f);
    const z = -L / 2 + t * L;
    pts.push(new V3(0, bodyY(z) + lerp(a[3], b[3], s) * D, z)); rx.push(W / 2 * lerp(a[1], b[1], s)); ry.push(D / 2 * lerp(a[2], b[2], s));
  }
  r.joint('body', null, new V3(0, bodyY(0), 0));
  r.add(loft(pts, rx, ry, 14), 'body', col('body'));
  // neck
  const nb = new V3(0, bodyY(L / 2) + D * 0.22, L / 2 - D * 0.28), na = o.neck.ang;
  const nd = new V3(0, Math.sin(na), Math.cos(na)), ne = nb.clone().addScaledVector(nd, o.neck.len);
  const npts = [nb.clone().addScaledVector(nd, -o.neck.r0 * 0.6), nb, nb.clone().lerp(ne, 0.5), ne];
  const nr = [o.neck.r0 * 1.05, o.neck.r0, lerp(o.neck.r0, o.neck.r1, 0.6), o.neck.r1];
  r.joint('neck', 'body', nb);
  r.add(loft(npts, nr.map(v => v * (o.neck.flat || 0.8)), nr, 10), 'neck', col('neck'));
  if (o.canid) {
    // Volumetric neck scruff / fur ruff around throat and withers
    const scruffP = nb.clone().lerp(ne, 0.45).add(new V3(0, -o.neck.r0 * 0.15, o.neck.len * 0.05));
    r.add(ellipsoid(scruffP, o.neck.r0 * 1.15, o.neck.r0 * 1.05, o.neck.len * 0.45, 8, 6), 'neck', col('scruff'));
  }
  // head
  const ha = o.head.ang, hd = new V3(0, Math.sin(ha), Math.cos(ha)), H = o.head;
  const hb = ne.clone().addScaledVector(hd, -H.h * 0.25);
  const hp = [0, 0.25, 0.5, 0.78, 1].map(t => hb.clone().addScaledVector(hd, H.len * t));
  const sn = H.snout;
  const nose = hb.clone().addScaledVector(hd, H.len * 1.0);
  meta.headTop = hb.clone().addScaledVector(hd, H.len * 0.18).add(new V3(0, H.h * 0.85, 0)); meta.hd = hd; meta.nose = nose; meta.headBase = hb; meta.neckEnd = ne;
  r.joint('head', 'neck', ne);
  r.add(loft(hp, [H.w * 0.85, H.w, H.w * 0.85, H.w * sn, H.w * sn * 0.75], [H.h * 0.8, H.h, H.h * 0.82, H.h * sn * 1.05, H.h * sn * 0.7], 12), 'head', col('head'));

  if (o.canid) {
    // Sharp lower jawline (mandible) & chin
    const jawPts = [
      hb.clone().addScaledVector(hd, H.len * 0.28).add(new V3(0, -H.h * 0.32, 0)),
      hb.clone().addScaledVector(hd, H.len * 0.65).add(new V3(0, -H.h * 0.25, 0)),
      hb.clone().addScaledVector(hd, H.len * 0.92).add(new V3(0, -H.h * 0.18, 0))
    ];
    r.add(loft(jawPts, [H.w * 0.52, H.w * 0.36, H.w * 0.20], [H.h * 0.22, H.h * 0.18, H.h * 0.12], 8), 'head', col('jaw'));
    // Lateral cheek fur flairs (zygomatic cheek ruffs)
    for (const s of [-1, 1]) {
      const cp = hb.clone().addScaledVector(hd, H.len * 0.28).add(new V3(s * H.w * 0.88, -H.h * 0.08, -H.len * 0.05));
      r.add(ellipsoid(cp, H.w * 0.38, H.h * 0.30, H.len * 0.22, 7, 5), 'head', col('cheekRuff'));
    }
    // Defined black nose leather
    r.add(ellipsoid(nose, H.w * sn * 0.65, H.h * sn * 0.52, H.w * 0.14, 8, 6), 'head', C('#12100e'));
    // Keen almond predator eyes with golden/amber irises
    for (const s of [-1, 1]) {
      const ep = hb.clone().addScaledVector(hd, H.len * 0.36).add(new V3(s * H.w * 0.72, H.h * 0.30, 0));
      r.add(ellipsoid(ep, H.w * 0.15, H.h * 0.15, H.w * 0.14, 7, 5), 'head', C('#14100c'));
      r.add(ellipsoid(ep.clone().add(new V3(s * 0.005, 0, 0.008)), H.w * 0.10, H.h * 0.10, H.w * 0.08, 6, 5), 'head', C('#c89632'));
      r.add(ellipsoid(ep.clone().add(new V3(s * 0.007, 0, 0.012)), H.w * 0.05, H.h * 0.05, H.w * 0.04, 5, 4), 'head', C('#080605'));
    }
    // Erect pointed wolf ears with pale inner ear fur pocket
    const E = o.ears || { len: 0.11, w: 0.05 };
    for (const s of [-1, 1]) {
      const base = meta.headTop.clone().add(new V3(s * H.w * 0.65, -H.h * 0.08, -H.len * 0.05));
      const tip = base.clone().add(new V3(s * E.w * 0.45, E.len * 0.95, -E.len * 0.12));
      r.add(loft([base, base.clone().lerp(tip, 0.5), tip], [E.w * 0.75, E.w * 0.95, E.w * 0.15], [E.w * 0.32, E.w * 0.42, E.w * 0.08], 6), 'head', col('ear'));
      const inBase = base.clone().add(new V3(-s * E.w * 0.08, 0, E.w * 0.10));
      const inTip = tip.clone().add(new V3(-s * E.w * 0.08, -E.len * 0.10, E.w * 0.06));
      r.add(loft([inBase, inBase.clone().lerp(inTip, 0.5), inTip], [E.w * 0.45, E.w * 0.55, E.w * 0.08], [E.w * 0.15, E.w * 0.20, E.w * 0.05], 5), 'head', C(o.earInnerCol || '#e2d8c6'));
    }
  } else if (o.primate) {
    // Primate cranium dome, defined brow ridge, bare muzzle & lateral ears
    r.add(ellipsoid(hb.clone().add(new V3(0, H.h * 0.45, -H.len * 0.12)), H.w * 0.88, H.h * 0.75, H.len * 0.42, 8, 6), 'head', col('head'));
    const fCol = o.faceCol ? C(o.faceCol) : col('face');
    const browP = hb.clone().addScaledVector(hd, H.len * 0.35).add(new V3(0, H.h * 0.55, 0));
    r.add(ellipsoid(browP, H.w * 0.72, H.h * 0.25, H.len * 0.22, 8, 6), 'head', fCol);
    for (const s of [-1, 1]) {
      const ep = hb.clone().addScaledVector(hd, H.len * 0.38).add(new V3(s * H.w * 0.42, H.h * 0.35, 0));
      r.add(ellipsoid(ep, H.w * 0.16, H.h * 0.16, H.w * 0.14, 6, 5), 'head', C('#12100e'));
    }
    const muzzleP = hb.clone().addScaledVector(hd, H.len * 0.72).add(new V3(0, H.h * 0.12, 0));
    r.add(ellipsoid(muzzleP, H.w * sn * 0.85, H.h * sn * 0.8, H.len * 0.32, 8, 6), 'head', fCol);
    r.add(ellipsoid(nose, H.w * sn * 0.45, H.h * sn * 0.32, H.w * 0.12, 6, 4), 'head', C(o.noseCol || '#1b1614'));
    const E = o.ears || { len: 0.04, w: 0.03 };
    for (const s of [-1, 1]) {
      const earP = hb.clone().addScaledVector(hd, H.len * 0.15).add(new V3(s * H.w * 0.95, H.h * 0.32, -H.len * 0.05));
      r.add(ellipsoid(earP, E.w * 0.35, E.len * 0.95, E.len * 0.8, 7, 5), 'head', fCol);
    }
    for (const s of [-1, 1]) {
      const padP = new V3(s * W * 0.22, bodyY(-L / 2) + D * 0.08, -L / 2 + 0.02);
      r.add(ellipsoid(padP, W * 0.14, D * 0.12, W * 0.08, 6, 4), 'body', o.callosityCol ? C(o.callosityCol) : fCol);
    }
  } else if (!o.hippo) {
    const eyeP = hb.clone().addScaledVector(hd, H.len * 0.32).add(new V3(0, H.h * 0.35, 0));
    for (const s of [-1, 1]) r.add(ellipsoid(eyeP.clone().add(new V3(s * H.w * 0.86, 0, 0)), H.w * 0.13, H.w * 0.13, H.w * 0.13, 8, 6), 'head', C('#0e0c0a'));
    r.add(ellipsoid(nose, H.w * sn * 0.62, H.h * sn * 0.5, H.w * 0.12, 8, 6), 'head', C(o.noseCol || '#1b1614'));
    if (o.ears && o.ears.type !== 'big') {
      const E = o.ears;
      for (const s of [-1, 1]) {
        const base = meta.headTop.clone().add(new V3(s * H.w * 0.6, -H.h * 0.1, -H.len * 0.05));
        const tip = base.clone().add(new V3(s * E.len * (E.type === 'side' ? 0.9 : 0.35), E.len * (E.type === 'side' ? 0.15 : 0.9), -E.len * 0.15));
        r.add(loft([base, base.clone().lerp(tip, 0.5), tip], [E.w * 0.7, E.w, E.w * 0.2], [E.w * 0.35, E.w * 0.45, E.w * 0.1], 6), 'head', col('ear'));
      }
    }
  }

  // legs (upper/lower with muscled top and species-specific feet)
  const legs = [['lf', 1, L / 2 * 0.62, shH, true], ['rf', -1, L / 2 * 0.62, shH, true], ['lh', 1, -L / 2 * 0.64, hipH, false], ['rh', -1, -L / 2 * 0.64, hipH, false]];
  const rU = o.legR || W * 0.13, rL = rU * (o.legTaper || 0.62);
  meta.legs = [];
  for (const [n, s, z, jh, front] of legs) {
    const x = s * W * (o.legSpread || 0.3);
    const top = new V3(x, jh, z), knee = new V3(x, jh * 0.46, z + (front ? 0.02 : -0.11) * jh), foot = new V3(x, 0.02, z + (front ? 0.0 : -0.04) * jh);
    r.joint(n + '1', 'body', top).joint(n + '2', n + '1', knee);
    if (!o.pillarLegs) r.add(ellipsoid(top.clone().add(new V3(0, jh * 0.02, front ? 0 : -rU * 0.3)), rU * 1.25, Math.min(D * 0.4, jh * 0.3), rU * (front ? 1.35 : 1.8), 10, 8), n + '1', col('thigh'));
    r.add(limb(top, knee, rU * 1.05, rU * 0.75, 8), n + '1', col('leg'));
    r.add(limb(knee, foot, rL, rL * 0.8, 8), n + '2', col('shin'));
    if (o.hippo) {
      addHippoFoot(r, n, foot, rL, col);
    } else if (o.primate) {
      if (front) addPrimateHand(r, n, foot, rL, s, col, o.handCol, o.knuckleWalking);
      else addPrimateFoot(r, n, foot, rL, s, col, o.footCol || o.handCol);
    } else if (o.canidPaw || o.canid) {
      addCanidPaw(r, n, foot, rL, col);
    } else {
      r.add(ellipsoid(foot.clone().add(new V3(0, rL * 0.5, rL * 0.4)), rL * (o.paw ? 1.5 : 1.05), rL * 0.75, rL * (o.paw ? 1.9 : 1.3), 8, 6), n + '2', o.hoof ? C(o.hoof) : col('shin'));
    }
    meta.legs.push(n);
  }

  // tail (two bones)
  if (o.tail) {
    const T = o.tail, tb = new V3(0, bodyY(-L / 2) + D * 0.22, -L / 2 + 0.04), dr = T.droop ?? 0.85;
    const dir = T.arched
      ? new V3(0, 0.75, -0.65).normalize()
      : new V3(0, -dr, -Math.sqrt(1 - dr * dr)).normalize();
    const tpts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      if (T.arched) {
        const archY = Math.sin(t * Math.PI) * T.len * 0.35 - t * T.len * 0.45;
        const archZ = -t * T.len * 0.85;
        tpts.push(tb.clone().add(new V3(0, archY, archZ)));
      } else {
        tpts.push(tb.clone().addScaledVector(dir, T.len * t).add(new V3(0, 0, -T.len * 0.15 * t * t)));
      }
    }
    const tm = tpts[3];
    r.joint('tail1', 'body', tb).joint('tail2', 'tail1', tm);
    if (o.canid || T.bushy) {
      const rad = i => T.r * (1.6 + Math.sin(i / 6 * Math.PI) * 0.8) * (1 - i / 7 * 0.35);
      r.add(loft(tpts.slice(0, 4), [0, 1, 2, 3].map(rad), [0, 1, 2, 3].map(rad), 8), 'tail1', col('tail'));
      r.add(loft(tpts.slice(3), [3, 4, 5, 6].map(rad), [3, 4, 5, 6].map(rad), 8), 'tail2', col('tail'));
    } else {
      const rad = i => T.r * (1 - i / 7 * 0.7);
      r.add(loft(tpts.slice(0, 4), [0, 1, 2, 3].map(rad), [0, 1, 2, 3].map(rad), 7), 'tail1', col('tail'));
      r.add(loft(tpts.slice(3), [3, 4, 5, 6].map(rad), [3, 4, 5, 6].map(rad), 7), 'tail2', col('tail'));
    }
    if (T.tuft) r.add(ellipsoid(tpts[6], T.r * 1.8, T.r * 3, T.r * 1.8, 8, 6), 'tail2', C(T.tuft));
  }
  if (o.extra) o.extra(r, meta, col);
  return r.build();
}

// ---------------------------------------------------------------- bird
function bird(o) {
  const r = new Rig(), { L, H, leg } = o, by = leg + H * 0.5;
  const meta = { L, D: H, leg, bodyY0: by, legs: ['legL', 'legR'] };
  const col = part => (c, x, y, z) => o.paint(c, x, y, z, part, meta);
  r.meta = meta;
  r.joint('body', null, new V3(0, by, 0));

  // Body profile (boat hull for buoyant water birds, aerodynamic for flyers/waders)
  if (o.boatHull || o.swan || o.pelican) {
    const wide = o.wide || 1.35;
    const bp = [-0.5, -0.28, 0, 0.28, 0.5].map(t => new V3(0, by + (o.tilt || 0.15) * t * L + (t < -0.2 ? -t * H * 0.15 : 0), t * L));
    const rx = [0.28, 0.48, 0.56, 0.46, 0.24].map(v => v * H * wide);
    const ry = [0.24, 0.42, 0.48, 0.44, 0.28].map(v => v * H);
    r.add(loft(bp, rx, ry, 14), 'body', col('body'));
  } else {
    const bp = [-0.5, -0.3, 0, 0.3, 0.5].map(t => new V3(0, by + (o.tilt || 0.15) * t * L, t * L));
    const wide = o.wide || 1;
    r.add(loft(bp, [0.28, 0.42, 0.5, 0.42, 0.25].map(v => v * H * wide), [0.3, 0.45, 0.5, 0.44, 0.28].map(v => v * H), 12), 'body', col('body'));
  }

  // Neck (graceful S-curves for swan and crane; sleek raptor/ground neck)
  const nb = new V3(0, by + H * 0.25, L * 0.42), N = o.neck;
  let npts, nr;
  if (o.swan) {
    const offsets = [
      [0, 0, 0],
      [0, N * 0.18, N * 0.14],
      [0, N * 0.42, N * 0.12],
      [0, N * 0.66, -N * 0.04],
      [0, N * 0.84, -N * 0.14],
      [0, N * 0.96, -N * 0.08],
      [0, N * 1.04, N * 0.04],
      [0, N * 1.08, N * 0.16]
    ];
    npts = offsets.map(d => nb.clone().add(new V3(d[0], d[1], d[2])));
    const baseR = o.neckR;
    nr = [baseR * 1.4, baseR * 1.2, baseR * 0.98, baseR * 0.86, baseR * 0.82, baseR * 0.86, baseR * 0.92, baseR * 0.96];
  } else if (o.sCurve || o.crane) {
    const offsets = [
      [0, 0, 0],
      [0, N * 0.25, N * 0.12],
      [0, N * 0.55, -N * 0.02],
      [0, N * 0.82, -N * 0.06],
      [0, N * 1.0, N * 0.08]
    ];
    npts = offsets.map(d => nb.clone().add(new V3(d[0], d[1], d[2])));
    const baseR = o.neckR;
    nr = [baseR * 1.3, baseR * 1.05, baseR * 0.9, baseR * 0.85, baseR * 0.88];
  } else {
    npts = [nb, nb.clone().add(new V3(0, N * 0.45, N * 0.15)), nb.clone().add(new V3(0, N * 0.8, N * 0.05)), nb.clone().add(new V3(0, N, N * 0.12))];
    nr = [o.neckR * 1.3, o.neckR, o.neckR * 0.9, o.neckR * 0.85];
  }

  const headBase = npts[npts.length - 1];
  meta.headBase = headBase;
  r.joint('neck', 'body', nb);
  r.add(loft(npts, nr.map(v => v * (o.neckFlat || 0.9)), nr, 10), 'neck', col('neck'));

  // Head
  r.joint('head', 'neck', headBase);
  const hc = headBase.clone().add(new V3(0, o.headR * 0.5, 0));
  r.add(ellipsoid(hc, o.headR * 0.85, o.headR, o.headR * 1.2, 10, 8), 'head', col('head'));

  // Eyes
  for (const s of [-1, 1]) {
    const eyePos = hc.clone().add(new V3(s * o.headR * 0.78, o.headR * 0.22, o.headR * 0.32));
    if (o.raptor) {
      r.add(ellipsoid(eyePos.clone().add(new V3(0, o.headR * 0.22, -o.headR * 0.05)), o.headR * 0.28, o.headR * 0.14, o.headR * 0.32, 6, 4), 'head', col('head'));
      r.add(ellipsoid(eyePos, o.headR * 0.22, o.headR * 0.22, o.headR * 0.2, 6, 5), 'head', C('#161412'));
      r.add(ellipsoid(eyePos.clone().add(new V3(s * 0.005, 0, 0.008)), o.headR * 0.15, o.headR * 0.15, o.headR * 0.12, 6, 5), 'head', C('#dca22e'));
      r.add(ellipsoid(eyePos.clone().add(new V3(s * 0.008, 0, 0.012)), o.headR * 0.07, o.headR * 0.07, o.headR * 0.06, 5, 4), 'head', C('#0a0806'));
    } else {
      r.add(ellipsoid(eyePos, o.headR * 0.18, o.headR * 0.18, o.headR * 0.18, 6, 5), 'head', C('#0c0a08'));
    }
  }

  // Beaks
  const bk = hc.clone().add(new V3(0, -o.headR * 0.1, o.headR * 0.9));
  if (o.swan) {
    const billTip = bk.clone().add(new V3(0, -o.beak * 0.2, o.beak));
    r.add(loft([bk, bk.clone().lerp(billTip, 0.5), billTip], [o.headR * 0.45, o.headR * 0.36, 0.08 * o.headR], [o.headR * 0.25, o.headR * 0.2, 0.05 * o.headR], 8), 'head', C(o.beakCol || '#e27220'));
    // Black basal knob (iconic frontal caruncle on top base of bill)
    const knobP = bk.clone().add(new V3(0, o.headR * 0.24, -o.headR * 0.08));
    r.add(ellipsoid(knobP, o.headR * 0.25, o.headR * 0.32, o.headR * 0.24, 8, 6), 'head', C('#121110'));
    // Black facial mask (lores) connecting bill to eyes
    for (const s of [-1, 1]) {
      const loreP = bk.clone().add(new V3(s * o.headR * 0.42, o.headR * 0.12, -o.headR * 0.15));
      r.add(ellipsoid(loreP, o.headR * 0.22, o.headR * 0.18, o.headR * 0.26, 6, 4), 'head', C('#141210'));
    }
  } else if (o.raptor) {
    // Hooked raptor beak with bright cere
    const cereTip = bk.clone().add(new V3(0, -o.beak * 0.1, o.beak * 0.38));
    r.add(loft([bk, cereTip], [o.headR * 0.42, o.headR * 0.32], [o.headR * 0.45, o.headR * 0.35], 7), 'head', C(o.cereCol || '#e2b228'));
    const hook1 = cereTip.clone();
    const hook2 = hook1.clone().add(new V3(0, -o.beak * 0.35, o.beak * 0.5));
    const hookTip = hook1.clone().add(new V3(0, -o.beak * 0.85, o.beak * 0.55));
    r.add(loft([hook1, hook2, hookTip], [o.headR * 0.32, o.headR * 0.22, 0.02 * o.headR], [o.headR * 0.35, o.headR * 0.26, 0.02 * o.headR], 7), 'head', C(o.beakCol || '#2a2622'));
  } else if (o.crane) {
    // Long straight dagger/spear bill
    const tip = bk.clone().add(new V3(0, -o.beak * 0.15, o.beak));
    r.add(loft([bk, bk.clone().lerp(tip, 0.5), tip], [o.headR * 0.32, o.headR * 0.2, 0.02], [o.headR * 0.32, o.headR * 0.2, 0.02], 7), 'head', C(o.beakCol || '#585950'));
  } else if (o.pelican) {
    const tip = bk.clone().add(new V3(0, -o.beak * 0.08, o.beak));
    r.add(loft([bk, bk.clone().lerp(tip, 0.5), tip], [o.headR * 0.38, o.headR * 0.28, 0.06], [o.headR * 0.18, o.headR * 0.15, 0.04], 7), 'head', C(o.beakCol || '#e2b048'));
    const pouchMid = bk.clone().add(new V3(0, -o.beak * 0.45, o.beak * 0.52));
    r.add(ellipsoid(pouchMid, o.headR * 0.42, o.beak * 0.38, o.beak * 0.45, 9, 6), 'head', C(o.pouchCol || '#e6a836'));
  } else {
    r.add(loft([bk, bk.clone().add(new V3(0, -o.beak * (o.beakDown || 0.25), o.beak))], [o.headR * 0.38, 0.01], [o.headR * 0.3 * (o.pouch ? 2 : 1), 0.01], 6), 'head', C(o.beakCol));
  }

  // Wings (folded with sculpted contours, bones wingL and wingR)
  for (const [n, s] of [['wingL', 1], ['wingR', -1]]) {
    const root = new V3(s * H * (o.boatHull ? 0.52 : 0.42), by + H * 0.22, L * 0.22);
    r.joint(n, 'body', root);
    if (o.swan) {
      const w1 = root;
      const w2 = root.clone().add(new V3(s * 0.05, H * 0.12, -L * 0.38));
      const w3 = root.clone().add(new V3(s * 0.03, H * 0.04, -L * 0.72));
      const w4 = root.clone().add(new V3(s * 0.01, H * 0.02, -L * 0.95));
      r.add(loft([w1, w2, w3, w4], [H * 0.10, H * 0.12, H * 0.08, 0.02], [H * 0.32, H * 0.36, H * 0.25, 0.03], 7), n, col('wing'));
    } else if (o.raptor) {
      const w1 = root;
      const w2 = root.clone().add(new V3(s * 0.06, 0.04, -L * 0.42));
      const w3 = root.clone().add(new V3(s * 0.04, 0.01, -L * 0.85));
      const w4 = root.clone().add(new V3(s * 0.02, -0.02, -L * 1.05));
      r.add(loft([w1, w2, w3, w4], [H * 0.12, H * 0.13, H * 0.09, 0.02], [H * 0.35, H * 0.32, H * 0.24, 0.03], 7), n, col('wing'));
    } else {
      const wp = [root, root.clone().add(new V3(s * 0.04, 0.02, -L * 0.45)), root.clone().add(new V3(s * 0.02, 0.0, -L * 0.85))];
      r.add(loft(wp, [H * 0.08, H * 0.07, 0.01], [H * 0.3, H * 0.26, 0.02], 6), n, col('wing'));
    }
  }

  // Tail
  if (o.tail) {
    const tb = new V3(0, by + H * (o.swan ? 0.12 : 0.05), -L * 0.5);
    r.joint('tail', 'body', tb);
    if (o.swan) {
      const ttip = tb.clone().add(new V3(0, o.tail * 0.35, -o.tail));
      r.add(loft([tb, tb.clone().lerp(ttip, 0.5), ttip], [H * 0.22, H * 0.16, 0.02], [H * 0.12, H * 0.08, 0.01], 7), 'tail', col('tail'));
    } else if (o.crane) {
      const ttip = tb.clone().add(new V3(0, -o.tail * 0.45, -o.tail));
      r.add(loft([tb, tb.clone().lerp(ttip, 0.5), ttip], [H * 0.22, H * 0.26, 0.04], [H * 0.14, H * 0.12, 0.02], 7), 'tail', col('tail'));
    } else {
      r.add(loft([tb, tb.clone().add(new V3(0, -o.tail * 0.15, -o.tail))], [H * 0.18, H * (o.fan || 0.12)], [H * 0.06, 0.01], 6), 'tail', col('tail'));
    }
  }

  // Legs & Feet
  for (const [n, s] of [['legL', 1], ['legR', -1]]) {
    const top = new V3(s * H * (o.boatHull ? 0.32 : 0.2), leg + 0.02, 0);
    const knee = new V3(s * H * (o.boatHull ? 0.32 : 0.2), leg * 0.5, -leg * 0.04);
    const foot = new V3(s * H * (o.boatHull ? 0.32 : 0.2), 0.02, 0.0);
    r.joint(n + '1', 'body', top).joint(n + '2', n + '1', knee);
    r.add(limb(top.clone().add(new V3(0, H * 0.15, 0)), knee, o.legR * 1.6, o.legR, 6), n + '1', C(o.legCol));
    r.add(limb(knee, foot, o.legR, o.legR * 0.8, 6), n + '2', C(o.legCol));

    if (o.swan || o.pelican) {
      const footP = foot.clone().add(new V3(0, 0.01, leg * 0.08));
      r.add(ellipsoid(footP, o.legR * 3.2, o.legR * 0.45, leg * 0.22, 7, 4), n + '2', C(o.legCol));
    } else if (o.raptor) {
      const footP = foot.clone().add(new V3(0, 0.015, 0));
      r.add(ellipsoid(footP, o.legR * 1.4, o.legR * 0.8, o.legR * 1.5, 6, 4), n + '2', C(o.legCol));
      for (const [tx, tz, clx, clz] of [[-0.015, 0.025, -0.02, 0.038], [0, 0.03, 0, 0.045], [0.015, 0.025, 0.02, 0.038], [0, -0.025, 0, -0.038]]) {
        const t1 = footP.clone().add(new V3(tx, 0, tz));
        r.add(limb(footP, t1, o.legR * 0.6, o.legR * 0.45, 4), n + '2', C(o.legCol));
        r.add(ellipsoid(footP.clone().add(new V3(clx, -0.005, clz)), o.legR * 0.3, o.legR * 0.3, o.legR * 0.5, 5, 4), n + '2', C('#151311'));
      }
    } else {
      r.add(ellipsoid(foot.clone().add(new V3(0, 0.01, leg * 0.06)), o.legR * 2.4, o.legR * 0.6, leg * 0.1 + 0.02, 6, 4), n + '2', C(o.legCol));
    }
  }

  if (o.extra) o.extra(r, meta, col);
  return r.build();
}

// ---------------------------------------------------------------- reptiles
function reptile(o) {
  const r = new Rig(), { L, W, H, leg } = o, by = leg * 0.9 + H * 0.4;
  const meta = { L, D: H, leg, bodyY0: by };
  const col = part => (c, x, y, z) => o.paint(c, x, y, z, part, meta);
  r.meta = meta;
  const bodyL = L * 0.42, tailL = L * (o.tailFrac || 0.45), headL = L - bodyL - tailL;
  const z0 = -bodyL / 2, z1 = bodyL / 2;
  r.joint('body', null, new V3(0, by, 0));
  r.add(loft([-0.5, -0.25, 0, 0.25, 0.5].map(t => new V3(0, by, t * bodyL)), [0.75, 0.95, 1, 0.95, 0.8].map(v => v * W / 2), [0.7, 0.9, 1, 0.92, 0.75].map(v => v * H / 2), 12), 'body', col('body'));
  // head
  const hb = new V3(0, by + H * 0.05, z1);
  r.joint('head', 'body', hb);
  r.add(loft([0, 0.2, 0.45, 0.75, 1].map(t => hb.clone().add(new V3(0, -t * H * 0.15, t * headL))), [0.42, 0.42, o.snout * 0.5, o.snout * 0.4, o.snout * 0.3].map(v => v * W), [0.38, 0.32, 0.2, 0.15, 0.12].map(v => v * H * (o.headH || 1.2)), 10), 'head', col('head'));
  for (const s of [-1, 1]) r.add(ellipsoid(hb.clone().add(new V3(s * W * 0.17, H * 0.22, headL * 0.18)), W * 0.05, W * 0.05, W * 0.05, 6, 5), 'head', C('#151208'));
  if (o.ghara) r.add(ellipsoid(hb.clone().add(new V3(0, -H * 0.12, headL)), W * 0.1, W * 0.08, W * 0.09, 6, 5), 'head', col('head'));
  // tail chain
  const tb = new V3(0, by, z0), seg = 3;
  let prev = 'body';
  for (let i = 0; i < seg; i++) {
    const a = tb.clone().add(new V3(0, -H * 0.05 * i, -tailL * i / seg)), b = tb.clone().add(new V3(0, -H * 0.05 * (i + 1), -tailL * (i + 1) / seg));
    const n = 'tail' + (i + 1); r.joint(n, prev, a); prev = n;
    const ra = W / 2 * (1 - i / seg) * 0.85, rb = W / 2 * (1 - (i + 1) / seg) * 0.85 + 0.01;
    r.add(loft([a, b], [ra, rb], [ra * (o.tailFlat || 0.9), rb * (o.tailFlat || 0.9)], 8), n, col('tail'));
    if (o.spikes) for (let k = 0; k < 4; k++) { const p = a.clone().lerp(b, k / 4).add(new V3(0, ra * 0.9, 0)); r.add(limb(p, p.clone().add(new V3(0, ra * 0.5, -0.02)), 0.01, 0.002, 4), n, col('spike')); }
  }
  if (o.spikes) for (let k = 0; k < 10; k++) { const p = new V3(0, by + H * 0.48, z0 + bodyL * k / 10); r.add(limb(p, p.clone().add(new V3(0, H * 0.35, -0.02)), 0.012, 0.002, 4), 'body', col('spike')); }
  // sprawled legs
  meta.legs = [];
  for (const [n, s, z] of [['lf', 1, z1 * 0.7], ['rf', -1, z1 * 0.7], ['lh', 1, z0 * 0.75], ['rh', -1, z0 * 0.75]]) {
    const top = new V3(s * W * 0.42, by - H * 0.15, z), knee = new V3(s * (W * 0.42 + leg * 0.7), by - H * 0.1, z), foot = new V3(s * (W * 0.42 + leg * 0.8), 0.02, z + 0.02);
    r.joint(n + '1', 'body', top).joint(n + '2', n + '1', knee);
    r.add(limb(top, knee, leg * 0.22, leg * 0.16, 6), n + '1', col('leg'));
    r.add(limb(knee, foot, leg * 0.15, leg * 0.12, 6), n + '2', col('leg'));
    r.add(ellipsoid(foot, leg * 0.22, leg * 0.06, leg * 0.25, 6, 4), n + '2', col('leg'));
    meta.legs.push(n);
  }
  return r.build();
}

// ---------------------------------------------------------------- snake
function snake(o) {
  const r = new Rig(), N = 10, L = o.L, R = o.R, by = R;
  const meta = { L, D: R * 2, leg: 0, bodyY0: by, snake: true, N };
  r.meta = meta;
  // bones along +z: s0 at tail ... s9 near head
  for (let i = 0; i < N; i++) r.joint('s' + i, i ? 's' + (i - 1) : null, new V3(0, by, -L / 2 + L * i / (N - 1)));

  // Continuous organic tapering across 50 sections
  const N_PTS = 50;
  const pts = [], rx = [], ry = [];
  for (let i = 0; i <= N_PTS; i++) {
    const t = i / N_PTS;
    pts.push(new V3(0, by, -L / 2 + L * t));
    let baseR;
    if (t < 0.25) {
      // Slender whip tail tapering smoothly from 0.08 * R at the tip to 0.85 * R
      const f = t / 0.25;
      baseR = R * (0.08 + 0.77 * Math.pow(f, 0.75));
    } else if (t < 0.75) {
      // Full muscular mid-body girth
      const f = (t - 0.25) / 0.5;
      baseR = R * (0.85 + 0.15 * Math.sin(f * Math.PI));
    } else {
      // Anterior body towards neck
      const f = (t - 0.75) / 0.25;
      baseR = R * (1.0 - f * 0.25);
    }

    if (o.hood && t >= 0.78 && t <= 0.94) {
      // Indian Cobra cervical hood expansion: flared ribs
      const hf = Math.sin((t - 0.78) / 0.16 * Math.PI);
      rx.push(baseR * (1.0 + hf * 2.85));
      ry.push(baseR * (0.95 - hf * 0.40));
    } else if (o.python) {
      // Python triangular cross-section with muscular dorsal ridge
      rx.push(baseR * 1.18);
      ry.push(baseR * 1.05);
    } else {
      // Colubrid racer: agile streamlined belly
      rx.push(baseR * 1.12);
      ry.push(baseR * 0.96);
    }
  }

  const wf = (x, y, z) => {
    const f = clamp((z + L / 2) / L * (N - 1), 0, N - 1.001), i = Math.floor(f), w = f - i;
    return [i, 1 - w, i + 1, w];
  };
  r.addBlend(loft(pts, rx, ry, 12), wf, (c, x, y, z) => o.paint(c, x, y, z, 'body', meta));

  // Sculpted snake head attached to head joint
  r.joint('head', 's' + (N - 1), new V3(0, by, L / 2));
  const hb = new V3(0, by, L / 2);
  const headL = R * (o.python ? 2.2 : 1.8);
  const headW = R * (o.python ? 1.5 : 1.25);
  const headH = R * (o.python ? 1.0 : 0.85);

  const hp = [
    hb.clone(),
    hb.clone().add(new V3(0, 0, headL * 0.35)),
    hb.clone().add(new V3(0, -headH * 0.1, headL * 0.75)),
    hb.clone().add(new V3(0, -headH * 0.18, headL))
  ];
  r.add(loft(hp, [headW * 0.75, headW, headW * 0.7, headW * 0.35], [headH * 0.8, headH, headH * 0.7, headH * 0.3], 10), 'head', (c, x, y, z) => o.paint(c, x, y, z, 'head', meta));

  // Mandible / lower jaw
  const jp = [
    hb.clone().add(new V3(0, -headH * 0.3, 0)),
    hb.clone().add(new V3(0, -headH * 0.35, headL * 0.5)),
    hb.clone().add(new V3(0, -headH * 0.25, headL * 0.95))
  ];
  r.add(loft(jp, [headW * 0.65, headW * 0.75, headW * 0.25], [headH * 0.25, headH * 0.22, headH * 0.12], 8), 'head', (c, x, y, z) => o.paint(c, x, y, z, 'head', meta));

  // Serpentine eyes
  for (const s of [-1, 1]) {
    const eyeP = hb.clone().add(new V3(s * headW * 0.82, headH * 0.28, headL * 0.45));
    r.add(ellipsoid(eyeP, R * 0.22, R * 0.22, R * 0.22, 6, 5), 'head', C('#14100c'));
    r.add(ellipsoid(eyeP.clone().add(new V3(s * 0.003, 0, 0.005)), R * 0.15, R * 0.15, R * 0.12, 6, 4), 'head', C(o.eyeCol || '#c89e36'));
    r.add(ellipsoid(eyeP.clone().add(new V3(s * 0.005, 0, 0.008)), o.python ? R * 0.03 : R * 0.07, R * 0.12, R * 0.06, 5, 4), 'head', C('#080604'));
  }

  if (o.extra) o.extra(r, meta, (c, x, y, z) => o.paint(c, x, y, z, 'extra', meta));
  return r.build();
}

// ---------------------------------------------------------------- chelonian
function chelonian(o) {
  const r = new Rig(), { L, W, H } = o, by = H * 0.35;
  const meta = { L, D: H, leg: H * 0.35, bodyY0: by };
  r.meta = meta;
  r.joint('body', null, new V3(0, by, 0));
  const sg = new THREE.SphereGeometry(1, 20, 12); const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) { let y = p.getY(i); y = y > 0 ? y * H * (o.flat ? 0.45 : 0.85) : y * H * 0.18; p.setXYZ(i, p.getX(i) * W / 2, y + by, p.getZ(i) * L / 2); }
  sg.computeVertexNormals();
  r.add(sg, 'body', (c, x, y, z) => o.paint(c, x, y, z, 'shell', meta));
  const hb = new V3(0, by, L / 2 - 0.02);
  r.joint('head', 'body', hb);
  r.add(loft([hb, hb.clone().add(new V3(0, 0.01, L * 0.2)), hb.clone().add(new V3(0, 0.0, L * 0.3))], [W * 0.1, W * 0.1, W * 0.07], [W * 0.09, W * 0.1, W * 0.07], 8), 'head', (c, x, y, z) => o.paint(c, x, y, z, 'skin', meta));
  meta.legs = [];
  for (const [n, s, z] of [['lf', 1, L * 0.3], ['rf', -1, L * 0.3], ['lh', 1, -L * 0.3], ['rh', -1, -L * 0.3]]) {
    const top = new V3(s * W * 0.38, by, z), foot = new V3(s * W * 0.5, 0.02, z + 0.01);
    r.joint(n + '1', 'body', top);
    r.add(limb(top, foot, W * 0.08, W * 0.07, 6), n + '1', (c, x, y, z) => o.paint(c, x, y, z, 'skin', meta));
    meta.legs.push(n);
  }
  return r.build();
}

// ---------------------------------------------------------------- species patterns & extras
const belly = (meta, y, D) => sstep(meta.bodyY0 - D * 0.42, meta.bodyY0 + D * 0.05, y);
function countershade(top, bot, legCol, k = 0.22) {
  const T = C(top), B = C(bot), LG = C(legCol || top);
  return (c, x, y, z, part, m) => {
    if (part === 'leg' || part === 'shin') c.copy(LG); else if (part === 'ear') c.copy(T).multiplyScalar(0.8);
    else c.copy(B).lerp(T, part === 'tail' || part === 'head' ? 0.85 : belly(m, y, m.D));
    fur(c, x, y, z, k);
  };
}
function stripes(base, bellyC, dark, freq = 17, white = false) {
  const B = C(base), W = C(bellyC), D = C(dark);
  return (c, x, y, z, part, m) => {
    const bl = belly(m, y, m.D);
    c.copy(W).lerp(B, part === 'leg' || part === 'thigh' ? 0.85 : bl);
    if (part === 'shin') c.copy(B).lerp(W, 0.3);
    if (part === 'head') { c.copy(B); if (Math.abs(x) > 0.08 && y < m.headTop.y - 0.12) c.lerp(W, 0.75); }
    const s = Math.sin(z * freq + noise2(y * 4, z * 3) * 2.6 + Math.abs(x) * 3 + (part === 'tail' ? y * 9 : 0));
    if (s > 0.74 && (bl > 0.25 || part === 'tail') && part !== 'shin') c.copy(D);
    if (part === 'tail' && Math.sin(y * 18 + z * 18) > 0.4) c.copy(D);
    fur(c, x, y, z, 0.18);
  };
}
function rosettes(base, bellyC) {
  const B = C(base), W = C(bellyC), D = C('#24170e');
  return (c, x, y, z, part, m) => {
    c.copy(W).lerp(B, part === 'leg' || part === 'shin' ? 0.9 : belly(m, y, m.D));
    const [d1] = voro(z * 7 + x * 3, y * 7 + x * 2);
    if (d1 > 0.2 && d1 < 0.34) c.copy(D); else if (part === 'shin' && d1 < 0.17) c.copy(D);
    fur(c, x, y, z, 0.18);
  };
}
function patches(base, line) {   // giraffe
  const B = C(base), Ln = C(line);
  return (c, x, y, z, part) => {
    const [d1, d2] = voro(z * 3.4 + x * 1.5, y * 3.4 + x * 0.8);
    c.copy(B).multiplyScalar(0.85 + 0.3 * hash2(Math.floor(z * 3.4), Math.floor(y * 3.4))); if (d2 - d1 < 0.13 || part === 'shin') c.copy(Ln);
    if (part === 'shin') c.multiplyScalar(1.05);
    fur(c, x, y, z, 0.15);
  };
}
function spots(base, bellyC) {   // chital
  const B = C(base), W = C(bellyC);
  return (c, x, y, z, part, m) => {
    c.copy(W).lerp(B, part === 'leg' || part === 'shin' ? 0.8 : belly(m, y, m.D));
    if ((part === 'body' || part === 'thigh') && belly(m, y, m.D) > 0.45) { const [d1] = voro(z * 11 + x * 2, y * 11, 3); if (d1 < 0.19) c.copy(W).multiplyScalar(0.95); }
    fur(c, x, y, z, 0.2);
  };
}
function zebraPaint(c, x, y, z, part, m) {
  const W = C('#ecebe4'), K = C('#151413');
  let s;
  if (part === 'leg' || part === 'shin' || part === 'thigh') s = Math.sin(y * 24);
  else if (part === 'neck') s = Math.sin((y - z * 0.3) * 18);
  else if (part === 'head') s = Math.sin(z * 30 + y * 5);
  else if (part === 'tail') s = 0;
  else s = Math.sin(z * 15 + (z < -0.3 ? (y - m.bodyY0) * 9 * Math.sign(-z) : 0) + noise2(y * 3, z * 2) * 1.2);
  c.copy(s > 0.1 ? K : W);
  if (part === 'body' && belly(m, y, m.D) < 0.15) c.copy(W);
  fur(c, x, y, z, 0.12);
}

// Custom species paintings & extra anatomical decorators
function wolfPaint(c, x, y, z, part, m) {
  const bl = belly(m, y, m.D);
  const cream = C('#ede5d6'), tawny = C('#9c8770'), mantle = C('#2e2824'), black = C('#141210');
  if (part === 'ear') c.copy(mantle);
  else if (part === 'shin' || part === 'paw' || part === 'jaw' || part === 'scruff') c.copy(cream).lerp(tawny, 0.35);
  else if (part === 'cheekRuff') c.copy(cream).lerp(mantle, 0.3);
  else if (part === 'head') {
    c.copy(tawny);
    if (Math.abs(x) < 0.045 && y > m.headTop.y - 0.08) c.lerp(mantle, 0.7);
    if (Math.abs(x) > 0.06 && y < m.headTop.y - 0.06) c.lerp(cream, 0.65);
  } else if (part === 'tail') {
    c.copy(tawny);
    if (y > m.bodyY0 + 0.02) c.lerp(mantle, 0.7);
    if (z < -m.L * 0.38) c.copy(black);
  } else {
    c.copy(cream).lerp(tawny, bl);
    if (bl > 0.65 && y > m.bodyY0 + m.D * 0.08) {
      const griz = noise3(x * 16, y * 16, z * 16) * 0.35 + 0.65;
      c.lerp(mantle, clamp((y - (m.bodyY0 + m.D * 0.08)) / (m.D * 0.35), 0, 1) * griz);
    }
  }
  fur(c, x, y, z, 0.22, 18);
}

function dholePaint(c, x, y, z, part, m) {
  const rust = C('#b64c1c'), cream = C('#f0e4d4'), black = C('#16120e'), bl = belly(m, y, m.D);
  if (part === 'jaw' || part === 'scruff' || (part === 'body' && bl < 0.25 && z > 0)) c.copy(cream);
  else if (part === 'tail') { c.copy(rust); if (z < -m.L * 0.28) c.copy(black); }
  else if (part === 'head') { c.copy(rust); if (Math.abs(x) > 0.05 && y < m.headTop.y - 0.05) c.lerp(cream, 0.6); }
  else c.copy(cream).lerp(rust, Math.max(0.2, bl));
  fur(c, x, y, z, 0.18, 20);
}

function jackalPaint(c, x, y, z, part, m) {
  const dark = C('#4a4038');
  countershade('#b48e58', '#e8dbbe')(c, x, y, z, part, m);
  if (part === 'body' && y > m.bodyY0 + 0.06) c.lerp(dark, 0.65);
  if (part === 'tail' && z < -m.L * 0.25) c.set('#1e1812');
}

function swanPaint(c, x, y, z, part) {
  c.set('#f8f6f2');
  if (part === 'wing') c.lerp(C('#f0ece4'), noise2(x * 12, z * 12) * 0.15);
  fur(c, x, y, z, 0.06, 25);
}

function raptorPaint(c, x, y, z, part, m) {
  const brown = C('#56321c'), buff = C('#ebd8bc'), dark = C('#28180e');
  if (part === 'head') c.copy(buff).lerp(brown, y > m.headBase.y + 0.02 ? 0.8 : 0.2);
  else if (part === 'wing') { c.copy(brown); if (z < -m.L * 0.3) c.lerp(dark, 0.75); }
  else if (part === 'tail') c.copy(Math.sin(z * 35) > 0.1 ? dark : buff);
  else if (part === 'body') {
    c.copy(buff);
    if (Math.sin(y * 28 + noise2(x * 10, y * 10) * 1.5) > 0.2) c.lerp(brown, 0.65);
    if (y > m.bodyY0 + m.D * 0.15) c.lerp(brown, 0.85);
  } else c.copy(brown);
  fur(c, x, y, z, 0.18, 30);
}

function cranePaint(c, x, y, z, part, m) {
  const grey = C('#8e959b'), scarlet = C('#ba1f18'), white = C('#f2efea');
  if (part === 'head') { c.copy(scarlet); if (y > m.headBase.y + 0.04 && Math.abs(x) < 0.035) c.copy(C('#9da3a8')); }
  else if (part === 'neck') {
    if (y > m.headBase.y - 0.18) c.copy(scarlet);
    else if (y > m.headBase.y - 0.26) c.copy(white);
    else c.copy(grey);
  } else if (part === 'tail') c.copy(grey).lerp(white, 0.4);
  else c.copy(grey);
  fur(c, x, y, z, 0.12, 25);
}

function pelicanPaint(c, x, y, z, part) {
  c.set('#f4f0e8');
  if (part === 'wing' && z < -0.22) c.set('#22201e');
  fur(c, x, y, z, 0.12, 25);
}

function chimpPaint(c, x, y, z, part) {
  c.set('#1c1815'); // coarse blackish coat
  if (part === 'face' || part === 'hand' || part === 'foot') c.set('#2c241e'); // bare dark wrinkled skin
  fur(c, x, y, z, 0.28, 22);
}

function rhesusPaint(c, x, y, z, part) {
  const coat = C('#9a7e5a'), redRump = C('#c8542a'), pink = C('#d88680');
  if (part === 'face' || part === 'hand' || part === 'foot') c.copy(pink);
  else if (z < -0.06) c.copy(redRump); // vivid red-orange rump and haunches
  else c.copy(coat);
  fur(c, x, y, z, 0.22, 28);
}

function bonnetPaint(c, x, y, z, part) {
  c.set('#8c7b64');
  if (part === 'face' || part === 'hand' || part === 'foot') c.set('#d89e94');
  fur(c, x, y, z, 0.22, 28);
}

function stumpPaint(c, x, y, z, part) {
  c.set('#3e2e22'); // shaggy dark brown
  if (part === 'face' || part === 'hand' || part === 'foot') c.set('#c42018'); // bright crimson face!
  fur(c, x, y, z, 0.35, 25);
}

function baboonPaint(c, x, y, z, part) {
  c.set('#9e9a90');
  if (z > 0.05 && part === 'body') c.set('#c8c4b8');
  if (part === 'face' || part === 'hand' || part === 'foot') c.set('#c47870');
  fur(c, x, y, z, 0.28, 24);
}

function langurPaint(c, x, y, z, part) {
  c.set('#9a9da2');
  if (part === 'face' || part === 'hand' || part === 'foot') c.set('#121110');
  fur(c, x, y, z, 0.22, 26);
}

function lemurPaint(c, x, y, z, part, m) {
  c.set('#9e968c').lerp(C('#efece4'), 1 - belly(m, y, m.D));
  if (part === 'tail') {
    // 14 bold alternating black and white rings
    const ringPhase = Math.sin(z * 48 + y * 48);
    c.set(ringPhase > 0 ? '#151311' : '#f4f0e8');
  }
  if (part === 'head') c.set('#f4f0e6');
  if (part === 'hand' || part === 'foot') c.set('#161412');
  fur(c, x, y, z, 0.2, 40);
}

function marmosetPaint(c, x, y, z, part, m) {
  c.set('#6e6658').lerp(C('#8c7e68'), noise3(x * 25, y * 25, z * 25));
  if (part === 'ear') c.set('#faf7f0'); // white ear tufts
  if (part === 'head' && Math.abs(x) < 0.015 && y > m.bodyY0 + 0.06 && z > 0.04) c.set('#faf7f0'); // white forehead blaze
  if (part === 'tail') {
    const ring = Math.sin(Math.hypot(x, y - m.bodyY0, z) * 65.0);
    c.set(ring > 0.15 ? '#241f1c' : '#e8e2d4');
  }
  fur(c, x, y, z, 0.25, 45);
}

function ratSnakePaint(c, x, y, z, part, m) {
  const bronze = C('#76683e'), dark = C('#2a2216'), cream = C('#ded2a8');
  const isBelly = y < m.bodyY0 - m.D * 0.18;
  if (isBelly) c.copy(cream);
  else {
    c.copy(bronze);
    if (Math.sin(z * 32 + x * 20) > 0.45 || Math.sin(z * 32 - x * 20) > 0.45) c.lerp(dark, 0.65);
  }
}

function cobraPaint(c, x, y, z, part, m) {
  const black = C('#2a231a'), cream = C('#ede5d2'), dark = C('#14100c');
  const isBelly = y < m.bodyY0 - m.D * 0.15;
  const inHood = z > m.L * 0.26 && z < m.L * 0.45;
  if (inHood && !isBelly) {
    c.copy(black);
    const hz = z - m.L * 0.35, distL = Math.hypot(x - 0.038, hz), distR = Math.hypot(x + 0.038, hz);
    const onRim = (distL > 0.022 && distL < 0.038) || (distR > 0.022 && distR < 0.038);
    const onBridge = Math.abs(x) < 0.038 && Math.abs(hz) < 0.012;
    const inCenter = distL < 0.015 || distR < 0.015;
    if (onRim || onBridge) c.copy(cream);
    else if (inCenter) c.copy(dark);
  } else if (isBelly) {
    c.copy(cream);
    if (inHood && (Math.abs(z - m.L * 0.32) < 0.012 || Math.abs(z - m.L * 0.40) < 0.012)) c.copy(dark);
  } else {
    c.copy(black);
  }
}

function pythonPaint(c, x, y, z, part, m) {
  const gold = C('#8d7b52'), brown = C('#3c2a18'), cream = C('#dcd0ad');
  const isBelly = y < m.bodyY0 - m.D * 0.22;
  if (isBelly) c.copy(cream);
  else if (part === 'head') {
    c.copy(gold);
    if (Math.abs(x) < (z - (m.L / 2)) * 0.35 + 0.04 && z > m.L / 2 - 0.08) c.lerp(brown, 0.85);
  } else {
    c.copy(gold);
    const [d1] = voro(z * 8 + x * 4, y * 8 + x * 2);
    if (d1 < 0.28) c.copy(brown);
  }
}

function hippoPaint(c, x, y, z, part, m) {
  const slate = C('#6c5e5e'), pink = C('#b6847c'), bl = belly(m, y, m.D);
  c.copy(pink).lerp(slate, Math.min(1, bl * 1.25));
  if (part === 'head' && y < m.bodyY0 - 0.05) c.lerp(pink, 0.65);
  fur(c, x, y, z, 0.12, 12);
}

function hippoExtra(r, m, col) {
  const H = { w: 0.46, h: 0.40, len: 0.90 };
  const hb = m.headBase, hd = m.hd, nose = m.nose;
  // Raised periscope nostrils on snout tip
  for (const s of [-1, 1]) {
    const np = nose.clone().add(new V3(s * H.w * 0.32, H.h * 0.28, -H.len * 0.05));
    r.add(ellipsoid(np, H.w * 0.22, H.h * 0.25, H.len * 0.18, 7, 5), 'head', col('head'));
    r.add(ellipsoid(np.clone().add(new V3(0, H.h * 0.08, H.len * 0.04)), H.w * 0.09, H.h * 0.08, H.len * 0.08, 5, 4), 'head', C('#1e1412'));
  }
  // Raised periscope eye turrets on crown
  for (const s of [-1, 1]) {
    const ep = hb.clone().addScaledVector(hd, H.len * 0.28).add(new V3(s * H.w * 0.75, H.h * 0.45, 0));
    r.add(ellipsoid(ep, H.w * 0.22, H.h * 0.24, H.w * 0.20, 7, 5), 'head', col('head'));
    r.add(ellipsoid(ep.clone().add(new V3(s * 0.03, 0.02, 0.03)), H.w * 0.11, H.h * 0.11, H.w * 0.11, 6, 4), 'head', C('#14100e'));
  }
  // Small rounded cupped ears on crown
  for (const s of [-1, 1]) {
    const earP = m.headTop.clone().add(new V3(s * H.w * 0.58, H.h * 0.15, -H.len * 0.12));
    r.add(ellipsoid(earP, H.w * 0.14, H.h * 0.20, H.w * 0.12, 6, 4), 'head', col('ear'));
    r.add(ellipsoid(earP.clone().add(new V3(s * 0.01, 0, 0.02)), H.w * 0.08, H.h * 0.13, H.w * 0.06, 5, 4), 'head', C('#be8c84'));
  }
  // Heavy lower jaw with lateral canine tusk bulges
  const jawPts = [
    hb.clone().add(new V3(0, -H.h * 0.35, 0)),
    hb.clone().addScaledVector(hd, H.len * 0.55).add(new V3(0, -H.h * 0.28, 0)),
    hb.clone().addScaledVector(hd, H.len * 0.95).add(new V3(0, -H.h * 0.20, 0))
  ];
  r.add(loft(jawPts, [H.w * 0.78, H.w * 0.88, H.w * 0.75], [H.h * 0.28, H.h * 0.30, H.h * 0.24], 9), 'head', col('head'));
  for (const s of [-1, 1]) {
    const tuskP = hb.clone().addScaledVector(hd, H.len * 0.82).add(new V3(s * H.w * 0.75, -H.h * 0.15, 0));
    r.add(ellipsoid(tuskP, H.w * 0.18, H.h * 0.18, H.len * 0.14, 6, 4), 'head', col('head'));
  }
}



function langurRuffExtra(r, m) {
  const c = m.headBase.clone().add(new V3(0, 0.04, 0.02));
  r.add(ellipsoid(c, 0.095, 0.095, 0.075, 10, 8), 'head', C('#edebe6'));
}

// antlers/horns
function antlers(r, m, color, { tines = 3, size = 0.7, spread = 0.5, back = 0.4 } = {}) {
  for (const s of [-1, 1]) {
    const b = m.headTop.clone().add(new V3(s * 0.06, 0, 0));
    const tip = b.clone().add(new V3(s * size * spread, size, -size * back));
    r.add(limb(b, tip, 0.03, 0.012, 5), 'head', color);
    for (let k = 1; k < tines; k++) { const p = b.clone().lerp(tip, k / tines); r.add(limb(p, p.clone().add(new V3(s * size * 0.12, size * 0.28, size * 0.15)), 0.018, 0.006, 4), 'head', color); }
  }
}
function horns(r, m, color, { len = 0.3, curl = 0.5, spiral = false, out = 0.6 } = {}) {
  for (const s of [-1, 1]) {
    const b = m.headTop.clone().add(new V3(s * 0.07, -0.02, 0)), pts = [b];
    for (let i = 1; i <= 6; i++) { const t = i / 6; pts.push(b.clone().add(new V3(s * len * out * t + (spiral ? Math.sin(t * 9) * 0.03 * s : 0), len * t * (1 - curl * t * 0.6), -len * 0.5 * t + curl * len * t * t * 0.6))); }
    r.add(loft(pts, pts.map((_, i) => 0.04 * (1 - i / 7) + 0.006), pts.map((_, i) => 0.04 * (1 - i / 7) + 0.006), 6), 'head', color);
  }
}
const ext = fn => fn;

// ---------------------------------------------------------------- species table
// fam: quad | primate | bird | reptile | snake | chelonian ; beh: behaviour profile (see animals.js)
export const SPECIES_MODELS = {
  bengal_tiger: { fam: 'quad', beh: 'cat', scale: 1, o: { L: 1.75, D: 0.6, W: 0.48, leg: 0.62, legR: 0.075, paw: true, neck: { len: 0.32, r0: 0.24, r1: 0.19, ang: 0.35 }, head: { len: 0.4, w: 0.17, h: 0.15, snout: 0.62, ang: -0.1 }, ears: { type: 'up', len: 0.09, w: 0.06 }, tail: { len: 0.95, r: 0.045, droop: 0.75 }, noseCol: '#b67a6a', paint: stripes('#c66f22', '#ece2d0', '#17100a') } },
  white_tiger: { fam: 'white_tiger', beh: 'cat', scale: 1, o: { L: 2.05, D: 0.78, W: 0.62, leg: 0.82, legR: 0.085, paw: true, neck: { len: 0.34, r0: 0.26, r1: 0.20, ang: 0.35 }, head: { len: 0.44, w: 0.19, h: 0.17, snout: 0.62, ang: -0.1 }, ears: { type: 'up', len: 0.09, w: 0.065 }, tail: { len: 0.95, r: 0.045, droop: 0.75 }, noseCol: '#e899a8', paint: stripes('#e8e4db', '#f5f3ec', '#231a16') } },
  leopard: { fam: 'quad', beh: 'cat', o: { L: 1.3, D: 0.44, W: 0.34, leg: 0.5, legR: 0.055, paw: true, neck: { len: 0.27, r0: 0.17, r1: 0.13, ang: 0.35 }, head: { len: 0.3, w: 0.12, h: 0.11, snout: 0.6, ang: -0.1 }, ears: { type: 'up', len: 0.07, w: 0.05 }, tail: { len: 0.9, r: 0.035, droop: 0.7 }, paint: rosettes('#c99a52', '#eee2c8') } },
  lion: { fam: 'lion', beh: 'lion', scale: 1, o: { L: 2.05, D: 0.78, W: 0.62, leg: 0.82, legR: 0.085, paw: true, neck: { len: 0.36, r0: 0.28, r1: 0.22, ang: 0.36 }, head: { len: 0.46, w: 0.20, h: 0.18, snout: 0.60, ang: -0.10 }, ears: { type: 'up', len: 0.075, w: 0.065 }, tail: { len: 0.95, r: 0.040, droop: 0.85, tuft: '#18120d' }, paint: countershade('#b88c52', '#dcc8a2', '#b88c52') } },
  small_cat: { fam: 'quad', beh: 'cat', o: { L: 0.62, D: 0.22, W: 0.17, leg: 0.3, legR: 0.03, paw: true, neck: { len: 0.13, r0: 0.08, r1: 0.06, ang: 0.4 }, head: { len: 0.15, w: 0.06, h: 0.055, snout: 0.6, ang: -0.1 }, ears: { type: 'up', len: 0.05, w: 0.03 }, tail: { len: 0.3, r: 0.018, droop: 0.7 }, paint: stripes('#9c8b68', '#d8ccb2', '#5a4a36', 18) } },
  asian_elephant: { fam: 'quad', beh: 'elephant', o: { L: 3.0, D: 1.6, W: 1.3, leg: 1.6, legR: 0.24, legTaper: 0.95, legSpread: 0.27, pillarLegs: true, hoof: '#4f4a45', prof: [[0, 0.6, 0.7, 0.05], [0.15, 0.9, 0.95, 0.04], [0.35, 1, 1, 0.02], [0.6, 1, 1, 0.04], [0.82, 0.92, 0.98, 0.08], [0.95, 0.75, 0.8, 0.06], [1, 0.45, 0.5, 0.04]], neck: { len: 0.35, r0: 0.6, r1: 0.55, ang: 0.15, flat: 0.95 }, head: { len: 0.75, w: 0.48, h: 0.6, snout: 0.48, ang: -0.55 }, tail: { len: 1.1, r: 0.06, droop: 0.95, tuft: '#1a1816' },
    paint: (c, x, y, z, part) => { c.set('#6b6661'); if ((part === 'head' || part === 'ear') && noise2(x * 9, y * 9 + z * 5) > 0.72) c.set('#a88a80'); fur(c, x, y, z, 0.18, 14); },
    extra: (r, m) => {
      const tb = m.nose.clone(); let prev = 'head', p0 = tb;
      const seg = [[0, -0.55, 0.12], [0, -0.55, 0.05], [0, -0.45, 0.06]];
      seg.forEach((d, i) => { const p1 = p0.clone().add(new V3(...d)); const n = 'trunk' + (i + 1); r.joint(n, prev, p0); r.add(limb(p0, p1, 0.17 - i * 0.04, 0.13 - i * 0.04, 10), n, (c, x, y, z) => fur(c.set('#66615c'), x, y * 3, z, 0.25, 20)); prev = n; p0 = p1; });
      for (const [n, s] of [['earL', 1], ['earR', -1]]) {
        const root = m.headBase.clone().add(new V3(s * 0.42, 0.25, 0.12)); r.joint(n, 'head', root);
        const g = new THREE.CircleGeometry(0.5, 16); g.scale(0.85, 1.05, 1); g.rotateY(s * 1.2); g.translate(root.x + s * 0.28, root.y - 0.25, root.z - 0.12);
        const bg = g.clone(); bg.rotateY(0); r.add(g, n, (c, x, y, z) => fur(c.set('#6e6762').lerp(C('#b08f86'), noise2(x * 6, y * 6) > 0.6 ? 0.6 : 0), x, y, z, 0.2));
        const g2 = new THREE.CircleGeometry(0.5, 16); g2.scale(0.85, 1.05, 1); g2.rotateY(s * 1.2 + Math.PI); g2.translate(root.x + s * 0.27, root.y - 0.25, root.z - 0.13); r.add(g2, n, C('#5f5a55'));
      }
    }, maleExtra: (r, m) => { for (const s of [-1, 1]) { const b = m.nose.clone().add(new V3(s * 0.16, 0.05, -0.15)); r.add(limb(b, b.clone().add(new V3(s * 0.05, -0.25, 0.35)), 0.05, 0.02, 6), 'head', C('#e8dfc8')); } } } },
  rhino: { fam: 'quad', beh: 'grazer', o: { L: 2.9, D: 1.15, W: 1.0, leg: 0.72, legR: 0.17, legTaper: 0.85, hoof: '#4a4440', neck: { len: 0.35, r0: 0.45, r1: 0.4, ang: 0.0, flat: 0.95 }, head: { len: 0.75, w: 0.3, h: 0.35, snout: 0.6, ang: -0.35 }, ears: { type: 'up', len: 0.16, w: 0.08 }, tail: { len: 0.5, r: 0.04, droop: 0.95 },
    paint: (c, x, y, z, part) => { c.set('#79726a'); if (part === 'body' && (Math.abs(Math.sin(z * 3.2)) < 0.08 || Math.abs(Math.sin(z * 3.2 + 1.2)) < 0.05)) c.multiplyScalar(0.6); if (noise3(x * 10, y * 10, z * 10) > 0.75) c.multiplyScalar(0.85); fur(c, x, y, z, 0.15, 16); },
    extra: (r, m) => { const b = m.nose.clone().add(new V3(0, 0.12, -0.15)); r.add(new THREE.ConeGeometry(0.1, 0.38, 8).translate(0, 0.19, 0).rotateX(-0.25).translate(b.x, b.y, b.z), 'head', C('#4a443e')); } } },
  // Hippo: bulky barrel torso, stout legs with 4 splayed toes, wide snout with raised periscope nostrils & eye turrets
  hippopotamus: { fam: 'quad', beh: 'hippo', o: { L: 3.1, D: 1.25, W: 1.30, leg: 0.46, legR: 0.20, legTaper: 0.92, hippo: true, pillarLegs: true, hoof: '#362c2a', prof: HIPPO_PROF, neck: { len: 0.32, r0: 0.54, r1: 0.52, ang: 0.0, flat: 1 }, head: { len: 0.90, w: 0.46, h: 0.40, snout: 1.08, ang: -0.15 }, ears: { type: 'up', len: 0.07, w: 0.05 }, tail: { len: 0.35, r: 0.05, droop: 0.95 },
    paint: hippoPaint, extra: hippoExtra } },
  giraffe: { fam: 'quad', beh: 'browser', o: { L: 1.9, D: 0.9, W: 0.66, leg: 1.75, legF: 1.25, legR: 0.07, legTaper: 0.75, hoof: '#2a2420', neck: { len: 2.1, r0: 0.25, r1: 0.12, ang: 1.08 }, head: { len: 0.6, w: 0.11, h: 0.13, snout: 0.75, ang: -0.35 }, ears: { type: 'side', len: 0.14, w: 0.05 }, tail: { len: 0.85, r: 0.03, droop: 0.95, tuft: '#1a1410' }, paint: patches('#8f522a', '#f0e2c2'),
    extra: (r, m) => { for (const s of [-1, 1]) { const b = m.headTop.clone().add(new V3(s * 0.05, 0, 0.02)); r.add(limb(b, b.clone().add(new V3(s * 0.03, 0.16, -0.04)), 0.025, 0.02, 5), 'head', C('#4a3220')); r.add(ellipsoid(b.clone().add(new V3(s * 0.03, 0.17, -0.04)), 0.035, 0.035, 0.035, 6, 4), 'head', C('#1d140c')); } r.add(loft([m.neckEnd.clone().add(new V3(0, 0.05, -0.12)), m.neckEnd.clone().add(new V3(0, -1.7, -0.75))], [0.02, 0.02], [0.06, 0.04], 5), 'neck', C('#6a3e20')); } } },
  zebra: { fam: 'quad', beh: 'grazer', o: { L: 1.85, D: 0.78, W: 0.52, leg: 0.84, legR: 0.07, legTaper: 0.65, hoof: '#1c1b19', neck: { len: 0.72, r0: 0.25, r1: 0.16, ang: 0.85 }, head: { len: 0.58, w: 0.12, h: 0.16, snout: 0.6, ang: -0.95 }, ears: { type: 'up', len: 0.16, w: 0.06 }, tail: { len: 0.6, r: 0.03, droop: 0.95, tuft: '#151413' }, paint: zebraPaint,
    extra: (r, m) => r.add(loft([0, 0.5, 1].map(t => new V3(0, 0, 0).copy(m.neckEnd).lerp(new V3(0, m.bodyY0 + 0.4, m.L / 2 - 0.3), t).add(new V3(0, 0.1, -0.04))), [0.02, 0.02, 0.02], [0.08, 0.08, 0.06], 5), 'neck', (c, x, y) => c.set(Math.sin(y * 40) > 0 ? '#141312' : '#e8e6de')) } },
  spotted_deer: { fam: 'quad', beh: 'grazer', o: { L: 1.1, D: 0.46, W: 0.3, leg: 0.66, legR: 0.04, legTaper: 0.6, hoof: '#221b16', neck: { len: 0.45, r0: 0.11, r1: 0.075, ang: 0.85 }, head: { len: 0.3, w: 0.06, h: 0.08, snout: 0.6, ang: -0.9 }, ears: { type: 'up', len: 0.12, w: 0.045 }, tail: { len: 0.2, r: 0.025, droop: 0.9 }, paint: spots('#b8763c', '#f1e8d8') },
    maleExtra: (r, m) => antlers(r, m, C('#8a7558'), { tines: 3, size: 0.65 }) },
  sambar: { fam: 'quad', beh: 'grazer', o: { L: 1.6, D: 0.66, W: 0.42, leg: 0.82, legR: 0.055, legTaper: 0.6, hoof: '#1d1712', neck: { len: 0.55, r0: 0.16, r1: 0.11, ang: 0.8 }, head: { len: 0.4, w: 0.085, h: 0.11, snout: 0.6, ang: -0.9 }, ears: { type: 'side', len: 0.15, w: 0.07 }, tail: { len: 0.25, r: 0.04, droop: 0.95 }, paint: countershade('#5b4838', '#7d6a56', '#4d3e31') },
    maleExtra: (r, m) => antlers(r, m, C('#6e5a44'), { tines: 3, size: 0.75, spread: 0.6 }) },
  swamp_deer: { fam: 'quad', beh: 'grazer', o: { L: 1.5, D: 0.6, W: 0.38, leg: 0.8, legR: 0.05, legTaper: 0.6, hoof: '#1d1712', neck: { len: 0.5, r0: 0.14, r1: 0.1, ang: 0.8 }, head: { len: 0.36, w: 0.08, h: 0.1, snout: 0.6, ang: -0.9 }, ears: { type: 'up', len: 0.14, w: 0.06 }, tail: { len: 0.2, r: 0.03, droop: 0.9 }, paint: countershade('#a5794a', '#e2d2b8', '#8a6440') },
    maleExtra: (r, m) => antlers(r, m, C('#8a7558'), { tines: 6, size: 0.7, spread: 0.55 }) },
  hog_deer: { fam: 'quad', beh: 'grazer', o: { L: 0.95, D: 0.42, W: 0.3, leg: 0.45, legR: 0.04, legTaper: 0.6, hoof: '#1d1712', neck: { len: 0.32, r0: 0.11, r1: 0.08, ang: 0.6 }, head: { len: 0.26, w: 0.06, h: 0.075, snout: 0.6, ang: -0.9 }, ears: { type: 'up', len: 0.1, w: 0.045 }, tail: { len: 0.15, r: 0.025, droop: 0.9 }, paint: countershade('#7c6347', '#c8b496', '#6a523a') },
    maleExtra: (r, m) => antlers(r, m, C('#7a6650'), { tines: 3, size: 0.32 }) },
  barking_deer: { fam: 'quad', beh: 'grazer', o: { L: 0.85, D: 0.38, W: 0.25, leg: 0.46, legR: 0.035, legTaper: 0.6, hoof: '#1d1712', neck: { len: 0.3, r0: 0.09, r1: 0.065, ang: 0.6 }, head: { len: 0.22, w: 0.05, h: 0.065, snout: 0.6, ang: -0.85 }, ears: { type: 'up', len: 0.09, w: 0.04 }, tail: { len: 0.15, r: 0.025, droop: 0.9 }, paint: countershade('#ae6a36', '#e7d6bc', '#8a5228') },
    maleExtra: (r, m) => antlers(r, m, C('#5e4a36'), { tines: 2, size: 0.18 }) },
  nilgai: { fam: 'quad', beh: 'grazer', o: { L: 1.8, D: 0.78, W: 0.48, leg: 1.0, legF: 1.12, legR: 0.06, legTaper: 0.6, hoof: '#1d1712', neck: { len: 0.6, r0: 0.17, r1: 0.12, ang: 0.75 }, head: { len: 0.42, w: 0.085, h: 0.11, snout: 0.6, ang: -0.95 }, ears: { type: 'up', len: 0.16, w: 0.06 }, tail: { len: 0.45, r: 0.03, droop: 0.95, tuft: '#1a1a1c' }, paint: countershade('#6d6f74', '#d9d6cf', '#4a4a4f') },
    maleExtra: (r, m) => horns(r, m, C('#2a2622'), { len: 0.18, curl: 0.1, out: 0.2 }) },
  blackbuck: { fam: 'quad', beh: 'grazer', o: { L: 1.1, D: 0.44, W: 0.3, leg: 0.66, legR: 0.04, legTaper: 0.6, hoof: '#1d1712', neck: { len: 0.42, r0: 0.11, r1: 0.075, ang: 0.85 }, head: { len: 0.28, w: 0.06, h: 0.075, snout: 0.6, ang: -0.9 }, ears: { type: 'up', len: 0.1, w: 0.04 }, tail: { len: 0.15, r: 0.025, droop: 0.9 }, paint: (c, x, y, z, part, m) => { const top = m.male ? '#231c17' : '#b8894f'; c.set(belly(m, y, m.D) > 0.55 && part !== 'shin' ? top : '#f2eee5'); if (part === 'leg' || part === 'thigh') c.set(top); if (part === 'head') c.set(top).lerp(C('#f2eee5'), y < m.headTop.y - 0.07 ? 0.7 : 0); fur(c, x, y, z, 0.15); } },
    maleExtra: (r, m) => horns(r, m, C('#1c1916'), { len: 0.5, curl: 0.05, spiral: true, out: 0.45 }) },
  indian_gaur: { fam: 'quad', beh: 'grazer', o: { L: 2.6, D: 1.3, W: 0.9, leg: 0.88, legR: 0.12, legTaper: 0.65, hoof: '#1b1612', prof: [[0, 0.6, 0.7, 0.0], [0.15, 0.88, 0.9, 0], [0.4, 1, 1, 0.02], [0.66, 1, 1.12, 0.12], [0.82, 0.95, 1.12, 0.14], [0.95, 0.75, 0.86, 0.06], [1, 0.45, 0.55, 0.04]], neck: { len: 0.4, r0: 0.42, r1: 0.32, ang: 0.25, flat: 0.85 }, head: { len: 0.55, w: 0.17, h: 0.22, snout: 0.7, ang: -0.8 }, ears: { type: 'side', len: 0.15, w: 0.06 }, tail: { len: 0.8, r: 0.035, droop: 0.97, tuft: '#1a1612' },
    paint: (c, x, y, z, part, m) => { c.set('#2e221b'); if (part === 'shin') c.set('#e2d6bb'); if (part === 'head' && y > m.headTop.y - 0.12) c.set('#a0916e'); fur(c, x, y, z, 0.2); } },
    maleExtra: (r, m) => horns(r, m, C('#bfb49a'), { len: 0.38, curl: 0.7, out: 0.8 }), femaleExtra: (r, m) => horns(r, m, C('#bfb49a'), { len: 0.28, curl: 0.7, out: 0.8 }) },
  wild_boar: { fam: 'quad', beh: 'rooter', o: { L: 1.25, D: 0.62, W: 0.42, leg: 0.42, legF: 1.08, legR: 0.05, legTaper: 0.7, hoof: '#1a1612', neck: { len: 0.18, r0: 0.26, r1: 0.22, ang: 0.0, flat: 0.9 }, head: { len: 0.45, w: 0.13, h: 0.17, snout: 0.45, ang: -0.45 }, ears: { type: 'up', len: 0.1, w: 0.05 }, tail: { len: 0.25, r: 0.02, droop: 0.95 }, noseCol: '#5a4a44', paint: (c, x, y, z) => { c.set('#3d3530'); fur(c, x, y, z, 0.35, 22); } } },
  himalayan_black_bear: { fam: 'quad', beh: 'bear', o: { L: 1.45, D: 0.8, W: 0.7, leg: 0.55, legR: 0.11, legTaper: 0.8, paw: true, hoof: '#151313', neck: { len: 0.25, r0: 0.3, r1: 0.25, ang: 0.15, flat: 0.95 }, head: { len: 0.38, w: 0.17, h: 0.16, snout: 0.55, ang: -0.3 }, ears: { type: 'up', len: 0.1, w: 0.07 }, noseCol: '#2a201c',
    paint: (c, x, y, z, part, m) => { c.set('#151312'); if (part === 'body' && z > m.L * 0.28 && Math.abs(y - m.bodyY0 + 0.05 - Math.abs(x) * 0.6) < 0.05) c.set('#e3dccb'); if (part === 'head' && z > m.nose.z - 0.12) c.set('#8a7660'); fur(c, x, y, z, 0.3, 16); } } },
  sun_bear: { fam: 'quad', beh: 'bear', o: { L: 1.2, D: 0.6, W: 0.52, leg: 0.42, legR: 0.09, legTaper: 0.8, paw: true, hoof: '#151313', neck: { len: 0.2, r0: 0.24, r1: 0.2, ang: 0.15, flat: 0.95 }, head: { len: 0.3, w: 0.14, h: 0.13, snout: 0.5, ang: -0.3 }, ears: { type: 'up', len: 0.05, w: 0.05 }, noseCol: '#2a201c',
    paint: (c, x, y, z, part, m) => { c.set('#1a1714'); if (part === 'body' && z > m.L * 0.3 && Math.abs(x) < 0.16 && y < m.bodyY0 + 0.05 && y > m.bodyY0 - 0.25) c.set('#d6a24c'); if (part === 'head' && z > m.nose.z - 0.1) c.set('#c9a273'); fur(c, x, y, z, 0.2, 18); } } },
  sloth_bear: { fam: 'quad', beh: 'bear', o: { L: 1.5, D: 0.78, W: 0.68, leg: 0.52, legR: 0.1, legTaper: 0.8, paw: true, hoof: '#d6cfc0', neck: { len: 0.25, r0: 0.34, r1: 0.26, ang: 0.15, flat: 0.95 }, head: { len: 0.42, w: 0.15, h: 0.15, snout: 0.5, ang: -0.35 }, ears: { type: 'up', len: 0.08, w: 0.07 }, noseCol: '#3a3028',
    paint: (c, x, y, z, part, m) => { c.set('#121110'); if (part === 'body' && z > m.L * 0.3 && Math.abs(y - m.bodyY0 + 0.1 - Math.abs(x) * 0.7) < 0.05) c.set('#d8ccb4'); if (part === 'head' && z > m.nose.z - 0.16) c.set('#bdb09a'); fur(c, x, y, z, 0.38, 25); },
    extra: (r, m) => r.add(ellipsoid(new V3(0, m.bodyY0 + 0.25, m.L * 0.2), 0.42, 0.25, 0.5, 10, 8), 'body', (c, x, y, z) => fur(c.set('#141312'), x, y, z, 0.4, 30)) } },
  // Canids: grey_wolf, dhole, golden_jackal, striped_hyena (illm4tic/wolf-world inspired predator proportions)
  grey_wolf: { fam: 'quad', beh: 'canid', o: { L: 1.15, D: 0.42, W: 0.30, leg: 0.58, legF: 1.06, legR: 0.044, legTaper: 0.68, canid: true, neck: { len: 0.32, r0: 0.16, r1: 0.12, ang: 0.48 }, head: { len: 0.32, w: 0.09, h: 0.095, snout: 0.48, ang: -0.18 }, ears: { type: 'up', len: 0.11, w: 0.05 }, tail: { len: 0.46, r: 0.048, droop: 0.88, bushy: true }, paint: wolfPaint } },
  dhole: { fam: 'dhole', beh: 'dhole', o: { L: 1.02, D: 0.40, W: 0.28, leg: 0.52, legF: 1.04, legR: 0.040, legTaper: 0.68, canid: true, neck: { len: 0.28, r0: 0.14, r1: 0.11, ang: 0.45 }, head: { len: 0.26, w: 0.080, h: 0.085, snout: 0.44, ang: -0.16 }, ears: { type: 'up', len: 0.085, w: 0.055 }, tail: { len: 0.46, r: 0.052, droop: 0.85, bushy: true, tuft: '#18120d' }, paint: dholePaint } },
  golden_jackal: { fam: 'quad', beh: 'canid', o: { L: 0.80, D: 0.32, W: 0.24, leg: 0.44, legF: 1.04, legR: 0.034, legTaper: 0.68, canid: true, neck: { len: 0.24, r0: 0.11, r1: 0.085, ang: 0.45 }, head: { len: 0.24, w: 0.07, h: 0.07, snout: 0.46, ang: -0.18 }, ears: { type: 'up', len: 0.085, w: 0.045 }, tail: { len: 0.32, r: 0.034, droop: 0.9, bushy: true, tuft: '#241a12' }, paint: jackalPaint } },
  striped_hyena: { fam: 'hyena', beh: 'hyena', o: { L: 1.25, D: 0.65, W: 0.38, leg: 0.78, legF: 1.35, legR: 0.055, legTaper: 0.72, canid: true, neck: { len: 0.32, r0: 0.18, r1: 0.14, ang: 0.22 }, head: { len: 0.32, w: 0.11, h: 0.115, snout: 0.52, ang: -0.32 }, ears: { type: 'up', len: 0.14, w: 0.08 }, tail: { len: 0.42, r: 0.048, droop: 0.95, bushy: true }, paint: stripes('#ad9f80', '#cbbf9f', '#2f2a22', 13),
    extra: (r, m) => r.add(loft([0, 0.5, 1].map(t => new V3(0, m.bodyY0 + m.D * 0.48 - t * 0.12, m.L * 0.45 - t * m.L * 0.7)), [0.03, 0.03, 0.02], [0.12, 0.10, 0.06], 5), 'body', C('#2c2720')) } },
  // Primates (chimpanzee, baboon, macaques, langur with prehensile climbing limbs & hands)
  chimpanzee: { fam: 'quad', beh: 'primate', o: {
    L: 0.82, D: 0.52, W: 0.46, leg: 0.42, legF: 1.48, legR: 0.082, legTaper: 0.85,
    primate: true, knuckleWalking: true, handCol: '#241e1a', faceCol: '#26201a',
    neck: { len: 0.12, r0: 0.15, r1: 0.14, ang: 0.62 },
    head: { len: 0.28, w: 0.13, h: 0.14, snout: 0.78, ang: 0.05 },
    ears: { type: 'side', len: 0.075, w: 0.055 },
    noseCol: '#181210',
    prof: CHIMP_PROF,
    paint: chimpPaint,
    extra: chimpFaceExtra
  } },
  rhesus_macaque: { fam: 'quad', beh: 'primate', o: {
    L: 0.52, D: 0.28, W: 0.23, leg: 0.30, legF: 1.06, legR: 0.036, legTaper: 0.82,
    primate: true, handCol: '#c88078', faceCol: '#d48880',
    neck: { len: 0.08, r0: 0.078, r1: 0.068, ang: 0.42 },
    head: { len: 0.16, w: 0.068, h: 0.072, snout: 0.68, ang: 0 },
    ears: { type: 'side', len: 0.035, w: 0.025 },
    tail: { len: 0.28, r: 0.018, droop: 0.45 },
    noseCol: '#ad5c64',
    paint: rhesusPaint,
    extra: rhesusRumpExtra
  } },
  bonnet_macaque: { fam: 'quad', beh: 'primate', o: {
    L: 0.48, D: 0.24, W: 0.20, leg: 0.28, legF: 1.08, legR: 0.032, legTaper: 0.82,
    primate: true, handCol: '#cf988e', faceCol: '#d89e94',
    neck: { len: 0.08, r0: 0.07, r1: 0.065, ang: 0.42 },
    head: { len: 0.16, w: 0.06, h: 0.065, snout: 0.68, ang: 0 },
    ears: { type: 'side', len: 0.035, w: 0.025 },
    tail: { len: 0.52, r: 0.015, droop: 0.6 },
    noseCol: '#b5746a',
    paint: bonnetPaint,
    extra: bonnetCapExtra
  } },
  stump_tailed_macaque: { fam: 'quad', beh: 'primate', o: {
    L: 0.58, D: 0.34, W: 0.26, leg: 0.32, legF: 1.06, legR: 0.040, legTaper: 0.82,
    primate: true, handCol: '#b8382c', faceCol: '#c42018',
    neck: { len: 0.08, r0: 0.09, r1: 0.085, ang: 0.42 },
    head: { len: 0.18, w: 0.078, h: 0.082, snout: 0.72, ang: 0 },
    ears: { type: 'side', len: 0.035, w: 0.025 },
    tail: { len: 0.05, r: 0.024, droop: 0.5 },
    noseCol: '#8e1e16',
    paint: stumpPaint,
    extra: stumpFaceExtra
  } },
  marmoset: { fam: 'quad', beh: 'primate', scale: 1, o: {
    L: 0.35, D: 0.18, W: 0.16, leg: 0.18, legR: 0.022, legTaper: 0.8,
    primate: true, handCol: '#6c6760', faceCol: '#544a42',
    neck: { len: 0.05, r0: 0.045, r1: 0.042, ang: 0.4 },
    head: { len: 0.10, w: 0.052, h: 0.052, snout: 0.6, ang: 0 },
    ears: { type: 'side', len: 0.04, w: 0.03 },
    tail: { len: 0.45, r: 0.016, droop: 0.6 },
    paint: marmosetPaint
  } },
  ring_tailed_lemur: { fam: 'quad', beh: 'primate', o: {
    L: 0.44, D: 0.20, W: 0.16, leg: 0.25, legR: 0.024, legTaper: 0.8,
    primate: true, handCol: '#161412', faceCol: '#f4f0e6',
    neck: { len: 0.07, r0: 0.055, r1: 0.05, ang: 0.4 },
    head: { len: 0.14, w: 0.045, h: 0.048, snout: 0.45, ang: -0.05 },
    ears: { type: 'up', len: 0.045, w: 0.028 },
    tail: { len: 0.62, r: 0.024, droop: 0.25, bushy: true },
    noseCol: '#0e0d0c',
    paint: lemurPaint,
    extra: lemurFaceExtra
  } },
  hamadryas_baboon: { fam: 'quad', beh: 'primate', o: {
    L: 0.76, D: 0.40, W: 0.34, leg: 0.46, legF: 1.18, legR: 0.052, legTaper: 0.82,
    primate: true, handCol: '#c47870', faceCol: '#cb867e',
    callosityCol: '#e05268',
    neck: { len: 0.12, r0: 0.14, r1: 0.12, ang: 0.42 },
    head: { len: 0.30, w: 0.092, h: 0.102, snout: 0.60, ang: -0.15 },
    ears: { type: 'side', len: 0.035, w: 0.025 },
    tail: { len: 0.50, r: 0.025, droop: 0.6, arched: true },
    noseCol: '#241a18',
    paint: baboonPaint,
    extra: baboonSnoutExtra,
    maleExtra: baboonMantleExtra
  } },
  giant_squirrel: { fam: 'quad', beh: 'primate', o: { L: 0.32, D: 0.12, W: 0.1, leg: 0.12, legR: 0.016, legTaper: 0.8, paw: true, neck: { len: 0.04, r0: 0.04, r1: 0.04, ang: 0.4 }, head: { len: 0.08, w: 0.035, h: 0.035, snout: 0.6, ang: 0 }, ears: { type: 'up', len: 0.03, w: 0.015 }, tail: { len: 0.45, r: 0.03, droop: 0.1, bushy: true }, paint: (c, x, y, z, part, m) => { c.set('#6a2a1e').lerp(C('#e6d2a2'), 1 - belly(m, y, m.D)); if (part === 'tail') c.set('#4a2016'); fur(c, x, y, z, 0.2, 60); } } },
  langur: { fam: 'quad', beh: 'primate', o: {
    L: 0.64, D: 0.26, W: 0.22, leg: 0.52, legF: 1.14, legR: 0.034, legTaper: 0.82,
    primate: true, handCol: '#141312', faceCol: '#121110',
    neck: { len: 0.10, r0: 0.08, r1: 0.07, ang: 0.45 },
    head: { len: 0.18, w: 0.07, h: 0.075, snout: 0.65, ang: 0 },
    ears: { type: 'side', len: 0.035, w: 0.025 },
    tail: { len: 0.85, r: 0.016, droop: 0.15, arched: true },
    noseCol: '#121110',
    paint: langurPaint,
    extra: langurHaloExtra
  } },
  common_langur: { fam: 'quad', beh: 'primate', o: {
    L: 0.64, D: 0.26, W: 0.22, leg: 0.52, legF: 1.14, legR: 0.034, legTaper: 0.82,
    primate: true, handCol: '#141312', faceCol: '#121110',
    neck: { len: 0.10, r0: 0.08, r1: 0.07, ang: 0.45 },
    head: { len: 0.18, w: 0.07, h: 0.075, snout: 0.65, ang: 0 },
    ears: { type: 'side', len: 0.035, w: 0.025 },
    tail: { len: 0.85, r: 0.016, droop: 0.15, arched: true },
    noseCol: '#121110',
    paint: langurPaint,
    extra: langurHaloExtra
  } },
  // Birds (SahilK-027/Crystal-Bird bird contours & avian shapes)
  ostrich: { fam: 'bird', beh: 'ratite', o: { L: 1.1, H: 0.75, leg: 1.1, neck: 0.9, neckR: 0.05, headR: 0.07, beak: 0.08, beakCol: '#c8a07c', legR: 0.05, legCol: '#c79a8a', tail: 0.25, fan: 0.3, paint: (c, x, y, z, part) => { c.set(part === 'neck' || part === 'head' ? '#c9a598' : '#1d1a18'); if ((part === 'wing' && z < -0.4) || part === 'tail') c.set('#efe9de'); fur(c, x, y, z, 0.25, 30); } } },
  emu: { fam: 'bird', beh: 'ratite', o: { L: 1.0, H: 0.7, leg: 0.85, neck: 0.65, neckR: 0.05, headR: 0.065, beak: 0.07, beakCol: '#2a2622', legR: 0.045, legCol: '#5a5048', tail: 0.2, paint: (c, x, y, z, part) => { c.set(part === 'neck' || part === 'head' ? '#56688a' : '#6a5a48'); fur(c, x, y, z, 0.45, 40); } } },
  pelican: { fam: 'bird', beh: 'swimmer', o: { L: 1.05, H: 0.45, leg: 0.30, neck: 0.42, neckR: 0.055, headR: 0.065, beak: 0.42, beakCol: '#dfaa3a', pouchCol: '#e5b238', legR: 0.028, legCol: '#d89868', tail: 0.16, pelican: true, boatHull: true, wide: 1.3, paint: pelicanPaint } },
  swan: { fam: 'bird', beh: 'swimmer', o: { L: 0.88, H: 0.40, leg: 0.22, neck: 0.62, neckR: 0.038, headR: 0.052, beak: 0.085, beakCol: '#e47018', legR: 0.022, legCol: '#22201e', tail: 0.16, tilt: 0.25, swan: true, wide: 1.35, boatHull: true, paint: swanPaint } },
  sarus_crane: { fam: 'bird', beh: 'wader', o: { L: 0.82, H: 0.48, leg: 0.95, neck: 0.72, neckR: 0.032, headR: 0.052, beak: 0.24, beakCol: '#52544a', legR: 0.022, legCol: '#c8867a', tail: 0.24, crane: true, sCurve: true, wide: 0.95, paint: cranePaint } },
  pheasant: { fam: 'bird', beh: 'ground', o: { L: 0.38, H: 0.2, leg: 0.16, neck: 0.12, neckR: 0.03, headR: 0.035, beak: 0.03, beakCol: '#c8b47a', legR: 0.012, legCol: '#7a6a5a', tail: 0.45, fan: 0.05, tilt: 0.25, paint: (c, x, y, z, part) => { c.set(part === 'neck' || part === 'head' ? '#2e5a4a' : '#8a4222'); if (part === 'tail') c.set(Math.sin(z * 50) > 0 ? '#c49a4a' : '#4a2e1a'); fur(c, x, y, z, 0.2, 40); } } },
  birds_of_prey: { fam: 'bird', beh: 'perch', o: { L: 0.50, H: 0.32, leg: 0.14, neck: 0.10, neckR: 0.065, headR: 0.065, beak: 0.065, beakCol: '#26221c', cereCol: '#e8b528', legR: 0.018, legCol: '#e8b528', tail: 0.24, fan: 0.15, tilt: 0.9, raptor: true, wide: 1.05, paint: raptorPaint } },
  african_parrot: { fam: 'bird', beh: 'perch', o: { L: 0.28, H: 0.16, leg: 0.07, neck: 0.05, neckR: 0.04, headR: 0.04, beak: 0.03, beakDown: 0.9, beakCol: '#1c1a18', legR: 0.01, legCol: '#5a5a5a', tail: 0.1, fan: 0.08, tilt: 0.9, paint: (c, x, y, z, part) => { c.set('#8d9093'); if (part === 'tail') c.set('#c2241f'); fur(c, x, y, z, 0.2, 60); } } },
  lovebird: { fam: 'bird', beh: 'perch', o: { L: 0.14, H: 0.08, leg: 0.04, neck: 0.025, neckR: 0.022, headR: 0.024, beak: 0.015, beakDown: 0.9, beakCol: '#e04a2a', legR: 0.006, legCol: '#7a7a7a', tail: 0.04, tilt: 0.9, paint: (c, x, y, z, part) => { c.set(part === 'head' ? '#f2956a' : '#56a23a'); if (part === 'tail') c.set('#3a6ad0'); } } },
  // Reptiles
  mugger: { fam: 'reptile', beh: 'croc', o: { L: 3.2, W: 0.62, H: 0.36, leg: 0.28, snout: 0.75, tailFrac: 0.45, paint: (c, x, y, z, part, m) => { c.set('#45472f').lerp(C('#9a9468'), y < m.bodyY0 - 0.08 ? 0.7 : 0); if (Math.sin(z * 14) > 0.6 && y > m.bodyY0) c.multiplyScalar(0.75); fur(c, x, y, z, 0.25, 20); } } },
  saltwater_crocodile: { fam: 'reptile', beh: 'croc', o: { L: 4.0, W: 0.72, H: 0.42, leg: 0.32, snout: 0.6, tailFrac: 0.46, paint: (c, x, y, z, part, m) => { c.set('#5a5634').lerp(C('#c8bc86'), y < m.bodyY0 - 0.1 ? 0.75 : 0); if (Math.sin(z * 11) > 0.65 && y > m.bodyY0) c.multiplyScalar(0.7); fur(c, x, y, z, 0.25, 18); } } },
  gharial: { fam: 'reptile', beh: 'croc', o: { L: 3.6, W: 0.5, H: 0.32, leg: 0.24, snout: 0.22, tailFrac: 0.44, ghara: true, headH: 0.9, paint: (c, x, y, z, part, m) => { c.set('#6a6a50').lerp(C('#d2cba6'), y < m.bodyY0 - 0.06 ? 0.7 : 0); fur(c, x, y, z, 0.2, 18); } } },
  bengal_monitor: { fam: 'reptile', beh: 'lizard', o: { L: 1.3, W: 0.16, H: 0.1, leg: 0.12, snout: 0.6, tailFrac: 0.55, paint: (c, x, y, z) => { c.set('#7b6b4b'); if (noise3(x * 30, y * 30, z * 30) > 0.68) c.set('#c2a56a'); fur(c, x, y, z, 0.25, 30); } } },
  water_monitor: { fam: 'reptile', beh: 'lizard', o: { L: 1.7, W: 0.2, H: 0.12, leg: 0.14, snout: 0.6, tailFrac: 0.56, paint: (c, x, y, z) => { c.set('#2f3027'); if (noise3(x * 25, y * 25, z * 25) > 0.66) c.set('#c4b25a'); fur(c, x, y, z, 0.2, 30); } } },
  green_iguana: { fam: 'reptile', beh: 'lizard', o: { L: 1.3, W: 0.14, H: 0.12, leg: 0.12, snout: 0.75, tailFrac: 0.62, spikes: true, headH: 1.5, paint: (c, x, y, z, part) => { c.set('#5e8a3a'); if (part === 'tail' && Math.sin(z * 18) > 0.5) c.set('#3a4a2a'); if (part === 'spike') c.set('#8aa860'); fur(c, x, y, z, 0.2, 30); } } },
  // Snakes (realistic tapering, detailed cobra hood, python girth)
  rat_snake: { fam: 'snake', beh: 'snake', o: { L: 2.0, R: 0.024, paint: ratSnakePaint } },
  indian_cobra: { fam: 'snake', beh: 'snake', o: { L: 1.65, R: 0.028, hood: true, paint: cobraPaint } },
  rock_python: { fam: 'snake', beh: 'snake', o: { L: 3.2, R: 0.092, python: true, paint: pythonPaint } },
  // Chelonian
  star_tortoise: { fam: 'chelonian', beh: 'tortoise', o: { L: 0.3, W: 0.24, H: 0.2, paint: (c, x, y, z, part) => { if (part === 'skin') { c.set('#c2a368'); return; } c.set('#2a2116'); const cx = Math.round(x / 0.07) * 0.07, cz = Math.round(z / 0.07) * 0.07; const ang = Math.atan2(z - cz, x - cx); if (Math.abs(Math.sin(ang * 3)) < 0.3) c.set('#d8b44a'); } } },
  terrapin: { fam: 'chelonian', beh: 'turtle', o: { L: 0.4, W: 0.32, H: 0.12, flat: true, paint: (c, x, y, z, part) => { c.set(part === 'skin' ? '#4a4c36' : '#3e3f2c'); if (noise2(x * 30, z * 30) > 0.65) c.multiplyScalar(0.8); } } },
};

const cache = new Map();
/** The Bengal tiger benchmark is injected by animals.js (avoids a circular import with tiger.js). */
export const TIGER_BENCHMARK = { enabled: true, build: null };
export const WHITE_TIGER_BENCHMARK = { enabled: true, build: null };
export const LION_BENCHMARK = { enabled: true, build: null };
export const HYENA_BENCHMARK = { enabled: true, build: null };
export const DHOLE_BENCHMARK = { enabled: true, build: null };
export { MARMOSET_BENCHMARK };
/** Build (or fetch cached) template geometry for a species + sex. */
export function template(id, male) {
  const key = id + (male ? ':m' : ':f');
  if (cache.has(key)) return cache.get(key);
  const S = SPECIES_MODELS[id]; if (!S) throw new Error('No model for ' + id);
  if (id === 'bengal_tiger' && TIGER_BENCHMARK.enabled && TIGER_BENCHMARK.build) { const t = TIGER_BENCHMARK.build(male); cache.set(key, t); return t; }
  if (id === 'white_tiger' && WHITE_TIGER_BENCHMARK.enabled && WHITE_TIGER_BENCHMARK.build) { const t = WHITE_TIGER_BENCHMARK.build(male); cache.set(key, t); return t; }
  if (id === 'lion' && LION_BENCHMARK.enabled && LION_BENCHMARK.build) { const t = LION_BENCHMARK.build(male); cache.set(key, t); return t; }
  if (id === 'striped_hyena' && HYENA_BENCHMARK.enabled && HYENA_BENCHMARK.build) { const t = HYENA_BENCHMARK.build(male); cache.set(key, t); return t; }
  if (id === 'dhole' && DHOLE_BENCHMARK.enabled && DHOLE_BENCHMARK.build) { const t = DHOLE_BENCHMARK.build(male); cache.set(key, t); return t; }
  if (id === 'marmoset' && MARMOSET_BENCHMARK.enabled && MARMOSET_BENCHMARK.build) { const t = MARMOSET_BENCHMARK.build(male); cache.set(key, t); return t; }
  const o = { ...S.o };
  const sexExtra = male ? S.o.maleExtra || S.maleExtra : S.o.femaleExtra || S.femaleExtra;
  if (sexExtra || o.extra) { const base = o.extra; o.extra = (r, m, col) => { if (base) base(r, m, col); if (sexExtra) sexExtra(r, m, col); }; }
  const paintFn = o.paint; o.paint = (c, x, y, z, part, m) => { m.male = male; paintFn(c, x, y, z, part, m); };
  const fn = { quad: quadruped, bird, reptile, snake, chelonian, hyena: quadruped, dhole: quadruped, lion: quadruped, white_tiger: quadruped }[S.fam];
  const tpl = fn(o);
  tpl.fam = S.fam; tpl.beh = S.beh;
  cache.set(key, tpl);
  return tpl;
}
