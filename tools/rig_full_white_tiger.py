import bpy
import mathutils
from mathutils import Vector, Euler
import math
import numpy as np
import time

print("=== STARTING FULL-RESOLUTION (70MB+) WHITE BENGAL TIGER RIG PIPELINE ===")

# 1. Reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

# 2. Import original 75MB Lion-Male.glb WITHOUT DECIMATION
glb_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\Lion-Male.glb"
print(f"Loading full-fidelity masterwork: {glb_path}...")
t0 = time.time()
bpy.ops.import_scene.gltf(filepath=glb_path)
mesh = bpy.data.objects['Mesh_0']
mesh.name = "WhiteTiger_Mesh"
n_verts = len(mesh.data.vertices)
print(f"Loaded in {time.time()-t0:.2f}s: {n_verts} vertices, {len(mesh.data.polygons)} polygons. ZERO DECIMATION.")

# 3. Morph Bengal Tiger Anatomy:
# - Collapse lion mane
# - Flare characteristic lateral tiger cheek ruffs
# - Broaden feline nasal bridge
# - Heavy stalking withers
print("Morphing felid mesh to Panthera tigris (Bengal Tiger) cranial and shoulder proportions...")
coords = np.empty((n_verts, 3), dtype=np.float32)
mesh.data.vertices.foreach_get('co', coords.ravel())
xs = coords[:, 0]
ys = coords[:, 1]
zs = coords[:, 2]

# 3A. Collapse male mane
neck_mask = (ys >= -0.25) & (ys <= 0.08) & (zs >= 0.22) & (zs <= 0.65)
center_z = 0.42 - (ys - 0.05) * 0.10
compress_x = np.where(neck_mask & (np.abs(xs) > 0.06), 0.65, 1.0)
compress_z = np.where(neck_mask & ((zs - center_z) > 0.06), 0.70, 1.0)
coords[:, 0] *= compress_x
coords[neck_mask, 2] = center_z[neck_mask] + (zs[neck_mask] - center_z[neck_mask]) * compress_z[neck_mask]

# 3B. Flare Tiger Cheek Ruffs (Whiskers & Jowls)
cheek_mask = (ys >= -0.34) & (ys <= -0.21) & (zs >= 0.28) & (zs <= 0.44) & (np.abs(xs) > 0.04)
coords[cheek_mask, 0] *= 1.32  # Expand cheek ruffs laterally outwards

# 3C. Broaden Tiger Nasal Bridge
snout_mask = (ys >= -0.36) & (ys <= -0.25) & (zs >= 0.38) & (zs <= 0.47)
coords[snout_mask, 0] *= 1.15

# 3D. Muscular Stalking Withers
withers_mask = (ys >= -0.08) & (ys <= 0.12) & (zs >= 0.40)
coords[withers_mask, 2] += 0.015

mesh.data.vertices.foreach_set('co', coords.ravel())
mesh.data.update()
print("Panthera tigris anatomy sculpted successfully!")

# 4. Swap Base Color Texture to 4K White Bengal Tiger Texture
tiger_tex_path = r"D:\Personal Projects\Visual Claude\tools\white_tiger_base_color.png"
print(f"Applying 4K White Bengal Tiger texture: {tiger_tex_path}...")
new_img = bpy.data.images.load(tiger_tex_path)
mat = bpy.data.materials['Material_0']
for node in mat.node_tree.nodes:
    if node.type == 'TEX_IMAGE' and node.image and node.image.name == 'Image_0':
        node.image = new_img
        print("Replaced base color image node with 4K White Bengal Tiger texture!")

# 4B. Add COLOR_0 vertex colors attribute
mesh.data.color_attributes.new(name="COLOR_0", type='FLOAT_COLOR', domain='CORNER')
attr_node = mat.node_tree.nodes.new('ShaderNodeAttribute')
attr_node.attribute_name = 'COLOR_0'
print("Added COLOR_0 color attribute to mesh and material node tree!")

# 5. Create Armature
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

# Core Spine & Head
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

bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (np.array(b.head, dtype=np.float32), np.array(b.tail, dtype=np.float32))

bpy.ops.object.mode_set(mode='OBJECT')

# 6. High-Performance Vectorized Skinning
print("Computing high-performance vectorized skinning for all 872,138 vertices...")
mesh.vertex_groups.clear()
vgroups = {name: mesh.vertex_groups.new(name=name) for name in bone_segments}

xs = coords[:, 0]
ys = coords[:, 1]
zs = coords[:, 2]
abs_xs = np.abs(xs)

def np_dist(p, a, b):
    ab = b - a
    l2 = np.dot(ab, ab)
    ap = p - a
    t = np.clip(np.dot(ap, ab) / l2, 0.0, 1.0)
    proj = a + t[:, None] * ab
    return np.linalg.norm(p - proj, axis=1)

