// Visitors and zoo staff. Every person moves ONLY on the public walkable grid (same grid as the
// player and the router), so nobody can wander into an enclosure. Staff hold posts or patrol paths.
import * as THREE from 'three';
import { Rig, instantiate } from '../animals/models.js';
import { findPath } from '../player/navigation.js';
import { toWorld } from '../config.js';
import { V3, rand, rr, pick, clamp, lerp, damp, wrapAngle, loft, limb, ellipsoid, noise2, seed, paint } from '../core/util.js';

const C = h => new THREE.Color(h);

const SKIN = [
  '#5c3826', // deep warm bronze
  '#74462e', // rich caramel
  '#8d5a3c', // warm chestnut
  '#a86e4a', // golden bronze
  '#b98260', // honey tan
  '#c6926f', // warm almond
  '#d4a382'  // light golden
];

const SHIRT = [
  '#1e3a8a', // royal navy
  '#f8fafc', // crisp white
  '#b91c1c', // deep ruby
  '#15803d', // forest emerald
  '#d97706', // warm saffron amber
  '#6b21a8', // royal violet
  '#0284c7', // sky azure
  '#334155', // slate charcoal
  '#ea580c', // terracotta orange
  '#0d9488', // peacock teal
  '#e11d48'  // coral rose
];

const PANTS = [
  '#1e293b', // deep navy
  '#253b59', // classic denim blue
  '#334155', // slate blue
  '#475569', // washed denim
  '#b8a88a', // sand khaki
  '#4a4539', // olive chino
  '#18181b', // dark charcoal
  '#e2d9cc'  // cream chino
];

const SARI = [
  '#991b1b', // crimson silk
  '#be185d', // rani / magenta pink
  '#1e40af', // royal sapphire blue
  '#065f46', // deep emerald
  '#7c2d12', // rust copper
  '#6b21a8', // deep royal purple
  '#d97706', // marigold saffron
  '#0f766e', // rich teal silk
  '#831843'  // deep wine silk
];

const SARI_BORDERS = [
  '#f59e0b', // gleaming golden zari
  '#fbbf24', // radiant bright gold
  '#e5e7eb', // silver zari thread
  '#f97316', // bright orange contrast
  '#dc2626'  // bright vermillion
];

const BACKPACK_COLS = [
  '#2563eb', // bright cobalt
  '#dc2626', // crimson red
  '#7c3aed', // energetic violet
  '#059669', // emerald green
  '#ea580c', // sunny orange
  '#0284c7'  // azure cyan
];

// =============================================================================
// MODULAR NPC ARCHITECTURE: ARCHETYPES & BEHAVIORS
// =============================================================================

/**
 * Declarative NPC demographic archetypes with morphological proportions,
 * cultural dress styles, footwear, accessories, and allowed refreshment types.
 */
export const NPC_ARCHETYPES = {
  man: {
    id: 'man',
    name: 'Adult Male Visitor',
    demographic: 'adult',
    heightRange: [1.68, 1.78],
    headRatio: 0.063,
    features: { hair: 'crop_fade', collar: true, buttonPlacket: true },
    footwear: 'sneakers',
    accessories: ['smartphone', 'watch'],
    allowedSnacks: ['icecream', 'bottle', 'snack']
  },
  sari: {
    id: 'sari',
    name: 'Woman in Traditional Sari',
    demographic: 'adult',
    heightRange: [1.54, 1.62],
    headRatio: 0.063,
    features: { hair: 'chignon_gajra', pleats: true, zariBorder: true, drapedPallu: true },
    footwear: 'Kolhapuri',
    accessories: ['bangles', 'smartphone'],
    allowedSnacks: ['icecream', 'bottle', 'snack']
  },
  kurta: {
    id: 'kurta',
    name: 'Adult in Traditional Kurta Pajama',
    demographic: 'adult',
    heightRange: [1.62, 1.72],
    headRatio: 0.063,
    features: { tunic: 'knee_length', collar: 'Mandarin', placketButtons: true },
    footwear: 'Kolhapuri',
    accessories: ['watch', 'smartphone'],
    allowedSnacks: ['icecream', 'bottle', 'snack']
  },
  elder: {
    id: 'elder',
    name: 'Senior Citizen Elder',
    demographic: 'senior',
    heightRange: [1.58, 1.64],
    headRatio: 0.063,
    features: { hair: 'silver_receding', spectacles: true, stoop: 0.015, tunic: 'knee_length' },
    footwear: 'Kolhapuri',
    accessories: ['spectacles'],
    allowedSnacks: ['bottle', 'snack', 'icecream']
  },
  child: {
    id: 'child',
    name: 'Child / Youth Visitor',
    demographic: 'child',
    heightRange: [1.10, 1.25],
    headRatio: 0.082,
    features: { backpack: true, shorts: true, cropHair: true },
    footwear: 'sneakers',
    accessories: ['backpack'],
    allowedSnacks: ['icecream', 'bottle', 'snack']
  },
  staff: {
    id: 'staff',
    name: 'Official Zoo Ranger / Attendant',
    demographic: 'staff',
    heightRange: [1.70, 1.76],
    headRatio: 0.063,
    features: { uniform: 'khaki_safari', flapPockets: true, officialBadge: true, epaulets: true, cap: 'peaked cap' },
    footwear: 'tactical work boots',
    accessories: ['utility_pouch', 'badge', 'peaked cap'],
    allowedSnacks: []
  }
};

/**
 * Modular Behavioral State Controllers for all zoo NPC activities.
 */
export const NPC_BEHAVIORS = {
  walker: {
    id: 'walker',
    speed: 1.2,
    desc: 'Roams freely along the public path network visiting exhibits.'
  },
  follower: {
    id: 'follower',
    speed: 1.25,
    desc: 'Accompanies family group leader in loose bipedal formation.'
  },
  viewer: {
    id: 'viewer',
    speed: 1.1,
    desc: 'Stands clear on exhibit viewing aprons taking photos, pointing, and observing wildlife.'
  },
  sitter: {
    id: 'sitter',
    speed: 0,
    desc: 'Relaxes on pathway benches eating snacks, drinking water, or licking ice-cream.'
  },
  canteen_diner: {
    id: 'canteen_diner',
    speed: 0,
    desc: 'Seated at Canteen plaza dining tables eating refreshments and conversing with table companions.'
  },
  canteen_queue: {
    id: 'canteen_queue',
    speed: 0.4,
    desc: 'Stands in orderly ordering queue outside the Canteen counter glancing at menu boards.'
  },
  canteen_cashier: {
    id: 'canteen_cashier',
    speed: 0,
    desc: 'Zoo canteen staff taking food orders, serving meals, and interacting with customers.'
  },
  social_group: {
    id: 'social_group',
    speed: 0,
    desc: 'Converses in lively conversational circles in the Canteen plaza with turn-taking speech.'
  },
  stall_vendor: {
    id: 'stall_vendor',
    speed: 0,
    desc: 'Operates refreshment kiosks (tender coconut, fresh juices, kulfi/ice-cream).'
  },
  stall_customer: {
    id: 'stall_customer',
    speed: 0.5,
    desc: 'Browses refreshment displays and orders snacks/beverages at plaza kiosks.'
  },
  patrol: {
    id: 'patrol',
    speed: 1.0,
    desc: 'Uniformed staff patrolling pathways on assigned routes.'
  },
  post: {
    id: 'post',
    speed: 0,
    desc: 'Staff stationed at entrance gates, ticketing checkpoints, and facility entrances.'
  }
};

const ROLE_SPEED = {
  walker: 1.2,
  follower: 1.25,
  viewer: 1.1,
  patrol: 1.0,
  sitter: 0,
  canteen_diner: 0,
  canteen_queue: 0.4,
  canteen_cashier: 0,
  social_group: 0,
  stall_vendor: 0,
  stall_customer: 0.5,
  post: 0
};

/**
 * Procedural humanoid model with anatomical proportions, sculpted facial features,
 * diverse hair styling, culturally authentic clothing (casual shirts with collars, jeans/chinos,
 * elegant draped saris with zari borders, kurtas with Mandarin collars, staff uniforms with
 * badges and peaked caps, children with backpacks), footwear (shoes, sandals, boots),
 * accessories (smartphones, caps, bags), and handheld refreshments (ice-cream cones,
 * mineral water bottles, crispy snack packs).
 * Built as a single merged SkinnedMesh template with vertex colors.
 */
