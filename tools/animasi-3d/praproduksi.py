"""Pra-produksi cerita animasi (tema horor dulu): 7 tahap berantai -> dokumen produksi yang bisa dibaca & diedit.

  1 KONSEP   3 premis, dipilih yang terkuat
  2 TOKOH    siapa, sifat, keinginan, ketakutan, cara bicara, penampilan terkunci (+ makhluk & aturannya)
  3 TEMPAT   lokasi dari daftar aset, detail indrawi, benda kunci, pantangan
  4 GAYA     sudut pandang narator, tempo, kosakata, contoh kalimat, suara
  5 ALUR     beat sheet horor + setup/payoff
  6 NASKAH   narasi lisan per adegan + rencana visual
  7 EDITOR   skor per aspek (1-10), revisi otomatis bila ada yang < 7

Pakai (dari tools/animasi-3d, Python venv backend):
  python praproduksi.py --ide "ojol tengah malam dapat order ke alamat yang sudah lama kosong" --out produksi/ojol
  python praproduksi.py --out produksi/acak            (ide dipilih AI dari kategori horor)
  python praproduksi.py --ide "..." --out produksi/x --format panjang   (8-10 menit, ditulis per bab; bawaan: pendek)
Hasil: <out>/bible.json (semua tahap) dan <out>/bible.md (dokumen untuk dibaca/diedit). Konversi ke mesin animasi menyusul setelah aset horor dibangun.
Hanya memakai LLM gratis (Groq/Gemini/OpenRouter).
"""
import argparse
import json
import random
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent.parent / "backend"))
from buat_video import tanya_llm  # noqa: E402

# ---------------------------------------------------------------- kosakata visual horor (aset yang akan dibangun)
LOKASI_HOROR = {
    "koridor_sekolah": "lorong sekolah malam: deretan pintu kelas, jendela, lampu neon yang bisa berkedip, papan pengumuman",
    "kamar_kos": "kamar kos sempit: kasur tipis, lemari kayu, jendela bertirai, kipas angin, lampu bohlam, pintu kamar",
    "jalan_hutan": "jalan tanah di tengah hutan malam: pohon tinggi, kabut tebal, motor/ojek bisa lewat, pohon beringin besar",
    "rumah_tua": "teras & ruang tamu rumah kayu tua di kampung: kursi goyang, foto lama di dinding, lampu minyak, pintu jati",
}
MAKHLUK = {
    "kuntilanak": "perempuan bergaun putih panjang, rambut hitam panjang menutupi wajah; muncul samar, melayang, tertawa melengking",
    "pocong": "sosok terbungkus kain kafan putih terikat di kepala; melompat pelan, berdiri diam di kejauhan",
    "bayangan": "sosok hitam tinggi tanpa wajah; hanya terlihat sekilas di sudut gelap atau di balik pintu",
}
KEJADIAN_HOROR = {
    "lampu_kedip": "lampu berkedip-kedip lalu redup", "hantu_jauh": "makhluk terlihat diam di kejauhan / di ujung lorong",
    "hantu_lewat": "makhluk melintas sekilas di belakang tokoh", "hantu_dekat": "makhluk perlahan muncul makin dekat",
    "jumpscare": "makhluk tiba-tiba muncul tepat di depan kamera (HANYA di adegan twist)", "pintu_terbuka": "pintu terbuka sendiri pelan",
    "kabut": "kabut menebal", "gelap": "semua lampu padam, hanya senter/HP yang menyala",
}
SFX = ["none", "static", "knock", "footsteps", "heartbeat", "wind", "drip", "breath", "phone", "creak"]
POSE = ["diam", "lihat", "kaget", "takut", "sedekap", "tunjuk", "angkat", "pinggang"]
EKSPRESI = ["santai", "heran", "cemas", "kaget", "kedip"]
SHOT = ["lebar", "sedang", "dekat", "rendah", "pov"]
KATEGORI = [
    "legenda hantu lokal dengan sudut cerita yang segar", "tempat angker (kos lama, sekolah malam, jalan hutan, rumah kosong)",
    "aturan aneh yang tidak boleh dilanggar (rules horror) di kos, sekolah, atau desa", "misteri kampung: pantangan & mitos turun-temurun",
    "creepypasta modern orisinal (chat misterius, ojol tengah malam, telepon jam tiga pagi)", "horor perjalanan (KKN, mudik malam, naik motor lewat hutan)",
]

SISTEM = """Kamu tim pra-produksi film horor pendek animasi kartun berbahasa Indonesia (video vertikal 30-50 detik).
Kamu bekerja bertahap dan teliti: setiap keputusan harus melayani cerita. Cerita terasa dekat dengan kehidupan orang Indonesia.
Seram lewat suasana, bunyi, dan ketegangan; TANPA gore/darah, tanpa bunuh diri, tanpa anak dicelakai, tanpa menghina agama,
tanpa nama orang/institusi asli. Selalu balas HANYA dengan satu objek JSON valid."""

ASET = f"""ASET VISUAL YANG TERSEDIA (cerita WAJIB bisa digambar dengan ini saja):
lokasi: {json.dumps(LOKASI_HOROR, ensure_ascii=False)}
makhluk: {json.dumps(MAKHLUK, ensure_ascii=False)}
kejadian visual: {json.dumps(KEJADIAN_HOROR, ensure_ascii=False)}
tokoh manusia: kartun 2D berbadan kacang, bisa berdiri, berjalan masuk, berpose ({", ".join(POSE)}), berekspresi ({", ".join(EKSPRESI)}),
  memegang senter/HP tidak bisa digambar detail. Tidak bisa: berlari jauh, berkelahi, menyetir detail, makan, menulis.
"""


MENULIS = ["gemini", "groq", "openrouter"]  # tahap menulis prosa: Gemini dulu (lebih luwes berbahasa Indonesia)

# ---------------------------------------------------------------- format video
# pendek = perilaku lama (tidak diubah). panjang = 8-10 menit, ditulis per bab supaya muat di kuota LLM gratis & bisa dilanjutkan.
FORMAT = {
    "pendek": {"cek_kata": (85, 125), "adegan": (7, 9), "durasi": "30-60 detik", "detik": (0, 60)},
    "panjang": {"cek_kata": (750, 1000), "adegan": (40, 65), "durasi": "8-10 menit", "detik": (420, 660),
                "bab": (5, 6), "kata_bab": (140, 175), "adegan_bab": (7, 11), "jeda_tegang_kata": 140},
}
FMT = "pendek"  # diatur main() dari --format / bible.json

SISTEM_PANJANG = SISTEM.replace("film horor pendek animasi kartun berbahasa Indonesia (video vertikal 30-50 detik)",
                                "film horor animasi kartun berbahasa Indonesia berdurasi 8-10 menit (video vertikal, dibagi beberapa bab)")


def tahap(nama: str, perintah: str, konteks: dict, suhu: float = 0.7, urutan: list | None = None) -> dict:
    print(f"  [{nama}]")
    isi = (ASET + "\n\nHASIL TAHAP SEBELUMNYA:\n" + json.dumps(konteks, ensure_ascii=False, separators=(",", ":")) if konteks else ASET) + "\n\nTUGAS:\n" + perintah
    return tanya_llm(isi, suhu=suhu, sistem=SISTEM if FMT == "pendek" else SISTEM_PANJANG, urutan=urutan)


