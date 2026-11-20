"""Job yang sedang berjalan di thread ini — supaya telemetri tahu panggilan layanan/LLM milik job mana.

jobs.start memanggil bind() di awal thread job; contextvar terisolasi per thread, jadi dua job paralel
tidak saling tertukar dan thread lain (mis. request UI) tetap melihat None.
"""
import contextvars

_JOB: contextvars.ContextVar = contextvars.ContextVar("autoclipper_job", default=None)


def bind(job_id: str, kind: str) -> None:
    _JOB.set({"id": job_id, "kind": kind})


def current() -> dict | None:
    v = _JOB.get()
    return dict(v) if v else None
