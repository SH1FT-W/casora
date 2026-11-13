"""Made-up Ring-style camera with ding and motion event entities."""
from .klingel import _e


def extra(now):
    entities = []
    for domain, kind, state in (
        ("camera", "view", "idle"),
        ("event", "ding", "unknown"),
        ("event", "motion", "unknown"),
    ):
        entity = _e(domain, kind, state, kind)
        entity.update(entity_id=f"{domain}.testring_{kind}", device="testring",
                      unique_id=f"testring_{kind}")
        entity["attributes"]["friendly_name"] = f"Testring {kind}"
        entities.append(entity)
    return {
        "devices": [{"key": "testring", "name": "Testring", "manufacturer": "Ring",
                     "model": "Test", "area": None}],
        "entities": entities,
    }
