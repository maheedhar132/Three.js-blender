import bpy
import mathutils
from mathutils import Vector, Euler
import math

print("=== STARTING ROBUST LION RIG & ANIMATION PIPELINE ===")

# 1. Reset scene and remove all default objects
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# 2. Import Lion-Male.glb
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']
mesh.name = "Lion_Mesh"

# 3. Decimate mesh to ~29k faces for smooth web performance
print("Decimating mesh for realtime skinning...")
mod = mesh.modifiers.new(name="Decimate", type='DECIMATE')
mod.ratio = 0.02
bpy.context.view_layer.objects.active = mesh
bpy.ops.object.modifier_apply(modifier="Decimate")
print(f"Decimated mesh: {len(mesh.data.polygons)} faces, {len(mesh.data.vertices)} vertices")

# 4. Create Armature
arm_data = bpy.data.armatures.new("Lion_Armature_Data")
arm_obj = bpy.data.objects.new("Lion_Armature", arm_data)
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

# Core Spine & Head (facing -Y)
make_bone("root", (0, 0, 0), (0, -0.05, 0))
make_bone("pelvis", (0, 0.35, 0.43), (0, 0.20, 0.42), "root")
make_bone("spine", (0, 0.20, 0.42), (0, 0.05, 0.43), "pelvis")
make_bone("chest", (0, 0.05, 0.43), (0, -0.10, 0.46), "spine")
make_bone("neck", (0, -0.10, 0.46), (0, -0.22, 0.48), "chest")
make_bone("head", (0, -0.22, 0.48), (0, -0.32, 0.45), "neck")
make_bone("jaw", (0, -0.25, 0.38), (0, -0.34, 0.34), "head")

# Front Left Leg
make_bone("shoulder.L", (0.05, -0.06, 0.45), (0.07, -0.08, 0.35), "chest")
make_bone("upper_arm.L", (0.07, -0.08, 0.35), (0.06, -0.09, 0.20), "shoulder.L")
make_bone("forearm.L", (0.06, -0.09, 0.20), (0.05, -0.11, 0.07), "upper_arm.L")
make_bone("paw.L", (0.05, -0.11, 0.07), (0.05, -0.14, 0.01), "forearm.L")

# Front Right Leg
make_bone("shoulder.R", (-0.05, -0.06, 0.45), (-0.07, -0.08, 0.35), "chest")
make_bone("upper_arm.R", (-0.07, -0.08, 0.35), (-0.06, -0.09, 0.20), "shoulder.R")
make_bone("forearm.R", (-0.06, -0.09, 0.20), (-0.05, -0.11, 0.07), "upper_arm.R")
make_bone("paw.R", (-0.05, -0.11, 0.07), (-0.05, -0.14, 0.01), "forearm.R")

# Hind Left Leg
make_bone("thigh.L", (0.06, 0.30, 0.42), (0.08, 0.33, 0.26), "pelvis")
make_bone("shin.L", (0.08, 0.33, 0.26), (0.08, 0.39, 0.13), "thigh.L")
make_bone("hock.L", (0.08, 0.39, 0.13), (0.09, 0.38, 0.06), "shin.L")
make_bone("paw_back.L", (0.09, 0.38, 0.06), (0.10, 0.39, 0.01), "hock.L")

# Hind Right Leg
make_bone("thigh.R", (-0.06, 0.30, 0.42), (-0.08, 0.33, 0.26), "pelvis")
make_bone("shin.R", (-0.08, 0.33, 0.26), (-0.08, 0.39, 0.13), "thigh.R")
make_bone("hock.R", (-0.08, 0.39, 0.13), (-0.09, 0.38, 0.06), "shin.R")
make_bone("paw_back.R", (-0.09, 0.38, 0.06), (-0.10, 0.39, 0.01), "hock.R")

# Tail
make_bone("tail.01", (0, 0.36, 0.42), (0, 0.45, 0.38), "pelvis")
make_bone("tail.02", (0, 0.45, 0.38), (0, 0.54, 0.30), "tail.01")
make_bone("tail.03", (0, 0.54, 0.30), (0, 0.63, 0.22), "tail.02")
make_bone("tail.04", (0, 0.63, 0.22), (0, 0.72, 0.12), "tail.03")

