"""Endpoint produksi variasi Video jadi (batch + lanjutkan)."""
import shutil
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from .. import jobs, storage
from ..services import readymade, variasi
from .projects import ALLOWED_EXTS

router = APIRouter(prefix="/api")


def _start(pids: list[str]):
    job = jobs.start("readymade", variasi.run, pids)
    for pid in pids:
        p = storage.get(pid)
        p["job_id"] = job.id
        p["status"] = "processing"
        p["error"] = ""
        storage.save(p)
    return job


@router.post("/projects/readymade-variasi")
def create_variasi(
    files: list[UploadFile] = File(...),
    n: int = Form(5),
    intro: bool = Form(True),
    outro: bool = Form(True),
    acak: bool = Form(False),
):
    """Tiap video -> n variasi utuh dengan resep tampilan berbeda (tema, font, gaya, animasi, intro/outro)."""
    files = [f for f in files if f.filename]
    if not files:
        raise HTTPException(400, detail="Pilih minimal 1 video.")
    if len(files) > variasi.MAX_FILES:
        raise HTTPException(400, detail=f"Maksimal {variasi.MAX_FILES} video sekali proses.")
    if not 1 <= n <= variasi.MAX_N:
        raise HTTPException(400, detail=f"Jumlah variasi per video harus 1 sampai {variasi.MAX_N}.")
    for f in files:
        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_EXTS:
            raise HTTPException(400, detail=f"Format {ext} tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTS))}")
    try:
        recipes = variasi.make_recipes(len(files), n, intro, outro)
        if acak:  # Tahap 4: font, gaya, animasi teks brand dari pengacak Acak gaya
            from ..services import acak_gaya
            recipes = acak_gaya.terapkan_batch(recipes)
    except RuntimeError as e:
        raise HTTPException(400, detail=str(e))

    bid = variasi.new_batch_id()
    folder = str(variasi.batch_folder(bid))
    created = []
    for i, f in enumerate(files):
        name = Path(f.filename)
        p = storage.create(readymade.nice_title(name.stem), "readymade", {"options": {
            "ratio": "auto", "theme": "", "frame_title": "",
            "variasi": {"batch": bid, "index": i + 1, "folder": folder, "recipes": recipes[i]}}})
        dest = storage.project_dir(p["id"]) / f"source{name.suffix.lower()}"
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out, length=1024 * 1024)
        p["source_file"] = str(dest)
        p["status"] = "processing"
        storage.save(p)
        created.append(p["id"])
    job = _start(created)
    return {"job_id": job.id, "batch": bid, "projects": created, "total": len(files) * n, "folder": folder}


@router.get("/variasi/batches")
def list_batches():
    return variasi.batches(jobs.get)


@router.post("/variasi/batches/{bid}/resume")
def resume_batch(bid: str):
    """Lanjutkan batch yang terhenti: hanya variasi yang belum jadi yang dirender."""
    cur = next((b for b in variasi.batches(jobs.get) if b["id"] == bid), None)
    if not cur:
        raise HTTPException(404, detail="Batch tidak ditemukan.")
    if cur["running"]:
        raise HTTPException(409, detail="Batch ini sedang berjalan.")
    pids = variasi.unfinished(bid)
    if not pids:
        return {"job_id": "", "remaining": 0}
    job = _start(pids)
    return {"job_id": job.id, "remaining": cur["total"] - cur["done"]}


@router.get("/variasi/gallery")
def gallery():
    return variasi.gallery()


@router.post("/variasi/prefs/block")
def block(body: dict = Body(...)):
    """Jangan pakai lagi (atau izinkan lagi) satu unsur resep: tema, font, gaya, animasi, intro."""
    kind, value = str(body.get("kind") or ""), str(body.get("value") or "")
    if kind not in variasi.BLOCK_KINDS or not value:
        raise HTTPException(400, detail="Unsur resep tidak dikenal.")
    return variasi.set_block(kind, value, bool(body.get("on", True)))


@router.post("/variasi/prefs/favorite")
def favorite(body: dict = Body(...)):
    """Tandai resep sebuah video sebagai favorit: dipakai ulang di batch berikutnya."""
    recipe = variasi.find_recipe(str(body.get("pid") or ""), str(body.get("clip") or ""))
    if not recipe:
        raise HTTPException(404, detail="Video variasi tidak ditemukan.")
    return variasi.set_favorite(recipe, bool(body.get("on", True)))
