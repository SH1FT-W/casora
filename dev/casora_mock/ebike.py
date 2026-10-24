"""A made-up e-bike for the test house (Bosch eBike integration 1.19.x, always present).

Like Xunil99/ha-bosch-ebike today: one device per bike named after the drive unit, every entity on it,
`has_entity_name`. Entities with a translation_key got German names in a German HA, so their ids are German
(sensor.testrad_kilometerstand, …_tage_seit_letzter_fahrt – forum report 24.10.2026: the old prefix logic
found only the theft sensor). Battery, range, theft, location and button entities carry a fixed English
name and no key. The service-due sensors are unknown here on purpose: the popup computes days and km from
the date entity and the odometer number instead. The private fixture keeps a bike with the older English
ids; dev/unit/ebike_zuordnung.mjs covers old, new and mixed keys. Names made up.
"""
from __future__ import annotations

DEV = "testrad"
BASE = "testrad"


def _ent(eid, state, attrs, name, dc=None, unit=None, key=None, cat=None):
    a = dict(attrs)
    a.setdefault("friendly_name", name)
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": DEV, "area": None,
            "original_name": name, "name": None, "icon": None, "device_class": dc, "unit": unit, "hidden": False,
            "translation_key": key, "entity_category": cat}


def extra(now) -> dict:
    due = now.date().replace(year=now.year + 1)
    ents = [
        # translation_key entities: German names, German ids.
        _ent(f"sensor.{BASE}_kilometerstand", "1140.6", {"state_class": "total_increasing"}, "Testrad Kilometerstand", dc="distance", unit="km", key="odometer"),
        _ent(f"sensor.{BASE}_motor_betriebsstunden", "72.3", {"state_class": "total_increasing"}, "Testrad Motor-Betriebsstunden", dc="duration", unit="h", key="motor_total_hours"),
        _ent(f"sensor.{BASE}_motor_unterstutzungsstunden", "61.0", {"state_class": "total_increasing"}, "Testrad Motor-Unterstützungsstunden", dc="duration", unit="h", key="motor_assist_hours"),
        _ent(f"sensor.{BASE}_aktive_unterstutzungsstufen", "A100M00040, A100M0AUTO, A100M00020, A100M00010", {}, "Testrad Aktive Unterstützungsstufen", key="active_assist_modes"),
        _ent(f"sensor.{BASE}_service_fallig_in_tagen", "unknown", {}, "Testrad Service fällig in Tagen", unit="d", key="service_due_in_days"),
        _ent(f"sensor.{BASE}_service_fallig_in_kilometern", "unknown", {}, "Testrad Service fällig in Kilometern", unit="km", key="service_due_in_km"),
        _ent(f"sensor.{BASE}_tage_seit_letzter_fahrt", "3", {}, "Testrad Tage seit letzter Fahrt", unit="d", key="days_since_last_ride"),
        _ent(f"sensor.{BASE}_letzte_fahrt_datum", "21.10.2026", {}, "Testrad Letzte Fahrt: Datum", key="last_ride_date"),
        _ent(f"sensor.{BASE}_letzte_fahrt_titel", "Feierabendrunde", {}, "Testrad Letzte Fahrt: Titel", key="last_ride_title"),
        _ent(f"sensor.{BASE}_letzte_fahrt_distanz", "23.4", {}, "Testrad Letzte Fahrt: Distanz", dc="distance", unit="km", key="last_ride_distance"),
        _ent(f"sensor.{BASE}_letzte_fahrt_dauer", "68.5", {}, "Testrad Letzte Fahrt: Dauer", dc="duration", unit="min", key="last_ride_duration"),
        _ent(f"sensor.{BASE}_letzte_fahrt_o_geschwindigkeit", "20.5", {}, "Testrad Letzte Fahrt: Ø Geschwindigkeit", unit="km/h", key="last_ride_avg_speed"),
        _ent(f"sensor.{BASE}_letzte_fahrt_max_geschwindigkeit", "41.2", {}, "Testrad Letzte Fahrt: Max. Geschwindigkeit", unit="km/h", key="last_ride_max_speed"),
        _ent(f"sensor.{BASE}_letzte_fahrt_hohenmeter", "210", {}, "Testrad Letzte Fahrt: Höhenmeter ↑", unit="m", key="last_ride_elevation_gain"),
        _ent(f"sensor.{BASE}_letzte_fahrt_o_leistung", "112", {}, "Testrad Letzte Fahrt: Ø Leistung", dc="power", unit="W", key="last_ride_avg_power"),
        _ent(f"sensor.{BASE}_letzte_fahrt_o_trittfrequenz", "74", {}, "Testrad Letzte Fahrt: Ø Trittfrequenz", unit="rpm", key="last_ride_avg_cadence"),
        _ent(f"sensor.{BASE}_letzte_fahrt_akku_verbrauch_wh", "186.4", {}, "Testrad Letzte Fahrt: Akku-Verbrauch (Wh)", dc="energy", unit="Wh", key="last_ride_battery_wh"),
        _ent(f"sensor.{BASE}_touren_gesamt", "58", {"state_class": "total_increasing"}, "Testrad Touren gesamt", key="total_rides"),
        _ent(f"sensor.{BASE}_distanz_gesamt_touren", "1098.2", {"state_class": "total_increasing"}, "Testrad Distanz gesamt (Touren)", dc="distance", unit="km", key="total_distance_activities"),
        _ent(f"sensor.{BASE}_fahrzeit_gesamt", "72.58", {"state_class": "total_increasing"}, "Testrad Fahrzeit gesamt", dc="duration", unit="h", key="total_duration"),
        _ent(f"sensor.{BASE}_hohenmeter_gesamt", "6420", {"state_class": "total_increasing"}, "Testrad Höhenmeter gesamt", unit="m", key="total_elevation_gain"),
        _ent(f"sensor.{BASE}_o_geschwindigkeit_alle_touren", "19.8", {}, "Testrad Ø Geschwindigkeit (alle Touren)", unit="km/h", key="avg_speed_all_rides"),
        _ent(f"sensor.{BASE}_kalorien_gesamt", "28400", {"state_class": "total_increasing"}, "Testrad Kalorien gesamt", unit="kcal", key="total_calories"),
        _ent(f"sensor.{BASE}_geschatzte_reichweite_voller_akku", "78", {}, "Testrad Geschätzte Reichweite (voller Akku)", dc="distance", unit="km", key="estimated_range_full"),
        _ent(f"sensor.{BASE}_ladeenergie_365_tage", "9800", {}, "Testrad Ladeenergie (365 Tage)", dc="energy", unit="Wh", key="energy_charged_365d"),
        _ent(f"sensor.{BASE}_wartungs_ubersicht", "0", {"items": []}, "Testrad Wartungs-Übersicht", key="maintenance_overview"),
        _ent(f"number.{BASE}_battery_capacity", "750", {"min": 100, "max": 2000, "step": 1, "mode": "box"}, "Testrad Battery Capacity", unit="Wh", key="battery_capacity"),
        _ent(f"number.{BASE}_service_due_odometer", "1500", {"min": 0, "max": 100000, "step": 1, "mode": "box"}, "Testrad Service Due Odometer", unit="km", key="service_due_odometer"),
        _ent(f"date.{BASE}_service_due_date", due.isoformat(), {}, "Testrad Service Due Date", key="service_due_date"),
        # Fixed English names, no key.
        _ent(f"sensor.{BASE}_reachable_range_eco", "84", {}, "Testrad Reachable Range ECO", dc="distance", unit="km"),
        _ent(f"sensor.{BASE}_reachable_range_auto", "61", {}, "Testrad Reachable Range AUTO", dc="distance", unit="km"),
        _ent(f"sensor.{BASE}_reachable_range_sport", "52", {}, "Testrad Reachable Range SPORT", dc="distance", unit="km"),
        _ent(f"sensor.{BASE}_reachable_range_turbo", "40", {}, "Testrad Reachable Range TURBO", dc="distance", unit="km"),
        _ent(f"sensor.{BASE}_range_band", "40–84 km", {"min_km": 40, "max_km": 84}, "Testrad Range Band"),
        _ent(f"sensor.{BASE}_powertube_750_wh_lifetime", "6353", {"state_class": "total_increasing"}, "Testrad PowerTube 750 Wh Lifetime", dc="energy", unit="Wh"),
        _ent(f"sensor.{BASE}_powertube_750_charge_cycles", "9.7", {"state_class": "total_increasing"}, "Testrad PowerTube 750 Charge Cycles"),
        _ent(f"sensor.{BASE}_powertube_750_cycles_on_bike", "9.7", {"state_class": "total_increasing"}, "Testrad PowerTube 750 Cycles On Bike"),
        _ent(f"sensor.{BASE}_powertube_750_cycles_off_bike", "0.0", {"state_class": "total_increasing"}, "Testrad PowerTube 750 Cycles Off Bike"),
        _ent(f"sensor.{BASE}_powertube_750_state_of_health", "96", {}, "Testrad PowerTube 750 State of Health", unit="%"),
        _ent(f"sensor.{BASE}_powertube_750_measured_capacity", "unknown", {}, "Testrad PowerTube 750 Measured Capacity", unit="Wh"),
        _ent(f"binary_sensor.{BASE}_theft_reported", "off", {}, "Testrad Theft Reported", dc="problem"),
        _ent(f"binary_sensor.{BASE}_software_update_available", "off", {}, "Testrad Software Update Available", dc="update"),
        _ent(f"device_tracker.{BASE}_last_known_location", "home", {"source_type": "gps", "latitude": 52.5205, "longitude": 13.4099, "gps_accuracy": 25},
             "Testrad Last Known Location", cat="diagnostic"),
        _ent(f"button.{BASE}_reset_service_due", "unknown", {}, "Testrad Reset Service Due"),
        _ent(f"button.{BASE}_import_all_gps_data", "unknown", {}, "Testrad Import All GPS Data"),
        _ent(f"button.{BASE}_import_latest_gps_data", "unknown", {}, "Testrad Import Latest GPS Data"),
        _ent(f"button.{BASE}_export_track_summary_csv", "unknown", {}, "Testrad Export track summary CSV"),
    ]
    return {
        "devices": [{"key": DEV, "name": "Testrad", "manufacturer": "Bosch", "model": "Testrad", "area": None}],
        "entities": ents,
    }
