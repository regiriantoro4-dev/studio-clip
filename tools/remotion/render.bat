@echo off
rem Render komposisi Remotion dengan beban CPU rendah:
rem   1) Remotion menggambar frame JPEG (concurrency 2, tanpa encode x264)
rem   2) ffmpeg sistem meng-encode pakai NVENC (GPU RTX)
rem Pakai: render.bat <IdKomposisi> [nama-output] [props.json]
rem Contoh: render.bat JudulHoror judul_demo
setlocal
cd /d %~dp0
set "COMP=%~1"
if "%COMP%"=="" set "COMP=JudulHoror"
set "NAME=%~2"
if "%NAME%"=="" set "NAME=%COMP%"
set "PROPS="
if not "%~3"=="" set "PROPS=--props=%~3"
set "PATH=C:\Users\andyp\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin;%PATH%"

if exist "out\frames_%NAME%" rmdir /s /q "out\frames_%NAME%"
call npx remotion render src/index.jsx %COMP% "out\frames_%NAME%" --sequence --image-format=jpeg --jpeg-quality=95 --concurrency=2 %PROPS%
if errorlevel 1 exit /b 1

ffmpeg -y -v error -framerate 30 -i "out\frames_%NAME%\element-%%03d.jpeg" -c:v h264_nvenc -preset p5 -cq 20 -pix_fmt yuv420p "out\%NAME%.mp4"
if errorlevel 1 exit /b 1
rmdir /s /q "out\frames_%NAME%"
echo Selesai: %CD%\out\%NAME%.mp4
