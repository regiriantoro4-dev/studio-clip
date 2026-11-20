"""Mode Horor: video faceless 100% AI siap upload.

Alur per video: AI menulis cerita horor + memecahnya jadi adegan (narasi + prompt gambar)
-> narator TTS (pelan, berat) -> ComfyUI SDXL membuat ilustrasi tiap adegan
-> Ken Burns + efek horor (grade dingin, grain, vignette, flicker, guncang & kilat merah saat twist)
-> ambience drone -> render + thumbnail + caption ke "Siap Upload/<tanggal>/".

Footage semua video dirakit jadi satu source.mp4 (satu section per video), lalu tiap section
diperlakukan seperti klip Mode Narasi — renderer, thumbnail, dan Siap Upload dipakai ulang.
"""
import json
import os
import random
import shutil
import re
import subprocess
import tempfile
import threading
import time

from PIL import ImageOps

from .. import config, storage
from . import autoproduce, comfy, horror_sfx, media, narrate
from .autoproduce import _SubJob
from .llm import _extract_json_array, chat_fb

W, H, FPS = 1080, 1920, 30
GEN_W, GEN_H = 768, 1344          # resolusi SDXL portrait (bucket bawaan), lalu di-fit ke 9:16
MIN_SHOT = 1.4

HISTORY_FILE = config.DATA_DIR / "horror_history.json"

CATEGORIES = [
    "legenda hantu lokal (kuntilanak, pocong, genderuwo, wewe gombel, sundel bolong, leak) dengan sudut cerita yang segar",
    "tempat angker (kos lama, rumah sakit tua, sekolah malam hari, jalan hutan, stasiun sepi, pabrik kosong)",
    "gaya 'pengalaman pendengar', terasa seperti kejadian nyata",
    "aturan aneh yang tidak boleh dilanggar (rules horror) di tempat kerja, kos, atau desa",
    "misteri kampung: pantangan, ritual, dan mitos turun-temurun",
    "creepypasta modern orisinal (chat misterius, rekaman CCTV, ojol tengah malam, telepon jam 3 pagi)",
    "horor perjalanan (KKN di desa terpencil, mudik malam, kemah, naik gunung)",
]

STYLES = {
    "sinematik": ("cinematic horror film still, dark moody low-key lighting, volumetric fog, "
                  "desaturated teal and amber color grade, 35mm film grain, shallow depth of field, "
                  "photorealistic, highly detailed"),
    "komik": ("dark horror manhwa illustration, bold ink lines, heavy shadows, muted palette with red accents, "
              "dramatic composition, detailed digital painting"),
    "found": ("found footage horror, night vision camcorder still, grainy low light, harsh flash, "
              "VHS artifacts, eerie amateur photo, photorealistic"),
}

NEGATIVE = (
    "gore, blood, wounds, dismembered, corpse, nudity, text, letters, watermark, logo, signature, "
    "bright cheerful colors, cartoon, lowres, blurry, jpeg artifacts, deformed, bad anatomy, extra fingers, "
    "extra limbs, disfigured face, duplicate, frame, border, blonde hair, caucasian, european architecture"
)

SYSTEM_PROMPT = (
    "Kamu penulis naskah cerita horor pendek berbahasa Indonesia untuk YouTube Shorts/TikTok. "
    "Ceritamu selalu bikin merinding, terasa dekat dengan kehidupan orang Indonesia, dan membuat "
    "penonton bertahan sampai detik terakhir. Kamu juga sutradara visual yang menulis prompt gambar "
    "Stable Diffusion dalam bahasa Inggris. Kamu selalu membalas hanya dengan JSON valid."
)

UPLOAD_NOTES = [
    "Visual dibuat AI: di YouTube Studio pilih 'Konten yang diubah atau sintetis' = Ya bila gambarnya terlihat realistis.",
    "Penonton: pilih 'Tidak, ini tidak dibuat untuk anak-anak'.",
    "Musik latar = ambience buatan Studio Clip (bebas hak cipta).",
]


# ---------------------------------------------------------------- riwayat ide

def _history() -> list[dict]:
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return []


def _remember(items: list[dict]):
    old = _history()
    seen = {(h.get("pid"), h.get("title")) for h in old}
    hist = old + [it for it in items if (it.get("pid"), it.get("title")) not in seen]  # resume: jangan dobel
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(hist[-300:], indent=1, ensure_ascii=False), encoding="utf-8")


# ---------------------------------------------------------------- naskah

_EMOJI_RE = re.compile("[\U00010000-\U0010FFFF☀-➿️]")


def _no_emoji(text: str) -> str:
    return re.sub(r"\s+", " ", _EMOJI_RE.sub("", text or "")).strip()


