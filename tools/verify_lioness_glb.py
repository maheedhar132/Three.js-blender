import bpy

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lioness-Rigged.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)

print("Objects in imported GLB:")
for o in bpy.data.objects:
    print(f"  {o.name} ({o.type})")
    if o.type == 'ARMATURE':
        print(f"    Bones ({len(o.data.bones)}): {[b.name for b in o.data.bones]}")

print("Actions in imported GLB:")
for act in bpy.data.actions:
    print(f"  Action: '{act.name}', frames: {act.frame_range[:]}")

print("Verification complete.")
