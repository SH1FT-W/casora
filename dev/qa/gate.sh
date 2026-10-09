#!/bin/bash
# Qualitäts-Gate vor jedem Release und jedem Karten-Update (siehe dev/qa/README.md).
#
#   dev/qa/gate.sh                 Standard: Umfang nach Version (--umfang auto), Zustände gleichzeitig
#                                  auf eigenen Wegwerf-Test-HAs (Ports 8301–8307), 1 Test je HA
#   dev/qa/gate.sh --voll          volles Gate (für X.Y.0 Pflicht): alle Zustände, alle Tests
#   dev/qa/gate.sh --patch         Grundprüfungen + nur die Tests, die die Änderungen seit dem letzten
#                                  grünen vollen Gate berühren (dev/qa/auswahl.mjs) – Freigabe für X.Y.Z, Z>0
#   dev/qa/gate.sh --basis C       Bezug für --patch (sonst letztes grünes volles Gate, Vorfahre von HEAD)
#   dev/qa/gate.sh --nachholen[=C] nur die im Vorlauf (bzw. Gate von C) roten und seitdem geänderten Tests;
#                                  zusammen mit dem Vorlauf gilt das Ergebnis als vollständig
#   dev/qa/gate.sh --seriell       Zustände nacheinander auf casora-test (:8124, dev/haus.sh)
#   dev/qa/gate.sh --has N         höchstens N Wegwerf-HAs gleichzeitig (2–6; Standard: nach Speicher, höchstens 5)
#   dev/qa/gate.sh --jobs N        Tests gleichzeitig je Test-HA (Standard 1 = kein geteilter Zustand im HA)
#   dev/qa/gate.sh --keine-gegenprobe   rote Tests nicht einzeln nachlaufen lassen
#   dev/qa/gate.sh --quick         ohne Stress-Zustand und ohne vollen Klick-Durchlauf (keine Freigabe)
#   dev/qa/gate.sh --only STEP     nur ein Schritt: static|unit|e2e|regress|crawler (keine Freigabe)
#   dev/qa/gate.sh --no-switch     Test-HA casora-test nicht umschalten: nur Tests des aktiven Zustands
#   dev/qa/gate.sh --dry-run       nur den Plan zeigen (mit Zuordnung, Parallel-Plan und Zeitschätzung)
#
# Je Zustand laufen E2E, Regressionstests und Klick-Durchlauf (je Viewport/Teil) über
# dev/qa/pool.mjs – mit Abhängigkeiten und Sperren, wo Tests dieselben Dashboards oder denselben
# HA-Zustand anfassen. Statisch + Unit laufen, während die HAs starten. Ein im Lauf roter Test läuft
# am Ende einmal einzeln nach (Gegenprobe): grün = wackelt (zählt, steht in der Wackler-Liste).
#
# Schreibt .qa/gate-<commit>.json (Commit, Zeit, Umfang, je Schritt und je Test ok/fehlgeschlagen,
# Wackler) und die Protokolle nach .qa/logs/<commit>/. Rückgabe ≠ 0 bei jedem Fehler.
# tools/release.sh (über tools/qa_gate.py) nimmt ein volles Gate immer, ein Patch-Gate nur für X.Y.Z mit
# Z>0 und nur, wenn sein Bezug ein grünes volles Gate eines Vorfahren ist.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
PY="uv run --python 3.14"

QUICK=0; ONLY=""; DRY=0; NOSWITCH=0; JOBS="${GATE_JOBS:-}"; PAR=1; HAS="${GATE_HAS:-}"
UMFANG="${GATE_UMFANG:-auto}"; BASIS=""; NACH=0; NACHVON=""; GPFLAG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --seriell) PAR=0 ;;
    --parallel) PAR=1 ;;
    --voll) UMFANG=voll ;;
    --patch) UMFANG=patch ;;
    --umfang) UMFANG="$2"; shift ;;
    --umfang=*) UMFANG="${1#--umfang=}" ;;
    --basis) BASIS="$2"; shift ;;
    --basis=*) BASIS="${1#--basis=}" ;;
    --gezielt) UMFANG=patch ;;                                  # alter Name
    --gezielt=*) UMFANG=patch; BASIS="${1#--gezielt=}" ;;
    --nachholen) NACH=1 ;;
    --nachholen=*) NACH=1; NACHVON="${1#--nachholen=}" ;;
    --keine-gegenprobe) GPFLAG="--keine-gegenprobe" ;;
    --has) HAS="$2"; shift ;;
    --has=*) HAS="${1#--has=}" ;;
    --quick) QUICK=1 ;;
    --only) ONLY="$2"; shift ;;
    --only=*) ONLY="${1#--only=}" ;;
    --dry-run|-n) DRY=1 ;;
    --no-switch) NOSWITCH=1; PAR=0 ;;
    --jobs|-j) JOBS="$2"; shift ;;
    --jobs=*) JOBS="${1#--jobs=}" ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ONLY" in ""|static|unit|e2e|regress|crawler) ;; *) echo "--only: static|unit|e2e|regress|crawler" >&2; exit 2 ;; esac
