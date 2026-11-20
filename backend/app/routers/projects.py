"""Endpoint project: buat (upload/YouTube), proses, riwayat, transkrip, job."""
import importlib.util
import shutil
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from .. import config, jobs, storage
from ..services import (affiliate, autoproduce, border, horror, llm, media, narrate, pipeline,
                        readymade, renderer)

router = APIRouter(prefix="/api")

ALLOWED_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".m4v", ".avi"}
PHOTO_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


@router.get("/health")
def health():
    return {
        "ok": True,
        "ffmpeg": media.has_ffmpeg(),
        "faster_whisper": importlib.util.find_spec("faster_whisper") is not None,
    }


@router.post("/projects/upload")
def create_upload(file: UploadFile = File(...), title: str = Form("")):
    name = Path(file.filename or "video.mp4")
    ext = name.suffix.lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(400, detail=f"Format {ext} tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTS))}")
    p = storage.create(title or name.stem, "upload")
    dest = storage.project_dir(p["id"]) / f"source{ext}"
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out, length=1024 * 1024)
    p["source_file"] = str(dest)
    storage.save(p)
    return _with_media_url(p)


@router.post("/projects/youtube")
def create_youtube(body: dict = Body(...)):
    url = (body.get("url") or "").strip()
    if not url.startswith("http"):
        raise HTTPException(400, detail="Link YouTube tidak valid.")
    p = storage.create(body.get("title") or url, "youtube", {"source_url": url})
    return _with_media_url(p)


@router.post("/projects/affiliate")
def create_affiliate(
    photos: list[UploadFile] = File(...),
    name: str = Form(...),
    link: str = Form(""),
    price: str = Form(""),
    description: str = Form(""),
    n: int = Form(3),
    voice: str = Form("id-ID-ArdiNeural"),
    llm_provider: str = Form(""),
):
    """Mode Affiliate: foto produk + info -> video review bernarasi siap upload."""
    name = name.strip()
    if not name:
        raise HTTPException(400, detail="Nama produk wajib diisi.")
    link = link.strip()
    if link and not link.lower().startswith(("http://", "https://")):
        raise HTTPException(400, detail="Link affiliate harus berupa URL, mis. https://s.shopee.co.id/...")
    photos = [f for f in photos if f.filename]
    if not photos:
        raise HTTPException(400, detail="Unggah minimal 1 foto produk.")
    if len(photos) > 10:
        raise HTTPException(400, detail="Maksimal 10 foto produk.")
    for f in photos:
        ext = Path(f.filename).suffix.lower()
        if ext not in PHOTO_EXTS:
            raise HTTPException(400, detail=f"Format foto {ext} tidak didukung. Gunakan JPG, PNG, atau WebP.")

    p = storage.create(name, "affiliate")
    pdir = storage.project_dir(p["id"]) / "photos"
    pdir.mkdir(parents=True, exist_ok=True)
    saved = []
    for i, f in enumerate(photos):
        fname = f"p{i + 1:02d}{Path(f.filename).suffix.lower()}"
        with open(pdir / fname, "wb") as out:
            shutil.copyfileobj(f.file, out, length=1024 * 1024)
        saved.append(fname)

    p["affiliate"] = {
        "name": name, "link": link.strip(), "price": price.strip(),
        "description": description.strip(), "photos": saved,
        "n": int(n or 3), "voice": voice or "id-ID-ArdiNeural",  # dipakai ulang oleh "Proses ulang"
    }
    if llm_provider:
        p["options"] = {"llm_provider": llm_provider}
    p["status"] = "processing"
    storage.save(p)  # simpan DULU, baru start job
    job = jobs.start("affiliate", affiliate.full_run, p["id"], int(n or 3), voice or "id-ID-ArdiNeural")
    p = storage.get(p["id"])
    p["job_id"] = job.id
    storage.save(p)
    return _with_media_url(p)


