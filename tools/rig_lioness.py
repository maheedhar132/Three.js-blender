import bpy
import mathutils
from mathutils import Vector, Euler, Color
import math
import numpy as np

print("=== STARTING LIONESS RIGGING & ANIMATION PIPELINE ===")

# 1. Open the decimated base model
bpy.ops.wm.open_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
mesh = bpy.data.objects['Mesh_0']
mesh.name = "Lioness_Mesh"

# Remove all other objects (e.g. stray icospheres/cameras/lights)
for o in list(bpy.data.objects):
    if o != mesh:
        bpy.data.objects.remove(o, do_unlink=True)

# 2. Sleek sculptural transformation: remove mane, cheek frills, throat beard, belly fringe
print("Sculpting sleek female feline contours (removing mane, slimming chest & flanks)...")
verts = np.array([v.co for v in mesh.data.vertices], dtype=np.float32)

for i in range(len(verts)):
    x, y, z = verts[i]
    
    # A. CRANIAL RUFF & DORSAL NAPE
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
            verts[i, 2] = target_z + excess * 0.10

    # B. CHEEK FRILLS
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
            verts[i, 0] = sign * (target_width + excess_x * 0.15)

    # C. THROAT BEARD & PECTORAL CHEST MANE
    if -0.28 <= y <= 0.02 and abs(x) < 0.08:
        if -0.28 <= y < -0.12:
            t = (y - (-0.28)) / 0.16
            target_throat_z = 0.355 - t * 0.035
            if z < target_throat_z and z > 0.15:
                verts[i, 2] = target_throat_z - (target_throat_z - z) * 0.18
        elif -0.12 <= y <= 0.02:
            target_chest_z = 0.295
            if z < target_chest_z and z > 0.18:
                verts[i, 2] = target_chest_z - (target_chest_z - z) * 0.22

    # D. VENTRAL BELLY FRINGE
    if 0.00 <= y <= 0.26 and abs(x) < 0.075:
        t = (y - 0.00) / 0.26
        target_belly_z = 0.280 + t * 0.040
        if z < target_belly_z and z > 0.16:
            verts[i, 2] = target_belly_z - (target_belly_z - z) * 0.15

    # E. ATHLETIC PROPORTIONS
    if -0.15 <= y <= 0.10:
        verts[i, 0] *= 0.92  # Narrower chest
    elif 0.12 <= y <= 0.26:
        verts[i, 0] *= 0.94  # Athletic flank waist-tuck
    elif 0.26 < y <= 0.38 and z > 0.18:
        verts[i, 0] *= 0.98  # Athletic haunches

# F. GLOBAL SCALE (0.94x for ~140kg lioness)
SCALE_FACTOR = 0.94
verts *= SCALE_FACTOR

for i, v in enumerate(mesh.data.vertices):
    v.co = verts[i]
mesh.data.update()

# 3. Apply Warm Tawny Coat with Cream Countershading and Black Tail Tuft
print("Applying coat coloration: warm tawny, cream countershading, black tail tuft...")
# Ensure vertex color attribute exists
color_attr = mesh.data.color_attributes.get("Color")
if not color_attr:
    color_attr = mesh.data.color_attributes.new(name="Color", type='FLOAT_COLOR', domain='POINT')

for i, v in enumerate(mesh.data.vertices):
    x, y, z = v.co.x, v.co.y, v.co.z
    # Base warm golden tawny tone
    r, g, b = 1.00, 0.96, 0.90
    
    # Countershading: chin, throat, chest, ventral belly
    # Chin & lower jaw
    if y < -0.21 and z < 0.35 and abs(x) < 0.045:
        cream_strength = min(1.0, (0.35 - z) / 0.08)
        r = 1.00 + 0.18 * cream_strength
        g = 0.96 + 0.18 * cream_strength
        b = 0.90 + 0.20 * cream_strength
    # Throat
    elif -0.21 <= y < -0.09 and z < 0.34 and abs(x) < 0.055:
        cream_strength = min(1.0, (0.34 - z) / 0.07)
        r = 1.00 + 0.15 * cream_strength
        g = 0.96 + 0.15 * cream_strength
        b = 0.90 + 0.17 * cream_strength
    # Chest / pectoral sternum
    elif -0.09 <= y < 0.03 and z < 0.32 and abs(x) < 0.065:
        cream_strength = min(1.0, (0.32 - z) / 0.06)
        r = 1.00 + 0.12 * cream_strength
        g = 0.96 + 0.12 * cream_strength
        b = 0.90 + 0.14 * cream_strength
    # Ventral belly
    elif 0.03 <= y < 0.25 and z < 0.29 and abs(x) < 0.060:
        cream_strength = min(1.0, (0.29 - z) / 0.06)
        r = 1.00 + 0.10 * cream_strength
        g = 0.96 + 0.10 * cream_strength
        b = 0.90 + 0.12 * cream_strength
    # Black tufted tail tip
    elif y > 0.60 and z < 0.18:
        tuft_strength = min(1.0, (y - 0.60) / 0.08)
        r = 1.00 * (1.0 - 0.88 * tuft_strength)
        g = 0.96 * (1.0 - 0.88 * tuft_strength)
        b = 0.90 * (1.0 - 0.88 * tuft_strength)
        
    color_attr.data[i].color = (r, g, b, 1.0)

