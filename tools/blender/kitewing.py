# Kitewing — a rigged, animated flyer for Plutopia, built from nothing in Blender.
#
#   Blender > Scripting > Open > Run,  or:  blender --background --python tools/blender/kitewing.py
#   (headless works and is faster; it writes models/kitewing.glb either way)
#
# WHY THIS SPECIES. `Drifter` (the kitewing) is the last creature still wearing its
# placeholder primitives: a blob fuselage, a cone snout and four flat membrane wings on
# cylinder spars. It already flies, already has a MAX population and a job (pollen courier),
# and it has no CREATURE_RIGS entry -- so a GLB is the only thing standing between it and a
# real body. Nothing else in the game has to change.
#
# WHAT THE GAME REQUIRES OF THE FILE, and where each requirement comes from:
#   * a SKINNED mesh. attachRig refuses a model with no armature and keeps the placeholder,
#     because a rigid sculpt sliding along the ground with its feet still is worse than a
#     primitive that walks.
#   * at least one clip that is not the exporter's default. Clips are looked up by ROLE, not
#     by exact name: pickClip wants a whole word 'idle' for the rest pose and 'walk' for the
#     travelling one, and rejects anything under a quarter of a second. Hence `idle` and
#     `walk_fwd`, which is the same pair every other creature in the file uses.
#   * FACING +Z. tools/model.js measures this off the bind pose and CREATURE_RIGS.yaw corrects
#     it; building it right means yaw stays 0.
#   * SCALE DOES NOT MATTER. attachRig measures the idle-pose bounds and normalises to
#     cfg.height, so the file can be in any units. Built at roughly game scale anyway, so the
#     numbers below read as the creature they describe.
#
# PALETTE, taken from the game rather than guessed:
#   body      #c8b6ff  emissive #6a4fd6 at .25   (P.drifter / M.drifter)
#   membrane  #efe6ff  emissive #8f6ae0 at .20, 55% opacity, double-sided  (M.membrane)
#   sack      #ff9a2e  emissive, the pollen it is carrying  (M.lantern)

import bpy, bmesh, math, os
from mathutils import Vector, Euler

# ---------------------------------------------------------------- config
NAME     = "kitewing"
OUT      = os.path.join(os.path.dirname(bpy.data.filepath) or os.getcwd(), "kitewing.glb")
BODY_L   = 2.6           # nose to tail
BODY_R   = 0.42          # fattest half-width
WINGS    = [             # (z along the body, span, sweep, chord)   fore pair then aft pair
    (0.35, 3.2,  0.16, 0.62),
    (-0.55, 2.4, -0.20, 0.50),
]
FPS      = 30

BODY_COL = (0.784, 0.714, 1.0, 1.0)      # c8b6ff
BODY_EM  = (0.416, 0.310, 0.839, 1.0)    # 6a4fd6
MEM_COL  = (0.937, 0.902, 1.0, 0.55)     # efe6ff at the game's opacity
MEM_EM   = (0.561, 0.416, 0.878, 1.0)    # 8f6ae0
SACK_COL = (1.0, 0.604, 0.180, 1.0)      # ff9a2e


