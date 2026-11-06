# Auftrag: Popup-Rework v3 „Bühne“ – alle Popups in einer Nacht

Arbeitsanweisung für eine eigene, unbeaufsichtigte Claude-Code-Sitzung (Stand 28.10.2026). Ersetzt Phase 2 von
[popup-rework-auftrag.md](popup-rework-auftrag.md): die Wahl ist gefallen – **Richtung 1 „Bühne“** für alle Popups.

Ziel in einem Satz: **Jedes Casora-Popup ist nach den [Popup-Richtlinien v3](popup-richtlinien-v3.md) gebaut** –
schlanker Kopf, eine Bühne, Schnellwahl, gruppierte Listen – aus gemeinsamen Bausteinen, ohne eigene Abstände,
Köpfe oder Platten je Popup.

Die Sitzung läuft ohne Rückfragen. Alles, was sie entscheiden müsste, steht hier oder in den Richtlinien; fehlt etwas
trotzdem, gilt §8 („Wenn etwas nicht passt“), nie eine eigene Designidee.

---

## 0. Die wichtigste Regel: Kein Inhalt geht verloren

Der Umbau **ordnet um, er entscheidet nicht neu**. Jede Information und jede Bedienung, die ein Popup heute zeigt, ist
nach dem Umbau noch da – höchstens an anderer Stelle (Bühne, Schnellwahl, Liste, Unterseite, „Mehr“).

1. **Inhaltsliste vorher**: Bevor ein Popup angefasst wird, schreibt die Sitzung `.qa/v3/inhalt/<popup>.vorher.md`:
   jeder sichtbare Wert, jeder Schalter, jede Aktion, jede Zeile, jede Unterseite, der Inhalt von „Mehr“, Einträge im
   Halten-Menü, Rückfragen – je Zustand (an / aus / nicht erreichbar, einzeln / Gruppe, mit / ohne optionale Entitäten).
2. **Inhaltsliste nachher**: `.qa/v3/inhalt/<popup>.nachher.md` mit derselben Liste und dem neuen Ort je Eintrag.
3. **Maschinell gegenprüfen**: `dev/qa/popup-inhalt.mjs` (neu, Phase 1) liest im offenen Popup alle Bedien- und
   Wertstellen aus – `data-casora-svc`, `data-casora-mi`, `data-casora-page`, `data-casora-go`, Schalter (`role="switch"`),
   Regler, `data-casora-live` mit Entität und Attribut – und schreibt sie als sortierte Liste. Vorher (auf
   `popup-rework-varianten` bzw. mit `localStorage casora_popup_variant='a'`) und nachher vergleichen: **jede fehlende
   Stelle ist rot**, außer sie steht in der Erlaubt-Liste unten.
4. **Darf wegfallen (Erlaubt-Liste, abschließend)**: die Symbol-Kachel im Kopf · eine doppelte Anzeige desselben Werts,
   wenn er an anderer Stelle sichtbar bleibt · die alte Aktionen-Reihe, wenn dieselbe Aktion in der Bühne sitzt · ein
   eigener Kopf im Inhalt · feste Farben. Alles andere bleibt.
5. **Nichts Neues aus dem Nichts**: Neue Zeilen nur aus Entitäten, die das Popup heute schon liest oder über die
   vorhandene Gerätesuche (`casoraDevice`, bestehende Zuordnungen im Modul) findet. Inhalte aus den Mockups
   („Kindersicherung“, „Ventil 64 %“, „Nächster Wechsel“) sind **Beispiele**: sie erscheinen nur, wenn das Gerät die
   Entität hat und das Popup sie schon kennt – sonst nicht, und keine neue Logik dafür.
6. **Gleiche Dienste, gleiche Rückfragen**: Ein Tipp ruft danach denselben Dienst mit denselben Daten wie vorher;
   „Vor dem Schalten fragen“ und `confirm` bleiben.
7. **Passt etwas nirgends hin**: in „Mehr“ legen, nie streichen, und im Inhaltsvorschlag (§10) begründen.

---

