"""Ein erfundener Team-Tracker-Sensor für das Testhaus (immer dabei, auch ohne private Fixture).

Team Tracker (HACS „teamtracker“) legt je Team einen Sensor ohne Gerät an; Zustand ist die
Spielphase (PRE/IN/POST/NOT_FOUND), alles Weitere steht in den Attributen. Im Testhaus läuft er
unter der Plattform casora_mock – Casora erkennt ihn dann an den Attributen (sport_path,
team_abbr, opponent_abbr). Vereine, Stadion und Wappen sind erfunden; Wappen als data:-SVG,
damit nichts aus dem Netz geladen wird. Tabelle und Form fragt das Popup bei ESPN ab – die
Tests fangen das ab (dev/qa/fussball-espn.mjs).
"""
from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import quote

TEAM_ID, OPP_ID = "990001", "990002"


def crest(color: str, letters: str) -> str:
    svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
           f'<path d="M32 4 56 12v18c0 15-10 25-24 30C18 55 8 45 8 30V12z" fill="{color}"/>'
           '<path d="M32 10 50 16v14c0 11-7 19-18 23-11-4-18-12-18-23V16z" fill="none" stroke="#fff" stroke-width="2.5"/>'
           f'<text x="32" y="38" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fff" '
           f'text-anchor="middle">{letters}</text></svg>')
    return "data:image/svg+xml," + quote(svg)


def attrs(now: datetime) -> dict:
    """Attribute wie Team Tracker vor dem Spiel (Anstoß übermorgen 18:30 UTC)."""
    kick = (now + timedelta(days=2)).replace(hour=18, minute=30, second=0, microsecond=0)
    return {
        "friendly_name": "FC Nordhafen", "icon": "mdi:soccer", "attribution": "Data provided by ESPN",
        "sport": "soccer", "sport_path": "soccer", "league": "GER.1", "league_path": "ger.1",
        "league_name": "German Bundesliga", "league_logo": None, "season": "2026-27",
        "team_abbr": "NOR", "opponent_abbr": "LIN", "event_id": "990900", "event_name": "LIN @ NOR", "event_url": None,
        "date": kick.isoformat(), "kickoff_in": "in 2 days", "series_summary": None,
        "venue": "Hafenpark-Arena", "location": "Nordhafen", "tv_network": None, "odds": None,
        "overunder": None, "team_name": "FC Nordhafen", "team_long_name": "FC Nordhafen 1907",
        "team_id": TEAM_ID, "team_record": "4-2-1", "team_rank": None, "team_conference_id": None,
        "team_homeaway": "home", "team_logo": crest("#1F5FA8", "FCN"), "team_url": None,
        "team_colors": ["#1F5FA8", "#FFFFFF"], "team_score": "0", "team_win_probability": None,
        "team_winner": None, "team_timeouts": None, "team_shots_on_target": None, "team_total_shots": None,
        "opponent_name": "SV Lindenberg", "opponent_long_name": "SV Lindenberg 04",
        "opponent_id": OPP_ID, "opponent_record": "3-1-3", "opponent_rank": None,
        "opponent_conference_id": None, "opponent_homeaway": "away",
        "opponent_logo": crest("#B8322A", "SVL"), "opponent_url": None,
        "opponent_colors": ["#B8322A", "#FFFFFF"], "opponent_score": "0",
        "opponent_win_probability": None, "opponent_winner": None, "opponent_timeouts": None,
        "opponent_shots_on_target": None, "opponent_total_shots": None,
        "quarter": None, "clock": kick.strftime("%a, %B %d at %I:%M %p UTC"), "possession": None,
        "last_play": None, "down_distance_text": None, "outs": None, "balls": None, "strikes": None,
        "on_first": None, "on_second": None, "on_third": None,
        "team_sets_won": None, "opponent_sets_won": None,
        "last_update": now.isoformat(), "api_message": None, "api_url": None,
    }


def extra(now: datetime) -> dict:
    a = attrs(now)
    ent = {"entity_id": "sensor.fc_nordhafen", "state": "PRE", "attributes": a, "platform": "casora_mock",
           "device": None, "area": None, "original_name": a["friendly_name"], "name": None, "icon": "mdi:soccer",
           "device_class": None, "unit": None, "hidden": False, "translation_key": None, "entity_category": None}
    return {"entities": [ent]}
