"""Job manager sederhana — proses berjalan di background thread, progres bisa dipolling."""
import threading
import time
import traceback
import uuid


class Job:
    def __init__(self, kind: str):
        self.id = uuid.uuid4().hex[:12]
        self.kind = kind
        self.status = "running"  # running | done | error
        self.stage = ""
        self.progress = 0.0
        self.result = None
        self.error = ""
        self.started = time.time()

    def set(self, stage: str | None = None, progress: float | None = None):
        if stage is not None:
            self.stage = stage
        if progress is not None:
            self.progress = max(0.0, min(1.0, float(progress)))

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 4),
            "result": self.result,
            "error": self.error,
        }


JOBS: dict[str, Job] = {}


def start(kind: str, fn, *args, **kwargs) -> Job:
    job = Job(kind)
    JOBS[job.id] = job

    def run():
        from . import jobctx
        jobctx.bind(job.id, job.kind)  # telemetri: panggilan di thread ini milik job ini
        try:
            job.result = fn(job, *args, **kwargs)
            job.progress = 1.0
            job.status = "done"
        except Exception as e:  # noqa: BLE001
            job.status = "error"
            job.error = str(e)
            traceback.print_exc()
        finally:
            _log(job, args)

    threading.Thread(target=run, daemon=True).start()
    return job


def _log(job, args):
    """Catat job selesai/gagal ke telemetri Command Center (tidak pernah mengganggu job)."""
    try:
        from .services import telemetry
        if job.kind in telemetry.SKIP_JOBS:
            return
        telemetry.record("job:" + job.kind, job.stage or job.kind, job.status, job.started,
                         error=job.error, ref=telemetry._ref_of(args), job=job.id)
    except Exception:  # noqa: BLE001
        pass


def get(job_id: str) -> Job | None:
    return JOBS.get(job_id)
