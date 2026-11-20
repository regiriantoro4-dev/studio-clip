"""Tahap (c): dari ide atau naskah -> video animasi 3D otomatis.

Pakai (dari folder tools/animasi-3d, Python venv backend):
  python buat_video.py --ide "penjelajah sombong yang meremehkan buaya" --out hasil-c
  python buat_video.py --teks naskahku.txt --out hasil-c      (1 baris = 1 kalimat narasi; AI hanya menyusun visual)
  python buat_video.py --naskah hasil-c/naskah.json --out hasil-c   (pakai naskah yang sudah ada / sudah diedit)
  tambahan: --tanpa-render (berhenti setelah naskah + narasi), --suara id-ID-GadisNeural

Langkah: naskah (LLM gratis: Groq/Gemini/OpenRouter saja) -> diperiksa & dirapikan -> narasi edge-tts per adegan
-> timeline.json -> render.cjs --skrip mesin.js -> <out>/adegan.mp4
"""
import argparse
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "backend"))

LOKASI = {
    "sungai": "sungai di tengah hutan saat senja; tokoh berada DI DALAM PERAHU yang sedang berlayar; bisa ada buaya mengintai di air",
    "kemah": "perkemahan malam: api unggun, tenda, peti koleksi, bulan & bintang",
    "gurun": "padang pasir senja yang luas; pasir bisa bergerak (gundukan merayap) dan buaya bisa muncul dari pasir",
    "ruangan": "ruang klub bangsawan yang mewah: lukisan berburu, rak buku, karpet, lampu hangat, buaya pajangan di dinding",
}
POSE = {
    "diam": "berdiri biasa", "pinggang": "tangan di pinggang (percaya diri/sombong)", "tunjuk": "menunjuk ke samping",
    "lihat": "condong memperhatikan sesuatu di bawah", "kaget": "kedua tangan terangkat kaget", "dayung": "mendayung (hanya di sungai)",
    "sedekap": "tangan bersedekap", "angkat": "satu tangan terangkat (menyapa/menyombong)", "takut": "tangan menutup dada, lutut gemetar",
    "hangat": "tangan ke depan menghangatkan diri (cocok di kemah)",
}
EKSPRESI = {
    "santai": "tenang", "sombong": "seringai sombong", "heran": "bingung/curiga", "cemas": "khawatir berkeringat",
    "kaget": "terkejut mata melotot", "tawa": "tertawa lebar", "kedip": "mata tertutup sesaat",
}
SHOT = {"lebar": "memperlihatkan lokasi & semua tokoh (pakai saat pindah lokasi)", "sedang": "kelompok tokoh setinggi badan",
        "dekat": "wajah/badan atas satu tokoh (emosi)", "rendah": "kamera rendah dari tanah (ancaman/kejutan)"}
AKSI = {"jalan_masuk": "berjalan masuk ke posisi (awal adegan)", "loncat": "meloncat kaget", "tawa": "terpingkal-pingkal", "gemetar": "gemetar ketakutan"}
KEJADIAN = {"gundukan": "gurun: gundukan pasir merayap mendekati tokoh", "buaya_muncul": "gurun: gundukan + kepala buaya muncul dari pasir pada kata tertentu",
            "buaya_air": "sungai: buaya mengintai di air dekat perahu"}
POSISI = ["kiri", "tengah", "kanan"]
OPSI_TOKOH = {
    "rambut": ["mangkok", "pendek", "botak", "sanggul"], "topi": [None, "safari", "tinggi"], "kumis": [True, False], "kacamata": [True, False],
    "monokel": [True, False], "jas": "warna hex atau null (untuk tokoh kaya/bangsawan)", "syal": "warna hex atau null", "baju": "warna hex terang",
    "warnaRambut": "warna hex", "tas": [True, False],
}