def t1_konsep(ide: str | None) -> dict:
    dasar = f"Ide dari produser (wajib dipakai sebagai dasar): {ide}" if ide else f"Kategori: {random.choice(KATEGORI)}"
    return tahap("1 konsep", f"""{dasar}
Buat 3 premis berbeda, lalu pilih SATU yang terkuat. Premis = 1-2 kalimat: siapa, di mana, apa yang salah, kenapa tak bisa kabur.
Nilai tiap premis: hook (bikin berhenti scroll?), kedekatan (penonton Indonesia relate?), kesegaran (bukan klise basi), kelayakan visual.
JSON: {{"premis": [{{"judul_kerja": "...", "premis": "...", "kenapa_seram": "...", "skor": {{"hook": 0, "dekat": 0, "segar": 0, "visual": 0}}}}],
"terpilih": <indeks 0-2>, "alasan": "..."}}""", {}, suhu=0.9)


def t2_tokoh(k: dict) -> dict:
    jml = "Maksimal 2 manusia + 1 makhluk." if FMT == "pendek" else "2-3 manusia (tiap tokoh punya peran & perubahan nyata sepanjang 8-10 menit) + 1 makhluk."
    return tahap("2 tokoh", f"Rancang tokoh untuk premis terpilih. {jml}" + """
Tiap manusia: nama panggilan Indonesia, umur, pekerjaan/peran, 2 sifat, keinginan (apa yang dia mau di cerita ini), ketakutan,
kebiasaan kecil yang bisa jadi detail cerita, cara bicara (logat/kata khas, mis. "lo-gue" Jakarta, "aku-kamu" santun, logat Jawa ringan),
dan penampilan terkunci untuk kartun: {"rambut": mangkok|pendek|botak|sanggul, "topi": null|"safari", "baju": "#hex", "syal": "#hex"|null,
"kacamata": bool, "kumis": bool, "tas": bool, "warnaRambut": "#hex"}.
Makhluk: jenis (dari daftar), asal-usul singkat yang masuk akal di cerita, ATURAN kemunculan (kapan/kenapa muncul) - aturan ini harus dipakai di alur.
JSON: {"manusia": [{"id": "huruf_kecil", "nama": "...", "umur": 0, "peran": "...", "sifat": ["...", "..."], "keinginan": "...", "ketakutan": "...",
"kebiasaan": "...", "cara_bicara": "...", "penampilan": {...}}], "makhluk": {"jenis": "...", "asal_usul": "...", "aturan": "..."}}""", {"konsep": k})


def t3_tempat(k: dict, tk: dict) -> dict:
    jml = "1-2 lokasi dari daftar aset yang paling melayani cerita (lebih sedikit lokasi = lebih fokus)." if FMT == "pendek" else \
        "2-4 lokasi dari daftar aset (cerita 8-10 menit butuh variasi tempat; boleh kembali ke lokasi lama bila ada alasan cerita)."
    return tahap("3 tempat", f"Tentukan {jml}" + """
Untuk tiap lokasi: alasan dipilih, kapan (jam), detail indrawi (suara, bau, cahaya, suhu), 1 BENDA KUNCI yang nanti jadi petunjuk/payoff twist,
dan pantangan/aturan tempat (kalau ada). Urutan lokasi harus maju (tidak bolak-balik).
JSON: {"lokasi": [{"id": "<dari daftar>", "alasan": "...", "waktu": "...", "indra": {"suara": "...", "bau": "...", "cahaya": "...", "suhu": "..."},
"benda_kunci": "...", "pantangan": "..."}]}""", {"konsep": k, "tokoh": tk})


def t4_gaya(k: dict, tk: dict, tp: dict) -> dict:
    return tahap("4 gaya bicara", """Tentukan gaya bicara narasi supaya konsisten dari awal sampai akhir.
Pilih sudut pandang: "kamu" (penonton = tokoh, paling imersif), "aku" (curhat pengalaman), atau "dia" (narator bercerita). Jelaskan alasannya.
Aturan lisan: kalimat pendek (maks 12 kata), potongan kalimat ("Sepi banget."), jeda "..." untuk menahan napas, bahasa ngobrol (nggak, banget, kayak),
bunyi ditulis langsung ("Tok. Tok."), angka ditulis huruf. Tentukan tempo (pelan menekan / cepat panik di klimaks), 5 kata/frasa khas,
cara tokoh lain bicara di kutipan tunggal ('...'), dan 3 contoh kalimat dalam gaya ini.
JSON: {"sudut_pandang": "kamu|aku|dia", "alasan": "...", "tempo": "...", "kata_khas": ["..."], "aturan_dialog": "...", "contoh": ["...", "...", "..."]}""",
                 {"konsep": k, "tokoh": tk, "tempat": tp})


def t5_alur(k, tk, tp, g) -> dict:
    return tahap("5 alur", """Susun beat sheet horor 7-9 beat, urutan WAJIB:
1 HOOK (maks 12 kata, bikin berhenti scroll) -> 2 NORMAL (tokoh & tujuan, benda kunci di-SETUP secara wajar) -> 3 TANDA ANEH PERTAMA ->
4 PENYANGKALAN/alasan logis -> 5 ESKALASI (aturan makhluk mulai berlaku) -> 6 TITIK TAK BISA KEMBALI -> 7 TWIST -> 8 PENUTUP MENGGANTUNG.
ATURAN TWIST HOROR: twist mengungkap KEBENARAN YANG MENGERIKAN atau membuat keadaan JAUH LEBIH BURUK (benda kunci di-payoff dengan cara itu).
Twist TIDAK BOLEH menyelesaikan masalah, menyelamatkan tokoh, atau membuat penonton lega (dilarang: roh tenang, pintu rahasia menolong, berhasil kabur).
Twist di beat ke-2 atau ke-3 dari belakang. Penutup = kalimat menggantung yang bikin merinding + ajakan komentar berupa pertanyaan ke penonton
(dilarang: like, share, subscribe). Lokasi berjalan maju, TIDAK kembali ke lokasi yang sudah ditinggalkan.
Semua tokoh manusia dari tahap 2 harus punya peran nyata; kalau ada yang tidak diperlukan, tulis di "tokoh_dibuang".
Tiap beat: tujuan, emosi penonton, informasi baru, lokasi, kejadian visual (boleh null). Ketegangan naik tiap beat.
JSON: {"beat": [{"no": 1, "jenis": "hook|normal|aneh|sangkal|eskalasi|tak_kembali|twist|penutup", "tujuan": "...", "emosi": "...", "info_baru": "...",
"lokasi": "<id>", "kejadian": null}], "setup_payoff": [{"setup_di_beat": 0, "payoff_di_beat": 0, "apa": "..."}], "tokoh_dibuang": []}\n""" + SUTRADARA,
                 {"konsep": k, "tokoh": tk, "tempat": tp, "gaya": g}, suhu=0.6)


SUTRADARA = """CHECKLIST SUTRADARA (wajib, lihat checklist_sutradara.md):
- Hook: kalimat pertama maks 10 kata, langsung larangan/ancaman/kejanggalan konkret; DILARANG membuka dengan pengantar ("Pada suatu malam", "Halo", "Cerita ini").
- Tiap adegan menambah SATU informasi baru (petunjuk, bahaya, atau keputusan tokoh); tidak ada adegan yang cuma mengulang suasana.
- TUNJUKKAN, JANGAN JELASKAN: dilarang kata perasaan umum (seram, serem, menakutkan, mencekam, merinding, horor, suasana); pakai bunyi, benda, tindakan.
- Frasa ancaman yang sama (mis. "lampu berkedip") maksimal 2 kali; ketegangan naik lewat hal BARU.
- Sebab-akibat: tiap kejadian dipicu kejadian/keputusan sebelumnya, bukan "lalu... lalu...".
- Twist ditunjukkan dalam 1-2 kalimat yang membalik makna cerita; paling kuat berupa satu kalimat dialog yang mudah diingat. Jangan diterangkan panjang.
- Hening sebelum klimaks: kalimat tepat sebelum twist pelan dan memakai jeda "...".
- Penutup: pertanyaan SPESIFIK tentang isi cerita, bukan "gimana menurut kalian".
- Dilarang kata teknis di narasi: jumpscare, scene, adegan, shot, sfx, twist, pov, glitch."""

