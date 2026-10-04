#!/bin/bash
# Qualitäts-Gate vor jedem Release und jedem Karten-Update (siehe dev/qa/README.md).
#
#   dev/qa/gate.sh                 alles (Zustände arbeit → stress → frisch, endet auf frisch)
#   dev/qa/gate.sh --quick         ohne Stress-Zustand und ohne vollen Klick-Durchlauf
#   dev/qa/gate.sh --only STEP     nur ein Schritt: static|unit|e2e|regress|crawler
#   dev/qa/gate.sh --no-switch     Test-HA nicht umschalten: nur Tests des aktiven Zustands
#   dev/qa/gate.sh --dry-run       nur den Plan zeigen (mit Parallel-Plan und Zeitschätzung)
#   dev/qa/gate.sh --jobs N        höchstens N Browser/Tests gleichzeitig (Standard 4, 1 = nacheinander)
#
# Je Zustand laufen E2E, Regressionstests und Klick-Durchlauf (je Viewport/Teil) über
# dev/qa/pool.mjs gleichzeitig – mit Abhängigkeiten und Sperren, wo Tests dieselben Dashboards
# oder denselben HA-Zustand anfassen. Statisch + Unit laufen während des ersten Umschaltens.
#
# Schreibt .qa/gate-<commit>.json (Commit, Zeit, je Schritt ok/fehlgeschlagen) und die
# Protokolle nach .qa/logs/<commit>/ (Einzelteile unter teile/, Zeiten in zeiten-<zustand>.log).
# Rückgabe ≠ 0 bei jedem Fehler. Nur ein vollständiger Lauf (ohne --quick/--only/--no-switch)
# auf sauberem Arbeitsstand gibt tools/release.sh und tools/build-card-update.py grünes Licht.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
PY="uv run --python 3.14"

QUICK=0; ONLY=""; DRY=0; NOSWITCH=0; JOBS="${GATE_JOBS:-4}"
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=1 ;;
    --only) ONLY="$2"; shift ;;
    --only=*) ONLY="${1#--only=}" ;;
    --dry-run|-n) DRY=1 ;;
    --no-switch) NOSWITCH=1 ;;
    --jobs|-j) JOBS="$2"; shift ;;
    --jobs=*) JOBS="${1#--jobs=}" ;;
    -h|--help) sed -n '2,18p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ONLY" in ""|static|unit|e2e|regress|crawler) ;; *) echo "--only: static|unit|e2e|regress|crawler" >&2; exit 2 ;; esac
case "$JOBS" in ''|*[!0-9]*|0) echo "--jobs: Zahl ≥ 1" >&2; exit 2 ;; esac

COMMIT="$(git rev-parse HEAD)"
DIRTY=0; [ -n "$(git status --porcelain --untracked-files=no)" ] && DIRTY=1
LOGS="$REPO/.qa/logs/${COMMIT:0:12}"
RES="$REPO/.qa/gate-$COMMIT.json"
STEPS="$(mktemp -t casora-gate)"
START=$(date +%s)
BGOUT="$(mktemp -t casora-gate-bg)"
SYNCFLAG="$(mktemp -u -t casora-gate-sync)"
ESTF="$(mktemp -t casora-gate-est)"
BGPID=""
trap 'rm -f "$SYNCFLAG"' EXIT
[ $DRY = 1 ] || mkdir -p "$LOGS"

# Das Umschalten des Test-HA („ha“) gehört zu jeder Gruppe, die es braucht.
want() { [ -z "$ONLY" ] || [ "$ONLY" = "$1" ] || [ "$1" = ha ]; }

