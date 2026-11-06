# Blaupause: neues Popup

Was wo im Popup steht (Kopf, Hauptbereich, Aktionen, Abschnitte, Zeilenarten, „Weitere Einstellungen“, Mehr, Leer,
Breite): [popup-blaupause.md](popup-blaupause.md) – das Muster v2 gilt vor den Angaben hier.

Vorbild: Pulse-Popup (`casora_popup_pulse` + `scripts/local/14-pulse.js`) – auf dem Kern gebaut, ohne eigene
Klassen. Neubauten mit eigenen Baukästen (`csl-`, `ct-`, `cfb-`, `--cnp-*`) haben jeweils eine eigene
kleine Designsprache erzeugt – das nicht wiederholen.

## 1. Aufbau eines Casora-Popups

```
<casora-popup>  (casora-core.js, gemeinsamer Rahmen – nicht nachbauen)
 ├─ Kopf (Kopfzeile A, 1.3): Symbol-Kachel · Raum-Etikett · Titel · Statuszeile │ Hauptschalter · X
 ├─ hero    – Statuszeile (UI.line) – der Rahmen holt die erste .hui-line oben im Inhalt in den Kopf
 ├─ full    – Diagramm / Kamera / Karte über volle Breite (optional)
 ├─ left    – Bedienung: Modus (Überschrift „Modus“), Programme, Schalter, Aktionen
 └─ right   – Infos: Status, Messwerte, Verbrauch, Verlauf, „Mehr“
```

- Der **Kopf** kommt immer vom Rahmen (Kopfzeile A, Theme „Casora“): links die Symbol-Kachel 56/r16 (Handy 48/r14)
  aus der angetippten Kachel in deren Gerätefarbe, darüber klein der Raum (`_casoraRoomOf` der Kachel-Entität; nicht
  bei Sammel-Popups wie Batterien/Energie/Badges), Titel 28/800 (der Raumname wird aus dem Titel genommen), darunter
  die Statuszeile; rechts Hauptschalter und X. Nie einen eigenen Kopf in den Inhalt bauen (Fund DP-11).
- **Statuszeile**: die erste `UI.line`/`UI.hero({center})`/`UI.headline({barTitle})` oben im Inhalt – der Rahmen
  spiegelt sie live in den Kopf und blendet ihr Feld aus. Steht der Raum noch einmal darin, fällt er dort weg.
- **Hauptschalter** (ersetzt eigene „Alles aus“-/Ein-Aus-Knöpfe): bei `casora_switch|fan|air_purifier|humidifier`
  automatisch (Kachel-Entität), sonst per Vorlage `casora_popup.head_switch: { entities: [...] }` (oder `false`) oder
  per Modul-Haken `window._casoraHeadSwitchHooks.push(fn(src, hass) → null | [ids] | { entities, toggle(on, ids, hass),
  disabled })` (Beispiel Licht: `_casoraLightSoft.head`). „Vor dem Schalten fragen“ gilt.
- **Gerätefarbe** = `--casora-popup-accent` (vom Rahmen gesetzt): alle Schalter, Kopf-Kachel, aktive Symbole.
  Weicht der Zustand von der Kachelfarbe ab (Batterien „Alle OK“), setzt das Modul sie über
  `window._casoraRingHueHooks.push(fn(src, key) → farbe | { hue, off })` (DP-15).
- Titel über `casoraPopupTitle(this, variables, 'Standard', ['Aliasse'])` (eigener Popup-Titel →
  Kachelname → Standard).
- Breite (Muster v2, Regel 11): 552 einspaltig, 900 bei zwei Spalten oder Bild – über `window.casoraPopupWidth('one' | 'two' | 'image')`;
  `style` gewinnt über die 900/920 aus `popup_styles`.
- ≥ 761 px zwei Spalten, darunter eine Spalte in der Reihenfolge hero → full → left → right.

## 2. Dateien

| Teil | Datei |
|---|---|
| Inhalt (Abschnitte, Zeilen, Zählen) | Modul `scripts/local/NN-name.js`: `P.popup(states, hass, variables)` und `P.sec(part, C, states, hass)` |
| Öffnen + Stil | Vorlage `casora_popup_<name>` in `dashboards/casora/button_card_templates.json` (`tap_action.casora_popup`) |
| Kachel verbinden | Kachel-Vorlage erbt `"template": ["casora_entity", "casora_popup_<name>"]` |
| Texte | deutsch im Modul, englisch in `translations/dashboard/phrases/en.json` |
| Test | `dev/unit/<name>.mjs`; mit Test-HA ggf. `dev/qa/regress/rNNN_<name>.mjs` |

