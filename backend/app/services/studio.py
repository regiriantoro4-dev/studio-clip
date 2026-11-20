"""Frame Studio: desain frame (layer per section), brand preset, aset gambar.

Desain disimpan sebagai JSON di data/studio/designs/<id>.json. Gambarnya sendiri
digambar di browser (kanvas Konva) supaya preview editor = hasil export; backend
hanya menyimpan dokumen, aset, dan menerima PNG hasil publish untuk dijadikan
frame (lihat frames.upsert) yang dipakai render MP4 / mode Video jadi.
"""
import json
import time
import uuid

from .. import config

IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def _dir(name: str):
    d = config.DATA_DIR / "studio" / name
    d.mkdir(parents=True, exist_ok=True)
    return d


def _read(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _write(path, data):
    tmp = path.with_name(path.name + f".{uuid.uuid4().hex[:6]}.tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def new_id() -> str:
    return time.strftime("%Y%m%d%H%M%S") + uuid.uuid4().hex[:4]


# ---------------------------------------------------------------- desain

def list_designs() -> list[dict]:
    out = []
    for f in sorted(_dir("designs").glob("*.json"), reverse=True):
        d = _read(f, None)
        if d:
            out.append({k: d.get(k) for k in ("id", "name", "updated_at", "preset_id", "frame_id")}
                       | {"thumb": f"/media/studio/thumbs/{d['id']}.png" if (_dir("thumbs") / f"{d['id']}.png").exists() else ""})
    return sorted(out, key=lambda x: -(x.get("updated_at") or 0))


def get_design(did: str) -> dict | None:
    if not did.isalnum():
        return None
    f = _dir("designs") / f"{did}.json"
    return _read(f, None) if f.exists() else None


def save_design(doc: dict) -> dict:
    did = str(doc.get("id") or "")
    if not did.isalnum():
        did = new_id()
    doc = {**doc, "id": did, "updated_at": time.time()}
    doc["name"] = str(doc.get("name") or "Desain tanpa nama")[:60]
    _write(_dir("designs") / f"{did}.json", doc)
    return doc


def save_thumb(did: str, png_bytes: bytes):
    (_dir("thumbs") / f"{did}.png").write_bytes(png_bytes)


def delete_design(did: str) -> bool:
    if not did.isalnum():
        return False
    f = _dir("designs") / f"{did}.json"
    if not f.exists():
        return False
    f.unlink()
    (_dir("thumbs") / f"{did}.png").unlink(missing_ok=True)
    return True


# ---------------------------------------------------------------- brand preset

def _default_preset() -> dict:
    b = config.load_settings().get("brand") or {}
    return {
        "id": "default",
        "name": b.get("name") or "Brand saya",
        "brand": b.get("name") or "Brand saya",
        "tagline": b.get("label") or "Tagline brand",
        "handle": b.get("handle") or "@akunmu",
        "website": "",
        "welcome": "Selamat menonton!",
        "logo": f"/media/{b['logo']}" if b.get("logo") else "",
        "font": b.get("font") or "Space Grotesk",
        "colors": {
            "primary": b.get("color") or "#111418",
            "secondary": "#2A2F3A",
            "accent": b.get("accent") or "#3BE8B0",
            "text": "#FFFFFF",
        },
    }


def list_presets() -> list[dict]:
    items = _read(config.DATA_DIR / "studio" / "presets.json", None)
    if not items:
        items = [_default_preset()]
        save_presets(items)
    return items


def save_presets(items: list[dict]):
    _dir("")  # pastikan data/studio ada
    _write(config.DATA_DIR / "studio" / "presets.json", items)


def upsert_preset(p: dict) -> list[dict]:
    items = list_presets()
    pid = str(p.get("id") or "")
    if not pid.isalnum():
        pid = new_id()
    p = {**p, "id": pid}
    for i, it in enumerate(items):
        if it["id"] == pid:
            items[i] = p
            break
    else:
        items.append(p)
    save_presets(items)
    return items


def delete_preset(pid: str) -> list[dict]:
    items = [p for p in list_presets() if p["id"] != pid]
    if not items:
        items = [_default_preset()]
    save_presets(items)
    return items


# ---------------------------------------------------------------- aset

def save_asset(file_obj, ext: str) -> str:
    name = f"{new_id()}{ext}"
    with open(_dir("assets") / name, "wb") as out:
        while chunk := file_obj.read(1024 * 1024):
            out.write(chunk)
    return f"/media/studio/assets/{name}"


def list_assets() -> list[str]:
    return [f"/media/studio/assets/{f.name}" for f in sorted(_dir("assets").iterdir(), reverse=True)
            if f.suffix.lower() in IMG_EXTS]
