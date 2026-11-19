import bpy
import mathutils
from mathutils import Vector, Euler, Matrix
import math
import os

print("=== BUILDING HIGH-FIDELITY CHIMPANZEE 3D MODEL, RIG & ANIMATIONS ===")

# 1. Reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

parts = []

def add_ellipsoid(loc, scale, rot=(0,0,0), segs=16, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.active_object
    obj.scale = scale
    obj.rotation_euler = Euler(rot, 'XYZ')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    parts.append(obj)
    return obj

def add_capsule(p1, p2, radius, segs=12):
    v1 = Vector(p1)
    v2 = Vector(p2)
    axis = v2 - v1
    length = axis.length
    mid = (v1 + v2) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=segs, radius=radius, depth=length, location=mid)
    obj = bpy.context.active_object
    up = Vector((0, 0, 1))
    q = up.rotation_difference(axis)
    obj.rotation_euler = q.to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=8, radius=radius, location=v1)
    s1 = bpy.context.active_object
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=8, radius=radius, location=v2)
    s2 = bpy.context.active_object
    parts.extend([obj, s1, s2])
    return obj

# ----------------------------------------------------
# A. BUILD ANATOMICAL CHIMPANZEE MESH GEOMETRY
# ----------------------------------------------------
print("Building anatomical geometry...")

# 1. Torso, Withers & Spine (sloping quadrupedal posture)
# Pelvis (lower than withers: Z=0.48 vs Z=0.67)
add_ellipsoid((0, 0.35, 0.48), (0.19, 0.17, 0.16), (math.radians(-12), 0, 0)) # Pelvis
add_ellipsoid((0, 0.20, 0.54), (0.21, 0.19, 0.17), (math.radians(-18), 0, 0)) # Lumbar
add_ellipsoid((0, 0.04, 0.60), (0.23, 0.22, 0.20), (math.radians(-24), 0, 0)) # Deep Barrel Chest
add_ellipsoid((0, -0.06, 0.67), (0.20, 0.18, 0.16), (math.radians(-30), 0, 0)) # Hunched withers

# Deltoids / broad muscular shoulder humps
for s in [-1, 1]:
    add_ellipsoid((s * 0.20, -0.06, 0.64), (0.11, 0.12, 0.11))

# 2. Neck & Cranium
add_capsule((0, -0.08, 0.64), (0, -0.22, 0.65), 0.115) # Short thick muscular neck
add_ellipsoid((0, -0.26, 0.68), (0.135, 0.13, 0.13)) # Cranium

# Heavy prominent supraorbital brow ridge
add_ellipsoid((0, -0.37, 0.66), (0.125, 0.055, 0.04))

# Sunken orbital eye sockets
for s in [-1, 1]:
    add_ellipsoid((s * 0.055, -0.36, 0.64), (0.028, 0.028, 0.028))

# Prognathic bare muzzle & wrinkled lips
add_ellipsoid((0, -0.41, 0.58), (0.095, 0.09, 0.075), (math.radians(18), 0, 0)) # Upper muzzle / nostrils
add_ellipsoid((0, -0.43, 0.54), (0.085, 0.075, 0.06), (math.radians(22), 0, 0)) # Wrinkled lips
add_ellipsoid((0, -0.38, 0.49), (0.075, 0.085, 0.055), (math.radians(12), 0, 0)) # Lower jaw / chin

# Lateral protruding cupped ears
for s in [-1, 1]:
    add_ellipsoid((s * 0.17, -0.24, 0.66), (0.025, 0.065, 0.075), (0, math.radians(s * 25), math.radians(-s * 18)))

# 3. Robust Forelimbs (Knuckle-walking pose: elbows slightly out, wrists & knuckles planted)
for s in [-1, 1]:
    add_capsule((s * 0.20, -0.06, 0.62), (s * 0.25, -0.10, 0.36), 0.078) # Upper arm
    add_capsule((s * 0.25, -0.10, 0.36), (s * 0.22, -0.18, 0.12), 0.068) # Forearm
    add_ellipsoid((s * 0.22, -0.18, 0.11), (0.058, 0.055, 0.048)) # Wrist joint
    add_ellipsoid((s * 0.22, -0.21, 0.035), (0.055, 0.055, 0.035)) # Knuckle pad (weight-bearing)
    add_capsule((s * 0.18, -0.18, 0.08), (s * 0.13, -0.20, 0.03), 0.022) # Opposable thumb
    add_ellipsoid((s * 0.22, -0.23, 0.02), (0.048, 0.038, 0.02)) # Flexed fingers tucked under

