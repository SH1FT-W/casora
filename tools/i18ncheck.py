#!/usr/bin/env python3
"""Guard the dashboard translation table.

    python3 tools/i18ncheck.py

en.json is the reference translators work from, so it has to agree with the
English default sitting inline at every call site. A drift there is invisible:
English users keep reading the inline default while translators translate a
string nobody sees.
"""

import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "custom_components/casora/translations/dashboard")
OUT = os.path.join(ROOT, "custom_components/casora/scripts/casora-i18n.js")
SCAN = ("dashboards/templates", "custom_components/casora/scripts", "custom_components/casora/panel")

CALL = re.compile(
    r"(?:_casoraT|(?<![\w$])T)\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'"
)
SLOT = re.compile(r"\{(\w+)\}")


def call_sites():
    for rel in SCAN:
        base = os.path.join(ROOT, rel)
        for dirpath, _d, files in os.walk(base):
            if "untested" in dirpath:
                continue
            for name in files:
                if not name.endswith((".yaml", ".js")):
                    continue
                if name == "casora-i18n.js":
                    continue
                path = os.path.join(dirpath, name)
                try:
                    with open(path, encoding="utf-8", errors="replace") as fh:
                        text = fh.read()
                except OSError:
                    continue
                for m in CALL.finditer(text):
                    line = text.count("\n", 0, m.start()) + 1
                    yield os.path.relpath(path, ROOT), line, m.group(1), m.group(2)


TR = os.path.dirname(SRC)
# Placeholders and markup a translation has to keep: {name}, {1}, %s and HTML tags.
MARKS = re.compile(r"\{\w+\}|%s|<[^>]+>")
WORD = re.compile(r"[A-Za-zÄÖÜäöüßÁÉÍÓÚáéíóúÑñ]+")
# German letters that no other Casora language uses (Spanish has ü: desagüe, antigüedad).
GERMAN_ONLY = re.compile(r"[äöÄÖßẞ]")
# Words German shares with a translation; not a German leftover there.
SHARED = {
    "es": {"Portal", "Foto", "Fotos", "Sensor", "Sensores", "number", "Radar", "Hotel", "Taxi", "Bar", "Normal",
           "Total", "Global", "Final", "Manual", "Ideal", "Real", "Hemma", "Casora", "Studio", "Pulse"},
}
# Second person singular everywhere (wortliste: du / tú).
FORMAL = {"es": re.compile(r"\b(usted|Usted|ustedes|Ustedes)\b")}


def _load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _marks(s):
    return sorted(MARKS.findall(str(s)))


