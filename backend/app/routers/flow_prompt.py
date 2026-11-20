"""Endpoint paket prompt Google Flow: tulis -> periksa/edit -> salin ke Flow. Hanya teks, tanpa produksi."""
from fastapi import APIRouter, Body, HTTPException

from ..services import flow_prompt, horror_draft

router = APIRouter(prefix="/api/flow")


def _need(p):
    if not p:
        raise HTTPException(404, detail="Paket Flow tidak ditemukan.")
    return flow_prompt.view(p)


@router.get("/options")
def options():
    return {
        "durasi": [{"id": k, "shots": v[0], "label": v[1]} for k, v in flow_prompt.DURASI.items()],
        "visual": list(flow_prompt.VISUAL),
        "audio": [{"id": k, "label": v} for k, v in flow_prompt.AUDIO.items()],
        "drafts": horror_draft.list_all(),  # naskah horor tersimpan yang bisa diubah jadi paket Flow
    }


@router.get("/packages")
def list_packages():
    return flow_prompt.list_all()


@router.post("/packages")
def create_package(body: dict = Body(...)):
    durasi = str(body.get("durasi") or "pendek")
    visual = str(body.get("visual") or "sinematik")
    audio = str(body.get("audio") or "suasana")
    pov = str(body.get("pov") or "kamu")
    if durasi not in flow_prompt.DURASI or visual not in flow_prompt.VISUAL or audio not in flow_prompt.AUDIO \
            or pov not in ("kamu", "aku"):
        raise HTTPException(400, detail="Pilihan durasi, gaya visual, audio, atau sudut pandang tidak dikenal.")
    base = None
    if body.get("draft_id"):
        d = horror_draft.get(str(body["draft_id"]))
        if not d:
            raise HTTPException(404, detail="Naskah horor sumber tidak ditemukan.")
        base = d["story"]
        pov = base.get("pov") if base.get("pov") in ("kamu", "aku") else pov
    try:
        p = flow_prompt.create(str(body.get("topic") or ""), pov, durasi, visual, audio,
                               str(body.get("llm_provider") or ""), base)
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))
    return flow_prompt.view(p)


@router.get("/packages/{pid}")
def get_package(pid: str):
    return _need(flow_prompt.get(pid))


@router.put("/packages/{pid}")
def save_package(pid: str, body: dict = Body(...)):
    try:
        p = flow_prompt.update(pid, body.get("pkg") or {}, str(body.get("visual") or ""), str(body.get("audio") or ""))
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    return _need(p)


@router.delete("/packages/{pid}")
def delete_package(pid: str):
    return {"ok": flow_prompt.delete(pid)}
