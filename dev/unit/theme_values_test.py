"""Theme values parse completely (no YAML comment cutting a value).

  uv run --python 3.14 --with pyyaml python dev/unit/theme_values_test.py

An unquoted value like `var(--x, #fff)` loses everything from ` #` on, because YAML reads it as a
comment: the variable becomes `var(--x,` and every rule using it is invalid. Every string value in
the theme files must have balanced parentheses and must not end in a comma.
"""

from __future__ import annotations

import glob
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _Loader(yaml.SafeLoader):
    pass


# HA tags (!include …) do not occur in the theme files; keep them harmless if they ever do.
_Loader.add_multi_constructor("!", lambda loader, suffix, node: None)

FAILS: list[str] = []


def walk(path, node, where):
    if isinstance(node, dict):
        for key, value in node.items():
            walk(path, value, where + [str(key)])
    elif isinstance(node, list):
        for i, value in enumerate(node):
            walk(path, value, where + [str(i)])
    elif isinstance(node, str):
        if node.count("(") != node.count(")") or node.rstrip().endswith(","):
            FAILS.append(f"{os.path.relpath(path, ROOT)}: {'/'.join(where)} = {node!r}")


files = sorted(glob.glob(os.path.join(ROOT, "custom_components", "casora", "theme*.yaml")))
if not files:
    FAILS.append("no theme files found")
for path in files:
    with open(path, encoding="utf-8") as f:
        walk(path, yaml.load(f, Loader=_Loader) or {}, [])

for fail in FAILS:
    print("FEHLER:", fail)
if FAILS:
    sys.exit(1)
print(f"theme_values: ok ({len(files)} files)")