# Store bone segments for skinning
bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (b.head.copy(), b.tail.copy())

bpy.ops.object.mode_set(mode='OBJECT')
print("Armature skeleton constructed with", len(arm_data.bones), "bones")

# 5. Robust Distance-Based Skinning Algorithm
print("Computing skinning weights for", len(mesh.data.vertices), "vertices...")
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

# Assign weights per vertex
for idx, v in enumerate(mesh.data.vertices):
    p = v.co
    weights = []
    for name, (a, b) in bone_segments.items():
        # Left/Right symmetry check
        if name.endswith(".L") and p.x < -0.01:
            continue
        if name.endswith(".R") and p.x > 0.01:
            continue
        
        d = dist_to_segment(p, a, b)
        
        # Tail isolation: vertices with y > 0.48 and z > 0.15 belong mostly to tail
        if "tail" in name and p.y < 0.35:
            continue
        if "tail" not in name and p.y > 0.45 and (p.x**2 + (p.z - 0.25)**2) < 0.03:
            d *= 3.0 # discourage body bones on tail
            
        # Jaw isolation: only lower forward muzzle
        if name == "jaw":
            if p.y > -0.23 or p.z > 0.39:
                continue
            d *= 0.5 # prioritize jaw for lower muzzle
        elif name == "head":
            if p.y < -0.23 and p.z < 0.36:
                d *= 2.5 # prioritize jaw over head for lower jaw
                
        # Inverse distance weighting
        w = 1.0 / ((d + 0.03) ** 2.8)
        weights.append((name, w))
        
    # Pick top 4 influencing bones
    weights.sort(key=lambda item: item[1], reverse=True)
    top_weights = weights[:4]
    sum_w = sum(w for _, w in top_weights)
    if sum_w > 0:
        for name, w in top_weights:
            norm_w = w / sum_w
            if norm_w > 0.01:
                vgroups[name].add([idx], norm_w, 'REPLACE')

print("Skinning weights applied successfully!")

# 6. Parent Mesh to Armature & Add Armature Modifier
mesh.parent = arm_obj
arm_mod = mesh.modifiers.new(name="Armature", type='ARMATURE')
arm_mod.object = arm_obj
arm_mod.use_vertex_groups = True

# 7. Setup Animations
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

# ==========================================
# ANIMATION 1: standing (idle breathing + tail swish)
# ==========================================
print("Creating 'standing' animation...")
action_standing = bpy.data.actions.new(name="standing")
arm_obj.animation_data.action = action_standing

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.015
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, breath), rot_euler=(breath * 0.4, 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, breath * 0.5), rot_euler=(0, 0, 0))
    head_sway = math.sin(t * math.pi * 2) * 0.03
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(breath * 0.2, 0, head_sway))
    tail_flick = math.sin(t * math.pi * 2) * 0.15
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(0, 0, tail_flick * 0.2))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(0, 0, tail_flick * 0.5))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(0, 0, tail_flick * 0.8))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, tail_flick * 1.2))

track_standing = arm_obj.animation_data.nla_tracks.new()
track_standing.name = "standing_track"
track_standing.strips.new("standing", 1, action_standing)

# ==========================================
# ANIMATION 2: sitting
# ==========================================
print("Creating 'sitting' animation...")
action_sitting = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = action_sitting

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.01

    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.05, -0.20), rot_euler=(math.radians(30), 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, -0.10), rot_euler=(math.radians(-18), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.03), rot_euler=(math.radians(-12) + breath, 0, 0))
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(-12), 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(8) + breath * 0.5, 0, math.sin(t * math.pi * 2) * 0.04))

    for s in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + s], frame, rot_euler=(math.radians(-50), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + s], frame, rot_euler=(math.radians(65), 0, 0))
        key_bone(arm_obj.pose.bones["hock" + s], frame, rot_euler=(math.radians(-20), 0, 0))
        key_bone(arm_obj.pose.bones["paw_back" + s], frame, rot_euler=(math.radians(5), 0, 0))

    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-20), 0, math.radians(20)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-15), 0, math.radians(35)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-10), 0, math.radians(45)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, math.radians(45)))

