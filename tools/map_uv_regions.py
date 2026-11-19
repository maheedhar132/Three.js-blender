import bpy
import numpy as np
# No PIL needed

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
m = bpy.data.objects['Mesh_0']

# Extract vertex coords
n_verts = len(m.data.vertices)
coords = np.empty((n_verts, 3), dtype=np.float32)
m.data.vertices.foreach_get('co', coords.ravel())

# Extract loop vertex indices and UVs
uv_data = m.data.uv_layers['UVMap'].data
n_loops = len(uv_data)
uvs = np.empty((n_loops, 2), dtype=np.float32)
uv_data.foreach_get('uv', uvs.ravel())

loop_vert_idx = np.empty(n_loops, dtype=np.int32)
m.data.loops.foreach_get('vertex_index', loop_vert_idx)

# Map each loop's 3D position
loop_3d = coords[loop_vert_idx]

# Identify mane loops: around neck/shoulders with large radial distance or dark mane
# Head: Y < -0.21
# Neck/chest: -0.21 <= Y <= 0.08
# Flanks/torso: 0.08 < Y < 0.45
# Hind: Y >= 0.45
print(f"Total loops: {n_loops}")
for region_name, mask in [
    ("head", loop_3d[:, 1] < -0.21),
    ("neck_mane", (loop_3d[:, 1] >= -0.21) & (loop_3d[:, 1] <= 0.08)),
    ("torso", (loop_3d[:, 1] > 0.08) & (loop_3d[:, 1] < 0.45)),
    ("hind", loop_3d[:, 1] >= 0.45)
]:
    r_uvs = uvs[mask]
    u_min, u_max = r_uvs[:, 0].min(), r_uvs[:, 0].max()
    v_min, v_max = r_uvs[:, 1].min(), r_uvs[:, 1].max()
    print(f"Region {region_name}: U=[{u_min:.3f}, {u_max:.3f}], V=[{v_min:.3f}, {v_max:.3f}], count={mask.sum()}")
