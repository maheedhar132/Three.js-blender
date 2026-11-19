import bpy
import bmesh
import math
import mathutils
from mathutils import Vector, Euler, Matrix
import numpy as np

print("=== STARTING WHITE BENGAL TIGER CREATION PIPELINE ===")

# 1. Reset scene and remove all objects
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# -------------------------------------------------------------------------
# COLOR PALETTE: Leucistic White Bengal Tiger (Panthera tigris tigris)
# -------------------------------------------------------------------------
COAT_WHITE = (0.97, 0.96, 0.94, 1.0)        # Creamy ivory-white coat
BELLY_WHITE = (1.00, 1.00, 1.00, 1.0)       # Pure snow-white countershading
STRIPE_SEPIA = (0.08, 0.06, 0.05, 1.0)      # Deep sepia-chocolate to charcoal slate black stripes
NOSE_PINK = (0.95, 0.58, 0.65, 1.0)         # Distinctive pink nose leather
NOSE_FRECKLE = (0.24, 0.14, 0.14, 1.0)      # Dark nose freckles
EYE_BLUE = (0.16, 0.54, 0.92, 1.0)          # Sapphire ice-blue irises
EYE_PUPIL = (0.01, 0.01, 0.01, 1.0)         # Vertical pupil
EYE_RIM = (0.05, 0.04, 0.04, 1.0)           # Dark eyeliner
CLAW_SLATE = (0.22, 0.18, 0.16, 1.0)        # Retractable horn claws
WHISKER_WHITE = (1.00, 1.00, 1.00, 1.0)     # White vibrissae
EAR_INNER_PINK = (0.88, 0.74, 0.70, 1.0)    # Soft salmon inner ear
EAR_OCELLI_WHITE = (0.98, 0.98, 0.98, 1.0)  # White false eye spots on ear backs

def get_tiger_color(x, y, z, part_id):
    abs_x = abs(x)
    if part_id == 3: # Nose
        freckle = (math.sin(x * 140.0) * math.cos(z * 140.0)) > 0.60
        return NOSE_FRECKLE if freckle else NOSE_PINK
    if part_id == 4: # Eye
        eye_center_x = 0.058 if x > 0 else -0.058
        d_eye = math.hypot(x - eye_center_x, z - 0.515)
        if d_eye < 0.007:
            return EYE_PUPIL
        elif d_eye < 0.018:
            spec = 0.12 * math.sin(math.atan2(z - 0.515, x - eye_center_x) * 8.0)
            return (EYE_BLUE[0] + spec, EYE_BLUE[1] + spec, min(1.0, EYE_BLUE[2] + spec), 1.0)
        else:
            return EYE_RIM
    if part_id == 5: # Whisker
        return WHISKER_WHITE
    if part_id == 6: # Claw
        return CLAW_SLATE
    if part_id == 7: # Inner Ear
        return EAR_INNER_PINK
    if part_id == 8: # Outer Ear
        d_ocelli = math.hypot(abs_x - 0.076, z - 0.59)
        return EAR_OCELLI_WHITE if d_ocelli < 0.016 else STRIPE_SEPIA
    if part_id == 10: # Tail
        if y > 0.76:
            return STRIPE_SEPIA
        ring_phase = math.sin((y - 0.38) * 45.0)
        return STRIPE_SEPIA if ring_phase > 0.35 else COAT_WHITE
    
    # Body, neck, head, paws (parts 0, 1, 2, 9)
    is_belly = (z < 0.31 and abs_x < 0.09) or (y < -0.36 and z < 0.46 and abs_x < 0.05)
    base_col = BELLY_WHITE if is_belly else COAT_WHITE
    if part_id == 2 or y < -0.32:
        crown_stripe = math.sin(y * 55.0 + abs_x * 35.0)
        cheek_stripe = math.sin(y * 42.0 + z * 38.0)
        is_stripe = (z > 0.52 and crown_stripe > 0.45) or (z < 0.50 and abs_x > 0.07 and cheek_stripe > 0.40)
    elif z < 0.32:
        leg_stripe = math.sin(z * 48.0 + y * 12.0)
        is_stripe = (leg_stripe > 0.48) and (z > 0.05) and (abs_x > 0.06)
    else:
        warp = math.sin(x * 14.0) * 0.12 + math.sin(y * 10.0) * 0.08
        flank_stripe = math.sin(y * 32.0 + abs_x * 6.0 + warp)
        is_stripe = (flank_stripe > 0.42) and (z > 0.31 or abs_x > 0.08)
    return STRIPE_SEPIA if is_stripe else base_col

