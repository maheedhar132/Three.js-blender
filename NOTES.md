# Deep Reef — notes

Deliverable: `underwater-world.html` (one file, ~120 KB). Three.js r160 is loaded from jsDelivr. There are no model, image or sound files: every mesh, texture and sound is generated in code.

Open it from any static server (for example `python -m http.server`, then `/underwater-world.html`).

URL flags:
- `?debug` shows FPS, draw calls and triangle count.
- `?q=low` / `?q=high` forces a quality tier.
- `?noadapt` turns off automatic quality downgrades.

## 1. World design

| Area | Position (m) | Notes |
|---|---|---|
| Surface | y = 0 | Seen from below as a moving Snell's window |
| Sandy clearing | (0, 6) | Flattened sand, about −20.6 m |
| Kelp forest | (−30, −36), r ≈ 30 | 150 plants (75 on mobile), 10–18 m tall |
| Rocky reef | (32, −6), r ≈ 27 | Raised rock, about 40 coral clusters, eels, anemones |
| **Shipwreck** | (6, 42) | 22 m hull, lists 0.2 rad to port, buried 1.6 m |
| Whale skeleton | (−15, 33) | About 18 m from vertebrae to skull, beside the wreck |
| Glowing trail | clearing → wreck | 260 faint pulsing specks |
| Drop-off | r > 105 | Seabed falls away into blue |

**Palette (sRGB):**
- Water: fog `#0b4a5e`, dome top `#3f9db4`, deep `#021821`.
- Sand `#bcae88` / `#9d9373`; rock `#62625a` / `#40433d`.
- Algae `#5a6040`; coralline `#8f7468`.
- Kelp `#3d3e1e` → `#86702f`.
- Wood `#75695a` / `#8a7d68`; bone `#b3ab96`; trail glow `#7fe3d4`.
- Coral is deliberately muted: `#b06a5e #c08d5c #8d6b8c #a68f62 #8a4e6c`.

**Lighting:** a directional "sun" (`#d4f0ee`, 2.3) from the direction (0.32, 1, 0.22), plus a hemisphere light (`#5aa9bf` sky, `#46574c` sand bounce).
- Shadows follow the camera, snapped to the shadow-map grid so they don't shimmer.
- Sunlight effects:
  - Animated caustics on surfaces facing up, fading with depth.
  - Large slow patches of brighter and darker light, so the seabed is never evenly lit.
  - 15 light shafts that are bright near the surface and fade at the seabed.
  - Three narrow shafts through the holes in the wreck deck, plus a faint teal glow inside the hull.

**Atmosphere:** exponential fog (density 0.019) with per-colour extinction: red fades about 1.6× faster than blue. Distant objects turn blue-green before disappearing, while things near the camera stay clear. About 4,500 drifting "marine snow" particles wrap around the camera, so particle density is the same everywhere.

## 2. Marine life (13 species)

| # | Species | Behaviour |
|---|---|---|
| 1 | Silver fish (3 schools, 480) | Schooling rules (cohesion, alignment, separation). The whole school veers away from the diver and individual fish scatter within 7 m. |
| 2 | Manta rays ×2 | Loop paths at −9 m and −13.5 m. Wingbeat wave runs root to tip; they bank into turns and rise and fall slightly with each beat. |
| 3 | Reef fish (tang, chromis, butterflyfish, anthias) | Each stays near a coral cluster or the wreck. They pick new targets, dart occasionally and flee the diver. |
| 4 | Green sea turtle | Rowing front flippers with feathering; thrust pulses on the downstroke; rear flippers steer; head moves; banks into turns. |
| 5 | Jellyfish | The bell pulses, the jellyfish jets upward on contraction and sinks between pulses; tentacles trail behind. |
| 6 | Reef shark | Slow patrol; side-to-side body wave; banks into turns. |
| 7 | Moray eels ×2 | Half inside reef rocks, head swaying. |
| 8 | Crabs | Stop-start sideways walking; they bolt when the diver comes close. |
| 9 | Starfish | Rest on sand and rock. |
| 10 | Seahorses | Hold position near kelp bases, bobbing and rocking. |
| 11 | Stingrays ×2 | Glide just above the sand with rippling fin edges. |
| 12 | Groupers ×2 | Hover in the wreck openings. |
| 13 | Clownfish | Stay inside anemones and dive into them when the diver approaches. |

