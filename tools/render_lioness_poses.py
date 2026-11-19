import bpy
import math

bpy.ops.wm.read_factory_settings(use_empty=True)
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lioness-Rigged.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)

arm_obj = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh_obj = next(o for o in bpy.data.objects if o.type == 'MESH')

# Setup camera
cam_data = bpy.data.cameras.new("RenderCam")
cam_obj = bpy.data.objects.new("RenderCam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Camera framing for 3/4 side-front view
cam_obj.location = (1.4, -1.2, 0.7)
cam_obj.rotation_euler = (math.radians(72), 0, math.radians(48))

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
bpy.context.scene.display.shading.light = 'MATCAP'
bpy.context.scene.display.shading.color_type = 'TEXTURE'

actions = {act.name: act for act in bpy.data.actions}
print("Available actions to preview:", list(actions.keys()))

poses = [
    ('walk', 12, r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\docs\screenshots\lioness_walk.png"),
    ('standing', 15, r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\docs\screenshots\lioness_standing.png"),
    ('sitting', 30, r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\docs\screenshots\lioness_sitting.png"),
    ('sleeping', 30, r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\docs\screenshots\lioness_sleeping.png"),
]

for act_name, frame, filepath in poses:
    if act_name in actions:
        arm_obj.animation_data.action = actions[act_name]
        bpy.context.scene.frame_set(frame)
        bpy.context.scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)
        print(f"Rendered {act_name} at frame {frame} -> {filepath}")

print("Preview renders complete!")
