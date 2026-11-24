"""Transkripsi audio dengan word-level timestamps.

Provider: groq / openai (endpoint kompatibel OpenAI) atau local (faster-whisper).
Video panjang otomatis dipotong per ~14 menit agar aman dari limit upload API.
Kalau provider API gagal (kuota/error/jaringan), potongan itu ditranskrip ulang dengan Whisper lokal
(GPU NVIDIA bila ada, kalau tidak CPU) — gratis, bisa dimatikan lewat setelan transcribe_fallback_local.
"""
import glob
import os
import subprocess
import sys
import threading
from pathlib import Path

import requests

from . import media

CHUNK_SECONDS = 840  # 14 menit per potongan audio

_LOCAL_MODELS: dict = {}
_LOCAL_LOCK = threading.Lock()  # satu transkripsi lokal sekaligus (VRAM 8 GB dibagi dengan render/ComfyUI)
_DLL_READY = False


def transcribe(job, workdir, source, provider, settings, language=None,
               prog_base=0.25, prog_span=0.45, vocab: str = "") -> dict:
    workdir = Path(workdir)
    duration, _, _ = media.probe(source)
    if duration <= 0:
        raise RuntimeError("Durasi video tidak terbaca — file mungkin rusak.")

    chunks = []
    t = 0.0
    while t < duration:
        chunks.append((t, min(CHUNK_SECONDS, duration - t)))
        t += CHUNK_SECONDS

    all_words, all_segments = [], []
    detected_lang = "" if (not language or language == "auto") else language
    lang_param = None if (not language or language == "auto") else language

    for i, (cs, cd) in enumerate(chunks):
        job.set(
            stage=f"Transkripsi audio ({i + 1}/{len(chunks)})",
            progress=prog_base + prog_span * i / len(chunks),
        )
        apath = workdir / f"audio_{i:02d}.mp3"
        media.extract_audio(source, apath, cs, cd)

        if provider == "local":
            segs, words, lang = _local(apath, settings, lang_param, vocab)
        else:
            try:
                segs, words, lang = _api(apath, provider, settings, lang_param, vocab)
            except Exception as api_err:  # noqa: BLE001
                if not settings.get("transcribe_fallback_local", True):
                    raise
                job.set(stage=f"Transkripsi audio ({i + 1}/{len(chunks)}) · {provider} gagal, pakai Whisper lokal")
                try:
                    segs, words, lang = _local(apath, settings, lang_param, vocab)
                except Exception as local_err:  # noqa: BLE001
                    raise RuntimeError(f"{api_err} | Cadangan Whisper lokal juga gagal: {local_err}") from local_err

        for s in segs:
            s["start"] += cs
            s["end"] += cs
        for w in words:
            w["s"] += cs
            w["e"] += cs
        all_segments.extend(segs)
        all_words.extend(words)
        detected_lang = detected_lang or lang
        try:
            apath.unlink()
        except OSError:
            pass

    segments = _assemble(all_segments, all_words)
    if not segments:
        raise RuntimeError("Transkrip kosong — video mungkin tidak berisi ucapan.")
    return {"language": detected_lang or "id", "segments": segments}


def _api(path, provider, settings, language, vocab=""):
    cfg = settings["providers"].get(provider) or {}
    key = cfg.get("api_key", "")
    if not key:
        raise RuntimeError(
            f"API key {provider} belum diisi. Buka menu Pengaturan lalu masukkan key-nya."
        )
    url = cfg.get("base_url", "").rstrip("/") + "/audio/transcriptions"
    data = [
        ("model", cfg.get("stt_model") or "whisper-large-v3"),
        ("response_format", "verbose_json"),
        ("timestamp_granularities[]", "word"),
        ("timestamp_granularities[]", "segment"),
    ]
    if language:
        data.append(("language", language))
    if vocab.strip():
        # Prompt bias Whisper: bantu ejaan nama/istilah/slang yang sering salah tulis
        data.append(("prompt", vocab.strip()[:800]))
    with open(path, "rb") as f:
        r = requests.post(
            url,
            headers={"Authorization": f"Bearer {key}"},
            data=data,
            files={"file": (Path(path).name, f, "audio/mpeg")},
            timeout=600,
        )
    if r.status_code >= 400:
        raise RuntimeError(f"Transkripsi {provider} gagal ({r.status_code}): {r.text[:300]}")
    j = r.json()
    words = [
        {"w": (w.get("word") or "").strip(), "s": float(w["start"]), "e": float(w["end"])}
        for w in (j.get("words") or [])
        if (w.get("word") or "").strip()
    ]
    segs = [
        {"start": float(s["start"]), "end": float(s["end"]), "text": (s.get("text") or "").strip()}
        for s in (j.get("segments") or [])
    ]
    if not segs and j.get("text"):
        end = words[-1]["e"] if words else 0.0
        segs = [{"start": 0.0, "end": end, "text": j["text"].strip()}]
    return segs, words, (j.get("language") or "")


