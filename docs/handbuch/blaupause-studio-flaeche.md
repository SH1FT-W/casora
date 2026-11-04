# Blaupause: neue Studio-Fläche

Das Studio ist das Panel unter `custom_components/casora/panel/casora-panel*.js` (20 Dateien, eine Klasse,
Teile hängen sich als `P._name = function …` an den Prototyp). Es ist bewusst ein **Werkzeug**: eigene
Token, eigene Schriftskala.

> **OFFEN – Entscheidung Maintainer (Studio-Sprache):** A iOS-nah (SF im Inspektor, Radien 8/12/18/26) /
> B Casora-Sprache (Inter, Radien 12/18/24/32, Sand-Platten). Bis zur Wahl: nur die vorhandenen
> Studio-Token unten verwenden – dann ist ein späterer Wechsel eine Token-Änderung, kein Umbau.

## 1. Welche Fläche – welcher Weg

| Fläche | Wie | Vorbild |
|---|---|---|
| Einstellung | Block in einer der acht Kacheln: Eintrag in `NEU` (`casora-panel-settings.js`): `{ k, title, plain, kw, personal \| opt \| sec \| page, adv? }` (Regeln in Abschnitt 3) | „fuel“ (Tanken), „vent“ (Lüften-Push) |
| Abschnitt im Inspektor / Dashboard-Einstellungen | `SECS` in `casora-panel-b.js` bzw. `casora-panel-b-mehr.js` | „Scenes“, „Now Playing“ |
| Kachel-Felder | `fields: [ICON, TITLE, …]` am `TILE_TYPES`-Eintrag (`casora-panel-types.js`) | `casora_pulse` |
| Ablauf in Schritten (Assistent, Umzug) | `this._flowScreen({ full, icon, title, step: [n, m], lede, back })` → `s.body`, `s.acts`; Knopf `this._flowButton(s.acts, "Continue", fn)` | `_fillStep` in `casora-panel-basis.js` |
| Rückfrage | `await this._ask({ title, message, icon, picks, check, wide, confirmLabel, extend })` | „Open on phone“ in `casora-panel-b-mehr.js` |
| Suche („Wo finde ich …“) | Aktion `A(id, label, wörter, run, ok, way(…))` in `_mSearchItems` (`casora-panel-b-mehr.js`); jeder Block der Einstellungen erscheint dort von selbst (aus `window.casoraSettingsMap`) | „askfirst“, „ventpush“ |
| Neue Panel-Datei (selten) | Datei anlegen **und** in `__init__.py` an beiden Stellen eintragen (`_stamp()`-Liste und `_write_loader()`-Imports) | – |

## 2. Token des Studios (nur diese verwenden)

Definiert im Panel-Stil (`casora-panel.js`, „Schrift- und Eckensystem des Studios“):

| Token | Wert |
|---|---|
| Schrift | `--t-large 34` · `--t-title 22` · `--t-body 17` · `--t-callout 15` · `--t-foot 13` · `--t-caption 12` |
| Radien | `--r-s 8` · `--r-m 12` · `--r-l 18` · `--r-xl 26` · Gruppe `--r-group` |
| Abstände | `--gap 18` · `--card-pad-h 16` · Zeile `--head-row 26` |
| Feldhöhe | `--k-h` (40 bzw. 46 am Handy); Einstellungszeilen min. 44 px (`r19_einstellungen_feldgroesse`) |
| Farben | `--casora-studio-*` aus dem Theme: `ink`, `cap`, `accent`, `done`, `chip`, `field`, `pane`, `sw-on/off`, `shadow` … |
| Symbolfarbe | `I().studioIcon(tone)` aus der zentralen Tabelle `STUDIO_ICON` (`casora-panel.js`) |

**Jede neue Farbe gilt für hell und dunkel**: Theme-Variablen `--casora-studio-*` in `modes: light` und
`modes: dark` von `theme_weich.yaml` (danach `python3 tools/build-nebel-theme.py` – `theme_nebel.yaml` wird
daraus erzeugt, nie von Hand bearbeiten); Studio-eigene Variablen, die nur im hellen Zweig
(`:host(.is-light)`) gesetzt werden, brauchen einen dunklen Rückfallwert. Sonst erscheint die Fläche im
Dunkeln hell mit heller Schrift (per-04, Test `studio_toast_dunkel.mjs`).


## 3. Einstellungen: acht Kacheln (seit 03.11.2026)

Eine Startseite mit Suche und acht Kacheln, nach dem benannt, was man tun will: Aussehen · Bedienen · Handy ·
Glocke & Meldungen · Haus & Geräte · Wetter, Strom & Tanken · KI · Updates & Einrichtung. Die Themen von 26.10.
mit ihren Unterseiten gibt es nicht mehr.

- **Höchstens zwei Ebenen:** Start → Kachel. Seltenes steht in der Kachel unter „Erweitert“ (zugeklappt, erst beim
  Öffnen gezeichnet). Keine dritte Ebene, keine Liste, die auf eine weitere Seite führt (Ausnahme: Updates).
