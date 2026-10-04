"""Karten-Updates: Paketformat, Prüfung und Überlagerung – reines Python ohne HA.

Ein Karten-Update bringt Fehlerbehebungen für BESTEHENDE Kartenvorlagen
(button_card_templates, casora_*) ohne komplettes Casora-Release. Es kommt als
JSON-Anhang eines GitHub-Releases mit Tag „karten-…“ (card_updates.py holt es),
gebaut von tools/build-card-update.py, das dieses Modul mitbenutzt.

Paket (format 1):
  {"format": 1, "id": "karten-2026-09-30-1", "published": "<ISO>",
   "min_casora": "0.4.0", "notes_md": "…",
   "items": [{"kind": "template", "name": "casora_waschmaschine", "notes": "…",
              "base": "<hash der ausgelieferten Fassung, gegen die gebaut wurde>",
              "hash": "<hash von body>", "body": {…}}],
   "sha256": "<sha256 über canonical(items)>"}

Nur kind „template“. Skript-Module (scripts/local/*.js) werden absichtlich NICHT
getauscht: Sie hängen voneinander und von casora-core ab, ihr ?v= entsteht erst
beim Laden der Integration und ein neuer Stand im Integrationsordner würde beim
nächsten Update stillschweigend überschrieben – solche Fehler brauchen ein Release.

Überlagerungsregel (effective_templates): ein angenommener Eintrag gilt nur,
solange die ausgelieferte Vorlage noch genau die Fassung ist, gegen die das Paket
gebaut wurde (template_hash(ausgeliefert) == base). Bringt ein komplettes
Casora-Update die Vorlage in neuer Fassung (mit dem Fix oder schon weiter), passt
base nicht mehr – dann gilt die ausgelieferte, der Eintrag ist erledigt
(prune_overlay räumt ihn weg). Kein Versionsvergleich nötig, kein Zurückfallen.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from typing import Any

FORMAT = 1
OVERLAY_DIR = "casora_updates"
OVERLAY_FILE = "templates.json"
ID_RE = re.compile(r"^karten-[0-9A-Za-z._-]{1,60}$")
NAME_RE = re.compile(r"^casora_[a-z0-9_]{1,80}$")
MAX_PACKAGE_BYTES = 2_000_000


class PackageError(ValueError):
    """Paket unbrauchbar; der Text (deutsch) geht so an die Oberfläche."""


def canonical(obj: Any) -> bytes:
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def template_hash(t: Any) -> str:
    """Prüfsumme einer Vorlage (sha256, 16 Zeichen) – Grundlage der Überlagerungsregel."""
    return hashlib.sha256(canonical(t)).hexdigest()[:16]


def items_sha256(items: list) -> str:
    return hashlib.sha256(canonical(items)).hexdigest()


def version_tuple(v: Any) -> tuple:
    """„v0.4.0“ → (0, 4, 0); Unlesbares zählt als (0,) – wie update._ver."""
    return tuple(int(x) for x in re.findall(r"\d+", str(v or ""))[:3]) or (0,)


def verify_package(pkg: Any, *, installed_version: str, shipped: dict) -> list[dict]:
    """Paket prüfen; gibt die Einträge zurück oder wirft PackageError.

    shipped = die mit Casora ausgelieferten Vorlagen (panel/casora-templates.json).
    """
    if not isinstance(pkg, dict) or pkg.get("format") != FORMAT:
        raise PackageError("Unbekanntes Paketformat")
    pid = pkg.get("id")
    if not isinstance(pid, str) or not ID_RE.match(pid):
        raise PackageError("Ungültige Paket-ID")
    items = pkg.get("items")
    if not isinstance(items, list) or not items:
        raise PackageError("Paket ohne Einträge")
    if pkg.get("sha256") != items_sha256(items):
        raise PackageError("Prüfsumme stimmt nicht – Paket beschädigt oder verändert")
    need = pkg.get("min_casora")
    if not isinstance(need, str) or version_tuple(need) > version_tuple(installed_version):
        raise PackageError(f"Benötigt Casora {need} oder neuer (installiert: {installed_version})")
    seen: set[str] = set()
    for it in items:
        if not isinstance(it, dict):
            raise PackageError("Ungültiger Eintrag")
        kind, name = it.get("kind"), it.get("name")
        if kind != "template":
            raise PackageError(f"Eintragsart „{kind}“ wird nicht unterstützt")
        if not isinstance(name, str) or not NAME_RE.match(name) or name not in shipped:
            raise PackageError(f"Unbekannte Vorlage „{name}“ – Karten-Updates ändern nur bestehende Casora-Karten")
        if name in seen:
            raise PackageError(f"Vorlage „{name}“ doppelt im Paket")
        seen.add(name)
        body = it.get("body")
        if not isinstance(body, dict):
            raise PackageError(f"Vorlage „{name}“ ohne Inhalt")
        if it.get("hash") != template_hash(body) or not isinstance(it.get("base"), str):
            raise PackageError(f"Prüfsumme der Vorlage „{name}“ stimmt nicht")
    return items


def item_state(item: dict, shipped: dict, overlay: dict) -> str:
    """Was Annehmen mit diesem Eintrag täte.

    „neu“        ändert die Vorlage
    „aktuell“    genau diese Fassung gilt schon (ausgeliefert oder angenommen)
    „veraltet“   die ausgelieferte Fassung ist eine andere als die, gegen die gebaut
                 wurde (neueres Casora) – der Eintrag gilt nicht
    „ersetzt“    ein später veröffentlichtes Paket hat diese Vorlage schon geändert
    """
    name = item["name"]
    cur = shipped.get(name)
    if cur is None:
        return "veraltet"
    sh = template_hash(cur)
    if sh == item["hash"]:
        return "aktuell"
    if sh != item["base"]:
        return "veraltet"
    have = (overlay.get("templates") or {}).get(name)
    if have and have.get("base") == sh:
        if have.get("hash") == item["hash"]:
            return "aktuell"
        if str(have.get("published") or "") > str(item.get("_published") or ""):
            return "ersetzt"
    return "neu"


def package_states(pkg: dict, shipped: dict, overlay: dict) -> list[dict]:
    """[{name, notes, state}] – für die Liste in der Oberfläche."""
    return [{"name": it["name"], "notes": str(it.get("notes") or ""),
             "state": item_state({**it, "_published": pkg.get("published")}, shipped, overlay)}
            for it in pkg.get("items") or []]


def merge_package(overlay: dict, pkg: dict, shipped: dict) -> tuple[dict, list[str], list[dict]]:
    """Paket in die Überlagerung übernehmen → (neue Überlagerung, übernommen, übersprungen)."""
    out = {"format": FORMAT, "templates": dict((overlay or {}).get("templates") or {})}
    taken: list[str] = []
    skipped: list[dict] = []
    for st, it in zip(package_states(pkg, shipped, out), pkg["items"]):
        if st["state"] != "neu":
            skipped.append({"name": it["name"], "state": st["state"]})
            continue
        out["templates"][it["name"]] = {
            "base": it["base"], "hash": it["hash"], "body": it["body"],
            "package": pkg["id"], "published": pkg.get("published"), "notes": str(it.get("notes") or ""),
        }
        taken.append(it["name"])
    return out, taken, skipped


def effective_templates(shipped: dict, overlay: dict | None) -> tuple[dict, list[str]]:
    """Ausgelieferte Vorlagen + gültige Einträge der Überlagerung → (Vorlagen, überlagerte Namen)."""
    entries = (overlay or {}).get("templates") or {}
    if not entries:
        return shipped, []
    out = dict(shipped)
    active: list[str] = []
    for name, e in entries.items():
        cur = shipped.get(name)
        if cur is None or not isinstance(e, dict) or not isinstance(e.get("body"), dict):
            continue
        if template_hash(cur) == e.get("base"):
            out[name] = e["body"]
            active.append(name)
    return out, active


def prune_overlay(overlay: dict, shipped: dict) -> tuple[dict, list[str]]:
    """Einträge entfernen, die nicht mehr gelten (ausgelieferte Vorlage ist neuer)."""
    entries = (overlay or {}).get("templates") or {}
    _eff, active = effective_templates(shipped, overlay)
    gone = [n for n in entries if n not in active]
    return {"format": FORMAT, "templates": {n: e for n, e in entries.items() if n in active}}, gone


# ─── Dateien (blockierend, im Executor aufrufen) ─────────────────────────────

def overlay_path(config_dir: str) -> str:
    return os.path.join(config_dir, OVERLAY_DIR, OVERLAY_FILE)


def read_overlay(config_dir: str) -> dict:
    try:
        with open(overlay_path(config_dir), encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return {"format": FORMAT, "templates": {}}
    if not isinstance(data, dict) or not isinstance(data.get("templates"), dict):
        return {"format": FORMAT, "templates": {}}
    return data


def write_overlay(config_dir: str, overlay: dict) -> None:
    path = overlay_path(config_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(overlay, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


def effective_bundle(bundle: dict, config_dir: str) -> tuple[dict, list[str]]:
    """Ganzes Bundle ({templates, scaffold, mobile …}) mit Überlagerung."""
    overlay = read_overlay(config_dir)
    if not overlay["templates"] or not isinstance(bundle.get("templates"), dict):
        return bundle, []
    templates, active = effective_templates(bundle["templates"], overlay)
    return ({**bundle, "templates": templates} if active else bundle), active
