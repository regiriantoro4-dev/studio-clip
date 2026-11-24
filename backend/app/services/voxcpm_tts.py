"""Narator lokal VoxCPM2 (OpenBMB) — gratis, GPU, suara karakter buatan sendiri (22 Nov 2026).

VoxCPM2 ada di venv terpisah (Python 3.12 + PyTorch CUDA) di D:\\ai\\voxcpm, dipanggil lewat subprocess
bicara.py. Suara = D:\\ai\\voxcpm\\suara\\<nama>.json (wav acuan + teks acuan; contoh: narator_horor).
QC sama seperti OmniVoice: hasil ditranskrip lalu dicocokkan ke naskah; take cacat dibuat ulang.
Modul baru; tidak mengubah omnivoice_tts / gemini_tts (hanya memakai fungsi bantunya).
"""
import json
import subprocess
import tempfile
from pathlib import Path

from . import gemini_tts, media
from .omnivoice_tts import MIN_MATCH, _analyze

DEFAULT = {
    "python": r"D:\ai\voxcpm\.venv\Scripts\python.exe",
    "worker": r"D:\ai\voxcpm\bicara.py",
    "voices_dir": r"D:\ai\voxcpm\suara",
    "hf_home": r"D:\ai\hf",
}
TRIES = 3


def _cfg(settings: dict) -> dict:
    return {**DEFAULT, **(settings.get("voxcpm") or {})}


def voices(settings: dict) -> list[str]:
    d = Path(_cfg(settings)["voices_dir"])
    return sorted(p.stem for p in d.glob("*.json")) if d.exists() else []


def _run_worker(cfg: dict, voice: str, baris: list[dict]) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump({"suara": voice, "baris": baris}, f, ensure_ascii=False)
        job = f.name
    try:
        p = subprocess.run([cfg["python"], "-I", cfg["worker"], job], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", stdin=subprocess.DEVNULL, timeout=1800,
                           env={**__import__("os").environ, "HF_HOME": cfg["hf_home"], "PYTHONIOENCODING": "utf-8"})
    finally:
        Path(job).unlink(missing_ok=True)
    akhir = [x for x in (p.stdout or "").splitlines() if x.startswith("{")]
    if p.returncode or not akhir:
        raise RuntimeError(f"VoxCPM gagal jalan: {(p.stderr or '')[-600:]}")
    return json.loads(akhir[-1])


def synthesize(text: str, voice: str, out_path, settings: dict) -> tuple[float, list[dict]]:
    cfg = _cfg(settings)
    if not Path(cfg["python"]).exists():
        raise RuntimeError(f"VoxCPM belum terpasang ({cfg['python']}).")
    if not (Path(cfg["voices_dir"]) / f"{voice}.json").exists():
        raise RuntimeError(f"Suara VoxCPM '{voice}' tidak ditemukan di {cfg['voices_dir']}.")
    out_path = Path(out_path)
    tmpdir = Path(tempfile.mkdtemp(prefix="voxcpm_"))
    best = None
    try:
        for attempt in range(TRIES):
            wav = tmpdir / f"take{attempt}.wav"
            _run_worker(cfg, voice, [{"teks": text, "out": str(wav)}])
            if not wav.exists():
                continue
            heard = gemini_tts._heard_words(wav, text, settings)
            if not heard:   # QC tidak tersedia: pakai take ini, timing kata dibagi rata
                best = {"score": None, "wav": wav, "heard": []}
                break
            score, defect, _ = _analyze(text, heard)
            if best is None or score > best["score"]:
                best = {"score": score, "wav": wav, "heard": heard}
            if score >= MIN_MATCH and not defect:
                break
        if best is None:
            raise RuntimeError("VoxCPM tidak menghasilkan audio.")
        if best["score"] is not None and best["score"] < 0.6:
            raise RuntimeError(f"Narasi VoxCPM tidak jelas setelah {TRIES} percobaan (skor {best['score']:.2f}).")
        media.run(["ffmpeg", "-y", "-i", str(best["wav"]), "-c:a", "libmp3lame", "-b:a", "160k", str(out_path)])
    finally:
        for f in tmpdir.glob("*"):
            f.unlink(missing_ok=True)
        tmpdir.rmdir()
    duration, _, _ = media.probe(out_path)
    words = gemini_tts.align(text, best["heard"], duration)
    if not words:
        raise RuntimeError("VoxCPM: timing kata kosong.")
    return round(max(duration, words[-1]["e"] + 0.2), 3), words
