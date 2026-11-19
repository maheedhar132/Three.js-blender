import bpy
import numpy as np
import math

bpy.ops.wm.open_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
mesh = bpy.data.objects['Mesh_0']
verts = np.array([v.co for v in mesh.data.vertices], dtype=np.float32)

for i in range(len(verts)):
    x, y, z = verts[i]
    if -0.30 <= y <= 0.05 and z > 0.46:
        if y < -0.22:
            target_z = 0.490 + (y - (-0.30)) / 0.08 * 0.005
        elif y < -0.10:
            t = (y - (-0.22)) / 0.12
            target_z = 0.495 - t * 0.025
        else:
            t = (y - (-0.10)) / 0.15
            target_z = 0.470 + t * 0.020
        if z > target_z:
            excess = z - target_z
            verts[i, 2] = target_z + excess * 0.12

    if -0.32 <= y <= -0.14 and 0.30 <= z <= 0.52:
        if y < -0.24:
            target_width = 0.065
        elif y < -0.18:
            target_width = 0.062
        else:
            target_width = 0.058
        abs_x = abs(x)
        if abs_x > target_width:
            excess_x = abs_x - target_width
            sign = 1.0 if x > 0 else -1.0
            verts[i, 0] = sign * (target_width + excess_x * 0.18)

    if -0.28 <= y <= 0.02 and abs(x) < 0.08:
        if -0.28 <= y < -0.12:
            t = (y - (-0.28)) / 0.16
            target_throat_z = 0.355 - t * 0.035
            if z < target_throat_z and z > 0.15:
                verts[i, 2] = target_throat_z - (target_throat_z - z) * 0.20
        elif -0.12 <= y <= 0.02:
            target_chest_z = 0.295
            if z < target_chest_z and z > 0.18:
                verts[i, 2] = target_chest_z - (target_chest_z - z) * 0.25

    if 0.00 <= y <= 0.26 and abs(x) < 0.075:
        t = (y - 0.00) / 0.26
        target_belly_z = 0.280 + t * 0.040
        if z < target_belly_z and z > 0.16:
            verts[i, 2] = target_belly_z - (target_belly_z - z) * 0.15

    if -0.15 <= y <= 0.10:
        verts[i, 0] *= 0.92
    elif 0.12 <= y <= 0.26:
        verts[i, 0] *= 0.94
    elif 0.26 < y <= 0.38 and z > 0.18:
        verts[i, 0] *= 0.98

verts *= 0.94

for i, v in enumerate(mesh.data.vertices):
    v.co = verts[i]
mesh.data.update()

cam_data = bpy.data.cameras.new("PreviewCam")
cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# 3/4 front view looking at head, neck, shoulders
cam_obj.location = (0.7, -1.0, 0.6)
cam_obj.rotation_euler = (math.radians(72), 0, math.radians(35))

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.filepath = r"D:\Personal Projects\Visual Claude\tools\lioness_preview_front.png"
bpy.context.scene.render.image_settings.file_format = 'PNG'
bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
bpy.context.scene.display.shading.light = 'MATCAP'
bpy.context.scene.display.shading.color_type = 'TEXTURE'

bpy.ops.render.render(write_still=True)
print("Rendered lioness_preview_front.png!")
