import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import promote

class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "staging").mkdir()
    def tearDown(self):
        self.temp.cleanup()
    def bundle(self, version, name):
        folder = self.root / "staging" / name
        folder.mkdir()
        package = f"Privora-{version}-full.nupkg"
        (folder / package).write_bytes(b"test package " + version.encode())
        (folder / "PrivoraSetup.exe").write_bytes(b"test installer " + version.encode())
        (folder / "RELEASES").write_text(f"{promote.digest(folder / package, 'sha1')} {package} {(folder / package).stat().st_size}\n")
        metadata = {"version": version,"sha256": promote.digest(folder / "PrivoraSetup.exe"),"size": (folder / "PrivoraSetup.exe").stat().st_size,"files":{"releases":f"{promote.FEED}/RELEASES","package":f"{promote.FEED}/{package}","installer":f"{promote.FEED}/PrivoraSetup-{version}.exe"}}
        (folder / "metadata.json").write_text(json.dumps(metadata))
        return folder
    def test_publish_and_rollback_keep_old_packages(self):
        self.bundle("1.0.0", "first");promote.promote(self.root, "first")
        self.bundle("1.0.1", "second");promote.promote(self.root, "second")
        self.assertEqual(json.loads((self.root / "current/metadata.json").read_text())["version"], "1.0.1")
        self.assertTrue((self.root / "packages/Privora-1.0.0-full.nupkg").exists())
        promote.rollback(self.root, "1.0.0")
        self.assertEqual(json.loads((self.root / "current/metadata.json").read_text())["version"], "1.0.0")
    def test_corrupt_package_leaves_current_untouched(self):
        self.bundle("1.0.0", "good");promote.promote(self.root, "good")
        folder=self.bundle("1.0.1", "bad");(folder / "Privora-1.0.1-full.nupkg").write_bytes(b"corrupted")
        with self.assertRaises(ValueError):promote.promote(self.root, "bad")
        self.assertEqual((self.root / "current").readlink(), Path("versions/1.0.0"))
    def test_corrupt_installer_rejected(self):
        folder=self.bundle("1.0.0", "bad");(folder / "PrivoraSetup.exe").write_bytes(b"changed")
        with self.assertRaises(ValueError):promote.promote(self.root, "bad")
        self.assertFalse((self.root / "current").exists())
    def test_windows_manifest_bom_is_preserved(self):
        folder=self.bundle("1.0.0", "windows")
        original=b"\xef\xbb\xbf"+(folder / "RELEASES").read_bytes()
        (folder / "RELEASES").write_bytes(original)
        promote.promote(self.root,"windows")
        self.assertEqual((self.root / "current/RELEASES").read_bytes(),original)
    def test_duplicate_version_rejected(self):
        self.bundle("1.0.0", "first");promote.promote(self.root, "first");self.bundle("1.0.0", "again")
        with self.assertRaises(ValueError):promote.promote(self.root, "again")
    def test_older_version_rejected(self):
        self.bundle("2.0.0", "first");promote.promote(self.root, "first");self.bundle("1.0.0", "older")
        with self.assertRaises(ValueError):promote.promote(self.root, "older")
    def test_incomplete_upload_not_promoted(self):
        folder=self.bundle("1.0.0", "partial");(folder / "PrivoraSetup.exe").unlink()
        with self.assertRaises(ValueError):promote.promote(self.root, "partial")
    def test_paths_and_symlinks_rejected(self):
        with self.assertRaises(ValueError):promote.promote(self.root, "../outside")
        folder=self.bundle("1.0.0", "linked");(folder / "PrivoraSetup.exe").unlink();(folder / "PrivoraSetup.exe").symlink_to("/etc/passwd")
        with self.assertRaises(ValueError):promote.promote(self.root, "linked")
    def test_bad_manifest_not_promoted(self):
        folder=self.bundle("1.0.0", "invalid");(folder / "RELEASES").write_text("bad /etc/passwd 1")
        with self.assertRaises(ValueError):promote.promote(self.root, "invalid")

if __name__ == "__main__":unittest.main()
