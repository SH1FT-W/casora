"""Versionshinweise für Studio → „Updates“ – ohne Home Assistant, damit prüfbar (dev/unit).

Zwei Quellen für dieselbe Liste:
  - die Releases des Repos auf GitHub (Text wie im Release),
  - die CHANGELOG.md (englisch) bzw. CHANGELOG.de.md (deutsch), die mit der Integration
    ausgeliefert werden (offline, ohne Token).
Beide werden je Version zusammengelegt; GitHub hat Vorrang, die CHANGELOG füllt Lücken.
Die Sprache folgt der Oberfläche (notes_lang, pick_notes): Deutsch → deutsche Fassung,
alles andere → Englisch.

Die Hinweise sind Markdown und werden hier zu HTML – bewusst klein und sicher: erst wird
alles escapet, erst danach entstehen die wenigen erlaubten Auszeichnungen (Überschriften,
Listen, fett, kursiv, Code, Links nur auf http/https). So kann ein Release-Text nie
eigenes HTML oder Skript ins Studio bringen.

Jeder Eintrag hat ein „kind“ („casora“) – später können Karten-Updates als eigene Gruppe
mit gleichem Aufbau dazukommen.
"""

from __future__ import annotations

import functools
import html
import re
from typing import Any

try:  # in HA immer da; die Unit-Tests ohne HA nehmen den einfachen Vergleich unten
    from awesomeversion import AwesomeVersion
except ImportError:  # pragma: no cover
    AwesomeVersion = None

KIND_CASORA = "casora"


def ver(v: Any) -> tuple:
    """„v0.4.0“ → (0, 4, 0); Unlesbares zählt als (0,)."""
    return tuple(int(x) for x in re.findall(r"\d+", str(v or ""))[:3]) or (0,)


def norm_version(v: Any) -> str:
    """„v0.4.0“ / „Casora 0.4.0“ → „0.4.0“ (Vorabversionen behalten ihren Zusatz)."""
    m = re.search(r"\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?", str(v or ""))
    return m.group(0) if m else ""


_DATE_DE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b")
_DATE_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def _date(text: str) -> str | None:
    m = _DATE_ISO.search(text)
    if m:
        return m.group(0)
    m = _DATE_DE.search(text)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def parse_changelog(text: str, lang: str = "en") -> list[dict]:
    """„## 0.4.0 – 29.09.2026“ … bis zur nächsten „## “-Zeile → ein Eintrag je Version.

    Abschnitte ohne Versionsnummer (Einleitung, „Unveröffentlicht“) fallen weg.
    lang ist die Sprache der Datei (CHANGELOG.md „en“, CHANGELOG.de.md „de“).
    """
    out: list[dict] = []
    cur: dict | None = None
    body: list[str] = []
    fence = False

    def close() -> None:
        if cur is not None:
            cur["notes_md"] = "\n".join(body).strip("\n")
            out.append(cur)

    for line in (text or "").splitlines():
        if line.lstrip().startswith("```"):
            fence = not fence
        m = None if fence else re.match(r"^##(?!#)\s+(.*)$", line)
        if m:
            close()
            head = m.group(1)
            v = norm_version(re.sub(r"\(.*?\)|\[|\]", " ", head.split("–")[0].split(" - ")[0]))
            cur = ({"kind": KIND_CASORA, "version": v, "date": _date(head), "source": "changelog",
                    "notes_lang": notes_lang(lang)} if v else None)
            body = []
            continue
        if cur is not None:
            body.append(line)
    close()
    return out


# Komplette Casora-Releases heißen „vX.Y.Z“; andere Tags (Karten-Updates „karten-…“,
# card_updates.py) sind nie eine Casora-Version.
CASORA_TAG = re.compile(r"^v\d")


def is_casora_tag(tag: Any) -> bool:
    return bool(CASORA_TAG.match(str(tag or "")))


