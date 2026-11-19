import bpy
import mathutils
from mathutils import Vector, Euler, Color
import math
import numpy as np

print("=== STARTING ORGANIC SCULPTED CHIMPANZEE PIPELINE (29 BONES, DUAL PBR) ===")

# 1. Reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

parts = []

def add_ellipsoid(loc, scale, rot=(0,0,0), segs=24, rings=18):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.active_object
    obj.scale = scale
    obj.rotation_euler = Euler(rot, 'XYZ')
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    parts.append(obj)
    return obj

def add_cylinder(p1, p2, r1, r2, segs=20):
    v1 = Vector(p1)
    v2 = Vector(p2)
    axis = v2 - v1
    length = axis.length
    mid = (v1 + v2) * 0.5
    bpy.ops.mesh.primitive_cone_add(vertices=segs, radius1=r1, radius2=r2, depth=length, location=mid)
    obj = bpy.context.active_object
    up = Vector((0, 0, 1))
    q = up.rotation_difference(axis)
    obj.rotation_euler = q.to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    parts.append(obj)
    return obj

# ----------------------------------------------------
# A. BUILD ANATOMICAL CHIMPANZEE PROPORTIONS
# ----------------------------------------------------
print("Building anatomical forms...")

# 1. Torso & Sloping Quadrupedal Spine
add_ellipsoid((0, 0.35, 0.46), (0.17, 0.16, 0.15), (math.radians(-14), 0, 0)) # Pelvis
add_ellipsoid((0, 0.20, 0.53), (0.20, 0.18, 0.16), (math.radians(-20), 0, 0)) # Lumbar / abdomen
add_ellipsoid((0, 0.04, 0.59), (0.22, 0.21, 0.19), (math.radians(-26), 0, 0)) # Barrel chest
add_ellipsoid((0, -0.06, 0.65), (0.21, 0.19, 0.17), (math.radians(-32), 0, 0)) # Hunched withers

# Deltoids / broad muscular shoulder humps
for s in [-1, 1]:
    add_ellipsoid((s * 0.19, -0.06, 0.62), (0.11, 0.12, 0.11))

# 2. Neck & Cranium
add_cylinder((0, -0.08, 0.63), (0, -0.22, 0.64), 0.12, 0.11) # Short thick muscular neck
add_ellipsoid((0, -0.26, 0.67), (0.13, 0.13, 0.125)) # Cranium

# Facial Anatomy: Heavy prominent brow ridge, sunken eye orbits, prognathic muzzle
add_ellipsoid((0, -0.36, 0.65), (0.115, 0.05, 0.04)) # Supraorbital brow ridge
add_ellipsoid((0, -0.40, 0.58), (0.09, 0.085, 0.075), (math.radians(16), 0, 0)) # Fleshy upper muzzle
add_ellipsoid((0, -0.41, 0.53), (0.08, 0.075, 0.06), (math.radians(20), 0, 0)) # Wrinkled lips
add_ellipsoid((0, -0.36, 0.48), (0.075, 0.08, 0.055), (math.radians(10), 0, 0)) # Lower jaw / chin

# Protruding bare cupped ears set laterally
for s in [-1, 1]:
    add_ellipsoid((s * 0.16, -0.24, 0.65), (0.025, 0.055, 0.065), (0, math.radians(s * 25), math.radians(-s * 15)))

# 3. Robust Forelimbs (Knuckle-walking pose)
for s in [-1, 1]:
    add_cylinder((s * 0.19, -0.06, 0.62), (s * 0.20, -0.15, 0.38), 0.085, 0.072) # Brachium (upper arm)
    add_ellipsoid((s * 0.20, -0.15, 0.38), (0.068, 0.068, 0.068)) # Elbow joint
    add_cylinder((s * 0.20, -0.15, 0.38), (s * 0.17, -0.24, 0.14), 0.072, 0.058) # Heavy muscular forearm
    add_ellipsoid((s * 0.17, -0.24, 0.14), (0.055, 0.055, 0.05)) # Wrist
    # Knuckles / planted hand
    add_ellipsoid((s * 0.17, -0.24, 0.06), (0.055, 0.075, 0.05), (math.radians(15), 0, 0))
    add_ellipsoid((s * 0.17, -0.27, 0.02), (0.05, 0.045, 0.022))