ATURAN = f"""Kamu sutradara & penulis naskah video pendek animasi kartun (gaya cerita sejarah lucu, vertikal 9:16, 20-40 detik).
Tulis naskah dalam BAHASA INDONESIA lisan yang mengalir. Kembalikan HANYA JSON valid sesuai skema.

ALUR WAJIB (ini yang paling penting):
1. Adegan 1 = HOOK: kalimat yang langsung bikin penasaran (kejadian aneh, klaim sombong, atau pertanyaan).
2. Adegan 2-3 = KONTEKS: siapa tokohnya, di mana, mau apa. Singkat.
3. Adegan berikutnya = KONFLIK NAIK: tiap kalimat menambah ketegangan, sebab-akibat jelas.
4. PUNCAK: kejadian terbesar (pakai shot "rendah" atau "dekat", ekspresi kaget, kejadian visual).
5. Adegan terakhir = PUNCHLINE/TWIST singkat yang MENJAWAB hook di awal. Lucu atau ironis.
- Narator ORANG KETIGA yang bercerita (mis. "Tahun seribu delapan ratus...", "Seorang penjelajah..."), BUKAN "aku/kami".
- HANYA tulis kejadian yang bisa digambar dengan pilihan di bawah: tokoh berdiri, berjalan masuk, berpose, berekspresi,
  meloncat kaget, tertawa, gemetar; perahu berlayar; buaya mengintai di air; gundukan pasir merayap; buaya muncul dari pasir;
  api unggun; obrolan di klub. DILARANG menulis: perahu terbalik, berenang, berkelahi, digigit, berlari jauh, terbang, makan, menangkap.
  Kejadian besar yang tak bisa digambar boleh DISIRATKAN lewat reaksi tokoh atau lompatan waktu (mis. lalu pindah ke klub bertahun-tahun kemudian).
- Kata sambung harus LOGIS: "Tapi" hanya untuk pertentangan, "Lalu" untuk urutan, "Sampai" untuk kejadian yang memotong, "Ternyata" untuk pengungkapan.
- Punchline paling kuat bila ada lompatan waktu/tempat yang ironis (mis. bertahun-tahun kemudian di klub ia membual sebaliknya).
- 6 sampai 9 adegan, total 60-110 kata. Tiap adegan = TEPAT SATU kalimat 5-16 kata.
- Tiap kalimat harus menyambung dari kalimat sebelumnya (pakai kata sambung: Tapi, Lalu, Sampai, Ternyata, Sejak itu...).
- Angka ditulis dengan huruf (seribu delapan ratus...). Jangan pakai singkatan atau emoji.
- Satu tokoh utama yang konsisten dari awal sampai akhir. Maksimal 3 tokoh per adegan.
- KONSISTENSI TOKOH: tokoh yang sudah ada di suatu lokasi TETAP dicantumkan di adegan berikutnya di lokasi yang sama (posisi sama),
  kecuali kalimatnya menyebut ia pergi. Jangan memunculkan tokoh baru tanpa diperkenalkan di narasi.
- Di sungai, kalau ada perahu dengan lebih dari satu tokoh, salah satunya (pemandu/pendayung) berpose "dayung".
- Pindah lokasi HANYA jika kalimatnya menyebut perpindahan waktu/tempat (mis. "Malamnya", "Keesokan harinya", "Bertahun-tahun kemudian").
  Lokasi berjalan maju (mis. sungai -> kemah -> gurun -> ruangan); jangan bolak-balik ke lokasi yang sudah ditinggalkan.
- Teks narasi adalah kalimat cerita biasa. JANGAN menulis istilah teknis (pose, ekspresi, berubah menjadi, shot, adegan).
- Gambar harus SESUAI isi kalimat: kalau kalimat bilang kaget, ekspresinya kaget pada kata itu (pakai "berubah").
- Shot berganti-ganti; jangan dua adegan berturut-turut dengan shot yang sama. Adegan pertama di lokasi baru pakai "lebar".
- Di lokasi "sungai" semua tokoh ada di perahu (posisi kiri/tengah/kanan = belakang/tengah/depan perahu).

PILIHAN YANG TERSEDIA (pakai nama persis):
lokasi: {json.dumps(LOKASI, ensure_ascii=False)}
pose: {json.dumps(POSE, ensure_ascii=False)}
ekspresi: {json.dumps(EKSPRESI, ensure_ascii=False)}
shot: {json.dumps(SHOT, ensure_ascii=False)}
aksi: {json.dumps(AKSI, ensure_ascii=False)}
kejadian: {json.dumps(KEJADIAN, ensure_ascii=False)}
posisi: {POSISI}
opsi penampilan tokoh: {json.dumps(OPSI_TOKOH, ensure_ascii=False)}

SKEMA JSON:
{{"judul": "...",
  "tokoh": {{"<id_tanpa_spasi>": {{"nama": "...", "rambut": "...", "topi": null, "kumis": false, "kacamata": false, "monokel": false, "jas": null, "syal": "#c8302e", "baju": "#f7edd8", "warnaRambut": "#1e1b22", "tas": true}}}},
  "adegan": [
    {{"teks": "satu kalimat narasi", "lokasi": "...", "shot": "...", "fokus": "<id tokoh>",
      "tokoh": [{{"id": "...", "posisi": "kiri|tengah|kanan", "pose": "...", "ekspresi": "...", "aksi": null}}],
      "berubah": [{{"pada": "<satu kata persis dari teks>", "tokoh": "<id>", "pose": "...", "ekspresi": "...", "aksi": null}}],
      "kejadian": null, "kejadianPada": null}}
  ]}}
"""


