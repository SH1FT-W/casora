# Design-Regeln

Gilt für Dashboard (Kacheln, Badges, Popups, Menüs, Handy) und – wo genannt – Studio. Maßstab ist das
Theme **„Casora“** (`custom_components/casora/theme_weich.yaml`), hell und dunkel. „Hemma 2“/„Hemma 1“
(Standard-Look für umgezogene Häuser) und „Casora Nebel“ müssen weiter funktionieren, bestimmen aber
nicht das Maß.

Grundsatz: **Werte kommen aus Theme-Variablen oder aus den Kern-Bausteinen**, nicht als feste Zahl
im neuen Code. Wo ein fester Wert nötig ist (Rückfallwert in `var(--x, …)`), nimmt man den Wert der Variable.

---

## 0. Tokens (eine Designsprache, seit 1.3)

Gilt: Die Werte stehen **einmal** als CSS-Variablen im Theme „Casora“ (`theme_weich.yaml`, Abschnitt
„Designsprache“; „Casora Nebel“ wird daraus gebaut). Neuer Code nimmt nur diese Variablen; feste Zahlen nur
als Rückfallwert `var(--casora-r-row, 24px)`. Die Popups (Kern `casora-core.js`, Module `scripts/local/`)
sind umgestellt; Kacheln, Menüs und Studio ziehen nach (bis dahin: dort die heutigen Werte der Nachbarn).

| Gruppe | Variablen | Werte |
|---|---|---|
| Radien | `--casora-r-window` · `-surface` · `-row` · `-element` · `-small` · `-pill` | 44 · 32 · 24 · 18 · 12 · 999 px |
| Abstände (4er-Raster) | `--casora-space-1` … `-10` (1,2,3,4,5,6,8,10) | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 px |
| Schrift | `--casora-fs-label` · `-sub` · `-value` · `-row` · `-heading` · `-title` · `-page` | 12 · 13 · 14 · 15 · 17 · 28 · 34 px |
| Symbolgrößen (6) | `--casora-ic-head` (Handy `-head-phone`) · `-tile` · `-row` · `-badge` · `-button` · `-status` | 56 (48) · 44 · 36 · 28 · 48 · 22 px |
| Schatten (3 Stufen, hell + dunkel) | `--casora-shadow-rest` · `-raised` · `-float` | Ruhe (Platte, aktive Zeile) · gehoben (Hover/aktiv) · schwebend (Popup, Menü) |
| Bewegung | `--casora-ease-enter` + `--casora-dur-enter` · `--casora-ease-slide` + `--casora-dur-slide` · `--casora-dur-feedback` | (.2,.8,.3,1) 320 ms · (.36,0,.16,1) 360 ms · 160 ms |
| Druck | `--casora-press-scale` | `.97` auf Tasten (`transform: scale(var(--casora-press-scale, .97))`) |
| Aktive Zeile (DP-07) | `--casora-soft-row-active` · `-active-shadow` · `-active-ink` · `-active-sub` | hell Creme + Ruhe-Schatten; dunkel Sand 14 %, helle Schrift |
| Symbol auf Akzent (DP-17) | `--casora-on-accent-ink` | dunkle Tinte, wo Weiß unter 3 : 1 hat (Gelb, Orange, Grün) |
| Popup-Akzent | `--casora-popup-accent` · `--casora-popup-accent-ink` | vom Rahmen je Popup gesetzt = Gerätefarbe der Kachel (Schalter, Kopf-Kachel, aktive Symbole) |

Symbol-Kacheln (abgerundetes Quadrat statt Kreis, Popups seit 1.3): Radius ≈ 30 % – Kopf 56/16, Handy 48/14,
Zeile 36/12 (`--casora-soft-icon-size`, `--casora-soft-icon-radius` im Popup-Rahmen). Startseite zieht nach.

## 1. Radien

Gilt (gemessen, Kern-Popups halten das zu 98–100 %):

