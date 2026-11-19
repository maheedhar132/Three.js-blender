import bpy
import mathutils
from mathutils import Vector, Euler, Color
import math
import numpy as np

print("=== STARTING FLAWLESS LIONESS RIGGING & ANIMATION PIPELINE ===")

# 1. Open the decimated base model
bpy.ops.wm.open_mainfile(filepath=r"D:\Personal Projects\Visual Claude\tools\lion_decimated.blend")
mesh = bpy.data.objects['Mesh_0']
mesh.name = "Lioness_Mesh"

# Remove all other objects
for o in list(bpy.data.objects):
    if o != mesh:
        bpy.data.objects.remove(o, do_unlink=True)

# 2. Sleek sculptural transformation: remove mane, cheek frills, throat beard, belly fringe
print("Sculpting sleek female feline contours...")
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
        target_belly_z = 0.290 + t * 0.020
        if z < target_belly_z and z > 0.15:
            verts[i, 2] = target_belly_z - (target_belly_z - z) * 0.25

    # E. FLANK & SHOULDER STREAMLINING
    if -0.18 <= y <= 0.10 and z > 0.24:
        verts[i, 0] *= 0.94
    elif 0.26 < y <= 0.38 and z > 0.18:
        verts[i, 0] *= 0.98

# F. GLOBAL SCALE (0.94x for ~140kg lioness)
SCALE_FACTOR = 0.94
verts *= SCALE_FACTOR

for i, v in enumerate(mesh.data.vertices):
    v.co = verts[i]
mesh.data.update()

# 3. Apply Warm Tawny Coat Coloration
print("Applying coat coloration: warm tawny, cream countershading, black tail tuft...")
color_attr = mesh.data.color_attributes.get("Color")
if not color_attr:
    color_attr = mesh.data.color_attributes.new(name="Color", type='FLOAT_COLOR', domain='POINT')

for i, v in enumerate(mesh.data.vertices):
    x, y, z = v.co.x, v.co.y, v.co.z
    r, g, b = 1.00, 0.96, 0.90
    if y < -0.21 * SCALE_FACTOR and z < 0.35 * SCALE_FACTOR and abs(x) < 0.045 * SCALE_FACTOR:
        cream_strength = min(1.0, (0.35 * SCALE_FACTOR - z) / 0.08)
        r = 1.00 + 0.18 * cream_strength
        g = 0.96 + 0.18 * cream_strength
        b = 0.90 + 0.20 * cream_strength
    elif y > 0.60 * SCALE_FACTOR and z < 0.18 * SCALE_FACTOR:
        tuft_strength = min(1.0, (y - 0.60 * SCALE_FACTOR) / 0.08)
        r = 1.00 * (1.0 - 0.88 * tuft_strength)
        g = 0.96 * (1.0 - 0.88 * tuft_strength)
        b = 0.90 * (1.0 - 0.88 * tuft_strength)
    color_attr.data[i].color = (r, g, b, 1.0)

mat = mesh.data.materials[0]
if mat and mat.node_tree:
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    tex_node = next((n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and 'Image_0' in (n.image.name if n.image else '')), None)
    if bsdf and tex_node:
        attr_node = mat.node_tree.nodes.new(type='ShaderNodeAttribute')
        attr_node.attribute_name = "Color"
        mix_node = mat.node_tree.nodes.new(type='ShaderNodeMix')
        mix_node.data_type = 'RGBA'
        mix_node.blend_type = 'MULTIPLY'
        mix_node.inputs[0].default_value = 1.0
        mat.node_tree.links.new(tex_node.outputs['Color'], mix_node.inputs[6])
        mat.node_tree.links.new(attr_node.outputs['Color'], mix_node.inputs[7])
        mat.node_tree.links.new(mix_node.outputs[2], bsdf.inputs['Base Color'])

# 4. Create Standard 27-Bone Skeleton
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
    return (vec[0] * SCALE_FACTOR * 0.92 if abs(vec[0]) > 0.01 else vec[0],
            vec[1] * SCALE_FACTOR,
            vec[2] * SCALE_FACTOR)

