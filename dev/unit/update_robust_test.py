"""Update-Entität und Installation robust (update.py) ohne HA-Kern und ohne Netz.

  uv run --python 3.14 --with homeassistant python dev/unit/update_robust_test.py

B-PY-01: nach „Installieren“ und Neuladen der Integration (Optionen geändert) bietet die neu
          angelegte Entität dieselbe Version nicht noch einmal an.
B-PY-02: bricht das Kopieren der neuen Fassung ab (Speicher voll), bleibt die laufende heil.
B-PY-03: bis zum Neustart bleibt die laufende Fassung im Ordner (Oberfläche passt zum Server-Code);
          eingespielt wird beim Beenden von HA, ein liegengebliebener Wartebereich wird verworfen.
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import sys
import tempfile
import zipfile
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import update  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


def make_zip(version: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        root = "OWNER-casora-abc123/"
        zf.writestr(root + "custom_components/casora/manifest.json", json.dumps({"version": version}))
        zf.writestr(root + "custom_components/casora/neu.py", "x = 1\n")
    return buf.getvalue()


class Hass:
    def __init__(self, cfg: str):
        self.data = {}
        self.config = SimpleNamespace(path=lambda *p: os.path.join(cfg, *p), config_dir=cfg, language="en")
        self.on_stop = []
        self.bus = SimpleNamespace(async_listen_once=lambda ev, cb: self.on_stop.append((ev, cb)) or (lambda: None))

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


REL = {"tag_name": "v9.0.1", "draft": False, "prerelease": False, "body": "- **New:** x",
       "html_url": "https://github.com/OWNER/casora/releases/tag/v9.0.1", "assets": []}


async def main():
    tmp = tempfile.mkdtemp()
    hass = Hass(tmp)

    async def _rels(h):
        return [REL]

    async def _dl(h, tag):
        return make_zip("9.0.1")

    async def _rec(*a):
        return None

    update.fetch_releases = _rels
    update.download_release = _dl
    update.async_record_install = _rec
    update.ir = SimpleNamespace(async_create_issue=lambda *a, **k: None,
                                IssueSeverity=SimpleNamespace(WARNING="warning"))
    target = hass.config.path("custom_components", "casora")
    os.makedirs(target)
    with open(os.path.join(target, "manifest.json"), "w") as fh:
        json.dump({"version": update.VERSION}, fh)

    # ── B-PY-01 ─────────────────────────────────────────────────────────
    ent = update.CasoraUpdate(hass, SimpleNamespace(entry_id="e1", options={}))
    ent.async_write_ha_state = lambda: None
    await ent.async_update()
    check("vorher: 9.0.1 angeboten", ent.latest_version == "9.0.1" and ent.installed_version == update.VERSION)
    await ent.async_install(None, False)
    with open(os.path.join(target, "manifest.json")) as fh:
        before = json.load(fh).get("version")
    check("B-PY-03: bis zum Neustart liegt die laufende Fassung im Ordner", before == update.VERSION, before)
    check("B-PY-03: neue Fassung wartet im Wartebereich",
          os.path.isfile(hass.config.path(update.STAGE_DIR, "neu.py")))
    check("B-PY-03: genau ein Abmelder für das Beenden", len(hass.on_stop) == 1
          and hass.on_stop[0][0] == update.EVENT_HOMEASSISTANT_STOP, repr(hass.on_stop))
    # Optionen geändert → Integration neu geladen → neue Entität, hass.data bleibt.
    ent2 = update.CasoraUpdate(hass, SimpleNamespace(entry_id="e1", options={}))
    ent2.async_write_ha_state = lambda: None
    check("B-PY-01: neue Entität kennt die installierte Version sofort",
          ent2.installed_version == "9.0.1" and ent2.latest_version == "9.0.1", f"{ent2.installed_version}")
    await ent2.async_update()
    check("B-PY-01: nach Prüfung kein erneutes Angebot", ent2.latest_version == ent2.installed_version == "9.0.1",
          f"{ent2.installed_version} → {ent2.latest_version}")
    await ent2.async_install(None, False)
    check("B-PY-03: zweites Installieren meldet sich nicht doppelt an", len(hass.on_stop) == 1)
    # Neuladen mit wartender Fassung: Wartebereich bleibt.
    await update.async_setup_entry(hass, SimpleNamespace(entry_id="e1", options={}), lambda *a, **k: None)
    check("B-PY-03: Neuladen verwirft den Wartebereich nicht", os.path.isdir(hass.config.path(update.STAGE_DIR)))
    await hass.on_stop[0][1](None)
    with open(os.path.join(target, "manifest.json")) as fh:
        after = json.load(fh).get("version")
    check("B-PY-03: beim Beenden eingespielt", after == "9.0.1" and os.path.isfile(os.path.join(target, "neu.py"))
          and not os.path.exists(hass.config.path(update.STAGE_DIR)) and not os.path.exists(target + ".alt"), after)
    # Nächster Start ohne wartende Version, aber mit Rest im Wartebereich (Absturz): verwerfen.
    os.makedirs(hass.config.path(update.STAGE_DIR, "x"))
    h2 = Hass(tmp)
    await update.async_setup_entry(h2, SimpleNamespace(entry_id="e1", options={}), lambda *a, **k: None)
    check("B-PY-03: Rest im Wartebereich beim Start verworfen", not os.path.exists(hass.config.path(update.STAGE_DIR)))

    # ── B-PY-02 ─────────────────────────────────────────────────────────
    t2 = os.path.join(tmp, "b2", "custom_components", "casora")
    os.makedirs(t2)
    with open(os.path.join(t2, "manifest.json"), "w") as fh:
        json.dump({"version": "1.0.0"}, fh)
    real = update.shutil.copytree

    def voll(src, dst, *a, **k):
        os.makedirs(dst)
        with open(os.path.join(dst, "halb.txt"), "w") as fh:
            fh.write("x")
        raise OSError(28, "No space left on device")

    update.shutil.copytree = voll
    try:
        update.install_zip(make_zip("9.0.1"), t2, os.path.join(tmp, "b2", "sich"), "casora_1.0.0_x")
        raised = False
    except OSError:
        raised = True
    finally:
        update.shutil.copytree = real
    with open(os.path.join(t2, "manifest.json")) as fh:
        still = json.load(fh).get("version")
    left = sorted(os.listdir(os.path.dirname(t2)))
    check("B-PY-02: Fehler wird gemeldet", raised)
    check("B-PY-02: laufende Fassung unverändert", still == "1.0.0" and not os.path.exists(os.path.join(t2, "halb.txt")), still)
    check("B-PY-02: keine halben Ordner neben casora", left == ["casora"], repr(left))


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
