"""Assumptions about Home Assistant itself (docs/ha-annahmen.md), checked against the installed HA.

  ~/.cache/ha-venv/<version>/bin/python dev/unit/ha_annahmen_test.py

Energy settings (#44): the Home energy badge takes the house from energy/get_prefs (scripts/local/00-finder.js
casoraEnergyHouse). It relies on grid, solar and battery sources carrying their power sensor in stat_rate, with
power_config for grid and battery, and on HA writing the sensor to use into stat_rate (also its own template
sensor for an inverted or a two sensor power_config).
"""

from __future__ import annotations

import typing

from homeassistant.components.energy import data

keys = lambda t: set(typing.get_type_hints(t))  # noqa: E731

assert {"stat_rate", "power_config"} <= keys(data.GridSourceType), keys(data.GridSourceType)
assert "stat_rate" in keys(data.SolarSourceType), keys(data.SolarSourceType)
assert {"stat_rate", "power_config"} <= keys(data.BatterySourceType), keys(data.BatterySourceType)
assert {"stat_rate", "stat_rate_inverted", "stat_rate_from", "stat_rate_to"} <= keys(data.PowerConfig)
# Legacy grid format, still read: power: [{ stat_rate }].
assert {"stat_rate", "power_config"} <= keys(data.GridPowerSourceType)
print("ok energy source types: stat_rate / power_config")

grid = data.GRID_SOURCE_SCHEMA({
    "type": "grid", "stat_energy_from": "sensor.bezug", "stat_energy_to": None,
    "stat_cost": None, "entity_energy_price": None, "number_energy_price": None,
    "stat_compensation": None, "entity_energy_price_export": None, "number_energy_price_export": None,
    "power_config": {"stat_rate_inverted": "sensor.zaehler_leistung"}, "cost_adjustment_day": 0,
})
assert grid["power_config"] == {"stat_rate_inverted": "sensor.zaehler_leistung"}, grid
solar = data.SOLAR_SOURCE_SCHEMA({"type": "solar", "stat_energy_from": "sensor.ertrag", "stat_rate": "sensor.pv_leistung"})
assert solar["stat_rate"] == "sensor.pv_leistung"
battery = data.BATTERY_SOURCE_SCHEMA({
    "type": "battery", "stat_energy_from": "sensor.aus", "stat_energy_to": "sensor.ein",
    "power_config": {"stat_rate_from": "sensor.entladen", "stat_rate_to": "sensor.laden"},
})
assert "stat_rate_from" in battery["power_config"]
print("ok energy source schemas accept stat_rate / power_config")

# HA fills stat_rate from power_config: the sensor itself, or the template sensor it makes.
gen = lambda kind, cfg: f"sensor.generated_{kind}_power"  # noqa: E731
mgr = data.EnergyManager.__new__(data.EnergyManager)
assert mgr._process_grid_power(dict(grid), gen)["stat_rate"] == "sensor.generated_grid_power"
assert mgr._process_grid_power({**grid, "power_config": {"stat_rate": "sensor.netz"}}, gen)["stat_rate"] == "sensor.netz"
assert mgr._process_battery_power(dict(battery), gen)["stat_rate"] == "sensor.generated_battery_power"
print("ok HA writes the power sensor to use into stat_rate")
