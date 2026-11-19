import bpy
import numpy as np

bpy.ops.wm.open_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
mesh = bpy.data.objects['Mesh_0']
img = bpy.data.images['Image_0']

print(f"Image name: {img.name}, size: {img.size[:]}")

# Check UVs and where body vs mane vertices are mapped in UV space
uv_layer = mesh.data.uv_layers.active.data
print(f"Total UV loops: {len(uv_layer)}")

# Sample average color of image
# img.pixels is a flat float array (RGBA)
pixels = np.array(img.pixels[:], dtype=np.float32).reshape((img.size[1], img.size[0], 4))
mean_color = pixels.mean(axis=(0, 1))
print(f"Mean RGBA: {mean_color}")