| Stufe | Wert | Wo | Variable |
|---|---|---|---|
| Fenster | 44 px | Popup/Sheet | `--casora-popup-radius` |
| Fläche | 32 px (Handy 30) | Kachel, Szenen-Kachel 30 | `--ha-card-border-radius`, `--casora-tile-radius-phone`, `--casora-scene-tile-radius` |
| Zeile | 24 px | Zeilen-Platte im Popup, Menüzeile | `--casora-popup-row-radius` |
| Element | 18 px | Segment, Feld in einer Zeile | `--ha-border-radius-lg` |
| klein | 12 px | Eingabe, Tooltip | – |
| Pille | `999px` | Badge, Chip, Knopf mit Text | – (nicht `9999px`/`99px` neu schreiben) |
| Kreis | `50%` | Symbolkreis, Ring | – |

Regel **konzentrisch**: innerer Radius = äußerer Radius − Abstand (±2 px). Bei Pillen gilt die halbe
Höhe: `min(Radius, Höhe/2)`. Beispiel Handy-Leiste: Leiste 60/Radius 30, Polster 6, Taste 48/Radius 24 ✓.

Bekannte Abweichungen (nicht nachbauen): Pulse-Popup setzt `--casora-popup-row-radius: 26px`, Glocke
Fenster 28 / Zeile 18 bei 8 px Rand (konzentrisch wäre 20), Kamera-Bildplatte 28, HA-Dialog 36.

Gilt (DP-16, entschieden 10.10.2026, „Zeilen konzentrisch“): Popup-Zeile 60 hoch, Radius 24, Symbol-Kachel
36/r12 mit 12 px Rand ringsum → 12 + 12 = 24 konzentrisch. Variablen im Popup-Rahmen: `--casora-soft-row-h`,
`--casora-soft-row-pad`, `--casora-soft-icon-size`, `--casora-soft-icon-radius`.

> **OFFEN – Entscheidung Maintainer (dk-10, Markierung im Räume-Menü):**
> A: Fenster 34 (dann konzentrisch zur Pille 26 bei 8 px Abstand) / B: so lassen.

## 2. Abstände

Gilt: **4er-Raster** – 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40. Neue Abstände nur aus dieser Reihe.
Heute weichen 272 von 1 032 gemessenen Lücken ab (meist 3, 6, 7, 9 px) – nicht als Vorbild nehmen.

| Was | Wert | Variable / Ort |
|---|---|---|
| Popup-Abschnitt zu Abschnitt | 18 px | `--casora-popup-sec-gap` (in `_casoraStdLayout`) |
| Popup-Spaltenabstand (≥ 761 px) | 26 px Casora, 20 px Hemma | `--casora-popup-col-gap` |
| Zeile innen | 8 px oben/unten (Info-Zeilen bis 15) | `--casora-popup-row-pad-y`, `--casora-popup-row-pad-x` |
| Desktop-Kachel innen | 20 px | – |
| Handy-Chips | 8 px | `--casora-mobile-chip-gap` |
| Menü Kreis–Text | 12 px | `--casora-menu-ic-gap` |

Regel **ringsum gleich**: ein Element in einer Fläche hat oben = links = rechts (= unten) denselben
Abstand, ±1 px. Gilt für Symbolkreis in der Zeile, Markierung im Menü, Knopf in der Leiste.

> **OFFEN – Entscheidung Maintainer (dk-05, Symbolkreis in der Kachel):**
> A: ringsum gleich (Desktop 20/20, Handy 10/10) / B: so lassen (heute oben 18/links 20 durch
> `--casora-tile-icon-mt:-2px`, Handy 10/12). Bild: `d-kacheln/bilder/dk05_vergleich.png`.

> **OFFEN – Entscheidung Maintainer (dk-06, Einzug Handy-Überschriften):** A: überall 16 px (fluchtet
> mit Kacheln) / B: überall 18 px. Heute Raumseite 18, sonst 16.

## 3. Schatten

Gilt: nur Theme-Variablen, kein neues `box-shadow: 0 … rgba(…)` im Code.

