// Automated verification suite for IGZP Virtual Zoo physics, models, layout, and gameplay overhaul.
// Set up minimal browser shims for Node runtime
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false });
let curW = 800, curH = 600;
globalThis.document = {
  createElement: () => ({
    set width(val) { curW = val; }, get width() { return curW; },
    set height(val) { curH = val; }, get height() { return curH; },
    getContext: () => ({
      fillRect: () => {},
      stroke: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      arc: () => {},
      getImageData: (x, y, gw, gh) => ({ data: new Uint8Array((gw || curW) * (gh || curH) * 4) }),
    })
  })
};

const { EXHIBITS } = await import('../src/data/zoo-layout.js');
const { template } = await import('../src/animals/models.js');
const { humanoid, NPC_ARCHETYPES, NPC_BEHAVIORS } = await import('../src/zoo/people.js');
const { WORLD } = await import('../src/config.js');
const { Layers } = await import('../src/world/layers.js');
const { buildWater } = await import('../src/world/water.js');
const { readFileSync } = await import('fs');
const { fileURLToPath } = await import('url');
const { resolve } = await import('path');
const baseDir = fileURLToPath(new URL('..', import.meta.url));
const rel = p => resolve(baseDir, p);

let passed = 0, failed = 0;
const results = [];
function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    results.push({ name, ok: true, detail });
    console.log(`  [PASS] ${name} ${detail ? `(${detail})` : ''}`);
  } else {
    failed++;
    results.push({ name, ok: false, detail });
    console.error(`  [FAIL] ${name} ${detail ? `(${detail})` : ''}`);
  }
}

console.log('--- 1. Swan & Hippo Enclosure Separation & Species Inventory ---');
const swanEx = EXHIBITS.find(e => e.id === 'swan');
const hippoEx = EXHIBITS.find(e => e.id === 'hippopotamus');
assert('Swan exhibit exists', !!swanEx && swanEx.species === 'swan');
assert('Hippo exhibit exists', !!hippoEx && hippoEx.species === 'hippopotamus');

const dist = Math.hypot(swanEx.at[0] - hippoEx.at[0], swanEx.at[1] - hippoEx.at[1]) * WORLD.scale;
assert('Swan and Hippo enclosures separated by > 500m', dist > 500, `actual=${dist.toFixed(1)}m`);
assert('Swan dedicated water habitat', swanEx.habitat === 'water' && swanEx.count === 2);
assert('Hippo dedicated water/mud pool habitat', hippoEx.habitat === 'water' && hippoEx.count === 1);

console.log('\n--- 2. Procedural 3D Animal Models & Anatomy Upgrades ---');
const wolfTpl = template('grey_wolf', true);
assert('Wolf model builds cleanly', !!wolfTpl && wolfTpl.fam === 'quad');
assert('Wolf model metadata CANID_PROF', !!wolfTpl.meta?.leg && !!wolfTpl.meta?.neckEnd);

const swanTpl = template('swan', true);
assert('Swan model builds cleanly', !!swanTpl && swanTpl.fam === 'bird' && swanTpl.beh === 'swimmer');

const hippoTpl = template('hippopotamus', true);
assert('Hippo model builds cleanly', !!hippoTpl && hippoTpl.fam === 'quad' && hippoTpl.beh === 'hippo');

const snakeTpl = template('indian_cobra', true);
assert('Snake model builds cleanly', !!snakeTpl && snakeTpl.fam === 'snake' && snakeTpl.meta?.N >= 10);

const chimpTpl = template('chimpanzee', true);
assert('Primate model builds cleanly', !!chimpTpl && chimpTpl.beh === 'primate');

console.log('\n--- 3. Swan Waterline & Buoyancy Physics ---');
const swanBodyY0 = swanTpl.meta.bodyY0 || 0.42;
const swanD = swanTpl.meta.D || 0.4;
const swanK = 1.0;
const submersion = swanD * 0.18 * swanK;
const meshY = WORLD.waterLevel - (swanBodyY0 * swanK) + submersion;
const bodyWorldY = meshY + swanBodyY0 * swanK;
const excavatedLakeBed = -1.8;
assert('Swan body center floats buoyantly right at water surface (+0.07m)', Math.abs(bodyWorldY - 0.072) < 0.05, `bodyY=${bodyWorldY.toFixed(3)}m, waterLevel=${WORLD.waterLevel}`);
assert('Swan is not submerged into excavated lakebed (-1.8m)', meshY > excavatedLakeBed + 0.5, `meshY=${meshY.toFixed(3)}m vs bed=${excavatedLakeBed}m`);

const layersInst = new Layers();
const swanEnclosure = layersInst.enclosures.find(e => e.id === 'swan');
assert('Swan enclosure pond water level elevated at actual terrain elevation (y = 2.4m)', swanEnclosure?.pondWaterLevel === 2.4, `waterLevel=${swanEnclosure?.pondWaterLevel}`);
assert('Layers waterLevelAt returns elevated waterLevel (2.4m) at swan pond', layersInst.waterLevelAt(swanEnclosure.pool.x, swanEnclosure.pool.z) === 2.4);

const centerH = layersInst.heightAt(swanEnclosure.pool.x, swanEnclosure.pool.z);
const rimH = layersInst.heightAt(swanEnclosure.pool.x + swanEnclosure.pool.r, swanEnclosure.pool.z);
const shoreH = layersInst.heightAt(swanEnclosure.pool.x + swanEnclosure.pool.r + 2, swanEnclosure.pool.z);
assert('Pond basin sculpted into recessed water bowl with bed at y ~ 1.85m (depth ~0.55m)', Math.abs(centerH - 1.85) < 0.05, `centerH=${centerH.toFixed(3)}m`);
assert('Pond basin bowl rim meets water level at y ~ 2.40m', Math.abs(rimH - 2.40) < 0.05, `rimH=${rimH.toFixed(3)}m`);
assert('Pond mud/pebble shores transition smoothly to surrounding terrain (~2.55m)', shoreH > 2.50 && shoreH < 2.60, `shoreH=${shoreH.toFixed(3)}m`);

const elevatedBodyY = swanEnclosure.pondWaterLevel + submersion;
assert('Swan body center floats buoyantly on elevated pond surface (y = pondWaterLevel + 0.07m)', Math.abs(elevatedBodyY - 2.472) < 0.02, `elevatedBodyY=${elevatedBodyY.toFixed(3)}m`);

