"""Raumseite am Handy = Raum-Kopf am Desktop: Badge-Reihe aus casora_room ableiten (05.10.2026).

    python3 tools/phone_room_badges.py          # schreibt dashboards/casora/button_card_templates.json
    python3 tools/phone_room_badges.py --check  # nur prüfen (Rückgabe 1, wenn veraltet)

build-templates.py ruft derive() vor dem Bauen auf, die beiden Vorlagen bleiben so von selbst gleich.

Die Reihe rooms_row in casora_mobile_sensor_chips (Raumseite am Handy) bekommt genau die Karten
der oberen Badge-Reihe von casora_room (custom_fields.badges), die Unter-Reihen room_sub_<art>
die Karten der Desktop-Unter-Reihen (badges_climate, badges_security …). Statt der Variablen der
Raum-Karte lesen sie variables.casora_rv – die Variablen des Desktop-Raums, die
window.casoraPhoneRoom.vars() zur Laufzeit liefert (casora-core.js, WS casora/phone_room_badges).

Bewusst anders als am Desktop:
  - Szenen: keine Badge, die Raumseite am Handy hat dafür einen eigenen Bereich.
  - Sammel-Badges klappen ihre Unter-Reihe je Gerät auf (ll-custom casora_phone_row,
    window._casoraFilter.setRow) statt über den gemeinsamen Helfer casora_expanded_row – sonst
    klappte ein Tippen am Wand-Tablet die Reihe am Handy auf und umgekehrt.
  - Bewegung (room_chips[<raum>].motion_entity, nur Handy) steht als letzte Badge dahinter.
  - Sicherheit bekommt place: room (Unterzeile „Automatisch“ = ausgeschrieben wie im Raum).
"""

from __future__ import annotations

import copy
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dashboards/casora/button_card_templates.json")

CHIPS = "casora_mobile_sensor_chips"
ROW = "rooms_row"
RV = "const _rv = variables.casora_rv || {}; "
FILTER = "input_select.casora_mobile_filter"

# Sammel-Badge → Art der Unter-Reihe (wie casora_expanded_row am Desktop) → Desktop-Feld.
GROUPS = {
    "casora_badge_security_group": "security",
    "casora_badge_climate_group": "climate",
    "casora_badge_light_group": "lights",
    "casora_badge_presence_group": "presence",
    "casora_badge_media_group": "media",
    "casora_badge_energy_group": "energy",
}
SUBS = {"climate": "badges_climate", "security": "badges_security", "lights": "badges_lights",
        "presence": "badges_presence", "energy": "badges_energy", "media": "badges_media"}
SUB_IDS = ["room_sub_" + k for k in SUBS]


def _tx(s):
    """[[[ … variables … ]]] des Raum-Kopfs → dasselbe über variables.casora_rv."""
    if not isinstance(s, str) or not s.lstrip().startswith("[[["):
        return s
    at = s.index("[[[") + 3
    body = s[at:]
    body = body.replace("this._config?.name", "_rv._name")
    body = re.sub(r"(?<![\w.$])variables(?![\w$])", "_rv", body)
    return "[[[ " + RV + body.lstrip(" ")