**Least realistic animal after the first build: the manta.** Seen from below it was a paper-thin, strongly swept boomerang with no body mass and tiny head lobes.
- **Fixed:** broader triangular wings with less sweep, a thick central body, larger curled head lobes, pale shoulder patches, darker wingtips and a white underside.
- **Least realistic now: the reef shark.** It is one smooth tube with no gill slits, mouth or claspers. Its fins are flat triangles that never move, and the tail is part of the same body wave.
- **How to improve the shark:**
  - Bend it along a 4–5 segment spine with a stiffer front half (real sharks swim with the tail, not the head).
  - Make the pectoral fins separate meshes that tilt as it climbs and dives.
  - Paint gill slits and a mouth line with vertex colours.
  - Add slight mottling so it doesn't read as plastic.

## 3. Visual refinement rounds (from screenshots of the running scene)

**Round 1, ranked from most to least noticeable:**
1. Kelp looked like bamboo with short leaves.
   - **Fix:** long, ruffled, golden-brown blades that stream downstream.
   - Added several stipes per plant, including younger, shorter ones.
   - Each blade tip flutters on its own.
2. The wreck read as a fence or lattice because missing planks were spread evenly.
   - **Fix:** planks now overlap, so the hull reads as solid.
   - Damage is concentrated in one large ragged breach on starboard plus two small holes.
3. Rocks looked like smooth plastic pillows.
   - **Fix:** pits, sharper ridges and strata in the shape.
   - Darker cavities, patchy algae and coralline crust; less green overall.
4. The whale skull was a bright smooth ellipsoid.
   - **Fix:** a ridge along the snout with grooves either side, a raised cranium and an eroded surface.
   - It is darker, silt-stained and partly buried.
5. Manta shape (see section 2).

**Round 2:**
- The wreck was still almost black, so the wood is now weathered grey-brown and the sand bounce light is stronger.
- Barnacles showed as white sparkles, so they are now dull grey.
- The kelp canopy was over-twisted, so the twist is reduced.
- The turtle shell was flat, so it is now domed with more contrasting scutes.
- The whale skull was oversized, so it is scaled down.

**Round 3 (the tour itself):**
- The Whale Fall shot was too far away, so the camera now comes within about 12 m.
- The "Toward the Light" shot didn't look at the sun. It now does, and the sun shows as a rippled, refracted Snell's window instead of a blown-out disc.
- Kelp passed close enough to the lens to make dark blobs, so the corridor kept clear along the tour path is wider (6 m).

**What to address next:** the remaining items in section 7.

## 4. Implementation

- **Terrain:** one displaced grid (230² segments; 150² on mobile) built from a single `ground(x,z)` height function. The same function is used for placement, animal steering and collision.
  - Colours blend sand, rock, algae and kelp floor based on slope and area.
  - A tileable procedural ripple texture is used as both the colour map and the bump map.
- **Shaders:** small patches to Three.js's standard materials.
  - Caustics plus depth absorption on the seabed, rocks, coral, wood and bone.
  - Swimming body wave on fish.
  - Wingbeat on rays.
  - Current sway and blade flutter on kelp.
  - Gentle sway on soft coral and anemones.
- **Shipwreck:**
  - Frames (ribs) built along an elliptical hull profile; planks laid along the hull and cut away inside noisy hole shapes.
  - Broken deck with sagging planks, snapped deck beams and gunwale rails.
  - Stern castle with window gaps, two snapped masts and a bowsprit.
  - On the sand: a fallen mast, barrels, encrusted cannons and loose planks.
  - Marine growth: coral and sponges on the rails, barnacles on the hull.
  - Bubbles rise from three vents.
- **Audio (Web Audio only):**
  - Looping brown-noise swell, low-pass filtered, with a slow surge.
  - 55/82/110 Hz drone.
  - Breathing triangle-wave pad routed into a generated reverb.
  - Random bubble chirps, more frequent near the wreck.
  - A whale moan every 22–40 s: two oscillators gliding in pitch with vibrato, mostly reverb.
  - Nothing is created until **Start Dive** is clicked.
