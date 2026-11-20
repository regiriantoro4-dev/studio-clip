"""Naskah horor (JSON adegan) -> narasi + SFX + drone -> timeline.json untuk mesin_horor.js.

  python horor_video.py produksi/ojol/naskah_pilot.json --out produksi/ojol/video
  node render.cjs produksi/ojol/video --skrip mesin_horor.js

SFX memakai resep efek suara horor yang sudah ada di backend (horror_sfx._DEFS, hanya dibaca);
file WAV-nya dibuat di folder produksi sendiri, jadi tidak ada modul lama yang diubah.
"""
import argparse
import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "backend"))
from app.services import horror_sfx  # noqa: E402  (resep lavfi + gain)

JEDA = 0.5
SUARA = "id-ID-ArdiNeural"


async def _tts(teks, path, rate="-4%", pitch="-6Hz"):
    import edge_tts
    com = edge_tts.Communicate(teks, SUARA, rate=rate, pitch=pitch, boundary="WordBoundary")
    kata = []
    with open(path, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                kata.append({"w": ch["text"], "s": s, "e": s + ch["duration"] / 1e7})
    return kata


JEDA_ELIPSIS = 0.45  # detik hening pasti untuk tiap "..." (edge-tts sering mengabaikan "..." — terbukti periksa_narasi.py)


def hening_tepi(f) -> tuple:
    """(hening di awal, hening di akhir) sebuah potongan suara, detik."""
    o = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(f), "-af", "silencedetect=n=-40dB:d=0.05", "-f", "null", "-"], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: (-?[\d.]+)", o)]; en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", o)]
    d = durasi(f)
    awal = en[0] if st and st[0] <= 0.01 and en else 0.0
    akhir = d - st[-1] if st and len(st) > len(en) else (d - st[-1] if st and en and en[-1] >= d - 0.02 else 0.0)
    return awal, max(0.0, akhir)


def tts_berjeda(teks, path):
    """Pecah teks di '...', buat suara tiap potong, sambung dengan hening JEDA_ELIPSIS. Waktu kata ikut digeser."""
    potong = [p.strip() for p in re.split(r"\s*(?:\.\.\.|…)\s*", teks)]
    potong = [p for p in potong if re.search(r"\w", p)]
    if len(potong) <= 1:
        return asyncio.run(_tts(teks, path))
    kata, bagian, t = [], [], 0.0
    for k, p in enumerate(potong):
        f = path.with_name(f"{path.stem}_p{k}.mp3")
        akhir = k == len(potong) - 1
        kk = asyncio.run(_tts(p if akhir else p + "...", f))  # "..." di ujung potong = intonasi menggantung
        awal, ekor = hening_tepi(f)
        if k: t = max(0.0, t - awal)  # buang hening bawaan di awal potong ini
        kata += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in kk]
        bagian.append((f, t))
        # potong berikutnya mulai JEDA_ELIPSIS setelah suara benar-benar berhenti (hening ekor bawaan TTS dihitung)
        t += durasi(f) if akhir else durasi(f) - ekor + JEDA_ELIPSIS
    args, filt = ["ffmpeg", "-y", "-v", "error"], []
    for j, (f, off) in enumerate(bagian):
        ms = int(off * 1000); args += ["-i", str(f)]; filt.append(f"[{j}:a]aresample=24000,adelay={ms}|{ms}[b{j}]")
    filt.append("".join(f"[b{j}]" for j in range(len(bagian))) + f"amix=inputs={len(bagian)}:normalize=0,atrim=0:{t:.3f}[o]")
    subprocess.run(args + ["-filter_complex", ";".join(filt), "-map", "[o]", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", str(path)], check=True)
    for f, _ in bagian: f.unlink()
    return kata


def durasi(p) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                                capture_output=True, text=True).stdout.strip())


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def waktu(kata, a, kunci, akhir=False):
    """detik kata pertama di adegan a yang diawali `kunci` (None -> awal adegan)."""
    if kunci in (None, True):
        return a["mulai"]
    k = norm(kunci)
    for w in kata[a["kata0"]:a["kata1"]]:
        if norm(w["w"]).startswith(k):
            return w["e"] if akhir else w["s"]
    print(f"  ! kata '{kunci}' tidak ditemukan di adegan {a['beat']}, pakai awal adegan")
    return a["mulai"]


def sfx_wav(nama, folder: Path) -> Path:
    out = folder / f"{nama}.wav"
    if not out.exists():
        src, flt, _ = horror_sfx._DEFS[nama]
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", src, "-af", f"{flt},alimiter=limit=0.95",
                        "-ar", "44100", "-ac", "1", str(out)], check=True)
    return out


