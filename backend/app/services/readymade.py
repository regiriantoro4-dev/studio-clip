"""Mode Video jadi: video yang sudah siap upload -> dipasang border brand saja.

Tanpa transkripsi, tanpa AI pemotong, tanpa subtitle. Satu video = satu klip utuh
dari awal sampai akhir. Efek yang mengubah isi video (zoom, potong jeda hening,
teaser, progress bar, musik) dimatikan supaya video keluar apa adanya.
"""
import re
import shutil
import time

from .. import config, storage
from . import autoproduce, frames, media, renderer

READY_FX = {
    "zoom": False,
    "cut_silence": False,
    "teaser": False,
    "progress_bar": False,
    "keywords": False,
    "emoji": False,
    "bgm": "",
    "border": True,
    "border_force": True,  # border tetap dipasang walau toggle di Pengaturan mati
}


def nice_title(filename_stem: str) -> str:
    """'video_promo-final 2' -> 'video promo final 2' (judul yang tampil di border)."""
    s = re.sub(r"[_\-.]+", " ", str(filename_stem or "")).strip()
    return re.sub(r"\s+", " ", s) or "Video"


def auto_ratio(w: int, h: int) -> str:
    if not w or not h:
        return "9:16"
    r = h / w
    return "9:16" if r > 1.3 else ("1:1" if r > 0.8 else "16:9")


def _prepare(job, pid: str, theme: str) -> dict:
    """Probe video lalu buat satu klip utuh (sekali saja; dipakai ulang saat proses ulang)."""
    p = storage.get(pid)
    if not p or not p.get("source_file"):
        raise RuntimeError("File video tidak ditemukan.")
    job.set(stage="Cek codec video")
    playable = media.ensure_browser_playable(
        p["source_file"], lambda f: job.set(stage="Konversi HEVC ke H.264 (agar bisa diputar di Studio)", progress=0.03 + 0.3 * f))
    if playable != p["source_file"]:
        p["source_file"] = playable
        storage.save(p)
    dur, w, h = media.probe(p["source_file"])
    p.update(duration=round(dur, 2), width=w, height=h)
    if not p.get("clips"):
        fx = {**storage.DEFAULT_FX, **READY_FX}
        if theme:
            fx["border_theme"] = theme
        ft = str((p.get("options") or {}).get("frame_title") or "").strip()
        if ft:
            fx["frame_title"] = ft  # judul di frame (layer {judul} / papan ornamen)
        p["clips"] = [{
            "id": "c1",
            "start": 0.0,
            "end": round(dur, 2),
            "title": p.get("title") or "Video",
            "hook": "",
            "score": 0,
            "reason": "Video jadi (utuh, tanpa dipotong)",
            "style": dict(storage.DEFAULT_STYLE),
            "hook_style": {**storage.DEFAULT_HOOK_STYLE, "enabled": False},
            "fx": fx,
            "exports": [],
        }]
    storage.save(p)
    if storage.get_transcript(pid) is None:
        storage.save_transcript(pid, {"segments": []})  # tanpa subtitle
    return p


def run_one(job, pid: str, ratio: str = "auto", theme: str = "", index: int = 1) -> str:
    p = storage.get(pid)
    if not p:
        raise RuntimeError("Project tidak ditemukan.")
    try:
        p["status"] = "processing"
        p["error"] = ""
        storage.save(p)
        if not media.has_ffmpeg():
            raise RuntimeError("ffmpeg tidak ditemukan di PATH.")

        job.set(stage="Membaca info video", progress=0.02)
        p = _prepare(job, pid, theme)
        r = ratio if ratio in renderer.RATIOS else auto_ratio(p.get("width"), p.get("height"))
        if ratio not in renderer.RATIOS:
            # Frame upload: rasio ikut bentuk frame-nya supaya frame tidak terpotong
            brand = config.load_settings().get("brand") or {}
            eff = theme or str(brand.get("theme") or "")
            fr = frames.get(eff[len(frames.PREFIX):]) if eff.startswith(frames.PREFIX) else None
            if fr:
                r = auto_ratio(*fr["size"])
        rec = renderer.render(autoproduce._SubJob(job, 0.35, 0.95), pid, "c1", r, "mp4")

        job.set(stage="Menyalin ke folder Siap Upload", progress=0.97)
        date_dir = config.OUTPUT_DIR / time.strftime("%Y-%m-%d")
        date_dir.mkdir(parents=True, exist_ok=True)
        name = f"border_{index:02d}_{autoproduce._slug(p.get('title'))}_{time.strftime('%H%M%S')}.mp4"
        shutil.copy(storage.project_dir(pid) / "exports" / rec["file"], date_dir / name)

        p = storage.get(pid)
        p["auto_output"] = {"folder": str(date_dir), "files": [name], "ts": time.time()}
        p["status"] = "ready"
        p["error"] = ""
        storage.save(p)
        return name
    except Exception as e:  # noqa: BLE001
        p = storage.get(pid) or p
        p["status"] = "error"
        p["error"] = f"Video jadi gagal: {e}"
        storage.save(p)
        raise


def run_batch(job, pids: list[str], ratio: str = "auto", theme: str = "") -> dict:
    """Render beberapa video berurutan (satu ffmpeg pada satu waktu)."""
    total = len(pids)
    done, failed = [], []
    for i, pid in enumerate(pids):
        sub = autoproduce._SubJob(job, i / total, (i + 1) / total,
                                  prefix=f"Video {i + 1}/{total}: " if total > 1 else "")
        try:
            done.append(run_one(sub, pid, ratio, theme, index=i + 1))
        except Exception as e:  # noqa: BLE001  satu gagal, sisanya tetap jalan
            failed.append({"id": pid, "error": str(e)})
    if failed and not done:
        raise RuntimeError(failed[0]["error"])
    job.set(stage="Selesai — video siap upload", progress=1.0)
    return {"files": done, "failed": failed}
