"""Variasi preset produksi Video jadi: tema border + teks brand (font, posisi, ukuran, lebar maks,
gaya 3D realistis / gaya baru, animasi) + intro/outro. Memakai mesin border/renderer auto-clipper.

Tidak mengubah settings.json maupun kode app: brand ditimpa di memori proses ini saja, project
sementara dibuat di folder kerja terpisah.

  python frame_variasi2.py preview <out_dir>         -> pratinjau placeholder (tanpa footage)
  python frame_variasi2.py render  <out_dir> <work>  -> render semua video di PLAN
"""
import copy, json, shutil, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
from app import config, storage  # noqa: E402
from app.services import border, frames, readymade, renderer  # noqa: E402

ASSETS = {1: r"E:\ASSET MENTAH\trending (1).mp4", 2: r"E:\ASSET MENTAH\trending (2).mp4"}
_ST = json.load(open(HERE / "text_styles.json", encoding="utf-8"))
STYLES = {s["id"]: s for s in _ST["styles"]}
FX_NONE = _ST["none"]


def V(aset, tema, tagline, board_font, font, pos, size, width, gaya, anim, anim_in, speed=2, amount=50,
      off=0, spacing=2, italic=False, intro=None, intro_font="Archivo Black", outro=True, outro_font="Archivo Black",
      outro_pos="bawah", bell="pojok"):
    return dict(locals())


# aset, tema border, tagline papan, font papan | teks brand: font, posisi, ukuran, lebar maks %, gaya, animasi, intro-teks
PLAN = [
    V(1, "Toxic Hijau Neon 1", "GAME HOT TERKINI", "Bebas Neue", "Audiowide", "top_in", 92, 80, "neon_tube", "flicker", "glitchin",
      intro="neon_glitch", intro_font="Audiowide", outro_font="Bebas Neue", outro_pos="bawah", bell="pojok"),
    V(1, "Cyberpunk 77", "UPDATE TERBARU SETIAP HARI", "Orbitron", "Orbitron", "top_in", 84, 70, "glitch", "glitch", "type", speed=3,
      intro="slam_impact", intro_font="Russo One", outro_font="Orbitron", outro_pos="tengah", bell="atas"),
    V(1, "Mewah Hitam Emas 1", "HIBURAN KELAS ATAS", "Cinzel", "Cinzel Decorative", "board", 110, 90, "gold_real", "shine", "letters",
      intro="gold_burst", intro_font="Cinzel Decorative", outro_font="Playfair Display SC", outro_pos="bawah", bell="atas"),
    V(1, "Esports Champion", "MOMEN PALING SERU", "Russo One", "Russo One", "top_in", 120, 92, "chrome_real", "pulse", "pop", amount=35,
      intro=None, outro_font="Russo One", outro_pos="bawah", bell="tanpa"),
    V(1, "Racing Merah Hitam 1", "JANGAN SAMPAI KETINGGALAN", "Kanit Black Italic", "Racing Sans One", "board", 104, 75, "ruby", "wobble", "slide",
      italic=True, intro="slam_impact", intro_font="Kanit Black Italic", outro_font="Racing Sans One", outro_pos="tengah", bell="pojok"),
    V(2, "Cyber Neon 2", "TONTON SAMPAI HABIS", "Zen Dots", "Zen Dots", "top_in", 78, 86, "holo", "wave", "assemble", spacing=8,
      intro="neon_glitch", intro_font="Zen Dots", outro_font="Audiowide", outro_pos="bawah", bell="atas"),
    V(2, "Royal Biru Emas 1", "SIMPAN DAN BAGIKAN", "Playfair Display SC", "Yeseva One", "board", 100, 82, "glitter", "shine", "pop",
      intro="gold_burst", intro_font="Yeseva One", outro=False),
    V(2, "Laut Toska 1", "SERU SETIAP HARI", "Luckiest Guy", "Luckiest Guy", "top_in", 126, 68, "jelly", "bounce", "letters", amount=60,
      intro=None, outro_font="Luckiest Guy", outro_pos="bawah", bell="pojok"),
    V(2, "Synthwave Retro 1", "IKUTI UNTUK UPDATE", "Audiowide", "Righteous", "top_in", 96, 60, "ombre", "float", "slide",
      intro="neon_glitch", intro_font="Righteous", outro_font="Righteous", outro_pos="tengah", bell="tanpa"),
    V(2, "Petir Badai 1", "HIBURAN TANPA HENTI", "Black Ops One", "Black Ops One", "top_in", 112, 95, "stone", "flicker", "type", speed=1.5,
      intro="slam_impact", intro_font="Black Ops One", outro_font="Black Ops One", outro_pos="bawah", bell="atas"),
]

BASE_SETTINGS = config.load_settings()
_brand = {}


def _patched_settings():
    s = copy.deepcopy(BASE_SETTINGS)
    s["brand"] = {**(s.get("brand") or {}), **copy.deepcopy(_brand)}
    return s