case "$UMFANG" in auto|voll|patch) ;; *) echo "--umfang: auto | voll | patch" >&2; exit 2 ;; esac
# Parallel: 1 Test je HA (09.10.2026) – mehrere HAs statt mehrerer Browser auf einem HA, so teilt kein
# Test den HA-Zustand mit einem anderen. Seriell auf casora-test wie bisher 2 gleichzeitig.
[ -n "$JOBS" ] || { [ $PAR = 1 ] && JOBS=1 || JOBS=2; }
case "$JOBS" in ''|*[!0-9]*|0) echo "--jobs: Zahl ≥ 1" >&2; exit 2 ;; esac
case "$HAS" in ''|2|3|4|5|6) ;; *) echo "--has: 2 bis 6" >&2; exit 2 ;; esac
# Teil- und Sonderläufe sind immer „voll“ im Sinne der Auswahl (sie zählen ohnehin nicht als Freigabe).
if [ -n "$ONLY" ] || [ $QUICK = 1 ] || [ $PAR = 0 ]; then
  [ "$UMFANG" = patch ] && { echo "--patch geht nur parallel und nicht mit --quick/--only" >&2; exit 2; }
  [ $NACH = 1 ] && { echo "--nachholen geht nur parallel und nicht mit --quick/--only" >&2; exit 2; }
  UMFANG=voll
fi
[ $NACH = 1 ] && UMFANG=nachholen

COMMIT="$(git rev-parse HEAD)"
DIRTY=0; [ -n "$(git status --porcelain --untracked-files=no)" ] && DIRTY=1
LOGS="$REPO/.qa/logs/${COMMIT:0:12}"
RES="$REPO/.qa/gate-$COMMIT.json"
STEPS="$(mktemp -t casora-gate)"
START=$(date +%s)
BGOUT="$(mktemp -t casora-gate-bg)"
SYNCFLAG="$(mktemp -u -t casora-gate-sync)"
ESTF="$(mktemp -t casora-gate-est)"
TESTS="$(mktemp -t casora-gate-tests)"   # je Test eine Zeile (pool.mjs --tests)
AUSWAHL="$(mktemp -t casora-gate-auswahl)"
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
  # Integrationstests mit pytest-homeassistant-custom-component (T-04): Setup/Unload/Migration.
  if [ -d dev/pytest ]; then
    echo "=== dev/pytest"; $PY --with pytest-homeassistant-custom-component pytest dev/pytest -q -p no:cacheprovider || { echo "FEHLER dev/pytest"; bad=1; }
  fi
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
  "$NODE" dev/qa/pool.mjs --state "$state" --jobs "$JOBS" --logs "$LOGS" --results "$STEPS" --tests "$TESTS" --t0 "$START" $GPFLAG "$@"
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
  # Übersetzungen (T-06, 06.10.2026): Studio-Schlüssel vollständig; Dashboard-Lücken dürfen nur
  # weniger werden – PHRASE_GAPS_MAX beim Schließen von Lücken mit senken.
  step i18n             static  "python3 tools/i18ncheck.py"
  step phrase-gaps      static  "python3 tools/phrase-gaps.py --max \${PHRASE_GAPS_MAX:-70} >/dev/null"
  step changelog        static  "python3 tools/sync-changelog.py --check"
  # Prüfskripte: page.waitForFunction(async …) wartet nie (Playwright hält das Promise für „wahr“) –
  # so wurde qa-stress unter Last nicht angelegt (06.10.2026). Stattdessen selbst abfragen.
  step qa-warten        static  "! grep -rnE 'waitForFunction\\(async' dev --include='*.mjs'"
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

