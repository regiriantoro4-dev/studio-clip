"""Mode Affiliate: foto produk + deskripsi -> naskah review AI -> suara narator Indonesia
(Edge TTS) -> slideshow foto Ken Burns dengan caption per kata -> video siap upload
lengkap dengan link affiliate di caption.txt.

Footage dirakit jadi satu file sumber (section per naskah), lalu tiap section diperlakukan
seperti klip Mode Narasi — renderer, thumbnail, dan Siap Upload dipakai ulang apa adanya.
"""
import re

from PIL import Image, ImageDraw, ImageFilter, ImageOps

from .. import config, storage
from . import autoproduce, media, narrate
from .autoproduce import _SubJob
from .llm import _extract_json_array, chat_fb

W, H, FPS = 1080, 1920, 30
SHOT_LEN = 3.0       # target durasi per foto (detik)
PHOTO_BOX = 880      # sisi maksimum foto produk di kanvas 9:16
PHOTO_CY = 0.48      # pusat vertikal foto (antara hook di atas dan subtitle di bawah)
ZOOM = 0.12          # kekuatan Ken Burns

AFFILIATE_SYSTEM_PROMPT = (
    "Kamu adalah penulis naskah video review produk affiliate (Shopee/TikTok Shop) berbahasa "
    "Indonesia yang jago bikin orang berhenti scroll lalu klik link. Gaya bahasamu santai, "
    "jujur, to the point. Kamu selalu membalas hanya dengan JSON valid."
)

_EMOJI_RE = re.compile("[\U00010000-\U0010FFFF☀-➿️]")


def _no_emoji(text: str) -> str:
    """Font ASS (Arial Black) tidak punya glyph emoji — buang supaya tidak jadi kotak."""
    return re.sub(r"\s+", " ", _EMOJI_RE.sub("", text or "")).strip()


def _script_prompt(name: str, description: str, price: str, n: int) -> str:
    price_line = f"Harga: {price}\n" if price.strip() else ""
    return f"""Produk: "{name}"
{price_line}Info produk dari penjual:
\"\"\"{description.strip() or '(tidak ada, pakai nama produk saja dan jangan mengarang spesifikasi)'}\"\"\"

Buat {n} naskah video review pendek (Shorts/TikTok/Shopee Video) untuk produk ini, masing-masing dengan SUDUT BERBEDA
(mis. masalah -> solusi, 3 alasan wajib punya, harga murah tapi kualitas, siapa yang cocok pakai, fitur yang jarang orang tahu).

Aturan tiap naskah:
1. "script": narasi 55-80 kata, kalimat pendek-pendek, bahasa ngobrol seperti kreator TikTok ke temannya —
   bukan bahasa iklan/berita. Boleh pakai "guys", "sumpah", "jujur", "deh", "sih", "loh", "banget".
   Pakai tanda baca (koma, "...", "?", "!") untuk mengatur jeda dan intonasi narator.
   - Kalimat PERTAMA wajib hook yang bikin berhenti scroll (mis. "Kalian masih ...? Coba lihat ini.", "Barang 50 ribuan ini ...").
   - HANYA pakai fakta dari info produk di atas. Jangan mengarang spesifikasi, bahan, atau hasil.
   - JANGAN berpura-pura sudah memakai produk ("aku udah pakai 2 minggu", "hasilnya di kulitku") — ini review gaya narator.
   - Tanpa klaim kesehatan/medis berlebihan dan tanpa kata "pasti", "100%", "dijamin".
   - Harga tulis gaya ucapan, mis. "cuma 49 ribuan" (jangan "Rp49.000").
   - Kalimat TERAKHIR ajakan: cek link di bio / keranjang kuning.
2. "hook": teks besar di layar, maks 6 kata, TANPA emoji (mis. "Rak dapur 40 ribuan?!").
3. "cta": teks penutup di layar, maks 5 kata, TANPA emoji (mis. "Cek link di bio").
4. "title": judul video maks 8 kata + 1 emoji.
5. "thumbnail_text": teks thumbnail maks 8 kata, provokatif tapi jujur.
6. "description": 2 kalimat tentang produk + ajakan klik link.
7. "hashtags": 8-12 hashtag (campuran #shorts #fyp #racunshopee #shopeehaul + niche produk).

Balas HANYA JSON array {n} objek:
[{{"title": "...", "hook": "...", "script": "...", "cta": "...", "thumbnail_text": "...", "description": "...", "hashtags": ["#racunshopee"]}}]"""


