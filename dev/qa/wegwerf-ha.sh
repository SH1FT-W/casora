#!/bin/sh
# Wegwerf-Test-HA fürs parallele Gate (dev/qa/gate.sh): je Zustand ein eigener Docker-Container
# „casora-gate-<name>“ mit einer Kopie des Zustands aus ~/casora-haus/zustaende/ – casora-test
# (:8124) und ~/casora-haus/config bleiben unberührt.
#
#   dev/qa/wegwerf-ha.sh start <name> <port> arbeit|frisch|stress   anlegen + starten (ohne Warten)
#   dev/qa/wegwerf-ha.sh wait  <name> <port>                         warten, bis es bereit ist
#   dev/qa/wegwerf-ha.sh weg   <name>                                Container + Daten entfernen
#
# Eingespielt wird wie bei dev/haus.sh sync der Arbeitsstand dieses Checkouts (custom_components/casora
# und dev/casora_mock, im Zustand stress dazu stress.json). Die i18n-Dateien baut gate.sh vorher
# einmal (build-i18n) – hier wird nur kopiert. Daten: ~/casora-agents/gate/<name>/config
set -e
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
NODE="${NODE:-/opt/homebrew/opt/node@22/bin/node}"
[ -x "$NODE" ] || NODE="$(command -v node)"
cmd="$1"; name="$2"
case "$name" in ''|*[!a-z0-9-]*) echo "wegwerf-ha: Name nur a-z0-9-" >&2; exit 2 ;; esac
N="casora-gate-$name"; D="$HOME/casora-agents/gate/$name"

case "$cmd" in
  weg)
    docker rm -f "$N" >/dev/null 2>&1 || true
    rm -rf "$D"
    exit 0 ;;
  wait)
    P="$3"
    i=0; until curl -s -o /dev/null -w '%{http_code}' "http://localhost:$P/manifest.json" | grep -q 200; do
      i=$((i+1)); [ $i -gt 120 ] && { echo "$N antwortet nicht (Port $P)"; docker logs --tail 30 "$N" 2>&1; exit 1; }; /bin/sleep 2
    done
    CASORA_URL="http://localhost:$P" "$NODE" "$REPO/dev/qa/bereit.mjs" --max 120
    echo "$N bereit (Port $P)"
    exit 0 ;;
  start) ;;
  *) echo "Aufruf: $0 start <name> <port> <zustand> | wait <name> <port> | weg <name>" >&2; exit 2 ;;
esac

P="$3"; Z="$4"
case "$P" in ''|*[!0-9]*|8124|8123) echo "wegwerf-ha: Port $P nicht erlaubt" >&2; exit 2 ;; esac
case "$Z" in arbeit|frisch|stress) ;; *) echo "wegwerf-ha: Zustand arbeit|frisch|stress" >&2; exit 2 ;; esac
SRC="$Z"; [ "$Z" = stress ] && SRC=frisch
TGZ="$HOME/casora-haus/zustaende/$SRC.tgz"
[ -f "$TGZ" ] || { echo "wegwerf-ha: $TGZ fehlt" >&2; exit 1; }

docker rm -f "$N" >/dev/null 2>&1 || true
rm -rf "$D"; mkdir -p "$D"
tar -xzf "$TGZ" -C "$D"
CFG="$D/config"
rsync -a --delete --exclude __pycache__ --exclude panel/casora-studio.js "$REPO/custom_components/casora/" "$CFG/custom_components/casora/"
rsync -a --exclude __pycache__ --exclude stress.json "$REPO/dev/casora_mock/" "$CFG/custom_components/casora_mock/"
if [ "$Z" = stress ]; then
  python3 "$REPO/dev/stress/stress_fixture.py" "$CFG/custom_components/casora_mock/stress.json" >/dev/null
else
  rm -f "$CFG/custom_components/casora_mock/stress.json"
fi
echo "$Z" > "$D/zustand"
IMG="$(docker inspect casora-test --format '{{.Config.Image}}' 2>/dev/null || echo ghcr.io/home-assistant/home-assistant:stable)"
docker run -d --name "$N" --label casora-gate=1 -p "$P:8123" -v "$CFG:/config" -e TZ=Europe/Berlin "$IMG" >/dev/null
echo "$N gestartet: $Z auf Port $P"