# ── Paralleles Gate: je Zustand ein oder mehrere Wegwerf-HAs ────────────────────────────
# Ports: arbeit 8301 (+ 8304, 8307), stress 8302 (+ 8306), frisch 8303. Nach den frisch-Tests
# (~2 min) wird dessen Speicher zu einem weiteren HA (:8305) für den längsten verbleibenden Zustand,
# das dem laufenden Pool als zusätzliche Bahn zuarbeitet (pool.mjs --ha-later).
# Speicher: Docker-VM gesamt minus laufende Container minus Reserve; je HA unter Last ~GATE_HA_MB.
HA_MB="${GATE_HA_MB:-600}"   # gemessen 04.10.: 550–590 MB je HA unter Last
HAS_MAX="${GATE_HAS_MAX:-5}" # mehr HAs = mehr Browser gleichzeitig; 5 hält der Rechner (10 Kerne) gut aus
PORT_ARBEIT=8301; PORT_STRESS=8302; PORT_FRISCH=8303; PORT_ARBEIT2=8304; PORT_SPAET=8305; PORT_STRESS2=8306; PORT_ARBEIT3=8307
A_N=1; S_N=1                 # HAs je Zustand von Anfang an
PARDIR=""; LATEFLAG=""; LATE=""   # LATE: Zustand, der das HA nach frisch bekommt
NHAS=3; RUN_ARBEIT=1; RUN_STRESS=1; RUN_FRISCH=1
# Auswahl je Zustand (gestaffeltes Gate / Nachholen): KOMPLETT=1 = alle Tests des Zustands, sonst
# nur die Listen (Komma-getrennt) und die Teile des Klick-Durchlaufs.
A_KOMPLETT=1; A_E2E=""; A_REG=""; A_TEILE=""; S_KOMPLETT=1; S_REG=""; S_CRAWL=0; F_KOMPLETT=1; F_REG=""
url() { echo "http://localhost:$1"; }
weg_all() { local n; for n in arbeit arbeit2 arbeit3 stress stress2 frisch spaet; do sh "$REPO/dev/qa/wegwerf-ha.sh" weg "$n"; done; }
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
# Höchstzahl gleichzeitiger HAs nach Speicher (2 … HAS_MAX), --has gibt sie vor.
plan_has() {
  [ -n "$HAS" ] && { echo "$HAS"; return; }
  local free n; free=$(docker_free_mb) || { echo 3; return; }
  n=$(( free / HA_MB )); [ $n -gt "$HAS_MAX" ] && n=$HAS_MAX; [ $n -lt 2 ] && n=2
  echo $n
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
# Was läuft je Zustand (aus Umfang/Auswahl)?
a_e2e()   { want e2e && { [ $A_KOMPLETT = 1 ] || [ -n "$A_E2E" ]; }; }
a_reg()   { want regress && { [ $A_KOMPLETT = 1 ] || [ -n "$A_REG" ]; }; }
a_crawl() { want crawler && { [ $A_KOMPLETT = 1 ] || [ -n "$A_TEILE" ]; }; }
s_reg()   { want regress && { [ $S_KOMPLETT = 1 ] || [ -n "$S_REG" ]; }; }
s_crawl() { want crawler && { [ $S_KOMPLETT = 1 ] || [ $S_CRAWL = 1 ]; }; }
f_reg()   { want regress && { [ $F_KOMPLETT = 1 ] || [ -n "$F_REG" ]; }; }
nur_args() { local l; l="$(echo "$*" | tr ' ' ',' | sed 's/,,*/,/g; s/^,//; s/,$//')"; [ -n "$l" ] && echo "--nur $l"; }
run_arbeit() {
  enter_state arbeit $PORT_ARBEIT
  local list="arbeit $PORT_ARBEIT arbeit" urls su p
  urls="$(url $PORT_ARBEIT)"; su="stress_setup --name qa-arbeit --state arbeit"
  for p in $([ $A_N -ge 2 ] && echo "arbeit2:$PORT_ARBEIT2") $([ $A_N -ge 3 ] && echo "arbeit3:$PORT_ARBEIT3"); do
    list="$list ${p%%:*} ${p#*:} arbeit"; urls="$urls,$(url "${p#*:}")"; su="$su && setup_on ${p#*:} arbeit --name qa-arbeit --state arbeit"
  done
  step haus-arbeit ha "ha_up $list" || return 0
  set_tokens
  # Prüf-Dashboard qa-arbeit über den echten Studio-Ablauf (dashboard-hemma ist gesperrt und hat alte
  # Vorlagen) – auf jedem arbeit-HA.
  { a_reg || a_crawl; } && step arbeit-setup ha "$su"
  local args="--ha $urls"
  [ "$LATE" = arbeit ] && { a_reg || a_crawl; } && args="$args --ha-later $(url $PORT_SPAET)=$LATEFLAG"
  a_e2e && args="$args --e2e"
  a_reg && args="$args --regress"
  a_crawl && args="$args --crawler quick --dash qa-arbeit"
  [ $A_KOMPLETT = 1 ] || { args="$args $(nur_args "$A_E2E" "$A_REG")"; [ -n "$A_TEILE" ] && args="$args --crawler-teile $A_TEILE"; }
  # shellcheck disable=SC2086
  { a_e2e || a_reg || a_crawl; } && pool arbeit $args
  [ $DRY = 1 ] || touch "$PARDIR/fertig-arbeit"
}
run_stress() {
  enter_state stress $PORT_STRESS
  # Mit 2 HAs: erst wenn frisch fertig ist (dessen Speicher wird frei).
  if [ $DRY = 0 ] && [ "$NHAS" -le 2 ] && [ "$RUN_FRISCH" = 1 ]; then
    while [ ! -e "$PARDIR/frisch-fertig" ]; do sleep 2; done
  fi
  if [ "$S_N" -ge 2 ]; then step haus-stress ha "ha_up stress $PORT_STRESS stress stress2 $PORT_STRESS2 stress" || { touch "$PARDIR/fertig-stress"; return 0; }
  else step haus-stress ha "ha_up stress $PORT_STRESS stress" || { touch "$PARDIR/fertig-stress"; return 0; }; fi
  set_tokens
  if [ "$S_N" -ge 2 ]; then step stress-setup ha "stress_setup && setup_on $PORT_STRESS2 stress"
  else step stress-setup ha "stress_setup"; fi
  local args="--ha $(url $PORT_STRESS)"
  [ "$S_N" -ge 2 ] && args="$args,$(url $PORT_STRESS2)"
  [ "$LATE" = stress ] && args="$args --ha-later $(url $PORT_SPAET)=$LATEFLAG"
  s_crawl && args="$args --crawler full"
  s_reg && args="$args --regress"
  [ $S_KOMPLETT = 1 ] || args="$args $(nur_args "$S_REG")"
  # shellcheck disable=SC2086
  pool stress $args
  [ $DRY = 1 ] || touch "$PARDIR/fertig-stress"
}
run_frisch() {
  enter_state frisch $PORT_FRISCH
  if step haus-frisch ha "ha_up frisch $PORT_FRISCH frisch"; then
    set_tokens
    # shellcheck disable=SC2046
    pool frisch --regress $([ $F_KOMPLETT = 1 ] || nur_args "$F_REG")
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

# ── Umfang: voll, patch (gestaffelt) oder nachholen ──────────────────────────────────────
# Letzter grüner, voller Gate-Lauf (auch nachgeholt), dessen Commit Vorfahre von HEAD ist.
last_green() { python3 tools/qa_gate.py --letztes-volles; }   # sucht in allen Worktrees
# Auswahl-JSON (auswahl.mjs bzw. nachholen.mjs) → Shell-Variablen A_*/S_*/F_* und RUN_*.
apply_auswahl() {
  local vars
  vars="$(python3 - "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
st = d["states"]
def lst(z, k): return ",".join(st.get(z, {}).get(k) or [])
a, s, f = st.get("arbeit", {}), st.get("stress", {}), st.get("frisch", {})
out = {
  "A_KOMPLETT": int(bool(a.get("komplett"))), "A_E2E": lst("arbeit", "e2e"), "A_REG": lst("arbeit", "regress"),
  "A_TEILE": ",".join(a.get("teile") or []) if a.get("crawler") else "",
  "S_KOMPLETT": int(bool(s.get("komplett"))), "S_REG": lst("stress", "regress"), "S_CRAWL": int(bool(s.get("crawler"))),
  "F_KOMPLETT": int(bool(f.get("komplett"))), "F_REG": lst("frisch", "regress"),
}
out["RUN_ARBEIT"] = int(bool(out["A_KOMPLETT"] or out["A_E2E"] or out["A_REG"] or out["A_TEILE"]))
out["RUN_STRESS"] = int(bool(out["S_KOMPLETT"] or out["S_REG"] or out["S_CRAWL"]))
out["RUN_FRISCH"] = int(bool(out["F_KOMPLETT"] or out["F_REG"]))
for k, v in out.items(): print(f"{k}='{v}'")
PY
)" || return 1
  eval "$vars"
}
# Geschätzte Sekunden je Zustand aus .qa/zeiten.json (für die Zahl der HAs je Zustand).
est_state() {
  python3 - "$REPO/.qa/zeiten.json" "$1" "$2" "$3" <<'PY'
import json, sys
try: z = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception: z = {}
state, komplett, ids = sys.argv[2], sys.argv[3] == "1", [x for x in sys.argv[4].split(",") if x]
if komplett: print(sum(v for k, v in z.items() if k.startswith(state + "/")) or 1500)
else: print(sum(z.get(f"{state}/{i}", z.get(f"{state}/quick/{i}", 40)) for i in ids))
PY
}

# ── Vorab-Prüfung ───────────────────────────────────────────────────────────────────────
# Was die Tests brauchen, aber nicht im Repo liegt, vorher prüfen – sonst erscheint es mitten im Lauf
# als Testfehler (09.10.2026: fehlende dev/e2e/testhaus.json im Worktree machte t01/t11 rot).
# In einem Worktree werden fehlende private Dateien aus dem Haupt-Checkout kopiert (alle gitignored).
PRIVAT_NOETIG="dev/casora_mock/fixture.json dev/casora_mock/scenarios.json dev/e2e/testhaus.json dev/privat-woerter.txt"
PRIVAT_KANN="dev/casora_mock/skip.txt dev/casora_mock/einstellungen.privat.js"
vorab() {
  local need_ha="$1" f main bad=0 copied="" p z
  main="$(cd "$(git rev-parse --git-common-dir)/.." 2>/dev/null && pwd)"
  for f in $PRIVAT_NOETIG $PRIVAT_KANN; do
    [ -f "$f" ] && continue
    if [ -n "$main" ] && [ "$main" != "$REPO" ] && [ -f "$main/$f" ]; then
      mkdir -p "$(dirname "$f")"; cp "$main/$f" "$f" && copied="$copied $f"
    elif case " $PRIVAT_NOETIG " in *" $f "*) true ;; *) false ;; esac; then
      echo "✗ Vorab: $f fehlt (privat, nicht im Repo; auch nicht im Haupt-Checkout $main)"; bad=1
    else echo "  Vorab: $f fehlt (optional)"; fi
  done
  [ -n "$copied" ] && echo "▸ Vorab: private Testdateien aus dem Haupt-Checkout kopiert:$copied"
  if [ "$need_ha" = 1 ]; then
    docker info >/dev/null 2>&1 || { echo "✗ Vorab: Docker antwortet nicht"; bad=1; }
    { [ -n "${CASORA_USER:-}" ] && [ -n "${CASORA_PASS:-}" ]; } || [ -f "$HOME/casora-haus/ZUGANG.txt" ] \
      || { echo "✗ Vorab: kein Test-Zugang (CASORA_USER/CASORA_PASS oder ~/casora-haus/ZUGANG.txt)"; bad=1; }
    for z in arbeit frisch; do [ -f "$HOME/casora-haus/zustaende/$z.tgz" ] || { echo "✗ Vorab: ~/casora-haus/zustaende/$z.tgz fehlt"; bad=1; }; done
    if [ $PAR = 1 ]; then
      for p in $PORT_ARBEIT $PORT_STRESS $PORT_FRISCH $PORT_ARBEIT2 $PORT_SPAET $PORT_STRESS2 $PORT_ARBEIT3; do
        curl -s -o /dev/null --max-time 1 "http://localhost:$p/" && { echo "✗ Vorab: Port $p ist belegt (anderes Gate oder Wegwerf-HA?)"; bad=1; }
      done
    fi
  fi
  [ $bad = 0 ] || echo "Gate nicht gestartet – erst die Punkte oben beheben."
  return $bad
}

