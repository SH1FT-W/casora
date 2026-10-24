# Regeltests – welche Regel wird wie automatisch rot

Ziel (Versprechen 5): jede Abweichung von den Regeln im Handbuch macht einen Test rot, bevor ein Mensch
sie sieht. Stufen: **statisch** (`dev/unit/`, Sekunden, läuft in jedem Gate) → **Laufzeit** (Test-HA,
`dev/qa/regress/` oder eigener Gate-Schritt).

Grundsatz für Altlasten: Wo heute schon Abweichungen bestehen, zählt der Test als **Sperrklinke** – die
Zahl darf nicht steigen, sinkt sie, wird die Grenze nachgezogen. So wird nichts schlimmer, ohne dass
alles auf einmal umgebaut werden muss.

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

## 2. Vorschlag – nächste Regeltests

| # | Regel (Handbuch) | Wie rot | Werkzeug da? | Voraussetzung |
|---|---|---|---|---|
| R1 | Kontrast ≥ 1,5 bei Schaltern, Text-Kontrast AA, Trefferfläche ≥ 40, kein Haken in Listen | `popup-raender --geo --geo-streng` als Gate-Schritt (zuerst nur kontrast < 1,5, schalter, treffer, haken) | ja (`popup-geo.mjs`) | Laufzeit-HA im Gate; Liste bekannter Ausnahmen mit Grund |
| R2 | Ringsum ±1 / konzentrisch ±2 / fluchten in Popups | dieselbe Messung, Arten ring/radius/zeilen/etikett/spalten | ja | erst nach OFFEN DP-16 (Zeilenradius) – sonst ist heute jede Zeile rot |
| R3 | Geometrie in Menüs und Studio (Räume-Menü, Glocke, ⋯, Inspektor) | `ausrichtung.mjs` mit Overlay als Wurzel, als Gate-Schritt | ja | Ausnahmenliste; dk-10/dk-15 entschieden |
| R4 | Kachel-Geometrie: Symbolkreis ringsum, Badge-Höhe, Ellipse statt Überlauf je Familie | Messwerkzeug aus dem Kachel-Audit (`messen.mjs`) ins Repo heben, Grenzen je Familie | Prototyp (nicht im Repo) | OFFEN dk-05 |
| R5 | Laufzeit-Stile gegen Tokens (Kreisgrößen, Radien-Stufen, 4er-Raster, Schriftskala) | Stil-Messung des Sprachen-Audits (`stil-messen.mjs`) als Zähler | Prototyp (nicht im Repo) | Token-Satz entschieden (Studio-Sprache, Abschnittsköpfe) |
| R6 | 0 Konsolenfehler, Warnungen gezählt | `konsole.mjs` als Gate-Schritt „Konsole 0“ mit FREMD-Liste | ja | – (sofort möglich) |
| R7 | Randfälle ohne `undefined`/`NaN`/Fehler | `randfaelle.mjs` im Gate (arbeit + stress) | ja | – |
| R8 | Hover nur unter `@media (hover: hover)` | statisch: `:hover`-Regeln außerhalb eines hover-Medienblocks zählen (Sperrklinke) | nein, klein | – |
| R9 | Neue Theme-Variable hat hellen und dunklen Wert | statisch: Schlüssel in `modes.light` ohne `modes.dark` (und umgekehrt) als Sperrklinke – heute 87 Unterschiede, teils gewollt (Grundwert außerhalb `modes`) | nein, klein | Liste der gewollten Fälle |
| R10 | Szenenfarbe nur aus dem Studio | statisch: Stellen, die Szenen färben, lesen `casoraSceneColor`/`scene_colors` (Liste der bekannten Stellen, neue Stelle ohne Aufruf = rot) | nein | OFFEN dk-17 |
| R11 | Keine neuen Klassen-Präfixe in Popups (nur `hui-*` + bekannte Altlasten `lps/hrl/hcal/csl/ct/cfb`) | statisch, Sperrklinke über Präfixe in `class="…"` | nein, klein | – |
| R12 | Keine weiteren Kopien kleiner Helfer (`esc`, `ago`, `num`) | statisch, Sperrklinke über Funktionskörper (Aufräum-Werkzeug `doppelt.py`) | Prototyp | gemeinsamer `_casoraUtil` (Vorschlag V2 Aufräumen) |
| R13 | Keine toten CSS-Klassen/Funktionen | `leichen.py` als Sperrklinke | Prototyp | – |
| R14 | Leere `catch` nicht mehr werden | statisch, Zähler (heute 136 in Dashboard-JS/Panel) | nein, klein | – |
| R15 | Muster-Reihenfolge in `phrases/en.json` (Spezielles vor Allgemeinem) | statisch: jedes Muster gegen die Beispiele der späteren prüfen | Prototyp (Wortlaut-Audit) | – |
| R16 | Live-Reaktion verschachtelter Popup-Karten (`triggers_update`) | Unit: Popup-Inhalt mit zwei Zuständen rendern, Karten mit Zustand müssen `triggers_update` haben | nein | – |
| R17 | Popup-Breite 900/920 bzw. begründet schmal | statisch über `popup_styles` aller `casora_popup` | nein, klein | Liste der schmalen (460/552/620/680) mit Grund |
| R18 | Leistung: Zähler im Gate | `leistung.mjs --grenzen` als Gate-Schritt (nur Zähler) | ja | ruhiger Rechner nur für Zeiten |

Reihenfolge-Empfehlung: R6, R7 (sofort, Werkzeug fertig) → R1 (nur harte Arten) → R8, R11, R14, R17
(kleine statische Sperrklinken) → R2–R5, R10 nach den offenen Entscheidungen.
