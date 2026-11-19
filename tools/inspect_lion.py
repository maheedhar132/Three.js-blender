import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)

for obj in bpy.data.objects:
    print(f"Object: {obj.name}, type: {obj.type}")
    if obj.type == 'MESH':
        print(f"  verts: {len(obj.data.vertices)}, faces: {len(obj.data.polygons)}")
        print(f"  materials: {[m.name for m in obj.data.materials if m]}")
        for m in obj.data.materials:
            if m and m.node_tree:
                for node in m.node_tree.nodes:
                    print(f"    node: {node.name} ({node.type})")
                    if node.type == 'TEX_IMAGE' and node.image:
                        print(f"      image: {node.image.name}, size: {node.image.size[:]}")

print("Inspection complete.")
