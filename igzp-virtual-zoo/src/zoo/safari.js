// Guided Safari: a battery-powered open-sided visitor cart (modelled on the supplied photograph)
// that follows the tar-road network only, stopping at exhibits next to the roads.
// This is a virtual guided experience; it does not claim IGZP operates this exact service.
import * as THREE from 'three';
import { findPath } from '../player/navigation.js';
import { SPECIES } from '../data/species.js';
import { V3, clamp, lerp, damp, wrapAngle, smoothLine, paint, merge, limb, mat4 } from '../core/util.js';

export const SAFARI_STOPS = ['rhino', 'elephant', 'bengal-tiger', 'white-tiger', 'lion', 'himalayan-black-bear', 'hippopotamus', 'blackbuck', 'indian-gaur-west', 'giraffe'];

function cartModel() {
  const g = new THREE.Group(), C = h => new THREE.Color(h);
  const chassis = new THREE.Group();
  g.add(chassis);
  g.userData.chassis = chassis;

  const parts = [];
  const box = (w, h, d, x, y, z, col, rx = 0, ry = 0, rz = 0) => {
    const b = new THREE.BoxGeometry(w, h, d);
    b.applyMatrix4(mat4(new V3(x, y, z), ry, 1, rx, rz));
    parts.push(paint(b, typeof col === 'function' ? col : C(col)));
  };
  const cyl = (a, b, r0, r1 = r0, col, n = 8) => {
    parts.push(paint(limb(new V3(...a), new V3(...b), r0, r1, n), typeof col === 'function' ? col : C(col)));
  };

  const L = 4.3, W = 1.30; // length (z), width (x); front = +z
  const cream = '#f4f1ea', greenLivery = '#225e3b', darkTrim = '#1a1b1d';
  const white = (c, x, y, z) => c.set(cream).multiplyScalar(0.95 + 0.05 * Math.sin(z * 3));

  // --- 1. Open Tram Chassis & Floor Deck ---
  // Subframe steel beams
  box(W - 0.04, 0.10, L - 0.28, 0, 0.28, 0, '#2b2d30');
  // Non-slip floor deck with subtle rib texture
  box(W - 0.06, 0.04, L - 0.32, 0, 0.35, 0, '#383a3c');
  for (let z = -L / 2 + 0.3; z <= L / 2 - 0.3; z += 0.35) {
    box(W - 0.10, 0.01, 0.04, 0, 0.375, z, '#26282a');
  }

  // Low-step side entrance running boards (left & right)
  for (const s of [-1, 1]) {
    // Running board
    box(0.14, 0.03, L - 1.1, s * (W / 2 + 0.04), 0.22, 0, '#222325');
    // Brushed safety edge trim
    box(0.02, 0.04, L - 1.08, s * (W / 2 + 0.11), 0.22, 0, '#d0d5da');
    // Skirt & emerald livery pinstripe
    box(0.04, 0.18, L - 0.9, s * (W / 2 - 0.01), 0.44, 0, white);
    box(0.05, 0.035, L - 0.85, s * (W / 2 + 0.005), 0.49, 0, greenLivery);
    box(0.045, 0.018, L - 0.85, s * (W / 2 + 0.005), 0.44, 0, '#b83232');
    // Side safety kick rails along the open passenger entries
    cyl([s * (W / 2 - 0.02), 0.52, -1.9], [s * (W / 2 - 0.02), 0.52, 0.8], 0.016, 0.016, '#282a2c', 6);
  }

  // Heavy-duty impact bumpers
  // Front bumper
  box(W + 0.08, 0.16, 0.18, 0, 0.32, L / 2 - 0.06, darkTrim);
  box(0.95, 0.08, 0.06, 0, 0.24, L / 2 + 0.04, '#2d3136'); // lower skid bar
  for (const s of [-1, 1]) {
    box(0.05, 0.06, 0.04, s * 0.38, 0.24, L / 2 + 0.05, '#e74c3c'); // recovery towing shackles
  }
  // Front license / fleet identification plate
  box(0.44, 0.11, 0.02, 0, 0.34, L / 2 + 0.04, '#f0f2f5');
  box(0.40, 0.07, 0.025, 0, 0.34, L / 2 + 0.04, '#1c1c1c');

  // Rear bumper
  box(W + 0.08, 0.16, 0.18, 0, 0.32, -L / 2 + 0.06, darkTrim);
  for (const s of [-1, 1]) {
    box(0.12, 0.04, 0.02, s * 0.50, 0.34, -L / 2 - 0.04, '#d02020'); // rear reflectors
  }

  // --- 2. Front Fascia with Dual Headlights & Grille ---
  // Aerodynamic sculpted front cowl
  box(W + 0.04, 0.44, 0.95, 0, 0.56, L / 2 - 0.55, white);
  // Hood sloping brow
  box(W - 0.06, 0.06, 0.85, 0, 0.79, L / 2 - 0.52, white, -0.06);

  // Front radiator / electric motor intake grille
  box(0.68, 0.22, 0.05, 0, 0.52, L / 2 - 0.06, '#18191a');
  box(0.70, 0.025, 0.06, 0, 0.63, L / 2 - 0.05, '#d0d6dc'); // chrome top slat
  box(0.70, 0.025, 0.06, 0, 0.41, L / 2 - 0.05, '#d0d6dc'); // chrome bottom slat
  box(0.66, 0.018, 0.06, 0, 0.52, L / 2 - 0.05, '#a4abb2'); // center slat

  // Dual Headlights & Turn Indicators
  for (const s of [-1, 1]) {
    // Headlight bucket / bezel
    box(0.24, 0.15, 0.05, s * 0.44, 0.62, L / 2 - 0.07, '#252729');
    // Chrome reflector cup
    box(0.20, 0.12, 0.04, s * 0.44, 0.62, L / 2 - 0.05, '#d0d8df');
    // High-intensity optical glass lens (crystal white with slight blue reflection)
    box(0.16, 0.09, 0.03, s * 0.44, 0.62, L / 2 - 0.03, '#fffffa');
    // Amber turn indicator flanking headlight
    box(0.06, 0.11, 0.03, s * 0.58, 0.62, L / 2 - 0.06, '#f39c12');
  }

  // Embossed gold "IGZP SAFARI" emblem on nose
  box(0.28, 0.07, 0.02, 0, 0.74, L / 2 - 0.12, '#d4af37');

  // Rear bodywork
  box(W + 0.02, 0.36, 0.75, 0, 0.64, -L / 2 + 0.42, white);

  // --- 3. Passenger Benches & Handrails ---
  // Four rows: 3 forward-facing + 1 rear-facing observation row
  const rows = [
    [0.95, 1, false],   // Row 0: Driver & front passenger
    [0.0, 1, true],     // Row 1: Passenger
    [-0.95, 1, true],   // Row 2: Passenger
    [-1.78, -1, false]  // Row 3: Rear-facing observation
  ];

  for (const [z, f, hasRail] of rows) {
    // Moulded seat pedestal
    box(W - 0.16, 0.40, 0.44, 0, 0.56, z, white);
    // Ergonomic contoured cushion with thigh support bolster
    box(W - 0.20, 0.10, 0.48, 0, 0.81, z, '#1b1c1e');
    box(W - 0.22, 0.035, 0.14, 0, 0.87, z + 0.18 * f, '#28292c');
    // Contoured backrest
    box(W - 0.20, 0.42, 0.08, 0, 1.07, z - 0.24 * f, '#1b1c1e');
    // Polished stainless steel passenger grab rail across the back of the seat
    if (hasRail) {
      cyl([-W / 2 + 0.16, 1.28, z - 0.28 * f], [W / 2 - 0.16, 1.28, z - 0.28 * f], 0.016, 0.016, '#d4dae0', 6);
      cyl([-W / 2 + 0.16, 1.05, z - 0.28 * f], [-W / 2 + 0.16, 1.28, z - 0.28 * f], 0.014, 0.014, '#b0b8c0', 6);
      cyl([W / 2 - 0.16, 1.05, z - 0.28 * f], [W / 2 - 0.16, 1.28, z - 0.28 * f], 0.014, 0.014, '#b0b8c0', 6);
    }
    // Curved side hip-restraint handrails at seat outer edges
    for (const s of [-1, 1]) {
      cyl([s * (W / 2 - 0.08), 0.85, z - 0.22 * f], [s * (W / 2 - 0.08), 1.18, z + 0.12 * f], 0.018, 0.018, '#26282a', 6);
      cyl([s * (W / 2 - 0.08), 1.18, z + 0.12 * f], [s * (W / 2 - 0.08), 0.85, z + 0.22 * f], 0.018, 0.018, '#26282a', 6);
    }
  }

  // --- 4. Driver Cockpit, Dashboard & Controls ---
  box(0.68, 0.32, 0.36, 0.28, 0.95, 1.42, '#202224');
  box(0.32, 0.18, 0.06, 0.30, 1.12, 1.34, '#18191b', -0.35); // instrument cluster binnacle
  box(0.12, 0.09, 0.02, 0.25, 1.13, 1.32, '#f5f5f5', -0.35); // speedometer dial
  box(0.08, 0.04, 0.02, 0.36, 1.15, 1.33, '#27ae60', -0.35); // battery SOC gauge
  box(0.08, 0.02, 0.10, 0.24, 0.38, 1.62, '#151515', 0.45); // brake pedal
  box(0.10, 0.02, 0.10, 0.36, 0.38, 1.62, '#151515', 0.45); // accel pedal
  cyl([0.30, 0.82, 1.54], [0.30, 1.18, 1.32], 0.025, 0.025, '#1e2022', 6); // steering shaft

  // --- 5. Canopy Roof on Six Roll-Cage Pillars ---
  for (const z of [1.38, -0.42, -2.02]) {
    for (const s of [-1, 1]) {
      cyl([s * (W / 2 - 0.05), 0.52, z], [s * (W / 2 - 0.05), 2.06, z], 0.026, 0.026, '#1e2022', 6);
    }
    cyl([-W / 2 + 0.05, 2.06, z], [W / 2 - 0.05, 2.06, z], 0.022, 0.022, '#1e2022', 6);
  }
  for (const s of [-1, 1]) {
    cyl([s * (W / 2 - 0.05), 2.06, 1.38], [s * (W / 2 - 0.05), 2.06, -2.02], 0.022, 0.022, '#1e2022', 6);
  }

  // Aerodynamic dual-layer canopy
  box(W + 0.24, 0.06, L - 0.22, 0, 2.09, -0.22, white);
  box(W + 0.20, 0.04, L - 0.26, 0, 2.04, -0.22, '#e8e4da');
  for (const s of [-1, 1]) {
    box(0.03, 0.06, L - 0.20, s * (W / 2 + 0.12), 2.08, -0.22, greenLivery);
  }
  box(W + 0.22, 0.04, 0.16, 0, 2.05, L / 2 - 0.78, greenLivery, 0.15);
  box(0.18, 0.03, 0.18, 0, 2.02, 0, '#fffffa');

  // Merge static parts into one high-efficiency body mesh
  const bodyMesh = new THREE.Mesh(
    merge(parts),
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0.28,
      envMapIntensity: 0.65
    })
  );
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  chassis.add(bodyMesh);

  // --- 6. Steering Wheel (Interactive / Animating) ---
  const steeringWheelGroup = new THREE.Group();
  steeringWheelGroup.position.set(0.30, 1.20, 1.30);
  steeringWheelGroup.rotation.x = -1.1;

  const swParts = [];
  const ring = new THREE.TorusGeometry(0.17, 0.018, 8, 24);
  swParts.push(paint(ring, C('#141414')));
  for (let a = 0; a < 3; a++) {
    const ang = (a / 3) * Math.PI * 2;
    const spk = limb(new V3(0, 0, 0), new V3(Math.cos(ang) * 0.16, Math.sin(ang) * 0.16, 0), 0.012, 0.012, 6);
    swParts.push(paint(spk, C('#8e959d')));
  }
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12);
  hub.rotateX(Math.PI / 2);
  swParts.push(paint(hub, C('#181818')));

  const steeringWheelMesh = new THREE.Mesh(
    merge(swParts),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 })
  );
  steeringWheelGroup.add(steeringWheelMesh);
  chassis.add(steeringWheelGroup);
  g.userData.steeringWheel = steeringWheelMesh;

  // --- 7. Transparent Windscreen with Wiper Arms & Mirror ---
  const ws = new THREE.Mesh(
    new THREE.PlaneGeometry(W - 0.05, 0.95),
    new THREE.MeshStandardMaterial({
      color: '#dfeef2',
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ws.position.set(0, 1.50, L / 2 - 0.95);
  ws.rotation.x = -0.12;
  chassis.add(ws);

  const trimParts = [];
  const wiper1 = limb(new V3(-0.35, 1.08, L / 2 - 0.90), new V3(-0.05, 1.12, L / 2 - 0.89), 0.01, 0.008, 4);
  const wiper2 = limb(new V3(0.05, 1.08, L / 2 - 0.90), new V3(0.35, 1.12, L / 2 - 0.89), 0.01, 0.008, 4);
  trimParts.push(paint(wiper1, C('#141414')), paint(wiper2, C('#141414')));
  const mirrorGeo = new THREE.BoxGeometry(0.24, 0.06, 0.03);
  mirrorGeo.applyMatrix4(mat4(new V3(0, 1.94, L / 2 - 0.94)));
  trimParts.push(paint(mirrorGeo, C('#1a1a1a')));
  const mirrorMesh = new THREE.Mesh(merge(trimParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  chassis.add(mirrorMesh);

  // --- 8. Steerable & Rotating Wheels ---
  const makeWheelMesh = (isLeft) => {
    const wParts = [];
    const rTyre = 0.28, wTyre = 0.21, rRim = 0.165;
    const t = new THREE.CylinderGeometry(rTyre, rTyre, wTyre, 18);
    t.rotateZ(Math.PI / 2);
    wParts.push(paint(t, C('#151617')));
    const r = new THREE.CylinderGeometry(rRim, rRim, wTyre + 0.008, 14);
    r.rotateZ(Math.PI / 2);
    wParts.push(paint(r, C('#c9a54e')));
    const hubCap = new THREE.CylinderGeometry(0.06, 0.06, wTyre + 0.015, 10);
    hubCap.rotateZ(Math.PI / 2);
    wParts.push(paint(hubCap, C('#1b1b1c')));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const lx = (isLeft ? -1 : 1) * (wTyre / 2 + 0.006);
      const lug = new THREE.CylinderGeometry(0.016, 0.016, 0.01, 6);
      lug.rotateZ(Math.PI / 2);
      lug.translate(lx, Math.sin(a) * 0.10, Math.cos(a) * 0.10);
      wParts.push(paint(lug, C('#e2e4e8')));
    }
    const mesh = new THREE.Mesh(
      merge(wParts),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4 })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  const flPivot = new THREE.Group();
  flPivot.position.set(-0.64, 0.28, 1.45);
  g.add(flPivot);
  g.userData.flPivot = flPivot;

  const frPivot = new THREE.Group();
  frPivot.position.set(0.64, 0.28, 1.45);
  g.add(frPivot);
  g.userData.frPivot = frPivot;

  const flWheel = makeWheelMesh(true); flPivot.add(flWheel);
  const frWheel = makeWheelMesh(false); frPivot.add(frWheel);
  const rlWheel = makeWheelMesh(true); rlWheel.position.set(-0.64, 0.28, -1.45); g.add(rlWheel);
  const rrWheel = makeWheelMesh(false); rrWheel.position.set(0.64, 0.28, -1.45); g.add(rrWheel);

  g.userData.wheels = [flWheel, frWheel, rlWheel, rrWheel];

  return g;
}

export class Safari {
  constructor(scene, L, structures) {
    this.L = L; this.scene = scene;
    this.cart = cartModel(); this.cart.visible = true; scene.add(this.cart);
    this.chassisGroup = this.cart.userData.chassis;
    this.steeringWheel = this.cart.userData.steeringWheel;
    this.frontLeftPivot = this.cart.userData.flPivot;
    this.frontRightPivot = this.cart.userData.frPivot;
    this.wheels = this.cart.userData.wheels;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.dynPitch = 0;
    this.pitchVel = 0;
    this.dynRoll = 0;
    this.rollVel = 0;
    this.prevSpeed = 0;
    this.prevYaw = 0;
    this.active = false; this.paused = false; this.s = 0; this.speed = 0; this.dwell = 0; this.stopIdx = 0;
    this.lookYaw = 0; this.lookPitch = -0.05; this.fov = 62;
    this.blockedTimer = 0;
    if (scene) scene.userData.safari = this;
    this._buildRoute();
    this._place(0);
  }
  /** Road-only route: depot near the main entrance -> each stop's nearest road point -> back to depot. */
  _buildRoute() {
    const L = this.L, road = L.roadGrid(), snapRoad = (x, z) => {
      for (let r = 0; r < 60; r += 1) for (let a = 0; a < 16; a++) { const t = a / 16 * 6.283, qx = x + Math.cos(t) * r, qz = z + Math.sin(t) * r; if (L.sample(road, qx, qz) > 0.9) return [qx, qz]; if (!r) break; }
      return null;
    };
    const ent = L.enclosures, stops = [];
    for (const id of SAFARI_STOPS) { const en = ent.find(e => e.id === id); if (!en) continue; const p = snapRoad(en.view.x, en.view.z); if (p && Math.hypot(p[0] - en.view.x, p[1] - en.view.z) < 65) stops.push({ en, at: p }); }
    // order stops greedily from the depot so the loop follows the roads sensibly
    const depot = snapRoad(-418, -206) || stops[0].at;
    const order = [], left = stops.slice(); let cur = depot;
    while (left.length) { left.sort((a, b) => Math.hypot(a.at[0] - cur[0], a.at[1] - cur[1]) - Math.hypot(b.at[0] - cur[0], b.at[1] - cur[1])); const n = left.shift(); order.push(n); cur = n.at; }
    const pts = [], stopS = []; let prev = depot, total = 0;
    const append = seg => { for (const q of seg) { if (pts.length) total += Math.hypot(q[0] - pts[pts.length - 1][0], q[1] - pts[pts.length - 1][1]); pts.push(q); } };
    pts.push(depot);
    for (const st of order.concat([{ at: depot, depot: true }])) {
      const leg = findPath(L, prev[0], prev[1], st.at[0], st.at[1], road);
      if (!leg) continue;
      append(leg.slice(1));
      if (!st.depot) stopS.push({ s: total, en: st.en, at: st.at });
      prev = st.at;
    }
    // smooth + resample at 1 m
    // corner-round the road route, then resample at exactly 1 m so `s` is metres travelled
    // A* + line-of-sight points are guaranteed on the road grid; spline smoothing can cut corners off the
    // tarmac, so resample the raw polyline (the cart's look-ahead heading rounds the corners visually).
    const sm = pts, res = [sm[0]]; let carry = 0;
    for (let i = 1; i < sm.length; i++) {
      const [ax, az] = sm[i - 1], [bx, bz] = sm[i], d = Math.hypot(bx - ax, bz - az); let t = 1 - carry;
      while (t <= d) { res.push([ax + (bx - ax) * t / d, az + (bz - az) * t / d]); t += 1; }
      carry = d - (t - 1);
    }
    if (res.length < 2) res.push([res[0][0] + 1, res[0][1]]);
    this.pts = res; this.len = res.length - 1;
    // map stop distances onto the resampled polyline (nearest sample)
    this.stops = stopS.map(st => { let bi = 0, bd = 1e9; res.forEach((q, i) => { const d = Math.hypot(q[0] - st.at[0], q[1] - st.at[1]); if (d < bd) { bd = d; bi = i; } }); return { ...st, i: bi, name: SPECIES[st.en.species]?.name || st.en.id }; }).sort((a, b) => a.i - b.i);
    this.depot = depot;
  }
  pointAt(s) {
    if (this.len <= 0) return this.pts[0] || [0, 0];
    const i = clamp(Math.floor(s), 0, this.len - 1), f = clamp(s - i, 0, 1), a = this.pts[i], b = this.pts[i + 1] || a;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }
  _place(s) {
    const [x, z] = this.pointAt(s), [ax, az] = this.pointAt(s + 2.2), [bx, bz] = this.pointAt(s - 2.2);
    const yaw = Math.atan2(ax - bx, az - bz), yf = this.L.walkHeight(ax, az), yb = this.L.walkHeight(bx, bz);
    this.cart.position.set(x, (yf + yb) / 2, z);
    this.cart.rotation.set(-Math.atan2(yf - yb, 4.4), yaw, 0, 'YXZ');
    this.yaw = yaw;
  }
  start() {
    this.active = true; this.paused = false; this.s = 0; this.speed = 0; this.dwell = 0; this.stopIdx = 0;
    this.lookYaw = 0; this.lookPitch = -0.05; this.fov = 62;
    this.steerAngle = 0; this.wheelSpin = 0;
    this.dynPitch = 0; this.pitchVel = 0;
    this.dynRoll = 0; this.rollVel = 0;
    this.prevSpeed = 0; this.prevYaw = 0;
    this._place(0);
  }
  stop() { this.active = false; }
  get nextStop() { return this.stops[this.stopIdx] || null; }
  get progress() { return clamp(this.s / this.len, 0, 1); }
  get stopped() { return this.dwell > 0 || this.paused || this.speed < 0.05; }
  /** Where a passenger alights: the nearest public walkable spot beside the cart. */
  alightPoint() {
    const p = this.cart.position;
    for (let r = 1.5; r < 20; r += 0.5) for (let a = 0; a < 12; a++) { const t = a / 12 * 6.283, x = p.x + Math.cos(t) * r, z = p.z + Math.sin(t) * r; if (this.L.isWalkable(x, z)) return [x, z]; }
    return [p.x, p.z];
  }
  /**
   * Road lane clearance check:
   * Examines the travel corridor ahead along the cart's road route.
   * Cart width is 1.26m; corridor half-width is 1.15m (0.63m half-width + 0.52m pedestrian buffer).
   * Checks pedestrians ahead of the front bumper (s + 2.15) up to 5.5m.
   * Distant pedestrians (> 5.5m) do not stop or stall the vehicle.
   */
  checkLaneClearance(people) {
    if (!people) return { clear: true, nearestAhead: Infinity };
    const frontS = this.s + 2.15;
    const maxLookAhead = 5.5;
    const laneHalfWidth = 1.15;
    let nearestAhead = Infinity;

    const cartX = this.cart.position.x, cartZ = this.cart.position.z;
    const candidates = people.near ? people.near(cartX, cartZ, 9.5) : (people.list || []);

    for (const p of candidates) {
      if (p.state === 'sit') continue; // Sitting on bench is off-road

      let bestDistSq = Infinity, bestAhead = -1;
      for (let offset = 0; offset <= maxLookAhead; offset += 0.5) {
        const testS = Math.min(this.len, frontS + offset);
        const [rx, rz] = this.pointAt(testS);
        const dSq = (p.pos.x - rx) ** 2 + (p.pos.z - rz) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestAhead = offset;
        }
      }

      const lateralDist = Math.sqrt(bestDistSq);
      // Only count if within the road circulation lane corridor
      if (lateralDist < laneHalfWidth && bestAhead >= 0) {
        if (bestAhead < nearestAhead) nearestAhead = bestAhead;
      }
    }

    return {
      clear: nearestAhead > maxLookAhead,
      nearestAhead
    };
  }
  update(dt, people) {
    if (!this.active) return null;
    if (people) people.safari = this;
    let event = null;
    if (this.dwell > 0) { this.dwell -= dt; if (this.dwell <= 0) { this.stopIdx++; event = 'depart'; } }
    const st = this.nextStop, toStop = st ? st.i - this.s : this.len - this.s;
    let want = this.paused || this.dwell > 0 ? 0 : 3.6;                      // ~13 km/h, typical for zoo carts
    if (toStop < 12) want = Math.min(want, 0.5 + toStop * 0.28);               // ease into stops

    // Road lane clearance checks & smooth deceleration:
    // Does not deadlock or stop permanently for distant pedestrians.
    // Automatically resumes full flow once pedestrians step aside or clear the path.
    const lane = this.checkLaneClearance(people);
    if (!lane.clear) {
      if (lane.nearestAhead <= 0.8) {
        // Immediate obstacle right in front of bumper: halt safely
        want = 0;
      } else {
        // Smooth deceleration zone: gently scale speed with distance
        const safeSpeed = (lane.nearestAhead - 0.8) * 0.75;
        want = Math.min(want, Math.max(0.4, safeSpeed));
      }

      // Anti-deadlock: prompt pedestrians to yield if held for too long
      if (this.speed < 0.1) {
        this.blockedTimer = (this.blockedTimer || 0) + dt;
        if (this.blockedTimer > 2.0 && people?.promptYield) {
          people.promptYield(this.cart.position.x, this.cart.position.z, this.yaw, 7.0);
        }
      } else {
        this.blockedTimer = 0;
      }
    } else {
      this.blockedTimer = 0;
    }

    this.speed = lerp(this.speed, want, damp(want > this.speed ? 1.0 : 2.5, dt));
    this.s = Math.min(this.len, this.s + this.speed * dt);
    if (st && this.dwell <= 0 && st.i - this.s < 0.6 && !this.paused) { this.dwell = 10; this.speed = 0; event = 'arrive'; }
    if (!st && this.s >= this.len - 0.5) { this.active = false; event = 'end'; }
    this._place(this.s);

    // --- Dynamic Chassis Physics & Animations (Apex-Drive & Threejs-Punk-Drive) ---
    const safeDt = clamp(dt, 0.001, 0.1);

    // 1. Front Wheel Steering & Animated Steering Wheel:
    // Estimate road route curvature ahead
    const lookAheadDist = 2.6;
    const [aheadX, aheadZ] = this.pointAt(Math.min(this.len, this.s + lookAheadDist));
    const targetYaw = Math.atan2(aheadX - this.cart.position.x, aheadZ - this.cart.position.z);
    const yawDiff = wrapAngle(targetYaw - this.yaw);
    const targetSteer = clamp(yawDiff * 1.8, -0.62, 0.62);
    this.steerAngle = lerp(this.steerAngle || 0, targetSteer, damp(8.0, safeDt));
    if (this.frontLeftPivot) this.frontLeftPivot.rotation.y = this.steerAngle;
    if (this.frontRightPivot) this.frontRightPivot.rotation.y = this.steerAngle;
    if (this.steeringWheel) this.steeringWheel.rotation.z = -this.steerAngle * 2.8;

    // 2. Animated Wheel Spin:
    // Spin wheels proportional to linear travel distance over ground
    const wheelRadius = 0.28;
    const distMoved = this.speed * safeDt;
    this.wheelSpin = ((this.wheelSpin || 0) + distMoved / wheelRadius) % (Math.PI * 2);
    if (this.wheels) {
      for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    }

    // 3. Dynamic Pitch (Acceleration Squat & Braking Dive):
    const accel = (this.speed - (this.prevSpeed !== undefined ? this.prevSpeed : this.speed)) / safeDt;
    this.prevSpeed = this.speed;
    const targetPitch = clamp(accel * 0.018, -0.07, 0.07);
    this.pitchVel = (this.pitchVel || 0) + (-20.0 * (this.dynPitch - targetPitch) - 6.0 * this.pitchVel) * safeDt;
    this.dynPitch = (this.dynPitch || 0) + this.pitchVel * safeDt;

    // 4. Dynamic Roll (Centripetal Suspension Lean into Turns):
    const yawRate = wrapAngle(this.yaw - (this.prevYaw !== undefined ? this.prevYaw : this.yaw)) / safeDt;
    this.prevYaw = this.yaw;
    const centripetal = this.speed * yawRate;
    const targetRoll = clamp(centripetal * 0.045, -0.10, 0.10);
    this.rollVel = (this.rollVel || 0) + (-18.0 * (this.dynRoll - targetRoll) - 5.5 * this.rollVel) * safeDt;
    this.dynRoll = (this.dynRoll || 0) + this.rollVel * safeDt;

    // 5. Apply Suspension Pitch, Roll & Micro Road Vibration to Upper Tram Chassis:
    if (this.chassisGroup) {
      const rumble = this.speed > 0.1 ? Math.sin((this.s || 0) * 16.0) * 0.003 * Math.min(1.0, this.speed / 2.0) : 0;
      this.chassisGroup.position.y = rumble;
      this.chassisGroup.rotation.x = this.dynPitch;
      this.chassisGroup.rotation.z = this.dynRoll;
    }

    return event;
  }
  /** Passenger camera: second row, right-hand seat, free look relative to the cart with dynamic suspension sensation. */
  seatCamera(camera, dt) {
    const c = this.cart, localSeat = new V3(0.32, 1.62, -0.05);
    if (this.chassisGroup) {
      localSeat.applyEuler(this.chassisGroup.rotation).add(this.chassisGroup.position);
    }
    const seat = localSeat.applyEuler(c.rotation).add(c.position);
    camera.position.copy(seat);
    // Include suspension pitch and roll in passenger view for realistic riding sensation
    const effPitch = this.lookPitch + (this.dynPitch || 0) * 0.7;
    const effRoll = (this.dynRoll || 0) * 0.7;
    camera.rotation.set(effPitch, this.yaw + Math.PI + this.lookYaw, effRoll, 'YXZ');
    camera.fov = lerp(camera.fov, this.fov, damp(6, dt)); camera.updateProjectionMatrix();
  }
}