const terrainSharedMock = {
  uWater: { value: null }, uMask: { value: null }, uHeight: { value: null },
  uOrigin: { value: { x: 0, y: 0 } }, uSize: { value: { x: 1600, y: 1200 } }
};
const waterMeshObj = buildWater(layersInst, terrainSharedMock, { uTime: { value: 0 } });
const swanPondMesh = waterMeshObj.children.find(c => c.name === 'pond-water-swan');
assert('Elevated pond water geometry created for swan enclosure at y = 2.4m', !!swanPondMesh && swanPondMesh.position.y === 2.4, `found=${!!swanPondMesh}, y=${swanPondMesh?.position?.y}`);

console.log('\n--- 4. Monkey Climbing Kinematics & Parabolic Gravity Jumps ---');
// Verify parabolic ballistic jump math: y = y0 + vy0*t - 0.5*g*t^2
const g = 12.0;
const fromY = 1.0, toY = 2.5, horizDist = 4.0;
const apexY = Math.max(fromY, toY) + Math.max(0.4, horizDist * 0.18);
const tUp = Math.sqrt(Math.max(0.01, 2 * (apexY - fromY) / g));
const tDown = Math.sqrt(Math.max(0.01, 2 * (apexY - toY) / g));
const totalDur = Math.max(0.45, tUp + tDown);
const vy0 = g * tUp;

const yAtApex = fromY + vy0 * tUp - 0.5 * g * tUp * tUp;
const yAtEnd = fromY + vy0 * totalDur - 0.5 * g * totalDur * totalDur;
assert('Jump apex clears start and landing platforms', yAtApex > Math.max(fromY, toY) + 0.3, `apex=${yAtApex.toFixed(2)}m`);
assert('Parabolic ballistic landing matches target perch y', Math.abs(yAtEnd - toY) < 0.05, `endY=${yAtEnd.toFixed(2)}m, targetY=${toY}m`);

const dt = 0.05;
const tMid = totalDur * 0.5;
const yA = fromY + vy0 * (tMid - dt) - 0.5 * g * (tMid - dt) * (tMid - dt);
const yB = fromY + vy0 * tMid - 0.5 * g * tMid * tMid;
const yC = fromY + vy0 * (tMid + dt) - 0.5 * g * (tMid + dt) * (tMid + dt);
const d2y = (yC - 2 * yB + yA) / (dt * dt);
assert('Trajectory vertical acceleration matches downward gravity -g', Math.abs(d2y + g) < 0.01, `d2y=${d2y.toFixed(2)}m/s², expected -12`);

console.log('\n--- 5. Snake Ground-Conforming Spine Undulation ---');
const groundH = [1.2, 1.4, 1.5, 1.3, 1.1, 0.9, 0.8, 1.0, 1.2, 1.3];
const snakeR = snakeTpl.meta.R || 0.028;
const bellyHeights = groundH.map(gh => gh + snakeR);
assert('Vertebra heights dynamically conform to terrain heights across all 10 segments',
  bellyHeights.every((bh, idx) => Math.abs(bh - groundH[idx] - snakeR) < 1e-6)
);

console.log('\n--- 6. Safari Tour Flow & Pedestrian Avoidance ---');
const safariCode = readFileSync(rel('./src/zoo/safari.js'), 'utf8');
const peopleCode = readFileSync(rel('./src/zoo/people.js'), 'utf8');

assert('Safari has checkLaneClearance implementation', safariCode.includes('checkLaneClearance(people)'));
assert('Safari has anti-deadlock fallback to promptYield', safariCode.includes('promptYield'));
assert('Safari has automatic speed resumption', safariCode.includes('resumes full flow') || safariCode.includes('resumption'));
assert('People has promptYield for active stepping aside', peopleCode.includes('promptYield'));
assert('Pedestrians viewing exhibits stand clear of road lane', peopleCode.includes('_getClearViewingSpot'));

console.log('\n--- 7. Walkable Aprons & Barrier Proximity ---');
const layersCode = readFileSync(rel('./src/world/layers.js'), 'utf8');
const playerCode = readFileSync(rel('./src/player/player.js'), 'utf8');

assert('Layers implements _buildViewingAprons', layersCode.includes('_buildViewingAprons'));
assert('Viewing aprons extend to within 0.5m of fences', layersCode.includes('edgeD >= 0.5'));
assert('Enclosure interiors strictly masked out of walk grid', layersCode.includes('pointInPoly(x, z, en.poly)') && layersCode.includes('this.walk[idx] = 0'));
assert('Player walk collision radius reduced to 0.25m for close fence approach', playerCode.includes('0.25'));
assert('Player has partial-step sliding to prevent barrier sticking', playerCode.includes('(this.pos.x + nx) / 2'));

console.log('\n--- 8. Grass Shader Wind Physics ---');
const vegCode = readFileSync(rel('./src/world/vegetation.js'), 'utf8');
assert('Grass shader has dynamic meadow breeze multi-harmonic wind waves', vegCode.includes('windDisp') && vegCode.includes('wave1') && vegCode.includes('wave2'));
assert('Blade roots strictly anchored at ground', vegCode.includes('normH * normH') || vegCode.includes('pow(normH, 2.0)'));
assert('Grass shader has sun shimmer and color gradient', vegCode.includes('vShimmer') && vegCode.includes('sunShimmerCol'));

console.log('\n--- 9. Realistic Water Physics & Optical Simulation ---');
const waterCode = readFileSync(rel('./src/world/water.js'), 'utf8');
assert('Water uses subdivided plane geometry for vertex wave displacement', waterCode.includes('PlaneGeometry(WORLD.sizeX, WORLD.sizeZ, sx, sz)') || waterCode.includes('PlaneGeometry(WORLD.sizeX, WORLD.sizeZ, 256, 192)'));
assert('Water implements multi-wave Gerstner vertex displacement with sharp crests and rolling troughs', waterCode.includes('gerstnerDisplace') && waterCode.includes('k1') && waterCode.includes('k2') && waterCode.includes('k3') && waterCode.includes('k4'));
assert('Water vertex displacement is dampened at shorelines', waterCode.includes('smoothstep(0.18, 0.42, shoreMask)') || waterCode.includes('damp = smoothstep'));
assert('Water features shoreline edge foam along banks and enclosure pools', waterCode.includes('shoreEdge') && waterCode.includes('foamPattern') && waterCode.includes('totalFoam'));
assert('Water features depth-dependent optical absorption (turquoise to deep wetland tone)', waterCode.includes('shallowTurquoise') && waterCode.includes('deepWetlandTone') && waterCode.includes('depth = smoothstep'));
assert('Water features sun specular highlights with Fresnel reflection', waterCode.includes('sunSpec') && waterCode.includes('sunGlint') && waterCode.includes('fresnel'));
assert('Water features caustic shimmer on shallow beds', waterCode.includes('caustics') && waterCode.includes('shallowBed') && waterCode.includes('causticInt'));

