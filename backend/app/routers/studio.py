"""Endpoint Frame Studio: desain, brand preset, aset gambar, publish ke frame."""
import base64
import json
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from PIL import Image

from ..services import border, frames, studio

router = APIRouter(prefix="/api/studio")


@router.get("/fonts")
def fonts():
    """Nama font -> URL file, supaya kanvas editor memakai font yang sama persis."""
    return {name: f"/media/assets/fonts/{file}" for name, (file, _w) in border.FONTS.items()}


# ---------------------------------------------------------------- desain

@router.get("/designs")
def list_designs():
    return {"designs": studio.list_designs()}


@router.get("/designs/{did}")
def get_design(did: str):
    d = studio.get_design(did)
    if not d:
        raise HTTPException(404, detail="Desain tidak ditemukan.")
    return d


@router.post("/designs")
def save_design(body: dict = Body(...)):
    doc = body.get("design") or {}
    if not isinstance(doc.get("layers"), list) or not isinstance(doc.get("video"), dict):
        raise HTTPException(400, detail="Dokumen desain tidak lengkap.")
    saved = studio.save_design(doc)
    thumb = str(body.get("thumb") or "")
    if thumb.startswith("data:image/png;base64,"):
        studio.save_thumb(saved["id"], base64.b64decode(thumb.split(",", 1)[1]))
    return saved


@router.delete("/designs/{did}")
def delete_design(did: str):
    if not studio.delete_design(did):
        raise HTTPException(404, detail="Desain tidak ditemukan.")
    return {"ok": True}


@router.post("/designs/{did}/publish")
def publish(did: str, png: UploadFile = File(...), win: str = Form(...), name: str = Form(""),
            layers: str = Form("[]"), has_brand: str = Form("")):
    """PNG hasil export editor (jendela video transparan) -> frame siap pakai untuk render MP4."""
    d = studio.get_design(did)
    if not d:
        raise HTTPException(404, detail="Simpan desain dulu sebelum dipakai.")
    try:
        x, y, w, h = (int(round(float(v))) for v in json.loads(win))
    except (ValueError, TypeError):
        raise HTTPException(400, detail="Data jendela video tidak valid.") from None
    try:
        dyn = [l for l in json.loads(layers or "[]") if isinstance(l, dict) and l.get("type") == "text"]
    except ValueError:
        raise HTTPException(400, detail="Data layer tidak valid.") from None
    item = frames.upsert(d.get("frame_id"), name or d.get("name"), png.file, (x, y, w, h), dyn,
                         has_brand=None if has_brand == "" else has_brand == "1")
    if d.get("frame_id") != item["id"]:
        d["frame_id"] = item["id"]
        studio.save_design(d)
    return {"frame_id": item["id"], "theme": frames.PREFIX + item["id"], "name": item["name"]}


# ---------------------------------------------------------------- brand preset

@router.get("/presets")
def presets():
    return {"presets": studio.list_presets()}


@router.post("/presets")
def save_preset(body: dict = Body(...)):
    if not str(body.get("name") or "").strip():
        raise HTTPException(400, detail="Nama preset wajib diisi.")
    return {"presets": studio.upsert_preset(body)}


@router.delete("/presets/{pid}")
def delete_preset(pid: str):
    return {"presets": studio.delete_preset(pid)}


# ---------------------------------------------------------------- aset gambar

@router.get("/assets")
def assets():
    return {"assets": studio.list_assets()}


@router.post("/assets")
def upload_asset(file: UploadFile = File(...)):
    ext = Path(file.filename or "gambar.png").suffix.lower()
    if ext not in studio.IMG_EXTS:
        raise HTTPException(400, detail="Gunakan gambar PNG / JPG / WebP (PNG transparan paling bagus).")
    return {"url": studio.save_asset(file.file, ext)}


# ---------------------------------------------------------------- pratinjau efek teks

@router.post("/textfx")
def textfx_preview(body: dict = Body(...)):
    """Render satu layer teks dengan renderer export (Pillow) untuk pratinjau editor.

    Dipakai kanvas untuk efek yang tidak bisa digambar Konva (bevel, tekstur, kilap,
    sisi 3D bergradasi), jadi tampilan editor = hasil video.
    -> {image: data URL PNG, x, y} dengan x/y posisi gambar relatif terhadap kotak layer.
    """
    import io

    from ..services import textfx

    spec = body.get("spec") or {}
    try:
        w = max(4.0, min(4000.0, float(spec.get("w") or 0)))
        h = max(4.0, min(4000.0, float(spec.get("h") or 0)))
    except (TypeError, ValueError):
        raise HTTPException(400, detail="Ukuran layer tidak valid.")
    spec = {**spec, "type": "text", "x": 0, "y": 0, "w": w, "h": h, "rotation": 0, "opacity": 1}
    if spec.get("font") not in border.FONTS:
        spec["font"] = "Space Grotesk"
    r = textfx.render_layer(spec, str(body.get("text") or "")[:400])
    if not r:
        return {"image": "", "x": 0, "y": 0}
    img, (x, y) = r
    buf = io.BytesIO()
    img.save(buf, "PNG", compress_level=1)
    return {"image": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(), "x": x, "y": y}


@router.post("/textfx/anim")
def textfx_anim_preview(body: dict = Body(...)):
    """Pratinjau animasi teks sebagai WebP animasi, memakai mesin yang sama dengan render video."""
    import io

    from ..services import textfx

    spec = body.get("spec") or {}
    try:
        w = max(4.0, min(4000.0, float(spec.get("w") or 0)))
        h = max(4.0, min(4000.0, float(spec.get("h") or 0)))
    except (TypeError, ValueError):
        raise HTTPException(400, detail="Ukuran layer tidak valid.")
    spec = {**spec, "type": "text", "x": 0, "y": 0, "w": w, "h": h, "rotation": 0, "opacity": 1}
    if spec.get("font") not in border.FONTS:
        spec["font"] = "Space Grotesk"
    bx = []
    r = textfx.render_layer(spec, str(body.get("text") or "")[:400], bx)
    if not r or not textfx.has_anim(spec):
        return {"image": ""}
    img = r[0]
    k = min(1.0, 520 / img.width)
    if k < 1:
        img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))))
        bx = [tuple(v * k for v in b) for b in bx]
    fps = 20
    seq, _pad, n_in, n_loop = textfx.anim_frames(img, spec, fps, k, bx)
    loop = seq[n_in:]
    frames = seq[:n_in] + loop * (3 if n_loop > 1 else 1)
    if n_in and n_loop == 1:
        frames += loop * fps  # pop-in saja: tahan sebentar sebelum diulang
    bg = Image.new("RGBA", frames[0].size, (32, 34, 40, 255))
    frames = [Image.alpha_composite(bg, f).convert("RGB") for f in frames]
    buf = io.BytesIO()
    frames[0].save(buf, "WEBP", save_all=True, append_images=frames[1:], duration=round(1000 / fps), loop=0, quality=80)
    return {"image": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()}
