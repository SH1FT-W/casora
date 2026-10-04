"""Vorlagen-Fingerabdruck und -Auffrischung – Python-Gegenstück zum Studio.

Nachbau von stable/hashStr/templatePrint/printMatches/refreshTemplates aus
panel/casora-panel.js. Die Prüfsummen MÜSSEN mit dem Studio übereinstimmen:
beide lesen und schreiben denselben Fingerabdruck (casora_template_fingerprint)
im Dashboard. dev/unit/vorlagen_print_py.mjs vergleicht beide Seiten.

Reines Python ohne HA-Importe, damit es sich ohne HA testen lässt.
"""

from __future__ import annotations

import copy
import json
import math
from typing import Any

FINGERPRINT_KEY = "casora_template_fingerprint"
SCENE_KEYS = ("scenes", "scene_exclude", "scene_order", "scene_colors")
SCENE_LIST_KEYS = SCENE_KEYS[:3]
NAV = "custom:casora-nav"
FILTER_OVERLAY = "custom:casora-filter-overlay"
SCENE_ROW = "casora_scene_row"

_MISSING = object()


# ─── stable() wie im Studio: JSON.stringify mit sortierten Schlüsseln ─────────

def _js_str(s: str) -> str:
    """JSON.stringify eines Strings (inkl. einzelner Surrogate wie in JS)."""
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif o < 0x20:
            out.append({8: "\\b", 9: "\\t", 10: "\\n", 12: "\\f", 13: "\\r"}.get(o, "\\u%04x" % o))
        elif 0xD800 <= o <= 0xDFFF:
            out.append("\\u%04x" % o)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _js_num(x: float) -> str:
    """Number.prototype.toString für endliche Zahlen (JSON.stringify: sonst null)."""
    if isinstance(x, int):
        return str(x)
    if not math.isfinite(x):
        return "null"
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    r = repr(abs(x))  # kürzeste Darstellung, wie JS
    mant, _, exp = r.partition("e")
    e = int(exp) if exp else 0
    ip, _, fp = mant.partition(".")
    if fp == "0":
        fp = ""
    digits = (ip + fp).lstrip("0")
    lead = len(ip + fp) - len((ip + fp).lstrip("0"))
    n = len(ip) + e - lead  # Stelle des Dezimalpunkts relativ zu digits
    digits = digits.rstrip("0") or "0"
    k = len(digits)
    if k <= n <= 21:
        s = digits + "0" * (n - k)
    elif 0 < n <= 21:
        s = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        s = "0." + "0" * (-n) + digits
    else:
        ee = n - 1
        s = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if ee >= 0 else "-") + str(abs(ee))
    return sign + s


def _utf16_key(k: str) -> bytes:
    # Array.prototype.sort vergleicht UTF-16-Codeeinheiten.
    return k.encode("utf-16-be", "surrogatepass")


def stable(x: Any) -> str:
    if x is None:
        return "null"
    if x is True:
        return "true"
    if x is False:
        return "false"
    if isinstance(x, (int, float)):
        return _js_num(x)
    if isinstance(x, str):
        return _js_str(x)
    if isinstance(x, (list, tuple)):
        return "[" + ",".join(stable(v) for v in x) + "]"
    if isinstance(x, dict):
        keys = sorted((str(k) for k in x), key=_utf16_key)
        by = {str(k): v for k, v in x.items()}
        return "{" + ",".join(_js_str(k) + ":" + stable(by[k]) for k in keys) + "}"
    # Nicht JSON (kommt in Dashboards nicht vor): so wie json es schreiben würde.
    return _js_str(json.dumps(x, default=str))


_B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def hash_str(s: str) -> str:
    """FNV-1a (32 Bit) über UTF-16-Codeeinheiten, Basis 36 – wie hashStr()."""
    h = 0x811C9DC5
    data = s.encode("utf-16-le", "surrogatepass")
    for i in range(0, len(data), 2):
        h ^= data[i] | (data[i + 1] << 8)
        h = (h * 0x01000193) & 0xFFFFFFFF
    if h == 0:
        return "0"
    out = ""
    while h:
        h, r = divmod(h, 36)
        out = _B36[r] + out
    return out


# ─── Fingerabdruck ohne die je Dashboard umgeschriebenen Teile ───────────────

def _derived_keys(o: Any) -> tuple:
    if isinstance(o, dict) and o.get("type") == NAV:
        return ("routes",) + SCENE_KEYS
    return ("routes",)


def without_derived(t: Any, name: str | None) -> Any:
    def walk(o):
        if isinstance(o, list):
            return [walk(v) for v in o]
        if not isinstance(o, dict):
            return o
        drop = _derived_keys(o)
        return {k: walk(v) for k, v in o.items() if k not in drop}

    out = walk(t)
    if name == SCENE_ROW and isinstance(out, dict) and out.get("variables"):
        out["variables"] = {k: v for k, v in out["variables"].items() if k not in SCENE_KEYS}
    return out


