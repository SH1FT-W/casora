"""Vorlagen-Bündel schlank (Leistung 1.3, Vorschlag B): in den JS-Ausdrücken der Kartenvorlagen
(`[[[ … ]]]`) ganze Kommentarzeilen und die Einrückung am Zeilenanfang weglassen.

Nur, was für JavaScript bedeutungslos ist:
  - Leerraum am Zeilenanfang, wenn die Zeile im Code beginnt (nicht in einem Template-Literal
    `…`, Block-Kommentar oder String – dort gehört er zum Inhalt),
  - Zeilen, die im Code mit // beginnen (ganze Zeile samt Umbruch),
  - Block-Kommentare /* … */, die im Code am Zeilenanfang beginnen (samt leerer Restzeile).
Zeilenumbrüche im Code bleiben (automatische Semikolons ändern sich so nicht).

Ein kleiner Zerleger verfolgt Strings, Template-Literale (mit ${ … }), Kommentare und reguläre
Ausdrücke. Test: dev/unit/vorlagen_schlank_test.py.
"""

from __future__ import annotations

import re

# Nach diesen Zeichen beginnt ein „/“ einen regulären Ausdruck, sonst ist es eine Division.
_RE_BEFORE = set("(,=:[!&|?{};~+-*%<>^")
_RE_KEYWORDS = {"return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "instanceof", "yield", "await"}
_WORD = re.compile(r"[A-Za-z_$][\w$]*$")


def schlank(src: str) -> str:
    out: list[str] = []
    i, n = 0, len(src)
    # Zustandsstapel: "code" (mit Klammertiefe für ${ … }), "tpl" (Template-Literal)
    stack: list[list] = [["code", 0]]
    last = ""          # letztes bedeutsames Zeichen im Code (für die Regex-Erkennung)
    last_word = ""     # letztes Wort im Code
    line_start = True  # gerade nach einem Zeilenumbruch (im Code)

    def in_code() -> bool:
        return stack[-1][0] == "code"

    while i < n:
        c = src[i]
        if in_code() and line_start:
            # Einrückung weg
            j = i
            while j < n and src[j] in " \t":
                j += 1
            i = j
            if i >= n:
                break
            c = src[i]
            # ganze Kommentarzeile weg
            if src.startswith("//", i):
                k = src.find("\n", i)
                if k < 0:
                    break
                i = k + 1
                continue
            if src.startswith("/*", i):
                k = src.find("*/", i + 2)
                if k < 0:
                    out.append(src[i:])
                    break
                k += 2
                # Rest der Zeile nur Leerraum → samt Umbruch weg
                m = k
                while m < n and src[m] in " \t":
                    m += 1
                if m >= n or src[m] == "\n":
                    i = m + 1
                    continue
                i = k
                continue  # Rest der Zeile wie ein Zeilenanfang (Leerraum davor fällt weg)
            line_start = False
            if c == "\n":
                # Leerzeile: Umbruch behalten (nicht nötig, aber unschädlich und sicher)
                out.append(c)
                i += 1
                line_start = True
                continue

        if in_code():
            if c == "\n":
                out.append(c)
                i += 1
                line_start = True
                continue
            if c in "\"'":
                j = i + 1
                while j < n and src[j] != c:
                    if src[j] == "\\":
                        j += 2
                        continue
                    if src[j] == "\n":
                        break
                    j += 1
                out.append(src[i:j + 1])
                i = j + 1
                last, last_word = c, ""
                continue
            if c == "`":
                out.append(c)
                stack.append(["tpl", 0])
                i += 1
                continue
            if c == "/" and src.startswith("//", i):
                k = src.find("\n", i)
                if k < 0:
                    out.append(src[i:])
                    break
                out.append(src[i:k])
                i = k
                continue
            if c == "/" and src.startswith("/*", i):
                k = src.find("*/", i + 2)
                k = n if k < 0 else k + 2
                out.append(src[i:k])
                i = k
                continue
            if c == "/" and (last == "" or last in _RE_BEFORE or last_word in _RE_KEYWORDS):
                # regulärer Ausdruck bis zum schließenden / (Klassen [...] beachten)
                j, cls = i + 1, False
                while j < n:
                    d = src[j]
                    if d == "\\":
                        j += 2
                        continue
                    if d == "\n":
                        break
                    if cls:
                        if d == "]":
                            cls = False
                    elif d == "[":
                        cls = True
                    elif d == "/":
                        break
                    j += 1
                j += 1
                while j < n and (src[j].isalpha()):
                    j += 1
                out.append(src[i:j])
                i = j
                last, last_word = ")", ""   # nach einer Regex ist „/“ eine Division
                continue
            if c == "{":
                stack[-1][1] += 1
            elif c == "}":
                if stack[-1][1] == 0 and len(stack) > 1:
                    # Ende von ${ … } – zurück ins Template-Literal
                    stack.pop()
                    out.append(c)
                    i += 1
                    continue
                stack[-1][1] -= 1
            out.append(c)
            if not c.isspace():
                if c.isalnum() or c in "_$":
                    m = _WORD.search("".join(out[-40:]))
                    last_word = m.group(0) if m else ""
                    last = "a"
                else:
                    last, last_word = c, ""
            i += 1
            continue

        # Template-Literal
        if c == "\\":
            out.append(src[i:i + 2])
            i += 2
            continue
        if c == "`":
            out.append(c)
            stack.pop()
            i += 1
            last, last_word = ")", ""
            continue
        if src.startswith("${", i):
            out.append("${")
            stack.append(["code", 0])
            i += 2
            last, last_word = "{", ""
            continue
        out.append(c)
        i += 1
    return "".join(out)


def schlank_wert(v: str) -> str:
    """Ein Vorlagenwert: nur ganze [[[ … ]]]-Ausdrücke (so liest button-card sie) verschlanken."""
    t = v.strip()
    if not (t.startswith("[[[") and t.endswith("]]]")):
        return v
    a = v.index("[[[") + 3
    b = v.rindex("]]]")
    return v[:a] + schlank(v[a:b]) + v[b:]


def schlank_vorlage(o):
    if isinstance(o, dict):
        return {k: schlank_vorlage(x) for k, x in o.items()}
    if isinstance(o, list):
        return [schlank_vorlage(x) for x in o]
    if isinstance(o, str):
        return schlank_wert(o)
    return o
