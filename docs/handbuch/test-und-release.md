# Test und Release

Ausführlich: `dev/qa/README.md`. Hier die Reihenfolge und was wofür.

## 1. Immer, vor jedem Commit (ohne HA, Sekunden)

```sh
node --check <geänderte .js>
python3 tools/build-templates.py            # nur wenn button_card_templates.json geändert
node dev/qa/check-templates.mjs             # alle [[[ … ]]] kompilieren, 0 Fehler
python3 tools/i18ncheck.py                  # bei Texten
for f in dev/unit/*.mjs; do node "$f" || echo "ROT $f"; done
python3 tools/privacy-check.py              # läuft auch als pre-commit (dev/install-hooks.sh)
```

Python-Tests wie im Gate über `uv` (Python 3.14, Zusatzpakete aus der Kopfzeile des Tests), `dev/pytest`
mit `pytest-homeassistant-custom-component`.

Private Testdateien (gitignored) fehlen in einem frischen Worktree – aus dem Haupt-Checkout kopieren:
`dev/casora_mock/fixture.json`, `scenarios.json`, `skip.txt`, `dev/e2e/testhaus.json`, `dev/privat-woerter.txt`,
`dev/demo/privat.json`. Nie committen.

## 2. Tests schreiben

| Art | Ort | Wann |
|---|---|---|
| Unit (Node, ohne HA) | `dev/unit/<name>.mjs` – Modul per `new Function(src)()` laden, `window` stubben, `assert` | Logik, Texte, Vorlagen-Struktur, Regeln (Vorbild `pulse.mjs`, `badge_haptic.mjs`) |
| Unit (Python) | `dev/unit/<name>_test.py` | Integration, WebSocket-Befehle |
| Regress (Test-HA, Playwright) | `dev/qa/regress/rNNN_<name>.mjs`, Kopf `// @zustand: frisch|arbeit|stress`, optional `// @deckt: <glob>` | jeder gemeldete Fehler, der nur im Browser sichtbar ist |
| E2E | `dev/e2e/tNN_*.mjs` | Abläufe (Studio, Assistent) |

Regeln: erfundene Geräte und Namen; erst gegen den alten Stand rot, dann grün; auf das Ergebnis warten,
nicht auf die Uhr; Voraussetzungen mit `need(…)` prüfen statt still überspringen; nichts in HA speichern
(`fakeStates`). Vorlagen-JS immer mit den echten Parametern (`states, entity, user, hass, variables, html`)
auswerten, sonst fallen Namenskonflikte nicht auf.

## 3. Test-HA (Wegwerf-Container)

```sh
dev/qa/wegwerf-ha.sh start <name> <port> arbeit|frisch|demo|stress
dev/qa/wegwerf-ha.sh wait  <name> <port>
export CASORA_URL=http://localhost:<port>; export CASORA_TOKENS="$(node dev/qa/token.mjs)"
export CASORA_THEME=Casora          # Harness-Standard seit 1.6.1 (vorher „Hemma 2“); „default“ = ohne Casora-Theme
CASORA_LOCAL=1 …                    # Dashboard-Skripte und Studio aus dem Checkout, ohne Neustart
dev/qa/wegwerf-ha.sh weg <name>     # am Ende immer
```

Häuser: **arbeit** (großes Prüfhaus, deutsch), **demo** (englisch), **stress** (viele Szenen, lange
Namen), **frisch** (leer, Umzug/Assistent). Nie das echte HA beschreiben.

Geräte: Desktop 1440×900, Tablet 1024×768 und 768×1024, Handy 393×852 **WebKit** (Chromium als
Zweitprüfung), hell und dunkel, Deutsch und Englisch. Playwright mit `serviceWorkers: 'block'`.

## 4. Mess- und Prüfwerkzeuge

