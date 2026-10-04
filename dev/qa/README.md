# Qualitäts-Gate

Kein Release und kein Karten-Update ohne grünes Gate für genau den Commit, der raus geht.
`tools/release.sh` und `tools/build-card-update.py` prüfen das selbst und verweigern sonst.

## Was das Gate prüft

`dev/qa/gate.sh` prüft (Reihenfolge und Parallelität siehe „Ablauf und Parallelität“):

1. **Statisch** (Sekunden)
   - `node --check` für alle Panel-/Skript-Dateien und Testskripte
   - Python-Syntax aller Integrations- und Werkzeugdateien (Python 3.14 via `uv`)
   - alle `[[[ … ]]]`-Ausdrücke der Kartenvorlagen per `new Function` (`dev/qa/check-templates.mjs`)
   - JSON gültig (Übersetzungen, manifest, Vorlagen)
   - `tools/privacy-check.py` (ganzes Repo), `tools/sync-changelog.py --check`
2. **Unit-Tests** `dev/unit/*` (ohne HA; `--with …` aus der Aufrufzeile des Tests wird übernommen)
3. **Test-HA** (Docker `casora-test`), je Zustand mit dem aktuellen Checkout eingespielt:
   - **arbeit**: zuerst legt `stress-setup.mjs --name qa-arbeit --state arbeit` ein Prüf-Dashboard
     über den echten Studio-Ablauf an; dann E2E-Reihe t01–t19 (Liste aus `dev/e2e/alle.sh`),
     Regressionstests `@zustand: arbeit` (mit `CASORA_QA_DASH=qa-arbeit`) und schneller
     Klick-Durchlauf (`alles.mjs --quick --dash qa-arbeit`) gleichzeitig.
     Die Hemma-Fixture `dashboard-hemma(-mobile)` ist speichergesperrt und von der automatischen
     Vorlagen-Auffrischung ausgenommen (alte Vorlagen) – sie wird für Produktprüfungen nie gewählt.
   - **stress**: `dev/qa/stress-setup.mjs` (Dashboard `qa-stress`), voller Klick-Durchlauf
     (`dev/qa/alles.mjs`), Regressionstests `@zustand: stress`
   - **frisch**: Regressionstests `@zustand: frisch` (auch Tests ohne Angabe) – zuletzt, so ist
     frisch zugleich der Endzustand (ohne Regress-Schritt: nur zurück auf frisch)

Ergebnis: `.qa/gate-<commit>.json` (Commit, Zeit, je Schritt ok/fehlgeschlagen, Protokollpfad),
Protokolle unter `.qa/logs/<commit>/` (je Schritt wie bisher; Einzelteile unter `teile/`,
Zeitplan je Zustand in `zeiten-<zustand>.log`), Zusammenfassung am Ende, Rückgabe ≠ 0 bei jedem Fehler.

## Ablauf und Parallelität

- **Umschalten**: `dev/haus.sh <zustand> --no-wait` spielt den Checkout ein und startet HA, dann
  `dev/haus.sh wait`. „Bereit“ ist nicht mehr eine feste Pause, sondern `dev/qa/bereit.mjs`:
  Anmeldung + WebSocket, HA meldet `RUNNING`, 4 s ohne Aufbau-Ereignisse (Integration geladen,
  Dienst/Entität/Dashboard neu – Casora richtet nach dem Start Helfer ein und frischt Vorlagen auf),
  `casora/settings/get` antwortet. Ohne node/Zugang wie früher 15 s Pause. Ist ein Zustand schon
  aktiv, startet `haus.sh sync --if-changed` nur neu, wenn sich der eingespielte Stand seit dem
  letzten Start geändert hat (Prüfsumme in `~/casora-haus/geladen`).
- **Statisch + Unit** laufen im Hintergrund, sobald der Checkout eingespielt ist (die i18n-Dateien
  sind dann gebaut) – also während HA startet.
- **Je Zustand** führt `dev/qa/pool.mjs` E2E, Regress und Klick-Durchlauf mit bis zu `--jobs N`
  Browsern gleichzeitig aus (Standard 4, `--jobs 1` = nacheinander). Der Klick-Durchlauf läuft je
  Viewport in zwei Prozessen (`--only studio` / `--only dashboard`), `alles.mjs --merge` führt die
  Teilberichte zu einem `bericht.json/.md` im gewohnten Format zusammen.
