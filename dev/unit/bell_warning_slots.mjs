// Issue #196: the warning slots of „Wetter & Warnungen“ (binary_sensor, platform wetter, translation_key warning,
// entity ids without the NINA prefix) were no warning source for the bell: it kept HA's generic rows
// „Sicherheitswarnung · Wetter Warnung 1/2“, which opened the tile that lists the slot (#196: both showed the
// same warning) or, for a slot not on a tile, the plain entity popup („An“). Expected: such a slot, and any sensor
// picked in a weather warning tile, is a warning source – one „Wetterwarnung: <kind>“ row per active warning that
// opens the warning popup, no generic row; a slot of a tile that shows other slots only (owner, 01.11.2026) stays out.
//   node dev/unit/bell_warning_slots.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#isWarnSource,isWarning,pickedWarnings custom_components/casora/scripts/local/00-finder.js#notifySources
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
let LC = null;
window._casoraLovelaceCfg = () => LC;
new Function(mod)();
const ext = window.CASORA_NOTIFY_EXTENSIONS[0];

const id = (n) => 'binary_sensor.wetter_warnung_' + n;
const slot = (n, a) => ({ entity_id: id(n), state: a ? 'on' : 'off', last_changed: new Date().toISOString(),
  attributes: { friendly_name: 'Wetter Warnung ' + n, device_class: 'safety', region: 'Teststadt', ...(a || {}) } });
const hass = {
  states: {
    [id(1)]: slot(1, { severity: 'Moderate', headline: 'Amtliche WARNUNG vor WINDBÖEN', event: 'WINDBÖEN',
      expires: new Date(Date.now() + 3600000).toISOString() }),
    [id(2)]: slot(2, { severity: 'Minor', headline: 'Amtliche WARNUNG vor FROST', event: 'FROST',
      expires: new Date(Date.now() + 7200000).toISOString() }),
    [id(3)]: slot(3), [id(4)]: slot(4), [id(5)]: slot(5),
  },
  entities: Object.fromEntries([1, 2, 3, 4, 5].map((n) => [id(n), { entity_id: id(n), platform: 'wetter', translation_key: 'warning', device_id: 'dev1' }])),
  devices: {}, areas: {},
};
// What casora-core's standing() hands in for an active safety binary_sensor.
const generic = () => [1, 2].map((n) => ({ id: 'casora:safety:' + id(n), label: 'Sicherheitswarnung', sub: 'Wetter Warnung ' + n, entity: id(n) }));
const bell = () => ext.standing(hass, generic(), { nameOf: (st) => st.attributes.friendly_name });
const tile = (entity, sensors) => ({ views: [{ cards: [{ type: 'custom:button-card', template: 'casora_weather_warning', entity, variables: { sensors } }] }] });
const WOPEN = ['casora_weather_warning', 'casora_popup_weather_warning'];

// Tile with slot 1 as device and slots 2–5 as warning sensors (the reporter's setup).
LC = tile(id(1), [2, 3, 4, 5].map(id));
let rows = bell();
assert.deepEqual(rows.filter((r) => String(r.id).startsWith('casora:safety:')), [], 'no generic „Sicherheitswarnung“ rows for warning slots');
const warn = rows.filter((r) => String(r.id).startsWith('casora:warning:'));
assert.deepEqual(warn.map((r) => [r.entity, r.label]).sort(),
  [[id(1), 'Wetterwarnung: Windböen'], [id(2), 'Wetterwarnung: Frost']], 'one row per active slot, named by its warning');
warn.forEach((r) => assert.deepEqual(r.opens, WOPEN, r.entity + ' opens the warning popup'));

// Tile with slot 1 only: the tile reads the other slots of its device (#196 auto), so slot 2 has its row too.
LC = tile(id(1), []);
rows = bell();
assert.deepEqual(rows.filter((r) => String(r.id).startsWith('casora:safety:')), [], 'slot 2 leaves no generic row either');
assert.deepEqual(rows.filter((r) => String(r.id).startsWith('casora:warning:')).map((r) => r.entity).sort(), [id(1), id(2)], 'the tile\'s slot and its device\'s other slot');
// A tile on another source: the slots of this device stay out (owner, 01.11.2026: the bell shows the tile's sources).
LC = tile('binary_sensor.other_warning', []);
assert.deepEqual(bell().filter((r) => String(r.id).startsWith('casora:warning:')).map((r) => r.entity), [], 'slots of another tile\'s device stay out');

// No warning tile on the dashboard: every slot is a source, as NINA.
LC = { views: [{ cards: [] }] };
assert.deepEqual(bell().filter((r) => String(r.id).startsWith('casora:warning:')).map((r) => r.entity).sort(), [id(1), id(2)]);

// A sensor of another integration picked in a warning tile counts as source too (no prefix, no registry key).
hass.entities = {};
LC = tile(id(1), [id(2)]);
rows = bell();
assert.deepEqual(rows.filter((r) => String(r.id).startsWith('casora:warning:')).map((r) => r.entity).sort(), [id(1), id(2)], 'picked sensors are sources');
assert.deepEqual(rows.filter((r) => String(r.id).startsWith('casora:safety:')), []);
// Logbook: an ended picked warning reads „Entwarnung“, not the generic safety text.
const d = ext.describe({ entity_id: id(2), state: 'off' }, hass.states[id(3)], 'on', {});
assert.equal(d && d.label, 'Entwarnung', 'logbook: Entwarnung for a picked sensor');
console.log('bell_warning_slots: ok');
