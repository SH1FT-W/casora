"""No dashboard phrase pattern may hide a more specific one (scripts/i18n/<lang>.json).

    python3 dev/unit/i18n_shadow_test.py

The runtime takes the first matching pattern. For each pattern the test builds sample texts
(tools/i18n_patterns.py) and fails if an earlier, less specific pattern also matches one of them,
or if two patterns match the same texts. Also checks that the sampler itself sees the known cases.
"""

from __future__ import annotations

import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import i18n_patterns  # noqa: E402

OUT = os.path.join(ROOT, "custom_components/casora/scripts/i18n")
SRC = os.path.join(ROOT, "custom_components/casora/translations/dashboard/phrases")

fails: list[str] = []

# The sampler must flag the cases this test exists for.
for general, specific in [
    (r"^Ø (.+)$", r"^Ø von (\d+) Lampen$"),
    (r"^(.+) Uhr$", r"^Regen ab (\d+) Uhr$"),
    (r"^(\d+) Tage?$", r"^(\d+) Tag$"),
    (r"^(\d+) % ([A-Za-z].*)$", r"^(\d+) ?% Akku$"),
]:
    if not i18n_patterns.shadowed([general, specific]):
        fails.append("sampler misses %r hiding %r" % (general, specific))
    if i18n_patterns.shadowed([specific, general]):
        fails.append("sampler flags the right order %r, %r" % (specific, general))
    if i18n_patterns.order([general, specific]) != [1, 0]:
        fails.append("order() keeps %r before %r" % (general, specific))
try:
    i18n_patterns.order([r"^heute (\d{1,2}:\d\d)$", r"^heute (\d{1,2}:\d{2})$"])
    fails.append("order() accepts two patterns that match the same texts")
except ValueError:
    pass

# Every shipped language, as the browser gets it.
langs = sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".json"))
if not langs:
    fails.append("no built phrase tables in %s" % OUT)
for lang in langs:
    with open(os.path.join(OUT, lang + ".json"), encoding="utf-8") as fh:
        pats = [p[0] for p in json.load(fh).get("patterns") or []]
    with open(os.path.join(SRC, lang + ".json"), encoding="utf-8") as fh:
        src = [p[0] for p in json.load(fh).get("patterns") or []]
    if sorted(pats) != sorted(src):
        fails.append("%s: built patterns differ from the source, run tools/build-i18n.py" % lang)
    for earlier, later, sample in i18n_patterns.shadowed(pats):
        fails.append("%s: %r hides %r (e.g. %r)" % (lang, earlier, later, sample))

if fails:
    print("\n".join("FAIL " + f for f in fails))
    sys.exit(1)
print("i18n_shadow_test: ok (%s)" % ", ".join(langs))
