# Blaupause: neue Kachel (oder neues Badge)

Vorbild ist die Pulse-Kachel (Commit „Pulse-Kachel und Pulse-Popup“): Logik in einem Modul, die
Vorlage ruft nur auf, das Studio bietet sie an, ein Unit-Test prüft ohne HA. Diesen Weg gehen.

## 1. Dateien – wo was hingehört

| Teil | Datei |
|---|---|
| Logik (Zustand, Text, Farbe, Zählen) | eigenes Modul `custom_components/casora/scripts/local/NN-name.js` als `window._casoraName = {…}` – oder ein bestehendes Modul, wenn es thematisch passt |
| Modul laden | Namen in `MODULES` in `custom_components/casora/scripts/casora-local.js` eintragen (Reihenfolge = Ladereihenfolge) |
| Vorlage | `dashboards/casora/button_card_templates.json` (Quelle!), danach `python3 tools/build-templates.py` |
| Studio-Angebot | `TILE_TYPES` in `panel/casora-panel-types.js` |
| Hauptentität automatisch finden | `TILE_MAIN_FIND` in `panel/casora-panel.js` |
| Kachel gilt fürs ganze Haus | `HOUSE_WIDE_TILES` in `panel/casora-panel.js` |
| Eigenes Symbol | `custom_components/casora/assets/icons/<name>.svg` + Name in `CASORA_EXTRA_ICONS` (`casora-panel-types.js`) |
| Englische Texte (Dashboard) | `translations/dashboard/phrases/en.json` |
| Deutsche Studio-Texte | `translations/panel/de.json` (Studio-Code schreibt Englisch) |
| Test | `dev/unit/<name>.mjs` |

## 2. Bausteine wiederverwenden

- **Grundvorlage `casora_entity`** – Größe, Radius, Symbolkreis, Name/Zustand, Haptik, aktive Optik.
  Eigene Vorlage erbt: `"template": ["casora_entity", "casora_popup_name"]`.
- **Finder `window.casoraDevice`** (`scripts/local/00-finden.js`): `deviceOf`, `entities`, `byKey`,
  `siblings`, `companionPlug`, `contacts`, `openings`, `network` … Entitäten **über Integration +
  `translation_key`** finden, nie über die Entity-ID (die hängt an Sprache und Gerätenamen).
- **Text in der Kachel**: `window.casoraStateFit(text)` für den Zustand; Zahlen mit `window.casoraNum(v, min, max)`
  bzw. `toLocaleString(casoraLocale())`, nie `toFixed()` für Anzeige.
