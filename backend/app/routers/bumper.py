"""Bumper intro/outro animasi: daftar template, pratinjau render (di-cache)."""
from fastapi import APIRouter, Body, HTTPException

from .. import config
from ..services import bumper

router = APIRouter(prefix="/api/bumper")


@router.get("/templates")
def templates():
    s = config.load_settings()
    brand = s.get("brand") or {}
    return {"templates": bumper.list_templates(),
            "settings": {k: bumper.settings_for(brand, k) for k in ("intro", "outro")}}


@router.post("/preview")
def preview(body: dict = Body(...)):
    """Render (atau ambil dari cache) satu bumper -> URL WebM transparan untuk diputar di browser."""
    tid = str(body.get("template") or "")
    if tid not in bumper.TEMPLATES:
        raise HTTPException(400, detail="Template bumper tidak dikenal.")
    brand = config.load_settings().get("brand") or {}
    vars_ = bumper.resolve_vars(tid, body.get("vars") or {}, brand)
    try:
        path = bumper.render(tid, vars_, str(body.get("font") or "Archivo Black"), str(body.get("tag_font") or "Archivo Black"))
    except bumper.BumperError as e:
        raise HTTPException(500, detail=str(e))
    rel = path.relative_to(config.DATA_DIR).as_posix()
    return {"url": f"/media/{rel}", "duration": bumper.TEMPLATES[tid]["duration"], "vars": vars_}
