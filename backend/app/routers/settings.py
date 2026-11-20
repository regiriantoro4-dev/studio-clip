"""Endpoint pengaturan provider AI & watermark. Tersimpan lokal di data/settings.json."""
import shutil
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from .. import config
from ..services import border, frames
from ..services.renderer import RATIOS

router = APIRouter(prefix="/api")

ALLOWED_IMG = {".png", ".jpg", ".jpeg", ".webp"}


MASK_MARK = "…"  # API key yang dikirim ke browser selalu disamarkan, mis. "gsk_…a1b2"


def _mask(key: str) -> str:
    key = key or ""
    if not key:
        return ""
    return f"{key[:4]}{MASK_MARK}{key[-4:]}" if len(key) > 12 else MASK_MARK * 4


def _public(s: dict) -> dict:
    """Pengaturan untuk browser: API key disamarkan (key asli tidak pernah keluar dari server)."""
    out = {**s, "providers": {}}
    for name, cfg in (s.get("providers") or {}).items():
        out["providers"][name] = {**cfg, "api_key": _mask(cfg.get("api_key", "")),
                                  "has_key": bool(cfg.get("api_key"))}
    return out


# Path program yang dijalankan server (cmd /c, subprocess) — hanya bisa diubah dengan mengedit
# data/settings.json langsung, tidak lewat API (supaya request dari luar tidak bisa menukar program).
LOCKED = {"comfy": ("start_bat",), "omnivoice": None, "parallax": None}


@router.get("/settings")
def get_settings():
    return _public(config.load_settings())


@router.put("/settings")
def put_settings(body: dict = Body(...)):
    body = dict(body or {})
    for section, keys in LOCKED.items():
        if keys is None:
            body.pop(section, None)
        elif isinstance(body.get(section), dict):
            body[section] = {k: v for k, v in body[section].items() if k not in keys}
    provs = body.get("providers")
    if isinstance(provs, dict):
        clean = {}
        for name, cfg in provs.items():
            if not isinstance(cfg, dict):
                continue
            cfg = {k: v for k, v in cfg.items() if k != "has_key"}
            if MASK_MARK in str(cfg.get("api_key", "")):  # key samaran dikirim balik = tidak diubah
                cfg.pop("api_key")
            clean[name] = cfg
        body["providers"] = clean
    return _public(config.save_settings(body))


@router.post("/settings/watermark-image")
def upload_watermark_image(file: UploadFile = File(...)):
    ext = Path(file.filename or "logo.png").suffix.lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, detail="Gunakan gambar PNG / JPG / WebP (PNG transparan paling bagus).")
    assets = config.DATA_DIR / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    for old in assets.glob("watermark.*"):
        try:
            old.unlink()
        except OSError:
            pass
    dest = assets / f"watermark{ext}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    rel = f"assets/watermark{ext}"
    config.save_settings({"watermark": {"image": rel}})
    return {"image": rel, "url": f"/media/{rel}"}


@router.post("/settings/mascot-image")
def upload_mascot_image(file: UploadFile = File(...)):
    """Maskot/logo channel untuk thumbnail (PNG transparan paling bagus)."""
    ext = Path(file.filename or "mascot.png").suffix.lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, detail="Gunakan gambar PNG / JPG / WebP (PNG transparan paling bagus).")
    assets = config.DATA_DIR / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    for old in assets.glob("mascot.*"):
        try:
            old.unlink()
        except OSError:
            pass
    dest = assets / f"mascot{ext}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    rel = f"assets/mascot{ext}"
    return {"image": rel, "url": f"/media/{rel}"}


@router.post("/settings/brand-logo")
def upload_brand_logo(file: UploadFile = File(...)):
    """Logo untuk border brand (PNG transparan paling bagus)."""
    ext = Path(file.filename or "logo.png").suffix.lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, detail="Gunakan gambar PNG / JPG / WebP (PNG transparan paling bagus).")
    assets = config.DATA_DIR / "assets"
    assets.mkdir(parents=True, exist_ok=True)
    for old in assets.glob("brand-logo.*"):
        try:
            old.unlink()
        except OSError:
            pass
    dest = assets / f"brand-logo{ext}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    rel = f"assets/brand-logo{ext}"
    config.save_settings({"brand": {"logo": rel}})
    return {"logo": rel, "url": f"/media/{rel}"}


