import bpy
import numpy as np
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']

# Decimate
mod = mesh.modifiers.new(name="Decimate", type='DECIMATE')
mod.ratio = 0.02
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier="Decimate")

# Save a decimated base blend or obj for fast reuse!
bpy.ops.wm.save_as_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
print("Saved lion_decimated.blend!")

verts = np.array([v.co for v in mesh.data.vertices])
print(f"Total vertices: {len(verts)}")

# Let's check max Z in cranial region (Y in [-0.28, -0.15]):
cranial_mask = (verts[:, 1] >= -0.28) & (verts[:, 1] <= -0.15) & (verts[:, 2] > 0.45)
print(f"Cranial region (Z > 0.45): {cranial_mask.sum()} vertices, max Z = {verts[cranial_mask, 2].max():.3f}")

# Cheek frills (Y in [-0.30, -0.18], Z in [0.30, 0.48]):
cheek_mask = (verts[:, 1] >= -0.30) & (verts[:, 1] <= -0.18) & (verts[:, 2] >= 0.30) & (verts[:, 2] <= 0.48)
print(f"Cheek region: max |X| = {np.abs(verts[cheek_mask, 0]).max():.3f}")

# Throat & pectoral mane (Y in [-0.22, 0.00], Z in [0.20, 0.40], |X| < 0.10):
throat_mask = (verts[:, 1] >= -0.22) & (verts[:, 1] <= 0.00) & (verts[:, 2] >= 0.20) & (verts[:, 2] <= 0.40) & (np.abs(verts[:, 0]) < 0.10)
print(f"Throat/Pectoral region: {throat_mask.sum()} vertices, min Z = {verts[throat_mask, 2].min():.3f}")

# Belly fringe (Y in [0.00, 0.22], Z < 0.30, |X| < 0.08):
belly_mask = (verts[:, 1] >= 0.00) & (verts[:, 1] <= 0.22) & (verts[:, 2] < 0.30) & (np.abs(verts[:, 0]) < 0.08)
print(f"Belly fringe region: {belly_mask.sum()} vertices, min Z = {verts[belly_mask, 2].min():.3f}")