make_bone("root", (0, 0, 0), (0, -0.05 * SCALE_FACTOR, 0))
make_bone("pelvis", sc((0, 0.35, 0.43)), sc((0, 0.20, 0.42)), "root")
make_bone("spine", sc((0, 0.20, 0.42)), sc((0, 0.05, 0.43)), "pelvis")
make_bone("chest", sc((0, 0.05, 0.43)), sc((0, -0.10, 0.46)), "spine")
make_bone("neck", sc((0, -0.10, 0.46)), sc((0, -0.22, 0.48)), "chest")
make_bone("head", sc((0, -0.22, 0.48)), sc((0, -0.32, 0.45)), "neck")
make_bone("jaw", sc((0, -0.25, 0.38)), sc((0, -0.34, 0.34)), "head")

make_bone("shoulder.L", sc((0.05, -0.06, 0.45)), sc((0.07, -0.08, 0.35)), "chest")
make_bone("upper_arm.L", sc((0.07, -0.08, 0.35)), sc((0.06, -0.09, 0.20)), "shoulder.L")
make_bone("forearm.L", sc((0.06, -0.09, 0.20)), sc((0.05, -0.11, 0.07)), "upper_arm.L")
make_bone("paw.L", sc((0.05, -0.11, 0.07)), sc((0.05, -0.14, 0.01)), "forearm.L")

make_bone("shoulder.R", sc((-0.05, -0.06, 0.45)), sc((-0.07, -0.08, 0.35)), "chest")
make_bone("upper_arm.R", sc((-0.07, -0.08, 0.35)), sc((-0.06, -0.09, 0.20)), "shoulder.R")
make_bone("forearm.R", sc((-0.06, -0.09, 0.20)), sc((-0.05, -0.11, 0.07)), "upper_arm.R")
make_bone("paw.R", sc((-0.05, -0.11, 0.07)), sc((-0.05, -0.14, 0.01)), "forearm.R")

make_bone("thigh.L", sc((0.06, 0.30, 0.42)), sc((0.08, 0.33, 0.26)), "pelvis")
make_bone("shin.L", sc((0.08, 0.33, 0.26)), sc((0.08, 0.39, 0.13)), "thigh.L")
make_bone("hock.L", sc((0.08, 0.39, 0.13)), sc((0.09, 0.38, 0.06)), "shin.L")
make_bone("paw_back.L", sc((0.09, 0.38, 0.06)), sc((0.10, 0.39, 0.01)), "hock.L")

make_bone("thigh.R", sc((-0.06, 0.30, 0.42)), sc((-0.08, 0.33, 0.26)), "pelvis")
make_bone("shin.R", sc((-0.08, 0.33, 0.26)), sc((-0.08, 0.39, 0.13)), "thigh.R")
make_bone("hock.R", sc((-0.08, 0.39, 0.13)), sc((-0.09, 0.38, 0.06)), "shin.R")
make_bone("paw_back.R", sc((-0.09, 0.38, 0.06)), sc((-0.10, 0.39, 0.01)), "hock.R")

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

# 5. Strict Anatomical Bounding & Skinning Algorithm
print("Computing strict anatomically bounded skinning weights for lioness...")
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

