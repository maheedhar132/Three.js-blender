// Enclosure barriers, habitat furniture, buildings, gates, signage and visitor amenities.
// Static geometry is merged into a few vertex-coloured buckets to keep draw calls low.
import * as THREE from 'three';
import { toWorld, WORLD } from '../config.js';
import { BUILDINGS, AMENITIES, ZONES, RESTRICTED, PATHS, ROADS, PLAZAS, HIGHWAY } from '../data/zoo-layout.js';
import { SPECIES } from '../data/species.js';
import { V3, UP, rand, rr, pick, clamp, paint, merge, limb, mat4, weld, fbm3, noise2, seed, pointInPoly, insetPoly, polyCentroid, textTexture, smoothLine } from '../core/util.js';

const C = h => new THREE.Color(h);
const BIG_HERBIVORE = ['asian_elephant', 'rhino', 'indian_gaur'];
const OPEN_PADDOCK = ['zebra', 'giraffe', 'spotted_deer', 'nilgai', 'barking_deer', 'swamp_deer', 'hog_deer', 'sambar', 'blackbuck', 'wild_boar', 'sarus_crane', 'ostrich', 'emu'];

function barrierFor(en) {
  if (en.habitat === 'aviary') return { wall: 0.6, fence: 5.2, net: true };
  if (en.habitat === 'pit') return { wall: 0.75, glass: 1.0 };
  if (en.habitat === 'primate') return { wall: 0.9, fence: 4.6 };
  if (['mugger', 'saltwater_crocodile', 'gharial'].includes(en.species)) return { wall: 1.15, fence: 1.8 };
  if (en.habitat === 'water') return { wall: 1.0, rail: 1.1 };
  if (BIG_HERBIVORE.includes(en.species)) return { wall: 0.7, rail: 1.9, heavy: true };
  if (OPEN_PADDOCK.includes(en.species)) return { wall: 0.45, rail: 1.6 };
  return { wall: 0.9, fence: 4.0 };      // carnivores, bears, canids
}

export class Structures {
  /** Phase 1 (before vegetation): decide where everything goes and reserve space. */
  constructor(layers) {
    seed(99);
    this.L = layers; layers.exclusions = []; this.signs = [];
    this.buildings = BUILDINGS.map(b => this._placeBuilding(b));
    // keep the main entrance forecourt and the nameboard wall clear of trees (as in the photograph)
    { const b = BUILDINGS.find(q => q.id === 'main-entry'), [gx, gz] = toWorld(...b.at), y = b.rot || 0, ox = Math.cos(y), oz = -Math.sin(y), fx = Math.sin(y), fz = Math.cos(y);
      for (let a = -16; a <= 34; a += 3) for (const f of [0, -5, -10]) layers.exclusions.push({ x: gx + ox * a + fx * f, z: gz + oz * a + fz * f, r: f ? 5 : 3 }); }
    this.amenities = AMENITIES.map(a => this._placeSmall(a));
    for (const en of layers.enclosures) this._viewPoint(en);
  }
  /** Push a footprint off the walkable network and face its front toward the nearest path. */
  _settle(x, z, r) {
    const L = this.L; let px = x, pz = z;
    for (let it = 0; it < 40; it++) {
      if (!L.nearWalk(px, pz, r) && L.water(px, pz) < 0.1 && L.maskAt(px, pz)[2] < 0.12) break;
      let best = null, bd = 1e9;      // nearest walkable sample -> move directly away from it
      for (let a = 0; a < 16; a++) for (const d of [r * 0.5, r, r * 1.6]) { const t = a / 16 * 6.28, qx = px + Math.cos(t) * d, qz = pz + Math.sin(t) * d; if (L.isWalkable(qx, qz) && d < bd) { bd = d; best = [qx, qz]; } }
      if (!best) { px += rr(-1.5, 1.5); pz += rr(-1.5, 1.5); continue; }
      const dx = px - best[0], dz = pz - best[1], l = Math.hypot(dx, dz) || 1; px += dx / l * 1.5; pz += dz / l * 1.5;
    }
    // face the nearest path
    let face = 0, bd = 1e9;
    for (let a = 0; a < 24; a++) for (let d = r; d < r + 30; d += 2) { const t = a / 24 * 6.28; if (L.isWalkable(px + Math.cos(t) * d, pz + Math.sin(t) * d)) { if (d < bd) { bd = d; face = t; } break; } }
    return { x: px, z: pz, yaw: Math.PI / 2 - face, toPath: bd };
  }
  _placeBuilding(b) {
    const [x, z] = toWorld(...b.at);
    const size = { gate: 0, ticket: 4, office: 8, hospital: 9, shed: 7, aquarium: 9, house: 8, canteen: 7, shop: 7, garden: 0 }[b.kind] ?? 6;
    let p = { x, z, yaw: b.rot || 0 };
    if (size > 0) p = this._settle(x, z, size);
    if (size > 0) this.L.exclusions.push({ x: p.x, z: p.z, r: size + 2 });
    return { ...b, ...p, size, wx: x, wz: z };
  }
  _placeSmall(a) {
    const [x, z] = toWorld(...a.at), r = { toilet: 3, ro: 1.2, pagoda: 3.2, icecream: 1.8, souvenir: 2.2 }[a.kind] || 2;
    const p = this._settle(x, z, r + 1.5);
    this.L.exclusions.push({ x: p.x, z: p.z, r: r + 1 });
    return { ...a, ...p, r };
  }
  /** Find the visitor viewing spot on the path closest to each enclosure. */
  _viewPoint(en) {
    const L = this.L, [cx, cz] = polyCentroid(en.poly); let best = null, bd = 1e9;
    for (const [vx, vz] of en.poly) {
      const dx = vx - cx, dz = vz - cz, l = Math.hypot(dx, dz) || 1;
      for (let d = 0; d < 80; d += 1) { const x = vx + dx / l * d, z = vz + dz / l * d; if (L.isWalkable(x, z)) { const dd = Math.hypot(x - cx, z - cz); if (dd < bd) { bd = dd; best = [x, z, vx, vz]; } break; } }
    }
    // never fall back to the enclosure interior: search outward rings for the nearest public cell
    for (let r = 4; !best && r < 200; r += 2) for (let a = 0; a < 48; a++) { const t = a / 48 * 6.283, x = cx + Math.cos(t) * r, z = cz + Math.sin(t) * r; if (L.isWalkable(x, z) && !pointInPoly(x, z, en.poly)) { best = [x, z, x, z]; break; } }
    en.view = { x: best[0], z: best[1], edgeX: best[2], edgeZ: best[3] };
  }

