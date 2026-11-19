import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']

mat = mesh.data.materials[0]
print(f"Material: {mat.name}")
for node in mat.node_tree.nodes:
    if node.type == 'BSDF_PRINCIPLED':
        for inp in node.inputs:
            if inp.is_linked:
                from_node = inp.links[0].from_node
                print(f"  Principled input '{inp.name}' linked from: {from_node.name} ({from_node.type})")
            elif inp.default_value is not None:
                if hasattr(inp.default_value, '__iter__'):
                    val = [round(x, 3) for x in inp.default_value]
                else:
                    val = round(inp.default_value, 3)
                # only print non-standard defaults
                # print(f"  Principled input '{inp.name}' = {val}")

for img in bpy.data.images:
    print(f"Image: {img.name}, size: {img.size[:]}, depth: {img.depth}, filepath: {img.filepath}")
