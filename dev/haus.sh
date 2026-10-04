#!/bin/sh
# Ein Docker-HA für Casora (Container „casora-test“, Port 8124) mit drei Zuständen:
#   arbeit – Testhaus mit Hemma-Dashboards und Einstellungen (Entwicklung, dev/e2e)
#   frisch – wie ein neuer Nutzer: nur Hemma-Dashboards, nichts von Casora eingerichtet
#   demo   – neutrales englisches Demo-Haus für README-/Website-Bilder
#   stress – wie „frisch“ + erfundenes Stresshaus (dev/stress/stress_fixture.py: 15 Räume mit langen
#            Namen, 36 Szenen, 30 Lichter, Schlösser/Kameras/Medien …) für dev/qa/alles.mjs
#
#   dev/haus.sh              zeigt den aktiven Zustand
#   dev/haus.sh arbeit|demo  wechselt dorthin (Stand von zuletzt)
#   dev/haus.sh frisch       wechselt zu „frisch“ – immer neu aus der Vorlage, auch zum Zurücksetzen
#   dev/haus.sh stress       wie frisch (aus frisch.tgz), dazu stress.json neben die Mock-Fixture
#   dev/haus.sh sync         spielt den Arbeitsstand des Repos ein und startet neu
#   dev/haus.sh wait         wartet, bis das Test-HA bereit ist (nach --no-wait)
#
# Zusätze: --no-wait (Wechsel/sync: starten, aber nicht auf „bereit“ warten – dann „wait“),
#   sync --if-changed (nur neu starten, wenn sich der eingespielte Stand seit dem letzten
#   Start geändert hat oder der Container nicht läuft), sync --no-restart (nur einspielen).
# „Bereit“ heißt: manifest.json antwortet, dann dev/qa/bereit.mjs (Anmeldung, WebSocket,
# HA-Zustand RUNNING, einige Sekunden ohne Aufbau-Ereignisse, Casora-Befehl antwortet).
# Geht das nicht (kein node/Zugang), wie früher 15 s Pause.
#
# „arbeit“ und „demo“ werden beim Verlassen gesichert, „frisch“ und „stress“ verworfen
# (stress hat keine eigene Sicherung – es entsteht bei jedem Wechsel neu aus frisch.tgz).
# Die Test-Fixture (echtes Haus, anonymisiert) kommt NIE in „demo“ – dort wird die
# neutrale aus dev/demo/demo_fixture.py erzeugt. Ablage: ~/casora-haus/
set -e
H="$HOME/casora-haus"
CFG="$H/config"
AKTIV="$H/aktiv"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
now=$(cat "$AKTIV" 2>/dev/null || echo "?")

sync_repo() {
  cd "$REPO"
  python3 tools/build-i18n.py >/dev/null
  uv run --python 3.14 tools/build-panel-i18n.py >/dev/null
  rsync -a --delete --exclude __pycache__ --exclude panel/casora-studio.js custom_components/casora/ "$CFG/custom_components/casora/"
  if [ "$(cat "$AKTIV")" = "demo" ]; then
    rsync -a --exclude __pycache__ --exclude fixture.json dev/casora_mock/ "$CFG/custom_components/casora_mock/"
    (cd /tmp && python3 "$REPO/dev/demo/demo_fixture.py" "$CFG/custom_components/casora_mock/fixture.json" >/dev/null)
  else
    rsync -a --exclude __pycache__ --exclude stress.json dev/casora_mock/ "$CFG/custom_components/casora_mock/"
  fi
  # Stresshaus nur im Zustand „stress“; sonst eine alte Datei sicher entfernen.
  if [ "$(cat "$AKTIV")" = "stress" ]; then
    python3 "$REPO/dev/stress/stress_fixture.py" "$CFG/custom_components/casora_mock/stress.json" >/dev/null
  else
    rm -f "$CFG/custom_components/casora_mock/stress.json"
  fi
}

NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node || true)"
GELADEN="$H/geladen"   # „<zustand> <prüfsumme>“ des Stands, den das laufende HA geladen hat

# Prüfsumme des eingespielten Stands (Inhalt, nicht Zeitstempel).
tree_hash() {
  (cd "$CFG/custom_components" && find casora casora_mock -type f ! -path '*/__pycache__/*' -print0 2>/dev/null \
    | LC_ALL=C sort -z | xargs -0 shasum 2>/dev/null | shasum | cut -c1-40)
}

# Vor jedem (Neu-)Start: merken, welcher Stand gleich geladen wird; „wait“ bestätigt ihn.
mark_start() { rm -f "$GELADEN"; echo "$(cat "$AKTIV") $(tree_hash)" > "$GELADEN.neu"; }

wait_up() {
  i=0; until curl -s -o /dev/null -w '%{http_code}' http://localhost:8124/manifest.json | grep -q 200; do i=$((i+1)); [ $i -gt 90 ] && exit 1; /bin/sleep 2; done
  if [ -n "$NODE" ] && [ -f "$REPO/dev/qa/bereit.mjs" ] && "$NODE" "$REPO/dev/qa/bereit.mjs" --max 60; then :; else
    echo "(Bereitschaft nicht prüfbar – feste Pause 15 s)"; /bin/sleep 15
  fi
  [ -f "$GELADEN.neu" ] && mv "$GELADEN.neu" "$GELADEN"
  echo "casora-test bereit: $(cat "$AKTIV")"
}

NOWAIT=0; IFCHANGED=0; NORESTART=0
for a in "$@"; do
  case "$a" in --no-wait) NOWAIT=1 ;; --if-changed) IFCHANGED=1 ;; --no-restart) NORESTART=1 ;; esac
done

if [ -z "$1" ]; then echo "aktiv: $now"; exit 0; fi
if [ "$1" = "wait" ]; then wait_up; exit 0; fi
if [ "$1" = "sync" ]; then
  sync_repo
  [ $NORESTART = 1 ] && exit 0
  if [ $IFCHANGED = 1 ] && [ "$(docker inspect -f '{{.State.Running}}' casora-test 2>/dev/null)" = "true" ] \
     && [ "$(cat "$GELADEN" 2>/dev/null)" = "$(cat "$AKTIV") $(tree_hash)" ]; then
    echo "unverändert geladen: $(cat "$AKTIV") – kein Neustart"
    [ $NOWAIT = 1 ] || wait_up
    exit 0
  fi
  mark_start
  docker restart casora-test >/dev/null
  [ $NOWAIT = 1 ] || wait_up
  exit 0
fi
case "$1" in arbeit|frisch|demo|stress) ;; *) echo "Aufruf: $0 [arbeit|frisch|demo|stress|sync|wait] [--no-wait]" >&2; exit 2 ;; esac
if [ "$1" = "$now" ] && [ "$1" != "frisch" ] && [ "$1" != "stress" ]; then echo "schon aktiv: $1"; exit 0; fi

rm -f "$GELADEN"
docker stop casora-test >/dev/null
if [ "$now" = "arbeit" ] || [ "$now" = "demo" ]; then
  # Erst in eine neue Datei, dann tauschen – ein Abbruch lässt die alte Sicherung heil.
  tar -czf "$H/zustaende/$now.tgz.neu" -C "$H" config
  mv "$H/zustaende/$now.tgz.neu" "$H/zustaende/$now.tgz"
fi
rm -rf "$CFG"
SRC="$1"; [ "$1" = "stress" ] && SRC=frisch
tar -xzf "$H/zustaende/$SRC.tgz" -C "$H"
echo "$1" > "$AKTIV"
sync_repo
mark_start
docker start casora-test >/dev/null
[ $NOWAIT = 1 ] || wait_up