  /** Phase 2: build the meshes. */
  build(scene, U) {
    this.scene = scene;
    const L = this.L, H = (x, z) => L.heightAt(x, z);
    const solid = [], fence = [], net = [], glass = [];
    const rocks = [], postsM = [];
    this.perches = new Map();
    const box = (w, h, d, pos, yaw, col, pitch = 0, roll = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(mat4(pos, yaw, 1, pitch, roll)); solid.push(paint(g, typeof col === 'function' ? col : C(col))); };
    const cyl = (a, b, r0, r1, col, radial = 8) => solid.push(paint(limb(a, b, r0, r1, radial), typeof col === 'function' ? col : C(col)));
    const plaster = base => (c, x, y, z) => c.set(base).multiplyScalar(0.85 + 0.2 * noise2(x * 0.7 + z * 0.3, y * 2)).lerp(C('#6b5a44'), clamp(0.5 - y + (noise2(x, z) - 0.5), 0, 1) * 0.25);
    const stone = (c, x, y, z) => c.set('#8b7f6c').multiplyScalar(0.7 + 0.45 * noise2(x * 2.3 + z * 1.7, y * 2.3));

    // ---------------- enclosure barriers ----------------
    for (const en of L.enclosures) {
      const B0 = barrierFor(en), poly = en.poly, n = poly.length;
      let acc = 0; const fTop = [];
      for (let i = 0; i < n; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
        // per-edge barrier: open-habitat designs keep the viewing side free of mesh
        let B = B0;
        if (en.style === 'moat') B = en.front[i] ? { wall: 1.05, rail: 0.0, parapet: true } : { wall: 0.6, fence: 4.6 };
        else if (en.style === 'glass') B = en.front[i] ? { wall: 0.55, glass: 2.7, frame: true } : { wall: 0.6, fence: 4.2 };
        const ha = H(ax, az), hb = H(bx, bz), len = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax);
        // low plastered laterite wall (partly buried so it follows the slope)
        box(len + 0.3, B.wall + 0.8, 0.32, new V3((ax + bx) / 2, (ha + hb) / 2 + B.wall / 2 - 0.4, (az + bz) / 2), yaw, plaster(en.habitat === 'pit' ? '#c8b89a' : '#b8a184'));
        box(len + 0.35, 0.08, 0.42, new V3((ax + bx) / 2, (ha + hb) / 2 + B.wall + 0.04, (az + bz) / 2), yaw, '#9c8f7a');
        if (B.parapet) {   // single brushed-steel handrail on short posts along the parapet
          cyl(new V3(ax, ha + B.wall + 0.42, az), new V3(bx, hb + B.wall + 0.42, bz), 0.03, 0.03, '#8d9496', 6);
          postsM.push({ a: new V3(ax, ha + B.wall, az), h: 0.42, r: 0.025 });
        }
        if (B.frame) postsM.push({ a: new V3(ax, ha + B.wall, az), h: B.glass, r: 0.04 });
        if (B.fence || B.rail) { const p = new V3(ax, ha + B.wall, az); postsM.push({ a: p, h: (B.fence || B.rail) + 0.1, r: B.heavy ? 0.12 : 0.05 }); }
        if (B.rail) for (const k of (B.heavy ? [0.35, 0.75, 1.0] : [0.33, 0.66, 1.0])) {
          const y0 = ha + B.wall + B.rail * k, y1 = hb + B.wall + B.rail * k;
          cyl(new V3(ax, y0, az), new V3(bx, y1, bz), B.heavy ? 0.07 : 0.035, B.heavy ? 0.07 : 0.035, B.heavy ? '#5b4a38' : '#3c4a40', 5);
        }
        if (B.fence || B.glass) {
          const fh = B.fence || B.glass, P = [], UV = [];
          for (const [x, z, h, u] of [[ax, az, ha, acc], [bx, bz, hb, acc + len]]) { P.push(x, h + B.wall, z, x, h + B.wall + fh, z); UV.push(u / 0.12, 0, u / 0.12, fh / 0.12); }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals();
          (B.fence ? fence : glass).push(g);
          if (B.fence) cyl(new V3(ax, ha + B.wall + fh, az), new V3(bx, hb + B.wall + fh, bz), 0.03, 0.03, '#33403a', 4);
        }
        acc += len; fTop.push([ax, az]);
      }
      if (B0.net) {   // aviary roof net
        const top = Math.max(...poly.map(([x, z]) => H(x, z))) + B0.wall + B0.fence;
        const sh = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
        const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, top, 0);
        const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.6, p.getZ(i) / 1.6);
        net.push(g);
        // tall posts inside, plus branch perches
      }
      this._furnish(en, { box, cyl, rocks, solid, H, plaster });
    }

    // ---------------- buildings ----------------
    for (const b of this.buildings) this._building(b, { box, cyl, solid, H, plaster, stone, scene });
    for (const a of this.amenities) this._amenity(a, { box, cyl, H, plaster });

    // zone signboards, exhibit placards
    for (const z of ZONES) if (z.sign) { const [x, zz] = toWorld(...z.sign); const p = this._settle(x, zz, 2.2); this._sign(scene, [z.name.toUpperCase()], p.x, p.z, p.yaw, 1.9, 3.4, 0.8, { cyl }); }
    for (const en of L.enclosures) {
      const sp = SPECIES[en.species]; if (!sp) continue;
      const v = en.view, dx = en.cx - v.x, dz = en.cz - v.z, l = Math.hypot(dx, dz) || 1;
      // placard beside the viewing spot, on the enclosure side of the path
      let px = v.x + dx / l * 2.8 - dz / l * 2.2, pz = v.z + dz / l * 2.8 + dx / l * 2.2;
      if (L.isWalkable(px, pz)) { px += dx / l * 1.5; pz += dz / l * 1.5; }
      this._sign(scene, [sp.name], px, pz, Math.atan2(-dx, -dz), 1.0, 1.6, 0.42, { cyl, small: true });
      L.blockers.push({ x: px, z: pz, r: 0.3 });
    }
    // restricted areas (drawn, signed, fenced — never accessible)
    for (const r of RESTRICTED) {
      const [x, z] = toWorld(...r.at), poly = []; for (let i = 0; i < 28; i++) { const a = i / 28 * 6.28; poly.push([x + Math.cos(a) * r.r * 1.3, z + Math.sin(a) * r.r]); }
      for (let i = 0; i < poly.length; i++) { const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length]; const ha = H(ax, az), hb = H(bx, bz); postsM.push({ a: new V3(ax, ha, az), h: 2.2, r: 0.05 }); const P = [ax, ha, az, ax, ha + 2.2, az, bx, hb, bz, bx, hb + 2.2, bz], len = Math.hypot(bx - ax, bz - az), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1.4, len / 1.6, 0, len / 1.6, 1.4], 2)); g.setIndex([0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); fence.push(g); }
      if (r.id === 'fodder-area') for (let i = 0; i < 9; i++) { const hx = x + rr(-20, 20), hz = z + rr(-14, 14), h = H(hx, hz); solid.push(paint(new THREE.ConeGeometry(2.2, 3.2, 10).translate(hx, h + 1.6, hz), (c, X, Y) => c.set('#b59a52').multiplyScalar(0.8 + 0.3 * noise2(X * 3, Y * 5)))); }
      this._sign(scene, [r.name.toUpperCase(), 'NO VISITOR ACCESS'], x - r.r * 1.3 - 2, z, Math.PI / 2, 1.6, 2.6, 1.1, { cyl });
    }
    // benches and lamp posts along walking paths; railings where paths cross water
    this._pathFurniture({ box, cyl, H });
    this.bridgeCount = this._bridges({ box, cyl });
    // re-derive every viewing point against the FINAL walkable grid (gate pillars, cars and placards are now blockers)
    for (const en of L.enclosures) this._viewPoint(en);
    // compound wall between the highway and the zoo (gap at the main entry)
    { const hw = smoothLine(HIGHWAY.pts.map(p => toWorld(...p)), 6); const gate = this.buildings.find(b => b.id === 'main-entry');
      for (let i = 1; i < hw.length; i++) { const [ax, az] = hw[i - 1], [bx, bz] = hw[i], len = Math.hypot(bx - ax, bz - az), nx = (bz - az) / len, nz = -(bx - ax) / len, off = 11;
        const mx = (ax + bx) / 2 + nx * off, mz = (az + bz) / 2 + nz * off; if (Math.hypot(mx - gate.x, mz - gate.z) < 26 || L.isWalkable(mx, mz)) continue;
        box(len + 0.2, 2.6, 0.3, new V3(mx, H(mx, mz) + 0.9, mz), -Math.atan2(bz - az, bx - ax), plaster('#cbb994')); } }
    // parked cars and two-wheelers (procedural sedans, SUVs, hatchbacks, scooters)
    this._parkedVehicles({ H, L, solid, glass, scene });

    // ---------------- merged meshes ----------------
    const posts = postsM.map(p => paint(limb(p.a, p.a.clone().add(new V3(0, p.h, 0)), p.r, p.r * 0.9, 6), C('#3a463e')));
    const solidGeo = merge(solid.concat(posts));
    const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); solidMat.envMapIntensity = 0.4;
    const sm = new THREE.Mesh(solidGeo, solidMat); sm.castShadow = sm.receiveShadow = true; scene.add(sm);
    const chain = chainTex();
    const fm = new THREE.Mesh(merge(fence), new THREE.MeshStandardMaterial({ map: chain, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5, color: '#9aa3a0' }));
    fm.material.alphaToCoverage = true; fm.castShadow = true; fm.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: chain, alphaTest: 0.35 }); scene.add(fm);
    if (net.length) { const nm = new THREE.Mesh(merge(net), fm.material); scene.add(nm); }
    if (glass.length) { const gm = new THREE.Mesh(merge(glass), new THREE.MeshStandardMaterial({ color: '#cfe6ea', transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false })); gm.renderOrder = 3; scene.add(gm); }
    // habitat rocks (instanced, 3 shapes)
    const rg = [rockGeo(1.1), rockGeo(4.7), rockGeo(9.3)], rmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    rg.forEach((g, k) => { const list = rocks.filter((_, i) => i % 3 === k); if (!list.length) return; const im = new THREE.InstancedMesh(g, rmat, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; scene.add(im); });
    this.solid = sm;
    this.finishRoofs(scene);
  }

  _furnish(en, k) {
    const L = this.L, { box, cyl, rocks, H, plaster } = k;
    const inner = insetPoly(en.poly, 3), perches = [];
    const randIn = () => { for (let t = 0; t < 40; t++) { const x = en.cx + rr(-1, 1) * en.r, z = en.cz + rr(-1, 1) * en.r; if (pointInPoly(x, z, inner) && L.water(x, z) < 0.15) return [x, z]; } return [en.cx, en.cz]; };
    const far = () => { // a spot on the far side from the viewing point (for night houses / dens)
      const dx = en.cx - en.view.x, dz = en.cz - en.view.z, l = Math.hypot(dx, dz) || 1; let x = en.cx + dx / l * en.r * 0.55, z = en.cz + dz / l * en.r * 0.55;
      if (!pointInPoly(x, z, inner)) [x, z] = [en.cx, en.cz]; return [x, z, Math.atan2(-dx, -dz)]; };
    const rock = (x, z, s) => rocks.push(mat4(new V3(x, H(x, z) - s * 0.25, z), rr(0, 6.28), new V3(s * rr(0.8, 1.4), s * rr(0.5, 0.9), s * rr(0.8, 1.3))));
    const hab = en.habitat;
    const nRock = { rock: 9, forest: 3, dirt: 2, primate: 2, grass: 1, water: 3, pit: 3, aviary: 0 }[hab] || 0;
    for (let i = 0; i < nRock * Math.max(1, en.r / 15); i++) { const [x, z] = randIn(); rock(x, z, hab === 'pit' ? rr(0.2, 0.5) : rr(0.6, 2.2)); }
    // night shelter / den on the far side
    if (['forest', 'rock', 'dirt', 'grass'].includes(hab) && en.r > 9) {
      const [x, z, yaw] = far(), h = H(x, z);
      if (OPEN_PADDOCK.includes(en.species) || BIG_HERBIVORE.includes(en.species)) {   // thatched shade hut
        const s = BIG_HERBIVORE.includes(en.species) ? 1.7 : 1;
        for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) cyl(new V3(x + ox * s, h - 0.2, z + oz * s), new V3(x + ox * s, h + 2.6 * s, z + oz * s), 0.09 * s, 0.08 * s, '#5c4632', 6);
        k.solid.push(paint(new THREE.ConeGeometry(3.6 * s, 1.8 * s, 10).translate(x, h + 3.4 * s, z), (c, X, Y, Z) => c.set('#a0884e').multiplyScalar(0.75 + 0.35 * noise2(X * 4 + Z, Y * 9))));
      } else {      // masonry night house with dark doorway
        const w = Math.min(7, en.r * 0.5);
        box(w, 2.6, 3.2, new V3(x, h + 1.1, z), yaw, plaster('#b9ac92'));
        box(w + 0.6, 0.25, 3.8, new V3(x, h + 2.5, z), yaw, '#8a8170');
        box(1.2, 1.4, 0.1, new V3(x - Math.sin(yaw) * 1.62, h + 0.7, z - Math.cos(yaw) * 1.62), yaw, '#141210');
      }
    }
    if (hab === 'forest' || hab === 'dirt' || hab === 'rock') for (let i = 0; i < 2; i++) { const [x, z] = randIn(), a = rr(0, 6.28), l = rr(2, 4), h = H(x, z); cyl(new V3(x - Math.cos(a) * l / 2, h + 0.18, z - Math.sin(a) * l / 2), new V3(x + Math.cos(a) * l / 2, h + 0.15, z + Math.sin(a) * l / 2), 0.2, 0.16, '#5a4733', 7); }
    // primate climbing frames: log posts, platforms, ropes. Platforms become perches.
    if (hab === 'primate' || hab === 'aviary') {
      const nPost = hab === 'primate' ? Math.max(3, Math.round(en.r / 4)) : 3, tops = [];
      for (let i = 0; i < nPost; i++) {
        const [x, z] = randIn(), h = H(x, z), ph = hab === 'primate' ? rr(3, 5.5) : rr(2.5, 4.2);
        cyl(new V3(x, h - 0.3, z), new V3(x + rr(-0.3, 0.3), h + ph, z + rr(-0.3, 0.3)), 0.16, 0.12, '#6a5440', 7);
        if (hab === 'primate') { const g = new THREE.CylinderGeometry(1.1, 1.1, 0.12, 12); g.translate(x, h + ph * 0.75, z); k.solid.push(paint(g, C('#7a6248'))); perches.push(new V3(x, h + ph * 0.75 + 0.06, z)); }
        else { // perch branch
          const a = rr(0, 6.28); cyl(new V3(x - Math.cos(a), h + ph * 0.8, z - Math.sin(a)), new V3(x + Math.cos(a), h + ph * 0.8 + 0.2, z + Math.sin(a)), 0.05, 0.04, '#5b4632', 5); perches.push(new V3(x + Math.cos(a) * 0.5, h + ph * 0.8 + 0.13, z + Math.sin(a) * 0.5));
        }
        tops.push(new V3(x, h + ph * 0.92, z));
      }
      for (let i = 1; i < tops.length; i++) cyl(tops[i - 1], tops[i], 0.03, 0.03, '#b49a6a', 4);   // ropes
    }
    this.perches.set(en.id, perches);
    en.perches = perches;
  }

  _sign(scene, lines, x, z, yaw, w, postH, h, k) {
    const tex = textTexture(lines, { w: 512, h: Math.round(512 * h / w), font: k.small ? 'bold 64px Georgia, serif' : 'bold 58px Georgia, serif' });
    const y = this.L.heightAt(x, z);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }));
    m.position.set(x, y + postH, z); m.rotation.y = yaw; m.castShadow = true;
    scene.add(m); this.signs.push(m);
    const sx = Math.cos(yaw) * w * 0.42, sz = -Math.sin(yaw) * w * 0.42;
    for (const s of [-1, 1]) k.cyl(new V3(x + sx * s, y - 0.2, z + sz * s), new V3(x + sx * s, y + postH + h / 2, z + sz * s), 0.05, 0.05, '#4a3826', 6);
  }

  /**
   * Main entrance, modelled on the supplied photograph: dark stone pillars, ornamental black
   * metal gates (shown open), a long black granite boundary wall with "INDIRA GANDHI /
   * ZOOLOGICAL PARK" in raised gold letters on its road-facing side, and trimmed hedges.
   */
  _mainEntrance(b, k) {
    const { box, cyl, scene, plaster } = k, L = this.L, H = (x, z) => L.heightAt(x, z);
    const yaw = b.rot || 0, cx = b.wx, cz = b.wz, h = H(cx, cz);
    const o = new V3(Math.cos(yaw), 0, -Math.sin(yaw)), f = new V3(Math.sin(yaw), 0, Math.cos(yaw));   // o: along the gate line, f: into the zoo
    const P = (along, up, fwd = 0) => new V3(cx + o.x * along + f.x * fwd, h + up, cz + o.z * along + f.z * fwd);
    const half = 4.2, granite = (c, x, y, z) => c.set('#1c1c1b').multiplyScalar(0.8 + 0.35 * noise2(x * 3 + z * 3, y * 3)).lerp(C('#2c2b29'), Math.abs(Math.sin((x * o.x + z * o.z) * 1.6)) < 0.04 ? 0.6 : 0);
    // pillars
    for (const s of [-1, 1]) {
      box(1.3, 3.5, 1.3, P(s * (half + 0.65), 1.55), yaw, granite); box(1.55, 0.25, 1.55, P(s * (half + 0.65), 3.38), yaw, '#3a3936');
      L.block(P(s * (half + 0.65), 0).x, P(s * (half + 0.65), 0).z, 1.0);
    }
    // ornamental gate leaves, swung open into the zoo
    for (const s of [-1, 1]) {
      const hinge = P(s * half, 0), ang = s * 1.25, dir = new V3(-o.x * s, 0, -o.z * s).applyAxisAngle(UP, ang), len = half - 0.1;
      const at = (t, y) => hinge.clone().addScaledVector(dir, len * t).add(new V3(0, y, 0));
      const top = t => 2.1 + 0.55 * Math.sin(Math.PI * 0.5 * t);     // leaves rise toward the centre -> arch when closed
      for (const y of [0.15, 1.0]) cyl(at(0, y), at(1, y), 0.035, 0.035, '#111111', 5);
      for (let t = 0; t <= 1.0001; t += 0.05) cyl(at(t, 0.1), at(t, top(t)), 0.016, 0.016, '#121212', 4);
      for (let t = 0; t < 1; t += 0.1) cyl(at(t, top(t)), at(t + 0.1, top(t + 0.1)), 0.03, 0.03, '#111111', 5);
      for (const t of [0.25, 0.5, 0.75]) { const m = at(t, 1.45), g = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 14); g.rotateX(Math.PI / 2); g.applyMatrix4(mat4(m, Math.atan2(dir.x, dir.z) + Math.PI / 2)); k.solid.push(paint(g, C('#b8892c'))); }
      for (let t = 0.1; t <= 1; t += 0.3) { const p = at(t, 0); L.blockers.push({ x: p.x, z: p.z, r: 0.35 }); }
    }
    // long granite boundary wall to the right of the gate, short return to the left
    const wallRun = (a0, a1, hgt) => {
      const len = a1 - a0, mid = (a0 + a1) / 2;
      box(len, hgt + 0.6, 0.6, P(mid, hgt / 2 - 0.3), yaw, granite);
      box(len + 0.1, 0.14, 0.72, P(mid, hgt + 0.02), yaw, '#3b3a37');
      for (let a = a0 + 0.5; a < a1; a += 1.2) L.block(P(a, 0).x, P(a, 0).z, 0.6);
    };
    wallRun(half + 1.3, half + 1.3 + 26, 2.5);
    wallRun(-(half + 1.3 + 9), -(half + 1.3), 2.2);
    // raised gold lettering fixed to the road-facing (outer) face of the wall, as in the photograph
    const CW = 2048, CH = 210, cv = document.createElement('canvas'); cv.width = CW; cv.height = CH; const g = cv.getContext('2d');
    g.font = 'bold 92px Georgia, "Times New Roman", serif'; g.textBaseline = 'middle';
    const gold = g.createLinearGradient(0, 0, 0, CH); gold.addColorStop(0, '#f6dc8e'); gold.addColorStop(0.5, '#c9973a'); gold.addColorStop(1, '#8a6420');
    // staggered two lines, like the real wall: "INDIRA GANDHI" upper left, "ZOOLOGICAL PARK" lower right
    for (const [txt, x, y] of [['INDIRA  GANDHI', 120, 58], ['ZOOLOGICAL  PARK', 760, 152]]) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(txt, x + 5, y + 6); g.fillStyle = gold; g.fillText(txt, x, y); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const signW = 21, sign = new THREE.Mesh(new THREE.PlaneGeometry(signW, signW * CH / CW), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.08, metalness: 0.75, roughness: 0.32, polygonOffset: true, polygonOffsetFactor: -4 }));
    sign.position.copy(P(half + 1.3 + 1.5 + signW / 2, 1.62, -0.32)); sign.rotation.y = yaw + Math.PI;     // outer face, facing the approach road
    sign.name = 'entrance-sign'; scene.add(sign); this.signs.push(sign); this.entranceSign = sign;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), new THREE.MeshStandardMaterial({ map: textTexture(['IGZP', 'VISAKHAPATNAM'], { w: 256, h: 340, bg: '#e9e6dd', fg: '#2a2a2a', border: '#bbb', font: 'bold 40px Georgia' }), polygonOffset: true, polygonOffsetFactor: -4 }));
    plaque.position.copy(P(half + 0.65, 1.9, -0.67)); plaque.rotation.y = yaw + Math.PI; scene.add(plaque);

    // Realistic leafy hedges with dense foliage cards, organic jagged contours, and bougainvillea blossoms
    const hedgeBaseCol = (c, x, y, z) => c.set('#3a5c20').multiplyScalar(0.72 + 0.45 * noise2(x * 3.8 + z * 3.2, y * 5.5)).lerp(C('#6e9632'), clamp(noise2(x * 8.5 + 3.1, z * 8.5 + y * 4.2), 0, 1) * 0.4);

    // Double-sided organic foliage card (creased diamond leaf quad)
    const makeFoliageCard = (pos, w, h, yawA, pitch, roll, colA, colB) => {
      const hw = w * 0.5, hh = h * 0.5;
      const g = new THREE.BufferGeometry();
      const P0 = [
        -hw, 0, -hh * 0.25,   hw, 0, -hh * 0.25,   0, hh, 0,
        -hw, 0, -hh * 0.25,   0, hh, 0,           0, -hh * 0.7, 0,
        0, hh, 0,           hw, 0, -hh * 0.25,   0, -hh * 0.7, 0
      ];
      const P_all = [];
      for (let i = 0; i < P0.length; i += 9) {
        P_all.push(P0[i], P0[i+1], P0[i+2], P0[i+3], P0[i+4], P0[i+5], P0[i+6], P0[i+7], P0[i+8]);
        P_all.push(P0[i+6], P0[i+7], P0[i+8], P0[i+3], P0[i+4], P0[i+5], P0[i], P0[i+1], P0[i+2]);
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(P_all, 3));
      g.computeVertexNormals();
      g.applyMatrix4(mat4(pos, yawA, 1, pitch, roll));
      return paint(g, (c, x, y, z) => {
        const t = clamp((y - pos.y) / h + 0.5, 0, 1);
        c.copy(colA).lerp(colB, t);
      });
    };

    // Bougainvillea blossom head (3 papery radiating bracts + center ivory floret)
    const makeBougainvilleaBlossom = (pos, scale, yawA, pitch, roll) => {
      const g = new THREE.BufferGeometry();
      const R = 0.15 * scale;
      const P_bracts = [];
      const cMagenta = new THREE.Color('#d81b60');
      const cFuchsia = new THREE.Color('#c2185b');
      const cHighlight = new THREE.Color('#ff4081');
      const cCenter = new THREE.Color('#fffde7');

      for (let b = 0; b < 3; b++) {
        const ang = (b / 3) * Math.PI * 2;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);
        const cosR = Math.cos(ang + Math.PI / 2), sinR = Math.sin(ang + Math.PI / 2);
        const tipX = cosA * R, tipZ = sinA * R, tipY = R * 0.35;
        const sideW = R * 0.45;
        const r1X = cosA * R * 0.5 + cosR * sideW, r1Z = sinA * R * 0.5 + sinR * sideW;
        const r2X = cosA * R * 0.5 - cosR * sideW, r2Z = sinA * R * 0.5 - sinR * sideW;

        const tri1 = [0, 0, 0,  r1X, R * 0.15, r1Z,  tipX, tipY, tipZ];
        const tri2 = [0, 0, 0,  tipX, tipY, tipZ,  r2X, R * 0.15, r2Z];
        const addTri = (t) => {
          P_bracts.push(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
          P_bracts.push(t[6], t[7], t[8], t[3], t[4], t[5], t[0], t[1], t[2]);
        };
        addTri(tri1); addTri(tri2);
      }

      // Small center floret
      const fr = R * 0.2;
      P_bracts.push(-fr, 0, -fr,  fr, 0, -fr,  0, fr * 1.4, 0);
      P_bracts.push(fr, 0, -fr,  fr, 0, fr,   0, fr * 1.4, 0);
      P_bracts.push(fr, 0, fr,  -fr, 0, fr,   0, fr * 1.4, 0);
      P_bracts.push(-fr, 0, fr, -fr, 0, -fr,  0, fr * 1.4, 0);

      g.setAttribute('position', new THREE.Float32BufferAttribute(P_bracts, 3));
      g.computeVertexNormals();
      g.applyMatrix4(mat4(pos, yawA, 1, pitch, roll));

      return paint(g, (c, x, y, z) => {
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d < R * 0.28 && (y - pos.y) > 0) {
          c.copy(cCenter);
        } else {
          const v = clamp((d / (R * 1.1)), 0, 1);
          c.copy(cFuchsia).lerp(cMagenta, v).lerp(cHighlight, (noise2(x * 12, z * 12) > 0.6 ? 0.35 : 0));
        }
      });
    };

    const colDarkGreen = new THREE.Color('#1f3612');
    const colMidGreen = new THREE.Color('#467524');
    const colBrightGreen = new THREE.Color('#7cb834');
    const colTipLime = new THREE.Color('#9cdb3f');

    for (const [a0, a1, off] of [[half + 1.6, half + 1.6 + 25, -1.5], [-(half + 1.6 + 8), -(half + 1.6), -1.5]]) {
      // 1. Organic jagged contour clusters
      for (let a = a0; a < a1; a += 0.55) {
        const pMid = a + 0.275;
        const hgt = 0.95 + 0.22 * Math.sin(a * 0.9) + 0.15 * noise2(a * 2.3, off * 4);
        const wd = 1.15 + 0.18 * noise2(a * 1.7, 9.2);
        const p = P(pMid + rr(-0.04, 0.04), hgt * 0.45, off + rr(-0.04, 0.04));

        const g2 = new THREE.IcosahedronGeometry(0.52, 1);
        const pa = g2.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const vx = pa.getX(i), vy = pa.getY(i), vz = pa.getZ(i);
          const disp = 1.0 + 0.26 * (noise2(vx * 6 + a * 2, vz * 6 + vy * 3) - 0.5);
          pa.setXYZ(i, vx * disp * wd, vy * disp * hgt, vz * disp * wd);
        }
        g2.computeVertexNormals();
        g2.translate(p.x, p.y, p.z);
        k.solid.push(paint(g2, hedgeBaseCol));
      }

      // 2. Dense foliage cards
      for (let a = a0 + 0.15; a < a1 - 0.15; a += 0.28) {
        const hgt = 0.95 + 0.22 * Math.sin(a * 0.9) + 0.15 * noise2(a * 2.3, off * 4);
        const nCards = rand() < 0.6 ? 3 : 2;
        for (let ci = 0; ci < nCards; ci++) {
          const cardPos = P(a + rr(-0.1, 0.1), hgt * rr(0.35, 1.02), off + rr(-0.55, 0.35));
          const cardYaw = yaw + rr(-1.5, 1.5);
          const cardPitch = rr(-0.4, 0.65);
          const cardRoll = rr(-0.5, 0.5);
          const cw = rr(0.32, 0.46), ch = rr(0.28, 0.40);
          const cBottom = rand() < 0.5 ? colDarkGreen : colMidGreen;
          const cTop = rand() < 0.5 ? colBrightGreen : colTipLime;
          k.solid.push(makeFoliageCard(cardPos, cw, ch, cardYaw, cardPitch, cardRoll, cBottom, cTop));
        }
      }

      // 3. Bougainvillea blossoms
      for (let a = a0 + 0.2; a < a1 - 0.2; a += 0.35) {
        if (noise2(a * 0.8, off * 3.5 + 7.1) > 0.28) {
          const nBlossoms = Math.floor(rr(2, 5));
          for (let bi = 0; bi < nBlossoms; bi++) {
            const hgt = 0.95 + 0.22 * Math.sin(a * 0.9) + 0.15 * noise2(a * 2.3, off * 4);
            const bPos = P(a + rr(-0.16, 0.16), hgt * rr(0.65, 1.1), off + rr(-0.55, 0.25));
            const bYaw = yaw + rr(-Math.PI, Math.PI);
            const bPitch = rr(-0.35, 0.5);
            const bRoll = rr(-0.4, 0.4);
            const bScale = rr(0.85, 1.25);
            k.solid.push(makeBougainvilleaBlossom(bPos, bScale, bYaw, bPitch, bRoll));
          }
        }
      }
    }

    // ---------------- Ticket Counter Kiosk at the main entrance forecourt ----------------
    const tcAlong = -(half + 4.8), tcOff = -4.2;
    const tcPos = P(tcAlong, 0, tcOff);
    const tcYaw = yaw + Math.PI; // faces outward toward the visitor approach forecourt
    const tcW = 4.4, tcD = 2.8, tcH = 3.1;
    const tcAt = (r, y, fwd) => {
      const fwdVec = new V3(Math.sin(tcYaw), 0, Math.cos(tcYaw));
      const rightVec = new V3(Math.cos(tcYaw), 0, -Math.sin(tcYaw));
      return new V3(tcPos.x + rightVec.x * r + fwdVec.x * fwd, tcPos.y + y, tcPos.z + rightVec.z * r + fwdVec.z * fwd);
    };

    // Stone plinth
    box(tcW + 0.4, 0.3, tcD + 0.4, tcAt(0, 0.15, 0), tcYaw, '#5c5850');
    // Heritage cream walls
    box(tcW, tcH, tcD, tcAt(0, tcH * 0.5 + 0.25, 0), tcYaw, plaster('#e8dfce'));
    // Teakwood wall trim
    box(tcW + 0.06, 0.2, tcD + 0.06, tcAt(0, tcH + 0.15, 0), tcYaw, '#4a3525');

    // Service counter openings on the approach-facing front
    box(1.3, 1.2, 0.12, tcAt(-1.1, 1.6, tcD * 0.5 + 0.02), tcYaw, '#1c2224');
    box(1.3, 1.2, 0.12, tcAt(1.1, 1.6, tcD * 0.5 + 0.02), tcYaw, '#1c2224');
    // Service counter ledge (polished dark granite)
    box(3.8, 0.12, 0.55, tcAt(0, 1.02, tcD * 0.5 + 0.22), tcYaw, '#222220');
    // Brass ticket service grilles & divider
    cyl(tcAt(-1.1, 1.05, tcD * 0.5 + 0.05), tcAt(-1.1, 2.15, tcD * 0.5 + 0.05), 0.025, 0.025, '#c5a044', 5);
    cyl(tcAt(1.1, 1.05, tcD * 0.5 + 0.05), tcAt(1.1, 2.15, tcD * 0.5 + 0.05), 0.025, 0.025, '#c5a044', 5);
    cyl(tcAt(0, 1.05, tcD * 0.5 + 0.05), tcAt(0, 2.2, tcD * 0.5 + 0.05), 0.04, 0.04, '#4a3525', 6);

    // Terracotta overhanging roof / awning protecting visitors from sun
    box(tcW + 1.0, 0.18, tcD + 1.2, tcAt(0, tcH + 0.35, 0.3), tcYaw, '#9e4732', 0.08);

    // High-resolution signboard above the ticket counter
    const tcSignW = 3.6, tcSignH = 0.85;
    const tcTex = textTexture([
      'INDIRA GANDHI ZOOLOGICAL PARK',
      'TICKETS & TOUR SELECTION',
      '• WALKING TOUR  • RENTAL BICYCLE  • SAFARI TRAM •'
    ], { w: 1024, h: 256, bg: '#1c3622', fg: '#f4e8c6', border: '#b89438', font: 'bold 44px Georgia, serif' });
    const tcSign = new THREE.Mesh(
      new THREE.PlaneGeometry(tcSignW, tcSignH),
      new THREE.MeshStandardMaterial({ map: tcTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3 })
    );
    tcSign.position.copy(tcAt(0, tcH - 0.2, tcD * 0.5 + 0.08));
    tcSign.rotation.y = tcYaw;
    scene.add(tcSign);
    this.signs.push(tcSign);

    // Queue stanchions: 4 brass posts with crimson velvet ropes in front of counter
    for (const r of [-1.5, -0.5, 0.5, 1.5]) {
      const sp = tcAt(r, 0.25, tcD * 0.5 + 1.4);
      cyl(sp, sp.clone().add(new V3(0, 0.9, 0)), 0.035, 0.035, '#c5a044', 6);
      const cap = new THREE.SphereGeometry(0.065, 8, 6);
      cap.translate(sp.x, sp.y + 0.93, sp.z);
      k.solid.push(paint(cap, C('#d4af37')));
    }
    for (const [rA, rB] of [[-1.5, -0.5], [0.5, 1.5]]) {
      const pA = tcAt(rA, 1.05, tcD * 0.5 + 1.4), pB = tcAt(rB, 1.05, tcD * 0.5 + 1.4);
      const mid = pA.clone().lerp(pB, 0.5).add(new V3(0, -0.15, 0));
      cyl(pA, mid, 0.022, 0.022, '#991b2c', 5);
      cyl(mid, pB, 0.022, 0.022, '#991b2c', 5);
    }

    // Ticket clerk bust / attendant inside the booth
    const clerkPos = tcAt(0, 1.05, tcD * 0.5 - 0.4);
    box(0.5, 0.65, 0.25, clerkPos.clone().add(new V3(0, 0.4, 0)), tcYaw, '#d2b48c'); // khaki staff shirt
    const clerkHead = new THREE.SphereGeometry(0.14, 8, 8);
    clerkHead.translate(clerkPos.x, clerkPos.y + 0.85, clerkPos.z);
    k.solid.push(paint(clerkHead, C('#8d5524')));
    const clerkCap = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 8);
    clerkCap.translate(clerkPos.x, clerkPos.y + 0.98, clerkPos.z);
    k.solid.push(paint(clerkCap, C('#234a2e')));

    // Obstacle block for ticket booth walls (leaves the counter area in front walkable)
    L.block(tcPos.x, tcPos.z, 1.8);

    this.entrance = { gate: P(0, 0), outward: f.clone().negate(), sign, ticketCounter: tcPos };
    this.ticketCounter = { x: tcPos.x, z: tcPos.z, r: 6.5 };
  }

  /** Bridge decks, piers and rails wherever a public route crosses water. Deck height = layers.walkHeight. */
  _bridges({ box, cyl }) {
    const L = this.L; let count = 0;
    this.bridgeRuns = [];
    for (const p of PATHS.concat(ROADS)) {
      const pts = smoothLine(p.pts.map(q => toWorld(...q)), 8), samples = [];
      for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az); for (let d = 0; d < len; d += 0.8) samples.push([ax + (bx - ax) * d / len, az + (bz - az) * d / len]); }
      let run = [];
      const flush = () => {
        if (run.length > 2) {
          // extend 2 samples onto dry land at both ends so the deck meets the path
          const deck = run, w = p.width + 0.6, isRoad = p.width >= 6;
          for (let i = 1; i < deck.length; i++) {
            const [ax, az] = deck[i - 1], [bx, bz] = deck[i], ya = L.walkHeight(ax, az), yb = L.walkHeight(bx, bz), len = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax);
            box(len + 0.05, 0.28, w, new V3((ax + bx) / 2, (ya + yb) / 2 - 0.14, (az + bz) / 2), yaw, isRoad ? '#8f8a80' : (c, x, y, z) => c.set('#7a5c3e').multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin((x + z) * 9))), 0, Math.atan2(yb - ya, len));
            const nx = -(bz - az) / len, nz = (bx - ax) / len;
            for (const s of [-1, 1]) {
              const qa = new V3(ax + nx * s * w / 2, ya, az + nz * s * w / 2), qb = new V3(bx + nx * s * w / 2, yb, bz + nz * s * w / 2);
              cyl(qa.clone().add(new V3(0, 1.0, 0)), qb.clone().add(new V3(0, 1.0, 0)), 0.035, 0.035, isRoad ? '#c9c4b8' : '#6a4a30', 5);
              cyl(qa.clone().add(new V3(0, 0.5, 0)), qb.clone().add(new V3(0, 0.5, 0)), 0.025, 0.025, isRoad ? '#c9c4b8' : '#6a4a30', 5);
              if (i % 3 === 0) cyl(qa.clone().add(new V3(0, -0.1, 0)), qa.clone().add(new V3(0, 1.05, 0)), 0.05, 0.05, isRoad ? '#bdb8ad' : '#5a3e28', 6);
              if (i % 7 === 0 && L.water(ax, az) > 0.4) cyl(qa.clone().add(new V3(-nx * s * 0.6, -0.15, -nz * s * 0.6)), new V3(qa.x - nx * s * 0.6, -2.4, qa.z - nz * s * 0.6), 0.16, 0.2, '#7d776c', 8);
            }
          }
          this.bridgeRuns.push({ path: p.id, from: deck[0], to: deck[deck.length - 1], n: deck.length, pts: deck.slice() }); count++;
        }
        run = [];
      };
      samples.forEach(([x, z], i) => {
        if (L.sample(L.bridgeMask, x, z) > 0.3) { if (!run.length) { for (let k2 = Math.max(0, i - 3); k2 < i; k2++) run.push(samples[k2]); } run.push([x, z]); }
        else if (run.length) { for (let k2 = i; k2 < Math.min(samples.length, i + 3); k2++) run.push(samples[k2]); flush(); }
      });
      flush();
    }
    return count;
  }

  _building(b, k) {
    const { box, cyl, H, plaster, stone, scene } = k, L = this.L;
    if (b.id === 'main-entry') { this._mainEntrance(b, k); return; }
    if (b.kind === 'gate') {      // twin stone pillars and an arch over the entrance way
      const h = H(b.wx, b.wz), yaw = b.rot || 0, cx = b.wx, cz = b.wz, ox = Math.cos(yaw), oz = -Math.sin(yaw), span = b.id === 'main-entry' ? 7 : 5;
      for (const s of [-1, 1]) {
        const px = cx + ox * span * s, pz = cz + oz * span * s;
        box(2.0, 7.2, 2.0, new V3(px, h + 3.4, pz), yaw, stone); box(2.4, 0.5, 2.4, new V3(px, h + 7.2, pz), yaw, '#9a8c76');
        L.block(px, pz, 1.6);
        for (const t of [0.4, 1]) box(1.2, 4, 1.2, new V3(px + ox * s * (2 + t * 1.8), h + 1.8 * t, pz + oz * s * (2 + t * 1.8)), yaw, stone); // flanking wing walls
        L.block(px + ox * s * 3, pz + oz * s * 3, 1.4);
      }
      box(span * 2 + 2.4, 1.0, 1.4, new V3(cx, h + 6.4, cz), yaw, '#8e806b');
      const lines = b.id === 'main-entry' ? ['INDIRA GANDHI ZOOLOGICAL PARK', 'VISAKHAPATNAM'] : ['SAGAR GATE'];
      const tex = textTexture(lines, { w: 1024, h: 200, bg: '#2f4a2c', fg: '#f4e7c4', border: '#1d2e1b', font: 'bold 74px Georgia, serif' });
      // board mounted on BOTH faces of the beam: each plane sits 2 cm proud of the face it belongs to
      // and faces away from the beam (the old code put the +fwd board on the -fwd face, facing inward).
      for (const side of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 + 1.6, (span * 2 + 1.6) * 200 / 1024), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.position.set(cx + Math.sin(yaw) * 0.72 * side, h + 6.4, cz + Math.cos(yaw) * 0.72 * side); m.rotation.y = yaw + (side < 0 ? Math.PI : 0); scene.add(m); this.signs.push(m);
      }
      return;
    }
    const x = b.x, z = b.z, yaw = b.yaw, h0 = H(x, z);
    const fwd = new V3(Math.sin(yaw), 0, Math.cos(yaw)), right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
    const at = (r, y, f) => new V3(x + right.x * r + fwd.x * f, h0 + y, z + right.z * r + fwd.z * f);
    const st = {
      ticket: { w: 6, d: 4, h: 3.2, wall: '#e7dcc2', roof: 'flat' }, office: { w: 13, d: 8, h: 3.6, wall: '#e9e1cc', roof: 'hip' },
      hospital: { w: 16, d: 9, h: 3.8, wall: '#eef0ea', roof: 'flat', trim: '#3d7a5a' }, shed: { w: 12, d: 7, h: 3.6, wall: null, roof: 'shed' },
      aquarium: { w: 15, d: 11, h: 5, wall: '#a9c9cf', roof: 'hip', trim: '#2f6070' }, house: { w: 14, d: 9, h: 4.4, wall: '#d9cdb0', roof: 'hip' },
      canteen: { w: 12, d: 8, h: 3.6, wall: '#f0e2c0', roof: 'hip', open: true }, shop: { w: 12, d: 7, h: 3.6, wall: '#e9d6b2', roof: 'hip', awning: true },
    }[b.kind];
    if (b.kind === 'garden') {   // butterfly park pergola + sign
      for (const s of [-1, 1]) cyl(at(s * 2, -0.2, 0), at(s * 2, 3, 0), 0.12, 0.12, '#6a5440', 6);
      box(5, 0.25, 0.4, at(0, 3, 0), yaw, '#6a5440');
      this._sign(scene, ['BUTTERFLY PARK'], x, z, yaw, 3.2, 3.8, 0.7, { cyl });
      return;
    }
    if (!st) return;
    if (b.id === 'nocturnal-house') st.wall = '#6e7468';
    if (b.id === 'reptile-house') st.wall = '#a7b385';
    if (b.id === 'bioscope') st.wall = '#d8b27c';
    const { w, d, h } = st;
    box(w + 0.6, 0.5, d + 0.6, at(0, 0.0, 0), yaw, '#9a9080');                         // plinth
    if (st.wall) box(w, h, d, at(0, h / 2 + 0.2, 0), yaw, plaster(st.wall));
    else for (const [r, f] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) cyl(at(r, 0, f), at(r, h, f), 0.12, 0.12, '#5a5f60', 6);
    if (st.trim) box(w + 0.05, 0.4, d + 0.05, at(0, h - 0.1, 0), yaw, st.trim);
    // windows and door on the path-facing side
    if (st.wall) {
      for (let r = -w / 2 + 1.6; r < w / 2 - 1; r += 2.4) if (Math.abs(r) > 1.3) box(1.2, 1.2, 0.12, at(r, h * 0.55, d / 2 + 0.03), yaw, '#2a3133');
      box(1.6, 2.3, 0.14, at(0, 1.35, d / 2 + 0.04), yaw, st.open ? '#3a2e24' : '#4a3424');
    }
    if (st.roof === 'hip') {
      const g = new THREE.ConeGeometry(1, 1, 4, 1); g.rotateY(Math.PI / 4); g.scale((w / 2 + 0.8) / 0.707, 2.2, (d / 2 + 0.8) / 0.707);
      g.applyMatrix4(mat4(at(0, h + 0.2 + 1.1, 0), yaw)); k.solid.push(paint(g, (c, X, Y, Z) => c.set('#9c4f36').multiplyScalar(0.8 + 0.25 * noise2(X * 2 + Z, Y * 6))));
    } else if (st.roof === 'shed') {
      box(w + 1, 0.15, d + 1, at(0, h + 0.3, 0), yaw, '#7f8a8c', 0.08);
      for (let i = 0; i < 2; i++) { const p = at(-2 + i * 4, 0, 0); box(1.4, 1.2, 2.6, p.add(new V3(0, 0.8, 0)), yaw, '#e8e8e2'); box(1.5, 0.08, 2.4, at(-2 + i * 4, 1.9, 0), yaw, '#3f7a4a'); } // battery-operated vehicles
    } else { box(w + 0.8, 0.3, d + 0.8, at(0, h + 0.35, 0), yaw, '#cfc6b2'); }
    if (st.awning) box(w, 0.1, 2.2, at(0, h * 0.75, d / 2 + 1.1), yaw, (c, X, Y, Z) => c.set(Math.sin((X + Z) * 2.4) > 0 ? '#c23b2e' : '#efe6d6'), 0.25);
    if (st.open) for (let i = 0; i < 4; i++) { const p = at(-4 + i * 2.7, 0, d / 2 + 3.2); cyl(p, p.clone().add(new V3(0, 0.75, 0)), 0.05, 0.05, '#555', 5); const t = new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12); t.translate(p.x, p.y + 0.78, p.z); k.solid.push(paint(t, C('#e8e2d0'))); }
    // name board above the door
    const nameTex = textTexture([b.name.toUpperCase()], { w: 1024, h: 160, bg: '#304f2e', fg: '#f1e4bf', border: '#203520', font: 'bold 70px Georgia, serif' });
    const sw = Math.min(w * 0.85, 9), sign = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * 160 / 1024), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.7 }));
    sign.position.copy(at(0, st.wall ? h * 0.86 : h + 0.9, d / 2 + 0.12)); sign.rotation.y = yaw; scene.add(sign); this.signs.push(sign);
  }

  _amenity(a, k) {
    const { box, cyl, H, plaster } = k, x = a.x, z = a.z, yaw = a.yaw, h = H(x, z);
    const fwd = new V3(Math.sin(yaw), 0, Math.cos(yaw));
    if (a.kind === 'toilet') { box(4.4, 3, 3.2, new V3(x, h + 1.3, z), yaw, plaster('#e5e1d6')); box(4.8, 0.25, 3.6, new V3(x, h + 2.9, z), yaw, '#4d6f8a'); box(1, 2, 0.1, new V3(x + fwd.x * 1.62, h + 1, z + fwd.z * 1.62), yaw, '#3a4f63'); this._sign(this.scene, ['TOILETS'], x + fwd.x * 1.75, z + fwd.z * 1.75, yaw, 1.4, 2.5, 0.35, { cyl, small: true }); }
    else if (a.kind === 'ro') { box(1.3, 1.6, 0.9, new V3(x, h + 0.8, z), yaw, '#2f78b8'); box(1.4, 0.1, 1, new V3(x, h + 1.65, z), yaw, '#dfe8ee'); }
    else if (a.kind === 'icecream' || a.kind === 'souvenir') { box(2.4, 2.4, 2, new V3(x, h + 1.2, z), yaw, a.kind === 'icecream' ? '#f1c6d4' : '#e2c28e'); box(2.8, 0.12, 2.6, new V3(x + fwd.x * 0.4, h + 2.55, z + fwd.z * 0.4), yaw, (c, X, Y, Z) => c.set(Math.sin((X + Z) * 3) > 0 ? '#d8456e' : '#fbf1f4')); }
    else if (a.kind === 'pagoda') {
      for (let i = 0; i < 6; i++) { const t = i / 6 * 6.28; cyl(new V3(x + Math.cos(t) * 2.4, h - 0.2, z + Math.sin(t) * 2.4), new V3(x + Math.cos(t) * 2.4, h + 2.7, z + Math.sin(t) * 2.4), 0.1, 0.1, '#7a3b2a', 6); }
      const r = new THREE.ConeGeometry(3.3, 1.7, 6); r.translate(x, h + 3.5, z);
      this._roofs = this._roofs || []; this._roofs.push(paint(r, C('#8f3b2b')));
      const base = new THREE.CylinderGeometry(2.9, 3.0, 0.3, 6); base.translate(x, h + 0.05, z); this._roofs.push(paint(base, C('#a9a090')));
      const bench = new THREE.TorusGeometry(1.8, 0.12, 4, 6, 4); bench.rotateX(Math.PI / 2); bench.translate(x, h + 0.5, z); this._roofs.push(paint(bench, C('#6a4a32')));
    }
  }
  _pathFurniture({ box, cyl, H }) {
    const L = this.L;
    for (const p of PATHS.concat(ROADS)) {
      const pts = smoothLine(p.pts.map(q => toWorld(...q)), 5);
      let acc = 0, nextBench = rr(20, 40), nextLamp = rr(10, 30);
      for (let i = 1; i < pts.length; i++) {
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len, yaw = -Math.atan2(bz - az, bx - ax);
        for (let d = 0; d < len; d += 2) {
          const x = ax + (bx - ax) * d / len, z = az + (bz - az) * d / len, s = acc + d;
          if (s > nextBench) { nextBench += rr(45, 80); const sd = rand() < 0.5 ? -1 : 1, off = p.width / 2 + 1.6, qx = x + nx * sd * off, qz = z + nz * sd * off;
            if (!L.isWalkable(qx, qz) && L.water(qx, qz) < 0.1 && L.maskAt(qx, qz)[2] < 0.1) { const h = H(qx, qz); (this.benches = this.benches || []).push({ x: qx, z: qz, face: Math.atan2(-nx * sd, -nz * sd) }); box(1.8, 0.08, 0.5, new V3(qx, h + 0.45, qz), yaw, '#7a5a3a'); box(1.8, 0.4, 0.06, new V3(qx + nx * sd * 0.25, h + 0.7, qz + nz * sd * 0.25), yaw, '#7a5a3a'); for (const e of [-0.75, 0.75]) box(0.12, 0.45, 0.45, new V3(qx + (bx - ax) / len * e, h + 0.22, qz + (bz - az) / len * e), yaw, '#8c867a'); } }
          if (s > nextLamp) { nextLamp += rr(38, 55); const sd = rand() < 0.5 ? -1 : 1, off = p.width / 2 + 0.8, qx = x + nx * sd * off, qz = z + nz * sd * off;
            if (!L.isWalkable(qx, qz) && L.water(qx, qz) < 0.1) { const h = H(qx, qz); cyl(new V3(qx, h - 0.2, qz), new V3(qx, h + 4.2, qz), 0.07, 0.05, '#33403a', 6); box(0.7, 0.12, 0.25, new V3(qx - nx * sd * 0.3, h + 4.2, qz - nz * sd * 0.3), yaw + Math.PI / 2, '#2c3530'); } }
        }
        acc += len;
      }
    }
  }
  _parkedVehicles(k) {
    const { H, L, scene, glass } = k;
    const [px, pz] = toWorld(108, 246);
    const carParts = [];
    const cBox = (w, h, d, pos, yaw, col, pitch = 0, roll = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.applyMatrix4(mat4(pos, yaw, 1, pitch, roll));
      carParts.push(paint(g, typeof col === 'function' ? col : C(col)));
    };
    const cCyl = (a, b, r0, r1, col, radial = 8) => {
      carParts.push(paint(limb(a, b, r0, r1, radial), typeof col === 'function' ? col : C(col)));
    };
    const gBox = (w, h, d, pos, yaw, pitch = 0, roll = 0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.applyMatrix4(mat4(pos, yaw, 1, pitch, roll));
      glass.push(g);
    };

    function localToWorld(cx, cy, cz, yaw, lx, ly, lz) {
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      return new V3(cx + lx * cos + lz * sin, cy + ly, cz - lx * sin + lz * cos);
    }

    function buildWheel(pt, yaw, lx, ly, lz, r, w, rimCol = '#c5cbd0') {
      const pA = pt(lx - w / 2, ly, lz), pB = pt(lx + w / 2, ly, lz);
      cCyl(pA, pB, r, r, '#151515', 10);
      const pRA = pt(lx - w * 0.52, ly, lz), pRB = pt(lx + w * 0.52, ly, lz);
      cCyl(pRA, pRB, r * 0.62, r * 0.62, rimCol, 8);
      cCyl(pRA, pRB, r * 0.22, r * 0.22, '#181818', 6);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        const spkA = pt(lx + (lx > 0 ? w * 0.48 : -w * 0.48), ly, lz);
        const spkB = pt(lx + (lx > 0 ? w * 0.52 : -w * 0.52), ly + Math.sin(a) * r * 0.52, lz + Math.cos(a) * r * 0.52);
        cCyl(spkA, spkB, 0.015, 0.015, rimCol, 4);
      }
    }

    function buildSedan(wx, wz, wy, yaw, paintCol, rimCol = '#c2c8cd') {
      const pt = (lx, ly, lz) => localToWorld(wx, wy, wz, yaw, lx, ly, lz);
      cBox(1.60, 0.08, 4.0, pt(0, 0.22, 0), yaw, '#1c1c1c');
      cBox(0.08, 0.16, 2.6, pt(-0.86, 0.26, 0), yaw, '#181818');
      cBox(0.08, 0.16, 2.6, pt(0.86, 0.26, 0), yaw, '#181818');
      cBox(1.82, 0.40, 4.25, pt(0, 0.46, 0), yaw, paintCol);
      cBox(1.84, 0.32, 0.42, pt(0, 0.38, 2.05), yaw, paintCol);
      cBox(1.78, 0.10, 0.40, pt(0, 0.22, 2.08), yaw, '#161616');
      cBox(0.48, 0.12, 0.03, pt(0, 0.32, 2.27), yaw, '#f0f2f5');
      cBox(0.52, 0.15, 0.02, pt(0, 0.32, 2.26), yaw, '#141414');
      cBox(0.86, 0.22, 0.05, pt(0, 0.52, 2.15), yaw, '#151515');
      cBox(0.88, 0.03, 0.06, pt(0, 0.62, 2.16), yaw, '#d0d5da');
      cBox(0.88, 0.03, 0.06, pt(0, 0.44, 2.16), yaw, '#d0d5da');
      cBox(0.12, 0.10, 0.07, pt(0, 0.53, 2.17), yaw, '#e8ecef');
      for (const s of [-1, 1]) {
        cBox(0.34, 0.14, 0.05, pt(s * 0.68, 0.56, 2.12), yaw, '#222222');
        cBox(0.26, 0.10, 0.04, pt(s * 0.65, 0.56, 2.14), yaw, '#f8fafc');
        cBox(0.08, 0.10, 0.04, pt(s * 0.81, 0.56, 2.13), yaw, '#e67e22');
      }
      cBox(1.72, 0.08, 1.30, pt(0, 0.68, 1.35), yaw, paintCol, -0.06);
      cBox(1.68, 0.34, 2.20, pt(0, 0.82, -0.15), yaw, paintCol);
      cBox(1.44, 0.07, 1.55, pt(0, 1.38, -0.22), yaw, paintCol);
      for (const s of [-1, 1]) {
        cCyl(pt(s * 0.70, 0.70, 0.75), pt(s * 0.65, 1.35, 0.15), 0.04, 0.035, paintCol, 6);
        cCyl(pt(s * 0.65, 1.35, -0.95), pt(s * 0.70, 0.72, -1.55), 0.045, 0.04, paintCol, 6);
        cBox(0.05, 0.42, 0.08, pt(s * 0.75, 1.05, -0.22), yaw, '#181818');
      }
      gBox(1.36, 0.55, 0.04, pt(0, 1.04, 0.46), yaw, -0.58);
      gBox(1.32, 0.50, 0.04, pt(0, 1.05, -1.25), yaw, 0.55);
      for (const s of [-1, 1]) {
        gBox(0.03, 0.38, 1.50, pt(s * 0.74, 1.05, -0.25), yaw);
      }
      cBox(1.68, 0.10, 0.75, pt(0, 0.72, -1.82), yaw, paintCol);
      cBox(1.55, 0.04, 0.08, pt(0, 0.78, -2.12), yaw, paintCol);
      cBox(1.84, 0.34, 0.42, pt(0, 0.42, -2.05), yaw, paintCol);
      cBox(1.76, 0.12, 0.38, pt(0, 0.24, -2.08), yaw, '#181818');
      for (const s of [-0.55, 0.55]) {
        cCyl(pt(s, 0.24, -2.10), pt(s, 0.24, -2.26), 0.045, 0.045, '#c5cbd0', 6);
      }
      for (const s of [-1, 1]) {
        cBox(0.30, 0.12, 0.04, pt(s * 0.68, 0.66, -2.14), yaw, '#d31212');
        cBox(0.12, 0.05, 0.045, pt(s * 0.62, 0.66, -2.14), yaw, '#eeeeee');
        cBox(0.08, 0.10, 0.045, pt(s * 0.78, 0.66, -2.14), yaw, '#e67e22');
      }
      cBox(0.48, 0.12, 0.03, pt(0, 0.52, -2.16), yaw, '#f0f2f5');
      for (const s of [-1, 1]) {
        cCyl(pt(s * 0.88, 0.85, 0.66), pt(s * 0.98, 0.92, 0.66), 0.02, 0.02, '#181818', 4);
        cBox(0.16, 0.10, 0.08, pt(s * 1.02, 0.94, 0.66), yaw, paintCol);
        cBox(0.14, 0.08, 0.02, pt(s * 1.02, 0.94, 0.62), yaw, '#9ab4c8');
      }
      buildWheel(pt, yaw, -0.88, 0.32, 1.35, 0.32, 0.22, rimCol);
      buildWheel(pt, yaw, 0.88, 0.32, 1.35, 0.32, 0.22, rimCol);
      buildWheel(pt, yaw, -0.88, 0.32, -1.35, 0.32, 0.22, rimCol);
      buildWheel(pt, yaw, 0.88, 0.32, -1.35, 0.32, 0.22, rimCol);
    }

    function buildSUV(wx, wz, wy, yaw, paintCol, rimCol = '#586068') {
      const pt = (lx, ly, lz) => localToWorld(wx, wy, wz, yaw, lx, ly, lz);
      cBox(1.92, 0.22, 4.45, pt(0, 0.36, 0), yaw, '#222527');
      cBox(1.95, 0.55, 4.45, pt(0, 0.72, 0), yaw, paintCol);
      cBox(1.96, 0.45, 0.45, pt(0, 0.50, 2.18), yaw, paintCol);
      cBox(1.90, 0.18, 0.42, pt(0, 0.30, 2.22), yaw, '#1e2022');
      cBox(0.92, 0.20, 0.05, pt(0, 0.32, 2.28), yaw, '#98a2aa');
      cBox(0.48, 0.12, 0.03, pt(0, 0.45, 2.30), yaw, '#f0f2f5');
      cBox(1.05, 0.32, 0.06, pt(0, 0.75, 2.24), yaw, '#18181a');
      cBox(1.02, 0.04, 0.07, pt(0, 0.83, 2.25), yaw, '#d4dae0');
      cBox(1.02, 0.04, 0.07, pt(0, 0.69, 2.25), yaw, '#d4dae0');
      cBox(0.14, 0.12, 0.08, pt(0, 0.76, 2.26), yaw, '#e8ecef');
      for (const s of [-1, 1]) {
        cBox(0.36, 0.18, 0.06, pt(s * 0.74, 0.78, 2.20), yaw, '#202224');
        cBox(0.28, 0.14, 0.05, pt(s * 0.72, 0.78, 2.22), yaw, '#f8fafc');
        cBox(0.08, 0.12, 0.05, pt(s * 0.87, 0.78, 2.21), yaw, '#e67e22');
        cCyl(pt(s * 0.74, 0.40, 2.20), pt(s * 0.74, 0.40, 2.27), 0.06, 0.06, '#f0f4f8', 6);
      }
      cBox(1.88, 0.12, 1.35, pt(0, 0.94, 1.35), yaw, paintCol, -0.04);
      cBox(1.80, 0.65, 2.70, pt(0, 1.25, -0.20), yaw, paintCol);
      cBox(1.58, 0.08, 2.45, pt(0, 1.66, -0.30), yaw, paintCol);
      for (const s of [-1, 1]) {
        cCyl(pt(s * 0.74, 1.74, -1.2), pt(s * 0.74, 1.74, 0.8), 0.025, 0.025, '#2b2e32', 6);
        cCyl(pt(s * 0.78, 0.96, 0.72), pt(s * 0.72, 1.64, 0.10), 0.045, 0.04, paintCol, 6);
        cCyl(pt(s * 0.72, 1.64, -1.50), pt(s * 0.78, 0.98, -1.55), 0.05, 0.045, paintCol, 6);
      }
      gBox(1.48, 0.68, 0.04, pt(0, 1.30, 0.42), yaw, -0.52);
      gBox(1.42, 0.58, 0.04, pt(0, 1.32, -1.52), yaw, 0.15);
      for (const s of [-1, 1]) {
        gBox(0.03, 0.55, 2.10, pt(s * 0.80, 1.32, -0.35), yaw);
      }
      cBox(1.52, 0.05, 0.22, pt(0, 1.68, -1.58), yaw, paintCol);
      cBox(1.96, 0.48, 0.45, pt(0, 0.55, -2.15), yaw, paintCol);
      cBox(1.92, 0.24, 0.42, pt(0, 0.34, -2.18), yaw, '#1e2022');
      cBox(0.88, 0.18, 0.05, pt(0, 0.36, -2.25), yaw, '#98a2aa');
      for (const s of [-0.62, 0.62]) {
        cBox(0.16, 0.08, 0.06, pt(s, 0.34, -2.26), yaw, '#c0c5ca');
      }
      for (const s of [-1, 1]) {
        cBox(0.24, 0.36, 0.04, pt(s * 0.82, 0.96, -2.22), yaw, '#d31212');
        cBox(0.10, 0.12, 0.045, pt(s * 0.82, 0.96, -2.22), yaw, '#eeeeee');
      }
      cBox(0.48, 0.12, 0.03, pt(0, 0.68, -2.24), yaw, '#f0f2f5');
      for (const s of [-1, 1]) {
        cCyl(pt(s * 0.94, 1.05, 0.70), pt(s * 1.06, 1.08, 0.70), 0.025, 0.025, '#181818', 4);
        cBox(0.18, 0.14, 0.10, pt(s * 1.10, 1.10, 0.70), yaw, paintCol);
        cBox(0.16, 0.12, 0.02, pt(s * 1.10, 1.10, 0.65), yaw, '#9ab4c8');
      }
      buildWheel(pt, yaw, -0.94, 0.38, 1.45, 0.38, 0.26, rimCol);
      buildWheel(pt, yaw, 0.94, 0.38, 1.45, 0.38, 0.26, rimCol);
      buildWheel(pt, yaw, -0.94, 0.38, -1.45, 0.38, 0.26, rimCol);
      buildWheel(pt, yaw, 0.94, 0.38, -1.45, 0.38, 0.26, rimCol);
    }

    function buildHatchback(wx, wz, wy, yaw, paintCol, rimCol = '#c5cbd0') {
      const pt = (lx, ly, lz) => localToWorld(wx, wy, wz, yaw, lx, ly, lz);
      cBox(1.52, 0.08, 3.50, pt(0, 0.20, 0), yaw, '#181818');
      cBox(1.74, 0.38, 3.75, pt(0, 0.44, 0), yaw, paintCol);
      cBox(1.76, 0.30, 0.38, pt(0, 0.36, 1.75), yaw, paintCol);
      cBox(1.20, 0.14, 0.36, pt(0, 0.24, 1.78), yaw, '#161616');
      cBox(0.46, 0.11, 0.03, pt(0, 0.30, 1.95), yaw, '#f0f2f5');
      cBox(0.75, 0.12, 0.05, pt(0, 0.50, 1.80), yaw, '#151515');
      cBox(0.10, 0.08, 0.06, pt(0, 0.50, 1.82), yaw, '#d0d5da');
      for (const s of [-1, 1]) {
        cBox(0.30, 0.12, 0.05, pt(s * 0.62, 0.54, 1.76), yaw, '#202224');
        cBox(0.24, 0.09, 0.04, pt(s * 0.60, 0.54, 1.78), yaw, '#f5f8fb');
        cBox(0.06, 0.08, 0.04, pt(s * 0.74, 0.54, 1.75), yaw, '#e67e22');
      }
      cBox(1.64, 0.08, 1.10, pt(0, 0.64, 1.15), yaw, paintCol, -0.09);
      cBox(1.62, 0.35, 1.95, pt(0, 0.80, -0.15), yaw, paintCol);
      cBox(1.38, 0.07, 1.40, pt(0, 1.36, -0.20), yaw, paintCol);
      gBox(1.32, 0.54, 0.04, pt(0, 1.02, 0.40), yaw, -0.62);
      gBox(1.28, 0.56, 0.04, pt(0, 1.05, -1.05), yaw, 0.68);
      for (const s of [-1, 1]) {
        gBox(0.03, 0.38, 1.35, pt(s * 0.72, 1.04, -0.22), yaw);
      }
      cBox(1.35, 0.04, 0.18, pt(0, 1.39, -0.96), yaw, '#181818');
      cBox(1.76, 0.32, 0.38, pt(0, 0.40, -1.75), yaw, paintCol);
      cBox(1.68, 0.12, 0.36, pt(0, 0.22, -1.78), yaw, '#181818');
      cCyl(pt(0.52, 0.22, -1.80), pt(0.52, 0.22, -1.95), 0.04, 0.04, '#c0c5ca', 6);
      for (const s of [-1, 1]) {
        cBox(0.24, 0.28, 0.04, pt(s * 0.65, 0.76, -1.82), yaw, '#d61414');
        cBox(0.08, 0.08, 0.045, pt(s * 0.65, 0.76, -1.82), yaw, '#eeeeee');
      }
      cBox(0.46, 0.11, 0.03, pt(0, 0.50, -1.84), yaw, '#f0f2f5');
      for (const s of [-1, 1]) {
        cCyl(pt(s * 0.84, 0.84, 0.52), pt(s * 0.94, 0.90, 0.52), 0.02, 0.02, '#181818', 4);
        cBox(0.15, 0.09, 0.07, pt(s * 0.98, 0.92, 0.52), yaw, paintCol);
        cBox(0.13, 0.07, 0.02, pt(s * 0.98, 0.92, 0.48), yaw, '#9ab4c8');
      }
      buildWheel(pt, yaw, -0.84, 0.30, 1.15, 0.30, 0.20, rimCol);
      buildWheel(pt, yaw, 0.84, 0.30, 1.15, 0.30, 0.20, rimCol);
      buildWheel(pt, yaw, -0.84, 0.30, -1.15, 0.30, 0.20, rimCol);
      buildWheel(pt, yaw, 0.84, 0.30, -1.15, 0.30, 0.20, rimCol);
    }

    function buildScooter(wx, wz, wy, yaw, paintCol, rimCol = '#b0b8c0') {
      const pt = (lx, ly, lz) => localToWorld(wx, wy, wz, yaw, lx, ly, lz);
      cCyl(pt(-0.04, 0.21, 0.68), pt(0.04, 0.21, 0.68), 0.21, 0.21, '#161616', 8);
      cCyl(pt(-0.045, 0.21, 0.68), pt(0.045, 0.21, 0.68), 0.12, 0.12, rimCol, 8);
      cBox(0.14, 0.08, 0.32, pt(0, 0.36, 0.68), yaw, paintCol, -0.15);
      cCyl(pt(-0.05, 0.21, 0.68), pt(-0.05, 0.65, 0.58), 0.02, 0.02, '#454a4e', 4);
      cCyl(pt(0.05, 0.21, 0.68), pt(0.05, 0.65, 0.58), 0.02, 0.02, '#454a4e', 4);
      cBox(0.48, 0.58, 0.12, pt(0, 0.62, 0.52), yaw, paintCol, -0.22);
      for (const s of [-1, 1]) {
        cBox(0.06, 0.08, 0.03, pt(s * 0.18, 0.68, 0.55), yaw, '#e67e22');
      }
      cCyl(pt(0, 0.65, 0.55), pt(0, 0.98, 0.44), 0.025, 0.025, '#333333', 4);
      cBox(0.32, 0.12, 0.14, pt(0, 1.02, 0.42), yaw, paintCol);
      cCyl(pt(0, 1.04, 0.42), pt(0, 1.04, 0.51), 0.07, 0.07, '#ffffff', 8);
      cCyl(pt(0, 1.04, 0.41), pt(0, 1.04, 0.50), 0.078, 0.078, '#d0d6dc', 8);
      for (const s of [-1, 1]) {
        cCyl(pt(s * 0.18, 1.02, 0.40), pt(s * 0.32, 1.02, 0.38), 0.022, 0.022, '#181818', 4);
        cCyl(pt(s * 0.20, 1.04, 0.40), pt(s * 0.24, 1.18, 0.38), 0.008, 0.008, '#222222', 4);
        cBox(0.08, 0.06, 0.02, pt(s * 0.24, 1.19, 0.38), yaw, '#181818');
        cBox(0.07, 0.05, 0.01, pt(s * 0.24, 1.19, 0.37), yaw, '#9ab4c8');
      }
      cBox(0.44, 0.06, 0.40, pt(0, 0.24, 0.12), yaw, '#1e1e1e');
      cBox(0.36, 0.12, 0.65, pt(0, 0.72, -0.22), yaw, '#22201e');
      cBox(0.40, 0.38, 0.75, pt(0, 0.46, -0.25), yaw, paintCol);
      for (const s of [-1, 1]) {
        cBox(0.06, 0.28, 0.60, pt(s * 0.22, 0.44, -0.25), yaw, paintCol);
      }
      cBox(0.18, 0.10, 0.04, pt(0, 0.62, -0.66), yaw, '#d81515');
      cCyl(pt(-0.16, 0.78, -0.56), pt(0.16, 0.78, -0.56), 0.015, 0.015, '#c5cbd2', 4);
      cCyl(pt(0.20, 0.20, -0.15), pt(0.20, 0.20, -0.58), 0.04, 0.04, '#383838', 6);
      cCyl(pt(-0.04, 0.21, -0.45), pt(0.04, 0.21, -0.45), 0.21, 0.21, '#161616', 8);
      cCyl(pt(-0.045, 0.21, -0.45), pt(0.045, 0.21, -0.45), 0.12, 0.12, rimCol, 8);
      cCyl(pt(-0.10, 0.20, 0.0), pt(-0.18, 0.02, -0.05), 0.015, 0.015, '#222222', 4);
    }

    // North Row: 5 Cars (facing South, yaw ~ 0.08)
    const northConfigs = [
      { type: 'sedan', col: '#9e1b24', rim: '#c2c8cd' },     // Crimson Metallic
      { type: 'suv', col: '#edf0f2', rim: '#586068' },       // Glacier White Metallic
      { type: 'hatchback', col: '#1d3d75', rim: '#c5cbd0' }, // Celestial Blue Metallic
      { type: 'sedan', col: '#b8c0c6', rim: '#c2c8cd' },     // Sleek Titanium Silver
      { type: 'suv', col: '#181a1d', rim: '#4a5056' }        // Obsidian Midnight Black
    ];
    for (let i = 0; i < northConfigs.length; i++) {
      const x = px - 11.0 + i * 4.6, z = pz - 7.5;
      if (!L.isWalkable(x, z)) continue;
      const h = H(x, z), cfg = northConfigs[i], yaw = 0.08 + (i - 2) * 0.02;
      if (cfg.type === 'sedan') buildSedan(x, z, h, yaw, cfg.col, cfg.rim);
      else if (cfg.type === 'suv') buildSUV(x, z, h, yaw, cfg.col, cfg.rim);
      else buildHatchback(x, z, h, yaw, cfg.col, cfg.rim);
      L.block(x, z, 2.1);
    }

    // South Row: 5 Cars (facing North, yaw ~ Math.PI + 0.05)
    const southConfigs = [
      { type: 'hatchback', col: '#984b28', rim: '#c5cbd0' }, // Sunset Copper Metallic
      { type: 'sedan', col: '#1b4332', rim: '#c2c8cd' },     // Emerald Forest Green
      { type: 'suv', col: '#bda06d', rim: '#586068' },       // Golden Champagne Metallic
      { type: 'sedan', col: '#3a3e43', rim: '#c2c8cd' },     // Graphite Charcoal Metallic
      { type: 'hatchback', col: '#f0f3f6', rim: '#c5cbd0' }  // Pearl White
    ];
    for (let i = 0; i < southConfigs.length; i++) {
      const x = px - 11.0 + i * 4.6, z = pz + 7.5;
      if (!L.isWalkable(x, z)) continue;
      const h = H(x, z), cfg = southConfigs[i], yaw = Math.PI + 0.05 + (i - 2) * 0.02;
      if (cfg.type === 'sedan') buildSedan(x, z, h, yaw, cfg.col, cfg.rim);
      else if (cfg.type === 'suv') buildSUV(x, z, h, yaw, cfg.col, cfg.rim);
      else buildHatchback(x, z, h, yaw, cfg.col, cfg.rim);
      L.block(x, z, 2.1);
    }

    // Two-Wheeler / Scooter Bay: 8 Scooters side-by-side
    const scooterCols = ['#c0222a', '#5ea396', '#f4f6f8', '#1a1b1d', '#52565b', '#dca028', '#1e3b6a', '#9a4025'];
    for (let j = 0; j < scooterCols.length; j++) {
      const x = px + 12.5, z = pz - 6.5 + j * 1.85;
      if (!L.isWalkable(x, z)) continue;
      const h = H(x, z), col = scooterCols[j], yaw = Math.PI / 2 - 0.12;
      buildScooter(x, z, h, yaw, col, '#b0b8c0');
      L.block(x, z, 0.85);
    }

    if (carParts.length) {
      const carGeo = merge(carParts);
      const carMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.32,
        metalness: 0.58,
        envMapIntensity: 0.85
      });
      const carMesh = new THREE.Mesh(carGeo, carMat);
      carMesh.castShadow = true;
      carMesh.receiveShadow = true;
      scene.add(carMesh);
      this.cars = carMesh;
      this.carMesh = carMesh;
    }
  }

  finishRoofs(scene) {
    if (!this._roofs) return;
    const m = new THREE.Mesh(merge(this._roofs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  /** Hide distant signs (each sign is its own draw call). */
  update(camera) {
    const p = camera.position;
    for (const s of this.signs) s.visible = (s.position.x - p.x) ** 2 + (s.position.z - p.z) ** 2 < 140 * 140;
  }
}

function chainTex() {
  const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(150,158,156,1)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(S, S); g.moveTo(S, 0); g.lineTo(0, S); g.moveTo(-S / 2, S / 2); g.lineTo(S / 2, S * 1.5); g.moveTo(S / 2, -S / 2); g.lineTo(S * 1.5, S / 2); g.moveTo(S / 2, -S / 2); g.lineTo(-S / 2, S / 2); g.moveTo(S * 1.5, S / 2); g.lineTo(S / 2, S * 1.5); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function rockGeo(s) {
  const g = weld(new THREE.IcosahedronGeometry(1, 4)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = fbm3(x * 1.4 + s, y * 1.4, z * 1.4, 4), r = 0.72 + n * 0.6; let Y = y * r; if (Y < -0.3) Y = -0.3 + (Y + 0.3) * 0.3; p.setXYZ(i, x * r, Y, z * r); }
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const n = fbm3(p.getX(i) * 3 + s, p.getY(i) * 3, p.getZ(i) * 3, 2); c.set('#857a6a').lerp(C('#5e5548'), n).lerp(C('#8a5a3a'), clamp((noise2(p.getX(i) * 2, p.getZ(i) * 2 + s) - 0.6) * 2, 0, 0.5)); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
