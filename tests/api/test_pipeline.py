"""Integration and access-control tests using real SQLite, Pillow, FFmpeg and FFprobe."""

import io
import json
import secrets
import subprocess
import sys
import time
from pathlib import Path
from threading import Event

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "services/api"))
from main import create_app


@pytest.fixture
def studio(tmp_path):
    app = create_app(tmp_path)
    token, other = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    for key in [token, other]:
        app.state.store.provision(key)
    with TestClient(app) as client:
        yield (
            client,
            {"Authorization": "Bearer " + token},
            {"Authorization": "Bearer " + other},
        )


def create(client, auth):
    resp = client.post("/v1/projects", json={"name": "İlk çekim"}, headers=auth)
    assert resp.status_code == 201, resp.text
    return "/v1/projects/" + resp.json()["id"]


def image_bytes():
    data = io.BytesIO()
    Image.new("RGB", (96, 64), (35, 180, 143)).save(data, "PNG")
    return data.getvalue()


def upload(client, auth, proj, data=None, typ="image/png"):
    r = client.post(
        proj + "/media",
        headers={**auth, "Content-Type": typ},
        content=data or image_bytes(),
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def request_job(client, auth, proj, asset, **extra):
    return client.post(
        proj + "/jobs",
        headers=auth,
        json={
            "kind": "edit",
            "media_id": asset,
            "duration_seconds": 1,
            "rights_confirmed": True,
            **extra,
        },
    )


def wait_output(client, auth, job):
    url = "/v1/jobs/" + job
    for _ in range(300):
        obj = client.get(url, headers=auth).json()
        if obj["status"] == "succeeded":
            return client.get(url + "/output", headers=auth)
        assert obj["status"] != "failed", obj
        time.sleep(0.05)
    raise AssertionError("Job timed out")


def test_auth_idor_and_account_erasure(studio):
    client, a, b = studio
    assert client.get("/v1/projects").status_code == 401
    proj = create(client, a)
    uid = upload(client, a, proj)
    other = create(client, b)
    assert client.get(proj, headers=b).status_code == 404
    assert client.get(proj + "/jobs", headers=b).status_code == 404
    assert client.delete(proj, headers=b).status_code == 404
    assert request_job(client, b, other, uid).status_code == 404
    assert [x["id"] for x in client.get("/v1/projects", headers=b).json()] == [
        other.rsplit("/", 1)[1]
    ]
    job = request_job(client, a, proj, uid).json()["id"]
    wait_output(client, a, job)
    for suffix in ["", "/output"]:
        assert client.get("/v1/jobs/" + job + suffix, headers=b).status_code == 404
    for action in ["cancel", "retry"]:
        assert (
            client.post("/v1/jobs/" + job + "/" + action, headers=b).status_code == 404
        )
    assert client.delete("/v1/account", headers=a).status_code == 204
    assert client.get("/v1/projects", headers=a).status_code == 401
    assert client.get(other, headers=b).status_code == 200
    assert not (client.app.state.store.files / proj.rsplit("/", 1)[1]).exists()


def test_mp4_round_trip_and_trim(studio, tmp_path):
    client, a, _ = studio
    proj = create(client, a)
    src = tmp_path / "moving.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=s=160x96:r=12",
            "-t",
            "2",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            str(src),
        ],
        check=True,
    )
    asset = upload(client, a, proj, src.read_bytes(), "video/mp4")
    assert request_job(client, a, proj, asset, start_seconds=2).status_code == 422
    enqueued = request_job(client, a, proj, asset, start_seconds=1, aspect_ratio="9:16")
    assert enqueued.status_code == 202, enqueued.text
    out = wait_output(client, a, enqueued.json()["id"])
    assert out.status_code == 200
    clip = tmp_path / "out.mp4"
    clip.write_bytes(out.content)
    facts = json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(clip)]
        )
    )["streams"][0]
    assert (facts["codec_name"], facts["width"], facts["height"]) == ("h264", 540, 960)
    assert abs(float(facts["duration"]) - 1) < 0.1
    frames = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(clip),
            "-vf",
            "scale=32:32",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "-",
        ]
    )
    assert len(frames) > 1024 and max(frames) - min(frames) > 100
    assert frames[:1024] != frames[-1024:]


def test_bounds_and_no_fake_generation(studio, monkeypatch):
    client, a, _ = studio
    proj = create(client, a)
    assert (
        client.post(
            proj + "/media", headers={**a, "Content-Type": "image/png"}, content=b"bad"
        ).status_code
        == 422
    )
    assert (
        client.post(
            proj + "/media", headers={**a, "Content-Type": "text/html"}, content=b"bad"
        ).status_code
        == 415
    )
    assert (
        client.post("/v1/projects", headers=a, json={"name": "x" * 20000}).status_code
        == 413
    )
    uid = upload(client, a, proj)
    assert request_job(client, a, proj, uid, rights_confirmed=False).status_code == 422
    assert request_job(client, a, proj, uid, volume=-1).status_code == 422
    monkeypatch.setenv(
        "STUDIO_COMFY_PORTABLE", str(client.app.state.store.root / "missing")
    )
    assert not client.get("/v1/capabilities", headers=a).json()["text_to_video"]
    res = request_job(client, a, proj, None, kind="text_to_video", prompt="Ocean waves")
    assert res.status_code == 503
    assert not client.get(proj + "/jobs", headers=a).json()


