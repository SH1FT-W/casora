#!/bin/bash
# Probe: run a few regress tests in the GATE state before merging them (owner, 02.11.2026: new tests that were
# green on casora-test went red in the gate twice, 80 minutes each time).
#
#   dev/qa/probe.sh r501_waste_phone_dates_first [r502_… …]     tests by name (dev/qa/regress/<name>.mjs)
#   PROBE_PORT=8333 dev/qa/probe.sh …                             other port (default 8336)
#   PROBE_KEEP=1 dev/qa/probe.sh …                                keep the throwaway HA (remove: wegwerf-ha.sh weg probe)
#
# What it does, like dev/qa/gate.sh for the state „arbeit“:
#   1. builds the i18n files and starts a throwaway HA „casora-gate-probe“ from this checkout (state arbeit)
#   2. sets up the check dashboard qa-arbeit through the real Studio flow (stress-setup.mjs)
#   3. runs E2E t03_neues_dashboard, which rebuilds „Test Neu“ in the full gate run (the state many
#      later tests meet – r485/r495 broke on exactly that)
#   4. runs the given tests with CASORA_QA_DASH=qa-arbeit, without CASORA_LOCAL (the HA has this checkout)
# One throwaway HA only (Docker has little memory); it is removed at the end. casora-test stays untouched.
set -u
cd "$(dirname "$0")/../.."
NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
PY="uv run --python 3.14"
PORT="${PROBE_PORT:-8336}"
NAME=probe
[ $# -ge 1 ] || { sed -n '2,8p' "$0"; exit 2; }
for t in "$@"; do [ -f "dev/qa/regress/${t%.mjs}.mjs" ] || { echo "fehlt: dev/qa/regress/${t%.mjs}.mjs"; exit 2; }; done

cleanup() { [ "${PROBE_KEEP:-}" = 1 ] || sh dev/qa/wegwerf-ha.sh weg "$NAME" >/dev/null 2>&1; }
trap cleanup EXIT
trap 'echo "Abbruch – räume das Probe-HA auf"; exit 130' INT TERM

python3 tools/build-i18n.py >/dev/null && $PY tools/build-panel-i18n.py >/dev/null || { echo "i18n-Bau fehlgeschlagen"; exit 1; }
sh dev/qa/wegwerf-ha.sh start "$NAME" "$PORT" arbeit || exit 1
sh dev/qa/wegwerf-ha.sh wait "$NAME" "$PORT" || exit 1
export CASORA_URL="http://localhost:$PORT" CASORA_ZUSTAND=arbeit
unset CASORA_TOKENS CASORA_LOCAL
CASORA_TOKENS="$("$NODE" dev/qa/token.mjs)" || { echo "Anmeldung am Probe-HA fehlgeschlagen"; exit 1; }
export CASORA_TOKENS
echo "▸ qa-arbeit einrichten"
"$NODE" dev/qa/stress-setup.mjs --name qa-arbeit --state arbeit >/dev/null || { echo "qa-arbeit einrichten fehlgeschlagen"; exit 1; }
echo "▸ t03_neues_dashboard (Zustand wie im vollen Lauf)"
"$NODE" dev/e2e/t03_neues_dashboard.mjs >/dev/null 2>&1 || echo "  (t03 rot – Zustand trotzdem wie im Gate, weiter)"
export CASORA_QA_DASH=qa-arbeit
rc=0
for t in "$@"; do
  t="${t%.mjs}"
  echo "▸ $t"
  "$NODE" "dev/qa/regress/$t.mjs" 2>&1 | grep -E '^(PASS|FAIL)|FEHLER' | cut -c1-220
  [ "${PIPESTATUS[0]}" = 0 ] || rc=1
done
[ $rc = 0 ] && echo "Probe GRÜN – im Gate-Zustand ok" || echo "Probe ROT – vor dem Merge beheben"
exit $rc