export function humanoid(kind, H, cols, variant = 0, propType = null) {
  const r = new Rig();
  const skin = C(cols.skin), top = C(cols.top), bottom = C(cols.bottom);
  const borderCol = C(cols.border || '#f59e0b');
  const hairColor = C(cols.hair || (kind === 'elder' ? '#d1d5db' : '#151110'));
  const shoeCol = C(cols.shoe || (kind === 'staff' ? '#1c1917' : pick(['#18181b', '#3b2f2f', '#1e3a5f', '#f8fafc', '#78350f'])));

  const isChild = kind === 'child';
  const isElder = kind === 'elder';
  const isStaff = kind === 'staff';
  const isSari = kind === 'sari';
  const isKurta = kind === 'kurta';

  // Handheld snack / refreshment prop in left hand
  const activeProp = propType || cols.snackProp || cols.prop || null;

  // Anatomical proportions based on demographic archetype
  const hipY = H * (isChild ? 0.49 : isSari ? 0.515 : 0.525);
  const shY = H * (isChild ? 0.79 : 0.82);
  const headY = H * (isChild ? 0.91 : 0.925);
  const hr = H * (isChild ? 0.082 : 0.063); // Relative head size (youth ratio ~1:5.5 vs adult ~1:7.5)

  const shW = H * (isChild ? 0.11 : isSari ? 0.115 : isStaff ? 0.138 : 0.132); // Shoulder width
  const hipW = H * (isChild ? 0.048 : isSari ? 0.058 : 0.054);                // Pelvic width

  // Skeletal joints (11 standard bipedal joints)
  r.joint('pelvis', null, new V3(0, hipY, 0))
   .joint('spine', 'pelvis', new V3(0, H * (isChild ? 0.57 : 0.59), 0))
   .joint('head', 'spine', new V3(0, H * (isChild ? 0.83 : 0.86), isElder ? H * 0.015 : 0));

  const shade = (base, k = 0.12) => (c, x, y, z) => c.copy(base).multiplyScalar(1 - k / 2 + k * noise2(x * 40 + z * 30, y * 30));

  // --- 1. Torso & Waist (Pelvis & Spine) ---
  // Pelvis / lower abdomen
  const pelvisPts = [0.49, 0.53, 0.58].map(f => new V3(0, H * f, 0));
  const pelvRadiiX = isSari ? [H * 0.112, H * 0.105, H * 0.095] : [H * 0.098, H * 0.095, H * 0.092];
  const pelvRadiiZ = isSari ? [H * 0.076, H * 0.072, H * 0.068] : [H * 0.068, H * 0.066, H * 0.064];
  r.add(loft(pelvisPts, pelvRadiiX, pelvRadiiZ, 12), 'pelvis', isKurta || isElder ? shade(top) : shade(bottom));

  // Belt / waistband (for pants, shorts, staff uniform)
  if (!isSari && !isKurta) {
    const beltCol = isStaff ? C('#261b10') : C('#18181b');
    r.add(loft([new V3(0, H * 0.518, 0), new V3(0, H * 0.532, 0)], [H * 0.10, H * 0.098], [H * 0.070, H * 0.068], 12), 'pelvis', beltCol);
    // Buckle at front
    const buckleCol = isStaff ? C('#fbbf24') : C('#cbd5e1');
    r.add(ellipsoid(new V3(0, H * 0.525, H * 0.071), H * 0.018, H * 0.010, H * 0.005, 6, 4), 'pelvis', buckleCol);
    if (isStaff) {
      // Ranger utility belt pouch
      r.add(ellipsoid(new V3(H * 0.10, H * 0.515, 0), H * 0.018, H * 0.030, H * 0.022, 6, 4), 'pelvis', C('#261b10'));
    }
  }

  // Spine / upper torso & ribcage
  const spinePts = [0.58, 0.66, 0.75, 0.825].map(f => new V3(0, H * f, 0));
  const spineRadiiX = isSari ? [H * 0.090, H * 0.102, H * 0.112, H * 0.098] : [H * 0.092, H * 0.112, H * 0.125, H * 0.105];
  const spineRadiiZ = isSari ? [H * 0.065, H * 0.074, H * 0.072, H * 0.060] : [H * 0.064, H * 0.075, H * 0.078, H * 0.062];
  r.add(loft(spinePts, spineRadiiX, spineRadiiZ, 12), 'spine', shade(top));

  // --- 2. Garment Details: Collars, Sarees, Kurtas, Uniforms, Backpacks ---
  // Casual shirts with folded collar & button placket
  if (!isSari && !isKurta && (kind === 'man' || isChild || (isElder && variant === 0))) {
    const collarCol = shade(top, 0.05);
    // Left collar flap
    r.add(loft([
      new V3(H * 0.022, H * 0.835, H * 0.030),
      new V3(H * 0.050, H * 0.810, H * 0.040),
      new V3(H * 0.020, H * 0.775, H * 0.068)
    ], [H * 0.012, H * 0.015, H * 0.010], [H * 0.016, H * 0.018, H * 0.014], 6), 'spine', collarCol);
    // Right collar flap
    r.add(loft([
      new V3(-H * 0.022, H * 0.835, H * 0.030),
      new V3(-H * 0.050, H * 0.810, H * 0.040),
      new V3(-H * 0.020, H * 0.775, H * 0.068)
    ], [H * 0.012, H * 0.015, H * 0.010], [H * 0.016, H * 0.018, H * 0.014], 6), 'spine', collarCol);
    // Vertical button placket strip down center chest
    r.add(loft([new V3(0, H * 0.81, H * 0.065), new V3(0, H * 0.58, H * 0.066)], [H * 0.012, H * 0.012], [H * 0.005, H * 0.005], 6), 'spine', shade(top, 0.15));
    // Miniature front buttons
    for (const f of [0.76, 0.70, 0.64]) {
      r.add(ellipsoid(new V3(0, H * f, H * 0.071), H * 0.004, H * 0.004, H * 0.003, 5, 4), 'spine', C('#f1f5f9'));
    }
  }

  // Kurta tunic with Mandarin collar & front placket
  if (isKurta || isElder) {
    // Knee/thigh-length tunic hanging below pelvis with side vents
    r.add(loft([
      new V3(0, H * 0.58, 0),
      new V3(0, H * 0.48, 0),
      new V3(0, H * 0.38, 0)
    ], [H * 0.100, H * 0.118, H * 0.132], [H * 0.072, H * 0.086, H * 0.096], 12, false), 'pelvis', shade(top));
    // Mandarin band collar
    r.add(limb(new V3(0, H * 0.815, 0), new V3(0, H * 0.842, 0), H * 0.046, H * 0.044, 10), 'spine', shade(top, 0.05));
    // Kurta chest placket & buttons
    r.add(loft([new V3(0, H * 0.835, H * 0.060), new V3(0, H * 0.68, H * 0.070)], [H * 0.010, H * 0.010], [H * 0.004, H * 0.004], 6), 'spine', shade(top, 0.15));
    for (const f of [0.80, 0.75, 0.70]) {
      r.add(ellipsoid(new V3(0, H * f, H * 0.074), H * 0.004, H * 0.004, H * 0.003, 5, 4), 'spine', borderCol);
    }
  }

  // Elegant draped sari: Pleated flared skirt + Zari border + Draped Pallu
  if (isSari) {
    // Flowing pleated skirt
    r.add(loft([
      new V3(0, H * 0.54, 0),
      new V3(0, H * 0.38, 0),
      new V3(0, H * 0.20, 0),
      new V3(0, H * 0.035, 0)
    ], [H * 0.105, H * 0.125, H * 0.145, H * 0.165], [H * 0.076, H * 0.092, H * 0.112, H * 0.132], 14, false),
    'pelvis', (c, x, y, z) => {
      c.copy(bottom).multiplyScalar(0.88 + 0.22 * noise2(x * 25, y * 10));
      if (y < H * 0.075) c.copy(borderCol); // Gleaming golden/silver zari border
    });
    // Draped Pallu wrapped across chest over left shoulder and cascading down back
    r.add(loft([
      new V3(-H * 0.08, H * 0.54, H * 0.065), // right waist
      new V3(0, H * 0.68, H * 0.078),          // center chest
      new V3(H * 0.08, H * 0.81, H * 0.035),   // over left shoulder
      new V3(H * 0.06, H * 0.68, -H * 0.075),  // upper back
      new V3(H * 0.04, H * 0.48, -H * 0.078)   // cascading lower back
    ], [H * 0.035, H * 0.038, H * 0.042, H * 0.038, H * 0.035],
       [H * 0.018, H * 0.020, H * 0.022, H * 0.020, H * 0.018], 8), 'spine', (c, x, y, z) => {
      c.copy(bottom).multiplyScalar(0.92 + 0.18 * noise2(x * 20, y * 8));
      if (Math.abs(x) > H * 0.06 || y < H * 0.52) c.copy(borderCol);
    });
  }

  // Staff uniform: flap pockets, official zoo badge, shoulder epaulets
  if (isStaff) {
    // Dual chest flap pockets
    for (const s of [-1, 1]) {
      r.add(ellipsoid(new V3(s * H * 0.060, H * 0.725, H * 0.076), H * 0.024, H * 0.026, H * 0.006, 6, 4), 'spine', shade(top, 0.08));
      r.add(ellipsoid(new V3(s * H * 0.060, H * 0.742, H * 0.080), H * 0.025, H * 0.008, H * 0.005, 6, 4), 'spine', shade(top, -0.1));
      r.add(ellipsoid(new V3(s * H * 0.060, H * 0.738, H * 0.083), H * 0.003, H * 0.003, H * 0.002, 4, 3), 'spine', C('#fbbf24'));
    }
    // Official golden zoo ranger badge on left chest pocket
    r.add(ellipsoid(new V3(H * 0.062, H * 0.718, H * 0.083), H * 0.010, H * 0.014, H * 0.004, 6, 4), 'spine', C('#fbbf24'));
    // Shoulder epaulets
    for (const s of [-1, 1]) {
      r.add(loft([
        new V3(s * H * 0.085, H * 0.825, 0),
        new V3(s * (shW + H * 0.005), shY, 0)
      ], [H * 0.014, H * 0.016], [H * 0.006, H * 0.006], 5), 'spine', shade(top, -0.15));
      r.add(ellipsoid(new V3(s * H * 0.090, H * 0.830, 0), H * 0.004, H * 0.004, H * 0.003, 4, 3), 'spine', C('#fbbf24'));
    }
  }

  // Children with 3D backpacks (and some hikers)
  if (isChild || (kind === 'man' && variant === 3)) {
    const packCol = C(cols.backpack || pick(BACKPACK_COLS));
    const packTrim = C('#1e293b');
    // Main backpack pack volume
    r.add(ellipsoid(new V3(0, H * 0.67, -H * 0.11), H * 0.10, H * 0.13, H * 0.065, 8, 6), 'spine', packCol);
    // Front zip pocket
    r.add(ellipsoid(new V3(0, H * 0.64, -H * 0.165), H * 0.075, H * 0.08, H * 0.035, 7, 5), 'spine', packCol);
    r.add(ellipsoid(new V3(0, H * 0.68, -H * 0.19), H * 0.065, H * 0.006, H * 0.004, 6, 3), 'spine', packTrim);
    // Padded shoulder straps
    for (const s of [-1, 1]) {
      r.add(loft([
        new V3(s * H * 0.060, H * 0.76, -H * 0.08),
        new V3(s * H * 0.070, H * 0.80, 0),
        new V3(s * H * 0.062, H * 0.66, H * 0.072)
      ], [H * 0.014, H * 0.016, H * 0.012], [H * 0.006, H * 0.008, H * 0.006], 6), 'spine', packTrim);
    }
  }

  // --- 3. Neck, Head, Sculpted Facial Features & Hair Styling ---
  // Neck
  r.add(limb(new V3(0, H * 0.82, 0), new V3(0, H * 0.875, isElder ? H * 0.01 : 0), H * 0.032, H * 0.028, 8), 'head', shade(skin, 0.05));

  // Cranium & head base
  r.add(ellipsoid(new V3(0, headY, H * 0.005), hr * 0.86, hr, hr * 0.94, 14, 10), 'head', shade(skin, 0.05));
  // Sculpted jawline & rounded chin
  r.add(ellipsoid(new V3(0, headY - hr * 0.54, hr * 0.18), hr * 0.54, hr * 0.38, hr * 0.58, 12, 8), 'head', shade(skin, 0.05));

  // 3D Sculpted Nose: Bridge and Tip
  r.add(limb(new V3(0, headY + hr * 0.10, hr * 0.74), new V3(0, headY - hr * 0.16, hr * 0.96), hr * 0.10, hr * 0.14, 6), 'head', shade(skin, 0.06));
  r.add(ellipsoid(new V3(0, headY - hr * 0.17, hr * 0.98), hr * 0.16, hr * 0.11, hr * 0.14, 7, 5), 'head', shade(skin, 0.04));

  // Expressive Eyes, Pupils, Eyebrows & Ears
  for (const s of [-1, 1]) {
    // Sclera (white of eye)
    r.add(ellipsoid(new V3(s * hr * 0.34, headY + hr * 0.07, hr * 0.80), hr * 0.13, hr * 0.09, hr * 0.06, 6, 4), 'head', C('#f8fafc'));
    // Iris / Pupil
    r.add(ellipsoid(new V3(s * hr * 0.34, headY + hr * 0.07, hr * 0.84), hr * 0.08, hr * 0.08, hr * 0.04, 5, 4), 'head', C('#1c1917'));
    // Eyebrow
    r.add(ellipsoid(new V3(s * hr * 0.35, headY + hr * 0.22, hr * 0.80), hr * 0.17, hr * 0.045, hr * 0.06, 6, 4), 'head', hairColor);
    // Ear contour
    r.add(ellipsoid(new V3(s * hr * 0.86, headY - hr * 0.06, -hr * 0.04), hr * 0.12, hr * 0.24, hr * 0.18, 7, 5), 'head', shade(skin, 0.08));
  }

  // Sculpted Lips
  r.add(ellipsoid(new V3(0, headY - hr * 0.44, hr * 0.78), hr * 0.24, hr * 0.080, hr * 0.10, 7, 5), 'head', (c) => {
    c.copy(skin).lerp(C('#991b1b'), 0.25); // Natural warm lip tint
  });

  // Spectacles for elders or specific variants
  if (isElder || (kind === 'man' && variant === 2)) {
    const specCol = C('#1e293b');
    for (const s of [-1, 1]) {
      r.add(ellipsoid(new V3(s * hr * 0.34, headY + hr * 0.07, hr * 0.88), hr * 0.15, hr * 0.11, hr * 0.02, 8, 4), 'head', specCol);
      r.add(limb(new V3(s * hr * 0.48, headY + hr * 0.08, hr * 0.80), new V3(s * hr * 0.85, headY + hr * 0.02, -hr * 0.02), hr * 0.02, hr * 0.02, 4), 'head', specCol);
    }
    r.add(limb(new V3(-hr * 0.20, headY + hr * 0.10, hr * 0.86), new V3(hr * 0.20, headY + hr * 0.10, hr * 0.86), hr * 0.02, hr * 0.02, 4), 'head', specCol);
  }

  // Hair Styling & Headwear
  if (isStaff) {
    // Ranger peaked cap: crown + visor + golden zoo badge crest
    r.add(ellipsoid(new V3(0, headY + hr * 0.62, 0), hr * 0.96, hr * 0.42, hr * 1.02, 12, 8), 'head', C('#7d704c'));
    r.add(ellipsoid(new V3(0, headY + hr * 0.48, hr * 0.76), hr * 0.80, hr * 0.07, hr * 0.62, 10, 5), 'head', C('#262016'));
    r.add(ellipsoid(new V3(0, headY + hr * 0.72, hr * 0.86), hr * 0.15, hr * 0.18, hr * 0.06, 6, 4), 'head', C('#fbbf24'));
    r.add(limb(new V3(0, headY + hr * 0.44, 0), new V3(0, headY + hr * 0.52, 0), hr * 0.94, hr * 0.96, 12), 'head', C('#383424'));
  } else if (isSari) {
    // Sleek hair over crown + low chignon bun + Jasmine gajra garland
    r.add(ellipsoid(new V3(0, headY + hr * 0.20, -hr * 0.08), hr * 0.92, hr * 0.82, hr * 0.96, 12, 8), 'head', hairColor);
    r.add(ellipsoid(new V3(0, headY - hr * 0.30, -hr * 0.96), hr * 0.44, hr * 0.38, hr * 0.38, 9, 7), 'head', hairColor);
    const gajraCol = C('#fdfbf7'), leafCol = C('#4d7c0f');
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      const gx = Math.cos(ang) * hr * 0.46;
      const gy = headY - hr * 0.30 + Math.sin(ang) * hr * 0.40;
      const gz = -hr * 0.90;
      r.add(ellipsoid(new V3(gx, gy, gz), hr * 0.09, hr * 0.09, hr * 0.08, 5, 4), 'head', a % 3 === 0 ? leafCol : gajraCol);
    }
  } else if (isElder) {
    // Silver salt-and-pepper hair with receding hairline
    r.add(ellipsoid(new V3(0, headY + hr * 0.12, -hr * 0.15), hr * 0.92, hr * 0.68, hr * 0.92, 10, 7), 'head', hairColor);
    for (const s of [-1, 1]) {
      r.add(ellipsoid(new V3(s * hr * 0.78, headY - hr * 0.08, -hr * 0.15), hr * 0.20, hr * 0.36, hr * 0.45, 6, 4), 'head', hairColor);
    }
  } else {
    // Modern crop / side-fade for men, boys, visitors
    r.add(ellipsoid(new V3(0, headY + hr * 0.24, -hr * 0.06), hr * 0.94, hr * 0.82, hr * 0.98, 12, 8), 'head', hairColor);
    r.add(ellipsoid(new V3(0, headY + hr * 0.50, hr * 0.42), hr * 0.65, hr * 0.24, hr * 0.44, 8, 5), 'head', hairColor);
    for (const s of [-1, 1]) {
      r.add(ellipsoid(new V3(s * hr * 0.75, headY + hr * 0.08, -hr * 0.12), hr * 0.20, hr * 0.36, hr * 0.44, 6, 4), 'head', hairColor);
    }
  }

  // --- 4. Arms, Hands & Accessories ---
  for (const [n, s] of [['armL', 1], ['armR', -1]]) {
    const sh = new V3(s * shW, shY, 0);
    const el = new V3(s * (shW + H * 0.015), H * 0.635, 0);
    const wr = new V3(s * (shW + H * 0.020), H * 0.475, H * 0.01);

    r.joint(n + '1', 'spine', sh).joint(n + '2', n + '1', el);

    // Upper arm sleeve / shoulder
    const upperArmCol = isStaff || isKurta || isElder ? shade(top) : (c, x, y) => c.copy(y > H * 0.73 ? top : skin);
    r.add(limb(sh, el, H * 0.032, H * 0.025, 8), n + '1', upperArmCol);

    // Forearm
    r.add(limb(el, wr, H * 0.024, H * 0.019, 8), n + '2', shade(skin, 0.05));

    // Sculpted Hand (palm + fingers + thumb)
    const palm = wr.clone().add(new V3(0, -H * 0.022, 0));
    r.add(ellipsoid(palm, H * 0.018, H * 0.025, H * 0.020, 8, 5), n + '2', shade(skin, 0.05));
    r.add(ellipsoid(wr.clone().add(new V3(0, -H * 0.044, 0)), H * 0.015, H * 0.018, H * 0.016, 7, 4), n + '2', shade(skin, 0.05));
    r.add(ellipsoid(wr.clone().add(new V3(-s * H * 0.014, -H * 0.024, H * 0.010)), H * 0.009, H * 0.014, H * 0.010, 5, 4), n + '2', shade(skin, 0.05));

    // Wrist accessories: watch / bangles on left wrist
    if (s === 1 && !isStaff && !isChild) {
      r.add(ellipsoid(new V3(wr.x, H * 0.485, wr.z), H * 0.024, H * 0.010, H * 0.024, 7, 4), n + '2', isSari ? C('#fbbf24') : C('#1e293b'));
    }

    // Refreshment Snacks / Ice-Cream Cones / Water Bottles in left hand (s === 1)
    if (s === 1 && activeProp) {
      if (activeProp === 'icecream') {
        // Crispy waffle cone + delicious textured ice cream scoop + swirl & cherry
        const coneTip = palm.clone().add(new V3(0, -H * 0.038, H * 0.012));
        const coneTop = palm.clone().add(new V3(0, H * 0.046, H * 0.038));
        r.add(limb(coneTip, coneTop, H * 0.005, H * 0.024, 7), n + '2', C('#d97706')); // Golden waffle cone
        r.add(ellipsoid(coneTop, H * 0.025, H * 0.006, H * 0.025, 7, 4), n + '2', C('#b45309')); // Crisp waffle rim
        const scoopCols = ['#f59e0b', '#ec4899', '#84cc16', '#78350f', '#fef08a']; // Mango, strawberry, pista, chocolate, vanilla
        const scoopCol = C(pick(scoopCols));
        const scoopCenter = coneTop.clone().add(new V3(0, H * 0.018, H * 0.004));
        r.add(ellipsoid(scoopCenter, H * 0.028, H * 0.026, H * 0.028, 8, 6), n + '2', scoopCol); // Ice cream scoop
        r.add(ellipsoid(scoopCenter.clone().add(new V3(0, H * 0.018, 0)), H * 0.014, H * 0.012, H * 0.014, 6, 4), n + '2', C('#fffbeb')); // Cream swirl
        r.add(ellipsoid(scoopCenter.clone().add(new V3(0, H * 0.026, 0)), H * 0.007, H * 0.007, H * 0.007, 5, 4), n + '2', C('#dc2626')); // Red cherry
      } else if (activeProp === 'bottle') {
        // Mineral water bottle: ribbed body, brand label, tapered neck & cap
        const bBot = palm.clone().add(new V3(0, -H * 0.065, H * 0.014));
        const bShld = palm.clone().add(new V3(0, H * 0.038, H * 0.022));
        r.add(limb(bBot, bShld, H * 0.022, H * 0.022, 8), n + '2', C('#60a5fa')); // Translucent blue bottle
        const lBot = palm.clone().add(new V3(0, -H * 0.028, H * 0.017));
        const lTop = palm.clone().add(new V3(0, H * 0.014, H * 0.020));
        r.add(limb(lBot, lTop, H * 0.023, H * 0.023, 8), n + '2', C(pick(['#1d4ed8', '#059669', '#0284c7']))); // Brand label wrap
        const bNeck = bShld.clone().add(new V3(0, H * 0.020, H * 0.002));
        r.add(limb(bShld, bNeck, H * 0.019, H * 0.011, 7), n + '2', C('#38bdf8')); // Tapered bottle neck
        r.add(limb(bNeck, bNeck.clone().add(new V3(0, H * 0.010, 0)), H * 0.012, H * 0.012, 6), n + '2', C('#2563eb')); // Blue screw cap
      } else {
        // Snack box / samosa pouch / craft refreshment carton
        const sBot = palm.clone().add(new V3(0, -H * 0.045, H * 0.010));
        const sTop = palm.clone().add(new V3(0, H * 0.036, H * 0.024));
        r.add(loft([sBot, sTop], [H * 0.018, H * 0.032], [H * 0.015, H * 0.028], 6), n + '2', C('#ca8a04')); // Craft paper carton
        r.add(ellipsoid(sTop.clone().add(new V3(0, H * 0.012, 0)), H * 0.028, H * 0.018, H * 0.024, 7, 5), n + '2', C('#b45309')); // Crispy golden snacks
      }
    }

    // Smartphone accessory in right hand (s === -1) for visitors
    if (s === -1 && !isStaff) {
      const phonePos = wr.clone().add(new V3(0, -H * 0.025, H * 0.010));
      // Dark phone chassis
      r.add(ellipsoid(phonePos, H * 0.022, H * 0.038, H * 0.006, 6, 4), n + '2', C('#18181b'));
      // Glowing viewfinder display
      r.add(ellipsoid(phonePos.clone().add(new V3(0, 0, H * 0.004)), H * 0.019, H * 0.034, H * 0.002, 6, 4), n + '2', C('#38bdf8'));
      // Camera lens bump on rear
      r.add(ellipsoid(phonePos.clone().add(new V3(H * 0.008, H * 0.020, -H * 0.004)), H * 0.006, H * 0.006, H * 0.003, 4, 3), n + '2', C('#09090b'));
    }
  }

  // --- 5. Legs & Footwear ---
  for (const [n, s] of [['legL', 1], ['legR', -1]]) {
    const hip = new V3(s * hipW, hipY, 0);
    const knee = new V3(s * (hipW + H * 0.002), H * 0.285, H * 0.01);
    const ankle = new V3(s * (hipW + H * 0.004), H * 0.055, 0);

    r.joint(n + '1', 'pelvis', hip).joint(n + '2', n + '1', knee);

    // Leg pants / skirt color
    const legCol = isChild ? (c, x, y) => c.copy(y > H * 0.36 ? bottom : skin) : isSari ? shade(C('#4a3728')) : shade(bottom);
    r.add(limb(hip, knee, H * 0.046, H * 0.036, 8), n + '1', legCol);
    r.add(limb(knee, ankle, H * 0.034, H * 0.026, 8), n + '2', legCol);

    // Differentiated Footwear: Shoes, Sandals, Boots
    if (isStaff) {
      // Rugged tactical work boots
      r.add(ellipsoid(new V3(ankle.x, H * 0.012, H * 0.038), H * 0.036, H * 0.014, H * 0.076, 8, 5), n + '2', C('#18181b'));
      r.add(limb(new V3(ankle.x, H * 0.020, 0), new V3(ankle.x, H * 0.088, 0), H * 0.036, H * 0.032, 8), n + '2', C('#261b10'));
      r.add(ellipsoid(new V3(ankle.x, H * 0.032, H * 0.045), H * 0.034, H * 0.024, H * 0.045, 7, 5), n + '2', C('#261b10'));
    } else if (isSari || isKurta || isElder) {
      // Traditional Indian Sandals / Kolhapuri chappals
      r.add(ellipsoid(new V3(ankle.x, H * 0.008, H * 0.036), H * 0.028, H * 0.008, H * 0.070, 8, 4), n + '2', C('#78350f'));
      // Bare foot skin
      r.add(ellipsoid(new V3(ankle.x, H * 0.022, H * 0.036), H * 0.025, H * 0.014, H * 0.062, 8, 5), n + '2', shade(skin, 0.06));
      // Leather strap across instep
      r.add(ellipsoid(new V3(ankle.x, H * 0.028, H * 0.024), H * 0.029, H * 0.008, H * 0.022, 6, 4), n + '2', C('#92400e'));
    } else {
      // Casual sneakers / sports shoes
      r.add(ellipsoid(new V3(ankle.x, H * 0.010, H * 0.036), H * 0.032, H * 0.010, H * 0.072, 8, 5), n + '2', C('#f8fafc'));
      r.add(ellipsoid(new V3(ankle.x, H * 0.030, H * 0.036), H * 0.030, H * 0.020, H * 0.068, 8, 6), n + '2', shoeCol);
    }
  }

  return r.build();
}