# -------------------------------------------------------------------------
# GEOMETRY CREATION: Muscular Apex Felid Body
# -------------------------------------------------------------------------
print("Constructing White Bengal Tiger anatomical geometry...")

tiger_mesh = bpy.data.meshes.new("WhiteTiger_Mesh")
bm = bmesh.new()
col_layer = bm.verts.layers.color.new("Color")

def create_lofted_tube(rings_data, segments=16, closed_start=False, closed_end=False, part_id=0):
    verts_grid = []
    for center, rx, rz in rings_data:
        ring = []
        for j in range(segments):
            ang = j * 2 * math.pi / segments
            vx = center.x + math.cos(ang) * rx
            vy = center.y
            vz = center.z + math.sin(ang) * rz
            v = bm.verts.new((vx, vy, vz))
            v[col_layer] = get_tiger_color(vx, vy, vz, part_id)
            ring.append(v)
        verts_grid.append(ring)
    
    # Bridge rings
    for i in range(len(rings_data) - 1):
        for j in range(segments):
            j_next = (j + 1) % segments
            bm.faces.new([
                verts_grid[i][j],
                verts_grid[i][j_next],
                verts_grid[i+1][j_next],
                verts_grid[i+1][j]
            ])
            
    # Cap start
    if closed_start:
        v_start = bm.verts.new(rings_data[0][0])
        v_start[col_layer] = get_tiger_color(rings_data[0][0].x, rings_data[0][0].y, rings_data[0][0].z, part_id)
        for j in range(segments):
            j_next = (j + 1) % segments
            bm.faces.new([v_start, verts_grid[0][j_next], verts_grid[0][j]])
            
    # Cap end
    if closed_end:
        v_end = bm.verts.new(rings_data[-1][0])
        v_end[col_layer] = get_tiger_color(rings_data[-1][0].x, rings_data[-1][0].y, rings_data[-1][0].z, part_id)
        for j in range(segments):
            j_next = (j + 1) % segments
            bm.faces.new([v_end, verts_grid[-1][j], verts_grid[-1][j_next]])

def create_ellipsoid(center, rx, ry, rz, u_steps=12, v_steps=10, part_id=0):
    verts_grid = []
    v_top = bm.verts.new((center.x, center.y, center.z + rz))
    v_top[col_layer] = get_tiger_color(center.x, center.y, center.z + rz, part_id)
    for i in range(1, v_steps):
        theta = i * math.pi / v_steps
        ring = []
        for j in range(u_steps):
            phi = j * 2 * math.pi / u_steps
            vx = center.x + rx * math.sin(theta) * math.cos(phi)
            vy = center.y + ry * math.sin(theta) * math.sin(phi)
            vz = center.z + rz * math.cos(theta)
            v = bm.verts.new((vx, vy, vz))
            v[col_layer] = get_tiger_color(vx, vy, vz, part_id)
            ring.append(v)
        verts_grid.append(ring)
    v_bottom = bm.verts.new((center.x, center.y, center.z - rz))
    v_bottom[col_layer] = get_tiger_color(center.x, center.y, center.z - rz, part_id)

    # Top fan
    for j in range(u_steps):
        j_next = (j + 1) % u_steps
        bm.faces.new([v_top, verts_grid[0][j], verts_grid[0][j_next]])

    # Quad rings
    for i in range(len(verts_grid) - 1):
        for j in range(u_steps):
            j_next = (j + 1) % u_steps
            bm.faces.new([
                verts_grid[i][j],
                verts_grid[i+1][j],
                verts_grid[i+1][j_next],
                verts_grid[i][j_next]
            ])

    # Bottom fan
    for j in range(u_steps):
        j_next = (j + 1) % u_steps
        bm.faces.new([v_bottom, verts_grid[-1][j_next], verts_grid[-1][j]])

# 1. Torso (Apex predator: massive deep ribcage, muscular loin, withers)
torso_rings = [
    (Vector((0,  0.38, 0.43)), 0.132, 0.168), # pelvis / rump
    (Vector((0,  0.30, 0.42)), 0.140, 0.172), # sacrum / hips
    (Vector((0,  0.22, 0.41)), 0.128, 0.158), # loin / waist
    (Vector((0,  0.14, 0.41)), 0.138, 0.172), # posterior ribcage
    (Vector((0,  0.06, 0.42)), 0.155, 0.195), # mid thorax
    (Vector((0, -0.02, 0.43)), 0.170, 0.215), # deep ribcage
    (Vector((0, -0.10, 0.45)), 0.175, 0.225), # chest / withers
    (Vector((0, -0.18, 0.47)), 0.165, 0.210), # pectorals / shoulder base
    (Vector((0, -0.24, 0.48)), 0.145, 0.190)  # anterior chest
]
create_lofted_tube(torso_rings, segments=22, closed_start=True, closed_end=False, part_id=0)

