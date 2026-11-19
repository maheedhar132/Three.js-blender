# IGZP Virtual Zoo — Visakhapatnam

An explorable, first-person 3D virtual tour of **Indira Gandhi Zoological Park (Visakhapatnam)**, built with Three.js. Cycle (or walk) the zoo's visitor routes, stop at enclosures to watch the animals, read about each species, take virtual photographs and revisit them in a personal gallery.

> **Unofficial reconstruction.** The layout is traced from the zoo's illustrated visitor map, which states that it is *not drawn to scale*. Distances, terrain, animals and facilities are approximate. The presence of any species at the real zoo today is **not verified**. Virtual cycling does not imply cycling is permitted in the real zoo.

Also included: **Deep Reef**, our underwater demo, at `/demos/deep-reef/` (linked from the entrance screen).

## Run locally

No build step: native ES modules, with Three.js r160 from a CDN.

```bash
python tools/dev-server.py 8770
```
Then open http://localhost:8770.

- **Dev server:** sends `Cache-Control: no-store` and accepts `POST /__shot` so the in-page test hook `IGZP.shot(name)` can save screenshots to `docs/screenshots/`.
- **URL flags:**
  - `?debug` shows FPS, draw calls and position.
  - `?q=low|medium|high` forces a quality tier.
  - `?noadapt` disables automatic quality reduction.

## Deploy to Vercel

This is a static site, so no framework preset or build command is needed.

```bash
npx vercel --prod
```
`vercel.json` sets clean URLs, caching and security headers. `.vercelignore` keeps `tools/`, `docs/` and local config out of the deployment.

## Controls

| Desktop | Action |
|---|---|
| W / ↑ | Pedal (accelerate) |
| S / ↓ | Brake, then reverse |
| A / D, ← / → | Steer (walking: A/D strafe, ←/→ turn) |
| Space | Brake / stop |
| Shift | Faster |
| Drag mouse | Look around |
| E | Observe the nearby exhibit / facility |
| P | Photo mode (Enter = capture, Esc = exit) |
| M | Interactive zoo map |
| B | Switch bicycle / walking |
| Esc | Close the open panel / skip the intro |

**Touch screens:**
- Left stick: pedal and steer (walk and strafe in walking mode).
- Drag anywhere: look around.
- Buttons: **Brake**, **E** (observe), **📷** (photo).
- The top bar has Map, Photo, Gallery, Walk/Cycle, Sound and Settings.

## Project structure

```
index.html                 UI shell (entrance, HUD, panels, map, photo mode, gallery, settings)
src/main.js                bootstrap, input, interaction, photo mode, gallery UI, cinematic + guided tour, loop
src/config.js              world scale, quality tiers, player tuning
src/data/zoo-layout.js     ALL spatial data, traced from the visitor map (roads, paths, water, hills, exhibits, buildings, amenities, restricted areas, tour order)
src/data/species.js        educational content per species (scientific name, IUCN status + source, habitat, facts, assumptions)
src/core/util.js           noise, polygons, geometry helpers (loft, merge, paint), canvas textures
src/world/layers.js        rasterises the layout into grids: road/path/floor mask, walkable grid, water, heights, forest boundary
src/world/terrain.js       terrain mesh + procedural ground shader (murram paths, tar roads, grass, laterite, mud, rock)
src/world/sky.js           sky dome, sun with camera-following shadows, haze, environment map
src/world/water.js         lake/stream/pond surface shader, lotus
src/world/vegetation.js    ~19k instanced trees (neem, rain tree, gulmohar, eucalyptus, coconut palm, bamboo, shrubs) with near/far LOD, GPU grass, flower beds, butterflies
src/zoo/structures.js      enclosure barriers per habitat, habitat furniture, buildings, gates, signs, amenities, path furniture
src/animals/models.js      procedural rigged (skinned) animal models for 54 species definitions
src/animals/animals.js     behaviour state machines and poses per animal family
src/player/player.js       bicycle physics, walking, first-person camera, handlebars, collision
src/player/navigation.js   A* routing on the visitor-route grid
src/photography/gallery-store.js  IndexedDB photo storage
src/ui/map.js              interactive map generated from the same layers as the 3D world
src/ui/style.css           UI styling
src/audio/audio.js         procedural soundscape (Web Audio)
demos/deep-reef/           the underwater demo (unchanged copy)
tools/dev-server.py        local dev server + screenshot endpoint
docs/screenshots/          screenshots of the running app
```

