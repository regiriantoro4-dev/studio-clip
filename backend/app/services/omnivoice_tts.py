"""Narator lokal OmniVoice (k2-fsa) — gratis, jalan di GPU, suara di-clone dari rekaman referensi.

Voice id: "omnivoice:<nama>" -> <voices_dir>/<nama>.wav + <nama>.txt (teks rekaman itu).
OmniVoice ada di venv terpisah (PyTorch CUDA), jadi dipanggil lewat subprocess tts_worker.py.

Sekitar 1 dari 3 generasi bisa meleset (kata hilang/gumaman), jadi tiap hasil dicek:
Whisper mendengarkan ulang, dicocokkan dengan naskah, dan diulang dengan seed lain bila
kemiripan di bawah ambang. Timing kata hasil Whisper sekalian dipakai untuk subtitle.
"""
import difflib
import json
import os
import random
import subprocess
import tempfile
import time
from pathlib import Path

from . import gemini_tts, media

DEFAULTS = {
    "python": r"D:\OmniVoice\venv\Scripts\python.exe",
    "worker": r"D:\OmniVoice\tts_worker.py",
    "voices_dir": r"D:\OmniVoice\voices",
    "hf_home": r"D:\OmniVoice\hf",
}
MIN_MATCH = 0.82
TRIES = 4


def _cfg(settings: dict) -> dict:
    return {**DEFAULTS, **(settings.get("omnivoice") or {})}


def voices(settings: dict) -> list[str]:
    d = Path(_cfg(settings)["voices_dir"])
    return sorted(f.stem for f in d.glob("*.wav") if (d / f"{f.stem}.txt").exists()) if d.exists() else []


