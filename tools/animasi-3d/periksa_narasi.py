"""Pemeriksaan narasi dengan pengenalan suara (faster-whisper, lokal & gratis).

Mendengarkan ulang suara narator lalu membandingkannya dengan naskah, supaya kata yang salah ucap,
terpotong, atau tertutup efek suara ketahuan SEBELUM video diunggah.

  .venv-asr/Scripts/python.exe periksa_narasi.py produksi/ojol/video [--model small] [--video <file.mp4>]

Dua pemeriksaan:
  1. Per adegan (potongan/NN.mp3 = suara narator bersih): apakah TTS mengucapkan naskah dengan benar?
  2. Campuran akhir (narasi.mp3 atau --video): apakah narasi masih jelas di atas drone + SFX?
Tanpa initial_prompt (naskah TIDAK dibocorkan ke Whisper, supaya hasilnya jujur).
Hasil: <folder>/narasi_qc.md + narasi_qc.json. Kode keluar 1 bila ada adegan GAGAL.
venv terpisah (.venv-asr, Python 3.13) supaya lingkungan backend Studio Clip tidak berubah.
"""
import argparse
import difflib
import json
import re
import sys
from pathlib import Path

# ejaan lisan yang setara (Whisper sering menulis versi bakunya)
SETARA = {"enggak": "nggak", "gak": "nggak", "ga": "nggak", "ngga": "nggak", "tak": "nggak", "hape": "hp", "ha": "hp", "sudah": "udah",
          "aja": "saja", "kayaknya": "kayak", "seperti": "kayak", "kalo": "kalau", "nyuruh": "nyuruh", "tau": "tahu", "bang": "bang", "mbak": "mbak"}
BATAS_OK, BATAS_PERINGATAN = 0.12, 0.25
ANGKA = {"0": "nol", "1": "satu", "2": "dua", "3": "tiga", "4": "empat", "5": "lima", "6": "enam", "7": "tujuh", "8": "delapan", "9": "sembilan",
         "10": "sepuluh", "11": "sebelas", "12": "dua belas", "13": "tiga belas", "14": "empat belas", "15": "lima belas", "20": "dua puluh"}


def bunyi(w: str) -> str:
    """penyamaan bunyi kasar untuk ejaan Inggris yang sering dipakai Whisper (City~Siti)."""
    return w.replace("c", "s").replace("y", "i").replace("ph", "f")


def muat_audio(path):
    """decode ke 16 kHz mono float32 lewat ffmpeg (hindari bentrok versi PyAV di faster-whisper)."""
    import subprocess
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def norm_kata(teks: str) -> list:
    k = re.findall(r"[a-z0-9]+", teks.lower().replace("-", " "))
    out = []
    for w in k:
        out += ANGKA.get(w, SETARA.get(w, w)).split()
    return out


def banding(naskah: str, dengar: str) -> dict:
    a, b = norm_kata(naskah), norm_kata(dengar)
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    salah, kecil, err = [], [], 0
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal": continue
        na, nb = " ".join(a[i1:i2]), " ".join(b[j1:j2])
        # beda spasi/ejaan tipis ("kebuka" vs "ke buka", "karatan" vs "keratan") dihitung kecil, bukan salah
        if na and nb and difflib.SequenceMatcher(a=bunyi(na.replace(" ", "")), b=bunyi(nb.replace(" ", ""))).ratio() >= 0.8:
            kecil.append(f"{na} → {nb}"); continue
        err += max(i2 - i1, j2 - j1)
        salah.append({"hilang": f"'{na}' tidak terdengar"} if op == "delete" else {"tambah": f"terdengar '{nb}' (tidak ada di naskah)"} if op == "insert"
                     else {"ganti": f"'{na}' terdengar '{nb}'"})
    wer = err / max(1, len(a))
    return {"wer": round(wer, 3), "salah": [list(s.values())[0] for s in salah], "kecil": kecil}