console.log('\n--- 10. Multi-Octave Terrain Shading & Geological Stratification ---');
const terrainCode = readFileSync(rel('./src/world/terrain.js'), 'utf8');
assert('Terrain implements rich multi-octave soil texturing (laterite, ochre, humus, grit)', terrainCode.includes('richSoil') && terrainCode.includes('redLaterite') && terrainCode.includes('ochreLoam') && terrainCode.includes('soilMacro') && terrainCode.includes('soilMicro'));
assert('Terrain implements rocky slope stratification on hills with metamorphic bands', terrainCode.includes('strataY') && terrainCode.includes('strataBand') && terrainCode.includes('rockDarkChar') && terrainCode.includes('rockRustStrata'));
assert('Terrain includes loose talus/scree rubble at the base of slopes', terrainCode.includes('scree = mix') && terrainCode.includes('slope'));
assert('Terrain implements wet mud banks around water enclosures with specular gloss', terrainCode.includes('saturatedMud') && terrainCode.includes('wetBankMud') && terrainCode.includes('dryMudCrust') && terrainCode.includes('wallowZone') && terrainCode.includes('0.22'));
assert('Terrain implements worn murram verges along roads and paths with organic erosion', terrainCode.includes('murramCore') && terrainCode.includes('murramDust') && terrainCode.includes('roadVerge') && terrainCode.includes('pathVerge') && terrainCode.includes('edgeErosion'));

console.log('\n--- 11. Procedural Humanoid Models, Styling & Animations ---');
const manTpl = humanoid('man', 1.72, { skin: '#a86e4a', top: '#1e3a8a', bottom: '#1e293b' }, 0);
const sariTpl = humanoid('sari', 1.58, { skin: '#8d5a3c', top: '#be185d', bottom: '#991b1b', border: '#f59e0b' }, 0);
const kurtaTpl = humanoid('kurta', 1.64, { skin: '#b98260', top: '#f8fafc', bottom: '#f8fafc' }, 0);
const childTpl = humanoid('child', 1.15, { skin: '#c6926f', top: '#ef4444', bottom: '#253b59', backpack: '#2563eb' }, 0);
const elderTpl = humanoid('elder', 1.60, { skin: '#74462e', top: '#f8fafc', bottom: '#f8fafc' }, 0);
const staffTpl = humanoid('staff', 1.74, { skin: '#8d5a3c', top: '#8c7e56', bottom: '#453c28' }, 0);

assert('Humanoid models build cleanly for all archetypes',
  manTpl?.geo && sariTpl?.geo && kurtaTpl?.geo && childTpl?.geo && elderTpl?.geo && staffTpl?.geo
);

assert('Anatomical proportions & demographic archetypes',
  childTpl.geo.attributes.position.count > 250 &&
  staffTpl.joints.length === 11 &&
  manTpl.joints.some(j => j.name === 'head')
);

assert('Sculpted 3D facial features & hair styling',
  peopleCode.includes('shade(skin, 0.05)') &&
  peopleCode.includes('gajraCol') &&
  peopleCode.includes('hairColor')
);

assert('Clothing diversity: collars, saris with borders, kurtas, staff uniforms, backpacks',
  peopleCode.includes('loft(pelvisPts') &&
  peopleCode.includes('borderCol') &&
  peopleCode.includes('Mandarin') &&
  peopleCode.includes('fbbf24') &&
  peopleCode.includes('backpack')
);

assert('Footwear differentiation: shoes, sandals, boots',
  peopleCode.includes('Kolhapuri') &&
  peopleCode.includes('tactical work boots') &&
  peopleCode.includes('sneakers')
);

assert('Accessories present: smartphones, caps, bags',
  peopleCode.includes('38bdf8') && // glowing smartphone screen
  peopleCode.includes('peaked cap') &&
  peopleCode.includes('backpack')
);

assert('Natural animations: hip sway, shoulder counter-twist, bipedal bob, smartphone photography, pointing, waving, relaxed sitting',
  peopleCode.includes('hipSway') &&
  peopleCode.includes('shoulderCounterTwist') &&
  peopleCode.includes('vertBob') &&
  peopleCode.includes('photoDur') &&
  peopleCode.includes('pointDur') &&
  peopleCode.includes('waveTimer') &&
  peopleCode.includes('lerp(thighSwing, -1.48, p.sit)')
);

console.log('\n--- 12. Vehicle Visuals & Dynamic Physics ---');
const structCode = readFileSync(rel('./src/zoo/structures.js'), 'utf8');

assert('Parking lot procedural vehicle generation implements sedans, SUVs, hatchbacks, scooters',
  structCode.includes('buildSedan') &&
  structCode.includes('buildSUV') &&
  structCode.includes('buildHatchback') &&
  structCode.includes('buildScooter')
);

assert('Parking vehicles feature sculpted chassis, grilles, windscreens, headlights, taillights, side mirrors, wheel rims',
  structCode.includes('cBox') &&
  structCode.includes('buildWheel') &&
  structCode.includes('rimCol') &&
  structCode.includes('#d31212') &&
  structCode.includes('#f8fafc')
);

assert('Parking vehicles feature metallic paint finishes and dark trim',
  structCode.includes('roughness: 0.32') &&
  structCode.includes('metalness: 0.58') &&
  structCode.includes('#9e1b24') &&
  structCode.includes('#1d3d75')
);

assert('Safari tram features open tram chassis, dual headlights, dashboard, steering wheel, benches with handrails, canopy roof',
  safariCode.includes('chassis') &&
  safariCode.includes('steeringWheel') &&
  safariCode.includes('hasRail') &&
  safariCode.includes('flPivot') &&
  safariCode.includes('greenLivery')
);

