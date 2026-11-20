import threading
import time

from app import jobctx, jobs


def wait_until(cond, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return
        time.sleep(0.02)
    raise AssertionError("waktu habis")


def test_current_is_none_outside_job():
    assert jobctx.current() is None


def test_job_thread_sees_its_own_job():
    seen = {}
    j = jobs.start("tes", lambda job: seen.update(jobctx.current()))
    wait_until(lambda: j.status == "done")
    assert seen == {"id": j.id, "kind": "tes"}


def test_two_jobs_do_not_leak():
    gate = threading.Event()
    seen = {}

    def work(job, name):
        gate.wait(2)
        seen[name] = jobctx.current()

    a = jobs.start("satu", work, "a")
    b = jobs.start("dua", work, "b")
    gate.set()
    wait_until(lambda: a.status == "done" and b.status == "done")
    assert seen["a"] == {"id": a.id, "kind": "satu"}
    assert seen["b"] == {"id": b.id, "kind": "dua"}
    assert jobctx.current() is None  # thread utama tidak ikut terisi
