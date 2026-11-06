#!/bin/bash
# Run every unit test in dev/unit (and dev/pytest) side by side; output stays in file order.
#
#   dev/qa/unit-tests.sh               all tests, UNIT_JOBS at a time (default: half the cores, 2–6)
#   UNIT_JOBS=1 dev/qa/unit-tests.sh   one after the other (as before)
#
# Same tests and the same invocation as the serial loop it replaces (gate.sh step "unit"):
# - dev/unit/*.mjs with node; helpers with mandatory arguments ("node dev/unit/x.mjs <input>" in the
#   first lines) are skipped, their Python test calls them,
# - dev/unit/*_test.py with uv (Python 3.14) and the "--with …" packages from the test's head,
#   "@ha-venv" in the head: with the Python of tools/ha-venv.sh (default HA version),
# - dev/pytest with pytest-homeassistant-custom-component and with HA's own pytest-homeassistant (2026.11).
# Every test runs in its own process; they only read the checkout (writes go to temp dirs).
# Prints "=== <test>" and the test's output for each test, "FEHLER <test>" for each red one; exit 1 if any.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
PY="${PY:-uv run --python 3.14}"
if [ -z "${UNIT_JOBS:-}" ]; then
  n="$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)"
  UNIT_JOBS=$((n / 2)); [ $UNIT_JOBS -lt 2 ] && UNIT_JOBS=2; [ $UNIT_JOBS -gt 6 ] && UNIT_JOBS=6
fi
case "$UNIT_JOBS" in ''|*[!0-9]*|0) echo "UNIT_JOBS: number ≥ 1" >&2; exit 2 ;; esac

OUT="$(mktemp -d -t casora-unit)"
trap 'rm -rf "$OUT"' EXIT

# One task per line: "<kind> <file>". The pytest runs (slowest, ~20 s) start first.
tasks=()
[ -d dev/pytest ] && tasks+=("pytest-b dev/pytest" "pytest-a dev/pytest")
for f in dev/unit/*.mjs; do tasks+=("mjs $f"); done
for f in dev/unit/*_test.py; do tasks+=("py $f"); done

# run_one <index> <kind> <file>: runs one task, writes <index>.head/.log/.rc into $OUT.
run_one() {
  local i="$1" kind="$2" f="$3" withs title="=== $3" rc
  if [ "$kind" = mjs ] && head -n 6 "$f" | grep -qE "node dev/unit/[^ ]+\.mjs <"; then
    echo "=== $f (Helfer, übersprungen)" >"$OUT/$i.head"; : >"$OUT/$i.log"; echo 0 >"$OUT/$i.rc"; return 0
  fi
  if [ "$kind" = py ] && head -n 30 "$f" | grep -q "@ha-venv"; then kind=ha-venv; title="=== $f (tools/ha-venv.sh)"; fi
  if [ "$kind" = py ]; then
    withs="$(head -n 30 "$f" | grep -o -- '--with [A-Za-z0-9_.=<>-]*' | sort -u | tr '\n' ' ')"
    title="=== $f $withs"
  fi
  [ "$kind" = pytest-b ] && { f="dev/pytest (HA 2026.11)"; title="=== $f"; }
  case "$kind" in
    mjs) "$NODE" "$f" ;;
    ha-venv) "$(env -u HA_VERSION tools/ha-venv.sh install)/bin/python" "$f" ;;
    py) $PY $withs python "$f" ;;
    pytest-a) $PY --with pytest-homeassistant-custom-component pytest dev/pytest -q -p no:cacheprovider ;;
    # HA 2026.11+ (Marketplace instead of HACS): HA's own test package, as in .github/workflows/tests.yml.
    pytest-b) $PY --prerelease=allow --with 'pytest-homeassistant>=2026.11.0b0,<2026.12' pytest dev/pytest -q -p no:cacheprovider -p no:respx ;;
  esac >"$OUT/$i.log" 2>&1
  rc=$?
  echo "$title" >"$OUT/$i.head"
  [ $rc = 0 ] || echo "FEHLER $f" >>"$OUT/$i.log"
  echo "$rc" >"$OUT/$i.rc"
}
export -f run_one
export OUT NODE PY

for i in "${!tasks[@]}"; do printf '%s %s\n' "$i" "${tasks[$i]}"; done \
  | xargs -P "$UNIT_JOBS" -L 1 bash -c 'run_one "$1" "$2" "${*:3}"' _

# Report in a fixed order: pytest last (as before), unit tests by file name.
bad=0
order=()
for i in "${!tasks[@]}"; do case "${tasks[$i]}" in pytest-*) ;; *) order+=("$i") ;; esac; done
for i in "${!tasks[@]}"; do [ "${tasks[$i]%% *}" = pytest-a ] && order+=("$i"); done
for i in "${!tasks[@]}"; do [ "${tasks[$i]%% *}" = pytest-b ] && order+=("$i"); done
for i in "${order[@]}"; do
  if [ ! -f "$OUT/$i.rc" ]; then echo "=== ${tasks[$i]#* }"; echo "FEHLER ${tasks[$i]#* } (nicht gelaufen)"; bad=1; continue; fi
  cat "$OUT/$i.head" "$OUT/$i.log"
  [ "$(cat "$OUT/$i.rc")" = 0 ] || bad=1
done
exit $bad