@router.post("/projects/horror")
def create_horror(body: dict = Body(...)):
    """Mode Horor: cerita AI + ilustrasi ComfyUI + narator -> 1-3 video faceless siap upload."""
    n = max(1, min(int(body.get("n") or 3), 3))
    voice = str(body.get("voice") or "omnivoice:narator_d")
    topic = str(body.get("topic") or "").strip()[:300]
    style = str(body.get("style") or "sinematik")
    if style not in horror.STYLES:
        raise HTTPException(400, detail=f"Gaya visual tidak dikenal: {style}")
    pov = str(body.get("pov") or "kamu")
    if pov not in (*horror.POVS, "acak"):
        raise HTTPException(400, detail=f"Sudut pandang tidak dikenal: {pov}")
    p = storage.create(topic or "Cerita horor AI", "horror")
    p["horror"] = {"n": n, "voice": voice, "topic": topic, "style": style, "pov": pov}
    if body.get("llm_provider"):
        p["options"] = {"llm_provider": str(body["llm_provider"])}
    p["status"] = "processing"
    storage.save(p)
    job = jobs.start("horror", horror.full_run, p["id"], n, voice, topic, style, pov)
    p = storage.get(p["id"])
    p["job_id"] = job.id
    storage.save(p)
    return _with_media_url(p)


@router.get("/horror/status")
def horror_status():
    """Cek cepat untuk UI: ComfyUI hidup? checkpoint apa?"""
    from ..services import comfy
    s = config.load_settings()
    up = comfy.is_up(s)
    out = {"comfy_up": up, "checkpoint": "", "styles": list(horror.STYLES)}
    if up:
        try:
            out["checkpoint"] = comfy.checkpoint(s)
        except Exception:  # noqa: BLE001
            pass
    return out


@router.post("/projects/readymade")
def create_readymade(
    files: list[UploadFile] = File(...),
    ratio: str = Form("auto"),
    theme: str = Form(""),
    frame_title: str = Form(""),
):
    """Mode Video jadi: video siap upload -> dipasang border saja (tanpa potong/subtitle)."""
    files = [f for f in files if f.filename]
    if not files:
        raise HTTPException(400, detail="Pilih minimal 1 video.")
    if len(files) > 20:
        raise HTTPException(400, detail="Maksimal 20 video sekali proses.")
    for f in files:
        ext = Path(f.filename).suffix.lower()
        if ext not in ALLOWED_EXTS:
            raise HTTPException(400, detail=f"Format {ext} tidak didukung. Gunakan: {', '.join(sorted(ALLOWED_EXTS))}")
    if ratio != "auto" and ratio not in renderer.RATIOS:
        raise HTTPException(400, detail="Rasio tidak dikenal.")
    if theme and theme not in border.all_themes():
        raise HTTPException(400, detail="Tema border tidak dikenal.")

    created = []
    for f in files:
        name = Path(f.filename)
        p = storage.create(readymade.nice_title(name.stem), "readymade",
                           {"options": {"ratio": ratio, "theme": theme,
                                        "frame_title": frame_title.strip()[:200]}})
        dest = storage.project_dir(p["id"]) / f"source{name.suffix.lower()}"
        with open(dest, "wb") as out:
            shutil.copyfileobj(f.file, out, length=1024 * 1024)
        p["source_file"] = str(dest)
        p["status"] = "processing"
        storage.save(p)
        created.append(p["id"])

    job = jobs.start("readymade", readymade.run_batch, created, ratio, theme)
    for pid in created:
        p = storage.get(pid)
        p["job_id"] = job.id
        storage.save(p)
    return {"job_id": job.id, "projects": created}


