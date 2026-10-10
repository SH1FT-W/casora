"""KI-Abläufe (ki/*.yaml): Jinja-Zeichenketten ohne ungültige Escapes.

uv run --python 3.14 --with jinja2 --with pyyaml python dev/unit/ki_jinja_escapes_test.py

Jinja dekodiert String-Literale mit „unicode-escape“: '\\.' und '\\s' sind dort ungültig und
lösten bei jedem Kompilieren eine DeprecationWarning aus (pytest, 1.3) – in einer künftigen
Python-Version ein Fehler. Punkt als [.] schreiben, \\s als doppelten Backslash.
"""

import os
import re
import sys
import warnings

import jinja2
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KI = os.path.join(ROOT, "custom_components", "casora", "ki")


def strings(x):
    if isinstance(x, dict):
        for v in x.values():
            yield from strings(v)
    elif isinstance(x, list):
        for v in x:
            yield from strings(v)
    elif isinstance(x, str) and ("{{" in x or "{%" in x):
        yield x


env = jinja2.Environment()
env.filters["regex_replace"] = lambda v, find="", rep="": re.sub(find, rep, str(v))
fehler = 0
for name in sorted(os.listdir(KI)):
    if not name.endswith(".yaml"):
        continue
    with open(os.path.join(KI, name), encoding="utf-8") as f:
        data = yaml.safe_load(f)
    for tpl in strings(data):
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            try:
                env.parse(tpl)
            except (DeprecationWarning, SyntaxWarning, jinja2.TemplateSyntaxError) as e:
                fehler += 1
                print(f"FEHLER {name}: {e}: {tpl[:120]!r}")

# Update-Titel: „ Update“/„ Firmware“ am Ende fällt weg (Regex kommt unverändert an).
with open(os.path.join(KI, "update.yaml"), encoding="utf-8") as f:
    upd = yaml.safe_load(f)
name_tpl = next(t for t in strings(upd) if "Update|Firmware" in t)
out = env.from_string(name_tpl).render(
    state_attr=lambda e, a: "Zigbee Bridge Firmware" if a == "title" else None, repeat={"item": "update.x"}
)
if out.strip() != "Zigbee Bridge":
    fehler += 1
    print("FEHLER update.yaml: Name", repr(out))

print("ALLES OK" if not fehler else f"{fehler} Fehler")
sys.exit(1 if fehler else 0)