# Connect color attribute to material shader so it exports cleanly in GLTF
mat = mesh.data.materials[0]
if mat and mat.node_tree:
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    tex_node = next((n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and 'Image_0' in (n.image.name if n.image else '')), None)
    if bsdf and tex_node:
        # Check if attribute node already exists
        attr_node = mat.node_tree.nodes.new(type='ShaderNodeAttribute')
        attr_node.attribute_name = "Color"
        mix_node = mat.node_tree.nodes.new(type='ShaderNodeMix')
        mix_node.data_type = 'RGBA'
        mix_node.blend_type = 'MULTIPLY'
        mix_node.inputs[0].default_value = 1.0 # Factor
        mat.node_tree.links.new(tex_node.outputs['Color'], mix_node.inputs[6]) # Color A
        mat.node_tree.links.new(attr_node.outputs['Color'], mix_node.inputs[7]) # Color B
        mat.node_tree.links.new(mix_node.outputs[2], bsdf.inputs['Base Color'])

# 4. Create Standard 27-Bone Quadruped Skeleton
print("Building 27-bone quadruped armature...")
arm_data = bpy.data.armatures.new("Lioness_Armature_Data")
arm_obj = bpy.data.objects.new("Lioness_Armature", arm_data)
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

def sc(vec):
    """Scale bone position to lioness proportions"""
    return (vec[0] * SCALE_FACTOR * 0.92 if abs(vec[0]) > 0.01 else vec[0],
            vec[1] * SCALE_FACTOR,
            vec[2] * SCALE_FACTOR)

# Core Spine & Head (facing -Y)
make_bone("root", (0, 0, 0), (0, -0.05 * SCALE_FACTOR, 0))
make_bone("pelvis", sc((0, 0.35, 0.43)), sc((0, 0.20, 0.42)), "root")
make_bone("spine", sc((0, 0.20, 0.42)), sc((0, 0.05, 0.43)), "pelvis")
make_bone("chest", sc((0, 0.05, 0.43)), sc((0, -0.10, 0.46)), "spine")
make_bone("neck", sc((0, -0.10, 0.46)), sc((0, -0.22, 0.48)), "chest")
make_bone("head", sc((0, -0.22, 0.48)), sc((0, -0.32, 0.45)), "neck")
make_bone("jaw", sc((0, -0.25, 0.38)), sc((0, -0.34, 0.34)), "head")

# Front Left Leg
make_bone("shoulder.L", sc((0.05, -0.06, 0.45)), sc((0.07, -0.08, 0.35)), "chest")
make_bone("upper_arm.L", sc((0.07, -0.08, 0.35)), sc((0.06, -0.09, 0.20)), "shoulder.L")
make_bone("forearm.L", sc((0.06, -0.09, 0.20)), sc((0.05, -0.11, 0.07)), "upper_arm.L")
make_bone("paw.L", sc((0.05, -0.11, 0.07)), sc((0.05, -0.14, 0.01)), "forearm.L")

# Front Right Leg
make_bone("shoulder.R", sc((-0.05, -0.06, 0.45)), sc((-0.07, -0.08, 0.35)), "chest")
make_bone("upper_arm.R", sc((-0.07, -0.08, 0.35)), sc((-0.06, -0.09, 0.20)), "shoulder.R")
make_bone("forearm.R", sc((-0.06, -0.09, 0.20)), sc((-0.05, -0.11, 0.07)), "upper_arm.R")
make_bone("paw.R", sc((-0.05, -0.11, 0.07)), sc((-0.05, -0.14, 0.01)), "forearm.R")