# ── Plan ────────────────────────────────────────────────────────────────────────────────
ha_needed=0
for g in e2e regress crawler; do want $g && ha_needed=1; done
stat_needed=0; { want static || want unit; } && stat_needed=1
CUR="$(cat "$HOME/casora-haus/aktiv" 2>/dev/null || echo '?')"

if [ $PAR = 1 ]; then
  [ $DRY = 1 ] || mkdir -p "$LOGS"
  # Umfang auto: Version im manifest X.Y.Z mit Z>0 = Patch, sonst voll.
  VER="$(python3 -c 'import json;print(json.load(open("custom_components/casora/manifest.json"))["version"])' 2>/dev/null)"
  if [ "$UMFANG" = auto ]; then
    case "$VER" in *.0|"") UMFANG=voll; echo "Umfang: voll (Version ${VER:-?})" ;;
      *) UMFANG=patch; echo "Umfang: patch (Version $VER – Patch-Release; volles Gate mit --voll)" ;; esac
  fi
  if [ "$UMFANG" = patch ]; then
    [ -n "$BASIS" ] || BASIS="$(last_green)"
    if [ -z "$BASIS" ]; then
      echo "Kein grünes volles Gate als Vorfahre von HEAD – Patch-Gate braucht diesen Bezug. Volles Gate läuft (oder --basis <commit>)."
      UMFANG=voll
    else
      BASIS="$(git rev-parse --verify -q "$BASIS^{commit}")" || { echo "--basis: unbekannter Commit" >&2; exit 2; }
      "$NODE" dev/qa/auswahl.mjs --basis "$BASIS" --out "$AUSWAHL" | tee "$([ $DRY = 1 ] && echo /dev/null || echo "$LOGS/auswahl.log")" || exit 2
      apply_auswahl "$AUSWAHL" || exit 2
    fi
  elif [ "$UMFANG" = nachholen ]; then
    "$NODE" dev/qa/nachholen.mjs ${NACHVON:+--von "$NACHVON"} --out "$AUSWAHL" | tee "$([ $DRY = 1 ] && echo /dev/null || echo "$LOGS/nachholen.log")"
    [ "${PIPESTATUS[0]}" = 0 ] || exit 2
    apply_auswahl "$AUSWAHL" || exit 2
  fi
  [ $QUICK = 1 ] && RUN_STRESS=0
  { s_reg || s_crawl; } || RUN_STRESS=0
  f_reg || RUN_FRISCH=0
  { a_e2e || a_reg || a_crawl; } || RUN_ARBEIT=0
  [ $ha_needed = 1 ] || { RUN_ARBEIT=0; RUN_STRESS=0; RUN_FRISCH=0; }
  [ $((RUN_ARBEIT + RUN_STRESS + RUN_FRISCH)) = 0 ] && ha_needed=0
  PARDIR="$(mktemp -d -t casora-gate-par)"; LATEFLAG="$PARDIR/spaet-bereit"
  if [ $ha_needed = 1 ]; then
    NHAS="$(plan_has)"
    # HAs verteilen: erst je laufendem Zustand eins, dann arbeit (längster Zustand) bis 3, stress bis 2 –
    # aber nur so viele, wie die geschätzte Arbeit lohnt (~7 min je HA; ein HA starten kostet ~1 min).
    ea=0; es=0
    [ $RUN_ARBEIT = 1 ] && ea=$(est_state arbeit "$A_KOMPLETT" "$A_E2E,$A_REG,$A_TEILE")
    [ $RUN_STRESS = 1 ] && es=$(est_state stress "$S_KOMPLETT" "$S_REG")
    wa=$(( (ea + 419) / 420 )); [ $wa -gt 3 ] && wa=3; [ $wa -lt 1 ] && wa=1
    ws=$(( (es + 419) / 420 )); [ $ws -gt 2 ] && ws=2; [ $ws -lt 1 ] && ws=1
    spare=$((NHAS - RUN_ARBEIT - RUN_STRESS - RUN_FRISCH))
    while [ $spare -gt 0 ]; do
      if [ $RUN_ARBEIT = 1 ] && [ $A_N -lt $wa ] && { [ $A_N -le $S_N ] || [ $RUN_STRESS = 0 ] || [ $S_N -ge $ws ]; }; then A_N=$((A_N + 1))
      elif [ $RUN_STRESS = 1 ] && [ $S_N -lt $ws ]; then S_N=$((S_N + 1))
      else break; fi
      spare=$((spare - 1))
    done
    # Das HA nach frisch geht an den Zustand mit der meisten Arbeit je HA.
    if [ "$RUN_FRISCH" = 1 ] && [ "$NHAS" -ge 3 ]; then
      if [ $RUN_ARBEIT = 1 ] && [ $RUN_STRESS = 1 ]; then
        if [ $((ea / A_N)) -ge $((es / S_N)) ]; then LATE=arbeit; else LATE=stress; fi
      elif [ $RUN_ARBEIT = 1 ] && [ $ea -gt 600 ]; then LATE=arbeit
      elif [ $RUN_STRESS = 1 ] && [ $es -gt 600 ]; then LATE=stress; fi
      [ "$LATE" = arbeit ] && ! { a_reg || a_crawl; } && LATE=""
    fi
    if [ $DRY = 0 ]; then
      # Nur die eigenen Namen zählen: Wegwerf-HAs von Agenten (andere Namen/Ports) dürfen weiterlaufen (08.10.2026).
      if docker ps --format '{{.Names}}' | grep -qE '^casora-gate-(arbeit|arbeit2|arbeit3|stress|stress2|frisch|spaet)$'; then
        echo "Es laufen schon Gate-Test-HAs (casora-gate-arbeit/stress/frisch …) – läuft ein anderes Gate? Sonst: docker rm -f \$(docker ps -aq --filter name=casora-gate-)" >&2
        rm -rf "$PARDIR"; exit 2
      fi
    fi
  fi
  if [ $DRY = 0 ]; then
    vorab "$ha_needed" || { rm -rf "$PARDIR"; exit 2; }
    trap par_cleanup EXIT
    trap 'echo "Abbruch – räume Test-HAs auf"; exit 130' INT TERM
    # i18n einmal bauen (wegwerf-ha.sh kopiert nur); danach dürfen die statischen Prüfungen los.
    python3 tools/build-i18n.py >/dev/null && $PY tools/build-panel-i18n.py >/dev/null || echo "i18n-Bau fehlgeschlagen (statische Prüfung meldet es)"
    touch "$SYNCFLAG"
  fi