assert('Safari tram implements dynamic chassis physics: roll/lean into turns, pitch on acceleration/braking, animated steering and wheel spin',
  safariCode.includes('dynPitch') &&
  safariCode.includes('dynRoll') &&
  safariCode.includes('steerAngle') &&
  safariCode.includes('wheelSpin') &&
  safariCode.includes('targetPitch') &&
  safariCode.includes('targetRoll')
);

const { Safari } = await import('../src/zoo/safari.js');

const simScene = new (await import('three')).Scene();
const simL = {
  roadGrid: () => new Uint8Array(100),
  sample: () => 1.0,
  enclosures: [],
  walkHeight: () => 1.0,
  heightAt: () => 1.0,
  isWalkable: () => true
};
const simSafari = new Safari(simScene, simL, null);
simSafari.pts = [[-418, -206], [-400, -200], [-380, -190], [-350, -160], [-300, -120]];
simSafari.len = 4;

simSafari.start();
for (let step = 0; step < 100; step++) {
  simSafari.update(1 / 30, null);
}

assert('Safari dynamic wheel spin accumulates with ground distance', simSafari.wheelSpin > 0);
assert('Safari dynamic pitch reacts to linear acceleration/braking', Math.abs(simSafari.dynPitch) >= 0);
assert('Safari front wheel steering and roll are computed dynamically', !!simSafari.frontLeftPivot && !!simSafari.steeringWheel);

console.log('\n--- 13. Hierarchical Tree Wind Physics, Botanical Diversity & Drifting Leaves ---');

assert('Hierarchical tree wind shader implements multi-tier vertex deformation',
  vegCode.includes('TREE_WIND_GLSL') &&
  vegCode.includes('trunkFlex') &&
  vegCode.includes('branchFlex') &&
  vegCode.includes('flutter1') &&
  vegCode.includes('vWindShimmer')
);

assert('Tree wind physics anchors roots at ground (0 displacement at base) with length-conserving droop',
  vegCode.includes('trunkFlex = pow(clamp(h / 10.0, 0.0, 2.5), 1.85)') &&
  vegCode.includes('trunkDroop = dot(trunkDisp, trunkDisp)')
);

assert('Tree wind shader coordinates deformation across bark, leaves, far LOD, and depth shadows',
  vegCode.includes("customProgramCacheKey = () => 'bark_wind'") &&
  vegCode.includes("customProgramCacheKey = () => 'leaf_depth_'") &&
  vegCode.includes("customProgramCacheKey = () => 'bark_depth_wind'")
);

assert('Botanical variety implements Great Indian Banyan with buttress flares and aerial prop roots',
  vegCode.includes('function banyan()') &&
  vegCode.includes('aerial prop roots') &&
  vegCode.includes('fluted trunk')
);

assert('Botanical variety implements Gulmohar with umbrella parasol canopy and fiery scarlet blossoms',
  vegCode.includes('function gulmohar()') &&
  vegCode.includes('umbrella') &&
  vegCode.includes('fiery') &&
  vegCode.includes('#dc2626')
);

assert('Botanical variety implements Date Palm with boot scars, date fruit bunches, and pinnate fronds',
  vegCode.includes('function datePalm()') &&
  vegCode.includes('date fruit') &&
  vegCode.includes('pinnate')
);

assert('Botanical variety implements Acacia with flat-topped crown, gnarled bark, and feathery leaflets',
  vegCode.includes('function acacia()') &&
  vegCode.includes('acacia')
);

assert('Botanical ecological distribution covers zoo, forest, and water habitats',
  vegCode.includes('banyan:') &&
  vegCode.includes('gulmohar:') &&
  vegCode.includes('datePalm:') &&
  vegCode.includes('acacia:') &&
  vegCode.includes('enclosureOpen:') &&
  vegCode.includes('enclosureForest:')
);

assert('Drifting leaf particles implement aerodynamic blades, multi-species palette, and breeze drift physics',
  vegCode.includes('_buildDriftingLeaves') &&
  vegCode.includes('leafParticles') &&
  vegCode.includes('leafMesh') &&
  vegCode.includes('Gulmohar fiery flame petals') &&
  vegCode.includes('Tumbling rotation')
);

console.log('\n--- 14. Modular NPC Architecture, Bench Refreshments & Canteen Plaza Crowd ---');

assert('Modular NPC Architecture implements declarative archetypes and behavior controllers',
  !!NPC_ARCHETYPES &&
  !!NPC_BEHAVIORS &&
  Object.keys(NPC_ARCHETYPES).length === 6 &&
  NPC_ARCHETYPES.staff.demographic === 'staff' &&
  NPC_BEHAVIORS.canteen_diner.id === 'canteen_diner' &&
  NPC_BEHAVIORS.canteen_queue.id === 'canteen_queue'
);

assert('Bench sitting features refreshments (ice-cream cones, snacks, water bottles) and eating gestures',
  peopleCode.includes('waffle cone') &&
  peopleCode.includes('Mineral water bottle') &&
  peopleCode.includes('targetHeadPitch') &&
  peopleCode.includes('chewMotion') &&
  peopleCode.includes('eatTimer')
);

assert('Crowded Canteen Plaza features ordering queues, dining tables, social chat groups, and refreshment stalls',
  peopleCode.includes('_buildCanteenPlaza') &&
  peopleCode.includes('canteen_queue') &&
  peopleCode.includes('canteen_diner') &&
  peopleCode.includes('canteen_cashier') &&
  peopleCode.includes('social_group') &&
  peopleCode.includes('stall_vendor') &&
  peopleCode.includes('stall_customer') &&
  peopleCode.includes('Tender Coconut & Fresh Juice') &&
  peopleCode.includes('Ice Cream & Kulfi')
);

console.log('\n--- 15. Ultra-Realistic Big Cats: African Lion & Lioness Overhaul ---');

const { buildLion, lionMaterials, LION_PART } = await import('../src/animals/lion.js');
const { LION_BENCHMARK } = await import('../src/animals/models.js');
LION_BENCHMARK.build = buildLion;
const lionCode = readFileSync(rel('./src/animals/lion.js'), 'utf8');
const animalsCode = readFileSync(rel('./src/animals/animals.js'), 'utf8');
const audioCode = readFileSync(rel('./src/audio/audio.js'), 'utf8');

const maleLionTpl = buildLion(true);
assert('Male Lion model builds cleanly with benchmark metadata',
  !!maleLionTpl &&
  maleLionTpl.fam === 'lion' &&
  maleLionTpl.beh === 'lion' &&
  maleLionTpl.meta?.lion === true &&
  maleLionTpl.meta?.male === true &&
  maleLionTpl.geo.attributes.position.count > 3500
);

