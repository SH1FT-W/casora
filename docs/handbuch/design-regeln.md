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
als Rückfallwert `var(--casora-r-row, 24px)` – der Rückfallwert ist der **alte** Wert, damit Hemma 1/2 (die die
Tokens nicht setzen) unverändert bleiben. Umgestellt sind Popups (1.3, um-popups) und seit um-tokens auch
Kacheln, Badges, Raumkarten, Menüs (Glocke, ⋯, Räume, Szenen, Raumleisten-Menü), Navigationsleisten und Studio.

| Gruppe | Variablen | Werte |
|---|---|---|
| Radien | `--casora-r-window` · `-surface` · `-row` · `-element` · `-small` · `-pill` | 44 · 32 · 24 · 18 · 12 · 999 px |
| Abstände (4er-Raster) | `--casora-space-1` … `-10` (1,2,3,4,5,6,8,10) | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 px |
| Schrift | `--casora-fs-label` · `-sub` · `-value` · `-row` · `-heading` · `-title` · `-page` | 12 · 13 · 14 · 15 · 17 · 28 · 34 px |
| Symbolgrößen (6) | `--casora-ic-head` (Handy `-head-phone`) · `-tile` · `-row` · `-badge` · `-button` · `-status` | 56 (48) · 44 · 36 · 28 · 48 · 22 px |
| Schatten (3 Stufen, hell + dunkel) | `--casora-shadow-rest` · `-raised` · `-float` | Ruhe (Platte, aktive Zeile) · gehoben (Hover/aktiv) · schwebend (Popup, Menü) |
| Bewegung | `--casora-ease-enter` + `--casora-dur-enter` · `--casora-ease-slide` + `--casora-dur-slide` · `--casora-dur-feedback` + `--casora-ease-feedback` | (.2,.8,.3,1) 320 ms · (.36,0,.16,1) 360 ms · 160 ms `ease` |
| Menüs (abgeleitet) | `--casora-menu-row-radius` = Kreis/2 + Rand · `--casora-menu-radius` = Zeile + Rand · `--casora-menu-pad` | 18 + 8 = **26** · 26 + 8 = **34** · 8 px |
| Druck | `--casora-press-scale` | `.97` auf Tasten (`transform: scale(var(--casora-press-scale, .97))`) |
| Aktive Zeile (DP-07) | `--casora-soft-row-active` · `-active-shadow` · `-active-ink` · `-active-sub` | hell Creme + Ruhe-Schatten; dunkel Sand 14 %, helle Schrift |
| Symbol auf Akzent (DP-17) | `--casora-on-accent-ink` | dunkle Tinte, wo Weiß unter 3 : 1 hat (Gelb, Orange, Grün) |
| Popup-Akzent | `--casora-popup-accent` · `--casora-popup-accent-ink` | vom Rahmen je Popup gesetzt = Gerätefarbe der Kachel (Schalter, Kopf-Kachel, aktive Symbole) |

Symbol-Kacheln (abgerundetes Quadrat statt Kreis, Popups seit 1.3): Radius ≈ 30 % – Kopf 56/16, Handy 48/14,
Zeile 36/12 (`--casora-soft-icon-size`, `--casora-soft-icon-radius` im Popup-Rahmen). Startseite zieht nach.

**Gilt jetzt überall (um-tokens, 1.3) – im Casora- und Nebel-Look:**

