"""Mode Auto-Produce: dari sumber video -> N video siap upload, tanpa buka editor.

Alur: (proses AI jika belum) -> pilih klip skor tertinggi -> render MP4 + thumbnail
+ caption.txt per klip -> simpan rapi di "Siap Upload/<tanggal>/".
"""
import random
import re
import shutil
import time

from .. import config, storage
from . import llm, pipeline, renderer, thumbnail

DEFAULT_HASHTAGS = ["#shorts", "#fyp", "#viral", "#foryou"]
MUSIC_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac"}


def _music_library() -> list[str]:
    mdir = config.DATA_DIR / "assets" / "music"
    if not mdir.exists():
        return []
    # "horor*" = ambience khusus Mode Horor, jangan ikut dirotasi ke video mode lain
    return sorted(f.name for f in mdir.iterdir()
                  if f.suffix.lower() in MUSIC_EXTS and not f.name.lower().startswith("horor"))


class _SubJob:
    """Proksi job: memetakan progres 0..1 sebuah tahap ke rentang [lo, hi] job utama."""

    def __init__(self, outer, lo: float, hi: float, prefix: str = ""):
        self.outer, self.lo, self.hi, self.prefix = outer, lo, hi, prefix

    def set(self, stage=None, progress=None):
        if stage is not None:
            self.outer.set(stage=f"{self.prefix}{stage}" if self.prefix else stage)
        if progress is not None:
            self.outer.set(progress=self.lo + (self.hi - self.lo) * float(progress))


def _slug(text: str, maxlen: int = 40) -> str:
    s = re.sub(r"[^0-9A-Za-z ]+", "", str(text or "video")).strip()
    s = re.sub(r"\s+", "_", s)
    return (s or "video")[:maxlen]


def _unique_base(date_dir, num: int, slug: str) -> str:
    """Nomor urut lanjut dari video yang sudah ada di folder hari ini, jadi tidak pernah menimpa
    (dulu tiap project mulai dari 01 lagi). `num` = nomor minimal (urutan di batch ini)."""
    used = [int(m.group(1)) for f in date_dir.glob("*.mp4") if (m := re.match(r"^(\d{2,3})_", f.name))]
    n = max(num, (max(used) + 1) if used else 1)
    while (date_dir / f"{n:02d}_{slug}.mp4").exists():
        n += 1
    return f"{n:02d}_{slug}"


def _fallback_meta(clip: dict) -> dict:
    return {
        "title": str(clip.get("title") or "Klip")[:100],
        "thumbnail_text": str(clip.get("hook") or clip.get("title") or "")[:100],
        "description": (str(clip.get("hook") or "") + "\n\nFollow untuk konten menarik lainnya!").strip(),
        "hashtags": list(DEFAULT_HASHTAGS),
    }


def _clip_text(pid: str, clip: dict) -> str:
    t = storage.get_transcript(pid) or {"segments": []}
    parts = [
        s["text"].strip()
        for s in t.get("segments", [])
        if s.get("text") and clip["start"] < s["end"] and s["start"] < clip["end"]
    ]
    text = " ".join(parts)
    if not text:
        raise RuntimeError("Transkrip klip kosong.")
    return text


def _update_clip(pid: str, cid: str, patch: dict):
    """Simpan perubahan klip lewat baca-ulang dari disk (renderer/thumbnail juga menulis)."""
    p = storage.get(pid)
    for c in p.get("clips", []):
        if c["id"] == cid:
            c.update(patch)
            break
    storage.save(p)


