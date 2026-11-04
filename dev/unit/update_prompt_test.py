"""Dashboard update prompt: what casora/updates/prompt hands the dashboard.

  uv run --python 3.14 --with homeassistant python dev/unit/update_prompt_test.py

Checks updates.prompt_lines (2-3 short lines from the release notes), updates.prompt_intro / prompt_items
(tagline + up to 4 items with a short line, from the real CHANGELOG sections 26.11.12 and 26.11.13, German and
English) and updates.prompt_payload
(the newest offered version from casora/updates/list, install only through HACS' entry, nothing while
a restart is pending) without HA's core.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora.release_notes import parse_changelog  # noqa: E402
from custom_components.casora.updates import prompt_intro, prompt_items, prompt_lines, prompt_payload  # noqa: E402

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


# ── Intro + items from the real release notes (owner 04.11.2026: "bisschen besser schreiben, was da neu ist") ──
def section(fname, lang, version):
    with open(os.path.join(ROOT, fname), encoding="utf-8") as fh:
        return next(r["notes_md"] for r in parse_changelog(fh.read(), lang) if r["version"] == version)


DE12, DE13 = section("CHANGELOG.de.md", "de", "26.11.12"), section("CHANGELOG.de.md", "de", "26.11.13")
EN12, EN13 = section("CHANGELOG.md", "en", "26.11.12"), section("CHANGELOG.md", "en", "26.11.13")

check("intro: tagline DE 26.11.12", prompt_intro(DE12).startswith("Küche und Wäsche mit echtem Inhalt,"), prompt_intro(DE12))
check("intro: tagline EN 26.11.13", prompt_intro(EN13).startswith("Calmer tablets, a display diagnosis"), prompt_intro(EN13))
check("intro: none when the notes start with a list", prompt_intro("- **A:** b\n\nLater text.") == "", prompt_intro("- **A:** b\n\nLater text."))
check("intro: none for empty notes", prompt_intro("") == "")

it = prompt_items(DE12)
check("DE 26.11.12: four items, all from Neu", [i["title"] for i in it] == ["Backofen", "Waschmaschine und Trockner", "Pflege der Kaffeemaschine", "Cookidoo"], it)
check("DE 26.11.12: each item explains itself", all(i["text"] for i in it), it)
check("DE 26.11.12: oven text = first clause, aside dropped",
      it[0]["text"] == "Kacheltyp „Backofen“ im Studio für Home Connect und Home Connect Local, mit eigenem Popup", it[0])
check("texts short, cut on a word with …", all(len(i["text"]) <= 90 for i in it) and it[1]["text"].endswith("…") and not it[1]["text"][:-1].endswith(" "), it)
check("texts plain: no markdown", all("**" not in i["text"] and "`" not in i["text"] for i in it), it)

it = prompt_items(DE13)
check("DE 26.11.13: Neu → Geändert → Behoben", [i["title"] for i in it] == ["Anzeige-Diagnose", "Kurze Tablet-Bildschirme", "Update-Hinweis", "KI mit Home Assistant 2026.11"], it)
check("issue refs dropped from titles", all("#" not in i["title"] for i in it), it)
check("abbreviation 'z. B.' does not end the sentence", "(" not in it[1]["text"] and it[1]["text"].startswith("Im Querformat bis etwa 880 px Höhe"), it[1])

it = prompt_items(EN12)
check("EN 26.11.12: English titles", [i["title"] for i in it] == ["Oven", "Washer and dryer", "Coffee machine care", "Cookidoo"], it)
check("EN 26.11.12: text capitalised", it[0]["text"].startswith("A tile type \"Oven\" in the Studio"), it[0])
it = prompt_items(EN13)
check("EN 26.11.13: four items in order", [i["title"] for i in it] == ["Display diagnosis", "Short tablet screens", "Update prompt", "AI on Home Assistant 2026.11"], it)
check("EN 26.11.13: first sentence only", it[0]["text"] == "Add ?casora_diag to a dashboard address or tap the page title five times quickly", it[0])

ORDER = "### Fixed\n- **Fix one:** works again. More detail here.\n\n### Changed\n- **Change one:** c.\n\n### New\n- **New one:** d.\n"
check("priority New → Changed → Fixed whatever the order", [i["title"] for i in prompt_items(ORDER)] == ["New one", "Change one", "Fix one"], prompt_items(ORDER))
check("first sentence, no trailing dot", prompt_items(ORDER)[2]["text"] == "Works again", prompt_items(ORDER))
check("bold start without colon: rest is the text", prompt_items("- **Kettle popup** in the new design: dial.")[0] == {"title": "Kettle popup", "text": "In the new design: dial"},
      prompt_items("- **Kettle popup** in the new design: dial."))
check("plain item: title only", prompt_items("- just a line") == [{"title": "just a line", "text": ""}], prompt_items("- just a line"))
check("limit 4", len(prompt_items(EN12)) == 4 and len(prompt_items(EN12, limit=2)) == 2)


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
check("items of the offered version", p["items"] == [{"title": "New thing", "text": "Text"}], p)
check("no tagline: empty intro", p["intro"] == "", p)

p = prompt_payload(overview(notes_lang="de", groups=[{"kind": "casora", "releases": [
    {"version": "26.11.6", "notes_md": DE12, "notes_lang": "de", "prerelease": False}]}]))
check("payload: intro + items in the notes' language, lines kept for older dashboards",
      p["intro"].startswith("Küche und Wäsche") and p["items"][0]["title"] == "Backofen" and p["notes_lang"] == "de"
      and p["lines"] == ["Backofen", "Waschmaschine und Trockner", "Pflege der Kaffeemaschine"], p)

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
