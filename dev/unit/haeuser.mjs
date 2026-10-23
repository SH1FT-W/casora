// Real houses (dev/unit/haeuser/*.json, anonymised from issues): every recognition Casora does runs over
// every house and must find what the house's "expect" says. See dev/unit/haeuser/README.md.
//   node dev/unit/haeuser.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const src = (p) => fs.readFileSync(new URL(p, root), 'utf8');
let current = null;
globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' && current ? { hass: current } : null),
  addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
globalThis.addEventListener = () => {};
globalThis.location = { pathname: '/casora/home' };

// Shared finder: energy settings loader (casoraEnergyPrefs) and device lookups.
new Function(src('custom_components/casora/scripts/local/00-finder.js'))();
// Studio: house sensor.
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
// Dashboard: the same pick for badges without their own sensor.
const basis = src('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraHousePowerIds = function');
new Function(basis.slice(b0, basis.indexOf('\nwindow._casoraRoomNames', b0)))();
// Shared plant check (top of casora-core.js).
const core = src('custom_components/casora/scripts/casora-core.js');
const p0 = core.indexOf('window.CASORA_PLANT_PLUS');
new Function(core.slice(p0, core.indexOf('\n};', core.indexOf('window.casoraIsPlant', p0)) + 3))();
// Laundry and dishwasher blocks of 02-devices.js.
const dv = src('custom_components/casora/scripts/local/02-devices.js');
const block = (start) => {
  const a = dv.indexOf(start), b = dv.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(dv.slice(a, b + 6))();
};
block('(function () {\n  if (window._casoraLaundry) return;');
block('(function () {\n  if (window._casoraDish || !window._casoraLaundry) return;');
// Energy flow popup roles.
new Function(src('custom_components/casora/scripts/local/20-energie-fokus.js'))();
const F = window._casoraEnergyFocus;

const dir = new URL('dev/unit/haeuser/', root);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
assert.ok(files.length, 'houses found');
let checks = 0;
for (const f of files) {
  const H = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const hass = { states: H.states, entities: H.entities, devices: H.devices, areas: H.areas,
    callWS: () => Promise.resolve(H.energy_prefs || {}) };
  const X = H.expect || {};
  const at = (what) => f + ': ' + what;
  current = hass;
  await window.casoraEnergyPrefs.load(hass, true);
  if ('house_list' in X) {
    const h = window.casoraEnergyHouse(hass);
    assert.deepEqual(h ? h.ids : null, X.house_list, at('house list from the energy settings'));
    delete window._casoraHPGuess;
    assert.deepEqual(window._casoraHousePowerIds(), X.house_list, at('house list (dashboard)'));
    checks += 2;
  }
  if ('house_power' in X) {
    assert.equal(B.housePower(hass), X.house_power, at('house sensor (Studio)'));
    delete window._casoraHPGuess;
    assert.equal(window._casoraHousePower(), X.house_power, at('house sensor (dashboard)'));
    checks += 2;
  }
  for (const id of X.plants || []) { assert.ok(window.casoraIsPlant(hass, id), at('plant ' + id)); checks++; }
  for (const id of X.not_plants || []) { assert.ok(!window.casoraIsPlant(hass, id), at('no plant ' + id)); checks++; }
  if (X.dishwasher) {
    const c = window._casoraDish.resolve({ entity_id: X.dishwasher.entity }, {}, H.states, hass);
    for (const [k, want] of Object.entries(X.dishwasher.fields || {})) { assert.equal(c[k], want, at('dishwasher ' + k)); checks++; }
  }
  for (const [id, want] of Object.entries(X.energy_roles || {})) {
    assert.equal(F.detect(hass, { energy_entity_1: id }, 1), want, at('energy role ' + id));
    checks++;
  }
  current = null;
}
console.log('haeuser: ok (' + files.length + ' Häuser, ' + checks + ' Prüfungen)');
