import pytest

from app.services import telemetry


@pytest.fixture(autouse=True)
def isolate_telemetry(tmp_path, monkeypatch):
    """Semua tes menulis telemetri ke folder sementara — jangan pernah ke data/telemetry asli."""
    monkeypatch.setattr(telemetry, "_dir", lambda: tmp_path)
    yield tmp_path
