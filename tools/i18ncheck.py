#!/usr/bin/env python3
"""Guard the dashboard translation table.

    python3 tools/i18ncheck.py

en.json is the reference translators work from, so it has to agree with the
English default sitting inline at every call site. A drift there is invisible:
English users keep reading the inline default while translators translate a
string nobody sees.
"""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "custom_components/casora/translations/dashboard")
OUT = os.path.join(ROOT, "custom_components/casora/scripts/casora-i18n.js")
SCAN = ("dashboards/templates", "custom_components/casora/scripts", "custom_components/casora/panel")

CALL = re.compile(
    r"(?:_casoraT|(?<![\w$])T)\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'"
)
SLOT = re.compile(r"\{(\w+)\}")


def call_sites():
    for rel in SCAN:
        base = os.path.join(ROOT, rel)
        for dirpath, _d, files in os.walk(base):
            if "untested" in dirpath:
                continue
            for name in files:
                if not name.endswith((".yaml", ".js")):
                    continue
                if name == "casora-i18n.js":
                    continue
                path = os.path.join(dirpath, name)
                try:
                    with open(path, encoding="utf-8", errors="replace") as fh:
                        text = fh.read()
                except OSError:
                    continue
                for m in CALL.finditer(text):
                    line = text.count("\n", 0, m.start()) + 1
                    yield os.path.relpath(path, ROOT), line, m.group(1), m.group(2)


def main() -> int:
    errors = []
    with open(os.path.join(SRC, "en.json"), encoding="utf-8") as fh:
        en = json.load(fh)

    used = set()
    for path, line, key, default in call_sites():
        used.add(key)
        if key not in en:
            errors.append("%s:%d  key not in en.json: %r" % (path, line, key))
        elif en[key] != default:
            errors.append(
                "%s:%d  %r default %r != en.json %r"
                % (path, line, key, default, en[key])
            )

    for key in sorted(set(en) - used):
        errors.append("en.json: %r is not used at any call site" % key)

    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".json") or name == "en.json":
            continue
        with open(os.path.join(SRC, name), encoding="utf-8") as fh:
            tbl = json.load(fh)
        for key, value in sorted(tbl.items()):
            if key not in en:
                errors.append("%s: %r is not in en.json" % (name, key))
                continue
            if SLOT.findall(en[key]) and set(SLOT.findall(value)) != set(
                SLOT.findall(en[key])
            ):
                errors.append(
                    "%s: %r placeholders %s != en %s"
                    % (name, key, SLOT.findall(value), SLOT.findall(en[key]))
                )

    before = open(OUT, encoding="utf-8").read() if os.path.isfile(OUT) else None
    subprocess.run(
        [sys.executable, os.path.join(ROOT, "tools/build-i18n.py")],
        check=True, capture_output=True,
    )
    if before != open(OUT, encoding="utf-8").read():
        errors.append("casora-i18n.js was stale; rebuilt. Commit the result.")

    for e in errors:
        print(e)
    print("i18ncheck: %d key(s), %d problem(s)" % (len(en), len(errors)))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