## 1. Pflichtlektüre (in dieser Reihenfolge, vor dem ersten Commit)

1. `CLAUDE.md` (Stil, Vorlagen bauen, Prüfungen, nichts Persönliches, was nicht angefasst wird).
2. [popup-richtlinien-v3.md](popup-richtlinien-v3.md) – **die** Designsprache. Bei Widerspruch gewinnt sie.
3. [popup-blaupause.md](popup-blaupause.md) – Zeilenarten, Unterseiten, Einstellungen, Mehr, Leer, Breite, Symmetrie
   (gelten weiter, siehe Richtlinien §15) und die Bausteine in `window._casoraUI`.
4. [design-regeln.md](design-regeln.md) – Tokens, 4er-Raster, Schatten nur aus Variablen.
5. [blaupause-popup.md](blaupause-popup.md) (Dateien, Hauptschalter-Haken, Breite), [regeltests.md](regeltests.md),
   [test-und-release.md](test-und-release.md), [wortliste.md](wortliste.md).
6. Commit `Popup rework variant B` auf `popup-rework-varianten`: so sind die `--casora-pv-*`-Tokens gebaut
   (`:host([soft][data-casora-pv="b"])` in `casora-core.js`, `softGroup`, `segments`, `.lps-rows` in `03-popups.js`).

## 2. Rahmen

- **Zweig** `popup-v3` von `popup-rework-varianten` (der Zweig mit Variante B), eigener Worktree.
- **Nicht** pushen, **nicht** in Prod kopieren, **keine** GitHub-Kommentare, Issues oder Releases, Version,
  `CHANGELOG*`, „Neu“-Popup nicht anfassen (CLAUDE.md „Nicht anfassen“).
- **Ein Commit pro Baustein bzw. pro Popup**, Nachricht englisch: `Popup v3: <Popup> – stage S<n>, quick <…>`.
- **Vor jedem Commit**: `node --check` der geänderten JS-Dateien · `python3 tools/build-templates.py` (wenn die
  Vorlagen-Quelle geändert ist) · `node dev/qa/check-templates.mjs` (0) · `node tools/html-escape-check.mjs` (0) ·
  `python3 tools/i18ncheck.py` · `node dev/unit/popup_blaupause.mjs` · `node dev/unit/popup_v3.mjs` ·
  `node dev/unit/design_zaehler.mjs` · `node dev/unit/vorlagen_regeln.mjs`. Rot = nicht committen, erst beheben.
- **Test-HA**: `dev/haus.sh arbeit`, nach Änderungen `dev/haus.sh sync --if-changed`. Bilder und Messungen über die
  vorhandenen Werkzeuge (§6), keine neuen Screenshot-Skripte.
- **Kostendeckel**: wird beim Start gesetzt. Bei 80 % den laufenden Popup fertig machen, Bericht schreiben, anhalten.

## 3. Phase 1 – Bausteine (zuerst, alles andere hängt daran)

Alles in `custom_components/casora/scripts/casora-core.js`, Kommentare englisch.

### 3.1 Rahmen-Schalter `variant: 'v3'`

- Den vorhandenen Schalter (`data-casora-pv`, gesetzt in `open()` aus `cfg.variant`, `localStorage casora_popup_variant`)
  um den Wert `v3` erweitern. `casoraPopup.sub` erbt schon.
- `:host([soft][data-casora-pv="v3"])` bekommt **alle** Tokens von Variante B (Selektor-Liste
  `:host([soft][data-casora-pv="b"]), :host([soft][data-casora-pv="v3"])`) plus die v3-Tokens aus Richtlinien §14.
- **Kopf ohne Symbol-Kachel**: im v3-Host die Kopf-Kachel ausblenden (`.header-ring` bzw. die Kachel der Kopfzeile A,
  `display:none`), Titel 24/800 (Handy 22), Etikett/Statuszeile wie Richtlinien §3, ✕ 40, Abstand Kopf → Inhalt 20.
  Der Hauptschalter bleibt wie er ist (Haken `_casoraHeadSwitchHooks`).
- Ohne `v3` ändert sich nichts (Rückfallwerte = heute).