def is_prerelease(v: Any) -> bool:
    """„1.1.0-beta.1“ → True (Vorabversion am Zusatz erkennbar)."""
    return "-" in norm_version(v)


def _fallback_cmp(a: str, b: str) -> int:
    """Ohne AwesomeVersion: Kern vergleichen, ohne Zusatz > mit Zusatz, Zusätze stückweise."""
    ka, kb = ver(a), ver(b)
    if ka != kb:
        return 1 if ka > kb else -1
    pa, pb = a.partition("-")[2], b.partition("-")[2]
    if pa == pb:
        return 0
    if not pa or not pb:
        return 1 if not pa else -1
    for x, y in zip(pa.split("."), pb.split(".")):
        if x == y:
            continue
        if x.isdigit() and y.isdigit():
            return 1 if int(x) > int(y) else -1
        if x.isdigit() != y.isdigit():
            return -1 if x.isdigit() else 1
        return 1 if x > y else -1
    return (len(pa.split(".")) > len(pb.split("."))) - (len(pa.split(".")) < len(pb.split(".")))


def compare_versions(a: Any, b: Any) -> int:
    """Versionen mit Vorabversions-Zusatz vergleichen: 1.1.0 > 1.1.0-beta.2 > 1.1.0-beta.1 > 1.0.3.

    Ergebnis wie cmp: 1, 0 oder -1. Unlesbares zählt als 0.
    """
    na, nb = norm_version(a) or "0", norm_version(b) or "0"
    if AwesomeVersion is not None:
        try:
            x, y = AwesomeVersion(na), AwesomeVersion(nb)
            return 0 if x == y else (1 if x > y else -1)
        except Exception:  # noqa: BLE001 – dann der einfache Vergleich
            pass
    return _fallback_cmp(na, nb)


def newer(a: Any, b: Any) -> bool:
    """Ist a neuer als b?"""
    return compare_versions(a, b) > 0


version_key = functools.cmp_to_key(compare_versions)


def latest_casora(releases: list[dict], beta: bool = False) -> dict | None:
    """Neuestes Casora-Release (kein Entwurf, Tag „v…“).

    Vorabversionen (prerelease) zählen nur mit beta=True; dann gewinnt die höchste
    Version, eine stabile 1.1.0 also vor 1.1.0-beta.2.
    """
    best = None
    for r in releases or []:
        if not isinstance(r, dict) or r.get("draft") or not is_casora_tag(r.get("tag_name")):
            continue
        if r.get("prerelease") and not beta:
            continue
        if best is None or newer(r["tag_name"], best["tag_name"]):
            best = r
    return best


# ── Sprache ─────────────────────────────────────────────────────────────────
# Englisch ist die Quelle (CHANGELOG.md, GitHub-Release); Deutsch steht in CHANGELOG.de.md
# und im Release als eingeklappter Block darunter (tools/release.sh):
#   <english notes>
#
#   <details><summary>Deutsch</summary>
#
#   <deutsche Hinweise>
#
#   </details>
# Jede andere Sprache bekommt Englisch.

CHANGELOG_FILES = {"en": "CHANGELOG.md", "de": "CHANGELOG.de.md"}

_DE_BLOCK = re.compile(
    r"\n*[ \t]*<details>\s*<summary>\s*Deutsch\s*</summary>(.*?)</details>[ \t]*\n*", re.I | re.S)


def notes_lang(lang: Any) -> str:
    """Sprache der Oberfläche → Sprache der Versionshinweise: „de“/„de-AT“ → „de“, sonst „en“."""
    return "de" if str(lang or "").strip().lower().replace("_", "-").split("-")[0] == "de" else "en"


def changelog_file(lang: Any) -> str:
    """Dateiname der mitgelieferten CHANGELOG für diese Sprache."""
    return CHANGELOG_FILES[notes_lang(lang)]


