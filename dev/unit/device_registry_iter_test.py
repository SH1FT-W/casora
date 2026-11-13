"""Casora reads the device registry without its deprecated mapping use (static scan, no HA needed).

  python3 dev/unit/device_registry_iter_test.py

HA 2026.10 made `DeviceRegistry.devices` a view whose iteration yields the device entries; using it as a mapping
(`.values()`, `.get()`, `[id]`, `id in ...devices`) logs a warning for custom integrations at every start and
stops working in HA 2027.9 (found 13.11.2026 in the test HA's log: update.py store_of). Casora iterates it and
looks single devices up with `async_get`. docs/ha-annahmen.md "Geräte-Registry".
"""

from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PKG = os.path.join(ROOT, "custom_components", "casora")
# A registry's devices used as a mapping: .devices.values()/.get()/.items()/.keys()/[…], or membership by id.
MAPPING = re.compile(r"\.devices\s*(\.\s*(values|get|items|keys|get_entry)\s*\(|\[)")
MEMBER = re.compile(r"\bin\s+[\w.()]*\.devices\b")
LOOP = re.compile(r"\bfor\s+[\w, ()]+?\s+in\s+[\w.()]*\.devices\b")


class _Bad:
    @staticmethod
    def search(code: str) -> bool:
        return bool(MAPPING.search(code)) or (bool(MEMBER.search(code)) and not LOOP.search(code))


BAD = _Bad()


def findings() -> list[str]:
    out = []
    for name in sorted(os.listdir(PKG)):
        if not name.endswith(".py"):
            continue
        with open(os.path.join(PKG, name), encoding="utf-8") as fh:
            for no, line in enumerate(fh, 1):
                code = line.split("#", 1)[0]
                if BAD.search(code):
                    out.append(f"{name}:{no}: {line.strip()}")
    return out


def main() -> int:
    bad = findings()
    for b in bad:
        print("FAIL deprecated device registry mapping use:", b)
    # The pattern itself: the old call is caught, iterating is not.
    probes = {"dr.async_get(hass).devices.values()": True, "reg.devices[device_id]": True,
              "x in reg.devices": True, "for d in reg.devices:": False, "list(dr.async_get(hass).devices)": False}
    for text, want in probes.items():
        if bool(BAD.search(text)) != want:
            print("FAIL pattern", repr(text), "expected", want)
            bad.append(text)
    if bad:
        return 1
    print("PASS device registry: iterated, never used as a mapping")
    return 0


if __name__ == "__main__":
    sys.exit(main())
