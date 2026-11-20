"""Pipeline utama: (unduh) -> probe -> transkripsi -> deteksi momen viral."""
from .. import config, storage
from . import downloader, llm, media, transcriber


def process(job, pid: str):
    p = storage.get(pid)
    if not p:
        raise RuntimeError("Project tidak ditemukan.")
    opts = p.get("options") or {}
    settings = config.load_settings()

    stt_provider = opts.get("transcribe_provider") or settings["transcribe_provider"]
    llm_provider = opts.get("llm_provider") or settings["llm_provider"]
    language = opts.get("language") or settings.get("language") or "auto"
    n_clips = int(opts.get("n_clips") or 5)
    min_dur = int(opts.get("min_dur") or 15)
    max_dur = int(opts.get("max_dur") or 60)

    try:
        if not media.has_ffmpeg():
            raise RuntimeError(
                "ffmpeg tidak ditemukan di PATH. Install: winget install Gyan.FFmpeg, "
                "lalu buka ulang terminal & jalankan ulang backend."
            )

        p["status"] = "processing"
        p["error"] = ""
        storage.save(p)

        if p["source_type"] == "youtube" and not p.get("source_file"):
            job.set(stage="Mengunduh video YouTube", progress=0.02)
            path, title = downloader.download(
                p["source_url"],
                storage.project_dir(pid),
                lambda frac: job.set(progress=0.02 + 0.16 * frac),
            )
            p["source_file"] = path
            if not p.get("title") or p["title"] == p.get("source_url"):
                p["title"] = title
            storage.save(p)

        if not p.get("source_file"):
            raise RuntimeError("File video sumber tidak ditemukan.")

        job.set(stage="Cek codec video", progress=0.19)
        playable = media.ensure_browser_playable(
            p["source_file"],
            lambda f: job.set(stage="Konversi HEVC ke H.264 (agar bisa diputar di Studio)", progress=0.19),
        )
        if playable != p["source_file"]:
            p["source_file"] = playable
            storage.save(p)

        job.set(stage="Membaca info video", progress=0.2)
        dur, w, h = media.probe(p["source_file"])
        p.update(duration=round(dur, 2), width=w, height=h)
        storage.save(p)

        vocab = str(opts.get("vocab") or "")
        existing = storage.get_transcript(pid)
        if existing and existing.get("segments"):
            # Retry setelah gagal: transkrip sudah ada, tak perlu transkripsi ulang
            transcript = existing
            job.set(stage="Transkrip sudah ada — langsung cari momen", progress=0.72)
        else:
            transcript = transcriber.transcribe(
                job, storage.project_dir(pid), p["source_file"],
                stt_provider, settings, language,
                prog_base=0.22, prog_span=0.46, vocab=vocab,
            )
            storage.save_transcript(pid, transcript)

            # Koreksi typo via LLM (opsional, default aktif). Gagal koreksi tidak
            # menggagalkan pipeline — transkrip asli tetap dipakai.
            if opts.get("fix_typos", True):
                job.set(stage="Koreksi typo transkrip (AI)", progress=0.69)
                try:
                    transcript, _ = llm.fix_transcript(
                        transcript, llm_provider, settings, vocab=vocab,
                        progress_cb=lambda f: job.set(progress=0.69 + 0.05 * f),
                    )
                    storage.save_transcript(pid, transcript)
                except Exception:  # noqa: BLE001
                    pass

        job.set(stage="AI mencari momen viral", progress=0.75)
        clips = llm.find_clips(
            transcript, llm_provider, settings, dur,
            n_clips=n_clips, min_dur=min_dur, max_dur=max_dur,
        )
        for i, c in enumerate(clips):
            c["id"] = f"c{i + 1}"
            c["style"] = dict(storage.DEFAULT_STYLE)
            c["hook_style"] = dict(storage.DEFAULT_HOOK_STYLE)
            c["fx"] = dict(storage.DEFAULT_FX)
            c["exports"] = []

        # Anotasi kata kunci & emoji (opsional — gagal tidak menggagalkan pipeline)
        job.set(stage="AI memilih kata kunci & emoji", progress=0.9)
        try:
            llm.annotate_words(
                transcript, clips, llm_provider, settings,
                progress_cb=lambda f: job.set(progress=0.9 + 0.08 * f),
            )
            storage.save_transcript(pid, transcript)
        except Exception:  # noqa: BLE001
            pass

        p = storage.get(pid)
        p["clips"] = clips
        p["status"] = "ready"
        p["error"] = ""
        storage.save(p)
        job.set(stage="Selesai", progress=1.0)
        return {"clips": len(clips)}

    except Exception as e:  # noqa: BLE001
        p = storage.get(pid) or p
        p["status"] = "error"
        p["error"] = str(e)
        storage.save(p)
        raise