POVS = {  # sudut pandang narasi
    "kamu": ("SUDUT PANDANG ORANG KEDUA — penonton adalah tokohnya. Pakai 'kamu' dari awal sampai akhir "
             "('Kamu lagi nunggu ojek. Jam tiga pagi. HP kamu bunyi.'), JANGAN pakai 'aku'. Kalimat sangat pendek, "
             "seolah terjadi sekarang, nada tenang-datar yang makin menekan. Tokoh lain/makhluk bicara lewat kutipan "
             "tunggal. Untuk gambar, perbanyak sudut POV (first-person view, tangan tokoh terlihat)."),
    "aku": ("SUDUT PANDANG ORANG PERTAMA — narator menceritakan pengalamannya sendiri pakai 'aku', "
            "seperti pendengar yang curhat kejadian nyata."),
}


def _prompt(category: str, topic: str, avoid: list[str], pov: str = "kamu") -> str:
    topic_line = f"Topik dari pengguna (wajib dipakai): {topic}\n" if topic.strip() else f"Kategori: {category}\n"
    avoid_line = ("Judul yang SUDAH pernah dibuat (jangan mengulang ide/judul serupa):\n- "
                  + "\n- ".join(avoid[-40:]) + "\n") if avoid else ""
    return f"""{topic_line}{avoid_line}
Tulis SATU cerita horor pendek orisinal untuk video vertikal 45-55 detik.
Sudut pandang: {POVS.get(pov) or POVS["kamu"]}

Aturan cerita:
1. Dipecah jadi 7-9 adegan. Tiap adegan punya "narration" — total semua narasi 95-120 kata (narator membaca pelan, video harus di bawah 60 detik).
   Tulis sebagai NASKAH LISAN yang dibacakan narator, BUKAN tulisan:
   - kalimat pendek dan potongan kalimat ("Sepi banget." "Baju putih. Diam."), maks 12 kata per kalimat;
   - pakai "..." untuk jeda menahan napas ("Tiba-tiba... ada yang manggil.");
   - bahasa ngobrol sehari-hari (nggak, banget, terus, kayak, denger), bukan bahasa baku/sastra;
   - bunyi bisa ditulis langsung ("Tok. Tok. Tok.").
2. Adegan PERTAMA = hook maks 12 kata yang bikin berhenti scroll
   (mis. "Jangan pernah jawab kalau namamu dipanggil jam tiga pagi.").
3. Bangun ketegangan bertahap dengan detail indrawi (suara, bau, dingin). Tempat & tokoh terasa Indonesia.
4. Tepat SATU adegan menjelang akhir punya "twist": true — momen paling mengejutkan. Twist WAJIB di adegan
   ke-2 atau ke-3 dari belakang (bukan di tengah cerita), supaya penonton bertahan sampai akhir.
5. Urutan wajib: hook -> ketegangan naik -> twist -> adegan penutup. Kata "komentar" HANYA boleh ada di adegan
   TERAKHIR; jangan ada adegan cerita setelah ajakan komentar.
   Narasi terakhir menggantung lalu ajak komentar (mis. "Kalau kamu di posisi dia, berani buka pintunya? Tulis di komentar.").
   Kalau sudut pandang "kamu", tanya langsung ke penonton, JANGAN "di posisi dia" (mis. "Jadi... kamu bakal angkat teleponnya? Tulis di komentar.").
6. Boleh gaya "katanya kejadian nyata", tapi jangan sebut nama orang asli atau nama institusi asli (sekolah, RS, perusahaan).
7. Tanpa gore/darah, tanpa bunuh diri, tanpa anak dicelakai, tanpa menghina agama. Seram lewat suasana, bukan sadis.
8. Tulis angka dengan huruf (tiga pagi, bukan 3 pagi) supaya narator membacanya benar.
9. Dialog/kutipan di dalam narasi pakai tanda kutip tunggal ('Rafi...'), JANGAN tanda kutip ganda — supaya JSON tetap valid.

Tokoh utama: tulis "protagonist" = deskripsi fisik singkat dalam bahasa INGGRIS (mis. "young Indonesian man in a grey hoodie
and sarong"). Setiap prompt yang memuat tokoh utama WAJIB menyalin deskripsi itu persis, supaya tokohnya sama di semua gambar.

Aturan "prompt" gambar tiap adegan (bahasa INGGRIS, 25-45 kata):
- Mulai dengan OBJEK/SUBJEK UTAMA yang paling penting untuk narasi, ditulis konkret dan spesifik
  (mis. "an old 1980s transistor radio with a long silver antenna on a wooden table", bukan "a radio").
- Lalu lokasi, pencahayaan, sudut kamera (wide shot / close-up / POV / low angle).
- Detail khas Indonesia (rumah kampung kayu, lorong kos, motor bebek, warung, sawah malam, musala kecil, kebaya, sarung).
- Tokoh utama TIDAK menampakkan wajah: dari belakang, siluet, tangan, atau POV.
- Makhluk halus digambarkan samar: di kejauhan, di bayangan, sebagian tertutup. Tulis ciri fisiknya jelas dalam
  bahasa Inggris, mis. kuntilanak = "pale Indonesian woman ghost, very long straight jet-black hair covering her face,
  long white dress"; pocong = "figure wrapped head to toe in a white burial shroud tied at the top".
- Semua orang di gambar orang Indonesia (tulis "Indonesian"); bangunan bergaya Indonesia, bukan Eropa.
- Jangan menulis teks/tulisan di gambar, jangan darah. Jangan ulang komposisi yang sama di adegan berurutan.
- "prompt2": gambar KEDUA untuk adegan yang sama dari sudut lain (close-up objek penting, POV, atau tangan/kaki tokoh),
  aturan sama, 20-40 kata. JANGAN close-up wajah tokoh utama; objeknya harus nyambung dengan narasi adegan itu. Isi "" untuk adegan twist.

Suara "sfx" tiap adegan — pilih SATU yang paling cocok dengan narasinya, atau "none":
static (radio/TV berdesis), knock (ketukan pintu), footsteps (langkah kaki), heartbeat (detak jantung tegang),
wind (angin malam), drip (tetesan air), breath (napas/bisikan dekat telinga), phone (telepon berdering),
creak (pintu/kayu berderit). Paling banyak 5 adegan ber-sfx; adegan twist isi "none" (efek twist otomatis).

Metadata:
- "title": judul video maks 8 kata + 1 emoji, bikin penasaran (jangan bohong).
- "hook": teks besar di layar, maks 6 kata, TANPA emoji.
- "cta": teks penutup di layar, maks 5 kata, TANPA emoji (mis. "Berani buka pintunya?").
- "thumbnail_text": maks 5 kata, provokatif.
- "description": 2 kalimat + ajakan follow untuk cerita horor berikutnya.
- "hashtags": 8-12 hashtag (#shorts #horor #ceritahoror #kisahmistis #creepy + yang spesifik).

Balas HANYA JSON array berisi 1 objek:
[{{"title": "...", "hook": "...", "cta": "...", "thumbnail_text": "...", "description": "...",
"hashtags": ["#shorts"], "protagonist": "...",
"scenes": [{{"narration": "...", "prompt": "...", "prompt2": "...", "sfx": "none", "twist": false}}]}}]"""