def split_bilingual(md: str) -> tuple[str, str | None]:
    """Release-Text → (englisch, deutsch oder None, wenn es keinen Deutsch-Block gibt)."""
    text = str(md or "").replace("\r\n", "\n")
    m = _DE_BLOCK.search(text)
    if not m:
        return text.strip("\n"), None
    en = (text[:m.start()] + "\n\n" + text[m.end():]).strip()
    en = re.sub(r"\n(?:-{3,}|\*{3,}|_{3,})\s*$", "", en).rstrip()  # Trennlinie vor dem Block
    de = m.group(1).strip("\n")
    return en, (de.strip() and de) or None


def pick_notes(md: str, lang: Any) -> tuple[str, str]:
    """Release-Text in der Sprache der Oberfläche → (Text, Sprache des Texts).

    Deutsch nur, wenn der Block da ist; sonst Englisch (auch für Deutsch)."""
    en, de = split_bilingual(md)
    if notes_lang(lang) == "de" and de:
        return de, "de"
    return en, "en"


def from_github(releases: list[dict], lang: Any = "en") -> list[dict]:
    """GitHub-Antwort (/releases) → Einträge; Entwürfe und Nicht-Casora-Tags fallen weg.

    Der Text ist in der Sprache der Oberfläche, soweit das Release sie mitbringt
    („notes_lang“ sagt, welche es geworden ist)."""
    out = []
    for r in releases or []:
        if not isinstance(r, dict) or r.get("draft") or not is_casora_tag(r.get("tag_name")):
            continue
        v = norm_version(r.get("tag_name"))
        if not v:
            continue
        notes, nl = pick_notes(str(r.get("body") or ""), lang)
        out.append({
            "kind": KIND_CASORA,
            "version": v,
            "date": (str(r.get("published_at") or r.get("created_at") or "")[:10]) or None,
            "notes_md": notes,
            "notes_lang": nl,
            "source": "github",
            "url": r.get("html_url") if str(r.get("html_url") or "").startswith("https://") else None,
            "prerelease": bool(r.get("prerelease")),
        })
    return out


def merge_releases(github: list[dict], changelog: list[dict]) -> list[dict]:
    """Je Version ein Eintrag, neueste zuerst. GitHub gewinnt; fehlt dort Text oder Datum,
    kommt beides aus der CHANGELOG. Hat GitHub den Text nur in einer anderen Sprache als
    die CHANGELOG (ältere Releases ohne Deutsch-Block), gewinnt der Text der CHANGELOG."""
    by: dict[str, dict] = {}
    for e in changelog or []:
        by.setdefault(e["version"], dict(e))
    for e in github or []:
        old = by.get(e["version"])
        new = dict(e)
        if old:
            other_lang = (old.get("notes_md") and old.get("notes_lang")
                          and new.get("notes_lang") and new["notes_lang"] != old["notes_lang"])
            if not new.get("notes_md") or other_lang:
                new["notes_md"] = old.get("notes_md", "")
                new["notes_lang"] = old.get("notes_lang")
            if not new.get("date"):
                new["date"] = old.get("date")
        by[e["version"]] = new
    return sorted(by.values(), key=lambda e: (version_key(e["version"]), e.get("date") or ""), reverse=True)


# ── Markdown → sicheres HTML ────────────────────────────────────────────────

_SAFE_URL = re.compile(r"^https?://[^\s<>]+$", re.I)


def _inline(text: str) -> str:
    """Eine Zeile: escapen, dann `Code`, [Link](https://…), **fett**, *kursiv*."""
    codes: list[str] = []

    def keep_code(m: re.Match) -> str:
        codes.append("<code>" + html.escape(m.group(1), quote=True) + "</code>")
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", keep_code, text.replace("\x00", ""))
    links: list[str] = []

    def keep_link(m: re.Match) -> str:
        label, url = m.group(1), m.group(2).strip()
        if not _SAFE_URL.match(url):
            return m.group(0)
        links.append('<a href="' + html.escape(url, quote=True) + '" target="_blank" rel="noopener noreferrer">'
                     + _emph(html.escape(label, quote=True)) + "</a>")
        return f"\x01{len(links) - 1}\x01"

    text = re.sub(r"\[([^\]\n]+)\]\(([^)\s]+)\)", keep_link, text.replace("\x01", ""))
    text = _emph(html.escape(text, quote=True))
    text = re.sub(r"\x01(\d+)\x01", lambda m: links[int(m.group(1))], text)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], text)