class Person {
  constructor(inst, H, role, L) {
    Object.assign(this, inst);
    this.H = H;
    this.role = role;
    this.L = L;
    this.pos = new V3();
    this.yaw = 0;
    this.path = null;
    this.state = 'idle';
    this.timer = rr(0, 4);
    this.phase = rand() * 6.28;
    this.speed = 0;
    this.t0 = rand() * 50;

    // Kinematic action blends
    this.sit = 0;
    this.point = 0;
    this.photo = 0;
    this.wave = 0;
    this.eating = 0;
    this.sitLean = rand() * 0.1 - 0.05;

    // Refreshments & eating gesture timing
    this.snackProp = null;
    this.eatTimer = rr(2.0, 5.5);
    this.eatDur = 0;

    // View action timers
    this.photoTimer = rr(6, 14);
    this.photoDur = 0;
    this.pointTimer = rr(4, 10);
    this.pointDur = 0;
    this.waveTimer = 0;

    // Social group conversational states
    this.isSpeaking = false;
    this.speakerYaw = 0;
    this.socialGroup = null;

    // Navigation & reaction states
    this.lookAt = null;
    this.safariNotice = false;
    this.safariNoticeYaw = 0;
    this.yielding = false;
    this.yieldDir = null;
    this.yieldTimer = 0;
    this.activeThreat = null;
    this.viewPos = null;
  }

