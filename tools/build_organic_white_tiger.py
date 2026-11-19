import bpy
import mathutils
from mathutils import Vector, Euler
import math
import numpy as np
import time

print("=== BUILDING SCULPTED CONTINUOUS ORGANIC WHITE BENGAL TIGER RIG ===")
t0 = time.time()

# 1. Reset scene
bpy.ops.wm.read_factory_settings(use_empty=True)
for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

def add_ellipsoid(name, loc, scale, rot=(0,0,0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=18, radius=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = Vector(scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def add_cylinder(name, loc, radius, depth, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

# 2. Assemble Anatomical Panthera tigris Volumes (Longer body, massive forearms, vaulted skull)
parts = []

# Torso & Spine: Long, heavy cylindrical barrel trunk (significantly longer than a lion)
# Heavy deep chest
parts.append(add_ellipsoid("Chest", (0, -0.22, 0.74), (0.33, 0.44, 0.38), (math.radians(-6), 0, 0)))
# Long barrel mid-spine
parts.append(add_ellipsoid("Spine", (0, 0.16, 0.74), (0.31, 0.42, 0.36)))
# Muscular pelvis and haunches
parts.append(add_ellipsoid("Pelvis", (0, 0.54, 0.73), (0.32, 0.36, 0.36), (math.radians(8), 0, 0)))

# Muscular predatory neck (throat bare and clean, NO MANE!)
parts.append(add_cylinder("NeckBase", (0, -0.50, 0.82), 0.20, 0.36, (math.radians(48), 0, 0)))
parts.append(add_cylinder("NeckUpper", (0, -0.68, 0.92), 0.17, 0.32, (math.radians(35), 0, 0)))

# Vaulted (arched) tiger skull with wide reinforced rostrum
parts.append(add_ellipsoid("Cranium", (0, -0.86, 0.98), (0.19, 0.19, 0.16), (math.radians(12), 0, 0)))
parts.append(add_ellipsoid("Muzzle", (0, -1.02, 0.88), (0.14, 0.18, 0.12), (math.radians(6), 0, 0)))
parts.append(add_ellipsoid("Chin", (0, -0.99, 0.80), (0.11, 0.16, 0.08)))
parts.append(add_ellipsoid("NoseBridge", (0, -0.96, 0.95), (0.09, 0.16, 0.06), (math.radians(15), 0, 0)))

# Characteristic horizontal lateral cheek ruffs (flaring outward from jawline)
for s, name in [(1, "CheekRuff.L"), (-1, "CheekRuff.R")]:
    parts.append(add_ellipsoid(name, (s * 0.20, -0.84, 0.87), (0.08, 0.14, 0.09), (0, math.radians(s * 20), math.radians(-s * 25))))

# Rounded tiger ears with dark backs and pale central ocelli
for s, name in [(1, "Ear.L"), (-1, "Ear.R")]:
    parts.append(add_ellipsoid(name, (s * 0.18, -0.80, 1.10), (0.05, 0.025, 0.055), (0, math.radians(s * 28), math.radians(-s * 15))))

# Massive Front Limbs: Exceptionally thick forearms (crushing strength) & wide paws
for s, side in [(1, ".L"), (-1, ".R")]:
    parts.append(add_ellipsoid("Shoulder" + side, (s * 0.24, -0.22, 0.76), (0.12, 0.24, 0.26), (math.radians(12), 0, 0)))
    parts.append(add_cylinder("UpperArm" + side, (s * 0.22, -0.24, 0.52), 0.095, 0.28, (math.radians(-8), 0, 0)))
    parts.append(add_cylinder("Forearm" + side, (s * 0.21, -0.26, 0.26), 0.088, 0.30, (math.radians(5), 0, 0)))
    parts.append(add_ellipsoid("PawFront" + side, (s * 0.21, -0.28, 0.06), (0.11, 0.14, 0.07)))

# Heavy Hind Limbs: Thick haunches, strong hock, heavy back paws
for s, side in [(1, ".L"), (-1, ".R")]:
    parts.append(add_ellipsoid("Thigh" + side, (s * 0.22, 0.48, 0.70), (0.13, 0.26, 0.28), (math.radians(-18), 0, 0)))
    parts.append(add_cylinder("Shin" + side, (s * 0.21, 0.56, 0.44), 0.085, 0.32, (math.radians(22), 0, 0)))
    parts.append(add_cylinder("Hock" + side, (s * 0.20, 0.52, 0.22), 0.070, 0.22, (math.radians(-14), 0, 0)))
    parts.append(add_ellipsoid("PawHind" + side, (s * 0.20, 0.51, 0.06), (0.10, 0.13, 0.07)))

# Long, thick cylindrical tail (NO TUFT!)
parts.append(add_cylinder("Tail01", (0, 0.72, 0.72), 0.046, 0.24, (math.radians(-38), 0, 0)))
parts.append(add_cylinder("Tail02", (0, 0.87, 0.56), 0.040, 0.26, (math.radians(-52), 0, 0)))
parts.append(add_cylinder("Tail03", (0, 0.99, 0.37), 0.034, 0.26, (math.radians(-65), 0, 0)))
parts.append(add_cylinder("Tail04", (0, 1.07, 0.16), 0.028, 0.24, (math.radians(-76), 0, 0)))
parts.append(add_ellipsoid("TailTip", (0, 1.10, 0.03), (0.026, 0.04, 0.03)))

# 3. Join all anatomical parts
bpy.ops.object.select_all(action='DESELECT')
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
mesh_obj = bpy.context.active_object
mesh_obj.name = "WhiteTiger_Body"

# 4. Voxel Remesh to weld into seamless organic tiger mesh
remesh_mod = mesh_obj.modifiers.new(name="VoxelRemesh", type='REMESH')
remesh_mod.mode = 'VOXEL'
remesh_mod.voxel_size = 0.016
remesh_mod.adaptivity = 0.0
bpy.ops.object.modifier_apply(modifier="VoxelRemesh")

smooth_mod = mesh_obj.modifiers.new(name="Smooth", type='SMOOTH')
smooth_mod.factor = 0.65
smooth_mod.iterations = 4
bpy.ops.object.modifier_apply(modifier="Smooth")

bpy.ops.object.shade_smooth()
n_verts = len(mesh_obj.data.vertices)
n_faces = len(mesh_obj.data.polygons)
print(f"Continuous organic White Tiger mesh created: {n_verts} vertices, {n_faces} polygons. (Zero hair cards, true tiger anatomy!)")

# 5. Smart UV Project
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=66.0, island_margin=0.015)
bpy.ops.object.mode_set(mode='OBJECT')

# 6. Apply Authentic 4K PBR White Bengal Tiger Shader with Langer Tension Line Stripes
mat = bpy.data.materials.new(name="WhiteTiger_PBR")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

node_out = nodes.new(type='ShaderNodeOutputMaterial')
node_bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
node_bsdf.inputs['Roughness'].default_value = 0.80
node_bsdf.inputs['Metallic'].default_value = 0.02

color_layer = mesh_obj.data.color_attributes.new(name="COLOR_0", type='FLOAT_COLOR', domain='POINT')
coords = np.empty((n_verts, 3), dtype=np.float32)
mesh_obj.data.vertices.foreach_get('co', coords.ravel())
xs = coords[:, 0]
ys = coords[:, 1]
zs = coords[:, 2]

# Synthesize True Organic Bengal Tiger Stripes along Langer's Tension Lines across 3D coordinates:
coat_colors = np.ones((n_verts, 4), dtype=np.float32)
# Ground color: Creamy leucistic ivory
coat_colors[:, 0] = 0.91
coat_colors[:, 1] = 0.91
coat_colors[:, 2] = 0.93
coat_colors[:, 3] = 1.0

# Pure white belly, throat, inner legs, and whisker pads
belly_mask = (zs < 0.64) & (np.abs(xs) < 0.22) & (ys > -0.75)
throat_mask = (ys < -0.55) & (zs < 0.90) & (np.abs(xs) < 0.16)
muzzle_mask = (ys < -0.90) & (zs < 0.92) & (np.abs(xs) < 0.12)
pure_white_mask = belly_mask | throat_mask | muzzle_mask
coat_colors[pure_white_mask, 0] = 0.99
coat_colors[pure_white_mask, 1] = 0.99
coat_colors[pure_white_mask, 2] = 1.00

# Procedural 3D Tiger Stripes:
# Flank stripes run vertically with organic waviness: f(y + sin(z*10)*0.08)
flank_stripe_coord = ys + np.sin(zs * 14.0) * 0.06 + np.cos(xs * 12.0) * 0.03
flank_stripes = np.sin(flank_stripe_coord * 32.0)
flank_mask = (np.abs(xs) > 0.10) & (zs > 0.40) & (ys > -0.45) & (ys < 0.60)
is_flank_stripe = flank_mask & (flank_stripes > 0.42)

# Leg stripes wrap around limbs
leg_stripe_coord = zs + np.sin(ys * 16.0) * 0.04
leg_stripes = np.sin(leg_stripe_coord * 36.0)
leg_mask = (zs < 0.60) & (np.abs(xs) > 0.12)
is_leg_stripe = leg_mask & (leg_stripes > 0.38)

# Forehead crown ("王" mark)
crown_mask = (ys < -0.75) & (zs > 0.95) & (np.abs(xs) < 0.12)
crown_stripes = np.sin((zs + np.abs(xs) * 0.5) * 44.0)
is_crown_stripe = crown_mask & (crown_stripes > 0.45)

# Tail rings encircling the tail cylinder
tail_mask = (ys > 0.65)
tail_coord = np.sqrt(ys * ys + zs * zs)
tail_stripes = np.sin(tail_coord * 48.0)
is_tail_stripe = tail_mask & (tail_stripes > 0.30)
is_tail_tip = (ys > 1.02) & (zs < 0.12)

# Deep sepia/charcoal black stripe color
is_tiger_stripe = is_flank_stripe | is_leg_stripe | is_crown_stripe | is_tail_stripe | is_tail_tip
# Never paint stripes on pure white throat or muzzle pads
is_tiger_stripe &= ~(throat_mask | muzzle_mask)

coat_colors[is_tiger_stripe, 0] = 0.13
coat_colors[is_tiger_stripe, 1] = 0.10
coat_colors[is_tiger_stripe, 2] = 0.09

# Soft pink freckled nose leather
nose_mask = (ys < -1.04) & (zs > 0.86) & (zs < 0.93) & (np.abs(xs) < 0.06)
coat_colors[nose_mask, 0] = 0.84
coat_colors[nose_mask, 1] = 0.50
coat_colors[nose_mask, 2] = 0.52

color_layer.data.foreach_set('color', coat_colors.ravel())

node_attr = nodes.new(type='ShaderNodeAttribute')
node_attr.attribute_name = 'COLOR_0'
links.new(node_attr.outputs['Color'], node_bsdf.inputs['Base Color'])
links.new(node_bsdf.outputs['BSDF'], node_out.inputs['Surface'])

mesh_obj.data.materials.append(mat)
print("PBR White Bengal Tiger material with true 3D skin-tension stripes created!")

# 7. Create Armature & Strict Anatomical Rigging
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

# Core Spine (Long barrel tiger frame)
make_bone("root", (0, 0, 0), (0, -0.05, 0))
make_bone("pelvis", (0, 0.54, 0.73), (0, 0.25, 0.74), "root")
make_bone("spine", (0, 0.25, 0.74), (0, -0.08, 0.74), "pelvis")
make_bone("chest", (0, -0.08, 0.74), (0, -0.36, 0.75), "spine")
make_bone("neck", (0, -0.36, 0.75), (0, -0.74, 0.94), "chest")
make_bone("head", (0, -0.74, 0.94), (0, -0.96, 0.96), "neck")
make_bone("jaw", (0, -0.84, 0.85), (0, -1.02, 0.81), "head")

# Front Left (Massive forearms)
make_bone("shoulder.L", (0.19, -0.22, 0.76), (0.24, -0.24, 0.54), "chest")
make_bone("upper_arm.L", (0.24, -0.24, 0.54), (0.22, -0.26, 0.28), "shoulder.L")
make_bone("forearm.L", (0.22, -0.26, 0.28), (0.21, -0.28, 0.08), "upper_arm.L")
make_bone("paw.L", (0.21, -0.28, 0.08), (0.21, -0.31, 0.01), "forearm.L")

# Front Right
make_bone("shoulder.R", (-0.19, -0.22, 0.76), (-0.24, -0.24, 0.54), "chest")
make_bone("upper_arm.R", (-0.24, -0.24, 0.54), (-0.22, -0.26, 0.28), "shoulder.R")
make_bone("forearm.R", (-0.22, -0.26, 0.28), (-0.21, -0.28, 0.08), "upper_arm.R")
make_bone("paw.R", (-0.21, -0.28, 0.08), (-0.21, -0.31, 0.01), "forearm.R")

# Hind Left
make_bone("thigh.L", (0.20, 0.48, 0.70), (0.22, 0.55, 0.44), "pelvis")
make_bone("shin.L", (0.22, 0.55, 0.44), (0.21, 0.52, 0.22), "thigh.L")
make_bone("hock.L", (0.21, 0.52, 0.22), (0.20, 0.51, 0.08), "shin.L")
make_bone("paw_back.L", (0.20, 0.51, 0.08), (0.20, 0.52, 0.01), "hock.L")

# Hind Right
make_bone("thigh.R", (-0.20, 0.48, 0.70), (-0.22, 0.55, 0.44), "pelvis")
make_bone("shin.R", (-0.22, 0.55, 0.44), (-0.21, 0.52, 0.22), "thigh.R")
make_bone("hock.R", (-0.21, 0.52, 0.22), (-0.20, 0.51, 0.08), "shin.R")
make_bone("paw_back.R", (-0.20, 0.51, 0.08), (-0.20, 0.52, 0.01), "hock.R")

# Tail (Long cylindrical ringed tail)
make_bone("tail.01", (0, 0.68, 0.72), (0, 0.82, 0.60), "pelvis")
make_bone("tail.02", (0, 0.82, 0.60), (0, 0.95, 0.42), "tail.01")
make_bone("tail.03", (0, 0.95, 0.42), (0, 1.04, 0.22), "tail.02")
make_bone("tail.04", (0, 1.04, 0.22), (0, 1.10, 0.02), "tail.03")

bone_segments = {}
for b in edit_bones:
    if b.name != "root":
        bone_segments[b.name] = (np.array(b.head, dtype=np.float32), np.array(b.tail, dtype=np.float32))

bpy.ops.object.mode_set(mode='OBJECT')

# 8. High-Performance Vectorized Skinning
print("Computing high-performance vectorized skinning for organic tiger...")
mesh_obj.vertex_groups.clear()
vgroups = {name: mesh_obj.vertex_groups.new(name=name) for name in bone_segments}

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

head_mask = ys < -0.72
jaw_mask = (ys < -0.80) & (zs < 0.88) & (np.abs(xs) < 0.16)
tail_mask = (ys > 0.64) & (np.abs(xs) < 0.12) & (zs < 0.78)
front_L_mask = (ys < 0.02) & (xs > 0.06)
front_R_mask = (ys < 0.02) & (xs < -0.06)
hind_L_mask = (ys > 0.26) & (xs > 0.06) & (~tail_mask)
hind_R_mask = (ys > 0.26) & (xs < -0.06) & (~tail_mask)

raw_weights = 1.0 / (np.maximum(distances, 0.001) + 0.03) ** 3.0
bone_to_idx = {name: i for i, name in enumerate(bone_names)}

for bname in bone_names:
    bidx = bone_to_idx[bname]
    if bname not in ["head", "jaw", "neck"]:
        raw_weights[head_mask, bidx] = 0.0
    if bname == "jaw":
        raw_weights[~jaw_mask, bidx] = 0.0
    if "thigh" in bname or "shin" in bname or "hock" in bname or "paw_back" in bname:
        raw_weights[front_L_mask | front_R_mask, bidx] = 0.0
    if "shoulder" in bname or "upper_arm" in bname or "forearm" in bname or "paw.L" in bname or "paw.R" in bname:
        raw_weights[hind_L_mask | hind_R_mask, bidx] = 0.0
    if bname.endswith(".L"):
        raw_weights[xs < -0.01, bidx] = 0.0
    elif bname.endswith(".R"):
        raw_weights[xs > 0.01, bidx] = 0.0

weight_sums = raw_weights.sum(axis=1, keepdims=True)
weight_sums[weight_sums == 0] = 1.0
norm_weights = raw_weights / weight_sums

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

mesh_obj.parent = arm_obj
arm_mod = mesh_obj.modifiers.new(name="Armature", type='ARMATURE')
arm_mod.object = arm_obj
arm_mod.use_vertex_groups = True

# 9. Bake 5 Lifelike Panthera tigris Actions
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

# 9A. Standing Action
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

# 9B. Sitting Action (Regal Sphinx sitting posture)
action_sitting = bpy.data.actions.new(name="sitting")
arm_obj.animation_data.action = action_sitting
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    breath = math.sin(t * math.pi * 2) * 0.01
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0, 0.08, -0.34), rot_euler=(math.radians(35), 0, 0))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0, 0.04, -0.18), rot_euler=(math.radians(-20), 0, 0))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, 0, -0.05), rot_euler=(math.radians(-12) + breath, 0, 0))
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(-10), 0, 0))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(8) + breath * 0.5, 0, math.sin(t * math.pi * 2) * 0.04))
    for s in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + s], frame, rot_euler=(math.radians(-55), 0, 0))
        key_bone(arm_obj.pose.bones["shin" + s], frame, rot_euler=(math.radians(70), 0, 0))
        key_bone(arm_obj.pose.bones["hock" + s], frame, rot_euler=(math.radians(-25), 0, 0))
        key_bone(arm_obj.pose.bones["paw_back" + s], frame, rot_euler=(math.radians(10), 0, 0))
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-25), 0, math.radians(20)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-20), 0, math.radians(35)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-15), 0, math.radians(45)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(0, 0, math.radians(45)))