# 4. Hindlimbs (Flexed hips & knees, grasping feet)
for s in [-1, 1]:
    add_capsule((s * 0.14, 0.32, 0.45), (s * 0.18, 0.20, 0.23), 0.082) # Thigh
    add_capsule((s * 0.18, 0.20, 0.23), (s * 0.16, 0.28, 0.08), 0.068) # Shank / calf
    add_ellipsoid((s * 0.16, 0.28, 0.075), (0.052, 0.052, 0.048)) # Heel & ankle
    add_ellipsoid((s * 0.16, 0.21, 0.025), (0.055, 0.095, 0.025)) # Grasping foot sole
    add_capsule((s * 0.15, 0.22, 0.025), (s * 0.08, 0.19, 0.02), 0.025) # Opposable big toe (hallux)
    add_ellipsoid((s * 0.16, 0.12, 0.02), (0.048, 0.042, 0.02)) # Lateral toes (digits 2-5)

# Join all parts
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh = bpy.context.active_object
mesh.name = "Chimpanzee_Mesh"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# Remesh to single seamless organic manifold mesh
print("Remeshing mesh...")
remesh = mesh.modifiers.new(name="Remesh", type='REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = 0.015
remesh.adaptivity = 0.0
bpy.ops.object.modifier_apply(modifier="Remesh")

smooth = mesh.modifiers.new(name="Smooth", type='SMOOTH')
smooth.iterations = 3
smooth.factor = 0.5
bpy.ops.object.modifier_apply(modifier="Smooth")
bpy.ops.object.shade_smooth()

faces = len(mesh.data.polygons)
print(f"Unified Mesh: {faces} faces, {len(mesh.data.vertices)} vertices")
if faces > 18000:
    ratio = 16000.0 / faces
    dec = mesh.modifiers.new(name="Decimate", type='DECIMATE')
    dec.ratio = ratio
    bpy.ops.object.modifier_apply(modifier="Decimate")
    print(f"Decimated to: {len(mesh.data.polygons)} faces")

# Materials
mat_fur = bpy.data.materials.new("Chimp_Fur")
bsdf_fur = mat_fur.node_tree.nodes["Principled BSDF"]
bsdf_fur.inputs["Base Color"].default_value = (0.038, 0.032, 0.028, 1.0) # Shaggy dark brown-black coat
bsdf_fur.inputs["Roughness"].default_value = 0.88

mat_skin = bpy.data.materials.new("Chimp_Skin")
bsdf_skin = mat_skin.node_tree.nodes["Principled BSDF"]
bsdf_skin.inputs["Base Color"].default_value = (0.42, 0.32, 0.27, 1.0) # Bare warm tan/pinkish skin
bsdf_skin.inputs["Roughness"].default_value = 0.65

mesh.data.materials.append(mat_fur)
mesh.data.materials.append(mat_skin)

# Assign skin material specifically to face mask, ears, hands/knuckles, and feet/soles
skin_faces = 0
for poly in mesh.data.polygons:
    c = poly.center
    x, y, z = abs(c.x), c.y, c.z
    is_skin = False
    
    # Face mask (muzzle, lips, brow, orbital sockets)
    if y < -0.34 and z < 0.68 and z > 0.45 and x < 0.12:
        is_skin = True
    # Inner cupped ears
    elif x > 0.138 and y < -0.19 and y > -0.29 and z > 0.60 and z < 0.72:
        is_skin = True
    # Palms, knuckles, thumb (strictly at ground level)
    elif z < 0.045 and y < -0.17 and y > -0.27 and x > 0.15 and x < 0.28:
        is_skin = True
    # Foot soles, hallux, toes (strictly at ground level)
    elif z < 0.035 and y > 0.08 and y < 0.26 and x > 0.06 and x < 0.21:
        is_skin = True
        
    if is_skin:
        poly.material_index = 1
        skin_faces += 1
    else:
        poly.material_index = 0

print(f"Materials assigned: {len(mesh.data.polygons) - skin_faces} Fur, {skin_faces} Skin")

# ----------------------------------------------------
# B. CREATE PRIMATE SKELETON (ARMATURE)
# ----------------------------------------------------
print("Constructing Primate Skeleton...")
arm_data = bpy.data.armatures.new("Chimpanzee_Armature_Data")
arm_obj = bpy.data.objects.new("Chimpanzee_Armature", arm_data)
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

# Core Spine, Head & Ears
make_bone("root", (0, 0, 0), (0, -0.05, 0))
make_bone("pelvis", (0, 0.35, 0.48), (0, 0.20, 0.54), "root")
make_bone("spine", (0, 0.20, 0.54), (0, 0.04, 0.60), "pelvis")
make_bone("chest", (0, 0.04, 0.60), (0, -0.08, 0.64), "spine")
make_bone("neck", (0, -0.08, 0.64), (0, -0.22, 0.65), "chest")
make_bone("head", (0, -0.22, 0.65), (0, -0.36, 0.64), "neck")
make_bone("jaw", (0, -0.28, 0.56), (0, -0.40, 0.50), "head")
make_bone("ear.L", (0.13, -0.24, 0.66), (0.18, -0.24, 0.67), "head")
make_bone("ear.R", (-0.13, -0.24, 0.66), (-0.18, -0.24, 0.67), "head")

# Front Long Articulated Arms (shoulder, upper_arm, forearm, wrist, knuckle, thumb)
for s, suf in [(1, ".L"), (-1, ".R")]:
    make_bone("shoulder" + suf, (s * 0.10, -0.06, 0.63), (s * 0.20, -0.06, 0.62), "chest")
    make_bone("upper_arm" + suf, (s * 0.20, -0.06, 0.62), (s * 0.25, -0.10, 0.36), "shoulder" + suf)
    make_bone("forearm" + suf, (s * 0.25, -0.10, 0.36), (s * 0.22, -0.18, 0.12), "upper_arm" + suf)
    make_bone("wrist" + suf, (s * 0.22, -0.18, 0.12), (s * 0.22, -0.20, 0.05), "forearm" + suf)
    make_bone("knuckle" + suf, (s * 0.22, -0.20, 0.05), (s * 0.22, -0.23, 0.015), "wrist" + suf)
    make_bone("thumb" + suf, (s * 0.18, -0.18, 0.08), (s * 0.13, -0.20, 0.025), "wrist" + suf)

# Hind Legs (thigh, shin, foot, hallux)
for s, suf in [(1, ".L"), (-1, ".R")]:
    make_bone("thigh" + suf, (s * 0.14, 0.32, 0.45), (s * 0.18, 0.20, 0.23), "pelvis")
    make_bone("shin" + suf, (s * 0.18, 0.20, 0.23), (s * 0.16, 0.28, 0.08), "thigh" + suf)
    make_bone("foot" + suf, (s * 0.16, 0.28, 0.08), (s * 0.16, 0.16, 0.02), "shin" + suf)
    make_bone("hallux" + suf, (s * 0.15, 0.22, 0.03), (s * 0.08, 0.19, 0.02), "foot" + suf)

bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (b.head.copy(), b.tail.copy())

bpy.ops.object.mode_set(mode='OBJECT')
print(f"Primate skeleton constructed with {len(arm_data.bones)} bones")

# ----------------------------------------------------
# C. CALCULATE SMOOTH SKINNING WEIGHTS
# ----------------------------------------------------
print("Computing smooth vertex skinning weights...")
mesh.vertex_groups.clear()
vgroups = {}
for name in bone_segments:
    vgroups[name] = mesh.vertex_groups.new(name=name)

def dist_to_segment(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 == 0:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    proj = a + t * ab
    return (p - proj).length

for idx, v in enumerate(mesh.data.vertices):
    p = v.co
    weights = []
    for name, (a, b) in bone_segments.items():
        if name.endswith(".L") and p.x < -0.015:
            continue
        if name.endswith(".R") and p.x > 0.015:
            continue
            
        d = dist_to_segment(p, a, b)
        
        # Bone isolation heuristics
        if "jaw" in name:
            if p.y > -0.26 or p.z > 0.58:
                continue
            d *= 0.5
        elif name == "head":
            if p.y < -0.32 and p.z < 0.53:
                d *= 2.5
        elif "ear" in name:
            if abs(p.x) < 0.12 or p.y > -0.16:
                continue
            d *= 0.6
        elif "knuckle" in name:
            if p.z > 0.07 or p.y > -0.14:
                continue
            d *= 0.7
        elif "thumb" in name:
            if p.z > 0.10 or p.y > -0.12 or abs(p.x) > 0.20:
                continue
            d *= 0.7
        elif "hallux" in name:
            if p.z > 0.06 or p.y < 0.12 or abs(p.x) > 0.14:
                continue
            d *= 0.7

        w = 1.0 / ((d + 0.02) ** 2.8)
        weights.append((name, w))
        
    weights.sort(key=lambda item: item[1], reverse=True)
    top = weights[:4]
    sum_w = sum(w for _, w in top)
    if sum_w > 0:
        for name, w in top:
            norm_w = w / sum_w
            if norm_w > 0.01:
                vgroups[name].add([idx], norm_w, 'REPLACE')

print("Skinning weights applied!")

# Parent Mesh to Armature
mesh.parent = arm_obj
mesh.matrix_parent_inverse = arm_obj.matrix_world.inverted()
arm_mod = mesh.modifiers.new(name="Armature", type='ARMATURE')
arm_mod.object = arm_obj
arm_mod.use_vertex_groups = True

# ----------------------------------------------------
# D. SETUP KEYFRAME ANIMATIONS (NLA TRACKS)
# ----------------------------------------------------
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

def reset_all_pose_bones():
    for pb in arm_obj.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)

pb = arm_obj.pose.bones

# ==========================================
# ANIMATION 1: knuckle_walk (Quadrupedal knuckle walking cycle)
# ==========================================
print("Creating 'knuckle_walk' animation...")
act_walk = bpy.data.actions.new(name="knuckle_walk")
arm_obj.animation_data.action = act_walk

walk_frames = [1, 10, 20, 30, 40]
for frame in walk_frames:
    t = (frame - 1) / 39.0
    reset_all_pose_bones()
    
    # Torso bobbing and subtle sway
    bob = -math.sin(t * math.pi * 4) * 0.015
    sway = math.sin(t * math.pi * 2) * 0.015
    roll = math.sin(t * math.pi * 2) * math.radians(2.0)
    
    key_bone(pb["pelvis"], frame, loc=(sway * 0.5, 0, -bob * 0.6), rot_euler=(0, roll, sway * 1.2))
    key_bone(pb["chest"], frame, loc=(sway, 0, 0), rot_euler=(-bob * 1.5, -roll, -sway * 1.5))
    key_bone(pb["head"], frame, rot_euler=(bob * 1.2, roll * 0.5, sway * 1.2))
    
    p_L = t * math.pi * 2
    p_R = p_L + math.pi
    
    # Left Arm
    sin_L = math.sin(p_L)
    cos_L = math.cos(p_L)
    lift_L = max(0.0, -cos_L)
    arm_swing_L = sin_L * math.radians(22)
    key_bone(pb["shoulder.L"], frame, rot_euler=(lift_L * math.radians(5), 0, 0))
    key_bone(pb["upper_arm.L"], frame, rot_euler=(-arm_swing_L - lift_L * math.radians(14), 0, lift_L * math.radians(6)))
    key_bone(pb["forearm.L"], frame, rot_euler=(lift_L * math.radians(32), 0, 0))
    key_bone(pb["wrist.L"], frame, rot_euler=(-lift_L * math.radians(18), 0, 0))
    key_bone(pb["knuckle.L"], frame, rot_euler=(lift_L * math.radians(14), 0, 0))
    
    # Right Arm
    sin_R = math.sin(p_R)
    cos_R = math.cos(p_R)
    lift_R = max(0.0, -cos_R)
    arm_swing_R = sin_R * math.radians(22)
    key_bone(pb["shoulder.R"], frame, rot_euler=(lift_R * math.radians(5), 0, 0))
    key_bone(pb["upper_arm.R"], frame, rot_euler=(-arm_swing_R - lift_R * math.radians(14), 0, -lift_R * math.radians(6)))
    key_bone(pb["forearm.R"], frame, rot_euler=(lift_R * math.radians(32), 0, 0))
    key_bone(pb["wrist.R"], frame, rot_euler=(-lift_R * math.radians(18), 0, 0))
    key_bone(pb["knuckle.R"], frame, rot_euler=(lift_R * math.radians(14), 0, 0))
    
    # Left Leg (in phase with Right Arm)
    leg_swing_L = math.sin(p_R) * math.radians(20)
    leg_lift_L = max(0.0, -math.cos(p_R))
    key_bone(pb["thigh.L"], frame, rot_euler=(-leg_swing_L - leg_lift_L * math.radians(16), 0, 0))
    key_bone(pb["shin.L"], frame, rot_euler=(leg_lift_L * math.radians(34), 0, 0))
    key_bone(pb["foot.L"], frame, rot_euler=(-leg_lift_L * math.radians(16), 0, 0))
    
    # Right Leg (in phase with Left Arm)
    leg_swing_R = math.sin(p_L) * math.radians(20)
    leg_lift_R = max(0.0, -math.cos(p_L))
    key_bone(pb["thigh.R"], frame, rot_euler=(-leg_swing_R - leg_lift_R * math.radians(16), 0, 0))
    key_bone(pb["shin.R"], frame, rot_euler=(leg_lift_R * math.radians(34), 0, 0))
    key_bone(pb["foot.R"], frame, rot_euler=(-leg_lift_R * math.radians(16), 0, 0))

track_walk = arm_obj.animation_data.nla_tracks.new()
track_walk.name = "knuckle_walk_track"
track_walk.strips.new("knuckle_walk", 1, act_walk)

# ==========================================
# ANIMATION 2: standing (Semi-upright alert bipedal stance)
# ==========================================
print("Creating 'standing' animation...")
act_standing = bpy.data.actions.new(name="standing")
arm_obj.animation_data.action = act_standing

for frame in [1, 15, 30, 45, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    
    breath = math.sin(t * math.pi * 2) * 0.012
    look_yaw = math.sin(t * math.pi * 2) * math.radians(18)
    look_pitch = math.cos(t * math.pi * 2) * math.radians(5)
    
    # Stand upright: loc Z = -0.10 elevates pelvis world Z
    key_bone(pb["pelvis"], frame, loc=(0, 0, -0.10), rot_euler=(-math.radians(38), 0, 0))
    key_bone(pb["spine"], frame, rot_euler=(-math.radians(20), 0, 0))
    key_bone(pb["chest"], frame, rot_euler=(-math.radians(14) - breath * 0.8, 0, 0))
    key_bone(pb["neck"], frame, rot_euler=(math.radians(24), 0, look_yaw * 0.4))
    key_bone(pb["head"], frame, rot_euler=(math.radians(26) + look_pitch, 0, look_yaw * 0.8))
    
    key_bone(pb["ear.L"], frame, rot_euler=(0, math.sin(t * math.pi * 4) * 0.05, 0))
    key_bone(pb["ear.R"], frame, rot_euler=(0, -math.sin(t * math.pi * 4) * 0.05, 0))
    
    # Bent-knee bipedal support
    for s in [".L", ".R"]:
        key_bone(pb["thigh" + s], frame, rot_euler=(math.radians(24), 0, math.radians(5 if s=='.L' else -5)))
        key_bone(pb["shin" + s], frame, rot_euler=(math.radians(-26), 0, 0))
        key_bone(pb["foot" + s], frame, rot_euler=(math.radians(12), 0, 0))
        
        # Free-hanging arms
        key_bone(pb["shoulder" + s], frame, rot_euler=(math.radians(8), 0, 0))
        key_bone(pb["upper_arm" + s], frame, rot_euler=(math.radians(14) + breath * 0.4, 0, math.radians(8 if s=='.L' else -8)))
        key_bone(pb["forearm" + s], frame, rot_euler=(math.radians(24), 0, 0))
        key_bone(pb["wrist" + s], frame, rot_euler=(math.radians(8), 0, 0))

track_standing = arm_obj.animation_data.nla_tracks.new()
track_standing.name = "standing_track"
track_standing.strips.new("standing", 1, act_standing)

# ==========================================
# ANIMATION 3: sitting (Seated haunches pose)
# ==========================================
print("Creating 'sitting' animation...")
act_sitting = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = act_sitting

for frame in [1, 20, 40, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.010
    head_tilt = math.sin(t * math.pi * 2) * math.radians(6)
    
    # Pelvis lowered to ground with loc Z = +0.26
    key_bone(pb["pelvis"], frame, loc=(0, 0, 0.26), rot_euler=(-math.radians(35), 0, 0))
    key_bone(pb["spine"], frame, rot_euler=(-math.radians(12), 0, 0))
    key_bone(pb["chest"], frame, rot_euler=(-math.radians(8) - breath, 0, 0))
    key_bone(pb["neck"], frame, rot_euler=(math.radians(18), 0, head_tilt * 0.3))
    key_bone(pb["head"], frame, rot_euler=(math.radians(20), head_tilt, head_tilt * 0.5))
    
    for s in [".L", ".R"]:
        key_bone(pb["thigh" + s], frame, rot_euler=(-math.radians(45), math.radians(22 if s=='.L' else -22), 0))
        key_bone(pb["shin" + s], frame, rot_euler=(math.radians(65), 0, 0))
        key_bone(pb["foot" + s], frame, rot_euler=(math.radians(-15), 0, 0))
        
        # Relaxed arms resting on knees
        key_bone(pb["shoulder" + s], frame, rot_euler=(math.radians(-4), 0, 0))
        key_bone(pb["upper_arm" + s], frame, rot_euler=(math.radians(-14), 0, math.radians(10 if s=='.L' else -10)))
        key_bone(pb["forearm" + s], frame, rot_euler=(math.radians(38), 0, 0))
        key_bone(pb["wrist" + s], frame, rot_euler=(math.radians(-10), 0, 0))

track_sitting = arm_obj.animation_data.nla_tracks.new()
track_sitting.name = "sitting_track"
track_sitting.strips.new("sitting", 1, act_sitting)

# ==========================================
# ANIMATION 4: sleeping (Curled relaxed resting on ground)
# ==========================================
print("Creating 'sleeping' animation...")
act_sleeping = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = act_sleeping

for frame in [1, 20, 40, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    deep_breath = math.sin(t * math.pi * 2) * 0.016
    
    # Body lowered onto ground with loc Z = +0.34
    key_bone(pb["pelvis"], frame, loc=(0.04, 0, 0.34), rot_euler=(-math.radians(10), math.radians(12), math.radians(6)))
    key_bone(pb["spine"], frame, rot_euler=(0, math.radians(8), deep_breath))
    key_bone(pb["chest"], frame, rot_euler=(-deep_breath * 1.2, math.radians(6), 0))
    key_bone(pb["neck"], frame, rot_euler=(math.radians(22), math.radians(-8), math.radians(-12)))
    key_bone(pb["head"], frame, rot_euler=(math.radians(28), math.radians(-12), math.radians(-18)))
    
    for s in [".L", ".R"]:
        key_bone(pb["thigh" + s], frame, rot_euler=(-math.radians(58), math.radians(14 if s=='.L' else -14), 0))
        key_bone(pb["shin" + s], frame, rot_euler=(math.radians(72), 0, 0))
        key_bone(pb["upper_arm" + s], frame, rot_euler=(math.radians(40), math.radians(14 if s=='.L' else -14), 0))
        key_bone(pb["forearm" + s], frame, rot_euler=(math.radians(-38), 0, 0))
        key_bone(pb["wrist" + s], frame, rot_euler=(math.radians(-12), 0, 0))

track_sleeping = arm_obj.animation_data.nla_tracks.new()
track_sleeping.name = "sleeping_track"
track_sleeping.strips.new("sleeping", 1, act_sleeping)

# ==========================================
# ANIMATION 5: grooming (Finger-picking fur motion)
# ==========================================
print("Creating 'grooming' animation...")
act_grooming = bpy.data.actions.new(name="grooming")
arm_obj.animation_data.action = act_grooming

for frame in [1, 15, 30, 45, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    
    # Seated leaning slightly forward toward partner/fur
    key_bone(pb["pelvis"], frame, loc=(0, 0, 0.26), rot_euler=(-math.radians(32), 0, 0))
    key_bone(pb["spine"], frame, rot_euler=(-math.radians(8), 0, 0))
    key_bone(pb["chest"], frame, rot_euler=(-math.radians(4), 0, 0))
    key_bone(pb["neck"], frame, rot_euler=(math.radians(16), 0, 0))
    key_bone(pb["head"], frame, rot_euler=(math.radians(24), 0, 0))
    
    # Soft lip-smacking grooming mouth motion
    lip_smack = math.sin(t * math.pi * 6) * math.radians(8)
    key_bone(pb["jaw"], frame, rot_euler=(max(0.0, lip_smack), 0, 0))
    
    for s in [".L", ".R"]:
        key_bone(pb["thigh" + s], frame, rot_euler=(-math.radians(45), math.radians(22 if s=='.L' else -22), 0))
        key_bone(pb["shin" + s], frame, rot_euler=(math.radians(65), 0, 0))
        key_bone(pb["foot" + s], frame, rot_euler=(math.radians(-15), 0, 0))
    
    # Left Arm: resting hand holding partner steady
    key_bone(pb["shoulder.L"], frame, rot_euler=(math.radians(-4), 0, 0))
    key_bone(pb["upper_arm.L"], frame, rot_euler=(math.radians(-10), 0, math.radians(8)))
    key_bone(pb["forearm.L"], frame, rot_euler=(math.radians(38), 0, 0))
    key_bone(pb["wrist.L"], frame, rot_euler=(math.radians(-10), 0, 0))
    
    # Right Arm: active delicate finger-picking and fur-parting gesture
    pick_cycle = math.sin(t * math.pi * 4) # 2 pick cycles per loop
    pick_angle = pick_cycle * math.radians(16)
    
    key_bone(pb["shoulder.R"], frame, rot_euler=(math.radians(-2), 0, 0))
    key_bone(pb["upper_arm.R"], frame, rot_euler=(math.radians(-15) + pick_angle * 0.4, 0, math.radians(-12)))
    key_bone(pb["forearm.R"], frame, rot_euler=(math.radians(48) + pick_angle * 0.8, 0, 0))
    key_bone(pb["wrist.R"], frame, rot_euler=(math.radians(-22) - pick_angle, 0, 0))
    key_bone(pb["knuckle.R"], frame, rot_euler=(math.radians(24) + pick_angle * 1.2, 0, 0))
    key_bone(pb["thumb.R"], frame, rot_euler=(math.radians(14) + pick_angle, 0, 0))

track_grooming = arm_obj.animation_data.nla_tracks.new()
track_grooming.name = "grooming_track"
track_grooming.strips.new("grooming", 1, act_grooming)

# ----------------------------------------------------
# E. EXPORT TO GLB
# ----------------------------------------------------
output_glb = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Chimpanzee-Rigged.glb"
print(f"Exporting rigged chimpanzee to: {output_glb}")

for o in list(bpy.data.objects):
    if o != mesh and o != arm_obj:
        bpy.data.objects.remove(o, do_unlink=True)

# Crucial: Reset armature to pure rest pose before glTF export
reset_all_pose_bones()
arm_obj.animation_data.action = None
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()

bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj

bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_nla_strips=True
)

file_size = os.path.getsize(output_glb)
print(f"Export complete! File size: {file_size / (1024*1024):.2f} MB")
print("=== CHIMPANZEE 3D ASSET GENERATION SUCCESSFUL ===")
