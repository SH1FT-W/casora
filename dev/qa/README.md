# Qualitäts-Gate

Kein Release und kein Karten-Update ohne grünes Gate für genau den Commit, der raus geht.
`tools/release.sh` und `tools/build-card-update.py` prüfen das selbst und verweigern sonst.

## Kurz: welcher Aufruf wann

```sh
dev/qa/gate.sh                  # Standard: Umfang nach Version im manifest (X.Y.0 voll, X.Y.Z patch)
dev/qa/gate.sh --voll           # volles Gate, Pflicht für X.Y.0, zählt immer
dev/qa/gate.sh --patch          # Grundprüfungen + nur die betroffenen Tests, zählt für X.Y.Z mit Z>0
dev/qa/gate.sh --nachholen      # nach einem roten Lauf: nur die roten und seitdem geänderten Tests
dev/qa/gate.sh --dry-run        # Plan zeigen (Umfang, Zuordnung Datei → Tests, HAs, Zeitschätzung)
```

Typischer Ablauf: Gate laufen lassen → ein Test rot, weil der Test selbst unsauber war → Test
korrigieren, committen → `dev/qa/gate.sh --nachholen` (Minuten statt neuer Volllauf) → Release.

## Was das Gate prüft

`dev/qa/gate.sh` prüft:

1. **Statisch** (Sekunden)
   - `node --check` für alle Panel-/Skript-Dateien und Testskripte
   - Python-Syntax aller Integrations- und Werkzeugdateien (Python 3.14 via `uv`)
   - alle `[[[ … ]]]`-Ausdrücke der Kartenvorlagen per `new Function` (`dev/qa/check-templates.mjs`)
   - JSON gültig (Übersetzungen, manifest, Vorlagen)
   - `tools/privacy-check.py` (ganzes Repo), `tools/i18ncheck.py`, `tools/sync-changelog.py --check`
2. **Unit-Tests** `dev/unit/*` (ohne HA; `--with …` aus der Aufrufzeile des Tests wird übernommen)
3. **Test-HAs** (Wegwerf-Container, je Zustand mit dem aktuellen Checkout eingespielt):
   - **arbeit**: zuerst legt `stress-setup.mjs --name qa-arbeit --state arbeit` auf jedem arbeit-HA ein
     Prüf-Dashboard über den echten Studio-Ablauf an; dann E2E-Reihe (Liste aus `dev/e2e/alle.sh`),
     Regressionstests `@zustand: arbeit` (mit `CASORA_QA_DASH=qa-arbeit`) und schneller
     Klick-Durchlauf (`alles.mjs --quick --dash qa-arbeit`).
     Die Hemma-Fixture `dashboard-hemma(-mobile)` ist speichergesperrt und von der automatischen
     Vorlagen-Auffrischung ausgenommen (alte Vorlagen), sie wird für Produktprüfungen nie gewählt.
   - **stress**: `dev/qa/stress-setup.mjs` (Dashboard `qa-stress`), voller Klick-Durchlauf
     (`dev/qa/alles.mjs`), Regressionstests `@zustand: stress`
   - **frisch**: Regressionstests `@zustand: frisch` (auch Tests ohne Angabe)

Ergebnis: `.qa/gate-<commit>.json`, Commit, Zeit, Umfang (`voll`/`patch`), Bezug (`basis`), je Schritt
und **je Test** ok/rot/wackelt mit Protokollpfad, Wackler-Liste, bei Patch die Zuordnung, bei
Nachholen die Herkunft (`nachgeholt`). Protokolle unter `.qa/logs/<commit>/` (Einzelteile unter `teile/`,
Zeitplan je Zustand in `zeiten-<zustand>.log`, Auswahl in `auswahl.log` bzw. `nachholen.log`).
Rückgabe ≠ 0 bei jedem Fehler.

## Vorab-Prüfung