# Shoulder blade & haunch muscular masses
for side in [-1, 1]:
    create_ellipsoid(Vector((side * 0.135, -0.10, 0.45)), 0.072, 0.125, 0.140, u_steps=12, v_steps=10, part_id=0)
    create_ellipsoid(Vector((side * 0.118,  0.30, 0.41)), 0.078, 0.115, 0.135, u_steps=12, v_steps=10, part_id=0)

# 2. Muscular Neck
neck_rings = [
    (Vector((0, -0.24, 0.48)), 0.145, 0.190),
    (Vector((0, -0.28, 0.49)), 0.130, 0.170),
    (Vector((0, -0.32, 0.50)), 0.115, 0.150),
    (Vector((0, -0.36, 0.51)), 0.105, 0.135)
]
create_lofted_tube(neck_rings, segments=18, closed_start=False, closed_end=False, part_id=1)

# 3. Head & Elongated Feline Skull
# Cranium (Braincase)
create_ellipsoid(Vector((0, -0.39, 0.52)), 0.105, 0.088, 0.095, u_steps=16, v_steps=12, part_id=2)
# Sagittal crest
create_ellipsoid(Vector((0, -0.38, 0.575)), 0.026, 0.065, 0.026, u_steps=10, v_steps=6, part_id=2)
# Snout / Nasal bridge
create_ellipsoid(Vector((0, -0.46, 0.485)), 0.065, 0.068, 0.055, u_steps=14, v_steps=10, part_id=2)

# Cheek ruffs & Whisker pads (lateral flares)
for side in [-1, 1]:
    # Broad cheek ruffs
    create_ellipsoid(Vector((side * 0.100, -0.39, 0.48)), 0.048, 0.065, 0.058, u_steps=12, v_steps=10, part_id=2)
    # Whisker mystacial pads
    create_ellipsoid(Vector((side * 0.052, -0.49, 0.47)), 0.038, 0.042, 0.034, u_steps=10, v_steps=8, part_id=2)
    # Eye brow ridge
    create_ellipsoid(Vector((side * 0.055, -0.45, 0.535)), 0.034, 0.028, 0.020, u_steps=10, v_steps=8, part_id=2)

# Lower Jaw (Mandible & Chin)
lower_jaw_rings = [
    (Vector((0, -0.38, 0.45)), 0.068, 0.032),
    (Vector((0, -0.44, 0.44)), 0.058, 0.030),
    (Vector((0, -0.50, 0.44)), 0.044, 0.026)
]
create_lofted_tube(lower_jaw_rings, segments=14, closed_start=True, closed_end=True, part_id=2)

# Rounded Feline Ears
for side in [-1, 1]:
    # Outer ear shell
    create_ellipsoid(Vector((side * 0.076, -0.34, 0.59)), 0.040, 0.024, 0.046, u_steps=12, v_steps=10, part_id=8)
    # Inner ear hollow
    create_ellipsoid(Vector((side * 0.073, -0.35, 0.59)), 0.026, 0.013, 0.034, u_steps=10, v_steps=8, part_id=7)

# Eyes (Ice-blue sapphire globes positioned prominently in the ocular orbits)
for side in [-1, 1]:
    create_ellipsoid(Vector((side * 0.058, -0.465, 0.515)), 0.022, 0.020, 0.022, u_steps=14, v_steps=10, part_id=4)

# Pink Nose Leather (Prominently placed at front tip of snout)
create_ellipsoid(Vector((0, -0.545, 0.490)), 0.036, 0.026, 0.022, u_steps=14, v_steps=10, part_id=3)

