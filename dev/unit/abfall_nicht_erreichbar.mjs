// Abfall-Quelle nicht erreichbar (04.10.2026): Kalender/Tonnen-Sensoren unavailable und keine
// Termine → Hinweis im Popup, „Nicht erreichbar“ auf der Kachel. Einzelne Sensoren weg, aber
// Termine da → wie bisher.  node dev/unit/abfall_nicht_erreichbar.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finden.js');
load('06-kalender.js');
window._casoraUI = {
  tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', fill: '#333', accent: '#0a84ff', green: '#30d158', font: 'system-ui' },
  esc: (t) => String(t), hero: (o) => '<hero ' + o.value + '>', soft: () => false,
  group: (rows, t) => '<group ' + (t || '') + '>' + rows.map((r) => r.label + '|' + (r.sub || '')).join('') + '</group>',
};

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const popupFn = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.tap_action.casora_popup.content));
const tileFn = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.state_display));

const D = window.casoraDevice;
const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const off = (id, name) => ({ entity_id: id, state: 'unavailable', attributes: { friendly_name: name } });
const CAL = 'calendar.musterstadt_abfall';
const vars = { trash_sensors: { 'sensor.bio': 'Bio', 'sensor.papier': 'Papier' } };
const run = (states, settings) => {
  window.CASORA_SETTINGS = { waste: Object.assign({ calendar: CAL, calendar_popup: true }, settings || {}) };
  const hass = { states, entities: {}, devices: {}, callApi: () => new Promise(() => {}) };
  return { hass, W: D.waste(hass, vars), popup: () => popupFn(states, null, {}, hass, vars, null).cards[0], tile: () => tileFn(states, null, {}, hass, vars, null) };
};

// 1) Alles weg (Server des Entsorgers lehnt ab): nicht erreichbar, Name der Quelle aus dem Kalender.
let S = {
  [CAL]: off(CAL, 'Musterstadt Abfall'),
  'sensor.bio': off('sensor.bio', 'Bio'), 'sensor.papier': off('sensor.papier', 'Papier'),
};
let r = run(S);
assert.deepEqual(D.wasteDown(r.hass, r.W), { source: 'Musterstadt Abfall' });
assert.equal(r.tile(), 'Nicht erreichbar', 'Kachel: Nicht erreichbar');
let c = r.popup();
assert.match(c.custom_fields.down, /Abfallkalender gerade nicht erreichbar/);
assert.match(c.custom_fields.down, /sobald Musterstadt Abfall antwortet\./);
assert.ok(c.custom_fields.cal, 'Monatskalender bleibt sichtbar');
assert.equal(c.custom_fields.wday, undefined, 'keine leere Tageskarte');
const areas = c.styles.grid.find((g) => g['grid-template-areas'])['grid-template-areas'];
assert.match(areas, /"hero hero" "cal down"/, 'Breit: Hinweis rechts oben neben dem Monat');
assert.match(c.extra_styles, /"hero" "down" "cal"/, 'Handy: Hinweis direkt unter dem Kopf');

// 2) Ohne Kalender, nur Sensoren weg: Ersatzname.
r = run({ 'sensor.bio': off('sensor.bio', 'Bio'), 'sensor.papier': off('sensor.papier', 'Papier') }, { calendar: null });
assert.equal(r.W.calendar, null);
assert.deepEqual(D.wasteDown(r.hass, r.W), { source: null });
assert.match(r.popup().custom_fields.down, /sobald der Entsorger antwortet\./);
assert.equal(r.tile(), 'Nicht erreichbar');

// 3) Nur ein Sensor weg, der andere hat Termine: wie bisher.
S = {
  [CAL]: { entity_id: CAL, state: 'off', attributes: { friendly_name: 'Musterstadt Abfall' } },
  'sensor.bio': off('sensor.bio', 'Bio'),
  'sensor.papier': { entity_id: 'sensor.papier', state: '3', attributes: { friendly_name: 'Papier', daysTo: 3, [ymd(day(3))]: 'Papier' } },
};
r = run(S);
assert.equal(D.wasteDown(r.hass, r.W), null);
c = r.popup();
assert.equal(c.custom_fields.down, undefined);
assert.ok(c.custom_fields.wday, 'Tageskarte wie bisher');
assert.notEqual(r.tile(), 'Nicht erreichbar');

// 4) Kalender weg, aber Sensoren liefern Termine: wie bisher.
S[CAL] = off(CAL, 'Musterstadt Abfall');
r = run(S);
assert.equal(D.wasteDown(r.hass, r.W), null);

// 5) Kalender in Ordnung, Sensoren weg: erst nach dem Laden entscheiden.
S = {
  [CAL]: { entity_id: CAL, state: 'off', attributes: { friendly_name: 'Musterstadt Abfall' } },
  'sensor.bio': off('sensor.bio', 'Bio'), 'sensor.papier': off('sensor.papier', 'Papier'),
};
window._casoraTrashCal = null;
r = run(S);
assert.equal(D.wasteDown(r.hass, r.W), null, 'Kalender lädt noch');
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [{ summary: 'Bio', start: { date: ymd(day(4)) } }] };
assert.equal(D.wasteDown(r.hass, r.W), null, 'Kalender liefert Termine');
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [] };
assert.ok(D.wasteDown(r.hass, r.W), 'geladen, aber leer und Sensoren weg');
window._casoraTrashCal = null;

console.log('abfall_nicht_erreichbar: ok');