# Hind Left Leg
make_bone("thigh.L", sc((0.06, 0.30, 0.42)), sc((0.08, 0.33, 0.26)), "pelvis")
make_bone("shin.L", sc((0.08, 0.33, 0.26)), sc((0.08, 0.39, 0.13)), "thigh.L")
make_bone("hock.L", sc((0.08, 0.39, 0.13)), sc((0.09, 0.38, 0.06)), "shin.L")
make_bone("paw_back.L", sc((0.09, 0.38, 0.06)), sc((0.10, 0.39, 0.01)), "hock.L")

# Hind Right Leg
make_bone("thigh.R", sc((-0.06, 0.30, 0.42)), sc((-0.08, 0.33, 0.26)), "pelvis")
make_bone("shin.R", sc((-0.08, 0.33, 0.26)), sc((-0.08, 0.39, 0.13)), "thigh.R")
make_bone("hock.R", sc((-0.08, 0.39, 0.13)), sc((-0.09, 0.38, 0.06)), "shin.R")
make_bone("paw_back.R", sc((-0.09, 0.38, 0.06)), sc((-0.10, 0.39, 0.01)), "hock.R")

# Tail (4 segments)
make_bone("tail.01", sc((0, 0.36, 0.42)), sc((0, 0.45, 0.38)), "pelvis")
make_bone("tail.02", sc((0, 0.45, 0.38)), sc((0, 0.54, 0.30)), "tail.01")
make_bone("tail.03", sc((0, 0.54, 0.30)), sc((0, 0.63, 0.22)), "tail.02")
make_bone("tail.04", sc((0, 0.63, 0.22)), sc((0, 0.72, 0.12)), "tail.03")

bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (b.head.copy(), b.tail.copy())

bpy.ops.object.mode_set(mode='OBJECT')
print(f"Armature skeleton initialized with {len(arm_data.bones)} bones")

# 5. Distance-Based Smooth Skinning Algorithm
print("Computing smooth skinning weights...")
mesh.vertex_groups.clear()
vgroups = {name: mesh.vertex_groups.new(name=name) for name in bone_segments}

def dist_to_segment(p, a, b):
    ab = b - a
    l2 = ab.length_squared
    if l2 == 0:
        return (p - a).length
    t = max(0.0, min(1.0, (p - a).dot(ab) / l2))
    proj = a + t * ab
    return (p - proj).length

scale_tail_thresh = 0.45 * SCALE_FACTOR
scale_jaw_thresh_y = -0.22 * SCALE_FACTOR
scale_jaw_thresh_z = 0.37 * SCALE_FACTOR

for idx, v in enumerate(mesh.data.vertices):
    p = v.co
    weights = []
    for name, (a, b) in bone_segments.items():
        if name.endswith(".L") and p.x < -0.01:
            continue
        if name.endswith(".R") and p.x > 0.01:
            continue
            
        d = dist_to_segment(p, a, b)
        
        # Tail isolation
        if "tail" in name and p.y < 0.33 * SCALE_FACTOR:
            continue
        if "tail" not in name and p.y > scale_tail_thresh and (p.x**2 + (p.z - 0.24 * SCALE_FACTOR)**2) < 0.025:
            d *= 3.0
            
        # Jaw vs Head isolation
        if name == "jaw":
            if p.y > scale_jaw_thresh_y or p.z > scale_jaw_thresh_z:
                continue
            d *= 0.5
        elif name == "head":
            if p.y < scale_jaw_thresh_y and p.z < 0.34 * SCALE_FACTOR:
                d *= 2.5
                
        w = 1.0 / ((d + 0.03) ** 2.8)
        weights.append((name, w))
        
    weights.sort(key=lambda item: item[1], reverse=True)
    top_weights = weights[:4]
    sum_w = sum(w for _, w in top_weights)
    if sum_w > 0:
        for name, w in top_weights:
            norm_w = w / sum_w
            if norm_w > 0.01:
                vgroups[name].add([idx], norm_w, 'REPLACE')

print("Skinning weights applied!")

# Parent Mesh to Armature
mesh.parent = arm_obj
arm_mod = mesh.modifiers.new(name="Armature", type='ARMATURE')
arm_mod.object = arm_obj
arm_mod.use_vertex_groups = True

# 6. Animation Setup
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
# ANIMATION 1: walk (4-beat quadruped walk cycle)
# ==========================================
print("Baking Animation 1: 'walk' (4-beat quadruped walk cycle)...")
action_walk = bpy.data.actions.new(name="walk")
arm_obj.animation_data.action = action_walk