| Stufe | Variable |
|---|---|
| Ruhe (Kachel, Platte) | `--button-card-box-shadow`, Handy `--button-card-box-shadow-mobile` |
| gehoben (aktiv / Hover) | `--button-card-box-shadow-active`, `--button-card-box-shadow-hover` |
| schwebend (Popup, Menü, Glocke) | `--dialog-box-shadow`, `--casora-window-shadow`, `--casora-mnav-menu-shadow` |
| Farbe (Ring, Hauptknopf) | `--casora-lps-ring-shadow`, `--casora-soft-media-play-shadow` |
| Studio | `--casora-studio-shadow` |

Jede neue Schatten-Variable braucht einen Wert für **hell und dunkel** (`modes: light:` / `dark:` in
`theme_weich.yaml`) – fehlt der dunkle, sieht man es erst im Dunkeln (Fund per-04: Studio-Meldung hell
mit heller Schrift).

Popup-Inhalt: Felder mit Schatten brauchen `overflow: visible` im Grid-Feld, sonst wird der weiche
Schatten gerade abgeschnitten (Beispiel `casora_popup_contacts`, `fstyle[name] = [{ overflow: 'visible' }]`;
offen: DP-14 Rezept).

## 4. Schrift

Gilt: **Inter** (`--primary-font-family`) im Dashboard. Gewichte 500/600/700/800. **Keine halben Pixel**
in neuem Code (heute noch ~100 Stellen, u. a. 12,5/13,5/14,5).

| Rolle | Größe/Gewicht |
|---|---|
| Abschnittsüberschrift im Popup (seit 1.3) | 17/700, Satzschreibung, Text 1 – über `--casora-h15-*` (Popup-Rahmen setzt sie) |
| Etikett (Raum über dem Popup-Titel, Wert-Etiketten) | 12/700, Großbuchstaben, `letter-spacing: .1em` |
| Unterzeile | 13/500 |
| Wert in Zeile | 14/600 |
| Zeile | 15/500 bzw. 15/700 |
| Status unter dem Popup-Titel (Kopfzeile A) | 15/700 Zustand · 15/500 Rest |
| Popup-Titel | 28/800 |
| Seitentitel Handy | 34/800 |
| Kachelname | 18 / 15 / 14 (Desktop/Tablet/Handy), 700 |
| Raumtitel | 75/800 (−3 px), Handy kleiner |

Lange Zustände in Kacheln: `window.casoraStateFit(text)` (verkleinert bis zur Mindestgröße), Namen mit
`text-overflow: ellipsis` statt hartem Abschneiden (Fund dk-04).

Studio heute: eigener Satz `--t-caption 12 · --t-foot 13 · --t-callout 15 · --t-body 17 · --t-title 22 ·
--t-large 34` (`casora-panel.js`). Neue Studio-Regeln nehmen nur diese.

> **OFFEN – Entscheidung Maintainer (Studio-Schrift, Sprachen-Frage 2):**
> A: Studio bleibt iOS-nah (SF im Inspektor, Radien 8/12/18/26, Haarlinien) /
> B: Casora-Sprache (Inter, Radien 12/18/24/32, Sand-Platten; Haarlinien in Formularen dürfen bleiben).

Gilt (Sprachen-Frage 1, entschieden B): Abschnittsüberschriften sind **normale Überschriften** („Räume“,
nicht „RÄUME“), 17/700 – in Popups umgesetzt über `--casora-h15-fs/-fw/-ls/-tt/-c` (Weich-Rahmen) bzw.
`UI.group(rows, 'Räume')`. Kleine Großbuchstaben bleiben nur für Etiketten (Raum über dem Titel, Wert-Etiketten).

## 5. Farben

Gilt:
- **Gerätefarben = feste Bedeutung je Ton** (`theme_weich.yaml`, Kommentar „Farbsystem der Symbole“):

  | Ton | Variable | Bedeutung |
  |---|---|---|
  | Gelb | `--casora-tone-light` | Licht, Szenen, Stimmung |
  | Türkis | `--casora-tone-general` | Bedienung, Allgemeines, Räume |
  | Grün | `--casora-tone-energy` | Energie, Pflanzen, OK, Versionen |
  | Orange | `--casora-tone-heat` | Heizung, Wetter, Uhrzeit |
  | Rot | `--casora-tone-alert` | Sicherheit, Alarm, Meldungen |
  | Blau | `--casora-tone-media` | Netzwerk, Medien, Updates |
  | Sand | `--casora-tone-settings` | Einstellungen, Design |

