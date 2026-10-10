// Englische Phrasen im Dashboard (casora-i18n.js aus translations/dashboard/phrases/en.json).
//   node dev/unit/phrasen_en.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const win = {};
const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: 'en' } } } : null), addEventListener() {} };
try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM-Wächter ohne Browser */ }
const tr = win.casoraTr;
assert.ok(tr, 'casoraTr geladen');
const EXPECT = [
  // DP-20 (10.10.2026): Modus „Auto“ wurde zu „Car“ – direkt (Thermostat, Luftreiniger, Sauger, eBike)
  // und über die Kette Automatik → Auto → Car (DOM-Wächter übersetzt das Ergebnis erneut).
  ['Auto', 'Auto'],
  ['Automatik', 'Auto'],
  ['Fahrzeug', 'Vehicle'],
  // B-TPL-05: zwei verschmolzene Muster
  ['3 Termine heute', '3 events today'],
  ['Neu: Casora 1.0.11', 'New: Casora 1.0.11'],
  // B-TPL-09: Updates-Kachel
  ['2 Verfügbar', '2 available'],
  // B-TPL-10: Energie-Unterzeile und Rezept-Titel
  ['Heute 3,2 kWh', 'Today 3,2 kWh'],
  ['Küche · Rezepte', 'Kitchen · Recipes'],
  // B-ALARM: Bypass heißt auch auf Deutsch „Bypass“ (06.10.2026), auch in der Glocke (Weich)
  ['Alarm aktiv · Bypass', 'Alarm active · Bypass'],
  ['Alarmanlage aktiv · Zuhause', 'Alarmanlage active · Home'],
  ['Aktiviert (Bypass)', 'Armed (Bypass)'],
  ['Aktiviert · Bypass', 'Armed · Bypass'],
  ['Einzelne Sensoren ausgenommen', 'Some sensors excluded'],
  ['Alarm scharf – Bypass', 'Alarm armed – Bypass'],
  ['Alarmanlage umgeschaltet auf Bypass', 'Alarmanlage switched to Bypass'],
  // R-04: Countdown-Unterzeile im Weich-Alarm-Popup (Zahl steht in eigenem <span>)
  ['Zuhause · scharf in <span class="cal-n"></span> s', 'Home · armed in <span class="cal-n"></span> s'],
  ['wird scharf …', 'arming…'],  // V9 (1.3): Englisch ohne Leerzeichen vor …
  ['Alarm in <span class="cal-n"></span> s', 'Alarm in <span class="cal-n"></span> s'],
  // 1.2.1: Tanken-Empfehlung – das Sammelmuster „… Uhr“ stand vor diesen und fraß das „Uhr“ („HEUTE AB 19“).
  ['Heute ab 19 Uhr', 'Today from 19:00'],
  ['Morgen ab 6 Uhr', 'Tomorrow from 6:00'],
  ['Warte bis 15 Uhr', 'Wait until 15:00'],
  ['um 8 Uhr', 'at 8:00'],
  // 1.2.1 (E1): Uhrzeit kommt schon im Format der Sprache („7:00 PM“, schmales Leerzeichen wie im Browser).
  ['Heute ab 7:00\u202fPM', 'Today from 7:00 PM'],
  ['Warte bis morgen 7:00 AM', 'Wait until 7:00 AM tomorrow'],
  ['Tank reicht noch 300 km. Ab 7:00 PM lag Super E10 in den letzten 14 Tagen im Schnitt 6 ct niedriger.', 'Enough fuel for 300 km. From 7:00 PM, Super E10 was 6 ct cheaper on average over the last 14 days.'],
  ['Super E10 · ab 19:00 günstiger', 'Super E10 · cheaper from 19:00'],
  ['In 25 Durchgängen fällig', 'Due in 25 cycles'],
  ['Wirklich entriegeln?', 'Really unlock?'],
  // Wortlaut 1.3 (10.10.2026): Muster, die ein allgemeineres früher verdeckte („1 Tür unlocked“).
  ['1 Tür entriegelt', '1 door unlocked'],
  ['2 Türen entriegelt', '2 doors unlocked'],
  ['Einspeisung · heute 3.2 kWh', 'Feed-in · today 3.2 kWh'],
  ['Einspeisung · 62 % aus Solar und Akku · heute 3.2 kWh', 'Feed-in · 62% from solar and battery · today 3.2 kWh'],
  ['Super E5 · keine offen', 'Super E5 · none open'],
  // fehlende Einträge
  ['3 von 5 geöffnet', '3 of 5 open'],
  ['Klappen offen', 'Hatches open'],
  ['Kraftstoff · jetzt günstig', 'Fuel · good price now'],
  ['KI: <span style="color:red;">1 Update braucht Aufmerksamkeit</span>', 'AI: <span style="color:red;">1 update needs attention</span>'],
  // E2: Englisch schreibt Prozent ohne Leerzeichen – auch bei reinen Zahlen und unübersetzten Namen.
  ['62 %', '62%'],
  ['62\u00a0%', '62%'],
  ['Akku 62 %', 'Battery 62%'],
  ['62 % aus Solar und Akku', '62% from solar and battery'],
  ['Am niedrigsten: Bad 12 %', 'Lowest: Bad 12%'],
  ['40 % in 30 Min.', '40% in 30 min'],
  ['Hell 62 %', 'Hell 62%'],
  ['<b>62 %</b>', '<b>62%</b>'],
  // Jalousie-Kachel („62% Geöffnet“) und Glocke Pflanze („Boden bei 40%“) blieben deutsch.
  ['62% Geöffnet', '62% open'],
  ['38% Geschlossen', '38% closed'],
  ['Boden bei 40%', 'Soil at 40%'],
];
for (const [de, en] of EXPECT) assert.equal(tr(de), en, de);
// Kein Englisch-Muster mit „ %“ mehr; CSS-artige Werte ohne Leerzeichen bleiben unberührt.
const PH = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.deepEqual(PH.patterns.filter((p) => / %/.test(p[1])).map((p) => p[1]), [], 'en-Muster ohne Leerzeichen vor %');
assert.equal(tr('width:100%'), 'width:100%');
// Auto-Popup: Türen/Fenster „Geschlossen“ (nicht „Zu“ = Knopf „Close“), Schloss „Entriegelt“ (nicht „Offen“).
const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
assert.ok(!/r\.known \? 'Zu'/.test(pop) && (pop.match(/r\.known \? 'Geschlossen'/g) || []).length === 2, 'Auto: Geschlossen statt Zu');
assert.ok(pop.includes("r.locked ? 'Verriegelt' : 'Entriegelt'"), 'Auto: Entriegelt statt Offen');
console.log('ok phrasen_en');
// Keine Kette: Was eine Übersetzung liefert, darf kein anderer deutscher Schlüssel sein
// (sonst übersetzt der DOM-Wächter das Ergebnis ein zweites Mal, z. B. Automatik → Auto → Car).
{
  const ex = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8')).exact;
  const chains = Object.entries(ex).filter(([k, v]) => v !== k && ex[v] !== undefined && ex[v] !== v).map(([k, v]) => k + ' → ' + v + ' → ' + ex[v]);
  assert.deepEqual(chains, [], 'Übersetzungsketten');
}
console.log('ok phrasen_en (Ketten)');