track_sitting = arm_obj.animation_data.nla_tracks.new()
track_sitting.name = "sitting_track"
track_sitting.strips.new("sitting", 1, action_sitting)

# ==========================================
# ANIMATION 3: sleeping (curled relaxed breathing)
# ==========================================
print("Creating 'sleeping' animation...")
action_sleeping = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = action_sleeping

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    deep_breath = math.sin(t * math.pi * 2) * 0.015

    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0.03, 0.03, -0.30), rot_euler=(math.radians(8), math.radians(12), math.radians(5)))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0.02, 0, -0.26), rot_euler=(0, math.radians(8), deep_breath))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, -0.02, -0.24), rot_euler=(deep_breath, math.radians(6), 0))
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(20), math.radians(-8), math.radians(-12)))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(28), math.radians(-12), math.radians(-20)))

    for s in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + s], frame, rot_euler=(math.radians(-65), math.radians(12 if s=='.L' else -12), 0))
        key_bone(arm_obj.pose.bones["shin" + s], frame, rot_euler=(math.radians(75), 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + s], frame, rot_euler=(math.radians(40), math.radians(15 if s=='.L' else -15), 0))
        key_bone(arm_obj.pose.bones["forearm" + s], frame, rot_euler=(math.radians(-45), 0, 0))

    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-35), 0, math.radians(15)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-25), 0, math.radians(25)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-15), 0, math.radians(30)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(math.radians(-10), 0, math.radians(20)))

track_sleeping = arm_obj.animation_data.nla_tracks.new()
track_sleeping.name = "sleeping_track"
track_sleeping.strips.new("sleeping", 1, action_sleeping)

# ==========================================
# ANIMATION 4: roaring
# ==========================================
print("Creating 'roaring' animation...")
action_roaring = bpy.data.actions.new(name="roaring")
arm_obj.animation_data.action = action_roaring

