import bpy
import math
import os

print("=== RENDERING WHITE TIGER PREVIEWS ===")

# Reset scene and import WhiteTiger-Rigged.glb
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\WhiteTiger-Rigged.glb")

# Remove any helper objects created by glTF importer (e.g. bone shape Icosphere)
for o in list(bpy.data.objects):
    if "Icosphere" in o.name:
        bpy.data.objects.remove(o, do_unlink=True)

tiger = bpy.data.objects.get("WhiteTiger")

# Setup world light
world = bpy.data.worlds.new("TigerWorld")
bpy.context.scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = (0.75, 0.78, 0.82, 1.0)
bg.inputs["Strength"].default_value = 0.9

# Key light
light_data = bpy.data.lights.new(name="KeyLight", type='SUN')
light_data.energy = 4.0
light_obj = bpy.data.objects.new(name="KeyLight", object_data=light_data)
bpy.context.scene.collection.objects.link(light_obj)
light_obj.rotation_euler = (math.radians(45), math.radians(30), math.radians(-30))

# Fill light
fill_data = bpy.data.lights.new(name="FillLight", type='POINT')
fill_data.energy = 60.0
fill_obj = bpy.data.objects.new(name="FillLight", object_data=fill_data)
bpy.context.scene.collection.objects.link(fill_obj)
fill_obj.location = (-1.0, -1.2, 1.2)

# Focus Target Empty centered on tiger torso/head
target = bpy.data.objects.new("FocusTarget", None)
bpy.context.scene.collection.objects.link(target)
target.location = (0, -0.15, 0.72)

# Camera
cam_data = bpy.data.cameras.new("TigerCam")
cam_obj = bpy.data.objects.new("TigerCam", object_data=cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

track = cam_obj.constraints.new(type='TRACK_TO')
track.target = target
track.track_axis = 'TRACK_NEGATIVE_Z'
track.up_axis = 'UP_Y'

bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.image_settings.file_format = 'PNG'

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
screenshots_dir = os.path.join(base_dir, "igzp-virtual-zoo", "docs", "screenshots")
os.makedirs(screenshots_dir, exist_ok=True)

# 1. Side view: looking at tiger flank
target.location = (0, -0.05, 0.40)
cam_obj.location = (1.75, -0.05, 0.40)
bpy.context.view_layer.update()
side_path = os.path.join(screenshots_dir, "whitetiger-side.png")
bpy.context.scene.render.filepath = side_path
bpy.ops.render.render(write_still=True)
print("Rendered whitetiger-side.png")

# 2. Three-quarter front view
target.location = (0, -0.20, 0.42)
cam_obj.location = (1.10, -1.25, 0.65)
bpy.context.view_layer.update()
front_path = os.path.join(screenshots_dir, "whitetiger-front.png")
bpy.context.scene.render.filepath = front_path
bpy.ops.render.render(write_still=True)
print("Rendered whitetiger-front.png")

# 3. Head & Face close-up view (showing blue eyes, pink nose, white whiskers)
target.location = (0, -0.48, 0.50)
cam_obj.location = (0.35, -1.20, 0.62)
cam_data.lens = 45
bpy.context.view_layer.update()
face_path = os.path.join(screenshots_dir, "whitetiger-face.png")
bpy.context.scene.render.filepath = face_path
bpy.ops.render.render(write_still=True)
print("Rendered whitetiger-face.png")

print("=== PREVIEW RENDERING COMPLETE ===")
