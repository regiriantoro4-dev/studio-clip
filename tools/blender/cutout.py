"""Hapus latar gambar sosok -> PNG transparan (rembg, model isnet-general-use), dipotong rapat ke sosoknya.
Jalankan dengan venv D:\\OmniVoice: python cutout.py <masuk.png> <keluar.png>
"""
import sys

from PIL import Image
from rembg import new_session, remove

src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")
cut = remove(img, session=new_session("isnet-general-use"), alpha_matting=True,
             alpha_matting_foreground_threshold=240, alpha_matting_background_threshold=15)
bbox = cut.getchannel("A").point(lambda a: 255 if a > 20 else 0).getbbox()
if bbox:
    pad = 6
    bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(cut.width, bbox[2] + pad), min(cut.height, bbox[3] + pad))
    cut = cut.crop(bbox)
cut.save(dst)
print("ok", cut.size)