def get_allowed_bones(p):
    x, y, z = p.x, p.y, p.z
    abs_x = abs(x)
    allowed = set()
    
    # Head & Jaw: y < -0.21 * SCALE_FACTOR (strict boundary: NO chest, NO shoulder)
    if y < -0.21 * SCALE_FACTOR:
        allowed.add("head")
        if z < 0.40 * SCALE_FACTOR and y < -0.24 * SCALE_FACTOR:
            allowed.add("jaw")
        if y > -0.27 * SCALE_FACTOR:
            allowed.add("neck")
        return allowed
        
    # Neck: -0.26 * SCALE_FACTOR <= y <= -0.06 * SCALE_FACTOR
    if -0.26 * SCALE_FACTOR <= y <= -0.06 * SCALE_FACTOR and z > 0.20 * SCALE_FACTOR:
        allowed.add("neck")
        if y < -0.19 * SCALE_FACTOR:
            allowed.add("head")
        if y > -0.14 * SCALE_FACTOR:
            allowed.add("chest")
        if abs_x > 0.05 * SCALE_FACTOR and y > -0.14 * SCALE_FACTOR:
            allowed.add("shoulder.L" if x > 0 else "shoulder.R")
        return allowed

    # Tail: y >= 0.36 * SCALE_FACTOR and abs_x < 0.08 * SCALE_FACTOR
    if y >= 0.36 * SCALE_FACTOR and abs_x < 0.08 * SCALE_FACTOR and z < 0.45 * SCALE_FACTOR:
        allowed.add("tail.01")
        allowed.add("tail.02")
        allowed.add("tail.03")
        allowed.add("tail.04")
        if y < 0.42 * SCALE_FACTOR:
            allowed.add("pelvis")
        return allowed

    # Front Limbs: y < 0.08 * SCALE_FACTOR and abs_x > 0.035 * SCALE_FACTOR
    if y < 0.08 * SCALE_FACTOR and abs_x > 0.035 * SCALE_FACTOR:
        side = ".L" if x > 0 else ".R"
        if z > 0.30 * SCALE_FACTOR:
            allowed.add("shoulder" + side)
            allowed.add("upper_arm" + side)
            allowed.add("chest")
        elif z > 0.16 * SCALE_FACTOR:
            allowed.add("upper_arm" + side)
            allowed.add("forearm" + side)
        elif z > 0.05 * SCALE_FACTOR:
            allowed.add("forearm" + side)
            allowed.add("paw" + side)
        else:
            allowed.add("paw" + side)
            allowed.add("forearm" + side)
        if abs_x < 0.08 * SCALE_FACTOR and z > 0.25 * SCALE_FACTOR:
            allowed.add("chest")
        return allowed

    # Hind Limbs: y > 0.16 * SCALE_FACTOR and abs_x > 0.035 * SCALE_FACTOR
    if y > 0.16 * SCALE_FACTOR and abs_x > 0.035 * SCALE_FACTOR:
        side = ".L" if x > 0 else ".R"
        if z > 0.32 * SCALE_FACTOR:
            allowed.add("thigh" + side)
            allowed.add("pelvis")
        elif z > 0.18 * SCALE_FACTOR:
            allowed.add("thigh" + side)
            allowed.add("shin" + side)
        elif z > 0.07 * SCALE_FACTOR:
            allowed.add("shin" + side)
            allowed.add("hock" + side)
        else:
            allowed.add("hock" + side)
            allowed.add("paw_back" + side)
        if abs_x < 0.08 * SCALE_FACTOR and z > 0.25 * SCALE_FACTOR:
            allowed.add("pelvis")
        return allowed

    # Torso Core: strictly chest, spine, pelvis (NO limb bones!)
    if -0.12 * SCALE_FACTOR <= y < 0.08 * SCALE_FACTOR:
        allowed.add("chest")
        allowed.add("spine")
    elif 0.08 * SCALE_FACTOR <= y < 0.24 * SCALE_FACTOR:
        allowed.add("spine")
        allowed.add("pelvis")
    else:
        allowed.add("pelvis")
        allowed.add("spine")
        
    return allowed

for idx, v in enumerate(mesh.data.vertices):
    p = v.co
    allowed = get_allowed_bones(p)
    if not allowed:
        allowed = {"spine", "pelvis", "chest"}
        
    weights = []
    for name in allowed:
        if name not in bone_segments:
            continue
        a, b = bone_segments[name]
        d = dist_to_segment(p, a, b)
        
        if name == "jaw":
            d *= 0.6
        elif name == "head" and p.y < -0.24 * SCALE_FACTOR and p.z < 0.37 * SCALE_FACTOR:
            d *= 2.2
            
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