- Grundfarben `--casora-color-<name>` (blue, teal, mint, yellow, green, orange, red, deep-orange, pink,
  violet, purple …). Im Code immer `var(--casora-color-teal, #4E9E95)` – Rückfallwert = Theme-Wert, nicht
  ein iOS-Wert (#00C3D0/#30D158 sind Hemma-Erbe, nicht neu verwenden).
- Popup-Bausteine nehmen die Töne über `UI.tokens` (`ink`, `ink2`, `ink3`, `fill`, `fill2`, `green`,
  `amber`, `red`, `accent`) bzw. `iconTone: 'good' | 'warn' | 'bad' | 'accent'`.
- Zustandsfarben über Helfer, nicht neu raten: Sicherheit `casoraSecurityColor(casoraSecurityLevel(…))`,
  Pulse `_casoraPulse.color(worst)`, Akku `casoraBattery`.
- **Szenenfarbe kommt nur aus dem Studio**: `window.casoraSceneColor(id)`; ohne Eintrag
  `var(--casora-scene-badge-color, var(--casora-color-yellow))`. Desktop, Tablet, Handy, Badge, Kachel,
  Menü zeigen dieselbe Farbe. Keine eigenen Ratelisten aus dem Symbol.
- Was das Studio vorgibt, zeigen alle Geräte gleich.

> **OFFEN – Entscheidung Maintainer (dk-17):** A: Szenenfarbe überall immer (auch inaktiv) /
> B: überall nur aktiv, inaktiv neutral. Heute: Badge immer, Handy-Menü nur aktiv.

Gilt (DP-15, entschieden: Ring folgt Zustand): Die Kopf-Kachel zeigt die Farbe, die die Kachel gerade zeigt
(Zustand), aus = Sand; Fehler/fehlgeschlagen = Rot; nicht verfügbar/unbekannt = Sand. Ein Modul, das den
Zustand selbst kennt, setzt ihn über `window.casoraRingHue(src, key)` (siehe Blaupause Popup).

## 6. Symbolkreise

Gilt: Popup-Kopf-Kachel 56 (Handy 48) · Kachelkreis 44 (Tablet 38, Handy 42) · Zeilen-Kachel im Popup 36 ·
Badge 28–30 · Knopf 48 · Status 22 · Menü 32 (`--casora-menu-ic-size`). Symbol ≈ 50 % der Fläche. In Popups
sind Symbole seit 1.3 abgerundete Quadrate (siehe § 0), auf der Startseite noch Kreise.
Eigene SVG-Symbole über `mask-image` (`/casora_assets/icons/<name>.svg`), neue Namen in
`CASORA_EXTRA_ICONS` (`casora-panel-types.js`) eintragen.

Neue Kreisgrößen außerhalb dieser Liste nicht einführen (heute 13 Größen in Popups – Altlast).

Gilt (DP-17, entschieden B): Symbol auf einer Akzentfläche ≥ 3 : 1 – der Kern wählt Weiß oder
`--casora-on-accent-ink` nach Kontrast (`window._casoraInkOn(farbe)`); Aus-Symbol `--casora-soft-glyph-off` .70.

## 7. Bewegung

Gilt:
- **Auftritt** `cubic-bezier(.2,.8,.3,1)` 320 ms – Popup, Platten (`--casora-popup-plate-enter:
  casora-plate-in 320ms …`), Menüs.
- **Schieber** `cubic-bezier(.36,0,.16,1)` 360 ms – Segment-Markierung, Breiten.
- **Rückmeldung** 160 ms `ease` – Farbe, Hover.
- Immer `@media (prefers-reduced-motion: reduce)` → keine Bewegung (Beispiel Pulse-Popup-Stil).
- Keine neuen Kurven (heute 47 Fremdkurven, Studio `(.32,.72,0,1)`, Handy-Federn – Altlast).

> **OFFEN – Entscheidung Maintainer (Popup-Einblendung, Backlog):** Optionen 1/2/3 aus dem Backlog,
> noch nicht gewählt.

## 8. Hover, Druck, Tipp-Feedback

Gilt:
- **Hover und Druck nur auf Tasten** – also auf Elementen, die etwas auslösen (Knopf, Zeile mit
  Aktion, Symbolkreis der Kachel). Kacheln heben sich beim Hover nicht (nur der Symbolkreis
  `scale(1.03)`), Badges haben keinen Hover. Flächen ohne Aktion reagieren nicht.
- Hover nur unter `@media (hover: hover)` (sonst „klebt“ der Zustand am Handy).
- **Jede antippbare Vorlage hat `haptic: 'light'`** in `tap_action` (Test `dev/unit/tippen_einheitlich.mjs`,
  Badges `dev/unit/badge_haptic.mjs`).
- Popup-Knöpfe haben einen sichtbaren `:active`-Zustand.
- Platten-Stufen (Sand): .07 Ruhe · .10 Bedienfeld · .11 Hover · .16 Druck; aktiv = Creme + Ruhe-Schatten.

> **OFFEN – Entscheidung Maintainer (dk-13, Druck bei Badges):** A: wie Kacheln ohne sichtbaren Druck
> (nur Haptik) / B: alle Badges Platte .07→.11 beim Drücken. Heute färbt nur das Einzel-Sicherheits-Badge.

Gilt (Druck-Skala, entschieden): `scale(var(--casora-press-scale, .97))` auf Tasten – in Popups umgestellt;
Kacheln/Menüs/Studio ziehen nach (heute dort noch .86–.985).

## 9. Aktive Zeilen und Auswahllisten

Gilt:
- Auswahl (Modus, Programm, Profil) **ohne Haken**: aktive Zeile hinterlegen, Symbol in Farbe, inaktive
  Symbole grau. Baustein: `window._casoraSelRows(UI.group(rows, titel), aktivesLabel)` (`01-basis.js`).
- Auf hinterlegter (heller) aktiver Zeile erben Pfeil, Schalter und Symbol die Schriftfarbe der Zeile
  (Funde DP-04/DP-06: Schalter 1,15:1, Pfeil 1,09:1 im Dunkeln).

Gilt (DP-07, entschieden „eine Art aktiv“): Popup-Zeilen, die an/gewählt/aktiv sind, nehmen
`--casora-soft-row-active*` – hell Creme + Ruhe-Schatten, dunkel Sand 14 % mit heller Schrift (keine Creme-Umkehr
mehr). Gilt auch für Auswahllisten (`--casora-soft-row-selected` zeigt darauf). Ausgeschaltete Zeilen bleiben Sand.

## 10. Geometrie (gemessen mit `dev/qa/popup-geo.mjs`, `dev/qa/ausrichtung.mjs`)

| Regel | Toleranz | Messung |
|---|---|---|
| **Ringsum gleich**: Abstand Kreis–Platte links = oben = unten; Markierung im Menü oben = links = rechts | ±1 px | `popup-geo` „ring“, `ausrichtung` |
| **Konzentrisch**: `min(Plattenradius, Höhe/2)` = Kreisradius + Abstand; Markierung = Menüradius − Abstand | ±2 px | `popup-geo` „radius“ |
| **Fluchten**: gleicher linker Einzug aller Zeilen gleicher Höhe je Popup; Überschriften-Einzug und -Lücke je Popup gleich; erste Überschriften zweier Spalten auf einer Höhe | ±1 px | `popup-geo` „zeilen“, „etikett“, „spalten“ |
| Symbol/Text in aktiv und inaktiv an derselben Stelle | ±1 px | `ausrichtung` |
| Keine harte Kante beim Scrollen: Verlauf oben/unten (Popups `--casora-popup-more-fade`) | – | Bild |

> **OFFEN – Entscheidung Maintainer (dk-15):** Räume-Menü 12-px-Verlauf oben/unten wie Popups (A) oder
> so lassen (B).

## 11. Kontrast (WCAG AA, gemessen mit `popup-geo` „kontrast“/„schalter“)

- Text 4,5:1, großer Text (≥ 18,66 px fett / 24 px) 3:1.
- Symbole in Zeilen und Kreisen 3:1.
- Schalter: Spur oder Knopf hebt sich mit ≥ 1,5:1 von der Platte ab.
- Inaktives (opacity < .6, `disabled`) zählt nicht.
- Hell **und** dunkel prüfen – die Hälfte der Kontrast-Funde gab es nur dunkel.

> **OFFEN – Entscheidung Maintainer (dk-08, Text-Rot):** A: eigenes Text-Rot (≈ #B0473C, 4,6:1) nur für
> Schrift / B: so lassen (#D35A4E auf Creme 3,3:1). Pfeil › in Zeilen (DP-30): entschieden B, Deckkraft .6
> (`--casora-chev-opacity`).

## 12. Trefferflächen

- Handy: jede Taste **≥ 40 px** (Navigationsleiste ≥ 48). Kleine sichtbare Knöpfe vergrößern die
  Fläche unsichtbar mit `::before { inset: -Npx }` – Optik bleibt (Fund DP-02: Szenen-Chips 38, Kalender-Pfeile 32).
- Nichts Antippbares näher als 8 px an einer anderen Taste ohne Abstand dazwischen.

## 13. Popup-Aufbau (Kurzfassung, Details in [blaupause-popup.md](blaupause-popup.md))

Gilt:
- Breit: `--popup-min-width: 900px; --popup-max-width: 920px` (auch kleine Steuer-Popups).
- **Kopfzeile A** (seit 1.3, alle Popup-Arten, nur Theme „Casora“/Nebel): Kopf in einer Zeile – links die
  Symbol-Kachel 56/r16 (Handy 48/r14) in Gerätefarbe, daneben klein der Raum (Etikett), der Titel 28/800 (Handy 24)
  und die Statuszeile; rechts der Hauptschalter (nur wo es einen Gesamtschalter gibt, ersetzt eigene „Alles aus“-
  Knöpfe) und das X. Kachel bündig mit den Zeilen darunter (36 px vom Rand, Handy 24). 28 px bis zum Inhalt.
- Ab 761 px: darunter Diagramm/Kamera/Karte volle Breite →
  zwei Spalten, **links Bedienung** (Modus mit Überschrift „Modus“ oben links, Programme, Schalter,
  Aktionen), **rechts Infos** (Status, Messwerte, Verbrauch, Verlauf).
- Handy (≤ 760): eine Spalte, Reihenfolge Kopf → Diagramm → Modus → übrige Bedienung → Infos.
- Überschriften **pro Popup** einheitlich: Bedien-Popup (Sheet) alle außen über der Platte,
  Info-Popup (Glasplatten) alle innen (`--casora-lbl-in: block; --casora-lbl-out: none`).

Entschieden (10.10.2026): A „Kopfzeile“, Symbol als abgerundetes Quadrat, Schalter in Gerätefarbe
(`--casora-popup-accent`, alle Schalter im Popup). Szenen bekommen eine eigene Abschnittsüberschrift „Szenen“.

> **OFFEN – Entscheidung Maintainer (Listen in Fenstern, Sprachen-Frage 3):** A: jede Zeile Platte 24
> (wie Popups) / B: Zeilen ohne Platte, nur Hover-Platte (wie Glocke) – Vorschlag B in Glocke/Menüs, A in Popups.

## 14. Wortlaut

Siehe [wortliste.md](wortliste.md). Kurz: An/Aus, Geöffnet/Geschlossen, „1 An“ groß, „2 aktiv“ klein,
du-Form, „62 %“ mit Leerzeichen (Deutsch), Zahlen über `casoraNum`/`toLocaleString(casoraLocale())`.
