"""Command Center: kinerja tiap agent AutoClipper (metrics, task log, alert)."""
from fastapi import APIRouter, Query

from ..services import telemetry

router = APIRouter(prefix="/api/command-center")


@router.get("")
def overview(hours: float = Query(24, ge=0, le=24 * 90)):
    """hours=0 -> semua riwayat."""
    return telemetry.summarize(hours or None)
