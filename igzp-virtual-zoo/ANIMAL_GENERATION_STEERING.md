# 3D Animal Generation Steering Guide: Geometry, Anatomy & Rigging Standards

## Executive Summary
This steering document establishes the definitive geometric, anatomical, and rigging standards for all 3D animals across the project. It is based directly on deep topological and material analysis of the high-fidelity benchmark model (`Lion-Male.glb`) imported and inspected in Blender via the **Aurum Blender MCP Server**, combined with wildlife anatomical morphology and biomechanical studies.

---

## 1. Topological & Geometric Deconstruction of `Lion-Male.glb`

Inspection performed live via Blender MCP (`blender_import_gltf`, `blender_scene_info`, `blender_execute`, `blender_capture`):

```
+-----------------------------------------------------------------------------------------+
|                                    LION-MALE.GLB ARCHITECTURE                           |
+-----------------------------------------------------------------------------------------+
| Total Vertices:   872,138                   Total Polygons:    1,479,672               |
| Total Edges:      2,346,983                 Total Objects:     1 ("Mesh_0")             |
| File Size:        74.3 MB (76,047 KB)       Format:            glTF 2.0 Binary (GLB)    |
| Animation Clips:  0 (Static Reference Mesh) Skeletal Bones:    0 (Unrigged Statue)      |
+-----------------------------------------------------------------------------------------+
```

### A. Coordinate System & Spatial Bounding Box
In Blender World Space (Origin at Ground Contact, facing **-Y**, **+Z Up**):
- **X Axis (Lateral Width):** `[-0.1378 m, +0.1467 m]` -> Total Width: **0.2845 m**
- **Y Axis (Longitudinal Length):** `[-0.3677 m, +0.7507 m]` -> Total Length: **1.1185 m**
- **Z Axis (Vertical Height):** `[0.0000 m, +0.6280 m]` -> Total Height: **0.6280 m**

> [!IMPORTANT]
> - Ground plane is strictly locked at **`Z = 0.0000 m`** (bottom of digitigrade paw pads).
> - Snout tip reaches **`Y = -0.3677 m`** (anterior apex).
> - Highest dorsal point is **`Z = 0.6280 m`** at the crest of the cranial mane and withers (**`Y = -0.2060 m`**).
> - Caudal tail tip terminates at **`Y = +0.7507 m`**, **`Z = 0.1221 m`**.

### B. Vertex Distribution Across Anatomical Regions
```
[Head & Muzzle]        219,084 verts (25.1%)  | Y < -0.20m, Z > 0.30m
[Mane & Cervical Bib]  366,339 verts (42.0%)  | -0.25m <= Y <= 0.12m, 0.22m <= Z <= 0.63m
[Torso & Flank]        138,946 verts (15.9%)  | 0.00m < Y < 0.50m, Z > 0.20m
[Forelegs & Shoulders] 223,095 verts (25.6%)  | Y < 0.00m, Z <= 0.30m
[Hindlegs & Haunches]  112,771 verts (12.9%)  | 0.25m <= Y <= 0.55m, Z <= 0.30m
[Tail & Tuft]           21,189 verts ( 2.4%)  | Y >= 0.55m
```
*Note: Sum exceeds 100% due to overlapping bounding envelopes between limbs and ventral mane.*

### C. The Hair Card Sub-Assembly (The "Anaconda" Geometry)
- **Total Connected Polygon Islands:** **7,670 separate loose pieces**.
- **Median Island Face Count:** **5 polygons**.
- **Micro-Islands (< 100 faces):** **6,435 pieces (83.9% of all geometry)**.
- **Top 10 Largest Pieces:** Range from 14,092 to 24,531 polygons (base skin body, cranial core, limb trunks).
- **Structure:** `Lion-Male.glb` achieves its photorealistic, thick volume **not** through a continuous smooth manifold shell, but through thousands of layered polygonal planar ribbons (**hair cards**) with baked alpha cutouts layered over an underlying anatomical mannequin.

