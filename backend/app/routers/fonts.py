"""Katalog font berkategori + unggah/hapus font sendiri (Frame Studio)."""
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..services import font_catalog

router = APIRouter(prefix="/api/fonts")


@router.get("")
def list_fonts():
    return font_catalog.catalog()


@router.post("/upload")
async def upload_font(file: UploadFile = File(...), name: str = Form("")):
    data = await file.read(font_catalog.MAX_UPLOAD + 1)
    try:
        return font_catalog.add_user_font(file.filename or "", data, name)
    except ValueError as e:
        raise HTTPException(400, detail=str(e))


@router.delete("/user/{name}")
def delete_font(name: str):
    if not font_catalog.delete_user_font(name):
        raise HTTPException(404, detail="Font unggahan tidak ditemukan.")
    return {"ok": True}