elif [ $DRY = 0 ]; then
  vorab "$ha_needed" || exit 2
fi

if [ $DRY = 1 ]; then
  echo "Gate-Plan für ${COMMIT:0:12}$([ $DIRTY = 1 ] && echo ' (Arbeitsstand geändert)')$([ $QUICK = 1 ] && echo ' – schnell')${ONLY:+ – nur $ONLY}$([ $NOSWITCH = 1 ] && echo " – ohne Umschalten (aktiv: $CUR)") – Umfang $UMFANG${BASIS:+ (Bezug ${BASIS:0:12})}$([ $PAR = 1 ] && [ $ha_needed = 1 ] && echo " – parallel auf bis zu $NHAS Wegwerf-HAs") – $JOBS Test(s) je HA"
fi

if [ $stat_needed = 1 ]; then
  if [ $ha_needed = 1 ] && { [ $PAR = 1 ] || [ "$JOBS" -gt 1 ]; } && [ $DRY = 0 ]; then
    [ $NOSWITCH = 1 ] && touch "$SYNCFLAG"   # nichts wird eingespielt – sofort los
    static_bg
  else
    static_steps
    if [ $DRY = 1 ]; then
      if [ $ha_needed = 1 ] && { [ $PAR = 1 ] || [ "$JOBS" -gt 1 ]; }; then echo "   (1+2 laufen im Hintergrund – $([ $NOSWITCH = 1 ] && echo "parallel zu den Tests" || echo "sobald der Arbeitsstand eingespielt ist, parallel zum HA-Start"))"
      else est 20; fi
    fi
  fi
