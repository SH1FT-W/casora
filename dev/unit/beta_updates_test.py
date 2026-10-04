"""Beta-Versionen: Auswahl des angebotenen Casora-Releases und Versionsvergleich.

  uv run --python 3.14 --with homeassistant python dev/unit/beta_updates_test.py

Prüft release_notes.compare_versions/latest_casora und update.pick_latest/beta_enabled
ohne HA-Kern: Schalter aus (nur stabile), an (höchste Version inkl. Vorabversionen),
Beta installiert und Schalter aus (erst die nächste höhere stabile, kein Zurückstufen),
Entwürfe und Karten-Tags zählen nie; dazu die Reihenfolge der Studio-Liste.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import release_notes  # noqa: E402
from custom_components.casora.release_notes import (  # noqa: E402
    compare_versions, from_github, is_prerelease, latest_casora, merge_releases, newer,
)
from custom_components.casora.update import beta_enabled, pick_latest  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def rel(tag, pre=False, draft=False):
    return {"tag_name": tag, "prerelease": pre, "draft": draft, "body": "", "published_at": "2026-10-04T08:00:00Z",
            "html_url": f"https://github.com/OWNER/casora/releases/tag/{tag}"}


# ── Versionsvergleich ───────────────────────────────────────────────────────
for a, b in (("1.1.0-beta.2", "1.1.0-beta.1"), ("1.1.0-beta.1", "1.0.3"), ("1.1.0", "1.1.0-beta.2"),
             ("v1.1.0-beta.10", "1.1.0-beta.9"), ("1.1.0-rc.1", "1.1.0-beta.3"), ("1.0.10", "1.0.9")):
    check(f"{a} > {b}", newer(a, b) and not newer(b, a) and compare_versions(a, b) == 1)
check("v1.0.3 == 1.0.3", compare_versions("v1.0.3", "1.0.3") == 0)
check("Vorabversion erkannt", is_prerelease("v1.1.0-beta.1") and not is_prerelease("1.0.3"))
# Ohne AwesomeVersion (einfacher Vergleich) dasselbe Ergebnis
saved = release_notes.AwesomeVersion
release_notes.AwesomeVersion = None
try:
    check("ohne AwesomeVersion: gleiche Reihenfolge",
          newer("1.1.0-beta.2", "1.1.0-beta.1") and newer("1.1.0", "1.1.0-beta.2") and newer("1.1.0-beta.1", "1.0.3")
          and newer("1.1.0-beta.10", "1.1.0-beta.9") and compare_versions("v1.0.3", "1.0.3") == 0)
finally:
    release_notes.AwesomeVersion = saved

# ── Auswahl ────────────────────────────────────────────────────────────────
RELS = [rel("karten-2026-10-03"), rel("v1.1.0-beta.1", pre=True), rel("v1.1.0-beta.2", pre=True),
        rel("v1.1.0-beta.3", pre=True, draft=True), rel("v1.2.0", draft=True), rel("v1.0.3"), rel("v1.0.2")]

r, latest = pick_latest(RELS, "1.0.2", beta=False)
check("aus: nur stabile → 1.0.3", r and r["tag_name"] == "v1.0.3" and latest == "1.0.3", (r, latest))
r, latest = pick_latest(RELS, "1.0.2", beta=True)
check("an: höchste Beta → 1.1.0-beta.2 (Entwurf beta.3 ignoriert)", r and r["tag_name"] == "v1.1.0-beta.2"
      and latest == "1.1.0-beta.2", (r, latest))
check("Entwürfe nie, auch nicht stabil (v1.2.0)", latest_casora(RELS, beta=True)["tag_name"] != "v1.2.0")
r, latest = pick_latest(RELS + [rel("v1.1.0")], "1.0.3", beta=True)
check("an: stabile 1.1.0 schlägt 1.1.0-beta.2", latest == "1.1.0", latest)

# Beta installiert, Schalter aus: kein Zurückstufen auf 1.0.3 …
r, latest = pick_latest(RELS, "1.1.0-beta.1", beta=False)
check("Beta installiert + aus: bleibt auf 1.1.0-beta.1", latest == "1.1.0-beta.1", latest)
# … aber die nächste höhere stabile kommt.
r, latest = pick_latest(RELS + [rel("v1.1.0")], "1.1.0-beta.2", beta=False)
check("Beta installiert + aus: stabile 1.1.0 wird angeboten", latest == "1.1.0" and r["tag_name"] == "v1.1.0", latest)
r, latest = pick_latest(RELS, "1.1.0-beta.1", beta=True)
check("Beta installiert + an: nächste Beta", latest == "1.1.0-beta.2", latest)
r, latest = pick_latest([rel("karten-2026-10-03")], "1.0.3", beta=True)
check("kein Casora-Release: nichts", r is None and latest == "1.0.3")

# ── Option ─────────────────────────────────────────────────────────────────
check("Option Standard aus", not beta_enabled(SimpleNamespace(options={})) and not beta_enabled(None))
check("Option an", beta_enabled(SimpleNamespace(options={"beta_updates": True})))

# ── Studio-Liste: neueste zuerst, Beta-Kennzeichen ──────────────────────────
order = [e["version"] for e in merge_releases(from_github(RELS + [rel("v1.1.0")]), [])]
check("Liste: 1.1.0, beta.2, beta.1, 1.0.3, 1.0.2",
      order == ["1.1.0", "1.1.0-beta.2", "1.1.0-beta.1", "1.0.3", "1.0.2"], order)
check("Liste: Betas als prerelease markiert", [e["prerelease"] for e in from_github(RELS)][:2] == [True, True])

print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER"))
sys.exit(1 if fails else 0)