- **Sperren** – was nicht gleichzeitig laufen darf:
  - `ui`: gemeinsamer HA-Zustand – UI-Helfer (aufgeklappte Reihe, Overlays), Mock-Szenario,
    `fakeStates` und Antippen im Dashboard. Dashboard-Teile des Klick-Durchlaufs, Regressionstests
    mit `dashboard(…)`/`fakeStates(…)`, t10 (Szenario) und t14 (tippt an) laufen nie gleichzeitig.
  - `dash`: t02/t03/t07 legen Dashboards an, t19 wertet „neue Dashboards“ aus und löscht sie.
  - `settings`: t18 vergleicht Casora-Einstellungen, t19 schreibt sie.
  - Reihenfolge rund um `test-neu` wie in `alle.sh`: t03 → (t04, t08) → t05 → t06 → t10 → t14.
  - Das Mock-Szenario aus t10 (`drucker_druckt`) wird vorab gesetzt – Regress und Klick-Durchlauf
    sehen dasselbe wie früher nach der E2E-Reihe.
- Neuer **E2E-Test** ohne Regel in `E2E_RULES` (pool.mjs) läuft sicherheitshalber allein.
  Neuer **Regressionstest**: ohne Angabe gilt `ui`, wenn er ein Dashboard öffnet oder Zustände
  unterschiebt, sonst frei; sonst `// @parallel: ui | frei | allein` in die ersten Zeilen
  (`erststart` ist `allein` – legt im Zustand frisch `qa-start` an).
- **Zeiten**: jede Zeile zeigt Dauer und Gate-Uhr (`@m:ss`); gemessene Zeiten je Teil landen in
  `.qa/zeiten.json` und dienen `--dry-run` und der Reihenfolge (längster Restpfad zuerst) als Schätzung.
- Die Klick-Durchlauf-Berichte zählen jetzt auch „UI-Helfer gesetzt“ – setzt ein Studio-Teil dort
  etwas, gehört er ebenfalls unter die Sperre `ui`.

## Aufruf

```sh
dev/qa/gate.sh                 # vollständig – nur das zählt für Release/Karten-Update
dev/qa/gate.sh --dry-run       # Plan zeigen (mit Parallel-Plan und Zeitschätzung), nichts ausführen
dev/qa/gate.sh --jobs 2        # höchstens 2 Browser/Tests gleichzeitig (Standard 4)
dev/qa/gate.sh --quick         # ohne Stress-Zustand und vollen Klick-Durchlauf
dev/qa/gate.sh --only static   # nur ein Schritt: static | unit | e2e | regress | crawler
dev/qa/gate.sh --no-switch     # Test-HA nicht umschalten, nur Tests des aktiven Zustands
```

Das Gate übernimmt das Test-HA (schaltet Zustände, startet neu). Laufen gerade andere Tests
dagegen, erst absprechen oder `--only static`/`--only unit` nutzen.
Anmeldung: automatisch über `dev/qa/token.mjs` (Zugang aus `CASORA_USER`/`CASORA_PASS`
oder `~/casora-haus/ZUGANG.txt`, nichts davon im Repo).

**Dauer** (grob, zuletzt nacheinander 33 min): Zustandswechsel ~15–25 s, arbeit ~5 min (E2E,
Regress, schneller Klick-Durchlauf gleichzeitig), stress ~8 min (voller Klick-Durchlauf, höchstens
8 Räume/Ansichten, Raum-Editoren nur am Desktop gründlich; mehr mit `--rooms n`; Engpass sind die
Dashboard-Teile unter der Sperre `ui`), frisch ~0,5 min. Vollständig etwa **15 min**, `--quick`
etwa **6–7 min**. `dev/qa/gate.sh --dry-run` rechnet mit den zuletzt gemessenen Zeiten.

Danach, wenn alles grün und committet ist:

```sh
tools/release.sh 0.6.0            # prüft Gate, CHANGELOG, manifest, WHATS_NEW; zeigt die Befehle
tools/release.sh 0.6.0 --publish  # führt Tag, Push und gh release create aus
python3 tools/build-card-update.py --note casora_x="…"   # Karten-Update, ebenfalls nur mit grünem Gate
```

Jede Änderung nach dem Gate (auch nur CHANGELOG) heißt: committen, Gate neu.

Ausgeliefert wird automatisch: Die GitHub-Releases sind die Quelle. Casora fragt die
öffentliche GitHub-API anonym nach neuen `v…`-Releases und `karten-…`-Paketen (alle 6 Stunden),
HACS-Installationen bekommen neue Versionen über HACS – kein eigener Schritt.

## Neuer Fehler gemeldet → neuer Regressionstest

Jeder vom Nutzer gemeldete Fehler bekommt einen kleinen Test in `dev/qa/regress/`, damit er
nicht wiederkommt:

