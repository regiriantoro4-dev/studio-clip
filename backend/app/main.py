"""AutoClipper API — jalankan: python -m uvicorn app.main:app --port 8000 (dari folder backend)."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .routers import bumper, clips, command, factory, horror_draft, projects, settings, studio, variasi
from .routers import flow_prompt as flow_prompt_router
from .routers import fonts as fonts_router  # juga mendaftarkan font tambahan ke border.FONTS
from .routers import text_styles as text_styles_router
from .routers import acak_gaya as acak_gaya_router
from .services import factory as factory_svc
from .services import telemetry

app = FastAPI(title="Studio Clip")

# Hanya UI AutoClipper sendiri (build di :8000, dev server Vite di :5173) yang boleh memanggil API.
LOCAL_ORIGINS = {f"http://{h}:{p}" for h in ("127.0.0.1", "localhost") for p in (8000, 5173)}
LOCAL_HOSTS = {f"{h}:{p}" for h in ("127.0.0.1", "localhost") for p in (8000, 5173)} | {"127.0.0.1", "localhost"}


@app.middleware("http")
async def local_only(request: Request, call_next):
    """Tolak request dari situs lain yang kebetulan dibuka di browser (CSRF / DNS rebinding).

    - Host harus localhost/127.0.0.1 (menangkal DNS rebinding).
    - Origin, kalau ada, harus UI AutoClipper sendiri.
    - Request lintas-situs (Sec-Fetch-Site: cross-site) ditolak, kecuali membuka halaman langsung
      (navigasi GET), mis. klik link ke 127.0.0.1:8000.
    Alat lokal tanpa header browser (curl, skrip) tetap boleh.
    """
    host = (request.headers.get("host") or "").lower()
    origin = request.headers.get("origin")
    site = request.headers.get("sec-fetch-site", "")
    navigate = request.method == "GET" and request.headers.get("sec-fetch-mode") == "navigate"
    if host not in LOCAL_HOSTS:
        return JSONResponse({"detail": "Host tidak diizinkan."}, status_code=403)
    if origin and origin not in LOCAL_ORIGINS:
        return JSONResponse({"detail": "Asal request tidak diizinkan."}, status_code=403)
    if site == "cross-site" and not navigate:
        return JSONResponse({"detail": "Request lintas situs ditolak."}, status_code=403)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(LOCAL_ORIGINS),
    allow_methods=["*"],
    allow_headers=["*"],
)

config.ensure_dirs()

app.include_router(projects.router)
app.include_router(clips.router)
app.include_router(settings.router)
app.include_router(studio.router)
app.include_router(command.router)
app.include_router(bumper.router)
app.include_router(factory.router)
app.include_router(variasi.router)
app.include_router(horror_draft.router)
app.include_router(flow_prompt_router.router)
app.include_router(fonts_router.router)
app.include_router(text_styles_router.router)
app.include_router(acak_gaya_router.router)


@app.on_event("startup")
def _resume_factory():
    # Pabrik konten: lanjutkan antrean yang belum selesai (gagal di sini tidak boleh mencegah server hidup)
    try:
        factory_svc.resume_on_boot()
    except Exception:  # noqa: BLE001
        pass

# pencatat kinerja agent (Command Center) + isi awal dari riwayat export
telemetry.install()
telemetry.backfill_if_empty()

# File media disajikan HANYA dari subfolder yang memang berisi media. data/settings.json (API key),
# telemetry, dan riwayat tidak ikut tersaji.
for _sub in ("projects", "assets", "studio", "bumpers"):
    (config.DATA_DIR / _sub).mkdir(parents=True, exist_ok=True)
    app.mount(f"/media/{_sub}", StaticFiles(directory=str(config.DATA_DIR / _sub)), name=f"media-{_sub}")


@app.get("/media/{rest:path}")
def media_blocked(rest: str):
    return JSONResponse({"detail": "Tidak ditemukan."}, status_code=404)

# Kalau frontend sudah di-build (npm run build), sajikan langsung dari sini
DIST = config.BASE_DIR.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST / "assets")), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        root = DIST.resolve()
        try:
            target = (DIST / path).resolve()
        except (OSError, ValueError):
            target = root
        # hanya file DI DALAM dist (tolak ../, path absolut C:/..., backslash)
        if path and target.is_relative_to(root) and target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(DIST / "index.html"))
else:

    @app.get("/")
    def root():
        return {
            "app": "Studio Clip API",
            "hint": "Frontend belum di-build. Jalankan dev server: cd frontend && npm run dev",
        }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