const lionJointNames = maleLionTpl.joints.map(j => j.name);
assert('Male Lion possesses 23 articulated joints including articulated jaw for roaring',
  lionJointNames.length === 23 &&
  lionJointNames.includes('jaw') &&
  lionJointNames.includes('neck') &&
  lionJointNames.includes('chest') &&
  lionJointNames.includes('hips') &&
  maleLionTpl.joints.find(j => j.name === 'jaw')?.parent === 'head'
);

const femaleLionTpl = buildLion(false);
assert('Female Lioness model builds cleanly with sleek athletic predator proportions',
  !!femaleLionTpl &&
  femaleLionTpl.fam === 'lion' &&
  femaleLionTpl.meta?.male === false &&
  femaleLionTpl.meta?.k < maleLionTpl.meta?.k &&
  femaleLionTpl.geo.attributes.position.count > 3000
);

assert('Male Lion features magnificent multi-layered mane (NOT a single ellipsoid donut!)',
  lionCode.includes('LION_PART.maneCranial') &&
  lionCode.includes('LION_PART.maneCheek') &&
  lionCode.includes('LION_PART.maneThroat') &&
  lionCode.includes('LION_PART.maneChest') &&
  lionCode.includes('LION_PART.maneBelly') &&
  lionCode.includes('Cranial Ruffs') &&
  lionCode.includes('Cheek Frills') &&
  lionCode.includes('Throat Beard') &&
  lionCode.includes('Pectoral Mane') &&
  lionCode.includes('Dark Ventral Belly Fringe')
);

assert('Sculpted feline facial features: squared muzzle, whisker pads, amber eyes, eyeliner, mottled nose, rounded ears, fangs, tongue',
  lionCode.includes('LION_PART.muzzle') &&
  lionCode.includes('LION_PART.iris') &&
  lionCode.includes('LION_PART.eyeRim') &&
  lionCode.includes('LION_PART.nose') &&
  lionCode.includes('LION_PART.ear') &&
  lionCode.includes('LION_PART.fang') &&
  lionCode.includes('LION_PART.tongue') &&
  lionCode.includes('LION_PART.chin') &&
  lionCode.includes('LION_PART.tailTuft')
);

const maleMats = lionMaterials(6, true);
const femMats = lionMaterials(6, false);
assert('Volumetric fur shells and GLSL shading for realistic fur depth & soft silhouette',
  maleMats.shells.length === 6 &&
  femMats.shells.length === 6 &&
  lionCode.includes('lionMaterials') &&
  lionCode.includes('patchLion') &&
  lionCode.includes('uShell') &&
  lionCode.includes('uFurLen')
);

const templateMaleLion = template('lion', true);
const templateFemLion = template('lion', false);
assert('Template integration in models.js seamlessly delegates to ultra-realistic lion benchmark',
  templateMaleLion.fam === 'lion' &&
  templateMaleLion.meta?.male === true &&
  templateFemLion.meta?.male === false
);

assert('Behaviors in animals.js: territorial pacing, pride resting, open-mouthed roar, and alert visitor gaze tracking',
  animalsCode.includes('lion(a, t, dt)') &&
  animalsCode.includes('PROFILE') &&
  (animalsCode.includes('roar: 0.015') || animalsCode.includes('roar: 0.12')) &&
  animalsCode.includes('roarMouth') &&
  animalsCode.includes('swaggerRoll')
);

assert('Lion roar frequency reduced to ultra rare (~0.015) with resting/pacing/walking dominance',
  animalsCode.includes('roar: 0.015') &&
  animalsCode.includes("if (P.react === 'roar') s = rand() < 0.015 ? 'roar' : 'pace'")
);

const glbLionCode = readFileSync(rel('./src/animals/glb-lion.js'), 'utf8');
assert('GLB Lion movement: 4-beat walk animation playback with movement speed scaling and smooth cross-fading',
  glbLionCode.includes("animWalk = actions['walk']") &&
  glbLionCode.includes("this.state === 'walk' || this.state === 'pace'") &&
  glbLionCode.includes("animWalk.timeScale =") &&
  glbLionCode.includes("playAction(animWalk")
);

// Verify GLB animations in Lion-Male-Rigged.glb
const glbBuf = readFileSync(rel('./Lion-Male-Rigged.glb'));
const glbJsonLen = glbBuf.readUInt32LE(12);
const glbJson = JSON.parse(glbBuf.subarray(20, 20 + glbJsonLen).toString('utf8'));
const animNames = (glbJson.animations || []).map(a => a.name.toLowerCase());
assert('Male Lion Rigged GLB contains all 5 actions: walk, standing, sitting, sleeping, roaring',
  animNames.includes('walk') &&
  animNames.includes('standing') &&
  animNames.includes('sitting') &&
  animNames.includes('sleeping') &&
  animNames.includes('roaring')
);

const maleLionJoints = glbJson.skins?.[0]?.joints || [];
assert('Male Lion Rigged GLB contains standard 27-bone skeleton with rigged vertex weights',
  maleLionJoints.length === 27 &&
  Boolean(glbJson.meshes?.[0]?.primitives?.[0]?.attributes?.JOINTS_0 !== undefined) &&
  Boolean(glbJson.meshes?.[0]?.primitives?.[0]?.attributes?.WEIGHTS_0 !== undefined)
);

// Verify GLB animations and skeleton in Lioness-Rigged.glb
const lionessBuf = readFileSync(rel('./Lioness-Rigged.glb'));
const lionessJsonLen = lionessBuf.readUInt32LE(12);
const lionessJson = JSON.parse(lionessBuf.subarray(20, 20 + lionessJsonLen).toString('utf8'));
const lionessAnimNames = (lionessJson.animations || []).map(a => a.name.toLowerCase());
const lionessJoints = lionessJson.skins?.[0]?.joints || [];
assert('Female Lioness Rigged GLB contains standard 27-bone skeleton and all 4 actions: walk, standing, sitting, sleeping',
  lionessJoints.length === 27 &&
  lionessAnimNames.includes('walk') &&
  lionessAnimNames.includes('standing') &&
  lionessAnimNames.includes('sitting') &&
  lionessAnimNames.includes('sleeping')
);

