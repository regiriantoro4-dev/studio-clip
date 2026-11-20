"""Salin daftar gaya teks, animasi, dan gaya bingkai dari frontend/src/studio/model.js ke
backend/app/services/acak_gaya_data.json (dipakai pengacak "Acak gaya" di backend).

Jalankan ulang setiap kali TEXT_STYLES / ANIMS / ANIM_INS / BORDER_STYLES di model.js berubah:
  backend/.venv/Scripts/python.exe tools/acak-gaya/sinkron_gaya.py
Butuh `node`.
"""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "frontend" / "src" / "studio" / "model.js"
OUT = ROOT / "backend" / "app" / "services" / "acak_gaya_data.json"

JS = f"""
import(process.argv[1]).then((m) => {{
  const out = {{
    styles: m.TEXT_STYLES.map((s) => ({{ id: s.id, name: s.name, group: s.group || (s.real ? 'real' : 'klasik'), fx: s.fx }})),
    anims: m.ANIMS.filter(([id]) => id),
    anim_ins: m.ANIM_INS.filter(([id]) => id),
    borders: m.BORDER_STYLES.map(([id, name]) => [id, name]),
    fx_none: m.TEXT_FX_NONE,
  }}
  process.stdout.write(JSON.stringify(out))
}})
"""


def main():
    url = MODEL.as_uri()
    res = subprocess.run(["node", "--input-type=module", "-e", JS, url], capture_output=True, text=True,
                         encoding="utf-8", check=True)
    data = json.loads(res.stdout)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{OUT.name}: {len(data['styles'])} gaya, {len(data['anims'])} gerakan, "
          f"{len(data['anim_ins'])} animasi muncul, {len(data['borders'])} gaya bingkai")


if __name__ == "__main__":
    main()