def produce(job, pid: str, n: int = 3, ratio: str = "9:16") -> dict:
    p = storage.get(pid)
    if not p or not p.get("clips"):
        raise RuntimeError("Project belum punya klip untuk diproduksi.")
    settings = config.load_settings()
    provider = (p.get("options") or {}).get("llm_provider") or settings["llm_provider"]

    n = max(1, min(int(n), 5))
    clips = sorted(p["clips"], key=lambda c: -(c.get("score") or 0))[:n]
    date_dir = config.OUTPUT_DIR / time.strftime("%Y-%m-%d")
    date_dir.mkdir(parents=True, exist_ok=True)
    exports_dir = storage.project_dir(pid) / "exports"

    files = []
    total = len(clips)
    for i, clip in enumerate(clips):
        lo, hi = i / total, (i + 1) / total
        span = hi - lo
        cid = clip["id"]
        tag = f"Video {i + 1}/{total}: "

        # 1. Metadata posting (LLM gagal -> fallback sederhana, produksi jalan terus)
        job.set(stage=f"{tag}judul & hashtag", progress=lo)
        meta = clip.get("meta")
        if not meta:
            try:
                meta = llm.generate_metadata(
                    _clip_text(pid, clip), clip.get("title") or "", provider, settings
                )
            except Exception:  # noqa: BLE001
                meta = _fallback_meta(clip)
            _update_clip(pid, cid, {"meta": meta})

        # 2. Musik latar otomatis: kalau klip belum punya, pilih dari perpustakaan
        #    (rotasi acak antar video biar tidak monoton)
        fx = clip.get("fx") or {}
        if not fx.get("bgm"):
            library = _music_library()
            if library:
                fx = {**fx, "bgm": random.choice(library), "bgm_volume": fx.get("bgm_volume") or 0.12}
                clip["fx"] = fx
                _update_clip(pid, cid, {"fx": fx})

        # 3. Render video (renderer membaca & menyimpan project sendiri)
        rec = renderer.render(
            _SubJob(job, lo + span * 0.08, lo + span * 0.8, prefix=tag),
            pid, cid, ratio, "mp4",
        )

        # 3. Thumbnail dari momen teaser (kalau ada) atau tengah klip
        job.set(stage=f"{tag}thumbnail", progress=lo + span * 0.82)
        teaser = clip.get("teaser") or {}
        frame_t = float(teaser.get("start", 0)) + 0.3 if teaser.get("start") else (
            (float(clip["start"]) + float(clip["end"])) / 2
        )
        trec = thumbnail.generate(
            pid, cid, frame_t,
            text=meta.get("thumbnail_text") or clip.get("hook") or meta.get("title") or "",
            ratio=ratio,
        )

        # 5. Salin ke folder Siap Upload + tulis caption.txt
        job.set(stage=f"{tag}menyalin hasil", progress=lo + span * 0.95)
        base = _unique_base(date_dir, i + 1, _slug(meta.get('title')))
        shutil.copy(exports_dir / rec["file"], date_dir / f"{base}.mp4")
        shutil.copy(exports_dir / trec["file"], date_dir / f"{base}_thumbnail.jpg")

        # Kredit musik CC-BY otomatis (wajib untuk track Kevin MacLeod dkk.)
        desc = meta.get("description", "")
        bgm_name = (clip.get("fx") or {}).get("bgm") or ""
        if "kevinmacleod" in bgm_name.lower().replace(" ", "").replace("_", ""):
            desc = f"{desc}\n\nMusik: Kevin MacLeod (incompetech.com) — CC BY 4.0"

        aff_link = str((p.get("affiliate") or {}).get("link") or "").strip()
        caption = (
            (f"LINK AFFILIATE:\n{aff_link}\n\n" if aff_link else "")
            + f"JUDUL:\n{meta.get('title', '')}\n\n"
            f"DESKRIPSI:\n{desc}\n\n"
            f"HASHTAG:\n{' '.join(meta.get('hashtags') or [])}\n"
        )
        notes = p.get("upload_notes") or []
        if notes:
            caption += "\nCATATAN SAAT UPLOAD:\n" + "".join(f"- {n}\n" for n in notes)
        (date_dir / f"{base}_caption.txt").write_text(caption, encoding="utf-8")
        files.append(f"{base}.mp4")

    out = {"folder": str(date_dir), "files": files, "ts": time.time()}
    p = storage.get(pid)
    p["auto_output"] = out
    p["status"] = "ready"
    p["error"] = ""
    storage.save(p)
    job.set(stage="Selesai — video siap upload", progress=1.0)
    return out


def full_run(job, pid: str, n: int = 3, ratio: str = "9:16") -> dict:
    """Pipeline lengkap: proses AI (jika perlu) lalu produksi batch."""
    try:
        p = storage.get(pid)
        if not p:
            raise RuntimeError("Project tidak ditemukan.")

        ran_pipeline = False
        if not p.get("clips"):
            ran_pipeline = True
            pipeline.process(_SubJob(job, 0.0, 0.55), pid)

        # Tetap tandai processing selama render batch (Studio menampilkan progres)
        p = storage.get(pid)
        p["status"] = "processing"
        storage.save(p)
        return produce(_SubJob(job, 0.55 if ran_pipeline else 0.0, 1.0), pid, n, ratio)
    except Exception as e:  # noqa: BLE001
        try:
            p = storage.get(pid)
            p["status"] = "error"
            p["error"] = f"Auto-Produce gagal: {e}"
            storage.save(p)
        except Exception:  # noqa: BLE001
            pass
        raise
