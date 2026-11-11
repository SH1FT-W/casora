# Casora – Hinweise für Claude

Casora ist eine Home-Assistant-Integration (`custom_components/casora/`) mit Studio-Panel und
button-card-Vorlagen. Öffentliches Repo: keine persönlichen Daten (echte Entitäts-IDs, Namen,
Adressen, Zugangsdaten) in Code, Tests, Commits oder PR-Texten.

## Stil
- Neue Kommentare, Docstrings und Test-Beschreibungen auf Englisch, knapp, wie der umliegende Code. Bestehende
  deutsche Kommentare und Dateinamen bleiben, bis die Stelle ohnehin umgeschrieben wird; nichts nebenbei umstellen.
- Texte, die Nutzer sehen, schreibt der Code auf Deutsch; die englische Fassung steht in
  `custom_components/casora/translations/dashboard/phrases/en.json` (Dashboard) bzw.
  `custom_components/casora/translations/panel/` (Studio). Danach `python3 tools/i18ncheck.py`.

## Bau-Handbuch
- Vor neuen Kacheln, Popups oder Studio-Flächen die passende Datei aus `docs/handbuch/README.md` lesen. Was dort
  steht, gilt; was nicht dort steht, ist frei (mit Blick auf die Nachbarn).
- Popups: nur `docs/handbuch/popup-richtlinien-v3.md` (neues Popup: §18). Regeltest `dev/unit/popup_v3.mjs`.
- Studio-Einstellungen sind Entwürfe: jede Einstellung, auch ein Schalter, wirkt erst mit „Einstellungen speichern“
  und lässt sich verwerfen (`_cs`-Entwurf in `casora-panel-settings.js`), nie sofort.

## Vorlagen (button-card)
- Quelle ist `dashboards/casora/button_card_templates.json`. Nur dort ändern, danach
  `python3 tools/build-templates.py` – das baut `custom_components/casora/panel/casora-templates.json`.
- `casora-templates.json` nie von Hand bearbeiten. Bei Konflikten: Quelle zusammenführen, neu bauen.
- Die JSON-Quelle ist mit Einrückung 2 formatiert (`json.dumps(..., ensure_ascii=False, indent=2)`).

## Prüfen (ohne Home Assistant)
- `node dev/qa/check-templates.mjs` – alle `[[[ … ]]]`-Ausdrücke müssen 0 Fehler haben.
- `node --check <datei>` für jede geänderte JS-Datei.
- Unit-Tests: `node dev/unit/<name>.mjs` bzw. `python3 dev/unit/<name>_test.py` (Node 22).
  `dev/unit/vorlagen_print_js.mjs` ist ein Hilfsskript mit Argumenten, kein Test.
- Neues Python-Modul: `python3 dev/unit/no_config_writes_test.py` und `dev/unit/no_foreign_internals_test.py` laufen
  lassen; greift es auf HA zu, `docs/ha-annahmen.md` im selben Commit ergänzen.
- Jeder Bugfix bekommt einen Regressionstest, der ohne den Fix rot ist (`dev/unit/` ohne HA,
  `dev/qa/regress/` mit Test-HA – siehe `dev/qa/README.md`).

## Version
- Kalender-Versionen **YY.M.N** (z. B. 26.10.31), Tag/Titel „vYY.M.N“ (Casora bleibt vorerst bei „v“, anders als die
  übrigen Repos: bisher veröffentlichte Casora-Versionen erkennen nur v-Tags, siehe `tools/release.sh`). N = laufende Nummer des Releases
  im Monat; jedes Release ist die nächste Nummer (kein Patch/Minor mehr). Nächste Nummer: `tools/next-version`,
  `tools/release.sh` schlägt sie vor und prüft sie. Rhythmus (Maintainer, 09.11.2026): **stabiles Release freitags** mit
  vollem Gate (`dev/qa/gate.sh --voll`), auch bei großen Umbauten (viele Module, Vorlagen-Umbau, Migration, gespeicherte Daten);
  **unter der Woche nur Betas** mit Patch-Gate (`dev/qa/gate.sh --patch --kette`, prüft nur das seit dem letzten grünen Gate Neue); ein stabiles Release außer der Reihe nur als
  Hotfix (`tools/release.sh --patch`). Das Patch-Gate wählt in großen
  Skripten nach geänderten Teilen (`dev/qa/auswahl-teile.mjs`); neue Tests mit `// @deckt: <datei>#<global/funktion>,…` statt nur
  der ganzen Datei markieren, sonst laufen sie nur, wenn sie einen Namen der Datei nennen oder die Datei nicht einzuordnen ist.
- Release-Kandidat einfrieren: Sind Version/CHANGELOG committet, kommt nichts mehr dazu; Weiteres ins nächste Release.
- Neue Regressionstests vor dem Merge einmal im Gate-Zustand prüfen: `dev/qa/probe.sh rNNN_name …` (frisches
  Wegwerf-HA „arbeit“ mit qa-arbeit, ~2–3 Min.). casora-test allein reicht nicht. `tools/release.sh --publish` syncht
  casora-test danach selbst.
- Betas für Tester (Fix auf Verdacht, Gerät nicht nachstellbar): `tools/release.sh --beta --publish` – nächste Nummer mit
  `bK` (26.10.58b1), Vorabversion, Patch-Gate reicht, nur `.qa/release-notes-<version>.md` (englisch) nötig, manifest auf die
  Beta-Nummer. Betas zählen nicht als Release-Nummer; das stabile Release danach bündelt und bekommt das volle Gate. Nach jeder Beta die enthaltenen
  Issues auf `in-beta` setzen, in der Sprache des Melders kommentieren (Link, Bitte um Feedback, Wiederöffnen erwünscht, Hinweis aufs
  Freitag-Release) und schließen.
- Gates über `dev/qa/gate-kopie.sh <optionen von gate.sh>` starten: Es prüft den aktuellen Commit in der eigenen
  Arbeitskopie `../casora-gate` und kopiert das Ergebnis zurück, main bleibt währenddessen frei für Commits.

## Nicht anfassen
- Version (`manifest.json`), `CHANGELOG*.md`, „Neu“-Popup (`casora-panel-welcome.js`, WHATS_NEW),
  Vorschaubilder unter `assets/themes/`, `.github/`, Versionszeile in `docs/index.html` – das gehört zum Release.

## Pull Requests
- Issues immer mit „Refs #N“ nennen, nie „Fixes #N“: geschlossen wird nach der Beta von Hand (siehe oben).
- Im PR-Text sagen, was bewusst nicht enthalten ist.