# ---------------------------------------------------------------- LLM (hanya provider gratis)
GRATIS = ["groq", "gemini", "openrouter"]


def tanya_llm(pesan_user: str, suhu: float = 0.8, sistem: str | None = None, urutan: list | None = None) -> dict:
    from app import config
    from app.services import llm
    s = config.load_settings()
    errors = []
    for nama in [n for n in (urutan or GRATIS) if n in GRATIS]:  # tetap hanya provider gratis
        cfg = s["providers"].get(nama) or {}
        if not cfg.get("api_key"):
            continue
        pesan = [{"role": "system", "content": sistem or ATURAN}, {"role": "user", "content": pesan_user}]
        for coba in range(2):
            try:
                teks = llm.chat(cfg, pesan, temperature=suhu, max_tokens=6000) or ""
                data = baca_json(teks)
                print(f"  jawaban dari {nama}")
                return data
            except Exception as e:  # noqa: BLE001
                errors.append(f"{nama}#{coba + 1}: {str(e)[:120]}")
                if "teks" in locals() and teks:
                    (HERE / "_llm_terakhir.txt").write_text(teks, encoding="utf-8")
                    # coba lagi TANPA menyertakan jawaban lama (menyertakannya membuat permintaan terlalu besar untuk kuota gratis)
                    pesan = [pesan[0], {"role": "user", "content": pesan_user + "\n\nPENTING: balas HANYA satu objek JSON valid yang lengkap, "
                                        "tanpa teks lain, tanpa komentar, tanpa koma berlebih, semua kutipan di dalam teks pakai tanda kutip tunggal."}]
                else:
                    break
    raise SystemExit("Semua LLM gratis gagal: " + " | ".join(errors))


def baca_json(teks: str) -> dict:
    t = re.sub(r"```(?:json)?", "", teks)
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b <= a:
        raise ValueError("tidak ada objek JSON")
    t = t[a:b + 1]
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        t2 = re.sub(r"//[^\n]*", "", t)            # komentar
        t2 = re.sub(r",\s*([}\]])", r"\1", t2)     # koma berlebih
        t2 = re.sub(r"\bNone\b", "null", t2).replace("True", "true").replace("False", "false")
        return json.loads(t2)


