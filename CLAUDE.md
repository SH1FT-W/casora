# Casora – Hinweise für Claude

Casora ist eine Home-Assistant-Integration (`custom_components/casora/`) mit Studio-Panel und
button-card-Vorlagen. Öffentliches Repo: keine persönlichen Daten (echte Entitäts-IDs, Namen,
Adressen, Zugangsdaten) in Code, Tests, Commits oder PR-Texten.

## Stil
- Kommentare, Docstrings und Test-Beschreibungen im Code auf Englisch, knapp, wie der umliegende Code.
  Bestehende deutsche Kommentare einer Datei beim nächsten Arbeiten an ihr mit umstellen (nur Kommentare,
  keine Logik); Dateinamen dabei ebenfalls englisch (`git mv`, alle Verweise per `git grep` anpassen).
  Kein Umbau nebenbei.
- Texte, die Nutzer sehen, schreibt der Code auf Deutsch; die englische Fassung steht in
  `custom_components/casora/translations/dashboard/phrases/en.json` (Dashboard) bzw.
  `custom_components/casora/translations/panel/` (Studio). Danach `python3 tools/i18ncheck.py`.

## Bau-Handbuch
- Vor neuen Kacheln, Popups oder Studio-Flächen `docs/handbuch/` lesen (Design-Regeln, Blaupausen, Wortliste,
  Test und Release). Was dort „OFFEN“ ist, nicht selbst entscheiden: Wert der Nachbarn übernehmen.
- Popups nach `docs/handbuch/popup-richtlinien-v3.md` (Aufbau „Bühne“, gilt vor v2) und `docs/handbuch/popup-blaupause.md`
  (Muster v2: Zeilen, Unterseiten, Einstellungen, Bausteine in `window._casoraUI`, Regeltest `dev/unit/popup_blaupause.mjs`).
  Umbau aller Popups: `docs/handbuch/popup-rework-v3-auftrag.md`.
- Regeltests `dev/unit/design_zaehler.mjs`, `dev/unit/vorlagen_regeln.mjs` müssen grün bleiben.

## Vorlagen (button-card)
- Quelle ist `dashboards/casora/button_card_templates.json`. Nur dort ändern, danach
  `python3 tools/build-templates.py` – das baut `custom_components/casora/panel/casora-templates.json`.
- `casora-templates.json` nie von Hand bearbeiten. Bei Konflikten: Quelle zusammenführen, neu bauen.
- Die JSON-Quelle ist mit Einrückung 1 formatiert (`json.dumps(..., ensure_ascii=False, indent=1)`).

## Prüfen (ohne Home Assistant)
- `node dev/qa/check-templates.mjs` – alle `[[[ … ]]]`-Ausdrücke müssen 0 Fehler haben.
- `node --check <datei>` für jede geänderte JS-Datei.
- Unit-Tests: `node dev/unit/<name>.mjs` bzw. `python3 dev/unit/<name>_test.py` (Node 22).
  `dev/unit/vorlagen_print_js.mjs` ist ein Hilfsskript mit Argumenten, kein Test.
- Für einen gemeldeten Fehler möglichst einen Test ergänzen (`dev/unit/` ohne HA,
  `dev/qa/regress/` mit Test-HA – siehe `dev/qa/README.md`).

## Version
- Kalender-Versionen **YY.M.N** (z. B. 26.10.31), Tag/Titel „vYY.M.N“ (Casora bleibt vorerst bei „v“, anders als die
  übrigen Repos: bisher veröffentlichte Casora-Versionen erkennen nur v-Tags, siehe `tools/release.sh`). N = laufende Nummer des Releases
  im Monat; jedes Release ist die nächste Nummer (kein Patch/Minor mehr). Nächste Nummer: `tools/next-version`,
  `tools/release.sh` schlägt sie vor und prüft sie. Zwei Gate-Stufen (Maintainer, 02.11.2026): **Fix-Releases unter der
  Woche** mit Patch-Gate (`dev/qa/gate.sh --patch` + `tools/release.sh --patch`); **volles Gate** (`dev/qa/gate.sh --voll`)
  freitags und bei großen Umbauten (viele Module, Vorlagen-Umbau, Migration, gespeicherte Daten).
- Release-Kandidat einfrieren: Sind Version/CHANGELOG committet, kommt nichts mehr dazu; Weiteres ins nächste Release.
- Neue Regressionstests vor dem Merge einmal im Gate-Zustand prüfen: `dev/qa/probe.sh rNNN_name …` (frisches
  Wegwerf-HA „arbeit“ mit qa-arbeit, ~2–3 Min.). casora-test allein reicht nicht. `tools/release.sh --publish` syncht
  casora-test danach selbst.
- Betas für Tester (Fix auf Verdacht, Gerät nicht nachstellbar): `tools/release.sh --beta --publish` – nächste Nummer mit
  `bK` (26.10.58b1), Vorabversion, Patch-Gate reicht, nur `.qa/release-notes-<version>.md` (englisch) nötig, manifest auf die
  Beta-Nummer. Betas zählen nicht als Release-Nummer; das stabile Release danach bündelt und bekommt das volle Gate.

## Nicht anfassen
- Version (`manifest.json`), `CHANGELOG*.md`, „Neu“-Popup (`casora-panel-welcome.js`, WHATS_NEW),
  Vorschaubilder unter `assets/themes/`, `.github/`, Versionszeile in `docs/index.html` – das gehört zum Release.

## Pull Requests
- „Fixes #N“ nur, wenn der PR alles erledigt, worum das Issue bittet. Löst er nur einen Teil,
  „Refs #N“ – sonst schließt GitHub das Issue beim Mergen.
- Im PR-Text sagen, was bewusst nicht enthalten ist.
