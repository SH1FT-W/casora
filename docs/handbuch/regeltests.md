# Regeltests – welche Regel wird wie automatisch rot

Ziel (Versprechen 5): jede Abweichung von den Regeln im Handbuch macht einen Test rot, bevor ein Mensch
sie sieht. Stufen: **statisch** (`dev/unit/`, Sekunden, läuft in jedem Gate) → **Laufzeit** (Test-HA,
`dev/qa/regress/` oder eigener Gate-Schritt).

Altlasten: Ein Regeltest nennt die bekannten Stellen mit Grund; neue Stellen sind rot, weniger ist immer in Ordnung
(keine Zahl nachziehen). Ist ein Umbau fertig, wird sein Regeltest im selben Commit vereinfacht. Neue Regeltests nur
für Fehler, die wirklich wiederkehren.

## 1. Schon vorhanden

| Regel | Test | Art |
|---|---|---|
| Keine neuen festen Farben, Radien, Kurven; halbe px und feste Schatten nicht mehr | `dev/unit/design_zaehler.mjs` + `design_grenzen.json` | statisch, Sperrklinke |
| Verschachtelte Karte mit javascript-Aktion hat `do_not_eval`; Popup-Auftritt respektiert reduzierte Bewegung; kein Haken als Auswahlwert | `dev/unit/vorlagen_regeln.mjs` | statisch |
| Jede antippbare Vorlage hat `haptic` | `dev/unit/tippen_einheitlich.mjs`, `dev/unit/badge_haptic.mjs` | statisch |
| Vorlagen-JS kompiliert mit den echten Parametern (kein `let html`) | `dev/qa/check-templates.mjs` | statisch (Gate) |
| Badges gleich hoch, lange Namen mit `…`, Jalousie-Badge in Casora-Teal | `badge_summe_hoehe.mjs`, `badge_langer_name.mjs`, `badge_jalousie_farbe.mjs` | statisch |
| Wortlaut: du-Form, nie „Studio B“, gleiche Schlüssel/Platzhalter, Muster kompilieren | `wortlaut_regeln.mjs`, `wortlaut.mjs`, `phrasen_en.mjs`, `schloss_zustaende.mjs`, `oeffnungen.mjs`, `tools/i18ncheck.py`, `tools/phrase-gaps.py` | statisch |
| Werte in HTML-Strings escaped, jeder `esc` voll (& < > " '), Vorlagen mit feindlichen Namen ohne eingeschleustes Markup | `dev/unit/html_escape.mjs` (+ `tools/html-escape-check.mjs`), `dev/qa/regress/r330_html_escape.mjs` | statisch + Laufzeit |
| Keine persönlichen Daten | `tools/privacy-check.py` (pre-commit + Gate) | statisch |
| Studio-Meldung im Dunkeln lesbar | `studio_toast_dunkel.mjs` | statisch |
| Keine doppelten Farben im Casora-Look | `farben_zwillinge.mjs` | statisch |
| Popup-Design: Kontrast Schalter/Pfeil auf aktiver Zeile, Kopf, langer Titel, Trefferflächen, Leck | `dev/qa/regress/r105_popup_design.mjs` | Laufzeit |
| Studio-Felder 38/44 px | `dev/qa/regress/r19_einstellungen_feldgroesse.mjs` | Laufzeit |
| Umzug unverändert | `r24_umzug_wie_vorher`, `rf02_raum_ablauf`, `r121`, `r122` | Laufzeit |
| Leistung: Voll-Durchläufe, Leck, doppelte Abrufe | `dev/unit/leistung_13.mjs`, `dev/qa/leistung.mjs --grenzen dev/qa/leistung-grenzen.json` | statisch + Laufzeit (Zähler) |
| Popup v3 „Bühne“ ([popup-richtlinien-v3.md](popup-richtlinien-v3.md)): `UI.stage` S1–S8 und `UI.quick` da, migrierte Popups mit variant 'v3' und Bühne aus `UI.stage`, Schnellwahl ohne gefährliche Einträge und höchstens 4, Diagramme ohne Hex und nur 120/140/160 hoch, nicht migrierte Popups mit Grund in der Liste | `dev/unit/popup_v3.mjs` + `popup_v3_offen.json` | statisch, Sperrklinke |
