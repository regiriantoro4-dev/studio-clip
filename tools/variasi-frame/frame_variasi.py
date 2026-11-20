"""Variasi tema frame + font untuk aset mentah, memakai mesin border auto-clipper (sama dengan panel Video jadi).

Tidak mengubah settings.json maupun kode app: brand (font, tagline) ditimpa di memori proses ini saja,
dan project sementara dibuat di folder kerja terpisah (bukan backend/data/projects).

  python frame_variasi.py preview <out_dir>         -> pratinjau bingkai dengan placeholder (tanpa footage)
  python frame_variasi.py render  <out_dir> <work>  -> render 10 video ke out_dir
"""
import copy, json, shutil, sys, time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))
from app import config, storage  # noqa: E402
from app.services import border, frames, media, readymade, renderer  # noqa: E402

ASSETS = {1: r"E:\ASSET MENTAH\trending (1).mp4", 2: r"E:\ASSET MENTAH\trending (2).mp4"}

# (aset, nama frame / tema bawaan, font, tagline)
PLAN = [
    (1, "Toxic Hijau Neon 1", "Bebas Neue", "GAME HOT TERKINI"),
    (1, "Cyberpunk 77", "Orbitron", "UPDATE TERBARU SETIAP HARI"),
    (1, "Mewah Hitam Emas 1", "Cinzel", "HIBURAN KELAS ATAS"),
    (1, "Esports Champion", "Russo One", "MOMEN PALING SERU"),
    (1, "Racing Merah Hitam 1", "Kanit Black Italic", "JANGAN SAMPAI KETINGGALAN"),
    (2, "Cyber Neon 2", "Zen Dots", "TONTON SAMPAI HABIS"),
    (2, "Royal Biru Emas 1", "Playfair Display SC", "SIMPAN DAN BAGIKAN"),
    (2, "Laut Toska 1", "Luckiest Guy", "SERU SETIAP HARI"),
    (2, "Synthwave Retro 1", "Audiowide", "IKUTI UNTUK UPDATE"),
    (2, "Petir Badai 1", "Black Ops One", "HIBURAN TANPA HENTI"),
]

BASE_SETTINGS = config.load_settings()
_brand = {}


def _patched_settings():
    s = copy.deepcopy(BASE_SETTINGS)
    s["brand"] = {**(s.get("brand") or {}), **_brand}
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


def use(font, tagline):
    _brand.clear()
    _brand.update(font=font, label=tagline, theme="neon")


class Job:
    def set(self, **kw):
        if kw.get("stage"):
            print("   ", kw["stage"], flush=True)


def preview(out):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    for i, (aset, name, font, tag) in enumerate(PLAN, 1):
        use(font, tag)
        tid = theme_id(name)
        brand = {**_patched_settings()["brand"], "theme": tid}
        W, H = renderer.RATIOS[ratio_for(tid)]
        img, win, meta = border.draw(brand, tag, W // 2, H // 2, placeholder=True)
        img.save(out / f"{i:02d}.png")
        print(i, name, font, tid, ratio_for(tid), win, meta.get("title"))


def render(out, work):
    out, work = Path(out), Path(work)
    out.mkdir(parents=True, exist_ok=True)
    config.PROJECTS_DIR = work
    work.mkdir(parents=True, exist_ok=True)
    meta = []
    for i, (aset, name, font, tag) in enumerate(PLAN, 1):
        use(font, tag)
        tid = theme_id(name)
        print(f"[{i}/10] aset {aset} | {name} | {font} | {tag}", flush=True)
        p = storage.create(f"Variasi {i:02d}", "readymade", {"options": {"ratio": "auto", "theme": tid, "frame_title": tag}})
        src = storage.project_dir(p["id"]) / "source.mp4"
        shutil.copy(ASSETS[aset], src)
        p["source_file"] = str(src); storage.save(p)
        readymade._prepare(Job(), p["id"], tid)
        rec = renderer.render(Job(), p["id"], "c1", ratio_for(tid), "mp4")
        slug = "".join(c if c.isalnum() else "_" for c in name).strip("_")
        fname = f"{i:02d}_Aset{aset}_{slug}.mp4"
        shutil.copy(storage.project_dir(p["id"]) / "exports" / rec["file"], out / fname)
        meta.append(dict(file=fname, aset=aset, tema_frame=name, font=font, teks_papan=f"KOPLO77 / {tag}",
                         rasio=ratio_for(tid)))
    json.dump(meta, open(out / "daftar_variasi.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)


if __name__ == "__main__":
    {"preview": lambda: preview(sys.argv[2]), "render": lambda: render(sys.argv[2], sys.argv[3])}[sys.argv[1]]()
