// Shared by the Universal tile's unit tests (freie_kachel.mjs) and the own badge popup's (badge_popup.mjs), without HA.
//   freeTileEnv()  – a bare window with the modules the popup needs (18-ziele, 22-halten, the core's state words,
//                    28-free-tile) and an invented house: { F, states, entities, hass, add, src, load }
//   stubKit()      – window._casoraSoftKit that records sections ({sec, watch}) and returns the layout as given
//   stubUI()       – window._casoraUI as readable strings (<line>, <note>, <seg>, <slider>, <group>)
// All devices and names are invented.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../../', import.meta.url);
export const src = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
export const load = (p) => new Function(src('custom_components/casora/scripts/local/' + p))();

export function freeTileEnv() {
  globalThis.window = globalThis;
  globalThis.document = { querySelector: () => null, addEventListener: () => {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {} }, head: { appendChild() {} } };
  globalThis.addEventListener = () => {};
  globalThis.setTimeout = () => 0;
  globalThis.casoraLocale = () => 'de-DE';
  load('18-ziele.js');   // binWords / iconOf for value rows
  load('22-halten.js');  // controls model per domain
  // The core's state words (casora-core.js _casoraStateText), cut out of the bundle: the real "Geöffnet"/"An" path.
  const core = src('custom_components/casora/scripts/casora-core.js');
  const stI = core.indexOf('if (window._casoraStateText) return;');
  new Function(core.slice(core.lastIndexOf('(function () {', stI), core.indexOf('})();', stI) + 5))();
  assert.equal(typeof window._casoraStateText, 'function', 'core state text loaded');
  load('28-free-tile.js');
  const F = window._casoraFree;
  assert.ok(F && window._casoraHold && window._casoraZiele, 'modules loaded');

  // ── Invented house ──────────────────────────────────────────────────────
  const states = {}, entities = {};
  const add = (id, state, attributes = {}, reg = {}) => {
    states[id] = { entity_id: id, state, attributes: { friendly_name: id.split('.')[1].replace(/^qa_/, '').replace(/_/g, ' '), ...attributes },
      last_changed: new Date(Date.now() - 2 * 3600000).toISOString() };
    entities[id] = { entity_id: id, ...reg };
  };
  add('switch.qa_pumpe', 'on');
  add('light.qa_stehlampe', 'on', { brightness: 128, supported_color_modes: ['brightness'] });
  add('cover.qa_rollo', 'open', { supported_features: 15, current_position: 60 });
  add('lock.qa_tor', 'locked', { supported_features: 0 });
  add('climate.qa_thermostat', 'heat', { temperature: 21, min_temp: 7, max_temp: 30, target_temp_step: 0.5, hvac_modes: ['off', 'heat'], supported_features: 1 });
  add('sensor.qa_temp', '21.47', { unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement' });
  add('sensor.qa_energie', '1234.5', { unit_of_measurement: 'kWh', device_class: 'energy', state_class: 'total_increasing' });
  add('sensor.qa_zaehler', '7', { state_class: 'measurement' });
  add('sensor.qa_programm', 'Bereit', {});
  add('sensor.qa_weg', 'unavailable', { unit_of_measurement: 'W' });
  add('binary_sensor.qa_tuer', 'on', { device_class: 'door' });
  add('sensor.qa_prozent', '62', { unit_of_measurement: '%' });
  add('sensor.qa_handy', 'iPhone 15');
  add('sensor.qa_wlan', 'WLAN_5G');
  add('input_text.qa_notiz', 'Milch kaufen');
  add('select.qa_modus', 'Eco Plus', { options: ['Eco Plus', 'Normal'] });
  const hass = { states, entities, formatEntityState: (st) => (st.state === 'on' ? 'Ein' : st.state === 'off' ? 'Aus' : st.state) };
  return { F, states, entities, hass, add, src, load };
}

export function stubKit() {
  window._casoraSoftKit = {
    secCard: (watch, code, st) => ({ sec: /sec\("(\w+)"/.exec(code)[1], watch: watch.filter((id) => st[id]) }),
    layout: (o) => o,
  };
  return window._casoraSoftKit;
}

export function stubUI() {
  const UI = window._casoraUI = window._casoraUI || {};
  UI.line = (main, rest) => '<line>' + main + '|' + (rest || []).join(' · ') + '</line>';
  UI.note = (t) => '<note>' + t + '</note>';
  UI.segments = (items, label) => '<seg ' + (label || '') + '>' + items.map((i) => (i.active ? '*' : '') + i.label + '>' + i.svc.domain + '.' + i.svc.service
    + (i.svc.data && Object.keys(i.svc.data).length ? JSON.stringify(i.svc.data) : '')).join(';') + '</seg>';
  UI.slider = (o) => '<slider ' + o.value + ' ' + o.svc.service + '/' + o.svc.field + '>';
  UI.group = (rows, label) => '<group ' + label + '>' + rows.map((r) => (r.entity ? r.entity + ':' : '') + r.label + '=' + (r.value || '')
    + (r.svc ? '>' + r.svc.domain + '.' + r.svc.service : '') + (r.confirm ? '?' + r.confirm : '')).join(';') + '</group>';
  return UI;
}