Bevor ein HA startet, prüft das Gate, was die Tests brauchen, aber nicht im Repo liegt:
private Testdateien (`dev/casora_mock/fixture.json`, `scenarios.json`, `dev/e2e/testhaus.json`,
`dev/privat-woerter.txt`, optional `skip.txt`, `einstellungen.privat.js`), Docker, Test-Zugang
(`~/casora-haus/ZUGANG.txt`), die Zustände unter `~/casora-haus/zustaende/` und freie Ports 8301–8307.
In einem Worktree werden fehlende private Dateien aus dem Haupt-Checkout kopiert (alle gitignored).
Fehlt etwas ganz, startet das Gate nicht, statt später als roter Test (früher: t01/t11 ohne testhaus.json).

## Umfang: voll oder patch

**Voll** (`--voll`, Standard bei Version X.Y.0): alle Zustände, alle Tests, voller Klick-Durchlauf.

**Patch** (`--patch`, Standard bei X.Y.Z mit Z>0): statisch + Unit wie immer, dazu nur die Tests, die
die seit dem **letzten grünen vollen Gate** (Vorfahre von HEAD, in allen Worktrees gesucht; anders mit
`--basis <commit>`) geänderten Dateien berühren. Die Zuordnung macht `dev/qa/auswahl.mjs` und zeigt sie
vorher als Tabelle (`--dry-run`), in dieser Reihenfolge je Datei:

| Geänderte Datei | Tests |
|---|---|
| Doku, Changelog, Bilder, Unit-Tests, Release-Werkzeuge, nur `version` im manifest, nur Texte im Neu-Popup | keine (nur statisch + Unit) |
| ein Test selbst (`dev/qa/regress/…`, `dev/e2e/tNN…`) | genau dieser Test |
| Datei, die ein Test per Kopfzeile `// @deckt: <muster> …` nennt (Glob, z. B. `custom_components/casora/tanken.py`) | diese Tests |
| Vorlagen (`button_card_templates.json`) | geänderte Vorlagen und alle, die von ihnen erben → Tests, die einen der Namen nennen; Klick-Durchlauf Dashboard-Teile |
| Dashboard-Skripte (`scripts/…`) | dort definierte Elemente/Globale (`customElements.define`, `window._casora…`) und die Vorlagen, die sie aufrufen → Tests, die einen davon nennen; Klick-Durchlauf Dashboard-Teile |
| Studio (`panel/casora-panel*.js`) | Tests, die das Studio öffnen; Klick-Durchlauf Studio-Teile |
| Gate-Infrastruktur (`lib.mjs`, `harness.mjs`, `pool.mjs`, `gate.sh`, Mock …) | alle Zustände komplett |
| alles andere ohne Treffer | **Zustand komplett** (Theme/Texte → arbeit, Python/Umzug → frisch + arbeit, Stresshaus → stress, Unbekanntes → alles) |

Überlauf-Stichworte (`overflow`, `nowrap`, `max-width` …) im Diff einer Oberflächen-Datei holen
zusätzlich stress komplett dazu (voller Klick-Durchlauf). Teure Teile (voller Klick-Durchlauf, r56,
r20 …) laufen damit nur im vollen Gate oder wenn die Änderung sie berührt.

Freigabe: `tools/release.sh X.Y.Z` (über `tools/qa_gate.py --version`) nimmt ein Patch-Gate nur für
Z>0 und nur, wenn sein Bezug ein grünes volles Gate eines Vorfahren ist. X.Y.0 braucht immer `--voll`.
Karten-Updates (`build-card-update.py`) nehmen beide.

## Nachholen statt Neulauf

`dev/qa/gate.sh --nachholen` (bzw. `--nachholen=<commit>` für einen bestimmten Vorlauf) nimmt das
jüngste Gate-Ergebnis von HEAD oder einem Vorfahren und lässt nur laufen: die dort roten Tests, die
seitdem geänderten Tests und die Tests, die laut Zuordnung von anderen seitdem geänderten Dateien
betroffen sind (ein roter Klick-Durchlauf läuft für seinen Zustand ganz). Statisch + Unit laufen immer.
Zulässig nur, wenn der Vorlauf vollständig war (kein Teillauf, Aufbau grün) und keine seitdem geänderte
Datei einen Zustand komplett braucht, sonst bricht `dev/qa/nachholen.mjs` mit Begründung ab.

