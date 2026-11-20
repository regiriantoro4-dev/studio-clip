"""Buat kandidat gambar kuntilanak seluruh badan (ComfyUI SDXL) untuk billboard di adegan Blender.
Jalankan dengan python backend: .venv/Scripts/python.exe tools/blender/gen_kunti.py <folder_out> [jumlah]
"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))
from app import config  # noqa: E402
from app.services import comfy  # noqa: E402

out = Path(sys.argv[1])
n = int(sys.argv[2]) if len(sys.argv) > 2 else 4
out.mkdir(parents=True, exist_ok=True)

PROMPT = (
    "full body photo of a kuntilanak, a pale Indonesian woman ghost standing perfectly still, "
    "(her face is completely hidden behind her very long straight jet-black hair:1.6), (head bowed down:1.3), "
    "hair hanging in front of her face down to her waist, long dirty white tattered dress reaching the floor, "
    "thin pale arms hanging limp at her sides, bare feet, centered, whole body visible from head to feet, "
    "plain flat dark grey studio background, dim eerie overhead light, cinematic horror, photorealistic, highly detailed"
)
NEGATIVE = (
    "(visible face:1.5), (eyes:1.4), forehead, smile, makeup, fashion, model pose, gore, blood, cropped, cut off feet, out of frame, multiple people, text, watermark, "
    "cartoon, anime, blonde hair, caucasian, busy background, furniture, lowres, blurry, deformed, extra limbs"
)

settings = config.load_settings()
comfy.ensure_running(settings, None)
ckpt = comfy.checkpoint(settings)
for i in range(n):
    seed = random.randint(1, 2 ** 31)
    img = comfy.txt2img(settings, PROMPT, NEGATIVE, seed, 768, 1344, ckpt=ckpt)
    p = out / f"kunti_{i + 1}_{seed}.png"
    img.save(p)
    print("ok", p.name, flush=True)
comfy.free(settings)
