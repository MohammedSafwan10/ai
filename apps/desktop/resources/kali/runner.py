#!/usr/bin/env python3
"""Privora SSH job runner. No network listener, third-party packages, or sudo."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import selectors
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import time
import uuid

VERSION = 1
OUTPUT_LIMIT = 8 * 1024 * 1024
ARTIFACT_LIMIT = 1024 * 1024
TERMINAL = {"succeeded", "failed", "cancelled", "timed_out"}
ACTIVE = {"queued", "running", "stop_requested"}


def identity(pid):
    """Include boot and process-start identity; never trust a recycled PID."""
    try:
        value = Path(f"/proc/{pid}/stat").read_text()
        fields = value[value.rindex(")") + 2:].split()
        if fields[0] == "Z":
            return None
        boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        return boot + ":" + fields[19]
    except (OSError, ValueError, IndexError):
        return None


def initialize(root):
    if not root.is_absolute() or root.is_symlink():
        raise ValueError("Job root must be an absolute real directory")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root = root.resolve(strict=True)
    state = root / ".privora"
    if state.is_symlink():
        raise ValueError("Runner state directory cannot be a symlink")
    state.mkdir(mode=0o700, exist_ok=True)
    os.chmod(state, 0o700)
    database = state / "jobs.sqlite3"
    if database.is_symlink():
        raise ValueError("Runner database cannot be a symlink")
    db = sqlite3.connect(database, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, request_key TEXT UNIQUE NOT NULL,
            request_hash TEXT NOT NULL, project TEXT NOT NULL, cwd TEXT NOT NULL,
            argv TEXT NOT NULL, timeout REAL NOT NULL, created_at REAL NOT NULL,
            state TEXT NOT NULL, exit_code INTEGER, error TEXT,
            worker_pid INTEGER, worker_identity TEXT,
            output_bytes INTEGER NOT NULL DEFAULT 0,
            omitted_bytes INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS output (
            job_id TEXT NOT NULL, sequence INTEGER NOT NULL,
            stream TEXT NOT NULL, data BLOB NOT NULL,
            PRIMARY KEY (job_id, sequence)
        );
    """)
    os.chmod(database, 0o600)
    return root, db


def get_job(db, job_id):
    if not isinstance(job_id, str) or not re.fullmatch(r"[a-f0-9-]{36}", job_id):
        raise ValueError("Invalid job ID")
    job = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job is None:
        raise ValueError("Job not found")
    return job


def public_job(job):
    state = job["state"]
    if state in ACTIVE and job["worker_pid"]:
        if not job["worker_identity"] or identity(job["worker_pid"]) != job["worker_identity"]:
            state = "unknown"
    return {
        "id": job["id"], "projectId": job["project"], "state": state,
        "exitCode": job["exit_code"], "error": job["error"],
        "createdAt": job["created_at"], "outputBytes": job["output_bytes"],
        "omittedBytes": job["omitted_bytes"],
    }


def project_directory(root, project):
    if not isinstance(project, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", project):
        raise ValueError("Invalid project ID")
    base = root / "workspaces"
    if base.is_symlink():
        raise ValueError("Workspace directory cannot be a symlink")
    base.mkdir(mode=0o700, exist_ok=True)
    folder = base / project
    if folder.is_symlink():
        raise ValueError("Project directory cannot be a symlink")
    folder.mkdir(mode=0o700, exist_ok=True)
    return folder


def submit(root, db, request):
    key = request.get("idempotencyKey")
    argv = request.get("argv")
    timeout = request.get("timeoutSeconds", 120)
    cwd = request.get("cwd", ".")
    if not isinstance(key, str) or not 1 <= len(key) <= 128:
        raise ValueError("Idempotency key must contain 1-128 characters")
    if not isinstance(argv, list) or not 1 <= len(argv) <= 256:
        raise ValueError("Expected a non-empty argv array")
    if any(not isinstance(arg, str) or "\0" in arg for arg in argv) or not argv[0]:
        raise ValueError("Invalid argv")
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)) or not 1 <= timeout <= 3600:
        raise ValueError("Timeout must be between 1 and 3600 seconds")
    if not isinstance(cwd, str) or Path(cwd).is_absolute() or ".." in Path(cwd).parts:
        raise ValueError("cwd must be relative to the project")
    project = request.get("projectId")
    folder = project_directory(root, project)
    directory = (folder / cwd).resolve(strict=True)
    if not directory.is_relative_to(folder) or not directory.is_dir():
        raise ValueError("cwd is outside the project or is not a directory")
    specification = {"argv": argv, "cwd": str(directory), "project": project, "timeout": timeout}
    digest = hashlib.sha256(json.dumps(specification, sort_keys=True).encode()).hexdigest()
    db.execute("BEGIN IMMEDIATE")
    try:
        previous = db.execute("SELECT * FROM jobs WHERE request_key = ?", (key,)).fetchone()
        if previous:
            if previous["request_hash"] != digest:
                raise ValueError("Idempotency key already belongs to a different request")
            db.commit()
            return public_job(previous)
        active = db.execute("SELECT COUNT(*) FROM jobs WHERE state IN ('queued','running','stop_requested')").fetchone()[0]
        if active >= 4:
            raise ValueError("Maximum concurrent jobs reached")
        job_id = str(uuid.uuid4())
        db.execute(
            "INSERT INTO jobs (id,request_key,request_hash,project,cwd,argv,timeout,created_at,state) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (job_id, key, digest, project, str(directory), json.dumps(argv), timeout, time.time(), "queued"),
        )
        # The worker waits on this transaction; recording its identity and the
        # job together prevents a second submit from starting another process.
        worker_pid = os.posix_spawn(
            sys.executable,
            [sys.executable, "-I", str(Path(__file__).resolve()), "--root", str(root), "--worker", job_id],
            os.environ,
            file_actions=[
                (os.POSIX_SPAWN_OPEN, 0, os.devnull, os.O_RDONLY, 0o600),
                (os.POSIX_SPAWN_OPEN, 1, os.devnull, os.O_WRONLY, 0o600),
                (os.POSIX_SPAWN_OPEN, 2, os.devnull, os.O_WRONLY, 0o600),
            ],
            setsid=True,
        )
        db.execute("UPDATE jobs SET worker_pid=?, worker_identity=? WHERE id=?",
                   (worker_pid, identity(worker_pid), job_id))
        db.commit()
        return public_job(get_job(db, job_id))
    except BaseException:
        db.rollback()
        raise