bone_names = list(bone_segments.keys())
distances = np.empty((n_verts, len(bone_names)), dtype=np.float32)
for bi, bname in enumerate(bone_names):
    a, b = bone_segments[bname]
    distances[:, bi] = np_dist(coords, a, b)

head_mask = ys < -0.21
jaw_mask = (ys < -0.24) & (zs < 0.40) & (abs_xs < 0.09)
neck_mask_geom = (ys >= -0.26) & (ys <= -0.06) & (zs > 0.20)
tail_mask = (ys >= 0.36) & (abs_xs < 0.08) & (zs < 0.45)
front_L_mask = (ys < 0.08) & (xs > 0.035)
front_R_mask = (ys < 0.08) & (xs < -0.035)
hind_L_mask = (ys > 0.16) & (xs > 0.035) & (~tail_mask)
hind_R_mask = (ys > 0.16) & (xs < -0.035) & (~tail_mask)
torso_mask = ~(head_mask | neck_mask_geom | tail_mask | front_L_mask | front_R_mask | hind_L_mask | hind_R_mask)

raw_weights = 1.0 / (np.maximum(distances, 0.001) + 0.02) ** 3.0
bone_to_idx = {name: i for i, name in enumerate(bone_names)}

for bname in bone_names:
    bidx = bone_to_idx[bname]
    if bname not in ["head", "jaw", "neck"]:
        raw_weights[head_mask, bidx] = 0.0
    if bname == "jaw":
        raw_weights[~jaw_mask, bidx] = 0.0
    if bname == "neck":
        raw_weights[head_mask & (ys < -0.27), bidx] = 0.0
    if ("shoulder" in bname or "upper_arm" in bname or "forearm" in bname or "paw" in bname or
        "thigh" in bname or "shin" in bname or "hock" in bname or "tail" in bname):
        raw_weights[torso_mask, bidx] = 0.0
    if "thigh" in bname or "shin" in bname or "hock" in bname or "paw_back" in bname:
        raw_weights[front_L_mask | front_R_mask, bidx] = 0.0
    if "shoulder" in bname or "upper_arm" in bname or "forearm" in bname or "paw.L" in bname or "paw.R" in bname:
        raw_weights[hind_L_mask | hind_R_mask, bidx] = 0.0
    if bname.endswith(".L"):
        raw_weights[xs < -0.005, bidx] = 0.0
    elif bname.endswith(".R"):
        raw_weights[xs > 0.005, bidx] = 0.0

weight_sums = raw_weights.sum(axis=1, keepdims=True)
weight_sums[weight_sums == 0] = 1.0
norm_weights = raw_weights / weight_sums

print("Assigning weights to Blender vertex groups in batches...")
t_w0 = time.time()
for bi, bname in enumerate(bone_names):
    w_col = norm_weights[:, bi]
    active_idx = np.where(w_col > 0.01)[0]
    if len(active_idx) > 0:
        quant = np.round(w_col[active_idx], 2)
        unique_weights = np.unique(quant)
        vg = vgroups[bname]
        for uw in unique_weights:
            if uw > 0.01:
                bucket_indices = active_idx[quant == uw].tolist()
                vg.add(bucket_indices, float(uw), 'REPLACE')

print(f"Weights assigned in {time.time()-t_w0:.2f}s!")

# Parent Mesh to Armature
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
    breath = math.sin(t * math.pi * 2) * 0.015
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, breath), rot_euler=(breath * 0.4, 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(breath * 0.2, 0, math.sin(t * math.pi * 2) * 0.03))
    tail_flick = math.sin(t * math.pi * 2) * 0.15
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

# ANIMATION 3: sleeping
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