# Whiskers (graceful vibrissae)
for side in [-1, 1]:
    for w_i, (wy, wz, dx, dy, dz) in enumerate([
        (-0.49, 0.475,  0.11, -0.01, -0.01),
        (-0.49, 0.465,  0.13, -0.02, -0.02),
        (-0.49, 0.455,  0.12, -0.03, -0.04),
        (-0.50, 0.470,  0.10, -0.01, -0.01),
        (-0.50, 0.460,  0.11, -0.02, -0.03)
    ]):
        pts = [
            Vector((side * 0.052, wy, wz)),
            Vector((side * (0.052 + dx * 0.5), wy + dy * 0.5, wz + dz * 0.3)),
            Vector((side * (0.052 + dx), wy + dy, wz + dz))
        ]
        for p_idx in range(len(pts) - 1):
            p1, p2 = pts[p_idx], pts[p_idx + 1]
            for j in range(4):
                ang = j * math.pi / 2
                ox = math.cos(ang) * 0.0035
                oz = math.sin(ang) * 0.0035
                v1 = bm.verts.new((p1.x + ox, p1.y, p1.z + oz))
                v2 = bm.verts.new((p2.x + ox, p2.y, p2.z + oz))
                v1[col_layer] = WHISKER_WHITE
                v2[col_layer] = WHISKER_WHITE

# 4. Forelegs (Massive columnar limbs, broad paws, claws)
for side in [-1, 1]:
    uarm_rings = [
        (Vector((side * 0.12, -0.10, 0.42)), 0.068, 0.078),
        (Vector((side * 0.11, -0.10, 0.31)), 0.058, 0.063),
        (Vector((side * 0.10, -0.11, 0.20)), 0.050, 0.055)
    ]
    create_lofted_tube(uarm_rings, segments=14, part_id=0)

    farm_rings = [
        (Vector((side * 0.10, -0.11, 0.20)), 0.050, 0.055),
        (Vector((side * 0.095, -0.12, 0.13)), 0.044, 0.048),
        (Vector((side * 0.090, -0.13, 0.06)), 0.040, 0.042)
    ]
    create_lofted_tube(farm_rings, segments=14, part_id=0)

    # Broad Front Paw
    create_ellipsoid(Vector((side * 0.090, -0.15, 0.035)), 0.058, 0.068, 0.032, u_steps=14, v_steps=10, part_id=9)
    
    # 4 Rounded Toes + Claws
    for toe_i in range(4):
        tx = side * (0.055 + toe_i * 0.024)
        ty = -0.19 - (1.0 - abs(toe_i - 1.5) * 0.5) * 0.015
        create_ellipsoid(Vector((tx, ty, 0.025)), 0.017, 0.023, 0.019, u_steps=10, v_steps=8, part_id=9)
        # Retractable claw tip
        create_ellipsoid(Vector((tx, ty - 0.022, 0.015)), 0.006, 0.013, 0.009, u_steps=8, v_steps=6, part_id=6)

# 5. Hindlegs (Athletic haunches, strong calves, hocks, rear paws)
for side in [-1, 1]:
    thigh_rings = [
        (Vector((side * 0.11, 0.30, 0.42)), 0.074, 0.094),
        (Vector((side * 0.115, 0.33, 0.33)), 0.068, 0.078),
        (Vector((side * 0.11, 0.35, 0.24)), 0.058, 0.063)
    ]
    create_lofted_tube(thigh_rings, segments=14, part_id=0)

    shin_rings = [
        (Vector((side * 0.11, 0.35, 0.24)), 0.058, 0.063),
        (Vector((side * 0.105, 0.39, 0.17)), 0.048, 0.050),
        (Vector((side * 0.10, 0.40, 0.11)), 0.040, 0.042)
    ]
    create_lofted_tube(shin_rings, segments=14, part_id=0)

    hock_rings = [
        (Vector((side * 0.10, 0.40, 0.11)), 0.040, 0.042),
        (Vector((side * 0.095, 0.38, 0.06)), 0.036, 0.038)
    ]
    create_lofted_tube(hock_rings, segments=12, part_id=0)

    # Broad Hind Paw
    create_ellipsoid(Vector((side * 0.095, 0.39, 0.032)), 0.055, 0.063, 0.030, u_steps=14, v_steps=10, part_id=9)
    
    # 4 Rear Toes + Claws
    for toe_i in range(4):
        tx = side * (0.060 + toe_i * 0.023)
        ty = 0.43 - abs(toe_i - 1.5) * 0.008
        create_ellipsoid(Vector((tx, ty, 0.022)), 0.016, 0.021, 0.017, u_steps=10, v_steps=8, part_id=9)
        create_ellipsoid(Vector((tx, ty + 0.018, 0.014)), 0.006, 0.011, 0.008, u_steps=8, v_steps=6, part_id=6)

# 6. Tail (4 segments to match standard 27-bone skeleton)
tail_rings = [
    (Vector((0, 0.38, 0.44)), 0.036, 0.036),
    (Vector((0, 0.49, 0.39)), 0.032, 0.032),
    (Vector((0, 0.60, 0.30)), 0.027, 0.027),
    (Vector((0, 0.71, 0.20)), 0.022, 0.022),
    (Vector((0, 0.82, 0.10)), 0.016, 0.016)
]
create_lofted_tube(tail_rings, segments=14, closed_start=False, closed_end=True, part_id=10)

