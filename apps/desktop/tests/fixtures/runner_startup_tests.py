"""Portable SQLite handoff tests; no remote connection or real command execution."""
import concurrent.futures
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runner", Path(__file__).parents[2] / "resources/kali/runner.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class StartupTests(unittest.TestCase):
    def seed(self, db, folder, state="queued"):
        job_id = "ab000000-0000-4000-8000-000000000001"
        db.execute("INSERT INTO jobs (id,request_key,request_hash,project,cwd,argv,timeout,created_at,state) VALUES (?,?,?,?,?,?,?,?,?)",
                   (job_id, "fixture", "fixture", "test", folder, json.dumps(["never-executed"]), 10, time.time(), state))
        return job_id

    def test_two_workers_claim_once(self):
        with tempfile.TemporaryDirectory() as folder:
            root, db = runner.initialize(Path(folder))
            job_id = self.seed(db, folder)
            db.commit()
            def child():
                connection = sqlite3.connect(root / ".privora/jobs.sqlite3", timeout=2)
                connection.row_factory = sqlite3.Row
                try:
                    runner.worker(root, connection, job_id)
                finally:
                    connection.close()
            try:
                with patch.object(runner, "identity", return_value="fixture"), patch.object(runner.subprocess, "Popen", side_effect=OSError("fixture launch blocked")) as launch:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                        list(pool.map(lambda _: child(), range(2)))
                    launch.assert_called_once()
            finally:
                db.close()

    def test_cancel_before_claim_and_terminal_reentry_never_launch(self):
        with tempfile.TemporaryDirectory() as folder:
            root, db = runner.initialize(Path(folder))
            job_id = self.seed(db, folder, "stop_requested")
            db.commit()
            try:
                with patch.object(runner.subprocess, "Popen") as launch:
                    runner.worker(root, db, job_id)
                    self.assertEqual(runner.get_job(db, job_id)["state"], "cancelled")
                    runner.worker(root, db, job_id)
                    launch.assert_not_called()
            finally:
                db.close()

    def test_worker_waits_for_submit_commit_before_reading_job(self):
        with tempfile.TemporaryDirectory() as folder:
            root, parent = runner.initialize(Path(folder))
            parent.execute("BEGIN IMMEDIATE")
            job_id = self.seed(parent, folder)
            entered = threading.Event()

            def child():
                db = sqlite3.connect(root / ".privora/jobs.sqlite3", timeout=2)
                db.row_factory = sqlite3.Row
                try:
                    entered.set()
                    runner.worker(root, db, job_id)
                finally:
                    db.close()

            try:
                with patch.object(runner, "identity", return_value="fixture-process"), patch.object(runner.subprocess, "Popen", side_effect=OSError("fixture launch blocked")) as launch:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                        future = pool.submit(child)
                        self.assertTrue(entered.wait(1))
                        time.sleep(.1)
                        # Before the fix the SELECT immediately raised Job not found.
                        waiting = not future.done()
                        parent.commit()
                        future.result(timeout=3)
                    self.assertTrue(waiting, "worker did not wait for submission transaction")
                    launch.assert_called_once()
                    self.assertEqual(runner.get_job(parent, job_id)["error"], "fixture launch blocked")
            finally:
                parent.rollback()
                parent.close()


if __name__ == "__main__":
    unittest.main()
