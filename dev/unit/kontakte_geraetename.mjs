// Issue #1 (Türen & Fenster, Weich): Räume mit nur einem Kontakt zeigten den Raumnamen als Titel
// und keinen Untertitel („Flur“ statt „Haustür“). Erwartet: jede Zeile wie bei mehreren Kontakten
// im Raum – Gerätename als Titel (ohne „Kontaktsensor“ davor), Raum als Untertitel. Gilt für das
// Kontakte-Popup und das Alarm-Popup (gleiche Zeilenlogik). Ohne Browser: Vorlage auswerten.
//   node dev/unit/kontakte_geraetename.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));

const hass = {
  areas: { fl: { name: 'Flur' }, sz: { name: 'Schlafzimmer' }, wz: { name: 'Wohnzimmer' }, ku: { name: 'Küche' } },
  devices: {
    d_ht: { area_id: 'fl', name: 'Kontaktsensor Haustür' },
    d_sz: { area_id: 'sz', name: 'Schlafzimmer Fenster' },
    d_w1: { area_id: 'wz', name: 'Wohnzimmer Fenster' },
    d_w2: { area_id: 'wz', name: 'Balkontür' },
    d_ku: { area_id: 'ku', name: 'Küche' },
  },
  entities: {
    'binary_sensor.haustuer': { device_id: 'd_ht' },
    'binary_sensor.sz_fenster': { device_id: 'd_sz' },
    'binary_sensor.wz_fenster': { device_id: 'd_w1' },
    'binary_sensor.balkontuer': { device_id: 'd_w2' },
    'binary_sensor.kuechenfenster': { device_id: 'd_ku' },
  },
};
const st = (dc, name) => ({ state: 'off', attributes: { device_class: dc, friendly_name: name } });
const states = {
  'binary_sensor.haustuer': st('door', 'Kontaktsensor Haustür'),
  'binary_sensor.sz_fenster': st('window', 'Schlafzimmer Fenster'),
  'binary_sensor.wz_fenster': st('window', 'Wohnzimmer Fenster'),
  'binary_sensor.balkontuer': st('door', 'Balkontür'),
  'binary_sensor.kuechenfenster': st('window', 'Küche Contact'),
};
hass.states = states;

globalThis.window = globalThis;
window.casoraContacts = () => ({ groups: [{ label: 'Kontakte', members: Object.keys(states) }], sub: {}, excl: [] });
const rowsOf = (name, soft) => {
  let rows = null;
  window._casoraUI = {
    soft: () => soft, hero: () => '', group: (r) => { rows = (rows || []).concat(r); return ''; },
    col: () => '', cols: () => '', rows: () => '', label: () => '',
  };
  const src = tpl[name].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  try { new Function('states', 'entity', 'user', 'hass', 'variables', 'html', src)(states, { entity_id: 'binary_sensor.haustuer' }, {}, hass, {}, null); } catch (e) { /* Rest der Vorlage braucht mehr */ }
  assert.ok(rows, name + ': Zeilen gebaut');
  return Object.fromEntries(rows.filter((r) => r.entity).map((r) => [r.entity, [r.label, r.sub]]));
};

for (const name of ['casora_popup_contacts', 'casora_popup_alarm']) {
  const r = rowsOf(name, true);
  assert.deepEqual(r['binary_sensor.haustuer'], ['Haustür', 'Flur'], name + ': einziger Kontakt im Flur → Gerätename + Raum: ' + JSON.stringify(r['binary_sensor.haustuer']));
  assert.deepEqual(r['binary_sensor.sz_fenster'], ['Schlafzimmer Fenster', 'Schlafzimmer'], name + ': einziger Kontakt im Schlafzimmer');
  assert.deepEqual(r['binary_sensor.wz_fenster'], ['Wohnzimmer Fenster', 'Wohnzimmer'], name + ': mehrere im Wohnzimmer (wie bisher)');
  assert.deepEqual(r['binary_sensor.balkontuer'], ['Balkontür', 'Wohnzimmer'], name + ': mehrere im Wohnzimmer (wie bisher)');
  // Gerät heißt wie der Raum: Entitätsname als Titel, Raum darunter.
  assert.deepEqual(r['binary_sensor.kuechenfenster'], ['Küche Contact', 'Küche'], name + ': Gerätename = Raum → Entitätsname: ' + JSON.stringify(r['binary_sensor.kuechenfenster']));
}
console.log('ok – Türen & Fenster: Gerätename als Titel, Raum als Untertitel, auch bei einem Kontakt im Raum');
