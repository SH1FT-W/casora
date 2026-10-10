# Wortliste

Verbindliche Wörter für Dashboard und Studio (Stand Feinschliff 1.3, 10.10.2026). Quelle: Wortlaut-Audit
(4 531 Übersetzungseinträge, 1 455 deutsche Code-Literale) und getroffene Entscheidungen, abgesichert in
`dev/unit/wortlaut.mjs`, `dev/unit/wortlaut_regeln.mjs`, `dev/unit/schloss_zustaende.mjs`, `dev/unit/oeffnungen.mjs`,
`dev/unit/phrasen_en.mjs`.

Mit **(V)** bzw. **(V1 … V9)** markierte Zeilen waren offen und sind seit 1.3 entschieden (Liste in §6).
Bis zur Wahl gilt der heutige Stand der Nachbarstellen, nicht die Empfehlung.

## 1. Grundregeln

| Regel | Deutsch | Englisch | Prüfung |
|---|---|---|---|
| Quellsprache | Dashboard-Code schreibt **Deutsch**, Englisch in `translations/dashboard/phrases/en.json`. Studio-Code schreibt **Englisch**, Deutsch in `translations/panel/de.json`. Integration: `translations/de.json` + `en.json` (gleiche Schlüssel). | – | `python3 tools/i18ncheck.py`, `tools/phrase-gaps.py --max 70`, `node dev/unit/wortlaut_regeln.mjs` |
| Anrede | **du** (klein, auch „dein“). Nie Sie-Form. | you | `wortlaut_regeln.mjs` |
| Name nach außen | „Studio“, „neues Studio“ – nie „Studio B“ | Studio | `wortlaut_regeln.mjs` |
| Gedankenstrich | „ – “ (Halbgeviert mit Leerzeichen) als Satztrenner; „-“ nur in Wörtern | „ – “ ebenso | – |
| Trenner in Unterzeilen | „ · “ (Mittelpunkt mit Leerzeichen); die Übersetzung arbeitet je Stück | gleich | – |
| Anführung | „…“ (deutsch) | “…” | – |
| Auslassung **(V9)** | **Studio:** „Suchen …“ (mit Leerzeichen). **Dashboard (V):** heute gemischt „Läuft…“/„Läuft …“ | **Studio:** „Search…“ (ohne). Dashboard folgt heute dem Deutschen (V) | – |
| Muster-Reihenfolge | In `phrases/en.json` gewinnt das **erste** passende Muster: Spezielles („^1 Tür entriegelt$“) immer **vor** Allgemeinem („^(.+) entriegelt$“) | – | – (Prüfwerkzeug des Audits liegt nicht im Repo, Kandidat für einen Regeltest) |
| Knopf vs. Zustand | Ein Wort, das auch ein Knopf ist („Zu“ = Close), nie als Zustand verwenden – die Übersetzung kennt keinen Zusammenhang | – | – |

## 2. Zustandswörter