Das Ergebnis für HEAD enthält alle Tests: übernommene mit ihrem Commit, neue mit HEAD, dazu
`nachgeholt: { von, vorlauf, neu_gelaufen, uebernommen, geaendert }`. Es hat den Umfang des Vorlaufs
und zählt damit wie dieser (ein nachgeholtes volles Gate ist ein volles Gate).

## Wackler: Gegenprobe

Ein im Lauf roter Regress- oder E2E-Test (außer E2E, die Dashboards anlegen) läuft am Ende einmal
**einzeln** nach, auf seinem HA läuft dann nichts anderes, der Grundzustand ist hergestellt.
Grün in der Gegenprobe = **wackelt**: zählt als bestanden, steht aber in der Zusammenfassung, in
`gate-<commit>.json` (`wackler`) und in `.qa/wackler.log` (Statistik über Läufe). Rot = echter Fehler.
Bei mehr als 8 roten Tests (`GATE_GEGENPROBE_MAX`) gibt es keine Gegenprobe, dann ist eher etwas
kaputt. Abschalten: `--keine-gegenprobe`. Ein Test, der öfter in der Wackler-Liste steht, gehört
repariert (siehe „Wackler vermeiden“).

## Ablauf und Parallelität

- **HAs**: je Zustand ein oder mehrere Docker-Container `casora-gate-<name>` (`dev/qa/wegwerf-ha.sh`,
  Kopie aus `~/casora-haus/zustaende/`, Daten unter `~/casora-agents/gate/`): arbeit :8301 (+ :8304,
  :8307), stress :8302 (+ :8306), frisch :8303. Wie viele, richtet sich nach freiem Docker-Speicher
  (je HA ~600 MB, `GATE_HA_MB`) und höchstens `GATE_HAS_MAX` (5) bzw. `--has N`; verteilt wird nach
  geschätzter Arbeit (`.qa/zeiten.json`, ~7 min je HA lohnt ein weiteres). Nach den frisch-Tests (~2 min)
  wird aus dessen Speicher ein weiteres HA (:8305) für den Zustand mit der meisten Arbeit je HA.
  Die Container werden am Ende immer entfernt (auch bei Abbruch). casora-test bleibt unberührt.
  Speicherverlauf: `.qa/logs/<commit>/speicher.log`. Ausgabezeilen tragen `[arbeit]`/`[stress]`/`[frisch]`.
- **Ein Test je HA** (`--jobs 1`, Standard parallel): `--jobs` gilt **je HA** (früher für alle HAs
  zusammen, mit `--jobs 1` lief arbeit ganz auf einem HA, die übrigen standen leer). So teilt kein Test
  den HA-Zustand mit einem anderen; mehr Tempo kommt über mehr HAs. `--jobs 2` geht auch: dann regeln
  die Sperren unten, was auf einem HA gleichzeitig darf; `--max M` begrenzt die Summe.
- **Grundzustand je Test**: `pool.mjs` merkt sich je HA beim Start die UI-Helfer (`input_*.casora_*`:
  aufgeklappte Reihe, Handy-Filter, Overlays …) und stellt sie vor jedem Test mit Sperre `ui`/`allein`
  und vor jeder Gegenprobe wieder her („Grundzustand hergestellt: …“ im Protokoll). Was ein Test danach
  verändert zurücklässt, steht als „hinterlässt: …“ in seinem Protokoll, so findet man Verursacher.
- **Statisch + Unit** laufen im Hintergrund, während die HAs starten.
- **Je Zustand** führt `dev/qa/pool.mjs` E2E, Regress und Klick-Durchlauf aus. Der Klick-Durchlauf
  läuft je Viewport in zwei Prozessen (`--only studio` / `--only dashboard`), `alles.mjs --merge` führt
  die Teilberichte zu einem `bericht.json/.md` zusammen. E2E laufen immer auf dem ersten HA eines
  Zustands (t03 → t04 → … bauen aufeinander auf), Regress- und Klick-Teile auf dem ersten freien.
