"""Adegan horor 3D prosedural untuk Blender (dijalankan headless).

Lorong rumah tua: lantai basah, pintu kayu, lampu langit-langit berkedip, kabut volumetrik,
jendela bercahaya bulan di ujung, sosok kuntilanak sebagai siluet. Kamera dolly maju + goyang tangan.

Pakai:
  blender -b --factory-startup --python horror_corridor.py -- --out <folder> [--still] [--frames 150]
--still  : render satu frame tengah ke <folder>/still.png (cek komposisi)
default  : render animasi ke <folder>/frame_####.png
"""
import argparse
import math
import random
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--still", action="store_true")
ap.add_argument("--frames", type=int, default=150)
ap.add_argument("--samples", type=int, default=32)
ap.add_argument("--ghost", default="", help="PNG transparan sosok (billboard); kosong = sosok primitif")
ap.add_argument("--frame", type=int, default=0, help="frame untuk --still (0 = tengah)")
ap.add_argument("--start", type=int, default=0, help="render animasi mulai frame ini (cicil, 0 = 1)")
ap.add_argument("--end", type=int, default=0, help="render animasi sampai frame ini (0 = terakhir)")
args = ap.parse_args(argv)

random.seed(7)
W, H, FPS = 1080, 1920, 30
L = 20.0          # panjang lorong (meter)
HW = 1.25         # setengah lebar lorong
CH = 2.8          # tinggi plafon

# ---------------------------------------------------------------- reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def link(obj):
    scene.collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------- material
def node_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:  # Blender versi baru: selalu pakai node
        pass
    return m, m.node_tree.nodes, m.node_tree.links


def principled(m_nodes):
    return next(n for n in m_nodes if n.type == "BSDF_PRINCIPLED")