def _deep(x):
    if isinstance(x, dict):
        return {k: _deep(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_deep(v) for v in x]
    return _tx(x)


def _row_cards(room: dict) -> list:
    out = []
    for c in room["custom_fields"]["badges"]["card"]["cards"]:
        if c.get("template") == "casora_badge_scene_group":
            continue   # Szenen: eigener Bereich auf der Raumseite am Handy
        c = _deep(copy.deepcopy(c))
        kind = GROUPS.get(c.get("template"))
        if kind == "energy":
            subs = ("[[[ " + RV + "let s = false; for (let i = 1; i <= 8; i++) if (_rv['energy_entity_' + i]) s = true; ")
            c["tap_action"] = {
                # Ohne Unter-Badges gleich das Energie-Popup (wie casora_badge_energy_group).
                "action": subs + "return s ? 'fire-dom-event' : (window.casoraPopupAction ? window.casoraPopupAction() : 'more-info'); ]]]",
                "casora_phone_row": subs + "return s ? 'energy' : null; ]]]",
                "haptic": "light",
            }
        elif kind:
            c["tap_action"] = {"action": "fire-dom-event", "casora_phone_row": kind, "haptic": "light"}
        if kind == "security":
            # Die Raumseite am Handy liegt in der Ansicht „home“ – sie ist trotzdem ein Raum
            # (Sicherheit „Automatisch“ = ausgeschrieben, 07.10.2026).
            c.setdefault("variables", {})["place"] = "room"
        out.append(c)
    return out


def _sub_display(kind: str) -> str:
    return ("[[[\n  // Unter-Reihe der Sammel-Badge, je Gerät aufgeklappt (casora-core.js, _casoraFilter.setRow).\n"
            f"  const f = states['{FILTER}'];\n"
            "  const r = variables.casora_rv;\n"
            "  if (!r || !String(f?.state || '').startsWith('room_')) return 'none';\n"
            f"  return f?.attributes?.casora_row === '{kind}' ? 'block' : 'none';\n]]]\n")


ROW_DISPLAY = ("[[[\n  // Raumseite: dieselben Badges wie im Raum-Kopf am Desktop (variables.casora_rv).\n"
               f"  const f = states['{FILTER}']?.state ?? 'all';\n"
               "  const r = variables.casora_rv;\n"
               "  return (String(f).startsWith('room_') && r && r._any) ? 'block' : 'none';\n]]]\n")
ROW_MARGIN = ("[[[\n  // Mit offener Unter-Reihe rückt sie dicht an, der Abstand zu den Kacheln folgt unter ihr.\n"
              f"  return states['{FILTER}']?.attributes?.casora_row\n"
              "    ? '0 0 var(--casora-badge-subrow-gap-mobile, 10px) 0 !important'\n"
              "    : '0 0 var(--casora-room-badges-gap-mobile, 24px) 0 !important';\n]]]\n")

RV_VAR = ("[[[\n  // Variablen des Desktop-Raums für die Raumseite (casora-core.js, window.casoraPhoneRoom).\n"
          f"  const f = states['{FILTER}']?.state;\n"
          "  return window.casoraPhoneRoom ? window.casoraPhoneRoom.vars(f, variables.room_chips) : null;\n]]]\n")


def derive(templates: dict) -> bool:
    """casora_mobile_sensor_chips aus casora_room nachziehen. True, wenn sich etwas geändert hat."""
    room, chips = templates["casora_room"], templates[CHIPS]
    before = json.dumps(chips, sort_keys=True, ensure_ascii=False)
    cf = chips["custom_fields"]
    row = cf[ROW]["card"]
    motion = [c for c in row["cards"] if c.get("icon") == "mdi:motion-sensor"]
    for m in motion:
        es = m.get("extra_styles", "")
        if isinstance(es, str) and ":host{order:99;}" not in es:
            m["extra_styles"] = es.replace("return (hide ?", "return ':host{order:99;}\\n' + (hide ?", 1)
    row["cards"] = _row_cards(room) + motion

    # Unter-Reihen, hinter der Reihe in dieser Reihenfolge.
    for k in [k for k in cf if k.startswith("room_sub_")]:
        del cf[k]
    for kind, field in SUBS.items():
        sub = _deep(copy.deepcopy(room["custom_fields"][field]))
        card = sub["card"]
        if isinstance(card.get("layout"), dict):
            card["layout"]["grid-column-gap"] = "var(--casora-mobile-chip-gap, 16px)"
            card["card_mod"] = copy.deepcopy(row.get("card_mod"))
        cf["room_sub_" + kind] = sub

    # Stile: Reihe wie bisher, Reihenfolge der Badges wie im Raum-Kopf (badge_order).
    st = chips["styles"]["custom_fields"]
    base = [e for e in st[ROW] if not any(k.startswith("--casora-badge-order-") for k in e)]
    order = [{k: _tx(v)} for e in room["styles"]["card"] for k, v in e.items()
             if k.startswith("--casora-badge-order-")]
    for e in base:
        if "display" in e:
            e["display"] = ROW_DISPLAY
        if "margin" in e:
            e["margin"] = ROW_MARGIN
    st[ROW] = base + order
    for k in [k for k in st if k.startswith("room_sub_")]:
        del st[k]
    for kind in SUBS:
        sub_st = copy.deepcopy(st[ROW])
        for e in sub_st:
            if "display" in e:
                e["display"] = _sub_display(kind)
            if "margin" in e:
                e["margin"] = "0 0 var(--casora-room-badges-gap-mobile, 24px) 0 !important"
        st["room_sub_" + kind] = sub_st

    # Weiche Ränder, Wischen, kein Scrollbalken auch für die Unter-Reihen.
    es = chips.get("extra_styles", "")
    if "#room_sub_" not in es:
        def widen(m):
            suffix = m.group(1)
            return "#rooms_row" + suffix + "".join("," + "#" + i + suffix for i in SUB_IDS)
        es = re.sub(r"#rooms_row((?:\s*>\s*\*|::-webkit-scrollbar|\[data-cs-fade=\"[^\"]*\"\])?)(?=[{,])", widen, es)
        chips["extra_styles"] = es

    v = chips.setdefault("variables", {})
    v["casora_rv"] = RV_VAR
    return json.dumps(chips, sort_keys=True, ensure_ascii=False) != before


def main() -> int:
    with open(SRC, encoding="utf-8") as fh:
        data = json.load(fh)
    changed = derive(data)
    if "--check" in sys.argv:
        if changed:
            print("casora_mobile_sensor_chips ist nicht auf dem Stand von casora_room – python3 tools/phone_room_badges.py")
            return 1
        print("Handy-Raum-Badges: aktuell")
        return 0
    if changed:
        with open(SRC, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print("casora_mobile_sensor_chips aus casora_room nachgezogen")
    else:
        print("Handy-Raum-Badges: aktuell")
    return 0


if __name__ == "__main__":
    sys.exit(main())