PERIKSA = """Kamu editor naskah yang galak. Periksa draf naskah JSON di bawah dengan daftar ini, lalu TULIS ULANG versi yang sudah diperbaiki:
1. Kalimat 1 benar-benar hook yang bikin penasaran?
2. Kalimat terakhir menjawab hook dengan twist/punchline yang lucu atau ironis?
3. Setiap kalimat sebab-akibat jelas dari kalimat sebelumnya; kata sambung tepat (tidak ada "Tapi" tanpa pertentangan)?
4. Narator orang ketiga (bukan aku/kami)?
5. Semua kejadian bisa digambar dengan pilihan yang tersedia (tidak ada perahu terbalik, berenang, berkelahi, dsb.)?
6. Pindah lokasi hanya bila kalimat menyebut perpindahan waktu/tempat? Lokasi sesuai isi kalimat?
7. Pose & ekspresi sesuai emosi kalimat, dan ada "berubah" pada kata kunci emosi/kejutan? Puncak memakai kejadian visual?
8. Shot bervariasi, adegan pertama di lokasi baru "lebar"? 6-9 adegan, 60-110 kata, tiap adegan satu kalimat 5-16 kata?
Kembalikan HANYA JSON naskah lengkap hasil perbaikan (skema sama)."""




# ---------------------------------------------------------------- pemeriksa naskah
WARNA = re.compile(r"^#[0-9a-fA-F]{6}$")
PENANDA = ("malam", "pagi", "siang", "sore", "keesokan", "kemudian", "esoknya", "setelah", "sesampai", "tiba", "akhirnya",
           "bertahun", "berhari", "seminggu", "sebulan", "sejak", "kembali", "lalu mereka", "mereka pun", "di klub", "di kemah", "di tepi")
ISTILAH = ("berubah menjadi", "pose", "ekspresi", "shot", "adegan", "kamera", "posisi kiri", "posisi kanan")
TAK_TERGAMBAR = ("terbalik", "berenang", "tenggelam", "berkelahi", "menggigit", "digigit", "menangkap", "terbang", "menyelam", "mengejar")


def masalah_alur(n: dict) -> list:
    """Pelanggaran alur yang bisa dideteksi mesin; dikirim balik ke LLM sebagai keluhan spesifik."""
    out, lok_lalu, pernah = [], None, []
    ad = n.get("adegan") or []
    for i, a in enumerate(ad):
        teks, lok = str(a.get("teks", "")), a.get("lokasi")
        kecil = teks.lower()
        if i and lok != lok_lalu and not any(p in kecil for p in PENANDA):
            out.append(f"adegan {i + 1} pindah lokasi ke {lok} tapi kalimatnya tidak menyebut perpindahan waktu/tempat")
        if i and lok != lok_lalu and lok in pernah:
            out.append(f"adegan {i + 1} kembali ke lokasi {lok} yang sudah ditinggalkan; hindari bolak-balik lokasi")
        if any(x in kecil for x in ISTILAH):
            out.append(f"adegan {i + 1} memuat istilah teknis di narasi: \"{teks}\"")
        if re.search(r"\b(aku|kami|saya)\b", kecil):
            out.append(f"adegan {i + 1} memakai sudut pandang orang pertama")
        if any(x in kecil for x in TAK_TERGAMBAR):
            out.append(f"adegan {i + 1} menyebut kejadian yang tak bisa digambar: \"{teks}\"")
        if len(teks.split()) > 16:
            out.append(f"adegan {i + 1} terlalu panjang ({len(teks.split())} kata, maks 16)")
        if lok != lok_lalu and lok_lalu:
            pernah.append(lok_lalu)
        lok_lalu = lok
    if not 6 <= len(ad) <= 9:
        out.append(f"jumlah adegan {len(ad)} (harus 6-9)")
    return out