# 4. Hind Limbs (Quadrupedal bent knee stance)
for s in [-1, 1]:
    add_cylinder((s * 0.14, 0.32, 0.44), (s * 0.15, 0.26, 0.23), 0.095, 0.075) # Thigh
    add_ellipsoid((s * 0.15, 0.26, 0.23), (0.068, 0.068, 0.068)) # Knee joint
    add_cylinder((s * 0.15, 0.26, 0.23), (s * 0.14, 0.33, 0.08), 0.072, 0.055) # Shin (lower leg)
    add_ellipsoid((s * 0.14, 0.33, 0.08), (0.052, 0.052, 0.045)) # Ankle
    add_ellipsoid((s * 0.14, 0.34, 0.03), (0.05, 0.09, 0.028), (math.radians(-5), 0, 0)) # Foot
    add_ellipsoid((s * 0.14, 0.39, 0.015), (0.045, 0.04, 0.018)) # Toes

# ----------------------------------------------------
# B. VOXEL REMESH: SEAMLESS ORGANIC CHARACTER MESH
# ----------------------------------------------------
print("Joining and remeshing into seamless continuous organic sculpt...")
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()

chimp_mesh = bpy.context.active_object
chimp_mesh.name = "Chimpanzee_Mesh"

mod_remesh = chimp_mesh.modifiers.new(name="VoxelRemesh", type='REMESH')
mod_remesh.mode = 'VOXEL'
mod_remesh.voxel_size = 0.018
bpy.ops.object.modifier_apply(modifier="VoxelRemesh")

mod_smooth = chimp_mesh.modifiers.new(name="Smooth", type='SMOOTH')
mod_smooth.factor = 0.65
mod_smooth.iterations = 3
bpy.ops.object.modifier_apply(modifier="Smooth")

mod_dec = chimp_mesh.modifiers.new(name="Decimate", type='DECIMATE')
mod_dec.ratio = 0.50
bpy.ops.object.modifier_apply(modifier="Decimate")

bpy.ops.object.shade_smooth()
print(f"Organic Chimpanzee mesh built: {len(chimp_mesh.data.vertices)} vertices, {len(chimp_mesh.data.polygons)} polygons")

# ----------------------------------------------------
# C. DUAL PBR MATERIALS: Chimp_Fur & Chimp_Skin
# ----------------------------------------------------
print("Setting up dual PBR materials: Chimp_Fur and Chimp_Skin...")
mat_fur = bpy.data.materials.new("Chimp_Fur")
bsdf_fur = mat_fur.node_tree.nodes.get("Principled BSDF")
bsdf_fur.inputs["Base Color"].default_value = (0.05, 0.045, 0.04, 1.0) # Rich shaggy dark coat
bsdf_fur.inputs["Roughness"].default_value = 0.88
bsdf_fur.inputs["Metallic"].default_value = 0.02

mat_skin = bpy.data.materials.new("Chimp_Skin")
bsdf_skin = mat_skin.node_tree.nodes.get("Principled BSDF")
bsdf_skin.inputs["Base Color"].default_value = (0.24, 0.18, 0.14, 1.0) # Bare warm tan/pinkish skin
bsdf_skin.inputs["Roughness"].default_value = 0.65
bsdf_skin.inputs["Metallic"].default_value = 0.01

chimp_mesh.data.materials.append(mat_fur)  # index 0
chimp_mesh.data.materials.append(mat_skin) # index 1

skin_poly_count = 0
for poly in chimp_mesh.data.polygons:
    c = poly.center
    abs_x, y, z = abs(c.x), c.y, c.z
    is_skin = False
    # Face mask (muzzle, lips, brow, orbital sockets)
    if y < -0.32 and z < 0.68 and z > 0.45 and abs_x < 0.12:
        is_skin = True
    # Inner cupped ears
    elif abs_x > 0.13 and y < -0.19 and y > -0.29 and z > 0.58 and z < 0.72:
        is_skin = True
    # Palms, knuckles (ground level)
    elif z < 0.05 and y < -0.15 and y > -0.30 and abs_x > 0.12:
        is_skin = True
    # Foot soles, hallux, toes
    elif z < 0.04 and y > 0.15 and y < 0.42 and abs_x > 0.08:
        is_skin = True
        
    if is_skin:
        poly.material_index = 1
        skin_poly_count += 1
    else:
        poly.material_index = 0

print(f"Assigned {skin_poly_count} Skin polygons, {len(chimp_mesh.data.polygons) - skin_poly_count} Fur polygons")

# ----------------------------------------------------
# D. EXACT 29-BONE PRIMATE ARMATURE SKELETON
# ----------------------------------------------------
print("Building exact 29-bone chimpanzee skeleton...")
arm_data = bpy.data.armatures.new("Chimp_Armature_Data")
arm_obj = bpy.data.objects.new("Chimp_Armature", arm_data)
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

