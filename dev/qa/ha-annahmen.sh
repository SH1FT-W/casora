#!/bin/sh
# HA-Annahmen (dev/unit/ha_annahmen_test.py) gegen mehrere Home-Assistant-Versionen prüfen, ohne laufendes HA.
#
#   dev/qa/ha-annahmen.sh                    neueste stabile Version und neueste Beta (Standard)
#   dev/qa/ha-annahmen.sh standard           Standardversion von tools/ha-venv.sh (wie im Gate)
#   dev/qa/ha-annahmen.sh beta 2026.10.1     beliebige Auswahl: standard | stable | beta | <version>
#   HA_VERSION=beta dev/qa/ha-annahmen.sh    nur diese Version (für den HA-Beta-Bericht)
#
# Je Version eine venv aus tools/ha-venv.sh (~/.cache/ha-venv/<version>, beim ersten Mal ein paar Minuten),
# dazu das passende Frontend-Paket (package_constraints.txt), damit auch die hass.entities-Zuordnung geprüft wird.
# Ist gerade keine Beta draußen (neueste Version ohne „b“), wird „beta“ übersprungen.
# Rückgabe ≠ 0, wenn eine Annahme bei einer Version rot ist. Rote Annahme: Test-Docstring sagt, welche
# Casora-Stelle betroffen ist; Liste und Begründung in docs/ha-annahmen.md.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
HAV="$REPO/tools/ha-venv.sh"
TEST="$REPO/dev/unit/ha_annahmen_test.py"

if [ $# -eq 0 ]; then
  if [ -n "${HA_VERSION:-}" ]; then set -- "$HA_VERSION"; else set -- stable beta; fi
fi

bad=0
for want in "$@"; do
  if [ "$want" = standard ]; then venv="$(env -u HA_VERSION "$HAV" install)" || { echo "✗ $want: venv ließ sich nicht anlegen"; bad=1; continue; }
  else venv="$("$HAV" install "$want")" || { echo "✗ $want: venv ließ sich nicht anlegen"; bad=1; continue; }; fi
  ver="$(basename "$venv")"
  case "$want:$ver" in
    beta:*b*) ;;
    beta:*) echo "– beta: gerade keine Beta (neueste Version $ver), übersprungen"; continue ;;
  esac
  py="$venv/bin/python"
  if ! "$py" -c 'import hass_frontend' 2>/dev/null; then
    fe="$(grep -h '^home-assistant-frontend==' "$venv"/lib/python3*/site-packages/homeassistant/package_constraints.txt 2>/dev/null | head -n1)"
    [ -n "$fe" ] && VIRTUAL_ENV="$venv" uv pip install -q "$fe" >/dev/null 2>&1 \
      || echo "  ($want $ver: Frontend-Paket nicht installiert, die Frontend-Annahme wird übersprungen)"
  fi
  out="$("$py" "$TEST" 2>&1)"; rc=$?
  n="$(printf '%s\n' "$out" | sed -n 's/^Ran \([0-9]*\) test.*/\1/p')"
  skip="$(printf '%s\n' "$out" | grep -c '\.\.\. skipped')"
  if [ $rc = 0 ]; then
    echo "✓ $want ($ver): ${n:-?} Annahmen grün$([ "$skip" -gt 0 ] && echo ", $skip übersprungen")"
  else
    bad=1
    echo "✗ $want ($ver): Annahmen rot"
    printf '%s\n' "$out" | sed -nE 's/^(FAIL|ERROR): ([a-z_]+) \(.*\.([A-Za-z]+)\.[a-z_]+\)$/    \1 \3.\2/p'
    printf '%s\n' "$out" | grep -E '^(AssertionError|[A-Za-z]+Error)' | sed 's/^/      /' | head -n 20
  fi
done
exit $bad