def _loads_lenient(content: str) -> list:
    """JSON array dari LLM, dengan perbaikan ringan untuk kesalahan yang sering muncul."""
    try:
        return _extract_json_array(content)
    except Exception:  # noqa: BLE001
        fixed = re.sub(r",\s*([\]}])", lambda m: m.group(1), content)  # koma gantung
        return _extract_json_array(fixed)


def _parse_story(content: str) -> dict | None:
    for item in _loads_lenient(content):
        if not isinstance(item, dict):
            continue
        scenes = []
        for s in item.get("scenes") or []:
            if not isinstance(s, dict):
                continue
            nar = re.sub(r"\s+", " ", str(s.get("narration") or "")).strip()
            pr = re.sub(r"\s+", " ", str(s.get("prompt") or "")).strip()
            if nar and pr:
                pr2 = re.sub(r"\s+", " ", str(s.get("prompt2") or "")).strip()
                sfx = str(s.get("sfx") or "none").strip().lower()
                scenes.append({"narration": nar[:400], "prompt": pr[:600], "prompt2": pr2[:600],
                               "sfx": sfx if sfx in horror_sfx.NAMES else "none",
                               "twist": bool(s.get("twist"))})
        scenes = scenes[:10]  # potong DULU, baru tetapkan twist (twist di adegan ke-11+ tidak hilang)
        if len(scenes) < 4:
            continue
        if not any(s["twist"] for s in scenes):
            scenes[-2]["twist"] = True
        first = next(i for i, s in enumerate(scenes) if s["twist"])
        for s in scenes[first + 1:]:
            s["twist"] = False
        scenes[first].update(prompt2="", sfx="none")
        return {
            "title": str(item.get("title") or "Cerita horor")[:120],
            "hook": _no_emoji(str(item.get("hook") or ""))[:60],
            "cta": _no_emoji(str(item.get("cta") or "Tulis di komentar"))[:40],
            "thumbnail_text": str(item.get("thumbnail_text") or "")[:80],
            "description": str(item.get("description") or "")[:1000],
            "hashtags": [
                str(h).strip()[:40] for h in (item.get("hashtags") or [])
                if isinstance(h, str) and h.strip().startswith("#")
            ][:14],
            "protagonist": _no_emoji(str(item.get("protagonist") or ""))[:200],
            "scenes": scenes,
        }
    return None


def generate_story(category: str, topic: str, avoid: list[str], provider: str, settings: dict,
                   pov: str = "kamu") -> dict:
    last, fallback = None, None
    for attempt in range(4):
        try:
            content = chat_fb(settings, provider, [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _prompt(category, topic, avoid, pov)},
            ], temperature=0.9 if attempt < 2 else 0.6, max_tokens=12000)  # gpt-oss: token berpikir ikut dihitung
            story = _parse_story(content)
            if story:
                problems = _story_problems(story)
                if not problems:
                    return story
                # simpan yang paling sedikit masalahnya, siapa tahu semua percobaan bermasalah
                if fallback is None or len(problems) < len(fallback[1]):
                    fallback = (story, problems)
                last = RuntimeError("Struktur cerita salah: " + "; ".join(problems))
            else:
                last = RuntimeError("LLM tidak mengembalikan cerita yang valid.")
        except Exception as e:  # noqa: BLE001
            last = e
    if fallback:
        return fallback[0]
    raise RuntimeError(f"Gagal menulis cerita horor: {last}")