- **Farben**: Gerätefarbe/Ton aus [design-regeln.md §5](design-regeln.md#5-farben); Szenen nur `casoraSceneColor`.
- **Zustandshelfer**: `casoraSecurityLevel/-Color`, `casoraBattery`, `_casoraOpenSince` statt eigener Kopien.
  Eigenes `ago()`/`esc()`/`num()` nicht noch einmal schreiben (heute 18 bzw. 35 Kopien – Altlast).

## 3. Vorlage – Muster aus `casora_pulse`

```json
"casora_pulse": {
 "template": ["casora_entity", "casora_popup_pulse"],
 "variables": { "icon": "pulse", "casora_default_name": "Pulse" },
 "hold_action": { "action": "none" },
 "state_display": "[[[\n  const fit = (t) => window.casoraStateFit?.(t) ?? t;\n  const P = window._casoraPulse;\n  return P ? fit(P.tileState(P.scan(hass, states))) : '';\n]]]",
 "state": [{ "operator": "template",
   "value": "[[[ const P = window._casoraPulse; return !!(P && P.active(P.scan(hass, states))); ]]]",
   "styles": { "card": [ { "--casora-icon-color-current": "[[[ … P.color(…) … ]]]" }, { "--casora-icon-circle-bg": "var(--casora-icon-color-current)" } ] } }]
}
```

Regeln für Vorlagen-JS (`[[[ … ]]]`):
- Die Vorlage **ruft nur auf**; Logik liegt im Modul. Immer mit Rückfall, wenn das Modul (noch) fehlt –
  die **Studio-Vorschau lädt die lokalen Module nicht** (`P ? … : ''`).
- Keine Variablen namens `html`, `states`, `entity`, `hass`, `variables`, `user` deklarieren
  (button-card übergibt sie als Parameter → „already declared“). `out` statt `html`.
- Regex mit `\/` nicht in innere Vorlagen in Template-Strings – in eine Hilfsfunktion im Modul.
- Verschachtelte Karte in `custom_fields` mit eigener `tap_action` → `do_not_eval: true` daneben.
- Verschachtelte Karte, die live reagieren soll → eigenes `triggers_update: [entity]` und Inhalt als
  eigenes `[[[ … ]]]` (nicht als fertig berechneter String).
- `tap_action` mit `"haptic": "light"`.
- Icon antippen (entschieden 13.10.2026): Hat die Kachel etwas zu schalten, schaltet das Icon (Licht an/aus,
  Jalousie auf/zu, Schloss auf/zu, Saugroboter saugen/zurück, Medien an/aus …). Sonst `icon_tap_action:
  { "action": "none" }` – dann gilt der Tipp als Tipp auf die Kachel (dasselbe Casora-Popup). Nie `more-info`
  (HAs Dialog). Popup-Vorlagen, die mit einer schaltenden Vorlage kombiniert werden, bringen deren Schalter mit.

## 4. Studio-Eintrag – Muster

```js
// casora-panel-types.js, TILE_TYPES
{ id: "casora_pulse", label: "Pulse", template: "casora_pulse", domains: ["sensor"], ownData: true, icon: "pulse",
  color: "var(--casora-color-green, #30D158)", entityLabel: "Pulse problems", entityPlaceholder: "Automatic",
  onlyIf: (hass) => !!(hass && hass.entities && Object.values(hass.entities).some((e) => e && e.platform === "pulse")),
  fields: [ICON, { ...TITLE, placeholder: "Pulse" }] },
// casora-panel.js, TILE_MAIN_FIND – Schlüssel UND Integration (both), nicht die Entity-ID
casora_pulse: { keys: ["problems"], domain: "sensor", platform: "pulse", both: true },
```

`onlyIf` blendet Kacheln aus, deren Integration fehlt. Neue Felder nur aus den vorhandenen Feld-Bausteinen
(`ICON`, `TITLE`, …).

## 5. Badge statt Kachel

- Vorlage `casora_badge_<name>`, Pille (`999px`), Höhe wie die anderen Badges (Test `badge_summe_hoehe.mjs`),
  Name mit `…` statt Abschneiden (`badge_langer_name.mjs`), `haptic` (`badge_haptic.mjs`).
- In die Reihen eintragen, in denen es erscheinen soll: `casora_room` (Raum-Kopf Desktop),
  `casora_mobile_filter_badges` (Handy oben), `casora_mobile_sensor_chips` (Handy-Raum).
- Badges blenden sich bei „nicht verfügbar“ aus, statt einen Fehlertext zu zeigen.

## 6. Pflicht-Zustände (jeder muss im Bild geprüft sein)

| Zustand | Erwartung |
|---|---|
| an / aus / aktiv (hinterlegt) | Farbe = Ton der Gerätefamilie, Zustandswort laut Wortliste |
| nicht verfügbar / unbekannt | „Nicht verfügbar“ / „Unbekannt“, kein `undefined`/`NaN`, keine Konsolenmeldung |
| Entität fehlt / gelöscht | Kachel bleibt ruhig (Rückfall), kein TypeError |
| Integration fehlt | im Studio nicht angeboten (`onlyIf`) |
| leer / viele Einträge | „Alles ok“-Text bzw. Zählung, Gruppen: Einzahl bei genau 1 („An“, nicht „Alle an“) |
| langer Name / langer Zustand | `…` bzw. `casoraStateFit`, nichts ragt heraus |
| Desktop 1440 · Tablet 1024/768 · Handy 393 (WebKit) | Kreis ringsum gleich, Name nicht zu früh gekürzt |
| hell / dunkel | Kontrast Text 4,5:1, Symbol 3:1 |
| Deutsch / Englisch | keine deutschen Reste im Englischen |
| Studio-Vorschau | sieht aus wie im Dashboard |
| Antippen | Vibration, Popup öffnet, Druck sichtbar nur am Symbolkreis/Taste |

Randfälle maschinell: `dev/qa/randfaelle.mjs` (siehe [test-und-release.md](test-und-release.md)).

## 7. Checkliste vor dem Commit

- [ ] Logik im Modul, Vorlage ruft nur auf, Rückfall ohne Modul
- [ ] Entitäten über `casoraDevice`/`translation_key`, keine Entity-IDs im Code
- [ ] Keine neuen festen Farben/Radien/Schatten (`dev/unit/design_zaehler.mjs` grün)
- [ ] `haptic: 'light'`, Badge in den richtigen Reihen
- [ ] Texte deutsch im Code, englisch in `phrases/en.json`; `python3 tools/i18ncheck.py`
- [ ] `python3 tools/build-templates.py`, `node dev/qa/check-templates.mjs` (0 Fehler), `node --check` je JS
- [ ] Unit-Test `dev/unit/<name>.mjs` (erfundene Geräte und Namen), alle `dev/unit/*.mjs` grün
- [ ] Bilder Desktop/Handy, hell/dunkel, de/en im Theme „Casora“ angesehen; `popup-raender --geo` für das Popup
- [ ] Keine persönlichen Daten (pre-commit `tools/privacy-check.py`)
- [ ] Vorlagenänderung = Karten-Update oder Release (siehe [test-und-release.md](test-und-release.md))
