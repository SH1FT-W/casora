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
  ['wird scharf …', 'arming …'],
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
];
for (const [de, en] of EXPECT) assert.equal(tr(de), en, de);
console.log('ok phrasen_en');
