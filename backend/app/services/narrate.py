"""Mode Narasi (edisi film): film -> naskah alur cerita AI -> suara narator Indonesia
(Edge TTS, gratis) -> klip bernarasi dengan caption per kata yang sinkron sempurna.

Timing kata datang langsung dari event WordBoundary TTS — tanpa transkripsi.
"""
import asyncio
import json

from .. import config, storage
from . import autoproduce, downloader, llm, media
from .autoproduce import _SubJob
from .llm import _extract_json_array, chat_fb

NARRATE_SYSTEM_PROMPT = (
    "Kamu adalah penulis naskah video pendek 'alur cerita film' berbahasa Indonesia yang "
    "sangat viral. Gaya bahasamu santai, dramatis, penuh curiosity — seperti narator "
    "konten TikTok/Shorts jutaan views. Kamu selalu membalas hanya dengan JSON valid."
)


def _script_prompt(film_title: str, context: str, n: int, film_minutes: int) -> str:
    ctx = f"\nKonteks tambahan dari pengguna: {context}\n" if context.strip() else ""
    return f"""Film: "{film_title}" (durasi ±{film_minutes} menit).{ctx}
Buat {n} naskah narasi video pendek (Shorts/TikTok) tentang film ini, masing-masing dengan SUDUT BERBEDA
(mis. momen paling ikonik, alur bagian awal, klimaks, fakta menarik produksi, kenapa film ini legendaris).

Aturan tiap naskah:
1. "script": narasi 70-100 kata, kalimat pendek-pendek, bahasa Indonesia santai.
   - Kalimat PERTAMA wajib hook (formula: "Film ini...", "Detik-detik...", "Tahun {'{tahun}'} film ini bikin geger...").
   - Bangun penasaran, taruh payoff/twist menjelang akhir.
   - Kalimat TERAKHIR ajakan singkat (mis. "Follow untuk alur film jadul lainnya!").
   - JANGAN bocorkan seluruh ending kalau naskah lain akan membahasnya.
2. "title": judul video maks 8 kata + 1 emoji (formula viral, jangan clickbait bohong).
3. "thumbnail_text": teks thumbnail maks 10 kata, provokatif.
4. "description": 2-3 kalimat + ajakan follow.
5. "hashtags": 10-12 hashtag (campuran #shorts #fyp + niche film, mis. #filmjadul #alurceritafilm #hororklasik).
6. "scene_from_pct" & "scene_to_pct": perkiraan bagian film (persen 0-95) yang paling cocok jadi latar visual naskah ini.
   Tiap naskah pakai rentang BERBEDA supaya footage tidak sama.

Balas HANYA JSON array {n} objek:
[{{"title": "...", "script": "...", "thumbnail_text": "...", "description": "...", "hashtags": ["#shorts"], "scene_from_pct": 5, "scene_to_pct": 20}}]"""


def generate_scripts(film_title: str, context: str, n: int, film_minutes: int,
                     provider: str, settings: dict) -> list[dict]:
    content = chat_fb(settings, provider, [
        {"role": "system", "content": NARRATE_SYSTEM_PROMPT},
        {"role": "user", "content": _script_prompt(film_title, context, n, film_minutes)},
    ], temperature=0.75, max_tokens=4096)
    out = []
    for item in _extract_json_array(content):
        if not isinstance(item, dict) or not str(item.get("script") or "").strip():
            continue
        out.append({
            "title": str(item.get("title") or film_title)[:120],
            "script": str(item.get("script"))[:1500],
            "thumbnail_text": str(item.get("thumbnail_text") or "")[:120],
            "description": str(item.get("description") or "")[:1000],
            "hashtags": [
                str(h).strip()[:40] for h in (item.get("hashtags") or [])
                if isinstance(h, str) and h.strip().startswith("#")
            ][:14],
            "scene_from_pct": float(item.get("scene_from_pct") or 0),
            "scene_to_pct": float(item.get("scene_to_pct") or 0),
        })
    if not out:
        raise RuntimeError("LLM tidak menghasilkan naskah narasi.")
    return out[:n]


def synthesize(text: str, voice: str, out_path, rate: str = "+8%", pitch: str = "+0Hz",
               gemini_style: str | None = None, omni_speed: float | None = None) -> tuple[float, list[dict]]:
    """Text-to-speech -> file mp3 + timing per kata.

    Voice "gemini:<Nama>" memakai Gemini TTS; selain itu Edge TTS (timing dari WordBoundary).
    rate/pitch hanya untuk Edge; gemini_style = instruksi gaya baca untuk Gemini.
    """
    if voice.startswith("omnivoice:"):  # narator lokal (GPU), suara di-clone dari rekaman referensi
        from . import omnivoice_tts
        return omnivoice_tts.synthesize(text, voice.split(":", 1)[1], out_path, config.load_settings(),
                                        speed=omni_speed)
    if voice.startswith("gemini:"):
        from . import gemini_tts
        kw = {"style": gemini_style} if gemini_style else {}
        return gemini_tts.synthesize(text, voice.split(":", 1)[1], out_path, config.load_settings(), **kw)

    import edge_tts

    async def _run():
        words = []
        # edge-tts >= 7 default-nya SentenceBoundary; caption per kata butuh WordBoundary
        comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
        with open(out_path, "wb") as f:
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    s = chunk["offset"] / 1e7
                    d = chunk["duration"] / 1e7
                    token = str(chunk.get("text") or "").strip()
                    if token:
                        words.append({"w": token, "s": round(s, 3), "e": round(s + d, 3)})
        return words

    words = asyncio.run(_run())
    if not words:
        raise RuntimeError("TTS tidak menghasilkan audio/timing kata.")
    duration = words[-1]["e"] + 0.35
    return round(duration, 3), words


