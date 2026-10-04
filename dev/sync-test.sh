#!/bin/sh
# Spielt den Arbeitsstand ins Docker-HA (Container casora-test) und startet es neu.
# Nie ins echte HA – das aktualisiert der Nutzer selbst. Zustände: dev/haus.sh
exec "$(dirname "$0")/haus.sh" sync "$@"
