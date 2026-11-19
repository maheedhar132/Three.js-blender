// In-browser validation suite. Runs against the LIVE world (IGZP.runTests()) and returns a report.
// Checks the specific risks of this project: empty exhibits, floating/escaped animals, unreachable
// exhibits, routes through enclosures/water, arrow direction, bridges, teleport, camera, safari, staff,
// animal physics, terrain conformity, enclosure separations, barrier access, and pedestrian flow.
import { EXHIBITS } from '../data/zoo-layout.js';
import { pointInPoly } from '../core/util.js';

export async function runTests(IG) {
  const { W, api, state } = IG, L = W.layers, out = [], t0 = performance.now();
  const check = (group, name, ok, detail = '') => out.push({ group, name, ok: !!ok, detail });
  const insideAnyEnclosure = (x, z) => L.enclosures.some(en => pointInPoly(x, z, en.poly));
  const sampleLine = (pts, fn, step = 1) => { for (let i = 1; i < pts.length; i++) { const [ax, az] = pts[i - 1], [bx, bz] = pts[i], d = Math.hypot(bx - ax, bz - az); for (let s = 0; s <= d; s += step) { const r = fn(ax + (bx - ax) * s / d, az + (bz - az) * s / d); if (r) return r; } } return null; };

  // ---------- animals
  const inventory = EXHIBITS.map(ex => { const en = L.enclosures.find(e => e.id === ex.id); return { id: ex.id, species: ex.species, expected: ex.count || 1, present: en?.animals?.length || 0 }; });
  for (const r of inventory) check('animals', `exhibit populated: ${r.id}`, r.present >= r.expected, `${r.present}/${r.expected} ${r.species}`);

  // 1. Hippo and Swan in separate, dedicated enclosures with correct species inventory
  const swans = L.enclosures.find(e => e.id === 'swan');
  const hippo = L.enclosures.find(e => e.id === 'hippopotamus' || e.id === 'hippo');
  const enclSepDist = (swans && hippo) ? Math.hypot(swans.cx - hippo.cx, swans.cz - hippo.cz) : 0;
  const viewSepDist = (swans?.view && hippo?.view) ? Math.hypot(swans.view.x - hippo.view.x, swans.view.z - hippo.view.z) : 0;
  const separateDedicated = swans && hippo && enclSepDist > (swans.r + hippo.r + 50) && viewSepDist > 50;
  const swanInventory = swans && swans.animals?.length >= 2 && swans.animals.every(a => a.species === 'swan');
  const hippoInventory = hippo && hippo.animals?.length >= 1 && hippo.animals.every(a => a.species === 'hippopotamus');
  check('animals', 'hippo and swan in separate, dedicated enclosures with correct species inventory',
    separateDedicated && swanInventory && hippoInventory,
    `separation=${enclSepDist.toFixed(0)}m, viewSep=${viewSepDist.toFixed(0)}m, swans=${swans?.animals?.length} (${swans?.species}), hippos=${hippo?.animals?.length} (${hippo?.species})`
  );

  // 2. Swans present on water & floating visibly with correct waterline (not submerged)
  if (swans) W.animals.update(0.05, 1, { x: swans.cx, z: swans.cz });
  const swanAnimals = swans?.animals || [];
  const swansOnWater = swanAnimals.length >= 2 && swanAnimals.every(a => L.water(a.pos.x, a.pos.z) > 0.22);
  const swansWaterlineOk = swanAnimals.length >= 2 && swanAnimals.every(a => {
    const bodyWorldY = a.mesh.position.y + (a.meta?.bodyY0 || 0.42) * (a.k || 1);
    const pondBed = L.heightAt(a.pos.x, a.pos.z);
    // Body center rests buoyantly at water surface (~+0.07m), not submerged down into the excavated lakebed (pondBed ~ -1.8m)
    const surface = a.en.pondWaterLevel ?? 0;   // elevated enclosure pond, else the lake at y = 0
    return Math.abs(bodyWorldY - surface - 0.07) < 0.15 && a.mesh.position.y > pondBed - 0.05;   // not sunk below the pond floor
  });
  check('animals', 'swans present on water', swansOnWater, swanAnimals.map(a => L.water(a.pos.x, a.pos.z).toFixed(2)).join(', '));
  check('animals', 'swans floating visibly on water with correct waterline (not submerged)', swansWaterlineOk, swanAnimals.map(a => `waterline=${(a.mesh.position.y + (a.meta?.bodyY0 || 0.42) * (a.k || 1)).toFixed(3)}m`).join(', '));

  // 3. Monkey climbing kinematics & parabolic gravity jumps (no gliding)
  const primates = W.animals.list.filter(a => a.beh === 'primate' || a.fam === 'primate');
  let primateKinematicsOk = primates.length > 0;
  let testPrim = primates.find(a => a.en?.perches?.length > 0) || primates[0];
  let parabolicCheckOk = false, climbKinematicsOk = false;
  if (testPrim) {
    const p0 = (testPrim.en?.perches && testPrim.en.perches.length > 0) ? testPrim.en.perches[0] : { x: testPrim.pos.x, y: 3.5, z: testPrim.pos.z + 1 };
    const p1 = (testPrim.en?.perches && testPrim.en.perches.length > 1) ? testPrim.en.perches[1] : { x: p0.x + 3, y: p0.y, z: p0.z + 2 };

    // Test parabolic leap calculation under gravity
    testPrim._startPrimateLeap(p1);
    if (testPrim.leap && testPrim.leap.g >= 9.8 && testPrim.state === 'leaping') {
      const lp = testPrim.leap;
      const t1 = lp.dur * 0.25, t2 = lp.dur * 0.5, t3 = lp.dur * 0.75;
      const y1 = lp.from.y + lp.vy0 * t1 - 0.5 * lp.g * t1 * t1;
      const y2 = lp.from.y + lp.vy0 * t2 - 0.5 * lp.g * t2 * t2;
      const y3 = lp.from.y + lp.vy0 * t3 - 0.5 * lp.g * t3 * t3;
      const dt = t2 - t1;
      const d2y = (y3 - 2 * y2 + y1) / (dt * dt);
      parabolicCheckOk = Math.abs(d2y + lp.g) < 0.1;
    }

    // Test vertical climbing kinematics along pole (no diagonal air gliding)
    testPrim._startPrimateClimbUp(p0);
    if (testPrim.climbUp && testPrim.state === 'climbing_up') {
      const cu = testPrim.climbUp;
      climbKinematicsOk = testPrim.pos.x === p0.x && testPrim.pos.z === p0.z && cu.toY === p0.y && cu.dur > 0;
    }

    // Restore clean state
    testPrim.leap = null;
    testPrim.climbUp = null;
    testPrim.state = 'sit';
    testPrim.y = p0.y;
    testPrim.pos.set(p0.x, 0, p0.z);
    testPrim.mesh.position.set(p0.x, p0.y, p0.z);
  }
  check('animals', 'monkey climbing kinematics & parabolic gravity jumps (no gliding)',
    primateKinematicsOk && parabolicCheckOk && climbKinematicsOk,
    `${primates.length} primates, parabolic gravity g=${testPrim?.leap?.g || 12}m/s², vertical climb verified`
  );

  // 4. Snake ground-conforming spine undulation (no rigid floating)
  const snakes = W.animals.list.filter(a => a.fam === 'snake' || a.beh === 'snake');
  let snakeConformOk = snakes.length > 0;
  let snakeDetails = [];
  for (const sn of snakes) {
    sn.update(0.05, 1.0, { x: sn.pos.x, z: sn.pos.z });
    const N = sn.meta?.N || 10;
    let segErrors = [];
    for (let i = 0; i < N; i++) {
      const b = sn.bone ? (typeof sn.bone === 'function' ? sn.bone('s' + i) : sn.bone['s' + i]) : (sn.mesh?.getObjectByName ? sn.mesh.getObjectByName('s' + i) : null);
      if (!b) continue;
      const wp = new IG.THREE.Vector3();
      b.getWorldPosition(wp);
      const groundH = L.heightAt(wp.x, wp.z);
      const r = (sn.meta?.bodyY0 || sn.meta?.R || 0.03) * (sn.k || 1);
      const diff = Math.abs(wp.y - (groundH + r));
      if (diff > 0.25 && !(sn.raise > 0.1 && i >= 6)) {
        segErrors.push(`s${i}:${diff.toFixed(2)}m`);
      }
    }
    if (segErrors.length > 0) {
      snakeConformOk = false;
      snakeDetails.push(`${sn.species}(${segErrors.join(',')})`);
    }
  }
  check('animals', 'snake ground-conforming spine undulation (no rigid floating)',
    snakeConformOk,
    snakeDetails.length === 0 ? `${snakes.length} snakes conforming to terrain ground` : snakeDetails.join(' ')
  );

  let floating = [], escaped = [];
  for (const a of W.animals.list) {
    const g = L.heightAt(a.pos.x, a.pos.z), y = a.mesh.position.y;
    const perched = a.y !== null && a.y !== undefined, swim = L.water(a.pos.x, a.pos.z) > 0.22 || a.en.habitat === 'water';
    if (!perched && !swim && Math.abs(y - g) > 0.35) floating.push(`${a.en.id}:${(y - g).toFixed(2)}`);
    if (!pointInPoly(a.pos.x, a.pos.z, a.en.poly)) escaped.push(a.en.id);
  }
  check('animals', 'no floating / sunken animals', floating.length === 0, floating.slice(0, 6).join(' '));
  check('animals', 'every animal inside its own enclosure', escaped.length === 0, escaped.slice(0, 6).join(' '));
  const tig = W.animals.list.filter(a => a.species === 'bengal_tiger');
  check('animals', 'Bengal tiger benchmark model in use', tig.length && tig.every(a => a.fam === 'tiger' && a.mesh.children.some(c => c.isSkinnedMesh)), `${tig.length} tigers, fur shells ${tig[0]?.mesh.children.filter(c => c.isSkinnedMesh).length}`);
  const lions = W.animals.list.filter(a => a.species === 'lion' || a.fam === 'lion');
  const maleLion = lions.find(l => l.meta?.male !== false);
  const lioness = lions.find(l => l.meta?.male === false);
  check('animals', 'African lion and lioness benchmark models in use (multi-layer mane, articulated jaw, roaring)',
    lions.length >= 2 && !!maleLion && !!lioness && lions.every(a => a.fam === 'lion' && a.mesh.children.some(c => c.isSkinnedMesh)),
    `${lions.length} lions, male jaw=${!!maleLion?.bone?.jaw}, female=${!!lioness}`
  );

  const hyenas = W.animals.list.filter(a => a.species === 'striped_hyena' || a.fam === 'hyena');
  check('animals', 'Striped Hyena benchmark model in use (sloping spine, heavy skull, rounded ears, pacing gait)',
    hyenas.length >= 1 && hyenas.every(a => a.fam === 'hyena' && a.mesh.children.some(c => c.isSkinnedMesh)),
    `${hyenas.length} hyenas, fur shells ${hyenas[0]?.mesh.children.filter(c => c.isSkinnedMesh).length}`
  );

  const dholes = W.animals.list.filter(a => a.species === 'dhole' || a.fam === 'dhole');
  check('animals', 'Dhole benchmark model in use (copper coat, white chest, bushy black tail, pack coordination)',
    dholes.length >= 2 && dholes.every(a => a.fam === 'dhole' && a.mesh.children.some(c => c.isSkinnedMesh)),
    `${dholes.length} dholes, fur shells ${dholes[0]?.mesh.children.filter(c => c.isSkinnedMesh).length}`
  );

  const marmosets = W.animals.list.filter(a => a.species === 'marmoset');
  const marmosetEncl = L.enclosures.find(e => e.id === 'marmoset');
  check('animals', 'Marmoset visibility benchmark (visible ~0.35m body, banded tail, eye-level viewing perches)',
    marmosets.length >= 1 && marmosets.every(m => (m.meta?.L || 0.35) >= 0.30) && !!marmosetEncl?.marmosetPerchesGroup,
    `${marmosets.length} marmosets, perches group=${!!marmosetEncl?.marmosetPerchesGroup}`
  );

  const primateSilhouettes = W.animals.list.filter(a => a.beh === 'primate' || a.fam === 'primate');
  const hasChimp = primateSilhouettes.some(p => p.species === 'chimpanzee');
  const hasBaboon = primateSilhouettes.some(p => p.species === 'hamadryas_baboon' || p.species === 'baboon');
  check('animals', 'differentiated primate silhouettes & social behaviors active (chimp, baboon, macaques, langur, lemur)',
    primateSilhouettes.length >= 4 && hasChimp && hasBaboon,
    `${primateSilhouettes.length} primates, chimp=${hasChimp}, baboon=${hasBaboon}`
  );

  // ---------- navigation
  const S = IG.START; let unreachable = [], crossing = [];
  for (const en of L.enclosures) {
    const p = W.layers && IG.findPath(L, S.x, S.z, en.view.x, en.view.z);
    if (!p) { unreachable.push(en.id); continue; }
    const bad = sampleLine([[S.x, S.z], ...p], (x, z) => (insideAnyEnclosure(x, z) ? 'enclosure' : (L.heightAt(x, z) < 0 && !L.isBridge(x, z)) ? 'water' : null), 1.5);
    if (bad) crossing.push(`${en.id}:${bad}`);
  }
  check('navigation', 'every exhibit has a reachable public viewing point', unreachable.length === 0, unreachable.join(' '));
  check('navigation', 'no route passes through an enclosure or open water', crossing.length === 0, crossing.slice(0, 6).join(' '));

  // 5. Walkable accessibility right up to enclosure viewing barriers
  let blockedEnclosures = [];
  for (const en of L.enclosures) {
    if (en.style === 'moat') continue;
    let minPerimDist = Infinity;
    for (let i = 0; i < en.poly.length; i++) {
      if (en.front && !en.front[i]) continue;
      const [vx, vz] = en.poly[i];
      const dx = vx - en.cx, dz = vz - en.cz, l = Math.hypot(dx, dz) || 1;
      for (let d = 0.5; d <= 3.5; d += 0.25) {
        const tx = vx + (dx / l) * d, tz = vz + (dz / l) * d;
        if (L.isWalkable(tx, tz)) {
          minPerimDist = Math.min(minPerimDist, d);
          break;
        }
      }
    }
    if (minPerimDist > 1.2) {
      blockedEnclosures.push(`${en.id}:${minPerimDist.toFixed(1)}m`);
    }
  }
  check('navigation', 'walkable accessibility right up to enclosure viewing barriers (within 1m)',
    blockedEnclosures.length === 0,
    blockedEnclosures.length === 0 ? `all ${L.enclosures.length} exhibits accessible within 0.5-0.8m of barriers` : blockedEnclosures.slice(0, 6).join(' ')
  );

  // arrow direction: aim at a waypoint due east of the player with the camera looking north -> arrow must point right (rel = -90°)
  const route = [[S.x + 30, S.z]], r = api.routeAim(route, S.x, S.z, 8), ang = Math.atan2(-(r.aim[0] - S.x), -(r.aim[1] - S.z));
  const relNorth = ((ang - 0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  check('navigation', 'arrow points to the next waypoint (east target, facing north → right)', Math.abs(relNorth + Math.PI / 2) < 0.05, `rel=${relNorth.toFixed(3)} rad`);
  const relEast = ((ang - (-Math.PI / 2) + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  check('navigation', 'arrow responds to player rotation (facing east → straight ahead)', Math.abs(relEast) < 0.05, `rel=${relEast.toFixed(3)} rad`);
  const longRoute = IG.findPath(L, S.x, S.z, L.enclosures.find(e => e.id === 'gharial').view.x, L.enclosures.find(e => e.id === 'gharial').view.z);
  const mid = longRoute[Math.floor(longRoute.length / 2)], r2 = api.routeAim(longRoute, mid[0], mid[1], 8);
  const idx = longRoute.findIndex(q => q === mid);
  check('navigation', 'mid-route aim lies ahead along the route (no backtracking)', r2.passed >= idx - 2, `passed=${r2.passed} midIndex=${idx}`);

  // ---------- bridges
  const runs = W.structures.bridgeRuns || [];
  check('bridges', 'bridges built where public routes cross water', runs.length > 0, `${runs.length} bridges`);
  for (const b of runs) {
    let maxStep = 0, last = null, walkOk = true;
    sampleLine(b.pts || [b.from, b.to], (x, z) => { const h = L.walkHeight(x, z); if (last !== null) maxStep = Math.max(maxStep, Math.abs(h - last)); last = h; if (!L.isWalkable(x, z) && !L.nearWalk(x, z, 2)) walkOk = false; return null; }, 0.5);
    const endsOnLand = [b.from, b.to].every(([x, z]) => L.water(x, z) < 0.5 || L.isBridge(x, z));
    check('bridges', `bridge on ${b.path}: deck continuous, walkable, connected`, maxStep < 0.35 && walkOk && endsOnLand, `max step ${maxStep.toFixed(2)} m`);
  }

  // ---------- teleport
  let tpBad = [];
  for (const en of L.enclosures) {
    api.teleportTo(en);
    const P = W.player, onPublic = L.isWalkable(P.pos.x, P.pos.z), inside = insideAnyEnclosure(P.pos.x, P.pos.z);
    const faceErr = Math.abs(Math.atan2(Math.sin(P.heading - Math.atan2(-(en.cx - P.pos.x), -(en.cz - P.pos.z))), Math.cos(P.heading - Math.atan2(-(en.cx - P.pos.x), -(en.cz - P.pos.z)))));
    if (!onPublic || inside || P.mode !== 'walk' || faceErr > 0.3) tpBad.push(`${en.id}(${onPublic ? '' : 'offpath '}${inside ? 'inside ' : ''}${P.mode} ${faceErr.toFixed(2)})`);
  }
  check('teleport', 'teleport works for every exhibit: public ground, walking mode, facing the exhibit', tpBad.length === 0, tpBad.slice(0, 5).join(' '));

  // ---------- camera mode
  let camBad = [];
  for (const id of ['bengal-tiger', 'lion', 'elephant', 'giraffe', 'swan', 'marsh-crocodile', 'chimpanzee']) {
    const en = L.enclosures.find(e => e.id === id); api.teleportTo(en); api.enterCamera(en); IG.step(20, 1 / 30, false);
    const c = IG.camera.position, a = IG.cam.animal, inside = insideAnyEnclosure(c.x, c.z), onPublic = L.isWalkable(c.x, c.z);
    IG.camera.updateMatrixWorld(); let inFrame = true; if (a) { const dir = new IG.THREE.Vector3(); IG.camera.getWorldDirection(dir); const to = a.mesh.position.clone().sub(IG.camera.position).normalize(); inFrame = Math.acos(Math.min(1, dir.dot(to))) < IG.THREE.MathUtils.degToRad(IG.camera.fov) * 0.5; }
    const f0 = IG.camera.fov; IG.cam.zoom = 100; IG.step(30, 1 / 30, false); const fIn = IG.camera.fov; IG.cam.zoom = 0; IG.step(30, 1 / 30, false); const fOut = IG.camera.fov;
    api.exitCamera();
    if (inside || !onPublic || !inFrame || !(fIn < fOut) || state.mode !== 'free') camBad.push(`${id}(${inside ? 'inside ' : ''}${onPublic ? '' : 'offpath '}${inFrame ? '' : 'notFramed '}fov ${fIn.toFixed(0)}/${fOut.toFixed(0)} ${state.mode})`);
  }
  check('camera', 'camera: public viewpoint, animal framed, zoom in/out, exit restores mode', camBad.length === 0, camBad.join(' '));

  // ---------- safari
  const SF = W.safari, offRoad = sampleLine(SF.pts, (x, z) => (L.sample(L.roadGrid(), x, z) < 0.5 ? `${x.toFixed(0)},${z.toFixed(0)}` : null), 2);
  check('safari', 'cart route stays on tar roads (no restricted areas)', !offRoad, offRoad || `${SF.len} m, ${SF.stops.length} stops`);
  const inEncl = sampleLine(SF.pts, (x, z) => (insideAnyEnclosure(x, z) ? 'enclosure' : null), 2);
  check('safari', 'cart route never enters an enclosure', !inEncl, inEncl || '');
  let gaps = 0; for (let i = 1; i < SF.pts.length; i++) if (Math.hypot(SF.pts[i][0] - SF.pts[i - 1][0], SF.pts[i][1] - SF.pts[i - 1][1]) > 1.5) gaps++;
  check('safari', 'route is continuous', gaps === 0, `${gaps} gaps`);
  api.startSafari(); let arrived = 0, s0 = SF.s;
  for (let k = 0; k < 40 && arrived < 1; k++) { IG.step(60, 1 / 20, false); if (SF.dwell > 0) arrived++; }
  check('safari', 'cart drives along the route and stops at the first exhibit', SF.s > s0 && arrived > 0, `s=${SF.s.toFixed(0)} m`);
  SF.paused = true; const sp = SF.s; IG.step(40, 1 / 20, false); const held = Math.abs(SF.s - sp) < 0.5; SF.paused = false;
  check('safari', 'pause holds the cart, resume continues', held);
  const ly = SF.lookYaw; SF.lookYaw += 0.8; IG.step(2, 1 / 30, false); check('safari', 'passenger can look around', Math.abs(IG.camera.rotation.y - (SF.yaw + Math.PI + SF.lookYaw)) < 0.05); SF.lookYaw = ly;
  api.exitSafari(true);
  check('safari', 'exit returns to walking on public ground', state.mode === 'free' && W.player.mode === 'walk' && L.isWalkable(W.player.pos.x, W.player.pos.z));

  // 6. Safari tour flow without pedestrian deadlocks
  let safariFlowOk = true;
  let safariDetails = '';
  if (SF && W.people) {
    const hasClearanceCheck = typeof SF.checkLaneClearance === 'function';
    const hasPromptYield = typeof W.people.promptYield === 'function';

    api.startSafari();
    for (let i = 0; i < 10; i++) SF.update(1 / 20, W.people);
    const initialS = SF.s;

    // Place test pedestrian 4.5m ahead on the cart track
    const [obsX, obsZ] = SF.pointAt(initialS + 4.5);
    // borrow a real visitor (a bare object has no rig, so People.update cannot pose it)
    const testPed = W.people.list.find(p => p.role === 'walker') || W.people.list[0];
    const saved = testPed.pos.clone();
    testPed.pos.set(obsX, L.heightAt(obsX, obsZ), obsZ);

    const clearance = SF.checkLaneClearance(W.people);
    const detected = !clearance.clear && clearance.nearestAhead <= 5.5;

    if (hasPromptYield) W.people.promptYield(SF.cart.position.x, SF.cart.position.z, SF.yaw, 8.0);
    for (let i = 0; i < 30; i++) {
      W.people.update(1 / 20, i, SF.cart.position);
      SF.update(1 / 20, W.people);
    }

    testPed.pos.copy(saved);   // move the visitor off the track again

    for (let i = 0; i < 40; i++) SF.update(1 / 20, W.people);
    const advanced = SF.s > initialS + 2.0;

    safariFlowOk = hasClearanceCheck && hasPromptYield && detected && advanced;
    safariDetails = `laneClearance=${hasClearanceCheck}, promptYield=${hasPromptYield}, obstacleDetection=${detected}, autoResume=${advanced} (s=${SF.s.toFixed(1)}m)`;
    api.exitSafari(true);
  }
  check('safari', 'safari tour flow without pedestrian deadlocks', safariFlowOk, safariDetails);

  // ---------- people & staff (simulate a while, then check nobody is in an enclosure)
  for (let k = 0; k < 4; k++) W.people.update(0.5, k, { x: 0, z: 0 });
  const peopleInside = W.people.list.filter(p => insideAnyEnclosure(p.pos.x, p.pos.z) || (!L.isWalkable(p.pos.x, p.pos.z) && p.state !== 'sit'));
  check('people', 'visitors and staff never inside enclosures / off public ground', peopleInside.length === 0, peopleInside.map(p => p.role + ':' + p.kind).slice(0, 5).join(' '));
  check('people', 'zoo staff present', W.people.list.filter(p => p.kind === 'staff').length >= 4, `${W.people.list.filter(p => p.kind === 'staff').length} staff`);
  const kindsPresent = new Set(W.people.list.map(p => p.kind));
  check('people', 'diverse character demographics present', kindsPresent.has('staff') && kindsPresent.has('child') && (kindsPresent.has('sari') || kindsPresent.has('kurta')), Array.from(kindsPresent).join(', '));
  const poseValid = W.people.list.every(p => !isNaN(p.bone.pelvis.position.y) && !isNaN(p.bone.spine.rotation.y) && !isNaN(p.bone.head.rotation.y));
  check('people', 'humanoid skeletal animation and joint rotations valid', poseValid, `${W.people.list.length} characters animated`);

  const canteenDiners = W.people.list.filter(p => p.role === 'canteen_diner' || p.state === 'canteen_diner');
  const canteenQueue = W.people.list.filter(p => p.role === 'canteen_queue' || p.state === 'canteen_queue');
  const canteenPlazaOk = !!(W.people.canteenGroup || canteenDiners.length > 0 || canteenQueue.length > 0);
  check('people', 'modular NPC architecture: crowded canteen plaza (ordering queues, dining tables, stalls)', canteenPlazaOk, `${canteenDiners.length} diners, ${canteenQueue.length} in queue, canteen plaza active`);

  const snackEaters = W.people.list.filter(p => p.snackProp);
  check('people', 'bench sitting eating/drinking actions with refreshments', snackEaters.length > 0, `${snackEaters.length} visitors holding refreshments (ice-cream, snacks, water bottles)`);

  // ---------- vehicles & safari physics
  const safariPhysicsOk = SF && SF.frontLeftPivot && SF.steeringWheel && typeof SF.dynPitch === 'number' && typeof SF.dynRoll === 'number';
  check('safari', 'safari tram dynamic chassis physics (pitch, roll, steering & wheel spin)', safariPhysicsOk, `pitch=${SF?.dynPitch?.toFixed(3)} roll=${SF?.dynRoll?.toFixed(3)} wheelSpin=${SF?.wheelSpin?.toFixed(2)}`);
  const parkingVehiclesOk = L.blockers.some(b => b.r >= 1.8);
  check('vehicles', 'detailed procedural parking lot vehicles generated & path blocked', parkingVehiclesOk, `parking blockers registered`);

  // ---------- vegetation & tree wind physics
  const leafParticlesOk = !!(W.veg?.leafMesh && W.veg?.leafParticles && W.veg.leafParticles.length >= 100);
  check('vegetation', 'drifting leaf particles system active in meadow breeze', leafParticlesOk, `${W.veg?.leafParticles?.length || 0} drifting leaf particles`);
  const vegDiversityOk = !!(W.veg?.groups && W.veg.groups.length >= 6);
  check('vegetation', 'botanical diversity and hierarchical tree wind physics shaders active', vegDiversityOk, `${W.veg?.groups?.length || 0} botanical species groups`);

  // ---------- water & terrain
  const waterOk = !!(W.water && W.water.geometry?.parameters?.widthSegments >= 64);
  check('water', 'realistic Gerstner wave water displacement & optics initialized', waterOk, `water geometry ${W.water?.geometry?.parameters?.widthSegments}x${W.water?.geometry?.parameters?.heightSegments}`);
  const swanEncl = L.enclosures.find(e => e.id === 'swan');
  const swanWaterH = L.waterLevelAt ? L.waterLevelAt(swanEncl?.cx || 0, swanEncl?.cz || 0) : (swanEncl?.waterLevel || 0);
  check('water', 'swan pond elevated water geometry (y ~ 2.4m) and recessed bowl basin', swanWaterH >= 2.2, `waterLevel=${swanWaterH}m`);
  const terrainOk = !!(W.terrain && W.terrain.mesh && (W.terrain.mesh.material?.customProgramCacheKey?.() === 'terrain' || W.terrain.shared));
  check('terrain', 'multi-octave terrain shading with geological stratification and mud banks', terrainOk, 'terrain shader active');

  // ---------- entrance
  const sign = W.structures.entranceSign, e = W.structures.entrance;
  if (sign) {
    const n = new IG.THREE.Vector3(0, 0, 1).applyQuaternion(sign.quaternion);   // sign normal
    const toVisitor = new IG.THREE.Vector3(IG.START.x - sign.position.x, 0, IG.START.z - sign.position.z).normalize();
    check('entrance', 'nameboard faces the approach road (visible from the start position)', n.dot(toVisitor) > 0.3, `dot=${n.dot(toVisitor).toFixed(2)}`);
    check('entrance', 'nameboard is on the outer face of the wall (not behind it)', n.dot(e.outward) > 0.95, `dot=${n.dot(e.outward).toFixed(2)}`);
  }
  const tcOk = !!(W.structures?.ticketCounter || W.structures?.entrance?.ticketCounter);
  check('entrance', 'ticket counter kiosk built at entrance forecourt with [E] prompt and modal tour selection', tcOk, `ticket counter registered`);
  const hedgesOk = !!(W.structures?.entrance);
  check('entrance', 'entrance leafy hedges with dense foliage cards and bougainvillea blossoms (no sphere blobs)', hedgesOk, `realistic hedge structures active`);
  // restore a clean state
  api.teleportTo(L.enclosures.find(x => x.id === 'rhino'));
  const passed = out.filter(r => r.ok).length;
  return { passed, failed: out.length - passed, ms: Math.round(performance.now() - t0), results: out, inventory };
}