1. Datei `rNN_kurzname.mjs` anlegen (nächste freie Nummer). Erste Zeile: der Zustand, in dem
   der Test die nötigen Daten findet:
   ```js
   // @zustand: arbeit        (frisch | arbeit | stress)
   // Gemeldet: <was der Nutzer gesehen hat>. Erwartet: <richtiges Verhalten>.
   import { open, studio, casoraDashboard, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';
   ```
2. Mit `need(…)` die Voraussetzung prüfen (z. B. Dashboard mit Szenen-Badge) – fehlt sie,
   ist der Test rot statt still übersprungen.
3. Mit `check('was stimmen muss', bedingung, info)` prüfen; bei Fehlern entsteht ein Bild
   unter `/tmp/casora-qa/`. Am Ende `await finish()` – druckt `PASS name` bzw. `FAIL name`.
4. Nichts in HA speichern. Zustände lieber mit `fakeStates(page, {...})` nur im Browser
   unterschieben, Studio-Änderungen nur im Speicher lassen.
5. Erst gegen den **alten** Stand laufen lassen (muss FAIL sein), dann gegen den Fix:
   ```sh
   CASORA_LOCAL=1 node dev/qa/regress/rNN_kurzname.mjs   # Panel/Skripte aus dem Checkout
   ```

Hilfen in `lib.mjs`: `casoraDashboard(pred)` findet ein passendes Casora-Dashboard (samt
Handy-Gegenstück), `studio(page, url)` lädt es im Studio, `dashboard(page, url)` öffnet eine
Ansicht, `cards(page, vorlage)` liefert sichtbare Karten mit Lage und Text,
`CASORA_QA_DASH=<url>` gibt das Dashboard vor.

### Bestehende Regressionstests