| Werkzeug | Misst | Aufruf (Kurz) |
|---|---|---|
| `dev/qa/popup-raender.mjs` | jedes Popup öffnen: abgeschnitten/über den Rand; mit `--geo` Geometrie + Kontrast über `popup-geo.mjs` | `--views handy,desktop --schemes hell,dunkel --only <vorlage> --geo --handy-raeume` |
| `dev/qa/popup-geo.mjs` | im Browser am offenen Popup: ring (±1), radius (±2), zeilen, etikett, spalten, kontrast, schalter, treffer (≥ 40), haken | über `popup-raender --geo` (`--geo-streng`: Funde = Fehler) |
| `dev/qa/ausrichtung.mjs` | Studio: Symbole in Kreisen, Texte in Pillen, Abstände, Radien | `--views desktop,tablet,handy --looks "Casora:hell,Casora:dunkel" --only <station> --shots <ordner>` |
| `dev/qa/matrix-inventar.mjs` | alle Flächen × Zustände × Geräte × Schema × Sprache aus dem Code (Prüfmatrix) | `--out <ordner>` |
| `dev/qa/matrix-bilder.mjs` | zu jeder Matrix-Zeile ein Bild + Messung | `--matrix <ordner> --haus arbeit|demo [--gruppe …] [--kern]`, `--vorbereiten` legt fehlende Kacheln an |
| `dev/qa/konsole.mjs` | Klick-Durchlauf mit Mitschnitt aller Konsolenmeldungen + HA-Log + Setup-Zeit | `--lauf arbeit --dash qa-arbeit --randfaelle --ha-log <log>` |
| `dev/qa/randfaelle.mjs` | Entitäten nur im Browser verbiegen: nicht verfügbar, unbekannt, ohne Attribute, leer, lange Namen, fehlt, verschwindet bei offenem Popup | `--dash qa-arbeit --views 4 --popups 6` |
| `dev/qa/leistung.mjs` | Ladezeit, Popups, Raumwechsel, Studio, Neuzeichnen je Update, Voll-Durchläufe, Leck, Bytes | `--runs 3 --geraete desktop,handy --json a.json`, `--vergleich a.json`, `--grenzen dev/qa/leistung-grenzen.json` |
| `dev/qa/stilabdruck.mjs` | berechnete Stile aller Elemente – „Optik unverändert“ mit einem HA | vorher `--out a.json`, nachher `CASORA_LOCAL=1 … --out b.json`, `--vergleich a.json b.json` |
| `dev/qa/bildvergleich.mjs` | zwei HAs Ansicht für Ansicht, nur Änderungen (vorher/nachher/Diff) | `--alt <url> --alt-dir <worktree> --neu <url> --out <ordner>`; `--neu-lokal` mit einem HA |
| `dev/qa/alles.mjs` | Klick-Durchlauf: jede Taste, Konsole, `undefined`/`NaN`, Seite quer, lädt nicht | `--quick --dash qa-arbeit` |
| `dev/qa/prodnachbau.mjs` | echte Dashboards aus privater Kopie 1:1 einspielen und prüfen | `CASORA_PRODKOPIE=<privat> …` |

Zeiten nur auf ruhigem Rechner vergleichen; unter Last streuen sie um Faktor 2–3. Belastbar sind Zähler.

**Umbau ohne gewollte Optikänderung**: Bildvergleich bzw. Stil-Abdruck vorher/nachher = 0 Abweichung.
**Umzug angefasst** (Import, `casora-kompat.js`, Hemma-Namen): `r24_umzug_wie_vorher` (frisch) und
`rf02_raum_ablauf` (arbeit) vorher und nachher grün.

## 5. Gate

```sh
dev/qa/gate.sh --dry-run     # Plan
dev/qa/gate.sh               # Umfang nach Version: Kalender-Version YY.M.N voll
dev/qa/gate.sh --nachholen   # nach rotem Lauf nur rote/geänderte Tests
```

Statisch + Unit + Test-HAs (arbeit/stress/frisch) + Klick-Durchlauf. Ergebnis `.qa/gate-<commit>.json`.
Ein roter Test ist erst nach Einzel-Gegenprobe ein Fehler (Wackler unter Last); fremde Container vorher
stoppen. Abgebrochene Läufe zu Ende laufen lassen, nie Teilstände als „geprüft“ melden.

Vor einem Release zusätzlich:
- `popup-raender --geo` in **jedem Raum** auf Handy/Tablet/Desktop, Theme Casora.
- Bildvergleich gegen das letzte Release, jede Änderung als Vorher/Nachher zeigen.
- Prod-Nachbau (`prodnachbau.mjs`).
- Tipp-Feedback: `tippen_einheitlich.mjs`, `badge_haptic.mjs` grün; Popup-Knöpfe `:active`.
- 10-Minuten-Geräteliste für den Test am echten iPhone/iPad.