### D. Material & Shader Architecture
Single Unified Material: `Material_0`
- **Render Engine:** PBR Principled BSDF with **Alpha Hashed / Masked Cutout** (`blend_method = "HASHED"`).
- **Texture Maps:**
  1. `Image_0` (4096 x 4096, 4K): **Base Color + Alpha Transparency Channel**.
  2. `Image_1` (4096 x 4096, 4K): **Packed ORM (Occlusion in R, Roughness in G, Metallic in B)** routed through `Separate Color`.
  3. `Image_2` (4096 x 4096, 4K): **Tangent-Space Normal Map** routed through `ShaderNodeNormalMap`.

---

## 2. Real-World Wildlife Anatomy Mapped to Blender Geometry

```
                    ANATOMICAL SKELETAL TO BLENDER COORD MAPPING
                               [Mane Crest / Withers]
                                    Z = 0.628m
                                        /\
     [Vaulted Brow]              __.-'"`  `'-.__             [Croup / Sacrum]
      Z = 0.48m           (o.o)                  `\             Z = 0.52m
   [Rostrum / Muzzle]   /|     |\                  |                 \
     Y = -0.368m       ( |     | )--------.        |                  \ [Tailset]
     Z = 0.419m          |  |  |           \      /                    \  Y = 0.55m
                         |  |  |            |    |                      \
                     [Elbow Olecranon]      |    |                       `\ [Black Tuft]
                        Z = 0.24m          (____)_)                        Y = 0.751m
                        |  |  |            [Hock Calcaneus]                Z = 0.122m
                        |  |  |               Z = 0.18m
                       (____)_)               |    |
                   [Digitigrade Paws]        (____)_)
                       Z = 0.000m          [Hind Paws]
                                            Z = 0.000m
```

### A. The 7 Discrete Mane Divisions of *Panthera leo*
A male lion's mane is not a monolithic doughnut or pillow. It is divided into 7 distinct biological zones anchored to specific skeletal landmarks:
1. **Cranial Crown Ruffs:** Crests over the parietal/sagittal skull ridge (`Z = 0.58 - 0.628m`), framing rounded ears.
2. **Cervical Mantle:** Heavy dorsal cape spanning the cervical vertebrae down to thoracic spines T1–T4.
3. **Lateral Cheek Frills:** Fanning outward from the zygomatic arch and angular process of the mandible (`X = +/- 0.10 - 0.14m`).
4. **Ventral Throat Beard:** Suspended directly beneath the hyoid apparatus, flowing down the ventral trachea.
5. **Pectoral Apron:** Drapes between the forelimbs over the sternum (`Y = -0.15 to 0.05m`).
6. **Ventral Belly Fringe:** Trailing dark hair running along the ventral midline between the sternum and navel.
7. **Elbow Tufts:** Localized fur clumps at the olecranon process (`Z ~ 0.22m`).

### B. Dimorphic & Interspecies Divergence Matrix

| Feature | Male African Lion (*Panthera leo*) | Female Lioness | Bengal / White Tiger (*Panthera tigris*) |
|---|---|---|---|
| **Mane Cards** | **6,435 layered hair cards** (42% of verts). | **ZERO hair cards.** Smooth continuous skin. | **ZERO neck/chest mane cards.** Clean throat. |
| **Cheek Anatomy** | Frills blend into thick cervical beard. | Smooth, delicate zygomatic contour. | **Lateral horizontal cheek ruffs** flaring sideways from jaw. |
| **Skull Profile** | Flat dorsal cranium; rocking mandible. | Refined, narrow rostrum; lightweight skull. | **Vaulted (steeply arched cranium)**; reinforced wide rostrum. |
| **Torso Silhouette** | Front-heavy, deep barrel chest; stiff spine. | Aerodynamic, **pronounced inguinal waist tuck**. | **Long cylindrical torso**; flexible, ground-hugging lumbar spine. |
| **Forearm Mass** | Heavy cursorial predator bone density. | Athletic, slender radius/ulna. | **Hyper-developed forearms (+30% thicker than lion)** for grappling gaur. |
| **Tail Anatomy** | Medium length ending in **dense black tuft**. | Sleek cylinder ending in small black pencil tuft. | **Long muscled cylinder; 10–14 black rings; NO TUFT**. |
| **Eyes & Coat** | Amber/brown; tawny coat with dark mane. | Amber; warm tawny with cream countershading. | **Sapphire-blue eyes; cream coat with dark brown/sepia stripes**. |

---

## 3. The Geometric Physics: Why Previous Generations Broke

