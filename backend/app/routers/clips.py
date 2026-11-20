"""Endpoint klip: edit (trim/judul/hook/gaya), tambah/hapus, render/export,
hook AI, metadata posting, thumbnail, dan split Part 1/2."""
import time

from fastapi import APIRouter, Body, HTTPException

from .. import config, jobs, storage
from ..services import llm, renderer, thumbnail

router = APIRouter(prefix="/api")

EDITABLE_KEYS = {
    "start", "end", "title", "hook", "score", "reason",
    "style", "hook_style", "fx", "teaser", "endcard",
}


def _llm_provider(p: dict) -> tuple[str, dict]:
    settings = config.load_settings()
    provider = (p.get("options") or {}).get("llm_provider") or settings["llm_provider"]
    return provider, settings


def _clip_text(pid: str, clip: dict) -> str:
    transcript = storage.get_transcript(pid) or {"segments": []}
    parts = [
        s["text"].strip()
        for s in transcript.get("segments", [])
        if s.get("text") and clip["start"] < s["end"] and s["start"] < clip["end"]
    ]
    text = " ".join(parts)
    if not text:
        raise HTTPException(400, detail="Transkrip untuk rentang klip ini kosong.")
    return text


def _get(pid, cid=None):
    p = storage.get(pid)
    if not p:
        raise HTTPException(404, detail="Project tidak ditemukan.")
    if cid is None:
        return p, None
    clip = next((c for c in p.get("clips", []) if c["id"] == cid), None)
    if not clip:
        raise HTTPException(404, detail="Klip tidak ditemukan.")
    return p, clip


@router.post("/projects/{pid}/clips")
def add_clip(pid: str, body: dict = Body(...)):
    p, _ = _get(pid)
    try:
        start = float(body["start"])
        end = float(body["end"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, detail="start dan end wajib berupa angka.") from None
    if end - start < 1:
        raise HTTPException(400, detail="Durasi klip minimal 1 detik.")

    nums = [int(c["id"][1:]) for c in p["clips"] if c["id"][1:].isdigit()]
    cid = f"c{(max(nums) + 1) if nums else 1}"
    clip = {
        "id": cid,
        "start": round(start, 2),
        "end": round(end, 2),
        "title": body.get("title") or "Klip manual",
        "hook": body.get("hook") or "",
        "score": int(body.get("score") or 0),
        "reason": "Ditambahkan manual",
        "style": dict(storage.DEFAULT_STYLE),
        "hook_style": dict(storage.DEFAULT_HOOK_STYLE),
        "fx": dict(storage.DEFAULT_FX),
        "exports": [],
    }
    p["clips"].append(clip)
    storage.save(p)
    return clip


@router.put("/projects/{pid}/clips/{cid}")
def update_clip(pid: str, cid: str, patch: dict = Body(...)):
    p, clip = _get(pid, cid)
    for k, v in patch.items():
        if k not in EDITABLE_KEYS:
            continue
        if k in ("start", "end"):
            try:
                v = round(float(v), 3)
            except (TypeError, ValueError):
                continue
        if k in ("style", "hook_style", "fx") and isinstance(v, dict):
            v = {**(clip.get(k) or {}), **v}
        clip[k] = v
    if clip["end"] - clip["start"] < 1:
        clip["end"] = clip["start"] + 1
    storage.save(p)
    return clip


@router.delete("/projects/{pid}/clips/{cid}")
def delete_clip(pid: str, cid: str):
    p, _ = _get(pid, cid)
    p["clips"] = [c for c in p["clips"] if c["id"] != cid]
    storage.save(p)
    return {"ok": True}


@router.post("/projects/{pid}/clips/{cid}/render")
def render_clip(pid: str, cid: str, body: dict = Body(...)):
    _get(pid, cid)
    ratio = body.get("ratio") or "9:16"
    fmt = body.get("format") or "mp4"
    if ratio not in renderer.RATIOS:
        raise HTTPException(400, detail="Aspect ratio tidak dikenal (9:16 / 1:1 / 16:9).")
    job = jobs.start("render", renderer.render, pid, cid, ratio, fmt)
    return {"job_id": job.id, "ts": time.time()}


@router.post("/projects/{pid}/clips/{cid}/hooks")
def regen_hooks(pid: str, cid: str):
    """3 variasi hook baru (curiosity gap / pertanyaan / shock) via LLM."""
    p, clip = _get(pid, cid)
    provider, settings = _llm_provider(p)
    try:
        hooks = llm.generate_hooks(_clip_text(pid, clip), provider, settings)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=str(e)) from None
    clip["hooks"] = hooks
    storage.save(p)
    return {"hooks": hooks}


