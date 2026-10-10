# Design-Regeln

Gilt für Dashboard (Kacheln, Badges, Popups, Menüs, Handy) und – wo genannt – Studio. Maßstab ist das
Theme **„Casora“** (`custom_components/casora/theme_weich.yaml`), hell und dunkel. „Hemma 2“/„Hemma 1“
(Standard-Look für umgezogene Häuser) und „Casora Nebel“ müssen weiter funktionieren, bestimmen aber
nicht das Maß.

Grundsatz: **Werte kommen aus Theme-Variablen oder aus den Kern-Bausteinen**, nicht als feste Zahl
im neuen Code. Wo ein fester Wert nötig ist (Rückfallwert in `var(--x, …)`), nimmt man den Wert der Variable.

---

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

> **OFFEN – Entscheidung Maintainer (DP-16, Zeilenradius in Popups):**
> A: Zeilen-Platte bleibt 24 (heute) / B: konzentrisch zum Symbolkreis 29 (= Pille bei 58 px Zeilenhöhe).
> Bilder: Feinschliff-Notizen `d-popups/bilder/ab_DP16_*`. Bis zur Wahl: 24.

**Entschieden 1.3 (dk-10):** Räume-/Szenen-Blatt am Handy Radius **34** = Zeilen-Pille 26 + Listenrand 8
(konzentrisch, `04-navigation.js`).

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
| Etikett (Abschnittskopf im Popup) | 12/700, Großbuchstaben, `letter-spacing: .1em` |
| Unterzeile | 13/500 |
| Wert in Zeile | 14/600 |
| Zeile | 15/500 bzw. 15/700 |
| Status unter dem Popup-Titel | 17/700 |
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

> **OFFEN – Entscheidung Maintainer (Abschnittsköpfe, Sprachen-Frage 1):**
> A: Etikett überall (12/700 Großbuchstaben), Satz-Überschrift nur auf Seitenebene /
> B: Satz-Überschrift (17/700) überall. Heute drei Stile (Popup-Etikett, Handy „Favoriten“ 17/700, Studio „Optionen“ 15/600).

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

> **OFFEN – Entscheidung Maintainer (DP-15):** Ringfarbe = Zustand überall (z. B. „Alle Akkus OK“
> nicht rot, „Fehlgeschlagen“ nicht grau)? A: ja, Ring folgt Zustand / B: Ring bleibt Gerätefarbe.

## 6. Symbolkreise

Gilt (heute gemessen): Popup-Ring 78 (Handy 66) · Kachelkreis 44 (Tablet 38, Handy 42) · Zeilenkreis 38 ·
Badge 28–30 · Knopf 48 · Status 22 · Menü 32 (`--casora-menu-ic-size`). Symbol ≈ 50 % des Kreises.
Eigene SVG-Symbole über `mask-image` (`/casora_assets/icons/<name>.svg`), neue Namen in
`CASORA_EXTRA_ICONS` (`casora-panel-types.js`) eintragen.

Neue Kreisgrößen außerhalb dieser Liste nicht einführen (heute 13 Größen in Popups – Altlast).

> **OFFEN – Entscheidung Maintainer (DP-17):** Symbole auf hellen Akzentkreisen unter 3:1
> (Weiß auf Gelb 1,96:1). A: Markenfarben lassen / B: dunkle Tinte auf Gelb/Hellgrün, Aus-Symbol .55→.7.

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

> **OFFEN – Entscheidung Maintainer (Druck-Skala):** Vorschlag `scale(.97)` + Platte .16, 120 ms für alle
> Tasten; heute 49 verschiedene Skalen (.86–.985). Bis zur Wahl: die Skala der Nachbarn übernehmen.

## 9. Aktive Zeilen und Auswahllisten

Gilt:
- Auswahl (Modus, Programm, Profil) **ohne Haken**: aktive Zeile hinterlegen, Symbol in Farbe, inaktive
  Symbole grau. Baustein: `window._casoraSelRows(UI.group(rows, titel), aktivesLabel)` (`01-basis.js`).
- Auf hinterlegter (heller) aktiver Zeile erben Pfeil, Schalter und Symbol die Schriftfarbe der Zeile
  (Funde DP-04/DP-06: Schalter 1,15:1, Pfeil 1,09:1 im Dunkeln).

> **OFFEN – Entscheidung Maintainer (DP-07, „aktiv“ im Dunkeln):** A: Creme-Platte überall (wie Licht,
> Jalousie, Schloss) / B: aufgehelltes Braun (wie Alarm-Modus, Batterien). Popup-Entwurf A/B/C schlägt
> „Creme/Sand 14 %“ für alles vor.

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
Kreise/Flächen bleiben `--casora-color-red`. **(DP-30)** Pfeil › in Zeilen: A Deckkraft .35/.4 lassen /
> B .6 (≥ 3:1).

## 12. Trefferflächen

- Handy: jede Taste **≥ 40 px** (Navigationsleiste ≥ 48). Kleine sichtbare Knöpfe vergrößern die
  Fläche unsichtbar mit `::before { inset: -Npx }` – Optik bleibt (Fund DP-02: Szenen-Chips 38, Kalender-Pfeile 32).
- Nichts Antippbares näher als 8 px an einer anderen Taste ohne Abstand dazwischen.

## 13. Popup-Aufbau (Kurzfassung, Details in [blaupause-popup.md](blaupause-popup.md))

Gilt:
- Breit: `--popup-min-width: 900px; --popup-max-width: 920px` (auch kleine Steuer-Popups).
- Ab 761 px: Kopf (Ring, Titel, Status) mittig über volle Breite → Diagramm/Kamera/Karte volle Breite →
  zwei Spalten, **links Bedienung** (Modus mit Überschrift „Modus“ oben links, Programme, Schalter,
  Aktionen), **rechts Infos** (Status, Messwerte, Verbrauch, Verlauf).
- Handy (≤ 760): eine Spalte, Reihenfolge Kopf → Diagramm → Modus → übrige Bedienung → Infos.
- Überschriften **pro Popup** einheitlich: Bedien-Popup (Sheet) alle außen über der Platte,
  Info-Popup (Glasplatten) alle innen (`--casora-lbl-in: block; --casora-lbl-out: none`).

> **OFFEN – Entscheidung Maintainer (Popups neu gedacht, A/B/C):** A „Kopfzeile“ (Kopf links in einer
> Zeile, Hauptschalter + X rechts, darunter der heutige Zweispalten-Standard) / B „Bühne“ (Kopf mittig,
> Hauptregler groß über volle Breite) / C „Blatt“ (eine Spalte überall). Dazu: Zimmer-Kachel statt Kreis?
> Schalter in Gerätefarbe statt Ton? Vergleich: Feinschliff-Notizen `popup-neu/vergleich.html`.
> Bis zur Wahl gilt der heutige Standard oben.

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
