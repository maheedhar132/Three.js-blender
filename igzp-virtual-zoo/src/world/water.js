import * as THREE from 'three';
import { WORLD, toWorld } from '../config.js';
import { WATER } from '../data/zoo-layout.js';
import { NOISE_GLSL } from './terrain.js';
import { rr, rand, mat4, V3 } from '../core/util.js';
import { SUN_DIR } from './sky.js';

/**
 * Realistic water plane at y = WORLD.waterLevel (0), discarded outside water bodies.
 * Features:
 * - Multi-wave Gerstner wave vertex displacement with sharp crests & rolling troughs
 * - Shoreline edge foam along banks and enclosure pools
 * - Depth-dependent optical absorption (translucent shallow turquoise to deep wetland tone)
 * - Sun specular highlights and caustic shimmer on shallow beds
 */
export function buildWater(layers, terrainShared, U) {
  // Subdivided plane geometry for vertex wave displacement
  const sx = 256, sz = 192;
  const g = new THREE.PlaneGeometry(WORLD.sizeX, WORLD.sizeZ, sx, sz);
  g.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: '#1a3c36',
    roughness: 0.04,
    metalness: 0.0,
    transparent: true,
    opacity: 0.90,
  });
  mat.envMapIntensity = 1.0;

  const ponds = layers.enclosurePonds || [];
  const pondData = ponds.map(p => new THREE.Vector4(p.x, p.z, p.r, p.waterLevel));
  while (pondData.length < 16) pondData.push(new THREE.Vector4(0, 0, 0, 0));

  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, terrainShared, {
      uTime: U.uTime,
      uSunDir: { value: SUN_DIR },
      uPonds: { value: pondData },
      uPondCount: { value: Math.min(16, ponds.length) },
    });

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP;
varying vec3 vWorldNormal;
varying float vWaveHeight;
varying float vWaterMask;
uniform sampler2D uWater;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uTime;
uniform vec4 uPonds[16];
uniform int uPondCount;

// Shared wave temporary registers across vertex shader chunks
vec3 gDisp = vec3(0.0);
vec3 gNorm = vec3(0.0, 1.0, 0.0);

// 4-harmonic Gerstner wave displacement & analytical normal calculation
void gerstnerDisplace(vec2 p0, float t, float shoreMask, out vec3 disp, out vec3 nrm) {
  vec2 d1 = normalize(vec2(0.82, 0.57));
  vec2 d2 = normalize(vec2(-0.45, 0.89));
  vec2 d3 = normalize(vec2(0.35, -0.94));
  vec2 d4 = normalize(vec2(-0.72, -0.69));

  // Wavelengths, amplitudes, steepnesses, frequencies
  // Sum of steepness <= 1.0 to prevent crest self-intersection loops
  float k1 = 6.28318 / 15.0, a1 = 0.11,  q1 = 0.35, w1 = sqrt(9.81 * k1);
  float k2 = 6.28318 / 9.0,  a2 = 0.065, q2 = 0.28, w2 = sqrt(9.81 * k2);
  float k3 = 6.28318 / 5.2,  a3 = 0.035, q3 = 0.22, w3 = sqrt(9.81 * k3);
  float k4 = 6.28318 / 2.6,  a4 = 0.018, q4 = 0.15, w4 = sqrt(9.81 * k4);

  float phi1 = dot(d1, p0) * k1 - w1 * t;
  float phi2 = dot(d2, p0) * k2 - w2 * t * 1.1;
  float phi3 = dot(d3, p0) * k3 - w3 * t * 1.25;
  float phi4 = dot(d4, p0) * k4 - w4 * t * 1.4;

  float s1 = sin(phi1), c1 = cos(phi1);
  float s2 = sin(phi2), c2 = cos(phi2);
  float s3 = sin(phi3), c3 = cos(phi3);
  float s4 = sin(phi4), c4 = cos(phi4);

  // Sharp crests and rolling troughs
  float dx = -(d1.x * q1 * a1 * s1 + d2.x * q2 * a2 * s2 + d3.x * q3 * a3 * s3 + d4.x * q4 * a4 * s4);
  float dz = -(d1.y * q1 * a1 * s1 + d2.y * q2 * a2 * s2 + d3.y * q3 * a3 * s3 + d4.y * q4 * a4 * s4);
  float dy = a1 * c1 + a2 * c2 + a3 * c3 + a4 * c4;

  // Shoreline damping so waves smoothly fade at banks and never breach dry land
  float damp = smoothstep(0.18, 0.42, shoreMask);
  disp = vec3(dx, dy, dz) * damp;

  // Analytical Gerstner wave normal
  float wa1 = k1 * a1, wa2 = k2 * a2, wa3 = k3 * a3, wa4 = k4 * a4;
  float nX = -(d1.x * wa1 * s1 + d2.x * wa2 * s2 + d3.x * wa3 * s3 + d4.x * wa4 * s4) * damp;
  float nZ = -(d1.y * wa1 * s1 + d2.y * wa2 * s2 + d3.y * wa3 * s3 + d4.y * wa4 * s4) * damp;
  float nY = 1.0 - (q1 * wa1 * c1 + q2 * wa2 * c2 + q3 * wa3 * c3 + q4 * wa4 * c4) * damp;
  nrm = normalize(vec3(nX, max(0.1, nY), nZ));
}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec2 luv_v = (position.xz - uOrigin) / uSize;
float wsoft_v = texture2D(uWater, luv_v).r;
vWaterMask = wsoft_v;
gDisp = vec3(0.0);
gNorm = vec3(0.0, 1.0, 0.0);
bool inElevatedPond = false;
for (int i = 0; i < 16; i++) {
  if (i >= uPondCount) break;
  if (length(position.xz - uPonds[i].xy) < uPonds[i].z * 1.05) { inElevatedPond = true; break; }
}
if (wsoft_v > 0.16 && !inElevatedPond) {
  gerstnerDisplace(position.xz, uTime, wsoft_v, gDisp, gNorm);
  objectNormal = gNorm;
}
vWaveHeight = gDisp.y;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += gDisp;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWP;
varying vec3 vWorldNormal;
varying float vWaveHeight;
varying float vWaterMask;
uniform sampler2D uWater;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec4 uPonds[16];
uniform int uPondCount;
${NOISE_GLSL}

