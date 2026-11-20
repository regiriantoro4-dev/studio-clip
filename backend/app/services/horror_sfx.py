"""Efek suara horor buatan sendiri (ffmpeg lavfi) — gratis & bebas hak cipta.

Tiap adegan bisa punya satu SFX ("sfx" dari LLM); adegan twist otomatis dapat riser + hentakan.
Hasilnya dicampur ke trek narator (narration_mix_cN.m4a), jadi renderer tidak perlu diubah:
musik latar tetap otomatis mengecil (ducking) di bawah suara + SFX.
"""
from pathlib import Path

from .. import config
from . import media

SR = 44100

# nama -> (sumber lavfi, filter lanjutan, durasi detik)
_DEFS = {
    # radio/TV rusak: noise pita sempit yang bergetar
    "static": ("anoisesrc=color=white:amplitude=0.5:duration=2.6:seed=3",
               "bandpass=f=1900:width_type=h:w=1500,tremolo=f=11:d=0.7,afade=t=in:d=0.08,afade=t=out:st=2.1:d=0.5", 2.6),
    # tiga ketukan pintu kayu
    "knock": ("aevalsrc='(0.9*sin(2*PI*95*t)+0.45*(random(0)*2-1))*exp(-30*mod(t\\,0.42))*lt(t\\,1.26)':s=44100:d=1.6",
              "lowpass=f=900,aecho=0.8:0.5:40:0.3", 1.6),
    # langkah kaki pelan
    "footsteps": ("aevalsrc='(0.55*(random(0)*2-1)+0.5*sin(2*PI*70*t))*exp(-38*mod(t\\,0.62))':s=44100:d=3.1",
                  "lowpass=f=700,afade=t=in:d=0.6,afade=t=out:st=2.4:d=0.7", 3.1),
    # detak jantung (lub-dub)
    "heartbeat": ("aevalsrc='0.95*sin(2*PI*52*t)*(exp(-24*mod(t\\,0.86))+0.75*exp(-24*mod(t-0.2\\,0.86))*gte(t\\,0.2))':s=44100:d=3.5",
                  "lowpass=f=160,volume=1.6,afade=t=out:st=2.8:d=0.7", 3.5),
    # angin malam
    "wind": ("anoisesrc=color=pink:amplitude=0.55:duration=4:seed=11",
             "bandpass=f=480:width_type=h:w=380,tremolo=f=0.35:d=0.75,afade=t=in:d=1,afade=t=out:st=2.8:d=1.2", 4.0),
    # tetesan air
    "drip": ("aevalsrc='0.55*sin(2*PI*(1700-900*mod(t\\,1.05))*t)*exp(-45*mod(t\\,1.05))':s=44100:d=3.2",
             "aecho=0.8:0.6:90:0.35", 3.2),
    # napas / bisikan di telinga
    "breath": ("anoisesrc=color=white:amplitude=0.35:duration=2.4:seed=23",
               "highpass=f=2200,lowpass=f=6500,tremolo=f=0.9:d=0.95,afade=t=in:d=0.5,afade=t=out:st=1.6:d=0.8", 2.4),
    # telepon berdering
    "phone": ("aevalsrc='0.22*(sin(2*PI*440*t)+sin(2*PI*480*t))*lt(mod(t\\,2.2)\\,1.0)':s=44100:d=3.2",
              "tremolo=f=20:d=0.6,afade=t=out:st=2.7:d=0.5", 3.2),
    # pintu berderit (sapuan nada kasar)
    "creak": ("aevalsrc='0.5*sin(2*PI*(180+140*sin(2*PI*0.6*t))*t)*(0.6+0.4*(random(0)*2-1))':s=44100:d=1.8",
              "bandpass=f=900:width_type=h:w=700,afade=t=in:d=0.2,afade=t=out:st=1.3:d=0.5", 1.8),
    # menjelang twist: naik makin keras
    "riser": ("aevalsrc='(0.5*(random(0)*2-1)+0.4*sin(2*PI*(70+260*t*t/6)*t))*pow(t/2.4\\,2.2)':s=44100:d=2.4",
              "highpass=f=60", 2.4),
    # hentakan saat twist
    "hit": ("aevalsrc='0.95*sin(2*PI*(42+70*exp(-9*t))*t)*exp(-2.4*t)+0.55*(random(0)*2-1)*exp(-14*t)':s=44100:d=2.6",
            "lowpass=f=2400,aecho=0.8:0.7:70|140:0.4|0.25", 2.6),
}

NAMES = [n for n in _DEFS if n not in ("riser", "hit")]
GAIN = {"static": 0.30, "knock": 0.75, "footsteps": 0.50, "heartbeat": 0.60, "wind": 0.60,
        "drip": 0.50, "breath": 0.45, "phone": 0.35, "creak": 0.55, "riser": 0.50, "hit": 0.90}


def _dir() -> Path:
    d = config.DATA_DIR / "assets" / "sfx"
    d.mkdir(parents=True, exist_ok=True)
    return d


def ensure(name: str) -> Path:
    out = _dir() / f"{name}.wav"
    if not out.exists():
        src, flt, _ = _DEFS[name]
        tmp = out.with_suffix(".part.wav")
        media.run(["ffmpeg", "-y", "-f", "lavfi", "-i", src, "-af", f"{flt},alimiter=limit=0.95",
                   "-ar", str(SR), "-ac", "1", str(tmp)])
        tmp.replace(out)
    return out


def duration(name: str) -> float:
    return _DEFS[name][2]


def mix(voice_path, cues: list[tuple[str, float]], out_path, total: float) -> None:
    """voice + daftar (nama sfx, waktu mulai detik) -> m4a sepanjang total detik."""
    cues = [(n, max(0.0, t)) for n, t in cues if n in _DEFS]
    inputs = ["-i", str(voice_path)]
    parts = ["[0:a]aresample=44100,apad[v]"]
    labels = ["[v]"]
    for k, (name, t) in enumerate(cues, 1):
        inputs += ["-i", str(ensure(name))]
        ms = int(t * 1000)
        parts.append(f"[{k}:a]volume={GAIN.get(name, 0.5)},adelay={ms}|{ms}[s{k}]")
        labels.append(f"[s{k}]")
    parts.append(f"{''.join(labels)}amix=inputs={len(labels)}:duration=first:normalize=0,"
                 f"atrim=0:{total:.3f},alimiter=limit=0.95[o]")
    media.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(parts), "-map", "[o]",
               "-c:a", "aac", "-b:a", "160k", str(out_path)])
