// Integration for the rigged & animated Chimpanzee-Rigged.glb.
// Features authentic primate anatomy and 5 baked animated actions:
//   - 'knuckle_walk' : 4-beat alternating quadrupedal knuckle-walking cycle with shoulder roll and arm-leg swinging
//   - 'standing'     : Semi-upright bipedal alert stance with bent knees, loose curved arms, chest breathing, and vigilant gaze
//   - 'sitting'      : Relaxed seated haunches pose on ground with upright spine and hands resting on knees
//   - 'sleeping'     : Deep resting curled pose on ground with tucked limbs and slow peaceful respiration
//   - 'grooming'     : Social mutual grooming with focused downward gaze, delicate finger-picking and fur-parting gestures, and soft lip-smacking
import * as THREE from 'three';

const URL_GLB = './Chimpanzee-Rigged.glb';
const HEIGHT_KNUCKLE_WALK = 0.76; // Natural Pan troglodytes shoulder/withers height in knuckle-walking stance (metres)

let _GLTFLoaderClass = null;
async function getGLTFLoader() {
  if (_GLTFLoaderClass) return _GLTFLoaderClass;
  if (typeof window !== 'undefined' && !globalThis.process?.versions?.node) {
    const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
    _GLTFLoaderClass = mod.GLTFLoader;
  }
  return _GLTFLoaderClass;
}

/**
 * Configure and attach Chimpanzee-Rigged.glb model to a chimpanzee animal instance.
 */
function setupChimpModel(model, targetHeight, chimp) {
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
        o.material.needsUpdate = true;
      }
    }
  });

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = (targetHeight / (size.y || 1)) / (chimp.k || 1);
  model.scale.setScalar(scale);

  // Model is exported facing -Y in Blender (+Z forward in Three.js glTF convention)
  model.rotation.y = 0;

  // Hide the procedural low-poly body and limbs on the chimpanzee
  if (chimp.mesh.material) {
    chimp.mesh.material.visible = false;
  }
  for (const c of chimp.mesh.children) {
    if (c.isMesh) c.visible = false;
  }
  chimp.mesh.add(model);
}

/**
 * Attaches Chimpanzee-Rigged.glb to all chimpanzees in the zoo.
 * Sets up Three.js AnimationMixer for knuckle_walk, standing, sitting, sleeping, and grooming.
 */
export async function attachChimpanzeeGLB(animals) {
  if (!animals || !animals.list) return [];
  const chimps = animals.list.filter(a => a.species === 'chimpanzee' || a.meta?.chimpanzee);
  if (!chimps.length) return [];

  const GLTFLoader = await getGLTFLoader();
  if (!GLTFLoader) return [];

  const loader = new GLTFLoader();
  let baseGltf;
  try {
    baseGltf = await loader.loadAsync(URL_GLB);
  } catch (err) {
    console.warn('[igzp] Could not load Chimpanzee-Rigged.glb:', err.message);
    return [];
  }

  const attached = [];
  for (let idx = 0; idx < chimps.length; idx++) {
    const chimp = chimps[idx];
    let gltf;
    if (idx === 0) {
      gltf = baseGltf;
    } else {
      gltf = await loader.loadAsync(URL_GLB);
    }
    const model = gltf.scene;

    setupChimpModel(model, HEIGHT_KNUCKLE_WALK, chimp);

    // Set up AnimationMixer with all 5 baked animations
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) {
      const key = clip.name.toLowerCase();
      actions[key] = mixer.clipAction(clip);
    }

    const animKnuckleWalk = actions['knuckle_walk'] || actions['walk'] || actions['walking'];
    const animStanding = actions['standing'] || actions['idle'] || Object.values(actions)[0];
    const animSitting = actions['sitting'] || animStanding;
    const animSleeping = actions['sleeping'] || animSitting;
    const animGrooming = actions['grooming'] || actions['groom'] || animSitting;

    let currentAction = animKnuckleWalk || animStanding;
    if (currentAction) currentAction.play();

    // Verify and re-scale against posed knuckle-walking model
    mixer.update(0);
    chimp.mesh.updateMatrixWorld(true);
    const posed = new THREE.Box3();
    model.traverse(o => {
      if (o.isSkinnedMesh && o.visible) {
        o.computeBoundingBox();
        posed.union(o.boundingBox.clone().applyMatrix4(o.matrixWorld));
      }
    });
    const posedH = posed.getSize(new THREE.Vector3()).y;
    if (posedH > 0 && Math.abs(posedH - HEIGHT_KNUCKLE_WALK) > 0.05) {
      model.scale.multiplyScalar(HEIGHT_KNUCKLE_WALK / posedH);
    }

    function playAction(nextAction, fadeDur = 0.35) {
      if (!nextAction || nextAction === currentAction) return;
      if (currentAction) currentAction.fadeOut(fadeDur);
      nextAction.reset().fadeIn(fadeDur).play();
      currentAction = nextAction;
    }

    // Extend chimpanzee update loop to drive Three.js AnimationMixer
    const origUpdate = chimp.update.bind(chimp);
    chimp.glb = model;
    chimp.mixer = mixer;
    chimp.actions = actions;

    chimp.update = function (dt, t, player) {
      // Run native movement and behavior state machine
      origUpdate(dt, t, player);

      // Map behavioral states to animation clips with smooth cross-fading
      if (this.state === 'walk' || (this.state === 'approach' && this.speed > 0.08)) {
        const baseWalkSpeed = this.P?.walk || 1.0;
        const curSpeed = (this.speed && this.speed > 0.05) ? this.speed : baseWalkSpeed;
        const speedRatio = Math.max(0.35, Math.min(2.0, curSpeed / baseWalkSpeed));
        if (animKnuckleWalk) {
          animKnuckleWalk.timeScale = speedRatio;
        }
        playAction(animKnuckleWalk, 0.3);
      } else if (this.state === 'groom') {
        playAction(animGrooming, 0.35);
      } else if (this.state === 'sit') {
        playAction(animSitting, 0.4);
      } else if (this.state === 'rest') {
        // Alternate between quiet sitting and deep curled sleep
        if (this.timer > 8) {
          playAction(animSleeping, 0.6);
        } else {
          playAction(animSitting, 0.45);
        }
      } else {
        // 'idle', 'alert', 'climb' / approach
        playAction(animStanding, 0.35);
      }

      mixer.update(dt);
    };

    attached.push(chimp);
  }

  console.info(`[igzp] Attached rigged & animated Chimpanzee GLB (${attached.length} individuals) with animations:`, Object.keys(baseGltf.animations.map(a => a.name)));
  return attached;
}
