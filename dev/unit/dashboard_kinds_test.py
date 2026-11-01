"""casora/dashboards/kinds without a running HA: the Studio's dashboard check, answered on the server.

  uv run --python 3.14 --with homeassistant python dev/unit/dashboard_kinds_test.py

Ladezeit stage 1 (01.11.2026): the Studio fetched every dashboard's whole configuration to see whether it is
a Casora dashboard (28 MB of JSON for 14 dashboards). Same rules as casora-panel.js _isCasoraDash and
casora-panel-personal.js dashboardPlayers: phone shell in the first view = mobile, a view starting with a
room card = wide, else none; unreadable = None. Budget: the answer stays small (no configuration in it).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.components.lovelace.const import LOVELACE_DATA  # noqa: E402

import custom_components.casora.dashboard_kinds as K  # noqa: E402

fails = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + (f" ({info})" if info and not cond else ""))
    if not cond:
        fails.append(name)


class Dash:
    def __init__(self, cfg=None, err=None):
        self.cfg, self.err = cfg, err

    async def async_load(self, force):
        if self.err:
            raise self.err
        return self.cfg


templates = {f"tpl_{i}": {"name": "[[[ return 1 ]]]" * 200} for i in range(300)}
wide = {"button_card_templates": templates, "views": [
    {"cards": [{"type": "custom:button-card", "template": "casora_home"}]},
    {"cards": [{"type": "custom:button-card", "template": "casora_room",
                "variables": {"media_player_1": "media_player.kueche", "media_player_2": "media_player.YOUR_ENTITY"}},
               {"template": ["casora_now_playing"], "variables": {"media_player_1": "media_player.bad"}}]}]}
mobile = {"button_card_templates": templates, "views": [{"cards": [
    {"template": "casora_mobile_bg"},
    {"cards": [{"template": "casora_mobile_now_playing", "variables": {"media_player_3": "media_player.kueche",
                                                                        "media_player_4": "media_player.wohnen"}}]}]}]}
other = {"views": [{"cards": [{"type": "entities", "entities": ["light.a"]}]}]}
# Room card not first in its view: not a Casora dashboard (as in the Studio).
late_room = {"views": [{"cards": [{"type": "markdown"}, {"template": "casora_room"}]}]}
# Players only count where a room card or the phone playback is shown at all.
np_only = {"views": [{"cards": [{"template": "casora_now_playing", "variables": {"media_player_1": "media_player.x"}}]}]}


class NotFound(Exception):
    pass


hass = SimpleNamespace(data={LOVELACE_DATA: SimpleNamespace(dashboards={
    None: Dash(other), "casora-home": Dash(wide), "casora-home-mobile": Dash(mobile), "map": Dash(other),
    "late": Dash(late_room), "np": Dash(np_only), "new": Dash(err=NotFound("no config")), "empty": Dash(None)})})

res = asyncio.run(K.async_dashboard_kinds(hass))
check("default dashboard (no url) left out", None not in res)
check("wide", res["casora-home"]["kind"] == "wide", res["casora-home"])
check("mobile", res["casora-home-mobile"]["kind"] == "mobile", res["casora-home-mobile"])
check("other", res["map"]["kind"] == "none")
check("room card not first: none", res["late"]["kind"] == "none")
check("unreadable: None", res["new"]["kind"] is None)
check("empty config: none", res["empty"]["kind"] == "none")
check("players of room cards (only media_player.*, no duplicates)",
      res["casora-home"]["players"] == ["media_player.kueche", "media_player.YOUR_ENTITY", "media_player.bad"],
      res["casora-home"]["players"])
check("players of the phone playback", res["casora-home-mobile"]["players"] == ["media_player.kueche", "media_player.wohnen"])
check("no players without room card / phone playback", res["np"]["players"] == [])
size = len(json.dumps(res))
full = len(json.dumps(wide)) + len(json.dumps(mobile))
check("answer is small (budget < 2 KB here, configurations were %d KB)" % (full // 1024), size < 2048, size)

print("FAIL" if fails else "alle ok")
sys.exit(1 if fails else 0)