SUTRADARA_VISUAL = """CHECKLIST SUTRADARA — VISUAL (wajib):
- Makhluk DITAHAN sampai twist: sebelum adegan twist makhluk hanya null/jauh/lewat; posisi dekat/depan hanya di twist dan sesudahnya.
- Minimal 3 jenis shot berbeda; shot yang sama tidak boleh 3 kali berturut-turut; adegan twist pakai "dekat" atau "pov".
- Adegan tepat sebelum twist: sfx tenang (none/heartbeat/breath/drip) supaya hentakan twist terasa.
- Tiap adegan WAJIB punya "alasan_shot": kenapa shot itu dipilih (mis. "pov: penonton ikut terjebak")."""


def aturan_pov(g: dict, tk: dict) -> str:
    pov = (g or {}).get("sudut_pandang", "kamu")
    utama = ((tk or {}).get("manusia") or [{}])[0].get("nama", "tokoh utama")
    if pov == "kamu":
        return (f"SUDUT PANDANG 'kamu': penonton ADALAH {utama}. Sebut tokoh utama HANYA dengan 'kamu' — JANGAN pernah menyebut nama '{utama}', "
                "jangan 'aku/gue/saya' di luar kutipan. Kalimat seolah terjadi sekarang ('Kamu berhenti. Ada yang manggil.').")
    if pov == "aku":
        return f"SUDUT PANDANG 'aku': narator = {utama} yang curhat pakai 'aku'. Jangan sebut '{utama}' sebagai orang ketiga, jangan 'kamu' untuk dirinya."
    return f"SUDUT PANDANG orang ketiga: narator menceritakan {utama} ('dia'/nama). Jangan 'aku/kamu' di luar kutipan."


SUARA_NARATOR = ("SUARA NARATOR vs SUARA TOKOH: kalimat narasi selalu memakai suara narator yang konsisten (sudut pandang di atas). "
                 "Logat/cara bicara tokoh (mis. lo-gue) HANYA muncul di dalam kutipan tunggal saat tokoh itu bicara, tidak pernah di kalimat narasi.")


