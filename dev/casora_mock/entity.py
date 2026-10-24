"""Entity classes of the test integration.

Every entity reads state and attributes from the test integration's store
(CasoraMock.store) and writes changes made by services back there.
Each platform inherits HA's real base class (SensorEntity, TrackerEntity, UpdateEntity ...),
so HA's defaults apply as in a real installation: entity category, device class handling,
registry behaviour. Only state and attributes are overridden: the computed attributes of
the base classes are bypassed on purpose, so the values match the snapshot 1:1.
"""
from __future__ import annotations

import re
import struct
import zlib
from datetime import datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity
from homeassistant.util import dt as dt_util

DOMAIN = "casora_mock"
HIDE_ATTRS = {"friendly_name", "icon", "unit_of_measurement", "device_class", "supported_features"}
# Numeric code of the test alarm panels with code_format (halten.py: "Testalarm Code").
ALARM_CODE = "1234"


class MockEntity(Entity):
    """Common base: values come from the store."""

    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, mock, eid: str) -> None:
        self.mock = mock
        self.entity_id = eid
        # The store key stays the fixture ID: if a test renames the entity in HA (new entity_id),
        # it keeps its state and attributes instead of ending up without a state.
        self._key = eid
        # unique_id like the real integration where the fixture names it (Reolink "<uid>_<channel>_<key>"), else the ID.
        self._attr_unique_id = mock.entities[eid].get("unique_id") or eid
        attrs = mock.store[eid][1]
        self._attr_name = attrs.get("friendly_name") or eid.split(".", 1)[1]
        self._attr_icon = attrs.get("icon")
        self._attr_device_class = attrs.get("device_class")
        # Language-independent key of the real integration - popups find their entities by it.
        self._attr_translation_key = mock.entities[eid].get("translation_key")
        # Without a category in the fixture the base class default applies (device_tracker diagnostic since
        # HA 2026.10, issue #25; update config/diagnostic ...); a category from the fixture overrides it.
        cat = mock.entities[eid].get("entity_category")
        if cat:
            from homeassistant.const import EntityCategory
            try:
                self._attr_entity_category = EntityCategory(cat)
            except ValueError:
                pass
        key = mock.entities[eid].get("device")
        if key:
            self._attr_device_info = DeviceInfo(identifiers={(DOMAIN, key)})

    # State/attributes 1:1 from the store
    @property
    def state(self) -> Any:  # noqa: D102 - overrides the base classes' @final on purpose
        return self.mock.store[self._key][0]

    @property
    def state_attributes(self) -> dict | None:
        return None

    @property
    def capability_attributes(self) -> dict | None:
        return None

    @property
    def extra_state_attributes(self) -> dict:
        return {k: v for k, v in self.a.items() if k not in HIDE_ATTRS}

    @property
    def unit_of_measurement(self) -> str | None:
        return self.a.get("unit_of_measurement")

    _feature_cls = None

    @property
    def supported_features(self):
        v = int(self.a.get("supported_features") or 0)
        return self._feature_cls(v) if self._feature_cls else v

    @property
    def available(self) -> bool:
        return True

    @property
    def a(self) -> dict:
        return self.mock.store[self._key][1]

    @property
    def s(self) -> str:
        return self.mock.store[self._key][0]

    def put(self, state: str | None = None, **attrs) -> None:
        self.mock.set(self._key, state, **attrs)

    async def async_added_to_hass(self) -> None:
        self.mock.objs[self._key] = self


# ── Switchable types ─────────────────────────────────────────────────────
class ToggleMixin:
    @property
    def is_on(self) -> bool:
        return self.s == "on"

    async def async_turn_on(self, **kw) -> None:
        self.put("on", **{k: v for k, v in kw.items() if k in ("percentage", "preset_mode")})

    async def async_turn_off(self, **kw) -> None:
        self.put("off")

    async def async_toggle(self, **kw) -> None:
        self.put("off" if self.s == "on" else "on")