# Core Spine, Head & Ears (9 bones)
make_bone("root", (0, 0, 0), (0, -0.05, 0))
make_bone("pelvis", (0, 0.35, 0.46), (0, 0.20, 0.53), "root")
make_bone("spine", (0, 0.20, 0.53), (0, 0.04, 0.59), "pelvis")
make_bone("chest", (0, 0.04, 0.59), (0, -0.08, 0.63), "spine")
make_bone("neck", (0, -0.08, 0.63), (0, -0.22, 0.64), "chest")
make_bone("head", (0, -0.22, 0.64), (0, -0.34, 0.64), "neck")
make_bone("jaw", (0, -0.28, 0.56), (0, -0.40, 0.50), "head")
make_bone("ear.L", (0.13, -0.24, 0.66), (0.18, -0.24, 0.67), "head")
make_bone("ear.R", (-0.13, -0.24, 0.66), (-0.18, -0.24, 0.67), "head")

# Forelimbs: shoulder, upper_arm, forearm, wrist, knuckle, thumb (12 bones)
for s, side in [(1, ".L"), (-1, ".R")]:
    make_bone("shoulder" + side, (s * 0.10, -0.06, 0.63), (s * 0.19, -0.06, 0.62), "chest")
    make_bone("upper_arm" + side, (s * 0.19, -0.06, 0.62), (s * 0.20, -0.15, 0.38), "shoulder" + side)
    make_bone("forearm" + side, (s * 0.20, -0.15, 0.38), (s * 0.17, -0.24, 0.14), "upper_arm" + side)
    make_bone("wrist" + side, (s * 0.17, -0.24, 0.14), (s * 0.17, -0.24, 0.06), "forearm" + side)
    make_bone("knuckle" + side, (s * 0.17, -0.24, 0.06), (s * 0.17, -0.27, 0.015), "wrist" + side)
    make_bone("thumb" + side, (s * 0.14, -0.22, 0.07), (s * 0.11, -0.24, 0.03), "wrist" + side)

# Hindlimbs: thigh, shin, foot, hallux (8 bones)
for s, side in [(1, ".L"), (-1, ".R")]:
    make_bone("thigh" + side, (s * 0.14, 0.32, 0.44), (s * 0.15, 0.26, 0.23), "pelvis")
    make_bone("shin" + side, (s * 0.15, 0.26, 0.23), (s * 0.14, 0.33, 0.08), "thigh" + side)
    make_bone("foot" + side, (s * 0.14, 0.33, 0.08), (s * 0.14, 0.34, 0.02), "shin" + side)
    make_bone("hallux" + side, (s * 0.13, 0.28, 0.03), (s * 0.07, 0.26, 0.02), "foot" + side)

print(f"Total bones in armature: {len(arm_data.edit_bones)}")

bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (b.head.copy(), b.tail.copy())

bpy.ops.object.mode_set(mode='OBJECT')

# ----------------------------------------------------
# E. STRICT ANATOMICAL SKINNING
# ----------------------------------------------------
print("Skinning chimpanzee mesh...")
chimp_mesh.vertex_groups.clear()
vgroups = {name: chimp_mesh.vertex_groups.new(name=name) for name in bone_segments}

