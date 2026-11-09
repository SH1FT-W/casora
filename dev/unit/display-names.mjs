// Casora display names never invent a label when nothing was set.
//   node dev/unit/display-names.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const win = {};
const box = { window: win, console };
vm.createContext(box);
vm.runInContext(read('../../custom_components/casora/scripts/local/45-display-names.js'), box);
const N = win._casoraDisplayNames;
assert.equal(N.label(null, 'switch.pump'), '');
win.CASORA_SETTINGS = { names: { entities: { 'switch.pump': 'Pumpe' }, devices: { dev1: 'Boblebad' } } };
const hass = { entities: { 'sensor.temp': { device_id: 'dev1' } } };
assert.equal(N.label(hass, 'switch.pump'), 'Pumpe');
assert.equal(N.label(hass, 'sensor.temp'), 'Boblebad');
assert.equal(N.label(hass, 'light.other'), '');
assert.ok(read('../../custom_components/casora/scripts/casora-local.js').includes("'45-display-names'"));
assert.ok(read('../../custom_components/casora/panel/casora-panel.js').includes('Name in Casora'));