def build_classes(hass: HomeAssistant) -> dict[str, type]:
    """Import the classes only here, so only the needed components load."""
    from homeassistant.components.alarm_control_panel import AlarmControlPanelEntity
    from homeassistant.components.button import ButtonEntity
    from homeassistant.components.calendar import CalendarEntity, CalendarEvent
    from homeassistant.components.camera import Camera
    from homeassistant.components.climate import ClimateEntity, HVACMode
    from homeassistant.components.cover import CoverEntity
    from homeassistant.components.fan import FanEntity
    from homeassistant.components.light import ColorMode, LightEntity
    from homeassistant.components.lock import LockEntity
    from homeassistant.components.media_player import MediaPlayerEntity
    from homeassistant.components.number import NumberEntity
    from homeassistant.components.remote import RemoteEntity
    from homeassistant.components.scene import Scene
    from homeassistant.components.select import SelectEntity
    from homeassistant.components.siren import SirenEntity
    from homeassistant.components.switch import SwitchEntity
    from homeassistant.components.todo import TodoItem, TodoItemStatus, TodoListEntity, TodoListEntityFeature
    from homeassistant.components.vacuum import StateVacuumEntity
    from homeassistant.components.lawn_mower import LawnMowerEntity
    from homeassistant.components.humidifier import HumidifierEntity
    from homeassistant.components.weather import Forecast, WeatherEntity, WeatherEntityFeature
    from homeassistant.components.binary_sensor import BinarySensorEntity
    from homeassistant.components.date import DateEntity
    from homeassistant.components.device_tracker import SourceType, TrackerEntity
    from homeassistant.components.event import EventEntity
    from homeassistant.components.sensor import SensorEntity
    from homeassistant.components.time import TimeEntity
    from homeassistant.components.update import UpdateEntity

    class MLight(MockEntity, ToggleMixin, LightEntity):
        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            modes = set()
            for m in self.a.get("supported_color_modes") or ["onoff"]:
                try:
                    modes.add(ColorMode(m))
                except ValueError:
                    pass
            self._attr_supported_color_modes = modes or {ColorMode.ONOFF}
            cm = self.a.get("color_mode")
            self._attr_color_mode = ColorMode(cm) if cm in [m.value for m in modes] else next(iter(self._attr_supported_color_modes))

        async def async_turn_on(self, **kw) -> None:
            attrs = {}
            if "brightness" in kw:
                attrs["brightness"] = kw["brightness"]
            elif not self.a.get("brightness"):
                attrs["brightness"] = 255
            for k in ("color_temp_kelvin", "rgb_color", "rgbw_color", "rgbww_color", "hs_color", "xy_color", "effect"):
                if k in kw:
                    attrs[k] = list(kw[k]) if isinstance(kw[k], tuple) else kw[k]
            # Color mode follows the chosen color (like real lights), else color_mode would stay stale.
            sup = self.a.get("supported_color_modes") or []
            for k, cm in (("color_temp_kelvin", "color_temp"), ("hs_color", "hs"), ("rgb_color", "rgb"),
                          ("rgbw_color", "rgbw"), ("rgbww_color", "rgbww"), ("xy_color", "xy")):
                if k in kw and cm in sup:
                    attrs["color_mode"] = cm
                    break
            self.put("on", **attrs)

        async def async_turn_off(self, **kw) -> None:
            for k in ("brightness", "color_temp_kelvin", "rgb_color", "hs_color", "xy_color"):
                self.a.pop(k, None)
            self.put("off")

        async def async_toggle(self, **kw) -> None:
            if self.s == "on":
                await self.async_turn_off()
            else:
                await self.async_turn_on()

    class MSwitch(MockEntity, ToggleMixin, SwitchEntity):
        pass

    class MSiren(MockEntity, ToggleMixin, SirenEntity):
        pass

    class MRemote(MockEntity, ToggleMixin, RemoteEntity):
        async def async_send_command(self, command, **kw) -> None:
            return None

    class MFan(MockEntity, ToggleMixin, FanEntity):
        # HA checks set_preset_mode against preset_modes (property, not attribute).
        @property
        def preset_modes(self):
            return self.a.get("preset_modes")

        @property
        def preset_mode(self):
            return self.a.get("preset_mode")

        @property
        def percentage(self):
            return self.a.get("percentage")

        # FanEntity calls turn_on(percentage, preset_mode, **kw) with positional arguments.
        async def async_turn_on(self, percentage=None, preset_mode=None, **kw) -> None:
            self.put("on", **{k: v for k, v in (("percentage", percentage), ("preset_mode", preset_mode)) if v is not None})

        async def async_set_percentage(self, percentage: int) -> None:
            # A fixed speed ends the preset mode (like real air purifiers).
            if "preset_mode" in self.a:
                self.a["preset_mode"] = None
            self.put("on" if percentage else "off", percentage=percentage)

        async def async_set_preset_mode(self, preset_mode: str) -> None:
            self.put("on", preset_mode=preset_mode)

    class MCover(MockEntity, CoverEntity):
        @property
        def is_closed(self) -> bool:
            return self.s == "closed"

        @property
        def current_cover_position(self) -> int | None:
            return self.a.get("current_position")

        async def async_open_cover(self, **kw) -> None:
            self.put("open", current_position=100)

        async def async_close_cover(self, **kw) -> None:
            self.put("closed", current_position=0)

        async def async_stop_cover(self, **kw) -> None:
            return None

        async def async_set_cover_position(self, **kw) -> None:
            pos = int(kw.get("position", 0))
            self.put("open" if pos > 0 else "closed", current_position=pos)

    class MLock(MockEntity, LockEntity):
        async def async_lock(self, **kw) -> None:
            self.put("locked")

        async def async_unlock(self, **kw) -> None:
            self.put("unlocked")

        async def async_open(self, **kw) -> None:
            self.put("open")

    class MClimate(MockEntity, ClimateEntity):
        _attr_temperature_unit = "°C"
        _enable_turn_on_off_backwards_compatibility = False

        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            modes = []
            for m in self.a.get("hvac_modes") or ["off", "heat"]:
                try:
                    modes.append(HVACMode(m))
                except ValueError:
                    pass
            self._attr_hvac_modes = modes
            self._attr_min_temp = float(self.a.get("min_temp", 5))
            self._attr_max_temp = float(self.a.get("max_temp", 30))
            self._attr_target_temperature_step = self.a.get("target_temp_step")

        @property
        def hvac_mode(self):
            try:
                return HVACMode(self.s)
            except ValueError:
                return None

        @property
        def current_temperature(self):
            return self.a.get("current_temperature")

        @property
        def target_temperature(self):
            return self.a.get("temperature")

        async def async_set_temperature(self, **kw) -> None:
            mode = kw.get("hvac_mode")
            self.put(str(mode) if mode else None, temperature=kw.get("temperature"))

        async def async_set_hvac_mode(self, hvac_mode) -> None:
            self.put(str(hvac_mode))

        async def async_turn_on(self) -> None:
            self.put("heat")

        async def async_turn_off(self) -> None:
            self.put("off")

    class MMedia(MockEntity, MediaPlayerEntity):
        async def async_turn_on(self) -> None:
            self.put("idle")

        async def async_turn_off(self) -> None:
            self.put("off")

        async def async_media_play(self) -> None:
            self.put("playing")

        async def async_media_pause(self) -> None:
            self.put("paused")

        async def async_media_stop(self) -> None:
            self.put("idle")

        # Track change only with a track number (media_track, e.g. test speaker): "Testlied 1" -> "Testlied 2".
        def _track(self, step: int) -> None:
            n = self.a.get("media_track")
            if not isinstance(n, int):
                return
            n = max(1, n + step)
            title = re.sub(r"\d+$", str(n), str(self.a.get("media_title") or ""))
            self.put(None, media_track=n, media_title=title)

        async def async_media_next_track(self) -> None:
            self._track(1)

        async def async_media_previous_track(self) -> None:
            self._track(-1)

        @property
        def volume_level(self):
            return self.a.get("volume_level")

        async def async_volume_up(self) -> None:
            self.put(None, volume_level=round(min(1.0, float(self.volume_level or 0) + 0.1), 2))

        async def async_volume_down(self) -> None:
            self.put(None, volume_level=round(max(0.0, float(self.volume_level or 0) - 0.1), 2))

        async def async_set_volume_level(self, volume: float) -> None:
            self.put(None, volume_level=volume)

        async def async_mute_volume(self, mute: bool) -> None:
            self.put(None, is_volume_muted=mute)

        async def async_select_source(self, source: str) -> None:
            self.put(None, source=source)

    class MVacuum(MockEntity, StateVacuumEntity):
        async def async_start(self) -> None:
            self.put("cleaning")

        async def async_pause(self) -> None:
            self.put("paused")

        async def async_stop(self, **kw) -> None:
            self.put("idle")

        async def async_return_to_base(self, **kw) -> None:
            self.put("returning")

        async def async_locate(self, **kw) -> None:
            return None

        async def async_send_command(self, command, params=None, **kw) -> None:
            return None

    # Lawn mower: state, plus the Gardena activity attribute where the fixture has one (Husqvarna/Landroid-like
    # mowers carry no attributes), read by the mower popup and tile.
    class MLawnMower(MockEntity, LawnMowerEntity):
        def _go(self, state: str, activity: str) -> None:
            if "activity" in self.a:
                self.put(state, activity=activity)
            else:
                self.put(state)

        async def async_start_mowing(self) -> None:
            self._go("mowing", "OK_CUTTING")

        async def async_pause(self) -> None:
            self._go("paused", "PAUSED")

        # No driving time: back in the dock at once and parked by schedule (base state of the tests).
        async def async_dock(self) -> None:
            self._go("docked", "PARKED_TIMER")

    class MHumidifier(MockEntity, ToggleMixin, HumidifierEntity):
        # HA checks set_mode/set_humidity against these properties, not against the attributes.
        @property
        def available_modes(self):
            return self.a.get("available_modes")

        @property
        def min_humidity(self):
            return self.a.get("min_humidity", 0)

        @property
        def max_humidity(self):
            return self.a.get("max_humidity", 100)

        async def async_set_mode(self, mode: str) -> None:
            self.put(self.s, mode=mode)

        async def async_set_humidity(self, humidity: int) -> None:
            self.put(self.s, humidity=humidity)

    class MButton(MockEntity, ButtonEntity):
        async def async_press(self) -> None:
            self.put(dt_util.utcnow().isoformat())
            self.mock.on_button(self._key)

    class MSelect(MockEntity, SelectEntity):
        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            self._attr_options = list(self.a.get("options") or [self.s])

        @property
        def current_option(self):
            return self.s

        async def async_select_option(self, option: str) -> None:
            self.put(option)

    class MNumber(MockEntity, NumberEntity):
        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            self._attr_native_min_value = float(self.a.get("min", 0))
            self._attr_native_max_value = float(self.a.get("max", 100))
            self._attr_native_step = float(self.a.get("step", 1))

        async def async_set_native_value(self, value: float) -> None:
            self.put(str(value))

    class MAlarm(MockEntity, AlarmControlPanelEntity):
        # Code like Alarmo from the attributes (code_format, code_arm_required). With code_format the test code
        # ALARM_CODE applies; another or missing code is rejected (arming only with code_arm_required).
        @property
        def code_format(self):
            from homeassistant.components.alarm_control_panel import CodeFormat
            try:
                return CodeFormat(self.a["code_format"]) if self.a.get("code_format") else None
            except ValueError:
                return None

        @property
        def code_arm_required(self) -> bool:
            return bool(self.a.get("code_arm_required", False))

        def _check(self, code, arm: bool) -> None:
            if not self.code_format or (arm and not self.code_arm_required):
                return
            if str(code or "") != ALARM_CODE:
                from homeassistant.exceptions import HomeAssistantError
                raise HomeAssistantError("Falscher Code (Test)")

        async def async_alarm_disarm(self, code=None) -> None:
            self._check(code, False)
            self.put("disarmed")

        async def async_alarm_arm_home(self, code=None) -> None:
            self._check(code, True)
            self.put("armed_home")

        async def async_alarm_arm_away(self, code=None) -> None:
            self._check(code, True)
            self.put("armed_away")

        async def async_alarm_arm_night(self, code=None) -> None:
            self._check(code, True)
            self.put("armed_night")

        async def async_alarm_arm_vacation(self, code=None) -> None:
            self._check(code, True)
            self.put("armed_vacation")

        async def async_alarm_arm_custom_bypass(self, code=None) -> None:
            self._check(code, True)
            self.put("armed_custom_bypass")

        async def async_alarm_trigger(self, code=None) -> None:
            self.put("triggered")

    class MScene(MockEntity, Scene):
        async def async_activate(self, **kw) -> None:
            self.put(dt_util.utcnow().isoformat())

    class MCamera(MockEntity, Camera):
        def __init__(self, mock, eid):
            MockEntity.__init__(self, mock, eid)
            Camera.__init__(self)
            self.content_type = "image/png"
            # Frigate test camera (frigate.py): yard picture with time like Frigate's latest.jpg, mood after the sun
            # (kamerabild.py: day, dusk, night vision).
            # Second camera of the test doorbell (klingel.py, camera.testhof): the same yard picture.
            self._frigate = bool(mock.entities[eid].get("frigate") or mock.entities[eid].get("hof"))
            # Reolink test doorbell (klingel.py): view in front of the door, with a person while one is detected.
            self._klingel = bool(mock.entities[eid].get("klingel"))
            if self._frigate or self._klingel:
                self.content_type = "image/jpeg"

        async def async_camera_image(self, width=None, height=None) -> bytes:
            if self._frigate:
                from .frigate import picture
                from .kamerabild import stimmung
                stamp = dt_util.now().strftime("%d.%m.%Y %H:%M:%S")
                img = await self.hass.async_add_executor_job(picture, stimmung(self.hass), None, 1, 1280, 720, stamp, False)
                if img:
                    return img
            if self._klingel:
                from .kamerabild import stimmung
                from .klingel import DEV, picture as bell
                stamp = dt_util.now().strftime("%d.%m.%Y %H:%M:%S")
                who = self.hass.states.is_state(f"binary_sensor.{DEV}_person", "on")
                img = await self.hass.async_add_executor_job(bell, stimmung(self.hass), who, stamp)
                if img:
                    return img
            return PLACEHOLDER_PNG

        async def handle_async_mjpeg_stream(self, request):
            # No endless stream: every open MJPEG stream takes one of the ~6 browser
            # connections per server; with several camera tiles the test dashboard
            # hung while loading. A still image is enough.
            from aiohttp import web
            if self._frigate or self._klingel:
                img = await self.async_camera_image()
                return web.Response(body=img, content_type=self.content_type)
            return web.Response(body=PLACEHOLDER_PNG, content_type="image/png")

        async def async_turn_on(self) -> None:
            self.put("idle")

        async def async_turn_off(self) -> None:
            self.put("off")

    from homeassistant.components.image import ImageEntity

    class MImage(MockEntity, ImageEntity):
        """Image entity (e.g. vacuum map like Roborock): on a vacuum device a map with a
        transparent border, else the placeholder image."""
        _attr_content_type = "image/png"

        def __init__(self, mock, eid):
            MockEntity.__init__(self, mock, eid)
            ImageEntity.__init__(self, mock.hass)
            dev = mock.entities[eid].get("device")
            self._is_map = bool(dev) and any(
                e.get("device") == dev and k.startswith("vacuum.") for k, e in mock.entities.items())
            self._attr_image_last_updated = dt_util.utcnow()
            # Frigate snapshot (frigate.py): last hit per object, age from the fixture.
            self._frigate = mock.entities[eid].get("frigate_label")
            if self._frigate:
                self._attr_content_type = "image/jpeg"
                ago = mock.entities[eid].get("ago_min")
                if ago is not None:
                    self._attr_image_last_updated = dt_util.utcnow() - timedelta(minutes=ago)

        async def async_image(self) -> bytes | None:
            if self._frigate:
                from .frigate import picture
                from .kamerabild import stimmung
                stamp = dt_util.as_local(self._attr_image_last_updated).strftime("%d.%m.%Y %H:%M:%S")
                img = await self.hass.async_add_executor_job(
                    picture, stimmung(self.hass, self._attr_image_last_updated), self._frigate, int(self._attr_image_last_updated.timestamp()) % 997, 1280, 720, stamp, True)
                if img:
                    return img
            return MAP_PNG if self._is_map else PLACEHOLDER_PNG

    class MTodo(MockEntity, TodoListEntity):
        _attr_supported_features = (
            TodoListEntityFeature.CREATE_TODO_ITEM | TodoListEntityFeature.UPDATE_TODO_ITEM
            | TodoListEntityFeature.DELETE_TODO_ITEM
        )

        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            self._items = [
                TodoItem(uid="1", summary="Milch", status=TodoItemStatus.NEEDS_ACTION),
                TodoItem(uid="2", summary="Tomaten", status=TodoItemStatus.NEEDS_ACTION),
            ]

        @property
        def supported_features(self):
            return self._attr_supported_features

        @property
        def todo_items(self):
            return self._items

        def _count(self):
            self.put(str(sum(1 for i in self._items if i.status == TodoItemStatus.NEEDS_ACTION)))

        async def async_create_todo_item(self, item) -> None:
            item.uid = str(len(self._items) + 1)
            self._items.append(item)
            self._count()

        async def async_update_todo_item(self, item) -> None:
            self._items = [item if i.uid == item.uid else i for i in self._items]
            self._count()

        async def async_delete_todo_items(self, uids) -> None:
            self._items = [i for i in self._items if i.uid not in uids]
            self._count()

    class MCalendar(MockEntity, CalendarEntity):
        def _events(self, start: datetime, end: datetime):
            base = dt_util.start_of_local_day()
            titles = ["Termin", "Müllabfuhr", "Arzttermin", "Feiertag", "Training", "Geburtstag"]
            out = []
            for i in range(14):
                s = base + timedelta(days=i, hours=9 + (i % 5) * 2)
                if start <= s <= end:
                    out.append(CalendarEvent(start=s, end=s + timedelta(hours=1), summary=titles[i % len(titles)]))
            return out

        @property
        def event(self):
            ev = self._events(dt_util.now(), dt_util.now() + timedelta(days=14))
            return ev[0] if ev else None

        async def async_get_events(self, hass, start_date, end_date):
            return self._events(start_date, end_date)

    class MWeather(MockEntity, WeatherEntity):
        _attr_native_temperature_unit = "°C"
        _attr_native_pressure_unit = "hPa"
        _attr_native_wind_speed_unit = "km/h"
        _attr_supported_features = WeatherEntityFeature.FORECAST_DAILY | WeatherEntityFeature.FORECAST_HOURLY

        @property
        def supported_features(self):
            return self._attr_supported_features

        @property
        def condition(self):
            return self.s

        @property
        def native_temperature(self):
            return self.a.get("temperature")

        @property
        def humidity(self):
            return self.a.get("humidity")

        def _fc(self, step: timedelta, n: int) -> list[Forecast]:
            t = float(self.a.get("temperature") or 18)
            now = dt_util.now().replace(minute=0, second=0, microsecond=0)
            conds = ["cloudy", "partlycloudy", "sunny", "rainy", "partlycloudy", "sunny", "cloudy"]
            return [Forecast(datetime=(now + step * i).isoformat(), condition=conds[i % 7],
                             native_temperature=round(t + (i % 5) - 2, 1), native_templow=round(t - 6 + (i % 3), 1),
                             precipitation_probability=(i * 13) % 80) for i in range(n)]

        async def async_forecast_daily(self):
            return self._fc(timedelta(days=1), 7)

        async def async_forecast_hourly(self):
            return self._fc(timedelta(hours=1), 24)

    class MUpdate(MockEntity, UpdateEntity):
        """Update entity: values from the store; update.install like HACS (in_progress -> installed).

        UpdateEntity supplies HA's default category (config with INSTALL, else diagnostic)."""

        # UpdateEntity would show the brand icon of casora_mock; keep the snapshot's picture (HACS logos).
        @property
        def entity_picture(self):
            return self.a.get("entity_picture")

        @property
        def installed_version(self):
            return self.a.get("installed_version")

        @property
        def latest_version(self):
            return self.a.get("latest_version")

        @property
        def in_progress(self):
            return bool(self.a.get("in_progress"))

        @property
        def auto_update(self):
            return False

        async def async_install_with_progress(self, version, backup) -> None:
            import asyncio

            from homeassistant.exceptions import HomeAssistantError
            new = version or self.latest_version
            self.put(None, in_progress=True)
            await asyncio.sleep(float(self.a.get("mock_install_s") or 0))
            if self.a.get("mock_install_fail"):
                self.a["in_progress"] = False
                self.async_write_ha_state()
                raise HomeAssistantError(f"Downloading {new} failed (Test)")
            latest = new if not self.latest_version or str(new) > str(self.latest_version) else self.latest_version
            self.a["in_progress"] = False
            restart = "<ha-alert alert-type='error'>Restart of Home Assistant required</ha-alert>"
            self.put("off" if new == latest else "on", installed_version=new, latest_version=latest,
                     release_summary=restart)

        # Skipping as in HA (state off, skipped_version), but written to the store like every value here.
        async def async_skip(self) -> None:
            from homeassistant.exceptions import HomeAssistantError
            if not self.latest_version or self.latest_version == self.installed_version:
                raise HomeAssistantError("No update to skip (Test)")
            self.put("off", skipped_version=self.latest_version)

        async def async_clear_skipped(self) -> None:
            self.a["skipped_version"] = None
            newer = self.latest_version and self.latest_version != self.installed_version
            self.put("on" if newer else "off")

    # Display-only platforms: the real base classes bring HA's defaults (category, device class),
    # state and attributes still come from the store (MockEntity first in the MRO).
    class MSensor(MockEntity, SensorEntity):
        pass

    class MBinarySensor(MockEntity, BinarySensorEntity):
        @property
        def is_on(self) -> bool | None:
            return {"on": True, "off": False}.get(self.s)

    class MEvent(MockEntity, EventEntity):
        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            # EventEntity checks event_types when added (doorbell must offer "ring").
            self._attr_event_types = list(self.a.get("event_types") or [])

    class MTime(MockEntity, TimeEntity):
        pass

    class MDate(MockEntity, DateEntity):
        pass

    # Every tracker of the test house is TrackerEntity (category and attributes are the same for scanners);
    # source_type from the store, like the GPS tracker of Tractive.
    class MTracker(MockEntity, TrackerEntity):
        def __init__(self, mock, eid):
            super().__init__(mock, eid)
            try:
                self._attr_source_type = SourceType(self.a.get("source_type") or "gps")
            except ValueError:
                pass

    from homeassistant.components.alarm_control_panel import AlarmControlPanelEntityFeature
    from homeassistant.components.camera import CameraEntityFeature
    from homeassistant.components.climate import ClimateEntityFeature
    from homeassistant.components.cover import CoverEntityFeature
    from homeassistant.components.fan import FanEntityFeature
    from homeassistant.components.light import LightEntityFeature
    from homeassistant.components.lock import LockEntityFeature
    from homeassistant.components.media_player import MediaPlayerEntityFeature
    from homeassistant.components.remote import RemoteEntityFeature
    from homeassistant.components.siren import SirenEntityFeature
    from homeassistant.components.update import UpdateEntityFeature
    from homeassistant.components.vacuum import VacuumEntityFeature
    from homeassistant.components.lawn_mower import LawnMowerEntityFeature
    from homeassistant.components.humidifier import HumidifierEntityFeature

    for cls, feat in ((MLight, LightEntityFeature), (MCover, CoverEntityFeature), (MClimate, ClimateEntityFeature),
                      (MMedia, MediaPlayerEntityFeature), (MVacuum, VacuumEntityFeature), (MAlarm, AlarmControlPanelEntityFeature),
                      (MFan, FanEntityFeature), (MLock, LockEntityFeature), (MSiren, SirenEntityFeature),
                      (MRemote, RemoteEntityFeature), (MCamera, CameraEntityFeature), (MUpdate, UpdateEntityFeature),
                      (MLawnMower, LawnMowerEntityFeature), (MHumidifier, HumidifierEntityFeature)):
        cls._feature_cls = feat

    return {
        "light": MLight, "switch": MSwitch, "siren": MSiren, "remote": MRemote, "fan": MFan,
        "cover": MCover, "lock": MLock, "climate": MClimate, "media_player": MMedia,
        "vacuum": MVacuum, "lawn_mower": MLawnMower, "humidifier": MHumidifier, "button": MButton, "select": MSelect, "number": MNumber,
        "alarm_control_panel": MAlarm, "scene": MScene, "camera": MCamera, "todo": MTodo, "image": MImage,
        "calendar": MCalendar, "weather": MWeather,
        "update": MUpdate,
        # display only, no services
        "sensor": MSensor, "binary_sensor": MBinarySensor, "device_tracker": MTracker,
        "event": MEvent, "time": MTime, "date": MDate,
    }


