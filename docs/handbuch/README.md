# Casora-Bau-Handbuch

Wie in Casora gebaut wird, damit jede neue Kachel, jedes Popup und jede Studio-Fläche sofort zum Rest
passt. Stand: Feinschliff-Runde 1.3 (10.10.2026). Grundlage sind Messungen über die ganze Prüfmatrix
(Popups, Kacheln, Badges, Handy, Studio, Umzug), nicht Geschmack.

| Datei | Wofür |
|---|---|
| [design-regeln.md](design-regeln.md) | Tokens (Radien, Abstände, Schatten, Schrift, Farben, Symbolkreise, Bewegung), Geometrie, Kontrast, Trefferflächen, Hover/Druck |
| [blaupause-kachel.md](blaupause-kachel.md) | Neue Kachel oder neues Badge Schritt für Schritt |
| [blaupause-popup.md](blaupause-popup.md) | Neues Popup Schritt für Schritt |
| [popup-blaupause.md](popup-blaupause.md) | Popup-Muster v2: Aufbau, 11 Regeln, Entscheidungen, Ausnahmen, Bausteine `UI.section/actions/settings/empty/width` |
| [blaupause-studio-flaeche.md](blaupause-studio-flaeche.md) | Neue Studio-Seite, Inspektor-Abschnitt, Ablauf oder Rückfrage |
| [wortliste.md](wortliste.md) | Verbindliche Wörter Deutsch/Englisch, Zahlen, Einheiten |
| [test-und-release.md](test-und-release.md) | Tests, Messwerkzeuge, Gate, Release, was in Prod ohne Neustart geht |
| [regeltests.md](regeltests.md) | Welche Regel wie automatisch rot wird – vorhanden und geplant |

## Lesart

- **Gilt** = so ist der Code heute und so wird weiter gebaut. Abweichungen sind Fehler.
- **OFFEN – Entscheidung Maintainer: A … / B …** = Varianten liegen vor, gewählt ist noch nicht.
  Bis zur Wahl: bestehenden Wert der Nachbarn übernehmen, nichts Drittes erfinden.
- **(V)** in der Wortliste = Vorschlag, gilt erst nach der Wahl.

## Drei Sätze vorweg

1. Erst wiederverwenden (Kern-Bausteine `window._casoraUI`, `_casoraStd`, Finder `casoraDevice`,
   Theme-Variablen), dann bauen. Neue Klassen, Farben und Radien sind die Ausnahme und brauchen einen Grund.
2. Eine Fläche ist erst fertig, wenn sie in allen Zuständen, auf Desktop/Tablet/Handy, hell/dunkel,
   Deutsch/Englisch im Theme „Casora“ geprüft ist.
3. Jeder gefundene Fehler bekommt einen Test (`dev/unit/` ohne HA, `dev/qa/regress/` mit Test-HA).
