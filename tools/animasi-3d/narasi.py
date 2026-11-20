"""Uji coba animasi 3D: buat narasi (edge-tts, gratis) + waktu tiap kata.

Pakai: python narasi.py <folder-hasil> [teks] [suara]
Hasil: narasi.mp3 dan kata.json ([{"w": kata, "s": mulai, "e": selesai}] dalam detik).
"""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

TEKS = ("Tahun seribu delapan ratus lima puluh. Seorang penjelajah berdiri gagah di tepi sungai. "
        "Dia yakin, tidak ada yang bisa mengalahkannya. Sampai... pasir di depannya bergerak.")


async def main(out: Path, teks: str, suara: str):
    out.mkdir(parents=True, exist_ok=True)
    com = edge_tts.Communicate(teks, suara, rate="+5%", boundary="WordBoundary")
    kata = []
    with open(out / "narasi.mp3", "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                s = ch["offset"] / 1e7
                kata.append({"w": ch["text"], "s": round(s, 3), "e": round(s + ch["duration"] / 1e7, 3)})
    (out / "kata.json").write_text(json.dumps(kata, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(kata), "kata;", kata[-1]["e"] if kata else 0, "detik")


if __name__ == "__main__":
    o = Path(sys.argv[1])
    asyncio.run(main(o, sys.argv[2] if len(sys.argv) > 2 else TEKS,
                     sys.argv[3] if len(sys.argv) > 3 else "id-ID-ArdiNeural"))
