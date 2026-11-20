"""Pemeriksaan kualitas otomatis SETELAH render (ide dari loop review lemo-opuscar, ditulis ulang sendiri).

  python periksa_video.py produksi/ojol/video/order_jam_dua_pagi.mp4            -> laporan + lembar kontak
  python periksa_video.py <video> --perbaiki                                     -> + versi audio dinormalkan (-14 LUFS)

Yang dicek (semua pakai ffmpeg/ffprobe, gratis & lokal):
  1. Format: resolusi 1080x1920, fps 30, ada audio, durasi (cocok dengan timeline.json bila ada)
  2. Kerasnya suara: integrated loudness target -14 LUFS (+-1), true peak <= -1 dBTP
  3. Layar hitam terlalu lama (blackdetect) — hitam yang disengaja di akhir/adegan "gelap" diberi tanda
  4. Gambar macet/beku (freezedetect) > 2,5 dtk
  5. Sunyi tanpa suara (silencedetect) > 2,5 dtk
  6. Terang tiap adegan (rata-rata luma) — terlalu gelap sampai tak terbaca / terlalu terang
  7. Lembar kontak: 1 gambar per adegan (atau tiap 6 dtk) -> <nama>_lembar.jpg untuk dicek mata
Hasil: <nama>_qc.md + <nama>_qc.json. Kode keluar 1 bila ada masalah "GAGAL".
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

TARGET_LUFS, TOL_LUFS, MAKS_TP = -14.0, 1.0, -1.0
# drawtext butuh path font eksplisit (di Windows tanpa fontconfig ffmpeg bisa crash); Mac: Helvetica
_F = next((f for f in ["C:/Windows/Fonts/arial.ttf", "/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"] if Path(f).exists()), None)
FONT = ("fontfile='" + _F.replace(":", r"\:") + "':") if _F else ""


def jalan(args) -> str:
    p = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.stdout + p.stderr


def probe(v: Path) -> dict:
    j = json.loads(jalan(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(v)]))
    vs = next((s for s in j["streams"] if s["codec_type"] == "video"), {})
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    num, den = (vs.get("r_frame_rate", "0/1").split("/") + ["1"])[:2]
    return {"w": vs.get("width"), "h": vs.get("height"), "fps": round(int(num) / max(1, int(den)), 2), "codec": vs.get("codec_name"),
            "audio": bool(a), "durasi": float(j["format"]["duration"]), "mb": round(int(j["format"]["size"]) / 1e6, 1)}


def loudness(v: Path) -> dict:
    o = jalan(["ffmpeg", "-hide_banner", "-i", str(v), "-vn", "-af", f"loudnorm=I={TARGET_LUFS}:TP={MAKS_TP}:LRA=11:print_format=json", "-f", "null", "-"])
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", o, re.S)
    d = json.loads(m.group(0)) if m else {}
    return {"lufs": float(d.get("input_i", "nan")), "tp": float(d.get("input_tp", "nan")), "lra": float(d.get("input_lra", "nan")), "_raw": d}


def rentang(o: str, kunci_mulai: str, kunci_akhir: str) -> list:
    mulai = [float(x) for x in re.findall(kunci_mulai + r":\s*([\d.]+)", o)]
    akhir = [float(x) for x in re.findall(kunci_akhir + r":\s*([\d.]+)", o)]
    return [(s, akhir[i] if i < len(akhir) else None) for i, s in enumerate(mulai)]


def hitam(v: Path) -> list:
    o = jalan(["ffmpeg", "-hide_banner", "-i", str(v), "-vf", "blackdetect=d=0.5:pic_th=0.94:pix_th=0.10", "-an", "-f", "null", "-"])
    return rentang(o, "black_start", "black_end")


def beku(v: Path) -> list:
    o = jalan(["ffmpeg", "-hide_banner", "-i", str(v), "-vf", "freezedetect=n=0.002:d=2.5", "-an", "-f", "null", "-"])
    return rentang(o, "freeze_start", "freeze_end")


def sunyi(v: Path) -> list:
    o = jalan(["ffmpeg", "-hide_banner", "-i", str(v), "-vn", "-af", "silencedetect=n=-45dB:d=2.5", "-f", "null", "-"])
    return rentang(o, "silence_start", "silence_end")


def luma(v: Path, t: float) -> float:
    o = jalan(["ffmpeg", "-hide_banner", "-ss", f"{t:.2f}", "-i", str(v), "-frames:v", "1", "-vf", "scale=270:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"])
    m = re.search(r"YAVG=([\d.]+)", o)
    return float(m.group(1)) if m else -1


def lembar(v: Path, titik: list, out: Path):
    tmp = out.parent / (out.stem + "_tmp"); tmp.mkdir(exist_ok=True)
    files = []
    for i, (t, label) in enumerate(titik):
        f = tmp / f"{i:02d}.jpg"
        txt = label.replace(":", r"\:").replace("'", "")
        jalan(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(v), "-frames:v", "1", "-vf",
               f"scale=270:480,drawtext={FONT}text='{txt}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6", str(f)])
        if f.exists(): files.append(f)
    if not files: return
    kol = min(4, len(files)); baris = -(-len(files) // kol)
    while len(files) < kol * baris: files.append(files[-1])
    ins = sum((["-i", str(f)] for f in files), [])
    lay = "|".join(f"{(i % kol) * 270}_{(i // kol) * 480}" for i in range(len(files)))
    jalan(["ffmpeg", "-y", "-v", "error", *ins, "-filter_complex", f"xstack=inputs={len(files)}:layout={lay}", str(out)])
    for f in tmp.iterdir(): f.unlink()
    tmp.rmdir()


def perbaiki_audio(v: Path, ld: dict) -> Path:
    r = ld["_raw"]; out = v.with_name(v.stem + "_final.mp4")
    af = (f"loudnorm=I={TARGET_LUFS}:TP={MAKS_TP}:LRA=11:measured_I={r['input_i']}:measured_TP={r['input_tp']}:"
          f"measured_LRA={r['input_lra']}:measured_thresh={r['input_thresh']}:offset={r['target_offset']}:linear=true")
    jalan(["ffmpeg", "-y", "-v", "error", "-i", str(v), "-c:v", "copy", "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out)])
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--timeline"); ap.add_argument("--perbaiki", action="store_true")
    ap.add_argument("--format", choices=["pendek", "panjang"], help="bawaan: dari timeline.json, lalu pendek")
    a = ap.parse_args()
    v = Path(a.video).resolve()
    tlf = Path(a.timeline) if a.timeline else v.parent / "timeline.json"
    tl = json.loads(tlf.read_text(encoding="utf-8")) if tlf.exists() else None
    hasil = []  # (tingkat, pesan)  tingkat: GAGAL | PERINGATAN | OK

    print("1/6 format..."); p = probe(v)
    hasil.append(("OK" if (p["w"], p["h"]) == (1080, 1920) else "GAGAL", f"resolusi {p['w']}x{p['h']} (target 1080x1920)"))
    hasil.append(("OK" if abs(p["fps"] - 30) < 0.1 else "PERINGATAN", f"fps {p['fps']}"))
    hasil.append(("OK" if p["audio"] else "GAGAL", "ada trek audio" if p["audio"] else "TIDAK ada audio"))
    fmt = a.format or (tl or {}).get("format") or "pendek"
    if fmt == "pendek":
        durasi_ok = p["durasi"] <= 60
        hasil.append(("OK" if durasi_ok else "PERINGATAN", f"durasi {p['durasi']:.1f} dtk" + ("" if durasi_ok else " (> 60 dtk: terlalu panjang untuk Shorts/Reels standar)")))
    else:  # panjang: target 8-10 menit, toleransi 7-11 menit
        durasi_ok = 420 <= p["durasi"] <= 660
        hasil.append(("OK" if durasi_ok else "PERINGATAN", f"durasi {p['durasi'] / 60:.1f} menit (format panjang, target 8-10 menit)" + ("" if durasi_ok else " — di luar 7-11 menit")))
    if tl and abs(tl["durasi"] - p["durasi"]) > 0.5: hasil.append(("GAGAL", f"durasi video {p['durasi']:.1f} beda dengan timeline {tl['durasi']:.1f}"))
    hasil.append(("OK", f"ukuran file {p['mb']} MB, codec {p['codec']}"))

    print("2/6 kerasnya suara..."); ld = loudness(v)
    selisih = ld["lufs"] - TARGET_LUFS
    hasil.append(("OK" if abs(selisih) <= TOL_LUFS else "GAGAL", f"loudness {ld['lufs']:.1f} LUFS (target {TARGET_LUFS:.0f} ±{TOL_LUFS:.0f}; " + ("pas" if abs(selisih) <= TOL_LUFS else ("terlalu pelan" if selisih < 0 else "terlalu keras")) + ")"))
    hasil.append(("OK" if ld["tp"] <= MAKS_TP + 0.05 else "PERINGATAN", f"true peak {ld['tp']:.1f} dBTP (maks {MAKS_TP:.0f})"))

    adegan = (tl or {}).get("adegan") or []
    sengaja = [(x["mulai"], x["akhir"]) for x in adegan if x.get("gelap") or x.get("t_jumpscare")]
    di_sengaja = lambda s, e: any(s >= m - 0.3 and (e or s) <= z + 0.3 for m, z in sengaja)

    print("3/6 layar hitam...");
    for s, e in hitam(v):
        d = (e or p["durasi"]) - s
        if s < 0.9 and d < 1.0: continue  # fade-in pembuka
        if di_sengaja(s, e): hasil.append(("OK", f"hitam {s:.1f}-{(e or p['durasi']):.1f} dtk ({d:.1f} dtk) — disengaja (adegan gelap/jumpscare)"))
        else: hasil.append(("GAGAL" if d > 2.0 else "PERINGATAN", f"layar hitam {s:.1f}-{(e or p['durasi']):.1f} dtk ({d:.1f} dtk) tidak direncanakan"))

    print("4/6 gambar beku...")
    for s, e in beku(v):
        d = (e or p["durasi"]) - s
        hasil.append(("OK" if di_sengaja(s, e) else "PERINGATAN", f"gambar diam {s:.1f}-{(e or p['durasi']):.1f} dtk ({d:.1f} dtk)" + (" — di adegan gelap" if di_sengaja(s, e) else "")))

    print("5/6 sunyi...")
    for s, e in sunyi(v):
        d = (e or p["durasi"]) - s
        hasil.append(("PERINGATAN", f"sunyi tanpa suara {s:.1f}-{(e or p['durasi']):.1f} dtk ({d:.1f} dtk)"))

    print("6/6 terang tiap adegan + lembar kontak...")
    titik = [((x["mulai"] + x["akhir"]) / 2, f"{i + 1} {x.get('beat', '')}") for i, x in enumerate(adegan)] if adegan else [(t, f"{t:.0f}s") for t in [i * 6 + 3 for i in range(int(p["durasi"] // 6))]]
    for t, label in titik:
        y = luma(v, t)
        x = next((d for d in adegan if d["mulai"] <= t < d["akhir"]), {})
        if y < 22 and not x.get("gelap"): hasil.append(("PERINGATAN", f"adegan '{label}' terlalu gelap (luma {y:.0f}/255) — tokoh bisa tak terbaca"))
        elif y > 200: hasil.append(("PERINGATAN", f"adegan '{label}' terlalu terang (luma {y:.0f}/255)"))
        else: hasil.append(("OK", f"terang adegan '{label}': luma {y:.0f}/255"))
    lb = v.with_name(v.stem + "_lembar.jpg"); lembar(v, titik, lb)

    final = None
    if a.perbaiki and abs(selisih) > TOL_LUFS / 2:
        print("memperbaiki kerasnya suara ke -14 LUFS..."); final = perbaiki_audio(v, ld)
        ld2 = loudness(final); hasil.append(("OK", f"DIPERBAIKI -> {final.name}: {ld2['lufs']:.1f} LUFS, true peak {ld2['tp']:.1f} dBTP"))

    gagal = [m for t, m in hasil if t == "GAGAL"]; per = [m for t, m in hasil if t == "PERINGATAN"]
    ikon = {"GAGAL": "❌", "PERINGATAN": "⚠️", "OK": "✅"}
    md = [f"# QC {v.name} (format {fmt})", "", f"**Hasil:** {'GAGAL' if gagal else 'LOLOS'} — {len(gagal)} gagal, {len(per)} peringatan", ""]
    md += [f"- {ikon[t]} {m}" for t, m in sorted(hasil, key=lambda h: ["GAGAL", "PERINGATAN", "OK"].index(h[0]))]
    md += ["", f"Lembar kontak: `{lb.name}`"] + ([f"Versi diperbaiki: `{final.name}`"] if final else [])
    v.with_name(v.stem + "_qc.md").write_text("\n".join(md), encoding="utf-8")
    v.with_name(v.stem + "_qc.json").write_text(json.dumps({"format": p, "loudness": {k: ld[k] for k in ("lufs", "tp", "lra")}, "hasil": hasil}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n".join(md))
    sys.exit(1 if gagal and not final else 0)


if __name__ == "__main__":
    main()