- **Sperren**, was auf demselben HA nicht gleichzeitig laufen darf (wirkt bei `--jobs` ≥ 2):
  - `ui`: gemeinsamer HA-Zustand, UI-Helfer, Mock-Szenario, `fakeStates` und Antippen im Dashboard.
  - `dash`: t02/t03/t07 legen Dashboards an, t19 wertet „neue Dashboards“ aus und löscht sie.
  - `settings`: t18 vergleicht Casora-Einstellungen, t19 schreibt sie.
  - `allein`: Regressionstests mit `// @parallel: allein` **und** alle, die Dashboards, Einstellungen
    oder Benutzerdaten speichern (`lovelace/config/save`, `_save(`, `casora/settings/set`,
    `frontend/set_user_data`, Dashboards anlegen/löschen), erkannt aus der Quelle, außer der Kopf
    sagt ausdrücklich `frei` (r42 speicherte qa-arbeit, während andere Tests es lasen).
  - Reihenfolge rund um `test-neu` wie in `alle.sh`: t03 → (t04, t08) → t05 → t06 → t10 → t14.
  - Das Mock-Szenario aus t10 (`drucker_druckt`) wird vorab auf jedem HA gesetzt.
- Neuer **E2E-Test** ohne Regel in `E2E_RULES` (pool.mjs) läuft sicherheitshalber allein.
  Neuer **Regressionstest**: ohne Angabe gilt `ui`, wenn er ein Dashboard öffnet oder Zustände
  unterschiebt, sonst frei; sonst `// @parallel: ui | frei | allein` in die ersten Zeilen.
- **Zeiten**: jede Zeile zeigt Dauer und Gate-Uhr (`@m:ss`); gemessene Zeiten je Teil landen in
  `.qa/zeiten.json` und dienen `--dry-run`, der Reihenfolge (längster Restpfad zuerst) und der
  Verteilung der HAs als Schätzung.

## Aufruf (alle Schalter)

```sh
dev/qa/gate.sh                 # Umfang auto, parallel auf Wegwerf-HAs, 1 Test je HA
dev/qa/gate.sh --voll | --patch | --umfang auto|voll|patch
dev/qa/gate.sh --patch --basis abc123   # Patch gegen einen bestimmten grünen vollen Lauf
dev/qa/gate.sh --nachholen[=abc123]     # rote/geänderte Tests des (bestimmten) Vorlaufs
dev/qa/gate.sh --has 3         # höchstens 3 Wegwerf-HAs gleichzeitig (2–6)
dev/qa/gate.sh --jobs 2        # 2 Tests gleichzeitig je HA (Sperren regeln den Rest)
dev/qa/gate.sh --keine-gegenprobe
dev/qa/gate.sh --dry-run       # Plan zeigen (Auswahl, HAs, Parallel-Plan, Zeitschätzung), nichts ausführen
dev/qa/gate.sh --quick         # ohne Stress-Zustand und vollen Klick-Durchlauf (keine Freigabe)
dev/qa/gate.sh --only static   # nur ein Schritt: static | unit | e2e | regress | crawler (keine Freigabe)
dev/qa/gate.sh --seriell       # Zustände nacheinander auf casora-test (:8124), übernimmt es! (alt)
dev/qa/gate.sh --no-switch     # casora-test nicht umschalten, nur Tests des aktiven Zustands
node dev/qa/auswahl.mjs --basis <commit> [--head <commit>]   # Zuordnung Datei → Tests ansehen
```

Vor dem Start prüfen, dass kein anderes Gate läuft (`docker ps`: keine `casora-gate-arbeit/stress/frisch…`).
Wegwerf-HAs von Agenten mit anderen Namen/Ports (ab 8350) dürfen weiterlaufen, kosten aber Speicher und
Rechenzeit (dann startet das Gate weniger HAs).
Anmeldung: automatisch über `dev/qa/token.mjs` (Zugang aus `CASORA_USER`/`CASORA_PASS`
oder `~/casora-haus/ZUGANG.txt`, nichts davon im Repo).
Für Nutzertests (nicht im Gate): `dev/qa/wegwerf-ha.sh konten <name> <port>` legt im Wegwerf-HA den
Benutzer „Kind“ (kein Admin, Anmeldung `kind` / `kind-nur-test`) an und wählt im Lüften-Coach das Testhandy.

**Dauer**: siehe „Gemessene Zeiten“ unten; `dev/qa/gate.sh --dry-run` rechnet mit den zuletzt
gemessenen Zeiten.

Danach, wenn alles grün und committet ist:

