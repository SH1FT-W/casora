# Casora – Hinweise für Claude

Casora ist eine Home-Assistant-Integration (`custom_components/casora/`) mit Studio-Panel und
button-card-Vorlagen. Öffentliches Repo: keine persönlichen Daten (echte Entitäts-IDs, Namen,
Adressen, Zugangsdaten) in Code, Tests, Commits oder PR-Texten.

## Stil
- Kommentare im Code auf Deutsch, knapp, wie der umliegende Code. Kein Umbau nebenbei.
- Texte, die Nutzer sehen, schreibt der Code auf Deutsch; die englische Fassung steht in
  `custom_components/casora/translations/dashboard/phrases/en.json` (Dashboard) bzw.
  `custom_components/casora/translations/panel/` (Studio). Danach `python3 tools/i18ncheck.py`.

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

## Nicht anfassen
- Version (`manifest.json`), `CHANGELOG*.md`, „Neu“-Popup (`casora-panel-welcome.js`, WHATS_NEW),
  Vorschaubilder unter `assets/themes/`, `.github/` – das gehört zum Release.

## Pull Requests
- „Fixes #N“ nur, wenn der PR alles erledigt, worum das Issue bittet. Löst er nur einen Teil,
  „Refs #N“ – sonst schließt GitHub das Issue beim Mergen.
- Im PR-Text sagen, was bewusst nicht enthalten ist.