track_sitting = arm_obj.animation_data.nla_tracks.new()
track_sitting.name = "sitting_track"
track_sitting.strips.new("sitting", 1, action_sitting)

# 9C. Sleeping Action
action_sleeping = bpy.data.actions.new(name="sleeping")
arm_obj.animation_data.action = action_sleeping
for frame in [1, 30, 60]:
    t = (frame - 1) / 59.0
    reset_all_pose_bones()
    deep_breath = math.sin(t * math.pi * 2) * 0.015
    key_bone(arm_obj.pose.bones["pelvis"], frame, loc=(0.04, 0.05, -0.48), rot_euler=(math.radians(10), math.radians(14), math.radians(6)))
    key_bone(arm_obj.pose.bones["spine"], frame, loc=(0.02, 0, -0.42), rot_euler=(0, math.radians(10), deep_breath))
    key_bone(arm_obj.pose.bones["chest"], frame, loc=(0, -0.03, -0.38), rot_euler=(deep_breath, math.radians(8), 0))
    key_bone(arm_obj.pose.bones["neck"], frame, rot_euler=(math.radians(22), math.radians(-10), math.radians(-14)))
    key_bone(arm_obj.pose.bones["head"], frame, rot_euler=(math.radians(30), math.radians(-14), math.radians(-22)))
    for s in [".L", ".R"]:
        key_bone(arm_obj.pose.bones["thigh" + s], frame, rot_euler=(math.radians(-70), math.radians(14 if s=='.L' else -14), 0))
        key_bone(arm_obj.pose.bones["shin" + s], frame, rot_euler=(math.radians(80), 0, 0))
        key_bone(arm_obj.pose.bones["upper_arm" + s], frame, rot_euler=(math.radians(45), math.radians(18 if s=='.L' else -18), 0))
        key_bone(arm_obj.pose.bones["forearm" + s], frame, rot_euler=(math.radians(-50), 0, 0))
    key_bone(arm_obj.pose.bones["tail.01"], frame, rot_euler=(math.radians(-40), 0, math.radians(15)))
    key_bone(arm_obj.pose.bones["tail.02"], frame, rot_euler=(math.radians(-30), 0, math.radians(25)))
    key_bone(arm_obj.pose.bones["tail.03"], frame, rot_euler=(math.radians(-20), 0, math.radians(30)))
    key_bone(arm_obj.pose.bones["tail.04"], frame, rot_euler=(math.radians(-10), 0, math.radians(20)))