### 3.2 `UI.stage(type, o)`

Gibt die Bühnen-Platte als HTML zurück (Radius `--casora-v3-stage-radius`, Innenabstand `-stage-pad`,
Abstand `-stage-gap`, Fläche `--casora-soft-row-fill`), Markierung `data-casora-stage="S<n>"`.
Die Bedienteile **wiederverwenden** die vorhandene Live- und Dienst-Logik (`data-casora-live`, `data-casora-svc`,
`UI.slider`, `.lps-bar`-Ziehen, Thermostat-Feld, `UI.actions`):

| type | o | Inhalt |
|---|---|---|
| `slider` (S1) | `{ value, word, unit:'%', icon, svc, live, seg: [items] }` | senkrechter Regler + Wert + Wort + optional `UI.segments(seg)` |
| `value` (S2) | `{ caption, value, unit:'°', minus: svc, plus: svc, foot, live }` | − Wert + und Fußzeile; vorhandene Thermostat-Leiste darf darunter |
| `position` (S3) | `{ value, word, svc, live, invert }` | Grafik zum Ziehen + Wert |
| `progress` (S4) | `{ value, word, progress: 0–1, program, action: {text, sub, svc, primary} }` | Restzeit/Zustand, Balken 8, Programm, Pille |
| `image` (S5) | `{ html }` | fertiges Bild-/Player-HTML des Moduls in der Platte |
| `chart` (S6) | `{ value, unit, trend, chart: html, range: [items] }` | Wert + Trend + Diagramm-HTML (vorhandenes `_hpChart*`, Höhe 160/Handy 140, `readout: 'hero'`) + Zeitraum-Segment „24 Std. · 7 Tage · 30 Tage“ |
| `status` (S7) | `{ tone: 'good'\|'warn'\|'bad', icon, text, facts: [{label, value}], action }` | Symbol 64 in Ampelfarbe, Satz, ≤ 3 Kennzahlen, eine Pille |
| `content` (S8) | `{ html }` | eigener Hauptbereich des Moduls in der Platte |

**Senkrechter Regler (S1)**: Ziehen (Pointer Events, `touch-action:none` nur auf dem Regler), Tippen, Tastatur
(Pfeile ±1, Bild ±10), `role="slider"`, Dienst beim Loslassen – Verhalten wie `.lps-bar` heute.
**Wenn er bis Ende Phase 1 nicht in WebKit und Chrome sauber läuft**: S1 mit dem waagrechten Balken
(`.lps-bar`-Logik, 72 hoch, volle Bühnenbreite) bauen, im Bericht melden – kein halbfertiger Regler.

### 3.3 `UI.quick(items, label)`

Schnellwahl nach Richtlinien §5: `items: [{ icon, text, sub, active, svc, confirm }]`, 2–4 Kacheln, bei mehr als 4
die ersten 3 + „Alle (n) ›“ (`page`). `danger` ist nicht erlaubt (Regeltest).

### 3.4 Layout

- `HH.layout` (`02-devices.js`) und `_casoraSoftKit.layout` (`05-weich-mehr.js`): neue Felder `stage` und `quick`;
  beide stehen oben in der linken Spalte, danach `left`, rechts `right`, `settings`, `more` wie heute.
  Eine Spalte (552), wenn rechts nichts außer `more` steht (wie heute B-11). Bild-Bühne (S5): `stage` über beide Spalten.
- Popups mit eigenem Aufbau (Licht `03-popups.js` `.lps-*`, Medien, Kamera) setzen dieselbe Reihenfolge selbst um,
  mit `UI.stage`/`UI.quick` statt eigener Platten.

### 3.5 Regeltest `dev/unit/popup_v3.mjs` + `dev/unit/popup_v3_offen.json`

