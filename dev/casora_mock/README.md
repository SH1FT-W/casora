# Casora Mock

Test-Integration für das Test-HA (Domain `casora_mock`). Sie legt `fixture.json` (privat, gitignored)
und die erfundenen Geräte der Module daneben an. `haus.py` baut dasselbe Haus ohne Home Assistant
für die Unit-Tests.

## skip.txt (optional, privat)

Was im Test-Haus schon echt ist, legt der Mock nicht an. Eine Zeile je Eintrag, getrennt durch
Leerzeichen:

- `sensor.beispiel` – genau diese Entität (Entitäts-ID wie in der Fixture).
- `platform:beispiel_integration` – alle Entitäten, die der Mock unter der Registry-Plattform dieser echten
  Integration anlegen würde. Die Fixture behält sie; es entfällt nur ihre Anlage. So lässt sich eine
  installierte Integration neben dem Mock testen.
- `platform:casora_mock` – die eigenen Entitäten des Mocks.

`#` ist kein Kommentar. Die Geräte der Fixture bleiben angelegt; es entfallen nur ihre Entitäten.