def grimy(name, base, dark, rough=0.85, scale=6.0, bump=0.25):
    """Permukaan kusam: warna dicampur noise (noda) + bump."""
    m, n, lk = node_mat(name)
    bsdf = principled(n)
    tc = n.new("ShaderNodeTexCoord")
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 12.0
    ramp = n.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].color = (*base, 1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[1].position = 0.7
    bmp = n.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump
    lk.new(tc.outputs["Object"], noise.inputs["Vector"])
    lk.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    lk.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    lk.new(noise.outputs["Fac"], bmp.inputs["Height"])
    lk.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = rough
    return m


def wet_floor():
    """Lantai ubin basah: genangan (roughness rendah) acak lewat noise."""
    m, n, lk = node_mat("lantai")
    bsdf = principled(n)
    tc = n.new("ShaderNodeTexCoord")
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 3.0
    rr = n.new("ShaderNodeMapRange")
    rr.inputs["From Min"].default_value = 0.45
    rr.inputs["From Max"].default_value = 0.6
    rr.inputs["To Min"].default_value = 0.08
    rr.inputs["To Max"].default_value = 0.7
    lk.new(tc.outputs["Object"], noise.inputs["Vector"])
    lk.new(noise.outputs["Fac"], rr.inputs["Value"])
    lk.new(rr.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Base Color"].default_value = (0.05, 0.05, 0.045, 1)
    return m


def flat(name, color, rough=0.6, emit=None, strength=0.0):
    m, n, _ = node_mat(name)
    bsdf = principled(n)
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = rough
    if emit:
        key = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
        bsdf.inputs[key].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


M_WALL = grimy("dinding", (0.42, 0.40, 0.33), (0.13, 0.12, 0.09), scale=4.0)
M_CEIL = grimy("plafon", (0.35, 0.34, 0.30), (0.10, 0.10, 0.08), scale=3.0)
M_DOOR = grimy("pintu", (0.16, 0.09, 0.05), (0.05, 0.03, 0.02), rough=0.7, scale=18.0, bump=0.4)
M_FLOOR = wet_floor()
M_DRESS = flat("gaun", (0.75, 0.75, 0.72), rough=0.9)
M_SKIN = flat("kulit", (0.55, 0.52, 0.48), rough=0.6)
M_HAIR = flat("rambut", (0.005, 0.005, 0.005), rough=0.4)
M_LAMP = flat("lampu", (1, 0.9, 0.7), emit=(1.0, 0.82, 0.55), strength=6.0)
M_GLASS = flat("jendela", (0.2, 0.3, 0.5), emit=(0.35, 0.5, 0.9), strength=3.5)


# ---------------------------------------------------------------- geometri
def box(name, loc, size, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.data.materials.append(mat)
    return o


# dibuat sedikit lebih panjang/tebal dari dinding ujung supaya sambungan tidak bocor cahaya
box("lantai", (0, L / 2, -0.1), (HW * 2 + 0.6, L + 1.0, 0.2), M_FLOOR)
box("plafon", (0, L / 2, CH + 0.1), (HW * 2 + 0.6, L + 1.0, 0.2), M_CEIL)
box("dinding_kiri", (-HW - 0.1, L / 2, CH / 2), (0.2, L + 1.0, CH + 0.4), M_WALL)
box("dinding_kanan", (HW + 0.1, L / 2, CH / 2), (0.2, L + 1.0, CH + 0.4), M_WALL)
# dinding ujung dengan lubang jendela (4 balok di sekeliling jendela)
yE = L
box("ujung_bawah", (0, yE, 0.5), (HW * 2 + 0.4, 0.2, 1.3), M_WALL)
box("ujung_atas", (0, yE, 2.5), (HW * 2 + 0.4, 0.2, 1.0), M_WALL)
box("ujung_kiri", (-0.9, yE, 1.6), (0.95, 0.2, 1.2), M_WALL)
box("ujung_kanan", (0.9, yE, 1.6), (0.95, 0.2, 1.2), M_WALL)
box("kaca", (0, yE + 0.11, 1.6), (0.9, 0.02, 1.0), M_GLASS)
for k, x in enumerate((-0.15, 0.15)):  # teralis jendela
    box(f"teralis{k}", (x, yE - 0.02, 1.6), (0.03, 0.03, 1.0), M_DOOR)
box("teralis_h", (0, yE - 0.02, 1.6), (0.9, 0.03, 0.03), M_DOOR)

# pintu-pintu kayu di kedua sisi
for i, y in enumerate((3.0, 6.5, 10.0, 13.5)):
    for side in (-1, 1):
        x = side * (HW - 0.02)
        box(f"kusen_{i}_{side}", (x, y, 1.05), (0.06, 1.0, 2.2), M_DOOR)
        if (i, side) == (2, 1):  # satu pintu sedikit terbuka -> celah gelap
            box(f"celah_{i}", (x - side * 0.01, y + 0.42, 1.0), (0.05, 0.08, 2.0), M_HAIR)

# lampu plafon + cahaya titik
lamps, lamp_emit = [], []
for i, y in enumerate((2.5, 7.5, 12.2, 17.0)):
    mat_i = M_LAMP.copy()  # material sendiri per lampu: emisinya ikut kedip/padam bersama cahayanya
    box(f"rumah_lampu{i}", (0, y, CH - 0.04), (0.5, 0.18, 0.06), mat_i)
    lamp_emit.append(principled(mat_i.node_tree.nodes).inputs["Emission Strength"])
    ld = bpy.data.lights.new(f"lampu{i}", "SPOT")  # sorot ke bawah: kerucut cahaya terlihat di kabut
    ld.color = (1.0, 0.78, 0.5)
    ld.shadow_soft_size = 0.15
    ld.spot_size = math.radians(80)
    ld.spot_blend = 0.45
    lo = link(bpy.data.objects.new(f"lampu{i}", ld))
    lo.location = (0, y, CH - 0.12)
    lamps.append((lo, ld))
# kekuatan dasar tiap lampu: depan redup, satu mati, ujung berkedip
BASE = [90.0, 50.0, 260.0, 25.0]  # lampu ke-3 (di atas sosok) berkedip

# cahaya bulan dari jendela (area light di balik jendela, mengarah ke dalam lorong)
moon = bpy.data.lights.new("bulan", "AREA")
moon.color = (0.45, 0.6, 1.0)
moon.energy = 4000
moon.size = 1.2
mo = link(bpy.data.objects.new("bulan", moon))
mo.location = (0, L + 0.6, 1.7)
mo.rotation_euler = (math.radians(90), 0, math.radians(180))


# ---------------------------------------------------------------- sosok
def prim(kind, name, loc, mat, **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(location=loc, **kw)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    bpy.ops.object.shade_smooth()
    return o


FY = 12.2       # sosok berdiri di bawah lampu yang berkedip
FY_NEAR = 7.3   # setelah lampu padam: sosok tiba-tiba sudah dekat (di bawah lampu ke-2)
ghost, ghost_emit = None, None
if args.ghost:
    # Billboard: foto AI kuntilanak (latar transparan) di bidang tegak menghadap kamera.
    # Diterangi lewat emisi yang ikut kedip lampu di atasnya (bidang tegak tidak kena lampu sorot dari atas).
    img = bpy.data.images.load(args.ghost)
    gh = 1.62
    gw = gh * img.size[0] / img.size[1]
    m, nn, lk = node_mat("kuntilanak")
    bsdf = principled(nn)
    tex = nn.new("ShaderNodeTexImage")
    tex.image = img
    lk.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    lk.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    ekey = "Emission Color" if "Emission Color" in bsdf.inputs else "Emission"
    lk.new(tex.outputs["Color"], bsdf.inputs[ekey])
    bsdf.inputs["Roughness"].default_value = 0.85
    ghost_emit = bsdf.inputs["Emission Strength"]
    for attr, val in (("surface_render_method", "DITHERED"), ("blend_method", "HASHED")):
        try:
            setattr(m, attr, val)
        except Exception:
            pass
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, FY, gh / 2), rotation=(math.radians(90), 0, 0))
    ghost = bpy.context.active_object
    ghost.name = "kuntilanak"
    ghost.scale = (gw, gh, 1)
    ghost.data.materials.append(m)
else:
    prim("cone", "gaun", (0, FY, 0.68), M_DRESS, radius1=0.34, radius2=0.14, depth=1.36, vertices=48)
    prim("cylinder", "badan", (0, FY, 1.45), M_DRESS, radius=0.15, depth=0.4, vertices=32)
    prim("uv_sphere", "kepala", (0, FY, 1.78), M_SKIN, radius=0.11, segments=32, ring_count=16)
    # rambut panjang menutupi wajah (depan & belakang) — menghadap kamera (arah -Y)
    h1 = prim("cube", "rambut_depan", (0, FY - 0.1, 1.5), M_HAIR, size=1)
    h1.scale = (0.24, 0.03, 0.62)
    h2 = prim("cube", "rambut_belakang", (0, FY + 0.06, 1.45), M_HAIR, size=1)
    h2.scale = (0.28, 0.06, 0.75)
    for side in (-1, 1):  # lengan menggantung
        a = prim("cylinder", f"lengan{side}", (side * 0.21, FY, 1.22), M_SKIN, radius=0.032, depth=0.62)
        a.rotation_euler = (0, math.radians(side * 4), 0)

# ---------------------------------------------------------------- kabut volumetrik
world = bpy.data.worlds.new("dunia")
scene.world = world
try:
    world.use_nodes = True
except Exception:
    pass
wn, wl = world.node_tree.nodes, world.node_tree.links
bg = next((n for n in wn if n.type == "BACKGROUND"), None) or wn.new("ShaderNodeBackground")
bg.inputs["Color"].default_value = (0.002, 0.003, 0.006, 1)
vol = wn.new("ShaderNodeVolumePrincipled")
vol.inputs["Density"].default_value = 0.045
vol.inputs["Color"].default_value = (0.75, 0.8, 0.9, 1)
vol.inputs["Anisotropy"].default_value = 0.35
out = next(n for n in wn if n.type == "OUTPUT_WORLD")
wl.new(vol.outputs["Volume"], out.inputs["Volume"])

# ---------------------------------------------------------------- kamera
cam_d = bpy.data.cameras.new("kamera")
cam_d.lens = 24
cam_d.dof.use_dof = True
cam_d.dof.focus_distance = FY - 2.0
cam_d.dof.aperture_fstop = 2.8
cam = link(bpy.data.objects.new("kamera", cam_d))
scene.camera = cam

N = args.frames
# lampu padam total di sekitar 78-84% durasi; tanpa billboard sosok tetap di tempat (fase "near" hanya lampu)
BLACKOUT = (int(N * 0.78), int(N * 0.84)) if args.ghost else (N + 1, N + 1)
scene.frame_start, scene.frame_end = 1, N
scene.render.fps = FPS
for f in range(1, N + 1):
    t = (f - 1) / max(1, N - 1)
    e = t * t * (3 - 2 * t)
    y = 0.8 + 3.6 * e                                  # dolly maju pelan
    sway = 0.012 * math.sin(f * 0.21) + 0.006 * math.sin(f * 0.53)
    bob = 0.010 * math.sin(f * 0.42)                   # langkah
    cam.location = (sway, y, 1.58 + bob)
    cam.rotation_euler = (math.radians(88 + 0.6 * math.sin(f * 0.17)),
                          math.radians(0.8 * math.sin(f * 0.11)),
                          math.radians(0.7 * math.sin(f * 0.13)))
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)

    # Alur: sosok jauh di bawah lampu berkedip -> semua lampu padam sejenak -> sosok sudah dekat.
    phase = "far" if f < BLACKOUT[0] else ("dark" if f <= BLACKOUT[1] else "near")
    gy = FY if phase != "near" else FY_NEAR
    cam_d.dof.focus_distance = max(0.5, gy - y)
    cam_d.dof.keyframe_insert("focus_distance", frame=f)
    flick = 1.0 if (math.sin(f * 1.7) + math.sin(f * 0.37) > -0.4 and random.random() > 0.12) else 0.05
    for i, (lo, ld) in enumerate(lamps):
        base = BASE[i]
        if phase == "dark":
            ld.energy = 0.0
        elif i == 2:
            ld.energy = base * flick if phase == "far" else 0.0   # setelah padam, lampu jauh mati
        elif i == 1 and phase == "near":
            ld.energy = 180.0 * (0.75 + 0.25 * random.random())   # lampu dekat menyala, sosok di bawahnya
        elif i == 0:
            ld.energy = base * (0.85 + 0.15 * random.random()) * (0.4 if phase == "near" else 1.0)
        else:
            ld.energy = base
        ld.keyframe_insert("energy", frame=f)
        lamp_emit[i].default_value = 6.0 * min(1.5, ld.energy / max(BASE[i], 1.0)) if BASE[i] > 0 else 0.0
        lamp_emit[i].keyframe_insert("default_value", frame=f)
    if ghost:
        ghost.location = (0.01 * math.sin(f * 0.07), gy, ghost.location.z)
        ghost.rotation_euler = (math.radians(90), 0, math.radians(1.2 * math.sin(f * 0.05)))
        ghost.keyframe_insert("location", frame=f)
        ghost.keyframe_insert("rotation_euler", frame=f)
        lit = {"far": 0.5 * flick, "dark": 0.0, "near": 0.24}[phase]
        ghost_emit.default_value = lit
        ghost_emit.keyframe_insert("default_value", frame=f)

# ---------------------------------------------------------------- render
r = scene.render
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
r.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
ee = scene.eevee
for attr, val in (("taa_render_samples", args.samples), ("use_raytracing", True),
                  ("volumetric_tile_size", "2"), ("volumetric_samples", 96),
                  ("use_volumetric_shadows", True), ("use_shadows", True)):
    try:
        setattr(ee, attr, val)
    except Exception:
        pass
r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
r.image_settings.file_format = "PNG"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
except Exception:
    pass
scene.view_settings.exposure = 0.4

if args.still:
    scene.frame_set(args.frame or N // 2)
    r.filepath = f"{args.out}/still.png"
    bpy.ops.render.render(write_still=True)
else:
    r.filepath = f"{args.out}/frame_"
    # Render dicicil per rentang + frame yang sudah ada dilewati: laptop mati di tengah tidak mengulang dari awal
    scene.frame_start = max(1, args.start or 1)
    scene.frame_end = min(N, args.end or N)
    r.use_overwrite = False
    r.use_placeholder = False
    bpy.ops.render.render(animation=True)
print("SELESAI", r.engine)
