"""Endpoint Pabrik konten: antrean produksi video horor massal."""
import re

from fastapi import APIRouter, Body, HTTPException

from ..services import factory, horror

router = APIRouter(prefix="/api/factory")

_ID = re.compile(r"^[0-9a-f]{10}$")


@router.get("")
def status():
    return factory.snapshot()


@router.post("/batch")
def add_batch(body: dict = Body(...)):
    topics = body.get("topics") or []
    if isinstance(topics, str):
        topics = topics.splitlines()
    if not isinstance(topics, list):
        raise HTTPException(400, detail="topics harus berupa daftar teks.")
    try:
        count = int(body.get("count") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, detail="Jumlah video harus angka.")
    if count < 1 and not any(str(t).strip() for t in topics):
        raise HTTPException(400, detail="Isi jumlah video minimal 1.")
    style = str(body.get("style") or "sinematik")
    if style not in horror.STYLES:
        raise HTTPException(400, detail=f"Gaya visual tidak dikenal: {style}")
    pov = str(body.get("pov") or "kamu")
    if pov not in (*horror.POVS, "acak"):
        raise HTTPException(400, detail=f"Sudut pandang tidak dikenal: {pov}")
    voice = str(body.get("voice") or "omnivoice:narator_d")
    try:
        new = factory.add_batch(min(count, factory.MAX_ITEMS), topics, style, pov, voice,
                                str(body.get("llm_provider") or ""))
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    if body.get("start", True):
        factory.set_paused(False)
    return {"added": len(new), **factory.snapshot()}


@router.post("/start")
def start():
    factory.set_paused(False)
    return factory.snapshot()


@router.post("/pause")
def pause():
    """Jeda: video yang sedang dibuat diselesaikan dulu, item berikutnya tidak diambil."""
    factory.set_paused(True)
    return factory.snapshot()


@router.post("/items/{item_id}/retry")
def retry(item_id: str):
    if not _ID.match(item_id) or not factory.retry(item_id):
        raise HTTPException(404, detail="Item tidak ditemukan atau tidak berstatus gagal.")
    return factory.snapshot()


@router.delete("/items/{item_id}")
def remove(item_id: str):
    if not _ID.match(item_id) or not factory.remove(item_id):
        raise HTTPException(409, detail="Item tidak ditemukan atau sedang diproduksi.")
    return factory.snapshot()


@router.post("/clear-done")
def clear_done():
    n = factory.clear_finished()
    return {"removed": n, **factory.snapshot()}
