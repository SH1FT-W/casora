"""privacy-check in a git worktree uses the main checkout's private lists (02.11.2026).

Agent worktrees have no copy of the gitignored lists (dev/privat-woerter.txt, dev/casora_mock/fixture.json);
the check ran there with "0 Wörter, 0 IDs" and real entity IDs slipped into r487/r488.

  python3 dev/unit/privacy_check_worktree_test.py
"""
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def counts(cwd):
    out = subprocess.run([sys.executable, "tools/privacy-check.py"], cwd=cwd, capture_output=True, text=True).stdout
    m = re.search(r"\((\d+) Wörter, (\d+) IDs", out)
    return (int(m.group(1)), int(m.group(2))) if m else None


main = counts(ROOT)
if not main or main == (0, 0):
    print("skip privacy_check_worktree (no private lists in this checkout, e.g. CI)")
    sys.exit(0)
wt = os.path.join(tempfile.mkdtemp(), "wt")
subprocess.run(["git", "worktree", "add", "-q", "--detach", wt, "HEAD"], cwd=ROOT, check=True)
try:
    # The worktree gets the working copy of the check itself (uncommitted changes count too).
    with open(os.path.join(ROOT, "tools/privacy-check.py"), encoding="utf-8") as src, \
            open(os.path.join(wt, "tools/privacy-check.py"), "w", encoding="utf-8") as dst:
        dst.write(src.read())
    got = counts(wt)
finally:
    subprocess.run(["git", "worktree", "remove", "--force", wt], cwd=ROOT, check=False)
assert got == main, f"worktree checks with {got}, main checkout with {main}"
print(f"ok privacy_check_worktree ({got[0]} words, {got[1]} IDs in a worktree too)")