def _flat(obj, prefix=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _flat(v, prefix + "/" + k)
    else:
        yield prefix, obj


def _regex_words(rx):
    # Literal words of a pattern: drop escapes, classes and groups.
    s = re.sub(r"\\.", " ", rx)
    s = re.sub(r"\[[^\]]*\]|\(\?:|[()^$|?*+{}.,0-9]", " ", s)
    return s


def _leftovers(lang, value, german, reference):
    """German words in a translation: in the German source, not in the reference (English) text."""
    shared = SHARED.get(lang, set())
    keep = set(WORD.findall(reference)) | shared
    src = set(WORD.findall(german))
    bad = []
    for w in WORD.findall(value):
        if w in keep:
            continue
        if GERMAN_ONLY.search(w) or (len(w) >= 4 and w in src):
            bad.append(w)
    return sorted(set(bad))


def check_language(lang, errors):
    """A further language (not de/en) has to match English entry for entry: same keys,
    same patterns in the same order, same placeholders and markup, no German leftovers."""
    err = lambda where, msg: errors.append("%s/%s.json: %s" % (where, lang, msg))  # noqa: E731
    formal = FORMAL.get(lang)

    def common(where, key, value, ref, german, source_for_words):
        if not isinstance(value, str) or not value.strip():
            err(where, "%r is empty" % key)
            return
        if _marks(value) != _marks(ref):
            err(where, "%r placeholders/markup %s != %s" % (key, _marks(value), _marks(ref)))
        bad = _leftovers(lang, value, german, source_for_words)
        if bad:
            err(where, "%r German leftover %s in %r" % (key, bad, value))
        if formal and formal.search(value):
            err(where, "%r formal address in %r" % (key, value))

    # Dashboard phrases: German source, English reference.
    path = os.path.join(SRC, "phrases", lang + ".json")
    if os.path.isfile(path):
        en, tbl = _load(os.path.join(SRC, "phrases", "en.json")), _load(path)
        # phrases/de.json translates English leftovers ("Favorites", "Home"); a further language needs them too.
        de_extra = _load(os.path.join(SRC, "phrases", "de.json")).get("exact", {})
        for k in de_extra:
            if k not in tbl.get("exact", {}):
                err("phrases", "missing %r (de.json: %r)" % (k, de_extra[k]))
        for k in en["exact"]:
            if k not in tbl.get("exact", {}):
                err("phrases", "missing %r (en: %r)" % (k, en["exact"][k]))
        for k, v in tbl.get("exact", {}).items():
            if k in de_extra and k not in en["exact"]:
                if not v.strip():
                    err("phrases", "%r is empty" % k)
                continue
            if k not in en["exact"]:
                err("phrases", "%r is not in en.json" % k)
                continue
            common("phrases", k, v, en["exact"][k], k, en["exact"][k])
        ep, tp = en.get("patterns", []), tbl.get("patterns", [])
        if [p[0] for p in ep] != [p[0] for p in tp]:
            have = {p[0] for p in tp}
            want = {p[0] for p in ep}
            for rx in [p[0] for p in ep if p[0] not in have]:
                err("phrases", "missing pattern %r" % rx)
            for rx in [p[0] for p in tp if p[0] not in want]:
                err("phrases", "pattern %r is not in en.json" % rx)
            if have == want:
                err("phrases", "patterns not in the order of en.json (the first match wins)")
        enmap = {p[0]: p[1] for p in ep}
        for rx, rep, *_ in tp:
            if rx in enmap:
                common("phrases", rx, rep, enmap[rx], _regex_words(rx), enmap[rx])

    # Studio: English source, German as the complete table.
    path = os.path.join(TR, "panel", lang + ".json")
    if os.path.isfile(path):
        de, tbl = _load(os.path.join(TR, "panel", "de.json")), _load(path)
        en_extra = _load(os.path.join(TR, "panel", "en.json")).get("exact", {})
        want = dict(de["exact"])
        for k in en_extra:
            want.setdefault(k, k)
        for k in want:
            if k not in tbl.get("exact", {}):
                err("panel", "missing %r (de: %r)" % (k, want[k]))
        for k, v in tbl.get("exact", {}).items():
            if k not in want:
                err("panel", "%r is not in de.json" % k)
                continue
            common("panel", k, v, k, want[k], k)
        dp, tp = de.get("patterns", []), tbl.get("patterns", [])
        if [p[0] for p in dp] != [p[0] for p in tp]:
            err("panel", "patterns differ from de.json (missing, extra or out of order)")
        demap = {p[0]: p[1] for p in dp}
        for rx, rep, *_ in tp:
            if rx in demap:
                common("panel", rx, rep, demap[rx], demap[rx], _regex_words(rx))

    # Dashboard keys and Home Assistant setup: same keys and placeholders as en.json.
    for where, ref_path, de_path in (("dashboard", os.path.join(SRC, "en.json"), os.path.join(SRC, "de.json")),
                                     ("translations", os.path.join(TR, "en.json"), os.path.join(TR, "de.json"))):
        path = os.path.join(os.path.dirname(ref_path), lang + ".json")
        if not os.path.isfile(path):
            err(where, "file missing")
            continue
        ref = dict(_flat(_load(ref_path)))
        de = dict(_flat(_load(de_path)))
        tbl = dict(_flat(_load(path)))
        for k in ref:
            if k not in tbl:
                err(where, "missing %r" % k)
        for k, v in tbl.items():
            if k not in ref:
                err(where, "%r is not in en.json" % k)
                continue
            # HA keeps its own [%key:…%] references as they are.
            german = "" if str(ref[k]).startswith("[%key:") else str(de.get(k, ""))
            common(where, k, v, ref[k], german, str(ref[k]))


def languages():
    """Further languages besides the sources: every phrases/<lang>.json other than de/en."""
    out = set()
    for d in (os.path.join(SRC, "phrases"), os.path.join(TR, "panel")):
        out |= {n[:-5] for n in os.listdir(d) if n.endswith(".json")}
    return sorted(out - {"de", "en"})


def main() -> int:
    errors = []
    with open(os.path.join(SRC, "en.json"), encoding="utf-8") as fh:
        en = json.load(fh)

    used = set()
    for path, line, key, default in call_sites():
        used.add(key)
        if key not in en:
            errors.append("%s:%d  key not in en.json: %r" % (path, line, key))
        elif en[key] != default:
            errors.append(
                "%s:%d  %r default %r != en.json %r"
                % (path, line, key, default, en[key])
            )

    for key in sorted(set(en) - used):
        errors.append("en.json: %r is not used at any call site" % key)

    for name in sorted(os.listdir(SRC)):
        if not name.endswith(".json") or name == "en.json":
            continue
        with open(os.path.join(SRC, name), encoding="utf-8") as fh:
            tbl = json.load(fh)
        for key, value in sorted(tbl.items()):
            if key not in en:
                errors.append("%s: %r is not in en.json" % (name, key))
                continue
            if SLOT.findall(en[key]) and set(SLOT.findall(value)) != set(
                SLOT.findall(en[key])
            ):
                errors.append(
                    "%s: %r placeholders %s != en %s"
                    % (name, key, SLOT.findall(value), SLOT.findall(en[key]))
                )

    # Doppelte Schlüssel (z. B. Reste aus dem Zusammenführen): JSON nimmt still den letzten.
    tr_root = os.path.dirname(SRC)
    for dirpath, _d, files in os.walk(tr_root):
        for name in sorted(files):
            if not name.endswith(".json"):
                continue
            path = os.path.join(dirpath, name)

            def dup_hook(pairs, path=path):
                seen = set()
                for k, _v in pairs:
                    if k in seen:
                        errors.append("%s: duplicate key %r" % (os.path.relpath(path, ROOT), k))
                    seen.add(k)
                return dict(pairs)

            with open(path, encoding="utf-8") as fh:
                json.load(fh, object_pairs_hook=dup_hook)

    for lang in languages():
        check_language(lang, errors)

    before = open(OUT, encoding="utf-8").read() if os.path.isfile(OUT) else None
    subprocess.run(
        [sys.executable, os.path.join(ROOT, "tools/build-i18n.py")],
        check=True, capture_output=True,
    )
    if before != open(OUT, encoding="utf-8").read():
        errors.append("casora-i18n.js was stale; rebuilt. Commit the result.")

    for e in errors:
        print(e)
    print("i18ncheck: %d key(s), %d problem(s)" % (len(en), len(errors)))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
