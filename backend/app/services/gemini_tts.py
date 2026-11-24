"""Narator Gemini TTS: intonasi natural yang gayanya bisa diarahkan lewat instruksi.

Gemini tidak memberi timing per kata, jadi audio ditranskrip ulang dengan Whisper
(Groq/OpenAI) lalu timing-nya dipasangkan ke kata-kata NASKAH — ejaan subtitle tetap
persis naskah, bukan tebakan Whisper.
"""
import base64
import difflib
import re
import tempfile
from pathlib import Path

import requests

from . import media, transcriber

# Model 3.1/2.5 mematuhi instruksi gaya "Say ...: <teks>" tanpa membacakannya;
# 3.8 ikut membacakan instruksi/tag, jadi tidak dipakai.
DEFAULT_MODEL = "gemini-3.1-flash-tts-preview"
FALLBACK_MODEL = "gemini-2.5-flash-preview-tts"
DEFAULT_STYLE = (
    "Say in a casual, upbeat, enthusiastic tone, like an Indonesian TikTok creator "
    "recommending a product to a friend, natural and fairly fast"
)


def _request_audio(text: str, voice: str, model: str, key: str, base: str) -> tuple[bytes, str]:
    body = {
        "contents": [{"parts": [{"text": text}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    r = requests.post(
        f"{base}/models/{model}:generateContent",
        json=body, headers={"x-goog-api-key": key}, timeout=180,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"Gemini TTS ({model}) gagal ({r.status_code}): {r.text[:300]}")
    try:
        part = r.json()["candidates"][0]["content"]["parts"][0]["inlineData"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Gemini TTS ({model}) tidak mengembalikan audio.") from e
    return base64.b64decode(part["data"]), part.get("mimeType") or ""


def _to_mp3(raw: bytes, mime: str, out_path):
    """Gemini bisa mengirim WAV utuh atau PCM mentah (audio/L16;rate=24000)."""
    with tempfile.TemporaryDirectory() as td:
        src = Path(td) / "tts.raw"
        src.write_bytes(raw)
        if raw[:4] == b"RIFF":
            fmt = []
        else:
            m = re.search(r"rate=(\d+)", mime)
            fmt = ["-f", "s16le", "-ar", m.group(1) if m else "24000", "-ac", "1"]
        media.run(["ffmpeg", "-y", *fmt, "-i", str(src),
                   "-c:a", "libmp3lame", "-b:a", "128k", str(out_path)])


def _norm(token: str) -> str:
    return re.sub(r"[^0-9a-z]", "", token.lower())


def _spread(tokens: list[str], s: float, e: float) -> list[dict]:
    """Bagi rentang waktu [s,e] ke beberapa kata, proporsional panjang hurufnya."""
    if not tokens:
        return []
    e = max(e, s + 0.12 * len(tokens))
    weights = [max(1, len(_norm(t))) for t in tokens]
    total, acc, out = sum(weights), s, []
    for t, wgt in zip(tokens, weights):
        d = (e - s) * wgt / total
        out.append({"w": t, "s": round(acc, 3), "e": round(acc + d, 3)})
        acc += d
    return out


def align(script: str, heard: list[dict], duration: float) -> list[dict]:
    """Pasangkan timing kata hasil Whisper ke token naskah (difflib per kata)."""
    tokens = script.split()
    if not heard:
        return _spread(tokens, 0.05, max(0.5, duration - 0.2))
    sm = difflib.SequenceMatcher(
        a=[_norm(t) for t in tokens], b=[_norm(w["w"]) for w in heard], autojunk=False
    )
    out = []
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op == "equal":
            out += [{"w": tokens[a1 + k], "s": heard[b1 + k]["s"], "e": heard[b1 + k]["e"]}
                    for k in range(a2 - a1)]
        elif op == "replace":  # mis. naskah "39" vs terdengar "tiga puluh sembilan"
            out += _spread(tokens[a1:a2], heard[b1]["s"], heard[b2 - 1]["e"])
        elif op == "delete":   # kata naskah yang tidak tertangkap Whisper
            s = out[-1]["e"] if out else 0.05
            e = heard[b1]["s"] if b1 < len(heard) else min(duration, s + 0.3 * (a2 - a1))
            out += _spread(tokens[a1:a2], s, e)
        # "insert" (kata ekstra versi Whisper) diabaikan
    # Rapikan: kata berikutnya tidak boleh mulai sebelum kata sebelumnya selesai (subtitle bertumpuk)
    for prev, cur in zip(out, out[1:]):
        if cur["s"] < prev["e"]:
            cur["s"] = prev["e"]
        if cur["e"] < cur["s"] + 0.05:
            cur["e"] = round(cur["s"] + 0.05, 3)
    return out


def _heard_words(path, script: str, settings: dict) -> list[dict]:
    """Timing kata dari Whisper, TANPA prompt naskah.

    Whisper menganggap prompt sebagai "kalimat yang sudah diucapkan sebelumnya":
    - naskah lengkap sebagai prompt -> berhalusinasi ("Sampai jumpa di video selanjutnya") & berhenti di tengah;
    - kalimat pembuka sebagai prompt -> pembuka audio DILEWATI lalu teks prompt dimuntahkan di tengah
      (terbaca sebagai pengulangan palsu).
    Keduanya membuat take bersih dianggap cacat. Tanpa prompt, hasil uji paling akurat (`script` tetap
    diterima untuk kompatibilitas pemanggil)."""
    # Groq (gratis, cepat) -> Whisper lokal (gratis, GPU) -> OpenAI (berbayar, terakhir)
    for provider in ("groq", "local", "openai"):
        if provider != "local" and not (settings["providers"].get(provider) or {}).get("api_key"):
            continue
        try:
            if provider == "local":
                _, words, _ = transcriber._local(path, settings, "id", vocab="")
            else:
                _, words, _ = transcriber._api(path, provider, settings, "id", vocab="")
            if words:
                return words
        except Exception:  # noqa: BLE001 — coba provider berikutnya
            continue
    return []


def synthesize(text: str, voice: str, out_path, settings: dict,
               style: str = DEFAULT_STYLE) -> tuple[float, list[dict]]:
    cfg = settings["providers"].get("gemini") or {}
    key = cfg.get("api_key", "")
    if not key:
        raise RuntimeError("Suara Gemini butuh API key Gemini. Isi di menu Pengaturan.")
    base = (cfg.get("base_url") or "").split("/openai")[0].rstrip("/") \
        or "https://generativelanguage.googleapis.com/v1beta"
    prompt = f"{style}: {text}" if style else text

    models = [cfg.get("tts_model") or DEFAULT_MODEL]
    if FALLBACK_MODEL not in models:
        models.append(FALLBACK_MODEL)
    errors = []
    for model in models:
        try:
            raw, mime = _request_audio(prompt, voice, model, key, base)
            break
        except RuntimeError as e:
            errors.append(str(e))
    else:
        raise RuntimeError(" | ".join(errors))

    _to_mp3(raw, mime, out_path)
    duration, _, _ = media.probe(out_path)
    words = align(text, _heard_words(out_path, text, settings), duration)
    if not words:
        raise RuntimeError("Gemini TTS tidak menghasilkan timing kata.")

    # Pengaman: kalau model sempat mengucapkan instruksi gaya, buang bagian sebelum naskah
    lead = words[0]["s"] - 0.12
    if lead > 0.8:
        tmp = Path(out_path).with_suffix(".full.mp3")
        Path(out_path).replace(tmp)
        media.run(["ffmpeg", "-y", "-ss", f"{lead:.3f}", "-i", str(tmp),
                   "-c:a", "libmp3lame", "-b:a", "128k", str(out_path)])
        tmp.unlink(missing_ok=True)
        words = [{**w, "s": round(w["s"] - lead, 3), "e": round(w["e"] - lead, 3)} for w in words]
        duration, _, _ = media.probe(out_path)
    return round(max(duration, words[-1]["e"] + 0.2), 3), words