def generate_scripts(name: str, description: str, price: str, n: int,
                     provider: str, settings: dict) -> list[dict]:
    content = chat_fb(settings, provider, [
        {"role": "system", "content": AFFILIATE_SYSTEM_PROMPT},
        {"role": "user", "content": _script_prompt(name, description, price, n)},
    ], temperature=0.75, max_tokens=4096)
    out = []
    for item in _extract_json_array(content):
        if not isinstance(item, dict) or not str(item.get("script") or "").strip():
            continue
        out.append({
            "title": str(item.get("title") or name)[:120],
            "hook": _no_emoji(str(item.get("hook") or ""))[:60],
            "script": str(item.get("script"))[:1500],
            "cta": _no_emoji(str(item.get("cta") or "Cek link di bio"))[:40],
            "thumbnail_text": str(item.get("thumbnail_text") or "")[:120],
            "description": str(item.get("description") or "")[:1000],
            "hashtags": [
                str(h).strip()[:40] for h in (item.get("hashtags") or [])
                if isinstance(h, str) and h.strip().startswith("#")
            ][:14],
        })
    if not out:
        raise RuntimeError("LLM tidak menghasilkan naskah review.")
    return out[:n]


def compose_photo(src, out):
    """Kanvas 9:16: latar foto yang sama di-blur & digelapkan + foto utuh di tengah."""
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")

    bg = ImageOps.fit(img, (W, H), Image.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(40))
    bg = Image.blend(bg, Image.new("RGB", (W, H), (0, 0, 0)), 0.35)

    fg = img.copy()
    fg.thumbnail((PHOTO_BOX, PHOTO_BOX), Image.LANCZOS)
    if max(fg.size) < PHOTO_BOX:  # foto kecil diperbesar supaya tetap mengisi kanvas
        scale = PHOTO_BOX / max(fg.size)
        fg = fg.resize((int(fg.width * scale), int(fg.height * scale)), Image.LANCZOS)
    radius = 28
    mask = Image.new("L", fg.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, fg.width - 1, fg.height - 1], radius, fill=255)

    x = (W - fg.width) // 2
    y = int(H * PHOTO_CY - fg.height / 2)
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x + 6, y + 18, x + fg.width + 6, y + fg.height + 18], radius, fill=170
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    bg.paste(Image.new("RGB", (W, H), (0, 0, 0)), (0, 0), shadow)
    bg.paste(fg, (x, y), mask)
    bg.save(out, quality=95)


def _shot_filter(kind: int, frames: int) -> str:
    """Ken Burns halus: zoompan di atas gambar 2x (mencegah getar akibat pembulatan piksel)."""
    z_in = f"1+{ZOOM}*on/{frames}"
    z_out = f"{1 + ZOOM}-{ZOOM}*on/{frames}"
    cx, cy = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    z, x, y = [
        (z_in, cx, cy),
        (z_out, cx, cy),
        (f"{1 + ZOOM / 2}", f"(iw-iw/zoom)*on/{frames}", cy),        # geser kiri -> kanan
        (f"{1 + ZOOM / 2}", f"(iw-iw/zoom)*(1-on/{frames})", cy),    # geser kanan -> kiri
    ][kind % 4]
    return (
        f"scale={W * 2}:{H * 2},zoompan=z='{z}':x='{x}':y='{y}'"
        f":d={frames}:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p"
    )


def build_footage(job, pid: str, composed: list, sections: list[float]) -> str:
    """Rakit satu video sumber bisu: tiap section (per naskah) berisi beberapa shot foto."""
    pdir = storage.project_dir(pid)
    shots_dir = pdir / "shots"
    shots_dir.mkdir(exist_ok=True)

    plan = []  # (foto, durasi)
    cursor = 0
    for sec in sections:
        k = max(2, round(sec / SHOT_LEN))
        frames_total = round(sec * FPS)
        base = frames_total // k
        for j in range(k):
            frames = base + (frames_total - base * k if j == k - 1 else 0)
            plan.append((composed[cursor % len(composed)], frames))
            cursor += 1

    names = []
    for i, (img, frames) in enumerate(plan):
        job.set(stage=f"Merakit footage foto {i + 1}/{len(plan)}", progress=i / len(plan))
        name = f"shot_{i:03d}.mp4"
        media.run([
            "ffmpeg", "-y", "-i", str(img), "-vf", _shot_filter(i, frames),
            "-frames:v", str(frames), "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "18", "-r", str(FPS), str(shots_dir / name),
        ])
        names.append(name)

    lst = shots_dir / "list.txt"
    lst.write_text("".join(f"file '{n}'\n" for n in names), encoding="utf-8")
    out = pdir / "source.mp4"
    media.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
        "-c", "copy", "-movflags", "+faststart", str(out),
    ], cwd=str(shots_dir))
    return str(out)