# ANIMATION 4: chuff (Tiger Friendly Greeting / Prusten)
action_chuff = bpy.data.actions.new(name="chuff")
arm_obj.animation_data.action = action_chuff
reset_all_pose_bones()
key_bone(arm_obj.pose.bones["chest"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["neck"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 1, rot_euler=(0, 0, 0))

# Head dips down and extends forward affectionately
key_bone(arm_obj.pose.bones["neck"], 15, loc=(0, -0.02, -0.01), rot_euler=(math.radians(8), 0, 0))
key_bone(arm_obj.pose.bones["head"], 15, rot_euler=(math.radians(-6), 0, 0))

# Rapid friendly chuff vibrations (frames 20 - 45)
for f in [20, 26, 32, 38, 44]:
    vib = 0.008 if f % 2 == 0 else -0.008
    key_bone(arm_obj.pose.bones["neck"], f, loc=(0, -0.03, -0.015), rot_euler=(math.radians(10) + vib, 0, 0))
    key_bone(arm_obj.pose.bones["head"], f, rot_euler=(math.radians(-8) + vib * 2, 0, vib))
    key_bone(arm_obj.pose.bones["jaw"], f, rot_euler=(math.radians(14) + vib * 3, 0, 0))
    key_bone(arm_obj.pose.bones["tail.01"], f, rot_euler=(0, 0, math.radians(15) * math.sin(f * 0.3)))

# Return to calm stance
key_bone(arm_obj.pose.bones["neck"], 60, loc=(0, 0, 0), rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 60, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 60, rot_euler=(0, 0, 0))

track_chuff = arm_obj.animation_data.nla_tracks.new()
track_chuff.name = "chuff_track"
track_chuff.strips.new("chuff", 1, action_chuff)

# ANIMATION 5: walk (Tiger heavy predatory prowl)
action_walk = bpy.data.actions.new(name="walk")
arm_obj.animation_data.action = action_walk

def front_leg_walk(phase):
    p = phase % 1.0
    if p < 0.60:
        st = p / 0.60
        shoulder_x = math.radians(-3.0 + 6.0 * st)
        upper_arm_x = math.radians(-16.0 + 32.0 * st)
        forearm_x = math.radians(0.0 + 9.0 * math.sin(st * math.pi))
        paw_x = math.radians(-2.0 + 2.0 * (st / 0.70)) if st < 0.70 else math.radians(18.0 * ((st - 0.70) / 0.30))
    else:
        sw = (p - 0.60) / 0.40
        shoulder_x = math.radians(3.0 - 6.0 * sw)
        upper_arm_x = math.radians(16.0 - 32.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
        bend = math.sin(sw * math.pi)
        forearm_x = math.radians(34.0 * bend)
        paw_x = math.radians(18.0 * (1.0 - sw) - 14.0 * bend)
    return shoulder_x, upper_arm_x, forearm_x, paw_x

def hind_leg_walk(phase):
    p = phase % 1.0
    if p < 0.60:
        st = p / 0.60
        thigh_x = math.radians(-15.0 + 30.0 * st)
        shin_x = math.radians(2.0 + 7.0 * math.sin(st * math.pi))
        hock_x = math.radians(-2.0 - 5.0 * math.sin(st * math.pi))
        paw_x = math.radians(0.0) if st < 0.70 else math.radians(18.0 * ((st - 0.70) / 0.30))
    else:
        sw = (p - 0.60) / 0.40
        thigh_x = math.radians(15.0 - 30.0 * (0.5 - 0.5 * math.cos(sw * math.pi)))
        bend = math.sin(sw * math.pi)
        shin_x = math.radians(-24.0 * bend)
        hock_x = math.radians(28.0 * bend)
        paw_x = math.radians(18.0 * (1.0 - sw) - 10.0 * bend)
    return thigh_x, shin_x, hock_x, paw_x

for frame in range(1, 61):
    t = (frame - 1) / 59.0
    cycle = t * 2.0 * math.pi
    reset_all_pose_bones()

    bob = -0.012 * math.cos(4.0 * math.pi * (t - 0.25))
    chest_sway_x = 0.009 * math.sin(cycle)
    chest_yaw = -0.040 * math.cos(cycle)
    chest_roll = 0.022 * math.sin(cycle)

    pelvis_sway_x = -0.006 * math.sin(cycle)
    pelvis_yaw = 0.042 * math.cos(cycle)
    pelvis_roll = -0.016 * math.sin(cycle)

    key_bone(arm_obj.pose.bones["root"], frame, loc=(0, 0, 0))
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(pelvis_sway_x, 0, bob * 0.8), rot_euler=(0, pelvis_roll, pelvis_yaw))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0, bob * 0.9), rot_euler=(0, 0, 0.012 * math.cos(cycle)))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(chest_sway_x, 0, bob), rot_euler=(-0.015 * math.sin(2 * cycle), chest_roll, chest_yaw))

    # Low predatory head position
    head_nod = 0.040 * math.sin(cycle)
    head_yaw = 0.030 * math.sin(cycle)
    key_bone(arm_obj.pose.bones["neck"], frame, loc=(0, -0.01, -0.015), rot_euler=(math.radians(6) + head_nod * 0.6, 0, head_yaw * 0.5))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(-6) - head_nod * 0.4, 0, -head_yaw * 0.3))

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

    tail_sway = 0.28 * math.sin(cycle)
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

out_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\WhiteTiger-Rigged.glb"
print(f"Exporting full-resolution 70MB+ rigged White Bengal Tiger to: {out_path}...")
t_exp = time.time()
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=False,
    export_animations=True,
    export_nla_strips=True,
    export_def_bones=True,
    export_skins=True
)
print(f"Export finished in {time.time()-t_exp:.2f}s!")
print("=== FULL-RESOLUTION WHITE BENGAL TIGER PIPELINE COMPLETE! ===")
