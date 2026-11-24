"""Pemilih suara gabungan ("combo") — 22 Nov 2026.

Setiap KARAKTER suara punya urutan mesin di data/suara_profil.json. Mesin pertama dicoba dulu; kalau gagal
(kuota habis, GPU sibuk, internet mati), otomatis pindah ke mesin berikutnya. Format mesin sama dengan
narrate.synthesize: "voxcpm:<suara>", "omnivoice:<suara>", "gemini:<Nama>", atau nama suara Edge.

    from app.services import suara_gabungan
    dur, words, mesin = suara_gabungan.bicara("narator_horor", "Malam itu...", "out.mp3")

Modul baru; narrate / gemini_tts / omnivoice_tts / edge tidak diubah. Ganti suara cukup di file profil.
"""
import json
from pathlib import Path

from .. import config

PROFIL = Path(__file__).resolve().parents[2] / "data" / "suara_profil.json"


def profil() -> dict:
    return json.loads(PROFIL.read_text(encoding="utf-8"))


def bicara(karakter: str, text: str, out_path, mesin: list[str] | None = None) -> tuple[float, list[dict], str]:
    p = profil()[karakter]
    urutan = mesin or p["mesin"]
    gagal = []
    for m in urutan:
        try:
            if m.startswith("voxcpm:"):
                from . import voxcpm_tts
                dur, words = voxcpm_tts.synthesize(text, m.split(":", 1)[1], out_path, config.load_settings())
            else:
                from . import narrate
                dur, words = narrate.synthesize(text, m, out_path, rate=p.get("rate", "+8%"),
                                                pitch=p.get("pitch", "+0Hz"), gemini_style=p.get("gemini_style"))
            return dur, words, m
        except Exception as e:  # noqa: BLE001 — coba mesin berikutnya
            gagal.append(f"{m}: {str(e)[:160]}")
    raise RuntimeError(f"Semua mesin suara gagal untuk '{karakter}': " + " | ".join(gagal))