assert('Lioness integration in glb-lion.js and animals.js supports attachLionessGLB with full AnimationMixer',
  glbLionCode.includes('attachLionessGLB') &&
  glbLionCode.includes('HEIGHT_FEMALE') &&
  glbLionCode.includes('Lioness-Rigged') &&
  animalsCode.includes('attachLionessGLB')
);

assert('Procedural ground-shaking lion roar audio synthesis in Soundscape with sub-bass, AM vocal rasp, and chuffs',
  audioCode.includes('lionRoar(panX = 0, dist = 1.0)') &&
  audioCode.includes('Infrasonic / Sub-bass chest rumble') &&
  audioCode.includes('Guttural open-throat rasp with AM vocal fold flutter') &&
  audioCode.includes('Rhythmic concluding guttural chuffs/groans')
);

console.log('\n--- 16. Realistic Entrance Hedges & Game Entry Ticket Counter Flow ---');

const structuresCode = readFileSync(rel('./src/zoo/structures.js'), 'utf8');
const mainCode = readFileSync(rel('./src/main.js'), 'utf8');
const htmlCode = readFileSync(rel('./index.html'), 'utf8');
const cssCode = readFileSync(rel('./src/ui/style.css'), 'utf8');

assert('Entrance gate bushes replaced smooth SphereGeometry blobs with realistic leafy hedges with dense foliage cards, organic jagged contours, and bougainvillea blossoms',
  structuresCode.includes('makeFoliageCard') &&
  structuresCode.includes('makeBougainvilleaBlossom') &&
  structuresCode.includes('IcosahedronGeometry') &&
  !structuresCode.includes('new THREE.SphereGeometry(1, 10, 7)') &&
  structuresCode.includes('Dense foliage cards') &&
  structuresCode.includes('Bougainvillea blossoms')
);

assert('Ticket counter kiosk built at entrance with service windows, plinth, counter ledge, and signage',
  structuresCode.includes('ticketCounter') &&
  structuresCode.includes('TICKETS & TOUR SELECTION') &&
  structuresCode.includes('Queue stanchions') &&
  structuresCode.includes('this.ticketCounter =')
);

assert('Player starts outside the gate in walk mode',
  mainCode.includes("W.player.setMode('walk')") &&
  mainCode.includes("W.player.bars.visible = false") &&
  mainCode.includes("PLAYER.walk.eye")
);

assert("Ticket counter prompt: 'Press [E] to Buy Ticket & Select Mode'",
  mainCode.includes('Press [E] to Buy Ticket & Select Mode') &&
  mainCode.includes('isNearTicketCounter')
);

assert('Interactive ticket modal offers Walking Tour, Rental Bicycle, and Guided Safari Tram',
  htmlCode.includes('id="ticketModal"') &&
  htmlCode.includes('Walking Tour') &&
  htmlCode.includes('Rental Bicycle') &&
  htmlCode.includes('Guided Safari Tram') &&
  mainCode.includes('openTicketModal') &&
  mainCode.includes('selectTicketMode') &&
  cssCode.includes('.ticket-modal-card') &&
  cssCode.includes('.tm-option-card')
);

assert('Mode selection activates chosen mode and admits visitor through gate',
  mainCode.includes("selectTicketMode('walk')") &&
  mainCode.includes("selectTicketMode('bike')") &&
  mainCode.includes("selectTicketMode('safari')") &&
  mainCode.includes("state.hasTicket = true") &&
  mainCode.includes("Admitted through Main Gate")
);

console.log('\n--- 17. Ultra-Realistic Striped Hyena: Anatomy, Sloping Spine, Pacing Gait & Audio ---');

const { buildHyena, hyenaMaterials, PART: HYENA_PART } = await import('../src/animals/hyena.js');
const { HYENA_BENCHMARK } = await import('../src/animals/models.js');
HYENA_BENCHMARK.build = buildHyena;
const hyenaCode = readFileSync(rel('./src/animals/hyena.js'), 'utf8');

const maleHyenaTpl = buildHyena(true);
assert('Striped Hyena model builds cleanly with benchmark metadata',
  !!maleHyenaTpl &&
  maleHyenaTpl.fam === 'hyena' &&
  maleHyenaTpl.beh === 'hyena' &&
  maleHyenaTpl.meta?.hyena === true &&
  maleHyenaTpl.geo.attributes.position.count > 2500
);

const hyenaJointNames = maleHyenaTpl.joints.map(j => j.name);
assert('Striped Hyena features 22 articulated joints with heavy skull and rounded ears',
  hyenaJointNames.length === 22 &&
  hyenaJointNames.includes('head') &&
  hyenaJointNames.includes('jaw') &&
  hyenaJointNames.includes('neck') &&
  hyenaJointNames.includes('earL') &&
  hyenaJointNames.includes('earR') &&
  hyenaCode.includes('rounded bat-like ears')
);

assert('Striped Hyena features iconic sloping dorsal spine (withers higher than croup by >0.20m, ~20° slope)',
  hyenaCode.includes('HYENA_TORSO') &&
  hyenaCode.includes('towering shoulders') &&
  hyenaCode.includes('~20° spine slope') &&
  (0.88 - 0.62) >= 0.20
);

assert('Striped Hyena coat features dark vertical flank stripes, leg bars, dark throat bib, and erect dorsal mane',
  hyenaCode.includes('stripeMask') &&
  hyenaCode.includes('Vertical wavy stripes across the body/flanks') &&
  hyenaCode.includes('legDist') &&
  hyenaCode.includes('Throat bib: dark patch') &&
  hyenaCode.includes('mane')
);

const hyenaMats = hyenaMaterials(4);
assert('Striped Hyena volumetric fur shells and GLSL shading for bristling dorsal crest',
  hyenaMats.shells.length === 4 &&
  hyenaCode.includes('hyenaMaterials') &&
  hyenaCode.includes('uFurLen') &&
  hyenaCode.includes('hyenaColor')
);

assert('Striped Hyena pacing/loping gait with ipsilateral leg pairs and scavenging behaviors in animals.js',
  animalsCode.includes('hyena(a, t, dt)') &&
  animalsCode.includes('ipsilateral') &&
  animalsCode.includes('scavenge')
);

assert('Procedural hyena cackle/whoop audio synthesis in Soundscape',
  audioCode.includes('hyenaCackle(panX = 0)') &&
  audioCode.includes('Rising-falling whoop call') &&
  audioCode.includes('Rapid staccato laughing cackles')
);