// Shared foam strength register across fragment shader chunks
float totalFoam = 0.0;

// Procedural caustic pattern for sun rays on shallow beds
float caustics(vec2 p, float t) {
  vec2 p1 = p * 1.8 + vec2(t * 0.45, t * 0.28);
  vec2 p2 = p * 1.8 + vec2(-t * 0.32, t * 0.38);
  float c1 = sin(p1.x * 2.1 + sin(p1.y * 1.6) * 2.2) * 0.5 + 0.5;
  float c2 = sin(p2.y * 1.9 + sin(p2.x * 1.7) * 2.2) * 0.5 + 0.5;
  return pow(min(c1, c2) + 0.08, 2.0) * 2.6;
}

// Procedural cellular foam generator for shoreline edges & crest whitecaps
float foamPattern(vec2 p, float t) {
  vec2 p1 = p * 3.8 + vec2(t * 0.12, -t * 0.09);
  vec2 p2 = p * 8.5 - vec2(t * 0.18, t * 0.14);
  vec2 p3 = p * 18.0 + vec2(t * 0.25, -t * 0.20);
  float n1 = vnoise(p1);
  float n2 = vnoise(p2);
  float n3 = vnoise(p3);
  float f = n1 * 0.50 + n2 * 0.35 + n3 * 0.15;
  return smoothstep(0.38, 0.72, f);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
vec2 luv_r = (vWP.xz - uOrigin) / uSize;
float wsoft_r = texture2D(uWater, luv_r).r;
if (wsoft_r < 0.18) discard;

for (int i = 0; i < 16; i++) {
  if (i >= uPondCount) break;
  if (length(vWP.xz - uPonds[i].xy) < uPonds[i].z * 1.05) discard;
}

// Shoreline edge foam calculation along banks and enclosure pools
float shoreEdge_r = 1.0 - smoothstep(0.18, 0.32, wsoft_r);
float waveSurge_r = sin(uTime * 2.4 + dot(vWP.xz, vec2(0.5, 0.4)) * 0.4) * 0.5 + 0.5;
float shoreSwash_r = smoothstep(0.18, 0.30 + 0.04 * waveSurge_r, wsoft_r) * (1.0 - smoothstep(0.24, 0.36 + 0.05 * waveSurge_r, wsoft_r));
float shoreFoamVal_r = max(shoreEdge_r * 0.9, shoreSwash_r * 1.1);
float foamCell_r = foamPattern(vWP.xz, uTime);
float edgeFoam_r = shoreFoamVal_r * foamCell_r * 1.5;

// Wave crest foam (whitecaps on steep Gerstner crests in open water)
float crestFoam_r = smoothstep(0.09, 0.16, vWaveHeight) * smoothstep(0.35, 0.75, wsoft_r) * foamPattern(vWP.xz * 1.5, uTime * 1.3) * 0.85;
totalFoam = clamp(edgeFoam_r + crestFoam_r, 0.0, 1.0);

// Open water is glassy smooth specular (0.04), foam is diffuse rough froth (0.65)
roughnessFactor = mix(0.04, 0.65, totalFoam);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 luv = (vWP.xz - uOrigin) / uSize;
float wsoft = texture2D(uWater, luv).r;
if (wsoft < 0.18) discard;

// 1. Depth-dependent optical absorption (translucent shallow turquoise to deep wetland tone)
float depth = smoothstep(0.20, 0.82, wsoft);
vec3 shallowTurquoise = vec3(0.18, 0.52, 0.46);
vec3 midWetlandTeal   = vec3(0.08, 0.28, 0.24);
vec3 deepWetlandTone  = vec3(0.03, 0.09, 0.08);

vec3 waterColor = mix(shallowTurquoise, midWetlandTeal, smoothstep(0.0, 0.42, depth));
waterColor = mix(waterColor, deepWetlandTone, smoothstep(0.38, 1.0, depth));

// Natural organic wetland tone variation
float organicTint = vnoise(vWP.xz * 0.04) * 0.6 + vnoise(vWP.xz * 0.16) * 0.4;
waterColor *= 0.88 + 0.24 * organicTint;

// Translucent in shallows, opaque in deep water
float waterAlpha = mix(0.68, 0.97, smoothstep(0.0, 0.65, depth));

// 2. Caustic shimmer on shallow beds
float shallowBed = (1.0 - smoothstep(0.20, 0.58, wsoft));
float causticInt = caustics(vWP.xz, uTime) * shallowBed;
vec3 causticColor = vec3(0.38, 0.60, 0.54) * causticInt * max(0.0, uSunDir.y);

// 3. Shoreline edge foam & whitecap blend
vec3 foamColor = vec3(0.92, 0.96, 0.98);
diffuseColor.rgb = mix(waterColor + causticColor, foamColor, totalFoam);
diffuseColor.a = mix(waterAlpha, 0.98, totalFoam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  // High-frequency capillary ripples for sparkling micro-facets
  vec2 p = vWP.xz;
  float t = uTime;
  vec2 uv1 = p * 1.5 + vec2(t * 0.35, t * 0.22);
  vec2 uv2 = p * 3.2 - vec2(t * 0.45, -t * 0.28);
  float eps = 0.12;
  float nr0 = vnoise(uv1) + vnoise(uv2) * 0.5;
  float nrx = vnoise(uv1 + vec2(eps * 1.5, 0.0)) + vnoise(uv2 + vec2(eps * 3.2, 0.0)) * 0.5;
  float nrz = vnoise(uv1 + vec2(0.0, eps * 1.5)) + vnoise(uv2 + vec2(0.0, eps * 3.2)) * 0.5;
  vec3 micro = vec3(-(nrx - nr0) / eps * 0.12, 1.0, -(nrz - nr0) / eps * 0.12);
  vec3 wn = normalize(vWorldNormal + micro * 0.30);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
{
  // 4. Sun specular highlights with Fresnel reflection
  vec3 V = normalize(cameraPosition - vWP);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float NdotH = max(0.0, dot(vWorldNormal, H));
  float NdotV = max(0.0, dot(vWorldNormal, V));
  float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - NdotV, 0.0, 1.0), 5.0);
  float sunSpec = pow(NdotH, 256.0) * 10.0 + pow(NdotH, 36.0) * 1.2;
  vec3 sunGlint = vec3(1.0, 0.95, 0.85) * sunSpec * fresnel * (1.0 - totalFoam * 0.85);
  gl_FragColor.rgb += sunGlint;
}`);
  };

  mat.customProgramCacheKey = () => 'water_v2';
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.y = WORLD.waterLevel;
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;

  // -------------------------------------------------------------
  // Elevated Enclosure Ponds (Swan pond at y ~ 2.4m, etc.)
  // -------------------------------------------------------------
  if (ponds.length > 0) {
    const pondMat = new THREE.MeshStandardMaterial({
      color: '#1a463e',
      roughness: 0.03,
      metalness: 0.0,
      transparent: true,
      opacity: 0.92,
    });
    pondMat.envMapIntensity = 1.2;

    pondMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, terrainShared, {
        uTime: U.uTime,
        uSunDir: { value: SUN_DIR },
      });

      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
varying vec3 vWP;
varying vec3 vWorldNormal;
varying float vWaveHeight;
varying float vWaterMask;
uniform sampler2D uWater;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uTime;

vec3 gDisp = vec3(0.0);
vec3 gNorm = vec3(0.0, 1.0, 0.0);

// Gentle glistening pond Gerstner ripples
void gerstnerDisplace(vec2 p0, float t, float shoreMask, out vec3 disp, out vec3 nrm) {
  vec2 d1 = normalize(vec2(0.82, 0.57));
  vec2 d2 = normalize(vec2(-0.45, 0.89));
  vec2 d3 = normalize(vec2(0.35, -0.94));
  vec2 d4 = normalize(vec2(-0.72, -0.69));

  // Wavelengths, amplitudes, steepnesses, frequencies tuned for glistening pond ripples
  float k1 = 6.28318 / 3.8, a1 = 0.022, q1 = 0.28, w1 = sqrt(9.81 * k1);
  float k2 = 6.28318 / 2.4, a2 = 0.014, q2 = 0.22, w2 = sqrt(9.81 * k2);
  float k3 = 6.28318 / 1.5, a3 = 0.008, q3 = 0.18, w3 = sqrt(9.81 * k3);
  float k4 = 6.28318 / 0.8, a4 = 0.004, q4 = 0.12, w4 = sqrt(9.81 * k4);

  float phi1 = dot(d1, p0) * k1 - w1 * t;
  float phi2 = dot(d2, p0) * k2 - w2 * t * 1.1;
  float phi3 = dot(d3, p0) * k3 - w3 * t * 1.25;
  float phi4 = dot(d4, p0) * k4 - w4 * t * 1.4;

  float s1 = sin(phi1), c1 = cos(phi1);
  float s2 = sin(phi2), c2 = cos(phi2);
  float s3 = sin(phi3), c3 = cos(phi3);
  float s4 = sin(phi4), c4 = cos(phi4);

  float dx = -(d1.x * q1 * a1 * s1 + d2.x * q2 * a2 * s2 + d3.x * q3 * a3 * s3 + d4.x * q4 * a4 * s4);
  float dz = -(d1.y * q1 * a1 * s1 + d2.y * q2 * a2 * s2 + d3.y * q3 * a3 * s3 + d4.y * q4 * a4 * s4);
  float dy = a1 * c1 + a2 * c2 + a3 * c3 + a4 * c4;

  float damp = smoothstep(0.18, 0.42, shoreMask);
  disp = vec3(dx, dy, dz) * damp;

  float wa1 = k1 * a1, wa2 = k2 * a2, wa3 = k3 * a3, wa4 = k4 * a4;
  float nX = -(d1.x * wa1 * s1 + d2.x * wa2 * s2 + d3.x * wa3 * s3 + d4.x * wa4 * s4) * damp;
  float nZ = -(d1.y * wa1 * s1 + d2.y * wa2 * s2 + d3.y * wa3 * s3 + d4.y * wa4 * s4) * damp;
  float nY = 1.0 - (q1 * wa1 * c1 + q2 * wa2 * c2 + q3 * wa3 * c3 + q4 * wa4 * c4) * damp;
  nrm = normalize(vec3(nX, max(0.1, nY), nZ));
}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
vec2 luv_v = (position.xz - uOrigin) / uSize;
float wsoft_v = texture2D(uWater, luv_v).r;
vWaterMask = wsoft_v;
gDisp = vec3(0.0);
gNorm = vec3(0.0, 1.0, 0.0);
if (wsoft_v > 0.16) {
  gerstnerDisplace(position.xz, uTime, wsoft_v, gDisp, gNorm);
  objectNormal = gNorm;
}
vWaveHeight = gDisp.y;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += gDisp;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);`);

      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWP;