def rapikan(n: dict) -> dict:
    catatan = []
    tokoh = {}
    for tid, o in (n.get("tokoh") or {}).items():
        tid = re.sub(r"\W", "_", str(tid)).strip("_") or "tokoh"
        o = dict(o or {})
        bersih = {"nama": o.get("nama", tid)}
        bersih["rambut"] = o.get("rambut") if o.get("rambut") in OPSI_TOKOH["rambut"] else "mangkok"
        bersih["topi"] = o.get("topi") if o.get("topi") in ("safari", "tinggi") else None
        for b in ("kumis", "kacamata", "monokel", "tas"):
            bersih[b] = bool(o.get(b, b == "tas"))
        for w, bawaan in (("jas", None), ("syal", "#c8302e"), ("baju", "#f7edd8"), ("warnaRambut", "#1e1b22")):
            v = o.get(w, bawaan)
            bersih[w] = v if (isinstance(v, str) and WARNA.match(v)) else (None if v is None and w in ("jas", "syal") else bawaan)
        if bersih["jas"]:
            bersih["tas"] = False
        tokoh[tid] = bersih
    if not tokoh:
        tokoh["tokoh"] = {"nama": "Tokoh", "rambut": "mangkok", "topi": None, "kumis": False, "kacamata": False, "monokel": False, "tas": True, "jas": None, "syal": "#c8302e", "baju": "#f7edd8", "warnaRambut": "#1e1b22"}
    ids = list(tokoh)
    adegan, shot_lalu, lok_lalu = [], None, None
    for i, a in enumerate(n.get("adegan") or []):
        teks = re.sub(r"\s+", " ", str(a.get("teks", "")).strip())
        if not teks:
            continue
        lok = a.get("lokasi") if a.get("lokasi") in LOKASI else (lok_lalu or "gurun")
        daftar = []
        for tk in (a.get("tokoh") or [])[:3]:
            tid = re.sub(r"\W", "_", str(tk.get("id", ""))).strip("_")
            if tid not in tokoh or any(d["id"] == tid for d in daftar):
                continue
            pose = tk.get("pose") if tk.get("pose") in POSE else "diam"
            if pose == "dayung" and lok != "sungai":
                pose = "diam"
            daftar.append({"id": tid, "posisi": tk.get("posisi") if tk.get("posisi") in POSISI else "tengah", "pose": pose,
                           "ekspresi": tk.get("ekspresi") if tk.get("ekspresi") in EKSPRESI else "santai",
                           "aksi": tk.get("aksi") if tk.get("aksi") in AKSI else None})
        if not daftar:
            daftar = [{"id": ids[0], "posisi": "tengah", "pose": "diam", "ekspresi": "santai", "aksi": None}]
            catatan.append(f"adegan {i + 1}: tanpa tokoh -> diisi {ids[0]}")
        # posisi bentrok -> geser ke posisi kosong
        pakai = set()
        for d in daftar:
            if d["posisi"] in pakai:
                d["posisi"] = next(p for p in POSISI if p not in pakai)
            pakai.add(d["posisi"])
        fokus = a.get("fokus") if any(d["id"] == a.get("fokus") for d in daftar) else daftar[0]["id"]
        shot = a.get("shot") if a.get("shot") in SHOT else "sedang"
        if lok != lok_lalu and shot != "lebar" and i > 0:
            catatan.append(f"adegan {i + 1}: lokasi baru -> shot lebar"); shot = "lebar"
        if shot == shot_lalu and lok == lok_lalu:
            ganti = {"lebar": "sedang", "sedang": "dekat", "dekat": "sedang", "rendah": "sedang"}[shot]
            catatan.append(f"adegan {i + 1}: shot sama berturut-turut ({shot}) -> {ganti}"); shot = ganti
        kata_teks = [re.sub(r"[^\w-]", "", w).lower() for w in teks.split()]
        berubah = []
        for b in a.get("berubah") or []:
            pada = re.sub(r"[^\w-]", "", str(b.get("pada", ""))).lower()
            if not pada or not any(k.startswith(pada) for k in kata_teks):
                continue
            tid = b.get("tokoh") if any(d["id"] == b.get("tokoh") for d in daftar) else daftar[0]["id"]
            berubah.append({"pada": pada, "tokoh": tid, "pose": b.get("pose") if b.get("pose") in POSE else None,
                            "ekspresi": b.get("ekspresi") if b.get("ekspresi") in EKSPRESI else None, "aksi": b.get("aksi") if b.get("aksi") in AKSI else None})
        kej = a.get("kejadian") if a.get("kejadian") in KEJADIAN else None
        if kej in ("gundukan", "buaya_muncul") and lok != "gurun":
            kej = None
        if kej == "buaya_air" and lok != "sungai":
            kej = None
        pada_kej = re.sub(r"[^\w-]", "", str(a.get("kejadianPada") or "")).lower() or None
        if kej and (not pada_kej or not any(k.startswith(pada_kej) for k in kata_teks)):
            pada_kej = next((b["pada"] for b in berubah if b.get("ekspresi") == "kaget" or b.get("pose") == "kaget"), None)                 or next((k for k in kata_teks if k.startswith(("muncul", "bergerak", "menyerang", "menggeram"))), None)
        adegan.append({"teks": teks, "lokasi": lok, "shot": shot, "fokus": fokus, "tokoh": daftar, "berubah": berubah, "kejadian": kej, "kejadianPada": pada_kej})
        shot_lalu, lok_lalu = shot, lok
    if not adegan:
        raise SystemExit("Naskah kosong.")
    # konsistensi tokoh: selama lokasi sama, tokoh dari adegan sebelumnya tetap ada di posisi yang sama
    PERGI = ("pergi", "meninggalkan", "kabur", "lari", "menghilang", "pulang")
    for i, a in enumerate(adegan):
        if i == 0 or adegan[i - 1]["lokasi"] != a["lokasi"]:
            continue
        lalu = adegan[i - 1]
        posisi_lalu = {d["id"]: d["posisi"] for d in lalu["tokoh"]}
        for d in a["tokoh"]:  # tokoh yang sama tetap di posisi lamanya
            if d["id"] in posisi_lalu:
                d["posisi"] = posisi_lalu[d["id"]]
        kata_lalu = lalu["teks"].lower()
        for d in lalu["tokoh"]:
            if any(x["id"] == d["id"] for x in a["tokoh"]) or len(a["tokoh"]) >= 3:
                continue
            nama = tokoh[d["id"]]["nama"].lower()
            if any(p in kata_lalu for p in PERGI) and nama.split()[0] in kata_lalu:
                continue
            lanjut = dict(d); lanjut["aksi"] = None
            ubah = [b for b in lalu["berubah"] if b["tokoh"] == d["id"]]  # pakai kondisi akhirnya
            for b in ubah:
                lanjut["pose"] = b["pose"] or lanjut["pose"]; lanjut["ekspresi"] = b["ekspresi"] or lanjut["ekspresi"]
            if lanjut["ekspresi"] in ("kaget", "tawa"):
                lanjut["ekspresi"] = "cemas" if lanjut["ekspresi"] == "kaget" else "santai"
            a["tokoh"].append(lanjut)
            print(f"  pemeriksa: adegan {i + 1}: {d['id']} tetap ada (lokasi sama)")
        pakai = {}
        for d in a["tokoh"]:  # pastikan posisi tidak bentrok
            if d["posisi"] in pakai:
                d["posisi"] = next(p for p in POSISI if p not in pakai)
            pakai[d["posisi"]] = d["id"]
    # di perahu dengan 2+ tokoh: harus ada pendayung (bukan tokoh fokus kalau bisa)
    for i, a in enumerate(adegan):
        if a["lokasi"] == "sungai" and len(a["tokoh"]) >= 2 and not any(d["pose"] == "dayung" for d in a["tokoh"]):
            cal = next((d for d in a["tokoh"] if d["id"] != a["fokus"] and not any(b["tokoh"] == d["id"] and b["pose"] for b in a["berubah"])), None)
            if cal:
                cal["pose"] = "dayung"; cal["posisi_dayung"] = True
                print(f"  pemeriksa: adegan {i + 1}: {cal['id']} jadi pendayung")
    # kesinambungan: perubahan pada kata harus BERUBAH dari kondisi awal; ekspresi selaras pose; kata kunci -> aksi
    akhir = {}  # kondisi terakhir tiap tokoh: (pose, ekspresi)
    SELARAS = {"takut": "cemas", "kaget": "kaget", "pinggang": "sombong"}
    for i, a in enumerate(adegan):
        kata_teks = [re.sub(r"[^\w-]", "", w).lower() for w in a["teks"].split()]
        for d in a["tokoh"]:
            for b in a["berubah"]:
                if b["tokoh"] != d["id"]:
                    continue
                lalu_pose, lalu_eks = akhir.get(d["id"], ("diam", "santai"))
                if b["pose"] and b["pose"] == d["pose"]:
                    d["pose"] = lalu_pose if lalu_pose != b["pose"] else "diam"
                if b["ekspresi"] and b["ekspresi"] == d["ekspresi"]:
                    d["ekspresi"] = lalu_eks if lalu_eks != b["ekspresi"] else "santai"
            if d["ekspresi"] == "santai" and d["pose"] in SELARAS:
                d["ekspresi"] = SELARAS[d["pose"]]
            for b in a["berubah"]:
                if b["tokoh"] == d["id"] and b["pose"] in SELARAS and not b["ekspresi"]:
                    b["ekspresi"] = SELARAS[b["pose"]]
            pose, eks = d["pose"], d["ekspresi"]
            for b in a["berubah"]:
                if b["tokoh"] == d["id"]:
                    pose, eks = b["pose"] or pose, b["ekspresi"] or eks
            akhir[d["id"]] = (pose, eks)
        fokus = a["fokus"]
        for kunci, aksi in (("gemetar", "gemetar"), ("tertawa", "tawa"), ("terbahak", "tawa"), ("meloncat", "loncat"), ("terlonjak", "loncat")):
            hit = next((k for k in kata_teks if k.startswith(kunci)), None)
            if hit and not any(b["aksi"] for b in a["berubah"]):
                a["berubah"].append({"pada": hit, "tokoh": fokus, "pose": None, "ekspresi": None, "aksi": aksi})
                print(f"  pemeriksa: adegan {i + 1}: kata '{hit}' -> aksi {aksi}")
    jumlah_kata = sum(len(a["teks"].split()) for a in adegan)
    if not 5 <= len(adegan) <= 10:
        catatan.append(f"PERINGATAN: {len(adegan)} adegan (ideal 6-9)")
    if not 45 <= jumlah_kata <= 130:
        catatan.append(f"PERINGATAN: {jumlah_kata} kata (ideal 60-110)")
    for c in catatan:
        print("  pemeriksa:", c)
    return {"judul": n.get("judul", "Tanpa judul"), "tokoh": tokoh, "adegan": adegan}