| Fläche | Was die Tokens setzen |
|---|---|
| Kacheln | Radius Fläche 32 (Desktop, Tablet, Szenen-Kacheln; Handy 62 hoch → rundet als Pille 31, konzentrisch zum Kreis 42 + 10 Rand), Innenabstand Desktop/Tablet 20 (Handy 10, dk-05), Zustand 14 (`--casora-fs-value`, Handy 12), Ruhe-/gehoben-Schatten (`--button-card-box-shadow*` zeigen auf `--casora-shadow-rest/-raised`, Handy ebenso), Reihenabstand 12 / Handy 8 |
| Badges | Pille, Ruhe-Schatten (auch Handy), Auftritt-/Breiten-Bewegung über `--casora-badge-enter-ease` / `--casora-badge-flip-ease` (Auftritt / Schieber) |
| Menüs (Glocke, ⋯, Raumleisten-Menü, Räume/Szenen am Handy, Welle) | Fenster 34, Zeile 52 hoch mit Radius 26, Kreis 36, Rand 8, Schrift 15/13, Schatten „schwebend“ (`--casora-window-shadow` → `--casora-shadow-float`), Auftritt-Kurve, Druck `.97`. Zeilen ohne Platte (E3c). |
| Navigationsleisten | Raumleiste/Handy-Leiste: Fläche + Ruhe-Schatten (`--casora-pill-rim` → `--casora-shadow-rest`), Markierung als Schieber (`--casora-nav-indicator-ease/-duration`), Tasten-Druck `.97`. Maße der Leisten bleiben (Raumleiste A, Handy-Leiste B). |
| Studio | `--t-*` = Schrift-Tokens (Titel 22 bleibt), `--r-s` 8 → 12, `--r-m` 12, `--r-l` 18, `--r-xl` 26 → 32 (Karten, Blätter, Vorschau-Rahmen), `--ease` = Auftritt, CSS-Kurven und Knopf-Druck aus den Tokens. Schrift bleibt SF (Inter nur als Entwurf, OFFEN). |

Ausnahmen (bewusst, mit Grund): Animationen per `element.animate()` (WAAPI) können keine CSS-Variable lesen und
behalten ihre Kurve; die Desktop-Badges wachsen mit `--casora-u-badge` (Schrift u·1,4, Unterzeile 12,32 – feste
Token-Größen würden das Mitwachsen abschalten); Handy-Badges bleiben 40 hoch mit 12,5/11 (AB-03); Raumleiste A
(Kapsel 46 = 40 + 2 × 3) und der aktive Raum mit eigenem Schatten (`--casora-nav-tab-active-shadow`) bleiben wie
entschieden; Kachelkreis Tablet 38 / Handy 42 (dk-05); Uhr 16 (A-11); Studio-Werkzeugleiste (29 breit, Radius 11)
und weitere ~120 feste Radien im Studio sind noch nicht umgestellt (Liste im Bericht um-tokens).

## 1. Radien

Gilt (gemessen, Kern-Popups halten das zu 98–100 %):

| Stufe | Wert | Wo | Variable |
|---|---|---|---|
| Fenster | 44 px | Popup/Sheet | `--casora-popup-radius` |
| Fläche | 32 px (auch Handy und Szenen-Kachel, seit um-tokens) | Kachel, Szenen-Kachel, Studio-Karte | `--casora-r-surface` (über `--ha-card-border-radius`, `--casora-tile-radius-phone`, `--casora-scene-tile-radius`) |
| Zeile | 24 px | Zeilen-Platte im Popup, Menüzeile | `--casora-popup-row-radius` |
| Element | 18 px | Segment, Feld in einer Zeile | `--ha-border-radius-lg` |
| klein | 12 px | Eingabe, Tooltip | – |
| Pille | `999px` | Badge, Chip, Knopf mit Text | – (nicht `9999px`/`99px` neu schreiben) |
| Kreis | `50%` | Symbolkreis, Ring | – |

Regel **konzentrisch**: innerer Radius = äußerer Radius − Abstand (±2 px). Bei Pillen gilt die halbe
Höhe: `min(Radius, Höhe/2)`. Beispiel Handy-Leiste: Leiste 60/Radius 30, Polster 6, Taste 48/Radius 24 ✓.

Bekannte Abweichungen (nicht nachbauen): Pulse-Popup setzt `--casora-popup-row-radius: 26px`, Kamera-Bildplatte 28,
HA-Dialog 36. (Glocke/⋯-Menü 28 sind seit um-tokens 34 wie das Räume-Blatt.)