varying vec3 vWorldNormal;
varying float vWaveHeight;
varying float vWaterMask;
uniform sampler2D uWater;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec4 uPonds[16];
uniform int uPondCount;
${NOISE_GLSL}

float totalFoam = 0.0;

float caustics(vec2 p, float t) {
  vec2 p1 = p * 1.8 + vec2(t * 0.45, t * 0.28);
  vec2 p2 = p * 1.8 + vec2(-t * 0.32, t * 0.38);
  float c1 = sin(p1.x * 2.1 + sin(p1.y * 1.6) * 2.2) * 0.5 + 0.5;
  float c2 = sin(p2.y * 1.9 + sin(p2.x * 1.7) * 2.2) * 0.5 + 0.5;
  return pow(min(c1, c2) + 0.08, 2.0) * 2.6;
}

float foamPattern(vec2 p, float t) {
  vec2 p1 = p * 3.8 + vec2(t * 0.12, -t * 0.09);
  vec2 p2 = p * 8.5 - vec2(t * 0.18, t * 0.14);
  vec2 p3 = p * 18.0 + vec2(t * 0.25, -t * 0.20);
  float n1 = vnoise(p1);
  float n2 = vnoise(p2);
  float n3 = vnoise(p3);
  float f = n1 * 0.50 + n2 * 0.35 + n3 * 0.15;
  return smoothstep(0.38, 0.72, f);
}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
vec2 luv_r = (vWP.xz - uOrigin) / uSize;
float wsoft_r = texture2D(uWater, luv_r).r;
if (wsoft_r < 0.18) discard;

