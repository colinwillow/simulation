# Plutopia buildings — procedural alien structures and creature huts, built in Blender.
#
# HOW TO RUN THIS. No terminal, nothing to install.
#   1. Blender > Scripting tab > New
#   2. Paste this whole file in
#   3. Press Run (the play triangle)
# It builds three buildings, leaves them standing side by side in the scene so you can look
# at them, and writes three .glb files to ~/Desktop/Plutopia -- it prints that folder in the
# console when it finishes.
#
# Change SEED below and press Run again for a different building of each kind. A village is
# one number changed a few times, not one model placed twenty times.
#
# To put one in the game: drop the .glb into the repo's models/ folder the way you added the
# drone and the blaster, and tell me the filename. Placing it is my end.
#
# WHAT THE GAME DOES WITH THESE, so the proportions here are the only thing that matters:
#   placeProp(url, x, z, yaw, H) loads the file, measures its bounding box, and scales it so
#   its HEIGHT is H world units, then sits box.min.y on the ground and turns it by yaw. So:
#     * build in any units. Only the ratios survive. (alien_building_01 is placed at H = 8.)
#     * put the FRONT on +Z. yaw is what aims it, and a door facing a random way is a door
#       that ends up in a hillside.
#     * keep the base flat and near y = 0. The ground follows the terrain normal at up to .75
#       blend, so a building with a spike under it will hover on a slope.
#   Materials come across as baseColor / emissive / alpha and are rebuilt as
#   MeshStandardMaterial. Emissive is how anything glows at night -- the game has no light to
#   spare for a hut, so lit windows have to be emission, not lamps.
#
# PALETTE, read out of index.html rather than invented:
#   stone   #7c7a78 / #565452   rough, the structural material (P.rock, P.rock2)
#   shell   #6c6862            (M.stone2)
#   hull    #5b3f2e            (P.hull, the ship's own timber-dark)
#   lantern #ff9a2e            emissive, every warm light in the game
#   lit     #8ff0d8 / #b78cff  the cool alien emissives (net knots, spore light)

import bpy, bmesh, math, os, sys, random
from mathutils import Vector

# ---------------------------------------------------------------- config
SEED = 3                 # change and re-run for a different building of each kind
OUTDIR = None            # None -> ~/Desktop/Plutopia. Set a path to write somewhere else.

STONE = (0.486, 0.478, 0.471, 1.0)   # 7c7a78
STONE2 = (0.337, 0.325, 0.322, 1.0)  # 565452
SHELL = (0.424, 0.408, 0.384, 1.0)   # 6c6862
HULL = (0.357, 0.247, 0.180, 1.0)    # 5b3f2e
WARM = (1.0, 0.604, 0.180, 1.0)      # ff9a2e
COOL = (0.561, 0.941, 0.847, 1.0)    # 8ff0d8
VIOL = (0.718, 0.549, 1.0, 1.0)      # b78cff


def out_path(name):
    # Somewhere findable, every time. Run from the Scripting tab there is no .blend file and
    # the working directory is wherever the app was launched from -- on a Mac, inside the
    # application bundle. A file written there is a file that is gone.
    d = OUTDIR or os.path.join(os.path.expanduser("~"), "Desktop", "Plutopia")
    d = os.path.abspath(d)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name + ".glb")


