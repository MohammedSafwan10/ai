"""Run on Linux: python3 kali_runner_tests.py /absolute/path/to/runner.py."""
import base64
import concurrent.futures
import importlib.util
import os
from pathlib import Path
import signal
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

source = sys.argv.pop(1)
spec = importlib.util.spec_from_file_location("runner", source)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="privora-runner-test-")
        self.root, self.db = runner.initialize(Path(self.temp.name))

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def submit(self, code, key="one", timeout=10):
        return runner.submit(self.root, self.db, {
            "idempotencyKey": key, "projectId": "test",
            "argv": [sys.executable, "-c", code], "timeoutSeconds": timeout,
        })

    def wait(self, job):
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            value = runner.public_job(runner.get_job(self.db, job["id"]))
            if value["state"] in runner.TERMINAL:
                return value
            time.sleep(0.02)
        self.fail("Job did not finish")

    def output(self, job):
        result = b""
        cursor = 0
        while True:
            page = runner.dispatch(self.root, self.db, {
                "version": 1, "operation": "output", "jobId": job["id"], "afterSequence": cursor,
            })
            for event in page["events"]:
                self.assertEqual(event["sequence"], cursor + 1)
                cursor = event["sequence"]
                result += base64.b64decode(event["data"])
            if not page["hasMore"]:
                return result

    def test_unicode_and_separate_stderr(self):
        job = self.submit("import sys,time; b='€ 😀 漢字'.encode(); "
                          "[(sys.stdout.buffer.write(bytes([n])),sys.stdout.flush(),time.sleep(.01)) for n in b]; "
                          "sys.stderr.write('stderr')")
        self.assertEqual(self.wait(job)["state"], "succeeded")
        self.assertEqual(self.output(job).decode(), "€ 😀 漢字stderr")
        streams = {row[0] for row in self.db.execute("SELECT stream FROM output")}
        self.assertEqual(streams, {"stdout", "stderr"})

    def test_concurrent_duplicate_submission_runs_once(self):
        request = {"idempotencyKey": "same", "projectId": "test",
                   "argv": [sys.executable, "-c", "open('count.txt','a').write('one\\n')"]}
        def submit_once(_):
            root, db = runner.initialize(self.root)
            try:
                return runner.submit(root, db, request)
            finally:
                db.close()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            jobs = list(pool.map(submit_once, range(2)))
        self.assertEqual(jobs[0]["id"], jobs[1]["id"])
        self.wait(jobs[0])
        self.assertEqual((self.root / "workspaces/test/count.txt").read_text(), "one\n")

    def test_conflicting_idempotency_key(self):
        self.wait(self.submit("print('first')"))
        with self.assertRaisesRegex(ValueError, "different request"):
            self.submit("print('second')")

    def test_cancel_before_worker_launch_does_not_execute(self):
        request = {"idempotencyKey": "queued", "projectId": "test",
                   "argv": [sys.executable, "-c", "open('must-not-exist','w').write('bad')"]}
        with patch.object(runner.os, "posix_spawn", return_value=os.getpid()):
            job = runner.submit(self.root, self.db, request)
        self.db.execute("UPDATE jobs SET state='stop_requested' WHERE id=?", (job["id"],))
        self.db.commit()
        runner.worker(self.root, self.db, job["id"])
        self.assertEqual(runner.public_job(runner.get_job(self.db, job["id"]))["state"], "cancelled")
        self.assertFalse((self.root / "workspaces/test/must-not-exist").exists())

    def test_cancel_kills_term_ignoring_child(self):
        child = "import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(60)"
        code = "import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c'," + repr(child) + \
               "]);open('child.pid','w').write(str(p.pid));time.sleep(60)"
        job = self.submit(code)
        pid_file = self.root / "workspaces/test/child.pid"
        deadline = time.monotonic() + 4
        while not pid_file.exists() and time.monotonic() < deadline:
            time.sleep(.02)
        self.assertTrue(pid_file.exists())
        pid = int(pid_file.read_text())
        runner.dispatch(self.root, self.db, {"version": 1, "operation": "cancel", "jobId": job["id"]})
        self.assertEqual(self.wait(job)["state"], "cancelled")
        self.assertIsNone(runner.identity(pid))

    def test_timeout(self):
        self.assertEqual(self.wait(self.submit("import time;time.sleep(60)", timeout=1))["state"], "timed_out")

    def test_output_storage_is_bounded(self):
        job = self.submit("import sys;sys.stdout.buffer.write(b'x' * (9 * 1024 * 1024))")
        result = self.wait(job)
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(result["outputBytes"], runner.OUTPUT_LIMIT)
        self.assertEqual(result["omittedBytes"], 1024 * 1024)
        self.assertEqual(len(self.output(job)), runner.OUTPUT_LIMIT)

    def test_process_failure(self):
        self.assertEqual(self.wait(self.submit("raise SystemExit(7)"))["exitCode"], 7)
        job = runner.submit(self.root, self.db, {
            "idempotencyKey": "missing", "projectId": "test", "argv": ["privora-nonexistent-executable"],
        })
        self.assertEqual(self.wait(job)["state"], "failed")

    def test_artifact_bounds_and_symlinks(self):
        job = self.submit("from pathlib import Path;Path('result.txt').write_text('€ 😀 漢字')")
        self.wait(job)
        request = {"version": 1, "operation": "artifact", "jobId": job["id"], "path": "result.txt"}
        value = runner.dispatch(self.root, self.db, request)
        self.assertEqual(base64.b64decode(value["data"]).decode(), "€ 😀 漢字")
        folder = self.root / "workspaces/test"
        (folder / "escape").symlink_to(self.root)
        (folder / "large").write_bytes(b"x" * (runner.ARTIFACT_LIMIT + 1))
        os.mkfifo(folder / "pipe")
        for relative in ["../outside", "/etc/passwd", "escape/.privora/jobs.sqlite3", "large", "pipe"]:
            with self.subTest(relative=relative), self.assertRaises((ValueError, OSError)):
                runner.dispatch(self.root, self.db, {**request, "path": relative})

    def test_protocol_and_project_boundary(self):
        with self.assertRaises(ValueError):
            runner.dispatch(self.root, self.db, {"version": 9, "operation": "capabilities"})
        for project in ["../outside", ".privora", "a/b"]:
            with self.assertRaises(ValueError):
                runner.project_directory(self.root, project)
        folder = runner.project_directory(self.root, "test")
        (folder / "escape").symlink_to(self.root)
        with self.assertRaises(ValueError):
            runner.submit(self.root, self.db, {"idempotencyKey": "bad", "projectId": "test",
                                             "argv": ["echo"], "cwd": "escape"})

    def test_crashed_worker_is_unknown_not_finished(self):
        job = self.submit("import os,time;open('pid','w').write(str(os.getpid()));time.sleep(60)")
        pid_file = self.root / "workspaces/test/pid"
        deadline = time.monotonic() + 4
        while not pid_file.exists() and time.monotonic() < deadline:
            time.sleep(.02)
        self.assertTrue(pid_file.exists())
        row = runner.get_job(self.db, job["id"])
        os.kill(row["worker_pid"], signal.SIGKILL)
        deadline = time.monotonic() + 2
        while runner.identity(row["worker_pid"]) and time.monotonic() < deadline:
            time.sleep(.02)
        try:
            self.assertEqual(runner.public_job(runner.get_job(self.db, job["id"]))["state"], "unknown")
        finally:
            os.killpg(int(pid_file.read_text()), signal.SIGKILL)


if __name__ == "__main__":
    unittest.main()