def full_run(job, pid: str, film_title: str, context: str = "",
             n: int = 3, voice: str = "id-ID-ArdiNeural") -> dict:
    """Pipeline narasi lengkap: (unduh) -> naskah AI -> TTS -> rakit klip -> produksi batch."""
    try:
        p = storage.get(pid)
        if not p:
            raise RuntimeError("Project tidak ditemukan.")
        settings = config.load_settings()
        provider = (p.get("options") or {}).get("llm_provider") or settings["llm_provider"]
        n = max(1, min(int(n), 5))

        # 1. Sumber film
        if p["source_type"] == "youtube" and not p.get("source_file"):
            job.set(stage="Mengunduh film", progress=0.02)
            path, _ = downloader.download(
                p["source_url"], storage.project_dir(pid),
                lambda fr: job.set(progress=0.02 + 0.1 * fr),
            )
            p["source_file"] = path
            storage.save(p)
        if not p.get("source_file"):
            raise RuntimeError("File film tidak ditemukan.")

        job.set(stage="Membaca info film", progress=0.13)
        dur, w, h = media.probe(p["source_file"])
        if dur < 120:
            raise RuntimeError("Durasi film terlalu pendek untuk mode narasi (min 2 menit).")
        p.update(duration=round(dur, 2), width=w, height=h)
        storage.save(p)

        # 2. Naskah AI
        job.set(stage="AI menulis naskah alur cerita", progress=0.16)
        scripts = generate_scripts(film_title, context, n, int(dur // 60), provider, settings)

        # 3. TTS + rakit klip (timing kata dari TTS, bukan transkripsi)
        clips, segments = [], []
        used_windows = []
        for i, sc in enumerate(scripts):
            job.set(stage=f"Narator membaca naskah {i + 1}/{len(scripts)}",
                    progress=0.3 + 0.22 * i / len(scripts))
            nar_name = f"narration_c{i + 1}.mp3"
            nar_dur, tts_words = synthesize(sc["script"], voice, storage.project_dir(pid) / nar_name)

            clip_len = nar_dur + 0.6
            start = max(0.0, min(dur * sc["scene_from_pct"] / 100.0, dur - clip_len - 1))
            # Hindari footage tumpang tindih dengan naskah sebelumnya
            for (us, ue) in used_windows:
                if not (start + clip_len <= us or start >= ue):
                    start = min(ue + 2.0, max(0.0, dur - clip_len - 1))
            end = start + clip_len
            used_windows.append((start, end))

            words = [
                {"w": tw["w"], "s": round(start + tw["s"], 3), "e": round(start + tw["e"], 3)}
                for tw in tts_words
            ]
            segments.append({"start": round(start, 3), "end": round(end, 3),
                             "text": sc["script"], "words": words})
            clips.append({
                "id": f"c{i + 1}",
                "start": round(start, 2), "end": round(end, 2),
                "title": sc["title"], "hook": "",
                "score": 95 - i * 5,  # jaga urutan naskah saat produksi
                "reason": "Mode narasi film",
                "style": dict(storage.DEFAULT_STYLE),
                "hook_style": {**storage.DEFAULT_HOOK_STYLE, "enabled": False},
                "fx": {**storage.DEFAULT_FX, "cut_silence": False, "teaser": False,
                       "keywords": False, "emoji": False},
                "narration": {"file": nar_name, "duration": nar_dur, "voice": voice},
                "meta": {
                    "title": sc["title"],
                    "thumbnail_text": sc["thumbnail_text"] or sc["title"],
                    "description": sc["description"],
                    "hashtags": sc["hashtags"] or list(autoproduce.DEFAULT_HASHTAGS),
                },
                "exports": [],
            })

        storage.save_transcript(pid, {"language": "id", "segments": segments})
        p = storage.get(pid)
        p["clips"] = clips
        p["status"] = "processing"
        p["mode"] = "narasi"
        storage.save(p)

        # 4. Produksi batch (render + thumbnail + caption ke Siap Upload)
        return autoproduce.produce(_SubJob(job, 0.55, 1.0), pid, n=len(clips))
    except Exception as e:  # noqa: BLE001
        try:
            p = storage.get(pid)
            p["status"] = "error"
            p["error"] = f"Mode narasi gagal: {e}"
            storage.save(p)
        except Exception:  # noqa: BLE001
            pass
        raise