float shoreEdge_r = 1.0 - smoothstep(0.18, 0.32, wsoft_r);
float waveSurge_r = sin(uTime * 2.4 + dot(vWP.xz, vec2(0.5, 0.4)) * 0.4) * 0.5 + 0.5;
float shoreSwash_r = smoothstep(0.18, 0.30 + 0.04 * waveSurge_r, wsoft_r) * (1.0 - smoothstep(0.24, 0.36 + 0.05 * waveSurge_r, wsoft_r));
float shoreFoamVal_r = max(shoreEdge_r * 0.9, shoreSwash_r * 1.1);
float foamCell_r = foamPattern(vWP.xz, uTime);
float edgeFoam_r = shoreFoamVal_r * foamCell_r * 1.5;

float crestFoam_r = smoothstep(0.016, 0.035, vWaveHeight) * smoothstep(0.35, 0.75, wsoft_r) * foamPattern(vWP.xz * 2.0, uTime * 1.3) * 0.7;
totalFoam = clamp(edgeFoam_r + crestFoam_r, 0.0, 1.0);
roughnessFactor = mix(0.03, 0.60, totalFoam);`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec2 luv = (vWP.xz - uOrigin) / uSize;
float wsoft = texture2D(uWater, luv).r;
if (wsoft < 0.18) discard;

float depth = smoothstep(0.20, 0.82, wsoft);
vec3 shallowTurquoise = vec3(0.22, 0.58, 0.50);
vec3 midWetlandTeal   = vec3(0.10, 0.32, 0.28);
vec3 deepWetlandTone  = vec3(0.04, 0.14, 0.12);

vec3 waterColor = mix(shallowTurquoise, midWetlandTeal, smoothstep(0.0, 0.42, depth));
waterColor = mix(waterColor, deepWetlandTone, smoothstep(0.38, 1.0, depth));

float organicTint = vnoise(vWP.xz * 0.06) * 0.6 + vnoise(vWP.xz * 0.24) * 0.4;
waterColor *= 0.90 + 0.20 * organicTint;

float waterAlpha = mix(0.62, 0.95, smoothstep(0.0, 0.65, depth));

float shallowBed = (1.0 - smoothstep(0.20, 0.58, wsoft));
float causticInt = caustics(vWP.xz, uTime) * shallowBed;
vec3 causticColor = vec3(0.42, 0.68, 0.60) * causticInt * max(0.0, uSunDir.y);

vec3 foamColor = vec3(0.94, 0.97, 0.99);
diffuseColor.rgb = mix(waterColor + causticColor, foamColor, totalFoam);
diffuseColor.a = mix(waterAlpha, 0.98, totalFoam);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 p = vWP.xz;
  float t = uTime;
  vec2 uv1 = p * 2.0 + vec2(t * 0.35, t * 0.22);
  vec2 uv2 = p * 4.2 - vec2(t * 0.45, -t * 0.28);
  float eps = 0.10;
  float nr0 = vnoise(uv1) + vnoise(uv2) * 0.5;
  float nrx = vnoise(uv1 + vec2(eps * 2.0, 0.0)) + vnoise(uv2 + vec2(eps * 4.2, 0.0)) * 0.5;
  float nrz = vnoise(uv1 + vec2(0.0, eps * 2.0)) + vnoise(uv2 + vec2(0.0, eps * 4.2)) * 0.5;
  vec3 micro = vec3(-(nrx - nr0) / eps * 0.10, 1.0, -(nrz - nr0) / eps * 0.10);
  vec3 wn = normalize(vWorldNormal + micro * 0.28);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
{
  vec3 V = normalize(cameraPosition - vWP);
  vec3 L = normalize(uSunDir);
  vec3 H = normalize(V + L);
  float NdotH = max(0.0, dot(vWorldNormal, H));
  float NdotV = max(0.0, dot(vWorldNormal, V));
  float fresnel = 0.02 + 0.98 * pow(clamp(1.0 - NdotV, 0.0, 1.0), 5.0);
  float sunSpec = pow(NdotH, 256.0) * 12.0 + pow(NdotH, 36.0) * 1.5;
  vec3 sunGlint = vec3(1.0, 0.96, 0.88) * sunSpec * fresnel * (1.0 - totalFoam * 0.85);
  gl_FragColor.rgb += sunGlint;
}`);
    };
    pondMat.customProgramCacheKey = () => 'pond_water_v1';

    for (const p of ponds) {
      // a disc that ends at the basin rim (a square sheet spilled over the visitor path)
      const gPond = new THREE.CircleGeometry(p.r * 1.02, 64, 0, Math.PI * 2);
      gPond.rotateX(-Math.PI / 2);
      gPond.translate(p.x, 0, p.z);
      const pondMesh = new THREE.Mesh(gPond, pondMat);
      pondMesh.position.y = p.waterLevel;
      pondMesh.renderOrder = 1;
      pondMesh.receiveShadow = true;
      pondMesh.name = `pond-water-${p.enclosureId || 'pool'}`;
      mesh.add(pondMesh);
    }
  }

  return mesh;
}