- **Tour:**
  - 11 keyframes on smooth curves for both camera position and look target.
  - Damped following, so the camera never jerks.
  - The final segment eases out; the camera never drops below 2.5 m above the seabed.
  - One manta, the first silver school and the turtle are moved into place so the documentary moments line up with the camera.
  - Captions and letterbox bars appear during the tour; Esc or Skip ends it.

## 5. Performance

- **Instancing:** used for kelp, rocks, pebbles and shells, every coral type, barnacles, starfish, all fish species, jellyfish (bell and tentacles), crabs, seahorses, vertebrae and bubbles.
- **Draw calls:** about 45–70 per frame; about 1.0–1.45 M triangles on the high tier and about 0.76 M on the low tier.
- **Quality tiers:** touch devices get the low tier:
  - no shadows;
  - half the kelp;
  - 240 schooling fish instead of 480;
  - lighter terrain and rocks;
  - 1,800 particles;
  - fewer light shafts;
  - pixel ratio capped at 1.5.
- **Adaptive quality:** FPS is measured every 3 s. Below 40 FPS it steps down in order: lower resolution → shadows off → lower resolution again and less kelp and particles.
- **Level of detail:** barnacles and cannons are hidden more than 75 m from the wreck. Reef fish groups more than 85 m away update at one-third rate.
- **Particles:** marine snow is entirely on the GPU and wraps around the camera.
- **Build time:** the world builds in 150–330 ms. Three.js is preloaded.

## 6. What was tested (and what wasn't)

**Tested** in the desktop app's built-in Chromium browser:
- **Compile:** 0 shader compile failures (34 programs).
- **No external files:** the only external request is the Three.js file.
- **Frame rate:** 55–60 FPS at 800×600 on desktop high tier (debug readout).
- **Full tour:** runs end to end, finishing at about 31 s, after which the controls come back.
- **Inputs:**
  - Esc skip works.
  - The W key moves the diver; dragging turns the view.
  - The mobile joystick moved the diver 6.4 m in 2 s and recentred on release.
- **Audio:**
  - No audio context exists before Start Dive.
  - After the click it is "running" and the volume ramps to 0.85.
  - Mute and unmute work.
- **Mobile layout:** 375×812 emulation shows the low tier with the joystick and Up/Down buttons.

**Not tested:**
- **Real phones and tablets:** FPS and touch feel there are unmeasured.
- **Safari or Firefox.**
- **How the audio actually sounds:** I could check the audio nodes, not listen to them.
- **Smoothness:** the browser pane was hidden for part of the session, which throttles frames. Frame-time smoothness should be judged on a visible screen.

## 7. Remaining visual improvements

- **Shark:** see section 2.
- **Kelp holdfasts and gas bulbs:** stipes start directly from the sand and the blades have no float bulbs.
- **Caustics:** they ignore shadows, so they still appear inside the wreck's shadow.
- **Light shafts:** they don't stop at objects (no occlusion).
- **Sand texture:** it repeats every 4 m; a second detail layer would hide the repeat.
- **Turtle:** the flippers are smooth ellipsoids and could use scale patterning.
- **Wreck:**
  - The planks are single-sided ribbons, so close up their edges have no thickness.
  - The interior could use cargo and more dark, enclosed spaces.
- **Water surface:** a mirror-like reflection when the diver is just below the surface.
- **Accessibility:** a "reduced motion" option for the camera sway.

## 8. Client outreach

**DM (60 words):**

> Hi [Marketing Manager], I built a browser-based underwater world visitors can explore before they arrive (kelp forest, manta rays, a sunken shipwreck), no app needed: [Demo Link]. I can create a version for [Business Name] with your own reef, signature animals and logo, for your website or lobby screens in [City]. Delivery in 10 days for [Custom Project Price]. Worth a quick look?

**If they say "That's too expensive":**

> Fair point. It helps to compare it with what you already spend to reach guests. A photo shoot or video ad does one job once. This runs on your website, booking pages, lobby screens and at trade shows, in any browser, and you own it. If budget is the blocker, we can start smaller with just your signature reef and add animals or areas later.
