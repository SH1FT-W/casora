"""Dashboard update prompt: what casora/updates/prompt hands the dashboard.

  uv run --python 3.14 --with homeassistant python dev/unit/update_prompt_test.py

Checks updates.prompt_lines (2-3 short lines from the release notes) and updates.prompt_payload
(the newest offered version from casora/updates/list, install only through HACS' entry, nothing while
a restart is pending) without HA's core.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora.updates import prompt_lines, prompt_payload  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


NOTES = """Intro sentence that is not a list item.

### New
- **Colour in the light popup:** colour lamps get a colour wheel.
  - nested detail that must not count
- **The circle shows the light:** in colour mode the circle takes the lamp's colour.

### Fixed
- Plain item with a [link](https://example.invalid) and `code` that is rather long, much longer than one line of the prompt may be, and goes on and on and on and on and on and on and on
- **Fourth item:** never shown
"""

lines = prompt_lines(NOTES)
check("three lines at most", len(lines) == 3, lines)
check("bold start without colon", lines[0] == "Colour in the light popup", lines)
check("second bold start", lines[1] == "The circle shows the light", lines)
check("nested items skipped", all("nested" not in x for x in lines), lines)
check("plain item: markdown removed", "[" not in lines[2] and "`" not in lines[2] and lines[2].startswith("Plain item with a link and code"), lines)
check("long item cut with ellipsis", len(lines[2]) <= 110 and lines[2].endswith("…"), lines)
check("limit 2", len(prompt_lines(NOTES, limit=2)) == 2)
check("no list: first sentence", prompt_lines("Just one sentence.") == ["Just one sentence."], prompt_lines("Just one sentence."))
check("empty notes: no lines", prompt_lines("") == [])
check("underscores in names stay", prompt_lines("- option beta_updates and *soft* __bold__") == ["option beta_updates and soft bold"], prompt_lines("- option beta_updates and *soft* __bold__"))
check("fallback sentence cut to width", len(prompt_lines("x" * 300)[0]) <= 110, prompt_lines("x" * 300))


def overview(**kw):
    base = {
        "installed": "26.11.5", "latest": "26.11.6", "update_available": True, "entity_id": "update.casora_update",
        "via": "hacs", "hacs": True, "hacs_url": "/hacs/repository/1", "pending_restart": None,
        "repo_url": "https://github.com/OWNER/casora/releases",
        "groups": [{"kind": "casora", "releases": [
            {"version": "26.11.6", "notes_md": "- **New thing:** text", "url": "https://github.com/OWNER/casora/releases/tag/v26.11.6",
             "prerelease": False},
            {"version": "26.11.5", "notes_md": "- **Old thing**"},
        ]}],
    }
    base.update(kw)
    return base


p = prompt_payload(overview())
check("available", p["available"] is True and p["version"] == "26.11.6", p)
check("lines of the offered version", p["lines"] == ["New thing"], p)
check("HACS entry can install", p["can_install"] is True, p)
check("release url of that version", p["release_url"].endswith("/v26.11.6"), p)

p = prompt_payload(overview(hacs=False, via="casora"))
check("own entity cannot install (no INSTALL feature)", p["can_install"] is False and p["available"] is True, p)

p = prompt_payload(overview(pending_restart="26.11.6"))
check("pending restart: nothing offered", p["available"] is False, p)

p = prompt_payload(overview(update_available=False, latest="26.11.5"))
check("up to date: nothing offered", p["available"] is False, p)

p = prompt_payload(overview(latest="26.11.7b1", groups=[{"kind": "casora", "releases": [
    {"version": "26.11.7b1", "notes_md": "- **Beta**", "prerelease": True}]}]))
check("beta channel: offered version is passed through as is", p["version"] == "26.11.7b1" and p["prerelease"] is True, p)
check("no url on the release: repo page", p["release_url"] == "https://github.com/OWNER/casora/releases", p)

if fails:
    print(f"\n{len(fails)} failed")
    sys.exit(1)
print("\nupdate_prompt_test: ok")
