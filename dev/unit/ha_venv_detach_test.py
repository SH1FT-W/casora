"""tools/ha-venv.sh start leaves an HA that outlives a kill of the caller's process group.

  python3 dev/unit/ha_venv_detach_test.py

Runners that end a command by killing its whole process group (agent tools, CI jobs, `timeout`) used to take the
HA with them: `( nohup … & )` ignores SIGHUP but stays in the caller's group. start runs here in its own process
group with a fake venv whose bin/hass only sleeps, no HA needed; the test kills that group, as such a runner does.
- hass and its restart loop survive, and `laeuft` still finds them;
- `stop` still ends both.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(ROOT, "tools", "ha-venv.sh")
VERSION = "2026.1.0"
FAILS: list[str] = []


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def pids(pattern_end: str, needle: str) -> list[int]:
    """Pids whose command line contains needle and ends with pattern_end (as tools/ha-venv.sh looks them up)."""
    out = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, check=True).stdout
    found = []
    for line in out.splitlines():
        pid, _, command = line.strip().partition(" ")
        if needle in command and command.endswith(pattern_end):
            found.append(int(pid))
    return found


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def wait_gone(pid: int, seconds: float) -> bool:
    deadline = time.time() + seconds
    while alive(pid) and time.time() < deadline:
        time.sleep(0.1)
    return not alive(pid)


with tempfile.TemporaryDirectory() as tmp:
    tmp = os.path.realpath(tmp)
    basis, cfg = os.path.join(tmp, "venvs"), os.path.join(tmp, "config")
    os.makedirs(os.path.join(basis, VERSION, "bin"))
    os.makedirs(cfg)
    hass_bin = os.path.join(basis, VERSION, "bin", "hass")
    with open(hass_bin, "w", encoding="utf-8") as f:
        f.write("#!/bin/sh\nwhile :; do sleep 1; done\n")
    os.chmod(hass_bin, 0o755)
    env = {**os.environ, "HA_VENV_DIR": basis}
    started: list[int] = []
    try:
        # start in its own process group, as such a runner spawns a command
        run = subprocess.Popen([SCRIPT, "start", cfg, str(free_port()), VERSION], env=env, start_new_session=True,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if run.wait(timeout=60) != 0:
            FAILS.append(f"start exited {run.returncode}")
        hass = pids(f" -c {cfg}", "/bin/hass")
        loop = pids(f" {cfg}", " ha-venv ")
        started = hass + loop
        if not hass or not loop:
            FAILS.append(f"start left no hass ({hass}) or no restart loop ({loop})")
        else:
            try:
                os.killpg(run.pid, signal.SIGTERM)   # the runner's cleanup once the command is done
            except ProcessLookupError:
                pass   # the group is empty: hass lives elsewhere
            time.sleep(1)
            if not alive(hass[0]):
                FAILS.append("hass died with the caller's process group")
            if not alive(loop[0]):
                FAILS.append("the restart loop died with the caller's process group")
            if subprocess.run([SCRIPT, "laeuft", cfg], env=env).returncode != 0:
                FAILS.append("laeuft does not find the HA after the group kill")
            subprocess.run([SCRIPT, "stop", cfg], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=60)
            if not wait_gone(hass[0], 10) or not wait_gone(loop[0], 10):
                FAILS.append("stop did not end hass and its restart loop")
    finally:
        for pid in started:
            if alive(pid):
                os.kill(pid, signal.SIGKILL)

for fail in FAILS:
    print("FEHLER:", fail)
if FAILS:
    sys.exit(1)
print("ha_venv_detach: ok")
