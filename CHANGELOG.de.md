# Changelog

Casora ist aus [Hemma](https://github.com/willsanderson/Hemma) 2.1.2 (MIT) entstanden und wird seit
dem 26.09.2026 eigenständig weiterentwickelt. Hemmas frühere Einträge stehen in der Git-Historie.
Die englische Fassung steht in [CHANGELOG.md](CHANGELOG.md).

## 1.0.5 – 04.10.2026

### Behoben
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
### Verbessert
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