def _run_worker(cfg: dict, ref: Path, ref_text: str, speed: float | None, jobs: list[dict]) -> list[dict]:
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump({"ref_audio": str(ref), "ref_text": ref_text, "speed": speed, "jobs": jobs}, f,
                  ensure_ascii=False)
        job_file = f.name
    env = {**os.environ, "HF_HOME": cfg["hf_home"], "HF_HUB_OFFLINE": "1", "PYTHONIOENCODING": "utf-8"}
    try:
        p = subprocess.run([cfg["python"], cfg["worker"], job_file], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", env=env, timeout=900)
    finally:
        os.unlink(job_file)
    res = []
    for line in p.stdout.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                res.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    if not res:
        raise RuntimeError(f"OmniVoice gagal jalan: {(p.stderr or '')[-600:]}")
    return res


def _analyze(script: str, heard: list[dict]) -> tuple[float, bool, list[tuple[int, int]]]:
    """(skor, cacat, rentang_ulang). rentang_ulang = indeks awal-akhir di `heard` dari frasa
    yang diucapkan dua kali (kata ekstra murni) — bisa dipotong dari audio.

    Kemiripan total saja tidak cukup: 4 kata terulang di naskah 95 kata masih skor ~0.98.
    Maka take dengan frasa terulang (>= 2 kata ekstra) atau kata hilang (>= 3 kata) ditandai CACAT
    dan skornya dipaksa di bawah ambang supaya dibuat ulang dengan seed lain.
    """
    a = [n for n in (gemini_tts._norm(t) for t in script.split()) if n]
    b_idx = [j for j, w in enumerate(heard) if gemini_tts._norm(w["w"])]
    b = [gemini_tts._norm(heard[j]["w"]) for j in b_idx]
    if not a or not b:
        return 0.0, True, []
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    score, defect, repeats = sm.ratio(), False, []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        extra = (j2 - j1) - (i2 - i1)
        if tag == "insert" and extra >= 2:
            repeats.append((b_idx[j1], b_idx[j2 - 1]))
            defect = True
        elif tag == "replace" and extra >= 2:
            defect = True
        elif tag in ("delete", "replace") and -extra >= 3:
            defect = True
    if defect:
        score = min(score, MIN_MATCH - 0.03)
    return score, defect, repeats


def _match(script: str, heard: list[dict]) -> float:
    return _analyze(script, heard)[0]


def _cut_repeats(wav: Path, heard: list[dict], repeats: list[tuple[int, int]], out: Path) -> bool:
    """Buang frasa yang terulang dari audio (dari awal kata ekstra pertama sampai awal kata berikutnya)."""
    spans = []
    for j1, j2 in repeats:
        s = max(0.0, heard[j1]["s"] - 0.03)
        e = heard[j2 + 1]["s"] - 0.03 if j2 + 1 < len(heard) else heard[j2]["e"]
        if e > s:
            spans.append(f"between(t,{s:.3f},{e:.3f})")
    if not spans:
        return False
    media.run(["ffmpeg", "-y", "-i", str(wav), "-af",
               f"aselect='not({'+'.join(spans)})',asetpts=N/SR/TB", str(out)])
    return out.exists()


def synthesize(text: str, voice: str, out_path, settings: dict,
               speed: float | None = None) -> tuple[float, list[dict]]:
    cfg = _cfg(settings)
    if not Path(cfg["python"]).exists():
        raise RuntimeError(f"OmniVoice belum terpasang ({cfg['python']}).")
    vdir = Path(cfg["voices_dir"])
    ref, ref_txt = vdir / f"{voice}.wav", vdir / f"{voice}.txt"
    if not ref.exists() or not ref_txt.exists():
        raise RuntimeError(f"Suara OmniVoice '{voice}' tidak ditemukan di {vdir}.")
    ref_text = ref_txt.read_text(encoding="utf-8").strip()

    out_path = Path(out_path)
    best = None  # dict: score, defect, repeats, wav, heard
    last_err = ""
    tmpdir = Path(tempfile.mkdtemp(prefix="omni_"))
    try:
        for attempt in range(TRIES):
            wav = tmpdir / f"take{attempt}.wav"
            r = _run_worker(cfg, ref, ref_text, speed,
                            [{"text": text, "out": str(wav), "seed": random.randint(1, 2 ** 31)}])[0]
            if r.get("error") or not wav.exists():
                last_err = str(r.get("error") or "file audio tidak terbentuk")
                continue
            heard = gemini_tts._heard_words(wav, text, settings)
            if not heard:  # Whisper sedang limit/gangguan: tunggu sebentar, coba sekali lagi
                time.sleep(8)
                heard = gemini_tts._heard_words(wav, text, settings)
            if not heard:
                # QC tidak tersedia (tanpa key Whisper / limit). Jangan buang take & GPU untuk skor 0:
                # pakai take ini apa adanya, timing kata dibagi rata.
                best = {"score": None, "defect": False, "repeats": [], "wav": wav, "heard": []}
                break
            score, defect, repeats = _analyze(text, heard)
            cand = {"score": score, "defect": defect, "repeats": repeats, "wav": wav, "heard": heard}
            if best is None or score > best["score"]:
                best = cand
            if score >= MIN_MATCH:
                break
        if best is None:
            raise RuntimeError(f"OmniVoice tidak menghasilkan audio: {last_err[:200]}")
        if best["repeats"]:  # semua take cacat: potong frasa yang terulang dari take terbaik
            fixed = tmpdir / "fixed.wav"
            if _cut_repeats(best["wav"], best["heard"], best["repeats"], fixed):
                heard = gemini_tts._heard_words(fixed, text, settings)
                score, defect, _ = _analyze(text, heard) if heard else (0.0, True, [])
                # Pakai hasil potong HANYA kalau terbukti lebih baik — kalau "pengulangan" tadi ternyata
                # salah dengar Whisper, memotong justru membuang kata yang benar-benar diucapkan.
                if heard and not defect and score > best["score"]:
                    best.update(wav=fixed, heard=heard, score=score, defect=defect)
        if best["score"] is not None and best["score"] < 0.6:
            raise RuntimeError(f"Narasi OmniVoice tidak jelas setelah {TRIES} percobaan "
                               f"(skor {best['score']:.2f}).")
        media.run(["ffmpeg", "-y", "-i", str(best["wav"]), "-c:a", "libmp3lame", "-b:a", "160k",
                   str(out_path)])
    finally:
        for f in tmpdir.glob("*"):
            f.unlink(missing_ok=True)
        tmpdir.rmdir()

    duration, _, _ = media.probe(out_path)
    words = gemini_tts.align(text, best["heard"], duration)
    if not words:
        raise RuntimeError("OmniVoice: timing kata kosong.")
    return round(max(duration, words[-1]["e"] + 0.2), 3), words
