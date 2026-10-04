"""Hemmas Helfer-Paket (packages/hemma_helpers.yaml) beim Entfernen von Hemma aufräumen.

Hemma ließ Nutzer ein YAML-Paket kopieren: Helfer (input_*), drei, vier Skripte,
drei Automationen und ein paar Vorlagen-Sensoren, alle mit „hemma_“ im Namen. Casora
legt dieselben Helfer als casora_* selbst an (helfer.py) – nach dem Umzug sind die
Hemma-Fassungen tot.

Entscheidend ist die HERKUNFT, nicht der Name: Entfernt wird nur, was in Hemmas
Paket stand (Schlüssel/IDs aus allen Hemma-Versionen bis 2.1.2, unten fest
eingetragen). Eigenes – auch mit „hemma“ im Namen, auch in derselben Datei – bleibt.

Die Datei wird zeilenweise bearbeitet (Kommentare, !secret und !include bleiben
erhalten) und danach gegengeprüft: Ergibt das Ergebnis nicht genau das Original
minus der Hemma-Teile, bleibt die Datei unangetastet und wird als „von Hand“
gemeldet. Bleibt nichts Eigenes übrig, wird die Datei gelöscht. Hemma-Helfer, die
als UI-Helfer (.storage) angelegt sind, löscht hemma_cleanup über die Sammlung.
"""

from __future__ import annotations

import os
import re
from typing import Any

import yaml

# Alles, was Hemmas Paket je angelegt hat (Hemma 1.x bis 2.1.2).
PKG_KEYS: dict[str, frozenset[str]] = {
    "input_boolean": frozenset((
        "hemma_actions_overlay", "hemma_cooling_control", "hemma_dashboard_redirect", "hemma_heating_control",
        "hemma_hot_water_control", "hemma_lock_overlay", "hemma_mobile_navigation", "hemma_motion_badges",
        "hemma_now_playing_minimized", "hemma_restart_confirm_1", "hemma_restart_confirm_2",
        "hemma_restart_done_1", "hemma_restart_done_2", "hemma_thermostat_overlay")),
    "input_text": frozenset((
        "hemma_actions_active_entity", "hemma_motion_bedroom", "hemma_motion_kitchen", "hemma_motion_living_room",
        "hemma_now_playing_pinned", "hemma_thermostat_active_entity")),
    "input_datetime": frozenset(("hemma_notifications_read",)),
    "input_number": frozenset(("hemma_thermostat_target_temperature",)),
    "input_select": frozenset(("hemma_expanded_row", "hemma_mobile_filter", "hemma_thermostat_mode")),
    "script": frozenset((
        "hemma_actions_overlay_toggle", "hemma_light_smart_toggle", "hemma_restart_toggle",
        "hemma_thermostat_overlay_toggle")),
}
AUTOMATION_IDS = frozenset(("hemma_auto_clear_restart_done_1", "hemma_auto_clear_restart_done_2",
                            "hemma_auto_expand_media_row"))
AUTOMATION_ALIASES = frozenset(("Hemma - Auto clear restart done state 1", "Hemma - Auto clear restart done state 2",
                                "Hemma - Auto-expand media row when playing"))
TEMPLATE_IDS = frozenset(("hemma_temp_color", "hemma_humidity_color", "hemma_mobile_background_url",
                          "hemma_mobile_dynamic_background", "plex_recently_added_count"))
# Teile einer Vorlagen-Gruppe, die keine Entitäten sind (Auslöser einer Trigger-Vorlage).
TRIGGER_KEYS = frozenset(("trigger", "triggers", "condition", "conditions", "action", "actions", "variables"))
HELPER_DOMAINS = ("input_boolean", "input_text", "input_datetime", "input_number", "input_select")
PACKAGES_DIR = "packages"

_KEY = re.compile(r"^(\s*)([A-Za-z0-9_]+)\s*:(\s|$)")
_ITEM = re.compile(r"^(\s*)-(\s|$)")


# ── YAML gegenprüfen: alle Tags als Text, damit !secret/!include nichts auflösen ──
class _Loader(yaml.SafeLoader):
    pass


_Loader.add_multi_constructor("!", lambda loader, suffix, node: (
    f"!{suffix} " + str(loader.construct_scalar(node)) if isinstance(node, yaml.ScalarNode) else f"!{suffix}"))


def _parse(text: str) -> Any:
    return yaml.load(text, Loader=_Loader)  # noqa: S506 – eigener SafeLoader