def test_transitions_and_rate_limit(tmp_path):
    app = create_app(tmp_path, launch_worker=False)
    key = secrets.token_urlsafe(32)
    app.state.store.provision(key)
    auth = {"Authorization": "Bearer " + key}
    with TestClient(app) as client:
        proj = create(client, auth)
        uid = upload(client, auth, proj)
        job = request_job(client, auth, proj, uid).json()["id"]
        assert (
            client.get("/v1/jobs/" + job + "/output", headers=auth).status_code == 409
        )
        assert (
            client.post("/v1/jobs/" + job + "/cancel", headers=auth).json()["status"]
            == "cancelled"
        )
        assert (
            client.post("/v1/jobs/" + job + "/retry", headers=auth).status_code == 409
        )
        for _ in range(40):
            res = client.post("/v1/projects", headers=auth, json={"name": "test"})
        assert res.status_code == 429


def test_cancelled_running_job_cannot_publish(studio, monkeypatch):
    import media

    client, auth, _ = studio
    started, finish, completed = Event(), Event(), Event()

    def delayed_edit(source, kind, spec, output, cancelled):
        started.set()
        assert finish.wait(5)
        output.write_bytes(b"late result")
        completed.set()

    monkeypatch.setattr(media, "edit", delayed_edit)
    proj = create(client, auth)
    asset = upload(client, auth, proj)
    job_id = request_job(client, auth, proj, asset).json()["id"]
    assert started.wait(5)
    assert (
        client.post("/v1/jobs/" + job_id + "/cancel", headers=auth).status_code == 200
    )
    finish.set()
    assert completed.wait(5)
    assert (
        client.get("/v1/jobs/" + job_id, headers=auth).json()["status"] == "cancelled"
    )
    assert client.get("/v1/jobs/" + job_id + "/output", headers=auth).status_code == 409


def test_transcription_job_is_private_and_downloads_srt(studio, monkeypatch, tmp_path):
    import queue_worker
    import transcribe

    model = tmp_path / "model.bin"
    model.write_bytes(b"fixture")
    monkeypatch.setenv("STUDIO_WHISPER_MODEL", str(model))

    def fake_transcribe(source, model_path, output, language, cancelled):
        output.write_text("1\n00:00:00,000 --> 00:00:01,000\nHello\n")

    monkeypatch.setattr(transcribe, "transcribe", fake_transcribe)
    client, auth, other = studio
    project = create(client, auth)
    source = tmp_path / "clip.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=64x64:rate=24",
            "-t",
            "1",
            "-c:v",
            "libx264",
            str(source),
        ],
        check=True,
    )
    asset = upload(client, auth, project, source.read_bytes(), "video/mp4")
    response = request_job(
        client, auth, project, asset, kind="transcribe", language="en"
    )
    assert response.status_code == 202
    job_id = response.json()["id"]
    assert client.get("/v1/jobs/" + job_id, headers=other).status_code == 404
    output = wait_output(client, auth, job_id)
    assert output.status_code == 200
    assert output.headers["content-type"].startswith("application/x-subrip")
    assert "Hello" in output.text
    assert queue_worker.whisper_model() == model


def test_retry_respects_active_job_limit(tmp_path):
    app = create_app(tmp_path, launch_worker=False)
    key = secrets.token_urlsafe(32)
    app.state.store.provision(key)
    auth = {"Authorization": "Bearer " + key}
    with TestClient(app) as client:
        proj = create(client, auth)
        uid = upload(client, auth, proj)
        failed = request_job(client, auth, proj, uid).json()["id"]
        with app.state.store.db(True) as db:
            db.execute("UPDATE jobs SET status='failed' WHERE id=?", (failed,))
        jobs = [request_job(client, auth, proj, uid).json()["id"] for _ in range(3)]
        assert (
            client.post("/v1/jobs/" + failed + "/retry", headers=auth).status_code
            == 429
        )
        assert (
            client.post("/v1/jobs/" + jobs[0] + "/cancel", headers=auth).status_code
            == 200
        )
        assert (
            client.post("/v1/jobs/" + failed + "/retry", headers=auth).status_code
            == 200
        )


def test_worker_recovery(tmp_path):
    app = create_app(tmp_path, launch_worker=False)
    key = secrets.token_urlsafe(32)
    app.state.store.provision(key)
    auth = {"Authorization": "Bearer " + key}
    with TestClient(app) as client:
        proj = create(client, auth)
        uid = upload(client, auth, proj)
        job = request_job(client, auth, proj, uid).json()["id"]
        with app.state.store.db(True) as db:
            db.execute("UPDATE jobs SET status='running' WHERE id=?", (job,))
    with TestClient(create_app(tmp_path)) as recovered:
        info = recovered.get("/v1/jobs/" + job, headers=auth).json()
        assert info["status"] == "failed"
        assert (
            recovered.post("/v1/jobs/" + job + "/retry", headers=auth).status_code
            == 200
        )
        assert wait_output(recovered, auth, job).status_code == 200


def test_browser_preflight_only_for_workstation_ui(studio):
    client, _, _ = studio
    headers = {
        "Origin": "http://127.0.0.1:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    }
    allowed = client.options("/v1/projects", headers=headers)
    assert allowed.status_code == 200
    assert allowed.headers["Access-Control-Allow-Origin"] == headers["Origin"]
    external = client.options(
        "/v1/projects", headers={**headers, "Origin": "https://unrelated.example"}
    )
    assert (
        external.status_code == 400
        and "Access-Control-Allow-Origin" not in external.headers
    )


def test_capability_requires_current_pass_for_each_mode(tmp_path, monkeypatch):
    import wan

    monkeypatch.setenv("STUDIO_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(wan, "signature", lambda: "current-build")
    folder = wan.proof_dir()
    folder.mkdir()
    assert not wan.verified("text_to_video")
    marker = folder / "text_to_video.json"
    marker.write_text('{"passed":true,"signature":"old-build"}')
    assert not wan.verified("text_to_video")
    marker.write_text('{"passed":true,"signature":"current-build"}')
    assert wan.verified("text_to_video")
    assert not wan.verified("image_to_video")
