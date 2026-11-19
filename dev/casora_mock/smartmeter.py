"""A made-up smart meter with daily counters (community card "Smart Meter", card request 208; not in the demo house).

Like a Hildebrand-Glow-like integration (registered under the platform "hildebrandglow_dcc", registry_platform, states
written directly): electricity and gas consumption of today (kWh, device_class energy, total_increasing), their cost
of today (GBP, monetary, total), the day's standing charges (constant all day) and the day's total cost. All of them
reset at midnight. Two decoys the card must not pick: the supplier's cost without a word of a day ("Cost (API)") and
the electricity unit rate (GBP/kWh). Names and the meter are made up.

The long-term statistics of the daily counters come from the mock (__init__.py _import_daily_stats, "_stats_daily"):
30 days of hourly rows whose state falls back to 0 at local midnight; it also sets today's states to the sums since
midnight, so tile, popup and statistics agree.
"""
from __future__ import annotations

from .testserver import _ent

DEV = "testsmartmeter"
PLATFORM = "hildebrandglow_dcc"
ELEC = f"sensor.{DEV}_electricity_consumption"
ELEC_COST = f"sensor.{DEV}_electricity_daily_cost"
GAS = f"sensor.{DEV}_gas_consumption"
GAS_COST = f"sensor.{DEV}_gas_daily_cost"
STANDING = f"sensor.{DEV}_daily_standing_charges"
TOTAL = f"sensor.{DEV}_total_daily_energy_cost"
ELEC_RATE = 0.245
GAS_RATE = 0.062
STANDING_DAY = 0.84


def _e(eid, state, name, dc, unit, sc):
    e = _ent(eid, state, {"state_class": sc}, name, dc=dc, unit=unit, dev=DEV)
    e["registry_platform"] = PLATFORM
    return e


def extra(now) -> dict:
    ents = [
        _e(ELEC, "0", "Testsmartmeter Electricity Consumption", "energy", "kWh", "total_increasing"),
        _e(ELEC_COST, "0", "Testsmartmeter Electricity Daily Cost", "monetary", "GBP", "total"),
        _e(f"sensor.{DEV}_electricity_cost_api", "0", "Testsmartmeter Electricity Cost (API)", "monetary", "GBP", "total"),
        _e(f"sensor.{DEV}_electricity_unit_rate", "0.245", "Testsmartmeter Electricity Unit Rate", "monetary", "GBP/kWh", "measurement"),
        _e(GAS, "0", "Testsmartmeter Gas Consumption", "energy", "kWh", "total_increasing"),
        _e(GAS_COST, "0", "Testsmartmeter Gas Daily Cost", "monetary", "GBP", "total"),
        _e(STANDING, str(STANDING_DAY), "Testsmartmeter Daily Standing Charges", "monetary", "GBP", "total"),
        _e(TOTAL, "0", "Testsmartmeter Total Daily Energy Cost", "monetary", "GBP", "total"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testsmartmeter", "manufacturer": "Zählerwerk", "model": "Smart Meter 2", "area": None}],
        "entities": ents,
        # Hourly use per profile (__init__.py): electricity like a household, gas for heating; costs = use × rate,
        # the standing charge a constant, the total their sum.
        "_stats_daily": {
            ELEC: {"profile": "elec"},
            GAS: {"profile": "gas"},
            ELEC_COST: {"of": ELEC, "rate": ELEC_RATE},
            GAS_COST: {"of": GAS, "rate": GAS_RATE},
            STANDING: {"const": STANDING_DAY},
            TOTAL: {"sum": [ELEC_COST, GAS_COST], "const": STANDING_DAY},
        },
    }