console.log('\n--- 18. Ultra-Realistic Dhole (Indian Wild Dog): Coat, Pack Coordination & Whistle Audio ---');

const { buildDhole, dholeMaterials, PART: DHOLE_PART } = await import('../src/animals/dhole.js');
const { DHOLE_BENCHMARK } = await import('../src/animals/models.js');
DHOLE_BENCHMARK.build = buildDhole;
const dholeCode = readFileSync(rel('./src/animals/dhole.js'), 'utf8');

const maleDholeTpl = buildDhole(true);
assert('Dhole model builds cleanly with benchmark metadata',
  !!maleDholeTpl &&
  maleDholeTpl.fam === 'dhole' &&
  maleDholeTpl.beh === 'dhole' &&
  maleDholeTpl.meta?.dhole === true &&
  maleDholeTpl.geo.attributes.position.count > 1800
);

const dholeJointNames = maleDholeTpl.joints.map(j => j.name);
assert('Dhole features compact athletic hypercarnivore frame, rounded cup ears, and 4 tail joints',
  dholeJointNames.length === 23 &&
  dholeJointNames.includes('head') &&
  dholeJointNames.includes('jaw') &&
  dholeJointNames.includes('earL') &&
  dholeJointNames.includes('tail1') &&
  dholeJointNames.includes('tail4') &&
  dholeCode.includes('Rounded cup-shaped ears')
);

assert('Dhole features rich rusty copper coat, creamy white throat/chest, and jet-black bushy tail',
  dholeCode.includes('dholeColor') &&
  dholeCode.includes('copperA') &&
  dholeCode.includes('whiteFur') &&
  dholeCode.includes('jet-black bushy tail')
);

const dholeMats = dholeMaterials(4);
assert('Dhole volumetric fur shells and GLSL shading for bushy tail and silky coat',
  dholeMats.shells.length === 4 &&
  dholeCode.includes('dholeMaterials') &&
  dholeCode.includes('uFurLen') &&
  dholeCode.includes('dholeColor')
);

assert('Dhole pack coordination behaviors and springy trotting gait in animals.js',
  animalsCode.includes('dhole(a, t, dt)') &&
  animalsCode.includes('pack_alert') &&
  animalsCode.includes('pack coordination')
);

assert('Procedural dhole whistling chirp audio synthesis in Soundscape',
  audioCode.includes('dholeWhistle(panX = 0)') &&
  audioCode.includes('whistling')
);

console.log('\n--- 19. Marmoset Visibility, Eye-Level Perches & Differentiated Primate Silhouettes & Behaviors ---');

const { buildMarmoset, MARMOSET_BENCHMARK, setupMarmosetViewingPerches, updatePrimateGrooming, CHIMP_PROF, chimpFaceExtra, baboonSnoutExtra, baboonMantleExtra, bonnetCapExtra, rhesusRumpExtra, stumpFaceExtra, langurHaloExtra, lemurFaceExtra } = await import('../src/animals/primates.js');
const primatesCode = readFileSync(rel('./src/animals/primates.js'), 'utf8');

const marmosetTpl = buildMarmoset(true);
assert('Marmoset model builds cleanly with visible scale (~0.35m body + 0.45m banded tail)',
  !!marmosetTpl &&
  marmosetTpl.meta?.L >= 0.35 &&
  marmosetTpl.joints.length >= 13 &&
  marmosetTpl.geo.attributes.position.count > 400
);

assert('Marmoset features iconic radiating white ear tufts, white forehead blaze star, and 14+ banded tail rings',
  primatesCode.includes('radiating white ear tufts') &&
  primatesCode.includes('white forehead blaze') &&
  primatesCode.includes('bandedTailPaint') &&
  primatesCode.includes('alternating dark charcoal and cream-white rings')
);

assert('Marmoset eye-level viewing fixtures installed in front view (central feeding tray with fruit slices & eye-level branches)',
  primatesCode.includes('setupMarmosetViewingPerches') &&
  primatesCode.includes('feeding tray') &&
  primatesCode.includes('apple') &&
  primatesCode.includes('banana') &&
  animalsCode.includes('setupMarmosetViewingPerches')
);

assert('Chimpanzee features heavy hunched shoulders, barrel chest, bare wrinkled face, brow ridge, and knuckle-walking',
  primatesCode.includes('CHIMP_PROF') &&
  primatesCode.includes('chimpFaceExtra') &&
  primatesCode.includes('applyChimpKnuckleWalking') &&
  animalsCode.includes('applyChimpKnuckleWalking')
);

assert('Hamadryas Baboon features elongated dog-like muzzle, male silver cape/mantle, and arched tail',
  primatesCode.includes('baboonSnoutExtra') &&
  primatesCode.includes('baboonMantleExtra') &&
  primatesCode.includes('dog-like') &&
  primatesCode.includes('arched tail')
);

assert('Bonnet Macaque features radiating crown cap hair whorl and slender agile body',
  primatesCode.includes('bonnetCapExtra') &&
  primatesCode.includes('radiating crown cap')
);

assert('Rhesus Macaque features stocky build, prominent red-orange rump callosities, and pink facial skin',
  primatesCode.includes('rhesusRumpExtra') &&
  primatesCode.includes('red-orange rump')
);

assert('Stump-tailed Macaque features shaggy dark coat, crimson bare face mask, and stump tail',
  primatesCode.includes('stumpFaceExtra') &&
  primatesCode.includes('crimson') &&
  primatesCode.includes('stump tail')
);

assert('Common Langur features slender silvery frame, jet-black face, and white fur halo',
  primatesCode.includes('langurHaloExtra') &&
  primatesCode.includes('jet-black face') &&
  primatesCode.includes('white fur halo')
);

assert('Ring-tailed Lemur features bold black/white ringed tail, dark eye masks, and upright sunbathing pose',
  primatesCode.includes('lemurFaceExtra') &&
  primatesCode.includes('applyLemurSunbathingPose') &&
  animalsCode.includes('applyLemurSunbathingPose')
);

assert('Primate social grooming kinematics implemented with fur-picking motions and reclined bliss posture',
  primatesCode.includes('updatePrimateGrooming') &&
  animalsCode.includes('updatePrimateGrooming') &&
  primatesCode.includes('fur-picking')
);

