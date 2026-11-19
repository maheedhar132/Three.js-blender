// Integration for the rigged & animated Lion-Male-Rigged.glb and Lioness-Rigged.glb.
// Features realistic animated actions:
//   Male:
//     - 'walk'     : 4-beat quadruped walk cycle with alternating diagonal limb pairs and true skeletal locomotion
//     - 'standing' : Idle stance with subtle chest breathing and periodic tail swish
//     - 'sitting'  : Seated haunches pose with upright spine and alert gaze
//     - 'sleeping' : Rest pose on ground with relaxed curled limbs and deep breathing
//     - 'roaring'  : Powerful roar with swelling chest, neck reared back, and jaw wide open
//   Lioness (Female):
//     - 'walk'     : Sleek 4-beat predatory walk cycle with fluid spine counter-twist
//     - 'standing' : Alert stance with subtle breathing and exploratory gaze
//     - 'sitting'  : Seated posture with upright spine
//     - 'sleeping' : Relaxed resting posture curled on ground
import * as THREE from 'three';

let _GLTFLoaderClass = null;
async function getGLTFLoader() {
  if (_GLTFLoaderClass) return _GLTFLoaderClass;
  if (typeof window !== 'undefined' && !globalThis.process?.versions?.node) {
    const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
    _GLTFLoaderClass = mod.GLTFLoader;
  }
  return _GLTFLoaderClass;
}

const URL_MALE_GLB = './Lion-Male-Rigged.glb';
const URL_FEMALE_GLB = './Lioness-Rigged.glb';
const URL_FEMALE_GLB_FALLBACK = './Lioness-Rigged.glb';

const HEIGHT_MALE = 1.15;   // Natural Asiatic male lion shoulder/mane height (metres)
const HEIGHT_FEMALE = 1.05; // Sleek lioness shoulder height (~130-150kg, ~0.91x of male)