@router.post("/projects/{pid}/process")
def process_project(pid: str, opts: dict | None = Body(None)):
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")

    # Kalau masih ada job berjalan, kembalikan job itu saja
    existing = jobs.get(p.get("job_id", ""))
    if existing and existing.status == "running":
        return {"job_id": existing.id}

    opts = dict(opts or {})
    fresh = bool(opts.pop("fresh", False))  # perintah sekali jalan, tidak disimpan ke options
    if opts:
        p["options"] = {**(p.get("options") or {}), **opts}
    p["status"] = "processing"
    p["error"] = ""
    storage.save(p)  # simpan DULU, baru start job (hindari baca/tulis bersamaan)
    if p.get("source_type") == "affiliate":
        # Project affiliate tidak punya video sumber — ulangi pipeline affiliate-nya
        aff = p.get("affiliate") or {}
        job = jobs.start("affiliate", affiliate.full_run, pid,
                         int(aff.get("n") or 3), aff.get("voice") or "id-ID-ArdiNeural")
    elif p.get("source_type") == "horror":
        # Proses yang terputus dilanjutkan (cerita/suara/gambar dipakai ulang); kalau sudah selesai,
        # atau body {"fresh": true}, = cerita & gambar baru dengan pengaturan yang sama
        hz = p.get("horror") or {}
        job = jobs.start("horror", horror.full_run, pid, int(hz.get("n") or 3),
                         hz.get("voice") or "omnivoice:narator_d", hz.get("topic") or "",
                         hz.get("style") or "sinematik", hz.get("pov") or "kamu", fresh)
    elif p.get("source_type") == "readymade" and ((p.get("options") or {}).get("variasi") or {}).get("batch"):
        # Batch variasi: lanjutkan, variasi yang sudah jadi dilewati
        from ..services import variasi
        job = jobs.start("readymade", variasi.run, [pid])
    elif p.get("source_type") == "readymade":
        # Video jadi tidak lewat AI — proses ulang = render ulang dengan border
        o = p.get("options") or {}
        job = jobs.start("readymade", readymade.run_batch, [pid],
                         str(o.get("ratio") or "auto"), str(o.get("theme") or ""))
    else:
        job = jobs.start("process", pipeline.process, pid)
    p = storage.get(pid)
    p["job_id"] = job.id
    storage.save(p)
    return {"job_id": job.id}


@router.get("/projects")
def list_projects():
    return storage.list_all()


@router.get("/projects/{pid}")
def get_project(pid: str):
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")
    return _with_media_url(p)


@router.delete("/projects/{pid}")
def delete_project(pid: str):
    p = storage.get(pid)  # ID tidak valid / tanpa project.json -> None
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")
    job = jobs.get(p.get("job_id", ""))
    if job and job.status == "running":
        raise HTTPException(409, detail="Project masih diproses. Tunggu selesai sebelum menghapus.")
    if not storage.delete(pid):
        raise HTTPException(400, detail="Project tidak bisa dihapus.")
    return {"ok": True}


@router.get("/projects/{pid}/transcript")
def get_transcript(pid: str):
    t = storage.get_transcript(pid)
    if t is None:
        raise HTTPException(404, detail="Transkrip belum tersedia.")
    return t


@router.put("/projects/{pid}/transcript")
def put_transcript(pid: str, transcript: dict = Body(...)):
    if not storage.get(pid):
        raise HTTPException(404, detail="Project tidak ditemukan.")
    storage.save_transcript(pid, transcript)
    return {"ok": True}


@router.post("/projects/{pid}/fix-transcript")
def fix_transcript(pid: str):
    """Koreksi typo transkrip via LLM untuk project yang sudah diproses."""
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")
    transcript = storage.get_transcript(pid)
    if not transcript:
        raise HTTPException(400, detail="Transkrip belum tersedia.")

    opts = p.get("options") or {}

    def run(job):
        settings = config.load_settings()
        provider = opts.get("llm_provider") or settings["llm_provider"]
        job.set(stage="Koreksi typo transkrip (AI)", progress=0.05)
        fixed, changed = llm.fix_transcript(
            transcript, provider, settings, vocab=str(opts.get("vocab") or ""),
            progress_cb=lambda f: job.set(progress=0.05 + 0.9 * f),
        )
        storage.save_transcript(pid, fixed)
        return {"changed": changed}

    job = jobs.start("fix-transcript", run)
    return {"job_id": job.id}