# Subdivide bmesh for smoother anatomical contours and high-resolution vertex colors
bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=1, use_grid_fill=True)

bm.to_mesh(tiger_mesh)
bm.free()

tiger_obj = bpy.data.objects.new("WhiteTiger", tiger_mesh)
bpy.context.scene.collection.objects.link(tiger_obj)
bpy.context.view_layer.objects.active = tiger_obj

# Smooth shading
for poly in tiger_mesh.polygons:
    poly.use_smooth = True

print(f"Tiger mesh built: {len(tiger_mesh.vertices)} vertices, {len(tiger_mesh.polygons)} polygons")
print("Vertex colors applied successfully via bmesh layer!")

# PBR Material connecting Color attribute to Base Color
mat = bpy.data.materials.new(name="M_WhiteTiger")
mat.use_nodes = True
bsdf = mat.node_tree.nodes.get("Principled BSDF")
attr_node = mat.node_tree.nodes.new("ShaderNodeAttribute")
attr_node.attribute_name = "Color"
mat.node_tree.links.new(attr_node.outputs["Color"], bsdf.inputs["Base Color"])
bsdf.inputs["Roughness"].default_value = 0.78
bsdf.inputs["Metallic"].default_value = 0.02
tiger_mesh.materials.append(mat)

# -------------------------------------------------------------------------
# ARMATURE & SKELETON CREATION: Exact 27-Bone Feline Skeleton
# -------------------------------------------------------------------------
print("Creating standard 27-bone feline skeleton...")

arm_data = bpy.data.armatures.new("WhiteTiger_Armature_Data")
arm_obj = bpy.data.objects.new("WhiteTiger_Armature", arm_data)
bpy.context.scene.collection.objects.link(arm_obj)
bpy.context.view_layer.objects.active = arm_obj
bpy.ops.object.mode_set(mode='EDIT')

edit_bones = arm_data.edit_bones

def make_bone(name, head, tail, parent_name=None):
    b = edit_bones.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent_name and parent_name in edit_bones:
        b.parent = edit_bones[parent_name]
    return b

# Core Spine, Head & Jaw (7 bones)
make_bone("root", (0, 0, 0), (0, -0.05, 0))
make_bone("pelvis", (0, 0.36, 0.43), (0, 0.20, 0.42), "root")
make_bone("spine", (0, 0.20, 0.42), (0, -0.08, 0.46), "pelvis")
make_bone("chest", (0, -0.08, 0.46), (0, -0.18, 0.48), "spine")
make_bone("neck", (0, -0.18, 0.48), (0, -0.34, 0.52), "chest")
make_bone("head", (0, -0.34, 0.52), (0, -0.46, 0.48), "neck")
make_bone("jaw", (0, -0.36, 0.45), (0, -0.49, 0.42), "head")

# Forelegs (8 bones)
make_bone("shoulder.L", (0.08, -0.06, 0.45), (0.11, -0.09, 0.36), "chest")
make_bone("upper_arm.L", (0.11, -0.09, 0.36), (0.10, -0.10, 0.20), "shoulder.L")
make_bone("forearm.L", (0.10, -0.10, 0.20), (0.09, -0.12, 0.07), "upper_arm.L")
make_bone("paw.L", (0.09, -0.12, 0.07), (0.09, -0.17, 0.01), "forearm.L")

make_bone("shoulder.R", (-0.08, -0.06, 0.45), (-0.11, -0.09, 0.36), "chest")
make_bone("upper_arm.R", (-0.11, -0.09, 0.36), (-0.10, -0.10, 0.20), "shoulder.R")
make_bone("forearm.R", (-0.10, -0.10, 0.20), (-0.09, -0.12, 0.07), "upper_arm.R")
make_bone("paw.R", (-0.09, -0.12, 0.07), (-0.09, -0.17, 0.01), "forearm.R")

# Tail (4 bones)
make_bone("tail.01", (0, 0.38, 0.44), (0, 0.49, 0.39), "pelvis")
make_bone("tail.02", (0, 0.49, 0.39), (0, 0.60, 0.30), "tail.01")
make_bone("tail.03", (0, 0.60, 0.30), (0, 0.71, 0.20), "tail.02")
make_bone("tail.04", (0, 0.71, 0.20), (0, 0.82, 0.10), "tail.03")

