// Central configuration. All spatial scale decisions live here so they can be corrected later.

export const WORLD = {
  // The supplied visitor map (1200 x 800 px) states it is NOT drawn to scale.
  // We use a chosen virtual scale of 1 metre per map pixel. This is a design decision, not a survey.
  scale: 1.0,
  mapW: 1200,
  mapH: 800,
  sizeX: 1600,        // terrain extent (m): map area plus surrounding forest
  sizeZ: 1200,
  layerRes: 2,        // metres per pixel of the rasterised layout layers (roads, paths, water, floors)
  waterLevel: 0,
};

/** Map pixel -> world metres (x east, z south). */
export const toWorld = (px, py) => [(px - WORLD.mapW / 2) * WORLD.scale, (py - WORLD.mapH / 2) * WORLD.scale];
/** World metres -> map pixel. */
export const toMap = (x, z) => [x / WORLD.scale + WORLD.mapW / 2, z / WORLD.scale + WORLD.mapH / 2];

export const QUALITY = {
  low:    { label: 'Low',    pr: 1.0,  aa: false, shadows: false, shadowSize: 1024, terrainSeg: [200, 150], trees: 0.45, nearTrees: 90,  grass: 16000, grassRange: 26, animalRange: 110 },
  medium: { label: 'Medium', pr: 1.25, aa: true,  shadows: true,  shadowSize: 1024, terrainSeg: [300, 225], trees: 0.7,  nearTrees: 130, grass: 36000, grassRange: 36, animalRange: 160 },
  high:   { label: 'High',   pr: 1.75, aa: true,  shadows: true,  shadowSize: 2048, terrainSeg: [400, 300], trees: 1.0,  nearTrees: 170, grass: 64000, grassRange: 45, animalRange: 220 },
};

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('q');
  if (QUALITY[q]) return q;
  try { const s = localStorage.getItem('igzp.quality'); if (QUALITY[s]) return s; } catch (e) { /* storage blocked */ }
  if (IS_TOUCH) return 'low';
  return (navigator.hardwareConcurrency || 4) <= 4 ? 'medium' : 'high';
}

export const PLAYER = {
  bike: { eye: 1.55, maxSpeed: 6.5, boost: 9, accel: 1.8, brake: 4.5, handBrake: 7, reverse: 1.5, wheelbase: 1.05, maxSteer: 0.55, exhibitSpeed: 4 },
  walk: { eye: 1.65, speed: 1.5, run: 3.0 },
};