def dist_to_segment(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 == 0:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    proj = a + t * ab
    return (p - proj).length

def get_allowed_chimp_bones(p):
    x, y, z = p.x, p.y, p.z
    abs_x = abs(x)
    allowed = set()
    
    # Head & Face
    if y < -0.22:
        allowed.add("head")
        if z < 0.58 and y < -0.28:
            allowed.add("jaw")
        if abs_x > 0.12 and y > -0.30 and z > 0.58:
            allowed.add("ear.L" if x > 0 else "ear.R")
        if y > -0.28:
            allowed.add("neck")
        return allowed
        
    # Neck
    if -0.26 <= y <= -0.06 and z > 0.48:
        allowed.add("neck")
        if y < -0.18:
            allowed.add("head")
        if y > -0.12:
            allowed.add("chest")
        return allowed
        
    # Forelimbs
    if y < 0.06 and abs_x > 0.09:
        side = ".L" if x > 0 else ".R"
        if z > 0.50:
            allowed.add("shoulder" + side)
            allowed.add("upper_arm" + side)
            allowed.add("chest")
        elif z > 0.30:
            allowed.add("upper_arm" + side)
            allowed.add("forearm" + side)
        elif z > 0.10:
            allowed.add("forearm" + side)
            allowed.add("wrist" + side)
        else:
            allowed.add("wrist" + side)
            allowed.add("knuckle" + side)
            allowed.add("thumb" + side)
        return allowed
        
    # Hindlimbs
    if y > 0.16 and abs_x > 0.07:
        side = ".L" if x > 0 else ".R"
        if z > 0.36:
            allowed.add("thigh" + side)
            allowed.add("pelvis")
        elif z > 0.18:
            allowed.add("thigh" + side)
            allowed.add("shin" + side)
        elif z > 0.06:
            allowed.add("shin" + side)
            allowed.add("foot" + side)
        else:
            allowed.add("foot" + side)
            allowed.add("hallux" + side)
        return allowed
        
    # Torso
    if -0.08 <= y < 0.12:
        allowed.add("chest")
        allowed.add("spine")
    elif 0.12 <= y < 0.28:
        allowed.add("spine")
        allowed.add("pelvis")
    else:
        allowed.add("pelvis")
        allowed.add("spine")
    return allowed

for idx, v in enumerate(chimp_mesh.data.vertices):
    p = v.co
    allowed = get_allowed_chimp_bones(p)
    if not allowed:
        allowed = {"spine", "chest", "pelvis"}
        
    weights = []
    for name in allowed:
        if name not in bone_segments:
            continue
        a, b = bone_segments[name]
        d = dist_to_segment(p, a, b)
        w = 1.0 / ((d + 0.02) ** 3.0)
        weights.append((name, w))
        
    weights.sort(key=lambda item: item[1], reverse=True)
    top_weights = weights[:4]
    sum_w = sum(w for _, w in top_weights)
    if sum_w > 0:
        for name, w in top_weights:
            norm_w = w / sum_w
            if norm_w > 0.005:
                vgroups[name].add([idx], norm_w, 'REPLACE')

chimp_mesh.parent = arm_obj
arm_mod = chimp_mesh.modifiers.new(name="Armature", type='ARMATURE')
arm_mod.object = arm_obj
arm_mod.use_vertex_groups = True

# ----------------------------------------------------
# F. AUTHENTIC PRIMATE ANIMATIONS
# ----------------------------------------------------
print("Baking 5 authentic primate animations...")
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

# ANIMATION 1: knuckle_walk
action_walk = bpy.data.actions.new(name="knuckle_walk")
arm_obj.animation_data.action = action_walk

for frame in range(1, 61):
    t = (frame - 1) / 59.0
    cycle = t * 2.0 * math.pi
    reset_all_pose_bones()

    sway_x = 0.015 * math.sin(cycle)
    roll = 0.035 * math.sin(cycle)
    pitch = 0.018 * math.sin(cycle * 2)

    key_bone(arm_obj.pose.bones["chest"], frame, loc=(sway_x, 0, pitch), rot_euler=(pitch, roll, sway_x * 0.5))
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(-sway_x * 0.8, 0, 0), rot_euler=(-pitch * 0.5, -roll * 0.8, 0))

    for s, side in [(-1, ".R"), (1, ".L")]:
        phase_arm = t + (0.5 if side == ".R" else 0.0)
        arm_p = (phase_arm % 1.0)
        if arm_p < 0.6:
            st = arm_p / 0.6
            u_x = math.radians(-10.0 + 20.0 * st)
            f_x = math.radians(0.0 + 10.0 * math.sin(st * math.pi))
            w_x = math.radians(5.0)
        else:
            sw = (arm_p - 0.6) / 0.4
            u_x = math.radians(10.0 - 20.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
            f_x = math.radians(28.0 * math.sin(sw * math.pi))
            w_x = math.radians(-12.0 * math.sin(sw * math.pi))
        key_bone(arm_obj.pose.bones["upper_arm" + side], frame, rot_euler=(u_x, 0, s * roll))
        key_bone(arm_obj.pose.bones["forearm" + side], frame, rot_euler=(f_x, 0, 0))
        key_bone(arm_obj.pose.bones["wrist" + side], frame, rot_euler=(w_x, 0, 0))

        phase_leg = t + (0.0 if side == ".R" else 0.5)
        leg_p = (phase_leg % 1.0)
        if leg_p < 0.6:
            st = leg_p / 0.6
            th_x = math.radians(-12.0 + 24.0 * st)
            sh_x = math.radians(2.0 + 8.0 * math.sin(st * math.pi))
            ft_x = math.radians(0.0)
        else:
            sw = (leg_p - 0.6) / 0.4
            th_x = math.radians(12.0 - 24.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
            sh_x = math.radians(-25.0 * math.sin(sw * math.pi))
            ft_x = math.radians(15.0 * math.sin(sw * math.pi))
        key_bone(arm_obj.pose.bones["thigh" + side], frame, rot_euler=(th_x, 0, 0))
        key_bone(arm_obj.pose.bones["shin" + side], frame, rot_euler=(sh_x, 0, 0))
        key_bone(arm_obj.pose.bones["foot" + side], frame, rot_euler=(ft_x, 0, 0))

track_walk = arm_obj.animation_data.nla_tracks.new()
track_walk.name = "knuckle_walk_track"
track_walk.strips.new("knuckle_walk", 1, action_walk)

# ANIMATION 2: standing
action_stand = bpy.data.actions.new(name="standing")
arm_obj.animation_data.action = action_stand
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.012
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0, 0.05), rot_euler=(math.radians(28), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, 0.08 + breath), rot_euler=(math.radians(-15) + breath * 0.2, 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(5), 0, math.sin(t * math.pi * 2) * 0.03))
    for side in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + side], frame, rot_euler=(math.radians(-25), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + side], frame, rot_euler=(math.radians(20), 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + side], frame, rot_euler=(math.radians(15), 0, 0))
        key_bone(arm_obj.pose.bones["forearm" + side], frame, rot_euler=(math.radians(-20), 0, 0))