# Hindlegs (8 bones)
make_bone("thigh.L", (0.09, 0.32, 0.42), (0.11, 0.35, 0.26), "pelvis")
make_bone("shin.L", (0.11, 0.35, 0.26), (0.10, 0.40, 0.13), "thigh.L")
make_bone("hock.L", (0.10, 0.40, 0.13), (0.10, 0.38, 0.06), "shin.L")
make_bone("paw_back.L", (0.10, 0.38, 0.06), (0.10, 0.41, 0.01), "hock.L")

make_bone("thigh.R", (-0.09, 0.32, 0.42), (-0.11, 0.35, 0.26), "pelvis")
make_bone("shin.R", (-0.11, 0.35, 0.26), (-0.10, 0.40, 0.13), "thigh.R")
make_bone("hock.R", (-0.10, 0.40, 0.13), (-0.10, 0.38, 0.06), "shin.R")
make_bone("paw_back.R", (-0.10, 0.38, 0.06), (-0.10, 0.41, 0.01), "hock.R")

bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (b.head.copy(), b.tail.copy())

bpy.ops.object.mode_set(mode='OBJECT')
assert len(arm_data.bones) == 27, f"Expected 27 bones, got {len(arm_data.bones)}"
print(f"Skeleton successfully constructed with exactly {len(arm_data.bones)} bones!")

# -------------------------------------------------------------------------
# SMOOTH SKINNING: Distance-Weighted Vertex Group Skinning
# -------------------------------------------------------------------------
print("Skinning mesh vertices with bone weights...")

tiger_obj.vertex_groups.clear()
vgroups = {name: tiger_obj.vertex_groups.new(name=name) for name in bone_segments}

def dist_to_segment(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 == 0:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    proj = a + t * ab
    return (p - proj).length

for idx, v in enumerate(tiger_mesh.vertices):
    p = v.co
    weights = []
    for name, (a, b) in bone_segments.items():
        if name.endswith(".L") and p.x < -0.015:
            continue
        if name.endswith(".R") and p.x > 0.015:
            continue

        d = dist_to_segment(p, a, b)

        # Tail isolation
        if "tail" in name and p.y < 0.37:
            continue
        if "tail" not in name and p.y > 0.42 and (p.x**2 + (p.z - 0.30)**2) < 0.025:
            d *= 3.5

        # Jaw isolation
        if name == "jaw":
            if p.y > -0.34 or p.z > 0.46:
                continue
            d *= 0.45
        elif name == "head":
            if p.y < -0.36 and p.z < 0.44:
                d *= 2.5

        w = 1.0 / ((d + 0.025) ** 2.6)
        weights.append((name, w))

    weights.sort(key=lambda item: item[1], reverse=True)
    top_weights = weights[:4]
    sum_w = sum(w for _, w in top_weights)
    if sum_w > 0:
        for name, w in top_weights:
            norm_w = w / sum_w
            if norm_w > 0.01:
                vgroups[name].add([idx], norm_w, 'REPLACE')

tiger_obj.parent = arm_obj
arm_mod = tiger_obj.modifiers.new(name="Armature", type='ARMATURE')
arm_mod.object = arm_obj
arm_mod.use_vertex_groups = True
print("Skinning complete!")

# -------------------------------------------------------------------------
# ANIMATION BAKING: 5 Baked Actions ('walk', 'standing', 'sitting', 'sleeping', 'chuff')
# -------------------------------------------------------------------------
print("Baking animations: walk, standing, sitting, sleeping, chuff...")

if not arm_obj.animation_data:
    arm_obj.animation_data_create()

def key_bone(pb, frame, loc=None, rot_euler=None):
    if loc is not None:
        pb.location = Vector(loc)
        pb.keyframe_insert(data_path="location", frame=frame)
    if rot_euler is not None:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = Euler(rot_euler, 'XYZ')
        pb.keyframe_insert(data_path="rotation_euler", frame=frame)

def reset_pose():
    for pb in arm_obj.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)

# 1. 'walk' (Heavy predatory low-shoulder stalking walk)
print("  - Baking 'walk'...")
act_walk = bpy.data.actions.new(name="walk")
arm_obj.animation_data.action = act_walk

