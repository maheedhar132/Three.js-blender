import bpy
import numpy as np
import math

bpy.ops.wm.open_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
mesh = bpy.data.objects['Mesh_0']

# Get vertices as numpy array
verts = np.array([v.co for v in mesh.data.vertices], dtype=np.float32)

print(f"Original mesh bounds:")
print(f"  X: [{verts[:, 0].min():.3f}, {verts[:, 0].max():.3f}]")
print(f"  Y: [{verts[:, 1].min():.3f}, {verts[:, 1].max():.3f}]")
print(f"  Z: [{verts[:, 2].min():.3f}, {verts[:, 2].max():.3f}]")

# 1. Sleek skull and dorsal neck (remove cranial ruff):
# In male lion, cranial ruff reaches Z = 0.628 between Y in [-0.28, -0.05].
# Lioness skull dome: Z ~ 0.490 at Y = -0.28, rising gently to 0.495 at nape Y = -0.22,
# then smoothly sloping to 0.475 at neck Y = -0.12, and 0.485 at withers Y = -0.02.
for i in range(len(verts)):
    x, y, z = verts[i]
    
    # --- A. CRANIAL RUFF & DORSAL NAPE ---
    if -0.30 <= y <= 0.05 and z > 0.46:
        # Determine target dorsal profile along Y
        if y < -0.22:
            # Skull crown
            target_z = 0.490 + (y - (-0.30)) / 0.08 * 0.005
        elif y < -0.10:
            # Nape to neck
            t = (y - (-0.22)) / 0.12
            target_z = 0.495 - t * 0.025
        else:
            # Neck to withers
            t = (y - (-0.10)) / 0.15
            target_z = 0.470 + t * 0.020
            
        if z > target_z:
            excess = z - target_z
            # Smoothly compress excess down to target profile
            verts[i, 2] = target_z + excess * 0.12

    # --- B. CHEEK FRILLS ---
    # In male lion, cheek frills flare out to |X| = 0.147 between Y in [-0.30, -0.16].
    # Lioness skull/cheek contour: |X| max 0.065 at jaw/cheek, tapering to 0.055 at neck.
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

    # --- C. THROAT BEARD & PECTORAL CHEST MANE ---
    # In male lion, pectoral mane hangs down to Z = 0.20 between Y in [-0.22, 0.00].
    # Lioness throat and sternum: clean muscular contour.
    # Throat rises from sternum Z = 0.32 at Y = -0.10 up to jaw Z = 0.35 at Y = -0.28.
    if -0.28 <= y <= 0.02 and abs(x) < 0.08:
        if -0.28 <= y < -0.12:
            # Throat region: underneath neck
            t = (y - (-0.28)) / 0.16
            target_throat_z = 0.355 - t * 0.035 # from 0.355 down to 0.320
            if z < target_throat_z and z > 0.15:
                # Pull hanging beard fur up into sleek throat
                verts[i, 2] = target_throat_z - (target_throat_z - z) * 0.20
        elif -0.12 <= y <= 0.02:
            # Pectoral chest between forelegs: clean sternum at Z ~ 0.295
            target_chest_z = 0.295
            if z < target_chest_z and z > 0.18:
                verts[i, 2] = target_chest_z - (target_chest_z - z) * 0.25

    # --- D. VENTRAL BELLY FRINGE ---
    # In male lion, belly fringe hangs down to Z = 0.188 between Y in [0.00, 0.24].
    # Lioness has a taut, athletic waist-tuck: belly sweeps up from 0.28 at ribcage to 0.32 at groin.
    if 0.00 <= y <= 0.26 and abs(x) < 0.075:
        t = (y - 0.00) / 0.26
        target_belly_z = 0.280 + t * 0.040
        if z < target_belly_z and z > 0.16:
            verts[i, 2] = target_belly_z - (target_belly_z - z) * 0.15

    # --- E. ATHLETIC PROPORTIONS (NARROWER CHEST, STREAMLINED FLANKS) ---
    # Narrower chest: scale X by ~0.92 in chest region Y in [-0.15, 0.10]
    if -0.15 <= y <= 0.10:
        verts[i, 0] *= 0.92
    # Athletic flank waist-tuck: narrow waist at Y in [0.12, 0.26]
    elif 0.12 <= y <= 0.26:
        verts[i, 0] *= 0.94
    # Athletic haunches at Y in [0.26, 0.38]: muscular thighs
    elif 0.26 < y <= 0.38 and z > 0.18:
        # Subtle muscular haunches definition
        verts[i, 0] *= 0.98

# --- F. GLOBAL SCALE (~0.94 scale, ~130-150kg female vs 200-220kg male) ---
verts *= 0.94

# Write back to mesh
for i, v in enumerate(mesh.data.vertices):
    v.co = verts[i]

mesh.data.update()

print(f"Transformed Lioness mesh bounds:")
print(f"  X: [{verts[:, 0].min():.3f}, {verts[:, 0].max():.3f}] (width: {verts[:, 0].max() - verts[:, 0].min():.3f})")
print(f"  Y: [{verts[:, 1].min():.3f}, {verts[:, 1].max():.3f}] (length: {verts[:, 1].max() - verts[:, 1].min():.3f})")
print(f"  Z: [{verts[:, 2].min():.3f}, {verts[:, 2].max():.3f}] (height: {verts[:, 2].max() - verts[:, 2].min():.3f})")

# Let's render a preview image to verify visually!
# Setup camera
cam_data = bpy.data.cameras.new("PreviewCam")
cam_obj = bpy.data.objects.new("PreviewCam", cam_data)
bpy.context.scene.collection.objects.link(cam_obj)
bpy.context.scene.camera = cam_obj

# Side view
cam_obj.location = (1.5, 0.1, 0.4)
cam_obj.rotation_euler = (math.radians(85), 0, math.radians(90))

# Setup render settings
bpy.context.scene.render.resolution_x = 800
bpy.context.scene.render.resolution_y = 600
bpy.context.scene.render.filepath = r"D:\Personal Projects\Visual Claude\tools\lioness_preview_side.png"
bpy.context.scene.render.image_settings.file_format = 'PNG'

# Set display mode
bpy.context.scene.render.engine = 'BLENDER_WORKBENCH'
bpy.context.scene.display.shading.light = 'MATCAP'
bpy.context.scene.display.shading.color_type = 'TEXTURE'

bpy.ops.render.render(write_still=True)
print("Rendered lioness_preview_side.png!")
