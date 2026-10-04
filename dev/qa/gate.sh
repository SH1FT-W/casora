#!/bin/bash
# Qualitäts-Gate vor jedem Release und jedem Karten-Update (siehe dev/qa/README.md).
#
#   dev/qa/gate.sh                 alles: arbeit, stress und frisch GLEICHZEITIG auf eigenen
#                                  Wegwerf-Test-HAs (dev/qa/wegwerf-ha.sh, Ports 8301–8305)
#   dev/qa/gate.sh --seriell       wie früher nacheinander auf casora-test (:8124, dev/haus.sh)
#   dev/qa/gate.sh --gezielt[=C]   nur die Zustände, die die Änderungen seit dem letzten grünen
#                                  vollen Gate (oder Commit C) betreffen – zählt NICHT als Freigabe
#   dev/qa/gate.sh --has N         höchstens N Wegwerf-HAs gleichzeitig (2–4; Standard: nach Speicher)
#   dev/qa/gate.sh --quick         ohne Stress-Zustand und ohne vollen Klick-Durchlauf
#   dev/qa/gate.sh --only STEP     nur ein Schritt: static|unit|e2e|regress|crawler
#   dev/qa/gate.sh --no-switch     Test-HA nicht umschalten: nur Tests des aktiven Zustands
#   dev/qa/gate.sh --dry-run       nur den Plan zeigen (mit Parallel-Plan und Zeitschätzung)
#   dev/qa/gate.sh --jobs N        höchstens N Browser/Tests gleichzeitig je Zustand (Standard 4, 1 = nacheinander)
#
# Je Zustand laufen E2E, Regressionstests und Klick-Durchlauf (je Viewport/Teil) über
# dev/qa/pool.mjs gleichzeitig – mit Abhängigkeiten und Sperren, wo Tests dieselben Dashboards
# oder denselben HA-Zustand anfassen. Statisch + Unit laufen während des ersten Umschaltens.
#
# Schreibt .qa/gate-<commit>.json (Commit, Zeit, je Schritt ok/fehlgeschlagen) und die
# Protokolle nach .qa/logs/<commit>/ (Einzelteile unter teile/, Zeiten in zeiten-<zustand>.log).
# Rückgabe ≠ 0 bei jedem Fehler. Nur ein vollständiger Lauf (ohne --quick/--only/--no-switch)
# auf sauberem Arbeitsstand gibt tools/release.sh und tools/build-card-update.py grünes Licht
# (parallel oder --seriell; --gezielt nie).
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
PY="uv run --python 3.14"

QUICK=0; ONLY=""; DRY=0; NOSWITCH=0; JOBS="${GATE_JOBS:-4}"; PAR=1; GEZIELT=0; GBASE=""; HAS="${GATE_HAS:-}"
while [ $# -gt 0 ]; do
  case "$1" in
    --seriell) PAR=0 ;;
    --gezielt) GEZIELT=1 ;;
    --gezielt=*) GEZIELT=1; GBASE="${1#--gezielt=}" ;;
    --has) HAS="$2"; shift ;;
    --has=*) HAS="${1#--has=}" ;;
    --quick) QUICK=1 ;;
    --only) ONLY="$2"; shift ;;
    --only=*) ONLY="${1#--only=}" ;;
    --dry-run|-n) DRY=1 ;;
    --no-switch) NOSWITCH=1 ;;
    --jobs|-j) JOBS="$2"; shift ;;
    --jobs=*) JOBS="${1#--jobs=}" ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ONLY" in ""|static|unit|e2e|regress|crawler) ;; *) echo "--only: static|unit|e2e|regress|crawler" >&2; exit 2 ;; esac
case "$JOBS" in ''|*[!0-9]*|0) echo "--jobs: Zahl ≥ 1" >&2; exit 2 ;; esac
case "$HAS" in ''|2|3|4) ;; *) echo "--has: 2, 3 oder 4" >&2; exit 2 ;; esac
[ $NOSWITCH = 1 ] && PAR=0
[ $GEZIELT = 1 ] && [ $PAR = 0 ] && { echo "--gezielt geht nur parallel (nicht mit --seriell/--no-switch)" >&2; exit 2; }

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
  if [ $DRY = 1 ]; then "$NODE" dev/qa/pool.mjs --dry-run --state "$state" --jobs "$JOBS" --est-file "${POOL_EST:-$ESTF}" "$@"; return 0; fi
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