| Begriff DE | EN | nicht verwenden | Beispiel |
|---|---|---|---|
| An / Aus | On / Off | Ein, Eingeschaltet/Ausgeschaltet als Zustand (als Verb im Satz ok: „Kachel eingeschaltet“) | Licht „An“, Steckdose „Aus“ |
| Zahl + An | „1 An“, „3 An“ (**groß**, Entscheidung 23.09.) | „1 an“ | Licht-Gruppenbadge |
| Alle An / Alle Aus | All On / All Off | „Alle an“ | Licht-Popup |
| Zahl + aktiv | „2 aktiv“, „Keine aktiv“ (**klein**, Entscheidung 08.10. D13c) | „2 Aktiv“, „Keine Aktiv“ | Szenen-Badge |
| Geöffnet / Geschlossen | Open / Closed | „Zu“ als Zustand (= Knopf „Close“) | Jalousie, Tür, Fenster, Garage |
| „62 % geöffnet“, „3 von 5 geöffnet“, „Teilweise geöffnet“, „Alle geöffnet/geschlossen“ | „62% open“, „3 of 5 open“, „Partly open“, „All open/closed“ | – | Jalousie-Gruppe |
| Gekippt | Tilted | „Kipp“ | Fenster |
| *(Sammeltext)* „Tür offen“, „2 Fenster offen“, „Schloss offen“ | „Door open“, „2 windows open“ | „Tür geöffnet“ im Sammeltext | Sicherheits-Unterzeile (Test `oeffnungen.mjs`) |
| Offen (Einzelzustand Kontakt) **(V2)** | Open | – | heute gemischt mit „Geöffnet“ |
| Verriegelt / Entriegelt | Locked / Unlocked | „Offen“/„Zu“ für Schlösser (Ausnahme: Badges „Offen“ bei Nuki-open, Test B-TPL-06) | Schloss, Auto |
| Klemmt **(V2)** | Jammed | heute zusätzlich „Blockiert“ in 2 Badges | Schloss |
| Wird verriegelt… / Wird entriegelt… / Wird geöffnet… | Locking… / Unlocking… / Opening… | – | Schloss |
| Läuft | Running | „Aktiv“ für Geräteprogramme | Waschmaschine |
| Zahl + läuft | „1 läuft“ (klein) | – | Medien-Gruppenbadge |
| Bereit | Ready | „Leerlauf“, „Idle“ | Geräte im Leerlauf, Luftreiniger |
| Pausiert | Paused | „Angehalten“ | Medien, Geräte |
| Fertig / Fertig gegen 14:30 | Done / Done around 14:30 | „Beendet“ | Waschmaschine |
| Lädt / Entlädt | Charging / Discharging | – | Akku |
| Aktiv / Inaktiv | Active / Inactive | – | Netzwerk, Medien |
| Standby | Standby | „Bereitschaft“ (1× im Luftreiniger) | Medien, Energie |
| Nicht verfügbar | Unavailable | „Unavailable“ roh | HA-Zustand unavailable |
| Offline | Offline | – | Kamera, Schloss (Gerät weg) |
| Nicht erreichbar | Unreachable | – | Dienste/Integrationen (Abfall, Pulse) |
| Unbekannt | Unknown | – | HA-Zustand unknown |
| Zuhause / Unterwegs | Home / Away | „Daheim“, „Abwesend“ für Personen | Personen-Badge |
| Alle zuhause / Alle unterwegs / 2 unterwegs | All home / All away / 2 away **(V5)** | – | Personen-Gruppe |
| Abwesend | Away | – | nur Alarm-Modus („Aktiviert · Abwesend“) |
| Schwach / Fast leer / OK | Low / Almost empty / OK | – | Akku-Stufen (`casoraBattery`), „2 Schwach“ groß |

## 3. Dinge in der Oberfläche

| Begriff DE | EN | nicht verwenden | Beispiel |
|---|---|---|---|
| Kachel | tile | Karte (für Casora-Kacheln), Widget | „Kachel bearbeiten“ |
| Karte | card | – | nur fremde Lovelace-Karten: „Eigene Karte“, „Karten aus anderen Quellen“, „Karten-Update“ |
| Kachelart **(V3)** | tile type | Kacheltyp (heute 12×), Vorlage (= button_card-Template, technisch) | „Kachelart wählen“ |
| Popup | popup | Fenster, Dialog, Einstellungsfenster | „Popup-Karte bearbeiten“ |
| Badge | badge | Chip, Plakette | „Reihenfolge der Badges“ |
| Raum | room | Zimmer; „Bereich“ nur wo HAs Area gemeint ist | „Raum hinzufügen“ |
| Zuhause | Home | „Startseite“ als Filtername | Filter „Zuhause“ |
| Studio | Studio | Studio B, Panel, Einstellungsfenster | „Im Studio öffnen“ |
| Glocke | bell | Benachrichtigungscenter | „Glocke & Meldungen“ |
| Meldung / Push-Meldung | alert / push notification | Benachrichtigung (nur HA-eigene) | „Keine Meldungen“ |
| Handy | phone | Telefon, Smartphone, Mobil | „Handy-Layout“ |
| Desktop / Tablet | desktop / tablet | Computer, PC | „Desktop-Einstellungen“ |
| Szene | scene | Stimmung | „Szene speichern“ |
| Design | design | Theme (nur „Hemma-Theme“ als Eigenname) | „Design wechseln“ |
| Symbol | icon | Icon | „Symbol festgelegt“ |
| Sicherung | backup (Casora) | – | „casora_sicherungen“; HAs eigenes heißt „Backup“ |
| Gerät / Entität | device / entity | – | „Entität“ nur in Studio-Feldern |
| Knopf | button | Schaltfläche, Button | „Szenen-Knöpfe“ (Oberfläche) |
| Taste | button | – | physische Taste am Gerät („Taste 1“) |
| Akku | battery | – | wiederaufladbar: Handy, Auto, Sauger, Solar, Akku-Stufen |
| Batterie **(V7)** | battery | – | Wegwerf-Batterie: Sensoren, Pulse |
| Entfernen / Löschen | Remove / Delete | – | Entfernen = aus Casora nehmen; Löschen = endgültig weg |
| Rückgängig / Fertig / Speichern | Undo / Done / Save | – | Studio-Leiste |
| KI | AI | – | „KI-Einschätzung“, „KI:“ |

