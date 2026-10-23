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
// Home energy popup (Weich) with the sum casora-core.js uses; a UI stub that returns the hero as an object.
const ps0 = core.indexOf('if (window._casoraPowerSum) return;');
new Function(core.slice(core.lastIndexOf('(function () {', ps0), core.indexOf('})();', ps0) + 5))();
window._casoraUI = { more: () => '', label: (t) => '[' + t + ']', group: () => 'G', hero: (o) => o };
new Function(src('custom_components/casora/scripts/local/05-weich-mehr.js'))();
const SE = window._casoraSoftEnergy;
// The hero of the Home popup over a list, as the popup builds it (its card code run as button-card would).
const homeHero = (hass, ids) => {
  const out = SE.build({ hass, states: hass.states, variables: { power_entities: ids }, powerId: null });
  const m = JSON.stringify(out).match(/\[\[\[\\n(return window\._casoraSoftEnergy \? window\._casoraSoftEnergy\.sec\(\\"hero\\".*?)\\n\]\]\]/);
  assert.ok(m, 'home popup hero found');
  return new Function('states', 'hass', JSON.parse('"' + m[1] + '"'))(hass.states, hass);
};

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
  // Washer, dryer, dishwasher: the device behind the entity by the shared source table (casoraLaundryFind).
  for (const L of X.laundry || []) {
    const dev = (H.entities[L.entity] || {}).device_id;
    const c = window.casoraLaundryFind.classify(hass, dev, ['washer', 'dryer', 'dishwasher']);
    assert.ok(c, at('laundry device of ' + L.entity));
    assert.equal(c.role, L.role, at('laundry role ' + L.entity));
    assert.equal(c.source, L.source, at('laundry source ' + L.entity));
    checks += 3;
    for (const [k, want] of Object.entries(L.fields || {})) { assert.equal(c.f[k] || null, want, at('laundry ' + k)); checks++; }
    if (L.state_text) { assert.equal(window._casoraLaundry.state(H.states, c.state)[0], L.state_text, at('laundry state text')); checks++; }
  }
  for (const id of X.not_laundry || []) {
    assert.equal(window.casoraLaundryFind.classify(hass, (H.entities[id] || {}).device_id, ['washer', 'dryer', 'dishwasher']), null,
      at('no laundry device: ' + id));
    checks++;
  }
  if (X.dishwasher) {
    const c = window._casoraDish.resolve({ entity_id: X.dishwasher.entity }, {}, H.states, hass);
    for (const [k, want] of Object.entries(X.dishwasher.fields || {})) { assert.equal(c[k], want, at('dishwasher ' + k)); checks++; }
  }
  for (const [id, want] of Object.entries(X.energy_roles || {})) {
    assert.equal(F.detect(hass, { energy_entity_1: id }, 1), want, at('energy role ' + id));
    checks++;
  }
  // Flow popups without sub-badges: the system's power sensor per role.
  if (X.energy_peers) {
    const P = F.peers(hass, {});
    for (const [role, want] of Object.entries(X.energy_peers)) { assert.equal(P[role].power || null, want, at('energy peer ' + role)); checks++; }
  }
  // Night: the states replaced, the Home popup's hero and the focus popups' heroes as written.
  if (X.energy_night) {
    const N = X.energy_night, saved = {};
    for (const [id, state] of Object.entries(N.states || {})) { saved[id] = H.states[id].state; H.states[id].state = state; }
    if (N.home) {
      const h = homeHero(hass, X.house_list || window.casoraEnergyHouse(hass).ids);
      assert.equal(h.value, N.home, at('night: home hero'));
      assert.ok(!/ohne Wert/.test(h.sub || ''), at('night: no device without a value (' + h.sub + ')'));
      checks += 2;
    }
    for (const [focus, want] of Object.entries(N.focus || {})) {
      const h = F.sec('hero', F.model(hass, focus, F.peers(hass, {}), null), H.states, hass);
      assert.equal(h.value, want, at('night: ' + focus + ' hero'));
      checks++;
    }
    for (const [id, state] of Object.entries(saved)) H.states[id].state = state;
  }
  current = null;
}
console.log('haeuser: ok (' + files.length + ' Häuser, ' + checks + ' Prüfungen)');
