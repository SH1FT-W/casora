// Monatskalender im Abfall-Popup (03.10.2026): Option aus → kein Kalender, Option an → Kalender
// mit den Abholtagen in der Farbe der Tonne. Ohne Browser: Finder + Kalender-Modul laden und den
// Popup-Ausdruck der Vorlage casora_trash ausführen.  node dev/unit/abfall_kalender.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;  // Mitternachts-/Nachzeichnen-Timer nicht abwarten
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finden.js');
load('06-kalender.js');
// Popup-Bausteine (casora-core) nur so weit, wie das Abfall-Popup sie braucht.
window._casoraUI = {
  tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', fill: '#333', accent: '#0a84ff', green: '#30d158', font: 'system-ui' },
  esc: (t) => String(t), hero: () => '<hero>', group: (rows, t) => '<group ' + t + '>', soft: () => false,
};

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = T.casora_trash.tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const popup = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', src);

const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const states = {
  'sensor.bio': { entity_id: 'sensor.bio', state: '2', attributes: { friendly_name: 'Bio', daysTo: 2, [ymd(day(2))]: 'Bio', [ymd(day(16))]: 'Bio' } },
  'sensor.papier': { entity_id: 'sensor.papier', state: '5', attributes: { friendly_name: 'Papier', daysTo: 5, [ymd(day(5))]: 'Papier' } },
};
const hass = { states, entities: {}, devices: {} };
const vars = { trash_sensors: { 'sensor.bio': 'Bio', 'sensor.papier': 'Papier' } };
const cfg = (settings) => { window.CASORA_SETTINGS = settings; return popup(states, states['sensor.bio'], {}, hass, vars, null).cards[0]; };

// Aus (Standard): kein Kalenderfeld, Layout wie bisher.
let c = cfg({ waste: {} });
assert.equal(c.custom_fields.cal, undefined, 'Option aus: kein Kalender');
assert.equal(window.casoraDevice.waste(hass, vars).calendarPopup, false);
c = cfg({ waste: { calendar_popup: false } });
assert.equal(c.custom_fields.cal, undefined);

// An: Kalenderfeld als Spalte mit Monat und Tag, im Raster links neben den Tonnen.
c = cfg({ waste: { calendar_popup: true } });
const cal = c.custom_fields.cal;
assert.ok(cal && cal.card, 'Option an: Kalender da');
assert.deepEqual(Object.keys(cal.card.custom_fields), ['wmonth']);
// Issue #7: Tageskarte als eigener Abschnitt (breit rechts oben, Handy unter dem Kopf).
assert.deepEqual(Object.keys(c.custom_fields.wday.card.custom_fields), ['wday']);
assert.ok(cal.card.triggers_update.includes('sensor.bio') && cal.card.triggers_update.includes('sensor.papier'));
const areas = c.styles.grid.find((g) => g['grid-template-areas'])['grid-template-areas'];
assert.match(areas, /"cal wday" "cal right"/, 'Breit: Tageskarte über den Tonnen');
assert.match(c.extra_styles, /"hero" "wday" "right" "cal"/, 'Handy: Tageskarte, Tonnen, Kalender');

// Monat: Abholtage mit Punkt in der Tonnenfarbe (Finder: Bio grün, Papier blau).
const K = window._casoraCalendar;
const run = (k) => { const t = cal.card.custom_fields[k] || c.custom_fields.wday.card.custom_fields[k]; return new Function('states', 'hass', 'variables', t.replace(/^\[\[\[\s*/, '').replace(/\s*\]\]\]$/, ''))(states, hass, cal.card.variables); };
const month = run('wmonth');
const cell = (html, d) => { const m = html.split('data-hcal="wday:' + ymd(d) + '"')[1]; return m ? m.split('data-hcal=')[0] : ''; };
const bio = window.casoraDevice.waste(hass, vars).bins.find((b) => b.label === 'Bio').color;
const pap = window.casoraDevice.waste(hass, vars).bins.find((b) => b.label === 'Papier').color;
assert.ok(cell(month, day(2)).includes('background:' + bio), 'Bio-Tag markiert');
if (day(5).getMonth() === day(2).getMonth() || cell(month, day(5))) assert.ok(cell(month, day(5)).includes('background:' + pap), 'Papier-Tag markiert');
assert.ok(!/<i style/.test(cell(month, day(3))), 'Tag ohne Abholung ohne Punkt');
assert.match(month, /hcal-d[^"]* s" data-hcal="wday:/, 'nächster Abholtag gewählt');
assert.match(month, /data-hcal="wbin:sensor.bio"/, 'Legende mit den Tonnen');
// Tag: Abholung am gewählten Tag.
assert.match(run('wday'), /Bio/);
assert.match(run('wday'), /Abholung in 2 Tagen/);
K.w.sel = ymd(day(3));
assert.match(K.html('wday'), /Keine Abholung/);

// Kalender-Popup: Ort nur aus Satzzeichen fällt weg.
K.ev = [{ name: 'Elternabend', loc: ' , ', start: day(1), end: day(1), allDay: false, cal: 'calendar.x' }];
K.ev[0].start = new Date(day(1).getTime() + 16 * 3600000); K.ev[0].end = new Date(day(1).getTime() + 17 * 3600000);
const up = K.html('up', { calendars: [{ entity: 'calendar.x', name: 'Privat', color: '#0A84FF' }] });
assert.match(up, /Privat · bis 17:00</);
console.log('abfall_kalender: ok');
