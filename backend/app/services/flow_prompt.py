"""Paket prompt Google Flow (Veo): satu cerita horor utuh dipecah jadi shot ±8 detik siap salin.

Flow membuat video per klip (±8 detik), jadi cerita 50 detik = 6-7 klip yang disambung. AI hanya menulis
BAHAN per shot (situasi, cara baca, kamera, aksi, cahaya, suara); teks prompt dirakit oleh kode supaya
deskripsi tokoh dan gaya visual tersalin PERSIS sama di setiap shot (kunci konsistensi antar klip).

Modul baru, berdiri sendiri: tidak mengubah Mode Horor / Naskah horor. Tidak membuat gambar, suara,
atau video apa pun — hanya teks.
"""
import json
import os
import re
import time
import uuid

from .. import config
from .llm import _extract_json_object, chat_fb

DIR = config.DATA_DIR / "flow_packages"
_ID_RE = re.compile(r"^[0-9a-f]{8,40}$")
TOPIC_MAX = 1500
SHOT_SEC = 8

DURASI = {  # id: (jumlah shot, label)
    "pendek": (6, "±50 detik"),
    "sedang": (10, "±80 detik"),
    "panjang": (15, "±2 menit"),
}
VISUAL = {
    "sinematik": ("cinematic horror film, photorealistic, dark low-key lighting, desaturated teal and amber grade, "
                  "35mm film grain, shallow depth of field"),
    "found": ("found footage horror, handheld night-vision camcorder look, grainy low light, VHS artifacts, "
              "realistic amateur footage"),
    "komik": ("animated dark horror manhwa style, bold ink lines, heavy shadows, muted palette with red accents"),
}
AUDIO = {
    "suasana": "Hanya suara suasana (narasi dari narator app)",
    "dialog": "Suasana + dialog pendek tokoh di dalam klip",
}
AVOID = "gore, blood, wounds, text, subtitles, captions, watermark, logo, bright cheerful colors"

SYSTEM_PROMPT = (
    "Kamu penulis naskah dan sutradara film horor pendek Indonesia. Kamu menulis cerita yang terasa dekat dengan "
    "kehidupan orang Indonesia, lalu memecahnya jadi shot video berdurasi 8 detik untuk dibuat di Google Flow (Veo). "
    "Deskripsi visual untuk Veo kamu tulis dalam bahasa Inggris yang konkret. Kamu selalu membalas hanya dengan JSON valid."
)


# ---------------------------------------------------------------- penyimpanan

def _file(pid: str):
    if not _ID_RE.match(pid or ""):
        raise KeyError(pid)
    return DIR / f"{pid}.json"


def _save(p: dict) -> dict:
    DIR.mkdir(parents=True, exist_ok=True)
    f = _file(p["id"])
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(p, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, f)
    return p


