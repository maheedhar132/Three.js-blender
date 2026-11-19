import bpy
import bmesh
import time

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
m = bpy.data.objects['Mesh_0']

bpy.context.view_layer.objects.active = m
bpy.ops.object.mode_set(mode='EDIT')
t0 = time.time()
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
print(f"Separation took {time.time()-t0:.2f}s")

mesh_objs = [o for o in bpy.data.objects if o.type == 'MESH']
sizes = [(o, len(o.data.vertices)) for o in mesh_objs]
sizes.sort(key=lambda x: x[1], reverse=True)

print(f"Total parts: {len(sizes)}")
print("Top 20 largest parts:")
for i, (o, count) in enumerate(sizes[:20]):
    bbox = [list(c) for c in o.bound_box]
    z_min = min(c[2] for c in bbox)
    z_max = max(c[2] for c in bbox)
    y_min = min(c[1] for c in bbox)
    y_max = max(c[1] for c in bbox)
    print(f"#{i+1}: {o.name} - {count} verts | Y:[{y_min:.2f}, {y_max:.2f}] | Z:[{z_min:.2f}, {z_max:.2f}]")