Statisch, ohne HA, Stil wie `popup_blaupause.mjs` (Sperrklinke: Zahlen dürfen nur sinken):
1. Bausteine da: `UI.stage` (alle 8 Typen), `UI.quick`, `variant: 'v3'` im Rahmen, v3-Host-Selektor.
2. Jede Vorlage/jedes Modul in der Liste `migriert` setzt `variant: 'v3'` und ruft `UI.stage` genau einmal je Popup-Art.
3. `UI.quick` nie mit `danger`; nie mehr als 4 Kacheln im Aufruf.
4. Diagramme (Richtlinien §7): in migrierten Dateien keine Hex-Farbe im `_hpChartCfg`-Aufruf, Höhen nur 120/140/160.
5. Keine eigene Bühnen-Platte (Radius 32 + `soft-row-fill` außerhalb von `UI.stage`) in migrierten Dateien.
6. `popup_v3_offen.json` listet die noch nicht umgebauten Popups mit Grund; leer = fertig.

### 3.6 Inhaltsvergleich `dev/qa/popup-inhalt.mjs`

Werkzeug nach §0.3 im Stil der übrigen `dev/qa/*.mjs` (Playwright, `CASORA_URL`, `--dash`, `--nur <popup>`,
`--views desktop,handy`): öffnet das Popup wie `popup-raender.mjs`, geht durch alle Shadow-DOMs, schreibt
`.qa/v3/inhalt/<popup>.<variante>.json` und vergleicht mit `--vergleich a v3` (Ausgabe: fehlt / neu / gleich, Rückgabe ≠ 0 bei
„fehlt“ außerhalb der Erlaubt-Liste). Unterseiten und „Mehr“ werden aufgeklappt mitgezählt.

Erst wenn Phase 1 grün ist: Commit `Popup v3: building blocks (stage, quick, head, layout, rule test)`.

## 4. Phase 2 – Pilot (die drei Mockup-Popups)

Licht (Raum), Fußbodenheizung (Haus) und Jalousien (Raum) nach den Bildern in Richtlinien §17 umbauen,
`variant: 'b'` → `'v3'`. Dann für alle drei **Bilder und Messung** (§6). Weicht das Ergebnis sichtbar von den Mockups ab,
erst die Bausteine korrigieren, dann weiter – die Pilot-Popups sind das Maß für alle anderen.

## 5. Phase 3 – alle Popups (Reihenfolge = Priorität)

Pro Popup die Schritte aus §7. Typ und Schnellwahl stehen fest; „–“ heißt keine Schnellwahl.
Nicht geschafft? Eintrag in `popup_v3_offen.json` mit Grund, weiter mit dem nächsten.

### Welle 1 – Pilot (Phase 2)

| Popup | Vorlage / Modul | Bühne | Schnellwahl | Liste rechts |
|---|---|---|---|---|
| Licht (Raum, Haus, Leuchte aus der Gruppe) | `casora_popup_light`, `03-popups.js` (`.lps-*`) | S1 Helligkeit, Segment Lichtfarbe | Szenen des Raums (≤ 4) | „Leuchten · n von m an“, Einstellungen |
| Fußbodenheizung (Haus/Raum) | `casora_popup_fbh`, `03-popups.js` (`_casoraFbh`) | S2 Ziel aller Räume bzw. Ziel des Raums (Ist-Wert in der Fußzeile); Raum aus der Liste = Unterseite nach Richtlinien §4.4 | Modus: Auto · Heizen · Eco · Aus | „Räume · n heizen“, Einstellungen, Mehr (Coach, Hauptschalter, Verlauf) |
| Jalousien (Raum/Gruppe) | `casora_popup_cover`, `34-security-covers.js` | S3 Position | Auf · Beschatten · Zu | „Jalousien“, Automatik + Einstellungen |

### Welle 2 – Geräte mit Bedienung