## Data and verification

Every exhibit carries a `status`:
- `mapped` means it is shown on the official visitor map.
- `inferred` means it is our reconstruction, for example two connecting path segments.
- `restricted` areas (the Wild Dog Breeding Centre and the Fodder Area) are drawn and signposted but never reachable.

Office buildings carry `restricted: true`. The exhibit panel always shows **"Shown on official visitor map"** together with **"Animal presence not verified"**. Where the map gives only a common name (for example "Rhino", "Small Cats", "Pelican"), the species is marked **"Species assumed"** and the assumption is explained.

Conservation statuses are IUCN Red List categories as known at the time of writing. They are labelled for re-checking at iucnredlist.org before any public release.

## Feature status

**Complete and tested in the running app** (Chromium in the desktop app's browser pane):
- Full-zoo layout: every mapped zone, exhibit, gate, building, amenity and water body, plus surrounding forest and hills.
- Separate tar-road and walking-path layers, and a route network that is fully connected (7,821 of 7,822 cells reachable from the entrance).
- Bicycle mode (acceleration, braking, steering, slope effect, slower near exhibits) and walking mode.
- Collision that keeps the visitor on the routes and out of gate pillars and parked cars.
- 139 animals from 54 species definitions (one is skinned and drawn in one draw call each), with behaviour states: idle, walk, graze, rest, alert, sniff, browse, climb, perch, swim, coil, raise and pace.
- Observe panel with species data, verification badges, a narration button (speech synthesis) and nearby exhibits.
- Interactive map with zoom, pan and pinch, exhibit selection, "Navigate here" with an A* route, and an on-screen guidance arrow.
- Photo mode with zoom, a small camera shift and a framing grid. Capture saves to IndexedDB, and the gallery supports filter, sort, view, caption, download and delete.
- Cinematic intro, then the guided tour, which follows the routes stop by stop with pause, next and end. It also hands control back the moment you press a movement key.
- Procedural audio that starts only after a click, with mute and volume controls.
- Settings for quality (low/medium/high), volume, look sensitivity, stats and auto-narration.
- Adaptive quality: lower resolution, then shadows off, if the frame rate stays low.
- Mobile layout and touch controls, tested in 375×812 emulation.

**Approximate by design:**
- All positions (traced by eye from a non-scale map).
- Path shapes between mapped junctions.
- Terrain heights.
- Building footprints and appearance.

**Unverified:**
- Animal inventory and counts.
- Assumed species (rhino, zebra, elephant, jackal, pelican, swan and others; see the panel notes).
- Current IUCN statuses.

**Pending / known limitations:**
- **Animals** are stylised procedural models, not photoreal. The data has a slot for licensed GLB models (none are bundled, and none were downloaded).
- **Building interiors** (aquarium, nocturnal house, reptile house) are not modelled.
- **Guided-tour narration** uses the browser's text-to-speech voices; quality varies by device.
- **Not yet tested:** real phones, Safari, Firefox, and how the audio sounds (the audio graph was checked, not listened to).
- **Performance:** the frame rate was only measured in a background browser pane, which throttles rendering, so smoothness should be judged on a real device.

## Performance notes

- **Instancing:** used for trees, rocks and lotus. Static structures are merged into a few vertex-coloured meshes.
- **Animals:** each one is a single skinned mesh. Animals are hidden beyond 110–220 m depending on tier, and update at half rate beyond half that distance.
- **Trees:** a near/far LOD split around the camera. Near trees use detailed leaf cards and cast shadows; far trees are low-poly blobs. The split is recomputed every 10 m of travel.
- **Grass:** GPU-generated tufts in a patch that wraps around the camera, sampling height and path masks from textures.
- **Shadows:** a single shadow map that follows the camera, snapped to texels.
- **Signs:** culled beyond 140 m.
- **Load time:** the world builds in about 1.3 s on desktop; Three.js is preloaded.
