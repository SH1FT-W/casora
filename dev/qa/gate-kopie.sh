#!/bin/bash
# Runs dev/qa/gate.sh on the current commit in a separate worktree, so this checkout stays free for commits while the
# gate runs (80–110 min for a beta). Afterwards the result (.qa/gate-<commit>.json) and the logs are copied back here,
# where tools/release.sh looks for them.
#
#   dev/qa/gate-kopie.sh --patch --kette     same options as gate.sh
#   dev/qa/gate-kopie.sh --nachholen         after the version commit: only what was red
#
# The worktree (default ../casora-gate, CASORA_GATE_WT to change) is reused and set to the commit each time.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
[ -n "$(git status --porcelain --untracked-files=no)" ] && { echo "✗ Uncommitted changes: the gate checks one commit, commit first." >&2; exit 2; }
COMMIT="$(git rev-parse HEAD)"
WT="${CASORA_GATE_WT:-$(dirname "$REPO")/casora-gate}"

if [ -d "$WT/.git" ] || [ -f "$WT/.git" ]; then
  git -C "$WT" checkout -q --detach "$COMMIT" || exit 2
else
  git worktree add -q --detach "$WT" "$COMMIT" || exit 2
fi
mkdir -p "$WT/.qa" "$REPO/.qa/logs"
# Earlier results (basis for --patch/--kette/--nachholen) and the timing table come along.
cp -p "$REPO"/.qa/gate-*.json "$REPO/.qa/zeiten.json" "$WT/.qa/" 2>/dev/null
echo "▸ Gate for ${COMMIT:0:12} in $WT (this checkout stays free)"

(cd "$WT" && dev/qa/gate.sh "$@")
rc=$?

cp -p "$WT/.qa/gate-$COMMIT.json" "$REPO/.qa/" 2>/dev/null
cp -p "$WT/.qa/zeiten.json" "$REPO/.qa/" 2>/dev/null
[ -d "$WT/.qa/logs/${COMMIT:0:12}" ] && rsync -a "$WT/.qa/logs/${COMMIT:0:12}" "$REPO/.qa/logs/"
echo "▸ Result copied back: .qa/gate-$COMMIT.json (exit $rc)"
exit $rc
