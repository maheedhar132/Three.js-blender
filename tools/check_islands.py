import bpy
import bmesh

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']

# Decimate first
mod = mesh.modifiers.new(name="Decimate", type='DECIMATE')
mod.ratio = 0.02
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier="Decimate")

bm = bmesh.new()
bm.from_mesh(mesh.data)

visited = set()
islands = []
for v in bm.verts:
    if v not in visited:
        island = []
        stack = [v]
        visited.add(v)
        while stack:
            curr = stack.pop()
            island.append(curr)
            for e in curr.link_edges:
                other = e.other_vert(curr)
                if other not in visited:
                    visited.add(other)
                    stack.append(other)
        islands.append(island)

print(f"Total connected components (islands): {len(islands)}")
islands.sort(key=lambda isl: len(isl), reverse=True)
for i, isl in enumerate(islands[:10]):
    print(f"  Island {i}: {len(isl)} vertices")
bm.free()
