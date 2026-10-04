"""Theme schon beim HA-Start (helfer.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/theme_frueh_test.py

Casora legt seine Themes als Kopie in den Theme-Ordner, den configuration.yaml per
„frontend: themes: !include_dir_merge_named …“ lädt. Ohne diese Zeile schreibt es nichts.
Die Anmeldung ersetzt eine ältere Kopie durch den aktuellen Stand.
"""

from __future__ import annotations

import os
import sys
import tempfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.util.yaml import load_yaml  # noqa: E402

from custom_components.casora.helfer import (  # noqa: E402
    THEME_FILE,
    _inject_theme,
    _load_theme,
    _themes_dir,
    _write_theme_file,
    remove_theme_file,
)

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


themes = _load_theme()
check({"Casora Standard", "Casora Glass", "Casora Weich"} <= set(themes), "alle drei Casora-Themes geladen")

with tempfile.TemporaryDirectory() as d:
    cfg = os.path.join(d, "configuration.yaml")
    # 1. Ohne themes-Zeile: nichts schreiben
    with open(cfg, "w") as f:
        f.write("homeassistant:\n  name: x\nfrontend:\n")
    os.mkdir(os.path.join(d, "themes"))
    check(_themes_dir(d) is None, "ohne include kein Ordner")
    check(_write_theme_file(d, themes) is None, "ohne include keine Datei")
    check(os.listdir(os.path.join(d, "themes")) == [], "Ordner bleibt leer")

    # 2. Mit Standardzeile: Datei liegt dort, lädt wie HA sie lädt, gleich den Themes
    with open(cfg, "w") as f:
        f.write("frontend:\n  themes: !include_dir_merge_named themes  # Kommentar\n")
    path = _write_theme_file(d, themes)
    check(path == os.path.join(d, "themes", THEME_FILE), f"Datei im Theme-Ordner ({path})")
    loaded = load_yaml(path)
    check(loaded == themes, "Kopie entspricht den Themes")
    mtime = os.path.getmtime(path)
    os.utime(path, (mtime - 100, mtime - 100))
    _write_theme_file(d, themes)
    check(os.path.getmtime(path) == mtime - 100, "unverändert: nicht neu geschrieben")
    with open(os.path.join(d, "configuration.yaml")) as f:
        check("include_dir_merge_named themes" in f.read(), "configuration.yaml unverändert")

    # 3. Ordner fehlt: nichts anlegen
    with open(cfg, "w") as f:
        f.write("frontend:\n  themes: !include_dir_merge_named 'meine_themes'\n")
    check(_themes_dir(d) is None, "fehlender Ordner wird nicht angelegt")

    # 4. Entfernen
    with open(cfg, "w") as f:
        f.write("frontend:\n  themes: !include_dir_merge_named themes\n")
    remove_theme_file(d)
    check(not os.path.exists(path), "Datei beim Entfernen gelöscht")

# 5. Anmeldung ersetzt eine ältere Kopie (aus dem Theme-Ordner geladen), sonst nichts
old = dict(themes["Casora Weich"], **{"primary-color": "#000000"})
store = {"Casora Weich": old, "Eigenes": {"primary-color": "#123456"}}
hass = SimpleNamespace(data={"frontend_themes": store})
check(_inject_theme(hass, themes) is True, "ältere Kopie → neu angemeldet")
check(store["Casora Weich"] == themes["Casora Weich"], "aktueller Stand ersetzt die Kopie")
check(store["Eigenes"] == {"primary-color": "#123456"}, "fremdes Theme unberührt")
check(_inject_theme(hass, themes) is False, "gleicher Stand → kein erneutes themes_updated")

print("OK" if not FAILS else f"{len(FAILS)} Fehler")
sys.exit(1 if FAILS else 0)
