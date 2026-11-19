import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']

print("Mesh_0 vertices count:", len(mesh.data.vertices))
print("Mesh_0 polygons count:", len(mesh.data.polygons))

# Let's inspect polygons: are they quads/tris?
# Let's inspect UV layers
for uv in mesh.data.uv_layers:
    print("UV layer:", uv.name)

# Let's inspect vertex coordinates:
# Let's see how many vertices are on the torso, legs, head, mane