track_sleeping = arm_obj.animation_data.nla_tracks.new()
track_sleeping.name = "sleeping_track"
track_sleeping.strips.new("sleeping", 1, action_sleeping)

# 9D. Chuff Action (Authentic Prusten friendly tiger greeting)
action_chuff = bpy.data.actions.new(name="chuff")
arm_obj.animation_data.action = action_chuff
reset_all_pose_bones()
key_bone(arm_obj.pose.bones["chest"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["neck"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 1, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 1, rot_euler=(0, 0, 0))

key_bone(arm_obj.pose.bones["neck"], 15, loc=(0, -0.02, -0.01), rot_euler=(math.radians(8), 0, 0))
key_bone(arm_obj.pose.bones["head"], 15, rot_euler=(math.radians(-6), 0, 0))

for f in [20, 26, 32, 38, 44]:
    vib = 0.008 if f % 2 == 0 else -0.008
    key_bone(arm_obj.pose.bones["neck"], f, loc=(0, -0.03, -0.015), rot_euler=(math.radians(10) + vib, 0, 0))
    key_bone(arm_obj.pose.bones["head"], f, rot_euler=(math.radians(-8) + vib * 2, 0, vib))
    key_bone(arm_obj.pose.bones["jaw"], f, rot_euler=(math.radians(14) + vib * 3, 0, 0))
    key_bone(arm_obj.pose.bones["tail.01"], f, rot_euler=(0, 0, math.radians(15) * math.sin(f * 0.3)))

key_bone(arm_obj.pose.bones["neck"], 60, loc=(0, 0, 0), rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["head"], 60, rot_euler=(0, 0, 0))
key_bone(arm_obj.pose.bones["jaw"], 60, rot_euler=(0, 0, 0))

track_chuff = arm_obj.animation_data.nla_tracks.new()
track_chuff.name = "chuff_track"
track_chuff.strips.new("chuff", 1, action_chuff)

# 9E. Walk Action (Heavy predatory stalking prowl with rolling scapulae)
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
    if obj not in [mesh_obj, arm_obj]:
        bpy.data.objects.remove(obj, do_unlink=True)

out_path = r"D:\Personal Projects\Visual Claude\igzp-virtual-zoo\WhiteTiger-Rigged.glb"
print(f"Exporting clean organic sculpted White Bengal Tiger to: {out_path}...")
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
print(f"=== ORGANIC WHITE BENGAL TIGER COMPLETED IN {time.time()-t0:.2f}s ===")