Gilt (DP-16, entschieden 10.10.2026, „Zeilen konzentrisch“): Popup-Zeile 60 hoch, Radius 24, Symbol-Kachel
36/r12 mit 12 px Rand ringsum → 12 + 12 = 24 konzentrisch. Variablen im Popup-Rahmen: `--casora-soft-row-h`,
`--casora-soft-row-pad`, `--casora-soft-icon-size`, `--casora-soft-icon-radius`.

**Entschieden 1.3 (dk-10):** Räume-/Szenen-Blatt am Handy Radius **34** = Zeilen-Pille 26 + Listenrand 8
(konzentrisch, `04-navigation.js`). **Seit um-tokens für alle Menüs** (Glocke, ⋯, Raumleisten-Menü, Welle):
`--casora-menu-radius` = `--casora-menu-row-radius` (Kreis 36 / 2 + Rand 8 = 26) + Rand 8. Ein Fenster mit
Fläche 32 ginge nicht konzentrisch auf (32 − 8 = 24 ≠ 26).

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

**Entschieden 1.3 (dk-05):** Symbolkreis in der Kachel ringsum gleich – Desktop/Tablet oben = links
(Casora: `casora-tile-icon-mt-desktop: 0px`), Handy 10/10 (`casora-entity-inner-pad-mobile: 10px`,
Szenen-Kacheln `casora-scene-chip-pad-phone: 10px`). Hemma 2 unverändert.

**Entschieden 1.3 (dk-06):** Überschriften am Handy fluchten überall bei 16 px mit Kacheln und Titel
(auch die Raumseite, früher +2).

## 3. Schatten

Gilt: nur Theme-Variablen, kein neues `box-shadow: 0 … rgba(…)` im Code.

| Stufe | Variable |
|---|---|
| Ruhe (Kachel, Platte, Leiste, Badge) | `--casora-shadow-rest` – `--button-card-box-shadow(-mobile)`, `--casora-pill-rim`, `--ha-card-box-shadow` zeigen darauf |
| gehoben (aktiv / Hover) | `--casora-shadow-raised` – `--button-card-box-shadow-active(-mobile)`, `--button-card-box-shadow-hover` |
| schwebend (Popup, Menü, Glocke) | `--casora-shadow-float` – `--casora-window-shadow`, `--casora-notify-shadow`, `--casora-mnav-menu-shadow` (`--dialog-box-shadow` hat denselben Wert) |
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
> Stand 1.3: Entwurf „Studio in Inter“ als Bild (Feinschliff-Notizen `um-rest/bilder/studio-schrift-*`), nicht umgesetzt.

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

**Entschieden 1.3 (dk-17, P-V8):** Szenenfarbe aus dem Studio **überall immer** (Badge, Szenen-Kacheln,
Handy-Szenen-Menü), auch wenn die Szene nicht läuft. Die **laufende** Szene ist zusätzlich leicht in ihrer
Farbe getönt (`--casora-scene-on-tint`, 18 %).

Gilt (DP-15, entschieden: Ring folgt Zustand): Die Kopf-Kachel zeigt die Farbe, die die Kachel gerade zeigt
(Zustand), aus = Sand; Fehler/fehlgeschlagen = Rot; nicht verfügbar/unbekannt = Sand. Ein Modul, das den
Zustand selbst kennt, setzt ihn über `window.casoraRingHue(src, key)` (siehe Blaupause Popup).

## 6. Symbolkreise