# ---------------------------------------------------------------- narasi per adegan -> timeline
async def _tts(teks, suara, path):
    import edge_tts
    com = edge_tts.Communicate(teks, suara, rate="+5%", boundary="WordBoundary")
    kata = []
    with open(path, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                kata.append({"w": ch["text"], "s": s, "e": s + ch["duration"] / 1e7})
    return kata


def durasi(path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True).stdout.strip())


def narasi(naskah: dict, out: Path, suara: str):
    jeda = 0.35
    potong = out / "potongan"; potong.mkdir(exist_ok=True)
    semua, t, files = [], 0.25, []
    for i, a in enumerate(naskah["adegan"]):
        f = potong / f"{i:02d}.mp3"
        kata = asyncio.run(_tts(a["teks"], suara, f))
        d = durasi(f)
        a["mulai"] = round(t - (0.25 if i == 0 else 0.12), 3) if i else 0.0
        a["kata0"] = len(semua)
        for w in kata:
            semua.append({"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)})
        a["kata1"] = len(semua)
        files.append((f, t))
        t += d + jeda
    for i, a in enumerate(naskah["adegan"]):
        a["akhir"] = naskah["adegan"][i + 1]["mulai"] if i + 1 < len(naskah["adegan"]) else round(t + 0.6, 3)
    # gabung audio dengan offset tepat
    args, filt = ["ffmpeg", "-y", "-v", "error"], []
    for j, (f, off) in enumerate(files):
        args += ["-i", str(f)]
        filt.append(f"[{j}:a]adelay={int(off * 1000)}|{int(off * 1000)}[a{j}]")
    filt.append("".join(f"[a{j}]" for j in range(len(files))) + f"amix=inputs={len(files)}:normalize=0,apad=whole_dur={t + 0.6:.2f}[m]")
    args += ["-filter_complex", ";".join(filt), "-map", "[m]", "-ac", "2", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", str(out / "narasi.mp3")]
    subprocess.run(args, check=True)
    tl = {"judul": naskah["judul"], "durasi": round(t + 0.6, 3), "tokoh": naskah["tokoh"], "adegan": naskah["adegan"], "kata": semua}
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  narasi {len(semua)} kata, {tl['durasi']:.1f} detik")


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--ide"); g.add_argument("--teks"); g.add_argument("--naskah")
    ap.add_argument("--out", default="hasil-c"); ap.add_argument("--suara", default="id-ID-ArdiNeural")
    ap.add_argument("--tanpa-render", action="store_true")
    a = ap.parse_args()
    out = (HERE / a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    if a.naskah:
        mentah = json.loads(Path(a.naskah).read_text(encoding="utf-8"))
    elif a.teks:
        baris = [b.strip() for b in Path(a.teks).read_text(encoding="utf-8").splitlines() if b.strip()]
        print("1/4 menyusun visual untuk naskahmu...")
        mentah = tanya_llm("Ini naskah narasiku, SATU baris = SATU adegan. JANGAN ubah teksnya sama sekali, cukup susun visualnya "
                           "(lokasi, tokoh, pose, ekspresi, shot, berubah, kejadian) mengikuti aturan:\n" + "\n".join(baris))
    else:
        print("1/4 menulis naskah dari ide (draf lalu disunting)...")
        draf = tanya_llm(f"Ide cerita: {a.ide}")
        (out / "naskah_draf.json").write_text(json.dumps(draf, ensure_ascii=False, indent=1), encoding="utf-8")
        mentah = tanya_llm(PERIKSA + "\n\nIDE: " + a.ide + "\n\nDRAF:\n" + json.dumps(draf, ensure_ascii=False), suhu=0.4)
        for putaran in range(2):  # revisi terarah bila masih ada pelanggaran alur
            keluhan = masalah_alur(mentah)
            if not keluhan:
                break
            print(f"  editor putaran {putaran + 2}: " + " | ".join(keluhan))
            mentah = tanya_llm("Perbaiki naskah JSON ini. MASALAH yang wajib dibereskan:\n- " + "\n- ".join(keluhan)
                               + "\nPertahankan bagian yang sudah bagus. Kembalikan HANYA JSON lengkap.\n\n" + json.dumps(mentah, ensure_ascii=False), suhu=0.3)
    print("2/4 memeriksa naskah...")
    naskah = rapikan(mentah)
    (out / "naskah.json").write_text(json.dumps(naskah, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  judul: {naskah['judul']}")
    for i, x in enumerate(naskah["adegan"]):
        print(f"  {i + 1}. [{x['lokasi']}/{x['shot']}] {x['teks']}")
    print("3/4 membuat narasi...")
    narasi(naskah, out, a.suara)
    if a.tanpa_render:
        return
    print("4/4 merender...")
    subprocess.run(["node", str(HERE / "render.cjs"), str(out), "--skrip", "mesin.js"], check=True)


if __name__ == "__main__":
    main()