1. **The UV Atlas Shatter Effect (Zebra Shards):**
   - In `Lion-Male.glb`, the 6,435 hair cards have disconnected planar UV islands packed across the 4K texture atlas.
   - Projecting a procedural stripe texture onto UV space mapped stripe lines independently to thousands of rotated hair cards.
   - In 3D space, this produced **jagged triangular confetti, severed stripes, and zigzag noise**.
2. **The Silhouette Entrapment:**
   - Morphs that scaled vertices without deleting hair cards merely squashed the mane cards into a dense hedgehog knot. The lioness and tiger still possessed the 3D polygonal silhouette of a male lion.
3. **Coordinate Frame Pitch-Flip (Tree Perching):**
   - External asset conversion from Blender Z-up to glTF Y-up can introduce unexpected root rotation transforms if transforms are not frozen.
   - When parented without applying identity rotations, the tiger was pitched 90° upward into the sky, creating the illusion of perching vertically in tree branches.
4. **Procedural Hierarchy Bleed:**
   - Iterating only `animal.mesh.children` left all meshes parented to internal bone joints (`hips`, `chest`, `head`, `earL`) visible, resulting in cartoon cheek spheres and neck donuts rendering on top of the character.

---

## 4. Production Standards & Implementation Rules

### Standard 1: Clean Topology Pipeline
- For non-maned animals (**Lioness**, **White Tiger**, **Chimpanzee**):
  - Do **not** apply texture maps across male lion hair cards.
  - Utilize continuous manifold organic sculpts welded via **Voxel Remesh (voxel size 0.025–0.030m)** and smoothed with **Corrective Smooth (8 iterations)**.
  - Target real-time game performance: **7,000–35,000 polygons** per character.
  - Apply authentic 3D skin-tension patterns (e.g. Langer line-aligned stripes for tigers, natural countershading for lioness).

### Standard 2: Armature & Skeleton Specifications
- Standard Big Cat Armature: **27 deform bones**:
  - Central: `root`, `pelvis`, `spine`, `chest`, `neck`, `head`, `jaw`, `tail.01`, `tail.02`, `tail.03`, `tail.04`.
  - Bilateral Forelimbs: `shoulder.L/R`, `upper_arm.L/R`, `forearm.L/R`, `paw.L/R`.
  - Bilateral Hindlimbs: `thigh.L/R`, `shin.L/R`, `hock.L/R`, `paw_back.L/R`.
- Rest Pose Constraint:
  - All bones must be zeroed to identity rest pose before baking or export.
  - Paws must strictly sit on **`Z = 0.000m`**.

### Standard 3: Five Universal Actions Baked to NLA Tracks
1. **`walk`**: Authentic 4-beat diagonal sequence gait (`LH` -> `LF` -> `RH` -> `RF`) with spinal counter-flexion and caudal sway.
2. **`standing`**: Alert neutral stance with subtle diaphragmatic respiratory heave (18–24 bpm).
3. **`sitting`**: Haunches folded, tarsus resting on ground, forelimbs erect.
4. **`sleeping`**: Lateral or sternal recumbent rest, curled spine, paws relaxed.
5. **`roaring` / `chuff`**:
   - Lion/Lioness: Cervical elevation, thoracic expansion, articulated mandibular depression (open mouth).
   - Tiger: Low-frequency prusten vocalization with pulsed lips and vibrissae twitch.

### Standard 4: Three.js Integration & Watertight Procedural Hiding
Whenever a GLB model is attached in code:
```javascript
// Collect all meshes belonging to the incoming GLB model
const modelMeshes = new Set();
model.traverse(c => { if (c.isMesh) modelMeshes.add(c); });

// Watertight: recursively hide every procedural mesh in the entire hierarchy
animal.mesh.traverse(c => {
  if (c.isMesh && !modelMeshes.has(c)) {
    c.visible = false;
  }
});
animal.mesh.add(model);
```

### Standard 5: Ground & Terrain Locking
- Ground walkers must evaluate terrain height dynamically: `y = this.ground(this.pos.x, this.pos.z)`.
- Big cats resting near shade trees (`en.shade`) must maintain a safe clearance radius of at least **1.8–3.0m** from tree trunks to prevent canopy collision.