## 6. Release-Ablauf

1. Alle Fixes fertig und abgenommen → erst dann Gate.
2. **Neu-Popup füllen**: `WHATS_NEW` in `custom_components/casora/panel/casora-panel-welcome.js`
   (2–4 Einträge: mdi-Symbol, Titel, Text in `TEXT.de`/`TEXT.en`).
3. Version in `custom_components/casora/manifest.json`: Kalender-Version **YY.M.N** aus `tools/next-version`
   (Jahr zweistellig, Monat ohne Null, N = laufende Nummer des Releases im Monat ab 1; es zählen die
   veröffentlichten GitHub-Releases des Monats, auch alte X.Y.Z, bloße Tags nicht; neuer Monat → wieder .1). Jedes Release ist einfach die nächste Nummer – kein
   Unterschied mehr zwischen Fix- und Funktions-Release.
4. `CHANGELOG.md` und `CHANGELOG.de.md` je Abschnitt `## YY.M.N`; `python3 tools/sync-changelog.py`.
5. Vorschaubilder (`assets/themes/`) neu, wenn sich der Casora-Look geändert hat (demo-Haus, Handy 393×852
   mit Safe-Area, Theme „Casora“); Assistent einmal durchklicken.
6. Keine persönlichen Daten: `tools/privacy-check.py`; „Studio B“ nur intern (`git grep "Studio B"` in Texten).
   Website und README: Versionszeile im Hero von `docs/index.html` („Version YY.M.N“, Reserve, wenn die
   Live-Abfrage scheitert; `tools/release.sh` prüft sie), neue Karten/Funktionen in README und `docs/guide.md`.
7. Volles Gate grün für genau diesen Commit → `tools/release.sh` (nimmt die Version von `tools/next-version`;
   prüft Version, Gate, CHANGELOG, manifest, WHATS_NEW) → `tools/release.sh YY.M.N --publish`.
   Tag und Titel nur „vYY.M.N“ (z. B. v26.10.31). Nur bei einem echten Notfall-Hotfix: `dev/qa/gate.sh --patch`
   und `tools/release.sh YY.M.N --patch` (Patch-Gate bewusst zugelassen, nie automatisch).

**Karten-Update statt Release** (`python3 tools/build-card-update.py --note casora_x="…"`, Tag
`karten-JJJJ-MM-TT-N`, `--latest=false`): nur wenn ausschließlich bestehende `casora_*`-Vorlagen in
`button_card_templates.json` geändert sind – keine neue Vorlage, nichts in `scripts/`, `panel/`, `*.py`,
Übersetzungen, manifest. Sonst Release. Ebenfalls nur mit grünem Gate.

## 7. Was wirkt in einer laufenden Installation ohne Neustart

| Änderung | Wirkt | Warum |
|---|---|---|
| `custom_components/casora/scripts/*.js`, `scripts/local/*.js` (Dashboard-JS, i18n) | Neustart (15.10.2026 in Prod nachgeprüft) | `scripts_view.py` liefert die neue Datei sofort aus, aber der Browser hält die alte: Sie kam unter derselben Ressourcen-Adresse (`?v=` = Stempel vom Start) mit „ein Jahr gültig“. Erst der Start setzt den neuen Stempel |
| Vorlagen (`casora-templates.json`) | Neustart (Vorlagen-Auffrischung beim Start) bzw. Karten-Update | Vorlagen stehen in jeder Dashboard-Konfiguration |
| Studio (`panel/*.js`) | Neustart | `casora-studio.js` und der Versionsstempel entstehen beim Start (`__init__.py`) |
| Python (`*.py`), `services.yaml`, `helfer.yaml`, Übersetzungen der Integration | Neustart | – |
| Theme (`theme_*.yaml`) | Neustart bzw. Theme neu laden | – |

In Prod nie selbst neu starten oder Dateien kopieren ohne Absprache; fertige Teile einspielen und sagen,
was angeschaut werden soll. Beim Testen ersetzt `CASORA_LOCAL=1` den Neustart für Skripte und Studio.