def drone(path: Path, dur: float):
    graph = ("[0]lowpass=f=240,volume=0.9[n];[1]volume=0.35[a];[2]volume=0.3[b];"
             "[n][a][b]amix=inputs=3:normalize=0,tremolo=f=0.12:d=0.5,highpass=f=28,afade=t=in:d=2.5,alimiter=limit=0.8[o]")
    subprocess.run(["ffmpeg", "-y", "-v", "error",
                    "-f", "lavfi", "-i", f"anoisesrc=color=brown:amplitude=0.6:duration={dur:.2f}:seed=7",
                    "-f", "lavfi", "-i", f"sine=frequency=55:duration={dur:.2f}",
                    "-f", "lavfi", "-i", f"sine=frequency=58.2:duration={dur:.2f}",
                    "-filter_complex", graph, "-map", "[o]", "-ar", "44100", str(path)], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("naskah"); ap.add_argument("--out", required=True); ap.add_argument("--gaya", choices=["biasa", "vhs"])
    a_ = ap.parse_args()
    nk = json.loads(Path(a_.naskah).read_text(encoding="utf-8"))
    out = (HERE / a_.out).resolve(); out.mkdir(parents=True, exist_ok=True)
    pot = out / "potongan"; pot.mkdir(exist_ok=True)
    sfxd = out / "sfx"; sfxd.mkdir(exist_ok=True)

    # 1) narasi per adegan, disusun berurutan dengan jeda
    kata, t, files = [], 0.6, []
    for i, a in enumerate(nk["adegan"]):
        f = pot / f"{i:02d}.mp3"
        kk = tts_berjeda(a["teks"], f)
        d = durasi(f)
        a["mulai"] = 0.0 if i == 0 else round(t - 0.2, 3)
        a["kata0"] = len(kata)
        kata += [{"w": w["w"], "s": round(t + w["s"], 3), "e": round(t + w["e"], 3)} for w in kk]
        a["kata1"] = len(kata)
        files.append((f, t))
        t += d + JEDA + (0.9 if a.get("jumpscare") else 0)  # ruang napas setelah jumpscare
    total = round(t + 1.8, 3)
    for i, a in enumerate(nk["adegan"]):
        a["akhir"] = nk["adegan"][i + 1]["mulai"] if i + 1 < len(nk["adegan"]) else total

    # 2) ubah semua penanda kata -> detik (mesin JS tinggal membaca angka)
    cues = []
    for a in nk["adegan"]:
        for nama, pada in a.get("sfx", []):
            # J-cut: sfx pembuka adegan (tanpa penanda kata) mulai 0,35 dtk SEBELUM gambar berganti
            cues.append((nama, waktu(kata, a, pada) - (0.35 if pada is None and a["mulai"] > 0 else 0)))
        a["lampu"] = [[waktu(kata, a, p), lv] for p, lv in a.get("lampu", [])]
        for kunci in ("pintu", "hpMati", "potong", "jadiKunti", "layarHp"):
            if a.get(kunci):
                a["t_" + kunci] = waktu(kata, a, a[kunci])
        if a.get("jumpscare"):
            tj = waktu(kata, a, a["jumpscare"], akhir=True) + 0.15
            a["t_jumpscare"] = round(tj, 3)
            cues += [("riser", tj - horror_sfx.duration("riser")), ("hit", tj)]
        if a.get("fokusAkhir"):
            a["t_fokusAkhir"] = waktu(kata, a, a["fokusAkhir"][0])
        for tk in a["tokoh"]:
            tk["berubah"] = [[waktu(kata, a, p), pose, eks] for p, pose, eks in tk.get("berubah", [])]

    # 3) campur: narasi + drone + sfx
    dr = out / "drone.wav"; drone(dr, total)
    gaya_vhs = (a_.gaya or nk.get("gaya")) == "vhs"
    if gaya_vhs:  # desis pita kaset + dengung 60 Hz tipis
        hs = out / "desis.wav"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.5:duration={total:.2f}:seed=5",
                        "-f", "lavfi", "-i", f"sine=frequency=60:duration={total:.2f}", "-filter_complex",
                        "[0]highpass=f=2500,lowpass=f=9000,volume=0.09[h];[1]volume=0.02[g];[h][g]amix=inputs=2:normalize=0[o]", "-map", "[o]", "-ar", "44100", str(hs)], check=True)
    args, filt, lab = ["ffmpeg", "-y", "-v", "error"], [], []
    for j, (f, off) in enumerate(files):
        args += ["-i", str(f)]; ms = int(off * 1000)
        filt.append(f"[{j}:a]aresample=44100,adelay={ms}|{ms}[n{j}]"); lab.append(f"[n{j}]")
    k = len(files)
    args += ["-i", str(dr)]; filt.append(f"[{k}:a]volume=0.55[dr]"); lab.append("[dr]"); k += 1
    if gaya_vhs:
        args += ["-i", str(out / "desis.wav")]; filt.append(f"[{k}:a]volume=1[hs]"); lab.append("[hs]"); k += 1
    for nama, tc in cues:
        args += ["-i", str(sfx_wav(nama, sfxd))]; ms = int(max(0, tc) * 1000)
        filt.append(f"[{k}:a]volume={horror_sfx.GAIN.get(nama, 0.5)},adelay={ms}|{ms}[s{k}]"); lab.append(f"[s{k}]"); k += 1
    filt.append("".join(lab) + f"amix=inputs={len(lab)}:normalize=0,apad=whole_dur={total:.2f},atrim=0:{total:.2f},alimiter=limit=0.95[m]")
    args += ["-filter_complex", ";".join(filt), "-map", "[m]", "-ac", "2", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", str(out / "narasi.mp3")]
    subprocess.run(args, check=True)

    gaya = a_.gaya or nk.get("gaya", "biasa")
    tl = {"format": nk.get("format", "pendek"), "gaya": gaya, "judul": nk["judul"], "durasi": total, "tokoh": nk["tokoh"], "adegan": nk["adegan"], "kata": kata}
    (out / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"selesai: {len(kata)} kata, {total:.1f} dtk, {len(cues)} sfx -> {out}")


if __name__ == "__main__":
    main()
