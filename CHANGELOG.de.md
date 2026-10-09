# Changelog

Casora ist aus [Hemma](https://github.com/willsanderson/Hemma) 2.1.2 (MIT) entstanden und wird seit
dem 26.09.2026 eigenständig weiterentwickelt. Hemmas frühere Einträge stehen in der Git-Historie.
Die englische Fassung steht in [CHANGELOG.md](CHANGELOG.md).

## 1.2.4 – 09.10.2026

### Behoben
- **Schatten in Popups:** Der weiche Schatten unter der aktiven Zeile oder Taste (Fußbodenheizung, Jalousien, Schlösser, Licht, Thermostat, Luftreiniger, Geschirrspüler, Sauger) war seitlich oder unten hart abgeschnitten. Er läuft jetzt sauber aus.
- **Thermostat-Text:** Eine Fußbodenheizung öffnet ihre Ventile nur minutenweise. In so einer Pause stand „Bereit“, obwohl der Raum noch unter dem Ziel lag. Jetzt steht „Heizt auf 22°“, bis das Ziel erreicht ist, und dann „Hält 22°“.
- **Drüberfahren im dunklen Design:** Fuhr man mit der Maus über eine aktive Zeile im Popup (z. B. einen heizenden Raum), wurde sie dunkel, die Schrift blieb dunkel und war kaum lesbar. Die Zeile bleibt jetzt hell.

## 1.2.3 – 09.10.2026

### Behoben
- **Auto-Popup:** Autos, deren Integration nur wenige Sensoren mit deutschen Namen liefert (z. B. „Reichweite“, „Kilometerstand“, „Tankstand“), werden jetzt erkannt. Das Popup blieb dort leer. „Tankstand“ und „Kraftstoffstand“ zählen als Tankfüllstand.
- **Auto-Popup robuster:** Fehlende oder nicht verfügbare Werte verhindern das Öffnen nicht mehr. Strecken stehen in der Einheit des Autos (km oder mi), ohne Türdaten steht „Keine Daten“ statt „Alles zu“.

## 1.2.2 – 09.10.2026

### Neu
- **Fußbodenheizung für alle Räume:** Die Zieltemperatur aller Räume hat jetzt dieselbe Steuerung wie ein einzelner Raum, mit Plus und Minus und dem Regler darunter. Plus, Minus und Regler stellen alle eingeschalteten Räume auf einmal ein. Sind die Räume unterschiedlich eingestellt, zeigt Casora den Durchschnitt.

### Behoben
- **Wetter-Popup:** Die Regenmengen in „Nächste Stunden“ werden unten nicht mehr abgeschnitten.

## 1.2.1 – 09.10.2026

### Neu
- **Kamera-Kachel mit Schnappschuss.** Hat die Kamera eine eigene Schnappschuss-Entität (z. B. Reolink „Schnappschüsse in Hochauflösung“), nimmt die Kachel ihr Bild von dort, schneller und schärfer. Im Studio lässt sich unter „Standbild von“ jede Kamera- oder Bild-Entität festlegen und unter „Bild auffrischen“ der Abstand (5 bis 60 Sekunden). Statt „Live“ steht „Aktuell“, ein altes Bild zeigt sein Alter in Orange.
- **Anzeige-Bedingungen für jede Kachel.** Im Studio hat jede Kachel unter „Sichtbarkeit“ den Bereich „Anzeigen, wenn“, auch Auto, E-Bike und Abfall. Die Bedingung gilt am Desktop und am Handy.
- **Schloss in Casora.** Ein Tipp auf die Schloss-Zeile im Popup öffnet eine eigene Ansicht statt des Home-Assistant-Dialogs: Verriegeln bzw. Entriegeln (mit Rückfrage, wenn eingestellt), „Tür öffnen“, wenn das Schloss das kann, Zustand mit Tür und Akku und der Verlauf von heute mit Auslöser (per App, automatisch, am Schloss). „Ganzer Verlauf“ öffnet das Logbuch für den ganzen Tag.
- **Energiefluss als ruhige Balken.** Im Energie-Popup zeigt Casora den Hausverbrauch mit Akkustand, darunter woher der Strom kommt und wohin der Solarstrom geht, mit Prozent und Watt. Ohne Animation, die Werte aktualisieren sich live.
- **Tanken-Karte neu.** Alle Stationen stehen als Punkte am echten Ort, nur die vier günstigsten bekommen eine Preis-Pille. Die Karte zoomt auf den eingestellten Umkreis und folgt der Auswahl Günstigste, Nächste und Offen. Preise mit zwei Nachkommastellen.
- **Jalousien mit Stufen.** Kachel, Badge, Popup-Ring und Zeilen zeigen dasselbe Symbol, passend zur Position (offen, vier Zwischenstufen, zu).
- **WashData 0.5.8.** Salz und Klarspüler beim Geschirrspüler, Flusensieb und Kondensator beim Trockner, eigene Wartungsaufgaben mit Namen und der Zustand „Angehalten“, wenn die Maschine mittendrin stehen bleibt.

### Behoben
- **Saugroboter im Studio:** Seine Anzeige-Bedingung steht als bearbeitbare Zeilen statt als Rohtext da.
- **Einheitliche Abstände:** Etiketten in den Karten der Popups stehen überall gleich weit vom Rand. Die Rückfrage bestätigt mit demselben Wort wie der Knopf („Entriegeln“).
- **Englisch:** Uhrzeiten im 12-Stunden-Format, Pflege-Zeilen und Aquarium vollständig übersetzt.
- **Tanken-Karte mit Home Assistant 2026.10:** Die Karte erscheint wieder (Home Assistant zeichnet Karten jetzt mit MapLibre). Lanfer-Logo mittig im Kreis.
- **Kamera-Kachel:** Das Standbild erscheint zuverlässig und frischt sich alle 10 Sekunden auf, solange die Kachel sichtbar ist.
- **Rückfrage am Handy:** „Vor dem Schalten fragen“ gilt jetzt auch in Popups, an Reglern und in der Schloss-Ansicht am Handy. Die Knöpfe der Rückfrage sind voll rund wie alle Casora-Knöpfe.
- **Energie-Popup:** Der Energiefluss blinkt nicht mehr bei jedem neuen Wert.
- **Diagramme:** Das Batterie-Popup zeigt seinen Verlauf gleich oben in der Karte, Wetter und Dünger haben ihr Etikett in der Karte, und ein Diagramm landet nicht mehr im nächsten Popup.
- **Glocke:** Symbole sitzen genau mittig im Kreis, das Warndreieck ist optisch ausgeglichen.
- **Studio:** „Verlauf auf der Kachel“ steht unter „Erweitert“. In den Versionen ist „+1 weitere“ wieder normal groß, und der Hinweis zu aktiven Kacheln verdeckt nichts mehr.
- **Aquarium-Kachel:** „Alles ok“ ohne Temperatur, die Temperatur steht nur bei Problemen davor.
- **Saugroboter:** „Räume reinigen“ steht über dem Reinigungsmodus.
- **Englisch:** Die Tanken-Empfehlung ist vollständig übersetzt.

## 1.2.0 – 08.10.2026

### Neu
- **Ruhigeres, einheitliches Design.** Glocke, Wiedergabe-Liste, ⋯-Menü und die Handy-Menüs für Räume und Szenen sind jetzt eine Familie: gleiche Rundung, gleicher Schatten, schlichte Zeilen. Diagramme stehen in allen Popups in derselben Karte, Auswahlfelder und Hauptknöpfe haben einheitliche Größen, die Einzel-Jalousie hat das breite Popup wie alle anderen.
- **Verbrauch als Säulen.** Im Energie-Popup zeigen „Heute“ und „Diesen Monat“ die letzten 7 bzw. 30 Tage als Säulen. Im Netzwerk-Popup schalten Download und Upload das Diagramm um.
- **Tanken im Auto-Popup.** Unter Tankstand und Reichweite steht „Tanken · ab 1,74 €“. Ein Tipp öffnet die Tankstellen in der Nähe auf der Karte von Home Assistant, mit Preisen, Logos, offen oder zu und einer Empfehlung, ob jetzt oder später tanken günstiger ist. Einrichten im Studio unter Einstellungen › Tanken, entweder mit der Tankerkönig-Integration oder einem kostenlosen Tankerkönig-Schlüssel.
- **Eigene Diagramme.** Alle Verläufe in den Popups sind neu: ruhige Linie, Skala rechts, Ablesen mit Finger oder Maus, die große Zahl oben liest mit. Verbrauch pro Tag erscheint als Säulen mit Durchschnittslinie, Temperatur und Luftfeuchtigkeit schaltest du um. apexcharts-card wird nicht mehr gebraucht.
- **Verlauf auf der Kachel.** Energie, Pflanze und Thermostat zeigen auf Wunsch einen kleinen Verlauf auf der Kachel, im Studio pro Kachel einschaltbar.
- **Neue Handy-Menüs (Casora und Casora Nebel).** Räume und Szenen öffnen sich als kleines Fenster über der Leiste. Szenen zeigen, wann sie zuletzt liefen, eine aktive Szene zeigt „Aktiv“. Die Leiste unten hat eine weiße Pille für den offenen Raum.
- **Geräte-Popups neu.** Geschirrspüler, Waschmaschine, Trockner, 3D-Drucker und Auto zeigen den Fortschritt als Leiste unter dem Kopf, die Prognose in einer Zeile und die Pflege daneben.
- **Glocke: „Nicht melden“.** Im Studio unter Einstellungen wählst du Geräte und Sensoren, die nie einen Eintrag in der Glocke erzeugen, zum Beispiel ein Fenster, das immer gekippt ist. Zur Auswahl stehen nur Geräte, die überhaupt melden können, nach Raum sortiert und mit der Art der Meldung.
- **Push bei neuen Casora-Versionen.** Im Studio unter Einstellungen wählst du Handys aus, die bei jeder neuen Version genau einen Push bekommen. Antippen öffnet die Updates. Standard ist aus.
- **Aquarium: Licht direkt im Becken-Popup.** An/Aus, Helligkeit, ein Regler je Farbkanal in der Kanalfarbe und die Modi der Lampe zum Antippen. Der Sprung ins allgemeine Licht-Popup entfällt. Casora erkennt, ob der Zeitplan-Schalter „Home Assistant steuert“ oder „Programm der Lampe“ bedeutet; im Studio umstellbar.
- **Aquarium: Temperatur auf der Kachel und Soll-Bereich.** Die Kachel zeigt die Temperatur („25,4° · Alles ok“). Im Studio stellst du einen Soll-Bereich ein; außerhalb warnt das Popup, ein Statussensor ist nur noch optional. Technik wie Filter und Heizer legst du jetzt im Studio an, auch als Thermostat.

### Behoben
- **Handy-Menüs Räume und Szenen:** kleines Fenster über der Leiste statt ganzflächig, ohne Überschrift, Namen werden nicht mehr abgeschnitten. Aktive Szenen zeigen „Aktiv“ in Akzentfarbe, nur sie sind farbig.
- **Medien ohne Cover:** kein doppeltes Gerätesymbol mehr, Lautstärke und Wiedergabe in der Medienfarbe.
- **Karussell-Punkte** sitzen wieder unten.
- **Szenen-Badges:** Eine aktive Szene zeigt „Aktiv“ statt der Zeit.
- **Raum-Leiste auf Tablet und Desktop:** Der offene Raum ist eine weiße Pille wie am Handy.
- **Wiedergabe-Liste oben rechts:** Sie schließt nicht mehr beim Tippen daneben, nur über die Welle selbst oder Escape, und wandert beim Raumwechsel mit.
- **Handy-Leiste:** Die Leiste unten sah seit 1.1.1 anders aus als gewohnt (zu klein, rund). Sie ist wieder wie in 1.1.0.
- **Räume- und Szenen-Blatt:** Das Blatt lässt sich jetzt wie ein Popup nach unten wegwischen, auch in der Liste. Vorher scrollte dabei der Hintergrund.
- **Szenenfarbe:** Eine im Studio gewählte Szenenfarbe erscheint sofort überall, auch in den Szenen-Badges auf Desktop und Tablet, ohne Neuladen.
- **Updates: „Installieren“ funktioniert.** Der Knopf im Studio nutzt jetzt das HACS-Update von Casora und zeigt Fortschritt und „Neustart nötig“. Unter „Was ist neu“ einer noch nicht installierten Version steht ebenfalls ein Knopf „Installieren“.
- **Studio-Ausrichtung:** Zurück-Pfeil, Szenen-Symbole und der Pfeil in „Popups“ sitzen jetzt genau mittig, „Mit KI ergänzen“ hat Abstand zum Kartenrand.

## 1.1.1 – 08.10.2026

### Neu
- **Fußball-Kachel:** folgt deinem Verein über die Integration Team Tracker (HACS). Die Kachel zeigt das nächste Spiel, den Live-Spielstand oder das Endergebnis mit Wappen oder Landesflagge, und die Ecke sagt auf einen Blick, ob das Spiel bevorsteht, läuft oder vorbei ist.
- **Fußball-Popup:** ein Tipp öffnet das Spiel mit beiden Mannschaften, dem Tabellenausschnitt rund um deinen Verein (die ganze Tabelle einen Tipp entfernt) und der letzten Form, darunter die letzten direkten Duelle mit dem nächsten Gegner. Nationalmannschaften zeigen ihre Flagge.
- **Wann sie erscheint:** wähle, ob die Kachel immer zu sehen ist oder nur in der Spielwoche, am Spieltag, rund ums Spiel oder nur live. Im Studio ist sie der neue Kacheltyp „Fußball“, und der Einrichtungsassistent schlägt sie für Team-Tracker-Sensoren von selbst vor.
- **Am Spieltag aktiv:** ab Mitternacht am Spieltag, während des Spiels und solange das Ergebnis steht, gilt die Kachel als aktiv und rückt in ihrer Reihe nach vorn. Die Ecke wird dann zur farbigen Pille, live in Rot.
- **Handy-Menüs als Blatt von unten (Casora und Casora Nebel):** Das Räume-Menü zeigt jeden Raum mit seinem Zustand („1 Licht an · 22°“), das Szenen-Menü die Szenen als farbige Kacheln. Zum Schließen nach unten ziehen oder daneben tippen.

### Behoben
- **Updates-Popup:** „Verfügbare Updates“ und „KI-Check“ stehen wieder auf einer Höhe, auch wenn „Alle aktualisieren“ daneben steht.

## 1.1.0 – 07.10.2026

Das größte Update seit Casora 1.0. Neu sind das Studio, in dem die Vorschau selbst die Arbeitsfläche ist, und das zweite Design „Casora Nebel“. Dazu kommen über 20 neue Funktionen und rund 200 Verbesserungen und Fehlerbehebungen in Dashboard, Popups, Sicherheit und Energie.

### Gut zu wissen
- Ein installiertes Update wird erst eingespielt, wenn Home Assistant beendet bzw. neu gestartet wird. Bis dahin laufen Studio und Dashboards unverändert mit der bisherigen Version.
- Neu hochgeladene Raumfotos sind jetzt geschützt (siehe Sicherheit). Ältere Raumfotos bitte einmal neu hochladen, damit sie es auch sind.
- Einmal im Studio speichern: Danach übernimmt das Handy-Dashboard bei bedingten Kacheln (z. B. Alarm nur bei Abwesenheit) auch die Bedingung und die Einstellungen vom Desktop, und die gewählte Schrift gilt auch am Handy.
- Das bisherige Studio bleibt erreichbar: „…“ › Hilfe › „Bisheriges Studio öffnen“.

### Neu

#### Studio
- **Die Vorschau ist die Arbeitsfläche:** Titel, Badge oder Kachel anklicken (am Handy antippen), und die Einstellungen öffnen sich gleich daneben, am Handy als Blatt von unten. Badges und Kacheln ziehst du direkt in der Vorschau an ihren Platz, am Touchscreen nach langem Drücken. Der Kopf jedes Editors nennt den Weg („Wohnzimmer › Kacheln“).
- **Werkzeugleiste statt Seitenleiste:** Räume, Inhalt (der Raum mit allen Abschnitten, auch dem, was die Vorschau nicht zeigt), Dashboard (nur dieses Dashboard) und Einstellungen (für alle Dashboards). Menüs und Editoren sagen oben „Gilt für: …“. Alles zum Dashboard (wechseln, neu, umbenennen, Symbol, Zeitreise, Handy-Layout, löschen) steckt im Titelmenü, „…“ heißt „Hilfe & Extras“.
- **Ausprobieren:** Langes Drücken auf eine Kachel oder ein Badge (am Computer auch Rechtsklick oder Alt+Klick) öffnet das echte Popup wie im Dashboard, schon mit dem ungespeicherten Stand. Antippen bleibt Bearbeiten.
- **Speichern ohne Verlassen:** „Speichern“ neben „Fertig“ (auch ⌘S / Strg+S) sichert und lässt das Studio offen. Meldungen, die auf das Speichern warten, haben einen Knopf „Jetzt speichern“.
- **Rückmeldung und Wiederholen:** Nach jeder Änderung erscheint unten eine ruhige Meldung mit „Rückgängig“. Neu ist Wiederholen (⌘⇧Z / Strg+Y).
- **Änderungsliste:** „Bearbeitet · 3 Änderungen ›“ unter dem Titel zeigt in klaren Sätzen, was beim Speichern rausgeht, z. B. „Raum umbenannt: Küche → Küche & Essen“ oder „Uhrzeit: 12-Stunden-Uhr an“. Jede Zeile lässt sich einzeln zurücknehmen und wiederholen.
- **Suche (⌘K):** findet Räume, Kacheln, Badges, Szenen, Einstellungen und Aktionen, auch mit eigenen Wörtern („Verlauf“ findet die Zeitreise, „Hintergrund“ das Raumfoto), und zeigt den Weg dorthin. Geräte ohne Kachel lassen sich direkt aus der Suche hinzufügen.
- **Kacheln vom Gerät her:** „+“ fragt „Was soll auf das Dashboard?“, zeigt zuerst die Geräte des Raums ohne Kachel und wählt die passende Kachelart selbst. Die bisherige Auswahl steht unter „Andere Kachelart …“. Eine neue Kachel öffnet gleich ihren Editor und leuchtet kurz auf.
- **Geräteauswahl wie in Home Assistant:** Name, „Raum · Gerät“ und Zustand, nach Räumen gruppiert, mit Suche, am Handy als Blatt. Geräte heißen überall so, wie sie in Home Assistant benannt sind.
- **Szene aus dem aktuellen Zustand:** Unter „Szene hinzufügen“ › „Aus aktuellem Zustand …“ hakst du die Geräte des Raums ab, stellst Helligkeit und Lichtfarbe direkt im Dialog ein, gibst einen Namen und eine Farbe und speicherst eine echte Home-Assistant-Szene. Nicht erreichbare Lichter stehen ausgegraut dabei.
- **Sichtbarkeit („Wer sieht das?“):** Kacheln, Badges und Räume lassen sich für einzelne Home-Assistant-Benutzer ausblenden, am Desktop und am Handy. „Ansehen als …“ zeigt die Vorschau so, wie ein anderer Benutzer sie sieht. Das Studio sagt ehrlich, dass dies nur ausblendet und kein Zugriffsschutz ist.
- **Vor dem Schalten fragen:** Für jede Kachel, die etwas schaltet oder fährt (Licht, Steckdose, Jalousie, Garagentor, Ventil, Szene, Skript, Knopf), kann das Dashboard vorher nachfragen. Das gilt für jeden Weg: Kachel, Symbol, Popup-Knöpfe und Positionsregler. Bei Sammelkacheln nennt die Frage alle Geräte, der Fokus liegt auf „Abbrechen“.
- **Räume ausblenden statt löschen:** Ein ausgeblendeter Raum bleibt mit allen Einstellungen im Studio, ist am Auge zu erkennen und steht oben im Räume-Menü mit „Einblenden“. „Raum löschen“ bietet „Lieber nur ausblenden“ an.
- **Räume ordnen:** per Ziehen oder „Alphabetisch sortieren“ statt Schritt für Schritt nach vorne.
- **Zeitreise:** hat ihren festen Platz als Uhr neben Rückgängig. Stände stehen in Alltagssätzen („Wohnzimmer gelöscht“, „Foto Küche geändert“), lassen sich benennen und anheften (angeheftete werden nie aufgeräumt), und vor dem Wiederherstellen steht, was dabei verloren geht.
- **Auf Handy öffnen:** ein QR-Code mit der Adresse des Dashboards, direkt im Studio erzeugt, ohne Passwort darin.
- **Badges umbenennen:** Feld „Name auf dem Badge“ für Klima, Beleuchtung, Personen, Medien, Sicherheit, Energie und Szenen, auf Desktop und Handy.
- **Kurze Einführung** beim ersten Öffnen (drei Hinweise, überspringbar, später unter „…“), danach drei kleine nächste Schritte (Foto, Szene, Handy), die sich selbst abhaken.
- **Neue Raumsymbole** für Garage, Briefkasten, Keller, Dachboden und Terrasse/Balkon.
- Kacheln mit einer Bedingung: Ist am Handy eine andere Bedingung gespeichert, sagt der Kachel-Editor das. Beim Speichern gilt die Desktop-Bedingung dann auch am Handy.

#### Design
- **Neues Design „Casora Nebel“:** derselbe Aufbau wie Casora, aber kühles Hellgrau statt Leinen und ein ruhiges Petrol-Blau als Akzent, hell und dunkel. Wählbar im Studio unter Einstellungen › Design und im Einrichtungsassistenten. Licht bleibt gelb, Heizung orange, Alarm rot.
- **Lila für Szenen:** Casora und Casora Nebel haben ein eigenes Lila in der Farbauswahl. Die Farbnamen richten sich nach der Farbe, die das Design wirklich zeigt.
- **Szenenfarben im ganzen Dashboard:** Läuft eine Szene, zeigen Szenen-Badges, Szenen-Popup und Szenen-Menüs (Desktop und Handy) ihre Farbe.

#### Sicherheit und Alarm
- **Rückfrage beim Scharfschalten:** Sind Fenster oder Türen offen oder Schlösser entriegelt, fragt Casora vor dem Scharfschalten nach und nennt bis zu drei davon beim Namen („Achtung: Küchenfenster offen, Haustür entriegelt“). Unscharf schalten fragt nie.
- **Alarm-Popup (Casora-Look):** Ein großer Knopf sagt, was passiert („Scharf schalten · Abwesend“, „Unscharf schalten“, „Abbrechen“ mit Countdown, rot „Alarm beenden“), darunter die anderen Modi. Verlangt die Anlage einen Code, erscheint ein Code-Feld. Gezeigt werden nur Modi, die die Anlage kann.
- **Sicherheits-Badge mit Symbolen:** Die Unterzeile zeigt kleine Symbole mit Zahl statt einer langen Liste, „Gekippt“ hat ein eigenes Symbol, nicht erreichbare Geräte sind durchgestrichen. Neue Einstellung: „Automatisch“ (Startseite kurz, Räume ausgeschrieben), „Immer kurz“ oder „Immer ausführlich“.
- Ist alles zu, sagt das Sicherheits-Badge „Alles sicher“, bei Alarm „Alarm!“, statt „1 Schloss“ steht „Schloss offen“. Das gilt auch in Hemma 1 und Hemma 2.

#### Popups, Energie und Geräte
- **Kamera-Kachel „Status von“:** freiwillig je Kamera-Kachel eine zweite Entität (eine andere Kamera oder ein Verbindungssensor), die sagt, ob die Kamera erreichbar ist. Für ein Bild über einen Proxy (go2rtc, Frigate, Scrypted, ONVIF-Proxy), der „bereit“ meldet, obwohl die Kamera weg ist. Ist sie nicht verfügbar (ein Verbindungssensor auch bei „aus“), zeigt die Kachel „Offline“ und das Sicherheits-Badge „Kamera offline“. Bild und Popup kommen weiter von der Kamera der Kachel. Ohne diese Einstellung ändert sich nichts.
- **Licht-Popup eines Raums:** neuer Knopf „Alles aus“. Das Popup einer einzelnen Lampe zeigt alle Leuchten des Raums.
- **Licht-Popup für das ganze Haus (Startseite):** „Alles aus“ gibt es auch hier, mit Rückfrage vor dem Ausschalten. Lichter, die man nicht sieht, bleiben unberührt.
- **Energie-Popup:** Die größten Verbraucher (bis zu 5) erscheinen auch ohne Zuordnung im Studio. Casora findet sie selbst und lässt Haus-, Netz-, Solar- und Akkuwerte weg. Jeder Sensor der Raumsumme steht mit seinem Wert im Popup.
- **Assist-Vorschläge aus deinem Zuhause:** passend zur Tageszeit, mit deinen Raumnamen und zuerst dort, wo gerade etwas zu tun ist (offenes Fenster, Licht an, Tür entriegelt). Die Spracheingabe nutzt die bevorzugte Assist-Pipeline deines Hauses.
- **Aquarium-Kachel:** neue Einstellung „Akku-Hinweise“ (Automatisch, Immer, Nie). Gibt es schon eine Batterien-Kachel, meldet die Aquarium-Kachel einen schwachen Fühler-Akku nicht noch einmal. Leck und Temperaturwarnung meldet sie wie bisher.
- **Handy-Raumseite:** Jalousien und Rollläden haben eine eigene Gruppe „Jalousien“ statt unter „Klima“ zu stehen, Garagen- und Hoftore stehen unter „Sicherheit“.
- **Saugroboter-Karte von selbst:** Ist im Studio keine Karte eingetragen oder gibt es die eingetragene nicht mehr, sucht das Saugroboter-Popup die Karte am Gerät selbst (Roborock: Karte des aktuellen Stockwerks, andere Integrationen: Kamera „…_map“). Eine eingetragene Karte hat Vorrang. Die Karte sitzt auf Handy, Tablet und Desktop vollständig und unverzerrt in ihrer Fläche und wechselt beim Aktualisieren ohne Flackern. Das Studio zeigt beim Feld „Karte“, welche gefunden wurde.

### Verbessert

#### Studio
- Überall „Handy“ statt „Mobil“, der Reiter „Elemente“ heißt „Inhalt“, und jeder Reiter erklärt beim Zeigen in einem Satz, was darin steckt. Das Design steht unter Einstellungen › Design, im Dashboard-Menü bleibt „Bedienung“.
- Der Kachel-Editor zeigt das Wichtige oben, „Sichtbarkeit & Rückfrage“ und „Popup“ sind zugeklappt mit kurzer Zusammenfassung. Beschriftungen von Schaltern lassen sich mit anklicken.
- Die Vorschau zeigt Kacheln so benannt wie das Dashboard, Kacheln ohne eigenen Namen nennen klein ihre Art (z. B. „3D-Drucker“), Kacheln, die ihre Daten selbst finden, zeigen „Automatisch“ statt „Gerät fehlt“.
- Die Desktop-Vorschau hat das Seitenverhältnis deines Bildschirms. Swipe-Karten erscheinen als eine Kachel mit Seitenpunkten. Neue oder entfernte Kacheln stehen sofort in der Handy-Vorschau.
- Tablet: Hochkant liegt der Editor unter der Vorschau, die Vorschau ist hochkant und mehr als doppelt so breit. Die Werkzeugleiste kürzt ihre Beschriftungen stufenweise, die Knöpfe bleiben an ihrem Platz, und nichts überlappt mit „Speichern“.
- „Neu in …“ zeigt alle Geräte des Raums ohne Kachel, auch solche, die nur einem Bereich zugeordnet sind.
- „Desktop und Handy angleichen“ meldet sich als ruhiger Hinweis in klaren Sätzen statt als oranges „2 Unterschiede“.
- Am Handy ist das Studio dunkel, wenn Home Assistant dunkel ist. Überschriften, Zurück und Schließen sind lesbar, Einstellungsseiten sind deckend.
- Einstellungen nutzen Schalter statt Häkchen, wiederholte Zeilen nennen ihre Überschrift nur einmal, Menüs am Desktop sind so hoch, dass das Raummenü ganz passt. „Einstellungen speichern“ ist klar von „Fertig“ getrennt.
- Im Casora-Look stehen Bernstein, Eisblau und Gold nicht mehr zur Wahl, weil sie wie Orange, Blau und Gelb aussahen. Schon gewählte Farben bleiben.
- Hinweise zum Einrichten („im Casora Studio zuordnen“) sehen nur Admins, alle anderen sehen „Noch nicht eingerichtet“.

#### Dashboard und Popups
- Popups sind ganz deckend, haben einheitliche Überschriften und Abstände, und die aktive Zeile sieht überall gleich aus.
- Am Handy sind Knöpfe und Tippflächen überall mindestens 44 Pixel groß (Schließen, Zurück, Schalter, Szenen-Chips, Farb- und Quellen-Pillen, Kamera-Vollbild). Bildschirmleser hören „Schließen“ und „Zurück“ in deiner Sprache.
- Besser lesbar im Casora-Look: dunklerer Start-Knopf, kräftigere ausgeschaltete Kacheln, gleiche Schriftgrößen für gleiche Rollen, am Tablet Kleingedrucktes mindestens 13 px.
- Jalousie-Popup: Schnellwahl „Zu · 25 % · 50 % · 75 % · Auf“ mit genug Platz, Rollos, Fensterläden und Behänge stehen gemeinsam unter „Jalousien“.
- Saugroboter-Popup: Modusknöpfe füllen die Breite, nichts wird abgeschnitten, Programme ohne den Gerätenamen davor, auf Englisch vollständig übersetzt.
- Kamera ohne Bild zeigt eine ruhige Fläche mit Kamera-Symbol und „Kein Bild“ statt einer schwarzen Kachel mit „Live“.
- Alarm-Popup: Der Kopf zeigt die Farbe des aktiven Modus (scharf = in Ordnung), Rot nur bei Alarm. Das Thermostat-Popup zeigt im Kopf dasselbe Symbol wie die Kachel.
- Schaltbare Einzelgeräte haben einen Schalter auf der Kachel, neu auch der Luftreiniger, Gruppen nicht.
- Glocke: überall derselbe Punkt bei neuen Mitteilungen, das Menü hat eine Überschrift. Ein Tipp auf einen Eintrag öffnet dasselbe Popup wie der Tipp auf die Kachel.
- Raumleiste am Computer: Mit der Tastatur sieht man, welcher Raum gewählt ist, nach einem Mausklick erscheint kein Rahmen mehr.
- Handy, Casora-Look: Die Badges auf der Startseite stehen wieder genau so eng wie in den Räumen (8 px) und sind so breit wie ihr Inhalt. Beim Wechsel in einen Raum stehen die Kacheln sofort an ihrem Platz.
- Energie-Badge im Raum zählt alle Geräte (auch gleich benannte und den Eigenverbrauch eines Schaltaktors), nur Leistung, rechnet kW in W um und überspringt nicht erreichbare Sensoren. Ein abgewählter Sensor bleibt ausgeschlossen, „Alle aufnehmen“ zeigt, was noch nicht mitzählt.
- Lüften: Nach einem Neustart zählt die Offen-Zeit eines Fensters weiter. Ohne Außensensor steht „Außenwerte fehlen“ statt „draußen feuchter“.
- Temperaturen, Niederschlag und Kosten erscheinen in der Einheit bzw. Währung von Home Assistant oder des Sensors (z. B. °F, Zoll, CHF). Die KI-Coaches bekommen Temperaturen in der richtigen Einheit.
- „Vor 36 Stunden“ heißt „Gestern“, kurze Laufzeiten zeigen Minuten statt „0 Std.“.
- Kamera- und Pflanzen-KI sagen ohne eingerichtete KI, woran es liegt („Keine KI eingerichtet“).
- Handy beim Scrollen (Casora und Nebel): Oben schwebt eine kleine Pille mit dem Wichtigsten, im Raum z. B. „Schlafzimmer · 21° · Licht aus“, auf der Startseite „Zuhause“ neben Glocke und Menü. Antippen springt nach oben. Statt des Balkens mit harter Kante läuft der Inhalt unter einem weichen Verlauf durch, zurück geht es über die untere Leiste.

#### Übersetzungen
- Englisch: viele Lücken geschlossen, z. B. Termine, „Neu: …“, Updates („2 available“), Energie, Rezepte, Abfuhrtermine, Saugroboter, Alarm-Countdown, Windrichtungen (NE/SE), Müll-Dienst („Next turn“).
- Medien-Badge: pausierte Wiedergabe heißt „1 pausiert“ statt „1 läuft“. Szenen-Badge: „Keine aktiv“. Thermostat-Kachel mit Dezimalkomma („19,5°“).

### Behoben

- Studio-Vorschau auf Englisch: Raumnamen stehen so da wie im Dashboard („Küche“ wird zu „Kitchen“). In den Feldern des Studios behält ein Raum den Namen, den du eingegeben hast.
- Mit Home Assistant 2026.10 fehlte auf iPhones bis iOS 17 die Unschärfe hinter Kacheln und Popups. Sie ist wieder da.
- Glocke: Eine Tür oder ein Fenster mit Kontakt- und Kippsensor steht nur noch einmal in der Glocke, je nach Stellung „ist gekippt“ oder „ist offen“.
- Automatisch einrichten: Eine Lichtgruppe des Raums mit einer Untergruppe ohne Bereich wird wieder für den Raum genommen statt einer einzelnen Lampe.
- „Alles aus“ im Licht-Popup ist mit der Tastatur erreichbar und bedienbar.
- „+N weitere“ in der Verlustliste der Zeitreise zeigt bei Bedienung mit der Tastatur einen Fokusrand.

#### Dashboard und Popups
- Heizungs-Popup: Plus, Minus und der Temperatur-Balken reagieren wieder (Touch und Maus). Bei „Aus“ ist die Zieltemperatur sichtbar, Einstellen schaltet auf Heizen.
- Thermostat im Modus „Automatik“ zeigt „Automatik · 21°“ statt „Aus“, ein Tipp schaltet es aus statt auf manuelles Heizen. Fehlt eine Zieltemperatur, steht nie mehr „undefined°“.
- Fußbodenheizung: Ein vom iPhone unterbrochenes Ziehen am Balken verstellt beim nächsten Wischen nichts mehr. Liefert ein Sensor keine Zahl, fehlt nur diese Zeile.
- Alarm-Popup: Die Modus-Zeilen (Abwesend, Nacht, Urlaub, Bypass) schalten wieder. Eine Alarm-Kachel ohne zugeordnetes Gerät zeigt dieselbe Anlage wie ihr Popup.
- Schlösser: Der Schalter steht bei „Verriegelt“ auf An, der Kopf nennt bei gemischtem Zustand „1 entriegelt“. Ein geöffnetes Schloss heißt „Offen“ mit offenem Symbol statt „Blockiert“. Am Tablet verdeckt der Schalter die Überschrift nicht mehr.
- Jalousie-Popup: Die Markierung Zu/25/50/75/Auf folgt der echten Position.
- Beleuchtung: Halten auf das Badge und Licht-Chips öffnen das Casora-Licht-Popup mit den echten Lichtern des Raums. Der gewählte Weißton und die gewählte Lichtfarbe sind hinterlegt.
- Licht-Popup des ganzen Hauses: Die Leiste mit den Räumen flackert nicht mehr, wenn ein Raum mit mehreren Lichtern eingeschaltet wird.
- Automatisch einrichten: Die Raum-Kachel „Beleuchtung“ nimmt nie mehr die Lichtgruppe des ganzen Hauses.
- Glocke: Meldungen ohne passende Kachel (z. B. eine Pflanze) öffnen das Casora-Popup statt eines technischen Home-Assistant-Fensters.
- Pflanzen-Popup am Handy: lange Messwert-Namen schieben das Popup nicht mehr breiter als den Bildschirm. Der Pflanzenname fällt vorn auch dann weg, wenn er dort ohne Umlaute geschrieben ist, und der Zusatz „ 2“ von Home Assistant bei doppelten Namen entfällt. Die Werte rechts sind immer ganz zu sehen.
- Energie: „Einspeisung gesamt“, Zähler in Wh und Leistung in kW werden richtig angezeigt (z. B. 1,5 kWh statt 1500 kWh, 2,5 kW statt 3 W). Der Hinweis ohne Tageswerte ist vollständig lesbar.
- Musik-Popup: Die Tasten springen beim Abspielen nicht mehr, am iPad quer sind Tasten und Lautstärke ohne Scrollen zu sehen.
- Abfall-Popup: Die Pfeile zum Blättern im Monatskalender sind nicht mehr oben abgeschnitten.
- Szenen ohne Editor-Konfiguration (YAML, Hue) zeigen nach dem Start kurz „Aktiv“.
- Licht-Kachel: Ein eigener Popup-Titel wird im Popup angezeigt.
- Symbole aus einem nicht installierten Symbolsatz zeigen ein Standardsymbol statt eines leeren Kreises.
- Assist per Sprache: Kommt keine Antwort, ist die Eingabe nach 45 Sekunden wieder bedienbar.
- Design „Casora“ hell: In Home Assistant (z. B. „Bedingung hinzufügen“ im Automations-Editor) sind die nicht gewählten Reiter „Nach Typ“ und „Bausteine“ wieder lesbar. Das Dashboard bleibt unverändert.

#### Handy
- Eine im Studio ausgeblendete Kachel fehlt auch auf der Raumseite und den Kategorieseiten.
- Wer gleich nach dem Laden einen Raum wählt, sieht ihn sofort. Nach dem Licht-Popup rutscht der Inhalt nicht mehr nach unten.
- Der Titel der Startseite wechselt nicht mehr zwischen „Home“ und „Zuhause“. Nach einem Umzug von Hemma 1 heißt die Übersicht wie am Desktop.
- Die Sicherheit-Seite lädt ohne Fehler. Glocken-Liste und Räume-Menü sind deckend.
- Im Räume-Menü sitzt die Markierung des offenen Raums ringsum gleich weit vom Rand, ihre Ecken folgen der Rundung des Menüs, und das Symbol hat links so viel Luft wie zum Text.

#### Studio
- Kein Speicherweg (Assistent, neue Szene, Einstellungen) überschreibt mehr ein Dashboard, für das Speichern gesperrt ist. Nach einem Lesefehler schreibt das Studio nichts.
- Änderungen, die während des Speicherns entstehen, bleiben als ungespeichert markiert. ⌘S während eines Dashboard-Wechsels speichert nicht mehr nur die halbe Fassung.
- Einstellungen speichern (z. B. Lüften) wirft nicht mehr aus dem Studio, am Handy springt die Leiste danach richtig zurück.
- „Diesen Stand wiederherstellen“ fragt nur einmal und ist auch über „…“ am Stand erreichbar.
- Für dich ausgeblendete Geräte öffnen sich nicht mehr über die Glocke oder ein Sammel-Popup. „Ansehen als“ und das Sicherheits-Badge zählen nur, was diese Person sieht.
- Ein Dashboard, das inzwischen zu Casora gehört, erscheint nach spätestens einer Stunde in der Auswahl. Neue oder entfernte Szenen erscheinen beim Zurückkehren in den Tab.
- Hinter Geräte-Assistent und YAML-Import bleibt das neue Studio stehen. Dialoge mit drei Knöpfen ragen nicht mehr über den Rand.
- Eine weiße Lampe heißt im Szenen-Dialog „weiß“ statt „rot“, das Studio sagt wie das Dashboard „An“ statt „Ein“.
- Die Vorschau im Look „Casora“ zeigt das Dashboard jetzt maßstabsgetreu, nur verkleinert: Kacheln, Badges und Titel stehen im selben Verhältnis wie auf dem Bildschirm, und es passen gleich viele Kacheln in die Reihe (vorher waren die Kacheln zu klein und die Badges zu hoch).

#### Updates und Hintergrund
- Bricht das Einspielen eines Updates ab (z. B. Speicher voll), bleibt die laufende Version unverändert. Ein installiertes Update wird nicht erneut angeboten.
- Ohne Internet startet Casora nicht mehr bis zu 20 Sekunden verzögert. Ist ein einzelnes Karten-Update nicht abrufbar, werden die übrigen trotzdem gefunden.
- Liegt beim Start ein Karten-Update bereit, werden die Dashboards zuverlässig mit dem neuesten Stand gespeichert. Speichern zwei Dashboards gleichzeitig, geht unter „Versionen“ nichts mehr verloren.
- Eigene Schriften mit gleichem Dateinamen in zwei Familien überschreiben sich nicht mehr.
- Der Konfigurieren-Dialog sagt bei falschen Werten „Ungültige Eingabe“ statt „Ungültige Zeit“. Umzug „Vorlage anpassen“ meldet unpassende KI-Änderungen verständlich.
- Alle Kacheln und Badges geben beim Antippen ein kurzes Feedback, jetzt auch Heizung, Fußbodenheizung, Luftbefeuchter, Luftreiniger, Bewegung und Anwesenheit. Plus und Minus der Zieltemperatur geben beim Drücken sichtbar nach.

### Sicherheit
- Neu hochgeladene Raumfotos bekommen einen nicht erratbaren Dateinamen. So kann niemand ein Foto deiner Wohnung über eine einfache Adresse wie „wohnzimmer.jpg“ abrufen. Ältere Fotos einmal neu hochladen.
- Die Dienste „Casora einrichten“ und „Casora umstellen“ dürfen nur Administratoren aufrufen. Nach dem Entfernen von Casora lassen sie sich nicht mehr aus alten Automationen starten.
- Benutzer ohne Admin-Rechte können über die Handy-Raumbadges nicht mehr den Aufbau eines Dashboards lesen, das nur für Admins sichtbar ist.
- Hinweistexte anderer Integrationen im Updates-Popup, Vorlagentexte und Raumnamen in Assist-Vorschlägen werden sicherer verarbeitet (Vorsorge, war nicht ausnutzbar).

### Leistung
- Das Studio öffnet sich viel schneller: erneut geöffnet am Handy nach etwa 2 statt 8 Sekunden, am Desktop nach 0,6 statt 2 Sekunden. Es lädt dafür nicht mehr jedes Mal alle Dashboards herunter.
- Programmcode und Kartenvorlagen des Studios kommen gepackt (1,1 statt 4,6 MB) und bleiben im Browser gespeichert, bis Casora aktualisiert wird.
- Am Handy reagieren die Editoren etwa doppelt so schnell, am Desktop liegen fast alle Aktionen unter 0,1 Sekunden. Ein Speicherleck ist behoben, das Studio wird bei langer Arbeit nicht mehr langsamer.
- Raumfotos brauchen am Handy nur noch etwa ein Viertel der Daten, am Desktop ein Drittel (WebP, am Handy verkleinert). Deine Originalfotos bleiben unverändert.
- Weniger Akku- und Rechenlast im Leerlauf, und Wand-Tablets werden über Tage nicht mehr träger, weil Kachelreihen und Swipe-Karten ihren Speicher wieder freigeben.

## 1.0.11 – 05.10.2026

### Verbessert
- Welle (Casora-Look, Desktop/Tablet): Läuft etwas, öffnet sich die Liste unter der Welle von selbst, auch nach dem Neuladen. Klappt man sie selbst zu (Welle, daneben tippen, Escape), bleibt sie auf diesem Gerät zu, auch nach dem Neuladen, bis eine neue Wiedergabe startet. Schließt sie sich von selbst, weil nichts mehr läuft, zählt das nicht als zugeklappt.

## 1.0.10 – 05.10.2026

### Neu
- Wiedergabe im Casora-Look (Welle oben, Handy-Liste, Medien-Zeile im Raum): Spielen mehrere Player denselben Titel desselben Interpreten, stehen sie in einer Zeile, z. B. „HomePod Küche + Büro · NICKLAS“, ab drei Playern „HomePod Küche + 2“. Play und Pause steuern alle Player der Zeile zusammen, Antippen öffnet das Popup des ersten.
- Wiedergabe ausblenden: Eine Zeile nach links wischen (Finger oder Maus) zeigt „Ausblenden“. Die Wiedergabe verschwindet dann nur auf diesem Gerät, bis der Player etwas anderes spielt. Sind alle ausgeblendet, verschwindet auch die Welle oben.

### Behoben
- Wiedergabe nach dem Laden: Im Casora-Look blitzte nach Cache leeren oder Neuladen kurz der alte Player auf (Desktop: Kachel-Stapel unter der Welle, Handy: Medien-Zeile), bis die Zusatz-Skripte nachgeladen waren. Die Vorlagen erkennen den Casora-Look jetzt schon beim ersten Zeichnen am Theme und blenden den alten Player gleich aus.
- Wiedergabe: Pausierte Player verschwinden nach der Pausen-Frist jetzt von selbst. Bisher blieben sie in Welle und Listen stehen, bis irgendein anderer Player wechselte, und die Anzeige sprang dann plötzlich um. Außerdem gewann am Handy manchmal eine ältere Fassung der Wiedergabe-Logik aus der Vorlage; jetzt gilt überall dieselbe.
- Szenen „Zuletzt aktiv“: Tage werden nach Kalendertag gezählt. Eine Szene von gestern Abend heißt jetzt „Gestern“ statt ab 36 Stunden „Vor 2 Tagen“ (#12, Refs #11).

## 1.0.9 – 05.10.2026

### Neu
- Handy-Raumseite wie am Desktop und Tablet: Die Badges oben auf der Raumseite am Handy sind jetzt dieselben wie im Raum-Kopf am Desktop/Tablet: Sicherheit, Klima, Licht, Personen, Energie und Medien, mit denselben Texten, in derselben Reihenfolge und mit derselben Einstellung „einzeln oder gesammelt“. Antippen einer Sammel-Badge klappt ihre Einzelnen darunter auf (nur auf diesem Gerät). Bisher zeigte das Handy eine eigene, kleinere Auswahl: ohne Energie, Klima als einzelne Messwerte, Türen und Fenster nur teilweise. Das greift für alle Dashboards automatisch mit dem Update, ohne Speichern im Studio, auch für aus Hemma umgezogene. Die Handy-Vorschau im Studio zeigt dasselbe.
- Luftqualität im Badge (Casora-Look): neues Wind-Symbol; bei mäßiger Luft kommen zwei, bei schlechter vier Partikel dazu. Der Kreis hat wieder die normale Stufenfarbe.

### Verbessert
- Handy, Casora-Look (hell und dunkel): Der Schleier über dem Hintergrundfoto kommt jetzt von oben und reicht bis knapp unter „Favoriten“, damit Titel, Badges und die erste Überschrift gut lesbar sind. Darunter bleibt das Foto klar bis ganz unten, ohne Leinen- bzw. Anthrazit-Fläche am unteren Rand. In 1.0.8 war der Schleier bei „Favoriten“ schon fast weg und unten lag dafür ein heller Verlauf. Die Raumseiten am Handy bekommen denselben Verlauf von oben.

## 1.0.8 – 05.10.2026

### Neu
- Wetter über dem Raumtitel am Desktop und Tablet größer (Casora-Look): Temperatur und Symbol deutlich größer, daneben zweizeilig der Zustand und „H 17° · T 9° · 20 % Regen“ aus der Tagesvorhersage. Ohne Tagesvorhersage fällt die zweite Zeile weg. Im Studio unter Wetter lässt sich das mit „Details anzeigen“ abschalten, dann stehen nur Temperatur und Symbol da. Das Handy bleibt unverändert, Hemma 1 und Hemma 2 ebenso.
- Die Uhr oben links ist im Casora-Look minimal größer (16 statt 15 px).

### Geändert
- Die Themes haben neue Namen: Casoras eigener Look heißt im Profil jetzt „Casora“ (vorher „Casora Weich“), die beiden klassischen Looks „Hemma 2“ (vorher „Casora Standard“) und „Hemma 1“ (vorher „Casora Glass“). Eine gespeicherte Wahl zieht beim ersten Start von selbst mit, auch die eigene Wahl im Browser.
- Alarm im Casora-Look: „Aktiv · Abwesend“ statt „Aktiv · Unterwegs“, passend zum Modus in Alarmo.
- Handy, Casora-Look hell: Der Leinen-Schleier über dem Hintergrundfoto reicht nur noch von oben bis etwa „Favoriten“, darunter bleibt das Foto klar und läuft erst ganz unten weich in Leinen aus. Bisher lag er von oben bis unten über dem Foto, alles wirkte milchig. Auch die Raumseiten am Handy sind dadurch klarer.
- Luftqualität im Badge (Casora-Look): sieben große Punkte statt der feinen Punktgrafik, die Punkte wachsen mit der Belastung, der Kreis ist etwas dunkler. Das alte Symbol war im kleinen Kreis kaum zu erkennen, vor allem auf Gelb.
- KI-Update-Prüfung: Für Casora-Updates bekommt die KI die Release-Notes direkt mit, statt sie selbst bei GitHub abzurufen. Bisher kam dort oft „Release-Notes nicht abrufbar“.

### Behoben
- Kameras: Eine Kamera gilt nur noch als offline, wenn Home Assistant sie als nicht verfügbar meldet. Bisher hat Casora zusätzlich ein Standbild abgerufen; bei langsamen Kameras (zum Beispiel Reolink, Standbild bis über 10 Sekunden) brach Home Assistant ab und Kachel, Badges und Popup zeigten „Offline“, obwohl die Kamera lief. Das Popup legte das sogar über ein laufendes Live-Bild.
- Saugroboter: „hat fertig gereinigt“ stand nach einer Reinigung mit Zwischenstopps (Mopp waschen) manchmal zweimal in der Glocke, etwa nach einem Home-Assistant-Neustart mitten in der Reinigung. Jetzt bleibt je Reinigung genau eine Meldung, zur letzten Rückkehr an die Station.
- Popup „Türen & Fenster“ im Casora-Look hell: Die weißen Zeilen hatten unten an den Ecken einen eckigen grauen Schatten. Der Schatten läuft jetzt weich um die runden Ecken.

## 1.0.7 – 05.10.2026

### Verbessert
- Weich, Kachelreihe am Desktop und Tablet: Liegen rechts noch Kacheln, blendet die angeschnittene Kachel weich zum Rand aus, darunter zeigen kleine Seitenpunkte, wie viel noch kommt (antippbar). Einstellbar über die Theme-Variable `casora-row-overflow` (`fade`, `arrows` oder `more`).
- Akku-Anzeigen überall einheitlich: OK, Schwach (20 % oder weniger), Fast leer (10 % oder weniger), Lädt und Unbekannt, mit denselben Wörtern und Farben in Batterien-Kachel und -Popup, Glocke, Schloss, Aquarium, Saugroboter und Thermostat. Die Glocke färbt nach dem schwächsten Akku orange oder rot statt immer rot.
- Weich, Popups: Inhaltskarten heben sich unter dem Mauszeiger nicht mehr an, lange Popups haben unten mehr Luft und blenden in der Popup-Farbe aus.
- Weich, Jalousie-Popup: Kopf, Regler und Zeilen zeigen dasselbe Lamellen-Symbol wie die Kachel.
- Weich, Handy-Raumseite: Kategorie-Überschriften so groß wie „Szenen“; eine leere Kategorie zeigt einen Hinweis statt leer zu bleiben.
- Weich dunkel: ausgeschaltete Schalter warmgrau mit cremefarbenem Knopf statt fast schwarz.
- Alarm-Popup: Modusliste in voller Breite, der Schalter heißt „Alarm“ (an = scharf).
- Pflanzen-Popup: zeigt nur noch Pflanzen-Messwerte, keine fremden Sensoren mehr.
- Rezept-Popup (Weich): Knöpfe in Ton und Sand, Titel kräftiger.
- Weich, Kachelreihe am Desktop und Tablet: Der weiche Verlauf sitzt jetzt fest am Rand der Reihe, die Kacheln laufen darunter durch; er wandert nicht mehr mit einer Kachel mit und zeigt keine harte Schattenkante. Das Wischen mit Touchpad oder Mausrad läuft wieder flüssig: Die Reihe rastet nicht mehr an Kachelkanten ein (in Chrome zog sie bei jedem Wischschritt zurück, in Safari hing sie und sprang nach dem Loslassen nach; bei Touch bleibt das sanfte Einrasten, die Pfeile landen weiter an einer Kachelkante), beim Zurückwischen läuft die Reihe am Anfang nicht mehr in die Zurück-Geste des Browsers und hängt dort nicht mehr, der Verlauf ändert mitten im Wischen nicht mehr den Aufbau der Kacheln, und die Reihe misst höchstens einmal pro Bild nach, nur noch beim Umsortieren statt bei jeder Zustandsänderung, und der Player „Aktuelle Wiedergabe“ schiebt pro Sekunde nur noch die Fortschrittsbalken weiter, statt die Liste neu zu bauen.
- Weich, „Aktuelle Wiedergabe“: Statt des seitlich scrollenden Karussells (Handy) und der Medien-Pillen unter den Badges (Desktop und Tablet) stehen alle Player jetzt in einer ruhigen Karte, je Player eine Zeile mit Cover, Titel, „Interpret · Gerät“, dünnem, mitlaufendem Fortschritt und rundem Play/Pause-Knopf. Antippen einer Zeile öffnet wie bisher das Medien-Popup. Am Desktop und Tablet stehen die Zeilen nebeneinander und brechen um, statt seitlich zu scrollen; damit ist auch die abgeschnittene Schattenkante unter dem bisherigen Player weg. Standard und Glas bleiben unverändert. Die Studio-Vorschau am Handy zeigt die neue Liste ebenfalls.
- Weich, Medien-Welle oben rechts (Desktop und Tablet): Ein Tipp auf die Welle öffnet jetzt ein ruhiges Menü darunter im Stil des Mitteilungsmenüs, statt den Stapel der Mini-Player-Kacheln aufzuklappen. Jeder Player ist eine Zeile genau wie in der Liste „Aktuelle Wiedergabe“: Cover, Titel, „Interpret · Gerät“, dünner, mitlaufender Fortschritt und runder Play/Pause-Knopf im Akzent-Ton. Lange Titel enden mit Auslassungspunkten, ohne Cover steht ein Noten-Symbol. Antippen einer Zeile öffnet wie bisher das große Medien-Popup; Tipp neben das Menü, erneut auf die Welle oder Escape schließt es. Endet die letzte Wiedergabe bei offenem Menü, blendet es sich selbst aus und die Welle verschwindet wie bisher. Hell und dunkel. Am Handy gibt es keine Welle, dort bleibt alles wie es ist; Standard und Glas behalten den Kachel-Stapel. Die Studio-Vorschau am Desktop zeigt die offene Welle als dieselbe Liste.
- Weich, Navigationsleiste am Handy: kompakte Kapsel nur mit Symbolen; das aktive Ziel wird zur Pille in hellem Sand mit seinem Namen (Zuhause, der offene Raum oder Szenen), wie in der Raumleiste am Desktop. Fläche, Schatten und Unschärfe kommen von der Desktop-Raumleiste, die Raum- und Szenen-Menüs sehen aus wie ihre Menüs (gleiche Fläche, normale Schrift, aktiver Eintrag in hellem Sand). Alle Ziele, die Menüs und der Raumwechsel funktionieren wie bisher. Standard und Glas behalten die Leiste mit Beschriftung. Die Studio-Vorschau am Handy zieht mit.
- Weich, Knöpfe oben rechts: gleicher Aufbau, gleiche Knöpfe und gleiche Einträge im ⋯-Menü wie bisher, ruhigere Optik. Die Kapsel am Handy ist 48 px hoch, die Kreise am Desktop sind 40 px groß mit 8 px Abstand und bleiben mittig zur Raum-Leiste; beide haben dieselbe helle Fläche mit weichem Schatten, ohne Randlinie und Glanzkante. Die Symbole sind etwas leichter, der Trennstrich kürzer und zarter, Zähler und Punkt der Glocke Karamell statt Rot, und die Medien-Welle (wenn etwas spielt) steht in einem passenden Kreis in Ton-Tinte. Casoras Menüs bekommen 44-px-Zeilen, leicht getönte Symbolkreise und 24 px Radius. Hell und dunkel; Standard und Glas bleiben unverändert.
- Abfall-Kachel und Abfall-Popup (Weich-Look): Am Abholtag zeigt die Kachel jetzt die Farbe der Tonne als vollen Kreis mit hellem Symbol. Bisher war Restmüll ein graues Symbol auf grauem Kreis und ging vor allem im Dunkelmodus fast unter. Alle Abfallarten nutzen überall die Popup-Farben (Kachel, Popup, Monatskalender, Kalenderpunkte), Restmüll als deckendes warmes Taupe je Modus statt eines halb durchsichtigen Brauns. Problemstoffe bekommen ein eigenes Rot statt desselben Oranges wie Sperrmüll. Einstellbar über die Theme-Variablen `casora-waste-rest`, `casora-waste-bio`, `casora-waste-paper`, `casora-waste-yellow`, `casora-waste-glass`, `casora-waste-bulky`, `casora-waste-hazard`, `casora-waste-other` und `casora-waste-glyph`. Andere Looks bleiben unverändert.

### Behoben
- Saugroboter in der Glocke: Ein Sauger, der mitten in der Reinigung zur Station fährt (Mopp waschen, absaugen, laden), meldet nicht mehr bei jedem Andocken „hat fertig gereinigt“. Verrät die Integration den Grund (Status wie Moppwäsche, Absaugen, Trocknen oder Laden, Fortschritt unter 100 %), zeigt die Glocke stattdessen einen laufenden Eintrag „Pause · wäscht Mopp“. Ein eindeutiges Ende (Fortschritt 100 %, neues „Letztes Reinigungsende“, Status fertig) zählt sofort. Ohne solche Sensoren gilt der Sauger nach 10 Minuten Ruhe an der Station als fertig; fährt er vorher wieder los, ist es dieselbe Reinigung. Gilt für alle Hersteller, live und beim Neuaufbau der Glocke aus dem Logbuch; falsche Einträge früherer Zwischenstopps verschwinden.
- Kameras: Eine Kamera, die eine Zeit lang kein Bild lieferte, blieb in Badges als „offline“ stehen, auch wenn sie längst wieder lief. Als offline gemerkte Kameras werden jetzt jede Minute und beim Zurückkehren zur Seite neu geprüft, alle Karten und Badges mit dieser Kamera zeichnen sich dann neu.
- Handy-Kachelraster: Eine Kachel, die nur unter einer Bedingung erscheint (zum Beispiel die Alarm-Kachel bei „Abwesend“), war einige Pixel höher als die anderen kleinen Kacheln, der Abstand zur Kachel darunter schrumpfte. Sie hat jetzt in jedem Look genau die Reihenhöhe.
- Weich, Sicherheit: Kacheln, Badges, Popups und Glocke zeigen für denselben Zustand dieselbe Farbe, dasselbe Wort und dasselbe Symbol. Grün = in Ordnung (verriegelt, geschlossen, Alarm aktiv), Orange = Hinweis (entriegelt, offen, Alarm aus, Kamera offline), Rot = Gefahr (Alarm ausgelöst, offen bei Abwesenheit). Der Alarm klingt freundlicher und heißt überall „Aktiv · Zuhause“, „Aktiv · Unterwegs“, „Aktiv · Teilweise“ (statt Bypass), „Aus“ und „Alarm!“, mit dem Modus-Symbol in Badge, Kachel, Popup und Glocke; die kleine Handy-Kachel zeigt nur den Modus („Unterwegs“), damit nichts gekürzt wird. Schloss- und Kontaktzeilen in den Popups und der Popup-Ring nehmen diese Farben statt Petrol oder Sand. Andere Looks bleiben unverändert.
- Schloss: Kachel, Badge und Popup sagen überall „Entriegelt“ bzw. „Verriegelt“, entriegelt in der Warnfarbe, und der Schalter im Popup steht wie der Kachel-Schalter.
- Luftreiniger: Modi wie „auto“ oder „sleep“ erscheinen als „Auto“ und „Schlaf“, wenn Home Assistant keine Übersetzung liefert.
- Wortwahl: „OK“ statt „Ok“, im Studio „1 An“ wie im Dashboard.
- Studio: Ein Klick auf das schon aktive Tag- oder Nacht-Feld schaltet nicht mehr um.
- Abfall-Popup mit Monatskalender (Weich, Desktop und Tablet): beide Spalten enden jetzt bündig. Der Monat füllt die Höhe der rechten Spalte (Heute, Tonnen, Rausstellen), und seine Platte beginnt auf derselben Linie wie die Tageskarte daneben. Am Handy bleibt alles wie bisher.
- Weich, Studio-Handyvorschau: Klima- und Sicherheits-Badge zeigen dieselben Symbole wie am Handy (Haus-Thermometer, orangefarbenes Schild bei Handlungsbedarf) im farbigen Kreis, Temperaturen als „21°“, Jalousie-Kacheln Lamellen statt Vorhang.
- Weich, Studio-Popup-Vorschau: Das Etikett „Popup · …“ über der Vorschau ist im hellen Modus gut lesbar.
- Weich, Studio → Design & Bedienung → Design: Die drei Designs stehen nebeneinander, Namen einzeilig, „Legacy“ als kleines Etikett darunter.
- Weich, Handy-Popups wie Thermostat oder Energie: Das Sheet ist nur so hoch wie sein Inhalt, statt immer bis oben zu reichen.
- Handy-Kacheln: kürzere Texte, die nicht mehr abgeschnitten werden („Kein Sensor“ bei Energie und Solar-Tipp ohne Sensor, „Rezept“ als Name der Rezept-Kachel).
- Weich, Wetter im Titel: gefülltes Wettersymbol in Titelfarbe statt dünner grauer Kontur.
- Weich, Wetter-Popup: Die Überschriften „Nächste Stunden“, „7 Tage“ und der Diagrammtitel stehen wie in den übrigen Popups über ihrer Fläche.
- Weich, Netzwerk-Popup: alle Netzwerk-Symbole in der Netzwerkfarbe (Blau), das „An“ eines WLANs ist nicht mehr grün.
- Weich, Raumseite am Handy: Gescrollte Kacheln und Szenen scheinen nicht mehr hinter dem kleinen Raumtitel durch; er bekommt eine Leinenfläche, die mit dem Titel einblendet (hell und dunkel).
- Handy-Startseite: Nach längerer Zeit im Hintergrund konnte der Abstand zwischen Kopfleiste und Zeile „Zuhause“ rund 150 px zu groß sein. Casora misst ihn bei der Rückkehr neu und richtet das Layout selbst (notfalls mit einmaligem Neuladen).

## 1.0.6 – 04.10.2026

### Neu
- Handy, Raumseite: Die Kacheln sind nach Kategorien gruppiert wie in Apples Home-App: Licht, Klima (Heizung, Fußbodenheizung, Luftreiniger, Ventilator, Jalousien), Sicherheit, Lautsprecher und TVs, Wasser und Sonstiges, jeweils mit kleiner Überschrift. Innerhalb einer Gruppe bleibt die Studio-Reihenfolge. Räume mit höchstens 3 Kacheln oder nur einer Geräteart bleiben wie bisher ohne Überschriften. Studio → Design & Bedienung → Mobil: „Räume am Handy nach Kategorien gliedern“ (Standard an) schaltet es je Dashboard aus. Auch in der Studio-Vorschau am Handy erscheinen die Gruppen und folgen dem Schalter sofort.

### Behoben
- Sicherheits-Badge: Eine Kamera, die zwar als bereit gemeldet wird, aber kein Bild liefert (z. B. über einen Proxy), zählte im Badge als in Ordnung, während die Kamerakarte schon „Offline“ zeigte. Der Badge meldet sie jetzt ebenfalls als offline, auch der eigene Kamera-Badge im Raum.

### Verbessert
- Aquarium-Popup: Der Abschnitt mit den Akkus von Leck- und Temperatursensor heißt jetzt „Sensoren“ statt „Fühler“.
- Dashboard, „…“-Menü: „Aktualisieren“ und „Neu laden (Cache leeren)“ sind jetzt ein Eintrag „Aktualisieren“, der beim Neuladen immer auch Casoras Zwischenspeicher leert.
- Raumansicht am Handy (Weich): mehr Luft zwischen der Badge-Reihe unter dem Raumnamen und der ersten Kachelreihe (40 px statt 24 px), die Badges kleben nicht mehr an den Kacheln. Einstellbar über die Theme-Variable `casora-room-badges-gap-mobile`.
- Medien-Popup an Desktop und Tablet (Apple TV und andere Player mit Apps): Die linke Spalte (Ausschalten, Apple Music öffnen, Weitere Einstellungen) hat jetzt eine eigene Überschrift „Gerät“ im selben Stil wie „Apps“ rechts, beide Spalten beginnen auf gleicher Höhe.

## 1.0.5 – 04.10.2026

### Neu
- Nach einem Casora-Update merkt ein offenes Dashboard die neue Version selbst (wenn sich Home Assistant
  nach dem Neustart wieder verbindet, wenn der Tab wieder sichtbar wird und alle 10 Minuten) und zeigt
  unten einen ruhigen Hinweis: „Casora wurde aktualisiert“ mit „Neu laden“. Er erscheint einmal je Update
  und lässt sich wegklicken. Neu laden entfernt vorher Casoras Dateien aus dem Browser-Cache, damit jedes
  Gerät wirklich die neuen Dateien bekommt; der Cache von Home Assistant selbst bleibt unberührt.
- Dashboard, „…“-Menü: neuer Eintrag „Neu laden (Cache leeren)“ mit derselben Funktion.

### Behoben
- Glocke: Nach einem Neustart von Home Assistant stand „2 Updates verfügbar“ wieder als neu da,
  obwohl genau diese Updates schon gelesen waren. Stehende Einträge (Updates, Neustart ausstehend,
  Akku schwach, Sicherheits- und Wetterwarnungen, Pflanzen, Geräte, Gerätepflege) behalten bei
  gleichem Inhalt den Zeitpunkt, an dem sie zuerst gesehen wurden. Neu sind sie erst wieder, wenn
  etwas Neues dazukommt, etwa ein weiteres Update oder eine neuere Version.
- Einkaufsliste: Öl zeigt jetzt eine Flasche statt der Ölkanne vom Auto.
- Glocke: Ein „fertig“-Eintrag (Saugroboter, Waschmaschine, Trockner, Spüler, Drucker) verschwand
  manchmal beim erneuten Öffnen, obwohl nichts gelesen oder gelöscht war. Ein abgeschlossener Vorgang
  bleibt jetzt stehen, bis das Zeitfenster von 24 Stunden abläuft, auch wenn das Gerät danach den
  Zustand wechselt oder die Seite neu geladen wird. Die Glocke sammelt erst, wenn alle Erweiterungen
  geladen sind, und erkennt das Reinigungsende auch, wenn es der erste Wechsel im Zeitfenster ist, nach
  einem kurzen Verbindungsausfall des Geräts oder wenn im Logbuch eine Meldung ohne Zustand dazwischen steht.
- Glocke: Dieselbe Tür oder dasselbe Fenster stand doppelt da (z. B. „Terrassentür ist offen“ zweimal),
  wenn Kontakt, Kippsensor oder Kombi-Sensor gleich heißen und einer davon keinen Bereich hat. Jetzt meldet
  eine Öffnung nur einmal. Gleichnamige Kontakte in verschiedenen Räumen bekommen den Raum davor, im selben
  Raum den Gerätenamen oder eine Nummer, sodass nie zwei gleiche Zeilen entstehen.
- Glocke: Ein laufendes Gerät mit Restzeit sprang nach dem Lesen sofort wieder unter „Neu“.
- Glocke: Einträge mit gleicher Uhrzeit tauschten beim Aktualisieren nicht mehr ihre Reihenfolge.
- Studio, Hintergrundbild eines Raums: Eigene Fotos hochladen klappt jetzt zuverlässig, per Klick und per
  Ziehen auf den Tag- oder Nachtplatz. Das neue Foto ist sofort gewählt und steht ohne Neuladen in der Liste
  und in der Vorschau; die Beispielfotos bleiben in der Liste, Speichern übernimmt es. Fotos bis 16 MB gehen
  durch (vorher 12 MB), PNG und WebP werden als JPG abgelegt, damit das Dashboard sie findet, große Fotos
  werden auf 2560 px verkleinert und iPhone-Fotos richtig gedreht. Dateinamen mit Umlauten oder Leerzeichen
  gehen, der Fotoname wird bereinigt statt abgelehnt. Ein Nachtfoto unter neuem Namen gilt auch tagsüber,
  bis ein Tagfoto dazukommt. HEIC-Dateien bekommen eine klare Meldung („als JPG exportieren“), und jeder
  Fehler sagt jetzt, was zu tun ist, statt eines technischen Textes. Ein ersetztes Foto erscheint sofort
  statt des alten.
- Nach einem Neustart von Home Assistant zeigt ein offenes Dashboard nicht mehr für einige Sekunden den alten
  Glas-Look, bis Casora geladen ist. Casora legt eine Kopie seiner Themes in den Theme-Ordner (wenn
  configuration.yaml ihn mit `frontend: themes: !include_dir_merge_named themes` lädt, wie in der
  Standard-Einrichtung), damit Home Assistant das Casora-Theme ab der ersten Sekunde kennt, und meldet seine
  Themes beim Laden als Allererstes an.
### Verbessert
- Weich dunkel: Die Navigationsleiste am Desktop und die Leiste oben rechts (Glocke, Assist) haben keinen hellen Rand mehr.
- Weich: Der runde Zurück-Knopf in Räumen und Bereichen hat keinen glänzenden Rand mehr, er ist flach wie die Leiste am Handy.
- Weich dunkel: Auch die Menüs aus der Leiste unten haben keinen hellen Rand mehr.
- Weich am Handy: Die Leiste unten hebt sich klar von den Kacheln ab (hell fast weiß, dunkel fast schwarz, ohne den alten hellen Rand).
- Weich: Aquarium-Diagramme werden auch dann ruhig, wenn die Kachel eine eigene grelle Farbe mitbringt (etwa aus dem Hemma-Umzug).
- Weich: Über dem Hintergrundfoto liegt jetzt ein Lesbarkeits-Schleier in der Grundfarbe, hell in Leinen,
  dunkel im dunklen Grundton, damit Abschnittsüberschriften, Titel, Badges und Wetter auf jedem Foto lesbar
  sind. Am Handy (Startseite, Räume, Raumansicht) oben etwa 66 % und nach unten auslaufend. An Desktop und
  Tablet liegt er nur links hinter Titel, Badges und Überschriften (links etwa 65 %, nach rechts auslaufend),
  das Foto rechts bleibt klar. Schrift, Karten und Navigationsleiste bleiben unverändert und liegen darüber.
  Standard und Glas bleiben wie bisher.
- Updates-Popup: Nach dem Installieren eines Updates, das einen Neustart braucht, baut sich das offene
  Popup jetzt selbst um. Die Zeile verschwindet aus den verfügbaren Updates, „Wartet auf Neustart“
  erscheint und der Kopf bietet „Jetzt neu starten“, ohne das Popup zu schließen und neu zu öffnen.
  Nach dem Neustart verschwindet der Bereich wieder.
- Updates-Popup am Handy: „Aktualisieren“ rechts in jeder Update-Zeile ist jetzt ein runder
  Download-Knopf. Der Name hat dadurch mehr Platz, neue Version und KI-Urteil passen in eine Zeile.
  Antippen wirkt wie bisher. Während des Aktualisierens dreht sich ein Kreis, „Neustart erforderlich“
  zeigt ein Neustart-Symbol. Desktop und Tablet zeigen weiter den Text.
- Handy: Der Punkt „Szenen“ in der unteren Leiste zeigt jetzt dieselben Szenen in derselben Reihenfolge
  wie die Szenen-Badge an Desktop und Tablet. Ist an der Badge nichts ausgewählt, stehen dort weiter alle
  Szenen. Bestehende Handy-Dashboards folgen der Badge sofort; einmal das Studio öffnen trägt die Auswahl
  ins Handy-Layout ein.

## 1.0.4 – 04.10.2026

### Verbessert
- Weich: Das Temperatur-Diagramm im Aquarium-Popup ist in ruhigem Türkis statt in grellem Cyan.
- Medien-Popup: Die Apps (Quellen) stehen nicht mehr in einer Reihe, die rechts abgeschnitten ist. Sie
  brechen um und nutzen die ganze Breite, so angeordnet, dass jede Reihe möglichst voll ist, die laufende
  App zuerst. Am Desktop und Handy, bei Größenänderung neu angeordnet.
- Weich-Look: Der Lautstärke-Regler im Medien-Popup ist jetzt im Casora-Ton gefüllt wie der
  Fortschrittsbalken statt in der Medienfarbe, hell und dunkel.
- Weich: Solange der Player aufgeklappt ist, wird sein Wellen-Knopf weiß wie die geöffnete Glocke.
- Weich-Look: Der runde Medien-Knopf neben Glocke, Mitteilungen und „…“ (die Wellen des minimierten
  Players) hat jetzt denselben Grund und Schatten wie diese drei Knöpfe statt eines beigen, hell und dunkel.
  Solange etwas läuft, sind die Wellen im Casora-Ton wie Wiedergabe-Knopf und Fortschrittsbalken, sonst
  dunkel wie die anderen Symbole.
- Weich-Look: Der Fortschrittsbalken der Mediaplayer („Aktuelle Wiedergabe“ am Desktop und Handy, der
  Mini-Player neben der Glocke, das Medien-Popup und die Studio-Vorschau) ist jetzt immer im Casora-Ton
  gefüllt, wie der Wiedergabe-Knopf, statt in der Medienfarbe. Die leichte Cover-Tönung der Karte bleibt.
- Abfall-Popup mit eingeschaltetem Kalender: Die Tageskarte (nächste Abholung oder der angetippte Tag)
  steht jetzt rechts oben über „Tonnen“, wie im Kalender-Popup. Am Handy folgt sie direkt auf den Kopf,
  danach kommen Tonnen und Kalender, und beim Antippen eines Tages scrollt das Popup weich zur
  Tageskarte, wenn sie nicht zu sehen ist.
- Abfall: Ist die Abfall-Quelle nicht erreichbar (etwa weil der Server des Entsorgers die Verbindung ablehnt
  und Abfallkalender und Abholungs-Sensoren nicht verfügbar sind) und liegen keine Abholtermine vor, zeigt das
  Popup statt leerer Abschnitte einen ruhigen Hinweis „Abfallkalender gerade nicht erreichbar“ mit dem Namen
  der Quelle, der Monatskalender bleibt ohne leere Tageskarte sichtbar, und die Kachel zeigt „Nicht
  erreichbar“. Fehlen nur einzelne Sensoren, aber Termine sind da, bleibt alles wie bisher.

### Neu
- Design & Bedienung · Mobil: Ein neuer Regler „Raumfoto am Handy“ stellt ein, wie weich das Raumfoto
  hinter einem geöffneten Raum aussieht, von Scharf (0 px) bis Stark weich (40 px). Standard bleibt
  28 px, der Schleier beim Scrollen geht mit, und die Studio-Vorschau zeigt das Raumfoto sofort so.

### Behoben
- Kamera-Kacheln, die offline sind, zeigen nach dem Laden des Dashboards nicht mehr ein paar Sekunden lang „Live“.
- Saugroboter-Popup: Während der Reinigung und auf dem Weg zurück zeigte der große Kreis oben nur ein
  kleines weißes Dreieck statt des Saugroboter-Symbols. Jetzt steht der ganze Roboter mit Richtungspfeil
  mittig im Kreis, wie bei den anderen Popup-Köpfen.
- Glocke nach einem Home-Assistant-Neustart: Offene Fenster und Türen standen mit „Seit 10 Min.“ wieder
  unter „Neu“, obwohl sie seit Stunden offen und schon gelesen waren. Casora merkt sich jetzt, seit wann
  jeder Tür- und Fensterkontakt offen ist, auch über Neustarts hinweg. Die Dauer stimmt und Gelesenes
  bleibt gelesen.
- Glocke: Zwei Kontakte mit gleichem Namen (etwa „Fenster“ im Schlafzimmer und im HWR) hießen unter „Neu“
  beide nur „Fenster ist offen“. Jetzt steht überall der Raum davor, etwa „Schlafzimmer Fenster ist offen“,
  auch direkt nach dem Laden der Seite.
- Desktop: Ein Wisch-Stapel in der Kachelreihe (etwa Pflanzen/Aquarien) rutscht nicht mehr um seine
  eigene Höhe unter die übrigen Kacheln. Der Stapel war seit dem Wisch-Fix aus 1.0.4 auf null Höhe
  zusammengefallen und steht jetzt wieder bündig in der Reihe.
- Glocke: Nach einem Neustart von Home Assistant erscheinen Schlösser, Türen und Personen nicht mehr als neue Einträge („Wohnungstür verriegelt“), nur weil sie wieder erreichbar sind.
- Desktop und Tablet: Die Kachelreihe bleibt wieder einreihig. Seit die Handy-Kachelgrößen aus Hemma
  übernommen werden, trugen auch die Raum-Kacheln am Desktop „Größe in der Mobilansicht: groß“, und Desktop und Tablet
  lasen das mit (Groß-Aufbau der Kachel, Reihe in zwei Reihen mit Lücken, Kacheln rutschten aus dem Bild).
  Die Größe zählt jetzt nur im Handy-Dashboard; am Handy bleiben große Kacheln groß.
- Swipe-Kachel: Am Stapelende scrollt die Kachelreihe wieder weiter, beim Blättern im Stapel bleibt die
  Reihe stehen (Tablet und Desktop).
- Medien: Ein schon pausierter Player taucht nach jedem Neustart von Home Assistant oder einem kurzen Ausfall
  nicht mehr 10 Minuten lang wieder auf. Casora merkt sich, wann er wirklich pausiert wurde (gleicher Titel),
  und die Ausblende-Zeit zählt ab dort.
- Der Name der Übersicht steht jetzt überall gleich: Ein selbst vergebener Name (auch „Home“ auf
  Deutsch) bleibt in Leiste, Raumtitel, Handy-Leiste, Handy-Kopf und Studio genau so stehen. Nur der
  Name, den Casora selbst angelegt hat, folgt der Sprache der Oberfläche.
- Updates-Popup: Der Abstand unter „Verfügbare Updates“ verschwindet nach dem Öffnen nicht mehr.
- Türen & Fenster (Weich): Auch ein Raum mit nur einem Kontakt zeigt jetzt den Gerätenamen mit dem Raum
  darunter, wie Räume mit mehreren Kontakten („Haustür“ / „Flur“ statt nur „Flur“).
- Klima-Popup: Luftqualitätswerte heißen kurz wie Temperatur und Luftfeuchtigkeit („PM2.5“, „CO₂“)
  statt nach dem Gerät, und Namen mit Umlauten werden nicht mehr falsch großgeschrieben („LuftqualitäTsmonitor“).
- Küche · Rezepte: Lange Rezeptnamen in der Speiseplan-Wochenleiste brechen auf zwei Zeilen um und enden
  mit „…“, statt mitten im Wort abgeschnitten zu werden.
- Handy: Im Raum rücken eingeschaltete Kacheln (Licht, laufende Waschmaschine) wieder nach vorn wie am
  Desktop. Der Rest behält die Reihenfolge aus dem Studio.
- Handy: Ein Raum zeigt seine Fenster, Türen und Schlösser als Badges wie im Raum-Kopf am Desktop.
  Bestehende Handy-Layouts übernehmen sie, sobald das Dashboard das nächste Mal im Studio geöffnet wird.
- Ein im Studio umbenannter Raum heißt jetzt auch am Handy neu: Kopf, Raumseite, Leiste, Raum-Badges
  und der Titel der Luftqualität. Von Hemma übernommene Handy-Layouts bleiben nicht mehr außen vor, ein
  früher umbenannter Raum wird beim nächsten Öffnen des Dashboards im Studio nachgezogen.
- Handy: Jede Badge gibt beim Antippen dasselbe leichte Feedback wie die Kacheln (vorher nicht bei
  Sicherheit, Klima, Personen und Medien). In Weich ist das Luftqualitäts-Symbol im Badge-Kreis so groß wie die anderen.
- Handy: Ein im Studio umbenannter Raum (etwa „Wirtschaftsraum“ für den Home-Assistant-Bereich
  „Hauswirtschaftsraum“) zeigt auf seiner Raumseite nicht mehr alle Szenen, sondern nur die seines
  Bereichs. Der Bereich kommt jetzt aus den Kacheln des Raums statt aus seinem Namen, ein im Studio
  umbenannter Raum merkt ihn sich, und ein Raum ohne auffindbaren Bereich zeigt keine Szenen statt aller.
  Wirkt ohne erneutes Speichern des Dashboards.
- Handy: Beim Öffnen eines Raums über die untere Leiste lag manchmal das unscharfe Home-Foto statt des
  Raumfotos dahinter, und Home-Überschriften wie „Favoriten“ schienen durch die Kacheln. Der
  Raum-Hintergrund erscheint jetzt immer, auch wenn die Seite den Raum beim Wechsel neu aufbaut.
- Handy nach dem Umzug von Hemma: Kacheln, die in Hemma am Handy groß waren (Kameras, Saugroboter,
  Haushaltsgeräte, Auto, eBike, Pflanzen, Medien, Rezept, Schloss …), sind wieder groß. Mit einer früheren
  Version umgezogene Dashboards holen ihre Größen beim nächsten Öffnen im Studio einmalig aus der
  Umzugs-Sicherung, mit kurzem Hinweis; danach selbst geänderte Größen bleiben.
- Handy: Steht dieselbe Kachel zweimal in einem Raum, behält beim Speichern jede ihre eigenen
  Einstellungen (etwa „Größe am Handy“), und Kacheln, die nur unter einer Bedingung erscheinen, bleiben
  an ihrer Stelle, statt nach vorn zu rücken.

## 1.0.3 – 04.10.2026

### Neu
- **Pflanzen sagen, was ihnen fehlt:** ein klarer Wortlaut für Kachel, Popup und Mitteilungen: „Fühlt sich wohl“,
  „Braucht Wasser“, „Steht zu nass“, „Braucht Dünger“, „Überdüngt“, „Braucht mehr Licht“, „Zu viel Sonne“,
  „Steht zu kalt“, „Luft zu trocken“, „Bitte nachsehen“. Passen mehrere Werte nicht, geht Wasser vor.
- **Ein neues Zeichen:** Dach und Räume in Casoras warmem Ton, ein Fenster leuchtet in Honig, dazu eine
  hellere Fassung für Home Assistant im Dunkelmodus.
- Ist Casora über HACS installiert, erscheinen Updates nur noch in HACS. Casora steht damit nicht mehr doppelt
  unter Einstellungen → Updates.
- **Favoriten am Handy umbenennen:** Studio → Zuhause → Darstellung → „Name am Handy“. Der Bereich bleibt unter
  jedem Namen der Favoritenbereich und wird nie zu einem Raum.
- **Waschmaschine und Trockner:** Das Popup zeigt Fortschritt, Endzeit, Programm und Phase, „Fertig, Wäsche drin“
  mit einem Knopf „Ausgeräumt“, die letzten Läufe und Werte je Programm. Casora nimmt zuerst die Integration
  des Herstellers (Home Connect, Miele, SmartThings, LG ThinQ und weitere), dann WashData, dann eine
  Zwischensteckdose.
- **Sicherheit im Raum:** Schlösser, Alarm, Kontakte und Kameras können als eigene Badges erscheinen
  (Studio → Raum → Badges → „Einzeln anzeigen“), je nach Zustand grün, orange oder rot.
- **Eigene Karten benennen** in der Kachelliste im Studio.
- **KI-Zeitpläne je Funktion** unter Einstellungen → KI: Aus, Automatisch (bisherige Zeit) oder ein eigener
  Wochentag mit Uhrzeit. Neue Installationen starten mit allem aus, bestehende behalten ihr bisheriges
  Verhalten. Die KI-Update-Prüfung läuft einmal am Tag statt stündlich, oder nur auf Knopfdruck.
- **Beta-Versionen:** Ein neuer Schalter unter Updates holt Vorabversionen früher (standardmäßig aus; mit HACS
  die Betas in HACS einschalten).
- **Strompreis aus dem Energie-Dashboard:** Gerätekosten nehmen den Netzpreis aus den Energie-Einstellungen von
  Home Assistant, wenn in Casora kein Preis gesetzt ist, auch eine Entität mit Live-Preis.
- **Aktive Zeilen:** Die Popups für Licht, Heizung, Lüften, Netzwerk, Aquarium, Fenster und Türen, Schlösser,
  Jalousien und Raumklima heben hervor, was an ist oder Aufmerksamkeit braucht.
- Das Rezept der Woche kann seine Zutaten auf eine Einkaufsliste deiner Wahl setzen.
- **Der Umzug aus Hemma behält deine eigene Arbeit:** Eigene JS-Module bleiben geladen, angepasste Popups
  werden erkannt, „Meine“ wird ein eigener Kacheltyp, während die Casora-Kachel weiter Updates bekommt, und
  Ordner, in die deine Automationen schreiben, bleiben an ihrem Platz.

### Verbessert
- Die Pflanzen-Kachel liest den Grund direkt von der Pflanze, auch ohne in der Kachel eingerichtete Sensoren.
- Casora sucht Updates direkt auf GitHub. Der Update-Server, der Casora-Schlüssel und die Seite
  „Update-Zugang“ sind weg.
- Neues README, neue Anleitung und Website, alle Bildschirmfotos im Casora-Design.
- Einrichtungsassistent: „Automatisch einrichten“ in Casoras warmem Ton statt in grellem Blau.
- Die Updates-Kachel folgt wieder dem Studio: Standardmäßig erscheint sie nur, wenn es etwas zu aktualisieren
  gibt. Am Handy erscheint sie nicht mehr erst in voller Höhe und klappt dann zusammen.

### Behoben
- Swipe-Kacheln (z. B. Pflanzen) werfen keinen eckigen Schatten mehr: der Stapel schneidet den Kartenschatten nicht mehr an einer rechteckigen Kante ab.
- Handy: Antippen der Sicherheits-Badge zeigt wieder ihre Unter-Badges (Schlösser, Kameras, Kontakte), wie bei Klima und Licht.
- Updates-Popup: Markenlogos in den Zeilen haben abgerundete Ecken wie ein App-Symbol, eckige Logos wirken im Kreis ruhig.
- Die obere Navigation zeigt die Übersicht unter dem selbst eingetippten Namen (z. B. Home) wie der
  Raumtitel, statt ihn zu übersetzen.
- Energie-Badge im Raum: Räume, die früher automatisch nur einen Leistungssensor eines Geräts bekamen, zeigen einmalig die Summe aller Geräte im Raum; ein Geräte-Gesamtsensor zählt allein, sonst jeder Kanal (nichts doppelt).
- Pflanzen-Popup: Die Lichtzeile war orange markiert, obwohl die Pflanzen-Integration Licht gar nicht bewertet.
- Keine Fehlermeldung mehr, wenn Home Assistant bei offenem Dashboard neu startet.
- Eine Tür mit Schloss- und Kontaktsensor wird nur einmal als offen gemeldet.
- Das Luftqualitäts-Badge zeigt dieselbe Bewertung wie sein Popup (CO₂- und Feinstaubsensoren zählen mit), in
  passender Farbe und mit passendem Symbol.
- Das Batterien-Popup ist nur breit, wenn es zwei Spalten zeigt.
- Ein Wechsel der Sprache in Home Assistant führt nicht mehr zu einem Vorlagenfehler in Kacheln.
- Handy: Keine zusätzliche Lücke über dem nächsten Bereich, wenn nichts läuft, und ausgeblendete Kacheln
  blitzen nach dem Schließen eines Filters nicht mehr auf.
- Wetter-Popup: Regen, Wind und Sichtweite mit dem Dezimaltrennzeichen deiner Sprache.
- Räume, die nur einen Fenster- oder Türkontakt haben, zeigen wieder das Sicherheits-Badge.
- Die Reihenfolge der Badges entspricht Hemma: Sicherheit, Klima, Licht, Personen, Energie, Szenen, Medien.
- Das Energie-Badge erscheint in jedem Raum, der Leistung misst, auch bei 0 W; ausgeschaltet bleibt es aus.
- Die Glocke zeigt einen Punkt, auch bei mehreren Mitteilungen, und meldet Sensoren von Tankstellen nicht
  mehr als offene Türen. Fenster mit demselben Namen in verschiedenen Räumen werden alle gemeldet.
- Handy: Die Badge-Reihe des Raums erscheint beim ersten Öffnen, die Badge-Kreise sitzen gleichmäßig, das
  Studio funktioniert im Querformat, „Alle aktualisieren“ steht auf einer Linie mit seiner Überschrift.
- Swipe-Kachel: Am Ende des Stapels scrollt die Reihe weiter, die Punkte lassen sich antippen, senkrechtes
  Wischen scrollt die Seite.
- Luftreiniger und Ventilator zeigen Modus und Stufe so, wie Home Assistant sie nennt.
- Die Abfall-Kachel zeigt die nächste Abholung, wenn kein Dienst geplant ist; Aquarium-Geräte gelten ab 2 W
  als laufend.
- iPads schalten nicht mehr in den Modus mit reduzierten Effekten.
- KI-Antworten (Coaches, Kamera, Pflanzen, Aquarium, E-Bike, Update-Prüfung, Rezept) in der Sprache von Home
  Assistant.
- Energie-Badge im Raum: Ohne Sensor für den ganzen Raum zeigt es die Summe aller Steckdosen und Geräte, das
  Popup listet jedes einzeln.
- Handy: Der Licht-Chip steht wieder hinter Temperatur und Luftfeuchte, die Chips haben gleichmäßigen Abstand,
  das Medien-Badge erscheint nur, solange etwas läuft, und das Foto auf dem Startbildschirm folgt dem im Studio
  gewählten.
- Weich: Szenen-Knöpfe passen zu den übrigen Kacheln.
- Saugroboter, 3D-Drucker und Fußbodenheizung finden ihre Entitäten über die offiziellen Integrationen, in jeder
  Sprache von Home Assistant. Ohne Druckernamen zeigt das Popup den Gerätenamen.
- Türen, Fenster und Schlösser des Autos zählen nicht mehr als Öffnungen der Wohnung.
- Das Popup für Fenster und Türen und das Pflanzen-Popup sind vollständig ins Englische übersetzt.

- Die Kamera-Badge heißt bei einer Kamera „Kamera“, bei mehreren „Kameras“.
- Antippen von „… ist offen“ bei Fenster oder Tür öffnet das Popup „Türen & Fenster“ statt der Schlösser.
- Updates-Popup: Die beiden Spalten unter „Mehr“ stehen bündig, auch in Safari, und die KI-Check-Zeilen sehen aus wie die übrigen.
- Ein laufendes Update zeigt „Wird aktualisiert“ mit kleinem Kreis statt fast unsichtbarem Text.
- Integrationen ohne Markenbild zeigen ein neutrales Puzzle-Symbol statt „icon not available“.
- Die Updates-Kachel zeigt einen Download-Pfeil, wenn Updates da sind, und einen Neustart-Pfeil, wenn ein Neustart aussteht.
- Klima-Popup: „Mehr“ steht unter den Messwerten.
- Player: Die Spitze des Vor-Knopfs wird nicht mehr abgeschnitten.

### Geändert
- Die E-Bike-Kachel arbeitet mit der Integration Bosch eBike (Bosch Smart System). Die Felder für ein eigenes
  Ladegerät und einen Live-Akkusensor sind weg.
- Aquarium-Kachel: Lichtprofil, Zeitplan-Schalter und die Knöpfe der Dosierpumpe in den erweiterten Feldern
  wählen. Ältere Kacheln mit Entitäts-Präfix funktionieren weiter.
- Abfall-Einstellungen: Dienstmonate, Sensor und Erinnerung liegen in einem zugeklappten Bereich „Erweitert“.

Einige dieser Fixes und der Favoriten-Name am Handy sind aus Hemma 2.2.0 (MIT) übernommen.

## 1.0.1 – 02.10.2026

### Verbessert
- **Einrichtung:** Die Vorschaubilder für Design und Effekte zeigen jetzt das aktuelle Casora-Design.
- **Schrift wählen:** Jede Schrift zeigt ein großes Schriftmuster mit Beispielzeilen, so ist der Unterschied
  auf einen Blick zu sehen.
- **Inter ist Casoras Schrift,** auch im Casora-Design. Plus Jakarta Sans ist entfernt; wer sie gewählt hatte,
  bekommt Inter.
- Mitteilungen: Der erste Eintrag klebt nicht mehr am oberen Rand, wenn alles gelesen ist.
- Haken und Erfolgsmeldungen im Assistenten im Casora-Grün statt in grellem Grün.
- Fahrzeug: Abgeleitete Helfer (z. B. ein Monatszähler) werden nicht mehr mit dem echten Kilometerstand
  verwechselt.
- Statuszeilen brechen nie mehr direkt vor einem „·“ um, und vor dem „·“ in Unterzeilen fehlt kein Abstand mehr.
- **Feinschliff nach einer kompletten Durchsicht** von Studio und Dashboard in Hell, Dunkel, Desktop, Tablet und Handy:
  einheitliche Spaltenabstände in Popups, „Mehr“ auch in Netzwerk, Energie, Updates, Waschmaschine, Trockner
  und Saugroboter zweispaltig, Klima-Symbole in voller Größe, Assist-Vorschläge gut sichtbar, Kamera-Knöpfe
  mit Abstand, Studio-Farben einheitlich im Casora-Design, abgeschnittene Auswahlfelder enden mit „…“, Raum-Menü
  in der Seitenleiste mit Symbolen.
- Energie ohne Leistungssensor zeigt den Tageswert als Hauptzeile.
- **Umzug aus Hemma wie ein Update:** Räume, Kacheln und Badges kommen 1:1 mit. Das neue Dashboard heißt
  „Mein Zuhause“, Schalter, Aquarien und Türklingeln werden Studio-Kacheln, das Wetter der Übersicht landet in
  Räumen ohne eigenes Wetter, und die Beleuchtungs-Badge erscheint auch mit nur einer Lichtgruppe. Ein
  unlesbares YAML-Dashboard wird mit Hinweis gezeigt statt still übergangen.
- **Hemma entfernen:** Nach dem Neustart prüft Casora, ob alles sauber entfernt ist, und bestätigt es im Studio.
- **Batterien:** Ladende Geräte erscheinen hervorgehoben wie aktive Kacheln, mit Raum als Unterzeile.
  Schwache Batterien zeigen ein oranges oder rotes Symbol, der Abschnitt heißt „Niedriger Akkustand“ (passt
  auch für eingebaute Akkus).
- **Kamera:** Keine eigene Privatsphäre-Auswertung mehr. Eine ausgeschaltete Kamera ist einfach aus, für jede
  Integration gleich. Der Name auf dem Standbild ist auch in hellen Designs lesbar.
- **Gerät fehlt:** Ist das Gerät einer Kachel nicht mehr da, zeigt die Kachel „Gerät fehlt“ statt „Aus“, und das
  Popup verweist ins Studio. Auch die Kachelliste im Studio markiert solche Kacheln.
- **Zeitreise:** Wiederherstellen und „Zurück zu jetzt“ stehen fest am unteren Rand, die Zusammenfassung nennt
  nur echte Änderungen.
- **Kalender:** Der Ring zeigt die heutige Tageszahl, Kalenderfarben passen zum Design, Tipp aufs Symbol
  öffnet den Kalender.
- **Studio:** Kachelliste und Raumansicht mit Unterzeilen statt gedrängter rechter Spalte, Auswahlfelder im
  Geräte-Assistenten im Studio-Stil, auch das erste Feld im Kachel-Editor lässt sich entfernen, und Speichern
  ist für jedes Dashboard möglich.
- Klima-Unterbadges mit Symbolen in voller Größe, Raum-Chips im Licht-Popup laufen weich aus, die Einrichtung
  zeigt Vorschaubilder in deiner Sprache.
- Aquarium-Doktor und Rad-Check laufen über Casora selbst und brauchen keine eigenen Skripte mehr.


## 1.0.0 – 02.10.2026

### Neu
- **Neues Casora-Design:** warmes Leinen und Sand, große Rundungen, weiche Schatten,
  in Hell und Dunkel. Es ist der neue Standard. Die bisherigen Looks bleiben als
  „Hemma (Legacy)“ und „Hemma Glas (Legacy)“ wählbar und sehen unverändert aus.
- **Popups neu aufgebaut:** Ring, Titel und eine Statuszeile oben, links die Bedienung,
  rechts die Geräte. Selten Gebrauchtes liegt im zugeklappten Bereich „Mehr“. Er liegt
  unter beiden Spalten und verteilt sich aufgeklappt gleichmäßig auf zwei Spalten.
- **Fahrzeug für jede Integration:** Die Auto-Kachel erkennt Autos jetzt über ihre Werte
  statt über eine bestimmte Integration, zum Beispiel VW, Škoda, Tesla oder BMW, auch
  E-Autos mit Akkustand. Mehrere Autos sind möglich.
- **Rezept-Popup:** Speiseplan als Wochenleiste, Idee der Woche als Band, Einkaufsliste
  in zwei Spalten.
- **Szenen-Popup** mit Szenen-Chips wie im Licht-Popup.
- **Eigene Schrift:** Plus Jakarta Sans ist dabei. Eigene Schriften (z. B. Gilroy)
  lassen sich im Studio unter „Design & Bedienung → Text“ hochladen.
- **Studio in Hell und Dunkel,** passend zu Home Assistant, mit einheitlichen Symbolfarben
  und Aktionsknöpfen in Ton wie im Dashboard.

### Verbessert
- Einheitliches Farbsystem für Symbole in Badges, Menüs und Studio.
- Medien: Lautstärke, Fortschritt und Ring in Rosa-Rot, Apple Music in seinem eigenen Rot.
  Der Ring ist grau, solange nichts läuft.
- Kameras: technische Doppel-Streams ausgeblendet, „Alle Kameras“-Pfeil, Alter als „vor … Min.“.
- Badges mit farbigem Symbolkreis, Kachel-Schalter und -Schrift abgestimmt. Eine zu lange
  Badge-Reihe läuft auf Tablet und Desktop weich aus.
- Abfall und Heizung: Überschriften beider Spalten liegen auf einer Linie.
- Der Name der Übersicht bleibt so, wie du ihn eintippst, auch „Home“ auf Deutsch,
  am Desktop und am Handy.
- Ein frisches Casora begrüßt immer mit „Willkommen bei Casora“.
- Umzug von Hemma: Hemma-Helferwerte werden übernommen, „Hemma entfernen“ räumt gründlich auf.

### Behoben
- 3D-Drucker: Die Kachel wird bei „Fehlgeschlagen“ rot wie das Popup.
- Medien-Popup: Die Raumzeile unter dem Titel war oben abgeschnitten (Umlaute).
- Studio: Aus Einstellungen, Updates oder Zeitreise führte ein Klick auf einen Raum
  nicht zurück in den Raum.
- Heizungs-Coach: „Neu auswerten“ hing an einer falschen Bedingung.
- Aquarium-Licht öffnete ein leeres Popup.
- Alarm: Nach dem Deaktivieren ließ er sich ohne Neuöffnen nicht wieder scharf schalten.
- Unterlängen im Kachelstatus wurden abgeschnitten.

### Entfernt
- Alte, nicht mehr genutzte Popups (Kontakt alt, Aquarien-Übersicht, Aquarium-Licht,
  Saugroboter alt, Geschirrspüler alt). Bestehende Kacheln leiten auf die Nachfolger um.

## 0.5.1 – 30.09.2026

### Neu
- **Willkommen und Startseite:** Neue Nutzer sehen zuerst, was Casora ist, danach
  „Wie möchtest du starten?“ – Einrichten, Neues Dashboard, Von Hemma oder YAML-Import.
  Der Assistent startet nicht mehr von selbst. Die Startseite ist jederzeit über
  „Startseite …“ erreichbar.
- **Einstellungen im Studio:** Bereich „Casora – für alle Dashboards“ in der Seitenleiste
  mit Haus & Geräte, Glocke & Meldungen, Neue Dashboards, KI, Außenwerte & Strompreis,
  Lüften und Update-Zugang – dieselben Optionen wie unter Integrationen, plus die
  bisherigen Zuhause-Einstellungen.
- **Updates mit Casora-Schlüssel:** Casora kann Updates über einen eigenen Update-Server
  beziehen; statt eines GitHub-Tokens genügt ein persönlicher, sperrbarer Schlüssel.
  Ein vorhandener Token funktioniert übergangsweise weiter.

### Verbessert
- **„Zeitreise“** (englisch „Rewind“) statt „Versionen“, damit es nicht mit Updates
  verwechselt wird.
- **Badge-Reihen scrollen seitwärts,** wenn sie zu breit sind – am Desktop per Mausrad
  und Ziehen, am Handy per Wischen. Das Szenen-Badge klappt auch in der Vorschau auf.
- Lange Raumnamen in der Seitenleiste enden mit „…“; Zustände wie „Klemmt“ oder
  „Nicht verfügbar“ erscheinen auf Deutsch; Zahlen überall mit Komma.
- Raumklima und Solar-Tipp kommen nicht mehr von selbst auf „Zuhause“ – nur noch über
  „Kachel hinzufügen“.
- **Alle Szenen** im Szenen-Badge statt höchstens zehn; die Reihe scrollt.
- **Englische Oberfläche** überarbeitet (einheitliche Begriffe, fehlende Übersetzungen ergänzt).
- Versionshinweise im Update-Dialog von Home Assistant sind lesbar; der Hinweis auf den
  fehlenden Update-Zugang steht nur noch einmal.

### Behoben
- Studio-Vorschau: Navigationsleiste ragte über den Rand.
- Startseite: „Abbrechen“ in den Einstellungen führte nicht zurück.
- Mobil: Unter-Badges (Beleuchtung, Energie, Medien) waren teils nicht erreichbar.
- Mobil: Im Menü „Räume“ wirkten Räume bei vielen Räumen wie fehlend – die Liste zeigt
  jetzt, dass sie scrollt, und springt zum offenen Raum.
- Nach einem Update ohne Neustart blieb das Studio leer (greift ab dem nächsten Update).

### Qualität
- Vor jedem Release läuft jetzt eine feste Prüfung: Syntax, Unit-Tests, End-to-End-Tests,
  Regressionstests für jeden gemeldeten Fehler und ein automatischer Rundgang durch
  Studio und Dashboards auf Desktop, Tablet und Handy – auch mit einem Stress-Haus
  (viele Räume, Szenen, lange Namen).

## 0.5.0 – 30.09.2026

### Neu
- **Updates im Studio:** eigener Bereich „Casora → Updates“ in der Seitenleiste. Alle
  Versionen mit ihren Neuerungen zum Aufklappen, „Installieren“ mit Fortschritt und
  Neustart-Hinweis, „Nach Updates suchen“. Mit Update-Zugang von GitHub, sonst aus dem
  mitgelieferten CHANGELOG.
- **Karten-Updates:** Fixes für einzelne Karten und Popups kommen als eigene kleine
  Pakete (`karten-…`) – ohne Neustart, geprüft per Prüfsumme und Mindestversion, auf
  Wunsch automatisch. Selbst angepasste Karten bleiben unberührt.
- **Vorlagen bleiben aktuell:** Nach einem Update bringt Casora alle Dashboards beim Start
  auf die neuen Vorlagen – nur unveränderte, vorher wird eine Version angelegt.
- **Entwurf:** Ungespeicherte Änderungen überstehen ein Neuladen; „Fertig“ fragt nach.
- **Popup-Einstellungen in jeder Kachel** mit Popup: Titel und Felder direkt im
  Kachel-Editor, mit Live-Vorschau.
- **„Kachel hinzufügen“ mit Suche** und „Passt zu <Raum>“; bei unklarer Zuordnung fragt
  Casora nach.
- **Umzug erkennt umbenannte Hemma-Dashboards** (anderes Vorlagen-Präfix).

### Verbessert
- **Umzug:** KI nicht mehr vorausgewählt, Preis am Knopf, Namensfeld, altes Dashboard
  ausblenden (YAML: Hinweis), Vergleich mit KI-Spalte, erste Version direkt nach dem Umzug.
- **Mobil:** übernimmt Umbenennen, Verschieben und Löschen von Räumen, dieselben
  Home-Badges wie am Desktop und die Kachel-Reihenfolge aus dem Studio. Schnelleres erstes
  Laden (gepackte Skripte, Cache), kein ungefilterter Zwischenstand mehr.
- **„Zuhause“** heißt der Übersichtsraum auf Deutsch, „Home“ auf Englisch.
- Auswahlfelder mit Namen, Suche und passenden Geräten zuerst; Glas-Design in der Vorschau
  und rückgängig machbar; Kachelreihe am Desktop mit Mausrad und Ziehen.
- Sensoren werden auf Plausibilität geprüft (Wetter, Updates, Thermostat, Energie,
  Batterien); deutsche Zahlen und Datumsangaben in Popups und Diagrammen.

### Behoben
- Sicherheit zeigte „Gesichert“ trotz entriegelter Tür; Klima-, Auto-, E-Bike-,
  Raumklima-, Rezept- und Licht-Popups teils leer; Netzwerk „Offline“ trotz Verbindung.
- Popups am iPhone durchscheinend; Szenen-Menü am Handy zeigte alle Szenen des Hauses.
- Raum-Vorlage wurde auf neu angelegten Dashboards nie aktualisiert.
- Erster Buchstabe beim Umbenennen verschluckt; Raumsymbol änderte sich beim Umbenennen.

## 0.4.0 – 29.09.2026

### Neu
- **Updates ohne HACS:** Mit einem nur lesenden GitHub-Token in den Casora-Optionen
  („Update-Zugang“) erscheinen neue Versionen unter Einstellungen → Updates. „Installieren“
  sichert die laufende Fassung nach `casora_sicherungen/` und meldet, wenn ein Neustart
  nötig ist.
- **Neuer Einrichtungsassistent:** Look wählen (Casora Standard oder Casora Glass),
  Effekte für schwächere Geräte, Räume als Fotos, „Wie möchtest du starten?“ mit Live-Vorschau
  des Hemma-Dashboards, Fertig-Seite mit Desktop- und Handy-Vorschau und „Als
  Standard-Dashboard verwenden“. Seiten gleiten ineinander über.
- **Räume füllen sich selbst (Standardraum):** „Neu beginnen“ legt die Geräte gleich in
  ihre Räume – sortiert (Licht → Heizung → Luft → Jalousien → Medien → Geräte), ab zwei
  Lichtern, Jalousien oder Schlössern zu einer Kachel zusammengefasst, Status-LEDs raus,
  Favoriten auf Home. Vorschau mit Abwählen; die Regeln unter „Persönliches → Standardraum“.
- **KI (optional, eigener API-Schlüssel):** beim Umzug eigene Kachel-Anpassungen in Casoras
  Fassung übertragen (je Kacheltyp „Meine | Casora | ✦ KI“, „Alle mit KI“, Vorschau über
  „Ansehen“), beim Einrichten Geräte ohne Raum zuordnen und Kacheln benennen. Casora nimmt
  die passende KI selbst (Sonnet vor Opus), schätzt vorher die Kosten und kann eine eigene
  „Casora KI“ mit starkem Modell anlegen, wenn die vorhandene zu schwach ist.
- **Raumfotos für 31 Raumtypen**, automatisch nach Raumname, wenn es keine eigenen gibt.
- **Umzugsassistent Hemma → Casora:** Das Studio findet Hemma-1- und Hemma-2-Dashboards
  selbst (beim ersten Start und im Menü „Von Hemma umziehen …“), zeigt Räume, Kacheln und
  eigene Karten, sichert das Original (`casora_sicherungen/`) und legt ein neues
  Casora-Dashboard samt Handy-Layout daneben an. Selbst angepasste Kacheln werden an den
  Fingerabdrücken aller Hemma-Originalvorlagen erkannt – man wählt je Kacheltyp „Meine
  behalten“ oder „Casoras nehmen“, statt sie still zu verlieren.
- **Studio → „Persönliches …“:** Abfall (Tonnen, Dienstmonate, Kalender, Erinnerung),
  Kalender mit Farben, Glocke (Zonen-Formulierungen, Briefkasten, Akku-Ausnahmen,
  Kombi-Kontakte, Gerätepflege), ausgeblendete Szenen, Tür-/Fenstergruppen,
  Now-Playing-Symbole und -Lautstärke, Nachtmodus-Schalter und eBike – gespeichert in
  der Integration statt in einer Datei. Eine vorhandene `einstellungen.js` wird beim
  ersten Öffnen übernommen.
- **Lüften per Push:** Empfänger (notify-Dienste) und optional Personen in den
  Casora-Optionen wählen. „Jetzt lüften“ 7–22 Uhr nur bei Anwesenheit, „Fenster
  schließen“ 7–23 Uhr, beide erst nach 10 Min.; CO₂ ab 2500 ppm sofort als kritische
  Meldung. Ohne Empfänger keine Push-Meldungen.
- **Netzwerk-Popup findet Geräte selbst:** Router, Access Points, Switches, WLANs und
  Latenz herstellerneutral (UniFi, FRITZ!Box, TP-Link, ASUS, Netgear, MikroTik, OpenWrt …).
  Eigene Listen im Dashboard haben weiter Vorrang.

### Verbessert
- Bedingte Kacheln zeigen im Studio Name, Symbol und Felder der Kachel darin und ihre
  Bedingung in Worten; bedingte Sammelkarten (automatisch, Karussell) sind benannt.
- Alte Hemma-Dashboards sehen auch unter dem Casora-Theme richtig aus (Theme-Brücke
  `--hemma-*` → `--casora-*`).
- Schrift Inter wie im Hemma-Original; Kopfzeile auf gleicher Höhe wie in Hemma.
- Handy-Vorschau mit echter Notch: Wallpaper bis oben, Navbar an ihrem Platz.
- Studio: Auswahltexte und Platzhalter vollständig auf Deutsch.
- Keine festen Entitäten mehr im Code: Türen/Fenster, Außensensoren, Backup, Cookidoo,
  eBike und Szenen werden erkannt oder in „Persönliches“ eingestellt.
- Englisch vollständig: Popup-Titel, live aktualisierte Werte und nachträglich
  eingesetzte Texte werden mitübersetzt; rund 560 weitere Texte und Muster.
- Casoras eigene Sensoren (Lüften, Solar-Tipp, KI) heißen in der Sprache von HA.
- Szenen-Chips: „zuletzt aktiviert“ und mehr Luft bei Chips mit Inhaltsbreite.
- Screenshots für README und Website aus einem neutralen, englischen Demo-Haus.

### Behoben
- Neue leere Dashboards bekamen am Handy keine Navbar.
- Licht-Kachel zählte eine Liste von Lichtern ohne HA-Gruppe nicht mit („2 An“).
- Seitenleiste blieb nach der Dashboard-Vorschau ausgeblendet.
- „Zu Casora umziehen“ doppelt geklickt legte zwei Dashboards an.
- Vorlagen-Paket enthielt feste Netzwerk-Entitäten eines Beispiel-Hauses; der
  Build prüft jetzt auch verschachtelte Listen.

## 0.3.0 – 27.09.2026

### Neu
- **Richtet sich selbst ein:** Helfer, Skripte und das Casora-Theme legt die Integration
  beim Start an (Dienst `casora.einrichten` wiederholt es). `packages/casora_helpers.yaml`
  und `themes/casora/` entfallen; das Theme wird beim ersten Dashboard eingeschaltet.
- **Raumklima und Solar-Tipp** ohne feste Entitäten: `sensor.casora_lueften`,
  `binary_sensor.casora_lueften_hinweis`, `binary_sensor.casora_solar_tipp`.
- **Mehrsprachige Kacheln und Popups:** Texte folgen der Sprache von Home Assistant
  (Deutsch, Englisch).
- **„Willkommen“ / „Neu in Casora“** im Studio – einmal pro Version.
- Now Playing: Netflix- und DAZN-Logo, wenn der Player kein Bild liefert.

### Verbessert
- Studio begrüßt neue Nutzer auch, wenn HAs eigenes „Map“-Dashboard existiert.
- Neue Dashboards: HA-Kopfzeile aus (auch ohne kiosk-mode), Raum-Adressen mit
  Umlauten, sinnvolle Raum-Vorauswahl, Uhr im HA-Zeitformat, „Geräte einbauen“ als
  nächster Schritt; der Geräte-Assistent speichert selbst.
- Import: das Handy-Layout bekommt die Kacheln gleich mit.
- Desktop: Glas-Pille neben der Seitenleiste zentriert, Uhr nie darunter.
- Kameras-Kachel ohne Auswahl zeigt alle Kameras; Kamera-Popup mit Standbild bei
  Kameras ohne Stream; Kamera-Kachel am Handy im normalen Kachel-Raster.

### Behoben
- Handy/Desktop-Weiterleitung erzeugte viele Konsolenfehler („reading 'config'“).
- Raum am Handy antippen: Fehlermeldung wegen fehlender Filter-Option.
- Saugroboter-Symbol rief den nicht mehr vorhandenen Dienst `vacuum.turn_off` auf.
- Aquarium-Kachel ohne Zustand; 3D-Drucker-Symbol beim Drucken dunkel.
- Standard-Hintergrundbild und Raumbilder bei Neuinstallationen (404).

### Entfernt
- Plex (Kachel, Popups, Badge, Now-Playing-Quellen, Sensor, `swipe-card-patch.js`).

## 0.2.0 – 26.09.2026

### Neu
- Eigener Name durchgehend: Vorlagen, Karten, CSS-Variablen, Skripte, Theme und
  Helfer heißen „casora…“. Dienst `casora.umstellen` stellt bestehende Dashboards um
  (mit Sicherung); Hemma-Dashboards werden beim Import übersetzt.
- KI in der Integration: Energie-, Heizungs- und Lüftungs-Coach, Kamera- und
  Pflanzen-KI, Update-Prüfung, Rezept der Woche – mit Optionen (KI, Web-KI,
  Außensensoren, Strompreis, Hinweise).
- Geräte werden selbst gefunden: 3D-Drucker, Waschmaschine/Trockner, Geschirrspüler,
  Saugroboter, Fußbodenheizung, Solarspeicher, Auto, Abfall, Kalender.
- Casora Studio: Casora-Kacheln mit Symbol und Feldern, „Automatisch: …“-Platzhalter,
  „Mit KI ergänzen“, Geräte-Assistent, Import-Assistent für Hemma 1.
- Eigene Einstellungen in `/config/www/casora/einstellungen.js`.
- Symbole, Wetter- und Raumbilder kommen aus der Integration (`/casora_assets`).

### Übergang
- `casora-kompat.js` hält alte Element- und window-Namen für nicht umgestellte
  Dashboards bereit; Theme „Hemma“ ist ein Alias von „Casora“.