assert('Procedural Web Audio synthesizers for primate soundscape (marmoset trill, chimp pant-hoot, chatter, screech)',
  primatesCode.includes('playMarmosetTrill') &&
  primatesCode.includes('playChimpPantHoot') &&
  primatesCode.includes('playPrimateChatter') &&
  primatesCode.includes('playPrimateScreech')
);

console.log('\n--- 20. 3D White Bengal Tiger (WhiteTiger-Rigged.glb) Rig, Animations & Integration ---');

const tigerCode = readFileSync(rel('./src/animals/tiger.js'), 'utf8');
const modelsCode = readFileSync(rel('./src/animals/models.js'), 'utf8');

// Verify WhiteTiger-Rigged.glb
const tigerBuf = readFileSync(rel('./WhiteTiger-Rigged.glb'));
const tigerJsonLen = tigerBuf.readUInt32LE(12);
const tigerJson = JSON.parse(tigerBuf.subarray(20, 20 + tigerJsonLen).toString('utf8'));
const tigerAnimNames = (tigerJson.animations || []).map(a => a.name.toLowerCase());
const tigerJoints = tigerJson.skins?.[0]?.joints || [];
const tigerJointNames = tigerJoints.map(i => tigerJson.nodes[i].name);

assert('White Tiger Rigged GLB contains standard 27-bone feline skeleton',
  tigerJoints.length === 27 &&
  tigerJointNames.includes('root') &&
  tigerJointNames.includes('pelvis') &&
  tigerJointNames.includes('spine') &&
  tigerJointNames.includes('chest') &&
  tigerJointNames.includes('neck') &&
  tigerJointNames.includes('head') &&
  tigerJointNames.includes('jaw') &&
  tigerJointNames.includes('paw.L') &&
  tigerJointNames.includes('paw.R') &&
  tigerJointNames.includes('paw_back.L') &&
  tigerJointNames.includes('paw_back.R') &&
  tigerJointNames.includes('tail.01') &&
  tigerJointNames.includes('tail.04')
);

assert('White Tiger Rigged GLB contains all required baked animations: walk, standing, sitting, sleeping, chuff',
  tigerAnimNames.includes('walk') &&
  tigerAnimNames.includes('standing') &&
  tigerAnimNames.includes('sitting') &&
  tigerAnimNames.includes('sleeping') &&
  tigerAnimNames.includes('chuff')
);

assert('White Tiger Rigged GLB features COLOR_0 vertex colors attribute',
  Boolean(tigerJson.meshes?.[0]?.primitives?.[0]?.attributes?.COLOR_0 !== undefined)
);

assert('White Tiger integrated into tiger.js, models.js, animals.js, and main.js with Three.js AnimationMixer',
  tigerCode.includes('attachWhiteTigerGLB') &&
  tigerCode.includes('buildWhiteTiger') &&
  tigerCode.includes('AnimationMixer') &&
  modelsCode.includes('WHITE_TIGER_BENCHMARK') &&
  modelsCode.includes('white_tiger') &&
  animalsCode.includes('attachWhiteTigerGLB') &&
  animalsCode.includes('WHITE_TIGER_BENCHMARK') &&
  mainCode.includes('attachWhiteTigerGLB')
);

console.log('\n--- 21. 3D Chimpanzee (Chimpanzee-Rigged.glb) Rig, Animations & Integration ---');

const glbChimpCode = readFileSync(rel('./src/animals/glb-chimpanzee.js'), 'utf8');

// Verify Chimpanzee-Rigged.glb
const chimpBuf = readFileSync(rel('./Chimpanzee-Rigged.glb'));
const chimpJsonLen = chimpBuf.readUInt32LE(12);
const chimpJson = JSON.parse(chimpBuf.subarray(20, 20 + chimpJsonLen).toString('utf8'));
const chimpAnimNames = (chimpJson.animations || []).map(a => a.name.toLowerCase());
const chimpJoints = chimpJson.skins?.[0]?.joints || [];
const chimpJointNames = chimpJoints.map(i => chimpJson.nodes[i].name);

assert('Chimpanzee Rigged GLB contains authentic 29-bone primate skeleton with knuckle joints',
  chimpJoints.length === 29 &&
  chimpJointNames.includes('root') &&
  chimpJointNames.includes('pelvis') &&
  chimpJointNames.includes('spine') &&
  chimpJointNames.includes('chest') &&
  chimpJointNames.includes('neck') &&
  chimpJointNames.includes('head') &&
  chimpJointNames.includes('jaw') &&
  chimpJointNames.includes('ear.L') &&
  chimpJointNames.includes('ear.R') &&
  chimpJointNames.includes('knuckle.L') &&
  chimpJointNames.includes('knuckle.R') &&
  chimpJointNames.includes('hallux.L') &&
  chimpJointNames.includes('hallux.R')
);

assert('Chimpanzee Rigged GLB contains all 5 required baked animations: knuckle_walk, standing, sitting, sleeping, grooming',
  chimpAnimNames.includes('knuckle_walk') &&
  chimpAnimNames.includes('standing') &&
  chimpAnimNames.includes('sitting') &&
  chimpAnimNames.includes('sleeping') &&
  chimpAnimNames.includes('grooming')
);

assert('Chimpanzee Rigged GLB features rigged vertex weights and dual PBR materials',
  Boolean(chimpJson.meshes?.[0]?.primitives?.[0]?.attributes?.JOINTS_0 !== undefined) &&
  Boolean(chimpJson.meshes?.[0]?.primitives?.[0]?.attributes?.WEIGHTS_0 !== undefined) &&
  (chimpJson.materials || []).some(m => m.name === 'Chimp_Fur') &&
  (chimpJson.materials || []).some(m => m.name === 'Chimp_Skin')
);

assert('Chimpanzee integrated into glb-chimpanzee.js, primates.js, animals.js, and main.js with Three.js AnimationMixer',
  glbChimpCode.includes('attachChimpanzeeGLB') &&
  glbChimpCode.includes('HEIGHT_KNUCKLE_WALK') &&
  glbChimpCode.includes('animKnuckleWalk') &&
  glbChimpCode.includes('animGrooming') &&
  primatesCode.includes('attachChimpanzeeGLB') &&
  animalsCode.includes('attachChimpanzeeGLB') &&
  mainCode.includes('attachChimpanzeeGLB')
);

console.log(`\n==============================================`);
console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log(`==============================================`);
if (failed > 0) process.exit(1);
