# Casora-Bau-Handbuch

Wie in Casora gebaut wird, damit neue Kacheln, Popups und Studio-Flächen zum Rest passen. Kurz halten: was hier
steht, gilt; was nicht hier steht, ist frei (mit Blick auf die Nachbarn).

| Datei | Wofür |
|---|---|
| [design-regeln.md](design-regeln.md) | Tokens (Radien, Abstände, Schatten, Schrift, Farben, Symbolkreise, Bewegung), Kontrast, Trefferflächen |
| [popup-richtlinien-v3.md](popup-richtlinien-v3.md) | **Alles zu Popups**: Kopf, Bühne, Schnellwahl, Listen, Diagramme, neues Popup bauen (§18) |
| [blaupause-kachel.md](blaupause-kachel.md) | Neue Kachel oder neues Badge |
| [blaupause-studio-flaeche.md](blaupause-studio-flaeche.md) | Neue Studio-Seite, Inspektor-Abschnitt, Ablauf oder Rückfrage |
| [wortliste.md](wortliste.md) | Verbindliche Wörter Deutsch/Englisch, Zahlen, Einheiten |
| [test-und-release.md](test-und-release.md) | Tests, Gate, Release, was in Prod ohne Neustart geht |
| [regeltests.md](regeltests.md) | Welche Regel wie automatisch rot wird |
| [archiv/](archiv/) | Erledigte Aufträge und abgelöste Muster (Popup v2, Umbau-Aufträge), nur zum Nachlesen |

## Drei Sätze vorweg

1. Erst wiederverwenden (Kern-Bausteine `window._casoraUI`, Finder `casoraDevice`, Theme-Variablen), dann bauen.
2. Eine Fläche ist fertig, wenn sie in ihren Zuständen, auf Desktop und Handy, hell und dunkel funktioniert.
3. Jeder gefundene Fehler bekommt einen Test (`dev/unit/` ohne HA, `dev/qa/regress/` mit Test-HA).