def template_print(t: Any, name: str | None) -> str:
    return hash_str(stable(without_derived(t, name)))


def fingerprint_of(templates: dict) -> dict:
    return {k: template_print(v, k) for k, v in (templates or {}).items()}


def derived_from(have: Any, ship: Any, name: str | None) -> Any:
    def walk(h, s):
        if isinstance(h, list):
            return [walk(v, s[i] if isinstance(s, list) and i < len(s) else None) for i, v in enumerate(h)]
        if not isinstance(h, dict):
            return h
        so = s if isinstance(s, dict) else None
        drop = _derived_keys(h) + (_derived_keys(so) if so is not None else ())
        out = {k: walk(v, so.get(k) if so is not None else None) for k, v in h.items() if k not in drop}
        if so is not None:
            for k in drop:
                if k in so:
                    out[k] = so[k]
        return out

    out = walk(have, ship)
    if name == SCENE_ROW and isinstance(out, dict) and out.get("variables"):
        sv = (ship or {}).get("variables") or {} if isinstance(ship, dict) else {}
        for k in SCENE_KEYS:
            if k in sv:
                out["variables"][k] = sv[k]
            else:
                out["variables"].pop(k, None)
    return out


def print_matches(last: Any, have: Any, ship: Any, name: str | None) -> bool:
    if last is _MISSING:
        return False
    if last == template_print(have, name) or last == hash_str(stable(have)):
        return True
    return ship is not _MISSING and last == hash_str(stable(derived_from(have, ship, name)))


def refresh_templates(current: dict | None, bundle: dict, prior: dict | None, auto: bool = False) -> dict:
    """refreshTemplates() des Studios.

    auto=True ist die Fassung für das Auffrischen nach einem Update ohne Studio:
    nur, was Casora nachweislich unverändert geschrieben hat, wird ersetzt. Ohne
    Eintrag im Fingerabdruck („unknown“) bleibt die Vorlage stehen, eigene
    Vorlagen bekommen keine nachgetragenen Felder, ausgemusterte werden nicht
    gelöscht – das alles macht erst ein Speichern im Studio.
    """
    nxt = dict(current or {})
    seen = prior or {}
    prints: dict = {}
    res = {"adopted": [], "mine": [], "redeclared": [], "unknown": [], "removed": [],
           "foreign": [], "orphan": [], "updated": 0, "added": 0, "kept": 0}

    for k, ship in bundle.items():
        have = nxt.get(k, _MISSING)
        ship_print = template_print(ship, k)

        def take(k=k, ship=ship, ship_print=ship_print):
            nxt[k] = ship
            prints[k] = ship_print
            res["adopted"].append(k)

        if have is _MISSING:
            res["added"] += 1
            take()
            continue
        if template_print(have, k) == ship_print:
            prints[k] = ship_print
            res["adopted"].append(k)
            continue
        last = seen.get(k, _MISSING)
        if print_matches(last, have, ship, k):
            res["updated"] += 1
            take()
            continue
        if last is _MISSING:
            res["unknown"].append(k)
            if not auto:
                take()
            continue
        theirs = have.get("variables") if isinstance(have, dict) else None
        ship_vars = ship.get("variables") if isinstance(ship, dict) else None
        if not auto and ship_vars and theirs and stable(theirs) != stable({**ship_vars, **theirs}):
            nxt[k] = {**have, "variables": {**ship_vars, **theirs}}
            res["redeclared"].append(k)
        prints[k] = last
        res["kept"] += 1
        res["mine"].append(k)

    for k in list(nxt):
        if k in bundle:
            continue
        ours = k.startswith("casora_")
        if ours and print_matches(seen.get(k, _MISSING), nxt[k], _MISSING, k):
            if not auto:
                del nxt[k]
                res["removed"].append(k)
            continue
        (res["orphan"] if ours else res["foreign"]).append(k)

    res["templates"] = nxt
    res["prints"] = prints
    return res


# ─── Routen und Szenen wie retargetRoutes()/applyScenePick() ─────────────────

def _each(o: Any, fn) -> None:
    if isinstance(o, list):
        for v in o:
            _each(v, fn)
    elif isinstance(o, dict):
        fn(o)
        for v in list(o.values()):
            _each(v, fn)


def first_routes(root: Any) -> list | None:
    """Die erste routes-Liste mit Raum-Adressen – retargetRoutes() schreibt in jede dieselbe."""
    found: list = []

    def fn(o):
        if not found and isinstance(o.get("routes"), list) and any(
                isinstance(r, dict) and r.get("url") for r in o["routes"]):
            found.append(o["routes"])

    _each(root, fn)
    return found[0] if found else None