# ── Zeilen-Baum ───────────────────────────────────────────────────────────────
def _indent(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def _content(line: str) -> bool:
    s = line.strip()
    return bool(s) and not s.startswith("#")


def _end(lines: list[str], i: int, stop: int) -> int:
    """Ende (exklusiv) des Knotens, der in Zeile i beginnt: alle folgenden Zeilen, die
    tiefer eingerückt sind (bei „- “ ab der Inhaltsspalte), plus Listen auf gleicher
    Höhe direkt unter einem Schlüssel („key:\\n- a“)."""
    line = lines[i]
    ind = _indent(line)
    item = _ITEM.match(line)
    child = ind + 1
    same_level_list = bool(not item and _KEY.match(line) and re.search(r":\s*(#.*)?$", line))
    j = i + 1
    last = i
    while j < stop:
        ln = lines[j]
        if _content(ln):
            li = _indent(ln)
            if li >= child or (same_level_list and li == ind and _ITEM.match(ln)):
                last = j
            else:
                break
        j += 1
    return last + 1


def _children(lines: list[str], start: int, stop: int) -> list[tuple[int, int]]:
    """Direkte Kinder (Anfang, Ende) zwischen start und stop."""
    out = []
    i = start
    while i < stop:
        if _content(lines[i]):
            e = _end(lines, i, stop)
            out.append((i, e))
            i = e
        else:
            i += 1
    return out


def _key(line: str) -> str | None:
    m = _KEY.match(line)
    return m.group(2) if m else None


def _scalar(lines: list[str], s: int, e: int, name: str) -> set[str]:
    """Werte von „name: wert“ auf der ersten Ebene eines Listeneintrags."""
    out = set()
    first = lines[s]
    col = _indent(first) + 2
    for k in range(s, e):
        ln = lines[k] if k > s else (" " * col + first.strip()[1:].lstrip())
        if _indent(ln) != col:
            continue
        m = re.match(r"^\s*" + name + r"\s*:\s*[\"']?([^\"'#\n]+?)[\"']?\s*(#.*)?$", ln)
        if m:
            out.add(m.group(1).strip())
    return out


def plan_file(text: str) -> tuple[list[tuple[int, int]], list[dict]]:
    """Zeilenbereiche, die zu Hemmas Paket gehören, und was sie sind."""
    lines = text.split("\n")
    drop: list[tuple[int, int]] = []
    found: list[dict] = []
    for s, e in _children(lines, 0, len(lines)):
        dom = _key(lines[s])
        if dom is None or _indent(lines[s]) != 0:
            continue
        body = _children(lines, s + 1, e)
        if dom in PKG_KEYS:
            for cs, ce in body:
                k = _key(lines[cs])
                if k in PKG_KEYS[dom]:
                    drop.append((cs, ce))
                    found.append({"domain": dom, "key": k})
        elif dom == "automation":
            for cs, ce in body:
                if not _ITEM.match(lines[cs]):
                    continue
                ids = _scalar(lines, cs, ce, "id")
                aliases = _scalar(lines, cs, ce, "alias")
                if ids & AUTOMATION_IDS or aliases & AUTOMATION_ALIASES:
                    drop.append((cs, ce))
                    found.append({"domain": "automation", "key": next(iter(ids or aliases))})
        elif dom == "template":
            for gs, ge in body:  # „- sensor:“ / „- binary_sensor:“ …
                if not _ITEM.match(lines[gs]):
                    continue
                # Einträge der Gruppe: die Listen unter ihren Schlüsseln („- sensor:“ → „- name: …“).
                group_items: list[tuple[int, int]] = []
                head = _key(" " * (_indent(lines[gs]) + 2) + lines[gs].strip()[1:].lstrip())
                for ks, ke in _children(lines, gs + 1, ge):
                    if _ITEM.match(lines[ks]):
                        if head not in TRIGGER_KEYS:  # Liste direkt unter „- sensor:“
                            group_items.append((ks, ke))
                    elif _key(lines[ks]) not in TRIGGER_KEYS:
                        group_items += [(a, b) for a, b in _children(lines, ks + 1, ke) if _ITEM.match(lines[a])]
                hits = [(a, b) for a, b in group_items if _scalar(lines, a, b, "unique_id") & TEMPLATE_IDS]
                if not hits:
                    continue
                if len(hits) == len(group_items):
                    drop.append((gs, ge))  # ganze Gruppe stammt aus Hemma
                else:
                    drop.extend(hits)
                for a, b in hits:
                    found.append({"domain": "template", "key": next(iter(_scalar(lines, a, b, "unique_id")))})
    return drop, found


def _apply(text: str, drop: list[tuple[int, int]]) -> str:
    lines = text.split("\n")
    gone = set()
    for s, e in drop:
        gone.update(range(s, e))
    kept = [ln for i, ln in enumerate(lines) if i not in gone]
    # Bereiche (top-level), die jetzt leer sind, samt Überschrift entfernen.
    out: list[str] = []
    i = 0
    while i < len(kept):
        ln = kept[i]
        if _content(ln) and _indent(ln) == 0 and _key(ln) and re.search(r":\s*(#.*)?$", ln):
            j = i + 1
            while j < len(kept) and not (_content(kept[j]) and _indent(kept[j]) == 0 and not _ITEM.match(kept[j])):
                j += 1
            if not any(_content(x) for x in kept[i + 1:j]):
                i = j
                continue
        out.append(ln)
        i += 1
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out))