function setupLionModel(model, height, animal) {
  model.traverse(o => {
    if (o.isMesh) {
      if (o.name.includes('Icosphere')) {
        o.visible = false;
        return;
      }
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.material) {
        o.material.roughness = 0.85;
        o.material.metalness = 0.05;
        o.material.side = THREE.DoubleSide;
        o.material.depthWrite = true;
        o.material.needsUpdate = true;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = (height / (size.y || 1)) / (animal.k || 1);
  model.scale.setScalar(scale);
  model.rotation.y = 0; // Export already faces +Z

  // Hide all procedural geometry across the entire hierarchy
  if (animal.mesh.material) {
    animal.mesh.material.visible = false;
  }
  const modelMeshes = new Set();
  model.traverse(c => { if (c.isMesh) modelMeshes.add(c); });
  animal.mesh.traverse(c => {
    if (c.isMesh && !modelMeshes.has(c)) {
      c.visible = false;
    }
  });
  animal.mesh.add(model);
}

/**
 * Attaches Lioness-Rigged.glb to all female lions in the lion enclosure.
 */
export async function attachLionessGLB(animals) {
  const females = animals.list.filter(a => (a.species === 'lion' || a.fam === 'lion') && a.meta?.male === false);
  if (!females.length) return [];

  const GLTFLoader = await getGLTFLoader();
  if (!GLTFLoader) return [];

  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await loader.loadAsync(URL_FEMALE_GLB);
  } catch (err) {
    console.warn('[igzp] Could not load Lioness-Rigged.web.glb, falling back to Lioness-Rigged.glb:', err.message);
    gltf = await loader.loadAsync(URL_FEMALE_GLB_FALLBACK);
  }

  const attached = [];
  for (let idx = 0; idx < females.length; idx++) {
    const female = females[idx];
    // If multiple females, load or use cloned scene
    let model;
    if (idx === 0) {
      model = gltf.scene;
    } else {
      const g = await loader.loadAsync(URL_FEMALE_GLB).catch(() => loader.loadAsync(URL_FEMALE_GLB_FALLBACK));
      model = g.scene;
    }

    setupLionModel(model, HEIGHT_FEMALE, female);

    // AnimationMixer with baked animations ('walk', 'standing', 'sitting', 'sleeping')
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) {
      const key = clip.name.toLowerCase();
      actions[key] = mixer.clipAction(clip);
    }

    const animStanding = actions['standing'] || actions['idle'] || Object.values(actions)[0];
    const animWalk = actions['walk'] || actions['walking'] || animStanding;
    const animSitting = actions['sitting'] || animStanding;
    const animSleeping = actions['sleeping'] || animSitting;

    let currentAction = animStanding;
    if (currentAction) currentAction.play();

    // Re-scale from posed standing model
    mixer.update(0); female.mesh.updateMatrixWorld(true);
    const posed = new THREE.Box3();
    model.traverse(o => {
      if (o.isSkinnedMesh && o.visible) {
        o.computeBoundingBox();
        posed.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
    });
    const posedH = posed.getSize(new THREE.Vector3()).y;
    if (posedH > 0) model.scale.multiplyScalar(HEIGHT_FEMALE / posedH);

    function playAction(nextAction, fadeDur = 0.4) {
      if (!nextAction || nextAction === currentAction) return;
      if (currentAction) currentAction.fadeOut(fadeDur);
      nextAction.reset().fadeIn(fadeDur).play();
      currentAction = nextAction;
    }

    const origUpdate = female.update.bind(female);
    female.glb = model;
    female.mixer = mixer;
    female.actions = actions;

    female.update = function (dt, t, player) {
      origUpdate(dt, t, player);

      if (this.state === 'walk' || this.state === 'pace') {
        const baseWalkSpeed = this.P?.walk || 0.95;
        const curSpeed = (this.speed && this.speed > 0.05) ? this.speed : baseWalkSpeed;
        const speedRatio = Math.max(0.35, Math.min(2.0, curSpeed / baseWalkSpeed));
        if (animWalk) {
          animWalk.timeScale = speedRatio * (this.state === 'pace' ? 1.15 : 1.0);
        }
        playAction(animWalk, 0.35);
      } else if (this.state === 'rest') {
        if (this.timer > 10) {
          playAction(animSleeping, 0.6);
        } else {
          playAction(animSitting, 0.5);
        }
      } else if (this.state === 'sit') {
        playAction(animSitting, 0.4);
      } else {
        // 'idle', 'alert', 'look', etc.
        playAction(animStanding, 0.35);
      }

      mixer.update(dt);
    };

    attached.push(female);
  }

  console.info(`[igzp] Attached rigged & animated Lioness GLB to ${females.length} female lion(s) with animations:`, Object.keys(females[0]?.actions || {}));
  return attached;
}

/**
 * Attaches Lion GLBs to all lions in the enclosure (both male and female lionesses).
 */
export async function attachLionGLB(animals) {
  // 1. Attach female lionesses
  let attachedFemales = [];
  try {
    attachedFemales = await attachLionessGLB(animals);
  } catch (err) {
    console.warn('[igzp] Could not attach Lioness GLB:', err.message);
  }

  // 2. Attach male lion
  const male = animals.list.find(a => (a.species === 'lion' || a.fam === 'lion') && a.meta?.male !== false);
  if (!male) {
    return attachedFemales[0] || null;
  }

  const GLTFLoader = await getGLTFLoader();
  if (!GLTFLoader) return attachedFemales[0] || null;

  const gltf = await new GLTFLoader().loadAsync(URL_MALE_GLB);
  const model = gltf.scene;

  setupLionModel(model, HEIGHT_MALE, male);

  // Set up AnimationMixer with all baked animations ('walk', 'standing', 'sitting', 'sleeping', 'roaring')
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) {
    const key = clip.name.toLowerCase();
    actions[key] = mixer.clipAction(clip);
  }

  const animStanding = actions['standing'] || actions['idle'] || Object.values(actions)[0];
  const animWalk = actions['walk'] || actions['walking'] || animStanding;
  const animSitting = actions['sitting'] || animStanding;
  const animSleeping = actions['sleeping'] || animSitting;
  const animRoaring = actions['roaring'] || animStanding;

  let currentAction = animStanding;
  if (currentAction) currentAction.play();

  // Re-scale from posed standing model
  mixer.update(0); male.mesh.updateMatrixWorld(true);
  const posed = new THREE.Box3();
  model.traverse(o => {
    if (o.isSkinnedMesh && o.visible) {
      o.computeBoundingBox();
      posed.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
    }
  });
  const posedH = posed.getSize(new THREE.Vector3()).y;
  if (posedH > 0) model.scale.multiplyScalar(HEIGHT_MALE / posedH);

  function playAction(nextAction, fadeDur = 0.4) {
    if (!nextAction || nextAction === currentAction) return;
    if (currentAction) currentAction.fadeOut(fadeDur);
    nextAction.reset().fadeIn(fadeDur).play();
    currentAction = nextAction;
  }

  const origUpdate = male.update.bind(male);
  male.glb = model;
  male.mixer = mixer;
  male.actions = actions;

  male.update = function (dt, t, player) {
    origUpdate(dt, t, player);

    if (this.state === 'walk' || this.state === 'pace') {
      const baseWalkSpeed = this.P?.walk || 0.95;
      const curSpeed = (this.speed && this.speed > 0.05) ? this.speed : baseWalkSpeed;
      const speedRatio = Math.max(0.35, Math.min(2.0, curSpeed / baseWalkSpeed));
      if (animWalk) {
        animWalk.timeScale = speedRatio * (this.state === 'pace' ? 1.15 : 1.0);
      }
      playAction(animWalk, 0.35);
    } else if (this.state === 'roar') {
      playAction(animRoaring, 0.25);
    } else if (this.state === 'rest') {
      if (this.timer > 10) {
        playAction(animSleeping, 0.6);
      } else {
        playAction(animSitting, 0.5);
      }
    } else if (this.state === 'sit') {
      playAction(animSitting, 0.4);
    } else {
      // 'idle', 'alert', etc.
      playAction(animStanding, 0.35);
    }

    mixer.update(dt);
  };

  console.info('[igzp] Attached rigged & animated Male Lion GLB with animations:', Object.keys(actions));
  return male;
}