## 3. Bausteine (nicht neu bauen)

| Baustein | Wo | Wofür |
|---|---|---|
| `window._casoraUI` | `casora-core.js` | `line` (Statuszeile), `hero`, `headline`, `group(rows, label)` (Platten-Liste mit Etikett), `segments` (Modus-Leiste), `slider`, `note`, `legend`, `more`, `icon`, `esc`, `tokens` |
| `window._casoraSoftKit` | `05-weich-mehr.js` | `secCard(watch, code, states)` = Abschnitt mit eigenem `triggers_update`; `layout({fields, top, left, right, moveLeft})` = Kopf/Spalten wie oben; `chartCard`, `pill` |
| `window._casoraStd(ui, o)` | `05-standard-medien.js` | ältere Inline-Popups: dieselbe Spaltenaufteilung für ein fertiges button-card-Objekt (`o.top/full/left/right/single`) |
| `window._casoraSplit` | `05-standard-medien.js` | Spalten nach gemessener Höhe ausgleichen (macht `_casoraStd` selbst) |
| `window._casoraSelRows(html, aktiv)` | `01-basis.js` | Auswahlliste: aktive Zeile hinterlegen statt Haken |
| `window.casoraDevice` | `00-finder.js` | Geräte/Entitäten finden (über `translation_key`, Gerät, Bereich) |
| `window.casoraPopup.open/close/moreInfo` | `casora-core.js` | Popup aus Code öffnen/schließen, HA-Detaildialog |
| `casoraAsk` / Zeilen-`confirm` | `casora-core.js` | Rückfrage vor kritischen Diensten |

Zeilen-Objekt für `UI.group` (aus Pulse):

```js
{ entity: id, icon: 'mdi:…' | 'name', iconTone: 'good' | 'warn' | 'bad' | 'accent' | 'var(--…)',
  label: 'Name', sub: 'Raum · Grund', value: '62 %', valueTone: 'warn',
  action: 'Gewechselt', svc: { domain, service, data, done: 'Rückmeldung' }, confirm: 'Rückfrage' }
```

## 4. Muster – Modul + Vorlage

```js
// scripts/local/14-pulse.js
P.popup = function (states, hass) {
  var K = window._casoraSoftKit, UI = window._casoraUI;
  if (!K || !UI) return { type: 'vertical-stack', cards: [] };
  var watch = [/* alle Entitäten, deren Änderung neu zeichnen soll */];
  var call = function (part) {
    return 'return window._casoraPulse ? window._casoraPulse.sec(' + JSON.stringify(part) + ', null, states, hass) : "";';
  };
  var f = { hero: { card: K.secCard(watch, call('hero'), states) } };
  if (s.problems) f.prob = { card: K.secCard(watch, call('prob'), states) };
  f.more = { card: K.secCard(watch, call('more'), states) };
  return K.layout({ fields: f, top: ['hero'], left: ['prob'], right: ['soon', 'more'], moveLeft: ['soon'] });
};
P.sec = function (part, C, states, hass) {
  if (part === 'hero') return UI.line(h.main, h.rest, { tone: h.tone });
  if (part === 'prob') return UI.group(rows.map(rowOf), 'Ausgefallen');
};
```

```json
"casora_popup_pulse": { "tap_action": { "action": "[[[ return window.casoraPopupAction ? window.casoraPopupAction() : 'more-info'; ]]]",
  "haptic": "light",
  "casora_popup": {
   "title": "[[[ return window.casoraPopupTitle ? window.casoraPopupTitle(this, variables, 'Pulse', ['Pulse']) : 'Pulse'; ]]]",
   "content": "[[[ return window._casoraPulse ? window._casoraPulse.popup(states, hass, variables) : { type: 'vertical-stack', cards: [] }; ]]]",
   "style": "[[[ … '--popup-min-width: min(900px, 92vw); --popup-max-width: min(900px, 92vw);' ]]]",
   "extra": "[[[ return window.casoraPopupExtras ? window.casoraPopupExtras(this) : null; ]]]",
   "dismiss_on_background": true,
   "popup_styles": [{ "style": "all", "styles": "--casora-popup-plate-enter: casora-plate-in 320ms cubic-bezier(0.2, 0.8, 0.3, 1) both; @media (prefers-reduced-motion: reduce) { --casora-popup-plate-enter: none; } …" }] } } }
```