def _story_problems(story: dict) -> list[str]:
    """Cek urutan cerita yang sering dikacaukan LLM: ajakan komentar di tengah lalu cerita lanjut,
    atau twist terlalu awal (penonton sudah dapat 'jawaban' sebelum setengah video)."""
    scenes = story["scenes"]
    n = len(scenes)
    out = []
    cta_idx = [i for i, s in enumerate(scenes) if "komentar" in s["narration"].lower()]
    if any(i != n - 1 for i in cta_idx):
        out.append(f"ajakan komentar muncul di adegan {cta_idx[0] + 1} dari {n}, harus hanya di adegan terakhir")
    if n - 1 not in cta_idx:
        out.append("adegan terakhir tidak berisi ajakan komentar")
    tw = next((i for i, s in enumerate(scenes) if s["twist"]), n - 2)
    if tw < n - 3 or tw == n - 1:
        out.append(f"twist di adegan {tw + 1} dari {n}, harus 2-3 adegan sebelum akhir")
    return out


# ---------------------------------------------------------------- audio

def ensure_ambience() -> list[str]:
    """Pakai musik 'horor*' dari data/assets/music; kalau belum ada, buat 3 drone gelap via ffmpeg."""
    mdir = config.DATA_DIR / "assets" / "music"
    mdir.mkdir(parents=True, exist_ok=True)
    have = sorted(f.name for f in mdir.iterdir()
                  if f.name.lower().startswith("horor") and f.suffix.lower() in autoproduce.MUSIC_EXTS)
    if have:
        return have
    variants = [  # (warna noise, nada dasar, nada beat, kecepatan tremolo, seed)
        ("brown", 55.0, 58.2, 0.12, 7),
        ("brown", 41.2, 43.7, 0.1, 19),
        ("pink", 49.0, 51.9, 0.17, 31),
    ]
    for i, (color, f1, f2, trem, seed) in enumerate(variants, 1):
        out = mdir / f"horor_drone_{i}.m4a"
        graph = (
            f"[0]lowpass=f=260,volume=0.9[n];[1]volume=0.35[a];[2]volume=0.3[b];"
            f"[n][a][b]amix=inputs=3:normalize=0,tremolo=f={trem}:d=0.5,highpass=f=28,"
            f"afade=t=in:d=3,alimiter=limit=0.8[o]"
        )
        media.run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"anoisesrc=color={color}:amplitude=0.6:duration=90:seed={seed}",
            "-f", "lavfi", "-i", f"sine=frequency={f1}:duration=90",
            "-f", "lavfi", "-i", f"sine=frequency={f2}:duration=90",
            "-filter_complex", graph, "-map", "[o]", "-c:a", "aac", "-b:a", "128k", str(out),
        ])
        have.append(out.name)
    return have


# ---------------------------------------------------------------- visual

def _scene_times(scenes: list[dict], words: list[dict], total: float) -> list[tuple[float, float]]:
    """Batas waktu tiap adegan = awal kata pertama adegan itu.

    OmniVoice/Gemini mengembalikan tepat satu timing per token naskah, jadi batasnya bisa dihitung
    persis dari jumlah kata per adegan. Kalau jumlahnya tidak cocok (Edge TTS memecah token berbeda),
    pakai perkiraan proporsi karakter.
    """
    counts = [len(s["narration"].split()) for s in scenes]
    bounds = [0.0]
    if sum(counts) == len(words):
        acc = 0
        for c in counts[:-1]:
            acc += c
            bounds.append(words[min(acc, len(words) - 1)]["s"])
    else:
        lens = [len(s["narration"]) + 1 for s in scenes]
        tot, acc = float(sum(lens)), 0
        for ln in lens[:-1]:
            acc += ln
            idx = min(len(words) - 1, max(0, round(acc / tot * len(words))))
            bounds.append(words[idx]["s"])
    bounds.append(total)
    # Rapikan: monoton + durasi minimum
    for k in range(1, len(bounds) - 1):
        bounds[k] = max(bounds[k], bounds[k - 1] + MIN_SHOT)
    for k in range(len(bounds) - 2, 0, -1):
        bounds[k] = min(bounds[k], bounds[k + 1] - MIN_SHOT)
    return [(round(bounds[k], 3), round(bounds[k + 1], 3)) for k in range(len(scenes))]