def get(pid: str) -> dict | None:
    try:
        return json.loads(_file(pid).read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None


def delete(pid: str) -> bool:
    try:
        _file(pid).unlink()
        return True
    except Exception:  # noqa: BLE001
        return False


def list_all() -> list[dict]:
    out = []
    for f in DIR.glob("*.json") if DIR.exists() else []:
        try:
            p = json.loads(f.read_text(encoding="utf-8"))
            out.append({"id": p["id"], "title": p["pkg"]["judul"], "ts": p.get("ts", 0),
                        "shots": len(p["pkg"]["shots"])})
        except Exception:  # noqa: BLE001
            continue
    return sorted(out, key=lambda x: -x["ts"])


# ---------------------------------------------------------------- prompt ke LLM

def _llm_prompt(topic: str, pov: str, n: int, audio: str, avoid: list[str], base: dict | None) -> str:
    pov_line = ("orang kedua: narator memakai 'kamu', penonton adalah tokoh utamanya" if pov == "kamu"
                else "orang pertama: narator memakai 'aku', seperti curhat pengalaman sendiri")
    if base:
        src = "\n".join(f"{i + 1}. {s.get('narration', '')}" for i, s in enumerate(base.get("scenes") or []))
        topic_line = (f"Ubah naskah horor berikut jadi paket shot Google Flow. PERTAHANKAN alur, twist, dan isi "
                      f"narasinya (boleh dirapikan/dibagi ulang agar pas {n} shot).\nJudul: {base.get('title', '')}\n"
                      f"Tokoh utama: {base.get('protagonist', '')}\nNarasi asli per adegan:\n{src}\n")
    elif topic.strip():
        topic_line = f"Topik/ringkasan dari pengguna (wajib dipakai): {topic.strip()}\n"
    else:
        topic_line = "Topik: bebas, pilih ide horor Indonesia yang segar dan orisinal.\n"
    avoid_line = ("Judul yang sudah pernah dibuat (jangan diulang):\n- " + "\n- ".join(avoid[-30:]) + "\n") if avoid else ""
    if audio == "dialog":
        audio_rule = ("Tokoh BOLEH bicara di dalam klip: isi \"dialog\" dengan kalimat bahasa Indonesia maks 10 kata dan "
                      "\"pembicara\" dengan id tokoh. Paling banyak separuh shot berdialog; sisanya \"\".")
    else:
        audio_rule = "Tidak ada dialog di dalam klip: \"dialog\" dan \"pembicara\" selalu \"\" (suara cerita dari narator)."

    return f"""{topic_line}{avoid_line}
Buat SATU paket cerita horor utuh untuk video vertikal 9:16, tepat {n} shot @ 8 detik (total ±{n * SHOT_SEC} detik).
Sudut pandang narasi: {pov_line}.

LANGKAH BERPIKIR (wajib, tulis hasilnya di JSON):
A. "latar": dunia ceritanya — tempat spesifik di Indonesia, waktu/era, dan ATURAN horornya (kapan/mengapa makhluknya muncul).
B. "tokoh": semua tokoh DAN makhluk halus (2-4). Tiap tokoh: "id" (T1, T2, ...), "nama", "peran",
   "fisik_en" (deskripsi fisik bahasa Inggris 15-30 kata: usia, wajah samar/tidak, rambut, pakaian, warna — KONKRET,
   tulis "Indonesian"; makhluk halus digambarkan samar dan tanpa darah), "watak", dan "cara_bicara"
   (logat, nada, kebiasaan kata; makhluk: berbisik, serak, dsb).
C. "gaya_narator": karakter suara narator untuk seluruh cerita (mis. "pria muda, pelan, datar, makin menekan").
D. "shots": tepat {n} shot berurutan: hook (shot 1) -> ketegangan naik -> twist (shot ke-2 atau ke-3 dari belakang)
   -> penutup menggantung + ajakan komentar (hanya di narasi shot terakhir).

Isi tiap shot:
- "narasi": kalimat narator bahasa Indonesia ngobrol (nggak, banget, kayak), 12-18 kata (pas dibaca 8 detik),
  kalimat pendek, boleh "..." untuk jeda. Angka ditulis huruf. Kutipan pakai tanda kutip tunggal.
- "situasi": keadaan saat itu (bahasa Indonesia, 1 kalimat): jam, tempat persis, cuaca, suara sekitar, perasaan tokoh.
- "cara_baca": arahan membaca narasi (bahasa Indonesia, singkat): emosi + tempo, mis. "datar, pelan", "berbisik, tertahan",
  "cepat, panik", "jeda panjang sebelum kata terakhir".
- "tokoh": daftar id tokoh yang TERLIHAT di shot (boleh []).
- "aksi_en": apa yang terjadi/bergerak dalam 8 detik (bahasa Inggris, 10-25 kata, satu aksi jelas).
- "lokasi_en": lokasi + detail khas Indonesia (bahasa Inggris, 8-20 kata).
- "kamera_en": sudut + gerak kamera (bahasa Inggris), mis. "slow push-in, eye level", "handheld POV", "static wide shot, low angle".
- "cahaya_en": cahaya + mood (bahasa Inggris, 5-12 kata).
- "suara_en": suara suasana & efek di klip (bahasa Inggris), mis. "heavy rain, distant dog barking, three slow knocks".
- "dialog", "pembicara": lihat aturan audio.
- "twist": true hanya untuk SATU shot twist.
Aturan audio: {audio_rule}

Aturan umum:
- Tokoh utama jangan diperlihatkan wajahnya dengan jelas (dari belakang, siluet, tangan, POV). Makhluk halus samar:
  di kejauhan, di bayangan, sebagian tertutup. Seram lewat suasana, bukan sadis.
- Tanpa gore/darah, tanpa bunuh diri, tanpa anak dicelakai, tanpa menghina agama, tanpa nama orang/institusi asli.
- Jangan ulang komposisi kamera yang sama di shot berurutan. Variasikan: wide -> close-up -> POV -> detail objek.
- "judul": maks 8 kata, bikin penasaran, tanpa emoji. "logline": 1 kalimat ringkasan cerita.
- "deskripsi": 2 kalimat untuk caption + ajakan follow. "hashtags": 8-12 hashtag (#horor #ceritahoror ...).

Balas HANYA satu objek JSON:
{{"judul": "...", "logline": "...", "latar": {{"tempat": "...", "waktu": "...", "aturan": "..."}},
"tokoh": [{{"id": "T1", "nama": "...", "peran": "...", "fisik_en": "...", "watak": "...", "cara_bicara": "..."}}],
"gaya_narator": "...", "deskripsi": "...", "hashtags": ["#horor"],
"shots": [{{"narasi": "...", "situasi": "...", "cara_baca": "...", "tokoh": ["T1"], "aksi_en": "...", "lokasi_en": "...",
"kamera_en": "...", "cahaya_en": "...", "suara_en": "...", "dialog": "", "pembicara": "", "twist": false}}]}}"""


# ---------------------------------------------------------------- rapikan & rakit

def _s(v, n: int) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def clean(raw: dict) -> dict:
    """Normalisasi paket (dari AI atau hasil edit). ValueError kalau tidak bisa dipakai."""
    if not isinstance(raw, dict):
        raise ValueError("Paket tidak valid.")
    tokoh, ids = [], set()
    for i, t in enumerate(raw.get("tokoh") or []):
        if not isinstance(t, dict):
            continue
        tid = _s(t.get("id"), 8) or f"T{i + 1}"
        if tid in ids:
            tid = f"T{i + 1}"
        ids.add(tid)
        tokoh.append({"id": tid, "nama": _s(t.get("nama"), 60) or tid, "peran": _s(t.get("peran"), 120),
                      "fisik_en": _s(t.get("fisik_en"), 400), "watak": _s(t.get("watak"), 200),
                      "cara_bicara": _s(t.get("cara_bicara"), 200)})
    shots = []
    for s in raw.get("shots") or []:
        if not isinstance(s, dict):
            continue
        sh = {
            "narasi": _s(s.get("narasi"), 400), "situasi": _s(s.get("situasi"), 300),
            "cara_baca": _s(s.get("cara_baca"), 120),
            "tokoh": [x for x in (s.get("tokoh") or []) if isinstance(x, str) and x in ids],
            "aksi_en": _s(s.get("aksi_en"), 400), "lokasi_en": _s(s.get("lokasi_en"), 300),
            "kamera_en": _s(s.get("kamera_en"), 160), "cahaya_en": _s(s.get("cahaya_en"), 160),
            "suara_en": _s(s.get("suara_en"), 240), "dialog": _s(s.get("dialog"), 160),
            "pembicara": _s(s.get("pembicara"), 8), "twist": bool(s.get("twist")),
        }
        if sh["pembicara"] not in ids:
            sh["pembicara"] = ""
        if sh["aksi_en"] or sh["narasi"]:
            shots.append(sh)
    shots = shots[:20]
    if len(shots) < 3:
        raise ValueError("Paket butuh minimal 3 shot.")
    tw = [i for i, s in enumerate(shots) if s["twist"]]
    for i, s in enumerate(shots):
        s["twist"] = bool(tw) and i == tw[0]
    lat = raw.get("latar") if isinstance(raw.get("latar"), dict) else {}
    return {
        "judul": _s(raw.get("judul"), 120) or "Cerita horor",
        "logline": _s(raw.get("logline"), 300),
        "latar": {"tempat": _s(lat.get("tempat"), 200), "waktu": _s(lat.get("waktu"), 120),
                  "aturan": _s(lat.get("aturan"), 300)},
        "tokoh": tokoh,
        "gaya_narator": _s(raw.get("gaya_narator"), 200),
        "deskripsi": _s(raw.get("deskripsi"), 1000),
        "hashtags": [_s(h, 40) for h in (raw.get("hashtags") or []) if isinstance(h, str) and h.strip().startswith("#")][:14],
        "shots": shots,
    }


def problems(pkg: dict, n: int | None = None) -> list[str]:
    out = []
    shots = pkg["shots"]
    if n and abs(len(shots) - n) > 1:
        out.append(f"jumlah shot {len(shots)}, diminta {n}")
    tw = next((i for i, s in enumerate(shots) if s["twist"]), None)
    if tw is None:
        out.append("tidak ada shot twist")
    elif tw < len(shots) - 3 or tw == len(shots) - 1:
        out.append(f"twist di shot {tw + 1} dari {len(shots)}, sebaiknya 2-3 shot sebelum akhir")
    if "komentar" not in shots[-1]["narasi"].lower():
        out.append("narasi shot terakhir belum mengajak komentar")
    if any("komentar" in s["narasi"].lower() for s in shots[:-1]):
        out.append("ajakan komentar muncul sebelum shot terakhir")
    kosong = [str(i + 1) for i, s in enumerate(shots) if not s["aksi_en"]]
    if kosong:
        out.append("aksi visual kosong di shot " + ", ".join(kosong))
    if not pkg["tokoh"] or any(not t["fisik_en"] for t in pkg["tokoh"]):
        out.append("ada tokoh tanpa deskripsi fisik; tampilannya bisa berubah antar klip")
    return out


def build(pkg: dict, visual: str, audio: str) -> dict:
    """Rakit teks siap salin: blok tokoh (Ingredients), prompt per shot, dan naskah narator."""
    style = VISUAL.get(visual) or VISUAL["sinematik"]
    by_id = {t["id"]: t for t in pkg["tokoh"]}
    n = len(pkg["shots"])

    ingredients = []
    for t in pkg["tokoh"]:
        ingredients.append({
            "id": t["id"], "nama": t["nama"],
            "prompt": (f"Character reference image, full body, three-quarter view, plain dark background. {style}. "
                       f"{t['fisik_en']}. No text, no watermark."),
        })

    prompts = []
    for i, s in enumerate(pkg["shots"]):
        lines = [f"SHOT {i + 1}/{n} · {SHOT_SEC} seconds" + (" · TWIST" if s["twist"] else ""),
                 f"Vertical 9:16 video. {style}."]
        chars = [by_id[x] for x in s["tokoh"] if x in by_id]
        if chars:
            lines.append("Characters (keep exactly the same look as in previous shots): "
                         + " ".join(f"{c['nama']}: {c['fisik_en']}." for c in chars))
        if s["aksi_en"]:
            lines.append(f"Action: {s['aksi_en']}")
        if s["lokasi_en"]:
            lines.append(f"Setting: {s['lokasi_en']}")
        if s["kamera_en"]:
            lines.append(f"Camera: {s['kamera_en']}")
        if s["cahaya_en"]:
            lines.append(f"Lighting & mood: {s['cahaya_en']}" + (", sudden shocking reveal" if s["twist"] else ""))
        audio_line = s["suara_en"] or "quiet eerie room tone"
        sp = by_id.get(s["pembicara"])
        if audio == "dialog" and s["dialog"] and sp:
            gaya = f", {sp['cara_bicara']}" if sp["cara_bicara"] else ""
            audio_line += f'. {sp["nama"]} says in Indonesian{gaya}: "{s["dialog"]}". No music'
        else:
            audio_line += ". No speech, no music"
        lines.append(f"Audio: {audio_line}.")
        lines.append(f"Avoid: {AVOID}.")
        prompts.append("\n".join(lines))

    naskah = [f"Gaya narator: {pkg['gaya_narator']}" if pkg["gaya_narator"] else ""]
    for i, s in enumerate(pkg["shots"]):
        arah = f"[{s['cara_baca']}] " if s["cara_baca"] else ""
        naskah.append(f"Shot {i + 1}: {arah}{s['narasi']}")
    return {"ingredients": ingredients, "prompts": prompts,
            "naskah": "\n".join(x for x in naskah if x),
            "semua": "\n\n".join(prompts)}


def view(p: dict) -> dict:
    return {**p, "built": build(p["pkg"], p["visual"], p["audio"]), "warnings": problems(p["pkg"]),
            "detik": len(p["pkg"]["shots"]) * SHOT_SEC}


# ---------------------------------------------------------------- tulis

def generate(topic: str, pov: str, n: int, audio: str, provider: str, settings: dict,
             base: dict | None = None) -> dict:
    avoid = [x["title"] for x in list_all()]
    last, fallback = None, None
    for attempt in range(3):
        try:
            content = chat_fb(settings, provider, [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _llm_prompt(topic, pov, n, audio, avoid, base)},
            ], temperature=0.85 if attempt < 2 else 0.6, max_tokens=16000)
            pkg = clean(_extract_json_object(content))
            probs = problems(pkg, n)
            if not probs:
                return pkg
            if fallback is None or len(probs) < len(fallback[1]):
                fallback = (pkg, probs)
            last = RuntimeError("; ".join(probs))
        except (ValueError, RuntimeError) as e:  # JSONDecodeError turunan ValueError
            last = e
    if fallback:
        return fallback[0]
    raise RuntimeError(f"Gagal menulis paket Flow: {last}")


def create(topic: str, pov: str, durasi: str, visual: str, audio: str, llm_provider: str = "",
           base: dict | None = None) -> dict:
    settings = config.load_settings()
    n = DURASI[durasi][0]
    if base:
        n = max(4, min(15, len(base.get("scenes") or []) or n))
    pkg = generate(topic[:TOPIC_MAX], pov, n, audio, llm_provider or settings["llm_provider"], settings, base)
    p = {"id": uuid.uuid4().hex[:16], "topic": topic[:TOPIC_MAX], "pov": pov, "durasi": durasi,
         "visual": visual, "audio": audio, "llm_provider": llm_provider, "pkg": pkg, "ts": time.time()}
    return _save(p)


def update(pid: str, pkg: dict, visual: str = "", audio: str = "") -> dict | None:
    p = get(pid)
    if not p:
        return None
    p["pkg"] = clean(pkg)
    if visual in VISUAL:
        p["visual"] = visual
    if audio in AUDIO:
        p["audio"] = audio
    return _save(p)
