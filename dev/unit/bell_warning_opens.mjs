// Issue #66: a weather warning row in the bell opened the plain entity popup („Wetter Warnung 1 · An“)
// unless a weather warning tile was on the dashboard. Expected: the row names the warning templates, so
// openTarget builds a hidden warning tile for the sensor and the warning popup with its text opens.
//   node dev/unit/bell_warning_opens.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const bs = basis.indexOf('(function () {\n  if (window._casoraNotifyLocal) return;');
assert.ok(bs > 0, 'notify extension (01-basis) found');
const mod = basis.slice(bs, basis.indexOf('\n})();', bs) + 6);

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
window.CASORA_NOTIFY_EXTENSIONS = [];
new Function(mod)();
const ext = window.CASORA_NOTIFY_EXTENSIONS[0];

const W = 'binary_sensor.nina_warning_example_1';
const hass = {
  states: { [W]: { entity_id: W, state: 'on', last_changed: new Date().toISOString(), attributes: {
    friendly_name: 'Warnung 1', severity: 'Moderate', headline: 'Amtliche WARNUNG vor STARKEM GEWITTER',
    description: 'Es treten Gewitter auf.', expires: new Date(Date.now() + 3600000).toISOString() } } },
  entities: {}, devices: {}, areas: {},
};
const rows = ext.standing(hass, [], { nameOf: (st) => st.attributes.friendly_name });
const row = rows.find((r) => String(r.id).indexOf('casora:warning:' + W) === 0);
assert.ok(row, 'warning row in the bell');
assert.equal(row.entity, W);
assert.deepEqual(row.opens, ['casora_weather_warning', 'casora_popup_weather_warning'], 'row opens the warning popup, not the entity popup');
console.log('bell_warning_opens: ok');
