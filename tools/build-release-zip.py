#!/usr/bin/env python3
"""Build the release asset casora.zip from a commit (not the working tree).

HACS (hacs.json "zip_release": true, "filename": "casora.zip") downloads this asset and extracts it
straight into custom_components/casora, so the files sit at the zip root (manifest.json, __init__.py,
panel/ ...), without a casora/ folder. Casora's own update entity prefers the same asset.

Deterministic: entries sorted, timestamps = commit time, fixed permissions, so the same commit always
gives the same bytes (sha256 printed).

    python3 tools/build-release-zip.py OUT.zip [--ref HEAD] [--version 26.10.60] [--max-mb 30]
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tarfile
import time
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "custom_components/casora/"
# Already compressed formats: storing them saves CPU on small hosts, the size barely changes.
STORED = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".woff", ".woff2", ".zip", ".gz", ".mp3", ".mp4"}


def _git(*args: str, text: bool = True):
    return subprocess.run(["git", "-C", ROOT, *args], check=True, capture_output=True, text=text).stdout


def build(out: str, ref: str) -> tuple[int, int, str]:
    commit = _git("rev-parse", "--verify", ref + "^{commit}").strip()
    stamp = int(_git("show", "-s", "--format=%ct", commit).strip())
    # Zip cannot store dates before 1980; use UTC so the result does not depend on the local zone.
    date_time = max(time.gmtime(stamp)[:6], (1980, 1, 1, 0, 0, 0))
    tar_bytes = _git("archive", "--format=tar", commit, SRC.rstrip("/"), text=False)
    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tf:
        for m in tf.getmembers():
            if not m.isfile() or not m.name.startswith(SRC):
                continue  # directories are implied; symlinks are not expected here
            rel = m.name[len(SRC):]
            if not rel or rel.startswith("/") or ".." in rel.split("/"):
                raise SystemExit(f"unerwarteter Pfad im Archiv: {m.name}")
            files[rel] = tf.extractfile(m).read()
    if "manifest.json" not in files:
        raise SystemExit(f"{commit[:8]}: {SRC}manifest.json fehlt")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp = out + ".tmp"
    with zipfile.ZipFile(tmp, "w") as zf:
        for rel in sorted(files):
            info = zipfile.ZipInfo(rel, date_time=date_time)
            info.external_attr = 0o644 << 16
            info.create_system = 3  # unix, so the permissions above apply
            ext = os.path.splitext(rel)[1].lower()
            info.compress_type = zipfile.ZIP_STORED if ext in STORED else zipfile.ZIP_DEFLATED
            zf.writestr(info, files[rel], compresslevel=9 if info.compress_type == zipfile.ZIP_DEFLATED else None)
    os.replace(tmp, out)
    data = open(out, "rb").read()
    return len(files), len(data), hashlib.sha256(data).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("out")
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--version", help="manifest.json in the zip must have this version")
    ap.add_argument("--max-mb", type=float, default=30.0, help="fail above this size (HACS: 60 s per download)")
    a = ap.parse_args()
    count, size, digest = build(a.out, a.ref)
    with zipfile.ZipFile(a.out) as zf:
        names = zf.namelist()
        bad = [n for n in names if n.startswith(("/", "casora/", "custom_components/")) or ".." in n.split("/")]
        if bad:
            print(f"✗ falscher Aufbau im Zip: {bad[:3]}", file=sys.stderr)
            return 1
        ver = json.loads(zf.read("manifest.json")).get("version")
    if a.version and ver != a.version:
        print(f"✗ manifest.json im Zip hat Version {ver}, nicht {a.version}", file=sys.stderr)
        return 1
    mb = size / 1e6
    if mb > a.max_mb:
        print(f"✗ {a.out}: {mb:.1f} MB > {a.max_mb:g} MB – erst Bilder verkleinern", file=sys.stderr)
        return 1
    print(f"{a.out}: {count} Dateien, {mb:.1f} MB, Version {ver}, sha256 {digest[:16]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
