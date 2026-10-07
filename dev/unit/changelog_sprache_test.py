"""Versionshinweise in der Sprache der Oberfläche (release_notes.py, updates.py, tools/release.sh).

    uv run --python 3.14 --with homeassistant python dev/unit/changelog_sprache_test.py

Englisch ist die Quelle (CHANGELOG.md, GitHub-Release), Deutsch steht in CHANGELOG.de.md und im
Release als eingeklappter Block „<details><summary>Deutsch</summary>…</details>“.
Geprüft: Sprachwahl (de/de-AT → Deutsch, alles andere → Englisch), mitgelieferte CHANGELOG je
Sprache (mit Rückfall auf Englisch), GitHub-Text mit Deutsch-Block, fehlender Block → Englisch,
ältere Releases ohne Block nehmen bei deutscher Oberfläche die deutsche CHANGELOG, beide Dateien
mit denselben Versionen, und die Release-Notizen aus tools/release.sh lassen sich wieder trennen.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import release_notes as rn  # noqa: E402
from custom_components.casora import updates  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


# ── Sprache der Oberfläche → Sprache der Hinweise ───────────────────────────
check("de → de", rn.notes_lang("de") == "de")
check("de-AT / de_CH / DE → de", all(rn.notes_lang(x) == "de" for x in ("de-AT", "de_CH", "DE")))
check("en, fr, nl, leer, None → en", all(rn.notes_lang(x) == "en" for x in ("en", "en-GB", "fr", "nl", "", None)))
check("Dateien je Sprache", rn.changelog_file("de") == "CHANGELOG.de.md" and rn.changelog_file("fr") == "CHANGELOG.md")

# ── GitHub-Text mit und ohne Deutsch-Block ──────────────────────────────────
BI = ("### New\n- **Plants:** say what they need\n\n"
      "<details><summary>Deutsch</summary>\n\n### Neu\n- **Pflanzen:** sagen, was ihnen fehlt\n\n</details>\n")
en, de = rn.split_bilingual(BI)
check("split: englisch ohne Block", en == "### New\n- **Plants:** say what they need", repr(en))
check("split: deutsch aus dem Block", de == "### Neu\n- **Pflanzen:** sagen, was ihnen fehlt", repr(de))
check("pick: de → Deutsch", rn.pick_notes(BI, "de") == (de, "de"))
check("pick: en → Englisch", rn.pick_notes(BI, "en") == (en, "en"))
check("pick: fr → Englisch", rn.pick_notes(BI, "fr") == (en, "en"))
ONLY_EN = "### New\n- only english"
check("fehlender Block: de → Englisch", rn.pick_notes(ONLY_EN, "de") == (ONLY_EN, "en"))
check("Block in Groß/Klein und CRLF", rn.pick_notes(
    "a\r\n\r\n<DETAILS>\r\n<Summary> Deutsch </Summary>\r\n\r\nb\r\n</DETAILS>", "de") == ("b", "de"))
check("leerer Deutsch-Block → Englisch", rn.pick_notes("a\n\n<details><summary>Deutsch</summary>\n\n</details>", "de")
      == ("a", "en"))
check("Trennlinie vor dem Block fällt weg", rn.split_bilingual("a\n\n---\n\n<details><summary>Deutsch</summary>b</details>")[0] == "a")

GH = [
    {"tag_name": "v1.1.0", "body": BI, "published_at": "2026-10-10T00:00:00Z"},
    {"tag_name": "v1.0.3", "body": "### New\n- **Old release** english only", "published_at": "2026-10-04T00:00:00Z"},
]
gh_de = rn.from_github(GH, "de")
gh_en = rn.from_github(GH)
check("from_github de: neue Version deutsch", gh_de[0]["notes_md"] == de and gh_de[0]["notes_lang"] == "de")
check("from_github de: ohne Block englisch", gh_de[1]["notes_md"].startswith("### New") and gh_de[1]["notes_lang"] == "en")
check("from_github en: englisch", gh_en[0]["notes_md"] == en and gh_en[0]["notes_lang"] == "en")

CL_DE = "# Changelog\n\n## 1.0.3 – 04.10.2026\n\n### Neu\n- **Alt** auf Deutsch\n"
CL_EN = "# Changelog\n\n## 1.0.3 – 04.10.2026\n\n### New\n- **Old** in English\n"
m_de = {e["version"]: e for e in rn.merge_releases(gh_de, rn.parse_changelog(CL_DE, "de"))}
check("merge de: GitHub-Version mit Block bleibt deutsch", m_de["1.1.0"]["notes_md"] == de)
check("merge de: älteres Release ohne Block → deutsche CHANGELOG",
      m_de["1.0.3"]["notes_md"] == "### Neu\n- **Alt** auf Deutsch" and m_de["1.0.3"]["notes_lang"] == "de"
      and m_de["1.0.3"]["source"] == "github", repr(m_de["1.0.3"]))
m_en = {e["version"]: e for e in rn.merge_releases(gh_en, rn.parse_changelog(CL_EN, "en"))}
check("merge en: GitHub gewinnt wie bisher", m_en["1.0.3"]["notes_md"].startswith("### New\n- **Old release**"))
m_de2 = {e["version"]: e for e in rn.merge_releases(gh_de, [])}
check("merge de ohne CHANGELOG: englischer GitHub-Text bleibt", m_de2["1.0.3"]["notes_lang"] == "en")

# ── Die echten Dateien ──────────────────────────────────────────────────────
def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


real_en = rn.parse_changelog(read("CHANGELOG.md"), "en")
real_de = rn.parse_changelog(read("CHANGELOG.de.md"), "de")
check("beide Dateien: dieselben Versionen und Daten",
      [(e["version"], e["date"]) for e in real_en] == [(e["version"], e["date"]) for e in real_de],
      [e["version"] for e in real_en])
check("jede Version hat Text in beiden Sprachen", all(e["notes_md"].strip() for e in real_en + real_de))
DE_HEADS = {"Neu", "Verbessert", "Behoben", "Geändert", "Entfernt", "Qualität", "Übergang", "Sicherheit", "Leistung", "Gut zu wissen"}
EN_HEADS = {"New", "Improved", "Fixed", "Changed", "Removed", "Quality", "Transition", "Security", "Performance", "Good to know"}
heads = lambda es: {h for e in es for h in re.findall(r"^### (.+)$", e["notes_md"], re.M)}  # noqa: E731
check("CHANGELOG.md komplett englisch (Zwischenüberschriften)", heads(real_en) <= EN_HEADS, heads(real_en) - EN_HEADS)
check("CHANGELOG.de.md komplett deutsch (Zwischenüberschriften)", heads(real_de) <= DE_HEADS, heads(real_de) - DE_HEADS)
check("Kopien in der Integration aktuell",
      read("custom_components/casora/CHANGELOG.md") == read("CHANGELOG.md")
      and read("custom_components/casora/CHANGELOG.de.md") == read("CHANGELOG.de.md"))

# ── updates.py: mitgelieferte Datei je Sprache, Rückfall auf Englisch ───────
code, _, text = updates.read_changelog("de")
check("updates: de liest CHANGELOG.de.md", code == "de" and text == read("CHANGELOG.de.md"))
code, _, text = updates.read_changelog("nl")
check("updates: nl liest CHANGELOG.md", code == "en" and text == read("CHANGELOG.md"))
tmp = tempfile.mkdtemp()
with open(os.path.join(tmp, "CHANGELOG.md"), "w", encoding="utf-8") as fh:
    fh.write(CL_EN)
saved = updates.changelog_path
updates.changelog_path = lambda lang: os.path.join(tmp, rn.changelog_file(lang))
try:
    code, _, text = updates.read_changelog("de")
    check("updates: ohne CHANGELOG.de.md → englisch", code == "en" and text == CL_EN)
finally:
    updates.changelog_path = saved

# ── tools/release.sh: Notizen aus beiden Dateien, wieder trennbar ───────────
sh = read("tools/release.sh")
m = re.search(r"<<'PY' \|\| fail \"Versionshinweise.*?\n(.*?)\nPY\n", sh, re.S)
check("release.sh: Notiz-Baustein gefunden", bool(m))
if m:
    script = os.path.join(tmp, "notes.py")
    with open(script, "w", encoding="utf-8") as fh:
        fh.write(m.group(1))
    ver = real_en[0]["version"]
    out = os.path.join(tmp, "notes.md")
    r = subprocess.run([sys.executable, script, ver, out], cwd=ROOT, capture_output=True, text=True)
    check("release.sh: baut Notizen für die neueste Version", r.returncode == 0, r.stderr)
    if r.returncode == 0:
        body = open(out, encoding="utf-8").read()
        check("release.sh: englisch oben", body.startswith(real_en[0]["notes_md"].strip()[:40]))
        got_en, got_de = rn.split_bilingual(body)
        check("release.sh → Casora englisch = CHANGELOG.md", got_en == real_en[0]["notes_md"].strip())
        check("release.sh → Casora deutsch = CHANGELOG.de.md", (got_de or "").strip() == real_de[0]["notes_md"].strip())
    # Deutsche Fassung fehlt → Abbruch
    work = os.path.join(tmp, "repo")
    os.makedirs(work)
    with open(os.path.join(work, "CHANGELOG.md"), "w", encoding="utf-8") as fh:
        fh.write("## 2.0.0 – 01.11.2026\n\n- **New** thing\n")
    with open(os.path.join(work, "CHANGELOG.de.md"), "w", encoding="utf-8") as fh:
        fh.write("## 1.9.0 – 01.10.2026\n\n- Alt\n")
    r = subprocess.run([sys.executable, script, "2.0.0", os.path.join(work, "n.md")], cwd=work,
                       capture_output=True, text=True)
    check("release.sh: bricht ab ohne deutsche Fassung", r.returncode != 0 and "CHANGELOG.de.md" in r.stderr, r.stderr)

# ── tools/sync-changelog.py: gleiche Überschriften ─────────────────────────
r = subprocess.run([sys.executable, os.path.join(ROOT, "tools/sync-changelog.py"), "--check"], cwd=ROOT,
                   capture_output=True, text=True)
check("sync-changelog --check grün", r.returncode == 0, r.stdout)

print("\n" + ("alles ok" if not fails else f"{len(fails)} Fehler"))
sys.exit(1 if fails else 0)
