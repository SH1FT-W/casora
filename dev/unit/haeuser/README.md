# Echte Häuser als Tests

Jede Datei hier ist ein anonymisierter Ausschnitt aus einem echten Home Assistant, meist aus einem
Issue: Bereiche, Geräte, Entitäten (Registry) und Zustände, optional die Energie-Einstellungen
(`energy_prefs`, Antwort von `energy/get_prefs`). `expect` sagt, was Casora darin erkennen muss.
`dev/unit/haeuser.mjs` lässt alle Erkennungen über alle Häuser laufen.

Neues Haus aus einem Issue:

1. Nur die Entitäten übernehmen, um die es geht (plus ein paar Nachbarn, die falsch gewählt werden
   könnten). Namen von Personen, Adressen und echte Gerätenamen ersetzen; Integration (`platform`),
   `translation_key`, `device_class`, Einheit und Zustandsform bleiben wie im Original.
2. In `expect` eintragen, was richtig ist – auch, was vorher falsch war.
3. `node dev/unit/haeuser.mjs` muss mit dem Fix grün und ohne ihn rot sein.

Felder von `expect` (alle optional):

- `house_power`: Haussensor auf Zuhause (Studio und Dashboard gleich), `null` = keiner
- `house_power_why`: `{ "stage": "house" | "total" | "grid", "word", "in": "name" | "id" }` – warum die Haussuche
  ihn nimmt (Warum-Zeile im Studio, `casoraBasis.housePowerWhy`)
- `house_list`: stattdessen Liste auf Zuhause (Summe), z. B. aus den Energie-Einstellungen
- `plants`: Entitäten, die Pflanzen sind; `not_plants`: die es nicht sind
- `dishwasher`: `{ "entity": Betriebszustand, "fields": { remaining, program, sel, door, progress, stop } }`
- `laundry`: Liste `{ "entity", "role": "washer" | "dryer" | "dishwasher", "source", "fields": { state, program, … },
  "state_text": "Läuft" }` – Gerät hinter der Entität über die gemeinsame Quellen-Tabelle (`casoraLaundryFind.classify`),
  `fields` wie dort (`null` = keins), `state_text` der Zustandstext der Karte
- `not_laundry`: Entitäten, deren Gerät keine Wasch-, Trocken- oder Spülmaschine ist (Kaffeevollautomat, Dienst)
- `energy_roles`: `{ entity_id: "solar" | "grid" | "battery" | "home" | null }` für das Popup „Woher kommt der Strom“
- `studio_main`: `{ Kacheltyp: [Entitäten] }` – was das Studio für eine neue Kachel vorschlägt, in dieser Reihenfolge
  (`_tileCandidates`, Raum „Home“ ohne Bereich), z. B. `{ "casora_dishwasher": ["sensor.…"] }`
- `studio_fields`: `{ Kacheltyp: { "entity": Hauptentität, "fields": { Feld: Entität | null } } }` – was ein leeres
  Studio-Feld als „Automatisch: …“ findet (`casoraFieldEntity`, dieselbe Suche wie die Karte); optional `"why": { Feld:
  "Found automatically on the same device (Bambu Lab)." }` – die Warum-Zeile darunter (`casoraFieldWhy`, englisch)
- `assist`: `{ Kacheltyp: [Entitäten] }` – genau diese Vorschläge macht der Geräte-Assistent für den Typ (Reihenfolge egal)
- `printer`: `{ "entity": Druckstatus, "fields": { status, st, progress, cam, … } }` – was die Druckerkarte findet
  (`_casoraPrint.resolve`)
- `cameras`: Liste der Kamera-Kachel ohne Auswahl (`_casoraCams`: ohne Saugroboter-Karten und Druckerkameras);
  `cameras_chosen`: `{ "pick": [gewählt], "want": [gezeigt] }` mit Auswahl (Karten raus, Druckerkameras bleiben)
- `energy_peers`: `{ grid, solar, battery }` – Leistungssensor je Teil der Anlage, den die Energie-Popups ohne
  Sub-Badges nehmen (`peers`), `null` = keiner
- `vent`: `{ Seite: { "mode": "house" | "room" | "outdoor" | "empty", "rooms": [Raumnamen], "tile": "Luft gut",
  "out": [Zeilen der Außenluft] } }` – was das Raumklima-Popup (casora_vent, `_casoraVent.model`) auf dieser Seite
  zeigt: „Zuhause“ = das Haus, ein Raum = nur seine Zeilen, ein Außenbereich = nur die Außenluft, ohne Sensor leer (#54)
- `popup_hide`: `{ Kachelart: { "hide": [ids], "rooms" | "rows": [was bleibt], "tile": Kacheltext, "studio": [Liste im Studio] } }`
  – ausgeblendete Zeilen (`variables.popup_hide`, `casoraPopupHide`) fehlen in Popup und Kachel, die Studio-Liste führt alle
- `energy_night`: `{ "states": { entity_id: Zustand }, "home": "700 W", "focus": { solar: "0 W", … } }` – die
  Zustände ersetzt (z. B. Wechselrichter nachts `unavailable`): Kopf des Zuhause-Popups (ohne „ohne Wert“) und
  Kopf der Popups je Teil
