"""Deteksi momen viral & koreksi typo transkrip lewat LLM
(Groq / Gemini / OpenAI / Moonshot — semua via endpoint kompatibel OpenAI)."""
import bisect
import difflib
import json
import re
import time

import requests

SYSTEM_PROMPT = (
    "Kamu adalah editor video short-form profesional (TikTok, Reels, YouTube Shorts) "
    "yang sangat ahli menemukan momen paling menarik dan berpotensi viral dari video panjang. "
    "Kamu selalu membalas hanya dengan JSON yang valid."
)


def _retry_wait_seconds(resp, attempt: int) -> float:
    """Berapa lama harus menunggu sebelum retry (dari header/pesan server, atau backoff)."""
    ra = resp.headers.get("Retry-After")
    if ra:
        try:
            return float(ra) + 1
        except ValueError:
            pass
    m = re.search(r"try again in ([\d.]+)\s*s", resp.text or "", re.IGNORECASE)
    if m:
        return float(m.group(1)) + 1
    return min(60.0, 5.0 * (2 ** attempt))


def _fmt_wait(sec: float) -> str:
    sec = int(sec)
    if sec >= 3600:
        return f"{sec // 3600}j {(sec % 3600) // 60}m"
    if sec >= 60:
        return f"{sec // 60}m {sec % 60}d"
    return f"{sec} detik"