def kill_group(process, sig):
    try:
        os.killpg(process.pid, sig)
    except ProcessLookupError:
        pass


def worker(root, db, job_id):
    job = get_job(db, job_id)
    if job["state"] == "stop_requested":
        db.execute("UPDATE jobs SET state='cancelled' WHERE id=?", (job_id,))
        db.commit()
        return
    db.execute("UPDATE jobs SET state=CASE WHEN state='stop_requested' THEN state ELSE 'running' END,"
               "worker_pid=?,worker_identity=? WHERE id=?",
               (os.getpid(), identity(os.getpid()), job_id))
    db.commit()
    if get_job(db, job_id)["state"] == "stop_requested":
        db.execute("UPDATE jobs SET state='cancelled' WHERE id=?", (job_id,))
        db.commit()
        return
    process = None
    selector = selectors.DefaultSelector()
    outcome = None
    stopping_at = None
    started = time.monotonic()
    sequence = 0
    try:
        environment = os.environ.copy()
        environment.update({"PYTHONUNBUFFERED": "1", "LC_ALL": "C.UTF-8"})
        process = subprocess.Popen(json.loads(job["argv"]), cwd=job["cwd"], env=environment,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, start_new_session=True)
        for stream, name in [(process.stdout, "stdout"), (process.stderr, "stderr")]:
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, selectors.EVENT_READ, name)
        while selector.get_map() or process.poll() is None:
            current = get_job(db, job_id)
            now = time.monotonic()
            if stopping_at is None:
                if current["state"] == "stop_requested":
                    outcome = "cancelled"
                elif now - started >= job["timeout"]:
                    outcome = "timed_out"
                if outcome or process.poll() is not None:
                    stopping_at = now
                    kill_group(process, signal.SIGTERM)
            elif now - stopping_at >= 0.5:
                # Kill remaining children even when the immediate process exited.
                kill_group(process, signal.SIGKILL)
            for key, _ in selector.select(0.05):
                data = os.read(key.fileobj.fileno(), 8192)
                if not data:
                    selector.unregister(key.fileobj)
                    key.fileobj.close()
                    continue
                retained = max(0, min(len(data), OUTPUT_LIMIT - current["output_bytes"]))
                if retained:
                    sequence += 1
                    db.execute("INSERT INTO output VALUES (?,?,?,?)",
                               (job_id, sequence, key.data, data[:retained]))
                db.execute("UPDATE jobs SET output_bytes=output_bytes+?, omitted_bytes=omitted_bytes+? WHERE id=?",
                           (retained, len(data) - retained, job_id))
                db.commit()
                current = get_job(db, job_id)
            if stopping_at is not None and now - stopping_at > 3:
                # Escaped descendants can retain pipes. Bound teardown and never
                # describe this runner as a per-job OS sandbox.
                break
        process.wait(timeout=2)
        kill_group(process, signal.SIGKILL)
        outcome = outcome or ("succeeded" if process.returncode == 0 else "failed")
        db.execute("UPDATE jobs SET state=?,exit_code=? WHERE id=?",
                   (outcome, process.returncode, job_id))
        db.commit()
    except Exception as error:
        if process is not None:
            kill_group(process, signal.SIGKILL)
            process.wait(timeout=2)
        db.execute("UPDATE jobs SET state='failed',error=? WHERE id=?", (str(error)[:1000], job_id))
        db.commit()
    finally:
        selector.close()
        if process is not None:
            for stream in [process.stdout, process.stderr]:
                if stream is not None:
                    stream.close()