for frame in range(1, 61, 3):
    t = (frame - 1) / 59.0
    reset_pose()
    ph = t * math.pi * 2

    chest_bob = math.cos(ph * 2) * 0.015
    spine_sway = math.sin(ph) * 0.03
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, chest_bob - 0.02), rot_euler=(math.radians(6), 0, spine_sway))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, chest_bob * 0.5), rot_euler=(math.radians(2), 0, -spine_sway * 0.5))
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0, -chest_bob * 0.6), rot_euler=(math.radians(-3), 0, -spine_sway))

    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(10), 0, -spine_sway * 0.3))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(-10), 0, 0))

    # 4-beat lateral sequence gait
    sw_lf = math.sin(ph)
    key_bone(arm_obj.pose.bones["upper_arm.L"], frame, rot_euler=(sw_lf * 0.45, 0, 0))
    key_bone(arm_obj.pose.bones["forearm.L"], frame, rot_euler=(max(0.0, -sw_lf) * 0.40, 0, 0))
    key_bone(arm_obj.pose.bones["paw.L"], frame, rot_euler=(sw_lf * 0.20, 0, 0))

    sw_rf = math.sin(ph + math.pi)
    key_bone(arm_obj.pose.bones["upper_arm.R"], frame, rot_euler=(sw_rf * 0.45, 0, 0))
    key_bone(arm_obj.pose.bones["forearm.R"], frame, rot_euler=(max(0.0, -sw_rf) * 0.40, 0, 0))
    key_bone(arm_obj.pose.bones["paw.R"], frame, rot_euler=(sw_rf * 0.20, 0, 0))

    sw_lh = math.sin(ph - math.pi * 0.5)
    key_bone(arm_obj.pose.bones["thigh.L"], frame, rot_euler=(sw_lh * 0.42, 0, 0))
    key_bone(arm_obj.pose.bones["shin.L"], frame, rot_euler=(-sw_lh * 0.35 + max(0.0, sw_lh) * 0.40, 0, 0))
    key_bone(arm_obj.pose.bones["hock.L"], frame, rot_euler=(sw_lh * 0.25, 0, 0))
    key_bone(arm_obj.pose.bones["paw_back.L"], frame, rot_euler=(sw_lh * 0.15, 0, 0))

    sw_rh = math.sin(ph + math.pi * 0.5)
    key_bone(arm_obj.pose.bones["thigh.R"], frame, rot_euler=(sw_rh * 0.42, 0, 0))
    key_bone(arm_obj.pose.bones["shin.R"], frame, rot_euler=(-sw_rh * 0.35 + max(0.0, sw_rh) * 0.40, 0, 0))
    key_bone(arm_obj.pose.bones["hock.R"], frame, rot_euler=(sw_rh * 0.25, 0, 0))
    key_bone(arm_obj.pose.bones["paw_back.R"], frame, rot_euler=(sw_rh * 0.15, 0, 0))

    t_sway = math.sin(ph - 0.5) * 0.18
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(0, 0, t_sway * 0.4))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(0, 0, t_sway * 0.8))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(0, 0, t_sway * 1.2))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, t_sway * 1.6))

trk_walk = arm_obj.animation_data.nla_tracks.new()
trk_walk.name = "walk_track"
trk_walk.strips.new("walk", 1, act_walk)

# 2. 'standing' (Idle breathing + alert gaze + tail flick)
print("  - Baking 'standing'...")
act_standing = bpy.data.actions.new(name="standing")
arm_obj.animation_data.action = act_standing

for frame in [1, 20, 40, 60]:
    t = (frame - 1) / 59.0
    reset_pose()
    breath = math.sin(t * math.pi * 2) * 0.018
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, breath), rot_euler=(breath * 0.3, 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, breath * 0.5), rot_euler=(0, 0, 0))
    
    head_scan = math.sin(t * math.pi * 2) * 0.05
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(breath * 0.15, 0, head_scan))

    flick = math.sin(t * math.pi * 4) * 0.25 if t > 0.4 else 0.03
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(0, 0, flick * 0.25))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(0, 0, flick * 0.65))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(0, 0, flick * 1.10))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, flick * 1.60))

trk_standing = arm_obj.animation_data.nla_tracks.new()
trk_standing.name = "standing_track"
trk_standing.strips.new("standing", 1, act_standing)

# 3. 'sitting' (Alert seated haunches posture)
print("  - Baking 'sitting'...")
act_sitting = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = act_sitting

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_pose()
    breath = math.sin(t * math.pi * 2) * 0.012

    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.06, -0.21), rot_euler=(math.radians(28), 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0.02, -0.12), rot_euler=(math.radians(-14), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.03), rot_euler=(math.radians(-8) + breath, 0, 0))
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(-10), 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(6) + breath * 0.4, 0, math.sin(t * math.pi * 2) * 0.05))

    for s in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + s], frame, rot_euler=(math.radians(-52), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + s], frame, rot_euler=(math.radians(68), 0, 0))
        key_bone(arm_obj.pose.bones["hock" + s], frame, rot_euler=(math.radians(-22), 0, 0))
        key_bone(arm_obj.pose.bones["paw_back" + s], frame, rot_euler=(math.radians(6), 0, 0))

    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-25), 0, math.radians(20)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-20), 0, math.radians(35)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-15), 0, math.radians(45)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(math.radians(-10), 0, math.radians(50)))