@router.post("/projects/{pid}/autoproduce")
def autoproduce_project(pid: str, body: dict | None = Body(None)):
    """Mode pabrik: proses (jika perlu) + render N klip terbaik + thumbnail + caption
    langsung ke folder Siap Upload — tanpa buka editor."""
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")

    existing = jobs.get(p.get("job_id", ""))
    if existing and existing.status == "running":
        return {"job_id": existing.id}

    body = body or {}
    ratio = str(body.get("ratio") or "9:16")
    if ratio not in renderer.RATIOS:  # rasio dipakai di nama file hasil render
        raise HTTPException(400, detail=f"Rasio tidak dikenal: {ratio[:20]}")
    opts = {k: v for k, v in body.items() if k not in ("n", "ratio")}
    if opts:
        p["options"] = {**(p.get("options") or {}), **opts}
    p["status"] = "processing"
    p["error"] = ""
    storage.save(p)  # simpan DULU, baru start job (hindari baca/tulis bersamaan)
    job = jobs.start(
        "autoproduce", autoproduce.full_run, pid,
        int(body.get("n") or 3), ratio,
    )
    p = storage.get(pid)
    p["job_id"] = job.id
    storage.save(p)
    return {"job_id": job.id}


@router.post("/projects/{pid}/narrate")
def narrate_project(pid: str, body: dict = Body(...)):
    """Mode Narasi film: naskah alur cerita AI + suara narator Indonesia (Edge TTS)
    + footage film -> video siap upload di folder Siap Upload."""
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")
    film_title = str(body.get("film_title") or "").strip()
    if not film_title:
        raise HTTPException(400, detail="Judul film wajib diisi untuk mode narasi.")

    existing = jobs.get(p.get("job_id", ""))
    if existing and existing.status == "running":
        return {"job_id": existing.id}

    opts = {k: v for k, v in body.items() if k in ("llm_provider",)}
    p["options"] = {**(p.get("options") or {}), **opts,
                    "film_title": film_title, "context": str(body.get("context") or ""),
                    "voice": str(body.get("voice") or "id-ID-ArdiNeural")}
    p["status"] = "processing"
    p["error"] = ""
    storage.save(p)  # simpan DULU, baru start job
    job = jobs.start(
        "narrate", narrate.full_run, pid,
        film_title, str(body.get("context") or ""),
        int(body.get("n") or 3), str(body.get("voice") or "id-ID-ArdiNeural"),
    )
    p = storage.get(pid)
    p["job_id"] = job.id
    storage.save(p)
    return {"job_id": job.id}


@router.post("/projects/{pid}/annotate")
def annotate_project(pid: str):
    """Anotasi kata kunci & emoji (AI) untuk project yang sudah punya klip."""
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")
    transcript = storage.get_transcript(pid)
    if not transcript:
        raise HTTPException(400, detail="Transkrip belum tersedia.")
    if not p.get("clips"):
        raise HTTPException(400, detail="Belum ada klip untuk dianotasi.")

    opts = p.get("options") or {}

    def run(job):
        settings = config.load_settings()
        provider = opts.get("llm_provider") or settings["llm_provider"]
        job.set(stage="AI memilih kata kunci & emoji", progress=0.05)
        marked = llm.annotate_words(
            transcript, p["clips"], provider, settings,
            progress_cb=lambda f: job.set(progress=0.05 + 0.9 * f),
        )
        storage.save_transcript(pid, transcript)
        storage.save(p)  # anotasi juga bisa mengisi teaser di klip
        return {"marked": marked}

    job = jobs.start("annotate", run)
    return {"job_id": job.id}


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, detail="Job tidak ditemukan.")
    return job.to_dict()


def _with_media_url(p: dict) -> dict:
    out = dict(p)
    if p.get("source_file"):
        out["media_url"] = f"/media/projects/{p['id']}/{Path(p['source_file']).name}"
    else:
        out["media_url"] = ""
    return out