def chat(cfg: dict, messages: list, temperature=0.4, max_tokens=4096, retries=4) -> str:
    key = cfg.get("api_key", "")
    if not key:
        raise RuntimeError("API key LLM belum diisi. Buka menu Pengaturan lalu masukkan key-nya.")
    if cfg.get("api") == "anthropic":  # Claude: SDK resmi, bukan endpoint kompatibel OpenAI
        from . import claude_llm
        return claude_llm.chat(cfg, messages, max_tokens=max_tokens)
    url = cfg.get("base_url", "").rstrip("/") + "/chat/completions"
    body = {
        "model": cfg.get("llm_model"),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    last = None
    for attempt in range(retries + 1):
        try:
            r = requests.post(
                url,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=body,
                timeout=300,
            )
        except requests.RequestException as e:
            # Server tidak menjawab/putus: jadikan RuntimeError supaya chat_fb pindah ke provider berikutnya
            # (sebelumnya exception ini lolos dan menggagalkan seluruh job).
            raise RuntimeError(f"server {cfg.get('llm_model')} tidak menjawab ({type(e).__name__})") from e
        if r.status_code < 400:
            return r.json()["choices"][0]["message"]["content"]
        last = r
        # 429 (rate limit) & 5xx: tunggu sesuai instruksi server lalu coba lagi.
        # Limit panjang (harian) tidak berguna di-retry — langsung gagal cepat.
        if (r.status_code == 429 or r.status_code >= 500) and attempt < retries:
            wait = _retry_wait_seconds(r, attempt)
            if r.status_code == 429 and wait > 180:
                break
            time.sleep(min(90.0, wait))
            continue
        break

    if last.status_code == 429:
        wait = _retry_wait_seconds(last, 0)
        text = (last.text or "").lower()
        scope = "HARIAN" if ("per day" in text or "tpd" in text) else "sementara"
        raise RuntimeError(
            f"limit {scope} model {cfg.get('llm_model')} tercapai, reset dalam ±{_fmt_wait(wait)}"
        )
    raise RuntimeError(f"LLM gagal ({last.status_code}): {last.text[:300]}")


# Urutan cadangan saat provider utama gagal/limit (hanya yang API key-nya terisi)
# Gratis dulu, lalu OpenAI (murah), Claude paling akhir (mahal). Moonshot tidak ikut: saldo habis (16 Nov 2026).
# 17 Nov 2026 (pemilik): Groq di depan — Gemini sempat diam 5 menit (ReadTimeout), Groq menjawab ±10 dtk.
PROVIDER_FALLBACK_ORDER = ["groq", "gemini", "openrouter", "openai", "anthropic"]
AUTO = "auto"  # combo: mulai dari awal urutan di atas (Claude berbayar, jadi paling akhir)


def provider_order(provider: str) -> list[str]:
    if not provider or provider == AUTO:
        return list(PROVIDER_FALLBACK_ORDER)
    return [provider] + [n for n in PROVIDER_FALLBACK_ORDER if n != provider]


def chat_fb(settings: dict, provider: str, messages: list,
            temperature=0.4, max_tokens=4096) -> str:
    """chat() dengan fallback otomatis ke provider lain yang punya API key."""
    order = provider_order(provider)
    errors, attempted = [], False
    for name in order:
        cfg = settings["providers"].get(name) or {}
        if not cfg.get("api_key"):
            continue
        attempted = True
        try:
            return chat(cfg, messages, temperature=temperature, max_tokens=max_tokens)
        except RuntimeError as e:  # noqa: PERF203
            errors.append(f"{name}: {e}")
    if not attempted:
        raise RuntimeError("Belum ada API key LLM yang diisi. Buka menu Pengaturan.")
    raise RuntimeError(
        "Semua provider LLM gagal — " + " | ".join(errors)[:500]
        + ". Solusi: isi API key provider cadangan di Pengaturan (mis. Gemini — gratis, kuota "
          "terpisah), ganti model Groq ke openai/gpt-oss-20b (limit terpisah), atau tunggu reset."
    )


def _extract_json_array(text: str) -> list:
    text = re.sub(r"```(?:json)?", "", text)
    m = re.search(r"\[[\s\S]*\]", text)
    if not m:
        raise RuntimeError("LLM tidak mengembalikan JSON yang valid.")
    return json.loads(m.group(0))


def _extract_json_object(text: str) -> dict:
    text = re.sub(r"```(?:json)?", "", text)
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise RuntimeError("LLM tidak mengembalikan JSON yang valid.")
    return json.loads(m.group(0))


def _build_prompt(lines_text: str, n: int, min_dur: int, max_dur: int) -> str:
    return f"""Berikut transkrip sebuah video. Format tiap baris: [detik_mulai-detik_selesai] teks

{lines_text}

Tugas: pilih {n} klip TERBAIK yang paling berpotensi viral / masuk FYP.

Aturan:
1. Durasi tiap klip antara {min_dur} dan {max_dur} detik.
2. Mulai dan akhiri klip di batas kalimat yang natural (jangan memotong di tengah kalimat).
3. Prioritaskan momen dengan: emosi kuat, cerita menarik, fakta mengejutkan, perilaku/kisah manusia yang aneh-unik-ekstrem, tips praktis, humor, atau opini kontroversial.
4. "hooks" = 3 variasi hook (masing-masing maks 9 kata, bahasa sama dengan bahasa video) dengan formula berbeda:
   - variasi 1: curiosity gap (pola: "Orang ini tidak sadar apa yang akan terjadi...")
   - variasi 2: pertanyaan provokatif
   - variasi 3: pernyataan mengejutkan/shock
5. "title" = judul singkat dan menarik untuk klip.
6. "score" = perkiraan potensi viral 1-100 (nilai jujur, jangan semua tinggi).
7. "reason" = alasan singkat kenapa klip ini menarik.
8. "teaser_start" & "teaser_end" = rentang 2-4 detik berisi kalimat PALING dramatis/mengejutkan DI DALAM klip (bukan kalimat pembuka klip) — akan dipakai sebagai umpan cold-open di detik pertama.

Balas HANYA dengan JSON array tanpa teks lain, contoh format:
[{{"start": 12.4, "end": 45.0, "title": "...", "hooks": ["...", "...", "..."], "score": 87, "reason": "...", "teaser_start": 30.2, "teaser_end": 33.0}}]"""


def find_clips(transcript: dict, provider: str, settings: dict, duration: float,
               n_clips=5, min_dur=15, max_dur=60) -> list[dict]:
    cfg = settings["providers"].get(provider) or {}
    segs = [s for s in transcript.get("segments", []) if (s.get("text") or "").strip()]
    if not segs:
        raise RuntimeError("Transkrip kosong — tidak ada yang bisa dianalisis.")

    lines = [f"[{s['start']:.1f}-{s['end']:.1f}] {s['text'].strip()}" for s in segs]

    # Transkrip panjang dipecah per ~12k karakter, kandidat digabung lalu diranking.
    windows, cur, size = [], [], 0
    for ln in lines:
        cur.append(ln)
        size += len(ln) + 1
        if size > 12000:
            windows.append(cur)
            cur, size = [], 0
    if cur:
        windows.append(cur)

    candidates, errors = [], []
    for wlines in windows:
        prompt = _build_prompt("\n".join(wlines), n_clips, min_dur, max_dur)
        try:
            content = chat_fb(settings, provider, [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ])
            for c in _extract_json_array(content):
                if isinstance(c, dict) and "start" in c and "end" in c:
                    candidates.append(c)
        except Exception as e:  # noqa: BLE001
            errors.append(str(e))
            if len(windows) == 1:
                raise
    if not candidates:
        raise RuntimeError("LLM tidak menemukan klip. " + ("; ".join(errors))[:300])

    starts = [s["start"] for s in segs]
    ends = [s["end"] for s in segs]
    cleaned = []
    for c in candidates:
        try:
            st, en = float(c["start"]), float(c["end"])
        except (TypeError, ValueError):
            continue
        st, en = _snap(st, en, starts, ends, duration, min_dur, max_dur)
        if en - st < 3:
            continue
        hooks = [
            str(h).strip()[:200]
            for h in (c.get("hooks") or [])
            if isinstance(h, str) and h.strip()
        ][:3]
        item = {
            "start": round(st, 2),
            "end": round(en, 2),
            "title": str(c.get("title") or "Klip")[:120],
            "hook": str(c.get("hook") or (hooks[0] if hooks else ""))[:200],
            "hooks": hooks,
            "score": int(c.get("score") or 50),
            "reason": str(c.get("reason") or "")[:300],
            "teaser": None,
        }
        # Teaser cold-open: valid hanya jika di dalam klip & bukan kalimat pembuka
        try:
            tst, ten = float(c.get("teaser_start")), float(c.get("teaser_end"))
        except (TypeError, ValueError):
            tst = ten = None
        if (
            tst is not None
            and st + 1.5 <= tst < ten <= en
            and 0.8 <= ten - tst <= 5.0
        ):
            item["teaser"] = {"start": round(tst, 2), "end": round(min(ten, tst + 4.5), 2)}
        cleaned.append(item)

    # Buang kandidat yang tumpang tindih >50% dengan yang skornya lebih tinggi
    kept = []
    for c in sorted(cleaned, key=lambda x: -x["score"]):
        dur_c = c["end"] - c["start"]
        ok = True
        for k in kept:
            ov = min(c["end"], k["end"]) - max(c["start"], k["start"])
            if ov > 0.5 * min(dur_c, k["end"] - k["start"]):
                ok = False
                break
        if ok:
            kept.append(c)
        if len(kept) >= n_clips:
            break
    return kept


ANNOTATE_SYSTEM_PROMPT = (
    "Kamu adalah editor caption video pendek viral. Kamu memilih kata-kata paling penting "
    "untuk disorot warna dan emoji yang paling relevan dengan konteks. "
    "Kamu selalu membalas hanya dengan JSON yang valid."
)


def annotate_words(transcript: dict, clips: list, provider: str, settings: dict,
                   progress_cb=None) -> int:
    """Tandai kata kunci (w['hl']=True) & emoji (w['em']) pada kata-kata di dalam klip.

    Anotasi disimpan langsung di transcript. Return jumlah anotasi yang dibuat.
    Kegagalan per klip diabaikan (anotasi bersifat opsional).
    """
    cfg = settings["providers"].get(provider) or {}
    segs = transcript.get("segments") or []
    total = 0
    for ci, clip in enumerate(clips):
        if progress_cb:
            progress_cb(ci / max(1, len(clips)))
        refs = [
            w
            for seg in segs
            for w in seg.get("words", [])
            if clip["start"] <= (w["s"] + w["e"]) / 2 <= clip["end"]
        ]
        if not refs:
            continue
        numbered = " ".join(f"{i}:{w['w']}" for i, w in enumerate(refs))
        prompt = f"""Berikut kata-kata dari satu klip video pendek (format index:kata):

{numbered}

Tugas:
1. "keywords": pilih 15-25% kata yang paling penting/emosional/mengejutkan untuk disorot warna di caption (kata benda/kerja/sifat yang kuat, bukan kata sambung).
2. "emojis": pasang emoji yang relevan pada kata yang paling pas, maksimal 1 emoji per kalimat, total 2-5 emoji untuk seluruh klip.
3. "teaser": [index_awal, index_akhir] — rentang kata (± 2-4 detik) berisi kalimat PALING dramatis/mengejutkan, JANGAN kalimat pembuka klip. Dipakai sebagai umpan cold-open.

Balas HANYA dengan JSON, contoh:
{{"keywords": [3, 8, 15], "emojis": {{"5": "🔥", "20": "😱"}}, "teaser": [18, 24]}}"""
        try:
            content = chat_fb(settings, provider, [
                {"role": "system", "content": ANNOTATE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ], temperature=0.3)
            data = _extract_json_object(content)
        except Exception:  # noqa: BLE001
            continue
        for w in refs:
            w.pop("hl", None)
            w.pop("em", None)
        for idx in data.get("keywords") or []:
            try:
                i = int(idx)
            except (TypeError, ValueError):
                continue
            if 0 <= i < len(refs):
                refs[i]["hl"] = True
                total += 1
        for k, v in (data.get("emojis") or {}).items():
            try:
                i = int(k)
            except (TypeError, ValueError):
                continue
            if 0 <= i < len(refs) and isinstance(v, str) and v.strip():
                refs[i]["em"] = v.strip()[:8]
                total += 1
        # Teaser cold-open dari rentang kata pilihan AI
        tr = data.get("teaser")
        if isinstance(tr, list) and len(tr) == 2:
            try:
                i, j = int(tr[0]), int(tr[1])
            except (TypeError, ValueError):
                i = j = -1
            if 0 <= i <= j < len(refs):
                ts, te = refs[i]["s"], refs[j]["e"]
                if ts > clip["start"] + 1.5 and 0.8 <= te - ts <= 5.0:
                    clip["teaser"] = {"start": round(ts, 2), "end": round(min(te, ts + 4.5), 2)}
                    total += 1
    if progress_cb:
        progress_cb(1.0)
    return total


def generate_hooks(clip_text: str, provider: str, settings: dict) -> list[str]:
    """3 variasi hook dengan formula viral berbeda untuk satu klip."""
    cfg = settings["providers"].get(provider) or {}
    prompt = f"""Berikut transkrip satu klip video pendek:

{clip_text[:4000]}

Buat 3 hook (kalimat pembuka overlay yang bikin penonton berhenti scroll), masing-masing maksimal 9 kata, bahasa sama dengan transkrip:
1. Formula curiosity gap — bikin penasaran tanpa membocorkan isi (pola: "Orang ini tidak sadar...").
2. Formula pertanyaan provokatif.
3. Formula pernyataan mengejutkan/shock.

Balas HANYA JSON array 3 string: ["...", "...", "..."]"""
    content = chat_fb(settings, provider, [
        {"role": "system", "content": ANNOTATE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], temperature=0.7)
    hooks = [str(h).strip()[:200] for h in _extract_json_array(content) if isinstance(h, str) and h.strip()]
    if not hooks:
        raise RuntimeError("LLM tidak menghasilkan hook.")
    return hooks[:3]


def generate_metadata(clip_text: str, title: str, provider: str, settings: dict) -> dict:
    """Metadata siap posting: judul curiosity-gap, teks thumbnail, deskripsi, hashtag."""
    cfg = settings["providers"].get(provider) or {}
    prompt = f"""Berikut transkrip satu klip video pendek (judul kerja: "{title}"):

{clip_text[:4000]}

Buat metadata siap posting untuk YouTube Shorts/TikTok, bahasa sama dengan transkrip:
1. "title": judul video curiosity-gap maksimal 8 kata + 1 emoji di akhir. Pilih SATU formula viral yang paling cocok dengan isi klip:
   - "[Subjek] ini [kejadian/perilaku tak terduga]" (contoh: "Wanita Jepang ini Kecanduan Punya Anak🤔")
   - "Detik-Detik [peristiwa dramatis]" (contoh: "Detik-Detik Jet Tempur Gagal Mendarat😱")
   - "Saat [situasi normal], [twist kontras]" (contoh: "Saat Orang Sibuk Bekerja, Dia Malah Keliling Dunia")
   - "Rekaman Langka! [peristiwa]" — HANYA jika klip memang berisi momen langka/lawas
   - Pertanyaan kontras (contoh: "Mewah Atau Biasa? Menu Tentara USA 1971🤔")
   JANGAN clickbait bohong — isi klip harus menepati janji judul.
2. "thumbnail_text": teks besar untuk thumbnail (maksimal 10 kata, provokatif, huruf kapital, boleh beda dari title agar jadi hook ganda).
3. "description": deskripsi 2-3 kalimat + ajakan follow/subscribe.
4. "hashtags": 10-12 hashtag campuran (besar seperti #fyp #shorts + niche spesifik topik klip), tanpa spasi, diawali #.

Balas HANYA JSON object:
{{"title": "...", "thumbnail_text": "...", "description": "...", "hashtags": ["#fyp", "..."]}}"""
    content = chat_fb(settings, provider, [
        {"role": "system", "content": ANNOTATE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], temperature=0.6)
    data = _extract_json_object(content)
    return {
        "title": str(data.get("title") or title)[:120],
        "thumbnail_text": str(data.get("thumbnail_text") or "")[:120],
        "description": str(data.get("description") or "")[:1000],
        "hashtags": [
            str(h).strip()[:40]
            for h in (data.get("hashtags") or [])
            if isinstance(h, str) and h.strip().startswith("#")
        ][:14],
    }


def pick_split(segments_in_clip: list, clip: dict, provider: str, settings: dict) -> float:
    """Pilih detik terbaik untuk memotong klip jadi Part 1/Part 2 (titik paling bikin penasaran)."""
    cfg = settings["providers"].get(provider) or {}
    start, end = float(clip["start"]), float(clip["end"])
    dur = end - start
    lo, hi = start + 0.3 * dur, start + 0.8 * dur
    candidates = [s for s in segments_in_clip if lo <= s["end"] <= hi]
    if not candidates:
        candidates = segments_in_clip
    if not candidates:
        return round(start + dur / 2, 2)

    lines = "\n".join(f"[berakhir di detik {s['end']:.1f}] {s['text'].strip()}" for s in candidates)
    prompt = f"""Klip video ini akan dipotong jadi Part 1 dan Part 2. Part 1 harus berakhir di momen paling menegangkan/bikin penasaran (cliffhanger), supaya penonton mencari Part 2.

Kalimat-kalimat kandidat titik potong:
{lines}

Pilih SATU waktu akhir kalimat yang paling pas sebagai akhir Part 1.
Balas HANYA JSON: {{"split_time": 123.4}}"""
    try:
        content = chat_fb(settings, provider, [
            {"role": "system", "content": ANNOTATE_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ], temperature=0.3)
        t = float(_extract_json_object(content).get("split_time"))
    except Exception:  # noqa: BLE001
        t = None
    valid_ends = [s["end"] for s in candidates]
    if t is None:
        return round(min(valid_ends, key=lambda e: abs(e - (start + dur / 2))), 2)
    # Jepret ke akhir kalimat kandidat terdekat
    return round(min(valid_ends, key=lambda e: abs(e - t)), 2)


FIX_SYSTEM_PROMPT = (
    "Kamu adalah korektor transkrip hasil speech-to-text yang sangat teliti. "
    "Tugasmu HANYA memperbaiki kesalahan ejaan/penulisan kata (typo), bukan menyunting gaya bahasa. "
    "Kamu selalu membalas hanya dengan JSON yang valid."
)


def _build_fix_prompt(lines_text: str, vocab: str) -> str:
    vocab_note = (
        f"\nIstilah/nama yang PASTI benar, gunakan penulisan persis seperti ini: {vocab}\n"
        if vocab.strip() else ""
    )
    return f"""Berikut baris-baris transkrip hasil speech-to-text (format: nomor: teks).
Perbaiki HANYA kesalahan ejaan/typo — termasuk kata gaul yang salah tulis (contoh: "jirik" -> "jijik", "anjar" -> "anjay").
{vocab_note}
Aturan ketat:
1. JANGAN mengubah makna, urutan kata, atau menambah/menghapus kata. Usahakan jumlah kata tiap baris tetap sama persis.
2. Pertahankan gaya bahasa santai/slang — hanya betulkan penulisannya.
3. Jangan menambah tanda baca baru yang tidak perlu.
4. Jika baris sudah benar, tulis ulang apa adanya.

Baris transkrip:
{lines_text}

Balas HANYA dengan JSON object nomor -> teks terkoreksi, contoh:
{{"0": "teks yang sudah benar", "1": "teks terkoreksi"}}"""


def fix_transcript(transcript: dict, provider: str, settings: dict,
                   vocab: str = "", progress_cb=None) -> tuple[dict, int]:
    """Koreksi typo semua segmen via LLM tanpa merusak timing per kata.

    Return (transcript, jumlah_kata_yang_berubah).
    """
    cfg = settings["providers"].get(provider) or {}
    segs = transcript.get("segments") or []
    if not segs:
        return transcript, 0

    # Kelompokkan segmen per ~3500 karakter agar muat di satu request
    batches, cur_idx, cur_len = [], [], 0
    for i, s in enumerate(segs):
        text = (s.get("text") or "").strip()
        if not text:
            continue
        cur_idx.append(i)
        cur_len += len(text) + 8
        if cur_len > 3500:
            batches.append(cur_idx)
            cur_idx, cur_len = [], 0
    if cur_idx:
        batches.append(cur_idx)

    changed = 0
    for bi, idxs in enumerate(batches):
        if progress_cb:
            progress_cb(bi / len(batches))
        lines = "\n".join(f"{i}: {segs[i]['text'].strip()}" for i in idxs)
        content = chat_fb(settings, provider, [
            {"role": "system", "content": FIX_SYSTEM_PROMPT},
            {"role": "user", "content": _build_fix_prompt(lines, vocab)},
        ], temperature=0.1)
        data = _extract_json_object(content)
        for k, v in data.items():
            try:
                i = int(k)
            except (TypeError, ValueError):
                continue
            if i < 0 or i >= len(segs) or not isinstance(v, str):
                continue
            changed += _apply_correction(segs[i], v)

    if progress_cb:
        progress_cb(1.0)
    return transcript, changed


def _apply_correction(seg: dict, new_text: str) -> int:
    """Terapkan teks terkoreksi ke satu segmen. Timing kata dipertahankan:
    jumlah kata sama -> ganti 1:1; beda -> selaraskan via diff, blok yang berubah
    dibagi rata di rentang waktu blok lamanya. Return jumlah kata yang berubah."""
    new_tokens = [t for t in str(new_text).split() if t]
    if not new_tokens:
        return 0
    old_words = seg.get("words") or []
    old_tokens = [w["w"] for w in old_words]
    if new_tokens == old_tokens:
        return 0

    n_changed = 0
    if len(new_tokens) == len(old_tokens):
        for w, t in zip(old_words, new_tokens):
            if w["w"] != t:
                n_changed += 1
            w["w"] = t
    else:
        sm = difflib.SequenceMatcher(
            a=[t.lower() for t in old_tokens],
            b=[t.lower() for t in new_tokens],
        )
        rebuilt = []
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal" or (tag == "replace" and (i2 - i1) == (j2 - j1)):
                for oi, nj in zip(range(i1, i2), range(j1, j2)):
                    w = dict(old_words[oi])
                    if w["w"] != new_tokens[nj]:
                        n_changed += 1
                    w["w"] = new_tokens[nj]
                    rebuilt.append(w)
            elif tag == "delete":
                n_changed += i2 - i1
            else:  # replace beda panjang / insert
                if i1 < i2:
                    t0, t1 = old_words[i1]["s"], old_words[i2 - 1]["e"]
                elif rebuilt:
                    t0 = rebuilt[-1]["e"]
                    t1 = old_words[i1]["s"] if i1 < len(old_words) else t0 + 0.3
                elif old_words:
                    t1 = old_words[0]["s"]
                    t0 = max(0.0, t1 - 0.3)
                else:
                    t0, t1 = float(seg.get("start", 0)), float(seg.get("end", 0))
                n = j2 - j1
                if t1 <= t0:
                    t1 = t0 + 0.1 * n
                step = (t1 - t0) / n
                for k, nj in enumerate(range(j1, j2)):
                    rebuilt.append({
                        "w": new_tokens[nj],
                        "s": round(t0 + k * step, 3),
                        "e": round(t0 + (k + 1) * step, 3),
                    })
                n_changed += n
        seg["words"] = rebuilt

    seg["text"] = " ".join(new_tokens)
    return n_changed


def _snap(st, en, starts, ends, duration, min_dur, max_dur):
    """Geser batas klip ke batas kalimat terdekat + paksa durasi min/max."""
    i = bisect.bisect_right(starts, st + 0.6) - 1
    st2 = starts[max(0, i)]
    j = bisect.bisect_left(ends, en - 0.6)
    en2 = ends[min(len(ends) - 1, j)]

    if en2 - st2 > max_dur:
        j2 = bisect.bisect_right(ends, st2 + max_dur) - 1
        en2 = ends[j2] if j2 >= 0 and ends[j2] > st2 + 3 else st2 + max_dur
    if en2 - st2 < min_dur:
        j3 = bisect.bisect_left(ends, st2 + min_dur)
        en2 = ends[j3] if j3 < len(ends) else (st2 + min_dur)

    if duration > 0:
        en2 = min(en2, duration)
    return max(0.0, st2), en2