# step <id> <gruppe> <Befehl …> – führt aus (oder zeigt im Probelauf), protokolliert, merkt ok/fehl.
# Die Zeile zeigt Dauer und Gate-Uhr (@m:ss seit Start).
step() {
  local id="$1" group="$2"; shift 2
  want "$group" || return 0
  if [ $DRY = 1 ]; then printf '  %-28s %s\n' "$id" "$*"; return 0; fi
  local log="$LOGS/$id.log" t0=$(date +%s) rc
  ( eval "$@" ) >"$log" 2>&1; rc=$?
  local dt=$(( $(date +%s) - t0 )) at=$(( $(date +%s) - START ))
  local clock="@$((at / 60)):$(printf '%02d' $((at % 60)))"
  printf '▸ %-28s ' "$id"
  if [ $rc = 0 ]; then echo "ok (${dt}s) $clock"; else echo "FEHLER (${dt}s) $clock – $log"; tail -n 8 "$log" | sed 's/^/    /'; fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$group" "$rc" "$dt" "$log" >>"$STEPS"
  return $rc
}

# ── Einzelprüfungen (als Funktionen, damit step sie in einer Subshell ausführt) ──────────
syntax_js() {
  local f bad=0
  for f in custom_components/casora/panel/*.js custom_components/casora/scripts/*.js custom_components/casora/scripts/local/*.js \
           dev/e2e/t*.mjs dev/e2e/harness.mjs dev/qa/*.mjs dev/qa/regress/*.mjs dev/unit/*.mjs; do
    [ -f "$f" ] || continue
    "$NODE" --check "$f" || { echo "FEHLER $f"; bad=1; }
  done
  return $bad
}
syntax_py() {
  $PY python - <<'PY'
import glob, sys
bad = 0
files = sorted(glob.glob("custom_components/casora/**/*.py", recursive=True)) + sorted(glob.glob("tools/*.py"))
for f in files:
    try:
        compile(open(f, encoding="utf-8").read(), f, "exec")  # wie py_compile, ohne .pyc
    except SyntaxError as e:
        bad += 1
        print("FEHLER", f"{f}:{e.lineno}: {e.msg}")
print(f"{len(files)} Python-Dateien, {bad} mit Fehler")
sys.exit(1 if bad else 0)
PY
}
json_valid() {
  python3 - <<'PY'
import glob, json, sys
bad = 0
files = sorted(glob.glob("custom_components/casora/translations/**/*.json", recursive=True)) + [
    "custom_components/casora/manifest.json", "dashboards/casora/button_card_templates.json",
    "custom_components/casora/panel/casora-templates.json"]
for f in files:
    try:
        json.load(open(f, encoding="utf-8"))
    except Exception as e:
        bad += 1
        print("FEHLER", f, e)