def tingkat(wer: float) -> str:
    return "OK" if wer <= BATAS_OK else "PERINGATAN" if wer <= BATAS_PERINGATAN else "GAGAL"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("folder"); ap.add_argument("--model", default="small"); ap.add_argument("--video")
    a = ap.parse_args()
    d = Path(a.folder).resolve()
    tl = json.loads((d / "timeline.json").read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel
    print(f"memuat model Whisper '{a.model}' (CPU int8; unduhan pertama bisa beberapa menit)...")
    model = WhisperModel(a.model, device="cpu", compute_type="int8")

    def dengar(path) -> tuple[str, list]:
        segs, _ = model.transcribe(muat_audio(path), language="id", word_timestamps=True, vad_filter=False, beam_size=5)
        kata = [w for s in segs for w in (s.words or [])]
        return " ".join(w.word.strip() for w in kata), [(w.word.strip(), round(w.probability, 2), round(w.start, 2)) for w in kata]

    def cek_jeda(idx, ad) -> list:
        """tiap '...' di naskah harus jadi hening nyata di rekaman bersih (silencedetect), bukan cuma di data waktu TTS."""
        import subprocess
        tok = re.findall(r"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?|\.\.\.|…", ad["teks"])
        kata_n, jeda_set = [], set()
        for tk in tok:
            if tk in ("...", "…"):
                if kata_n: jeda_set.add(len(kata_n) - 1)
            else: kata_n.append(tk)
        kata = tl["kata"][ad["kata0"]:ad["kata1"]]
        if not jeda_set or len(kata_n) != len(kata): return []
        f = d / "potongan" / f"{idx:02d}.mp3"
        o = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f), "-af", "silencedetect=n=-40dB:d=0.15", "-f", "null", "-"], capture_output=True, text=True).stderr
        st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", o)]; en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", o)]
        hening = [(a_, b_) for a_, b_ in zip(st, en) if b_ - a_ >= 0.2]
        off = 0.6 if idx == 0 else ad["mulai"] + 0.2  # posisi potongan di timeline (lihat horor_video.py)
        out = []
        for i in sorted(jeda_set):
            if i + 1 >= len(kata): continue
            lo, hi = kata[i]["s"] - off + 0.05, kata[i + 1]["s"] - off + 0.12
            if not any(lo + 0.1 < a_ < hi for a_, b_ in hening):  # hening harus MULAI setelah kata itu diucapkan
                out.append(f"jeda '...' setelah '{kata_n[i]}' TIDAK terdengar (kalimat menyambung ke '{kata_n[i + 1]}')")
        return out

    hasil, laporan = [], []
    print("1/2 per adegan (suara narator bersih)...")
    for i, ad in enumerate(tl["adegan"]):
        f = d / "potongan" / f"{i:02d}.mp3"
        if not f.exists(): continue
        teks, kata = dengar(f)
        b = banding(ad["teks"], teks)
        ragu = [f"{w} ({p:.0%})" for w, p, _ in kata if p < 0.45]
        t = tingkat(b["wer"])
        jeda = cek_jeda(i, ad)
        if jeda and t == "OK": t = "PERINGATAN"
        hasil.append({"adegan": i + 1, "beat": ad.get("beat"), "tingkat": t, **b, "terdengar": teks, "ragu": ragu, "jeda": jeda})
        print(f"  adegan {i + 1}: {t} (salah {b['wer']:.0%})")

    print("2/2 campuran akhir (narasi + drone + SFX)...")
    sumber = Path(a.video) if a.video else d / "narasi.mp3"
    teks_mix, kata_mix = dengar(sumber)
    naskah_all = " ".join(x["teks"] for x in tl["adegan"])
    bm = banding(naskah_all, teks_mix)
    # cari bagian campuran yang hilang -> petakan ke adegan lewat waktu kata
    tm = tingkat(bm["wer"])

    gagal = [h for h in hasil if h["tingkat"] == "GAGAL"]
    ikon = {"GAGAL": "❌", "PERINGATAN": "⚠️", "OK": "✅"}
    md = [f"# Pemeriksaan narasi — {tl.get('judul', d.name)}", "",
          f"Model Whisper: `{a.model}` · batas: salah ≤{BATAS_OK:.0%} OK, ≤{BATAS_PERINGATAN:.0%} peringatan, lebih = gagal", "",
          f"**Per adegan:** {sum(h['tingkat'] == 'OK' for h in hasil)} OK, {sum(h['tingkat'] == 'PERINGATAN' for h in hasil)} peringatan, {len(gagal)} gagal",
          f"**Campuran akhir ({sumber.name}):** {ikon[tm]} salah {bm['wer']:.0%}" + (" — narasi tetap jelas di atas efek suara" if tm == "OK" else " — sebagian narasi tertutup efek suara/drone"), ""]
    for h in hasil:
        md.append(f"## {ikon[h['tingkat']]} Adegan {h['adegan']} ({h['beat']}) — salah {h['wer']:.0%}")
        md.append(f"- Naskah: {tl['adegan'][h['adegan'] - 1]['teks']}")
        md.append(f"- Terdengar: {h['terdengar']}")
        for s in h["salah"]: md.append(f"  - ❗ {s}")
        for s in h["jeda"]: md.append(f"  - ⏸ {s}")
        if h["kecil"]: md.append(f"  - beda ejaan kecil (diabaikan): {', '.join(h['kecil'])}")
        if h["ragu"]: md.append(f"  - kata yang Whisper ragu (mungkin kurang jelas): {', '.join(h['ragu'])}")
        md.append("")
    if bm["salah"]:
        md += ["## Campuran akhir — bagian yang beda", *[f"- {s}" for s in bm["salah"]], ""]
    md += ["Catatan: Whisper sendiri bisa salah dengar, terutama nama & kata gaul. Kesalahan yang sama di adegan bersih DAN campuran",
           "hampir pasti masalah pengucapan TTS; yang hanya muncul di campuran berarti tertutup efek suara."]
    (d / "narasi_qc.md").write_text("\n".join(md), encoding="utf-8")
    (d / "narasi_qc.json").write_text(json.dumps({"adegan": hasil, "campuran": {"tingkat": tm, **bm, "terdengar": teks_mix}}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(md))
    sys.exit(1 if gagal else 0)


if __name__ == "__main__":
    main()