def full_run(job, pid: str, n: int = 3, voice: str = "id-ID-ArdiNeural") -> dict:
    """Pipeline affiliate: naskah AI -> TTS -> footage slideshow -> produksi batch."""
    try:
        p = storage.get(pid)
        if not p:
            raise RuntimeError("Project tidak ditemukan.")
        aff = p.get("affiliate") or {}
        photos = [storage.project_dir(pid) / "photos" / f for f in aff.get("photos") or []]
        photos = [f for f in photos if f.exists()]
        if not photos:
            raise RuntimeError("Foto produk tidak ditemukan.")
        settings = config.load_settings()
        provider = (p.get("options") or {}).get("llm_provider") or settings["llm_provider"]
        n = max(1, min(int(n), 5))

        # 1. Naskah AI
        job.set(stage="AI menulis naskah review", progress=0.03)
        scripts = generate_scripts(
            aff.get("name") or p["title"], aff.get("description") or "",
            aff.get("price") or "", n, provider, settings,
        )

        # 2. Suara narator per naskah
        tts = []
        for i, sc in enumerate(scripts):
            job.set(stage=f"Narator membaca naskah {i + 1}/{len(scripts)}",
                    progress=0.15 + 0.15 * i / len(scripts))
            nar_name = f"narration_c{i + 1}.mp3"
            nar_dur, words = narrate.synthesize(
                sc["script"], voice, storage.project_dir(pid) / nar_name
            )
            tts.append((nar_name, nar_dur, words))

        # 3. Foto -> kanvas 9:16 -> footage Ken Burns (satu section per naskah)
        job.set(stage="Menyiapkan foto produk", progress=0.3)
        comp_dir = storage.project_dir(pid) / "composed"
        comp_dir.mkdir(exist_ok=True)
        composed = []
        for i, f in enumerate(photos):
            out = comp_dir / f"c{i:02d}.jpg"
            compose_photo(f, out)
            composed.append(out)
        sections = [nar_dur + 0.6 for _, nar_dur, _ in tts]
        source = build_footage(_SubJob(job, 0.32, 0.5), pid, composed, sections)

        p = storage.get(pid)
        dur, w, h = media.probe(source)
        p.update(source_file=source, duration=round(dur, 2), width=w, height=h)
        storage.save(p)

        # 4. Klip per section (timing kata dari TTS, digeser ke offset section)
        link = str(aff.get("link") or "").strip()
        clips, segments = [], []
        offset = 0.0
        for i, (sc, (nar_name, nar_dur, tts_words), sec) in enumerate(zip(scripts, tts, sections)):
            start, end = offset, offset + sec
            offset = end
            words = [
                {"w": tw["w"], "s": round(start + tw["s"], 3), "e": round(start + tw["e"], 3)}
                for tw in tts_words
            ]
            segments.append({"start": round(start, 3), "end": round(end, 3),
                             "text": sc["script"], "words": words})
            desc = sc["description"]
            if link:
                desc = f"{desc}\n\nLink produk: {link}\n(link affiliate)"
            clips.append({
                "id": f"c{i + 1}",
                "start": round(start, 3), "end": round(end, 3),
                "title": sc["title"], "hook": sc["hook"],
                "endcard": sc["cta"],
                "score": 95 - i * 5,  # jaga urutan naskah saat produksi
                "reason": "Mode affiliate",
                "style": dict(storage.DEFAULT_STYLE),
                "hook_style": {**storage.DEFAULT_HOOK_STYLE, "template": "boxies", "pos": 8},
                "fx": {**storage.DEFAULT_FX, "zoom": False, "cut_silence": False,
                       "teaser": False, "keywords": False, "emoji": False},
                "narration": {"file": nar_name, "duration": nar_dur, "voice": voice},
                "meta": {
                    "title": sc["title"],
                    "thumbnail_text": sc["thumbnail_text"] or sc["hook"] or sc["title"],
                    "description": desc,
                    "hashtags": sc["hashtags"] or ["#racunshopee", *autoproduce.DEFAULT_HASHTAGS],
                },
                "exports": [],
            })

        storage.save_transcript(pid, {"language": "id", "segments": segments})
        p = storage.get(pid)
        p["clips"] = clips
        p["status"] = "processing"
        p["mode"] = "affiliate"
        storage.save(p)

        # 5. Produksi batch (render + thumbnail + caption ke Siap Upload)
        return autoproduce.produce(_SubJob(job, 0.5, 1.0), pid, n=len(clips))
    except Exception as e:  # noqa: BLE001
        try:
            p = storage.get(pid)
            p["status"] = "error"
            p["error"] = f"Mode affiliate gagal: {e}"
            storage.save(p)
        except Exception:  # noqa: BLE001
            pass
        raise
