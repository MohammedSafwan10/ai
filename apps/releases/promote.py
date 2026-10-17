"""Verify a complete uploaded release before atomically replacing the public pointer."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import uuid

VERSION = re.compile(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\Z")
PACKAGE = re.compile(r"Privora-(\d+\.\d+\.\d+)-full\.nupkg\Z")
FEED = "https://updates.nexdark.com/win32/x64/stable"

def digest(path, algorithm="sha256"):
    result = hashlib.new(algorithm)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()

def checked_file(folder, name):
    path = folder / name
    if path.is_symlink() or not path.is_file() or path.resolve().parent != folder.resolve():
        raise ValueError(f"Missing or unsafe release file: {name}")
    return path

def validate(folder):
    metadata = json.loads(checked_file(folder, "metadata.json").read_text())
    version = metadata.get("version", "")
    if not VERSION.fullmatch(version):
        raise ValueError("Invalid version")
    installer = checked_file(folder, "PrivoraSetup.exe")
    if metadata.get("sha256") != digest(installer) or metadata.get("size") != installer.stat().st_size:
        raise ValueError("Installer hash or size mismatch")
    # Squirrel manifests built on Windows may carry a UTF-8 BOM. Preserve the
    # public bytes while accepting that encoding during verification.
    manifest = checked_file(folder, "RELEASES").read_text(encoding="utf-8-sig").strip().splitlines()
    if not manifest or len(manifest) > 100:
        raise ValueError("Empty or excessive Squirrel manifest")
    packages = []
    for line in manifest:
        match = re.fullmatch(r"([a-fA-F0-9]{40}) (Privora-[0-9]+\.[0-9]+\.[0-9]+-full\.nupkg) ([0-9]+)", line.strip())
        if not match:
            raise ValueError("Invalid Squirrel manifest entry")
        checksum, filename, size = match.groups()
        package = checked_file(folder, filename)
        if package.stat().st_size != int(size) or digest(package, "sha1") != checksum.lower():
            raise ValueError(f"Package verification failed: {filename}")
        packages.append(package)
    if f"Privora-{version}-full.nupkg" not in [p.name for p in packages]:
        raise ValueError("Current version absent from Squirrel manifest")
    if metadata.get("files") != {"releases": f"{FEED}/RELEASES", "package": f"{FEED}/Privora-{version}-full.nupkg", "installer": f"{FEED}/PrivoraSetup-{version}.exe"}:
        raise ValueError("Unexpected public download URLs")
    return metadata, packages

@contextlib.contextmanager
def locked(root):
    import fcntl
    with (root / ".publish.lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield

def link_immutable(source, destination):
    if destination.exists():
        if destination.is_symlink() or digest(source) != digest(destination):
            raise ValueError(f"Immutable file already differs: {destination.name}")
    else:
        os.link(source, destination)

def point_current(root, target):
    pointer = root / f".current-{uuid.uuid4().hex}"
    pointer.symlink_to(target)
    os.replace(pointer, root / "current")

def promote(root, stage_name):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", stage_name):
        raise ValueError("Invalid staging identity")
    staging_root = root / "staging"
    folder = staging_root / stage_name
    if folder.is_symlink() or folder.resolve().parent != staging_root.resolve():
        raise ValueError("Unsafe staging directory")
    with locked(root):
        metadata, packages = validate(folder)
        version = metadata["version"]
        destination = root / "versions" / version
        if destination.exists():
            raise ValueError("Version already published; immutable releases cannot be overwritten")
        current = root / "current" / "metadata.json"
        if current.exists():
            previous = json.loads(current.read_text())["version"]
            if tuple(map(int, version.split("."))) <= tuple(map(int, previous.split("."))):
                raise ValueError("Version must be newer than the current release")
        for name in ("versions", "packages", "installers"):
            (root / name).mkdir(exist_ok=True)
        for package in packages:
            link_immutable(package, root / "packages" / package.name)
        link_immutable(folder / "PrivoraSetup.exe", root / "installers" / f"PrivoraSetup-{version}.exe")
        os.rename(folder, destination)
        point_current(root, f"versions/{version}")
        return metadata

def rollback(root, version):
    if not VERSION.fullmatch(version):
        raise ValueError("Invalid rollback version")
    with locked(root):
        folder = root / "versions" / version
        if folder.is_symlink():
            raise ValueError("Unsafe version directory")
        metadata, _ = validate(folder)
        point_current(root, f"versions/{version}")
        return metadata

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--promote")
    action.add_argument("--rollback")
    args = parser.parse_args()
    root = args.root.resolve()
    if not root.is_dir() or root == Path(root.anchor):
        raise ValueError("Use the existing dedicated release directory")
    metadata = promote(root, args.promote) if args.promote else rollback(root, args.rollback)
    print(json.dumps({"version": metadata["version"], "sha256": metadata["sha256"], "promoted": True}))

if __name__ == "__main__":
    main()
