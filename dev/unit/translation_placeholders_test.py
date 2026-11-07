"""hassfest rejects a translation string whose {…} is not a valid placeholder name.

Release 26.11.21 (07.11.2026): the setup_plan field description wrote its JSON shape as "{area_id, devices: […]}";
GitHub's Validate (hassfest) went red on main and the tag. The gate had no such check.

    python3 dev/unit/translation_placeholders_test.py
"""
import json
import pathlib
import re
import string
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2] / "custom_components" / "casora"
IDENT = re.compile(r"[a-zA-Z_][a-zA-Z0-9_]*")


def strings(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from strings(v, f"{path}.{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from strings(v, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def bad(value):
    # Same reading as hassfest: Python format fields, each one a plain identifier.
    try:
        fields = [f for _, f, _, _ in string.Formatter().parse(value) if f is not None]
    except ValueError as e:
        return str(e)
    for f in fields:
        if not IDENT.fullmatch(f):
            return f"placeholder {{{f}}}"
    return None


files = sorted((ROOT / "translations").glob("*.json"))
if (ROOT / "strings.json").exists():
    files.append(ROOT / "strings.json")
assert files, "no translation files"
errors = []
for p in files:
    for key, value in strings(json.loads(p.read_text(encoding="utf-8"))):
        why = bad(value)
        if why:
            errors.append(f"{p.name}: {key}: {why}")
if errors:
    print("\n".join(errors[:30]), file=sys.stderr)
    sys.exit(1)
print(f"translation_placeholders: ok ({len(files)} files)")
