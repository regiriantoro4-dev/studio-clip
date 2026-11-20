#!/usr/bin/env bash
# Studio Clip - setup sekali jalan (Mac / Linux)
#   ./setup.sh        wajib saja
#   ./setup.sh asr    + pemeriksa narasi (~1 GB)
set -e
cd "$(dirname "$0")"

PY=$(command -v python3.12 || command -v python3 || true)
gagal=0
[ -z "$PY" ] && { echo "[X] Python 3 belum ada.  Mac: brew install python@3.12"; gagal=1; }
command -v node   >/dev/null || { echo "[X] Node.js belum ada. Mac: brew install node"; gagal=1; }
command -v ffmpeg >/dev/null || { echo "[X] ffmpeg belum ada.  Mac: brew install ffmpeg"; gagal=1; }
[ "$gagal" = 1 ] && { echo "Pasang yang bertanda [X], lalu jalankan ./setup.sh lagi."; exit 1; }

echo "[1/4] Backend: venv + paket Python"
[ -d backend/.venv ] || "$PY" -m venv backend/.venv
backend/.venv/bin/python -m pip install -q --upgrade pip
backend/.venv/bin/python -m pip install -q -r backend/requirements.txt

echo "[2/4] Frontend: npm install"
(cd frontend && npm install --no-audit --no-fund)

echo "[3/4] Folder data + pengaturan contoh"
mkdir -p backend/data
if [ ! -f backend/data/settings.json ]; then
  cp backend/settings.example.json backend/data/settings.json
  echo "    settings.json dibuat dari contoh. API key KOSONG: isi lewat halaman Pengaturan,"
  echo "    atau salin settings.json asli dari flashdisk ke backend/data/."
  echo "    Sesuaikan juga comfy.start_bat (alamat Windows tidak berlaku di sini)."
else
  echo "    settings.json sudah ada, tidak ditimpa."
fi

if [ "$1" = "asr" ]; then
  echo "[4/4] Pemeriksa narasi: tools/animasi-3d/.venv-asr"
  [ -d tools/animasi-3d/.venv-asr ] || "$PY" -m venv tools/animasi-3d/.venv-asr
  tools/animasi-3d/.venv-asr/bin/python -m pip install -q -r tools/animasi-3d/requirements-asr.txt
else
  echo "[4/4] Pemeriksa narasi dilewati. Jalankan './setup.sh asr' kalau perlu."
fi

cat <<'EOF'

Selesai. Catatan untuk Mac/Linux (lihat PINDAH-KE-MAC.md):
 - start-all.bat belum punya versi .sh. Sementara jalankan dua terminal:
     cd backend && .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
     cd frontend && npm run dev
 - Render animasi 3D memakai Edge (channel 'msedge' + ANGLE d3d11 di render.cjs);
   di Mac pasang Edge atau ubah ke Chrome.
 - Encoder NVENC otomatis jatuh ke libx264 (lebih lambat, tetap jalan).
EOF