# ── Paralleles Gate: je Zustand ein Wegwerf-HA ──────────────────────────────────────────
# arbeit :8301 (+ zweites arbeit-HA :8304, wenn der Speicher für 4 reicht), stress :8302,
# frisch :8303 – nach den frisch-Tests (~2 min) wird dessen Speicher zu einem weiteren HA
# (:8305) für den längsten verbleibenden Zustand: mit 3 HAs arbeit, mit 4 HAs stress. Es
# arbeitet dem laufenden Pool als zusätzliche Bahn zu (pool.mjs --ha-later).
# Speicher: Docker-VM gesamt minus laufende Container minus Reserve; je HA unter Last ~GATE_HA_MB.
HA_MB="${GATE_HA_MB:-600}"   # gemessen 04.10.: 550–590 MB je HA unter Last
PORT_ARBEIT=8301; PORT_STRESS=8302; PORT_FRISCH=8303; PORT_ARBEIT2=8304; PORT_SPAET=8305; PORT_STRESS2=8306
ARBEIT_TWO=0; STRESS_TWO=0   # zweites HA von Anfang an (wenn mehr HAs passen als Zustände laufen)
PARDIR=""; LATEFLAG=""; LATE=""   # LATE: Zustand, der das HA nach frisch bekommt
NHAS=3; RUN_ARBEIT=1; RUN_STRESS=1; RUN_FRISCH=1
url() { echo "http://localhost:$1"; }
weg_all() { local n; for n in arbeit arbeit2 stress stress2 frisch spaet; do sh "$REPO/dev/qa/wegwerf-ha.sh" weg "$n"; done; }
kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill "$1" 2>/dev/null || true; }
par_cleanup() {
  local c
  trap - EXIT INT TERM
  for c in $(pgrep -P $$ 2>/dev/null); do kill_tree "$c"; done
  weg_all
  rm -rf "$PARDIR" "$SYNCFLAG"
}
# Freier Docker-Speicher in MB (gesamt − belegt durch laufende Container − 400 MB Reserve).
docker_free_mb() {
  local total used
  total=$(docker info --format '{{.MemTotal}}' 2>/dev/null) || return 1
  used=$(docker stats --no-stream --format '{{.MemUsage}}' 2>/dev/null | awk '{
    v=$1; u=v; gsub(/[0-9.]/,"",u); gsub(/[A-Za-z]/,"",v);
    if (u=="GiB") v*=1024; else if (u=="KiB") v/=1024; else if (u=="B") v/=1048576; s+=v } END {printf "%d", s}')
  echo $(( total / 1048576 - used - 400 ))
}
# Plan nach Speicher (gleichzeitig laufende HAs): 4 = arbeit×2 + stress + frisch(→stress),
# 3 = arbeit + stress + frisch(→arbeit), 2 = arbeit + frisch, stress erst nach frisch auf dessen
# Speicher. Laufen weniger Zustände (gezielt), bekommen sie zweite HAs von Anfang an.
plan_has() {
  [ -n "$HAS" ] && { echo "$HAS"; return; }
  local free; free=$(docker_free_mb) || { echo 3; return; }
  if [ "$free" -ge $((4 * HA_MB)) ]; then echo 4; elif [ "$free" -ge $((3 * HA_MB)) ]; then echo 3; else echo 2; fi
}
# ha_up <name> <port> <zustand> [<name> <port> <zustand> …]: alle starten, dann auf alle warten.
ha_up() {
  local a=("$@") i rc=0
  for ((i = 0; i < ${#a[@]}; i += 3)); do sh dev/qa/wegwerf-ha.sh start "${a[i]}" "${a[i+1]}" "${a[i+2]}" || return 1; done
  for ((i = 0; i < ${#a[@]}; i += 3)); do sh dev/qa/wegwerf-ha.sh wait "${a[i]}" "${a[i+1]}" || rc=1; done
  return $rc
}
# setup_on <port> <zustand> [args…]: Einrichtung auf einem weiteren HA (eigene Anmeldung).
setup_on() { ( export CASORA_URL CASORA_ZUSTAND="$2"; CASORA_URL="$(url "$1")"; unset CASORA_TOKENS; shift 2; stress_setup "$@" ); }

# Zustand in eigener Umgebung: CASORA_URL/CASORA_ZUSTAND/CASORA_OUT gelten für alle Schritte darin.
enter_state() {
  export CASORA_URL; CASORA_URL="$(url "$2")"
  export CASORA_ZUSTAND="$1" CASORA_OUT="/tmp/casora-qa/$1"
  mkdir -p "$CASORA_OUT"
}
want_regcrawl() { want regress || want crawler; }
run_arbeit() {
  enter_state arbeit $PORT_ARBEIT
  local two=$ARBEIT_TWO
  if [ $two = 1 ]; then step haus-arbeit ha "ha_up arbeit $PORT_ARBEIT arbeit arbeit2 $PORT_ARBEIT2 arbeit" || return 0
  else step haus-arbeit ha "ha_up arbeit $PORT_ARBEIT arbeit" || return 0; fi
  set_tokens
  if want_regcrawl; then
    if [ $two = 1 ]; then step arbeit-setup ha "stress_setup --name qa-arbeit --state arbeit && setup_on $PORT_ARBEIT2 arbeit --name qa-arbeit --state arbeit"
    else step arbeit-setup ha "stress_setup --name qa-arbeit --state arbeit"; fi
  fi
  local args="--ha $(url $PORT_ARBEIT)"
  [ $two = 1 ] && args="$args,$(url $PORT_ARBEIT2)"
  [ "$LATE" = arbeit ] && want_regcrawl && args="$args --ha-later $(url $PORT_SPAET)=$LATEFLAG"
  want e2e && args="$args --e2e"
  want regress && args="$args --regress"
  want crawler && args="$args --crawler quick --dash qa-arbeit"
  # shellcheck disable=SC2086
  pool arbeit $args
  [ $DRY = 1 ] || touch "$PARDIR/fertig-arbeit"
}
run_stress() {
  enter_state stress $PORT_STRESS
  # Mit 2 HAs: erst wenn frisch fertig ist (dessen Speicher wird frei).
  if [ $DRY = 0 ] && [ "$NHAS" -le 2 ] && [ "$RUN_FRISCH" = 1 ]; then
    while [ ! -e "$PARDIR/frisch-fertig" ]; do sleep 2; done
  fi
  if [ "$STRESS_TWO" = 1 ]; then step haus-stress ha "ha_up stress $PORT_STRESS stress stress2 $PORT_STRESS2 stress" || { touch "$PARDIR/fertig-stress"; return 0; }
  else step haus-stress ha "ha_up stress $PORT_STRESS stress" || { touch "$PARDIR/fertig-stress"; return 0; }; fi
  set_tokens
  if [ "$STRESS_TWO" = 1 ]; then step stress-setup crawler "stress_setup && setup_on $PORT_STRESS2 stress"
  else step stress-setup crawler "stress_setup"; fi
  local args="--ha $(url $PORT_STRESS)"
  [ "$STRESS_TWO" = 1 ] && args="$args,$(url $PORT_STRESS2)"
  [ "$LATE" = stress ] && args="$args --ha-later $(url $PORT_SPAET)=$LATEFLAG"
  want crawler && args="$args --crawler full"
  want regress && args="$args --regress"
  # shellcheck disable=SC2086
  pool stress $args
  [ $DRY = 1 ] || touch "$PARDIR/fertig-stress"
}
run_frisch() {
  enter_state frisch $PORT_FRISCH
  if step haus-frisch ha "ha_up frisch $PORT_FRISCH frisch"; then
    set_tokens
    pool frisch --regress
  fi
  [ $DRY = 1 ] && return 0
  sh dev/qa/wegwerf-ha.sh weg frisch
  touch "$PARDIR/frisch-fertig"
  # Speicher von frisch weitergeben: weiteres HA für den längsten Zustand als zusätzliche Bahn.
  if [ -n "$LATE" ] && [ ! -e "$PARDIR/fertig-$LATE" ]; then
    local log="$LOGS/haus-$LATE-spaet.log" t0 su; t0=$(date +%s)
    su="setup_on $PORT_SPAET stress"; [ "$LATE" = arbeit ] && su="setup_on $PORT_SPAET arbeit --name qa-arbeit --state arbeit"
    if ( ha_up spaet $PORT_SPAET "$LATE" && eval "$su" ) >"$log" 2>&1; then
      touch "$LATEFLAG"; echo "▸ weiteres $LATE-HA :$PORT_SPAET bereit ($(( $(date +%s) - t0 ))s) – arbeitet $LATE mit ab"
    else echo "▸ weiteres $LATE-HA nicht bereit – $LATE läuft ohne weiter ($log)"; fi
  fi
}
# Ausgabe eines Zustands mit Präfix, Zeile für Zeile.
prefix() { local l; while IFS= read -r l; do printf '%-9s%s\n' "[$1]" "$l"; done; }

# ── Gezielt: betroffene Zustände aus den geänderten Dateien ─────────────────────────────────
# Letzter grüner, vollständiger Gate-Lauf, dessen Commit Vorfahre von HEAD ist.
last_green() {
  python3 - "$REPO/.qa" <<'PY'
import glob, json, os, subprocess, sys
best = None
for f in glob.glob(os.path.join(sys.argv[1], "gate-*.json")):
    try: d = json.load(open(f, encoding="utf-8"))
    except Exception: continue
    if not d.get("ok") or d.get("quick") or d.get("partial") or d.get("dirty"): continue
    c = d.get("commit", "")
    if subprocess.run(["git", "merge-base", "--is-ancestor", c, "HEAD"], capture_output=True).returncode: continue
    if best is None or d.get("timestamp", "") > best[0]: best = (d.get("timestamp", ""), c)
print(best[1] if best else "")
PY
}
# zustand_fuer <datei> → „<zustände>|<grund>“ (Zustände leer = nur statisch/Unit).
zustand_fuer() {
  local f="$1"
  case "$f" in
    *.md|docs/*|LICENSE|.github/*|brand/*|hacs.json|.gitignore|custom_components/casora/brand/*) echo "|Doku/Changelog" ;;
    dev/unit/*) echo "|Unit-Test" ;;
    dev/demo/*|tools/release.sh|tools/sync-changelog.py|tools/privacy-check.py|tools/qa_gate.py|tools/build-card-update.py) echo "|Werkzeug" ;;
    dev/qa/regress/lib.mjs) echo "arbeit stress frisch|Regress-Bibliothek" ;;
    dev/qa/regress/*.mjs) echo "$(test_state "$f")|Regressionstest" ;;
    dev/e2e/*) echo "arbeit|E2E-Test" ;;
    dev/stress/*) echo "stress|Stresshaus" ;;
    dev/qa/stress-setup.mjs|dev/qa/alles.mjs|dev/qa/inpage.js) echo "arbeit stress|Klick-Durchlauf/Prüf-Dashboard" ;;
    dev/qa/*|dev/casora_mock/*|dev/haus.sh) echo "arbeit stress frisch|Gate-Infrastruktur/Mock" ;;
    custom_components/casora/theme_*.yaml|custom_components/casora/assets/*|www/*|custom_components/casora/translations/*)
      echo "arbeit|Theme/Bilder/Texte" ;;
    custom_components/casora/panel/casora-panel-umzug.js|custom_components/casora/panel/casora-panel-import.js|\
    custom_components/casora/panel/casora-panel-assist.js|custom_components/casora/panel/casora-panel-welcome.js)
      echo "frisch arbeit|Umzug/Import/Assistent (Ersteinrichtung + E2E)" ;;
    custom_components/casora/*.py|custom_components/casora/ki/*|tools/build-i18n.py|tools/build-panel-i18n.py)
      echo "frisch arbeit|Python/Setup" ;;
    custom_components/casora/panel/*|custom_components/casora/scripts/*|dashboards/*|custom_components/casora/*.yaml)
      echo "arbeit|Dashboard/Panel" ;;
    *) echo "arbeit stress frisch|unbekannt – sicherheitshalber alles" ;;
  esac
}
# Überlauf-/Listen-Hinweise in den geänderten Zeilen einer Oberflächen-Datei → zusätzlich stress.
STRESS_RE='overflow|ellipsis|nowrap|scroll|flex-wrap|line-clamp|max-width|min-width|white-space|grid-template|Überlauf|lange Namen'
plan_gezielt() {
  local base="$GBASE" f z why files
  [ -n "$base" ] || base="$(last_green)"
  [ -n "$base" ] || { echo "Kein grünes volles Gate als Vorfahre von HEAD gefunden – --gezielt=<commit> angeben." >&2; return 1; }
  base="$(git rev-parse --verify -q "$base^{commit}")" || { echo "--gezielt: unbekannter Commit $GBASE" >&2; return 1; }
  RUN_ARBEIT=0; RUN_STRESS=0; RUN_FRISCH=0
  files="$( { git diff --name-only "$base" HEAD; git diff --name-only HEAD; } | sort -u)"
  echo "Gezielt: Änderungen seit ${base:0:12} ($(echo "$files" | grep -c .) Dateien)"
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    z="$(zustand_fuer "$f")"; why="${z#*|}"; z="${z%%|*}"
    if [ "$z" = arbeit ] && { git diff "$base" HEAD -- "$f"; git diff HEAD -- "$f"; } | grep '^[+-][^+-]' | grep -qiE "$STRESS_RE"; then
      z="arbeit stress"; why="$why, Überlauf/Listen im Diff"
    fi
    printf '  %-58s → %s (%s)\n' "$f" "${z:-nur statisch/Unit}" "$why"
    case " $z " in *" arbeit "*) RUN_ARBEIT=1 ;; esac
    case " $z " in *" stress "*) RUN_STRESS=1 ;; esac
    case " $z " in *" frisch "*) RUN_FRISCH=1 ;; esac
  done <<<"$files"
  echo "  ⇒ statisch + Unit$([ $RUN_ARBEIT = 1 ] && echo ' + arbeit')$([ $RUN_STRESS = 1 ] && echo ' + stress')$([ $RUN_FRISCH = 1 ] && echo ' + frisch') – zählt nicht als Release-Freigabe"
}

# ── Plan ────────────────────────────────────────────────────────────────────────────────
ha_needed=0
for g in e2e regress crawler; do want $g && ha_needed=1; done
stat_needed=0; { want static || want unit; } && stat_needed=1
CUR="$(cat "$HOME/casora-haus/aktiv" 2>/dev/null || echo '?')"

if [ $PAR = 1 ]; then
  if [ $GEZIELT = 1 ]; then plan_gezielt || exit 2; fi
  [ $QUICK = 1 ] && RUN_STRESS=0
  want_regcrawl || RUN_STRESS=0
  want regress || RUN_FRISCH=0
  [ $ha_needed = 1 ] || { RUN_ARBEIT=0; RUN_STRESS=0; RUN_FRISCH=0; }
  [ $((RUN_ARBEIT + RUN_STRESS + RUN_FRISCH)) = 0 ] && ha_needed=0
  PARDIR="$(mktemp -d -t casora-gate-par)"; LATEFLAG="$PARDIR/spaet-bereit"
  if [ $ha_needed = 1 ]; then
    NHAS="$(plan_has)"
    # Mehr HAs als Zustände (z. B. gezielt nur arbeit): Rest als zweite HAs von Anfang an.
    spare=$((NHAS - RUN_ARBEIT - RUN_STRESS - RUN_FRISCH))
    if [ $RUN_ARBEIT = 1 ] && want_regcrawl && [ $spare -ge 1 ]; then ARBEIT_TWO=1; spare=$((spare - 1)); fi
    if [ $RUN_STRESS = 1 ] && [ $spare -ge 1 ]; then STRESS_TWO=1; fi
    # Das HA nach frisch geht an den längsten Zustand, der noch kein zweites hat (arbeit zuerst).
    if [ "$RUN_FRISCH" = 1 ] && [ "$NHAS" -ge 3 ]; then
      if [ $RUN_ARBEIT = 1 ] && want_regcrawl && [ $ARBEIT_TWO = 0 ]; then LATE=arbeit
      elif [ $RUN_STRESS = 1 ] && [ $STRESS_TWO = 0 ]; then LATE=stress
      elif [ $RUN_ARBEIT = 1 ] && want_regcrawl; then LATE=arbeit; fi
    fi
    if [ $DRY = 0 ]; then
      if [ -n "$(docker ps -q --filter label=casora-gate=1)" ]; then
        echo "Es laufen schon Gate-Test-HAs (casora-gate-*) – läuft ein anderes Gate? Sonst: docker rm -f \$(docker ps -aq --filter label=casora-gate=1)" >&2
        rm -rf "$PARDIR"; exit 2
      fi
    fi
  fi
  if [ $DRY = 0 ]; then
    trap par_cleanup EXIT
    trap 'echo "Abbruch – räume Test-HAs auf"; exit 130' INT TERM
    # i18n einmal bauen (wegwerf-ha.sh kopiert nur); danach dürfen die statischen Prüfungen los.
    python3 tools/build-i18n.py >/dev/null && $PY tools/build-panel-i18n.py >/dev/null || echo "i18n-Bau fehlgeschlagen (statische Prüfung meldet es)"
    touch "$SYNCFLAG"
  fi
fi

if [ $DRY = 1 ]; then
  echo "Gate-Plan für ${COMMIT:0:12}$([ $DIRTY = 1 ] && echo ' (Arbeitsstand geändert)')$([ $QUICK = 1 ] && echo ' – schnell')${ONLY:+ – nur $ONLY}$([ $NOSWITCH = 1 ] && echo " – ohne Umschalten (aktiv: $CUR)")$([ $GEZIELT = 1 ] && echo ' – gezielt')$([ $PAR = 1 ] && [ $ha_needed = 1 ] && echo " – parallel auf $NHAS Wegwerf-HAs") – $JOBS Tests je Zustand"
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
  if [ $PAR = 1 ]; then
    if [ $DRY = 1 ]; then
      echo "3) Zustände gleichzeitig, je ein Wegwerf-HA (casora-test bleibt unberührt):"
      if [ $RUN_ARBEIT = 1 ]; then
        echo "   arbeit  :$PORT_ARBEIT$([ $ARBEIT_TWO = 1 ] && echo " + :$PORT_ARBEIT2") – E2E + Regress: $(regress_names arbeit)+ schneller Klick-Durchlauf"
        POOL_EST="$PARDIR/est-arbeit" run_arbeit
      fi
      if [ $RUN_FRISCH = 1 ]; then
        echo "   frisch  :$PORT_FRISCH – Regress: $(regress_names frisch)$([ -n "$LATE" ] && echo "– danach weiteres $LATE-HA :$PORT_SPAET")"
        POOL_EST="$PARDIR/est-frisch" run_frisch
      fi
      if [ $RUN_STRESS = 1 ]; then
        echo "   stress  :$PORT_STRESS$([ $STRESS_TWO = 1 ] && echo " + :$PORT_STRESS2")$([ "$NHAS" -le 2 ] && [ $RUN_FRISCH = 1 ] && echo " (erst nach frisch – Speicher)") – voller Klick-Durchlauf + Regress: $(regress_names stress)"
        POOL_EST="$PARDIR/est-stress" run_stress
      fi
    else
      PIDS=""
      if [ $RUN_ARBEIT = 1 ]; then ( run_arbeit; sh dev/qa/wegwerf-ha.sh weg arbeit; sh dev/qa/wegwerf-ha.sh weg arbeit2; [ "$LATE" = arbeit ] && sh dev/qa/wegwerf-ha.sh weg spaet ) 2>&1 | prefix arbeit & PIDS="$PIDS $!"; fi
      if [ $RUN_FRISCH = 1 ]; then ( run_frisch ) 2>&1 | prefix frisch & PIDS="$PIDS $!"; else touch "$PARDIR/frisch-fertig"; fi
      if [ $RUN_STRESS = 1 ]; then ( run_stress; sh dev/qa/wegwerf-ha.sh weg stress; sh dev/qa/wegwerf-ha.sh weg stress2; [ "$LATE" = stress ] && sh dev/qa/wegwerf-ha.sh weg spaet ) 2>&1 | prefix stress & PIDS="$PIDS $!"; fi
      # Speicher-Protokoll alle 15 s (Container und Belegung), bis alle Zustände fertig sind.
      ( while [ ! -e "$PARDIR/alle-fertig" ]; do printf '%s ' "$(date +%H:%M:%S)"; docker stats --no-stream --format '{{.Name}}={{.MemUsage}}' 2>/dev/null | sed 's| / .*||' | tr '\n' ' '; echo; i=0; while [ $i -lt 15 ] && [ ! -e "$PARDIR/alle-fertig" ]; do sleep 1; i=$((i+1)); done; done ) >"$LOGS/speicher.log" 2>&1 &
      MEMPID=$!
      # shellcheck disable=SC2086
      wait $PIDS
      touch "$PARDIR/alle-fertig"; wait "$MEMPID" 2>/dev/null
    fi
  elif [ $NOSWITCH = 1 ]; then
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

if [ $DRY = 1 ] && [ $PAR = 1 ]; then
  sumf() { awk '{s+=$1} END {print s+0}' "$1" 2>/dev/null || echo 0; }
  ea=$(sumf "$PARDIR/est-arbeit"); es=$(sumf "$PARDIR/est-stress"); ef=$(sumf "$PARDIR/est-frisch")
  [ $RUN_ARBEIT = 1 ] && ea=$((ea + 35)); [ $RUN_STRESS = 1 ] && es=$((es + 30)); [ $RUN_FRISCH = 1 ] && ef=$((ef + 20))
  [ "$NHAS" -le 2 ] && [ $RUN_STRESS = 1 ] && es=$((es + ef))
  tot=$ea; [ $es -gt $tot ] && tot=$es; [ $ef -gt $tot ] && tot=$ef; [ $tot -lt 100 ] && tot=100   # Unit ~90 s
  echo "Geschätzte Dauer: ~$((tot / 60)) min $((tot % 60)) s (arbeit ~$((ea / 60)) min, stress ~$((es / 60)) min, frisch ~$((ef / 60)) min gleichzeitig; zusätzliche HAs als von Anfang an da gerechnet)"
  echo "Ergebnis: .qa/gate-$COMMIT.json$([ $GEZIELT = 1 ] && echo ' (gezielt – keine Freigabe)')"
  rm -rf "$STEPS" "$BGOUT" "$ESTF" "$PARDIR"; exit 0
fi
if [ $DRY = 1 ]; then
  tot=$(awk '{s+=$1} END {print s+0}' "$ESTF")
  echo "Geschätzte Dauer: ~$((tot / 60)) min $((tot % 60)) s (seriell zuletzt ~33 min; Schätzung aus .qa/zeiten.json bzw. den letzten Protokollen)"
  echo "Ergebnis: .qa/gate-$COMMIT.json"
  rm -f "$STEPS" "$BGOUT" "$ESTF"; exit 0
fi

# ── Ergebnis ────────────────────────────────────────────────────────────────────────────
PARTIAL=0; { [ -n "$ONLY" ] || [ $NOSWITCH = 1 ] || [ $GEZIELT = 1 ]; } && PARTIAL=1
MODE=seriell; [ $PAR = 1 ] && MODE="parallel/$NHAS"; [ $GEZIELT = 1 ] && MODE="gezielt/$NHAS"
python3 - "$STEPS" "$RES" "$COMMIT" "$DIRTY" "$QUICK" "$PARTIAL" "$START" "$ONLY" "$MODE" <<'PY'
import datetime, json, sys, time
steps_f, res, commit, dirty, quick, partial, start, only, mode = sys.argv[1:10]
steps = []
for line in open(steps_f, encoding="utf-8"):
    sid, group, rc, dt, log = line.rstrip("\n").split("\t")
    steps.append({"id": sid, "group": group, "ok": rc == "0", "seconds": int(dt), "log": log})
ok = bool(steps) and all(s["ok"] for s in steps)
doc = {"commit": commit, "timestamp": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
       "seconds": int(time.time()) - int(start), "ok": ok, "dirty": dirty == "1", "quick": quick == "1",
       "partial": partial == "1", "only": only or None, "mode": mode, "steps": steps}
json.dump(doc, open(res, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print()
print(f"Gate {commit[:12]}: {'GRÜN' if ok else 'ROT'} – {sum(s['ok'] for s in steps)}/{len(steps)} Schritte ok, "
      f"{doc['seconds'] // 60} min {doc['seconds'] % 60} s"
      + (" (schnell)" if doc["quick"] else "") + (" (teilweise)" if doc["partial"] else "")
      + (" (gezielt – keine Freigabe)" if mode.startswith("gezielt") else "")
      + (" (Arbeitsstand nicht committet)" if doc["dirty"] else ""))
for s in steps:
    if not s["ok"]:
        print(f"  FEHLER {s['id']}: {s['log']}")
print("Zeiten: " + " · ".join(f"{s['id']} {s['seconds']}s" for s in steps))
print("  (Schritte eines Zustands laufen gleichzeitig" + (", die Zustände auch untereinander" if mode != "seriell" else "")
      + " – Einzelteile in .qa/logs/<commit>/zeiten-<zustand>.log)")
print(f"Ergebnis: {res}")
sys.exit(0 if ok else 1)
PY
FAILED=$?
rm -f "$STEPS" "$BGOUT" "$ESTF"
exit $FAILED