fi

if [ $ha_needed = 1 ]; then
  if [ $PAR = 1 ]; then
    if [ $DRY = 1 ]; then
      echo "3) Zustände gleichzeitig auf Wegwerf-HAs (casora-test bleibt unberührt):"
      if [ $RUN_ARBEIT = 1 ]; then
        echo "   arbeit  :$PORT_ARBEIT$([ $A_N -ge 2 ] && echo " + :$PORT_ARBEIT2")$([ $A_N -ge 3 ] && echo " + :$PORT_ARBEIT3")$([ "$LATE" = arbeit ] && echo " (+ :$PORT_SPAET nach frisch)") – $([ $A_KOMPLETT = 1 ] && echo "E2E + Regress: $(regress_names arbeit)+ schneller Klick-Durchlauf" || echo "${A_E2E:+E2E $A_E2E }${A_REG:+Regress $A_REG }${A_TEILE:+Klick-Durchlauf $A_TEILE}")"
        POOL_EST="$PARDIR/est-arbeit" run_arbeit
      fi
      if [ $RUN_FRISCH = 1 ]; then
        echo "   frisch  :$PORT_FRISCH – Regress: $([ $F_KOMPLETT = 1 ] && regress_names frisch || echo "$F_REG ")$([ -n "$LATE" ] && echo "– danach weiteres $LATE-HA :$PORT_SPAET")"
        POOL_EST="$PARDIR/est-frisch" run_frisch
      fi
      if [ $RUN_STRESS = 1 ]; then
        echo "   stress  :$PORT_STRESS$([ $S_N -ge 2 ] && echo " + :$PORT_STRESS2")$([ "$LATE" = stress ] && echo " (+ :$PORT_SPAET nach frisch)")$([ "$NHAS" -le 2 ] && [ $RUN_FRISCH = 1 ] && echo " (erst nach frisch – Speicher)") – $([ $S_KOMPLETT = 1 ] && echo "voller Klick-Durchlauf + Regress: $(regress_names stress)" || echo "${S_REG:+Regress $S_REG}$([ $S_CRAWL = 1 ] && echo ' voller Klick-Durchlauf')")"
        POOL_EST="$PARDIR/est-stress" run_stress
      fi
    else
      PIDS=""
      if [ $RUN_ARBEIT = 1 ]; then ( run_arbeit; for n in arbeit arbeit2 arbeit3; do sh dev/qa/wegwerf-ha.sh weg $n; done; [ "$LATE" = arbeit ] && sh dev/qa/wegwerf-ha.sh weg spaet ) 2>&1 | prefix arbeit & PIDS="$PIDS $!"; fi
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
  echo "Ergebnis: .qa/gate-$COMMIT.json (Umfang $UMFANG)"
  rm -rf "$STEPS" "$BGOUT" "$ESTF" "$PARDIR" "$TESTS" "$AUSWAHL"; exit 0