print(f"{len(files)} JSON-Dateien, {bad} ungültig")
sys.exit(1 if bad else 0)
PY
}
unit_tests() {
  local f bad=0 withs
  for f in dev/unit/*.mjs; do
    # Helfer mit Pflicht-Argumenten („node dev/unit/x.mjs <eingabe>“) ruft ihr Python-Test selbst auf.
    if head -n 6 "$f" | grep -qE "node dev/unit/[^ ]+\.mjs <"; then echo "=== $f (Helfer, übersprungen)"; continue; fi
    echo "=== $f"; "$NODE" "$f" || { echo "FEHLER $f"; bad=1; }
  done
  for f in dev/unit/*_test.py; do
    # Zusatzpakete stehen in der Aufrufzeile des Tests („uv run … --with homeassistant …“).
    withs="$(head -n 30 "$f" | grep -o -- '--with [A-Za-z0-9_.=<>-]*' | sort -u | tr '\n' ' ')"
    echo "=== $f $withs"; $PY $withs python "$f" || { echo "FEHLER $f"; bad=1; }
  done
  return $bad
}
# Anmeldung: einmal je Zustand (jeder Zustand hat seine eigene HA-Benutzerdatenbank). Nach
# jedem Umschalten setzt set_tokens CASORA_TOKENS im Haupt-Shell neu; alle Schritte erben es.
tokens() {
  [ -n "${CASORA_TOKENS:-}" ] && return 0
  CASORA_TOKENS="$("$NODE" dev/qa/token.mjs)" || { echo "Anmeldung am Test-HA fehlgeschlagen" >&2; return 1; }
  export CASORA_TOKENS
}
set_tokens() { [ $DRY = 1 ] && return 0; unset CASORA_TOKENS; tokens >/dev/null 2>&1 || true; }
# Zustand eines Regressionstests aus „// @zustand: …“ in den ersten Zeilen; ohne Angabe frisch.
test_state() { local z; z="$(head -n 5 "$1" | sed -n 's|^// @zustand: *\([a-z]*\).*|\1|p' | head -n1)"; echo "${z:-frisch}"; }
regress_names() { local f; for f in dev/qa/regress/*.mjs; do [ "$(basename "$f")" = lib.mjs ] && continue; [ "$(test_state "$f")" = "$1" ] && printf '%s ' "$(basename "$f" .mjs)"; done; }
stress_setup() {
  [ -f dev/qa/stress-setup.mjs ] || { echo "dev/qa/stress-setup.mjs fehlt"; return 1; }
  tokens || return 1
  "$NODE" dev/qa/stress-setup.mjs "$@"
}
switch_to() {
  # Zustand wechseln; war er schon aktiv, den Arbeitsstand einspielen – neu gestartet wird nur,
  # wenn sich der eingespielte Stand seit dem letzten Start geändert hat (haus.sh --if-changed).
  # Nach dem Einspielen (i18n gebaut, Dateien kopiert) gibt SYNCFLAG die statischen Prüfungen
  # frei; sie laufen, während HA hochfährt.
  local out rc=0
  out="$(sh dev/haus.sh "$1" --no-wait 2>&1)" || rc=1
  echo "$out"
  if [ $rc = 0 ] && echo "$out" | grep -q "schon aktiv"; then sh dev/haus.sh sync --if-changed --no-wait || rc=1; fi
  touch "$SYNCFLAG"
  [ $rc = 0 ] || return 1
  sh dev/haus.sh wait || return 1
  [ "$(cat "$HOME/casora-haus/aktiv" 2>/dev/null)" = "$1" ] || { echo "Zustand ist nicht $1"; return 1; }
}
export -f syntax_js syntax_py json_valid unit_tests tokens test_state stress_setup switch_to
export NODE PY SYNCFLAG

# Tests eines Zustands gleichzeitig (dev/qa/pool.mjs); im Probelauf Plan + Schätzung.
pool() {
  local state="$1"; shift
  if [ $DRY = 1 ]; then "$NODE" dev/qa/pool.mjs --dry-run --state "$state" --jobs "$JOBS" --est-file "$ESTF" "$@"; return 0; fi
  "$NODE" dev/qa/pool.mjs --state "$state" --jobs "$JOBS" --logs "$LOGS" --results "$STEPS" --t0 "$START" "$@"
  local rc=$?
  # 0/1: Schritte sind eingetragen. Sonst ist der Läufer selbst gescheitert → als Fehler festhalten.
  if [ $rc -gt 1 ]; then
    echo "▸ pool-$state FEHLER (Rückgabe $rc)"
    printf '%s\t%s\t%s\t%s\t%s\n' "pool-$state" ha "$rc" 0 "-" >>"$STEPS"
  fi
  return 0
}
# Zeitschätzung für den Probelauf (Sekunden).
est() { [ $DRY = 1 ] && echo "$1" >>"$ESTF"; return 0; }

# Statisch + Unit. Mit Umschalten im Hintergrund, sobald der Arbeitsstand eingespielt ist
# (haus.sh baut dabei i18n-Dateien, die json/privacy lesen) – so laufen sie, während HA startet.
static_steps() {
  [ $DRY = 1 ] && echo "1) Statische Prüfungen"
  step syntax-js        static  syntax_js
  step syntax-py        static  syntax_py
  step vorlagen-js      static  "\"\$NODE\" dev/qa/check-templates.mjs dashboards/casora/button_card_templates.json custom_components/casora/panel/casora-templates.json"
  step json             static  json_valid
  [ -f tools/privacy-check.py ] && step privacy static "python3 tools/privacy-check.py"
  step changelog        static  "python3 tools/sync-changelog.py --check"
  [ $DRY = 1 ] && echo "2) Unit-Tests (dev/unit)"
  step unit             unit    unit_tests
  return 0
}
static_bg() {
  ( i=0; while [ ! -e "$SYNCFLAG" ] && [ $i -lt 3000 ]; do sleep 0.2; i=$((i+1)); done; static_steps ) >"$BGOUT" 2>&1 &
  BGPID=$!
}
join_static() {
  [ -n "$BGPID" ] || return 0
  touch "$SYNCFLAG"
  wait "$BGPID"; BGPID=""
  cat "$BGOUT"
}

# ── Plan ────────────────────────────────────────────────────────────────────────────────
ha_needed=0
for g in e2e regress crawler; do want $g && ha_needed=1; done
stat_needed=0; { want static || want unit; } && stat_needed=1
CUR="$(cat "$HOME/casora-haus/aktiv" 2>/dev/null || echo '?')"

if [ $DRY = 1 ]; then
  echo "Gate-Plan für ${COMMIT:0:12}$([ $DIRTY = 1 ] && echo ' (Arbeitsstand geändert)')$([ $QUICK = 1 ] && echo ' – schnell')${ONLY:+ – nur $ONLY}$([ $NOSWITCH = 1 ] && echo " – ohne Umschalten (aktiv: $CUR)") – $JOBS parallel"
fi

if [ $stat_needed = 1 ]; then
  if [ $ha_needed = 1 ] && [ "$JOBS" -gt 1 ] && [ $DRY = 0 ]; then
    [ $NOSWITCH = 1 ] && touch "$SYNCFLAG"   # nichts wird eingespielt – sofort los
    static_bg
  else
    static_steps
    if [ $DRY = 1 ]; then
      if [ $ha_needed = 1 ] && [ "$JOBS" -gt 1 ]; then echo "   (1+2 laufen im Hintergrund – $([ $NOSWITCH = 1 ] && echo "parallel zu den Tests" || echo "sobald der Arbeitsstand eingespielt ist, parallel zum HA-Start"))"
      else est 20; fi
    fi
  fi
fi

if [ $ha_needed = 1 ]; then
  if [ $NOSWITCH = 1 ]; then
    [ $DRY = 1 ] && echo "3) Test-HA im aktiven Zustand „${CUR}“ (kein Umschalten)"
    set_tokens
    args=""
    if [ "$CUR" = arbeit ]; then
      want e2e && args="$args --e2e"
      if want regress || want crawler; then step arbeit-setup ha "stress_setup --name qa-arbeit --state arbeit"; est 8; fi
      want crawler && args="$args --crawler quick --dash qa-arbeit"
    fi
    [ "$CUR" = stress ] && [ $QUICK = 0 ] && want crawler && args="$args --crawler full"
    want regress && args="$args --regress"
    # shellcheck disable=SC2086
    pool "$CUR" $args
  else
    # Reihenfolge arbeit → stress → frisch: frisch ist Prüf- und Endzustand zugleich – ein
    # Umschalten weniger als früher (frisch → arbeit → stress → frisch).
    [ $DRY = 1 ] && echo "3) Zustand arbeit   – E2E t01–t19 + Regress: $(regress_names arbeit)+ schneller Klick-Durchlauf (qa-arbeit)"
    est 22
    if step haus-arbeit ha "switch_to arbeit" || [ $DRY = 1 ]; then
      join_static
      set_tokens
      # Prüf-Dashboard qa-arbeit über den echten Studio-Ablauf (dashboard-hemma ist gesperrt und
      # hat alte Vorlagen – für Produktprüfungen ungeeignet). Vor den Tests, damit Regress und
      # Klick-Durchlauf gleichzeitig mit E2E laufen können.
      if want regress || want crawler; then step arbeit-setup ha "stress_setup --name qa-arbeit --state arbeit"; est 8; fi
      args=""
      want e2e && args="$args --e2e"
      want regress && args="$args --regress"
      want crawler && args="$args --crawler quick --dash qa-arbeit"
      # shellcheck disable=SC2086
      pool arbeit $args
    fi
    join_static
    if [ $QUICK = 0 ] && { want crawler || want regress; }; then
      [ $DRY = 1 ] && echo "4) Zustand stress   – stress-setup (Dashboard qa-stress), voller Klick-Durchlauf + Regress: $(regress_names stress)"
      est 22
      if step haus-stress ha "switch_to stress" || [ $DRY = 1 ]; then
        set_tokens
        step stress-setup crawler "stress_setup"
        want crawler && est 6
        args=""
        want crawler && args="$args --crawler full"
        want regress && args="$args --regress"
        # shellcheck disable=SC2086
        pool stress $args
      fi
    elif [ $QUICK = 1 ] && [ $DRY = 1 ]; then
      echo "4) Zustand stress   – übersprungen (--quick): $(regress_names stress)"
    fi
    if want regress; then
      [ $DRY = 1 ] && echo "5) Zustand frisch   – Regress: $(regress_names frisch)(frisch bleibt danach aktiv)"
      est 20
      if step haus-frisch ha "switch_to frisch" || [ $DRY = 1 ]; then
        set_tokens
        pool frisch --regress
      fi
    else
      [ $DRY = 1 ] && echo "5) Zurück auf frisch"
      est 20
      step haus-zurueck ha "switch_to frisch"
    fi
  fi
fi
join_static

if [ $DRY = 1 ]; then
  tot=$(awk '{s+=$1} END {print s+0}' "$ESTF")
  echo "Geschätzte Dauer: ~$((tot / 60)) min $((tot % 60)) s (seriell zuletzt ~33 min; Schätzung aus .qa/zeiten.json bzw. den letzten Protokollen)"
  echo "Ergebnis: .qa/gate-$COMMIT.json"
  rm -f "$STEPS" "$BGOUT" "$ESTF"; exit 0
fi

# ── Ergebnis ────────────────────────────────────────────────────────────────────────────
PARTIAL=0; { [ -n "$ONLY" ] || [ $NOSWITCH = 1 ]; } && PARTIAL=1
python3 - "$STEPS" "$RES" "$COMMIT" "$DIRTY" "$QUICK" "$PARTIAL" "$START" "$ONLY" <<'PY'
import datetime, json, sys, time
steps_f, res, commit, dirty, quick, partial, start, only = sys.argv[1:9]
steps = []
for line in open(steps_f, encoding="utf-8"):
    sid, group, rc, dt, log = line.rstrip("\n").split("\t")
    steps.append({"id": sid, "group": group, "ok": rc == "0", "seconds": int(dt), "log": log})
ok = bool(steps) and all(s["ok"] for s in steps)
doc = {"commit": commit, "timestamp": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
       "seconds": int(time.time()) - int(start), "ok": ok, "dirty": dirty == "1", "quick": quick == "1",
       "partial": partial == "1", "only": only or None, "steps": steps}
json.dump(doc, open(res, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print()
print(f"Gate {commit[:12]}: {'GRÜN' if ok else 'ROT'} – {sum(s['ok'] for s in steps)}/{len(steps)} Schritte ok, "
      f"{doc['seconds'] // 60} min {doc['seconds'] % 60} s"
      + (" (schnell)" if doc["quick"] else "") + (" (teilweise)" if doc["partial"] else "")
      + (" (Arbeitsstand nicht committet)" if doc["dirty"] else ""))
for s in steps:
    if not s["ok"]:
        print(f"  FEHLER {s['id']}: {s['log']}")
print("Zeiten: " + " · ".join(f"{s['id']} {s['seconds']}s" for s in steps))
print("  (Schritte eines Zustands laufen gleichzeitig – Einzelteile in .qa/logs/<commit>/zeiten-<zustand>.log)")
print(f"Ergebnis: {res}")
sys.exit(0 if ok else 1)
PY
FAILED=$?
rm -f "$STEPS" "$BGOUT" "$ESTF"
exit $FAILED