- **Jede Kachel** hat eine kurze Zeile (auf dem Handy höchstens zwei Zeilen), **jeder Block** einen Titel und einen
  einfachen Satz, was man dort tut, **jede Einstellungszeile** einen kurzen Satz darunter (bei Listen: die erste
  Zeile). Für Laien: keine Fachwörter (Entität, Helfer, Template, YAML), Wörter nach der Wortliste.
- **Was nur dieses Dashboard betrifft**, steht als Block in der Kachel mit dem Schild „Nur dieses Dashboard“ und
  wird vom Studio selbst gezeichnet (`_csDashCard`) – kein Sprung in den Inspektor.
- **Ein Raster** (04.11.2026): Blocküberschrift, Satz, Platte und Hinweis darunter stehen auf derselben linken und
  rechten Kante wie der Block; Einleitung der Seite, „‹ Einstellungen“ und „Erweitert“ ebenso. Eine Plattenfarbe und
  ein Radius für alle Platten (`--casora-popup-row-fill`, Radius `--r-group` wie im Kachel-Editor), Zeilen 10 px innen. Keine Karte
  in der Karte, keine zweite Überschriftenebene (die erste Gruppenüberschrift entfällt, weitere Gruppen sehen aus wie
  die Blocküberschrift), ein Hinweis zu einer Zeile steht in der Platte unter ihr, kein Satz wird mit „…“ gekürzt.
  Die Styles stehen zentral in `casora-panel-settings.js` (`.cn-block`), nicht je Block; Test
  `dev/qa/regress/r545_settings_grid.mjs` (alle Kacheln, „Erweitert“ und innere Ausklapper offen, 1440/1180/820/393).
- **Gespeichert** wird über eine Leiste für alles; Verlassen mit Ungespeichertem fragt.
- **Alte Wege** (Seiten-IDs wie `home`, `alerts`, Themen `t-*`, Fokus wie `security`) führen über `ROUTE` /
  `FOCUS_BLOCK` zur Kachel und zum Block – Sprünge aus dem Studio, der Glocke und gespeicherte Links bleiben gültig.
- **Neue Einstellung:** Block in die passende Kachel, Texte in alle Sprachen, `dev/unit/settings_map.mjs` grün
  (nichts verloren, jeder alte Weg führt an), Durchklick-Test `r480_settings_tiles`.

## 4. Texte

- **Studio-Code schreibt Englisch** (`tr("Fuel prices")`), die deutsche Fassung steht in
  `translations/panel/de.json`. Titel/Knöpfe englisch in Title Case, Hinweise in Satzschreibung.
- Wörter laut [wortliste.md](wortliste.md): Kachel (tile), Popup, Badge, Raum, Studio (nie „Studio B“),
  Sicherung, Entfernen vs. Löschen, du-Form.
- Werte, die nicht übersetzt werden dürfen (Namen, URLs): `data-no-i18n` am Element.
- Danach `python3 tools/i18ncheck.py`.

## 5. Verhalten

- **Ungespeichertes nicht verlieren**: Verlassen mit offenen Änderungen fragt nach (Fund per-08).
- Speichern über die vorhandene Speicherleiste/„Fertig“; Rückmeldung als Studio-Meldung.
- Rückgängig/Zeitreise wirken auf alles, was die Fläche ändert.
- Laden sichtbar machen (Zeitreise leer ohne Ladehinweis war ein Fund, per-11).
- Enter wählt in Suchlisten den Treffer (per-22, für 1.4 vorgemerkt).
- Dialoge passen auf Tablet 1024/768 neben die HA-Seitenleiste (per-03).
- Integration fehlt → Fläche erklärt, was fehlt, statt leer zu bleiben.

## 6. Pflicht-Zustände

| Zustand | Erwartung |
|---|---|
| leer (kein Dashboard, keine Räume, keine Einträge) | erklärender Text, Weg zum Anlegen |
| viele Einträge / lange Namen | scrollt, `…`, nichts überlappt |
| Fehler vom Server (WebSocket wirft) | Meldung in der Oberflächensprache, nie „Unknown error“ (umzug-03) |
| Desktop 1440 · Tablet 1024/768 · Handy 393 | Dialoge vollständig sichtbar |
| hell / dunkel · Casora / Casora Nebel | Kontrast, Meldungen lesbar |
| Deutsch / Englisch | keine Mischsprache |
| Tastatur | Esc schließt, Tab-Reihenfolge sinnvoll |

## 7. Checkliste

- [ ] Nur Studio-Token (`--t-*`, `--r-*`, `--casora-studio-*`), keine neuen festen Farben/Schatten
  (`dev/unit/design_zaehler.mjs` grün)
- [ ] Neue Theme-Variablen hell + dunkel
- [ ] Texte englisch im Code, deutsch in `translations/panel/de.json`, `i18ncheck` grün
- [ ] Fläche über die Suche findbar (Suchwörter deutsch und englisch)
- [ ] `node --check` je Datei; Studio aus dem Checkout prüfen mit `CASORA_LOCAL=1`
- [ ] `dev/qa/ausrichtung.mjs --only <station>` ohne Fund (Symbole in Kreisen, Texte in Pillen, Radien)
- [ ] Unit-Test (`dev/unit/studio_*.mjs` als Vorbild), bei behobenem Fehler Regress-Test
- [ ] Panel-Änderung braucht in Prod einen HA-Neustart (siehe [test-und-release.md](test-und-release.md))