def _cuda_dlls():
    """Windows: DLL cuBLAS/cuDNN dari paket pip nvidia-* harus didaftarkan sebelum ctranslate2 dimuat."""
    global _DLL_READY
    if _DLL_READY:
        return
    _DLL_READY = True
    for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
        try:
            os.add_dll_directory(d)
        except (OSError, AttributeError):
            pass
        os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def _load_audio(path):
    """Decode lewat ffmpeg -> float32 16 kHz mono. Tidak lewat PyAV: PyAV baru menolak argumen
    `metadata_errors` yang dipakai faster-whisper 1.2.1."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1",
                          "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def _local_model(settings, cpu_only=False):
    """GPU dulu (model whisper_gpu_model, float16), gagal -> CPU (whisper_local_model, int8)."""
    _cuda_dlls()
    try:
        import ctranslate2
        from faster_whisper import WhisperModel
    except ImportError:
        raise RuntimeError(
            "faster-whisper belum terpasang. Jalankan: pip install faster-whisper "
            "(atau pilih provider cloud seperti Groq di Pengaturan)."
        ) from None
    tries = []
    if not cpu_only and (settings.get("whisper_device") or "auto") in ("auto", "cuda"):
        try:
            if ctranslate2.get_cuda_device_count() > 0:
                tries.append((settings.get("whisper_gpu_model") or "large-v3-turbo", "cuda", "float16"))
        except Exception:  # noqa: BLE001 — driver/DLL bermasalah -> CPU
            pass
    tries.append((settings.get("whisper_local_model") or "small", "cpu", "int8"))
    last = None
    for name, device, ctype in tries:
        key = (name, device)
        if key in _LOCAL_MODELS:
            return _LOCAL_MODELS[key]
        try:
            _LOCAL_MODELS[key] = WhisperModel(name, device=device, compute_type=ctype)
            return _LOCAL_MODELS[key]
        except Exception as e:  # noqa: BLE001 — mis. VRAM penuh dipakai render -> coba CPU
            last = e
    raise RuntimeError(f"Whisper lokal tidak bisa dimuat: {last}")


def _local(path, settings, language, vocab=""):
    with _LOCAL_LOCK:
        audio = _load_audio(path)
        try:
            return _run_local(_local_model(settings), audio, language, vocab)
        except Exception:  # noqa: BLE001 — GPU gagal di tengah jalan (mis. VRAM penuh) -> ulang di CPU
            cpu = _local_model(settings, cpu_only=True)
            return _run_local(cpu, audio, language, vocab)


def _run_local(model, audio, language, vocab):
    segments, info = model.transcribe(
        audio, language=language, word_timestamps=True, vad_filter=True,
        initial_prompt=(vocab.strip()[:800] or None),
    )
    segs, words = [], []
    for s in segments:  # generator: decoding sungguhan terjadi di sini
        segs.append({"start": float(s.start), "end": float(s.end), "text": s.text.strip()})
        for w in (s.words or []):
            token = (w.word or "").strip()
            if token:
                words.append({"w": token, "s": float(w.start), "e": float(w.end)})
    return segs, words, (info.language or "")


def _assemble(segments, words):
    """Tempelkan kata ke segmennya; kalau provider tak memberi kata, sintesis dari teks."""
    segments = sorted(segments, key=lambda s: s["start"])
    words = sorted(words, key=lambda w: w["s"])
    out, wi = [], 0
    for seg in segments:
        sw = []
        while wi < len(words) and words[wi]["s"] < seg["end"] - 0.01:
            if words[wi]["e"] > seg["start"]:
                sw.append(words[wi])
            wi += 1
        if not sw and seg.get("text"):
            sw = _synthesize_words(seg)
        if not seg.get("text") and sw:
            seg["text"] = " ".join(w["w"] for w in sw)
        if seg.get("text"):
            out.append({**seg, "words": sw})
    return out


def _synthesize_words(seg):
    tokens = [t for t in seg["text"].split() if t]
    if not tokens:
        return []
    dur = max(0.2, seg["end"] - seg["start"])
    step = dur / len(tokens)
    return [
        {"w": t, "s": round(seg["start"] + i * step, 3), "e": round(seg["start"] + (i + 1) * step, 3)}
        for i, t in enumerate(tokens)
    ]