/** Lotus pads and flowers where the map shows lotus. */
export function buildLotus(scene, layers) {
  const pad = new THREE.CircleGeometry(0.45, 14, 0.25, Math.PI * 2 - 0.25); pad.rotateX(-Math.PI / 2);
  const flower = new THREE.ConeGeometry(0.16, 0.25, 7, 1, true); flower.translate(0, 0.12, 0);
  const pm = [], fm = [], pc = [];
  for (const w of WATER) if (w.lotus) for (const [px, py] of w.lotus) {
    const [cx, cz] = toWorld(px, py);
    const waterY = layers?.waterLevelAt ? layers.waterLevelAt(cx, cz) : WORLD.waterLevel;
    for (let i = 0; i < (w.kind === 'pond' ? 14 : 70); i++) {
      const a = rand() * 6.28, r = Math.sqrt(rand()) * (w.kind === 'pond' ? 4 : 14);
      const p = new V3(cx + Math.cos(a) * r, waterY + 0.03, cz + Math.sin(a) * r);
      pm.push(mat4(p, rr(0, 6.28), rr(0.6, 1.4))); pc.push(new THREE.Color().setHSL(rr(0.24, 0.3), 0.45, rr(0.2, 0.3)));
      if (rand() < 0.22) fm.push(mat4(p.clone().add(new V3(rr(-0.2, 0.2), 0.05, rr(-0.2, 0.2))), rr(0, 6.28), rr(0.8, 1.3)));
    }
  }
  const padMesh = new THREE.InstancedMesh(pad, new THREE.MeshStandardMaterial({ roughness: 0.5, side: THREE.DoubleSide }), pm.length);
  pm.forEach((m, i) => { padMesh.setMatrixAt(i, m); padMesh.setColorAt(i, pc[i]); });
  const flMesh = new THREE.InstancedMesh(flower, new THREE.MeshStandardMaterial({ color: '#e7a3b8', roughness: 0.6, side: THREE.DoubleSide }), Math.max(1, fm.length));
  fm.forEach((m, i) => flMesh.setMatrixAt(i, m)); flMesh.count = fm.length;
  padMesh.renderOrder = flMesh.renderOrder = 2;
  scene.add(padMesh, flMesh);
}