def _grade(twist: bool, flicker: bool) -> list[str]:
    """Grade horor setelah gerakan kamera: guncangan twist, warna dingin, kedip lampu, vignette, grain."""
    parts = []
    if twist:  # guncangan kamera
        parts += ["crop=1032:1840:'24+20*sin(n*1.9)':'40+16*sin(n*2.7)'", f"scale={W}:{H}"]
    parts += [
        "eq=contrast=1.12:saturation=0.72:brightness=-0.03",
        "colorbalance=bs=0.07:bm=0.04:rh=-0.03",
    ]
    if flicker or twist:  # lampu berkedip sesekali
        parts.append("eq=brightness='-0.12*gt(sin(t*13)*sin(t*2.3)\\,0.8)':eval=frame")
    parts += [
        "vignette=angle=PI/4.2",
        "noise=alls=12:allf=t+u",
        "fade=t=in:st=0:d=0.18:color=0x6a0000" if twist else "fade=t=in:st=0:d=0.3",
        "setsar=1", "format=yuv420p",
    ]
    return parts


def _shot_filter(i: int, frames: int, twist: bool, flicker: bool) -> str:
    """Cadangan tanpa GPU: Ken Burns (zoompan) + grade horor."""
    if twist:  # dorong cepat ke depan
        z, x, y = f"1+0.28*on/{frames}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    else:
        z, x, y = [
            (f"1+0.14*on/{frames}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),            # push-in pelan
            ("1.12", "iw/2-(iw/zoom/2)", f"(ih-ih/zoom)*on/{frames}"),                  # turun pelan
            (f"1.16-0.14*on/{frames}", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),         # mundur pelan
            (f"1+0.14*on/{frames}", "iw/2-(iw/zoom/2)", "(ih/3)-(ih/zoom/3)"),          # push-in ke atas
            ("1.12", f"(iw-iw/zoom)*on/{frames}", "ih/2-(ih/zoom/2)"),                  # geser kanan
        ][i % 5]
    parts = [
        f"scale={W * 3 // 2}:{H * 3 // 2}",  # 1,5x: cukup halus, jauh lebih ringan dari 2x
        f"zoompan=z='{z}':x='{x}':y='{y}':d={frames}:s={W}x{H}:fps={FPS}",
    ]
    return ",".join(parts + _grade(twist, flicker))


# Parallax 2.5D (D:/OmniVoice/parallax_worker.py, venv PyTorch CUDA): peta kedalaman Depth Anything V2
# -> kamera bergerak "di dalam" gambar, tokoh bergerak utuh sebagai satu lapisan.
PARALLAX_DEFAULTS = {
    "enabled": True,
    "python": r"D:\OmniVoice\venv\Scripts\python.exe",
    "worker": r"D:\OmniVoice\parallax_worker.py",
    "hf_home": r"D:\OmniVoice\hf",
}
PARALLAX_MOTIONS = ["push", "right", "rise", "pull", "left"]


def _parallax(job, settings: dict, todo: list[dict], total: int) -> None:
    """Render shot lewat worker parallax (satu proses, model dimuat sekali). Gagal -> dibiarkan, caller fallback."""
    cfg = {**PARALLAX_DEFAULTS, **(settings.get("parallax") or {})}
    if not todo or not cfg.get("enabled") or not os.path.exists(cfg["python"]) or not os.path.exists(cfg["worker"]):
        return
    job_file = err_file = proc = None
    errors = []
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            json.dump({"ffmpeg": shutil.which("ffmpeg") or "ffmpeg", "enc": media.h264_args(settings, 18),
                       "fps": FPS, "w": W, "h": H, "shots": todo}, f, ensure_ascii=False)
            job_file = f.name
        err_file = tempfile.NamedTemporaryFile("w+", suffix=".log", delete=False, encoding="utf-8")
        env = {**os.environ, "HF_HOME": cfg["hf_home"], "HF_HUB_OFFLINE": "1", "PYTHONIOENCODING": "utf-8"}
        proc = subprocess.Popen([cfg["python"], cfg["worker"], job_file], stdout=subprocess.PIPE,
                                stderr=err_file, text=True, encoding="utf-8", errors="replace", env=env)
        # Penjaga: worker macet (GPU hang dsb.) dihentikan paksa, sisa shot jatuh ke zoom biasa
        budget = 120 + 20 * len(todo)
        watchdog = threading.Timer(budget, proc.kill)
        watchdog.start()
        try:
            done = total - len(todo)
            for line in proc.stdout:
                if not line.startswith("{"):
                    continue
                done += 1
                try:
                    msg = json.loads(line)
                    if msg.get("error"):
                        errors.append(msg["error"])
                except json.JSONDecodeError:
                    pass
                job.set(stage=f"Parallax 2.5D adegan {min(done, total)}/{total}", progress=done / total)
            proc.wait(timeout=30)
        finally:
            watchdog.cancel()
        if proc.returncode not in (0, None) or errors:
            err_file.seek(0)
            tail = (errors[-1] if errors else err_file.read()[-300:]).strip().splitlines()
            job.set(stage=f"Sebagian parallax gagal, sisanya pakai zoom biasa: {(tail[-1] if tail else '')[:120]}")
    except Exception as e:  # noqa: BLE001
        job.set(stage=f"Parallax dilewati, pakai zoom biasa: {str(e)[:80]}")
    finally:
        if proc and proc.poll() is None:  # pastikan worker mati sebelum zoom cadangan menulis file yang sama
            proc.kill()
            proc.wait(timeout=10)
        for t in todo:  # sisa file setengah jadi dari worker
            part = t["out"].replace(".mp4", ".part.mp4")
            if os.path.exists(part):
                os.unlink(part)
        if err_file:
            err_file.close()
            os.unlink(err_file.name)
        if job_file:
            os.unlink(job_file)


def build_footage(job, pid: str, shots: list[tuple]) -> str:
    """shots = [(path gambar, durasi detik, twist, flicker)] -> source.mp4 bisu."""
    pdir = storage.project_dir(pid)
    sdir = pdir / "shots"
    sdir.mkdir(exist_ok=True)
    settings = config.load_settings()
    enc = media.h264_args(settings, 18)
    names, todo = [], []
    for i, (img, dur, twist, flicker) in enumerate(shots):
        names.append(f"shot_{i:03d}.mp4")
        if not (sdir / names[-1]).exists():  # file final hanya ada kalau utuh
            todo.append({"img": str(img), "out": str(sdir / names[-1]), "frames": max(2, round(dur * FPS)),
                         "motion": "twist" if twist else PARALLAX_MOTIONS[i % len(PARALLAX_MOTIONS)],
                         "post": ",".join(_grade(twist, flicker))})
    _parallax(job, settings, todo, len(shots))

    for i, (img, dur, twist, flicker) in enumerate(shots):  # cadangan: zoom biasa untuk yang belum jadi
        if (sdir / names[i]).exists():
            continue
        job.set(stage=f"Menganimasikan adegan {i + 1}/{len(shots)}", progress=i / len(shots))
        frames = max(2, round(dur * FPS))
        part = sdir / f"shot_{i:03d}.part.mp4"
        media.run([
            "ffmpeg", "-y", "-filter_threads", "2", "-i", str(img),
            "-vf", _shot_filter(i, frames, twist, flicker),
            "-frames:v", str(frames), *enc, "-pix_fmt", "yuv420p", "-r", str(FPS), str(part),
        ])
        os.replace(part, sdir / names[i])
        time.sleep(1.5)  # jeda pendingin: beban CPU penuh terus-menerus membuat laptop mati
    (sdir / "list.txt").write_text("".join(f"file '{n}'\n" for n in names), encoding="utf-8")
    out = pdir / "source.mp4"
    media.run([
        "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
        "-c", "copy", "-movflags", "+faststart", str(out),
    ], cwd=str(sdir))
    return str(out)


SPLIT_MIN = 4.0      # adegan >= 4 detik dipecah jadi dua sudut kamera
HOOK_SECONDS = 3.5   # judul hook hanya di awal, tidak menutupi gambar sepanjang video


def _image_jobs(sc: dict, dur: float | None = None) -> list[tuple[str, str]]:
    """Gambar yang perlu dilukis. Sudut kedua hanya untuk adegan yang cukup panjang untuk dipecah
    (dur diketahui setelah narasi) — adegan pendek tidak memakainya, jadi jangan buang waktu ComfyUI."""
    jobs = [("image", sc["prompt"])]
    if sc.get("prompt2") and not sc.get("twist") and (dur is None or dur >= SPLIT_MIN):
        jobs.append(("image2", sc["prompt2"]))
    return jobs


def _scene_durs(st: dict) -> list[float | None]:
    times = st.get("times") or []
    return [t1 - t0 for t0, t1 in times] if len(times) == len(st["scenes"]) else [None] * len(st["scenes"])


def _split_point(words: list[dict], t0: float, t1: float) -> float:
    """Titik potong dua shot: jeda antar-kata yang paling dekat dengan tengah adegan."""
    mid = (t0 + t1) / 2
    cands = [w["s"] for w in words if t0 + MIN_SHOT <= w["s"] <= t1 - MIN_SHOT]
    return min(cands, key=lambda t: abs(t - mid)) if cands else mid


def _mix_sfx(pdir, st: dict, i: int) -> str:
    cues = []
    for sc, (t0, t1) in zip(st["scenes"], st["times"]):
        if sc.get("twist"):
            if t0 >= horror_sfx.duration("riser"):  # riser harus selesai tepat saat hentakan
                cues.append(("riser", t0 - horror_sfx.duration("riser")))
            cues.append(("hit", t0))
        elif sc.get("sfx", "none") != "none":
            cues.append((sc["sfx"], t0 + 0.15))
    name = f"narration_mix_c{i + 1}.m4a"
    horror_sfx.mix(pdir / st["nar_name"], cues, pdir / name, st["sec"])
    return name


# ---------------------------------------------------------------- pipeline

HORROR_STYLE = {"preset": "beasty", "font": "Arial Black", "size": 0.95, "pos": 72,
                "uppercase": True, "color": "#FFFFFF", "highlight": "#FF2B2B"}
EDGE_RATE, EDGE_PITCH = "-6%", "-4Hz"
OMNI_SPEED = 0.8  # narator OmniVoice diperlambat 20% agar lebih mencekam (rekomendasi Claude; ubah bila user minta)
GEMINI_STYLE = ("Bacakan dengan suara rendah, pelan, setengah berbisik, misterius dan mencekam "
                "seperti narator cerita horor")


MAX_RESUME = 3  # setelah 3x dilanjutkan dan masih gagal, anggap state bermasalah -> cerita baru


def _write_state(state_file, data: dict):
    """Tulis atomik: laptop mati di tengah penulisan tidak boleh merusak state (dulu -> semua shot dihapus)."""
    tmp = state_file.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, state_file)


