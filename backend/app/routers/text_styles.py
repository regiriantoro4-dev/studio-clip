"""Galeri gaya teks Frame Studio (tahap 2, 17 Nov): contoh gambar tiap gaya dalam satu permintaan.

Memakai renderer export (textfx), jadi contoh di galeri = hasil di video.
"""
import base64
import io

from fastapi import APIRouter, Body, HTTPException
from PIL import Image

from ..services import border, textfx

router = APIRouter(prefix="/api/textstyle", tags=["textstyle"])

MAX_ITEMS = 60
THUMB_W, THUMB_H = 300, 96


def _thumb(spec: dict, text: str) -> str:
    try:
        w = max(40.0, min(1200.0, float(spec.get("w") or 520)))
        h = max(20.0, min(600.0, float(spec.get("h") or 140)))
    except (TypeError, ValueError):
        return ""
    spec = {**spec, "type": "text", "x": 0, "y": 0, "w": w, "h": h, "rotation": 0, "opacity": 1,
            "anim": "", "animIn": ""}
    if spec.get("font") not in border.FONTS:
        spec["font"] = "Space Grotesk"
    try:
        r = textfx.render_layer(spec, text[:40])
    except Exception:  # satu gaya gagal tidak menggagalkan seluruh galeri
        return ""
    if not r:
        return ""
    img = r[0]
    bb = img.getchannel("A").getbbox()
    if not bb:
        return ""
    img = img.crop(bb)
    k = min(THUMB_W / img.width, THUMB_H / img.height, 1.0)
    if k < 1:
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "PNG", compress_level=3)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@router.post("/thumbs")
def thumbs(body: dict = Body(...)):
    items = body.get("items")
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise HTTPException(400, detail=f"items harus daftar berisi maksimal {MAX_ITEMS}.")
    out = []
    for it in items:
        it = it if isinstance(it, dict) else {}
        spec = it.get("spec") if isinstance(it.get("spec"), dict) else {}
        out.append({"image": _thumb(spec, str(it.get("text") or "Gaya"))})
    return {"items": out}