  setPos(x, z, yaw = this.yaw) {
    this.pos.set(x, this.L.walkHeight(x, z), z);
    this.yaw = yaw;
  }
}

export class People {
  constructor(scene, L, structures, Q) {
    seed(9090);
    this.L = L;
    this.S = structures;
    this.list = [];
    this.frame = 0;
    this.scene = scene;
    if (scene) scene.userData.people = this;

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    mat.envMapIntensity = 0.3;

    // Template cache with kind + variant + prop keying
    const tpl = {}, get = (kind, v, prop = null) => {
      const key = kind + v + (prop ? '_' + prop : '');
      if (!tpl[key]) {
        const H = { child: 1.15, elder: 1.60, sari: 1.58, kurta: 1.62, staff: 1.72 }[kind] || rr(1.64, 1.76);
        tpl[key] = {
          t: humanoid(kind, H, {
            skin: pick(SKIN),
            top: kind === 'staff' ? '#8c7e56' : kind === 'elder' ? '#f8fafc' : pick(SHIRT),
            bottom: kind === 'staff' ? '#453c28' : kind === 'sari' ? pick(SARI) : pick(PANTS),
            border: pick(SARI_BORDERS),
            backpack: pick(BACKPACK_COLS),
            prop
          }, v, prop),
          H
        };
      }
      return tpl[key];
    };

    const make = (kind, role, prop = null) => {
      const variant = Math.floor(rand() * 4);
      const T = get(kind, variant, prop);
      const p = new Person(instantiate(T.t, mat), T.H, role, L);
      p.kind = kind;
      p.variant = variant;
      p.snackProp = prop;
      scene.add(p.mesh);
      this.list.push(p);
      return p;
    };

    // Destinations: public viewing points of exhibits + plazas
    this.views = L.enclosures.map(en => ({ x: en.view.x, z: en.view.z, en }));
    const counts = { high: [16, 6, 6, 5], medium: [10, 4, 4, 4], low: [6, 2, 3, 3] }[Q.label.toLowerCase()] || [10, 4, 4, 4];
    const [walkers, families, viewers, sitters] = counts;
    const kinds = ['man', 'sari', 'kurta', 'man', 'elder', 'sari'];

    // 1. Roaming Walkers
    for (let i = 0; i < walkers; i++) {
      const p = make(pick(kinds), 'walker');
      this._spawnOnNetwork(p);
    }

    // 2. Family Groups with Children Following
    for (let i = 0; i < families; i++) {
      const lead = make(pick(['man', 'sari', 'kurta']), 'walker');
      this._spawnOnNetwork(lead);
      const n = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const c = make(k === 0 && rand() < 0.5 ? pick(['sari', 'man']) : 'child', 'follower');
        c.leader = lead;
        c.offset = new V3(rr(-1.2, 1.2), 0, -1 - k * 0.9);
        c.setPos(lead.pos.x + rr(-1, 1), lead.pos.z + rr(-1, 1));
      }
    }

    // 3. Exhibit Viewers
    for (let i = 0; i < viewers; i++) {
      const p = make(pick(kinds.concat(['child'])), 'viewer');
      const v = pick(this.views);
      this._standAtView(p, v);
    }

    // 4. Bench Sitters with Handheld Refreshments & Natural Eating/Drinking Gestures
    const benches = (structures.benches || []).slice();
    const benchSnacks = ['icecream', 'bottle', 'snack', 'icecream'];
    for (let i = 0; i < Math.min(sitters, benches.length); i++) {
      const b = benches.splice(Math.floor(rand() * benches.length), 1)[0];
      const p = make(pick(kinds), 'sitter', benchSnacks[i % benchSnacks.length]);
      p.setPos(b.x, b.z, b.face);
      p.state = 'sit';
      p.bench = b;
    }

    // 5. Staff Posts & Patrols
    const post = (px, py, role = 'post') => {
      const [x, z] = toWorld(px, py);
      const s = make('staff', role);
      const q = this._nearestWalk(x, z);
      s.setPos(q[0], q[1]);
      s.home = q;
      return s;
    };

    if (structures.entrance) {
      const g = structures.entrance.gate, o = structures.entrance.outward;
      const s = make('staff', 'post');
      const q = this._nearestWalk(g.x + o.x * 2.5 + 3, g.z + o.z * 2.5);
      s.setPos(q[0], q[1], Math.atan2(o.x, o.z));
      s.home = q;
    }
    post(140, 204); post(893, 368); post(982, 732);

    for (const [a, b] of [[[420, 128], [470, 226]], [[650, 293], [845, 300]]]) {
      const s = post(...a, 'patrol');
      s.patrol = [s.home, this._nearestWalk(...toWorld(...b))];
      s.leg = 1;
    }

    // 6. CROWDED CANTEEN PLAZA
    // Ordering queues, visitors eating at dining tables, social chat groups, and refreshment stalls
    this._buildCanteenPlaza(scene, L, structures, make, Q);

