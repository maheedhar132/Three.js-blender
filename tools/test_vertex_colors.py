import bpy
from mathutils import Color

bpy.ops.wm.open_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
mesh = bpy.data.objects['Mesh_0']

print("Color attributes:", [ca.name for ca in mesh.data.color_attributes])

# Create color attribute
ca = mesh.data.color_attributes.new(name="Color", type='FLOAT_COLOR', domain='POINT')
print(f"Created color attribute: {ca.name}, domain: {ca.domain}, data length: {len(ca.data)}")

# Let's inspect setting colors on ca.data
# For each vertex, we can assign (R, G, B, A)
# Let's verify
ca.data[0].color = (1.0, 0.9, 0.8, 1.0)
print("Set color successfully:", list(ca.data[0].color))