def _emph(s: str) -> str:
    s = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"__(?=\S)(.+?)(?<=\S)__", r"<strong>\1</strong>", s)
    return re.sub(r"(?<![\w*])\*(?=\S)([^*\n]+?)(?<=\S)\*(?![\w*])", r"<em>\1</em>", s)


def render_markdown(md: str) -> str:
    """Kleiner Markdown-Umfang der Release-Texte: #-Überschriften, Absätze, Listen
    (- / * / 1., eine Ebene Einrückung), Folgezeilen eines Punkts, ``` als Codeblock."""
    lines = (md or "").replace("\r\n", "\n").split("\n")
    out: list[str] = []
    para: list[str] = []
    # Offene Listen als Stapel: (Einrückung, "ul"/"ol"); items[-1] sammelt Text des Punkts.
    stack: list[tuple[int, str]] = []
    item: list[str] | None = None

    def flush_para() -> None:
        if para:
            out.append("<p>" + _inline(" ".join(p.strip() for p in para)) + "</p>")
            para.clear()

    def flush_item() -> None:
        nonlocal item
        if item is not None:
            out.append(_inline(" ".join(item)))
            item = None

    def close_lists(to: int = 0) -> None:
        flush_item()
        while len(stack) > to:
            out.append("</li></" + stack.pop()[1] + ">")

    i = 0
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s.startswith("```"):
            flush_para()
            close_lists()
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(code), quote=True) + "</code></pre>")
            i += 1
            continue
        if not s:
            flush_para()
            flush_item()
            i += 1
            continue
        h = re.match(r"^(#{1,6})\s+(.*?)\s*#*\s*$", s)
        if h:
            flush_para()
            close_lists()
            level = min(6, len(h.group(1)) + 2)  # ## → h4, ### → h5: die Seite hat schon Überschriften
            out.append(f"<h{level}>" + _inline(h.group(2)) + f"</h{level}>")
            i += 1
            continue
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", s):
            flush_para()
            close_lists()
            out.append("<hr>")
            i += 1
            continue
        li = re.match(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$", line)
        if li:
            flush_para()
            indent = len(li.group(1).expandtabs(4))
            kind = "ol" if li.group(2)[0].isdigit() else "ul"
            flush_item()
            if stack and indent > stack[-1][0] and len(stack) < 3:
                out.append(f"<{kind}><li>")
                stack.append((indent, kind))
            else:
                while stack and indent < stack[-1][0]:
                    out.append("</li></" + stack.pop()[1] + ">")
                if stack and stack[-1][1] == kind:
                    out.append("</li><li>")
                else:
                    if stack:
                        out.append("</li></" + stack.pop()[1] + ">")
                    out.append(f"<{kind}><li>")
                    stack.append((indent, kind))
            item = [li.group(3).strip()]
            i += 1
            continue
        if stack and (item is not None or line[:1] in (" ", "\t")):
            # Folgezeile eines Listenpunkts.
            if item is None:
                item = []
            item.append(s)
            i += 1
            continue
        close_lists()
        para.append(s)
        i += 1
    flush_para()
    close_lists()
    return "".join(out)


# ── Markdown für HAs eigenen Update-Dialog ─────────────────────────────────

_BLOCK_START = re.compile(r"^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|```|>|\||(-{3,}|\*{3,}|_{3,})\s*$)")


def unwrap_markdown(md: str) -> str:
    """Harte Zeilenumbrüche der CHANGELOG (Folgezeilen mit zwei Leerzeichen eingerückt)
    zu einer Zeile je Absatz/Listenpunkt zusammenziehen. Überschriften, Listen, Leerzeilen
    und Codeblöcke bleiben, wie sie sind – so sieht es in jedem Markdown-Renderer gleich
    aus, auch wenn er Zeilenumbrüche als <br> zeigt."""
    out: list[str] = []
    fence = False
    joinable = False  # darf die nächste Zeile an out[-1] angehängt werden?
    for raw in (md or "").replace("\r\n", "\n").split("\n"):
        line = raw.rstrip()
        hard = raw.endswith("  ")  # Markdown-Zeilenumbruch: danach nicht anhängen
        if line.lstrip().startswith("```"):
            fence = not fence
            out.append(line)
            joinable = False
            continue
        if fence:
            out.append(raw)
            continue
        if not line.strip():
            out.append("")
            joinable = False
            continue
        keep = "  " if hard else ""
        if joinable and not _BLOCK_START.match(line):
            out[-1] = out[-1] + " " + line.strip() + keep
        else:
            out.append(line + keep)
        joinable = not hard and not re.match(r"^\s*(#{1,6}\s|(-{3,}|\*{3,}|_{3,})\s*$|\|)", line)
    return "\n".join(out).strip("\n")


def ha_markdown(md: str) -> str:
    """Release-Text für HAs Update-Dialog (ha-markdown): Zeilen zusammengezogen und
    spitze Klammern außerhalb von Code als Text (sonst verschluckt der Renderer z. B.
    „Passt zu <Raum>“ als unbekanntes HTML-Element)."""
    out = []
    fence = False
    for line in unwrap_markdown(md).split("\n"):
        if line.lstrip().startswith("```"):
            fence = not fence
            out.append(line)
            continue
        if fence:
            out.append(line)
            continue
        parts = re.split(r"(`[^`]*`)", line)
        out.append("".join(p if p.startswith("`") else p.replace("<", "&lt;") for p in parts))
    return "\n".join(out)


def summarize(md: str, limit: int = 3) -> str:
    """Kurzfassung für den Kopf: die fett gesetzten Anfänge der ersten Punkte
    („Updates ohne HACS · Neuer Einrichtungsassistent · …“), sonst der erste Satz."""
    heads = []
    for line in (md or "").splitlines():
        m = re.match(r"^\s*[-*+]\s+\*\*(.+?)\*\*", line)
        if m:
            heads.append(m.group(1).strip().rstrip(":").strip())
        if len(heads) >= limit:
            break
    if heads:
        return " · ".join(heads)
    for line in (md or "").splitlines():
        if re.match(r"^\s*#", line):
            continue
        s = re.sub(r"^\s*([-*+]|\d+[.)])\s*", "", line).strip()
        if s:
            s = re.sub(r"[*_`]|\[([^\]]*)\]\([^)]*\)", lambda m: m.group(1) or "", s)
            return (s[:137] + "…") if len(s) > 140 else s
    return ""


def notes_for_ai(releases: list[dict], installed: Any, lang: Any = "en", limit: int = 20000) -> str:
    """Release-Texte aller Casora-Versionen nach installed, älteste zuerst, als Klartext für die
    KI-Update-Prüfung (ki/update.yaml) – sie muss GitHub dann nicht selbst abrufen.

    Länger als limit: die neuesten Versionen bleiben ganz, ältere fallen weg."""
    rows = sorted((e for e in from_github(releases, lang)
                   if e.get("notes_md") and newer(e["version"], installed)),
                  key=lambda e: version_key(e["version"]))
    parts: list[str] = []
    size = 0
    for e in reversed(rows):
        block = f"## {e['version']}\n{e['notes_md'].strip()}"
        if parts and size + len(block) > limit:
            break
        parts.insert(0, block[:limit])
        size += len(block) + 2
    return "\n\n".join(parts)