## 4. Zahlen, Einheiten, Zeit

| Begriff DE | EN | nicht verwenden | Beispiel |
|---|---|---|---|
| Prozent „62 %“ (mit Leerzeichen) | „62%“ (ohne; macht `casora-i18n` automatisch) | „62%“ im Deutschen **(V1: heute 9 Stellen)**, „62 %“ im Englischen | „Akku 62 %“ / „Battery 62%“ |
| Temperatur „21,5 °C“, kurz „22°“ | „21.5 °C“, „22°“ | „21.5 °C“ im Deutschen | Thermostat „Heizt auf 22°“ |
| Energie/Leistung | „3,2 kWh“, „850 W“ | „3,2 kWh“ im Englischen (Zahl kommt aus `casoraLocale`) | Energie-Popup |
| Dezimal / Tausender | „1,5“ / „1.234“ – immer `toLocaleString(casoraLocale())` bzw. `casoraNum` | `toFixed()` für Anzeige, `replace('.', ',')` | – |
| Uhrzeit | „14:30“, „um 8 Uhr“ | „14.30 Uhr“ | EN „7:00 PM“ kommt aus dem Browser-Format |
| Dauer | „1 Std. 30 Min.“, „vor 5 Min.“, „noch 25 Min.“ | „1h 30m“ | EN „1 h 30 min“, „5 min ago“, „25 min left“ |
| Tage | „vor 3 Tagen“, „in 3 Tagen“, „1 Tag“ | – | EN „3 days ago“ |
| Geld | „1,79 €“ (`style: 'currency'`) | „€ 1,79“ | Tanken |

## 5. Englisch

| Regel | Empfehlung | nicht verwenden | Beispiel |
|---|---|---|---|
| Schreibweise **(V4)** | amerikanisch (wie Home Assistant): color, favorites, analyze, canceled, gray | colour, recognised, fertiliser, levelling | „Color channels“ |
| Groß/klein **(V5)** | Studio: Titel und Knöpfe Title Case („Add Room“), Sätze/Hinweise Satzschreibung. Dashboard-Zustände: erstes Wort groß, Rest klein („All open“, „Due soon“) | „All Away“ neben „All away“ | – |
| Deutsche Reste | keine – Eigennamen ausgenommen (Tankerkönig, Deutscher Wetterdienst) | „Klappen open“ | `phrasen_en.mjs` |

## 6. Entschiedene Punkte (1.3, vorher OFFEN)

| # | Frage | A | B | Empfehlung Audit |
|---|---|---|---|---|
| V1 | Prozent im Deutschen (heute 9× „62%“, ~45× „62 %“) | überall „62 %“ mit schmalem geschütztem Leerzeichen (U+202F) | Kacheln/Badges „62%“, Popups/Text „62 %“ | A |
| V2 | Schloss „Klemmt“/„Blockiert“, Kontakt „Geöffnet“/„Offen“ | „Klemmt“ + „Geöffnet“ überall | „Blockiert“ + „Offen“ überall | A (Sammeltexte „Tür offen“ bleiben) |
| V3 | Studio „Kachelart“ (23×) / „Kacheltyp“ (12×) | Kachelart | Kacheltyp | A |
| V4 | Englische Schreibweise | amerikanisch (wie HA) | britisch | A |
| V5 | Englisch Groß/klein bei Zuständen („All Away“ vs „All away“) | Satzschreibung | Title Case | A |
| V6 | Netzwerk WLAN aus: Unterzeile „Ausgeschaltet“ neben Knopf „Aus“ | „Aus“ | lassen (Ausnahme notieren) | B |
| V7 | Batterien-Popup: Titel „Batterien“, Kopf „Alle Akkus OK“ | Titel „Akkus“ | Kopf „Alle Batterien OK“ | B |
| V8 | Integrations-Anzeigenamen mit Bindestrich („Casora Kamera-KI“) | mit Bindestrich | lassen | A (entity_id bleibt) |
| V9 | Auslassung im Dashboard („Läuft…“ 19× / „Läuft …“ 39×) | wie Studio: DE „Läuft …“, EN „Running…“ | überall ohne Leerzeichen | A |

**Entschieden 1.3:** V1 A (die Übersetzungs-Laufzeit setzt U+202F in allen button-card-Texten, Test
`prozent_de.mjs`), V2 A, V3 A, V4 A (auch „gas station“), V5 A, V6 B (Ausnahme), V7 B, V8 A, V9 A.
