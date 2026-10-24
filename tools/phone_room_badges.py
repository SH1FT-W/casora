"""Phone room page = room header on the desktop: derive the badge row from casora_room (05.10.2026).

    python3 tools/phone_room_badges.py          # writes dashboards/casora/button_card_templates.json
    python3 tools/phone_room_badges.py --check  # check only (returns 1 when out of date)

build-templates.py calls derive() before building, so the two templates stay equal by themselves.

The row rooms_row in casora_mobile_sensor_chips (phone room page) gets exactly the cards of
casora_room's top badge row (custom_fields.badges), the sub-rows room_sub_<kind> the cards of the
desktop sub-rows (badges_climate, badges_security …). Instead of the room card's variables they
read variables.casora_rv – the desktop room's variables, which window.casoraPhoneRoom.vars()
delivers at runtime (casora-core.js, WS casora/phone_room_badges).

Deliberately different from the desktop:
  - Scenes: no badge, the phone room page has an area of its own for them.
  - Group badges open their sub-row per device (ll-custom casora_phone_row,
    window._casoraFilter.setRow) instead of via the shared helper casora_expanded_row – otherwise
    a tap on the wall tablet opened the row on the phone and vice versa.
  - Motion (room_chips[<room>].motion_entity, phone only) is the last badge.
  - Security gets place: room (sub-line „Automatisch“ = spelled out as in a room).
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

# Group badge → kind of sub-row (as casora_expanded_row on the desktop) → desktop field.
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
    """[[[ … variables … ]]] of the room header → the same via variables.casora_rv."""
    if not isinstance(s, str) or not s.lstrip().startswith("[[["):
        return s
    at = s.index("[[[") + 3
    body = s[at:]
    body = body.replace("this._config?.name", "_rv._name")
    # On the phone the room pages sit in the home view: without the card, casoraHasSec does not count
    # the house's doors and windows there and casoraHouseContactsOf lists none (Home only, #39).
    body = body.replace("casoraHasSec(variables,user,this)", "casoraHasSec(variables,user)")
    body = re.sub(r"(casoraHouseContactsOf\(hass,variables,'(?:door|window)',user),this\)", r"\1)", body)
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
            continue   # scenes: an area of their own on the phone room page
        c = _deep(copy.deepcopy(c))
        kind = GROUPS.get(c.get("template"))
        if kind == "energy":
            subs = ("[[[ " + RV + "let s = false; for (let i = 1; i <= 8; i++) if (_rv['energy_entity_' + i]) s = true; ")
            c["tap_action"] = {
                # Without sub-badges straight to the energy popup (as casora_badge_energy_group).
                "action": subs + "return s ? 'fire-dom-event' : (window.casoraPopupAction ? window.casoraPopupAction() : 'more-info'); ]]]",
                "casora_phone_row": subs + "return s ? 'energy' : null; ]]]",
                "haptic": "light",
            }
        elif kind:
            c["tap_action"] = {"action": "fire-dom-event", "casora_phone_row": kind, "haptic": "light"}
        if kind == "security":
            # The phone room page sits in the view „home“ – it is still a room
            # (security „Automatisch“ = spelled out, 07.10.2026).
            c.setdefault("variables", {})["place"] = "room"
        if c.get("type") == "custom:casora-custom-badges":
            # Own badges (#53): "go to room" sets the phone's filter instead of navigating.
            c["place"] = "phone"
        out.append(c)
    return out


# Wrap option of the badge row (badges_wrap, #53): the phone room page wraps like the desktop header.
WRAP_KEYS = ("display", "flex-wrap", "row-gap")


def _row_layout(room: dict, row: dict) -> None:
    lay = room["custom_fields"]["badges"]["card"].get("layout") or {}
    target = row.setdefault("layout", {})
    for k in WRAP_KEYS:
        if k in lay:
            target[k] = _tx(lay[k])
        else:
            target.pop(k, None)


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
    """Bring casora_mobile_sensor_chips up to date with casora_room. True if something changed."""
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
    _row_layout(room, row)

    # Sub-rows, after the row in this order.
    for k in [k for k in cf if k.startswith("room_sub_")]:
        del cf[k]
    for kind, field in SUBS.items():
        sub = _deep(copy.deepcopy(room["custom_fields"][field]))
        card = sub["card"]
        if isinstance(card.get("layout"), dict):
            card["layout"]["grid-column-gap"] = "var(--casora-mobile-chip-gap, 16px)"
            card["card_mod"] = copy.deepcopy(row.get("card_mod"))
        cf["room_sub_" + kind] = sub

    # Styles: row as before, badge order as in the room header (badge_order).
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

    # Soft edges, swiping, no scrollbar for the sub-rows too.
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