reset_all_pose_bones()
key_bone(arm_obj.pose.bones["chest"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["neck"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 1, rot_euler=(0, 0, 0))

key_bone(arm_obj.pose.bones["chest"], 15, loc=(0, 0.02, 0.03), rot_euler=(math.radians(10), 0, 0))
key_bone(arm_obj.pose.bones["neck"], 15, rot_euler=(math.radians(15), 0, 0))
key_bone(arm_obj.pose.bones["head"], 15, rot_euler=(math.radians(-12), 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 15, rot_euler=(math.radians(-5), 0, 0))

for f in [25, 33, 42]:
    tremble = math.sin((f - 25) * 1.5) * 0.012
    key_bone(arm_obj.pose.bones["chest"], f, loc=(0, -0.03, 0.04 + tremble), rot_euler=(math.radians(16) + tremble, 0, 0))
    key_bone(arm_obj.pose.bones["neck"], f, rot_euler=(math.radians(25), 0, tremble))
    key_bone(arm_obj.pose.bones["head"], f, rot_euler=(math.radians(-28) + tremble, 0, tremble))
    key_bone(arm_obj.pose.bones["jaw"], f, rot_euler=(math.radians(38), 0, 0))
    key_bone(arm_obj.pose.bones["tail.01"], f, rot_euler=(math.radians(30), 0, math.sin(f)*0.2))
    key_bone(arm_obj.pose.bones["tail.02"], f, rot_euler=(math.radians(20), 0, math.sin(f)*0.3))

key_bone(arm_obj.pose.bones["chest"], 50, loc=(0, 0, 0.01), rot_euler=(math.radians(5), 0, 0))
key_bone(arm_obj.pose.bones["neck"], 50, rot_euler=(math.radians(6), 0, 0))
key_bone(arm_obj.pose.bones["head"], 50, rot_euler=(math.radians(-4), 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 50, rot_euler=(math.radians(8), 0, 0))

key_bone(arm_obj.pose.bones["chest"], 60, loc=(0, 0, 0), rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["neck"], 60, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 60, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 60, rot_euler=(0, 0, 0))

track_roaring = arm_obj.animation_data.nla_tracks.new()
track_roaring.name = "roaring_track"
track_roaring.strips.new("roaring", 1, action_roaring)

# ==========================================
# ANIMATION 5: walk (realistic 4-beat quadruped walk)
# ==========================================
print("Creating 'walk' animation...")
action_walk = bpy.data.actions.new(name="walk")
arm_obj.animation_data.action = action_walk

def front_leg_walk(phase):
    p = phase % 1.0
    if p < 0.60: # Stance: ground contact & propulsion
        st = p / 0.60
        shoulder_x = math.radians(-2.0 + 4.0 * st)
        upper_arm_x = math.radians(-14.0 + 28.0 * st)
        # Touchdown at 0 deg, flexes slightly to +8 deg at mid-stance to keep paw level on ground
        forearm_x = math.radians(0.0 + 8.0 * math.sin(st * math.pi))
        if st < 0.70:
            paw_x = math.radians(-2.0 + 2.0 * (st / 0.70))
        else:
            paw_x = math.radians(16.0 * ((st - 0.70) / 0.30)) # toe roll at push-off
    else: # Swing: lift, forward reach, and plant prep
        sw = (p - 0.60) / 0.40
        shoulder_x = math.radians(2.0 - 4.0 * sw)
        upper_arm_x = math.radians(14.0 - 28.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
        bend = math.sin(sw * math.pi)
        # Forearm flexes up to +32 deg at mid swing to lift paw, extends back to 0 at plant
        forearm_x = math.radians(32.0 * bend)
        paw_x = math.radians(16.0 * (1.0 - sw) - 12.0 * bend)
    return shoulder_x, upper_arm_x, forearm_x, paw_x

def hind_leg_walk(phase):
    p = phase % 1.0
    if p < 0.60: # Stance
        st = p / 0.60
        thigh_x = math.radians(-13.0 + 26.0 * st)
        shin_x = math.radians(1.0 + 6.0 * math.sin(st * math.pi))
        hock_x = math.radians(-1.0 - 4.0 * math.sin(st * math.pi))
        if st < 0.70:
            paw_x = math.radians(0.0)
        else:
            paw_x = math.radians(16.0 * ((st - 0.70) / 0.30))
    else: # Swing
        sw = (p - 0.60) / 0.40
        thigh_x = math.radians(13.0 - 26.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
        bend = math.sin(sw * math.pi)
        shin_x = math.radians(-22.0 * bend)
        hock_x = math.radians(26.0 * bend)
        paw_x = math.radians(16.0 * (1.0 - sw) - 8.0 * bend)
    return thigh_x, shin_x, hock_x, paw_x

for frame in range(1, 61):
    t = (frame - 1) / 59.0
    cycle = t * 2.0 * math.pi
    reset_all_pose_bones()

    # 1. Vertical Bob (highest when passing, lowest on impact at t=0.25 and 0.75)
    bob = -0.010 * math.cos(4.0 * math.pi * (t - 0.25))

    # 2. Spine & Chest Counter-twist and Lateral Sway
    chest_sway_x = 0.007 * math.sin(cycle)
    chest_yaw = -0.035 * math.cos(cycle)
    chest_roll = 0.018 * math.sin(cycle)

    pelvis_sway_x = -0.005 * math.sin(cycle)
    pelvis_yaw = 0.038 * math.cos(cycle)
    pelvis_roll = -0.014 * math.sin(cycle)

    key_bone(arm_obj.pose.bones["root"], frame, loc=(0, 0, 0))
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(pelvis_sway_x, 0, bob * 0.8), rot_euler=(0, pelvis_roll, pelvis_yaw))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, bob * 0.9), rot_euler=(0, 0, 0.010 * math.cos(cycle)))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(chest_sway_x, 0, bob), rot_euler=(-0.012 * math.sin(2 * cycle), chest_roll, chest_yaw))

    # 3. Head & Neck Vertical Bob synchronized with foreleg contact
    head_pitch = 0.032 * math.cos(4.0 * math.pi * (t - 0.25))
    head_yaw = -0.015 * math.sin(cycle)
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(head_pitch * 0.6, 0, head_yaw * 0.5))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(head_pitch * 0.8, 0, head_yaw * 0.8))

    # 4. Alternating Diagonal Limb Pairs:
    # 4-beat sequence: Left Hind (0.00), Left Front (0.25), Right Hind (0.50), Right Front (0.75)
    phi_lh = (t + 0.00) % 1.0
    phi_lf = (t + 0.25) % 1.0
    phi_rh = (t + 0.50) % 1.0
    phi_rf = (t + 0.75) % 1.0

    # Front Left
    sh_lf, ua_lf, fa_lf, p_lf = front_leg_walk(phi_lf)
    key_bone(arm_obj.pose.bones["shoulder.L"], frame, rot_euler=(sh_lf, 0, 0))
    key_bone(arm_obj.pose.bones["upper_arm.L"], frame, rot_euler=(ua_lf, 0, 0))
    key_bone(arm_obj.pose.bones["forearm.L"], frame, rot_euler=(fa_lf, 0, 0))
    key_bone(arm_obj.pose.bones["paw.L"], frame, rot_euler=(p_lf, 0, 0))

    # Front Right
    sh_rf, ua_rf, fa_rf, p_rf = front_leg_walk(phi_rf)
    key_bone(arm_obj.pose.bones["shoulder.R"], frame, rot_euler=(sh_rf, 0, 0))
    key_bone(arm_obj.pose.bones["upper_arm.R"], frame, rot_euler=(ua_rf, 0, 0))
    key_bone(arm_obj.pose.bones["forearm.R"], frame, rot_euler=(fa_rf, 0, 0))
    key_bone(arm_obj.pose.bones["paw.R"], frame, rot_euler=(p_rf, 0, 0))

    # Hind Left
    th_lh, shn_lh, hk_lh, pb_lh = hind_leg_walk(phi_lh)
    key_bone(arm_obj.pose.bones["thigh.L"], frame, rot_euler=(th_lh, 0, 0))
    key_bone(arm_obj.pose.bones["shin.L"], frame, rot_euler=(shn_lh, 0, 0))
    key_bone(arm_obj.pose.bones["hock.L"], frame, rot_euler=(hk_lh, 0, 0))
    key_bone(arm_obj.pose.bones["paw_back.L"], frame, rot_euler=(pb_lh, 0, 0))

    # Hind Right
    th_rh, shn_rh, hk_rh, pb_rh = hind_leg_walk(phi_rh)
    key_bone(arm_obj.pose.bones["thigh.R"], frame, rot_euler=(th_rh, 0, 0))
    key_bone(arm_obj.pose.bones["shin.R"], frame, rot_euler=(shn_rh, 0, 0))
    key_bone(arm_obj.pose.bones["hock.R"], frame, rot_euler=(hk_rh, 0, 0))
    key_bone(arm_obj.pose.bones["paw_back.R"], frame, rot_euler=(pb_rh, 0, 0))

    # 5. Tail Relaxed Sway with Lag
    for i, seg in enumerate(["tail.01", "tail.02", "tail.03", "tail.04"]):
        lag = (i + 1) * 0.45
        t_yaw = (0.08 + 0.05 * (i + 1)) * math.sin(cycle - lag)
        t_pitch = -0.06 + 0.020 * math.cos(2.0 * cycle - lag)
        key_bone(arm_obj.pose.bones[seg], frame, rot_euler=(t_pitch, 0, t_yaw))

track_walk = arm_obj.animation_data.nla_tracks.new()
track_walk.name = "walk_track"
track_walk.strips.new("walk", 1, action_walk)

# 8. Export to GLB
output_glb = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male-Rigged.glb"
print(f"Exporting rigged and animated lion to: {output_glb}")

# Remove any extra objects in scene
for o in list(bpy.data.objects):
    if o != mesh and o != arm_obj:
        bpy.data.objects.remove(o, do_unlink=True)

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

print("=== LION RIGGING & ANIMATION PIPELINE COMPLETE ===")
