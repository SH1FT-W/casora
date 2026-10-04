"""Prüft release_notes.py (Studio → „Updates“): CHANGELOG lesen, mit GitHub zusammenlegen,
Markdown sicher rendern. Ohne Home Assistant:

    uv run --python 3.14 dev/unit/updates_release_notes_test.py
"""
import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location(
    "release_notes", os.path.join(ROOT, "custom_components/casora/release_notes.py"))
rn = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rn)

fails = 0


def check(name, cond, info=""):
    global fails
    if not cond:
        fails += 1
        print("FEHLER", name, info)
    else:
        print("ok    ", name)


# ── CHANGELOG ────────────────────────────────────────────────────────────────
CL = """# Changelog

Einleitung ohne Version.

## Unveröffentlicht
- noch nichts

## 0.4.1 - 2026-10-02

### Behoben
- Kleinigkeit

## [0.4.0] – 29.09.2026

### Neu
- **Updates ohne HACS:** Mit einem Token
  in den Optionen.
- **Neuer Einrichtungsassistent:** Look wählen

```
## 9.9.9 – im Codeblock, keine Version
```

### Verbessert
- Schneller

## 0.3.0 – 27.9.2026
Nur Text.
"""
entries = rn.parse_changelog(CL)
check("changelog: Versionen", [e["version"] for e in entries] == ["0.4.1", "0.4.0", "0.3.0"],
      [e["version"] for e in entries])
check("changelog: Datum ISO", entries[0]["date"] == "2026-10-02", entries[0]["date"])
check("changelog: Datum deutsch", entries[1]["date"] == "2026-09-29", entries[1]["date"])
check("changelog: Datum einstellig", entries[2]["date"] == "2026-09-27", entries[2]["date"])
check("changelog: Codeblock bleibt im Text", "9.9.9" in entries[1]["notes_md"])
check("changelog: Quelle/Art", entries[0]["source"] == "changelog" and entries[0]["kind"] == "casora")
check("changelog: Einleitung weg", all("Einleitung" not in e["notes_md"] for e in entries))

# Echte CHANGELOG des Repos und die mitgelieferte Kopie.
real = rn.parse_changelog(open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read())
check("echte CHANGELOG: 0.4.0 vorhanden", any(e["version"] == "0.4.0" and e["date"] == "2026-09-29" for e in real))
check("Kopie in der Integration aktuell",
      open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read()
      == open(os.path.join(ROOT, "custom_components/casora/CHANGELOG.md"), encoding="utf-8").read())

# ── GitHub + Zusammenlegen ───────────────────────────────────────────────────
GH = [
    {"tag_name": "v0.5.0", "name": "v0.5.0", "body": "### Neu\r\n- **Studio-Updates:** Seite", "published_at": "2026-10-05T10:00:00Z",
     "html_url": "https://github.com/x/y/releases/tag/v0.5.0", "draft": False, "prerelease": False},
    {"tag_name": "v0.4.0", "body": "", "published_at": "2026-09-29T18:00:00Z", "html_url": "javascript:alert(1)"},
    {"tag_name": "v0.6.0", "draft": True, "body": "geheim"},
    {"tag_name": "v0.5.1-beta.1", "body": "Beta", "published_at": "2026-10-06T00:00:00Z", "prerelease": True},
    {"tag_name": "kaputt", "body": "x"},
    {"tag_name": "karten-2026-10-07", "name": "v9.9.9 Karten", "body": "Karten-Fix", "published_at": "2026-10-07T00:00:00Z"},
    {"tag_name": "Version-1.0.0", "body": "kein v-Tag"},
]
gh = rn.from_github(GH)
check("github: Entwurf und Unlesbares weg", [e["version"] for e in gh] == ["0.5.0", "0.4.0", "0.5.1-beta.1"],
      [e["version"] for e in gh])
check("github: Karten-Tags nie eine Casora-Version", all(e["version"] != "9.9.9" for e in gh))
check("latest_casora: ohne Vorab/Entwurf/Karten", rn.latest_casora(GH)["tag_name"] == "v0.5.0")
check("latest_casora: nur Karten → None", rn.latest_casora([GH[5]]) is None)
check("github: CRLF → LF", gh[0]["notes_md"] == "### Neu\n- **Studio-Updates:** Seite")
check("github: nur https-Links", gh[1]["url"] is None)
merged = rn.merge_releases(gh, entries)
check("merge: neueste zuerst, eine je Version",
      [e["version"] for e in merged] == ["0.5.1-beta.1", "0.5.0", "0.4.1", "0.4.0", "0.3.0"],
      [e["version"] for e in merged])
v040 = next(e for e in merged if e["version"] == "0.4.0")
check("merge: GitHub gewinnt (Quelle)", v040["source"] == "github")
check("merge: leerer GitHub-Text → CHANGELOG", "Updates ohne HACS" in v040["notes_md"])
check("merge: CHANGELOG füllt fehlende Version", next(e for e in merged if e["version"] == "0.4.1")["source"] == "changelog")
check("merge ohne GitHub", [e["version"] for e in rn.merge_releases([], entries)] == ["0.4.1", "0.4.0", "0.3.0"])
check("ver", rn.ver("v0.10.0") > rn.ver("0.9.9") and rn.ver("x") == (0,))

