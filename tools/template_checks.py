"""Gemeinsame Prüfungen für Kartenvorlagen (build-templates.py, build-card-update.py)."""
import re

# Feste Entitäten aus dem Testhaus dürfen nicht ins Paket – bei anderen Nutzern
# überstimmen sie sonst die gewählte Entität. Erlaubt sind nur Casoras eigene Helfer.
ALLOWED = re.compile(r"^(\w+\.casora_\w+|sensor\.time|script\.turn_on|climate\.set_hvac_mode|alarm_control_panel\.alarmo)$")
# Bis Lüften in Casora nachgebaut ist: eigener Sensor (Lüften-Kachel).
TEMP_ALLOWED = {"binary_sensor.hemma_lueften_hinweis", "sensor.hemma_lueften"}
ENTITY = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")


def fixed_ids(templates):
    """Feste Entitäten in variables/entity – auch in Listen und Objekten (z. B. wlan_entities)."""
    out = []

    def walk(where, v):
        if isinstance(v, str):
            if ENTITY.match(v) and not ALLOWED.match(v) and v not in TEMP_ALLOWED:
                out.append(f"{where} = {v}")
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(f"{where}[{i}]", x)
        elif isinstance(v, dict):
            for k, x in v.items():
                walk(f"{where}.{k}", x)

    for name, t in templates.items():
        walk(f"{name}.variables", t.get("variables") or {})
        walk(f"{name}.entity", t.get("entity"))
    return out