@router.post("/projects/{pid}/clips/{cid}/metadata")
def gen_metadata(pid: str, cid: str):
    """Metadata siap posting: judul, teks thumbnail, deskripsi, hashtag."""
    p, clip = _get(pid, cid)
    provider, settings = _llm_provider(p)
    try:
        meta = llm.generate_metadata(_clip_text(pid, clip), clip.get("title") or "", provider, settings)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=str(e)) from None
    clip["meta"] = meta
    storage.save(p)
    return meta


@router.post("/projects/{pid}/clips/{cid}/thumbnail")
def make_thumbnail(pid: str, cid: str, body: dict = Body(...)):
    """Buat thumbnail bermerek dari frame video + teks hook."""
    _get(pid, cid)
    try:
        return thumbnail.generate(
            pid, cid,
            frame_time=float(body.get("time") or 0),
            text=str(body.get("text") or ""),
            ratio=str(body.get("ratio") or "9:16"),
            arrow=bool(body.get("arrow", True)),
            mascot=bool(body.get("mascot", True)),
        )
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(500, detail=str(e)) from None


@router.post("/projects/{pid}/clips/{cid}/split")
def split_clip(pid: str, cid: str):
    """Pecah klip jadi Part 1 (berakhir di cliffhanger) + Part 2."""
    p, clip = _get(pid, cid)
    transcript = storage.get_transcript(pid) or {"segments": []}
    segs = [
        s for s in transcript.get("segments", [])
        if clip["start"] + 2 < s["end"] < clip["end"] - 2 and (s.get("text") or "").strip()
    ]
    if len(segs) < 2 or clip["end"] - clip["start"] < 20:
        raise HTTPException(400, detail="Klip terlalu pendek untuk dipecah jadi 2 part (min ±20 detik).")

    provider, settings = _llm_provider(p)
    try:
        split_t = llm.pick_split(segs, clip, provider, settings)
    except Exception:  # noqa: BLE001
        mid = clip["start"] + (clip["end"] - clip["start"]) / 2
        split_t = round(min((s["end"] for s in segs), key=lambda e: abs(e - mid)), 2)

    nums = [int(c["id"][1:]) for c in p["clips"] if c["id"][1:].isdigit()]
    base = (max(nums) + 1) if nums else 1

    def _copy(c: dict) -> dict:
        out = {k: v for k, v in c.items() if k not in ("id", "exports", "thumbnail", "meta")}
        out["style"] = dict(c.get("style") or storage.DEFAULT_STYLE)
        out["hook_style"] = dict(c.get("hook_style") or storage.DEFAULT_HOOK_STYLE)
        out["fx"] = dict(c.get("fx") or storage.DEFAULT_FX)
        out["exports"] = []
        return out

    part1 = _copy(clip)
    part1.update(
        id=f"c{base}", end=split_t,
        title=f"{clip.get('title') or 'Klip'} (Part 1)",
        endcard="Part 2 👉 Cek profil!",
    )
    t1 = part1.get("teaser") or {}
    if not (isinstance(t1, dict) and t1.get("end") and t1["end"] <= split_t):
        part1["teaser"] = None

    part2 = _copy(clip)
    part2.update(
        id=f"c{base + 1}", start=split_t,
        title=f"{clip.get('title') or 'Klip'} (Part 2)",
        hook=f"Part 2 🔥 {str(clip.get('hook') or '')}".strip()[:200],
        teaser=None, endcard="",
    )

    p["clips"].extend([part1, part2])
    storage.save(p)
    return {"parts": [part1, part2], "split_time": split_t}