| Test | Zustand | Fehler |
|---|---|---|
| r01_studio_szenen_badge | arbeit | Szenen-Badge in der Studio-Vorschau klappt nicht auf |
| r02_unterbadges_scrollen | stress | Unter-Badges bei Überlauf nicht verschiebbar (Mausrad/Ziehen, Wischen) |
| r03_updates_zugang_einmal | frisch | „Update-Zugang einrichten“ dreimal auf der Updates-Seite |
| r04_popup_bereich_editor | arbeit | Kachel-Editor ohne Bereich „Popup“ bei Kacheln mit Casora-Popup |
| r05_raum_umbenennen | arbeit | Umbenennen verliert ersten Buchstaben bzw. Raumsymbol |
| r06_handy_wie_studio | arbeit | Handy zeigt andere Räume/Namen/Reihenfolge als das Studio |
| r07_zuhause_home | arbeit | Übersichtsraum „Zuhause“ (de) / „Home“ (en) |
| r08_zeitreise_name | frisch | Seite heißt „Zeitreise“ (de) / „Rewind“ (en) |
| r09_einstellungen_seitenleiste | frisch | Einstellungen unter „Casora“, kein „Zuhause-Einstellungen“ im ⋯-Menü |
| r10_handy_popup_deckend_webkit | arbeit | Handy-Popups in WebKit durchscheinend |
| r11_sicherheit_schloss_offen | arbeit | Sicherheit-Badge „Gesichert“ trotz offenem Schloss |
| r12_licht_popup_nie_leer | arbeit | Licht-Popup leer ohne Gruppenmitglieder |
| r13_energie_komma | arbeit | Energie-Popup mit Dezimalpunkt statt Komma |
| r14_schloss_zustand_deutsch | stress | Schlösser-Popup zeigt rohe englische Zustände („Jammed“, „Unavailable“) |
| r15_seitenleiste_lange_namen | stress | Lange Raumnamen ragen in der Studio-Seitenleiste über den Rand |
| r17_alle_szenen | stress | Szenen-Badge zeigte aufgeklappt höchstens zehn Szenen statt aller |
| r21_tablet_seitenleiste | stress | Tablet quer mit angedockter HA-Seitenleiste: Raum-Kopf und erste Kachel lagen unter der Seitenleiste |
| r24_umzug_wie_vorher | frisch | Umzug Hemma 1/2: Kacheln, Fotos, Wetter in jedem Raum, Beleuchtungs-Badge (nur Lichtgruppe), Original unverändert, keine Fehlerkarten |
| r32_raumbild_handy | arbeit | Handy-Startseite zeigte das Theme-Bild statt des im Studio (oder beim Umzug) gewählten Fotos der Übersicht |
| r34_handy_raum_kontakte | arbeit | Handy: Kontaktsensoren und Schlösser fehlten als Badges im Raum (Issue #5) |
| r35_handy_raum_aktiv_vorn | arbeit | Handy: Raumseite sortierte aktive Kacheln nicht nach vorn (Issue #6) |
| erststart | frisch | Erststart: Willkommen → Assistent (Hemma/YAML gefunden) bzw. Räume, sonst Studio; ⋯-Menü „Einrichtungsassistent …“ |

Hinweise zu einzelnen Tests: Im Zustand **frisch** gibt es kein Casora-Dashboard; das Studio
zeigt beim Start die Begrüßung bzw. den Einrichtungsassistenten. `studio()` wartet deshalb nur
auf ein fertiges Panel und lädt das Dashboard selbst. `erststart` legt dort über den echten Anlege-Weg des Panels ein
Hilfs-Dashboard `qa-start` (+ `-mobile`) an und löscht es am Ende wieder. `r02` prüft am Handy
nur Layouts mit Unter-Badge-Reihen; das Casora-Handy-Layout filtert mit seinen Badges
(`casora_mobile_filter_badges`) – dann steht dort ausdrücklich `SKIP`.

## Klick-Durchlauf (`dev/qa/alles.mjs`): Stufen und Regeln

Ausgewähltes Dashboard: `--dash`, sonst `qa-stress` (aus `stress-setup.mjs`, legt es über den
echten Studio-Ablauf an: Räume → Räume füllen → Vorschau → „Mit N Kacheln anlegen“), sonst ein im
Studio angelegtes Casora-Dashboard (mit Handy-Gegenstück), erst danach andere Casora-Dashboards
wie die Hemma-Fixture `dashboard-hemma`. Kurzlebige `qa-*`-Hilfs-Dashboards anderer Tests zuletzt.

Stufen – nur `error` macht den Lauf (und das Gate) rot:

| Stufe | Bedeutung |
|---|---|
| **error** | sichtbarer Fehler für Nutzer – muss behoben werden |
| **warn** | wahrscheinlich ein Fehler – Bild ansehen, dann beheben oder Regel schärfen |
| **info** | Rauschen/Protokoll (übersprungen, abgefangene Schreibaufrufe, gewollte Eigenheiten) |

Regeln je Befund:

- **abgeschnitten** (Container mit `overflow-x: hidden/clip`, Inhalt ragt hinaus):
  - ein Knopf/Text ist *halb* angeschnitten → `error`
  - Elemente liegen nur *ganz* außerhalb (typisch: ausgeblendete Bereiche) → `warn`
  - der Container hat eine Verlaufsmaske (`mask-image`, gewollter weicher Rand, z. B. Raumleiste
    der Studio-Vorschau) → `info`
  - nur ganz verdeckt in einem winzigen Container (< 64px, z. B. zusammengeklappte, gerade nicht
    gezeigte Felder eines Popup-Layouts) → `info`
  - nicht gezählt: Inhalte in einem inneren Scroll-/Clip-Container, der selbst ganz im Rahmen
    liegt (die Reihe wird eigens geprüft bzw. meldet sich selbst), unsichtbare Inhalte
    (`visibility`/`opacity` über Vorfahren), Elemente über *beiden* Kanten (übergroßes
    Hintergrundfoto), Container, die an ihrer Mitte von etwas anderem verdeckt sind (liegen
    z. B. unter einem offenen Popup), Karussells/Masken nach Klassenname, `text-overflow: ellipsis`
- **reihe-scrollt-nicht**: breitere Reihe bewegt sich weder per Trackpad noch Shift+Mausrad
  (Desktop) bzw. Wischen (Touch) → `error`. Getestet wird in die Richtung, in der noch Platz ist.
- **reihe-nicht-ziehbar**: Reihe scrollt per Rad/Trackpad, aber nicht per Maus-Ziehen.
  `error` nur, wo Casora Ziehen zusagt: Kachelreihe (`casora-smart-row`) und Unter-Badge-Reihen
  im Dashboard. Sonst (Navigationsleiste, Studio-Vorschau – dort heißt Ziehen „Kachel
  verschieben“) → `info`.
- **tot**: Antippen ändert nichts → `error` (in Menüs/Popups teils `warn`). Schon aktiver Navigationseintrag
  (Handy-Leiste „Zuhause“ auf der Startansicht): erst Seite herunterscrollen, Antippen muss nach oben
  führen (sonst `error` **reagiert-falsch**); ohne Wirkung auf nicht scrollbarer Seite → `info`.
  Führt ein Studio-Menüpunkt aus dem Studio heraus („Dashboard öffnen“), wird die Zielseite dort
  nicht gescannt (noch im ersten Zeichnen – der Dashboard-Durchlauf prüft sie), nur `nav-menue`
  (`info`), dann zurück ins Studio. Sieht das Element gar
  nicht bedienbar aus (kein Knopf/Link/`role=button`, Zeiger nicht `pointer`, z. B. Unter-Badges
  der Studio-Vorschau mit `cursor: default`) → `info`.
- **text-entity-id**: rohe Entitäts-ID im Text → `warn`; besteht die Zeile *nur* aus der ID
  (Untertitel in Geräte-Listen, gewollt technisch) → `info`
- **reihe-verdeckt**: über der Reihenmitte liegt ein anderes Element, Scrollen nicht messbar → `warn`
- **text-englisch**: ganzer Text ist ein roher englischer HA-Zustand („Unavailable“, „Jammed“ …)
  → `error`; sonst englisches Wort im Text → `warn`
- **reagiert-falsch** bei Vorschau-Badges: klappt nicht auf → `error`, außer das Studio sagt selbst
  „Noch keine Unter-Badges“ (title) → `info` (`vorschau-ohne-unterbadges`)
- **unterreihe-nicht-scrollbar**: aufgeklappte Unter-Badges liegen außerhalb und die Reihe kann
  nicht quer scrollen → `error`. Als Reihe gilt der nächste Vorfahr mit `overflow-x: auto/scroll`
  (nicht das innere Raster); als Unter-Badges zählen nur *neue* Badges mit neuem Namen – rendert
  die Badge-Reihe beim Antippen nur neu (Handy-Layout filtert), ist das keine Unter-Reihe.
- **konsole**, **text-kaputt** (`undefined`/`NaN`), **seite-quer**, **laedt-nicht**,
  **popup-schliesst-nicht** → `error`; **text-null**, **doppelter-knopf**, **nicht-antippbar** → `warn`
- **schreiben-blockiert**, **uebersprungen**, **nav-menue** → `info`

Dubletten: `abgeschnitten`, `text-*` und `doppelter-knopf` zählen je Viewport einmal; Zahlen/
Uhrzeiten im Label und Zustandsklassen (`.focusing`, `.on` …) im Pfad sind dabei egal.

Neue Ausnahme nötig? Erst das Bild ansehen: schneidet es wirklich einen Knopf/Text ab, bleibt es
ein Fehler im Produkt. Nur Messartefakte und gewolltes Verhalten bekommen eine Regel – hier
dokumentiert und in `alles.mjs`/`inpage.js` mit Begründung.

## Schnelle Zusatzprüfungen (vor Release, ~8 min zusammen)

Beide brauchen eigene Wegwerf-Test-HAs (nie casora-test :8124) und ändern dort nichts Unerwartetes.

- **Bildvergleich** `dev/qa/bildvergleich.mjs` – zwei HAs im gleichen Zustand (z. B. Worktree
  des letzten Release-Tags und aktueller Checkout), alle Desktop-Ansichten, Handy-Startseite und
  -Räume, aufgeklappte Reihen, Popups (je Art einmal) und Studio-Seiten in Desktop/Tablet/Handy,
  hell und dunkel. Gleichschritt, feste Uhrzeit, Animationen aus, Schreibaufrufe abgefangen; Pixelvergleich
  im Browser. Ausgabe `index.html` nur mit veränderten Ansichten (vorher | nachher | Diff), mit
  `--bewertung datei.json` und `--nur-bericht` lassen sich Urteile (gewollt/verdächtig) nachtragen.
  ```sh
  node dev/qa/bildvergleich.mjs --alt http://localhost:8195 --alt-dir <worktree v1.0.1> \
       --neu http://localhost:8196 --out /tmp/bildvergleich --jobs 8
  ```
- **Prod-Nachbau** `dev/qa/prodnachbau.mjs` – spielt echte Dashboards aus einer privaten Kopie
  (`CASORA_PRODKOPIE`, Dateien wie in `.storage`; nie ins Repo) 1:1 ein, startet neu (Vorlagen-Auffrischung
  wie nach einem Update) und prüft Fehlerkarten, Konsole, Badge-Reihen je Raum (Sicherheit bei Kontakten,
  Energie bei Leistungssensor, Reihenfolge), Glocke, Wäsche-Popups, Studio öffnen/schließen ohne
  „ungespeichert“ und Speichern ohne Verlust. Je Lauf ein frisches Wegwerf-HA: die Auffrischung läuft
  je Dashboard-URL nur einmal (Warnung `vorlagen-alt`). Ohne `CASORA_PRODKOPIE`: übersprungen.
  ```sh
  CASORA_PRODKOPIE=/privat/prodkopie CASORA_URL=http://localhost:8197 node dev/qa/prodnachbau.mjs --out /tmp/prodnachbau
  ```