| Popup | Vorlage / Modul | Bühne | Schnellwahl |
|---|---|---|---|
| Leuchte (einzeln) | `casora_light`, `33-color-wheel.js` | S1, Segment Weißton; Farbrad als Unterseite „Farbe ›“ | Effekte/Szenen (≤ 4) |
| Thermostat | `casora_thermostat`, `03-popups.js` | S2 | Modi des Geräts (≤ 4) |
| Klima (Raum) | `casora_climate_popup`, `01-basis.js` | S2, sonst S6 Temperatur | Modi (≤ 4) |
| Klimaanlage Velair | `casora_popup_velair`, `31-velair.js` | S2 | Kühlen · Heizen · Lüften · Auto |
| Lüfter | `casora_fan` | S1 Stufe | Voreinstellungen (≤ 4) |
| Luftreiniger | `casora_air_purifier` | S6 Luftqualität | Auto · Nacht · Turbo (vorhandene Modi) |
| Luftbefeuchter | `casora_humidifier`, `19-befeuchter.js` | S2 Zielfeuchte | Modi (≤ 4) |
| Schalter | `casora_switch` | S7 Zustand + Verbrauch, falls vorhanden | – |
| Jalousie (einzeln) | `casora_cover` | S3 | Auf · Beschatten · Zu |
| Medien-Player | `casora_media`, `07-weich-spezial.js` | S5 Cover + Wiedergabe | Quellen (≤ 4) |
| Now Playing (Kachel/Chip) | `casora_now_playing_primary`, `casora_now_playing_chip` | S5 | Quellen (≤ 4) |
| Medien-Badge | `casora_popup_media`, `32-media-badge.js` | S5 des laufenden Players | – |
| Gerät allgemein | `casora_entity_actions`, `05-standard-medien.js` | Rückfallregel S7 | – |

### Welle 3 – Programme und Geräte mit Ablauf

| Popup | Vorlage / Modul | Bühne | Schnellwahl |
|---|---|---|---|
| Waschmaschine/Trockner | `casora_popup_laundry`, `casora_appliance`, `02-devices.js` | S4 | Programme (≤ 4) |
| Geschirrspüler | `casora_popup_dishwasher`, `02-devices.js` | S4 „Jetzt starten · Eco 50°“ | Programme (≤ 4); Startzeit als Segment in der Liste |
| 3D-Drucker | `casora_popup_3d_printer`, `02-devices.js` | S4 | – |
| Saugroboter | `casora_vacuum`, `02-devices.js` | S4 | Ganze Wohnung · Räume › · Zur Station |
| Mähroboter | `casora_popup_lawn_mower`, `16-maeher.js` | S4 | Mähen · Pause · Zur Station |
| Kaffeevollautomat | `casora_popup_coffee`, `25-coffee.js` | S8 Getränke-Raster (eigener Hauptbereich) | – |
| Kühlschrank | `casora_popup_fridge`, `30-fridge.js` | S2 Kühlen, zweites Fach in der Liste | – |
| Aquarium, Becken, Aquarium-Licht | `casora_aquarium`, `casora_popup_aquarium_tank`, `casora_aquarium_light`, `02-devices.js` | S6 Wassertemperatur bzw. S1 Licht | – |
| Fahrzeug | `casora_popup_car`, `03-popups.js` | S7 Reichweite/Akku | – |
| E-Bike | `casora_popup_ebike`, `03-popups.js` | S7 Akku | – |
| Haustier | `casora_popup_pet`, `26-haustier.js` | S7 | – |

### Welle 4 – Zustand und Sammel-Popups