# 48-frame walk cycle sampled every 3 frames for ultra-smooth skeletal interpolation
WALK_FRAMES = 48
offsets = {
    'LH': 0.00,  # Left Hind strikes frame 1
    'LF': 0.25,  # Left Fore strikes frame 13
    'RH': 0.50,  # Right Hind strikes frame 25
    'RF': 0.75   # Right Fore strikes frame 37
}

for frame in range(1, WALK_FRAMES + 2, 2):
    t = (frame - 1) / float(WALK_FRAMES)
    reset_all_pose_bones()
    
    # Pelvis kinematics: vertical bob (2 cycles) + lateral roll + yaw sway
    pelvis_bob = math.sin(t * 4 * math.pi) * 0.008
    pelvis_roll = math.sin(t * 2 * math.pi) * math.radians(2.2)
    pelvis_yaw = math.sin(t * 2 * math.pi) * math.radians(1.6)
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0, pelvis_bob), rot_euler=(0, pelvis_roll, pelvis_yaw))
    
    # Spine: flexible counter-twist
    spine_twist = -pelvis_roll * 0.6
    spine_pitch = math.sin(t * 4 * math.pi) * math.radians(1.2)
    key_bone(arm_obj.pose.bones["spine"], frame, rot_euler=(spine_pitch, spine_twist, 0))
    
    # Chest: counter-roll + withers vertical bob
    chest_bob = math.sin(t * 4 * math.pi + 0.6) * 0.007
    chest_roll = -pelvis_roll * 0.8
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, chest_bob), rot_euler=(0, chest_roll, 0))
    
    # Neck & Head: predatory forward gaze with subtle counter-bobbing
    neck_pitch = math.sin(t * 4 * math.pi + 1.0) * math.radians(1.2)
    head_pitch = -neck_pitch * 0.8
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(neck_pitch, 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(head_pitch, 0, -pelvis_yaw * 0.5))
    
    # Tail: relaxed swinging pendulum with sequential delay
    t_tail = t * 2 * math.pi
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-15), 0, math.sin(t_tail - 0.2) * math.radians(7)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-12), 0, math.sin(t_tail - 0.6) * math.radians(13)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-8), 0, math.sin(t_tail - 1.0) * math.radians(19)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(math.radians(-5), 0, math.sin(t_tail - 1.4) * math.radians(25)))
    
    # Limb motion: 60% Stance, 40% Swing with realistic knee flexion and paw lift
    for side, prefix in [('.L', 'L'), ('.R', 'R')]:
        # FORELEG (shoulder, upper_arm, forearm, paw)
        phi_fore = (t - offsets[prefix + 'F']) % 1.0
        if phi_fore < 0.60:
            # Stance phase: firm ground contact moving backward
            u_stance = phi_fore / 0.60
            arm_rot = math.radians(18 - u_stance * 36)
            fa_rot = math.radians(-5 - u_stance * 8)
            paw_rot = math.radians(-10 + u_stance * 22)
            sh_rot = math.radians(u_stance * 4 - 2)
        else:
            # Swing phase: lift paw, flex elbow, swing forward, plant
            u_swing = (phi_fore - 0.60) / 0.40
            arm_rot = math.radians(-18 + u_swing * 36)
            # Forearm bends back at mid-swing to lift paw (+0.035m)
            fa_lift = math.sin(u_swing * math.pi) * math.radians(35)
            fa_rot = math.radians(-13) + fa_lift
            paw_rot = math.radians(12 - u_swing * 22)
            sh_rot = math.radians(2 - u_swing * 4)
            
        key_bone(arm_obj.pose.bones["shoulder" + side], frame, rot_euler=(sh_rot, 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + side], frame, rot_euler=(arm_rot, 0, 0))
        key_bone(arm_obj.pose.bones["forearm" + side], frame, rot_euler=(fa_rot, 0, 0))
        key_bone(arm_obj.pose.bones["paw" + side], frame, rot_euler=(paw_rot, 0, 0))
        
        # HIND LEG (thigh, shin, hock, paw_back)
        phi_hind = (t - offsets[prefix + 'H']) % 1.0
        if phi_hind < 0.60:
            # Stance phase: push backward
            u_stance = phi_hind / 0.60
            thigh_rot = math.radians(20 - u_stance * 40)
            shin_rot = math.radians(10 + u_stance * 12)
            hock_rot = math.radians(-15 + u_stance * 10)
            paw_b_rot = math.radians(5 - u_stance * 12)
        else:
            # Swing phase: knee/hock flex, paw lifts (+0.04m), extend forward
            u_swing = (phi_hind - 0.60) / 0.40
            thigh_rot = math.radians(-20 + u_swing * 40)
            shin_lift = math.sin(u_swing * math.pi) * math.radians(38)
            shin_rot = math.radians(22) + shin_lift
            hock_flex = math.sin(u_swing * math.pi) * math.radians(-25)
            hock_rot = math.radians(-5) + hock_flex
            paw_b_rot = math.radians(-7 + u_swing * 12)
            
        key_bone(arm_obj.pose.bones["thigh" + side], frame, rot_euler=(thigh_rot, 0, 0))
        key_bone(arm_obj.pose.bones["shin" + side], frame, rot_euler=(shin_rot, 0, 0))
        key_bone(arm_obj.pose.bones["hock" + side], frame, rot_euler=(hock_rot, 0, 0))
        key_bone(arm_obj.pose.bones["paw_back" + side], frame, rot_euler=(paw_b_rot, 0, 0))

