"""Release package casora.zip for HACS (hacs.json zip_release) without HA core.

  python3 dev/unit/update_release_zip_test.py

- tools/build-release-zip.py builds the root layout HACS extracts into custom_components/casora
  (manifest.json at the zip root, no folder prefix, no path traversal), byte-identical on rebuild.
- Casora itself downloads no release (no self-updater, hacs/default#12143): see
  dev/unit/update_report_only_test.py.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def test_build_script():
    out = tempfile.mkdtemp()
    a, b = os.path.join(out, "a", "casora.zip"), os.path.join(out, "b", "casora.zip")
    for path in (a, b):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build-release-zip.py"), path],
                       check=True, capture_output=True, text=True)
    with zipfile.ZipFile(a) as zf:
        names = zf.namelist()
        manifest = json.loads(zf.read("manifest.json")) if "manifest.json" in names else {}
    check("build-release-zip: manifest.json at the root, no folder prefix",
          "manifest.json" in names and not any(n.startswith(("casora/", "custom_components/")) for n in names),
          repr(names[:3]))
    check("build-release-zip: manifest is Casora's", manifest.get("domain") == "casora", repr(manifest)[:80])
    check("build-release-zip: no absolute or parent paths",
          not any(n.startswith("/") or ".." in n.split("/") for n in names))
    check("build-release-zip: deterministic", open(a, "rb").read() == open(b, "rb").read())


test_build_script()
if fails:
    print(f"\n{len(fails)} failed")
    sys.exit(1)
print("\nall ok")
