import bpy
import numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']

# Decimate for fast analysis
mod = mesh.modifiers.new(name="Decimate", type='DECIMATE')
mod.ratio = 0.02
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier="Decimate")

verts = np.array([v.co for v in mesh.data.vertices])

print("Y-slice analysis (Y from -0.35 to 0.60):")
print(f"{'Y slice':<10} | {'min X':<7} {'max X':<7} {'width':<7} | {'min Z':<7} {'max Z':<7} {'height':<7} | {'count':<6}")
for y_center in np.arange(-0.35, 0.50, 0.05):
    mask = (verts[:, 1] >= y_center - 0.025) & (verts[:, 1] < y_center + 0.025)
    slice_verts = verts[mask]
    if len(slice_verts) > 0:
        min_x, max_x = slice_verts[:, 0].min(), slice_verts[:, 0].max()
        min_z, max_z = slice_verts[:, 2].min(), slice_verts[:, 2].max()
        print(f"{y_center:10.2f} | {min_x:7.3f} {max_x:7.3f} {max_x-min_x:7.3f} | {min_z:7.3f} {max_z:7.3f} {max_z-min_z:7.3f} | {len(slice_verts):6d}")