| Popup | Vorlage / Modul | Bühne | Schnellwahl |
|---|---|---|---|
| Sicherheit (Badge, Gruppe) | `casora_badge_security`, `casora_badge_security_group`, `35-phone-hub.js` | S7 „Alles zu“ / „n offen“ | – (Hauptaktion „Alle schließen“ in der Bühne) |
| Türen & Fenster | `casora_popup_contacts`, `34-security-covers.js` | S7 | – |
| Jalousien in Sicherheit | `casora_popup_security_covers`, `34-security-covers.js` | S7 „Alle schließen“ | – |
| Schloss (Popup + Ansicht = eins, v2 Entscheidung 1) | `casora_popup_lock`, `13-schloss.js` | S7, „Verriegeln“ gefüllt, „Entriegeln“ ungefüllt mit Rückfrage | – |
| Alarmanlage | `casora_popup_alarm`, `07-weich-spezial.js` | S7, Hauptaktion mit Rückfrage | Abwesend · Zuhause · Nacht (Scharf-Modi; „Aus“ nur als Bühnen-Aktion) |
| Updates | `casora_popup_updates`, `03-popups.js` | S7 „n Updates“ + „Alle aktualisieren“ | – |
| Netzwerk | `casora_network`, `casora_popup_network`, `01-basis.js` | S7 | – |
| Person / Anwesenheit | `casora_popup_person`, `15-person.js`, `casora_badge_presence_group` | S7 | – |
| Klima-Gruppe (Badge) | `casora_badge_climate_group`, `35-phone-hub.js` | S7 | – |
| Batterien | `casora_popup_battery`, `08-weich-kompakt.js` | S7 „Alle OK“ / „n schwach“; Diagramm-Auswahl bleibt (v2 Entscheidung 3) | – |
| Wetterwarnung | `casora_popup_weather_warning`, `01-basis.js` | S7 in Warnfarbe | – |
| Lüften-Coach | `casora_popup_vent`, `05-standard-medien.js` | S7 | – |
| Pulse | `casora_popup_pulse`, `14-pulse.js` | S7 | – |

### Welle 5 – Verlauf, Bild, Inhalt

| Popup | Vorlage / Modul | Bühne | Schnellwahl |
|---|---|---|---|
| Energie (mit Energiefluss) | `casora_popup_energy`, `20-energie-fokus.js` | S6: Wert „Jetzt“ + Energiefluss-Karte als Diagramm | Haus · Solar · Netz · Akku (Unterseiten) |
| Diagramm-Kachel | `casora_popup_chart`, `27-chart.js` | S6 | – |
| Messwertseite / Geräteseite | `18-ziele.js` (`casoraRoute`) | S6 bzw. S7 | – |
| Pflanze | `casora_popup_plant`, `01-basis.js` | S6 Feuchte | – |
| Wetter | `casora_weather`, `01-basis.js` | S6 Temperatur + 7-Tage-Platte in der Liste | – |
| Kamera | `casora_popup_camera`, `07-weich-spezial.js` | S5 (900) | – |
| Klingel | `casora_popup_reolink_doorbell`, `24-klingel.js` | S5, Verlauf gleich danach (v2 Regel 5) | – |
| Frigate | `casora_popup_frigate`, `23-frigate.js` | S5, Hauptschalter „Erkennung“ | – |
| Kalender | `casora_popup_calendar`, `06-kalender.js` | S8 | – |
| Abfall | `casora_trash`, `06-kalender.js` | S8 Monatsraster (bleibt) | – |
| Fußball | `casora_popup_football`, `11-fussball.js` | S8 Tabelle | – |
| Rezepte | `casora_popup_recipe`, `03-popups.js` | S5 Bild des Rezepts | – |
| Freie Kachel / eigenes Badge | `casora_popup_free`, `28-free-tile.js`, `29-eigene-badges.js` | Rückfallregel S7 | – |
| Liste von Entitäten / „Mehr“ | `casora_popup_entity_list`, `casora_popup_more`, `34-entity-list.js` | S8 | – |

**Bleiben Menüs, kein Umbau**: Glocke, Halten-Menü (`22-halten.js`), Szenen-Blatt (`08-weich-szenen.js`),
Räume-Menü. Sie nehmen nur dieselben Wörter.

## 6. Bilder und Messung (je Popup, im Test-HA „arbeit“)

1. `dev/haus.sh sync --if-changed`.
2. Bilder: `CASORA_URL=http://localhost:8124 node dev/qa/matrix-bilder.mjs --matrix .qa/v3 --haus arbeit --gruppe popups --geraete desktop,handy --nur '<popup>' --neu`
   – Desktop 1440 und Handy 393 (WebKit), hell **und** dunkel.
3. Messung: `node dev/qa/popup-raender.mjs --geo` (nichts abgeschnitten, Ringe/Radien/Etiketten, Kontrast) und
   `--spalten` (Breite 552/900, Spalten auf einer Linie).
4. Kein Springen und ✕ voll sichtbar: Regressionstests `r369` und Symmetrie `r357` (`dev/qa/regress/`) für die
   umgebauten Popups laufen lassen.
