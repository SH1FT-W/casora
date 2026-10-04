#!/bin/sh
# Wechselt ins englische Demo-Haus (Zustand „demo“ in casora-test, Port 8124) und spielt
# den Arbeitsstand ein. Demo-Haus = dev/demo/demo_fixture.py (neutral) – Quelle für Screenshots.
set -e
D="$(dirname "$0")"
[ "$("$D/haus.sh")" = "aktiv: demo" ] || "$D/haus.sh" demo >/dev/null
exec "$D/haus.sh" sync "$@"