track_walk = arm_obj.animation_data.nla_tracks.new()
track_walk.name = "walk_track"
track_walk.strips.new("walk", 1, action_walk)

# ==========================================
# ANIMATION 2: standing (idle breathing + alert look)
# ==========================================
print("Baking Animation 2: 'standing' (idle breathing + alert look)...")
action_standing = bpy.data.actions.new(name="standing")
arm_obj.animation_data.action = action_standing

for frame in [1, 15, 30, 45, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.012
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, breath), rot_euler=(breath * 0.35, 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, breath * 0.5), rot_euler=(0, 0, 0))
    head_sway = math.sin(t * math.pi * 2) * 0.035
    head_pitch = math.cos(t * math.pi * 2) * 0.015
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(head_pitch, 0, head_sway))
    tail_flick = math.sin(t * math.pi * 2) * 0.12
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(0, 0, tail_flick * 0.2))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(0, 0, tail_flick * 0.5))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(0, 0, tail_flick * 0.8))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, tail_flick * 1.2))

track_standing = arm_obj.animation_data.nla_tracks.new()
track_standing.name = "standing_track"
track_standing.strips.new("standing", 1, action_standing)

# ==========================================
# ANIMATION 3: sitting (seated haunches + alert posture)
# ==========================================
print("Baking Animation 3: 'sitting'...")
action_sitting = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = action_sitting

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.010
    
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.045, -0.190), rot_euler=(math.radians(30), 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, -0.095), rot_euler=(math.radians(-18), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.028), rot_euler=(math.radians(-12) + breath, 0, 0))
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
# ANIMATION 4: sleeping (curled relaxed breathing)
# ==========================================
print("Baking Animation 4: 'sleeping'...")
action_sleeping = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = action_sleeping

for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    deep_breath = math.sin(t * math.pi * 2) * 0.014
    
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0.028, 0.028, -0.282), rot_euler=(math.radians(8), math.radians(12), math.radians(5)))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0.019, 0, -0.245), rot_euler=(0, math.radians(8), deep_breath))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, -0.019, -0.226), rot_euler=(deep_breath, math.radians(6), 0))
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

# 7. Export Lioness-Rigged.glb and Lioness-Rigged.web.glb
output_glb = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lioness-Rigged.glb"
output_web_glb = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lioness-Rigged.web.glb"
print(f"Exporting rigged & animated Lioness to: {output_glb}")

for o in list(bpy.data.objects):
    if o != mesh and o != arm_obj:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.object.select_all(action='DESELECT')
mesh.select_set(True)
arm_obj.select_set(True)
bpy.context.view_layer.objects.active = arm_obj

# Export standard GLB
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_nla_strips=True,
    export_attributes=True,
    export_vertex_color='ACTIVE'
)

# Export web-optimized GLB (JPEG q95 textures)
print(f"Exporting web-optimized Lioness to: {output_web_glb}")
bpy.ops.export_scene.gltf(
    filepath=output_web_glb,
    export_format='GLB',
    use_selection=True,
    export_animations=True,
    export_skins=True,
    export_morph=True,
    export_nla_strips=True,
    export_attributes=True,
    export_vertex_color='ACTIVE',
    export_image_format='JPEG',
    export_image_quality=95
)

print("=== LIONESS RIGGING & ANIMATION PIPELINE COMPLETE ===")