```sh
tools/release.sh 1.2.1            # prüft Gate (Umfang passend zur Version), CHANGELOG, manifest, WHATS_NEW
tools/release.sh 1.2.1 --publish  # führt Tag, Push und gh release create aus
python3 tools/build-card-update.py --note casora_x="…"   # Karten-Update, ebenfalls nur mit grünem Gate
```

Jede Änderung nach dem Gate (auch nur CHANGELOG) heißt: committen, Gate neu, bei Patch-Releases ist
das ein kurzer Patch-Lauf, bei reinen Teständerungen `--nachholen`.

Ausgeliefert wird automatisch: Die GitHub-Releases sind die Quelle. Casora fragt die
öffentliche GitHub-API anonym nach neuen `v…`-Releases und `karten-…`-Paketen (alle 6 Stunden),
HACS-Installationen bekommen neue Versionen über HACS, kein eigener Schritt.

## Gemessene Zeiten (09.10.2026)

Rechner mit 10 Kernen, Docker 5,8 GB; meist liefen nebenher Wegwerf-HAs anderer Agenten (Last 10 bis 50).

| Lauf | vorher | jetzt |
|---|---|---|
| volles Gate | 77 und 112 min (`--parallel --jobs 1`, arbeit ganz auf einem HA) | 30 bis 44 min, zuletzt ZEIT_VOLL (5 HAs: arbeit 3, stress 2) |
| Patch-Gate (ein Dashboard-Skript geändert) | gab es nicht als Freigabe | 3 min 49 s (r89 + Klick-Durchlauf Dashboard-Teile) |
| Nachholen (2 bzw. 3 geänderte Tests) | voller Neulauf | 3 min 28 s bzw. 4 min 26 s |

Engpass im vollen Lauf ist arbeit (~85 min Testzeit auf 3 HAs); stress braucht ~18 min.
Mehr HAs (`GATE_HAS_MAX=6`, arbeit 3 + stress 2 + spätes HA) gehen, wenn sonst nichts läuft.

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

6. Optional `// @deckt: <datei-muster> …` in die Kopfzeilen, wenn der Test eine Datei prüft, die die
   automatische Zuordnung nicht findet (Python-Backend, eigenes Panel-Modul). Dann läuft er im
   Patch-Gate, sobald sich diese Datei ändert. Prüfen: `node dev/qa/auswahl.mjs --basis <commit>`.

### Wackler vermeiden

Aus den Läufen vom 08./09.10.2026 (im Gate rot, einzeln grün):

- **Auf das Ergebnis warten, nicht auf die Uhr.** Feste `waitForTimeout(…)` nach einem Klick reichen
  unter Last nicht. Stattdessen `page.waitForFunction(…)` bzw. eine Schleife bis zum erwarteten Wert mit
  Obergrenze (r42: Handy-Leiste liest die Szenen-Auswahl per WebSocket nach; r90: Tagesstatistik;
  rb18: Popup-Inhalt baut sich nach der Hülle auf; r10, r34, r36 ebenso). Bei einem echten Fehler
  wird der erwartete Wert nie erreicht, die Aussage bleibt gleich.
- **Voraussetzungen selbst herstellen.** Gemeinsame Helfer wie `input_select.casora_expanded_row`
  schalten beim Antippen um; stand die Reihe noch offen, klappte der Tipp zu (r34). Vorher in den
  benötigten Zustand setzen. `pool.mjs` stellt die UI-Helfer zusätzlich vor jedem `ui`-Test her.
- **Nur sichtbare Ziele anklicken.** Ein Klick auf eine Stelle außerhalb des Fensters geht ins Leere;
  ob der Studio-Abschnitt im Bild lag, hing vom Inhalt davor ab (r27: einzeln immer rot, im Gate grün).
  Vorher `scrollIntoView`, aufklappbare Abschnitte nur aufklappen, wenn sie zu sind.