def _expected(orig: Any, found: list[dict]) -> Any:
    """Was nach dem Entfernen inhaltlich übrig bleiben muss (zum Gegenprüfen)."""
    if not isinstance(orig, dict):
        return orig
    out = {}
    for dom, val in orig.items():
        if dom in PKG_KEYS and isinstance(val, dict):
            val = {k: v for k, v in val.items() if k not in PKG_KEYS[dom]}
        elif dom == "automation" and isinstance(val, list):
            val = [a for a in val if not (isinstance(a, dict) and (a.get("id") in AUTOMATION_IDS or a.get("alias") in AUTOMATION_ALIASES))]
        elif dom == "template" and isinstance(val, list):
            groups = []
            for g in val:
                if not isinstance(g, dict):
                    groups.append(g)
                    continue
                g2, touched, left = {}, False, False
                for k, v in g.items():
                    if isinstance(v, list) and k not in TRIGGER_KEYS:
                        v2 = [x for x in v if not (isinstance(x, dict) and x.get("unique_id") in TEMPLATE_IDS)]
                        touched = touched or len(v2) != len(v)
                        left = left or bool(v2)
                        if v2:
                            g2[k] = v2
                        continue
                    g2[k] = v
                if touched and not left:
                    continue
                groups.append(g2 if touched else g)
            val = groups
        if val in ({}, [], None) and orig.get(dom) not in ({}, [], None):
            continue
        out[dom] = val
    return out


def clean_text(text: str) -> tuple[str | None, list[dict], str | None]:
    """(neuer Text oder None = Datei löschen, entfernte Teile, Fehler)."""
    drop, found = plan_file(text)
    if not found:
        return text, [], None
    new = _apply(text, drop)
    try:
        before = _parse(text)
        after = _parse(new) if any(_content(ln) for ln in new.split("\n")) else None
    except yaml.YAMLError as err:
        return text, found, f"yaml: {err}"
    if after != (_expected(before, found) or None):
        return text, found, "check"
    return (new if after is not None else None), found, None


# ── Dateien ───────────────────────────────────────────────────────────────────
def package_files(config_dir: str) -> list[str]:
    base = os.path.join(config_dir, PACKAGES_DIR)
    out = []
    if not os.path.isdir(base):
        return out
    for root, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for f in files:
            if f.endswith((".yaml", ".yml")) and not f.startswith("."):
                out.append(os.path.relpath(os.path.join(root, f), config_dir).replace(os.sep, "/"))
    return sorted(out)


def scan(config_dir: str) -> list[dict]:
    """Je Paketdatei mit Hemma-Teilen: {file, items, delete, error}."""
    out = []
    for rel in package_files(config_dir):
        try:
            with open(os.path.join(config_dir, rel), encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        if "hemma" not in text.lower():
            continue
        new, found, err = clean_text(text)
        if found:
            out.append({"file": rel, "items": found, "delete": new is None and not err, "error": err})
    return out


def apply(config_dir: str) -> list[dict]:
    """Hemma-Teile aus allen Paketdateien entfernen (nur geprüfte Dateien)."""
    out = []
    for p in scan(config_dir):
        path = os.path.join(config_dir, p["file"])
        if p["error"]:
            out.append({**p, "ok": False})
            continue
        with open(path, encoding="utf-8") as fh:
            new, _found, err = clean_text(fh.read())
        if err:
            out.append({**p, "ok": False, "error": err})
            continue
        if new is None:
            os.remove(path)
        else:
            tmp = path + ".casora.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                fh.write(new)
            os.replace(tmp, path)
        out.append({**p, "ok": True})
    return out


def entity_ids(items: list[dict]) -> list[tuple[str, str]]:
    """(Plattform, unique_id oder entity_id) für die Registry."""
    out = []
    for it in items:
        d, k = it["domain"], it["key"]
        if d in PKG_KEYS:
            out.append((d, k))
        elif d == "automation":
            out.append(("automation", k))
        elif d == "template":
            out.append(("template", k))
    return out