5. Vorher-Bild: dieselben Befehle einmal vor dem Umbau auf `popup-rework-varianten` (oder
   `localStorage casora_popup_variant='a'`) – für den Bericht.

## 7. Schritte je Popup (Definition of Done)

- [ ] Code des Popups gelesen (Vorlage **und** Modul), vorhandene Bedienlogik und Live-Werte notiert.
- [ ] Inhaltsliste vorher geschrieben (§0.1) und `popup-inhalt.mjs` für Variante `a` gelaufen.
- [ ] Bühne nach Tabelle §5 mit `UI.stage`; alter Hauptbereich (`UI.hero`, eigene Platte, `UI.actions`-Reihe) entfernt –
      nichts doppelt (Zustand nur Wort im Kopf + Wert auf der Bühne).
- [ ] Schnellwahl mit `UI.quick`, höchstens 4, nichts Gefährliches.
- [ ] Diagramme nach Richtlinien §7: höchstens eins außerhalb von „Mehr“ (Bühne S6 **oder** Abschnitt „Verlauf“ 120 hoch),
      Fachwerte in „Mehr“, Farben aus `--casora-color-*`/Gerätefarbe statt Hex, Zeitraum nach §7.2.
- [ ] Listen über `UI.section`/`UI.row.*`; Reihenfolge Bedienung → Zustand → Verlauf → Einstellungen; Zähl-Überschrift
      wo sinnvoll („Räume · 2 heizen“).
- [ ] „Weitere Einstellungen“ als letzte Zeile, „Mehr“ höchstens einmal ganz unten.
- [ ] Layout: Bühne + Schnellwahl links, Listen rechts; Breite über `casoraPopupWidth` (552/900).
- [ ] `variant: 'v3'` in der Vorlage (alle `casora_popup` der Vorlage: tap **und** hold) bzw. im `casoraPopup.open`.
- [ ] Aus, offline, leer geprüft (Richtlinien §4.5) – im Test-HA oder mit Mock-Zuständen.
- [ ] Neue Texte deutsch im Code + englisch in `phrases/en.json`, `i18ncheck` grün.
- [ ] Prüfungen aus §2 grün, Eintrag in `popup_v3.mjs`-Liste `migriert`, aus `popup_v3_offen.json` gestrichen.
- [ ] Bilder + Messung (§6) ohne neue Befunde.
- [ ] Inhaltsliste nachher (§0.2), `popup-inhalt.mjs --vergleich a v3` ohne „fehlt“ außerhalb der Erlaubt-Liste (§0.4).
- [ ] Inhaltsvorschlag für das Popup notiert (§10.6) – nur vorschlagen, nicht umsetzen.
- [ ] Commit, eine Zeile im Bericht.

## 8. Wenn etwas nicht passt

| Lage | Vorgehen |
|---|---|
| Popup passt in keinen Typ | Rückfallregel S7 (Richtlinien §4.7), Grund in den Bericht |
| Bedienlogik müsste neu geschrieben werden (nicht nur umgeordnet) | Popup überspringen, Eintrag in `popup_v3_offen.json` „braucht neue Logik: …“ |
| Ein bestehender Test wird rot, weil er altes Markup prüft | Test an die Richtlinien anpassen **nur**, wenn er Aussehen prüft; prüft er Verhalten (Dienst, Live-Wert, Rückfrage), ist der Umbau falsch |
| WebKit verhält sich anders als Chrome | WebKit gewinnt; ohne Lösung: Popup zurück auf `variant: 'b'`, Eintrag in offen |
| Mehr als 45 Minuten an einem Popup | Stand verwerfen (`git checkout -- .`), Eintrag in offen, nächstes Popup |
| Ein Inhalt passt in keinen Teil des neuen Aufbaus | in „Mehr“ legen, nie streichen (§0.7) |
| Ein Inhalt wirkt überflüssig oder es fehlt etwas Sinnvolles | **nicht** ändern – in den Inhaltsvorschlag (§10.6) |
| Etwas würde die Richtlinien ändern | **nicht** ändern – Vorschlag in den Bericht, Abschnitt „Fragen an den Maintainer“ |

