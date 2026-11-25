import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

source = Path(__file__).resolve().parents[2] / "deploy/aeo/import-origin-crawl.py"
spec = importlib.util.spec_from_file_location("origin_crawl", source)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class OriginCollectorTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.spool = self.root / collector.SPOOL
        self.submissions = []

    def line(self, ts=1700000000, **extra):
        return json.dumps({"logger": collector.LOGGER, "ts": ts, "status": 200, "size": 17,
                           "path": "/robots.txt", "method": "GET", "ip": "192.0.2.7",
                           "ua": "AEO-Crawl-Canary/1.0", **extra}) + "\n"

    def submit(self, rows):
        self.submissions.append(rows)
        return {"accepted": len(rows), "rejected": 0, "inserted": len(rows)}

    def test_waits_for_complete_line_and_resumes_after_rotation(self):
        line = self.line()
        self.spool.write_text(line[:-1])
        state = collector.collect(self.root, {}, self.submit)
        self.assertFalse(self.submissions)
        self.spool.write_text(line)
        state = collector.collect(self.root, state, self.submit)
        self.assertEqual(len(self.submissions), 1)
        self.spool.rename(self.root / "aeo-crawler-access-2026-time.log")
        self.spool.write_text(self.line(ts=1700000001))
        state = collector.collect(self.root, state, self.submit)
        self.assertEqual(list(map(len, self.submissions)), [1, 1])
        self.assertEqual(state["rotationGaps"], 0)
        self.assertEqual(state["lastEventAt"], "2023-11-14T22:13:21.000Z")
        collector.collect(self.root, state, self.submit)
        self.assertEqual(len(self.submissions), 2)

    def test_failed_or_partial_import_does_not_acknowledge(self):
        self.spool.write_text(self.line())
        with self.assertRaisesRegex(ValueError, "did not acknowledge"):
            collector.collect(self.root, {}, lambda rows: {"accepted": 0, "rejected": 1})
        state = collector.collect(self.root, {}, self.submit)
        self.assertEqual(state["lastImport"]["inserted"], 1)

    def test_rejects_private_path_and_full_headers(self):
        self.spool.write_text(self.line(path="/api/session") + self.line(request={"headers": {}}))
        state = collector.collect(self.root, {}, self.submit)
        self.assertEqual(state["rejectedLines"], 2)
        self.assertFalse(self.submissions)

    def test_bounds_batch_and_marks_unread_rotation_loss(self):
        self.spool.write_text(self.line() * (collector.MAX_BATCH + 1))
        state = collector.collect(self.root, {}, self.submit)
        self.assertEqual(len(self.submissions[0]), collector.MAX_BATCH)
        self.spool.unlink()
        state = collector.collect(self.root, state, self.submit)
        self.assertEqual(state["rotationGaps"], 1)


if __name__ == "__main__":
    unittest.main()