config.load_settings = _patched_settings  # hanya di proses ini


def theme_id(name):
    if name in border.THEMES:
        return name
    for f in frames.list_frames():
        if f.get("name") == name:
            return frames.PREFIX + f["id"]
    raise KeyError(f"Frame '{name}' tidak ditemukan")


def ratio_for(tid):
    fr = frames.get(tid[len(frames.PREFIX):]) if tid.startswith(frames.PREFIX) else None
    return readymade.auto_ratio(*fr["size"]) if fr else "9:16"


def use(v):
    base = BASE_SETTINGS.get("brand") or {}
    st = STYLES[v["gaya"]]
    bt = {**border.BRAND_TEXT_DEFAULT, "stroke": "", "strokeWidth": 0, **FX_NONE, **st["fx"],
          "enabled": True, "text": "{brand}", "position": v["pos"], "offset_y": v["off"], "width": v["width"],
          "font": v["font"], "size": v["size"], "bold": True, "italic": v["italic"], "uppercase": True,
          "letterSpacing": v["spacing"], "anim": v["anim"], "animIn": v["anim_in"],
          "animSpeed": v["speed"], "animAmount": v["amount"]}
    bump = copy.deepcopy(base.get("bumper") or {})
    bi, bo = bump.setdefault("intro", {}), bump.setdefault("outro", {})
    bi.update(enabled=bool(v["intro"]), font=v["intro_font"], tag_font=v["board_font"])
    if v["intro"]:
        bi["template"] = v["intro"]
        bi["vars"] = {"brand": "{brand}", "tagline": v["tagline"]}
    bo.update(enabled=bool(v["outro"]), font=v["outro_font"], tag_font=v["outro_font"])
    bo["vars"] = {**(bo.get("vars") or {}), "pos": v["outro_pos"], "bell": v["bell"]}
    _brand.clear()
    _brand.update(font=v["board_font"], label=v["tagline"], brand_text=bt, bumper=bump)


class Job:
    def set(self, **kw):
        if kw.get("stage"):
            print("   ", kw["stage"], flush=True)


def preview(out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    for i, v in enumerate(PLAN, 1):
        use(v)
        tid = theme_id(v["tema"])
        brand = {**_patched_settings()["brand"], "theme": tid}
        W, H = renderer.RATIOS[ratio_for(tid)]
        img, win, meta = border.draw(brand, v["tagline"], W // 2, H // 2, placeholder=True)
        img.save(out / f"{i:02d}.png")
        print(i, v["tema"], v["font"], v["pos"], v["gaya"], flush=True)


def render(out, work):
    out, work = Path(out), Path(work)
    out.mkdir(parents=True, exist_ok=True)
    config.PROJECTS_DIR = work
    work.mkdir(parents=True, exist_ok=True)
    only = [int(a.split("=")[1]) for a in sys.argv if a.startswith("--only=")]
    meta = []
    for i, v in enumerate(PLAN, 1):
        if only and i not in only:
            continue
        use(v)
        tid = theme_id(v["tema"])
        print(f"[{i}/{len(PLAN)}] aset {v['aset']} | {v['tema']} | {v['font']} {v['pos']} {v['gaya']} {v['anim']}/{v['anim_in']} | intro {v['intro']}", flush=True)
        p = storage.create(f"Variasi {i:02d}", "readymade", {"options": {"ratio": "auto", "theme": tid, "frame_title": v["tagline"]}})
        src = storage.project_dir(p["id"]) / "source.mp4"
        shutil.copy(ASSETS[v["aset"]], src)
        p["source_file"] = str(src); storage.save(p)
        readymade._prepare(Job(), p["id"], tid)
        rec = renderer.render(Job(), p["id"], "c1", ratio_for(tid), "mp4")
        slug = "".join(c if c.isalnum() else "_" for c in v["tema"]).strip("_")
        fname = f"{i:02d}_Aset{v['aset']}_{slug}.mp4"
        shutil.copy(storage.project_dir(p["id"]) / "exports" / rec["file"], out / fname)
        meta.append(dict(
            file=fname, aset=v["aset"], tema_border=v["tema"], papan=dict(teks=v["tagline"], font=v["board_font"]),
            teks_brand=dict(teks="KOPLO77", font=v["font"], posisi=v["pos"], ukuran=v["size"], lebar_maks=v["width"],
                            gaya=STYLES[v["gaya"]]["name"], animasi_jalan=v["anim"], animasi_masuk=v["anim_in"]),
            intro=v["intro"] or "tanpa", outro=("follow_cta" if v["outro"] else "tanpa")))
    json.dump(meta, open(out / "daftar_variasi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    {"preview": lambda: preview(sys.argv[2]), "render": lambda: render(sys.argv[2], sys.argv[3])}[sys.argv[1]]()
