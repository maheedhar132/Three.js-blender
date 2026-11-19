# Blender & 3D Modeling Pipelines

This directory contains automated Python scripts and MCP configurations for generative 3D modeling, anatomical rigging, skeletal skinning, animation baking, and glTF asset optimization for Three.js.

## Directory Contents

| File / Directory | Description |
|---|---|
| `rig_full_lion.py` | Full 75MB+ zero-decimation pipeline: rigs all 872,138 vertices and 1.48M polygons of `Lion-Male.glb` with vectorized anatomical bone weighting, bakes 5 actions (`standing`, `sitting`, `sleeping`, `roaring`, `walk`), and exports `Lion-Male-Rigged.glb` (~95.5MB). |
| `rig_full_lioness.py` | Full 70MB+ zero-decimation pipeline: morphs male mane down to sleek lioness neck and withers, swaps to 4K tawny golden coat (`lioness_base_color.png`), rigs with 27 bones, bakes 5 actions, and exports `Lioness-Rigged.glb` (~93.4MB). |
| `rig_full_white_tiger.py` | Full 70MB+ zero-decimation pipeline: morphs masterwork felid mesh into *Panthera tigris* cranial proportions (flaring cheek ruffs, broad feline brow, stalking withers), applies 4K White Bengal Tiger texture (`white_tiger_base_color.png`), adds `COLOR_0`, rigs with 27 bones, bakes 5 actions (`walk`, `standing`, `sitting`, `sleeping`, `chuff`), and exports `WhiteTiger-Rigged.glb` (~88.8MB). |
| `build_white_tiger_texture.py` | Synthesizes 4K White Bengal Tiger PBR base color: creamy leucistic ivory coat, snow-white underparts, organic vertical sepia/charcoal tiger stripes, sapphire blue eyes, pink nose leather. |
| `build_lioness_texture.py` | Synthesizes 4K Lioness PBR base color: converts dark mane hair cards to uniform warm tawny ochre coat. |
| `build_organic_chimpanzee.py` | Procedurally sculpts an organic Chimpanzee mesh using Voxel Remesh and smooth filters, assigns dual PBR materials (`Chimp_Fur` and `Chimp_Skin`), builds a 29-bone primate skeleton with knuckle and hallux joints, bakes 5 animations (`knuckle_walk`, `standing`, `sitting`, `sleeping`, `grooming`), and exports `Chimpanzee-Rigged.glb`. |
| `blender-mcp/` | Model Context Protocol server bridge connecting LLM agent tools directly to the live Blender viewport. |

## Running the Pipelines

Run any pipeline headlessly via Blender's command-line interface:

```bash
# Generate Full 95MB Male Lion Rig
blender --background --python tools/rig_full_lion.py

# Generate Full 93MB Lioness Rig
python tools/build_lioness_texture.py
blender --background --python tools/rig_full_lioness.py

# Generate Full 88MB White Bengal Tiger Rig
python tools/build_white_tiger_texture.py
blender --background --python tools/rig_full_white_tiger.py

# Generate Chimpanzee Rig
blender --background --python tools/build_organic_chimpanzee.py
```
