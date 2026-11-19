# Blender & 3D Modeling Pipelines

This directory contains automated Python scripts and MCP configurations for generative 3D modeling, anatomical rigging, skeletal skinning, animation baking, and glTF asset optimization for Three.js.

## Directory Contents

| File / Directory | Description |
|---|---|
| `rig_lion_fixed.py` | Imports `Lion-Male.glb`, applies geometry-preserving decimation, builds a 27-bone feline armature, computes strict anatomically bounded vertex weights (eliminating forehead spikes and leg tears), bakes 5 animations (`standing`, `sitting`, `sleeping`, `roaring`, `walk`), and exports `Lion-Male-Rigged.glb`. |
| `rig_lioness_fixed.py` | Morphs the base feline mesh into sleek lioness anatomy (removes mane, cheek frills, throat beard), builds a 27-bone armature, applies strict anatomical bone weighting, bakes 4 animations (`walk`, `standing`, `sitting`, `sleeping`), and exports `Lioness-Rigged.glb`. |
| `build_organic_chimpanzee.py` | Procedurally sculpts an organic Chimpanzee mesh using Voxel Remesh and smooth filters, assigns dual PBR materials (`Chimp_Fur` and `Chimp_Skin`), builds a 29-bone primate skeleton with knuckle and hallux joints, bakes 5 animations (`knuckle_walk`, `standing`, `sitting`, `sleeping`, `grooming`), and exports `Chimpanzee-Rigged.glb`. |
| `build_white_tiger.py` | Lofted feline anatomy for White Bengal Tiger with leucistic coat coloration and sepia striping, 27-bone skeleton, and 5 baked actions (`walk`, `standing`, `sitting`, `sleeping`, `chuff`). |
| `optimize_lion_web.py` | Lossless/high-quality buffer-view image recompression for fast web delivery (`.web.glb`). |
| `blender-mcp/` | Model Context Protocol server bridge connecting LLM agent tools directly to the live Blender viewport. |

## Running the Pipelines

Run any pipeline headlessly via Blender's command-line interface:

```bash
# Generate Male Lion GLB
blender --background --python tools/rig_lion_fixed.py

# Generate Lioness GLB
blender --background --python tools/rig_lioness_fixed.py

# Generate Chimpanzee GLB
blender --background --python tools/build_organic_chimpanzee.py
```