PLATFORMS = [
    "light", "switch", "siren", "remote", "fan", "cover", "lock", "climate", "media_player",
    "vacuum", "lawn_mower", "humidifier", "button", "select", "number", "alarm_control_panel", "scene", "camera", "todo", "image",
    "calendar", "weather", "sensor", "binary_sensor", "device_tracker", "update", "event", "time", "date",
]


async def setup_domain(hass: HomeAssistant, entry, async_add_entities, domain: str) -> None:
    mock = hass.data[DOMAIN]
    cls = mock.classes[domain]
    async_add_entities(cls(mock, eid) for eid in mock.store if eid.split(".")[0] == domain)


def _png(w: int, h: int, rgb: tuple[int, int, int]) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


PLACEHOLDER_PNG = _png(640, 360, (58, 62, 70))


def _map_png(w: int, h: int) -> bytes:
    """Made-up vacuum map (RGBA): rooms as areas, transparent border, aspect ratio 4:3."""
    rooms = [((0.12, 0.18, 0.48, 0.55), (120, 170, 220)), ((0.48, 0.18, 0.86, 0.48), (240, 180, 110)),
             ((0.12, 0.55, 0.40, 0.84), (150, 210, 150)), ((0.40, 0.48, 0.86, 0.84), (210, 150, 200))]
    rows = []
    for y in range(h):
        row = bytearray(b"\x00")
        for x in range(w):
            px = (0, 0, 0, 0)
            for (x0, y0, x1, y1), c in rooms:
                if x0 * w <= x < x1 * w and y0 * h <= y < y1 * h:
                    edge = min(x - x0 * w, x1 * w - 1 - x, y - y0 * h, y1 * h - 1 - y) < 2
                    px = (60, 60, 60, 255) if edge else c + (255,)
            row += bytes(px)
        rows.append(bytes(row))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


MAP_PNG = _map_png(400, 300)