def contoh_teks(pov: str) -> str:
    try:
        daftar = json.loads((HERE / "contoh_horor.json").read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return ""
    daftar.sort(key=lambda c: c.get("pov") != pov)  # yang sudut pandangnya sama didahulukan
    isi = "\n\n".join(f"CONTOH ({c['pov']}, {c['judul']}) — kenapa bagus: {c['kenapa_bagus']}\n{c['narasi']}" for c in daftar[:2])
    return ("CONTOH NASKAH BERKUALITAS (tiru KUALITAS & RITME-nya, JANGAN tiru ceritanya):\n" + isi) if isi else ""


def t6a_prosa(k, tk, tp, g, al) -> dict:
    return tahap("6a narasi utuh", f"""Tulis NARASI UTUH cerita ini sebagai naskah lisan yang dibacakan narator — satu cerita mengalir, BUKAN daftar kejadian.
{aturan_pov(g, tk)}
{SUARA_NARATOR}
{SUTRADARA}
{contoh_teks((g or {}).get("sudut_pandang", "kamu"))}
Ikuti beat sheet berurutan. 90-115 kata. Kalimat pendek (maks 12 kata) tapi UTUH dan enak didengar, bukan gaya telegram
(salah: "Lihat kunci, tarik, simpan." benar: "Ada kunci tua nyangkut di rantai motormu. Kamu ambil... entah kenapa."). Pakai kata khas & tempo dari tahap 4,
jeda "..." di momen menahan napas, bunyi ditulis langsung, angka dengan huruf, dialog tokoh lain dalam kutipan tunggal sesuai cara bicaranya.
Kalimat pertama = hook beat 1. Kalimat terakhir = penutup menggantung + pertanyaan ke penonton dengan kata "komentar" (tanpa like/share).
JSON: {{"judul": "...", "narasi": "..."}}""", {"konsep": k, "tokoh": tk, "tempat": tp, "gaya": g, "alur": al}, suhu=0.8, urutan=MENULIS)


def t6b_pecah(prosa: dict, tk, tp, g, al) -> dict:
    return tahap("6b pecah adegan", f"""Pecah NARASI berikut menjadi 7-9 adegan sesuai beat. JANGAN mengubah, menambah, atau membuang satu kata pun:
gabungan semua "teks" harus sama persis dengan narasi. Lalu susun rencana visual tiap adegan:
lokasi, shot ({"/".join(SHOT)}; "pov" = dari mata tokoh utama), tokoh yang tampil + posisi (kiri/tengah/kanan) + pose ({", ".join(POSE)})
+ ekspresi ({", ".join(EKSPRESI)}), "berubah" pada kata tertentu, makhluk (null atau {{"jenis", "posisi": jauh|lewat|dekat|depan}}),
kejadian visual (dari daftar atau null), sfx (HANYA salah satu: {", ".join(SFX)}), twist true/false (tepat satu, di adegan ke-2/3 dari belakang,
dan di adegan twist makhluknya terlihat). Semua tokoh manusia yang dipakai cerita harus tampil minimal sekali. Visual harus sesuai kalimatnya.
{SUTRADARA_VISUAL}
NARASI: {json.dumps(prosa, ensure_ascii=False)}
JSON: {{"judul": "...", "hook_layar": "maks 6 kata", "cta_layar": "maks 5 kata", "adegan": [{{"teks": "...", "lokasi": "...", "shot": "...", "fokus": "<id>",
"tokoh": [{{"id": "...", "posisi": "...", "pose": "...", "ekspresi": "..."}}], "berubah": [{{"pada": "<kata dari teks>", "tokoh": "<id>", "pose": null, "ekspresi": "..."}}],
"makhluk": null, "kejadian": null, "sfx": "none", "twist": false, "alasan_shot": "..."}}]}}""", {"tokoh": tk, "tempat": tp, "alur": al}, suhu=0.4)


# ================================================================ FORMAT PANJANG (8-10 menit): alur per bab, tulis & pecah per bab
def t5_alur_panjang(k, tk, tp, g) -> dict:
    nb = FORMAT["panjang"]["bab"]
    return tahap("5 alur (panjang)", f"""Susun struktur cerita horor 8-10 menit dalam {nb[0]}-{nb[1]} BAB (tiap bab sekitar 1,5-2 menit).
WAJIB:
- Bab 1: HOOK di kalimat pertama (berhenti scroll dalam 3 detik), lalu kenalkan tokoh, tujuan, benda kunci (SETUP), dan tanda aneh pertama.
- SETIAP bab punya minimal satu momen tegang dan DIAKHIRI kait (pertanyaan/bahaya baru) supaya penonton lanjut ke bab berikut.
- Bab tengah: TITIK TENGAH — kebenaran terungkap sebagian atau aturan makhluk berubah, keadaan berbalik.
- Bab-bab sesudahnya: eskalasi, penyangkalan runtuh, titik tak bisa kembali.
- Bab terakhir: TWIST (kebenaran mengerikan / keadaan jauh lebih buruk, benda kunci dibayar) lalu PENUTUP menggantung + pertanyaan ke penonton.
- Makhluk hanya samar sebelum titik tengah; wujud jelas hanya di klimaks bab sesudah titik tengah dan di twist.
ATURAN TWIST HOROR: twist TIDAK BOLEH menyelesaikan masalah atau membuat penonton lega. Semua tokoh manusia punya peran nyata.
JSON: {{"bab": [{{"no": 1, "judul": "...", "tujuan": "...", "beat": [{{"jenis": "hook|normal|aneh|sangkal|eskalasi|titik_tengah|tak_kembali|twist|penutup",
"tujuan": "...", "emosi": "...", "lokasi": "<id>", "kejadian": null}}], "klimaks_bab": "momen tegang bab ini", "kait": "kenapa penonton lanjut"}}],
"setup_payoff": [{{"setup_di_bab": 1, "payoff_di_bab": 0, "apa": "..."}}], "titik_tengah": "...", "tokoh_dibuang": []}}
{SUTRADARA}""", {"konsep": k, "tokoh": tk, "tempat": tp, "gaya": g}, suhu=0.6)


def t6a_bab(k, tk, tp, g, al, i: int, sebelumnya: str) -> dict:
    bab = al["bab"]; n = len(bab); kb = FORMAT["panjang"]["kata_bab"]
    peran = ("Ini BAB PERTAMA: kalimat pertama = HOOK (maks 10 kata)." if i == 0 else "Lanjutkan PERSIS dari akhir bab sebelumnya (jangan mengulang, jangan memperkenalkan ulang tokoh).")
    peran += (" Ini BAB TERAKHIR: berisi twist lalu kalimat terakhir = pertanyaan ke penonton dengan kata \"komentar\" (tanpa like/share)." if i == n - 1
              else " JANGAN ada ajakan komentar/like/share di bab ini. Akhiri bab dengan kait yang bikin penasaran.")
    return tahap(f"6a narasi bab {i + 1}/{n}", f"""Tulis NARASI BAB {i + 1} dari {n} sebagai naskah lisan narator — mengalir, BUKAN daftar kejadian. {kb[0]}-{kb[1]} kata.
{peran}
{aturan_pov(g, tk)}
{SUARA_NARATOR}
{SUTRADARA}
{contoh_teks((g or {}).get("sudut_pandang", "kamu"))}
Kalimat pendek tapi utuh, jeda "..." di momen menahan napas, bunyi ditulis langsung, angka dengan huruf, dialog dalam kutipan tunggal.
RENCANA BAB INI: {json.dumps(bab[i], ensure_ascii=False)}
AKHIR NARASI SEBELUMNYA: {sebelumnya[-500:] or "(belum ada)"}
JSON: {{"narasi": "..."}}""", {"konsep": k, "tokoh": tk, "tempat": tp, "gaya": g, "alur_ringkas": [{"no": x.get("no"), "judul": x.get("judul"), "klimaks_bab": x.get("klimaks_bab")} for x in bab]},
                 suhu=0.8, urutan=MENULIS)


def t6b_bab(narasi: str, tk, tp, al, i: int) -> dict:
    n = len(al["bab"]); ab = FORMAT["panjang"]["adegan_bab"]
    tw = ("Bab terakhir: tepat SATU adegan twist:true (bukan adegan paling akhir) dan makhluknya terlihat di adegan itu." if i == n - 1
          else "Bukan bab terakhir: semua twist:false.")
    return tahap(f"6b pecah bab {i + 1}/{n}", f"""Pecah NARASI BAB {i + 1} berikut menjadi {ab[0]}-{ab[1]} adegan. JANGAN mengubah, menambah, atau membuang satu kata pun.
Rencana visual tiap adegan: lokasi, shot ({"/".join(SHOT)}), tokoh + posisi (kiri/tengah/kanan) + pose ({", ".join(POSE)}) + ekspresi ({", ".join(EKSPRESI)}),
makhluk (null atau {{"jenis", "posisi": jauh|lewat|dekat|depan}}), kejadian visual (dari daftar atau null), sfx (HANYA salah satu: {", ".join(SFX)}),
"klimaks_bab": true pada adegan momen tegang bab ini (boleh jumpscare di sini), {tw}
{SUTRADARA_VISUAL}
(Untuk format panjang: makhluk dekat/depan boleh di klimaks_bab setelah titik tengah.)
NARASI: {narasi}
JSON: {{"adegan": [{{"teks": "...", "lokasi": "...", "shot": "...", "fokus": "<id>", "tokoh": [{{"id": "...", "posisi": "...", "pose": "...", "ekspresi": "..."}}],
"berubah": [], "makhluk": null, "kejadian": null, "sfx": "none", "twist": false, "klimaks_bab": false, "alasan_shot": "..."}}]}}""",
                 {"tokoh": tk, "tempat": tp, "bab": al["bab"][i]}, suhu=0.4)


def t7_revisi_bab(b: dict, i: int, masalah: dict) -> dict:
    n = len(b["alur"]["bab"]); pov = (b.get("gaya") or {}).get("sudut_pandang", "kamu")
    sebelum = " ".join(x["narasi"] for x in b["prosa"]["bab"][:i])
    return tahap(f"7b revisi bab {i + 1}/{n}", f"""Tulis ulang NARASI BAB {i + 1} dari {n} untuk membereskan masalah editor & pemeriksa otomatis yang relevan dengan bab ini.
{aturan_pov(b.get("gaya"), {"manusia": (b.get("tokoh") or {}).get("manusia")})}
{SUARA_NARATOR}
{SUTRADARA}
{contoh_teks(pov)}
Pertahankan rencana bab, tokoh, aturan makhluk, benda kunci. {FORMAT["panjang"]["kata_bab"][0]}-{FORMAT["panjang"]["kata_bab"][1]} kata.
{"Kalimat terakhir: pertanyaan ke penonton + kata 'komentar'." if i == n - 1 else "Tanpa ajakan komentar. Akhiri dengan kait."}
RENCANA BAB: {json.dumps(b["alur"]["bab"][i], ensure_ascii=False)}
AKHIR NARASI SEBELUMNYA: {sebelum[-500:] or "(belum ada)"}
NARASI LAMA BAB INI: {b["prosa"]["bab"][i]["narasi"]}
MASALAH: {json.dumps(masalah, ensure_ascii=False)}
JSON: {{"narasi": "..."}}""", {}, suhu=0.7, urutan=MENULIS)


def gabung_bab(b: dict) -> None:
    """prosa_bab & naskah_bab -> prosa & naskah utuh (adegan diberi nomor bab)."""
    judul = (b["konsep"].get("premis") or [{}])[b["konsep"].get("terpilih", 0)].get("judul_kerja", "")
    b["prosa"] = {"judul": judul, "bab": b["prosa_bab"], "narasi": " ".join(x["narasi"] for x in b["prosa_bab"])}
    ad = []
    for i, nb in enumerate(b["naskah_bab"]):
        for a in nb.get("adegan", []):
            a["bab"] = i + 1; ad.append(a)
    b["naskah"] = {"judul": judul, "format": "panjang", "adegan": ad}


def produksi_panjang(b: dict, simpan) -> None:
    if "alur" not in b or "bab" not in b["alur"]:
        b["alur"] = t5_alur_panjang(b["konsep"], b["tokoh"], b["tempat"], b["gaya"]); simpan()
    bab = b["alur"]["bab"]
    b.setdefault("prosa_bab", []); b.setdefault("naskah_bab", [])
    for i in range(len(b["prosa_bab"]), len(bab)):  # dilanjutkan dari bab terakhir yang tersimpan
        sebelumnya = " ".join(x["narasi"] for x in b["prosa_bab"])
        r = t6a_bab(b["konsep"], b["tokoh"], b["tempat"], b["gaya"], b["alur"], i, sebelumnya)
        b["prosa_bab"].append({"no": i + 1, "narasi": str(r.get("narasi", ""))}); simpan()
    for i in range(len(b["naskah_bab"]), len(bab)):
        b["naskah_bab"].append(buka_naskah(t6b_bab(b["prosa_bab"][i]["narasi"], b["tokoh"], b["tempat"], b["alur"], i)) or {"adegan": []}); simpan()
    gabung_bab(b); simpan()
    terbaik = None
    for putaran in range(2):  # format panjang: maks 1 putaran revisi (tiap putaran = 2 panggilan per bab)
        mesin = cek_mesin(b["naskah"], b)
        b["editor"] = t7_editor(ringkas(b), mesin); simpan()
        n = nilai_total(b["editor"], mesin)
        print(f"  putaran {putaran + 1}: nilai {n:.2f} | skor {b['editor'].get('skor')} | cek mesin: {mesin or 'ok'}")
        if terbaik is None or n > terbaik["nilai"]:
            terbaik = {"nilai": n, "prosa_bab": [dict(x) for x in b["prosa_bab"]], "naskah_bab": json.loads(json.dumps(b["naskah_bab"])), "editor": b["editor"], "putaran": putaran + 1}
        rendah = [k for k, v in (b["editor"].get("skor") or {}).items() if isinstance(v, (int, float)) and v < 7]
        if (not rendah and not mesin) or putaran == 1:
            break
        try:
            for i in range(len(bab)):
                r = t7_revisi_bab(b, i, {"editor": b["editor"].get("masalah"), "cek_otomatis": mesin})
                if r.get("narasi"):
                    b["prosa_bab"][i] = {"no": i + 1, "narasi": str(r["narasi"])}
                    b["naskah_bab"][i] = buka_naskah(t6b_bab(b["prosa_bab"][i]["narasi"], b["tokoh"], b["tempat"], b["alur"], i)) or b["naskah_bab"][i]
                    simpan()
        except SystemExit as e:
            print(f"  revisi gagal ({str(e)[:120]}) -> berhenti"); b["catatan"] = "revisi terhenti karena LLM gratis gagal; jalankan ulang untuk melanjutkan"
            break
        gabung_bab(b); simpan()
    if terbaik:
        b["prosa_bab"], b["naskah_bab"], b["editor"] = terbaik["prosa_bab"], terbaik["naskah_bab"], terbaik["editor"]
        gabung_bab(b); b["dipilih"] = f"versi putaran {terbaik['putaran']} (nilai {terbaik['nilai']:.2f})"; print(f"  dipakai: {b['dipilih']}")


RUBRIK = ["hook", "logika_sebab_akibat", "setup_payoff", "konsistensi_tokoh", "konsistensi_gaya_bicara", "ketegangan_naik",
          "twist_mengerikan", "kelayakan_visual", "rasa_indonesia", "enak_didengar"]


def t7_editor(bible: dict, masalah_mesin: list) -> dict:
    mesin = ("PEMERIKSA OTOMATIS menemukan pelanggaran berikut (FAKTA, bukan pendapat). Skor aspek terkait WAJIB maksimal 5:\n- " + "\n- ".join(masalah_mesin)) if masalah_mesin else ""
    return tahap("7 editor", f"""Kamu editor kepala yang galak dan jujur; jangan murah hati. Nilai naskah final terhadap tahap sebelumnya.
Beri skor 1-10 untuk: {", ".join(RUBRIK)}. Skor 8+ hanya untuk yang benar-benar siap tayang.
Untuk tiap skor < 8 tulis masalah konkret (adegan berapa, kalimat mana) dan cara memperbaikinya.
Periksa: sudut pandang sama persis dengan tahap 4? kalimat utuh & enak dibacakan (bukan gaya telegram)? tokoh bertindak sesuai sifat?
aturan makhluk dipatuhi? benda kunci di-setup lalu dibayar? twist membuat keadaan lebih buruk (bukan menyelesaikan masalah)?
Periksa juga tiap butir checklist sutradara berikut; pelanggaran = masalah konkret:
{SUTRADARA}
{SUTRADARA_VISUAL}
{mesin}
JSON: {{"skor": {{{", ".join(f'"{r}": 0' for r in RUBRIK)}}}, "masalah": ["..."], "lolos": true}}""", bible, suhu=0.3)


def t7_revisi(bible: dict, nilai: dict) -> dict:
    """Revisi dilakukan di NARASI UTUH (lalu dipecah ulang), supaya alur tetap mengalir."""
    pov = (bible.get("gaya") or {}).get("sudut_pandang", "kamu")
    return tahap("7b revisi narasi", f"""Tulis ulang NARASI UTUH cerita ini untuk membereskan SEMUA masalah dari editor dan pemeriksa otomatis.
{aturan_pov(bible.get("gaya"), {"manusia": bible.get("tokoh")})}
{SUARA_NARATOR}
{SUTRADARA}
{contoh_teks(pov)}
Pertahankan premis, tokoh, tempat, aturan makhluk, benda kunci, dan urutan beat. 90-115 kata. Kalimat pendek tapi utuh dan enak dibacakan.
Twist membuat keadaan lebih buruk, di 2-3 kalimat-kelompok sebelum akhir. Kalimat terakhir: pertanyaan ke penonton + kata "komentar" (tanpa like/share).
JSON: {{"judul": "...", "narasi": "..."}}""", {**bible, "catatan_editor": nilai}, suhu=0.7, urutan=MENULIS)


def nilai_total(editor: dict, mesin: list) -> float:
    skor = [v for v in ((editor or {}).get("skor") or {}).values() if isinstance(v, (int, float))]
    return (sum(skor) / len(skor) if skor else 0) - 1.5 * len(mesin)


def _tanpa_kutipan(s: str) -> str:
    return re.sub(r"'[^']*'", " ", s)


KATA_PERASAAN = r"\b(seram|serem|menakutkan|mencekam|merinding|horor|suasana)\w*"
KATA_TEKNIS = r"\b(jumpscare|jump scare|scene|adegan|shot|sfx|twist|pov|glitch)\b"
PEMBUKA_BASI = r"^(pada suatu|suatu (malam|hari)|halo|hai|cerita ini|ini cerita|kali ini)"
SFX_TENANG = {"none", "heartbeat", "breath", "drip", None, ""}
KATA_SAMBUNG = {"yang", "dan", "di", "ke", "dari", "itu", "ini", "kamu", "dia", "aku", "ada", "nggak", "gak", "udah", "lagi", "juga", "terus", "kayak", "sama", "buat"}


def cek_sutradara(ad: list, teks_all: list, tw: list, fmt: str = "pendek") -> list:
    """Butir checklist_sutradara.md yang bisa diperiksa tanpa AI."""
    out = []
    if not ad:
        return out
    narasi = " ".join(teks_all)
    luar = _tanpa_kutipan(narasi).lower()
    kalimat1 = re.split(r"(?<=[.?!])\s|\.\.\.", teks_all[0].strip())[0]
    if len(kalimat1.split()) > 10: out.append(f"hook terlalu panjang: kalimat pertama {len(kalimat1.split())} kata (maks 10)")
    if re.match(PEMBUKA_BASI, teks_all[0].strip().lower()): out.append("hook dibuka dengan pengantar basi, bukan ancaman/kejanggalan")
    perasaan = sorted({m.group(0) for m in re.finditer(KATA_PERASAAN, _tanpa_kutipan(" ".join(teks_all[:-1])).lower())})
    if perasaan: out.append(f"menjelaskan perasaan, bukan menunjukkan: {', '.join(perasaan)}")
    teknis = sorted({m.group(0) for m in re.finditer(KATA_TEKNIS, luar)})
    if teknis: out.append(f"kata teknis bocor ke narasi: {', '.join(teknis)}")
    # frasa berulang: pasangan kata isi yang muncul 3x atau lebih
    kata = [w for w in re.findall(r"[a-z]+", narasi.lower())]
    pas = {}
    for a_, b_ in zip(kata, kata[1:]):
        if a_ in KATA_SAMBUNG or b_ in KATA_SAMBUNG: continue
        pas[f"{a_} {b_}"] = pas.get(f"{a_} {b_}", 0) + 1
    bat2 = 3 if fmt == "pendek" else max(3, len(kata) // 250)  # format panjang: batas ikut panjang naskah
    ulang = [f'"{k}" {v}x' for k, v in pas.items() if v >= bat2]
    if ulang: out.append(f"frasa diulang-ulang (maks {bat2 - 1}x): " + ", ".join(ulang))
    # kata isi tunggal yang muncul 4x+ (nama tokoh/tempat berhuruf kapital dikecualikan)
    nama = {w.lower() for w in re.findall(r"\b[A-Z][a-z]+\b", narasi) if not narasi.lower().count(" " + w.lower() + " ") > narasi.count(" " + w + " ")}
    hit = {}
    for w in kata:
        if len(w) >= 5 and w not in KATA_SAMBUNG and w not in nama: hit[w] = hit.get(w, 0) + 1
    bat1 = 4 if fmt == "pendek" else max(4, round(len(kata) * 0.012))
    ulang1 = [f'"{k}" {v}x' for k, v in hit.items() if v >= bat1]
    if ulang1: out.append(f"kata diulang terlalu sering (maks {bat1 - 1}x): " + ", ".join(ulang1))
    shot = [a.get("shot") for a in ad]
    if len(set(shot)) < 3: out.append(f"shot kurang variatif: hanya {len(set(shot))} jenis (min 3)")
    for i in range(2, len(shot)):
        if shot[i] == shot[i - 1] == shot[i - 2]: out.append(f"shot '{shot[i]}' dipakai 3x berturut (adegan {i - 1}-{i + 1})"); break
    kosong = [str(i + 1) for i, a in enumerate(ad) if not str(a.get("alasan_shot") or "").strip()]
    if kosong: out.append("alasan_shot kosong di adegan " + ", ".join(kosong))
    if len(tw) == 1:
        t0 = tw[0]
        for i, a in enumerate(ad[:t0]):
            mk = a.get("makhluk") or {}
            pos = mk.get("posisi") if isinstance(mk, dict) else None
            boleh = fmt == "panjang" and a.get("klimaks_bab") and i >= len(ad) // 2  # panjang: wujud jelas boleh di klimaks bab setelah titik tengah
            if pos in ("dekat", "depan") and not boleh: out.append(f"makhluk sudah terlihat jelas ({pos}) di adegan {i + 1}, sebelum " + ("twist" if fmt == "pendek" else "titik tengah / bukan klimaks bab"))
        if ad[t0].get("shot") not in ("dekat", "pov"): out.append(f"adegan twist pakai shot '{ad[t0].get('shot')}' (harus dekat/pov)")
        if t0 > 0:
            seb = ad[t0 - 1]
            if seb.get("sfx") not in SFX_TENANG: out.append(f"tidak ada hening sebelum klimaks: adegan {t0} pakai sfx '{seb.get('sfx')}' (pakai none/heartbeat/breath/drip)")
            if "..." not in teks_all[t0 - 1] and "…" not in teks_all[t0 - 1]: out.append(f"adegan {t0} (sebelum twist) tanpa jeda '...' untuk menahan napas")
    if fmt == "panjang":  # ritme: momen tegang paling lambat tiap ~90 detik (~140 kata)
        batas, jarak, mulai = FORMAT["panjang"]["jeda_tegang_kata"], 0, 1
        for i, a in enumerate(ad):
            tegang = a.get("kejadian") or a.get("makhluk") or a.get("klimaks_bab") or a.get("twist")
            jarak += len(teks_all[i].split())
            if tegang: jarak, mulai = 0, i + 2
            elif jarak > batas: out.append(f"ritme kendor: {jarak} kata (~{jarak / 1.55:.0f} dtk) tanpa momen tegang sejak adegan {mulai}"); jarak = -10 ** 6
        nbab = sorted({a.get("bab") for a in ad if a.get("bab")})
        tanpa = [str(x) for x in nbab if not any(a.get("klimaks_bab") or a.get("twist") for a in ad if a.get("bab") == x)]
        if tanpa: out.append("bab tanpa klimaks_bab: " + ", ".join(tanpa))
    return out


def cek_mesin(n: dict, b: dict | None = None) -> list:
    """Pemeriksaan otomatis yang tidak bergantung pada penilaian AI."""
    out, ad = [], n.get("adegan") or []
    teks_all = [str(a.get("teks", "")) for a in ad]
    kata = sum(len(t.split()) for t in teks_all)
    fmt = n.get("format") or (b or {}).get("format") or FMT
    if fmt == "pendek":
        if not 85 <= kata <= 125: out.append(f"total {kata} kata (harus 85-120)")
        if not 7 <= len(ad) <= 9: out.append(f"{len(ad)} adegan (harus 7-9)")
    else:
        (k0, k1), (a0, a1) = FORMAT[fmt]["cek_kata"], FORMAT[fmt]["adegan"]
        if not k0 <= kata <= k1: out.append(f"total {kata} kata (harus {k0}-{k1} untuk {FORMAT[fmt]['durasi']}, ~{kata / 1.55 / 60:.1f} menit)")
        if not a0 <= len(ad) <= a1: out.append(f"{len(ad)} adegan (harus {a0}-{a1})")
    tw = [i for i, a in enumerate(ad) if a.get("twist")]
    if len(tw) != 1: out.append(f"twist ada {len(tw)} (harus tepat 1)")
    else:
        if fmt == "pendek" and tw[0] not in (len(ad) - 2, len(ad) - 3): out.append(f"twist di adegan {tw[0] + 1} dari {len(ad)} (harus ke-2/3 dari belakang)")
        if fmt == "panjang" and not (len(ad) * 0.85 <= tw[0] < len(ad) - 1): out.append(f"twist di adegan {tw[0] + 1} dari {len(ad)} (harus di 15% terakhir, bukan adegan terakhir)")
        if not ad[tw[0]].get("makhluk"): out.append(f"adegan twist ({tw[0] + 1}) tidak menampilkan makhluk")
    km = [i for i, t in enumerate(teks_all) if "komentar" in t.lower()]
    if km != [len(ad) - 1]: out.append("ajakan komentar harus ada dan hanya di adegan terakhir")
    if any(re.search(r"\b(like|share|subscribe|follow)\b", t.lower()) for t in teks_all): out.append("ada ajakan like/share/subscribe (dilarang)")
    lok_lalu, ditinggal = None, set()
    for i, a in enumerate(ad):
        t = teks_all[i]
        if a.get("kejadian") == "jumpscare" and not a.get("twist") and not (fmt == "panjang" and a.get("klimaks_bab")):
            out.append(f"jumpscare di adegan {i + 1} yang bukan twist" + ("" if fmt == "pendek" else "/klimaks bab"))
        if a.get("lokasi") not in LOKASI_HOROR: out.append(f"adegan {i + 1}: lokasi '{a.get('lokasi')}' tidak tersedia")
        if a.get("shot") not in SHOT: out.append(f"adegan {i + 1}: shot '{a.get('shot')}' tidak dikenal (pakai {'/'.join(SHOT)})")
        if a.get("sfx", "none") not in SFX: out.append(f"adegan {i + 1}: sfx '{a.get('sfx')}' tidak tersedia")
        if re.search(r"\d", t): out.append(f"adegan {i + 1}: ada angka (tulis dengan huruf)")
        if len(t.split()) <= 4 and i not in (0, len(ad) - 1): out.append(f"adegan {i + 1} terlalu pendek/terpotong: \"{t}\"")
        lok = a.get("lokasi")
        if lok in ditinggal and fmt == "pendek": out.append(f"adegan {i + 1} kembali ke lokasi {lok} yang sudah ditinggalkan")
        if lok_lalu and lok != lok_lalu: ditinggal.add(lok_lalu)
        lok_lalu = lok
    out += cek_sutradara(ad, teks_all, tw, fmt)
    if b:
        pov = (b.get("gaya") or {}).get("sudut_pandang")
        manusia = (b.get("tokoh") or {}).get("manusia") or []
        dibuang = set((b.get("alur") or {}).get("tokoh_dibuang") or [])
        utama = manusia[0].get("nama", "") if manusia else ""
        luar = [_tanpa_kutipan(t).lower() for t in teks_all]
        if pov == "kamu":
            if utama and any(re.search(rf"\b{re.escape(utama.lower())}\b", x) for x in luar): out.append(f"sudut pandang 'kamu' tapi nama '{utama}' disebut di narasi")
            if any(re.search(r"\b(aku|gue|gua|saya)\b", x) for x in luar): out.append("sudut pandang 'kamu' tapi ada aku/gue/saya di luar kutipan")
            if sum("kamu" in x for x in luar) < len(ad) // 2: out.append("sudut pandang 'kamu' jarang dipakai (kurang dari separuh adegan)")
        elif pov == "aku" and any(re.search(r"\bkamu\b", x) for x in luar[:-1]): out.append("sudut pandang 'aku' tapi ada 'kamu' di luar kutipan")
        tampil = {tk.get("id") for a in ad for tk in (a.get("tokoh") or [])}
        for m in manusia:
            if m.get("id") not in tampil and m.get("id") not in dibuang and m.get("nama") not in dibuang:
                out.append(f"tokoh {m.get('nama')} dirancang tapi tidak pernah tampil (pakai atau buang)")
    return out


def dokumen(b: dict) -> str:
    k = b["konsep"]; p = k["premis"][k.get("terpilih", 0) if isinstance(k.get("terpilih"), int) else 0]
    L = [f"# {b['naskah'].get('judul', p.get('judul_kerja'))}", "", f"**Premis:** {p.get('premis')}", f"**Kenapa seram:** {p.get('kenapa_seram')}",
         f"**Alasan dipilih:** {k.get('alasan')}", "", "## Tokoh"]
    for m in b["tokoh"].get("manusia", []):
        L.append(f"- **{m.get('nama')}** ({m.get('umur')}, {m.get('peran')}) — sifat: {', '.join(m.get('sifat', []))}; mau: {m.get('keinginan')}; "
                 f"takut: {m.get('ketakutan')}; kebiasaan: {m.get('kebiasaan')}; bicara: {m.get('cara_bicara')}")
    mk = b["tokoh"].get("makhluk") or {}
    L += [f"- **Makhluk: {mk.get('jenis')}** — asal: {mk.get('asal_usul')}; aturan muncul: {mk.get('aturan')}", "", "## Tempat"]
    for t in b["tempat"].get("lokasi", []):
        i = t.get("indra", {})
        L.append(f"- **{t.get('id')}** ({t.get('waktu')}) — {t.get('alasan')}. Suara: {i.get('suara')}; bau: {i.get('bau')}; cahaya: {i.get('cahaya')}. "
                 f"Benda kunci: **{t.get('benda_kunci')}**. Pantangan: {t.get('pantangan')}")
    g = b["gaya"]
    L += ["", "## Gaya bicara", f"Sudut pandang **{g.get('sudut_pandang')}** — {g.get('alasan')}", f"Tempo: {g.get('tempo')}",
          f"Kata khas: {', '.join(g.get('kata_khas', []))}", f"Dialog: {g.get('aturan_dialog')}", "Contoh: " + " / ".join(g.get("contoh", [])), "", "## Alur"]
    for bt in b["alur"].get("beat", []):
        L.append(f"{bt.get('no')}. **{bt.get('jenis')}** — {bt.get('tujuan')} (emosi: {bt.get('emosi')})")
    for bb in b["alur"].get("bab", []):  # format panjang
        L.append(f"**Bab {bb.get('no')}: {bb.get('judul')}** — {bb.get('tujuan')} · klimaks: {bb.get('klimaks_bab')} · kait: {bb.get('kait')}")
        L += [f"   - {bt.get('jenis')}: {bt.get('tujuan')}" for bt in bb.get("beat", [])]
    if b["alur"].get("titik_tengah"): L.append(f"- Titik tengah: {b['alur']['titik_tengah']}")
    for sp in b["alur"].get("setup_payoff", []):
        L.append(f"- Setup beat {sp.get('setup_di_beat')} → payoff beat {sp.get('payoff_di_beat')}: {sp.get('apa')}")
    if b.get("prosa"): L += ["", "## Narasi utuh (sebelum dipecah)", str(b["prosa"].get("narasi", ""))]
    L += ["", "## Naskah final"]
    for i, a in enumerate(b["naskah"].get("adegan", [])):
        mk = a.get("makhluk") or {}
        if a.get("bab") and (i == 0 or b["naskah"]["adegan"][i - 1].get("bab") != a.get("bab")): L += ["", f"### Bab {a['bab']}"]
        L.append(f"{i + 1}. [{a.get('lokasi')} · {a.get('shot')}{' · TWIST' if a.get('twist') else ''}{' · KLIMAKS' if a.get('klimaks_bab') else ''}{' · ' + mk.get('jenis', '') + '/' + mk.get('posisi', '') if mk else ''}"
                 f"{' · ' + a['kejadian'] if a.get('kejadian') else ''}{' · sfx ' + a['sfx'] if a.get('sfx') not in (None, 'none') else ''}] {a.get('teks')}")
    e = b.get("editor", {})
    L += ["", "## Penilaian editor", ", ".join(f"{k}: {v}" for k, v in (e.get("skor") or {}).items())]
    L += [f"- {m}" for m in e.get("masalah", [])]
    if b.get("cek_mesin"): L += ["", "**Cek otomatis:** " + "; ".join(b["cek_mesin"])]
    return "\n".join(L)


def main():
    global FMT
    ap = argparse.ArgumentParser(); ap.add_argument("--ide"); ap.add_argument("--out", default="produksi/horor")
    ap.add_argument("--format", choices=["pendek", "panjang"], help="pendek = 30-60 dtk (bawaan), panjang = 8-10 menit per bab")
    a = ap.parse_args()
    out = (HERE / a.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    fb = out / "bible.json"
    # lanjutkan dari tahap terakhir yang tersimpan (bible.json juga boleh diedit tangan lalu dijalankan ulang)
    b = json.loads(fb.read_text(encoding="utf-8")) if fb.exists() else {}
    simpan = lambda: fb.write_text(json.dumps(b, ensure_ascii=False, indent=1), encoding="utf-8")  # noqa: E731
    if b:
        print(f"  melanjutkan: sudah ada {', '.join(b)}")
    if b.get("format") and a.format and a.format != b["format"]:
        print(f"  ! bible ini berformat '{b['format']}', --format {a.format} diabaikan (pakai folder --out lain untuk format berbeda)")
    FMT = b.get("format") or a.format or "pendek"; b["format"] = FMT
    print(f"  format: {FMT} ({FORMAT[FMT]['durasi']})")
    if "konsep" not in b:
        b["konsep"] = t1_konsep(a.ide)
        pilih = b["konsep"].get("terpilih", 0)
        b["konsep"]["terpilih"] = pilih if isinstance(pilih, int) and 0 <= pilih < len(b["konsep"].get("premis", [])) else 0
        simpan()
    if "tokoh" not in b: b["tokoh"] = t2_tokoh(b["konsep"]); simpan()
    if "tempat" not in b: b["tempat"] = t3_tempat(b["konsep"], b["tokoh"]); simpan()
    if "gaya" not in b: b["gaya"] = t4_gaya(b["konsep"], b["tokoh"], b["tempat"]); simpan()
    if FMT == "panjang":
        produksi_panjang(b, simpan)
        b["cek_mesin"] = cek_mesin(b["naskah"], b); simpan()
        (out / "bible.md").write_text(dokumen(b), encoding="utf-8")
        print(f"selesai -> {out / 'bible.md'}")
        return
    if "alur" not in b: b["alur"] = t5_alur(b["konsep"], b["tokoh"], b["tempat"], b["gaya"]); simpan()
    if "naskah" in b and not buka_naskah(b["naskah"]) and b.get("riwayat_naskah"):  # pulihkan bila naskah tersimpan rusak
        print("  naskah tersimpan kosong/rusak -> dipulihkan dari versi sebelumnya"); b["naskah"] = b["riwayat_naskah"].pop(); simpan()
    if "prosa" not in b: b["prosa"] = t6a_prosa(b["konsep"], b["tokoh"], b["tempat"], b["gaya"], b["alur"]); simpan()
    if "naskah" not in b or not buka_naskah(b["naskah"]):
        b["naskah"] = buka_naskah(t6b_pecah(b["prosa"], b["tokoh"], b["tempat"], b["gaya"], b["alur"])) or {}; simpan()
    terbaik = None
    for putaran in range(3):
        mesin = cek_mesin(b["naskah"], b)
        b["editor"] = t7_editor(ringkas(b), mesin); simpan()
        skor = b["editor"].get("skor") or {}
        n = nilai_total(b["editor"], mesin)
        print(f"  putaran {putaran + 1}: nilai {n:.2f} | skor {skor} | cek mesin: {mesin or 'ok'}")
        if terbaik is None or n > terbaik["nilai"]:
            terbaik = {"nilai": n, "prosa": b["prosa"], "naskah": b["naskah"], "editor": b["editor"], "putaran": putaran + 1}
        rendah = [k for k, v in skor.items() if isinstance(v, (int, float)) and v < 7]
        if (not rendah and not mesin) or putaran == 2:
            break
        try:
            prosa = t7_revisi(ringkas(b), {**b["editor"], "cek_otomatis": mesin})
            naskah = buka_naskah(t6b_pecah(prosa, b["tokoh"], b["tempat"], b["gaya"], b["alur"])) if prosa.get("narasi") else None
        except SystemExit as e:  # semua LLM gratis sedang gagal: pakai versi terbaik yang ada
            print(f"  revisi gagal ({str(e)[:120]}) -> berhenti"); b["catatan"] = "revisi terhenti karena LLM gratis gagal; jalankan ulang untuk melanjutkan"
            break
        if not naskah:
            print("  revisi tidak menghasilkan naskah valid -> dilewati"); continue
        b["prosa"], b["naskah"] = prosa, naskah; simpan()
    if terbaik:  # yang dipakai: versi dengan nilai tertinggi, bukan versi terakhir
        b["prosa"], b["naskah"], b["editor"] = terbaik["prosa"], terbaik["naskah"], terbaik["editor"]
        b["dipilih"] = f"versi putaran {terbaik['putaran']} (nilai {terbaik['nilai']:.2f})"; print(f"  dipakai: {b['dipilih']}")
    b["cek_mesin"] = cek_mesin(b["naskah"], b)
    simpan()
    (out / "bible.md").write_text(dokumen(b), encoding="utf-8")
    print(f"selesai -> {out / 'bible.md'}")


def buka_naskah(n) -> dict | None:
    """LLM kadang membungkus naskah ({"naskah": {...}} dll.). Ambil objek yang punya daftar 'adegan' berisi."""
    if not isinstance(n, dict):
        return None
    if isinstance(n.get("adegan"), list) and n["adegan"]:
        return n
    for v in n.values():
        hasil = buka_naskah(v)
        if hasil:
            return hasil
    return None


def ringkas(b: dict) -> dict:
    """Ringkasan pegangan untuk editor & revisi (dokumen lengkap terlalu besar untuk kuota LLM gratis)."""
    tk = b.get("tokoh", {})
    return {
        "premis": (b["konsep"].get("premis") or [{}])[b["konsep"].get("terpilih", 0)].get("premis"),
        "tokoh": [{k: m.get(k) for k in ("id", "nama", "sifat", "keinginan", "cara_bicara")} for m in tk.get("manusia", [])],
        "makhluk": tk.get("makhluk"),
        "tempat": [{k: t.get(k) for k in ("id", "benda_kunci", "pantangan")} for t in b.get("tempat", {}).get("lokasi", [])],
        "gaya": b.get("gaya"),
        "alur": {"beat": [x.get("jenis") for x in b.get("alur", {}).get("beat", [])], "setup_payoff": b.get("alur", {}).get("setup_payoff")}
        if "bab" not in b.get("alur", {}) else {"bab": [{k: x.get(k) for k in ("no", "judul", "klimaks_bab", "kait")} for x in b["alur"]["bab"]],
                                                 "titik_tengah": b["alur"].get("titik_tengah"), "setup_payoff": b["alur"].get("setup_payoff")},
        # format panjang: naskah diringkas per adegan supaya muat di kuota LLM gratis
        "naskah": b.get("naskah") if (b.get("naskah") or {}).get("format") != "panjang" else
        {"adegan": [[a.get("bab"), a.get("lokasi"), a.get("shot"), (a.get("makhluk") or {}).get("posisi") if isinstance(a.get("makhluk"), dict) else None,
                     a.get("kejadian"), a.get("sfx"), "TWIST" if a.get("twist") else ("KLIMAKS" if a.get("klimaks_bab") else ""), a.get("teks")] for a in b["naskah"].get("adegan", [])],
         "kolom": ["bab", "lokasi", "shot", "makhluk", "kejadian", "sfx", "tanda", "teks"]},
    }


if __name__ == "__main__":
    main()
