# Auftrag: Popup-Rework (ein Look and Feel für alle Popups)

Arbeitsanweisung für eine eigene Claude-Code-Sitzung. Stand 27.10.2026, nach 26.10.63.
Ziel in einem Satz: **Jedes Casora-Popup sieht aus und fühlt sich an wie aus einem Guss** – gleiche Abstände, gleiche
Teile, gleiche Bewegung, passend zum Casora-Design (Theme „Casora“/Weich), statt wild zusammengewürfelt.

## Warum

Casora ist in wenigen Wochen stark gewachsen: viele neue Kacheln, Badges und Popups, jedes einzeln angepasst. Die
Blaupause v2 (siehe unten) hat den Aufbau vereinheitlicht, aber das Ergebnis wirkt noch nicht wie ein System. Beispiele aus
den Tests vom 26./27.10.2026:

- Abstände und Höhen unterscheiden sich von Popup zu Popup (Kopf zu erster Überschrift, Überschrift zu Platte, Platte zu Platte).
- Zweispaltige Popups mit falscher Breite (Gruppen in 552 statt 900), Spalten nicht auf einer Linie.
- Popups springen beim Öffnen (Statuszeile, Diagramme, Spaltenausgleich), das X war zeitweise ausgegraut.
- Dasselbe Ding öffnet je nach Weg ein anderes Popup (Jalousien-Kachel gegen Jalousien-Unter-Badge, Sicherheits-Badge am
  Desktop gegen Handy). Es soll immer **ein** Popup sein, das man an **einer** Stelle einstellt.
- Farben für „Achtung“ (offen, entriegelt, schlecht) waren nicht überall gleich.

## Pflichtlektüre vor dem ersten Schritt

1. `CLAUDE.md` im Repo (Stil, Vorlagen bauen, Prüfungen, Version, nichts Persönliches).
2. `docs/handbuch/popup-blaupause.md` – Muster v2, Regeln 1–12, Entscheidungen, Ausnahmen, Bausteine `window._casoraUI`.
3. `docs/handbuch/design-regeln.md` – Tokens, Radien, **Abstände (§2)**, Schrift, Farben, Symbolkreise, Bewegung.
4. `docs/handbuch/blaupause-popup.md`, `wortliste.md`, `regeltests.md`, `test-und-release.md`.

Was dort entschieden ist, gilt. Was dort „OFFEN“ ist, wird in Phase 1 als Frage an den Maintainer gestellt, nicht selbst entschieden.

## Phase 1: Varianten (zuerst, mit Kostendeckel)

Liefere **3 Varianten** für ein einheitliches Popup-System. Jede Variante ist ein durchdachtes Ganzes, keine Einzelideen:

- **A – Feinschliff:** Muster v2 bleibt, aber ein strenges Raster: feste Abstands-Skala (z. B. 4/8/12/16/24/32), eine
  Kopfhöhe, ein Abstand Kopf→Inhalt, eine Platten-Höhe je Zeilenart, gleiche Überschriften-Abstände.
- **B – Ruhiger:** wie A, dazu weniger Platten (Gruppen statt einzelner Kacheln), mehr Luft, Überschriften kleiner, Fokus auf den Hauptbereich.
- **C – Eigenständiger Casora-Stil:** Popups näher am Look der Kacheln und Badges (Weich-Theme), z. B. andere Kopf-Gestaltung,
  Platten-Stil, Akzentfarben – deutlich sichtbar anders, aber umsetzbar mit den vorhandenen Bausteinen.

Für jede Variante dieselben **4 Popups** zeigen: **Licht (Raum)**, **Thermostat/Fußbodenheizung (Gruppe)**,
**Sicherheit (Übersicht)**, **Energie (mit Energiefluss)** – jeweils **Desktop 1440 und Handy 393, hell und dunkel**.

So bauen: im eigenen Worktree auf einem Zweig von `main` (`popup-rework-varianten`), die Varianten über einen Schalter
in den Bausteinen (`_casoraUI`, Popup-CSS in `casora-core.js`), im Wegwerf-HA (`dev/haus.sh`) fotografieren. Keine
Änderungen an Vorlagen nötig, wenn es über die Bausteine geht; sonst nur auf dem Zweig.

**Abgabe:** ein PDF `Casora-Popup-Varianten.pdf` (auf Seite 1: kurze Beschreibung jeder Variante, was anders ist und
warum, Vor- und Nachteile, offene Fragen), danach pro Variante die 4 Popups, Vorher (heute) gegen Nachher. Dann
**anhalten und auf die Wahl des Maintainers warten.**

**Kostendeckel Phase 1:** etwa 40 $. Lieber 3 klare Varianten an 4 Popups als viele halbe.

## Phase 2: Umbau (erst nach der Wahl)

- Die gewählte Variante als **Regeln** ins Handbuch schreiben (`popup-blaupause.md` und `design-regeln.md` §2
  Abstände), als Tokens/Bausteine umsetzen, dann **alle** Popups darauf umstellen. Popups bauen keine eigenen Abstände,
  Breiten oder Kopf-Varianten mehr, sondern nehmen die Bausteine.
- **Ein Popup pro Ding**: Kachel, Badge, Unter-Badge und Zeilen in anderen Popups öffnen dieselbe Popup-Konfiguration.
- Regeltests erweitern, damit Abweichungen auffallen: `dev/unit/popup_blaupause.mjs`, `design_zaehler.mjs`,
  `dev/qa/popup-raender.mjs --spalten` (Breite), `popup-geo.mjs`/`ausrichtung.mjs` (Raster), `r369` (kein Springen,
  X voll sichtbar), `r357` (Symmetrie). Neu: ein Raster-Test, der Abstände gegen die Skala misst.
- Vorher/Nachher-PDF für jedes umgebaute Popup (Desktop und Handy).

## Was nicht kaputtgehen darf

- **Kein Springen** beim Öffnen (Popup erst zeigen, wenn alles sitzt; Einblend-Animation danach, nur opacity/transform).
- **Symmetrie** zweier Spalten (Regel 12), Breite 552 einspaltig / 900 zweispaltig oder Bild.
- **Am iPhone (WebKit) prüfen**, nicht nur Chrome (das graue X war nur in WebKit).
- Hell, dunkel, alle Themes (Casora/Weich, Standard, Glas); Fahrenheit; 8 Sprachen (Texte deutsch im Code, Übersetzungen in den Phrasen-Dateien).
- Ampelfarben für Zustände wie seit 26.10.63 (grün/orange/rot, „Achtung“-Ton für offen/entriegelt).

## Ablauf und Regeln

- Eigener Worktree, eigener Zweig. **Nicht** in Prod kopieren, **nicht** pushen, **keine** GitHub-Kommentare oder -Releases.
- Kleine Commits, Kommentare im Code englisch. Prüfungen vor jedem Commit: `check-templates` 0, `html-escape-check` 0,
  `i18ncheck`, Regeltests grün.
- Fertige Schritte meldet die Sitzung mit Commit und kurzem Satz; der Maintainer spielt sie selbst in sein Haus ein und testet
  mit Ja/Nein. Das volle Gate läuft erst vor dem Release.
- Fragen an den Maintainer kurz, mit Bild, Empfehlung zuerst.

## Start der Sitzung

Mit API-Schlüssel (Console, Ausgabenlimit gesetzt), Modell Fable 5.1, im Repo-Ordner:

```
Lies docs/handbuch/popup-rework-auftrag.md und führe Phase 1 aus.
```