    // Initial position & orientation sync
    for (const p of this.list) {
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.yaw;
    }
  }

  /**
   * Populates the Canteen Plaza with a vibrant visitor crowd, ordering queues,
   * visitors seated at outdoor dining tables enjoying refreshments, animated social chat groups,
   * and staffed refreshment stalls (Tender Coconut & Fresh Juice, Ice Cream & Kulfi Kiosk).
   */
  _buildCanteenPlaza(scene, L, structures, make, Q) {
    const canteen = (structures.buildings || []).find(b => b.kind === 'canteen' || b.id === 'canteen');
    const [defX, defZ] = toWorld(896, 358);
    const cX = canteen ? canteen.x : defX;
    const cZ = canteen ? canteen.z : defZ;
    const cYaw = canteen ? canteen.yaw : 0;

    const cFwd = new V3(Math.sin(cYaw), 0, Math.cos(cYaw));
    const cRight = new V3(Math.cos(cYaw), 0, -Math.sin(cYaw));
    const cAt = (rx, ry, rz) => new V3(
      cX + cRight.x * rx + cFwd.x * rz,
      L.walkHeight(cX + cRight.x * rx + cFwd.x * rz, cZ + cRight.z * rx + cFwd.z * rz) + ry,
      cZ + cRight.z * rx + cFwd.z * rz
    );

    // Group for canteen 3D architectural stalls, dining stools, and table props
    this.canteenGroup = new THREE.Group();
    this.canteenGroup.name = 'canteen_plaza_props';
    scene.add(this.canteenGroup);

    const stallMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.1 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c4f24, roughness: 0.72 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.6 });

    // --- A. Dining Stools & Tabletop Refreshments for the 4 Outdoor Tables ---
    // In structures.js, 4 round tables are built at rx = [-4, -1.3, 1.4, 4.1], rz = 7.2m
    const tableRx = [-4.0, -1.3, 1.4, 4.1];
    const dinersPerTable = (Q.label.toLowerCase() === 'low') ? 2 : 3;

    for (let tIdx = 0; tIdx < tableRx.length; tIdx++) {
      const tx = tableRx[tIdx], tz = 7.2;
      const tPos = cAt(tx, 0, tz);

      // Stools & seated diners around table
      const angles = dinersPerTable === 2 ? [0.6, 3.7] : [0.4, 2.4, 4.5];
      for (let sIdx = 0; sIdx < angles.length; sIdx++) {
        const ang = angles[sIdx];
        const dist = 0.82;
        const sx = tx + Math.cos(ang) * dist;
        const sz = tz + Math.sin(ang) * dist;
        const sPos = cAt(sx, 0, sz);

        // Procedural wooden zoo dining stool
        const seatGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.06, 12);
        const seatMesh = new THREE.Mesh(seatGeo, woodMat);
        seatMesh.position.set(sPos.x, sPos.y + 0.44, sPos.z);
        const legGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.44, 8);
        const legMesh = new THREE.Mesh(legGeo, metalMat);
        legMesh.position.set(sPos.x, sPos.y + 0.22, sPos.z);
        this.canteenGroup.add(seatMesh);
        this.canteenGroup.add(legMesh);

        // Seated Diner NPC eating/drinking refreshments
        const dKind = pick(['man', 'sari', 'kurta', 'child', 'elder']);
        const dProp = pick(['icecream', 'bottle', 'snack']);
        const diner = make(dKind, 'canteen_diner', dProp);
        const faceTableYaw = Math.atan2(tPos.x - sPos.x, tPos.z - sPos.z);
        diner.setPos(sPos.x, sPos.z, faceTableYaw);
        diner.state = 'sit';
        diner.t0 = rand() * 50;
      }

      // Tabletop snack trays, water glasses, and cups
      const plateGeo = new THREE.CylinderGeometry(0.18, 0.16, 0.02, 12);
      const plateMesh = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 }));
      plateMesh.position.set(tPos.x, tPos.y + 0.79, tPos.z);
      this.canteenGroup.add(plateMesh);

      // Drink glass / cup
      const cupGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.10, 8);
      const cupMesh = new THREE.Mesh(cupGeo, new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2, transparent: true, opacity: 0.85 }));
      cupMesh.position.set(tPos.x + 0.18, tPos.y + 0.83, tPos.z + 0.12);
      this.canteenGroup.add(cupMesh);
    }

    // --- B. Canteen Ordering Queue ---
    // Staff Cashier behind the counter
    const cashierPos = cAt(0.5, 0, 3.4);
    const cashierWalk = this._nearestWalk(cashierPos.x, cashierPos.z);
    const cashier = make('staff', 'canteen_cashier');
    cashier.setPos(cashierWalk[0], cashierWalk[1], cYaw);
    cashier.state = 'idle';

    // Queue of 4 visitors ordering dosas, samosas, and chai
    const queueCount = 4;
    for (let k = 0; k < queueCount; k++) {
      const qRx = 0.5 + (k % 2 === 0 ? 0.08 : -0.08);
      const qRz = 5.2 + k * 1.15;
      const qPos = cAt(qRx, 0, qRz);
      const qKind = (k === 1) ? 'child' : pick(['man', 'sari', 'kurta', 'elder']);
      const qProp = (k === 3) ? 'bottle' : null;
      const qVisitor = make(qKind, 'canteen_queue', qProp);
      const qWalk = this._nearestWalk(qPos.x, qPos.z);
      qVisitor.setPos(qWalk[0], qWalk[1], cYaw + Math.PI); // Facing canteen counter
      qVisitor.state = 'idle';
      qVisitor.t0 = k * 1.5;
    }

    // --- C. Refreshment Stall 1: Tender Coconut & Fresh Juice Stall ---
    const stall1Rx = -8.2, stall1Rz = 11.2;
    const s1Pos = cAt(stall1Rx, 0, stall1Rz);
    const s1Yaw = cYaw + 0.35;

    // Wooden counter booth
    const s1Counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 1.2), woodMat);
    s1Counter.position.set(s1Pos.x, s1Pos.y + 0.48, s1Pos.z);
    s1Counter.rotation.y = s1Yaw;
    this.canteenGroup.add(s1Counter);

    // Green & white striped awning supported by 4 timber posts
    const s1Awning = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.5), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 }));
    s1Awning.position.set(s1Pos.x, s1Pos.y + 2.35, s1Pos.z);
    s1Awning.rotation.y = s1Yaw;
    s1Awning.rotation.x = 0.08;
    this.canteenGroup.add(s1Awning);

    // 4 Corner timber posts
    for (const ox of [-1.1, 1.1]) {
      for (const oz of [-0.55, 0.55]) {
        const postP = cAt(stall1Rx + ox * Math.cos(s1Yaw) - oz * Math.sin(s1Yaw), 0, stall1Rz + ox * Math.sin(s1Yaw) + oz * Math.cos(s1Yaw));
        const postMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.35, 6), woodMat);
        postMesh.position.set(postP.x, postP.y + 1.17, postP.z);
        this.canteenGroup.add(postMesh);
      }
    }

    // Display Tender Coconuts on counter top
    const coconutGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.65 });
    for (let cI = -0.6; cI <= 0.6; cI += 0.3) {
      const cMesh = new THREE.Mesh(coconutGeo, coconutMat);
      const cLoc = cAt(stall1Rx + cI * Math.cos(s1Yaw), 0.98, stall1Rz + cI * Math.sin(s1Yaw));
      cMesh.position.copy(cLoc);
      this.canteenGroup.add(cMesh);
    }

    // Staff Vendor behind the juice/coconut counter
    const s1VendorPos = cAt(stall1Rx - 0.7 * Math.sin(s1Yaw), 0, stall1Rz - 0.7 * Math.cos(s1Yaw));
    const s1VendorWalk = this._nearestWalk(s1VendorPos.x, s1VendorPos.z);
    const s1Vendor = make('staff', 'stall_vendor');
    s1Vendor.setPos(s1VendorWalk[0], s1VendorWalk[1], s1Yaw);
    s1Vendor.state = 'idle';

    // 1 Customer at Juice Stall
    const s1CustPos = cAt(stall1Rx + 1.0 * Math.sin(s1Yaw), 0, stall1Rz + 1.0 * Math.cos(s1Yaw));
    const s1Cust = make('man', 'stall_customer', 'bottle');
    const s1CustWalk = this._nearestWalk(s1CustPos.x, s1CustPos.z);
    s1Cust.setPos(s1CustWalk[0], s1CustWalk[1], s1Yaw + Math.PI);
    s1Cust.state = 'idle';

    // --- D. Refreshment Stall 2: Ice Cream & Kulfi Kiosk ---
    const stall2Rx = 7.6, stall2Rz = 12.4;
    const s2Pos = cAt(stall2Rx, 0, stall2Rz);
    const s2Yaw = cYaw - 0.40;

    // Wheeled ice-cream cart body
    const s2Cart = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.90, 1.15), new THREE.MeshStandardMaterial({ color: 0xfdf2f8, roughness: 0.5 }));
    s2Cart.position.set(s2Pos.x, s2Pos.y + 0.45, s2Pos.z);
    s2Cart.rotation.y = s2Yaw;
    this.canteenGroup.add(s2Cart);

    // Stainless steel freezer sliding lid
    const s2Lid = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.95), metalMat);
    s2Lid.position.set(s2Pos.x, s2Pos.y + 0.92, s2Pos.z);
    s2Lid.rotation.y = s2Yaw;
    this.canteenGroup.add(s2Lid);

    // Festive red parasol canopy
    const parasol = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.15, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.7 }));
    parasol.position.set(s2Pos.x, s2Pos.y + 2.25, s2Pos.z);
    parasol.rotation.y = s2Yaw;
    this.canteenGroup.add(parasol);

    // Ice cream cart vendor
    const s2VendorPos = cAt(stall2Rx - 0.7 * Math.sin(s2Yaw), 0, stall2Rz - 0.7 * Math.cos(s2Yaw));
    const s2VendorWalk = this._nearestWalk(s2VendorPos.x, s2VendorPos.z);
    const s2Vendor = make('staff', 'stall_vendor');
    s2Vendor.setPos(s2VendorWalk[0], s2VendorWalk[1], s2Yaw);
    s2Vendor.state = 'idle';

    // 2 Customers (adult + child with ice cream)
    const s2Cust1Pos = cAt(stall2Rx + 0.9 * Math.sin(s2Yaw) - 0.35, 0, stall2Rz + 0.9 * Math.cos(s2Yaw));
    const s2Cust1 = make('sari', 'stall_customer', 'icecream');
    const s2Cust1Walk = this._nearestWalk(s2Cust1Pos.x, s2Cust1Pos.z);
    s2Cust1.setPos(s2Cust1Walk[0], s2Cust1Walk[1], s2Yaw + Math.PI);

    const s2Cust2Pos = cAt(stall2Rx + 0.9 * Math.sin(s2Yaw) + 0.45, 0, stall2Rz + 0.9 * Math.cos(s2Yaw));
    const s2Cust2 = make('child', 'stall_customer', 'icecream');
    const s2Cust2Walk = this._nearestWalk(s2Cust2Pos.x, s2Cust2Pos.z);
    s2Cust2.setPos(s2Cust2Walk[0], s2Cust2Walk[1], s2Yaw + Math.PI);

    // --- E. Social Chat Groups in the Plaza ---
    // Conversational Circle: 3 visitors conversing with turn-taking speech
    const grpCenterRx = -2.8, grpCenterRz = 13.8;
    const grpCenter = cAt(grpCenterRx, 0, grpCenterRz);
    const grpMembers = [];
    const grpAngles = [0, 2.1, 4.2];
    const grpKinds = ['kurta', 'man', 'sari'];

    const socialGroup = { timer: rr(3.5, 6.0), speakerIdx: 0, members: grpMembers };
    for (let gI = 0; gI < 3; gI++) {
      const a = grpAngles[gI];
      const mRx = grpCenterRx + Math.cos(a) * 0.9;
      const mRz = grpCenterRz + Math.sin(a) * 0.9;
      const mPos = cAt(mRx, 0, mRz);
      const mWalk = this._nearestWalk(mPos.x, mPos.z);
      const mPerson = make(grpKinds[gI], 'social_group', (gI === 1) ? 'bottle' : null);
      const mYaw = Math.atan2(grpCenter.x - mWalk[0], grpCenter.z - mWalk[1]);
      mPerson.setPos(mWalk[0], mWalk[1], mYaw);
      mPerson.state = 'idle';
      mPerson.socialGroup = socialGroup;
      mPerson.isSpeaking = (gI === 0);
      grpMembers.push(mPerson);
    }
  }

  _nearestWalk(x, z) {
    for (let r = 0; r < 40; r += 1) {
      for (let a = 0; a < 12; a++) {
        const t = a / 12 * 6.283, qx = x + Math.cos(t) * r, qz = z + Math.sin(t) * r;
        if (this.L.isWalkable(qx, qz)) return [qx, qz];
        if (r === 0) break;
      }
    }
    return [x, z];
  }

  _spawnOnNetwork(p) {
    const v = pick(this.views);
    const q = this._nearestWalk(v.x + rr(-15, 15), v.z + rr(-15, 15));
    p.setPos(q[0], q[1], rand() * 6.28);
  }

  /**
   * Find a viewing position near an exhibit that stands clear of the road circulation lane.
   * Prefers viewing aprons and road shoulders/verges off the road (road sample < 0.25).
   */
  _getClearViewingSpot(v) {
    const L = this.L, en = v.en;
    const dx = en.cx - v.x, dz = en.cz - v.z, len = Math.hypot(dx, dz) || 1;
    const ux = dx / len, uz = dz / len; // towards enclosure
    const px = -uz, pz = ux;            // tangent along railing

    let bestSpot = null, bestScore = Infinity;

    // Search across lateral spread along viewing railing and forward towards enclosure apron
    for (let fwd = 0.5; fwd <= 4.0; fwd += 0.7) {
      for (let lat = -3.5; lat <= 3.5; lat += 0.7) {
        const qx = v.x + px * lat + ux * fwd;
        const qz = v.z + pz * lat + uz * fwd;
        if (!L.isWalkable(qx, qz)) continue;

        const roadVal = L.sample(L.roadGrid(), qx, qz);
        // Heavily penalize road circulation lane (roadVal > 0.25)
        const roadPenalty = roadVal > 0.25 ? roadVal * 120 : roadVal * 2;
        const distFromView = Math.hypot(qx - v.x, qz - v.z);
        const score = roadPenalty + distFromView * 0.4;

        if (score < bestScore) {
          bestScore = score;
          bestSpot = [qx, qz];
          if (roadVal < 0.08) break;
        }
      }
    }

    if (bestSpot) return bestSpot;

    // Search outward for any walkable spot clear of the road circulation lane
    for (let r = 1; r < 14; r += 0.8) {
      for (let a = 0; a < 12; a++) {
        const ang = a / 12 * 6.283;
        const qx = v.x + Math.cos(ang) * r, qz = v.z + Math.sin(ang) * r;
        if (L.isWalkable(qx, qz)) {
          const roadVal = L.sample(L.roadGrid(), qx, qz);
          if (roadVal < 0.25) return [qx, qz];
          if (!bestSpot) bestSpot = [qx, qz];
        }
      }
    }

    return bestSpot || [v.x, v.z];
  }

  _standAtView(p, v) {
    const q = this._getClearViewingSpot(v);
    const yaw = Math.atan2(v.en.cx - q[0], v.en.cz - q[1]);
    p.setPos(q[0], q[1], yaw);
    p.state = 'view';
    p.timer = rr(10, 40);
    p.viewEn = v.en;
    p.viewPos = q;
  }

  _goto(p, x, z) {
    const path = findPath(this.L, p.pos.x, p.pos.z, x, z);
    p.path = path && path.length > 1 ? path.slice(1) : null;
    p.state = p.path ? 'walk' : 'idle';
    p.timer = rr(2, 5);
  }

  /**
   * Prompts pedestrians in radius to immediately yield and clear the road.
   */
  promptYield(x, z, yaw, radius = 7.0) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    for (const p of this.list) {
      if (p.state === 'sit') continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < radius) {
        const dx = p.pos.x - x, dz = p.pos.z - z;
        const dLat = dx * (-fz) + dz * fx;
        const sideSign = dLat >= 0 ? 1 : -1;
        p.yielding = true;
        p.yieldTimer = 2.0;
        p.yieldDir = [sideSign * (-fz), sideSign * fx];
        p.activeThreat = { type: 'safari', x, z, fx, fz, speed: 2 };
      }
    }
  }

  /**
   * Sensing approaching safari cart or player within 6-8m on roads.
   * Prompts pedestrian to actively step aside towards the road shoulder/verge.
   */
  _checkYield(p, threats, dt) {
    if (p.state === 'sit') return;
    if (!threats.length) {
      if (p.yielding) {
        p.yieldTimer -= dt;
        if (p.yieldTimer <= 0) { p.yielding = false; p.yieldDir = null; p.activeThreat = null; }
      }
      return;
    }

    const roadDensity = this.L.sample(this.L.roadGrid(), p.pos.x, p.pos.z);
    let matchedThreat = null;

    for (const threat of threats) {
      const dx = p.pos.x - threat.x, dz = p.pos.z - threat.z;
      const dist = Math.hypot(dx, dz);
      if (dist > threat.senseRadius) continue; // Only within 6-8.5m

      if (threat.type === 'safari') {
        const dLong = dx * threat.fx + dz * threat.fz;
        const dLat = dx * (-threat.fz) + dz * threat.fx;
        // Ahead of cart (or alongside front) and within vehicle circulation corridor
        if (dLong > -1.5 && Math.abs(dLat) < 2.6 && (roadDensity > 0.2 || Math.abs(dLat) < 1.8)) {
          matchedThreat = { threat, dist, dLong, dLat, dx, dz };
          break;
        }
      } else if (threat.type === 'player') {
        if (roadDensity > 0.2) {
          const dot = threat.speed > 0.5 ? (dx * threat.fx + dz * threat.fz) / Math.max(0.01, dist) : 0;
          if (dot > 0.2 || dist < 3.2) {
            const dLat = dx * (-threat.fz) + dz * threat.fx;
            matchedThreat = { threat, dist, dLong: dist, dLat, dx, dz };
            break;
          }
        }
      }
    }

    if (matchedThreat) {
      const { threat, dLat } = matchedThreat;
      const sideSign = (dLat === 0 ? (rand() > 0.5 ? 1 : -1) : (dLat > 0 ? 1 : -1));
      const latX = threat.type === 'safari' ? sideSign * (-threat.fz) : (matchedThreat.dx / Math.max(0.01, matchedThreat.dist));
      const latZ = threat.type === 'safari' ? sideSign * (threat.fx) : (matchedThreat.dz / Math.max(0.01, matchedThreat.dist));

      // Calculate road shoulder/verge direction via gradient (points to lower road density)
      const rx1 = this.L.sample(this.L.roadGrid(), p.pos.x + 1.2, p.pos.z);
      const rx0 = this.L.sample(this.L.roadGrid(), p.pos.x - 1.2, p.pos.z);
      const rz1 = this.L.sample(this.L.roadGrid(), p.pos.x, p.pos.z + 1.2);
      const rz0 = this.L.sample(this.L.roadGrid(), p.pos.x - 1.2, p.pos.z);
      const gx = rx1 - rx0, gz = rz1 - rz0, gLen = Math.hypot(gx, gz);
      const vergeX = gLen > 0.05 ? -gx / gLen : latX;
      const vergeZ = gLen > 0.05 ? -gz / gLen : latZ;

      let dirX = latX * 0.6 + vergeX * 0.4;
      let dirZ = latZ * 0.6 + vergeZ * 0.4;
      let dirLen = Math.hypot(dirX, dirZ);
      if (dirLen > 0.01) { dirX /= dirLen; dirZ /= dirLen; }

      // Validate walkability of step direction
      if (!this.L.isWalkable(p.pos.x + dirX * 1.0, p.pos.z + dirZ * 1.0)) {
        if (this.L.isWalkable(p.pos.x - dirX * 1.0, p.pos.z - dirZ * 1.0)) {
          dirX = -dirX; dirZ = -dirZ;
        } else {
          let bestAng = null, minRoad = Infinity;
          for (let a = 0; a < 8; a++) {
            const ang = a / 8 * 6.283;
            const qx = p.pos.x + Math.cos(ang) * 1.0, qz = p.pos.z + Math.sin(ang) * 1.0;
            if (this.L.isWalkable(qx, qz)) {
              const r = this.L.sample(this.L.roadGrid(), qx, qz);
              if (r < minRoad) { minRoad = r; bestAng = ang; }
            }
          }
          if (bestAng !== null) { dirX = Math.cos(bestAng); dirZ = Math.sin(bestAng); }
        }
      }

      p.yielding = true;
      p.yieldDir = [dirX, dirZ];
      p.yieldTimer = 1.6;
      p.activeThreat = threat;
    } else if (p.yielding) {
      p.yieldTimer -= dt;
      if (p.yieldTimer <= 0) {
        p.yielding = false;
        p.yieldDir = null;
        p.activeThreat = null;
      }
    }
  }

  update(dt, t, cam) {
    this.frame++;
    const safari = this.safari || this.scene?.userData?.safari;

    // Detect approaching vehicles or player for road yielding
    const threats = [];
    if (safari && safari.cart && safari.active) {
      const cPos = safari.cart.position;
      threats.push({
        type: 'safari',
        x: cPos.x,
        z: cPos.z,
        yaw: safari.yaw,
        fx: Math.sin(safari.yaw),
        fz: Math.cos(safari.yaw),
        speed: Math.max(safari.speed, 2.0),
        senseRadius: 8.5
      });

      // Track safari vehicle for natural onlooker reactions & waving
      for (let i = 0; i < this.list.length; i++) {
        const p = this.list[i];
        const distToCart = Math.hypot(p.pos.x - cPos.x, p.pos.z - cPos.z);
        if (distToCart < 15.0) {
          p.safariNotice = true;
          p.safariNoticeYaw = Math.atan2(cPos.x - p.pos.x, cPos.z - p.pos.z);
          // Friendly wave from pedestrians clear on verges or sitting
          if ((p.state === 'view' || p.state === 'sit' || p.yielding) && !p.waveTimer && (p.t0 % 3 < 1.2)) {
            p.waveTimer = rr(2.0, 3.8);
          }
        } else {
          p.safariNotice = false;
        }
      }
    }

    if (cam) {
      const px = cam.x, pz = cam.z;
      const vx = this.prevCamX !== undefined ? (px - this.prevCamX) / Math.max(0.001, dt) : 0;
      const vz = this.prevCamZ !== undefined ? (pz - this.prevCamZ) / Math.max(0.001, dt) : 0;
      this.prevCamX = px; this.prevCamZ = pz;
      const pSpeed = Math.hypot(vx, vz);
      const inSafari = safari && safari.active && Math.hypot(px - safari.cart.position.x, pz - safari.cart.position.z) < 2.0;
      if (!inSafari) {
        threats.push({
          type: 'player',
          x: px,
          z: pz,
          yaw: pSpeed > 0.3 ? Math.atan2(vx, vz) : 0,
          fx: pSpeed > 0.3 ? vx / pSpeed : 0,
          fz: pSpeed > 0.3 ? vz / pSpeed : 0,
          speed: pSpeed,
          senseRadius: 7.5
        });
      }
    }

    for (let i = 0; i < this.list.length; i++) {
      const p = this.list[i], d = Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z), far = d > 170;
      p.mesh.visible = !far;
      if (far && (this.frame + i) % 6) continue;
      const step = far ? dt * 6 : dt;

      // Sense approaching cart or player within 6-8m and trigger yielding
      this._checkYield(p, threats, step);

      this._think(p, step);
      this._move(p, step);
      if (!far) this._pose(p, t, step);
    }
    this.planned = 0;
  }

  _think(p, dt) {
    p.timer -= dt;

    // Follower in family formation
    if (p.role === 'follower') {
      const L = p.leader, c = Math.cos(L.yaw), s = Math.sin(L.yaw);
      const tx = L.pos.x + p.offset.x * c + p.offset.z * s, tz = L.pos.z - p.offset.x * s + p.offset.z * c;
      const dx = tx - p.pos.x, dz = tz - p.pos.z, dd = Math.hypot(dx, dz);
      p.state = dd > 0.6 ? 'walk' : L.state === 'view' ? 'view' : 'idle';
      p.path = dd > 0.6 ? [[tx, tz]] : null;
      if (L.viewEn) p.viewEn = L.viewEn;
      return;
    }

    // Fixed post, bench sitters, dining tables, cashier, vendors
    if (p.role === 'post' || p.role === 'sitter' || p.role === 'canteen_diner' ||
        p.role === 'canteen_cashier' || p.role === 'stall_vendor') {
      if (p.timer < 0) {
        p.timer = rr(3, 8);
        p.glance = rr(-0.7, 0.7);
      }
      return;
    }

    // Canteen Queue: subtle shifting and looking ahead
    if (p.role === 'canteen_queue') {
      if (p.timer < 0) {
        p.timer = rr(4, 9);
        p.glance = rr(-0.4, 0.4);
      }
      return;
    }

    // Social Chat Group: speaker turn-taking
    if (p.role === 'social_group') {
      if (p.socialGroup) {
        p.socialGroup.timer -= dt;
        if (p.socialGroup.timer <= 0) {
          p.socialGroup.timer = rr(3.5, 6.5);
          p.socialGroup.speakerIdx = (p.socialGroup.speakerIdx + 1) % p.socialGroup.members.length;
          p.socialGroup.members.forEach((m, idx) => {
            m.isSpeaking = (idx === p.socialGroup.speakerIdx);
          });
        }
      }
      if (p.timer < 0) {
        p.timer = rr(3, 7);
        p.glance = rr(-0.4, 0.4);
      }
      return;
    }

    if (p.state === 'walk') return;
    if (p.timer > 0) return;
    if ((this.planned || 0) > 2) return; // Limit route searches per frame
    this.planned = (this.planned || 0) + 1;

    if (p.role === 'patrol') {
      p.leg = 1 - p.leg;
      const q = p.patrol[p.leg];
      this._goto(p, q[0], q[1]);
      return;
    }

    const v = pick(this.views);
    const q = this._getClearViewingSpot(v);
    this._goto(p, q[0], q[1]);
    p.target = { ...v, clearPos: q };
  }

  _move(p, dt) {
    let want = 0;

    if (p.yielding && p.yieldDir) {
      // Actively step aside towards the road shoulder/verge
      const threat = p.activeThreat;
      const roadVal = this.L.sample(this.L.roadGrid(), p.pos.x, p.pos.z);
      let isClear = false;

      if (threat && threat.type === 'safari') {
        const cdx = p.pos.x - threat.x, cdz = p.pos.z - threat.z;
        const curLat = Math.abs(cdx * (-threat.fz) + cdz * threat.fx);
        const curLong = cdx * threat.fx + cdz * threat.fz;
        // Cleared if standing on the verge/shoulder outside cart corridor (lat >= 1.85m or off road)
        if (curLat >= 1.85 || roadVal < 0.22 || curLong < -1.8) {
          isClear = true;
        }
      } else {
        if (roadVal < 0.25) isClear = true;
      }

      if (!isClear) {
        // Actively move aside towards road shoulder
        const targetYaw = Math.atan2(p.yieldDir[0], p.yieldDir[1]);
        p.yaw += clamp(wrapAngle(targetYaw - p.yaw), -6 * dt, 6 * dt);
        want = (ROLE_SPEED[p.role] || 1.1) * 1.25; // Brisk yielding step (~1.4 m/s)
      } else {
        // Stood clear on the verge: face the passing vehicle/exhibit politely
        want = 0;
        if (threat) {
          const faceYaw = Math.atan2(threat.x - p.pos.x, threat.z - p.pos.z);
          p.yaw += clamp(wrapAngle(faceYaw - p.yaw), -2.5 * dt, 2.5 * dt);
        }
      }
    } else if (p.state === 'walk' && p.path && p.path.length) {
      const [wx, wz] = p.path[0], dx = wx - p.pos.x, dz = wz - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.5) {
        p.path.shift();
        if (!p.path.length) {
          p.path = null;
          if (p.target && p.role !== 'follower') {
            p.state = 'view';
            p.viewEn = p.target.en;
            p.viewPos = p.target.clearPos || [p.pos.x, p.pos.z];
            p.timer = rr(8, 30);
          } else {
            p.state = 'idle';
            p.timer = rr(2, 6);
          }
        }
      } else {
        const yw = Math.atan2(dx, dz);
        p.yaw += clamp(wrapAngle(yw - p.yaw), -3 * dt, 3 * dt);
        want = (ROLE_SPEED[p.role] || 1.1) * (p.kind === 'child' ? 1.15 : 1) * (p.role === 'follower' ? clamp(d, 0.3, 1.6) : 1);
      }
    }

    if (p.state === 'view' && !p.yielding) {
      // Ensure viewing pedestrians stand clear of the road circulation lane
      const roadVal = this.L.sample(this.L.roadGrid(), p.pos.x, p.pos.z);
      if (roadVal > 0.25) {
        const clearSpot = p.viewPos || (p.viewEn && this._getClearViewingSpot({ en: p.viewEn, x: p.pos.x, z: p.pos.z }));
        if (clearSpot) {
          const cdx = clearSpot[0] - p.pos.x, cdz = clearSpot[1] - p.pos.z, cd = Math.hypot(cdx, cdz);
          if (cd > 0.3) {
            const yw = Math.atan2(cdx, cdz);
            p.yaw += clamp(wrapAngle(yw - p.yaw), -4 * dt, 4 * dt);
            want = 1.0;
          }
        }
      }
      if (p.viewEn && want === 0) {
        const yw = Math.atan2(p.viewEn.cx - p.pos.x, p.viewEn.cz - p.pos.z);
        p.yaw += clamp(wrapAngle(yw - p.yaw), -2 * dt, 2 * dt);
      }
    }

    if (p.role === 'post' && p.glance !== undefined && !p.yielding) {
      p.yaw += clamp(wrapAngle((p.baseYaw ?? (p.baseYaw = p.yaw)) + p.glance - p.yaw), -dt, dt);
    }

    p.speed = lerp(p.speed, want, damp(4, dt));
    if (p.speed > 0.02) {
      const nx = p.pos.x + Math.sin(p.yaw) * p.speed * dt, nz = p.pos.z + Math.cos(p.yaw) * p.speed * dt;
      if (this.L.isWalkable(nx, nz)) {
        p.pos.x = nx; p.pos.z = nz; // strictly public walkable network
      } else if (p.path && !p.yielding) {
        p.path = null; p.state = 'idle'; p.timer = 0.5;
      }
    }
    p.pos.y = this.L.walkHeight(p.pos.x, p.pos.z);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.y = p.yaw;
  }

  /**
   * Natural humanoid locomotion and engaging behaviors:
   * - Natural walking gait with hip sway, shoulder counter-twist, bipedal vertical bob, arm opposition swing.
   * - Engaging actions: taking photos with smartphones at exhibits, pointing at animals, scanning sights, waving at passing safari vehicle.
   * - Bench sitting & Canteen dining with eating & drinking gestures (ice-cream cones, snacks, water bottles).
   * - Canteen plaza actions: queueing weight shifting, vendor serving gestures, and social conversational animations.
   */
  _pose(p, t, dt) {
    const B = p.bone, H = p.H;
    const g = clamp(p.speed / 1.15, 0, 1.35); // Locomotion gait intensity

    // 1. Walking Locomotion Phase
    p.phase += dt * p.speed / (H * 0.38) * Math.PI * 0.9;
    const s = Math.sin(p.phase);
    const c = Math.cos(p.phase);

    // 2. Action Blends
    const wantSit = (p.state === 'sit' || p.role === 'canteen_diner') ? 1 : 0;
    p.sit = lerp(p.sit, wantSit, damp(4, dt));

    // Refreshment Eating & Drinking Gesture Cycle (benches, dining tables, stalls)
    const hasSnack = !!p.snackProp;
    if (hasSnack && (p.state === 'sit' || p.role === 'canteen_diner' || p.role === 'stall_customer' || p.role === 'social_group')) {
      p.eatTimer = (p.eatTimer ?? rr(2.0, 5.0)) - dt;
      if (p.eatTimer <= 0) {
        p.eatDur = rr(2.6, 4.4); // Savor snack/drink for 2.6 - 4.4 seconds
        p.eatTimer = rr(5.0, 11.0); // Interval between bites/sips
      }
    } else {
      p.eatDur = 0;
    }
    const wantEat = (p.eatDur > 0) ? 1 : 0;
    if (p.eatDur > 0) p.eatDur -= dt;
    p.eating = lerp(p.eating || 0, wantEat, damp(3.5, dt));

    // Photo taking action with smartphone at exhibits
    let wantPhoto = 0;
    if (p.state === 'view' && p.kind !== 'staff') {
      if (p.photoDur > 0) {
        wantPhoto = 1;
        p.photoDur -= dt;
      } else {
        p.photoTimer -= dt;
        if (p.photoTimer <= 0) {
          p.photoDur = rr(3.5, 6.0); // Frame and capture photos for 3.5 - 6s
          p.photoTimer = rr(10, 22);
        }
      }
    } else {
      p.photoDur = 0;
    }
    p.photo = lerp(p.photo || 0, wantPhoto, damp(3.5, dt));

    // Pointing action at exhibit animals
    let wantPoint = 0;
    if (p.state === 'view' && !p.photoDur) {
      if (p.pointDur > 0) {
        wantPoint = 1;
        p.pointDur -= dt;
      } else {
        p.pointTimer -= dt;
        if (p.pointTimer <= 0) {
          p.pointDur = rr(2.5, 4.5); // Point toward animals for 2.5 - 4.5s
          p.pointTimer = rr(8, 18);
        }
      }
    } else {
      p.pointDur = 0;
    }
    p.point = lerp(p.point, wantPoint, damp(3.5, dt));

    // Waving at passing safari tram
    let wantWave = 0;
    if (p.waveTimer > 0) {
      wantWave = 1;
      p.waveTimer -= dt;
    }
    p.wave = lerp(p.wave || 0, wantWave, damp(4, dt));

    // 3. Pelvis: Natural Hip Sway, Twist & Vertical Bob
    // Hip sway (roll around Z): weight transfer onto stance leg
    let hipSway = s * 0.055 * g;
    // Hip twist (yaw around Y): forward leg pulls pelvis forward
    const hipTwist = s * 0.11 * g;
    // Bipedal vertical bob: COM drops during double-support, rises at single-support (2 cycles per stride)
    const vertBob = -Math.abs(c) * 0.026 * g;
    // Forward pelvic tilt during walk
    const pelvicPitch = 0.025 * g;

    // Weight shifting while queueing in line at Canteen
    if (p.role === 'canteen_queue') {
      hipSway += Math.sin(t * 0.7 + p.t0) * 0.035;
    }

    B.pelvis.position.copy(p.rest.pelvis);
    B.pelvis.position.y += vertBob - p.sit * (H * 0.52 - 0.44);
    B.pelvis.rotation.set(
      pelvicPitch,
      hipTwist,
      hipSway + Math.sin(t * 0.8 + p.t0) * 0.015 * (1 - g)
    );

    // 4. Spine: Shoulder Counter-Twist & Posture Recline
    // Counter-twist in yaw: shoulders rotate OPPOSITE to pelvis to balance angular momentum
    const shoulderCounterTwist = -s * 0.15 * g;
    // Counter-roll: keeps shoulders and head level
    const shoulderCounterRoll = -s * 0.045 * g;
    // Slight forward lean during walking; comfortable recline during bench sit
    const spinePitch = 0.055 * g - p.sit * (0.12 + (p.sitLean || 0));

    B.spine.rotation.set(
      spinePitch,
      shoulderCounterTwist,
      shoulderCounterRoll
    );

    // 5. Head: Gaze Tracking, Exhibit Scanning, Safari Reaction & Eating Head Nod
    let targetHeadYaw = (p.glance || 0) * 0.45;
    let targetHeadPitch = 0;

    if (p.state === 'view') {
      // Natural scanning gaze across the exhibit
      targetHeadYaw = Math.sin(t * 0.6 + p.t0) * 0.40;
      targetHeadPitch = Math.sin(t * 0.35 + p.t0 * 2) * 0.12 - 0.04;
      if (p.photo > 0.5) {
        targetHeadPitch = 0.08 + Math.sin(t * 1.5) * 0.02;
        targetHeadYaw = Math.sin(t * 0.4) * 0.15;
      } else if (p.point > 0.5) {
        targetHeadPitch = -0.06;
        targetHeadYaw = 0.25;
      }
    } else if (p.safariNotice) {
      targetHeadYaw = clamp(wrapAngle(p.safariNoticeYaw - p.yaw), -1.1, 1.1);
      targetHeadPitch = -0.05;
    } else if (p.state === 'walk') {
      targetHeadYaw = Math.sin(t * 0.5 + p.t0) * 0.15 + (p.glance || 0) * 0.25;
    } else if (p.state === 'sit' || p.role === 'canteen_diner') {
      targetHeadYaw = (p.glance || 0) * 0.6 + Math.sin(t * 0.4 + p.t0) * 0.20;
      targetHeadPitch = 0.02;
    } else if (p.role === 'canteen_queue') {
      // Glancing up toward the canteen menu board above counter
      targetHeadPitch = -0.16 + Math.sin(t * 0.6 + p.t0) * 0.06;
      targetHeadYaw = (p.glance || 0) * 0.35;
    } else if (p.role === 'social_group') {
      if (p.isSpeaking) {
        targetHeadPitch = Math.sin(t * 2.8) * 0.08;
        targetHeadYaw = Math.sin(t * 1.2) * 0.22;
      } else {
        // Listening attentively with head nods
        targetHeadPitch = Math.sin(t * 1.4 + p.t0) * 0.06;
        targetHeadYaw = (p.glance || 0) * 0.25;
      }
    } else if (p.role === 'stall_vendor' || p.role === 'canteen_cashier') {
      targetHeadPitch = 0.12 + Math.sin(t * 2.0) * 0.06;
      targetHeadYaw = (p.glance || 0) * 0.3;
    }

    // Natural Head Micro-Gestures when Eating or Drinking Snacks
    if (p.eating > 0.05) {
      if (p.snackProp === 'bottle') {
        // Tilting head slightly back to take a sip of refreshing water
        targetHeadPitch = lerp(targetHeadPitch, -0.16 + Math.sin(t * 7.0) * 0.02, p.eating);
      } else if (p.snackProp === 'icecream') {
        // Tilting head slightly forward to savor/lick ice cream cone
        targetHeadPitch = lerp(targetHeadPitch, 0.12 + Math.sin(t * 8.0) * 0.02, p.eating);
      } else {
        // Savoring snack with gentle chewing micro-bob
        targetHeadPitch = lerp(targetHeadPitch, 0.10 + Math.sin(t * 6.5) * 0.02, p.eating);
      }
    }

    // Counterbalance shoulder counter-twist so head maintains smooth gaze
    const compensatedHeadYaw = targetHeadYaw - shoulderCounterTwist * 0.6;
    B.head.rotation.set(
      targetHeadPitch,
      compensatedHeadYaw,
      -shoulderCounterRoll * 0.5
    );

    // 6. Legs: Thigh Pitch, Knee Flexion & Sitting Bend
    for (const [n, k] of [['legL', 1], ['legR', -1]]) {
      const thighSwing = -s * k * 0.50 * g;
      const kneeFlex = Math.max(0, s * k) * 0.70 * g;

      // When sitting on bench: thigh flexes 90 deg (-1.48 rad), knee bends 90 deg down (1.52 rad)
      B[n + '1'].rotation.set(
        lerp(thighSwing, -1.48, p.sit),
        0,
        k * (p.sit * 0.06)
      );
      B[n + '2'].rotation.set(
        lerp(kneeFlex, 1.52, p.sit),
        0,
        0
      );
    }

    // 7. Arms: Opposition Swing, Photography, Pointing, Waving, Eating & Relaxed Sitting
    for (const [n, k] of [['armL', 1], ['armR', -1]]) {
      // Natural arm opposition swing: left arm swings forward when right leg swings forward
      const armSwing = s * k * 0.40 * g;
      const elbowBend = -0.15 * g - Math.max(0, s * k) * 0.25 * g;
      const naturalSpread = k * 0.08;

      let armRotX = armSwing;
      let armRotY = 0;
      let armRotZ = naturalSpread;
      let elRotX = elbowBend;
      let elRotY = 0;
      let elRotZ = 0;

      // Staff "parade rest" posture when standing at post (hands clasped behind back)
      if (p.role === 'post' && !p.speed && !p.yielding) {
        armRotX = 0.22;
        armRotZ = k * 0.15;
        elRotX = -0.85;
      }

      // Relaxed bench sitting: hands resting comfortably on thighs/lap
      if (p.sit > 0.01) {
        armRotX = lerp(armRotX, -0.55, p.sit);
        armRotZ = lerp(armRotZ, k * 0.18, p.sit);
        elRotX = lerp(elRotX, -1.05, p.sit);
      }

      // Pointing action at exhibit: right arm extends forward and up toward animals
      if (n === 'armR' && p.point > 0.01) {
        armRotX = lerp(armRotX, -1.35, p.point);
        armRotY = lerp(armRotY, -0.12, p.point);
        armRotZ = lerp(armRotZ, 0.08, p.point);
        elRotX = lerp(elRotX, -0.15, p.point);
      }

      // Photo taking action: both hands raise smartphone to eye/chest level
      if (p.photo > 0.01) {
        if (n === 'armR') {
          const microJitter = Math.sin(t * 1.5) * 0.02;
          armRotX = lerp(armRotX, -1.25 + microJitter, p.photo);
          armRotY = lerp(armRotY, -0.25, p.photo);
          armRotZ = lerp(armRotZ, 0.35, p.photo);
          elRotX = lerp(elRotX, -1.15, p.photo);
        } else {
          armRotX = lerp(armRotX, -1.15, p.photo);
          armRotY = lerp(armRotY, 0.32, p.photo);
          armRotZ = lerp(armRotZ, -0.35, p.photo);
          elRotX = lerp(elRotX, -1.20, p.photo);
        }
      }

      // Waving at passing safari vehicle
      if (n === 'armR' && p.wave > 0.01) {
        const waveSway = Math.sin(t * 7.0) * 0.32;
        armRotX = lerp(armRotX, -1.45, p.wave);
        armRotZ = lerp(armRotZ, 0.28, p.wave);
        elRotX = lerp(elRotX, -0.90, p.wave);
        elRotZ = lerp(elRotZ, waveSway, p.wave);
      }

      // Social conversational gestures in plaza
      if (p.role === 'social_group' && p.isSpeaking && n === 'armR') {
        const talkGesture = Math.sin(t * 3.2) * 0.18;
        armRotX = lerp(armRotX, -0.85 + talkGesture, 0.85);
        armRotY = lerp(armRotY, -0.22, 0.85);
        armRotZ = lerp(armRotZ, 0.15, 0.85);
        elRotX = lerp(elRotX, -0.95 + talkGesture * 0.6, 0.85);
      }

      // Stall vendor / cashier serving gestures
      if ((p.role === 'stall_vendor' || p.role === 'canteen_cashier') && n === 'armR') {
        const serveMotion = Math.sin(t * 1.8) * 0.15;
        armRotX = lerp(armRotX, -0.75 + serveMotion, 0.8);
        elRotX = lerp(elRotX, -0.85, 0.8);
      }

      // Natural Eating & Drinking Gestures (left hand holding snack/bottle/ice cream)
      if (n === 'armL' && p.eating > 0.01) {
        const chewMotion = Math.sin(t * 6.0) * 0.015;
        armRotX = lerp(armRotX, -1.24 + chewMotion, p.eating);
        armRotY = lerp(armRotY, 0.36, p.eating);
        armRotZ = lerp(armRotZ, -0.22, p.eating);
        elRotX = lerp(elRotX, -1.52, p.eating);
        elRotY = lerp(elRotY, 0.28, p.eating);
      }

      B[n + '1'].rotation.set(armRotX, armRotY, armRotZ);
      B[n + '2'].rotation.set(elRotX, elRotY, elRotZ);
    }
  }

  /** Positions of people near a point (for the safari cart's collision avoidance). */
  near(x, z, r) {
    return this.list.filter(p => (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2 < r * r);
  }
}
