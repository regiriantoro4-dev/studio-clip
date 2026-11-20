"""Endpoint naskah horor: tulis -> periksa/edit -> produksi."""
from fastapi import APIRouter, Body, HTTPException

from ..services import horror, horror_draft

router = APIRouter(prefix="/api/horror/drafts")


def _need(d):
    if not d:
        raise HTTPException(404, detail="Naskah tidak ditemukan.")
    return horror_draft.view(d)


@router.get("")
def list_drafts():
    return horror_draft.list_all()


@router.post("")
def create_draft(body: dict = Body(...)):
    """AI menulis satu cerita dan menyimpannya sebagai naskah (belum ada gambar/suara yang dibuat)."""
    style = str(body.get("style") or "sinematik")
    if style not in horror.STYLES:
        raise HTTPException(400, detail=f"Gaya visual tidak dikenal: {style}")
    pov = str(body.get("pov") or "kamu")
    if pov not in (*horror.POVS, "acak"):
        raise HTTPException(400, detail=f"Sudut pandang tidak dikenal: {pov}")
    try:
        d = horror_draft.create(str(body.get("topic") or ""), pov, style,
                                str(body.get("voice") or "omnivoice:narator_d"),
                                str(body.get("llm_provider") or ""))
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))
    return horror_draft.view(d)


@router.get("/{did}")
def get_draft(did: str):
    return _need(horror_draft.get(did))


@router.put("/{did}")
def save_draft(did: str, body: dict = Body(...)):
    try:
        d = horror_draft.update(did, body.get("story") or {}, str(body.get("voice") or ""),
                                str(body.get("style") or ""))
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    return _need(d)


@router.post("/{did}/rewrite")
def rewrite_draft(did: str):
    try:
        return _need(horror_draft.rewrite(did))
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))


@router.delete("/{did}")
def delete_draft(did: str):
    return {"ok": horror_draft.delete(did)}


@router.post("/{did}/produce")
def produce_draft(did: str):
    try:
        return horror_draft.produce(did)
    except KeyError:
        raise HTTPException(404, detail="Naskah tidak ditemukan.")
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
