"""The start scripts write no http: block into configuration.yaml once HA has moved it (tools/ha-venv.sh, ha-docker.sh).

  python3 dev/unit/ha_start_http_test.py

HA 2026.11 keeps the http settings in .storage/http and sets yaml_migration_done; an http: block left in
configuration.yaml is then ignored, raises the repair "HTTP YAML configuration is ignored after migration" and
stops working with 2027.2. port_setzen runs its embedded Python on a temporary config, no HA needed:
- before the migration (or with no .storage/http) it writes the block as before;
- after it, it sets port and host in .storage/http and removes the block; the rest of the file stays.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FAILS: list[str] = []
YAML = "sun:\nwebhook:\n\nhttp:\n  server_port: 8123\ncasora_mock:\n"


def port_python(script: str) -> str:
    """The Python heredoc inside port_setzen of tools/<script>."""
    with open(os.path.join(ROOT, "tools", script), encoding="utf-8") as f:
        text = f.read()
    match = re.search(r"port_setzen\(\) \{.*?<<'PY'\n(.*?)\nPY\n", text, re.S)
    assert match, f"{script}: no port_setzen heredoc"
    return match.group(1)


def run(script: str, args: list[str], migrated: bool | None) -> tuple[str, dict | None]:
    with tempfile.TemporaryDirectory() as cfg:
        with open(os.path.join(cfg, "configuration.yaml"), "w", encoding="utf-8") as f:
            f.write(YAML)
        if migrated is not None:
            os.mkdir(os.path.join(cfg, ".storage"))
            with open(os.path.join(cfg, ".storage", "http"), "w", encoding="utf-8") as f:
                json.dump({"key": "http", "data": {"stable": {"server_port": 1}, "yaml_migration_done": migrated}}, f)
        subprocess.run([sys.executable, "-", cfg, *args], input=port_python(script), text=True, check=True)
        with open(os.path.join(cfg, "configuration.yaml"), encoding="utf-8") as f:
            yaml = f.read()
        storage = None
        if migrated is not None:
            with open(os.path.join(cfg, ".storage", "http"), encoding="utf-8") as f:
                storage = json.load(f)
        return yaml, storage


for script, args, port in (("ha-venv.sh", ["8124", "127.0.0.1"], 8124), ("ha-docker.sh", [], 8123)):
    for migrated in (None, False):
        yaml, _ = run(script, args, migrated)
        if not re.search(rf"(?m)^http:\n(  .*\n)*  server_port: {port}\n", yaml):
            FAILS.append(f"{script}, migrated={migrated}: http: block missing before the migration:\n{yaml}")
    yaml, storage = run(script, args, True)
    if "http:" in yaml:
        FAILS.append(f"{script}: http: block still in configuration.yaml after the migration:\n{yaml}")
    if "sun:" not in yaml or "casora_mock:" not in yaml:
        FAILS.append(f"{script}: other keys lost after the migration:\n{yaml}")
    if storage["data"]["stable"]["server_port"] != port:
        FAILS.append(f"{script}: port not set in .storage/http after the migration")

for fail in FAILS:
    print("FEHLER:", fail)
if FAILS:
    sys.exit(1)
print("ha_start_http: ok")
