import * as THREE from 'three';
import { WORLD } from '../config.js';

// Shared GLSL value noise and procedural generators.
export const NOISE_GLSL = /* glsl */`
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
float fbm5(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.02; a *= 0.5; } return s; }`;

export function buildTerrain(layers, Q, U) {
  const [sx, sz] = Q.terrainSeg;
  const g = new THREE.PlaneGeometry(WORLD.sizeX, WORLD.sizeZ, sx, sz);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const hgt = new Uint16Array(p.count);       // vertex heights, row-major (x then z), reused by the grass shader
  for (let i = 0; i < p.count; i++) {
    const h = layers.heightAt(p.getX(i), p.getZ(i));
    p.setY(i, h);
    hgt[i] = THREE.DataUtils.toHalfFloat(h);
  }
  g.computeVertexNormals();
  const heightTex = new THREE.DataTexture(hgt, sx + 1, sz + 1, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  const maskTex = new THREE.CanvasTexture(layers.maskCanvas);
  maskTex.colorSpace = THREE.NoColorSpace;
  maskTex.minFilter = THREE.LinearFilter;
  maskTex.generateMipmaps = false;
  maskTex.flipY = false;   // canvas row 0 = north edge (z0), matching the DataTextures

  const wd = new Uint8Array(layers.W * layers.H);
  for (let i = 0; i < wd.length; i++) wd[i] = Math.min(255, layers.waterSoft[i] * 255);
  const waterTex = new THREE.DataTexture(wd, layers.W, layers.H, THREE.RedFormat, THREE.UnsignedByteType);
  waterTex.magFilter = waterTex.minFilter = THREE.LinearFilter;
  waterTex.needsUpdate = true;

  const shared = {
    uMask: { value: maskTex },
    uWater: { value: waterTex },
    uHeight: { value: heightTex },
    uOrigin: { value: new THREE.Vector2(layers.x0, layers.z0) },
    uSize: { value: new THREE.Vector2(WORLD.sizeX, WORLD.sizeZ) },
  };

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  mat.envMapIntensity = 0.35;
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, shared, { uTime: U.uTime });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP; varying vec3 vWN;
        uniform sampler2D uMask; uniform sampler2D uWater;
        uniform vec2 uOrigin; uniform vec2 uSize; uniform float uTime;
        ${NOISE_GLSL}`)
      .replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        vec2 luv_r = (vWP.xz - uOrigin) / uSize;
        float wtr_r = texture2D(uWater, luv_r).r;
        vec4 m_r = texture2D(uMask, luv_r);
        float slope_r = 1.0 - vWN.y;

        // Base dry terrain is rough (0.95)
        float rough = 0.95;
        // Wet mud banks around water enclosures & lakes have realistic specular sheen (0.22)
        rough = mix(rough, 0.22, smoothstep(0.08, 0.38, wtr_r));
        // Rocky cliffs on hills are slightly smoother metamorphic rock (0.86)
        rough = mix(rough, 0.86, smoothstep(0.24, 0.48, slope_r));
        // Compacted tar roads
        rough = mix(rough, 0.82, smoothstep(0.40, 0.80, m_r.r));
        roughnessFactor = rough;`)
      .replace('#include <color_fragment>', /* glsl */`
        vec2 luv = (vWP.xz - uOrigin) / uSize;
        vec4 m = texture2D(uMask, luv);
        float wtr = texture2D(uWater, luv).r;
        vec2 q = vWP.xz;

        // Multi-frequency noise octaves
        float nMacro = fbm(q * 0.006);
        float n1 = vnoise(q * 0.065);
        float n2 = vnoise(q * 0.42);
        float n3 = vnoise(q * 2.6);
        float n4 = vnoise(q * 10.5);

        // 1. BASE GRASS: Coastal Andhra dry-season meadow mix
        vec3 greenGrass = vec3(0.24, 0.33, 0.12);
        vec3 dryGrass   = vec3(0.44, 0.41, 0.20);
        vec3 col = mix(greenGrass, dryGrass, smoothstep(0.35, 0.72, nMacro * 0.7 + n1 * 0.5));
        col *= 0.82 + 0.24 * n2 + 0.10 * n4;

        // 2. RICH MULTI-OCTAVE SOIL TEXTURING (ferric laterite, ochre loam, dark humus, quartz grit)
        float soilMacro = fbm(q * 0.012 + vec2(7.3, 11.2));
        float soilMeso  = vnoise(q * 0.14) * 0.6 + vnoise(q * 0.58) * 0.4;
        float soilMicro = vnoise(q * 3.6) * 0.55 + vnoise(q * 13.0) * 0.45;
        float soilPebbles = step(0.90, vnoise(q * 30.0));

        vec3 redLaterite = vec3(0.48, 0.24, 0.14);
        vec3 ochreLoam   = vec3(0.58, 0.36, 0.18);
        vec3 darkHumus   = vec3(0.27, 0.18, 0.11);
        vec3 quartzGrit  = vec3(0.62, 0.50, 0.36);

        vec3 richSoil = mix(redLaterite, ochreLoam, smoothstep(0.32, 0.68, soilMacro));
        richSoil = mix(richSoil, darkHumus, smoothstep(0.52, 0.84, soilMeso) * 0.50);
        richSoil *= 0.80 + 0.36 * soilMicro;
        richSoil = mix(richSoil, quartzGrit, soilPebbles * 0.45);

        // Bare laterite soil patches breaking through dry grass
        float bareSoilMask = smoothstep(0.58, 0.80, vnoise(q * 0.024 + 7.0) * 0.68 + n2 * 0.32 + soilMeso * 0.2);
        col = mix(col, richSoil, bareSoilMask * 0.70);

        // 3. FOREST FLOOR: Deep leaf litter, fallen twigs & humus on hills and perimeter woods
        float ze = length(vWP.xz / vec2(640.0, 430.0)) * (1.0 + (fbm(vWP.xz * 0.006) - 0.5) * 0.25);
        float forest = smoothstep(6.0, 16.0, vWP.y) + smoothstep(0.92, 1.05, ze);
        vec3 leafLitter = vec3(0.26, 0.21, 0.13) * (0.80 + 0.40 * n2 + 0.20 * n4);
        col = mix(col, leafLitter, clamp(forest, 0.0, 1.0) * 0.75);

        // 4. ROCKY SLOPE STRATIFICATION ON HILLS (Khondalite & charnockite metamorphic banding)
        float slope = 1.0 - vWN.y;
        float strataY = vWP.y * 1.05 + sin(vWP.x * 0.028 + vWP.z * 0.018) * 1.8 + vnoise(vWP.xz * 0.08) * 1.3;
        float strataBand = sin(strataY * 1.7) * 0.5 + 0.5;
        float strataFine = sin(strataY * 5.0 + vnoise(vWP.xz * 0.22) * 2.0) * 0.5 + 0.5;

        vec3 rockDarkChar   = vec3(0.24, 0.22, 0.21);   // Charnockite dark band
        vec3 rockKhondalite = vec3(0.36, 0.33, 0.29);   // Weathered khondalite
        vec3 rockRustStrata = vec3(0.44, 0.30, 0.21);   // Ferruginous quartzite / iron vein
        vec3 rockPaleQuartz = vec3(0.49, 0.46, 0.41);   // Quartzite mineral streak

        vec3 rockCol = mix(rockDarkChar, rockKhondalite, strataBand);
        rockCol = mix(rockCol, rockRustStrata, smoothstep(0.35, 0.65, strataFine) * 0.45);
        rockCol = mix(rockCol, rockPaleQuartz, step(0.86, strataFine) * 0.35);

        // Metamorphic fractures & micro crevices
        float rockCracks = smoothstep(0.65, 0.90, vnoise(q * 1.3) * 0.6 + vnoise(q * 4.8) * 0.4);
        rockCol *= 0.78 + 0.35 * (1.0 - rockCracks * 0.55);

        // Sage cliff lichen in sheltered north/rock crevices
        float rockLichen = smoothstep(0.60, 0.86, vnoise(q * 0.35 + vec2(15.0, -9.0))) * smoothstep(0.25, 0.45, slope);
        rockCol = mix(rockCol, vec3(0.31, 0.35, 0.23), rockLichen * 0.42);

        // Loose talus/scree rubble at the base of slopes
        vec3 scree = mix(richSoil, rockCol, 0.65) * (0.85 + 0.25 * n3);
        col = mix(col, scree, smoothstep(0.18, 0.30, slope) * (1.0 - smoothstep(0.30, 0.48, slope)));
        col = mix(col, rockCol, smoothstep(0.28, 0.48, slope));

        // 5. ENCLOSURE FLOORS: Trodden earth & habitat-specific soil
        vec3 troddenEarth = vec3(0.44, 0.31, 0.21) * (0.84 + 0.26 * n3 + 0.12 * n4);
        col = mix(col, troddenEarth, smoothstep(0.35, 0.95, m.b) * (0.55 + 0.45 * n1));
        col = mix(col, col * 0.85 + vec3(0.03, 0.02, 0.0), smoothstep(0.2, 0.35, m.b));

        // 6. WET MUD BANKS AROUND WATER ENCLOSURES & LAKES
        // Deep saturated organic mud near water, transitioning to drying mud crust & wallows
        vec3 saturatedMud = vec3(0.13, 0.10, 0.07);
        vec3 wetBankMud   = vec3(0.20, 0.15, 0.10);
        vec3 dryMudCrust  = vec3(0.34, 0.25, 0.17);

        vec3 mudCol = mix(dryMudCrust, wetBankMud, smoothstep(0.08, 0.20, wtr));
        mudCol = mix(mudCol, saturatedMud, smoothstep(0.18, 0.38, wtr));
        float mudCracks = smoothstep(0.60, 0.82, vnoise(q * 2.4) * 0.7 + vnoise(q * 8.0) * 0.3);
        mudCol *= 0.86 + 0.24 * n3;
        mudCol = mix(mudCol, mudCol * 0.78, mudCracks * 0.45);

        // Enclosure wallowing expands mud banks (e.g. hippo pool, tiger moat, elephant wallows)
        float wallowZone = smoothstep(0.20, 0.65, m.b) * smoothstep(0.04, 0.18, wtr);
        float mudMask = clamp(smoothstep(0.06, 0.32, wtr) + wallowZone * 0.85, 0.0, 1.0);
        col = mix(col, mudCol, mudMask);

        // 7. WORN MURRAM VERGES & ROADS
        // Compacted orange-red laterite murram with gravel
        vec3 murramCore = vec3(0.56, 0.34, 0.20) * (0.86 + 0.20 * n3 + 0.12 * n4) + 0.06 * step(0.91, vnoise(q * 28.0));
        vec3 murramDust = vec3(0.48, 0.32, 0.19) * (0.84 + 0.26 * n3);

        // Organic edge erosion for walking paths and roads
        float edgeErosion = (vnoise(q * 0.5) - 0.5) * 0.14;
        float pathVerge = smoothstep(0.16, 0.42, m.g + edgeErosion);
        float pathCore  = smoothstep(0.40, 0.74, m.g);

        // Blend worn murram verge on path shoulders, and compacted core on path center
        col = mix(col, murramDust, pathVerge);
        col = mix(col, murramCore, pathCore);

        // Tar roads with worn murram verges, patching and aggregate flecks
        float roadVerge = smoothstep(0.18, 0.48, m.r + edgeErosion);
        float roadCore  = smoothstep(0.48, 0.82, m.r);

        vec3 tarAsphalt = vec3(0.16, 0.16, 0.17) * (0.82 + 0.24 * n3 + 0.14 * n4)
                        + vec3(0.04) * smoothstep(0.68, 0.85, vnoise(q * 0.28))
                        + vec3(0.03) * step(0.88, vnoise(q * 18.0));

        // Road shoulder has worn murram verge, transitioning to solid asphalt center
        col = mix(col, murramDust * 0.90, roadVerge);
        col = mix(col, tarAsphalt, roadCore);

        diffuseColor.rgb = col;`);
  };
  mat.customProgramCacheKey = () => 'terrain';
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, maskTex, waterTex, shared, heightTex, grid: [sx + 1, sz + 1] };
}