- **Zustand zurücksetzen**, was gespeichert wurde, in `atFinish(…)` (läuft auch bei `need(…)`).

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
| r33_handy_raum_umbenennen | arbeit | Umbenannter Raum blieb am Handy alt, Hemma-Handy-Layouts wurden nie abgeglichen (Issue #4) |
| r34_handy_raum_kontakte | arbeit | Handy: Kontaktsensoren und Schlösser fehlten als Badges im Raum (Issue #5) |
| r35_handy_raum_aktiv_vorn | arbeit | Handy: Raumseite sortierte aktive Kacheln nicht nach vorn (Issue #6) |
| r44_handy_raum_wie_desktop | arbeit | Handy-Raumseite zeigte andere Badges als der Raum-Kopf am Desktop (Energie/Sicherheit fehlten, Einzel-Anzeige galt nicht); prüft auch Handy-Schalter, Unter-Reihe je Gerät und Studio-Vorschau |
| r83_szenenfarbe_sofort | arbeit | Szenenfarbe aus dem Studio kam am Handy an, auf Desktop/Tablet nicht (Unter-Badges nur bei laufender Szene gefärbt, kein Neuzeichnen nach dem Speichern) |
| r85_glocke_nicht_melden | arbeit | Wunsch 1.1.2: „Nicht melden“ – Auswahl nur meldefähiger Geräte (Fenster ja, Lampe nein), Ausnahme nimmt den Glocken-Eintrag weg (Desktop + Handy), entfernt kommt er wieder |
| r87_studio_ausrichtung | arbeit | Studio: Symbole nicht mittig in ihren Kreisen (Zurück-Pfeil, Szenen-Symbole, Popup-Pfeile), „Mit KI ergänzen“ am Kartenrand – misst mit `dev/qa/ausrichtung.mjs` (Mitte, Fluchten, Abstände, Radien, Kreisgrößen) |
| r89_tanken_auto_popup | arbeit | Neu 1.2: Tanken im Auto-Popup. Zeile unter dem Tankbalken, Ansicht (Lernphase-Hinweis, Empfehlung, Top 3, Karte: HAs eigene Karte mit Pillen an den Koordinaten bzw. Punktkarte als Rückfall, Umschalter, Quelle), ohne Einrichtung keine Zeile, Studio › Einstellungen › Tanken (Tank-Sensor nur im Browser untergeschoben; Testhaus fragt nur die Fake-API in dev/casora_mock/tankerkoenig.py) |
| r91_fenster_familie | arbeit | Design-Durchsicht 1.2 (D1, D5, D7, D8, D10, D12): Glocke, Welle, ⋯-Menü und Handy-Fenster als eine Familie (Radius 28, deckend, ein Schatten, Zeilen 52, Kreis 36), offener Kopfknopf in der Raum-Pillen-Fläche, Kopfknöpfe mit Leisten-Schatten, Raumleisten-Pille ringsum 4, Zurück-Kreis 48, Handy-Szenen-Kachel wie Geräte-Kachel |
| rf01_kachel_ablauf | arbeit | Ablauf Kachel: Kachelart hinzufügen, umbenennen, „Kachel entfernen“, ⌘S – Ergebnis in HA (Desktop + Mobil) und im Dashboard |
| rf02_raum_ablauf | arbeit | Ablauf Raum über das Raum-Menü: hinzufügen, umbenennen, Symbol, „Nach vorne“, löschen – Ergebnis in HA und in der Navigation |
| rf03_speichern_zeitreise | arbeit | Rückgängig, „Ungespeicherte Änderungen wiederherstellen“ nach Verlassen, ⌘S, Zeitreise zum Stand davor |
| rf04_energie_ausschliessen | arbeit | Energie-Badge: Gerät per × ausschließen bleibt nach neuem Laden draußen (energy_exclude) |
| rf05_handy_ausgeblendet | arbeit | Im Studio ausgeblendete Kachel (enabled: false) blieb auf der Handy-Raumseite sichtbar |
| rf06_wer_sieht_das | arbeit | „Wer sieht das?“ (Kachel, Badge, Raum) und „Vor dem Schalten fragen“ wirken im Dashboard (Desktop + Handy-Raumseite) |
| rb11_studio_mehr | arbeit | Studio: Suche (⌘K, Alltagswörter), Änderungsliste am Titel, Wiederholen, Raum ausblenden, Wer sieht das, QR, Zeitreise anheften, Mobil-Vorschau Wiedergabe (F-13) |
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