def artifact(root, db, request):
    job = get_job(db, request.get("jobId"))
    folder = project_directory(root, job["project"])
    relative = request.get("path")
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ValueError("Artifact must be a relative path")
    parts = Path(relative).parts
    if ".." in parts or not parts:
        raise ValueError("Artifact path traversal is not allowed")
    # Walk descriptors rather than resolve-then-open: reject symlinks and avoid
    # following a swapped intermediate directory outside the project.
    fd = os.open(folder, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for index, part in enumerate(parts):
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
            if index < len(parts) - 1:
                flags |= os.O_DIRECTORY
            next_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        metadata = os.fstat(fd)
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > ARTIFACT_LIMIT:
            raise ValueError("Artifact must be a regular file of at most 1 MiB")
        with os.fdopen(os.dup(fd), "rb") as stream:
            data = stream.read(ARTIFACT_LIMIT + 1)
        if len(data) > ARTIFACT_LIMIT:
            raise ValueError("Artifact exceeds the transfer limit")
        return {"path": relative, "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "data": base64.b64encode(data).decode("ascii")}
    finally:
        os.close(fd)


def dispatch(root, db, request):
    if request.get("version") != VERSION:
        raise ValueError("Unsupported runner protocol version")
    operation = request.get("operation")
    if operation == "capabilities":
        tools = request.get("tools", [])
        if not isinstance(tools, list) or len(tools) > 64 or any(
                not isinstance(tool, str) or not re.fullmatch(r"[a-zA-Z0-9_.+-]{1,64}", tool) for tool in tools):
            raise ValueError("Invalid tool inventory")
        return {"protocolVersion": VERSION, "os": platform.system(), "architecture": platform.machine(),
                "pythonVersion": platform.python_version(), "jobRoot": str(root),
                "tools": {tool: shutil.which(tool) for tool in tools},
                "limits": {"concurrentJobs": 4, "outputBytes": OUTPUT_LIMIT, "artifactBytes": ARTIFACT_LIMIT}}
    if operation == "submit":
        return submit(root, db, request)
    if operation == "lookup":
        key = request.get("idempotencyKey")
        if not isinstance(key, str) or not 1 <= len(key) <= 128:
            raise ValueError("Invalid idempotency key")
        job = db.execute("SELECT * FROM jobs WHERE request_key=?", (key,)).fetchone()
        return public_job(job) if job else None
    job = get_job(db, request.get("jobId"))
    if operation == "inspect":
        return public_job(job)
    if operation == "cancel":
        db.execute("UPDATE jobs SET state='stop_requested' WHERE id=? AND state IN ('queued','running')",
                   (job["id"],))
        db.commit()
        return public_job(get_job(db, job["id"]))
    if operation == "output":
        after = request.get("afterSequence", 0)
        if isinstance(after, bool) or not isinstance(after, int) or after < 0:
            raise ValueError("Invalid output cursor")
        # Snapshot the metadata and page together: terminal state must not appear
        # before its final output is visible.
        db.execute("BEGIN")
        rows = db.execute("SELECT * FROM output WHERE job_id=? AND sequence>? ORDER BY sequence LIMIT 65",
                          (job["id"], after)).fetchall()
        job = get_job(db, job["id"])
        db.commit()
        events = [{"sequence": row["sequence"], "stream": row["stream"],
                   "data": base64.b64encode(row["data"]).decode("ascii")} for row in rows[:64]]
        return {"job": public_job(job), "events": events,
                "nextSequence": events[-1]["sequence"] if events else after, "hasMore": len(rows) > 64}
    if operation == "artifact":
        return artifact(root, db, request)
    raise ValueError("Unsupported operation")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--worker")
    args = parser.parse_args()
    os.umask(0o077)
    db = None
    try:
        root, db = initialize(Path(args.root))
        if args.worker:
            worker(root, db, args.worker)
            return
        line = sys.stdin.buffer.readline(128 * 1024 + 1)
        if len(line) > 128 * 1024:
            raise ValueError("Request exceeds 128 KiB")
        request = json.loads(line)
        if not isinstance(request, dict):
            raise ValueError("Request must be an object")
        result = dispatch(root, db, request)
        print(json.dumps({"version": VERSION, "ok": True, "result": result}))
    except Exception as error:
        if args.worker:
            raise
        print(json.dumps({"version": VERSION, "ok": False, "error": str(error)[:1000]}))
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    main()