def full_run(job, pid: str, n: int = 3, voice: str = "omnivoice:narator_d",
             topic: str = "", style: str = "sinematik", pov: str = "kamu", fresh: bool = False) -> dict:
    try:
        p = storage.get(pid)
        if not p:
            raise RuntimeError("Project tidak ditemukan.")
        settings = config.load_settings()
        provider = (p.get("options") or {}).get("llm_provider") or settings["llm_provider"]
        n = max(1, min(int(n), 3))
        style_suffix = STYLES.get(style) or STYLES["sinematik"]
        pdir = storage.project_dir(pid)

        # Lanjutkan proses yang terputus: cerita, suara & gambar yang sudah jadi dipakai ulang
        state_file = pdir / "horror_state.json"
        stories, attempts = [], 0
        try:
            stt = json.loads(state_file.read_text(encoding="utf-8")) if state_file.exists() else {}
            if (not fresh and stt and not stt.get("done") and len(stt.get("stories") or []) == n
                    and int(stt.get("attempts") or 0) < MAX_RESUME):
                stories = stt["stories"]
                attempts = int(stt.get("attempts") or 0) + 1
                job.set(stage=f"Melanjutkan proses sebelumnya yang terputus (ke-{attempts})", progress=0.05)
        except Exception:  # noqa: BLE001
            stories = []
        if not stories:  # mulai baru: buang shot & gambar dari cerita lama supaya tidak terpakai ulang
            shutil.rmtree(pdir / "shots", ignore_errors=True)
            shutil.rmtree(pdir / "scenes", ignore_errors=True)

        # 0. ComfyUI siap? Hanya kalau masih ada gambar yang perlu dilukis
        #    (lebih baik gagal di awal daripada setelah naskah & suara jadi)
        sc_dir = pdir / "scenes"
        need_images = not stories or any(
            not (sc_.get(key) and (sc_dir / sc_[key]).exists())
            for st_ in stories for sc_, d_ in zip(st_["scenes"], _scene_durs(st_))
            for key, _ in _image_jobs(sc_, d_)
        )
        ckpt = ""
        if need_images:
            job.set(stage="Memeriksa ComfyUI", progress=0.01)
            comfy.ensure_running(settings, job)
            ckpt = comfy.checkpoint(settings)

        def _save_state(done=False):
            _write_state(state_file, {"done": done, "attempts": attempts, "stories": stories})

        # 1. Cerita
        avoid = [h.get("title", "") for h in _history()]
        cats = random.sample(CATEGORIES, k=n)
        for i in range(n if not stories else 0):
            job.set(stage=f"AI menulis cerita {i + 1}/{n}", progress=0.03 + 0.07 * i / n)
            pov_i = pov if pov in POVS else random.choice(list(POVS))  # "acak": tiap cerita diundi
            st = generate_story(cats[i], topic, avoid, provider, settings, pov_i)
            st["pov"] = pov_i
            avoid.append(st["title"])
            stories.append(st)
        if len(stories) == n:
            _save_state()  # cerita aman walau narasi nanti terputus

        # 2. Suara narator + pembagian waktu adegan
        for i, st in enumerate(stories):
            if st.get("nar_name") and (pdir / st["nar_name"]).exists():
                continue  # sudah dibaca di proses sebelumnya
            job.set(stage=f"Narator membaca cerita {i + 1}/{n}", progress=0.1 + 0.05 * i / n)
            st["script"] = " ".join(s["narration"] for s in st["scenes"])
            nar_name = f"narration_c{i + 1}.mp3"
            nar_dur, words = narrate.synthesize(
                st["script"], voice, pdir / nar_name,
                rate=EDGE_RATE, pitch=EDGE_PITCH, gemini_style=GEMINI_STYLE, omni_speed=OMNI_SPEED,
            )
            st.update(nar_name=nar_name, nar_dur=nar_dur, words=words, sec=nar_dur + 0.8)
            st["times"] = _scene_times(st["scenes"], words, st["sec"])
            shutil.rmtree(pdir / "shots", ignore_errors=True)  # durasi adegan berubah: shot lama tidak valid
            _save_state()  # tiap narasi langsung disimpan

        # 3. Gambar AI per adegan
        sc_dir.mkdir(exist_ok=True)
        todo = [(i, k, key, prompt) for i, st in enumerate(stories)
                for k, (sc_, d_) in enumerate(zip(st["scenes"], _scene_durs(st)))
                for key, prompt in _image_jobs(sc_, d_)]
        for j, (i, k, key, prompt) in enumerate(todo):
            sc = stories[i]["scenes"][k]
            if sc.get(key) and (sc_dir / sc[key]).exists():
                continue
            job.set(stage=f"Melukis gambar {j + 1}/{len(todo)} ({ckpt.split('.')[0]})",
                    progress=0.15 + 0.55 * j / len(todo))
            seed = random.randint(1, 2 ** 31)
            img = comfy.txt2img(settings, f"{prompt}, {style_suffix}", NEGATIVE, seed,
                                GEN_W, GEN_H, ckpt=ckpt)
            out = sc_dir / f"v{i + 1}_s{k + 1:02d}{'b' if key == 'image2' else ''}.jpg"
            ImageOps.fit(img, (W, H), method=3).save(out, quality=94)  # 3 = BICUBIC
            sc.update({key: out.name, ("seed2" if key == "image2" else "seed"): seed})
            _save_state()
        if need_images:
            comfy.free(settings)

        # 4. Footage (satu section per cerita)
        shots = []
        for st in stories:
            for sc, (t0, t1) in zip(st["scenes"], st["times"]):
                img2 = sc.get("image2") and sc_dir / sc["image2"]
                if img2 and img2.exists() and t1 - t0 >= SPLIT_MIN:  # dua sudut kamera per adegan
                    mid = _split_point(st["words"], t0, t1)
                    shots.append((sc_dir / sc["image"], mid - t0, False, random.random() < 0.3))
                    shots.append((img2, t1 - mid, False, random.random() < 0.3))
                else:
                    shots.append((sc_dir / sc["image"], t1 - t0, sc["twist"], random.random() < 0.35))
        source = build_footage(_SubJob(job, 0.7, 0.8), pid, shots)
        p = storage.get(pid)
        dur, w, h = media.probe(source)
        p.update(source_file=source, duration=round(dur, 2), width=w, height=h)
        storage.save(p)

        # 5. SFX dicampur ke trek narator (riser + hentakan di twist)
        for i, st in enumerate(stories):
            job.set(stage=f"Menambahkan efek suara {i + 1}/{n}", progress=0.8)
            st["mix_name"] = _mix_sfx(pdir, st, i)

        # 6. Klip per cerita
        ambience = ensure_ambience()
        clips, segments, offset = [], [], 0.0
        for i, st in enumerate(stories):
            start, end = offset, offset + st["sec"]
            offset = end
            words = [{"w": w_["w"], "s": round(start + w_["s"], 3), "e": round(start + w_["e"], 3)}
                     for w_ in st["words"]]
            segments.append({"start": round(start, 3), "end": round(end, 3),
                             "text": st["script"], "words": words})
            tw = next((t for sc, t in zip(st["scenes"], st["times"]) if sc["twist"]), st["times"][-1])
            clips.append({
                "id": f"c{i + 1}",
                "start": round(start, 3), "end": round(end, 3),
                "title": st["title"], "hook": st["hook"], "endcard": st["cta"],
                "score": 95 - i * 5,
                "reason": "Mode horor",
                "teaser": {"start": round(start + tw[0], 3), "end": round(start + tw[1], 3)},  # frame thumbnail
                "style": dict(HORROR_STYLE),
                "hook_style": {**storage.DEFAULT_HOOK_STYLE, "template": "elegant", "pos": 12,
                               "duration": HOOK_SECONDS},
                "fx": {**storage.DEFAULT_FX, "zoom": False, "cut_silence": False, "teaser": False,
                       "keywords": False, "emoji": False, "progress_color": "#B3001B",
                       "bgm": random.choice(ambience), "bgm_volume": 0.32, "border": False},
                "narration": {"file": st.get("mix_name") or st["nar_name"], "duration": st["nar_dur"],
                              "voice": voice, "voice_only": st["nar_name"]},
                "scenes": [{k_: s.get(k_) for k_ in ("narration", "prompt", "prompt2", "sfx", "image",
                                                     "image2", "seed", "twist")} for s in st["scenes"]],
                "meta": {
                    "title": st["title"],
                    "thumbnail_text": st["thumbnail_text"] or st["hook"] or st["title"],
                    "description": st["description"],
                    "hashtags": st["hashtags"] or ["#shorts", "#horor", "#ceritahoror"],
                },
                "exports": [],
            })

        storage.save_transcript(pid, {"language": "id", "segments": segments})
        p = storage.get(pid)
        p["clips"] = clips
        p["status"] = "processing"
        p["mode"] = "horor"
        p["upload_notes"] = UPLOAD_NOTES
        p["title"] = stories[0]["title"] if n == 1 else f"Horor: {stories[0]['title']} (+{n - 1})"
        storage.save(p)
        _remember([{"title": st["title"], "ts": time.time(), "pid": pid} for st in stories])

        # 7. Produksi batch
        out = autoproduce.produce(_SubJob(job, 0.8, 1.0), pid, n=len(clips))
        _save_state(done=True)
        return out
    except Exception as e:  # noqa: BLE001
        try:
            p = storage.get(pid)
            p["status"] = "error"
            p["error"] = f"Mode horor gagal: {e}"
            storage.save(p)
        except Exception:  # noqa: BLE001
            pass
        raise
