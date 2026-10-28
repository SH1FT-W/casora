"""A made-up shopping list (community card "Bring! Einkaufsliste", issue #82; not in the demo house).

A to-do list on its own device, named like a shopping list; the items come from the mock's todo entity (entity.py
MTodo). Names made up.
"""
from __future__ import annotations

from .testserver import _ent

DEV = "testeinkauf"


def extra(now) -> dict:
    return {
        "devices": [{"key": DEV, "name": "Testeinkauf", "manufacturer": None, "model": "Shopping list", "area": None}],
        "entities": [_ent(f"todo.{DEV}_einkaufsliste", "2", {"supported_features": 7}, "Testeinkauf Einkaufsliste", dev=DEV)],
    }
