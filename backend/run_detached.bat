@echo off
rem Backend tanpa jendela, lepas dari terminal/sesi yang menyalakannya (dipakai Claude via WMI).
cd /d %~dp0
set "PATH=C:\Users\andyp\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin;%PATH%"
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 > uvicorn_out.log 2> uvicorn_err.log
