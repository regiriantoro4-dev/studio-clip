@echo off
setlocal
title Studio Clip - Setup perangkat baru
cd /d %~dp0
echo ============================================
echo  Studio Clip - setup sekali jalan (Windows)
echo  Pakai:  setup.bat          (wajib saja)
echo          setup.bat asr      (+ pemeriksa narasi, ~1 GB)
echo ============================================
echo.

set GAGAL=0
where python >nul 2>nul || (echo [X] Python belum ada.  winget install Python.Python.3.12 & set GAGAL=1)
where node   >nul 2>nul || (echo [X] Node.js belum ada. winget install OpenJS.NodeJS.LTS & set GAGAL=1)
where ffmpeg >nul 2>nul || (echo [X] ffmpeg belum ada.  winget install Gyan.FFmpeg & set GAGAL=1)
where git    >nul 2>nul || echo [!] git belum ada (opsional untuk menjalankan app). winget install Git.Git
if "%GAGAL%"=="1" (
  echo.
  echo Pasang yang bertanda [X], tutup lalu buka ulang terminal, kemudian jalankan setup.bat lagi.
  pause & exit /b 1
)

echo [1/4] Backend: venv + paket Python
if not exist backend\.venv python -m venv backend\.venv
call backend\.venv\Scripts\python.exe -m pip install -q --upgrade pip
call backend\.venv\Scripts\python.exe -m pip install -q -r backend\requirements.txt || (echo Gagal pip install backend & pause & exit /b 1)

echo [2/4] Frontend: npm install (termasuk three + playwright-core untuk render 3D)
pushd frontend
call npm install --no-audit --no-fund || (popd & echo Gagal npm install & pause & exit /b 1)
popd

echo [3/4] Folder data + pengaturan contoh
if not exist backend\data mkdir backend\data
if not exist backend\data\settings.json (
  copy /y backend\settings.example.json backend\data\settings.json >nul
  echo     settings.json dibuat dari contoh. API key KOSONG: isi lewat halaman Pengaturan,
  echo     atau salin settings.json asli dari flashdisk ke backend\data\.
) else (
  echo     settings.json sudah ada, tidak ditimpa.
)

if /i "%1"=="asr" (
  echo [4/4] Pemeriksa narasi: tools\animasi-3d\.venv-asr
  if not exist tools\animasi-3d\.venv-asr python -m venv tools\animasi-3d\.venv-asr
  call tools\animasi-3d\.venv-asr\Scripts\python.exe -m pip install -q -r tools\animasi-3d\requirements-asr.txt
) else (
  echo [4/4] Pemeriksa narasi dilewati. Jalankan "setup.bat asr" kalau perlu.
)

echo.
echo Selesai. Cek tambahan:
echo  - Render animasi 3D butuh Microsoft Edge (bawaan Windows).
echo  - Mode Horor gambar AI butuh ComfyUI; atur "comfy.start_bat" di backend\data\settings.json.
echo  - Jalankan app: start-all.bat  lalu buka http://127.0.0.1:5173
pause