trk_sitting = arm_obj.animation_data.nla_tracks.new()
trk_sitting.name = "sitting_track"
trk_sitting.strips.new("sitting", 1, act_sitting)

# 4. 'sleeping' (Resting on side/ground, deep slow breathing)
print("  - Baking 'sleeping'...")
act_sleeping = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = act_sleeping

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_pose()
    deep_breath = math.sin(t * math.pi * 2) * 0.022

    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0.04, 0.04, -0.31), rot_euler=(math.radians(10), math.radians(14), math.radians(6)))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0.02, 0.01, -0.27), rot_euler=(0, math.radians(9), deep_breath))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, -0.02, -0.24), rot_euler=(deep_breath, math.radians(6), 0))
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(22), math.radians(-10), math.radians(-14)))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(30), math.radians(-14), math.radians(-22)))

    for s in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + s], frame, rot_euler=(math.radians(-68), math.radians(14 if s=='.L' else -14), 0))
        key_bone(arm_obj.pose.bones["shin" + s], frame, rot_euler=(math.radians(78), 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + s], frame, rot_euler=(math.radians(44), math.radians(16 if s=='.L' else -16), 0))
        key_bone(arm_obj.pose.bones["forearm" + s], frame, rot_euler=(math.radians(-48), 0, 0))

    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-38), 0, math.radians(18)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-28), 0, math.radians(28)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-18), 0, math.radians(35)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(math.radians(-10), 0, math.radians(25)))

trk_sleeping = arm_obj.animation_data.nla_tracks.new()
trk_sleeping.name = "sleeping_track"
trk_sleeping.strips.new("sleeping", 1, act_sleeping)

# 5. 'chuff' (Prusten greeting vocalization: head tilt, rhythmic jaw pulses)
print("  - Baking 'chuff'...")
act_chuff = bpy.data.actions.new(name="chuff")
arm_obj.animation_data.action = act_chuff

reset_pose()
key_bone(arm_obj.pose.bones["chest"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["neck"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 1, rot_euler=(0, 0, 0))

key_bone(arm_obj.pose.bones["chest"], 10, loc=(0, 0, 0.01), rot_euler=(math.radians(3), 0, 0))
key_bone(arm_obj.pose.bones["neck"], 10, rot_euler=(math.radians(8), 0, 0))
key_bone(arm_obj.pose.bones["head"], 10, rot_euler=(math.radians(-6), 0, 0))

for i, f_start in enumerate([14, 22, 30]):
    f_open = f_start + 3
    key_bone(arm_obj.pose.bones["jaw"], f_open, rot_euler=(math.radians(14 - i * 2), 0, 0))
    key_bone(arm_obj.pose.bones["head"], f_open, rot_euler=(math.radians(-10), 0, math.radians(2 if i%2 else -2)))
    key_bone(arm_obj.pose.bones["chest"], f_open, loc=(0, 0, 0.015), rot_euler=(math.radians(5), 0, 0))
    
    f_close = f_start + 7
    key_bone(arm_obj.pose.bones["jaw"], f_close, rot_euler=(math.radians(2), 0, 0))
    key_bone(arm_obj.pose.bones["head"], f_close, rot_euler=(math.radians(-4), 0, 0))

key_bone(arm_obj.pose.bones["jaw"], 45, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 50, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["neck"], 55, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["chest"], 60, loc=(0, 0, 0), rot_euler=(0, 0, 0))

trk_chuff = arm_obj.animation_data.nla_tracks.new()
trk_chuff.name = "chuff_track"
trk_chuff.strips.new("chuff", 1, act_chuff)

# -------------------------------------------------------------------------
# EXPORT TO GLB
# -------------------------------------------------------------------------
out_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\WhiteTiger-Rigged.glb"
print(f"Exporting rigged & animated White Bengal Tiger to {out_path}...")

bpy.ops.object.select_all(action='DESELECT')
tiger_obj.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj

bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_nla_strips=True
)

print("=== WHITE BENGAL TIGER PIPELINE COMPLETE ===")
