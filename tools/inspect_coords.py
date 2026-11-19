import bpy
from mathutils import Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']

# Decimate for quick analysis
mod = mesh.modifiers.new(name="Decimate", type='DECIMATE')
mod.ratio = 0.02
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier="Decimate")

bbox_corners = [mesh.matrix_world @ Vector(corner) for corner in mesh.bound_box]
min_x = min(v.x for v in bbox_corners)
max_x = max(v.x for v in bbox_corners)
min_y = min(v.y for v in bbox_corners)
max_y = max(v.y for v in bbox_corners)
min_z = min(v.z for v in bbox_corners)
max_z = max(v.z for v in bbox_corners)

print(f"BBox: X=[{min_x:.3f}, {max_x:.3f}], Y=[{min_y:.3f}, {max_y:.3f}], Z=[{min_z:.3f}, {max_z:.3f}]")
print(f"Lion faces: {len(mesh.data.polygons)}, verts: {len(mesh.data.vertices)}")

# Let's inspect vertex density or coordinates around mane region
# The lion faces -Y. Head is at Y ~ -0.2 to -0.35, Z ~ 0.35 to 0.55.
# Chest is at Y ~ -0.1 to 0.1, Z ~ 0.2 to 0.5.
# Pelvis is at Y ~ 0.2 to 0.4.
# Tail is at Y > 0.35 to 0.75.
