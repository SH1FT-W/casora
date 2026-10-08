"""Entitätsklassen der Test-Integration.

Jede Entität liest Zustand und Attribute aus dem Speicher der Test-Integration
(CasoraMock.store) und schreibt Änderungen durch Dienste dorthin zurück.
Die berechneten Attribute der HA-Basisklassen werden bewusst übergangen, damit
die Werte 1:1 dem Schnappschuss entsprechen.
"""
from __future__ import annotations

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


class MockEntity(Entity):
    """Gemeinsame Basis: Werte kommen aus dem Speicher."""

    _attr_should_poll = False
    _attr_has_entity_name = False

    def __init__(self, mock, eid: str) -> None:
        self.mock = mock
        self.entity_id = eid
        # Schlüssel im Speicher bleibt die Fixture-ID: benennt ein Test die Entität in HA um
        # (neue entity_id), behält sie Zustand und Attribute statt ohne Zustand dazustehen.
        self._key = eid
        self._attr_unique_id = eid
        attrs = mock.store[eid][1]
        self._attr_name = attrs.get("friendly_name") or eid.split(".", 1)[1]
        self._attr_icon = attrs.get("icon")
        self._attr_device_class = attrs.get("device_class")
        # Sprachunabhängiger Schlüssel der echten Integration – darüber finden Popups ihre Entitäten.
        self._attr_translation_key = mock.entities[eid].get("translation_key")
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

    # Zustand/Attribute 1:1 aus dem Speicher
    @property
    def state(self) -> Any:  # noqa: D102 – überschreibt bewusst @final der Basisklassen
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


# ── Schaltbare Typen ─────────────────────────────────────────────────────
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
    """Klassen erst hier importieren, damit nur benötigte Komponenten laden."""
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
    from homeassistant.components.weather import Forecast, WeatherEntity, WeatherEntityFeature

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
        # FanEntity ruft turn_on(percentage, preset_mode, **kw) mit Positionsargumenten auf.
        async def async_turn_on(self, percentage=None, preset_mode=None, **kw) -> None:
            self.put("on", **{k: v for k, v in (("percentage", percentage), ("preset_mode", preset_mode)) if v is not None})

        async def async_set_percentage(self, percentage: int) -> None:
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

        async def async_media_next_track(self) -> None:
            return None

        async def async_media_previous_track(self) -> None:
            return None

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
        _attr_code_arm_required = False

        async def async_alarm_disarm(self, code=None) -> None:
            self.put("disarmed")

        async def async_alarm_arm_home(self, code=None) -> None:
            self.put("armed_home")

        async def async_alarm_arm_away(self, code=None) -> None:
            self.put("armed_away")

        async def async_alarm_arm_night(self, code=None) -> None:
            self.put("armed_night")

        async def async_alarm_arm_vacation(self, code=None) -> None:
            self.put("armed_vacation")

        async def async_alarm_arm_custom_bypass(self, code=None) -> None:
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

        async def async_camera_image(self, width=None, height=None) -> bytes:
            return PLACEHOLDER_PNG

        async def handle_async_mjpeg_stream(self, request):
            # Kein Endlos-Stream: Jeder offene MJPEG-Stream belegt eine der ~6
            # Browser-Verbindungen pro Server – mit mehreren Kamera-Kacheln blieb
            # das Test-Dashboard sonst beim Laden hängen. Ein Standbild genügt.
            from aiohttp import web
            return web.Response(body=PLACEHOLDER_PNG, content_type="image/png")

        async def async_turn_on(self) -> None:
            self.put("idle")

        async def async_turn_off(self) -> None:
            self.put("off")

    from homeassistant.components.image import ImageEntity

    class MImage(MockEntity, ImageEntity):
        """Bild-Entität (z. B. Saugroboter-Karte wie bei Roborock): an einem Saugroboter-Gerät
        eine Karte mit durchsichtigem Rand, sonst das Platzhalterbild."""
        _attr_content_type = "image/png"

        def __init__(self, mock, eid):
            MockEntity.__init__(self, mock, eid)
            ImageEntity.__init__(self, mock.hass)
            dev = mock.entities[eid].get("device")
            self._is_map = bool(dev) and any(
                e.get("device") == dev and k.startswith("vacuum.") for k, e in mock.entities.items())
            self._attr_image_last_updated = dt_util.utcnow()

        async def async_image(self) -> bytes | None:
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
    from homeassistant.components.vacuum import VacuumEntityFeature

    for cls, feat in ((MLight, LightEntityFeature), (MCover, CoverEntityFeature), (MClimate, ClimateEntityFeature),
                      (MMedia, MediaPlayerEntityFeature), (MVacuum, VacuumEntityFeature), (MAlarm, AlarmControlPanelEntityFeature),
                      (MFan, FanEntityFeature), (MLock, LockEntityFeature), (MSiren, SirenEntityFeature),
                      (MRemote, RemoteEntityFeature), (MCamera, CameraEntityFeature)):
        cls._feature_cls = feat

    return {
        "light": MLight, "switch": MSwitch, "siren": MSiren, "remote": MRemote, "fan": MFan,
        "cover": MCover, "lock": MLock, "climate": MClimate, "media_player": MMedia,
        "vacuum": MVacuum, "button": MButton, "select": MSelect, "number": MNumber,
        "alarm_control_panel": MAlarm, "scene": MScene, "camera": MCamera, "todo": MTodo, "image": MImage,
        "calendar": MCalendar, "weather": MWeather,
        # nur anzeigen, keine Dienste
        "sensor": MockEntity, "binary_sensor": MockEntity, "update": MockEntity,
        "event": MockEntity, "time": MockEntity, "date": MockEntity,
    }


PLATFORMS = [
    "light", "switch", "siren", "remote", "fan", "cover", "lock", "climate", "media_player",
    "vacuum", "button", "select", "number", "alarm_control_panel", "scene", "camera", "todo", "image",
    "calendar", "weather", "sensor", "binary_sensor", "update", "event", "time", "date",
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
    """Erfundene Saugroboter-Karte (RGBA): Räume als Flächen, Rand durchsichtig, Seitenverhältnis 4:3."""
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