fi
if [ $DRY = 1 ]; then
  tot=$(awk '{s+=$1} END {print s+0}' "$ESTF")
  echo "Geschätzte Dauer: ~$((tot / 60)) min $((tot % 60)) s (seriell zuletzt ~33 min; Schätzung aus .qa/zeiten.json bzw. den letzten Protokollen)"
  echo "Ergebnis: .qa/gate-$COMMIT.json"
  rm -f "$STEPS" "$BGOUT" "$ESTF" "$TESTS" "$AUSWAHL"; exit 0
fi

# ── Ergebnis ────────────────────────────────────────────────────────────────────────────
PARTIAL=0; { [ -n "$ONLY" ] || [ $NOSWITCH = 1 ]; } && PARTIAL=1
MODE=seriell; [ $PAR = 1 ] && MODE="parallel/$NHAS"
python3 - "$STEPS" "$RES" "$COMMIT" "$DIRTY" "$QUICK" "$PARTIAL" "$START" "$ONLY" "$MODE" "$UMFANG" "$BASIS" "$TESTS" "$AUSWAHL" "$REPO" <<'PY'
import datetime, json, os, sys, time
(steps_f, res, commit, dirty, quick, partial, start, only, mode, umfang, basis, tests_f, auswahl_f, repo) = sys.argv[1:15]
steps = []
for line in open(steps_f, encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    sid, group, rc, dt, log = p[:5]
    steps.append({"id": sid, "group": group, "ok": rc == "0", "seconds": int(dt), "log": log,
                  **({"wackler": p[5].split(",")} if len(p) > 5 and p[5] else {})})
tests = []
for line in open(tests_f, encoding="utf-8"):
    z, sid, tid, ok, wk, dt, log, locks = (line.rstrip("\n").split("\t") + [""] * 8)[:8]
    tests.append({"zustand": z, "schritt": sid, "id": tid, "ok": ok == "1", "wackelt": wk == "1",
                  "seconds": int(dt or 0), "log": log, "commit": commit})
auswahl = None
try: auswahl = json.load(open(auswahl_f, encoding="utf-8"))
except Exception: pass
doc = {"commit": commit, "timestamp": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
       "seconds": int(time.time()) - int(start), "dirty": dirty == "1", "quick": quick == "1",
       "partial": partial == "1", "only": only or None, "mode": mode, "umfang": umfang}

if umfang == "nachholen" and auswahl:
    # Vorlauf übernehmen: seine Tests/Schritte, ersetzt durch die neu gelaufenen. Statisch/Unit und
    # Aufbau-Schritte (haus-*, *-setup) dieses Laufs kommen dazu, die des Vorlaufs bleiben stehen.
    prev = json.load(open(auswahl["vorlauf"], encoding="utf-8"))
    new_ids = {(t["zustand"], t["id"]) for t in tests}
    kept = [t for t in prev.get("tests", []) if (t["zustand"], t["id"]) not in new_ids]
    for t in kept: t.setdefault("commit", prev["commit"])
    all_tests = kept + tests
    new_steps = {s["id"]: s for s in steps}
    merged = []
    for s in prev.get("steps", []):
        if s["group"] in ("static", "unit"): continue          # laufen jedes Mal neu
        n = new_steps.pop(s["id"], None)
        if n is None:
            merged.append({**s, "von": s.get("von", prev["commit"])})
        elif s["group"] in ("e2e", "regress"):
            mine = [t for t in all_tests if t["schritt"] == s["id"]]
            merged.append({**n, "ok": bool(mine) and all(t["ok"] for t in mine), "nachgeholt": True,
                           "wackler": sorted({w for x in (s.get("wackler", []), n.get("wackler", [])) for w in x if any(t["id"] == w and t["wackelt"] for t in mine)})})
        else:
            merged.append({**n, "nachgeholt": True})
    for sid, n in new_steps.items():
        if n["group"] == "ha" and any(m["id"] == sid for m in merged): sid = sid + "@nachholen"
        merged.append({**n, "id": sid})
    steps, tests = merged, all_tests
    doc["umfang"] = prev.get("umfang", "voll")
    basis = prev.get("basis") or ""
    doc["nachgeholt"] = {"von": prev["commit"], "vorlauf": os.path.relpath(auswahl["vorlauf"], repo),
                         "neu_gelaufen": sorted(f"{z}/{i}" for z, i in new_ids),
                         "uebernommen": len(kept), "geaendert": auswahl.get("geaendert", [])}
elif umfang == "patch" and auswahl:
    doc["auswahl"] = {"dateien": [{"datei": f["file"], "tests": f["tests"], "zustaende": f["states"], "grund": f["grund"]} for f in auswahl["files"]],
                      "zustaende": auswahl["states"]}
if basis: doc["basis"] = basis
ok = bool(steps) and all(s["ok"] for s in steps)
doc["ok"] = ok
doc["wackler"] = [{"zustand": t["zustand"], "test": t["id"], "log": t["log"]} for t in tests if t.get("wackelt")]
doc["steps"] = steps
doc["tests"] = tests
json.dump(doc, open(res, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print()
art = {"voll": "volles Gate", "patch": f"Patch-Gate (Bezug {basis[:12]})"}.get(doc["umfang"], doc["umfang"])
print(f"Gate {commit[:12]}: {'GRÜN' if ok else 'ROT'} – {art} – {sum(s['ok'] for s in steps)}/{len(steps)} Schritte ok, "
      f"{len(tests)} Tests, {doc['seconds'] // 60} min {doc['seconds'] % 60} s"
      + (" (schnell)" if doc["quick"] else "") + (" (teilweise)" if doc["partial"] else "")
      + (f" (nachgeholt auf {doc['nachgeholt']['von'][:12]}: {len(doc['nachgeholt']['neu_gelaufen'])} neu, {doc['nachgeholt']['uebernommen']} übernommen)" if "nachgeholt" in doc else "")
      + (" (Arbeitsstand nicht committet)" if doc["dirty"] else ""))
for s in steps:
    if not s["ok"]:
        print(f"  FEHLER {s['id']}: {s['log']}")
        for t in tests:
            if t["schritt"] == s["id"] and not t["ok"]: print(f"     rot: {t['id']}  {t['log']}")
if doc["wackler"]:
    print("  Wackler (im Lauf rot, Gegenprobe grün – zählen als bestanden): " + ", ".join(f"{w['zustand']}/{w['test']}" for w in doc["wackler"]))
print("Zeiten: " + " · ".join(f"{s['id']} {s['seconds']}s" for s in steps if not s.get("von")))
print("  (Schritte eines Zustands laufen gleichzeitig" + (", die Zustände auch untereinander" if mode != "seriell" else "")
      + " – Einzelteile in .qa/logs/<commit>/zeiten-<zustand>.log)")
if not ok and any(t for t in tests if not t["ok"]):
    print("Nur Tests rot? Tests anpassen, committen und nachholen: dev/qa/gate.sh --nachholen")
print(f"Ergebnis: {res}")
sys.exit(0 if ok else 1)
PY
FAILED=$?
rm -f "$STEPS" "$BGOUT" "$ESTF" "$TESTS" "$AUSWAHL"
exit $FAILED
