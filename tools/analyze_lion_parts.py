import bpy
import mathutils
import numpy as np

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
m = bpy.data.objects['Mesh_0']

# Let's check UV map, vertex colors, etc.
print("Vertex count:", len(m.data.vertices))
print("Polygon count:", len(m.data.polygons))
print("UV layers:", [uv.name for uv in m.data.uv_layers])
print("Color attributes:", [c.name for c in m.data.color_attributes])

# Check bounding box
bbox = [list(c) for c in m.bound_box]
print("BBox min:", [min(c[i] for c in bbox) for i in range(3)])
print("BBox max:", [max(c[i] for c in bbox) for i in range(3)])