def wipe():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.objects):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def mat(name, col, emit=None, strength=0.0, rough=0.9, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = col
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    if emit:
        # Blender 4.x renamed the socket. Support both so this runs wherever it is opened.
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


def new_mesh(name):
    me = bpy.data.meshes.new(name)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def revolve(bm, profile, seg=24, gap=None, ripple=0.0, ripple_n=9, twist=0.0):
    """Turn a (radius, height) profile into a shell.

    `gap` is (start, end) in radians -- an angular wedge that is simply not built, which is
    how the doorways here are made. A boolean would be the obvious way and is the wrong one:
    booleans in a generator script fail silently on the one seed you did not test, and an
    arch that is a hole in the topology from the start cannot fail at all.

    `ripple` scallops the radius around the axis, which is what makes these read as woven or
    segmented rather than as turned pottery."""
    rings = []
    for (r, h) in profile:
        ring = []
        for s in range(seg):
            a = s / seg * math.tau
            if gap and gap[0] <= a <= gap[1]:
                ring.append(None)
                continue
            rr = r * (1.0 + math.sin(a * ripple_n + h * twist) * ripple)
            ring.append(bm.verts.new((math.cos(a) * rr, h, math.sin(a) * rr)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for s in range(seg):
            s2 = (s + 1) % seg
            q = (rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s])
            if all(v is not None for v in q):
                try:
                    bm.faces.new(q)
                except ValueError:
                    pass
    return rings


def cap(bm, ring):
    vs = [v for v in ring if v is not None]
    if len(vs) > 2:
        try:
            bm.faces.new(vs)
        except ValueError:
            pass


def blob(bm, cx, cy, cz, rx, ry, rz, seg=12, rings=8):
    """A squashed sphere. The pods, the bulbs and the roof knuckles are all this."""
    grid = []
    for j in range(rings + 1):
        v = j / rings * math.pi
        row = []
        for s in range(seg):
            u = s / seg * math.tau
            row.append(bm.verts.new((cx + math.sin(v) * math.cos(u) * rx,
                                     cy + math.cos(v) * ry,
                                     cz + math.sin(v) * math.sin(u) * rz)))
        grid.append(row)
    for j in range(rings):
        for s in range(seg):
            s2 = (s + 1) % seg
            try:
                bm.faces.new((grid[j][s], grid[j][s2], grid[j + 1][s2], grid[j + 1][s]))
            except ValueError:
                pass
    return grid


def tube(bm, a, b, r, seg=8):
    """A bridge between two points -- the walkways between pods, the chimney flue."""
    a, b = Vector(a), Vector(b)
    d = (b - a)
    L = d.length
    if L < 1e-5:
        return
    d.normalize()
    up = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
    x = d.cross(up).normalized()
    y = d.cross(x).normalized()
    rings = []
    for t in (0.0, 1.0):
        c = a + d * (L * t)
        rings.append([bm.verts.new(c + x * (math.cos(k / seg * math.tau) * r)
                                   + y * (math.sin(k / seg * math.tau) * r)) for k in range(seg)])
    for s in range(seg):
        s2 = (s + 1) % seg
        try:
            bm.faces.new((rings[0][s], rings[0][s2], rings[1][s2], rings[1][s]))
        except ValueError:
            pass


def finish(ob, mats, solid=0.0, smooth=True):
    for m in mats:
        ob.data.materials.append(m)
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    if solid > 0:
        md = ob.modifiers.new("Solidify", 'SOLIDIFY')
        md.thickness = solid
        md.offset = -1
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=md.name)
    return ob


def mark(ob, faces_from, slot):
    for p in ob.data.polygons[faces_from:]:
        p.material_index = slot


def export(name, objs):
    for o in bpy.data.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    path = out_path(name)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB',
                              use_selection=True, export_animations=False, export_yup=True)
    print("[buildings] wrote", path)


# ---------------------------------------------------------------- the buildings

