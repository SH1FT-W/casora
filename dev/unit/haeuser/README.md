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
- `house_list`: stattdessen Liste auf Zuhause (Summe), z. B. aus den Energie-Einstellungen
- `plants`: Entitäten, die Pflanzen sind; `not_plants`: die es nicht sind
- `dishwasher`: `{ "entity": Betriebszustand, "fields": { remaining, program, sel, door, progress, stop } }`
- `energy_roles`: `{ entity_id: "solar" | "grid" | "battery" | "home" | null }` für das Popup „Woher kommt der Strom“
- `studio_main`: `{ Kacheltyp: [Entitäten] }` – was das Studio für eine neue Kachel vorschlägt, in dieser Reihenfolge
  (`_tileCandidates`, Raum „Home“ ohne Bereich), z. B. `{ "casora_dishwasher": ["sensor.…"] }`
- `studio_fields`: `{ Kacheltyp: { "entity": Hauptentität, "fields": { Feld: Entität | null } } }` – was ein leeres
  Studio-Feld als „Automatisch: …“ findet (`casoraFieldEntity`, dieselbe Suche wie die Karte)
- `assist`: `{ Kacheltyp: [Entitäten] }` – genau diese Vorschläge macht der Geräte-Assistent für den Typ (Reihenfolge egal)
- `printer`: `{ "entity": Druckstatus, "fields": { status, st, progress, cam, … } }` – was die Druckerkarte findet
  (`_casoraPrint.resolve`)
- `cameras`: Liste der Kamera-Kachel ohne Auswahl (`_casoraCams`: ohne Saugroboter-Karten und Druckerkameras);
  `cameras_chosen`: `{ "pick": [gewählt], "want": [gezeigt] }` mit Auswahl (Karten raus, Druckerkameras bleiben)