Gilt: Popup-Kopf-Kachel 56 (Handy 48) · Kachelkreis 44 (Tablet 38, Handy 42) · Zeilen-Kachel im Popup 36 ·
Badge 28–30 · Knopf 48 · Status 22 · Menü 36 (`--casora-menu-ic-size` = `--casora-ic-row`, seit um-tokens auch im Raumleisten-Menü). Symbol ≈ 50 % der Fläche. In Popups
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
- Keine neuen Kurven. Seit um-tokens nehmen Kacheln, Badges, Menüs, Leisten und Studio-CSS die Token-Kurven
  (`var(--casora-ease-enter, <alter Wert>)`); Federn/Studio-Kurve gibt es nur noch als Rückfallwert (Hemma) und in
  `element.animate()`-Aufrufen (dort geht keine CSS-Variable).

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

Gilt (Druck-Skala, entschieden): `scale(var(--casora-press-scale, .97))` auf Tasten – Popups, Menüzeilen (Räume/Szenen
am Handy, „Alles gelesen“), Tasten der Handy-Leiste, Zurück-Knopf der Handy-Raumseite, Szenen-Kacheln, Studio-Knöpfe.
Kacheln selbst haben weiter keinen Druck (Regel oben).

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

**Entschieden 1.3 (dk-08):** Rot für Schrift auf Creme ist `--casora-color-red-text` (#A8443A, 4,9:1);
Kreise/Flächen bleiben `--casora-color-red`. **Pfeil › in Zeilen (DP-30):** entschieden B, Deckkraft .6
(`--casora-chev-opacity`), Strich in Text 1.

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

## 15. Raumleiste und Navigationsleiste (entschieden 10.10.2026, Casora 1.3)

Desktop/Tablet – Raumleiste A „Feinschliff“ (`casora-nav-bar`, Tablet-Fassung in `casora-core.js`):
- Zuhause steht **fest vorn** (Haus-Kreis 30, aktiv in Ton mit weißer Glyphe), dahinter Trenner 1 × 22.
- Räume **seitenweise, nur ganze Namen** – nie mitten im Wort abschneiden, nie Text unter einem Pfeil.
  Die Pfeile ‹ › sind Endkappen (30, Sand) neben den Namen; ohne Weiteres in der Richtung blass.
  Wenig Rest auf einer Seite → Namen gleichmäßig verteilen, viel Rest (letzte Seite) → mittig.
  Sehr schmal (< 260 px für die Räume, Tablet mit offener Seitenleiste): Zuhause nur als Haus-Kreis.
- **Nichts wandert**: Antippen eines sichtbaren Raums verschiebt weder Zuhause noch andere Namen;
  die Leiste behält beim Blättern ihre Breite. Nur wenn der aktive Raum nicht zu sehen ist (Raumwechsel
  von woanders), springt sie einmal auf seine Seite. Mausrad/Wischen blättert seitenweise.
- Aktiver Raum: weiße Pille mit dem Handy-Schatten (auch hell gut sichtbar), Schrift unverändert.
- Glocke, Sprechblase und ⋯ in **einer Kapsel** (46 hoch = Knopf 40 + 2 × 3, Fläche/Schatten wie die
  Leiste, Trenner vor ⋯); nur mit ⋯ (Casora-verwaltet) und nur in Designs mit `--casora-chrome-capsule-fill`.
  Prüfung: `dev/qa/regress/r230_raumleiste_ganze_namen.mjs`, `r150_raumleiste_pfeil.mjs`, `r91` (Kapsel).

Handy – Navigationsleiste B (`casora-mobile-nav`, nur Casora/Nebel):
- Glocke (und Sprechblase) und ⋯ sitzen **rechts unten in der Leiste** hinter einem Trenner; oben bleiben
  nur Titel und Wetter (Kopf rückt über `--casora-mhead-reserve` hoch).
- Alle Tasten 50 × 48 mit Sand-Kreis 36; die aktive Taste ist die weiße Pille **ohne Namen** – der Name
  steht schon groß als Seitentitel darüber (kein doppeltes „Zuhause“).
- Menüs der Leisten-Knöpfe öffnen nach oben (`casoraMenuGlass.enter` dreht sie um, wenn unten kein Platz ist).