def build_hut(rng):
    """A creature hut. A low woven dome with a deep arched mouth on +Z, a lopsided flue, and
    a scatter of lit pods pushed into the shell. Nothing about it is square, because nothing
    that made it had a straight edge to work with."""
    ob = new_mesh("hut")
    bm = bmesh.new()

    H = 2.9 + rng.uniform(-0.3, 0.5)
    R = 2.1 + rng.uniform(-0.2, 0.35)
    # A dome that overhangs slightly at the shoulder -- the widest ring is not the bottom one,
    # which is what stops it reading as a bowl.
    prof = []
    N = 14
    for i in range(N + 1):
        t = i / N
        y = H * t
        r = R * math.cos(t * math.pi * 0.46) * (1.0 + 0.14 * math.sin(t * math.pi))
        prof.append((max(0.05, r), y))
    door = 0.42 + rng.uniform(-0.05, 0.08)          # half-width of the mouth, radians
    # The mouth is only cut through the LOWER rings; above them the dome closes over again,
    # and the boundary between the two is the arch. Centred on +Z, which is where placeProp's
    # yaw points the front -- a door facing a random way ends up in a hillside.
    arch = 5
    lo = prof[:arch]
    hi = prof[arch - 1:]
    revolve(bm, lo, seg=30, gap=(math.pi / 2 - door, math.pi / 2 + door),
            ripple=0.045, ripple_n=11, twist=1.6)
    top = revolve(bm, hi, seg=30, ripple=0.045, ripple_n=11, twist=1.6)
    cap(bm, top[-1])

    body_faces = len(bm.faces)
    # the flue: a leaning stack off the shoulder, with a flared lip
    fx, fz = math.cos(2.4) * R * 0.55, math.sin(2.4) * R * 0.55
    tube(bm, (fx, H * 0.72, fz), (fx * 1.5, H * 1.42, fz * 1.5), 0.19, seg=9)
    blob(bm, fx * 1.5, H * 1.42, fz * 1.5, 0.3, 0.16, 0.3, seg=10, rings=5)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()

    # lit pods, pressed into the shell where they will read against the dark
    bm2 = bmesh.new()
    for _ in range(4 + rng.randrange(3)):
        a = rng.uniform(0, math.tau)
        t = rng.uniform(0.35, 0.8)
        r = R * math.cos(t * math.pi * 0.46) * 0.96
        blob(bm2, math.cos(a) * r, H * t, math.sin(a) * r,
             0.17, 0.2, 0.17, seg=9, rings=5)
    pods = new_mesh("hut_pods")
    bm2.normal_update()
    bm2.to_mesh(pods.data)
    bm2.free()

    finish(ob, [mat("hut_shell", SHELL, rough=0.95),
                mat("hut_dark", STONE2, rough=0.97)], solid=0.07)
    finish(pods, [mat("hut_lit", WARM, WARM, 2.2, rough=0.4)])
    return [ob, pods]


def build_spire(rng):
    """An alien tower: bulbous segments stacked and shrinking, each leaning a little off the
    last, with a lit collar at every joint. Read tall -- placeProp will size it, but the
    ratios have to say tower or it arrives as a bollard."""
    ob = new_mesh("spire")
    bm = bmesh.new()
    segs = 4 + rng.randrange(2)
    y = 0.0
    lean_x = lean_z = 0.0
    collars = []
    for i in range(segs):
        t = i / max(1, segs - 1)
        r = 1.9 * (1.0 - 0.62 * t) + rng.uniform(-0.08, 0.08)
        h = 2.6 * (1.0 - 0.28 * t)
        prof = []
        N = 9
        for j in range(N + 1):
            u = j / N
            # each segment bulges in the middle and pinches at both ends
            rr = r * (0.72 + 0.42 * math.sin(u * math.pi))
            prof.append((rr, y + h * u))
        rings = revolve(bm, [(p[0], p[1]) for p in prof], seg=26,
                        ripple=0.05, ripple_n=7 + i, twist=0.9)
        # nudge the whole segment sideways so the stack leans and wanders
        lean_x += rng.uniform(-0.16, 0.16) * (1 + t)
        lean_z += rng.uniform(-0.16, 0.16) * (1 + t)
        for ring in rings:
            for v in ring:
                if v:
                    v.co.x += lean_x * ((v.co.y - y) / max(0.01, h))
                    v.co.z += lean_z * ((v.co.y - y) / max(0.01, h))
        collars.append((lean_x, y + h, lean_z, r * 0.78))
        y += h * 0.94
    cap(bm, rings[-1])
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()

    lit = new_mesh("spire_lit")
    bm2 = bmesh.new()
    for (cx, cy, cz, r) in collars:
        n = 7
        for k in range(n):
            a = k / n * math.tau
            blob(bm2, cx + math.cos(a) * r, cy, cz + math.sin(a) * r, 0.13, 0.13, 0.13, seg=8, rings=4)
    bm2.normal_update()
    bm2.to_mesh(lit.data)
    bm2.free()

    finish(ob, [mat("spire_shell", STONE, rough=0.92)], solid=0.09)
    finish(lit, [mat("spire_lit", COOL, COOL, 2.6, rough=0.3)])
    return [ob, lit]