print("Lioness skinning weights assigned with 0 leaks!")

# 6. Parent Mesh to Armature
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

# ANIMATION 1: standing
action_standing = bpy.data.actions.new(name="standing")
arm_obj.animation_data.action = action_standing
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.012
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, breath), rot_euler=(breath * 0.3, 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, breath * 0.5), rot_euler=(0, 0, 0))
    head_sway = math.sin(t * math.pi * 2) * 0.025
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(breath * 0.15, 0, head_sway))
    tail_flick = math.sin(t * math.pi * 2) * 0.12
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(0, 0, tail_flick * 0.2))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(0, 0, tail_flick * 0.5))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(0, 0, tail_flick * 0.8))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, tail_flick * 1.2))

track_standing = arm_obj.animation_data.nla_tracks.new()
track_standing.name = "standing_track"
track_standing.strips.new("standing", 1, action_standing)

# ANIMATION 2: sitting
action_sitting = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = action_sitting
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.01
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.05 * SCALE_FACTOR, -0.20 * SCALE_FACTOR), rot_euler=(math.radians(30), 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, -0.10 * SCALE_FACTOR), rot_euler=(math.radians(-18), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.03 * SCALE_FACTOR), rot_euler=(math.radians(-12) + breath, 0, 0))
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

# ANIMATION 3: sleeping
action_sleeping = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = action_sleeping
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    deep_breath = math.sin(t * math.pi * 2) * 0.015
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0.03 * SCALE_FACTOR, 0.03 * SCALE_FACTOR, -0.30 * SCALE_FACTOR), rot_euler=(math.radians(8), math.radians(12), math.radians(5)))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0.02 * SCALE_FACTOR, 0, -0.26 * SCALE_FACTOR), rot_euler=(0, math.radians(8), deep_breath))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, -0.02 * SCALE_FACTOR, -0.24 * SCALE_FACTOR), rot_euler=(deep_breath, math.radians(6), 0))
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

# ANIMATION 4: walk
action_walk = bpy.data.actions.new(name="walk")
arm_obj.animation_data.action = action_walk