def retarget(templates: dict, names: list, routes: list) -> int:
    """Jede routes-Liste in den genannten Vorlagen durch die des Dashboards ersetzen."""
    n = 0

    def fn(o):
        nonlocal n
        if isinstance(o.get("routes"), list):
            o["routes"] = copy.deepcopy(routes)
            n += 1

    for k in names:
        if k in templates:
            _each(templates[k], fn)
    return n


def _scene_pref(key: str, v: Any) -> Any:
    if key == "scene_colors":
        if isinstance(v, list):
            m: dict = {}
            for x in v:
                if isinstance(x, dict):
                    m.update(x)
            v = m
        return copy.deepcopy(v) if isinstance(v, dict) and v else None
    return list(v) if isinstance(v, list) and v else None


def apply_scene_pick(templates: dict, names: list, home_vars: dict | None) -> None:
    """applyScenePick(), beschränkt auf die genannten (eben ersetzten) Vorlagen."""
    src = home_vars or {}

    def val(k):
        return _scene_pref(k, src.get(k))

    row = templates.get(SCENE_ROW) if SCENE_ROW in names else None
    if isinstance(row, dict) and isinstance(row.get("variables"), dict):
        for k in SCENE_LIST_KEYS:
            row["variables"][k] = val(k)
        row["variables"]["scene_colors"] = val("scene_colors") or {}

    def fn(o):
        nav = o.get("type") == NAV
        if nav or (o.get("type") == FILTER_OVERLAY and o.get("room")):
            for k in (SCENE_KEYS if nav else SCENE_LIST_KEYS):
                x = val(k)
                if x:
                    o[k] = x
                else:
                    o.pop(k, None)
        elif o.get("template") == SCENE_ROW and isinstance(o.get("variables"), dict):
            for k in SCENE_KEYS:
                o["variables"].pop(k, None)
            if not o["variables"]:
                del o["variables"]

    for k in names:
        if k in templates:
            _each(templates[k], fn)


def home_vars_of(cfg: dict) -> dict | None:
    """Variablen der Home-Raumkarte (rooms[0].variables im Studio)."""
    try:
        hero = cfg["views"][0]["cards"][0]
    except (KeyError, IndexError, TypeError):
        return None
    return hero.get("variables") if isinstance(hero, dict) and isinstance(hero.get("variables"), dict) else None


def refresh_dashboard(cfg: dict, bundle: dict, *, mobile: bool = False,
                      home_vars: dict | None = None) -> tuple[dict | None, dict]:
    """Ein Dashboard auf die Vorlagen des Bundles bringen, wie ein Speichern im Studio.

    Gibt (neue Konfiguration oder None, Ergebnis) zurück; None heißt: nichts zu tun.
    Nur button_card_templates und der Fingerabdruck ändern sich, die Ansichten nicht.
    """
    cfg = copy.deepcopy(cfg)
    ship = copy.deepcopy(bundle)
    r = refresh_templates(cfg.get("button_card_templates") or {}, ship, cfg.get(FINGERPRINT_KEY), auto=True)
    changed = r["updated"] + r["added"]
    if not changed:
        return None, r
    tpl = r["templates"]
    fresh = [k for k in r["adopted"] if k in ship and tpl.get(k) is ship[k]]
    for k in fresh:
        tpl[k] = copy.deepcopy(tpl[k])
    if not mobile:
        # Desktop: Raum-Adressen + Menüeinträge der Leiste des Dashboards (retargetRoutes).
        routes = first_routes(cfg.get("views")) or first_routes(
            {k: v for k, v in (cfg.get("button_card_templates") or {}).items()})
        if routes is None and any(first_routes(tpl[k]) is not None for k in fresh):
            r["skipped"] = "no navigation routes found"
            return None, r
        if routes is not None:
            r["rewritten"] = retarget(tpl, fresh, routes)
        if home_vars is None:
            home_vars = home_vars_of(cfg)
    if home_vars is None:
        # Ohne Home-Raumkarte: die Szenenwahl, die zuletzt in casora_scene_row stand.
        old_row = (cfg.get("button_card_templates") or {}).get(SCENE_ROW)
        home_vars = old_row.get("variables") if isinstance(old_row, dict) else None
    apply_scene_pick(tpl, fresh, home_vars)
    prints = dict(r["prints"])
    for k in r["adopted"]:
        if k in tpl:
            prints[k] = template_print(tpl[k], k)
    cfg["button_card_templates"] = tpl
    cfg[FINGERPRINT_KEY] = prints
    return cfg, r