## 9. Was nicht kaputtgehen darf

- Kein Springen beim Öffnen, ✕ immer voll sichtbar (WebKit!), Symmetrie zweier Spalten.
- Hell und dunkel; Themes Standard und Glas bleiben beim alten Aufbau (v3 nur im Weich-Rahmen).
- Fahrenheit, 8 Sprachen, „Vor dem Schalten fragen“, Nutzer ohne Admin (kein Studio-Link).
- Ampelfarben für Zustände (grün/orange/rot, „Achtung“-Ton für offen/entriegelt) wie seit 26.10.63.
- Ein Popup pro Ding: Kachel, Badge, Unter-Badge öffnen dieselbe Konfiguration.
- Kein Inhalt geht verloren (§0) – jede Bedienung und jeder Wert von vorher ist erreichbar.

## 10. Abgabe am Morgen

`.qa/popup-v3-bericht.md` (nicht committen, `.qa/` ist ignoriert):

1. **Kurz**: wie viele Popups umgebaut / offen, letzter grüner Commit.
2. **Tabelle**: Popup · Typ · Commit · Bilder (Pfad unter `.qa/v3/`) · Befunde.
3. **Offen**: Inhalt von `popup_v3_offen.json` mit Grund.
4. **Fragen an den Maintainer**: kurz, mit Bild, Empfehlung zuerst.
5. **Wie einspielen**: Zweig, `dev/haus.sh sync`, Vergleich über `localStorage casora_popup_variant = 'a' | 'v3'`.
6. **Inhaltsvorschläge** (eigene Datei `.qa/popup-v3-inhaltsvorschlaege.md`, Grundlage für die nächste Runde): je Popup
   eine Tabelle, was der Maintainer entscheiden soll – **nichts davon ist umgesetzt**. Spalten und Wörter fest:

   | Inhalt | Heute | Vorschlag | Grund (ein Satz) |
   |---|---|---|---|
   | … | wo es heute steht | **Pflicht** · **Wenn vorhanden** · **Nach „Mehr“** · **Raus** · **Neu (braucht Logik)** | … |

   Beispiel (Format, keine Entscheidung) – Fußbodenheizung, Raum:

   | Inhalt | Heute | Vorschlag | Grund |
   |---|---|---|---|
   | Zieltemperatur ± | Bühne | Pflicht | Hauptgrund, das Popup zu öffnen |
   | Ist-Temperatur | Statuszeile + Liste | Pflicht (nur Bühnen-Fußzeile) | steht heute doppelt |
   | Luftfeuchte | Liste | Wenn vorhanden | nur mit Feuchte-Sensor sinnvoll |
   | Batterie | Liste | Nach „Mehr“ | selten gebraucht, Warnung kommt ohnehin über die Glocke |
   | Nächster Zeitplan-Wechsel | – | Neu (braucht Logik) | beantwortet „wann wird es wärmer?“, braucht Lesen des Zeitplans |

   Am Ende eine Liste „Quer über alle Popups“ (z. B. „Batterie überall nach Mehr“), damit der Maintainer gleiche Fragen
   einmal entscheidet. Danach anhalten – umgesetzt wird erst nach seiner Freigabe in einer eigenen Sitzung.

Danach Handbuch nachziehen: [popup-blaupause.md](popup-blaupause.md) bekommt oben einen Hinweis „Aufbau seit v3:
popup-richtlinien-v3.md“, [blaupause-popup.md](blaupause-popup.md) §1 die neue Anatomie, [regeltests.md](regeltests.md)
den Test `popup_v3.mjs`. Version, Changelog und „Neu“-Popup bleiben dem Release.

## 11. Start der Sitzung

Im Repo-Ordner auf dem Rechner mit Test-HA (`~/casora-haus`), Modell und Ausgabenlimit wie beim Maintainer üblich:

```
Lies docs/handbuch/popup-rework-v3-auftrag.md und führe ihn vollständig aus.
```
