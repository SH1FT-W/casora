# Changelog

Casora ist aus [Hemma](https://github.com/willsanderson/Hemma) 2.1.2 (MIT) entstanden und wird seit
dem 26.09.2026 eigenständig weiterentwickelt. Hemmas frühere Einträge stehen in der Git-Historie.
Die englische Fassung steht in [CHANGELOG.md](CHANGELOG.md).

## 26.10.66 – 29.10.2026

### Neu
- **Klima auf Zuhause aus den Räumen (#96):** Ohne Sensor für das ganze Haus zeigt Zuhause als Temperatur und Luftfeuchtigkeit den Durchschnitt der Raumsensoren (dieselben, die die Klima-Badges der Räume nutzen, je bis zu fünf). Das Studio listet sie beim Klima-Badge auf und sagt, dass sie automatisch gewählt wurden; einen entfernen lässt ihn weg.
- **Mehrere Luftfeuchtigkeitssensoren:** Wie bei der Temperatur nimmt das Klima-Badge bis zu fünf Luftfeuchtigkeitssensoren und zeigt ihren Durchschnitt.
- **Kohlenmonoxid (#95):** Das Luftqualitäts-Popup nimmt einen CO-Sensor auf (Studio: Klima-Badge › CO), mit eigenen Grenzen (gut bis 9 ppm, Warnung ab 35 ppm, schlecht ab 100 ppm).

### Behoben
- **Klima-Badge auf Zuhause beim Einrichten (#96):** Eine NAS-Festplattentemperatur („durchschnittliche Festplattentemperatur“) gilt nicht mehr als Haustemperatur; Festplatten, Volumes, Router und Server zählen nie als Raumsensor. Eine Wärmepumpe steht nicht mehr an erster Stelle der Thermostate von Zuhause.
- **CO₂-Grenzen für CO:** Ein Kohlenmonoxid-Sensor bekam die CO₂-Grenzen und war deshalb immer „gut“.
- **Studio:** Die Felder Temperatur und Luftfeuchtigkeit im Luftqualitäts-Popup sagen, dass leer der eigene Sensor des Badges ist.

## 26.10.65 – 29.10.2026

### Behoben
- **WashData 0.5.9:** Heißluftfritteusen und Brotbackautomaten (macht WashData seit 0.5.9 zu „Other“) und „Generic“-Geräte gelten nicht mehr als Waschmaschine, weder bei Kacheln noch bei Live-Aktivitäten. Casora fragt WashData nach dem Gerätetyp, statt nur nach dem Symbol zu gehen.

## 26.10.64 – 29.10.2026

### Neu
- **Skripte, Szenen und Knöpfe mit einem Tipp (#86, #90):** Die Kachel-Option „Tippen führt aus“ und ein eigenes Badge starten sie sofort; „Mit Bestätigung“ (bei neuen Kacheln an) fragt vorher. Kacheln und Badges zeigen „Bereit“/„Läuft“; eigene Badges haben ihr eigenes „Wer sieht das?“.
- **Community-Karte „Bring! Einkaufsliste“ (#82):** für jede To-do-Liste; die Kachel zeigt die offenen Einträge. Ein Tipp öffnet vorerst die To-do-Karte von Home Assistant.
- **Community-Karte „Wasserkocher“ (#87):** für Xiaomi-Wasserkocher und ähnliche. Ein Tipp öffnet vorerst die Karte von Home Assistant.
- **Entitäten im Popup (#32, #83):** Im Studio gewählte Entitäten („Entitäten im Popup“) stehen unter dem Inhalt eines Popups, z. B. Skripte oder Quellen beim Mediaplayer.
- **Velair (#32):** Die Woche zeigt das Ziel jedes Blocks im Balken; das Popup zeigt den globalen Velair-Modus als Zeile, die ihn öffnet.
- **„Mehr“-Kachel mit Kacheln (#59):** Ein Tipp öffnet das Popup dieser Kachel mit ‹ zurück zu Mehr.

### Geändert
- **E-Bike-Kachel (#88):** liest den Live-Akku der eBike Bridge; meldet die Bridge „unbekannt“, bleiben der letzte bekannte Akkustand und Kilometerstand stehen. Am Handy zeigt die Kachel nur den Akku.
- **Auto-Kachel (#89):** zeigt die ihr gegebene Entität, auch ohne Schlossdaten.
- **Energie-Popup (#91):** zeigt den Ladestand des Akkus auch ohne SoC-Feld.
- **Karussell:** Eine Kachel im großen Karussell am Handy baut sich groß auf; die Punkte folgen der Textfarbe.
- **Raumseiten am Handy:** Sicherheits- und Klima-Badge öffnen ihr Popup (für diesen Raum) wie auf Zuhause.
- **Glas:** Das Popup macht das Dashboard dahinter unscharf.

### Behoben
- **Entity-Liste am Handy (#85):** Auswahl-, Zeit- und Datumsfelder lassen sich wieder bedienen.
- **Energie-Badge in Safari:** Das Symbol hat die richtige Größe.
- **Energiefluss:** Die laufenden Punkte springen nicht mehr, wenn sich die Leistung ändert.
- **Sicherheit:** Eine geschlossene Tür- oder Fenstergruppe mit einem Mitglied, das nicht antwortet, sagt „1 Sensor nicht erreichbar“ statt „Geschlossen“.
- **Popups** öffnen immer oben; der Wochenstreifen der Rezepte trennt keine Silben mehr; das Haustier-Popup hat seinen Titel; die Diagramm-Platte wirft denselben Schatten wie andere Karten.
- **Universal-Kachel** hat ihr Symbol in der Kachelauswahl des Studios.
- **Rückfrage vor dem Öffnen eines Schlosses** sagt „Tür öffnen“.

## 26.10.63 – 27.10.2026

### Geändert
- **Badges am Handy öffnen ein Popup:** Ein Tipp auf ein Badge auf Zuhause filtert die Seite nicht mehr. Sicherheit und Klima öffnen eine Übersicht mit ihren Unter-Badges als Zeilen (Schlösser, Kameras, Türen, Fenster, Jalousien / Temperatur, Luftfeuchtigkeit, Jalousien als letzte Zeile). Eine Zeile öffnet das Popup des Badges oder Geräts mit ‹ zurück und schaltet nie etwas. Was Aufmerksamkeit braucht (Schloss offen, Tür oder Fenster offen oder gekippt, Kamera offline, Jalousien offen, solange sie zählen), zeigt sein Symbol in der Warnfarbe. Beleuchtung und Energie öffnen ihre eigenen Popups; auf Raumseiten klappen die Sammel-Badges weiter ihre Unter-Reihe auf. Ohne Casora-Popups filtert die Seite wie bisher.
- **Sicherheits-Badge ohne eigene Einträge (auch Desktop und Tablet):** Ein Tipp öffnet dieselbe Sicherheits-Übersicht wie am Handy statt direkt „Türen & Fenster“ (#39).
- **Jalousien im Klima:** Die Unter-Reihe des Klima-Badges auf Zuhause hat ein Unter-Badge „Jalousien“ (als letztes, wie unter Sicherheit); es öffnet das Popup der Jalousien-Kachel des Dashboards. Im Studio unter Klima-Badge › „Jalousien anzeigen“ (standardmäßig an). HA-Jalousiegruppen werden nie als einzelne Jalousie mitgezählt.
- **Klima-Unter-Badges:** Temperatur und Luftfeuchtigkeit nehmen die Farben der Luftqualität an, mit passenden Worten: grün im Wohlfühlbereich (19–24 °C, auch bei °F-Sensoren; 40–60 %), orange knapp daneben (Kühl, Warm / Etwas trocken, Etwas feucht), rot darüber hinaus (Kalt, Heiß / Sehr trocken, Sehr feucht).
- **Beleuchtungs-Badge mit HA-Gruppe (#80):** Im Badge gewählte Lampen oder Räume gehen vor seiner Gruppe; das Handy zeigt genau diese („N von M Räumen an“).
- **Energie-Unter-Popups „Haus“, „Solar“, „Netz“ und „Akku“:** der Energiefluss des großen Energie-Popups (bei Haus und Solar statt des Balkens), wenn seine Quellen da sind.
- **⋯-Menü am Handy:** Die Seite dahinter tritt zurück wie bei der Glocke.

### Behoben
- **Popups springen nicht mehr:** Der Inhalt erscheint erst, wenn Statuszeile, Diagramme und Spalten stehen; Überschriften rutschen nach dem Öffnen nicht mehr. Das Schließen-Kreuz blieb in Safari halb durchsichtig.
- **Popups am Handy so hoch wie ihr Inhalt:** Nach dem Licht-Popup ging jedes weitere Popup bis ganz oben auf.
- **Raum-Unter-Badge im Licht-Popup:** Ein Raum mit einer verschachtelten Gruppe listete jede Lampe als eigenen „Raum“ mit dem Raumnamen.
- **Jalousien-Popup aus dem Unter-Badge:** in voller Breite wie das der Kachel (Namen wurden abgeschnitten); das Unter-Badge einer Jalousie unter Sicherheit trägt das Jalousien-Symbol statt einer Tür.
- **Energie-Popups: „heute“ unter 1 kWh in Wh:** 0,02 kWh Solar am Morgen standen als „0 kWh“ (und „0 %“ Solaranteil) neben der fließenden Leistung; jetzt „20 Wh“ und „< 1 %“.
- **Sicherheits-Badge auf Zuhause (#76):** „Türen & Fenster“ listet auch die mitgezählten Jalousien, mit „Schließen“ und „Alle schließen“.

## 26.10.62 – 26.10.2026

Fasst alles aus den Betas 26.10.62b1 bis b6 zusammen, dazu einheitliche Popups.

### Neu
- **Einstellungen nach Themen im Studio:** Ein Knopf „Einstellungen“ öffnet eine Startseite mit Suche, sechs Themen (Aussehen, Meldungen, Haus & Geräte, Wetter & Klima, Bedienung, Extras) und System (Updates). Was nur für dieses Dashboard gilt, ist markiert. Das bisherige Studio ist entfernt.
- **Energiefluss (#62):** Das Energie-Popup zeigt den Fluss wie das Energie-Dashboard von Home Assistant: Netz, Solar, Haus und Akku (und CO₂, wenn vorhanden) mit ruhigen Punkten in Richtung der aktuellen Leistung. Darunter die fünf größten Verbraucher und „Alle N anzeigen“.
- **Kacheln Entity-Liste und „Mehr“ (#59):** eine Kachel, deren Popup Entitäten zum direkten Schalten und Einstellen zeigt (Schalter, Zeiten, Zahlen, Auswahl), aus einer Gruppe (auch Gruppen-Helfer), einer eigenen Auswahl oder einem Home-Assistant-Label; und eine Kachel für Listen und Diagramme ohne eigene Kachel.
- **Home-Assistant-Meldungen in der Glocke (#70):** Meldungen von `persistent_notification.create` und Home Assistants eigene Hinweise erscheinen in der Glocke; Wegwischen löscht sie auch in Home Assistant, Antippen zeigt den ganzen Text mit „Löschen“.
- **Jalousien in der Sicherheit (#76):** wählbar, welche Jalousien für die Sicherheit zählen (Einstellungen › Haus & Geräte oder am Sicherheits-Badge). Ist eine offen, steht auf Zuhause „Jalousien · N geöffnet“, standardmäßig nur von Sonnenuntergang bis Sonnenaufgang, mit Popup zum Schließen.
- **Geschirrspüler (#77):** Home-Connect-Spüler werden über die Kennungen von Home Assistant erkannt; Hygiene+ und Intensivzone; das Programm als eine Zeile; Startverzögerung als Uhrzeit.
- **Farbrad im Licht-Popup** und ein **Szenen-Badge in jedem Raum**.
- **Einzelne Türen und Fenster ausblenden oder umbenennen (#69).**
- **Energie-Badge zurück auf Automatisch (#78)** mit einem Knopf im Studio.

### Geändert
- **Einheitliche Popups:** Jedes Popup folgt demselben Muster: Kopf mit Raum, Name und Status; höchstens eine Hauptbedienung; Abschnitte in fester Reihenfolge (Bedienung, Zustand, Verlauf, Einstellungen); › öffnet immer eine Unterseite mit ‹ zurück; „Weitere Einstellungen“ mit den Geräte-Infos am Ende jedes Geräte-Popups; ein Knopfstil; eine Breite. Zweispaltige Popups sind symmetrisch.
- **Pulse-Popup** neu geordnet: kurzer Status, Anzahl am Abschnitt, Akkustand am Symbol.
- **Medien-Popups:** Fernseher und Receiver schalten über den Schalter im Kopf (die Extra-Zeile ist weg); der Wiedergabe-Knopf nimmt die Farbe des Covers an; die Zeile „Apple Music öffnen“ hat das einfarbige Symbol aus iOS 27.2.
- **Energieliste im Raum (#79):** alle Verbraucher des Raums, 0 W blass nach den aktiven. Am Handy öffnet das Energie-Badge auf Zuhause das Popup.
- **Beleuchtungs-Badge am Handy (#80):** Hat das Badge eigene Lampen, zeigt das Handy genau diese, wie der Desktop.
- **Energie:** Die Quellen aus dem Energie-Dashboard von Home Assistant haben Vorrang (auch vor Anker Solix), und der Anteil aus Solar und Akku erscheint auch ohne die Solarfelder der Kachel.
- **Strompreis** nur noch aus den Einstellungen bzw. dem Energie-Dashboard; das Feld an der Kachel ist weg.
- **Studio:** Abschnitte aus den Einstellungen behalten ihre Breite; die Vorschau flackert nicht mehr bei Änderungen, die sie nicht zeigt; größere Tippflächen am Handy; der Glocken-Schalter ist eine eigene Zeile.
- **Tablets quer:** Berühren die Badges die Kacheln (etwa bei offener Unterreihe), rückt der Kopf etwas hoch, statt hinter die Kacheln zu rutschen.
- **Sprechen an der Klingel (#23):** eine Verbindung für Bild und Mikrofon; mit Home Assistant 2026.11 spricht Casora über Home Assistants eigenen Player.
- **Diagnose** mit anonymem Energie-Abschnitt.

### Behoben
- **Speichern gesperrt nach eigener Karte (#75).**
- **Beschattungsautomatik im Jalousien-Popup (#81):** Der Schalter zeigt den neuen Zustand sofort, ohne das Popup neu zu öffnen.
- **Diagramme in Popups** sind nach dem Zurückgehen von einer Unterseite (Einstellungen, „Details“) wieder da.
- **Licht-Popup in Firefox (#74):** Der letzte Raum-Knopf war unsichtbar.
- **Wetter-Popup (#67, #68):** Werte aller Kurven, Diagramm nach ‹ zurück.
- **Studio „Kachel hinzufügen“ (#71)** und **Bezeichnung des ersten Diagramm-Sensors (#72).**
- **Energie-Prüfung:** kW als W gelesen im Standard-Look, negative Leistung in W auf Badges, leeres Zuhause-Popup mit nur einem Haussensor.
- **Smart Sort:** Eine inaktiv gewordene Kachel konnte zwischen den aktiven stehen bleiben.
- Kleineres: Haustier-Werte liefen am Handy ineinander, „526 Std.“ in Tagen, „vor 3w“ ausgeschrieben, „connected“ übersetzt, das CO₂-Feld zeigt die echte Vorgabe 1800 ppm.

## 26.10.61 – 25.10.2026

Enthält alles aus 26.10.60 und drei Fehlerbehebungen. Wer von 26.10.59 oder älter kommt, bitte zuerst den Hinweis unten lesen.

**Bitte vor dem Update lesen:** Diese Version baut Teile von Casoras Unterbau um, damit Casora in den offiziellen HACS-Store kann. Zurück auf 26.10.59 geht danach nicht.

### Neu
- **Kühlschrank-Karte:** Temperatur je Zone, Sollwerte als Schnellwahl, SuperCool, SuperFrost, Nacht- und Partymodus, offene Tür und Alarme, 24-Stunden-Verlauf je Zone. Für Liebherr (Kern und HACS), Home Connect (Kern, lokal, Alt) und jedes Gerät, das wie ein Kühl- oder Gefrierschrank heißt; das Studio schlägt sie selbst vor.
- **Mähroboter und Kaffeevollautomat sind normale Gerätekarten:** Das Studio schlägt sie vor wie andere Geräte. Der Mäher liest Husqvarna Automower, Gardena, Worx Landroid, Segway Navimow, Ecovacs GOAT und Mammotion (Akku, nächster Start, Messer, Regenpause, Schnitthöhe, Zonen, Parken). Der Kaffeevollautomat liest Home Connect (Kern, lokal, Alt), Miele, De'Longhi, Jura (Bluetooth und WLAN), Melitta, La Marzocco, Philips und eine einfache Steckdose.
- **Velair-Community-Karte (#32):** ein Thermostat mit dem Velair-Zeitplan: an/aus, die Woche, die Zeitfenster von heute und deren Bearbeitung. Dein normales Thermostat bleibt unverändert.
- **Eigenes Popup für eigene Badges (#60):** Ein eigenes Badge kann ein eigenes Popup öffnen, mit Werten, 24-Stunden-Verlauf, Bedienung und eigenen Karten, im Studio zusammengestellt wie bei der Universal-Kachel.
- **Wetter (#56):** die gefühlte Temperatur als zweite Kurve, und im Studio wählst du, welche Werte ins Diagramm kommen (bis zu vier, z. B. Taupunkt oder Böen) und welche Zusatzzeilen das Popup zeigt (Taupunkt, Böen, Bewölkung, Regen, Sonne, UV). Die gefühlte Temperatur braucht eine Quelle, die sie liefert, z. B. Wetter & Warnungen 26.10.10.
- **Frigate: Stream wählbar (#61):** Stream für Kachel und Popup wählen, am Handy standardmäßig der Unterstream, im Popup umschaltbar.
- **Live-Aktivitäten in allen acht Sprachen,** und der Titel zeigt die Geräteart („Saugroboter“), wenn der Gerätename nur der Produktname ist.

### Geändert
- **Updates nur noch über HACS:** Casora installiert nicht mehr selbst. Der Knopf „Installieren“ im Studio lässt HACS das Update laden, und eine Beta installierst du direkt aus ihrer Zeile in der Versionsliste. Releases bringen eine casora.zip mit, HACS lädt damit nur noch die Integration statt des ganzen Repos, und das Update hängt nicht mehr bei 50 %.
- **Private Raumfotos:** Eigene Raumfotos ziehen von /config/www/casora nach /config/casora_photos und werden nur noch angemeldet über signierte Links ausgeliefert. Gespeicherte Dashboards funktionieren weiter.
- **Nichts mehr in deine Konfiguration geschrieben:** Casoras Hilfsskripte sind jetzt Casora-Aktionen, und die Designs kommen aus der Integration statt aus einer Datei im themes-Ordner. Die Design-Wahl im Studio wirkt sofort, steht in deinem Home-Assistant-Profil, und HAs Profil-Auswahl zeigt die Casora-Designs. Alte Casora-Skripte und die alte Theme-Datei entfernt Casora einmal selbst (nur unbenutzt und unverändert), eine Mitteilung sagt, was entfernt wurde.
- **KI nur über Home Assistants öffentliche Schnittstelle:** Casora ruft KI-Aufgaben über ai_task auf und fasst die Clients anderer Integrationen nicht mehr an. Das Modell wird am Gerät erkannt oder im Studio eingetippt.
- **Sichere Textausgabe:** Jeder Name und Text wird maskiert, bevor er ins Dashboard kommt.
- **Aufräumen:** Alte Programmsicherungen des früheren Selbst-Updaters (casora_sicherungen/casora_<version>_<zeit>.zip) werden entfernt, die neueste bleibt. Dashboard-Sicherungen und die Zeitreise bleiben unberührt.

### Behoben
- **Wetterwarnungen in der Glocke (#66):** Antippen öffnet jetzt immer das Warnungs-Popup mit dem Warntext, auch ohne Wetterwarnungs-Kachel auf dem Dashboard. Vorher kam ohne Kachel nur das allgemeine Popup des Sensors („An · seit …“).
- **Studio am Handy:** Gerätefelder mit Entfernen-Knopf zeigen nur noch ein Kreuz. Vorher lag das Kreuz zum Leeren des Werts doppelt daneben.
- **„In Home Assistant öffnen“ am Handy:** Der Eintrag auf der Geräteseite öffnet jetzt auch am Handy den Dialog von Home Assistant. Vorher passierte beim Antippen nichts, nur am Desktop ging es.
- **Beleuchtungs-Badge auf Zuhause (#64):** Tippen klappt die Raum-Badges jetzt auch ohne Home-Assistant-Lichtgruppe über das Haus auf. Vorher zählte das Badge die Lichter der Räume, die Reihe blieb aber verborgen.
- **Updates-Kachel und -Popup:** „Neustart ausstehend“ erscheint jetzt zuverlässig und live, auch in einem Popup, das ohne offene Updates geöffnet wurde, und „Jetzt neu starten“ kommt erst, wenn keine Installation mehr läuft.
- **3D-Drucker-Live-Aktivität:** ein Druck direkt nach dem vorigen zählt jetzt ab seinem eigenen Start statt ab dem alten Auftrag, zeigt beim Vorbereiten nicht mehr die alten 100 % und zeigt die Restzeit, sobald der Drucker sie kennt.
- **Flüssigeres Dashboard in großen Häusern:** Badges hängen nicht mehr an jeder Entität im Haus, und am Handy zeichnet der Raumfilter bei fremden Änderungen nicht mehr rund 30 Karten neu. In einem Haus mit 4.700 Entitäten sank die Zeichenzeit je Zustandsänderung am Desktop von etwa 14 auf 1 ms und am Handy von etwa 19 auf 1 bis 4 ms.
- **Jalousien (#63):** Kachel und Popup zählen und mitteln dieselben Jalousien („4 von 6 geöffnet · Ø 50 %“, „Alle geöffnet · Ø 70 %“); ohne eigene Liste nimmt die Kachel die Mitglieder der Home-Assistant-Gruppe.
- **Medien-Badge (#64):** Antippen öffnet immer das Medien-Popup, laufende Geräte oben; ein Fernseher, der nur an ist, zählt in Badge und Popup gleich.
- **Badges im neuen Raum (#57):** Ein neuer Raum übernimmt die Standard-Badges aus dem gleichnamigen Home-Assistant-Bereich, und am Handy zeigt ein Raum mit nur eigenen Badges seine Badge-Reihe.
- **Diagramm-Karte am Handy (#58):** Sensor-, Zeitraum- und Linie/Balken-Knöpfe reagieren am Handy, nach „Zurück“ ist das Diagramm wieder da, die Sensorwahl bleibt, lange Namen enden mit „…“.
- **Energie (#44):** Verbraucher, deren Zähler in Home Assistant deaktiviert ist, erscheinen nicht mehr.
- **Studio hing beim Hinzufügen einer Kühlschrank-Kachel** in Häusern mit vielen Geräten; jede Kachelart braucht jetzt Millisekunden.
- **Leerer Raum:** Der Hinweis „Noch keine Geräte – im Studio hinzufügen“ flackert nicht mehr.
- **Wiedergabe:** Nach ⏮ springt der Fortschrittsbalken zurück an den Anfang, wenn derselbe Song neu startet, und die Kreise hinter ⏮ und ⏭ sitzen mittig auf ihren Symbolen.
- **Wetterwarnung in der Glocke:** Die DWD-Vorwarnung erscheint nicht mehr als aktuelle Warnung, und die Warnarten werden richtig geschrieben.
- **E-Bike, Kaffee, Mäher, Kühlschrank:** mehrere Zustands- und Zählerfehler aus der Durchsicht dieser Karten.

## 26.10.60 – 25.10.2026

**Bitte vor dem Update lesen:** Diese Version baut Teile von Casoras Unterbau um, damit Casora in den offiziellen HACS-Store kann. Zurück auf 26.10.59 geht danach nicht.

### Neu
- **Kühlschrank-Karte:** Temperatur je Zone, Sollwerte als Schnellwahl, SuperCool, SuperFrost, Nacht- und Partymodus, offene Tür und Alarme, 24-Stunden-Verlauf je Zone. Für Liebherr (Kern und HACS), Home Connect (Kern, lokal, Alt) und jedes Gerät, das wie ein Kühl- oder Gefrierschrank heißt; das Studio schlägt sie selbst vor.
- **Mähroboter und Kaffeevollautomat sind normale Gerätekarten:** Das Studio schlägt sie vor wie andere Geräte. Der Mäher liest Husqvarna Automower, Gardena, Worx Landroid, Segway Navimow, Ecovacs GOAT und Mammotion (Akku, nächster Start, Messer, Regenpause, Schnitthöhe, Zonen, Parken). Der Kaffeevollautomat liest Home Connect (Kern, lokal, Alt), Miele, De'Longhi, Jura (Bluetooth und WLAN), Melitta, La Marzocco, Philips und eine einfache Steckdose.
- **Velair-Community-Karte (#32):** ein Thermostat mit dem Velair-Zeitplan: an/aus, die Woche, die Zeitfenster von heute und deren Bearbeitung. Dein normales Thermostat bleibt unverändert.
- **Eigenes Popup für eigene Badges (#60):** Ein eigenes Badge kann ein eigenes Popup öffnen, mit Werten, 24-Stunden-Verlauf, Bedienung und eigenen Karten, im Studio zusammengestellt wie bei der Universal-Kachel.
- **Wetter (#56):** die gefühlte Temperatur als zweite Kurve, und im Studio wählst du, welche Werte ins Diagramm kommen (bis zu vier, z. B. Taupunkt oder Böen) und welche Zusatzzeilen das Popup zeigt (Taupunkt, Böen, Bewölkung, Regen, Sonne, UV). Die gefühlte Temperatur braucht eine Quelle, die sie liefert, z. B. Wetter & Warnungen 26.10.10.
- **Frigate: Stream wählbar (#61):** Stream für Kachel und Popup wählen, am Handy standardmäßig der Unterstream, im Popup umschaltbar.
- **Live-Aktivitäten in allen acht Sprachen,** und der Titel zeigt die Geräteart („Saugroboter“), wenn der Gerätename nur der Produktname ist.

### Geändert
- **Updates nur noch über HACS:** Casora installiert nicht mehr selbst. Der Knopf „Installieren“ im Studio lässt HACS das Update laden, und eine Beta installierst du direkt aus ihrer Zeile in der Versionsliste. Releases bringen eine casora.zip mit, HACS lädt damit nur noch die Integration statt des ganzen Repos, und das Update hängt nicht mehr bei 50 %.
- **Private Raumfotos:** Eigene Raumfotos ziehen von /config/www/casora nach /config/casora_photos und werden nur noch angemeldet über signierte Links ausgeliefert. Gespeicherte Dashboards funktionieren weiter.
- **Nichts mehr in deine Konfiguration geschrieben:** Casoras Hilfsskripte sind jetzt Casora-Aktionen, und die Designs kommen aus der Integration statt aus einer Datei im themes-Ordner. Die Design-Wahl im Studio wirkt sofort, steht in deinem Home-Assistant-Profil, und HAs Profil-Auswahl zeigt die Casora-Designs. Alte Casora-Skripte und die alte Theme-Datei entfernt Casora einmal selbst (nur unbenutzt und unverändert), eine Mitteilung sagt, was entfernt wurde.
- **KI nur über Home Assistants öffentliche Schnittstelle:** Casora ruft KI-Aufgaben über ai_task auf und fasst die Clients anderer Integrationen nicht mehr an. Das Modell wird am Gerät erkannt oder im Studio eingetippt.
- **Sichere Textausgabe:** Jeder Name und Text wird maskiert, bevor er ins Dashboard kommt.
- **Aufräumen:** Alte Programmsicherungen des früheren Selbst-Updaters (casora_sicherungen/casora_<version>_<zeit>.zip) werden entfernt, die neueste bleibt. Dashboard-Sicherungen und die Zeitreise bleiben unberührt.

### Behoben
- **Beleuchtungs-Badge auf Zuhause (#64):** Tippen klappt die Raum-Badges jetzt auch ohne Home-Assistant-Lichtgruppe über das Haus auf. Vorher zählte das Badge die Lichter der Räume, die Reihe blieb aber verborgen.
- **Updates-Kachel und -Popup:** „Neustart ausstehend“ erscheint jetzt zuverlässig und live, auch in einem Popup, das ohne offene Updates geöffnet wurde, und „Jetzt neu starten“ kommt erst, wenn keine Installation mehr läuft.
- **3D-Drucker-Live-Aktivität:** ein Druck direkt nach dem vorigen zählt jetzt ab seinem eigenen Start statt ab dem alten Auftrag, zeigt beim Vorbereiten nicht mehr die alten 100 % und zeigt die Restzeit, sobald der Drucker sie kennt.
- **Flüssigeres Dashboard in großen Häusern:** Badges hängen nicht mehr an jeder Entität im Haus, und am Handy zeichnet der Raumfilter bei fremden Änderungen nicht mehr rund 30 Karten neu. In einem Haus mit 4.700 Entitäten sank die Zeichenzeit je Zustandsänderung am Desktop von etwa 14 auf 1 ms und am Handy von etwa 19 auf 1 bis 4 ms.
- **Jalousien (#63):** Kachel und Popup zählen und mitteln dieselben Jalousien („4 von 6 geöffnet · Ø 50 %“, „Alle geöffnet · Ø 70 %“); ohne eigene Liste nimmt die Kachel die Mitglieder der Home-Assistant-Gruppe.
- **Medien-Badge (#64):** Antippen öffnet immer das Medien-Popup, laufende Geräte oben; ein Fernseher, der nur an ist, zählt in Badge und Popup gleich.
- **Badges im neuen Raum (#57):** Ein neuer Raum übernimmt die Standard-Badges aus dem gleichnamigen Home-Assistant-Bereich, und am Handy zeigt ein Raum mit nur eigenen Badges seine Badge-Reihe.
- **Diagramm-Karte am Handy (#58):** Sensor-, Zeitraum- und Linie/Balken-Knöpfe reagieren am Handy, nach „Zurück“ ist das Diagramm wieder da, die Sensorwahl bleibt, lange Namen enden mit „…“.
- **Energie (#44):** Verbraucher, deren Zähler in Home Assistant deaktiviert ist, erscheinen nicht mehr.
- **Studio hing beim Hinzufügen einer Kühlschrank-Kachel** in Häusern mit vielen Geräten; jede Kachelart braucht jetzt Millisekunden.
- **Leerer Raum:** Der Hinweis „Noch keine Geräte – im Studio hinzufügen“ flackert nicht mehr.
- **Wiedergabe:** Nach ⏮ springt der Fortschrittsbalken zurück an den Anfang, wenn derselbe Song neu startet, und die Kreise hinter ⏮ und ⏭ sitzen mittig auf ihren Symbolen.
- **Wetterwarnung in der Glocke:** Die DWD-Vorwarnung erscheint nicht mehr als aktuelle Warnung, und die Warnarten werden richtig geschrieben.
- **E-Bike, Kaffee, Mäher, Kühlschrank:** mehrere Zustands- und Zählerfehler aus der Durchsicht dieser Karten.

## 26.10.59 – 24.10.2026

### Neu
- **Diagramm-Kachel (#50):** eine Community-Karte mit dem aktuellen Wert und einer 24-Stunden-Linie auf der Kachel; das Popup zeigt Casoras eigenes Diagramm für 24 Stunden, 7 Tage, 30 Tage oder ein Jahr mit bis zu 4 Reihen, als Linie oder Balken (Umschalter im Popup, Vorgabe im Studio: Automatisch, Linie oder Balken; Zähler wie Energie oder Regen bekommen Balken je Stunde, Tag oder Monat), Höchst- und Tiefstwert mit Uhrzeit und dem Durchschnitt aus der Statistik von Home Assistant. Im Studio stellst du auch ein, mit welchem Zeitraum sich das Popup öffnet. Geht mit jedem Zahlen-Sensor, z. B. CPU-Last, Temperatur, Leistung oder einem Zähler.
- **Universal-Kachel (#52, Forum-Wunsch):** eine Kachel mit Titel, Symbol und einem beliebigen Gerät. Im Studio stellst du ihr Popup aus Werten (bis zu 8 Geräte), einem 24-Stunden-Verlauf, der Bedienung des Geräts und eigenen Karten zusammen. Eine eigene Kachel öffnet beim Antippen endlich etwas.
- **Eigene Badges (#53, Forum-Wunsch):** je Raum und auf Zuhause beliebig viele Badges, jedes aus dem Zustand eines Geräts oder aus einer Vorlage von Home Assistant, mit Symbol, Farbe und Aktion beim Antippen. Neue Option „Badges umbrechen“ statt seitlich zu scrollen, auf Desktop, Tablet und Handy.
- **Im Popup sichtbar (#54):** Bei Popups, die ihre Zeilen selbst sammeln (Raumklima, Batterien), listet das Studio jede Zeile mit einem Schalter. So blendest du aus, was dort nicht hingehört.
- **Fünf neue Sprachen:** Casora spricht jetzt auch Französisch, Italienisch, Niederländisch, Polnisch und Portugiesisch (Dashboard, Studio, Benachrichtigungen, Integrationstexte). Casora folgt der Sprache deines Home-Assistant-Profils; die Live-Aktivitäten am Handy bleiben für diese fünf vorerst Englisch.
- **Wetterwarnung vom DWD (#55):** Die Wetterwarnung-Kachel nimmt den Sensor „aktuelle Warnstufe“ der Integration Deutscher Wetterdienst Weather Warnings, neben NINA, Meteoalarm und Warnwetter. Kachel, Popup und Glocke lesen die Warnungen aus seinen Attributen; das Studio schlägt den Sensor automatisch vor.

### Behoben
- **Raumklima im Garten (#54):** Eine Raumklima-Kachel in einem Raum zeigte alle Innenräume. Sie folgt jetzt ihrem Raum: nur dessen Werte, draußen nur die Außenluft, und ein Raum ohne Klimasensoren sagt das.
- **Haus-Licht ohne Lichtgruppe:** Ohne eine „alle Lampen“-Gruppe in Home Assistant zählte das Beleuchtungs-Badge auf Zuhause höchstens 10 Lichter, das Haus-Popup hatte keine Raumleiste und der Hauptschalter fragte nicht. Das Badge folgt jetzt den Räumen und zählt jedes Licht, das Popup zeigt die Räume, und „Alle N Lichter ausschalten?“ fragt vorher. Bestehende Dashboards werden beim Öffnen des Studios umgestellt.
- **Räume mit kyrillischen Namen (#51):** Alle solchen Räume bekamen dieselbe Adresse, nur einer ließ sich öffnen. Sie bekommen jetzt eine eigene Adresse; gespeicherte Dashboards repariert das Studio beim Öffnen.
- **E-Bike-Kachel mit der aktuellen Bosch-eBike-Integration (Forum-Meldung):** Seit Version 1.18 benennt die Integration ihre Entitäten in der Sprache deines Home Assistant, Casora kannte nur die alten englischen Namen, deshalb zeigte das Popup nur Diebstahl und einen leeren Service. Casora findet das Rad jetzt über sein Gerät und liest jeden Wert über seinen Schlüssel; der Service-Countdown wird aus Datum und Kilometerstand gerechnet, wenn die Integration nur die liefert. Der Popup-Titel ist der Gerätename des Rads.
- **Energie auf Zuhause (#44):** Ein neu eingeschaltetes, leeres Energie-Badge übernimmt jetzt ebenfalls die Energie-Einstellungen von Home Assistant. Sind im Energie-Dashboard von Home Assistant unter „Einzelne Geräte“ Verbraucher eingetragen, zeigt das Popup genau diese statt der automatischen Top 5. Die Akku-Zeile zeigt den Ladestand („Lädt · 78 %“), wenn der Akku einen Prozent-Sensor hat.
- **Klingel, Sprechen (#23):** Bleibt die Sprechverbindung ein paar Sekunden still, beendet die Karte sie und versucht es einmal von selbst neu.
- **Studio-Handyvorschau:** Eine Raum-Kachel mit derselben Lampe wie die Licht-Kachel auf Zuhause zeigte auf die Kachel von Zuhause.
- **Speiseplan-Wochenleiste:** In der Woche der Zeitumstellung stand statt Montag ein zweiter Sonntag.

## 26.10.58 – 23.10.2026

### Neu
- **Casora auf Spanisch:** Dashboard, Studio und Einrichtung gibt es auf Spanisch (die Sprache folgt Home Assistant).
- **Warum gewählt:** Im Studio steht unter einem Wert, den Casora selbst gewählt hat, jetzt der Grund, z. B. „Automatisch gewählt: der Name enthält ‚Hausbedarf‘“, „aus dem Energie-Dashboard“ oder „Automatisch gefunden am selben Gerät (Home Connect)“. So fällt eine falsche Wahl sofort auf.
- **Energie aus dem Energie-Dashboard von Home Assistant:** Wer dort Leistungssensoren für Netz, Solar und Akku eingetragen hat, bekommt sie jetzt zuerst im Energie-Badge auf Zuhause. Mit nur dem Netz zeigt es diesen Sensor, mit Solar oder Akku den Hausverbrauch als Netz + Solar + Akku. Das Popup zeigt „Woher kommt der Strom“ mit Netz, Solar und Akku, die Energie-Popups nutzen diese Sensoren auch ohne Unter-Badges. Ein Wechselrichter, der nachts schläft, zählt als 0 W. Nur wenn dort nichts eingetragen ist, sucht Casora weiter nach Namen. Ein selbst gewählter Sensor wird nie ersetzt.
- **Diagnose kopieren:** Studio → ⋯ → Hilfe → „Diagnose kopieren …“ sammelt Zahlen, Versionen und Integrationen (keine Namen von Geräten, Räumen oder Personen) für ein GitHub-Issue, „Problem melden“ öffnet ein neues Issue mit einem Feld dafür.
- **Miele-Geschirrspüler** werden erkannt.

### Behoben
- **Später hinzugekommene Lampen** in Home Assistant erscheinen jetzt auch im Beleuchtungs-Badge des Raums.
- **Erste Einrichtung:** Wer eine Klingel oder Kaffeemaschine hat, bekommt in „Was soll aufs Dashboard?“ die passende Kachel angeboten.
- **„Neu beginnen“:** Der Filter für Status-LEDs wirft keine echten LED-Streifen mehr raus.
- **Studio-Vorschau:** Ein Raum nur mit Thermostat bekommt kein Klima-Badge mehr.
- **Kaffee-Kachel:** Beim Anlegen werden nur echte Kaffeemaschinen vorgeschlagen (auch De'Longhi und Krups), keine Thermometer oder Steckdosen.
- **Räume mit kyrillischen Namen (#51):** Alle solchen Räume bekamen dieselbe Adresse, nur einer ließ sich öffnen. Kyrillische Raumnamen bekommen jetzt eine eigene Adresse; so gespeicherte Dashboards repariert das Studio beim Öffnen (einmal speichern).
- **Studio-Handyvorschau:** Eine Raum-Kachel mit derselben Lampe wie die Licht-Kachel auf Zuhause zeigte auf die Kachel von Zuhause; Tippen öffnete die falsche Kachel.
- **Speiseplan-Wochenleiste:** In der Woche der Zeitumstellung stand statt Montag ein zweiter Sonntag mit dem Rezept vom Sonntag.
- **Klingel, Sprechen (#23):** Die Karte schaltet erst auf den Ton der Sprechverbindung um, wenn dort echter Ton ankommt; Stille schaltet den Player nicht mehr stumm. Mehr Angaben zur Fehlersuche in der Browser-Konsole.
- **Home Connect aus HACS:** Waschmaschinen, Trockner und Geschirrspüler von Home Connect Alt wurden nie erkannt. Home Connect Alt und Home Connect Local werden jetzt erkannt.
- **Geschirrspüler-Vorschläge:** Das Studio schlägt einen Backofen oder eine Kaffeemaschine von Home Connect nicht mehr als Geschirrspüler vor, in jeder Sprache.
- **Die zweite Kartenansicht eines Saugroboters** wird nicht mehr als Überwachungskamera vorgeschlagen.
- **Studio-Felder finden, was die Kachel findet:** Geschirrspüler, Waschmaschine/Trockner (z. B. SmartThings, Miele), Saugroboter und 3D-Drucker nutzen im Studio dieselbe Erkennung wie ihre Kacheln.
- **Live-Aktivitäten für Dreame- und Ecovacs-Saugroboter** bekommen Fläche, Dauer und Fortschritt.

## 26.10.57 – 23.10.2026

### Behoben
- **Energie auf Zuhause (#44):** Der Hausverbrauch ist nie ein Spitzen-, Mittel- oder Zeitraumwert (z. B. „Netzbezugs-Spitze heute“, „Grundlast“, „Überschuss letzte Stunde“ einer PV-Auswertung) und nie die Erzeugung eines Wechselrichters: SMA nennt seine aktuelle Erzeugung „Grid power“, Casora behandelt sie jetzt als Solar. Ein Stromzähler ohne Umlaut in der Entitäts-ID (`stromzahler`) wird erkannt. Ein Haussensor, den Casora selbst gewählt hat und der nicht mehr passt, wird beim Öffnen des Studios neu gewählt. Wird der Haussensor im Studio gelöscht, zeigt Zuhause die Summe der Räume, statt das Badge auszublenden.
- **Energie-Popup „Woher kommt der Strom“:** SMA „Grid power“ zählt als Solar, der SMA-Energiezähler als Netz, ein Stromzähler (`stromzahler`) als Netz.
- **Klingel: Sprechen (#23):** Der Ton der Sprechverbindung wird nur genutzt, solange dort wirklich Ton ankommt, sonst bleibt der Player hörbar (26.10.56 wurde still, wenn die Sprechverbindung keinen Ton brachte). In der Browser-Konsole stehen Zeilen mit `casora klingel` zur Diagnose.

## 26.10.56 – 23.10.2026

### Behoben
- **Klingel: Sprechen (#23, Vorab-Fix):** Wer mithört und spricht, hört die Klingel jetzt über die Sprechverbindung selbst, der Ton bricht beim Sprechen nicht mehr weg. Nach „Beenden“ kommt der Player mit Ton zurück. Das Mikrofon regelt seine Lautstärke nicht mehr selbst, die mitten im Satz schwankte.
- **Helfer-Skripte nicht angelegt:** Casora verlässt sich nicht mehr darauf, die Zeile `script: !include scripts.yaml` in der configuration.yaml zu erkennen. Es trägt seine vier Skripte ein, lädt die Skripte neu und prüft, ob Home Assistant sie angelegt hat; nur wenn nicht und die Zeile wirklich fehlt, stellt es scripts.yaml wieder her. Schon vorhandene Einträge schreibt es nicht doppelt.

## 26.10.55 – 23.10.2026

### Behoben
- **Energie auf Zuhause (#44):** Zuhause zeigt nicht mehr den Gesamtsensor eines einzelnen Geräts oder Raums als Hausverbrauch. Eine Messklemme gilt auch einphasig als Haussensor (am Gerät nichts zu schalten, dazu Rückspeisung, Spannung mit Leistungsfaktor oder ein Zähler-Modell) und nie als Raumleistung oder Summand. Ohne echten Haussensor (Hausverbrauch, Netz oder Zähler) zeigt Zuhause die Summe der Räume, also dieselben Werte wie die Raum-Badges, und geht mit, wenn sich die Räume ändern. Ein selbst gewählter Sensor wird nie ersetzt. Bestehende Dashboards: Studio einmal öffnen und speichern, dann ist eine falsche Auswahl korrigiert. Die automatische Liste im Popup heißt jetzt „Top 5 Verbraucher“.
- **Sicherheit auf Zuhause (#39):** Neben Kameras, Schlössern oder Alarm im Badge zeigt die Unter-Reihe jetzt auch „Türen“ und „Fenster“ mit den Türen und Fenstern des Hauses; ein Tipp öffnet die Liste. Weg bleibt nur die Art, die das Badge selbst einträgt; Rauch- oder Wassermelder im Badge blenden sie nicht mehr aus, neue Kontakte erscheinen ohne Neuladen.
- **Geschirrspüler mit Home Connect aus Home Assistant (#48):** Die Restzeit kommt aus der Endzeit (war „33:46 Std. übrig“). Aktives und gewähltes Programm, Tür, Fortschritt und Abbrechen werden selbst gefunden; im Studio lassen sich Programm (Select) und Tür (Sensor) auch von Hand wählen. Programmnamen sind lesbar.
- **KI über OpenRouter oder Ollama:** KI-Aufgaben dieser Integrationen werden erkannt (Modell anders gespeichert, Anbieter davor), KI-Funktionen und KI-Kachelarten laufen damit.
- **Hinweis zu den Helfer-Skripten:** Der Hinweis verschwindet, sobald alle Helfer und Skripte da sind, und nennt die Zeile `script: !include scripts.yaml` nur noch, wenn sie wirklich fehlt.

## 26.10.54 – 22.10.2026

### Behoben
- **Player in der Studio-Vorschau:** In Casora, Casora Glas und Casora Nebel zeigte die Vorschau an der Welle wieder den alten Player, sobald im Dashboard nichts lief, ein Player länger pausiert war oder die Dashboard-Skripte noch luden. Jetzt zeigt sie immer den Player des Dashboards. Läuft dort nichts, fehlen Welle und Player auch in der Vorschau, am Handy die „Aktuelle Wiedergabe“.

## 26.10.53 – 22.10.2026

### Behoben
- **Sicherheit auf Zuhause am Tablet und Desktop (#39):** Ohne eigene Einträge zählte das Badge Sicherheit auf Zuhause die Türen und Fenster des Hauses nur am Handy, am Tablet und Desktop fehlte es ganz. Jetzt erscheint es auf allen Geräten. Ohne eigene Einträge öffnet ein Tipp die Liste aller Türen und Fenster, statt eine leere Zeile aufzuklappen oder am Handy ins Leere zu filtern. Das Studio zeigt im Badge, wie viele Türen und Fenster automatisch erkannt sind.
- **Zurück zur Leuchtenliste nach „Weitere Einstellungen“ (#43):** Öffnete man eine Leuchte aus der Beleuchtungsliste, dann „Weitere Einstellungen“ und ging wieder zurück, fehlte in der Leuchte der Pfeil zurück zur Liste. Er bleibt jetzt erhalten.

## 26.10.52 – 22.10.2026

### Neu
- **Pflanzenmonitor Plus:** Casora erkennt die Pflanzen von Pflanzenmonitor Plus wie die des Plant Monitor. Pflanzen-Kachel, Pflanzen-Popup mit Messwerten und Grenzwerten, Pflanzen-Doktor, Hinweise in der Glocke, Kachelvorschläge und der Import im Studio funktionieren mit beiden. Lüften und Raumklima lassen die Pflanzensensoren aus. Mit dem Plant Monitor bleibt alles wie bisher.

### Behoben
- **Studio: Badges in der Handy-Vorschau zu hoch, Personen-Badge niedriger als die anderen (#41):** Im Look Casora zeigte die Handy-Vorschau die Badges höher als auf dem Handy, und das Personenbild war kleiner als die Farbkreise daneben. Jetzt haben alle Badges die Maße vom Handy, und das Bild einer Person ist so groß wie ein Farbkreis, auch in der Desktop-Vorschau.

## 26.10.51 – 22.10.2026

### Behoben
- **Handy: Personen-Badge auf Zuhause setzte den Filter statt das Popup zu öffnen (#40):** Mit „Personen als eigene Badges“ oder nur einer ausgewählten Person zeigte das Badge am Handy zwar den Namen, Antippen wechselte aber in die Ansicht „Personen“. Jetzt hat am Handy wie am Desktop jede Person ihr eigenes Badge, und Antippen öffnet ihr Popup. Bei zwei oder mehr Personen ohne den Schalter bleibt das Sammel-Badge mit dem Filter.
- **Studio: Personen-Badge fehlte in der Handy-Vorschau (#41):** Mit „Personen als eigene Badges“ oder nur einer Person fehlte das Badge oben auf Zuhause in der Handy-Vorschau. Jetzt steht es dort wie auf dem Handy. Auch Klima mit einzelnen Werten zeigt die Handy-Vorschau wie das Handy als ein Badge.

## 26.10.50 – 21.10.2026

### Behoben
- **Jalousie: Pfeil ohne Funktion in der Detailansicht (#35):** Tippte man im Jalousien-Popup eine einzelne Jalousie an, stand rechts noch einmal genau diese Jalousie mit „›“, und Antippen öffnete nur dasselbe Popup. Jetzt zeigt die Detailansicht Position und Voreinstellungen ohne diese Zeile; ist eine Beschattungsautomatik eingerichtet, steht rechts die Automatik. Das gilt auch für Kacheln mit nur einer Jalousie.
- **Beleuchtung: erste Leuchte und Leuchten mit Raum-Kachel öffneten ihre Detailansicht nicht (#37):** Ohne Lichtgruppe in Home Assistant öffnete die erste Leuchte der Liste wieder dasselbe Popup, und eine Leuchte aus einem Raum mit mehreren Leuchten öffnete die Liste dieses Raums statt ihrer Detailansicht. Jetzt öffnet jede Leuchte ihre eigene Detailansicht. Das gilt ebenso für Jalousie- und Schloss-Gruppen.
- **Beleuchtung: Leuchte ohne eigene Kachel öffnete das Raum-Popup ihres Badges (#37):** Jetzt öffnet sie ihre Detailansicht. Im Popup genau einer Leuchte öffnet die eigene Zeile nicht noch einmal dasselbe Popup.
- **Schloss-Gruppe: Schloss-Zeile öffnete wieder die Gruppe:** Jede Zeile öffnet jetzt ihr Schloss.
- **Leuchtengruppe mit eigener Tippaktion öffnete die Geräteseite:** Hat eine Kachel eine eigene Tippaktion (z. B. „Mehr-Infos“), öffnet die Zeile in einer Liste trotzdem das Licht-Popup und nicht die Geräteseite ohne Steuerung.
- **Kalender-Kachel zeigte versteckte Kalender (#38):** Ohne eigene Auswahl im Studio bleiben Kalender, die in Home Assistant versteckt sind, draußen – wie im Kalender von Home Assistant.
- **Sicherheit: Fenster oder Tür öffnete alle Türen und Fenster (#39):** Ein einzelnes Fenster und eine einzelne Tür öffnen ihre eigene Seite, auch aus der Glocke. Ein Badge für die Türen oder Fenster eines Raums zeigt nur diese, über die volle Breite und mit dem Titel „Fenster“ bzw. „Türen“.
- **Sicherheit auf Zuhause ohne Türen und Fenster (#39):** Das Badge auf Zuhause zählt jetzt alle Türen und Fenster im Haus mit.
- **Wetterwarnung in der Glocke immer rot:** Die Glocke zeigt Warnungen in der Farbe der Kachel je Stufe (gelb, orange, rot, lila). Die Kachel erkennt eine extreme Warnung jetzt auch als solche.
- **Studio: Karussell-Seite verlor Kachelart und Popup:** Eine Seite für ein Gerät, das im Raum schon eine Kachel hat, übernimmt diese Kachel (z. B. Fußbodenheizung mit Temperaturverlauf).

## 26.10.49 – 21.10.2026

### Behoben
- **Warnungen-Popup wirkte wie ein Popup im Popup:** Die Warnung stand als schmale Karte mittig im breiten Popup, rundherum blieb viel Fläche leer. Jetzt nutzt sie die ganze Breite, und mehrere Warnungen stehen auf großen Bildschirmen nebeneinander statt untereinander.

## 26.10.48 – 21.10.2026

### Behoben
- **Thermostat-Kachel zeigte „An“ zwischen zwei Zahlen:** Am Ziel stand „22,2° · An · 22°“, und welche Zahl was ist, war nicht zu erkennen. Jetzt steht dort „22,2° · Ziel 22°“, beim Heizen „22,2° · Heizt auf 22°“. Auf schmalen Kacheln wie am Handy wird daraus „22,2° · Heizt“ statt „22,2° +1“, das Wort bleibt also sichtbar. Mit einem Zielbereich heizt sie auf die untere und kühlt auf die obere Grenze. Beide Popups sagen jetzt dasselbe, und das Kachel-Popup zeigt bei Kühlen, Automatik, Entfeuchten und Nur Lüfter nicht mehr den rohen Modus („cool“).
- **Saugroboter: Tank- und Stationshinweise bei Dreame (#33):** Wenig oder kein Frischwasser, ein voller oder fehlender Schmutzwassertank, ein fehlender Staubbeutel und wenig Reinigungsmittel erscheinen jetzt im Popup, wie bei Roborock.
- **Saugroboter: weitere Verschleißteile bei Dreame (#33):** Räder, Wasserauslassfilter und der Schmutzwassertank im Roboter, jeweils mit Reset-Taste. Teile, die der Roboter in Tagen zählt, zeigen „noch 3 Tage“ statt Stunden.
- **Saugroboter: Hinweis unter dem Fehler (#33):** Unter dem Grund zeigt das Popup auch den Hinweis der Integration, bei Dreame zum Beispiel „Möglicherweise ist der Roboter blockiert oder steckt fest.“
- **Saugroboter-Zustände:** Raum- und Zonenreinigung, Kantenreinigung, Kartierung und Fernsteuerung haben bei Dreame eigene Bezeichnungen, und ein Roboter auf dem Rückweg zum Dock zeigt „Kehrt zurück“ statt des rohen Worts.

## 26.10.47 – 21.10.2026

### Behoben
- **Kalender-Kachel ließ sich nicht hinzufügen (#31):** Kalender-Kachel und Popup gab es, aber „Kachel hinzufügen“ im Studio bot sie nicht an. Jetzt steht „Kalender“ in der Liste. Welche Kalender sie zeigt, mit Namen und Farben, stellst du unter Einstellungen → Kalender ein; die Seitenleiste der Kachel führt dorthin.
- **Ausgeblendete Badges blieben am Handy sichtbar:** Ein im Studio ausgeschaltetes Badge (zum Beispiel Energie) verschwand am Desktop, blieb aber auf der Startseite am Handy. Die Startseite folgt jetzt den Schaltern des Desktops und „Wer sieht das?“, sofort und ohne erneutes Speichern.
- **„Wer sieht das?“ wirkte beim Energie-Badge nicht:** Es gilt jetzt auch für das Energie-Badge wie für die anderen, am Desktop und am Handy.
- **Studio-Vorschau: Tag und Nacht wechselten nur das Foto:** Mit dem Schalter über der Vorschau wechseln jetzt auch Kacheln, Badges, Leiste, Player und die Popup-Vorschau zwischen hell und dunkel, egal in welchem Modus Home Assistant steht.
- **Studio-Vorschau zeigte einen alten Player:** An der Welle zeichnete die Vorschau den Player noch wie Anfang Oktober. Jetzt zeigt sie, was das Dashboard zeigt: die Cover-Bühne im Fenster der Welle und am Handy die Cover-Streifen.
- **Thermostat-Kachel ohne ihren Temperatursensor (#32):** Der im Studio eingestellte Sensor erschien nur im Popup. Die Kachel stellt die Raumtemperatur jetzt voran, zum Beispiel „21,3° · Heizt auf 24,5°“.
- **Überschrift über deinen eigenen Popup-Karten (#32):** Die Überschrift wird schon beim Tippen übernommen, nicht erst beim Verlassen des Feldes, die Vorschau zeigt sie also sofort, und sie bleibt über den Karten.
- **Saugroboter zeigte „error“ ohne Grund (#33):** Das Popup zeigte „error“ und nicht, warum. Jetzt steht dort „Fehler“ und der Grund vorn, auch auf der Kachel, zum Beispiel bei Dreame „Der Roboter steckt fest oder kann nicht vorwärts fahren“ in der Sprache deines Home Assistant. Ohne Fehler erscheint nichts zusätzlich.
- **Saugroboter über Roborock hinaus:** Das Saugroboter-Popup findet jetzt auch bei Dreame-Robotern Fortschritt, gereinigte Fläche, Reinigungsdauer, Ruhezeiten, Trocknungsrestzeit, Reinigungs-, Wasser- und Wischmodus, Absaugmodus, Verlauf, Summen, Verschleißteile und ihre Reset-Tasten, und vieles davon auch bei Ecovacs und iRobot Roomba. Zeiten werden in der Einheit gelesen, die der Roboter meldet.
- **Reihenfolge der Badges am Handy:** In Zeilen mit zweiter Zeile („4 festgelegt“) stehen Symbol, Schalter und Pfeil wieder mittig statt oben.

### Geändert
- **Kalender hat eine eigene Seite in den Einstellungen:** Die Kalender sind von „Haus & Geräte“ auf die neue Seite „Kalender“ umgezogen, auch im Einstellungsmenü und in der Suche.

## 26.10.46 – 20.10.2026

### Behoben
- **Community ließ sich nicht scrollen:** Am Handy und auf kleineren Bildschirmen war die Community-Seite oben und unten abgeschnitten, Titel, „Kartenwunsch einreichen …“ und „Schließen“ waren nicht erreichbar. Jetzt bleiben Kopf und „Schließen“ stehen, und nur die Liste der Karten scrollt. Auch andere lange Dialoge im Studio passen jetzt auf den Bildschirm.
- **Community-Karten ohne Rahmen:** Die Einträge der Liste lagen in einem ungewollten Kasten.
- **Letzter Wechsel fehlte im Verlauf:** In der Messwert-Seite eines Popups fehlte ein gerade erfolgter Zustandswechsel manchmal in „Änderungen“ und „Verlauf“, bis sich der Zustand wieder änderte. Home Assistant speichert den Verlauf erst nach einigen Sekunden; Casora lädt jetzt so lange nach, bis der Wechsel da ist.

### Geändert
- **Community am Handy:** Im Studio am Handy fehlte der Weg zur Community, außer ganz unten in „Kachel hinzufügen“. Jetzt steht „Community-Karten …“ im ⋯-Menü.
- **„Als Nächstes“ entfernt:** Die Karte mit drei Schritten in „Inhalt“ gibt es nicht mehr.

## 26.10.45 – 20.10.2026

### Behoben
- **OK und Speichern in Popups von Home Assistant am Handy abgeschnitten:** Seit der Installation von Casora begannen Popups von Home Assistant selbst (Einstellungen, Reparaturen, Integration hinzufügen) in der App und im Handy-Browser rund 110 px zu tief, die Knöpfe unten lagen außerhalb des Bildschirms. Casora verschiebt jetzt nur noch Popups auf dem Dashboard und im Studio, und nie solche, die den Bildschirm füllen.
- **Nach dem Entfernen bleiben keine Skripte zurück:** Wird die Integration gelöscht, trägt sie jetzt auch ihre Dashboard-Ressourcen aus, nicht nur ihre Theme-Datei. Vorher konnte die App das alte Skript weiter ausführen, bis sie neu installiert wurde.

## 26.10.44 – 20.10.2026

### Behoben
- **Haustier-Popup: Licht und Ton zeigten nicht, dass sie an sind (#25):** Die Knöpfe Licht und Ton lasen ihren Zustand aus einem älteren Stand als Live-Tracking. War das Licht in Home Assistant an, blieb der Knopf aus, bis sich etwas anderes änderte. Jetzt zeigen alle drei Knöpfe ihren Zustand sofort.
- **Haustier-Popup: Licht, Ton und Live-Tracking taten im Energiesparmodus nichts (#25):** Tractive schaltet diese Schalter im Energiesparmodus ab, und Home Assistant übergeht einen Tipp darauf ohne Meldung. Die Knöpfe sind dann gedimmt, und darunter steht, warum.

## 26.10.43 – 20.10.2026

### Geändert
- **Abfall-Popup zeigt den Monatskalender jetzt von Anfang an:** „Kalender im Abfall-Popup“ (Einstellungen → Haus & Geräte → Abfall) ist jetzt standardmäßig eingeschaltet, auch in bestehenden Installationen. Wer ihn nicht möchte, schaltet ihn dort aus.

### Behoben
- **Design „Weich“: drei Farben des Players und des Handy-Menüs wirkten nicht:** Die Fortschrittsleiste des Players, ihr aktiver Punkt und die aktive Schrift im Handy-Menü bekommen wieder ihre vorgesehene Farbe.
- **Haustier-Kachel: Feld „Tier“ blieb leer, kein Tracker gefunden (#25):** Home Assistant markiert jeden Tracker (Handy, Router, Tractive …) als Diagnose-Entität, und Casora blendete Diagnose-Entitäten in Gerätelisten aus. Tracker erscheinen jetzt wieder im Feld „Tier“, als Vorschlag beim Anlegen, unter „Was soll aufs Dashboard?“, in den Anwesenheits-Feldern der Personen-Badges und bei „Mit KI vervollständigen“. Ein Tipp auf die Handy-Zeile im Personen-Popup öffnet wieder die Geräteseite statt des Verlaufs, und auf der Geräteseite steht der Tracker wieder unter „Gehört dazu“.
- **Studio: Gerätefeld holt seine Liste beim Öffnen neu:** Kommen Geräte erst nach dem Zeichnen des Inspektors (z. B. kurz nach einem Neustart), erscheinen sie ohne die Kachel neu zu wählen; getippter Text wird nicht mehr als Gerät gespeichert.
- **Licht-Popup der Kachel „Beleuchtung“ auf „Zuhause“ hieß wie der Raum der ersten Leuchte (#30):** Ohne Lichtgruppe über alle Leuchten stand im automatisch eingerichteten Dashboard z. B. „Ankleide“ über allen Leuchten des Hauses. Das Popup heißt jetzt „Beleuchtung“, ohne Raum-Etikett, und die Liste „Leuchten“ statt „Leuchten im Raum“ – auch in bestehenden Dashboards. Raum-Kacheln behalten ihren Raum, ein eigener Popup-Titel geht weiter vor.
- **Abfall mit Waste Collection Schedule (#27):** Tonnen heißen ohne den Ort davor („Grüne Tonne“ statt „<Ort> Grüne Tonne“), wenn das Gerät in Home Assistant auf den Ort umbenannt ist. Die Kachel zählt die Tage jetzt auch bei den Standard-Sensoren („on Thu, 12.11.2026“) statt „Keine Daten“ zu zeigen. Ein eingestellter Abfallkalender, den es nicht mehr gibt, wird durch den erkannten ersetzt, und ein nicht erreichbarer Kalender wird nicht mehr bei jedem Zeichnen neu abgefragt. Im Studio fällt eine Tonne ohne Namen beim Speichern nicht mehr weg, und der Schalter „Kalender im Abfall-Popup“ steht zusätzlich in den Popup-Einstellungen der Abfall-Kachel.
- **Haustier-Kachel: Tier im Feld „Tier“ nicht zu finden (#25):** Home Assistant benennt den Tractive-Tracker nach der Hardware („Tracker 1A2B3C4D“, auf Spanisch „Rastreador …“), den Namen des Tiers trägt nur ein zweites Gerät dahinter. Die Suche nach dem Tiernamen ergab deshalb „Keine Treffer“. Das Studio zeigt Tractive-Tracker jetzt mit dem Namen des Tiers – im Feld „Tier“ (darunter der Tracker), beim Anlegen der Kachel, im Kachelnamen und unter „Was soll aufs Dashboard?“ – und die Suche nach dem Tiernamen findet sie.

## 26.10.42 – 20.10.2026

### Behoben
- **Haustier-Kachel zeigte „Gerät fehlt“ (#25):** Eine neue Haustier-Kachel hat ihren Tractive-Tracker nicht selbst gewählt, und das Feld „Tier“ listete alle Tracker (Handys, Router), während Tractive seinen Tracker nur nach dem Tier benennt. Die Kachel findet den Tractive-Tracker jetzt selbst, und das Feld „Tier“ zeigt nur Tractive-Tracker.
- **Klingel: Mithören schaltete sich selbst ab (#23):** Beim Mithören konnte ein kurzer Neuaufbau des Streams den Knopf „Mithören“ nach ein paar Sekunden ausschalten, und ein erneuter Tipp zeigte den Knopf an, aber ohne Ton. Die Karte schaltet jetzt nur noch stumm, wenn der Browser den Ton wirklich verweigert, und erneutes Mithören baut einen Player mit Ton auf.

## 26.10.41 – 19.10.2026

### Neu
- **Haustier-Kachel (Tractive):** Neue Community-Karte aus Kartenwunsch #25. Die Kachel zeigt, wo dein Tier ist, wie weit es von zuhause weg ist und den Akku des Trackers, mit „Live“, solange Live-Tracking läuft. Das Popup zeigt die Karte, Knöpfe für Live-Tracking, Ton und Licht, den Tracker-Zustand, die Aktivität von heute gegen das Tagesziel mit Ruhe und Schlaf und die Orte der letzten Tage. Hinzufügen unter Studio → Community-Karten.

### Behoben
- **Abfallkalender ohne Tonnen-Sensoren (#27):** Liefert Waste Collection Schedule nur einen Kalender, baut Casora die Tonnen jetzt aus dessen Terminen (je Termintitel eine Tonne, Farbe aus der Art oder einem Farbwort wie „Grüne Tonne“). Die Kachel meldet nicht mehr „Keine Tonnen gefunden“, das Popup zeigt die Abholtage.
- **Wetter-Popup zeigte den Taupunkt als Temperatur (#28):** Bei einer Wetterstation, die auch den Taupunkt meldet, konnte der Reiter „Temperatur“ den Taupunkt zeigen. Taupunkt, gefühlte Temperatur, Hitzeindex, Windchill und Tages-Min/Max zählen jetzt nur, wenn es draußen keinen echten Temperatursensor gibt.
- **Fehlende Lampen nach dem Einrichten:** Lampen hinter einem Hub (Hue-Bridge, Zigbee, Matter) wurden beim Einrichten eines Dashboards und im Geräte-Assistenten übersprungen. Jetzt werden sie gefunden. Ein Gerät mit mehreren Lampen (Dimmer mit zwei Kanälen, WLED) bekommt je Lampe eine Kachel, jeweils im Raum ihres eigenen Bereichs, und das Licht von Deckenventilator oder Garagentor wird zusätzlich angeboten. Eine Lampe, deren Strom-Sensor schon in der Energie-Liste des Raums steht, gilt nicht mehr als verwendet. Das Beleuchtungs-Badge zählt jetzt alle zehn Lampen eines Raums statt acht.
- **„Was soll aufs Dashboard?“ im Studio:** Tasten und Schalter von Mähroboter, Kaffeemaschine oder Haustier-Tracker stehen nicht mehr zusätzlich einzeln neben ihrer Karte. Die Liste bricht nicht mehr ab, wenn eine andere Integration ihre Auswahl als Text statt als Liste meldet.

## 26.10.40 – 19.10.2026

### Behoben
- **Nachtfoto ersetzte das Tagfoto:** Im Studio landete „Eigenes hochladen“ beim Raumfoto immer auf dem Platz „Tag“; ein danach hochgeladenes Nachtfoto überschrieb so das Tagfoto. Der Knopf fragt jetzt zuerst „Tag“ oder „Nacht“, und das Foto landet genau dort. Klicken oder Ziehen direkt auf einen Platz funktioniert wie bisher.

## 26.10.39 – 18.10.2026

### Behoben
- **Keine Programmphase bei Home Connect Local** ([#24](https://github.com/SH1FT-W/casora/issues/24)): Waschmaschinen und Trockner über `homeconnect_ws` melden die Phase unter einem eigenen Sensor (`laundry_process_phase` bzw. `dryer_process_phase`). Casora findet ihn jetzt; Popup und Live-Aktivität zeigen jetzt Waschen, Spülen, Schleudern usw.

## 26.10.38 – 18.10.2026

### Behoben
- **Diagramme endeten am verzögerten Mittel:** Verläufe über 7 und 30 Tage (z. B. Bodenfeuchte im Pflanzen-Popup) kommen aus der Langzeitstatistik, die bis zu einer Stunde hinterherhinkt und sechs Stunden mittelt. Frisch gegossen stand oben 77 %, die Linie endete aber bei etwa 49 % und die Skala bei 50. Jetzt endet die Linie am aktuellen Wert, und die Skala passt sich an.

## 26.10.37 – 18.10.2026

### Behoben
- **Live-Aktivitäten, Saugroboter:** Nach der Reinigung kam „Fertig“ zweimal mit Ton und dazwischen „Mopp waschen“, weil der Sauger kurz lädt und danach den Mopp wäscht. Jetzt wartet Casora, bis der Sauger 90 Sekunden in der Station ruht, und meldet genau ein „Fertig“. Mopp waschen, Staub entleeren und Andocken nach „Fertig“ (auch nach einem HA-Neustart) ändern nichts mehr, ein Abdocken ohne Reinigung und unbekannte Zustände (z. B. Trocknen) starten keine Aktivität.
- **Live-Aktivitäten, Geschirrspüler:** „Fertig“ verschwand nach einer Minute, weil Home Connect kurz nach dem Ende auf „Bereit“ springt. Jetzt bleibt es die eingestellte Fertig-Dauer stehen.
- **Live-Aktivitäten, Waschmaschine/Trockner:** Ein kurzer Stromstoß nach dem Ende (z. B. Knitterschutz) löste ein lautes „Läuft“ oder ein zweites „Fertig“ aus. Erst „läuft“ zählt jetzt als neuer Lauf.
- **Live-Aktivitäten, Startzeitvorwahl:** Ohne Startzeit vom Gerät stand dort die Endzeit. Die Startzeit erscheint sofort und wandert nicht mehr mit jeder Aktualisierung nach hinten.
- **Live-Aktivitäten, Programmende während eines HA-Neustarts:** „Fertig“ kommt danach mit Ton statt leise.
- **Live-Aktivitäten, hängende Aktivitäten:** Verschwindet ein Gerät aus Home Assistant, endet seine Aktivität nach 30 Minuten. Ausschalten während einer Sendung kann nicht mehr von der Lauf-Meldung überholt werden.
- **„Fertig“ kam bis zu 10 Minuten zu spät,** weil es auf den Takt der Zwischenstände wartete.
- **Pulse-Popup:** Neue Pulse-Gründe (funkt ohne Werte, Batteriewert fehlt, Cloud antwortet nicht, wartet seit dem Neustart, erreichbar) hatten keinen eigenen Text und standen als „Bald fällig“ da, z. B. ein Lecksensor mit 91 %. Jetzt mit eigenem Text und Symbol; unbekannte Gründe heißen „Beobachten“.

### Geändert
- **Live-Aktivitäten ruhiger:** Fortschritt, Schichten und Routine-Schritte des Druckers (z. B. Filamentwechsel beim Mehrfarbdruck) kommen im Takt statt bei jeder Änderung; Pause, Eingriff, Fehler und Fertig weiter sofort. Mehrere Änderungen eines Geräts in derselben Sekunde ergeben eine Meldung. Weiterlaufen nach einer Pause und der Start nach einer Startzeitvorwahl kommen ohne Ton.
- **Fertig-Dauer jetzt 10 statt 30 Minuten** als Standard. Wer 30 möchte, stellt es unter Einstellungen › Live-Aktivitäten je Gerät ein (auch wer 30 vorher bewusst gewählt hatte, weil der Standard nicht gespeichert wird).

## 26.10.36 – 18.10.2026

### Neu
- **Kaffee-Kachel für Integrationen mit Stromerkennung:** Integrationen, die Getränke am Stromverlauf einer Steckdose erkennen (Status aus/bereit/läuft, letztes Programm, angelernte Programme), werden jetzt erkannt, im Studio und auf der Kachel. Die Kachel zeigt Bereit, Läuft und was fällig ist; das Popup zeigt das letzte Getränk mit Uhrzeit, die Pflege mit Litern und Tagen (Entkalken, Wasserfilter, Brühgruppe), Hinweise zu Wassertank, Bohnen, Trester und Milchsystem sowie die Statistik für heute, gesamt und je Getränk. Der Einschalter geht über das Symbol und das Halten-Menü. Getränke wählt man weiter an der Maschine.

## 26.10.35 – 17.10.2026

### Behoben
- **Kopfschalter bei einer einzelnen Lampe, zweiter Anlauf:** 26.10.34 nahm ihn nur weg, wenn die Lampe über ihre Badge geöffnet wurde. Tippte man im Licht-Popup eines Raums auf eine Lampe, stand oben weiter der Schalter des Raums und schaltete den ganzen Raum. Jetzt hat kein Popup einer einzelnen Lampe mehr einen.

### Geändert
- **Zurück von der Lampe in den Raum:** Eine Lampe, die aus dem Licht-Popup eines Raums geöffnet wurde, hat oben links ‹ und führt zurück in den Raum.

## 26.10.34 – 17.10.2026

### Geändert
- **Licht-Popup einer einzelnen Lampe ohne Kopfschalter:** Der Schalter oben im Kopf schaltete aus einem Raum heraus den ganzen Raum. Bei einer einzelnen Lampe ist er weg, sie schaltet der Ein/Aus-Knopf im Popup. Gruppen und Räume behalten ihn.

## 26.10.33 – 17.10.2026

### Neu
- **Live-Aktivitäten:** Waschmaschine, Trockner, Geschirrspüler, Saugroboter und 3D-Drucker melden sich live auf dem Sperrbildschirm des Handys (iOS Live Activities, Android Live Updates über die Home-Assistant-App): Start, Fortschritt, Restzeit, Pause, Eingriff, Fertig – ohne eigene Automationen. Einschalten unter Studio › Einstellungen › Live-Aktivitäten: Empfänger (HA-App) wählen, Geräte an, Fertig-Dauer, leise Zwischenstände und Takt je Gerät, „Probe senden“ und ein Protokoll „Zuletzt gesendet“. Erkannt werden dieselben Geräte wie bei den Kacheln (Home Connect, WashData, Saugroboter sehr gut getestet; Miele, SmartThings, LG, Whirlpool, Bambu nach Doku). Laufende Aktivitäten überleben einen HA-Neustart, Ausschalten beendet sie sofort.
- **Reolink-Klingel: großes Bild und zweite Kamera:** Ein Knopf oben rechts im Live-Bild öffnet es groß über dem Popup; Mithören und Sprechen laufen dabei ohne Unterbrechung weiter, schließen mit ×, Esc oder Wischen nach unten. Beim Mithören/Sprechen öffnet sich das große Bild auf Wunsch von selbst (Studio-Option, Standard an). Neues Feld „Zweite Kamera“: Dann schaltet ein Umschalter oben links im Bild zwischen Klingel und zweiter Kamera um, Sprechen geht nur über die Klingel (#23).
- **Live-Aktivitäten: Farbe je Gerät** wählbar (Automatisch oder Casora-Palette). Fertig, Pause und Eingriff behalten ihre Signalfarben.

### Geändert
- **Casora Glas deutlich glasiger:** Inaktive Kacheln, Badges, Leisten und Menüs lassen das Raumfoto jetzt viel stärker durchscheinen (hell 50 %, dunkel 32 % Deckkraft statt ~60 %), mit kräftigerem Weichzeichner, feiner Lichtkante und einem Hauch Glanz. Aktive Kacheln bleiben deckend und damit gut lesbar, die Zustandsschrift ist eine Spur kräftiger. Casora und Casora Nebel sind unverändert.
- **Klima-Popup:** Öffnest du es vom Luftfeuchtigkeits-Badge aus, startet das Diagramm mit der Luftfeuchtigkeit statt immer mit der Temperatur. Umschalten geht wie bisher.
- **Studio-Auswahlfelder** klappen bei einem zweiten Klick aufs Feld wieder zu (vorher nur über eine Auswahl oder einen Klick daneben).
- **Popups flackern nicht mehr:** Bereiche wie „Verlauf“ (z. B. Pulse › Gerät) wurden bei jeder Attributänderung neu aufgebaut und blitzten kurz leer auf. Jetzt aktualisiert sich jeder Bereich für sich. Dazu zählen „Änderungen“ und „Verlauf“ auf Messwert-Seiten einen gerade erfolgten Wechsel nach wenigen Sekunden mit.

## 26.10.32 – 17.10.2026

### Behoben
- **„JSTemplate error“ auf Kamera-Kacheln:** Meldet Home Assistant ein unübliches Sprachkürzel (z. B. mit Unterstrich), brachen die Uhrzeiten der Klingel- und Frigate-Kachel mit einem Fehler ab und button-card zeigte „JSTemplate error“. Casora nutzt jetzt immer ein gültiges Sprachkürzel – das sichert alle Zeit- und Zahlenformate ab.
- **Reolink-Türklingel:** Die Tag/Nacht-Auswahl im Popup fehlte bei echten Klingeln (Reolink nennt den Schlüssel `day_night_mode`).
- **Fremde Skripte mit gleichem Namen:** Setzte ein eigenes Skript `window._casoraKlingel` (oder `_casoraFrigate`, `_casoraCoffee`) nur als Marker, lud Casoras Modul nicht und die Kachel zeigte „JSTemplate error“. Jetzt zählt nur das echte Modul.

## 26.10.31 – 16.10.2026

**Neue Versionsnummern:** Casora zählt ab jetzt Jahr.Monat.Nummer – 26.10.31 ist das 31. Release im Oktober 2026. Der Sprung von 1.6.0 ist gewollt; HACS und das Casora-Update erkennen die neue Version ganz normal.

### Neu
- **Frigate-Kamera:** Live-Kamera mit dem, was Frigate zuletzt erkannt hat. Im Popup Live-Bild, Alarme und Erkennungen mit Clip, Herunterladen, Teilen und Favorit, Filter, die Aufnahmen der letzten Tage mit Zeitleiste, Objekte und die Schalter der Kamera. Auf Wunsch zeigt die Kachel das stumme Live-Bild.
- **Reolink-Türklingel:** Live-Bild, das sagt, wann jemand geklingelt hat. Im Popup Mithören, Schnellantworten, Sirene, wer zuletzt geklingelt hat (Zeitleiste) und die Einstellungen der Klingel. „Sprechen“ gibt es als Versuch im Studio – viele Reolink-Klingeln nehmen es nicht an.
- **Kaffeevollautomat:** Bereit, heizt auf oder bezieht mit Fortschritt – und was die Maschine braucht (Wasser, Bohnen, Schale, Entkalken). Im Popup Getränke mit Stärke und Menge starten, Pflege und wie viele Kaffees du gemacht hast. Für Home Connect, Miele, De'Longhi, Jura, Melitta, La Marzocco oder eine Steckdose.
- **Casora Glas:** Ein drittes Design – Casora mit Milchglas über den Raumfotos, hell und dunkel, auch in der Studio-Vorschau. Im Leistungsmodus werden die Glasflächen deckend.

### Geändert
- **Hemma-Designs entfernt:** „Hemma 1“ und „Hemma 2“ gibt es nicht mehr. Wer sie als Standard- oder Profil-Design hatte, wird einmal auf Casora Glas umgestellt und bekommt dazu einen Hinweis.
- **Desktop und Handy angleichen:** Das Fenster zeigt eine Zeile je Sache („Unter-Badge 5 · …“ statt drei Einzelzeilen), sagt „Nur am Handy“ bzw. „Nur am Desktop“, ist vollständig übersetzt, und der Knopf heißt „Auf beiden übernehmen“, wenn nur eine Seite etwas hat.
- **Studio-Vorschau:** Die Raumleiste in der Tablet- und Desktop-Vorschau ist so breit wie im Dashboard und endet vor der Medien-Welle.
- **Hemma entfernen** räumt auch die alten YAML-Dashboards und -Vorlagen einer Hemma-Installation ohne HACS weg (dashboards/hemma, dashboards/templates; mit Sicherung, nur wenn keine YAML-Konfiguration sie noch nennt).
- **Pulse-Verlauf:** Zustände mit Farbe und Höhe, Legende ab drei Zuständen.

### Behoben
- **Hemma entfernen bot sich endlos an,** wenn eine Automation noch in www/hemma schreibt. Ein solcher Ordner zählt nicht mehr als Rest. Bleibt www/hemma, nennt der Dialog jetzt den richtigen Grund (z. B. abweichende Dateien) statt „Ein Dashboard nutzt sie noch“.
- **Casora-KI blieb passiv,** wenn alte eigene KI-Pakete gelöscht waren, aber ihre Einträge noch in der Entitätenliste standen. Jetzt zählen nur Sensoren, die noch geliefert werden.
- **Fußbodenheizung:** Aus dem Gruppen-Popup geöffnete Raum- und Heizkörper-Popups haben wieder den ‹ Zurück-Pfeil.
- **Übersetzung:** In Person-, Mäher-, Update-, Ziel- und weiteren Popups blieben einzelne Texte unübersetzt.
- **Popup-Zeilen:** Ein Bestätigen-Knopf in einer Zeile schiebt den Titel nicht mehr weg.

## 1.6.0 – 16.10.2026

### Neu
- **Halten-Schnellmenü:** Lange drücken auf eine Kachel öffnet ein kleines Menü direkt an der Kachel (am Handy als Blatt von unten). Oben die Hauptaktion (Ausschalten, Entriegeln, Pausieren …), darunter Schnellbedienung je Gerät: Helligkeit und Lichtfarbe, Jalousie Auf/Stopp/Zu und Position, Temperatur −/+, Lautstärke und Titel, Zielfeuchte, Lüfterstufe. Bei Info-Kacheln steht oben „Öffnen“, dazu passende Einträge wie „Nach Updates suchen“, „Energie-Dashboard“, „Auf die Einkaufsliste“, „Nachricht schicken“ oder „Ausgeräumt“. Waschmaschine, Trockner, Spüler und 3D-Drucker zeigen „Fertig um … · noch …“. Verlauf, Gerät und „Kachel bearbeiten“ (springt im Studio zur Kachel) stehen darunter. Am Desktop öffnet auch ein Rechtsklick das Menü, per Tastatur Umschalt+F10 bzw. die Kontextmenü-Taste.
- **Zeitschalter:** „Ausschalten in“ bzw. „Einschalten für“ 15 Min., 30 Min., 1 Std. oder 2 Std. für Licht, Schalter, Lüfter, Luftreiniger, Befeuchter, Heizung und Medien. Läuft ein Zeitschalter, zeigt die Kachel oben rechts einen Kreis mit Uhr, der sich leert. Er überlebt Neustarts und verfällt, wenn man vorher selbst schaltet. Für Automationen: Dienste `casora.set_timer` / `casora.cancel_timer`, Sensor `sensor.casora_timers` und das Ereignis `casora_timer_finished`.
- **Halten einstellbar:** Im Studio unter Bedienung › Kacheln „Halten auf Kacheln“: Schnellmenü, Popup öffnen oder Home-Assistant-Dialog, für das ganze Dashboard und je Kachel.
- **Energie-Popup je Sub-Badge:** Ein Tipp auf Solar, Akku, Haus oder Netz im Energie-Badge öffnet ein eigenes Popup mit Verlauf und passender Steuerung. Casora erkennt die Art selbst; im Studio lässt sie sich unter „Popup-Art“ festlegen.

### Geändert
- **Sicherheit beim Schalten:** Entriegeln, „Tür öffnen“ und Alarm fragen im Schnellmenü immer nach; Codes werden verdeckt abgefragt. Beim Scharfschalten steht die Fenster-Warnung im selben Dialog.
- **Fußball:** Im Popup steht der Wettbewerb (z. B. „Live · Europa League“), auch wenn Team Tracker alle Wettbewerbe verfolgt.
- **UIX-Prüfung:** Das Studio sagt genau, was fehlt, UIX herunterladen, hinzufügen oder HA neu starten, und warnt, wenn card-mod zusätzlich installiert ist.

### Behoben
- **Handy-Filter:** Hatten zwei Räume denselben Schlüssel (z. B. „Home“), meldete jedes Speichern „Duplicated options“. Jetzt nicht mehr.
- **Aquarium:** Mit eingetragenem Erreichbar-Sensor zeigt die Kachel bei kurzen Bluetooth-Aussetzern nicht mehr „Licht offline“.
- **Rückfragen:** Der Bestätigen-Dialog hat einen Namen für Screenreader, hält den Tastaturfokus und gibt ihn danach zurück.

## 1.5.5 – 15.10.2026

### Geändert
- **Warnungen statt NINA:** Warn-Kachel und Warn-Popup heißen jetzt allgemein „Warnungen“ („Aktuell keine Warnungen“, einzelne Warnung ohne Titel: „Amtliche Warnung“), die Glocke zeigt „Amtliche Warnung“. Die Warnungen können aus NINA, vom DWD oder aus einer Integration kommen, die beides bündelt.
- **Warngebiet:** Bringt ein Warn-Sensor das Attribut `region` mit, steht das Gebiet im Popup („Aktuell keine Warnungen für …“). Bei NINA-Sensoren kommt es wie bisher aus dem Namen.

### Behoben
- **Löschen im Studio:** Ein schneller Doppelklick auf „Löschen“ entfernte zwei Kacheln, bei Sammelkacheln zwei Geräte. Jetzt verschwindet nur das gewählte.
- **Speichern im Studio:** Wer während des Speicherns weiter änderte oder gleich das Dashboard wechselte, konnte Änderungen verlieren, ohne dass „ungespeichert“ stehen blieb. Eigene Kachelarten landeten beim Speichern auch im zuletzt geöffneten anderen Dashboard. Beides passiert nicht mehr.
- **Geräte-Felder leeren:** Ein einmal gewähltes Gerät in einem optionalen Feld (etwa Licht, Lecksensor oder Akku beim Aquarium) ließ sich im Studio nicht mehr entfernen. Jetzt leert ein „ד rechts im Feld die Auswahl.
- **Unterbrochener Umzug:** „Aufräumen“ und „Umzug fortsetzen“ konnten ein fertiges Dashboard mit derselben Adresse löschen. Jetzt entfernen sie nur Dashboards, die wirklich halb fertig sind.
- **Hemma entfernen:** Eigene Skripte und versteckte Dateien in www/hemma wurden mitgelöscht, ebenso Ordner, die noch ein YAML-Dashboard oder eine Automation brauchte. Jetzt bleibt www/hemma in diesen Fällen stehen, und der Dialog nennt die Dateien, die es halten.
- **Zeitreise:** Ließ sich ein gewählter Stand nicht lesen, stellte „Diesen Stand wiederherstellen“ den vorher gezeigten wieder her. Jetzt verschwindet der Knopf in diesem Fall.
- **Schloss offline:** Kopfzeile und Schalter zeigten „Entriegelt“, und Tippen versuchte zu entriegeln. Jetzt steht dort „Offline“, Tippen tut nichts. „Akku NaN %“ erscheint nicht mehr.
- **Lecksensor und Gerätetür:** Bei unbekanntem Zustand standen „Trocken“ bzw. „Geschlossen“ da. Jetzt steht „Offline“ bzw. entfällt die Zeile.
- **Pulse:** War das einzige Problem eine schwache Batterie, zählte die Kachel „1 Problem“, das Popup zeigte aber keine Zeile. Jetzt steht das Gerät unter „Batterie“. Nach dem Neuladen steht die Kachel auch gleich vorne bei den aktiven.
- **Aktive Kacheln vorne:** Kacheln, deren Zustand Casoras Module auswerten (Pulse, Geräte), standen nach dem Neuladen einige Sekunden hinten. Jetzt rücken sie sofort nach vorn.
- **Popups schnell nacheinander:** Wer ein Popup schloss und sofort ein anderes antippte, bekam keins. Jetzt öffnet es.
- **Kalender:** Bei langen Einträgen lief die Unterzeile über den Rand. Jetzt endet sie wie der Titel mit „…“.
- **Hover auf aktiven Kacheln:** Abfall, 3D-Drucker, Aquarium-Licht und Schalter wurden beim Darüberfahren heller als die übrigen aktiven Kacheln. Jetzt verhalten sie sich gleich.
- **Wartungsdatum und Diagramme:** In Zeitzonen westlich von UTC stand beim Fahrzeug ein Tag zu früh. Diagramm-Beschriftungen liegen auch über die Zeitumstellung auf vollen Stunden.
- **Englisch:** „Wird verriegelt …“, „Öffnet sich …“ und weitere Texte blieben auf englischen Dashboards deutsch.
- **Speicher:** Das Studio und mehrere Dashboard-Teile hielten nach dem Verlassen Speicher fest, am Handy wurde Casora mit der Zeit träger. Die Glocke sucht auf Seiten ohne Glocke nicht mehr alle 2 Sekunden.
- **Lüften-Hinweis:** Kam ein Hinweis innerhalb von 30 Minuten zurück, blieb er danach stumm, auch der CO₂-Alarm. Jetzt meldet er sich nach 30 Minuten wieder.
- **Eigene KI-Zeiten:** Eine Zeit mit Tabulator brachte die Optionen zum Absturz. Jetzt wird sie gespeichert wie jede andere.
- **Weitere Korrekturen:** Ausgemusterte Vorlagen werden beim Speichern entfernt, Rezept und Update-Analyse hängen ohne KI nicht mehr, Update-Hinweise kommen nicht doppelt, Zisternen und Heizöltanks gelten nicht mehr als Auto, die Liste „benutzt von“ der Raum-Symbole zeigt Titel und steht nur Admins offen.

## 1.5.4 – 15.10.2026

### Behoben
- **Löschen im Studio:** Ein schneller Doppelklick auf „Löschen“ entfernte zwei Kacheln, bei Sammelkacheln zwei Geräte. Jetzt verschwindet nur das gewählte.
- **Speichern im Studio:** Wer während des Speicherns weiter änderte oder gleich das Dashboard wechselte, konnte Änderungen verlieren, ohne dass „ungespeichert“ stehen blieb. Eigene Kachelarten landeten beim Speichern auch im zuletzt geöffneten anderen Dashboard. Beides passiert nicht mehr.
- **Geräte-Felder leeren:** Ein einmal gewähltes Gerät in einem optionalen Feld (etwa Licht, Lecksensor oder Akku beim Aquarium) ließ sich im Studio nicht mehr entfernen. Jetzt leert ein „ד rechts im Feld die Auswahl.
- **Unterbrochener Umzug:** „Aufräumen“ und „Umzug fortsetzen“ konnten ein fertiges Dashboard mit derselben Adresse löschen. Jetzt entfernen sie nur Dashboards, die wirklich halb fertig sind.
- **Hemma entfernen:** Eigene Skripte und versteckte Dateien in www/hemma wurden mitgelöscht, ebenso Ordner, die noch ein YAML-Dashboard oder eine Automation brauchte. Jetzt bleibt www/hemma in diesen Fällen stehen, und der Dialog nennt die Dateien, die es halten.
- **Zeitreise:** Ließ sich ein gewählter Stand nicht lesen, stellte „Diesen Stand wiederherstellen“ den vorher gezeigten wieder her. Jetzt verschwindet der Knopf in diesem Fall.
- **Schloss offline:** Kopfzeile und Schalter zeigten „Entriegelt“, und Tippen versuchte zu entriegeln. Jetzt steht dort „Offline“, Tippen tut nichts. „Akku NaN %“ erscheint nicht mehr.
- **Lecksensor und Gerätetür:** Bei unbekanntem Zustand standen „Trocken“ bzw. „Geschlossen“ da. Jetzt steht „Offline“ bzw. entfällt die Zeile.
- **Pulse:** War das einzige Problem eine schwache Batterie, zählte die Kachel „1 Problem“, das Popup zeigte aber keine Zeile. Jetzt steht das Gerät unter „Batterie“. Nach dem Neuladen steht die Kachel auch gleich vorne bei den aktiven.
- **Aktive Kacheln vorne:** Kacheln, deren Zustand Casoras Module auswerten (Pulse, Geräte), standen nach dem Neuladen einige Sekunden hinten. Jetzt rücken sie sofort nach vorn.
- **Popups schnell nacheinander:** Wer ein Popup schloss und sofort ein anderes antippte, bekam keins. Jetzt öffnet es.
- **Kalender:** Bei langen Einträgen lief die Unterzeile über den Rand. Jetzt endet sie wie der Titel mit „…“.
- **Hover auf aktiven Kacheln:** Abfall, 3D-Drucker, Aquarium-Licht und Schalter wurden beim Darüberfahren heller als die übrigen aktiven Kacheln. Jetzt verhalten sie sich gleich.
- **Wartungsdatum und Diagramme:** In Zeitzonen westlich von UTC stand beim Fahrzeug ein Tag zu früh. Diagramm-Beschriftungen liegen auch über die Zeitumstellung auf vollen Stunden.
- **Englisch:** „Wird verriegelt …“, „Öffnet sich …“ und weitere Texte blieben auf englischen Dashboards deutsch.
- **Speicher:** Das Studio und mehrere Dashboard-Teile hielten nach dem Verlassen Speicher fest, am Handy wurde Casora mit der Zeit träger. Die Glocke sucht auf Seiten ohne Glocke nicht mehr alle 2 Sekunden.
- **Lüften-Hinweis:** Kam ein Hinweis innerhalb von 30 Minuten zurück, blieb er danach stumm, auch der CO₂-Alarm. Jetzt meldet er sich nach 30 Minuten wieder.
- **Eigene KI-Zeiten:** Eine Zeit mit Tabulator brachte die Optionen zum Absturz. Jetzt wird sie gespeichert wie jede andere.
- **Weitere Korrekturen:** Ausgemusterte Vorlagen werden beim Speichern entfernt, Rezept und Update-Analyse hängen ohne KI nicht mehr, Update-Hinweise kommen nicht doppelt, Zisternen und Heizöltanks gelten nicht mehr als Auto, die Liste „benutzt von“ der Raum-Symbole zeigt Titel und steht nur Admins offen.

## 1.5.3 – 14.10.2026

### Verbessert
- **Spürbares Feedback am Handy:** Knöpfe, Plus/Minus, Regler, Rückfragen, Raum-Tabs, die Glocke und das Schließen von Popups geben am Handy eine kurze Vibration. Halten auf einer Kachel fühlt sich etwas kräftiger an als Tippen.
- **Glocke „Alle entfernen“ rückgängig machen:** Nach „Alle entfernen“ steht 10 Sekunden lang „Rückgängig“ im Hinweis. Damit kommen alle Benachrichtigungen zurück.

### Behoben
- **Updates am Handy installieren:** Auf der Update-Seite reagierten „Installieren“ und „Vorher sichern“ am Handy nicht auf einen Fingertipp, nur „Überspringen“ ging. Jetzt reagieren beide.
- **Sammelkacheln im Studio ([#21](https://github.com/SH1FT-W/casora/issues/21)):** In Kacheln mit mehreren Geräten (Jalousien, Schlösser, Batterien) tat „Löschen“ nach dem „−“ an einer Zeile nichts. Jetzt wird das Gerät entfernt.
- **Tanken:** Beim Neuladen der Integration schrieb Home Assistant „Unable to remove unknown job listener“ ins Log. Die Meldung kommt nicht mehr.

## 1.5.2 – 14.10.2026

### Behoben
- **„Weitere Einstellungen“ bei Lampen und Rollos:** Die Zeile im Popup einer einzelnen Lampe tat nichts. Jetzt öffnet sie die Geräteseite wie bei den übrigen Geräten.
- **Tank-Logos:** Die Markenlogos sehen aus wie die Logos im Update-Popup: Form der übrigen Symbole, quadratische Logos füllen die ganze Fläche, kein feiner Rand. Vorher lag ein rundes Logo auf dem abgerundeten Quadrat, und dessen Ecken schauten hervor.

## 1.5.1 – 14.10.2026

### Behoben
- **Zurück in der Schloss- und Tanken-Ansicht:** Der ‹ Zurück-Knopf liegt nicht mehr über dem Symbol. Wie auf allen Casora-Seiten steht er jetzt vor Symbol und Titel.
- **3D-Drucker auf Englisch:** Das Popup zeigte „1:36 Std. übrig · Schicht 124/295“ auf Deutsch. Jetzt steht dort „1:36 h left · Layer 124/295“.

## 1.5.0 – 14.10.2026

### Neu
- **Community:** Ein neuer Knopf in der Kopfzeile des Studios öffnet die Community. Dort wünschst du dir Karten, die dir fehlen („Kartenwunsch einreichen …“). Casora füllt den Wunsch für GitHub vor, mit den Angaben zu deinen Geräten, aber ohne Namen und Orte, und zeigt dir vorher genau den Text, der öffentlich wird. Unter „Deine Kartenwünsche“ siehst du den Stand: Offen, Rückfrage (mit der Antwort), In Arbeit, Gebaut oder Abgelehnt. Mit dem × nimmst du einen Wunsch wieder aus der Liste.
- **Community-Karten:** Karten, die aus Wünschen gebaut wurden, kommen mit Casora mit, stehen aber erst in „Kachel hinzufügen“, wenn du sie in der Community hinzufügst. So bleibt die Kachelauswahl kurz. Jede Karte hat ein Vorschaubild; antippen zeigt Kachel und Popup groß. Beim Entfernen fragt Casora, ob vorhandene Kacheln bleiben oder mit entfernt werden. Die Auswahl gilt für die ganze Installation. Läuft eine Karte einmal aus, verschwindet sie zuerst aus „Kachel hinzufügen“, vorhandene Kacheln laufen weiter.
- **Mähroboter:** Die erste Community-Karte. Die Kachel zeigt, was der Mäher gerade tut („Mäht“, „Parkt bis zum nächsten Zeitplan“, „Steckt fest“), oben rechts den Akku als Kreis mit Pause. Das Symbol schickt ihn mähen oder zur Station. Das Popup hat Tasten für Zur Station, Mähen/Pause und Parken, den Status (Akku, Verbindung, Betriebsstunden, Fehler) und den Verlauf der letzten 7 Tage mit Mähdauer je Fahrt. Funktioniert mit jedem Mähroboter in Home Assistant, mit Gardena zeigt die Karte zusätzlich die genaue Tätigkeit und übersetzte Fehler.
- **Größe am Handy „Automatisch“:** Kacheln werden am Handy groß, solange gerade etwas los ist (etwa Waschmaschine oder Saugroboter laufen, Warnung, Alarm), und wieder klein, wenn nicht. Im Studio stellt „Alle Kacheln auf Automatisch“ das für ein Dashboard auf einmal um.
- **Casora-Seiten statt Home-Assistant-Dialog:** Was bisher den Dialog von Home Assistant öffnete, öffnet jetzt eine Casora-Seite mit ‹ zurück dorthin, wo du herkamst. Ein Messwert (Temperatur, Leistung …) zeigt sein Diagramm über 24 Std., 7 Tage oder 30 Tage, Höchst-, Tiefst- und Durchschnittswert und den Verlauf. Ein Tür- oder Fensterkontakt zeigt, wann er offen war. Ein Gerät öffnet sein Casora-Popup, alles andere eine Geräteseite mit den Gerätedaten, was dazugehört, und „In Home Assistant öffnen“ für den Rest. Halten auf einer Kachel und Tippen auf ein Badge laufen genauso.
- **Update-Details:** Ein Tipp auf ein Update im Update-Popup öffnet seine Seite mit den Versionshinweisen, mit ‹ zurück zur Liste.
- **Kamera im Vollbild:** Halten auf eine Kamera im Kamera-Popup zeigt das Live-Bild groß, mit ‹ zurück.
- **Luftbefeuchter:** Die Kachel öffnet ein eigenes Popup wie beim Luftreiniger: Zustand und Ziel, Verlauf der Luftfeuchte, An/Aus, Modus und Zielfeuchte, dazu der Status mit Wassertank und Leistung.
- **Studio:** Räume starten mit zugeklappten Abschnitten, damit man schneller findet, was man sucht.

### Behoben
- **Pause im Kreis:** Pause und Weiter im Kreis oben rechts (Saugroboter, Medien) taten nichts. Der Klick erreichte den Dienst nie. Pausiert bleibt der Kreis jetzt stehen und zeigt Play, vorher verschwand er.
- **Pause im Kreis (Optik):** Play und Pause im Kreis sind weicher und kräftiger, und auch der Kreis des 3D-Druckers reagiert.
- **Personen-Popup:** „Ganzer Verlauf“ öffnet wieder den Verlauf von Home Assistant. Die Karte zeigt nur noch Person und Zonen, ohne die blauen Wegelinien. Ein Tipp auf den Marker der Karte öffnet nicht mehr dasselbe Popup ein zweites Mal.
- **Thermostat:** − und + reagieren flüssig. Mehrere Tipps werden gesammelt und als eine Änderung geschickt.
- **Karussell:** Seitennamen stehen im Studio in einem sichtbaren Eingabefeld.
- **Update-Logos:** Erscheinen in allen Listen des Update-Popups, auch bei System, Zuletzt aktualisiert, Neustart und Übersprungen.
- **Licht-Popup:** Die Raum-Pillen oben erscheinen zusammen mit den Räumen, und der Inhalt springt kurz nach dem Öffnen nicht mehr nach unten.
- **Rezept-Popup:** Der Schatten des heutigen Tags im Speiseplan wird nicht mehr abgeschnitten.
- **Studio:** Rückgängig bleibt lesbar, auch wenn es nichts zurückzunehmen gibt, und die Knöpfe in der Änderungsliste bleiben beim Zurücknehmen stehen.

### Entfernt
- **Karten-Updates:** Vorlagen kommen nur noch mit einem Casora-Release, nicht mehr als eigenes Karten-Update.

## 1.4.2 – 13.10.2026

### Behoben
- **Icon antippen:** Das Symbol einer Kachel folgt jetzt einer Regel. Gibt es etwas zu schalten, schaltet es: Licht an/aus, Jalousie auf/zu, Schloss auf/zu, Saugroboter saugen/zurück, Steckdose, Lüfter. Sonst öffnet es dasselbe Casora-Popup wie die Kachel. Vorher öffneten Kamera, Energie, Updates, Wetterwarnung, Bewegung, Person, Pflanze, Kontakte und Szenen über das Symbol den Dialog von Home Assistant, und Jalousie-Gruppen mit Popup fuhren nicht mehr.
- **Medien:** Das Symbol ist Play/Pause. Ist das Gerät aus, schaltet es ein. Kann das Gerät beides nicht, öffnet es das Popup.
- **Personen-Popup:** „Zuletzt“ heißt jetzt „Verlauf“ und zeigt die Orte der letzten drei Tage als Zeitleiste wie im Schloss-Popup: Uhrzeit, Punkt in der Farbe des Orts, bis wann und wie lange. „Ganzer Verlauf“ öffnet den Verlauf von Home Assistant.
- **Pulse-Kachel:** Die Statuszeile trennt Batterien, die bald fällig sind, von Geräten, die Pulse nur beobachtet („1 Batterie bald fällig · 2 beobachten“).
- **Begrüßung:** „Guten Abend, Alex“ steht beim Laden der Startseite sofort an seinem Platz. Vorher tauchte die Begrüßung rechts auf und sprang dann nach links.
- **Wiedergabe (Welle):** Der Player unter der Medien-Welle ist schlanker: ohne Lautstärke-Regler und ohne Zeitangaben, der Fortschrittsbalken bleibt. Lautstärke gibt es weiter im Medien-Popup.
- **Glocke:** Ist das Mitteilungsfenster nach oben aufgeklappt, bleibt seine Unterkante beim Entfernen einer Meldung stehen, statt zu springen.
- **Studio am Handy:** Eine Auswahl, die aus einem Dialog heraus geöffnet wird, liegt über dem Dialog statt dahinter.

## 1.4.1 – 13.10.2026

### Behoben
- **Kachel-Status:** Ein langer Status macht die Schrift nicht mehr so klein, dass man ihn kaum lesen kann. Die Schrift bleibt gleich groß; passt der Text nicht, zeigt die Kachel den ersten Teil und zählt den Rest („Trocknung endet +1“), alles steht im Popup. Das gilt für alle Kacheln, am Desktop und am Handy.
- **Warn-Kachel:** NINA-Warnungen, die nicht vom Wetterdienst kommen, behalten ihre Schreibweise und verlieren die Vorsilbe „Gefahreninformation:“ („Hochwasser an der Ems“ statt „Hochwasser An Der Ems“). Bei mehreren Warnungen zählt die Kachel die übrigen mit.
- **Tanken:** Autos, die ihren Tank in Litern statt in Prozent melden (etwa Volvo, „Kraftstoffmenge“), erscheinen unter „Kraftstoff je Auto“. Vorher meldete Casora, es gebe kein Auto mit Tankfüllstand. Das Auto-Popup zeigt bei diesen Autos den Tankinhalt in Litern.
- **Saugroboter:** Fehler der Station sind übersetzt (zum Beispiel „Schmutzwassertank voll“ statt „waste water tank full“).
- **Glocke:** Das Mitteilungsfenster ist immer gleich breit (360 px, am Handy bis zum Bildschirmrand). Vorher war es bei kurzen Meldungen schmal und die beiden Knöpfe unten gedrängt. Die Überschrift „Neu“ hat oben denselben Abstand zum Rand wie die Zeilen zur Seite.
- **Update-Logos:** Die Markenlogos im Update-Popup haben dieselbe Form wie die übrigen Symbole und füllen sie aus, statt rund in einem abgerundeten Quadrat zu sitzen. Im Dunkeln gibt es keinen hellen Rand mehr, Updates ohne Logo bekommen ein neutrales Symbol.
- **Personen-Popup:** „seit …“ im Kopf zeigt, wie lange die Person wirklich an dem Ort ist. Nach einem Neustart von Home Assistant zählte es ab dem Neustart.
- **Personen-Popup:** „Standort jetzt holen“, „Nachricht schicken“ und „Klingeln lassen“ erscheinen auch, wenn der Name des Handys einen Apostroph hat (etwa „Alex's iPhone“). Casora suchte den falschen Benachrichtigungsdienst und blendete die Aktionen aus.

## 1.4.0 – 13.10.2026

### Neu
- **Begrüßung auf der Startseite:** Im Studio (Startseite › Darstellung › Titel) wird aus dem Raumnamen auf Wunsch „Guten Morgen“, „Guten Tag“ oder „Guten Abend“, wahlweise mit den Vornamen der Anwesenden oder des angemeldeten Benutzers. Eine lange Begrüßung wird kleiner und bleibt in einer Zeile, am Desktop und am Handy.
- **Personen-Popup:** Ein Tipp auf eine Personen-Kachel, ein Personen-Badge oder die Meldung einer Person in der Glocke öffnet Casoras eigenes Popup statt des Kartendialogs von Home Assistant. Oben die Karte von Home Assistant mit Zonen und dem Weg der letzten 24 Stunden, darunter das Handy (Akku, Verbindung), „Nach Hause“ mit Entfernung und Richtung und die Orte der letzten drei Tage. Mit der Companion-App: Standort jetzt holen, Nachricht schicken, Handy klingeln lassen (auch wenn es leise gestellt ist).
- **Glocke aufräumen:** Am Handy eine Meldung nach links wischen, um sie zu entfernen, am Desktop über das × beim Darüberfahren. „Alle entfernen“ leert die Glocke nach einer kurzen Rückfrage. Eine entfernte Meldung kommt erst wieder, wenn sich etwas ändert, und bleibt auf allen Geräten desselben Home-Assistant-Benutzers weg.
- **Karussell im Studio:** „Karussell“ ist jetzt eine Kachelart. Seiten hinzufügen, umsortieren oder entfernen, automatisch weiterblättern, immer vorne. Vorhandene Kacheln lassen sich über ihr ⋯-Menü zu einem Karussell zusammenfassen, ein Karussell lässt sich wieder in einzelne Kacheln auflösen. Neue Karussells und geänderte Seiten gehen auch ins Handy-Layout.
- **Bedingungen mit Zustandsauswahl:** Nach der Wahl der Entität bietet die Bedingung nur die Zustände an, die sie haben kann (Wiedergabe, Pausiert, Offen, die Optionen einer Auswahl …). Zahlen bekommen ein Zahlenfeld mit Einheit. „Eigener Wert …“ bleibt als Ausweg. Text-Sensoren ohne Liste (Vorlagen-Sensoren, Team Tracker) bieten die Zustände aus ihrem Verlauf an, und „Mehrere …“ wählt mehrere Zustände auf einmal.

### Behoben
- **Glocke:** Ein Tipp auf eine Meldung öffnet ihr Popup ohne Wartezeit. Vorher lud Casora bei jedem Tipp die ganze Dashboard-Konfiguration (mehrere MB) neu.
- **Pulse-Kachel:** Ist ein Gerät nur bald fällig (etwa eine Batterie bei 18 %) und sonst nichts kaputt, steht auf der Kachel „1 bald fällig“ statt „Alles ok“, und sie ist gelb hinterlegt.

## 1.3.3 – 12.10.2026

### Behoben
- **Gruppen-Popups:** Ein Tipp auf eine einzelne Lampe oder Jalousie in der Beleuchtungs- oder Jalousien-Gruppe öffnet Casoras Popup des Geräts statt des Dialogs von Home Assistant.
- **Abfall-Kachel:** Am Tag vor der Abholung steht das Symbol wie am Abholtag auf dem vollen Kreis in der Farbe der Tonne. Vorher war das helle Symbol auf der aktiven Kachel kaum zu sehen (#19).
- **Große Kacheln am Handy:** Der Name fluchtet wieder mit der kleinen Kachel daneben. Seit der größeren Schrift in 1.3.2 stand er 2 px zu hoch.
- **Kleine Android-Tablets quer:** Auf Tablets wie dem Galaxy Tab A9 (im Browser 1006×600) lagen die Kacheln unterhalb des Bildschirms. Casora behandelt sie jetzt wie ein kleines iPad: kompakter Kopf, Kachelreihe unten. Handys und iPads bleiben, wie sie sind.
- **Tank-Logos:** Quadratische Marken-Logos (JET, star, bft, Westfalen, Hoyer, BayWa) füllen den ganzen Kreis, statt mit Rand darin zu stehen.
- **Energie:** Nachts bei leerem Akku meldet die Anker Solarbank Code 40 (Ruhemodus). Casora zeigt das nicht mehr als Fehler.

## 1.3.2 – 11.10.2026

### Behoben
- **Warn-Popup:** Es zeigt nicht mehr „Noch kein Gerät zugeordnet“, weder bei einer Warn-Kachel mit nur einer Entität noch wenn gerade keine Warnung besteht.
- **Glocke und Sprechblase:** Auf Desktop und Tablet hellen beide Kreise beim Darüberfahren mit der Maus wieder auf.
- **Große Kacheln am Handy:** Name und Status fluchten mit der kleinen Kachel daneben.
- **Startseite am Handy:** Der Abstand vom Player bis „Favoriten“ ist so klein wie der über „Aktuelle Wiedergabe“.
- **Handy-Kopf:** Nach einem Neustart von Home Assistant oder mit leerem Cache stand der Seitenkopf am Handy zu tief, wenn kiosk-mode installiert ist. Casora blendet die Kopfzeile von Home Assistant jetzt auch dann selbst aus und lässt keinen Platz frei.
- **Jalousie-Popup:** Das Symbol im Kopf folgt der Position sofort.
- **Updates-Popup:** Nach „Jetzt nach Updates suchen“ erscheinen neue Einträge sofort, ohne das Popup neu zu öffnen.
- **Pulse-Popup:** „Alles ok“ nutzt auf Desktop und Tablet beide Spalten.
- **Glocke am Handy:** Das Fenster öffnet mittig über der Leiste, der Hintergrund wird unscharf wie bei Räumen und Szenen, und die Glocke ist aktiv markiert.
- **Glocke und Assist am Handy:** Ein Tipp vibriert wie bei den übrigen Tasten der Leiste.
- **Studio, Größe am Handy bei Sammelkarten:** Klein oder groß an einer Sammelkarte (automatische Liste, Karussell, Stapel) gilt jetzt auch für jede Kachel darin. Pflanzen aus dem Umzug blieben vorher groß.

### Geändert
- **Kacheln am Handy:** Name und Zustand sind eine Stufe größer (15 und 13 px, wie die Zeilen in den Popups). Die Schrift las sich vor allem auf großen Kacheln zu klein.

## 1.3.1 – 11.10.2026

### Behoben
- **Handy-Kopf:** Beim allerersten Laden steht der Seitenkopf nicht mehr zu weit unten. Ein übrig gebliebener Zeitgeber aus dem ersten Aufbau des Kopfs setzte den alten Abstand oben, obwohl die Kapsel schon unten in der Leiste saß.

## 1.3.0 – 11.10.2026

**Feinschliff.** Dieses Update bringt kaum neue Funktionen. Es macht Casora ruhiger, einheitlicher und angenehmer zu bedienen, auf jedem Bildschirm.

### Neu
- **Neue Raumleiste (Desktop und Tablet):** Zuhause steht fest links, die Räume scrollen frei mit Schwung und laufen an den Rändern weich aus. Antippen eines Raums verschiebt die Leiste nicht mehr. Der linke Pfeil erscheint erst, wenn links Räume verborgen sind. Glocke, Sprechblase und ⋯ sitzen daneben zusammen in einer Kapsel.
- **Handy-Leiste:** Glocke und ⋯ sitzen jetzt unten in der Leiste, „Zuhause“ steht nicht mehr doppelt da und der Seitenkopf rückt nach oben. Alle Knöpfe der Leiste geben dieselbe Tipp-Rückmeldung und Vibration.
- **Neuer Popup-Kopf:** In jedem Popup stehen Symbol, Titel, Status und Hauptschalter in einer Zeile. Das Symbol ist ein abgerundetes Quadrat in der Gerätefarbe, alle Schalter im Popup haben die Gerätefarbe. Lange Titel brechen auf zwei Zeilen um, der Raumname steht nicht doppelt da. Abschnittsüberschriften sind normal geschrieben. Im Licht-Popup ersetzt der Hauptschalter „Alles aus“.
- **Gruppen-Thermostat:** Fußbodenheizung und andere Heizungsgruppen haben keine gemeinsame Zieltemperatur, kein Plus, Minus und keinen Regler mehr. Jeder Raum wird in seiner eigenen Zeile eingestellt, die Statuszeile fasst die Räume zusammen, zum Beispiel „5 heizen · 21 bis 23°“.
- **Überall dieselben Formen:** Kacheln, Badges, Menüs, Leisten und Studio teilen sich jetzt dieselben Ecken, Abstände, Schatten und Bewegungen. Der Nebel-Look bekommt dieselben Kachelecken wie Casora.
- **Studio in Inter:** Das Studio nutzt die Schrift Inter, die Casora mitbringt. Kein fremder Schriftdienst wird abgefragt.
- **Szenen:** Die laufende Szene ist leicht in ihrer Farbe getönt, Szenenfarben sind immer zu sehen. Am Handy zeigt der Szenenknopf im Raum zuerst die Szenen des Raums, darunter das ganze Haus.
- **Mikrofon wieder in Assist:** Der Sprachknopf neben dem Eingabefeld ist zurück.
- **Schneller am Handy:** Das Handy lädt beim Öffnen rund 40 % weniger Daten (3,6 statt 5,9 MB). Die Kartenvorlagen sind 15 % kleiner.
- **Kleinerer Welle-Player:** Auf Desktop und Tablet ist der Player unter der Welle rund 15 % kleiner, der Aufbau bleibt gleich.

### Behoben
- **Popup-Kopf:** Das Symbol steht immer mittig zu Titel und Status, mit oder ohne Raumzeile. Am Handy brechen lange Gerätenamen um, statt abgeschnitten zu werden.
- **Popup-Symbole** sind immer weiß wie auf den Kacheln.
- **Auto-Popup:** In der Tanken-Ansicht lag der Zurück-Knopf über dem Titel, und der Kopf zeigte noch den Status des Autos.
- **Handy-Leiste:** Ein Tipp auf ⋯ lässt Glocke und Assist nicht mehr mitleuchten. Der Abstand oben stimmt auch nach dem Neuladen, und die alte Kapsel blitzt beim Laden nicht mehr oben auf.
- **Kacheln und Badges:** Der Symbolkreis hat ringsum denselben Abstand zum Rand. Badges am Handy sind 40 px hoch. Am Tablet nutzt die Badge-Reihe die Kurzform nur, wenn die lange nicht passt. Lange Szenennamen werden in der Mitte gekürzt. Die Kachelreihe sortiert erst nach zwei Sekunden Ruhe um und nie bei offenem Popup.
- **Lesbarkeit:** Roter Fehlertext ist dunkler und besser lesbar. Räume und Szenen am Handy haben denselben Randabstand wie die Kacheln.
- **Studio:** Die Seiten fluchten, der Handy-Titel ist im Hellen lesbar und „+“ sitzt genau in der Mitte. Trefferflächen sind mindestens 44 px groß, Hinweise und Kürzel besser lesbar. Jeder Raum hat ein eigenes ⋯ neben seinem Namen (umbenennen, verschieben, Symbol, ausblenden, löschen), und das Studio öffnet das zuletzt angesehene Dashboard. Die Handy-Vorschau zeigt das Hintergrundbild bis unten, die Vorschau der Raumleiste entspricht dem Dashboard.
- **Umzug von Hemma:** Ein unterbrochener Umzug lässt sich aufräumen oder fortsetzen. Der Fertig-Bildschirm springt nicht mehr. Die Rückfragen beim Entfernen von Hemma sehen alle gleich aus, und der Import markiert die Auswahl mit einer hinterlegten Zeile.
- **Auto-Popup blieb leer,** wenn noch eine alte Hemma-Ressource geladen war: Casoras eigenes Tanken-Modul lässt sich nicht mehr vom alten verdecken (#14).
- **Auto-Erkennung:** Ein Strecken-Sensor wird nicht mehr als nächste Inspektion oder Ölwechsel gelesen, dort standen Jahre wie 26800 (#15). Die Reichweite übergeht die AdBlue-Reichweite, die elektrische Reichweite zählt nur bei reinen E-Autos (#16). Der Popup-Titel zeigt den Gerätenamen des Autos statt eines Sensornamens (#17).
- **Tankstellen-Liste:** Mit der Tankerkönig-Integration behalten geschlossene Stationen ihren letzten Preis und bleiben als „zu“ in der Liste, der Filter „Offen“ wirkt wieder (#18).
- **Szenen „zuletzt aktiv“:** Wird eine Szene per Automation oder über ihren input_boolean eingeschaltet, stimmt die Zeit jetzt. „vor x T.“ rechnet überall nach Kalendertagen (#11).
- **Wortlaut:** „62 %“ mit schmalem Abstand, „Wird geöffnet …“ mit Leerzeichen, „Alle Batterien OK“.

## 1.2.4 – 09.10.2026

### Neu
- **Pulse-Kachel und -Popup:** Ist die Integration Pulse installiert, bietet Casora eine eigene Pulse-Kachel an. Sie zeigt, wie viele Geräte Aufmerksamkeit brauchen, und öffnet ein Popup, sortiert wie in Pulse: Ausgefallen, Prüfen, Batterie und Beobachten, mit „Gewechselt“ direkt in der Zeile. „Alles ok“ ist nach Batteriestand sortiert, die schwächsten zuerst.
- **Pulse in der Mitteilungszentrale:** Geräte, die Pulse als „Prüfen“ oder „Ausgefallen“ führt, erscheinen in der Glocke, ein Tipp öffnet das Pulse-Popup. Abschaltbar im Studio unter Benachrichtigungen. Meldet Pulse ein Gerät schon, steht es nicht zusätzlich als schwache Batterie da.
- **Neuer Medien-Player:** Das Menü unter der Welle zeigt das Cover als farbige Bühne mit Fortschritt, Zurück, Play/Pause, Weiter und Lautstärke. Raumkarten und Handy zeigen einen farbigen Streifen mit Zurück, Play/Pause und Weiter. Farbe und Play-Knopf richten sich nach Cover oder App-Logo.
- **Jetzt nach Updates suchen:** Ein Knopf im Updates-Popup fragt Home Assistant, den Supervisor (Core, OS, Apps) und HACS sofort nach neuen Updates.

### Behoben
- **Schatten in Popups:** Der weiche Schatten unter der aktiven Zeile oder Taste (Fußbodenheizung, Jalousien, Schlösser, Licht, Thermostat, Luftreiniger, Geschirrspüler, Sauger) war seitlich oder unten hart abgeschnitten. Er läuft jetzt sauber aus.
- **Thermostat-Text:** Eine Fußbodenheizung öffnet ihre Ventile nur minutenweise. In so einer Pause stand „Bereit“, obwohl der Raum noch unter dem Ziel lag. Jetzt steht „Heizt auf 22°“, bis das Ziel erreicht ist, und dann „An · 22°“.
- **Drüberfahren im dunklen Design:** Fuhr man mit der Maus über eine aktive Zeile im Popup (z. B. einen heizenden Raum), wurde sie dunkel, die Schrift blieb dunkel und war kaum lesbar. Die Zeile bleibt jetzt hell.
- **Studio:** „Aktuelle Wiedergabe“ in der Raumansicht klappt wieder ganz zu und startet zugeklappt. Vorher blieb ein Teil sichtbar und sah aus wie ein zweites Menü.

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
