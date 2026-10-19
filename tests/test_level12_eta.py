from opennotebook_worker.main import _eta_seconds


def test_eta_scales_elapsed_time_by_completed_progress() -> None:
    assert _eta_seconds(started_at=100, progress=25, now=120) == 60


def test_eta_is_zero_for_unstarted_or_finished_jobs() -> None:
    assert _eta_seconds(started_at=100, progress=0, now=120) == 0
    assert _eta_seconds(started_at=100, progress=100, now=120) == 0