Warum `secCard`: Der Inhalt (`content`) wird **einmal beim Öffnen** ausgewertet. Live bleibt nur, was eine
eigene Karte mit `triggers_update` und eigenem `[[[ … ]]]` ist. Ohne das schaltet ein Schalter, zeigt
es aber nicht an.

## 5. Regeln im Inhalt

- **Bedien-Popup** (Sheet): Abschnittsüberschriften außen über der Platte. **Info-Popup** (Glasplatten):
  innen – im `popup_styles` `--casora-lbl-in: block; --casora-lbl-out: none`. Einheitlich pro Popup.
- Auswahl ohne Haken (`_casoraSelRows`), aktive Zeile hinterlegt (`--casora-soft-row-active*`, DP-07);
  ausgeschaltete Zeilen bleiben Sand; Pfeil/Schalter auf aktiver Zeile in deren Schriftfarbe.
- Leere Bereiche nicht rendern (Feld weglassen), leere Diagramme mit Hinweis statt leerer Fläche (DP-09).
- Felder mit Schatten: `overflow: visible` (macht `layout` selbst).
- Kein HA-Schalter `ha-switch` neu einbauen, wenn ein Kern-Schalter in der Zeile reicht (DP-19 Switch-Popup).
- Farbe der Kopf-Kachel = Zustand (keine rote Batterie bei „Alles OK“, DP-15 entschieden) – siehe oben `_casoraRingHueHooks`.
- Langer Titel: Kern-CSS kürzt; keine eigenen `max-width: calc(100% + 56px)`-Köpfe (DP-03).
- Gerät verschwindet bei offenem Popup → Rahmen zeigt Hinweis (`_checkEmpty`), Inhalt darf nicht werfen.

## 6. Pflicht-Zustände

| Zustand | Erwartung |
|---|---|
| alle Gerätezustände (an/aus/aktiv/läuft/fertig/Fehler) | Zustandswort laut Wortliste, Kopf-Kachel/Ton passend |
| nicht verfügbar / unbekannt / Attribut fehlt | Text statt `undefined`/`NaN`, keine Konsolenmeldung |
| leer (keine Einträge) / sehr viele Einträge | Hinweiszeile bzw. Scrollen mit Verlauf, keine harte Kante |
| lange Namen (Titel, Zeilen) | `…`, nichts über den Rand |
| Gerät weg bei offenem Popup | kein Fehler |
| Desktop 1440 (2 Spalten) · Tablet 1024/768 · Handy 393 WebKit (1 Spalte) | Reihenfolge stimmt, Überschriften auf einer Höhe |
| hell / dunkel | Kontrast inkl. aktiver Zeile |
| Deutsch / Englisch | – |
| Bedienen | Haptik, `:active` an Knöpfen, Trefferflächen ≥ 40 px, Esc/X/Hintergrund schließt |
| Popup aus Glocke / Handy-Raum / Badge öffnen | gleicher Inhalt |

## 7. Checkliste

- [ ] Kopf vom Rahmen (Kopfzeile A), Titel über `casoraPopupTitle`, Statuszeile als `UI.line` oben
- [ ] Gesamtschalter als Hauptschalter im Kopf (kein eigener „Alles aus“-Knopf), Szenen mit eigener Überschrift
- [ ] Maße nur aus Tokens (`design-regeln.md` § 0), Abschnittsüberschriften über `UI.group(rows, 'Titel')`
- [ ] Inhalt aus `_casoraUI`/`_casoraSoftKit`, keine neuen Klassen-Präfixe
- [ ] Live-Teile als `secCard` mit vollständiger `watch`-Liste
- [ ] Spalten: links Bedienung, rechts Infos; Handy einspaltig
- [ ] Bewegung über `--casora-popup-plate-enter`, reduzierte Bewegung respektiert
- [ ] `dev/qa/popup-raender.mjs --geo --only <vorlage>` ohne Fund (ring/radius/zeilen/etikett/spalten/kontrast/schalter/treffer/haken)
- [ ] Unit-Test mit erfundenen Geräten; Regress-Test, wenn ein Fehler behoben wurde
- [ ] `build-templates.py`, `check-templates.mjs`, `node --check`, `i18ncheck.py`
