"""Acak gaya (Tahap 4): aturan main, mengacak satu kombinasi, catat pemakaian, riwayat."""
from fastapi import APIRouter, Body

from ..services import acak_gaya

router = APIRouter(prefix="/api/acakgaya")

KUNCI = ("font", "gaya", "anim", "animIn", "border")


@router.get("/aturan")
def get_aturan():
    a = acak_gaya.load_aturan()
    return {"aturan": a, "pilihan": acak_gaya.pilihan(), "jumlah": acak_gaya.jumlah_kombinasi(a)}


@router.post("/aturan")
def set_aturan(body: dict = Body(...)):
    a = acak_gaya.save_aturan(body or {})
    return {"aturan": a, "pilihan": acak_gaya.pilihan(), "jumlah": acak_gaya.jumlah_kombinasi(a)}


@router.post("/acak")
def acak(body: dict = Body(default={})):
    """body: {kunci: {font?, gaya?, anim?, animIn?, border?}, kode?: "A7K2"}"""
    kunci = {k: v for k, v in (body.get("kunci") or {}).items() if k in KUNCI}
    return acak_gaya.acak(kunci=kunci, kode=str(body.get("kode") or "") or None)


@router.post("/catat")
def catat(body: dict = Body(default={})):
    """Kode gaya yang dipakai di frame yang disimpan -> masuk riwayat anti-kembar."""
    kodes = [str(k).upper() for k in (body.get("kode") or [])][:20]
    r = acak_gaya._riwayat()["kode"]
    acak_gaya.catat([r[k] for k in kodes if k in r], str(body.get("sumber") or "studio")[:20])
    return {"ok": True}


@router.get("/riwayat")
def riwayat(limit: int = 50):
    return {"items": acak_gaya.riwayat(max(1, min(500, limit)))}