def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def mat(name, col, emit, strength, alpha=1.0):
    """Principled + emission. The game reads baseColor, emissive and alpha out of the glTF
    and rebuilds them as a MeshStandardMaterial, so anything else here is decoration."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = 0.42
    b.inputs["Metallic"].default_value = 0.0
    # Blender 4.x renamed the emission socket; support both so this runs on either.
    for k in ("Emission Color", "Emission"):
        if k in b.inputs:
            b.inputs[k].default_value = emit
            break
    if "Emission Strength" in b.inputs:
        b.inputs["Emission Strength"].default_value = strength
    if alpha < 1.0:
        if "Alpha" in b.inputs:
            b.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
        m.use_backface_culling = False
    return m


def build_body():
    """A tapered spindle: fat a third of the way back, drawn out to a point at the nose and a
    stub at the tail. Made from a subdivided cylinder rather than a sphere so the wing roots
    have loops to attach to."""
    me = bpy.data.meshes.new(NAME)
    ob = bpy.data.objects.new(NAME, me)
    bpy.context.collection.objects.link(ob)

    bm = bmesh.new()
    RINGS, SEG = 15, 14
    verts = []
    for i in range(RINGS):
        t = i / (RINGS - 1)                       # 0 nose .. 1 tail
        z = BODY_L * (0.5 - t)
        # widest at t=0.34, a long taper forward and a shorter one aft
        prof = math.sin(min(1.0, t / 0.34) * math.pi * 0.5) if t < 0.34 else \
               math.cos((t - 0.34) / 0.66 * math.pi * 0.42)
        r = BODY_R * max(0.06, prof)
        ring = []
        for s in range(SEG):
            a = s / SEG * math.tau
            # flattened underside, domed back: it is a glider, not a sausage
            ry = r * (0.72 if math.sin(a) < 0 else 1.05)
            ring.append(bm.verts.new((math.cos(a) * r, math.sin(a) * ry, z)))
        verts.append(ring)
    for i in range(RINGS - 1):
        for s in range(SEG):
            s2 = (s + 1) % SEG
            bm.faces.new((verts[i][s], verts[i][s2], verts[i + 1][s2], verts[i + 1][s]))
    # cap both ends
    bm.faces.new(list(reversed(verts[0])))
    bm.faces.new(verts[-1])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()

    body_mat = mat("kitewing_body", BODY_COL, BODY_EM, 0.25)
    me.materials.append(body_mat)
    me.materials.append(mat("kitewing_membrane", MEM_COL, MEM_EM, 0.20, alpha=0.55))
    me.materials.append(mat("kitewing_sack", SACK_COL, SACK_COL, 0.9))
    for p in me.polygons:
        p.use_smooth = True
    return ob


def add_wings(ob):
    """Four membranes, each a flat quad fan swept back from a spar. Built into the same mesh
    so the whole creature is ONE skinned mesh -- the loader walks every skinned mesh it finds,
    but one is cheaper and makes the bounds measurement honest."""
    me = ob.data
    body_faces = len(me.polygons)
    bm = bmesh.new()
    bm.from_mesh(me)
    for sx in (1, -1):
        for (z0, span, sweep, chord) in WINGS:
            root = Vector((sx * BODY_R * 0.7, 0.02, z0))
            # a quad strip out along the span, chord narrowing and sweeping aft
            prev = None
            for i in range(6):
                t = i / 5
                x = root.x + sx * span * t
                z = root.z + sweep * span * t * t
                c = chord * (1.0 - 0.62 * t)
                y = root.y + math.sin(t * math.pi) * 0.10          # a little camber
                a = bm.verts.new((x, y, z + c * 0.5))
                b = bm.verts.new((x, y, z - c * 0.5))
                if prev:
                    bm.faces.new((prev[0], a, b, prev[1]))
                prev = (a, b)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    # Everything added after the body's own faces is membrane, so slot 1 from there on. The
    # count is taken before the wings go on rather than guessed at from geometry.
    for p in me.polygons[body_faces:]:
        p.material_index = 1
        p.use_smooth = False          # a taut membrane has creases; smoothing them reads as jelly
    return ob


def build_rig(ob):
    """root -> body -> four wing bones. One bone per wing is all a membrane needs: the flap is
    a rotation about the spar root, and the camber is in the mesh."""
    arm = bpy.data.armatures.new(NAME + "_arm")
    rig = bpy.data.objects.new(NAME + "_rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        b = arm.edit_bones.new(name)
        b.head, b.tail = Vector(head), Vector(tail)
        if parent:
            b.parent = parent
        return b

    root = bone("root", (0, 0, -BODY_L * 0.5), (0, 0, -BODY_L * 0.2))
    body = bone("body", (0, 0, -BODY_L * 0.2), (0, 0, BODY_L * 0.5), root)
    names = []
    for sx, side in ((1, "R"), (-1, "L")):
        for i, (z0, span, sweep, chord) in enumerate(WINGS):
            nm = "wing_%s%d" % (side, i + 1)
            bone(nm, (sx * BODY_R * 0.7, 0.02, z0),
                 (sx * (BODY_R * 0.7 + span), 0.02, z0 + sweep * span), body)
            names.append(nm)
    bpy.ops.object.mode_set(mode='OBJECT')

    ob.parent = rig
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')     # heat weights: fine for four wings
    return rig, names


def act(rig, name, frames, keys):
    """keys: {bone: [(frame, (rx,ry,rz)), ...]}  -- euler, radians, pose space."""
    rig.animation_data_create()
    a = bpy.data.actions.new(name)
    rig.animation_data.action = a
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
    for bone, seq in keys.items():
        pb = rig.pose.bones.get(bone)
        if not pb:
            continue
        for (f, rot) in seq:
            pb.rotation_euler = Euler(rot, 'XYZ')
            pb.keyframe_insert("rotation_euler", frame=f)
    for fc in a.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
    a.use_fake_user = True
    bpy.context.scene.frame_end = frames
    return a


def build_actions(rig, wings):
    fore = [w for w in wings if w.endswith("1")]
    aft = [w for w in wings if w.endswith("2")]

    def flap(names, amp, phase, frames):
        out = {}
        for n in names:
            s = 1 if n.startswith("wing_R") else -1
            seq = []
            for i in range(5):
                f = 1 + i * frames / 4
                ang = math.sin((i / 4 + phase) * math.tau) * amp
                seq.append((f, (0, 0, s * ang)))
            out[n] = seq
        return out

    # idle: a glide. The wings hold a shallow dihedral and breathe; the body rocks. Nothing
    # here travels, because stepRig blends idle out the moment the creature covers ground.
    k = flap(fore, 0.10, 0.0, 48)
    k.update(flap(aft, 0.08, 0.18, 48))
    k["body"] = [(1, (0.02, 0, 0)), (24, (-0.03, 0, 0)), (48, (0.02, 0, 0))]
    act(rig, "idle", 48, k)

    # walk_fwd: the flap. Fore and aft beat out of phase, which is what four wings do and what
    # stops it reading as one big pair. Deep, and the body pitches into each downstroke.
    k = flap(fore, 0.62, 0.0, 24)
    k.update(flap(aft, 0.48, 0.30, 24))
    k["body"] = [(1, (0.07, 0, 0)), (7, (-0.06, 0, 0)), (13, (0.07, 0, 0)),
                 (19, (-0.05, 0, 0)), (24, (0.07, 0, 0))]
    act(rig, "walk_fwd", 24, k)


def export(rig, ob):
    for o in bpy.data.objects:
        o.select_set(o in (rig, ob))
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        use_selection=True,
        export_animations=True,
        export_animation_mode='ACTIONS',    # one clip per action, named as the action
        export_apply=False,
        export_yup=True,                    # glTF is Y-up; the game assumes it
    )
    print("[kitewing] wrote", OUT)


def main():
    bpy.context.scene.render.fps = FPS
    wipe()
    ob = build_body()
    add_wings(ob)
    rig, wings = build_rig(ob)
    build_actions(rig, wings)
    export(rig, ob)


main()
