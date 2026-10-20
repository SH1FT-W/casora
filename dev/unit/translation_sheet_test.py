"""tools/translation-sheet.py: an old review sheet comes back after the tables moved on.

  uv run --python 3.14 --with openpyxl python dev/unit/translation_sheet_test.py

A correction is written only where the row still shows the source and translation the reviewer saw;
everything changed since is reported as a conflict and kept. Keys added since stay, none get lost.
The addendum export (--since) holds exactly the new and changed rows.
"""
from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
import tempfile

from openpyxl import load_workbook

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location("translation_sheet", os.path.join(ROOT, "tools/translation-sheet.py"))
ts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ts)

fails = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else "  " + repr(info)[:400]))
    if not cond:
        fails.append(name)


def dump(path, obj, indent):
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False, indent=indent) + "\n")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


tmp = tempfile.mkdtemp()
try:
    tr = os.path.join(tmp, "translations")
    for d in ("dashboard/phrases", "panel"):
        os.makedirs(os.path.join(tr, d))
    # A small made-up language "xx" with all four files.
    dump(os.path.join(tr, "dashboard/phrases/en.json"), {"exact": {"Licht an": "Light on", "Fenster offen": "Window open",
                                                                   "Tür zu": "Door closed", "Akku leer": "Battery empty"},
                                                         "patterns": [["^(\\d+) Lichter an$", "{1} lights on"]]}, 1)
    dump(os.path.join(tr, "dashboard/phrases/xx.json"), {"exact": {"Licht an": "Luz on", "Fenster offen": "Ventana abierta",
                                                                   "Tür zu": "Puerta cerrada", "Akku leer": "Batería vacía"},
                                                         "patterns": [["^(\\d+) Lichter an$", "{1} luces on"]]}, 1)
    dump(os.path.join(tr, "panel/de.json"), {"exact": {"Save": "Speichern", "Add room": "Raum hinzufügen"}, "patterns": []}, 2)
    dump(os.path.join(tr, "panel/xx.json"), {"exact": {"Save": "Guardar", "Add room": "Añadir sala"}, "patterns": []}, 2)
    for name in ("dashboard/en.json", "dashboard/de.json", "dashboard/xx.json"):
        dump(os.path.join(tr, name), {"filter.all": {"en": "Home", "de": "Zuhause", "xx": "Casa"}[name.split("/")[1][:2]]}, 2)
    for name in ("en.json", "de.json", "xx.json"):
        dump(os.path.join(tr, name), {"title": {"en": "Casora", "de": "Casora", "xx": "Casora"}[name[:2]]}, 2)
    ts.TR = tr

    first = os.path.join(tmp, "first.xlsx")
    ts.export("xx", first)
    old_rows = ts.rows("xx")

    # The reviewer fills in the first sheet.
    wb = load_workbook(first)
    ws = wb["Texts"]
    head = [c.value for c in ws[1]]
    col = {n: head.index(n) + 1 for n in ts.COLS}
    by_key = {ws.cell(row=r, column=1).value: r for r in range(2, ws.max_row + 1)}

    def review(key, verdict, fix=None):
        r = by_key[key]
        ws.cell(row=r, column=col["Correct?"], value=verdict)
        if fix is not None:
            ws.cell(row=r, column=col["Correction"], value=fix)

    review("dash:exact:Licht an", "Wrong", "Luz encendida")              # untouched since → applied
    review("dash:exact:Fenster offen", "Wrong", "Ventana abierta ya")     # translated again since → conflict
    review("dash:exact:Tür zu", "Wrong", "Puerta cerrada!")              # German source changed since → conflict
    review("dash:pattern:^(\\d+) Lichter an$", "Wrong", "{1} luces encendidas")  # pattern → applied
    review("panel:exact:Add room", "Wrong", "Añadir habitación")          # Studio → applied
    review("panel:exact:Save", "Wrong", "Guardar {x}")                   # placeholder added → skipped
    review("dashboard/:/filter.all", "OK", "ignored")                     # OK wins
    review("ha:/title", "Wrong")                                          # wrong without a fix → reported
    review("dash:exact:Akku leer", "Wrong", "Batería vacía")             # equals current → nothing to do
    wb.save(first)

    # Meanwhile the tables moved on: a retranslation, a changed source, a new key.
    ph = load(os.path.join(tr, "dashboard/phrases/xx.json"))
    ph["exact"]["Fenster offen"] = "Ventana abierta (nuevo)"
    ph["exact"]["Heizung an"] = "Calefacción encendida"
    dump(os.path.join(tr, "dashboard/phrases/xx.json"), ph, 1)
    en = load(os.path.join(tr, "dashboard/phrases/en.json"))
    en["exact"]["Tür zu"] = "Door shut"
    en["exact"]["Heizung an"] = "Heating on"
    dump(os.path.join(tr, "dashboard/phrases/en.json"), en, 1)

    # Addendum: only what is new or changed since the first sheet.
    delta = {r[0]: why for r, why in ts.changes("xx", old_rows)}
    check("Nachtrag: neu, Quelle geändert, Übersetzung geändert",
          delta == {"dash:exact:Heizung an": "New", "dash:exact:Tür zu": "Source changed",
                    "dash:exact:Fenster offen": "Translation changed"}, delta)

    # The addendum sheet itself: only the delta rows, with the reason, exported before the corrections come back.
    add = os.path.join(tmp, "addendum.xlsx")
    ts.rows_at = lambda lang, commit: old_rows  # no git in the temp tree
    ts.export("xx", add, since="first")
    ws2 = load_workbook(add)["Texts"]
    keys = {ws2.cell(row=r, column=1).value: ws2.cell(row=r, column=10).value for r in range(2, ws2.max_row + 1)}
    check("Nachtrag-Tabelle: nur neue/geänderte Zeilen mit Grund", keys == delta, keys)
    # Dry run changes nothing.
    before = {n: open(os.path.join(tr, n), encoding="utf-8").read()
              for n in ("dashboard/phrases/xx.json", "panel/xx.json", "dashboard/xx.json", "xx.json")}
    res = ts.import_("xx", first, True)
    after = {n: open(os.path.join(tr, n), encoding="utf-8").read() for n in before}
    check("Probelauf schreibt nichts", before == after)

    res = ts.import_("xx", first, False)
    ph = load(os.path.join(tr, "dashboard/phrases/xx.json"))
    pa = load(os.path.join(tr, "panel/xx.json"))
    check("Unveränderte Zeile übernommen", ph["exact"]["Licht an"] == "Luz encendida", ph)
    check("Muster übernommen", ph["patterns"][0] == ["^(\\d+) Lichter an$", "{1} luces encendidas"], ph["patterns"])
    check("Studio übernommen", pa["exact"]["Add room"] == "Añadir habitación", pa)
    check("Neu übersetzt seit der Tabelle: bleibt, Konflikt gemeldet",
          ph["exact"]["Fenster offen"] == "Ventana abierta (nuevo)"
          and any(c[0] == "dash:exact:Fenster offen" and "translation changed" in c[1] for c in res["conflicts"]), res)
    check("Quelle geändert seit der Tabelle: bleibt, Konflikt gemeldet",
          ph["exact"]["Tür zu"] == "Puerta cerrada"
          and any(c[0] == "dash:exact:Tür zu" and "source changed" in c[1] for c in res["conflicts"]), res)
    check("Platzhalter falsch: übersprungen", pa["exact"]["Save"] == "Guardar"
          and any(k == "panel:exact:Save" for k, _ in res["skipped"]), res)
    check("OK gewinnt, falsch ohne Korrektur gemeldet",
          load(os.path.join(tr, "dashboard/xx.json"))["filter.all"] == "Casa" and res["open"] == ["ha:/title"], res)
    check("Gleich wie jetzt: nichts zu tun", res["same"] == 1 and res["done"] == 3, res)
    check("Neuer Schlüssel bleibt, keiner geht verloren",
          ph["exact"].get("Heizung an") == "Calefacción encendida" and set(ph["exact"]) == {"Licht an", "Fenster offen", "Tür zu", "Akku leer", "Heizung an"}, ph)
    check("Unveränderte Dateien nicht neu geschrieben",
          open(os.path.join(tr, "xx.json"), encoding="utf-8").read() == before["xx.json"])

finally:
    shutil.rmtree(tmp)

# The real tables: rows cover every key of the four Spanish files.
ts.TR = os.path.join(ROOT, "custom_components/casora/translations")
real = ts.rows("es")
check("Spanisch: jede Zeile hat eine Übersetzung", all(r[5] for r in real), [r[0] for r in real if not r[5]][:5])

print("\n" + ("ALLES OK" if not fails else "%d FEHLER" % len(fails)))
sys.exit(1 if fails else 0)