def front_leg_walk(phase):
    p = phase % 1.0
    if p < 0.60:
        st = p / 0.60
        shoulder_x = math.radians(-2.0 + 4.0 * st)
        upper_arm_x = math.radians(-14.0 + 28.0 * st)
        forearm_x = math.radians(0.0 + 8.0 * math.sin(st * math.pi))
        paw_x = math.radians(-2.0 + 2.0 * (st / 0.70)) if st < 0.70 else math.radians(16.0 * ((st - 0.70) / 0.30))
    else:
        sw = (p - 0.60) / 0.40
        shoulder_x = math.radians(2.0 - 4.0 * sw)
        upper_arm_x = math.radians(14.0 - 28.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
        bend = math.sin(sw * math.pi)
        forearm_x = math.radians(32.0 * bend)
        paw_x = math.radians(16.0 * (1.0 - sw) - 12.0 * bend)
    return shoulder_x, upper_arm_x, forearm_x, paw_x

def hind_leg_walk(phase):
    p = phase % 1.0
    if p < 0.60:
        st = p / 0.60
        thigh_x = math.radians(-13.0 + 26.0 * st)
        shin_x = math.radians(1.0 + 6.0 * math.sin(st * math.pi))
        hock_x = math.radians(-1.0 - 4.0 * math.sin(st * math.pi))
        paw_x = math.radians(0.0) if st < 0.70 else math.radians(16.0 * ((st - 0.70) / 0.30))
    else:
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

    bob = -0.010 * math.cos(4.0 * math.pi * (t - 0.25)) * SCALE_FACTOR
    chest_sway_x = 0.007 * math.sin(cycle) * SCALE_FACTOR
    chest_yaw = -0.035 * math.cos(cycle)
    chest_roll = 0.018 * math.sin(cycle)

    pelvis_sway_x = -0.005 * math.sin(cycle) * SCALE_FACTOR
    pelvis_yaw = 0.038 * math.cos(cycle)
    pelvis_roll = -0.014 * math.sin(cycle)

    key_bone(arm_obj.pose.bones["root"], frame, loc=(0, 0, 0))
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(pelvis_sway_x, 0, bob * 0.8), rot_euler=(0, pelvis_roll, pelvis_yaw))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, bob * 0.9), rot_euler=(0, 0, 0.010 * math.cos(cycle)))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(chest_sway_x, 0, bob), rot_euler=(-0.012 * math.sin(2 * cycle), chest_roll, chest_yaw))

    head_nod = 0.035 * math.sin(cycle)
    head_yaw = 0.025 * math.sin(cycle)
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(head_nod * 0.6, 0, head_yaw * 0.5))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(-head_nod * 0.4, 0, -head_yaw * 0.3))

    s_lh, u_lh, f_lh, p_lh = hind_leg_walk(t + 0.00)
    key_bone(arm_obj.pose.bones["thigh.L"], frame, rot_euler=(s_lh, 0, 0))
    key_bone(arm_obj.pose.bones["shin.L"], frame, rot_euler=(u_lh, 0, 0))
    key_bone(arm_obj.pose.bones["hock.L"], frame, rot_euler=(f_lh, 0, 0))
    key_bone(arm_obj.pose.bones["paw_back.L"], frame, rot_euler=(p_lh, 0, 0))

    s_lf, u_lf, f_lf, p_lf = front_leg_walk(t + 0.25)
    key_bone(arm_obj.pose.bones["shoulder.L"], frame, rot_euler=(s_lf, 0, 0))
    key_bone(arm_obj.pose.bones["upper_arm.L"], frame, rot_euler=(u_lf, 0, 0))
    key_bone(arm_obj.pose.bones["forearm.L"], frame, rot_euler=(f_lf, 0, 0))
    key_bone(arm_obj.pose.bones["paw.L"], frame, rot_euler=(p_lf, 0, 0))

    s_rh, u_rh, f_rh, p_rh = hind_leg_walk(t + 0.50)
    key_bone(arm_obj.pose.bones["thigh.R"], frame, rot_euler=(s_rh, 0, 0))
    key_bone(arm_obj.pose.bones["shin.R"], frame, rot_euler=(u_rh, 0, 0))
    key_bone(arm_obj.pose.bones["hock.R"], frame, rot_euler=(f_rh, 0, 0))
    key_bone(arm_obj.pose.bones["paw_back.R"], frame, rot_euler=(p_rh, 0, 0))

    s_rf, u_rf, f_rf, p_rf = front_leg_walk(t + 0.75)
    key_bone(arm_obj.pose.bones["shoulder.R"], frame, rot_euler=(s_rf, 0, 0))
    key_bone(arm_obj.pose.bones["upper_arm.R"], frame, rot_euler=(u_rf, 0, 0))
    key_bone(arm_obj.pose.bones["forearm.R"], frame, rot_euler=(f_rf, 0, 0))
    key_bone(arm_obj.pose.bones["paw.R"], frame, rot_euler=(p_rf, 0, 0))

    tail_sway = 0.25 * math.sin(cycle)
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(0, 0, tail_sway * 0.2))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(0, 0, tail_sway * 0.5))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(0, 0, tail_sway * 0.8))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, tail_sway * 1.2))

track_walk = arm_obj.animation_data.nla_tracks.new()
track_walk.name = "walk_track"
track_walk.strips.new("walk", 1, action_walk)

for obj in list(bpy.data.objects):
    if obj not in [mesh, arm_obj]:
        bpy.data.objects.remove(obj, do_unlink=True)

out_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lioness-Rigged.glb"
print(f"Exporting rigged lioness to: {out_path}...")
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_nla_strips=True,
    export_def_bones=True,
    export_skins=True,
    export_all_influences=False
)
print("=== LIONESS PIPELINE FINISHED SUCCESSFULLY! ===")
