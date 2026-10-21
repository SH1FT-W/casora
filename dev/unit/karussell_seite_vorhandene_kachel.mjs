// A carousel page for a device that already has a tile in the room: the page is a copy of that tile
// (its tile type, popup and variables, e.g. underfloor heating with casora_popup_fbh and its sensor),
// not a fresh tile of the suggested type – the thermostat pages showed another popup than the tiles.
//   node dev/unit/karussell_seite_vorhandene_kachel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const noop = () => {};
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
const defined = {};
globalThis.window = { addEventListener: noop, location: { pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: (n, c) => { defined[n] = c; }, whenDefined: () => new Promise(() => {}) };
globalThis.document = stub();
globalThis.localStorage = { getItem: () => null, setItem: noop };
const log = console.info;
console.info = noop;
new Function(fix(fs.readFileSync(new URL('casora-panel-types.js', dir), 'utf8')))();
new Function(fix(fs.readFileSync(new URL('casora-panel.js', dir), 'utf8')))();
console.info = log;
const Panel = Object.values(defined).find((c) => c && c.prototype && c.prototype._carouselPageTile);
assert.ok(Panel, 'panel class');
const p = Object.create(Panel.prototype);

const fbh = { type: 'custom:button-card', template: ['casora_thermostat', 'casora_popup_fbh'], entity: 'climate.floor_test',
  name: 'Floor heating', enabled: false, variables: { temp_sensor: 'sensor.floor_test_temp', size: 'small' } };
const room = { name: 'Bath', tiles: [fbh, { type: 'custom:casora-swipe-card', cards: [] }] };
const page = p._carouselPageTile({ type: 'thermostat', entity: 'climate.floor_test', name: 'Floor heating' }, room);
assert.deepEqual(page.template, ['casora_thermostat', 'casora_popup_fbh'], 'own tile type and popup');
assert.equal(page.variables.temp_sensor, 'sensor.floor_test_temp', 'own variables');
assert.equal(page.enabled, undefined, 'the page is shown');
assert.notEqual(page, fbh, 'a copy, the room tile stays as it is');
assert.equal(fbh.enabled, false);
console.log('ok karussell_seite_vorhandene_kachel');