@router.get("/brand/fonts")
def brand_fonts():
    return {"fonts": list(border.FONTS), "themes": border.all_themes()}


def _frame_out(f: dict) -> dict:
    return {**f, "id": f["id"], "theme": frames.PREFIX + f["id"],
            "url": f"/media/assets/frames/{f['file']}"}


@router.get("/frames")
def list_frames():
    return {"frames": [_frame_out(f) for f in frames.list_frames()]}


@router.post("/frames")
def upload_frame(file: UploadFile = File(...), name: str = Form("")):
    """Frame sendiri: PNG transparan, atau gambar dengan layar tengah satu warna (hitam/hijau)."""
    ext = Path(file.filename or "frame.png").suffix.lower()
    if ext not in ALLOWED_IMG:
        raise HTTPException(400, detail="Gunakan gambar PNG / JPG / WebP.")
    try:
        item = frames.add(file.file, name or Path(file.filename or "").stem)
    except ValueError as e:
        raise HTTPException(400, detail=str(e)) from None
    except OSError:
        raise HTTPException(400, detail="File gambar tidak bisa dibaca.") from None
    return _frame_out(item)


@router.post("/frames/pack")
def install_frame_pack():
    """Pasang / pasang ulang pack frame buatan kode (10 gaya, sebagian bergerak)."""
    from ..services import framepack
    items = framepack.install()
    return {"installed": [{"id": i["id"], "name": i["name"], "anim": (i.get("fanim") or {}).get("type")} for i in items]}


@router.delete("/frames/{fid}")
def delete_frame(fid: str):
    if not frames.remove(fid):
        raise HTTPException(404, detail="Frame tidak ditemukan.")
    return list_frames()


@router.post("/brand/preview")
def brand_preview(body: dict = Body(...)):
    """Gambar border untuk preview. brand kosong = pakai yang tersimpan di Pengaturan."""
    brand = {**(config.load_settings().get("brand") or {}), **(body.get("brand") or {})}
    ratio = str(body.get("ratio") or "9:16")
    if ratio not in RATIOS:
        raise HTTPException(400, detail="Aspect ratio tidak dikenal (9:16 / 1:1 / 16:9).")
    return border.preview(
        brand, str(body.get("title") or ""), RATIOS[ratio],
        placeholder=bool(body.get("placeholder", False)),
        part=body.get("part") or None,
    )


@router.post("/brand/gallery")
def brand_gallery(body: dict = Body(...)):
    """Thumbnail semua tema dengan brand yang sama (untuk memilih tema)."""
    brand = {**(config.load_settings().get("brand") or {}), **(body.get("brand") or {})}
    ratio = str(body.get("ratio") or "9:16")
    if ratio not in RATIOS:
        raise HTTPException(400, detail="Aspect ratio tidak dikenal (9:16 / 1:1 / 16:9).")
    title = str(body.get("title") or "")
    return {
        tid: border.preview({**brand, "theme": tid}, title, RATIOS[ratio], placeholder=True, scale=0.25)["image"]
        for tid in border.all_themes()
    }


MUSIC_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"}


def _music_dir() -> Path:
    d = config.DATA_DIR / "assets" / "music"
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.get("/settings/music")
def list_music():
    files = sorted(
        f.name for f in _music_dir().iterdir()
        if f.is_file() and f.suffix.lower() in MUSIC_EXTS
    )
    return {"files": files}


@router.post("/settings/music")
def upload_music(file: UploadFile = File(...)):
    name = Path(file.filename or "musik.mp3").name
    ext = Path(name).suffix.lower()
    if ext not in MUSIC_EXTS:
        raise HTTPException(400, detail=f"Format {ext} tidak didukung. Gunakan: {', '.join(sorted(MUSIC_EXTS))}")
    dest = _music_dir() / name
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    return list_music()


@router.delete("/settings/music/{name}")
def delete_music(name: str):
    target = _music_dir() / Path(name).name
    if target.exists():
        target.unlink()
    return list_music()
