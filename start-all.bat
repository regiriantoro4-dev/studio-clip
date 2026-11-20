@echo off
title Studio Clip Launcher
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [PERINGATAN] ffmpeg tidak ditemukan di PATH.
  echo Install dulu:  winget install Gyan.FFmpeg
  echo Lalu tutup dan buka ulang terminal ini.
  echo.
)
start "Studio Clip Backend" cmd /k call "%~dp0backend\run.bat"
start "Studio Clip Frontend" cmd /k call "%~dp0frontend\run.bat"
echo.
echo Backend  : http://127.0.0.1:8000
echo Frontend : http://127.0.0.1:5173  ^(buka ini di browser^)
echo.
pause