track_stand = arm_obj.animation_data.nla_tracks.new()
track_stand.name = "standing_track"
track_stand.strips.new("standing", 1, action_stand)

# ANIMATION 3: sitting
action_sit = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = action_sit
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.01
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.05, -0.22), rot_euler=(math.radians(35), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.06), rot_euler=(math.radians(-18) + breath, 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(10), 0, 0))
    for side in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + side], frame, rot_euler=(math.radians(-55), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + side], frame, rot_euler=(math.radians(85), 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + side], frame, rot_euler=(math.radians(22), 0, 0))
        key_bone(arm_obj.pose.bones["forearm" + side], frame, rot_euler=(math.radians(-35), 0, 0))
track_sit = arm_obj.animation_data.nla_tracks.new()
track_sit.name = "sitting_track"
track_sit.strips.new("sitting", 1, action_sit)

# ANIMATION 4: sleeping
action_sleep = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = action_sleep
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.015
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0.04, 0.03, -0.32), rot_euler=(math.radians(12), math.radians(15), 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, -0.02, -0.28), rot_euler=(breath, math.radians(8), 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(25), math.radians(-15), 0))
    for side in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + side], frame, rot_euler=(math.radians(-70), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + side], frame, rot_euler=(math.radians(85), 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + side], frame, rot_euler=(math.radians(45), 0, 0))
        key_bone(arm_obj.pose.bones["forearm" + side], frame, rot_euler=(math.radians(-50), 0, 0))
track_sleep = arm_obj.animation_data.nla_tracks.new()
track_sleep.name = "sleeping_track"
track_sleep.strips.new("sleeping", 1, action_sleep)

# ANIMATION 5: grooming
action_groom = bpy.data.actions.new(name="grooming")
arm_obj.animation_data.action = action_groom
for frame in range(1, 61):
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    pick = math.sin(t * math.pi * 8) * 0.08
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.05, -0.22), rot_euler=(math.radians(35), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.06), rot_euler=(math.radians(-12), 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(28), 0, pick * 0.2))
    key_bone(arm_obj.pose.bones["upper_arm.L"], frame, rot_euler=(math.radians(35), 0, math.radians(15)))
    key_bone(arm_obj.pose.bones["forearm.L"], frame, rot_euler=(math.radians(-65) + pick, 0, 0))
    key_bone(arm_obj.pose.bones["wrist.L"], frame, rot_euler=(math.radians(20) + pick * 1.5, 0, 0))
    key_bone(arm_obj.pose.bones["upper_arm.R"], frame, rot_euler=(math.radians(30), 0, math.radians(-15)))
    key_bone(arm_obj.pose.bones["forearm.R"], frame, rot_euler=(math.radians(-55) - pick, 0, 0))
    key_bone(arm_obj.pose.bones["wrist.R"], frame, rot_euler=(math.radians(15) - pick * 1.5, 0, 0))
    for side in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + side], frame, rot_euler=(math.radians(-55), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + side], frame, rot_euler=(math.radians(85), 0, 0))
track_groom = arm_obj.animation_data.nla_tracks.new()
track_groom.name = "grooming_track"
track_groom.strips.new("grooming", 1, action_groom)

# ----------------------------------------------------
# G. EXPORT TO GLTF
# ----------------------------------------------------
out_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Chimpanzee-Rigged.glb"
print(f"Exporting organic Chimpanzee to {out_path}...")
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_nla_strips=True,
    export_def_bones=True,
    export_skins=True
)
print("=== ORGANIC CHIMPANZEE PIPELINE COMPLETE! ===")