def build_pods(rng):
    """A cluster: three or four fused chambers of different sizes on stubby legs, bridged by
    tubes. The one that should end up in groups -- a settlement rather than a landmark."""
    ob = new_mesh("podhouse")
    bm = bmesh.new()
    n = 3 + rng.randrange(2)
    centres = []
    for i in range(n):
        a = i / n * math.tau + rng.uniform(-0.3, 0.3)
        d = 1.5 + rng.uniform(0, 0.9) if i else 0.0
        r = (1.5 if i == 0 else 1.0 + rng.uniform(-0.2, 0.45))
        cx, cz = math.cos(a) * d, math.sin(a) * d
        cy = r * 1.15 + rng.uniform(0, 0.5)
        blob(bm, cx, cy, cz, r, r * 1.12, r, seg=16, rings=10)
        centres.append((cx, cy, cz, r))
        # legs
        for k in range(3):
            b = k / 3 * math.tau + a
            tube(bm, (cx + math.cos(b) * r * 0.6, cy - r * 0.6, cz + math.sin(b) * r * 0.6),
                 (cx + math.cos(b) * r * 0.85, 0.0, cz + math.sin(b) * r * 0.85), 0.11, seg=7)
    for i in range(1, len(centres)):
        a, b = centres[0], centres[i]
        tube(bm, (a[0], a[1], a[2]), (b[0], b[1], b[2]), 0.26, seg=9)
    bm.normal_update()
    bm.to_mesh(ob.data)
    bm.free()

    lit = new_mesh("podhouse_lit")
    bm2 = bmesh.new()
    for (cx, cy, cz, r) in centres:
        for _ in range(3):
            a, v = rng.uniform(0, math.tau), rng.uniform(0.2, 0.9)
            blob(bm2, cx + math.cos(a) * r * math.sin(v) * 0.98,
                 cy + math.cos(v) * r * 1.05,
                 cz + math.sin(a) * r * math.sin(v) * 0.98, 0.15, 0.11, 0.15, seg=8, rings=4)
    bm2.normal_update()
    bm2.to_mesh(lit.data)
    bm2.free()

    finish(ob, [mat("pod_shell", HULL, rough=0.88)], solid=0.0)
    finish(lit, [mat("pod_lit", VIOL, VIOL, 2.4, rough=0.3)])
    return [ob, lit]


TYPES = {"hut": build_hut, "spire": build_spire, "podhouse": build_pods}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = None
    seed = SEED
    for i, a in enumerate(argv):
        if a == "--only" and i + 1 < len(argv):
            only = argv[i + 1]
        if a == "--seed" and i + 1 < len(argv):
            seed = int(argv[i + 1])
    wipe()
    x = 0.0
    for name, fn in TYPES.items():
        if only and name != only:
            continue
        objs = fn(random.Random(seed + abs(hash(name)) % 1000))
        export(name, objs)
        # Shuffle each aside so all three end up standing side by side in the scene rather
        # than the last one alone on top of the others.
        for o in objs:
            o.location.x += x
        x += 9.0
    for o in bpy.data.objects:
        o.select_set(False)
    print("=" * 60)
    print("  DONE. Files are in:  " + os.path.dirname(out_path("x")))
    print("=" * 60)


main()
