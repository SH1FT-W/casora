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
];
for (const [de, en] of EXPECT) assert.equal(tr(de), en, de);
console.log('ok phrasen_en');
