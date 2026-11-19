# Three.js & Blender Monorepo

A monorepo integrating high-fidelity 3D modeling and animation pipelines in Blender with interactive WebGL experiences in Three.js.

Each folder in this repository functions as an independent wire with its own dedicated documentation:

## Repository Architecture

| Directory | Purpose | Documentation |
|---|---|---|
| [`igzp-virtual-zoo/`](./igzp-virtual-zoo/) | **IGZP Virtual Zoo** — Real-time 3D explorable zoo simulation built with Three.js (Visakhapatnam Indira Gandhi Zoological Park reconstruction). Features 3D rigged animals (Asiatic Male Lion, Lioness, White Bengal Tiger, Chimpanzee), visitor bicycle/walking tours, safari ride, dynamic weather, and foliage. | [`igzp-virtual-zoo/README.md`](./igzp-virtual-zoo/README.md) |
| [`tools/`](./tools/) | **Blender & 3D Modeling Pipelines** — Automated Python scripts for 3D procedural modeling, anatomical skinning, 27/29-bone skeletal rigging, keyframe animation baking, and glTF optimization, along with the Blender MCP server integration. | [`tools/README.md`](./tools/README.md) |

---

## Vercel Deployment

Each application directory connects to Vercel as an independent wire. When changes are pushed to `master`, Vercel automatically builds and deploys updates.

### Deploying `igzp-virtual-zoo` on Vercel:
1. In your **Vercel Dashboard**, import the repository: `https://github.com/maheedhar132/Three.js-blender.git`.
2. Under **Project Settings > General**:
   - Set **Root Directory** to `igzp-virtual-zoo`.
   - **Framework Preset**: *Other* (pure static HTML/ES modules).
   - **Build Command**: None (leave empty).
   - **Output Directory**: `.` (or leave empty).
3. Click **Deploy**. Any future commits to `master` will trigger an automated build and deployment.

---

## Quick Start

### 1. Run the Zoo Web App Locally
```bash
cd igzp-virtual-zoo
python tools/dev-server.py 8770
# Open http://localhost:8770 in your browser
```

### 2. Run Blender 3D Rigging Pipelines
Ensure Blender 4.x / 5.x is installed:
```bash
# Rig and animate Male Lion
blender --background --python tools/rig_lion_fixed.py

# Rig and animate Lioness
blender --background --python tools/rig_lioness_fixed.py

# Sculpt, rig, and animate Chimpanzee
blender --background --python tools/build_organic_chimpanzee.py
```
