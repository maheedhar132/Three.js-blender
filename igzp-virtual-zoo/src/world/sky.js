import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.38).normalize();   // late-morning sun from the south-east (approximate)
const HAZE = new THREE.Color('#c9d4d8');

/** Sky dome, sun, hemisphere light, haze, and an environment map for reflections. */
export function buildSky(renderer, scene, Q) {
  scene.fog = new THREE.FogExp2(HAZE.clone(), 0.0016);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, cZen: { value: new THREE.Color('#3a78c4') }, cHor: { value: HAZE.clone() }, cGround: { value: new THREE.Color('#8d9580') } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, cZen, cHor, cGround; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 col = y > 0.0 ? mix(cHor, cZen, pow(clamp(y, 0.0, 1.0), 0.55)) : mix(cHor, cGround, pow(clamp(-y, 0.0, 1.0), 0.4));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 18.0 + pow(s, 12.0) * 0.25);
        // thin high cloud streaks
        vec2 cp = d.xz / max(y, 0.08);
        float cl = smoothstep(0.55, 0.9, sin(cp.x * 1.7 + sin(cp.y * 0.9) * 2.0) * 0.5 + 0.5) * smoothstep(0.05, 0.4, y) * 0.18;
        col = mix(col, vec3(1.0), cl);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.scale.setScalar(2000); sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#b4cde6', '#5b5038', 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 2.7);
  sun.castShadow = Q.shadows;
  sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
  const S = 70; Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 400 });
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // environment map from the sky only (gives soft sky reflections on water and glossy surfaces)
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); const envSky = sky.clone(); envSky.scale.setScalar(100); envScene.add(envSky);
  envScene.add(new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2).translate(0, -2, 0), new THREE.MeshBasicMaterial({ color: '#5f6a48' })));
  scene.environment = pm.fromScene(envScene, 0.02).texture;
  pm.dispose();

  const _t = new THREE.Vector3();
  return {
    sky, sun, hemi,
    /** Keep the shadow frustum centred just ahead of the camera, snapped to texels. */
    follow(camera) {
      camera.getWorldDirection(_t);
      const fx = Math.round((camera.position.x + _t.x * 30) / 2) * 2, fz = Math.round((camera.position.z + _t.z * 30) / 2) * 2;
      sun.target.position.set(fx, camera.position.y - 2, fz);
      sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 180);
      sun.target.updateMatrixWorld();
      sky.position.copy(camera.position);
    },
  };
}