# ── Markdown sicher ─────────────────────────────────────────────────────────
h = rn.render_markdown(v040["notes_md"])
check("md: Überschrift ### → h5", "<h5>Neu</h5>" in h and "<h5>Verbessert</h5>" in h, h[:200])
check("md: Liste + fett + Folgezeile",
      "<ul><li><strong>Updates ohne HACS:</strong> Mit einem Token in den Optionen.</li><li>" in h, h[:300])
check("md: Codeblock", "<pre><code>## 9.9.9" in h)

evil = rn.render_markdown(
    "<script>alert(1)</script>\n\n"
    "- <img src=x onerror=alert(1)> **fett** und *kursiv* und `<b>code</b>`\n"
    "- [klick](javascript:alert(1)) [ok](https://example.com/a?b=1&c=\"2\") [x](https://e.com\" onmouseover=\"a)\n"
    "\"quote\" 'apos'")
check("md: kein rohes HTML", "<script" not in evil and "<img" not in evil, evil)
check("md: escapet", "&lt;script&gt;" in evil and "&lt;img src=x onerror=alert(1)&gt;" in evil, evil)
check("md: Code escapet", "<code>&lt;b&gt;code&lt;/b&gt;</code>" in evil, evil)
check("md: javascript-Link bleibt Text", 'href="javascript' not in evil and "[klick](javascript:alert(1))" in evil, evil)
check("md: https-Link mit Attribut-Escape",
      '<a href="https://example.com/a?b=1&amp;c=&quot;2&quot;" target="_blank" rel="noopener noreferrer">ok</a>' in evil, evil)
check("md: kein Attribut-Ausbruch", "onmouseover=\"" not in evil, evil)
check("md: fett/kursiv", "<strong>fett</strong>" in evil and "<em>kursiv</em>" in evil)
check("md: Anführungszeichen escapet", "&quot;quote&quot; &#x27;apos&#x27;" in evil, evil)
nested = rn.render_markdown("1. eins\n2. zwei\n   - unter\n   - unter2\n3. drei\n\nAbsatz")
check("md: nummeriert + verschachtelt",
      nested == "<ol><li>eins</li><li>zwei<ul><li>unter</li><li>unter2</li></ul></li><li>drei</li></ol><p>Absatz</p>", nested)
check("md: Platzhalterzeichen im Text harmlos", "\x00" not in rn.render_markdown("a \x000\x00 b `c`"))

# ── Kurzfassung ─────────────────────────────────────────────────────────────
check("summary: fette Anfänge", rn.summarize(v040["notes_md"]) == "Updates ohne HACS · Neuer Einrichtungsassistent",
      rn.summarize(v040["notes_md"]))
check("summary: sonst erster Satz", rn.summarize("### Behoben\n- [Link](https://x) repariert") == "Link repariert")
check("summary: leer", rn.summarize("") == "")

# ── HAs Update-Dialog: harte Umbrüche zusammenziehen ────────────────────────
WRAP = """
### Neu
- **Updates im Studio:** eigener Bereich in der Seitenleiste. Alle
  Versionen zum Aufklappen, mit `code`
  und Link.
- **Kachel hinzufügen** und „Passt zu <Raum>“; bei unklarer Zuordnung fragt
  Casora nach.
  - Unterpunkt bleibt
    eigene Zeile

Absatz über
zwei Zeilen.{HARD}
Nach hartem Umbruch.

```
code
  eingerückt
```
### Behoben
- eins""".replace("{HARD}", "  ")  # zwei Leerzeichen am Zeilenende = Markdown-Umbruch
ha = rn.ha_markdown(WRAP)
check("ha: Listenpunkt eine Zeile",
      "- **Updates im Studio:** eigener Bereich in der Seitenleiste. Alle Versionen zum Aufklappen, mit `code` und Link." in ha, ha)
check("ha: <Raum> als Text", "„Passt zu &lt;Raum>“; bei unklarer Zuordnung fragt Casora nach." in ha, ha)
check("ha: Unterpunkt bleibt eigener Punkt", "\n  - Unterpunkt bleibt eigene Zeile\n" in ha, ha)
check("ha: Absatz zusammen, harter Umbruch bleibt", "Absatz über zwei Zeilen.  \nNach hartem Umbruch." in ha, ha)
check("ha: Codeblock unverändert", "```\ncode\n  eingerückt\n```" in ha, ha)
check("ha: Überschriften bleiben", ha.startswith("### Neu\n- ") and "\n### Behoben\n- eins" in ha, ha)
check("ha: Code mit < bleibt", rn.ha_markdown("- `a<b` und a<b") == "- `a<b` und a&lt;b")
check("ha: leer", rn.ha_markdown("") == "" and rn.ha_markdown(None) == "")
check("ha: echte CHANGELOG ohne Umbruchreste",
      all(not l.startswith("  ") or l.lstrip().startswith(("-", "*")) for l in rn.ha_markdown(v040["notes_md"]).split("\n")))
check("summary: limit 2", rn.summarize(WRAP, limit=2) == "Updates im Studio · Kachel hinzufügen", rn.summarize(WRAP, limit=2))

print("\n" + ("alles ok" if not fails else f"{fails} Fehler"))
sys.exit(1 if fails else 0)
