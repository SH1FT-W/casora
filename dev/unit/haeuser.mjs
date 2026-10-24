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

// Shared finder: energy settings loader (casoraEnergyPrefs), device lookups and the plant check (casoraIsPlant).
new Function(src('custom_components/casora/scripts/local/00-finder.js'))();
// Studio: the real panel class (new-tile finder, field placeholders) and the assistant, loaded with a stub DOM;
// the globals go back afterwards.
const studio = (() => {
  const names = ['document', 'customElements', 'setTimeout', 'requestAnimationFrame', 'matchMedia', 'fetch', 'HTMLElement',
    'innerWidth', 'innerHeight', 'localStorage'];
  const keep = Object.fromEntries(names.map((n) => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const noop = () => {};
  let Panel = null;
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
  const set = (n, v) => Object.defineProperty(globalThis, n, { value: v, configurable: true, writable: true });
  set('document', stub());
  set('customElements', { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) });
  set('setTimeout', () => 0);
  set('requestAnimationFrame', () => 0);
  set('matchMedia', (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop }));
  set('fetch', () => Promise.reject(new Error('offline')));
  set('HTMLElement', class {});
  set('innerWidth', 1400);
  set('innerHeight', 900);
  set('localStorage', { getItem: () => null, setItem: noop, removeItem: noop });
  const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
  const info = console.info;
  console.info = noop;
  new Function(fix(src('custom_components/casora/panel/casora-panel-types.js')))();
  new Function(fix(src('custom_components/casora/panel/casora-panel.js')))();
  new Function(src('custom_components/casora/panel/casora-panel-assist.js'))();
  console.info = info;
  names.forEach((n) => { if (keep[n]) Object.defineProperty(globalThis, n, keep[n]); else delete globalThis[n]; });
  assert.ok(Panel, 'panel class');
  return { P: Panel.prototype, I: window.__casoraPanelInternals };
})();
const typeOf = (id) => { const t = studio.I.TILE_TYPES.find((x) => x.id === id); assert.ok(t, 'tile type ' + id); return t; };
// Studio: house sensor.
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
// Dashboard: the same pick for badges without their own sensor.
const basis = src('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraHousePowerIds = function');
new Function(basis.slice(b0, basis.indexOf('\nwindow._casoraRoomNames', b0)))();
// Laundry, dishwasher and 3D printer blocks of 02-devices.js.
const dv = src('custom_components/casora/scripts/local/02-devices.js');
const block = (start) => {
  const a = dv.indexOf(start), b = dv.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(dv.slice(a, b + 6))();
};
block('(function () {\n  if (window._casoraLaundry) return;');
block('(function () {\n  if (window._casoraDish || !window._casoraLaundry) return;');
block('(function () {\n  if (window._casoraPrint || !window._casoraLaundry) return;');
// Energy flow popup roles.
new Function(src('custom_components/casora/scripts/local/20-energie-fokus.js'))();
const F = window._casoraEnergyFocus;
// Home energy popup (Weich) with the sum casora-core.js uses; a UI stub that returns the hero as an object.
const core = src('custom_components/casora/scripts/casora-core.js');
const ps0 = core.indexOf('if (window._casoraPowerSum) return;');
new Function(core.slice(core.lastIndexOf('(function () {', ps0), core.indexOf('})();', ps0) + 5))();
window._casoraUI = { more: () => '', label: (t) => '[' + t + ']', group: () => 'G', hero: (o) => o };
new Function(src('custom_components/casora/scripts/local/05-weich-mehr.js'))();
const SE = window._casoraSoftEnergy;
// Room climate tile/popup (casora_vent) and the hidden rows of automatic popups (casoraPopupHide, issue #54).
globalThis.setInterval = () => 0;
window.casoraSvc = (n) => ({ domain: 'casora', service: n });
window._casoraUI._casoraLabelInside = true; // the module's HTML wrapper of UI.group stays off the stub
new Function(src('custom_components/casora/scripts/local/05-standard-medien.js'))();
const VENT = window._casoraVent, HIDE = window.casoraPopupHide;
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
    // The Studio's "why" line agrees with the pick: the picked sensor has a reason.
    if (X.house_power) { assert.ok(B.housePowerWhy(hass, X.house_power), at('house sensor has a reason')); checks++; }
  }
  if ('house_power_why' in X) {
    assert.deepEqual(B.housePowerWhy(hass, X.house_power), X.house_power_why, at('why line for the house sensor'));
    checks++;
  }
  // Home's lights after "Start fresh": the HA group over the house, or the badge follows the rooms
  // (light_rooms_auto) and the house list comes from the rooms' light badges (casoraBasis.houseLights).
  if (X.house_lights) {
    const want = X.house_lights;
    const areas = Object.values(H.areas || {}).map((a) => a.name);
    // The plan needs the real tile types (the assistant finds the lamps by them).
    const keepTypes = window.__casoraPanelInternals.TILE_TYPES;
    window.__casoraPanelInternals.TILE_TYPES = studio.I.TILE_TYPES;
    const p = B.plan(hass, areas, { ...B.DEFAULTS });
    const { vars } = B.tilesOf(p, hass);
    window.__casoraPanelInternals.TILE_TYPES = keepTypes;
    const home = vars[p.rooms[0].name] || {};
    assert.equal(home.light_group_entity || null, want.group, at('house light group'));
    assert.equal(home.light_rooms_auto === true, !!want.auto, at('house badge follows the rooms'));
    const rooms = p.rooms.slice(1).map((r) => ({ name: r.name, variables: vars[r.name] || {} }));
    const hl = B.houseLights(hass, rooms);
    assert.deepEqual(hl.rooms.map((r) => r.name), want.rooms, at('house list: rooms'));
    assert.deepEqual([...hl.ids].sort(), [...want.ids].sort(), at('house list: lights'));
    for (const [name, rid] of Object.entries(want.room_groups || {})) {
      assert.equal((hl.rooms.find((r) => r.name === name) || {}).rid || null, rid, at('house list: group of ' + name));
      checks++;
    }
    checks += 4;
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
  // Studio: main entity of a new tile, field placeholders, the assistant.
  const home = { path: 'home', name: 'Home', tiles: [], variables: {} };
  const panel = () => { const p = Object.create(studio.P); p._hass = hass; p._state = { compact: { rooms: [home] } }; return p; };
  for (const [tid, want] of Object.entries(X.studio_main || {})) {
    const got = studio.P._tileCandidates.call(panel(), typeOf(tid), home).map((c) => c.id);
    assert.deepEqual(got, want, at('new tile ' + tid));
    checks++;
  }
  for (const [tid, spec] of Object.entries(X.studio_fields || {})) {
    const type = typeOf(tid), tile = { entity: spec.entity, variables: {} };
    for (const [key, want] of Object.entries(spec.fields || {})) {
      const fld = (type.fields || []).find((x) => x.key === key);
      assert.ok(fld && fld.find, at(tid + ' field ' + key + ' has a finder'));
      assert.equal(window.casoraFieldEntity(fld, tile, hass), want, at(tid + ' field ' + key));
      checks++;
      // The hint under the empty field names the same entity and where it was found.
      const why = window.casoraFieldWhy(fld, tile, hass);
      assert.equal(why ? why.id : null, want, at(tid + ' field ' + key + ' why line'));
      if (spec.why && key in spec.why) assert.equal(why && why.text.replace('{source}', why.source), spec.why[key], at(tid + ' why ' + key));
      checks++;
    }
  }
  if (X.assist) {
    const rooms = [home].concat(Object.values(H.areas || {}).map((a) => ({ path: a.area_id, name: a.name, tiles: [], variables: {} })));
    const sug = window.casoraAssist.suggest(hass, rooms, studio.I.TILE_TYPES);
    for (const [tid, want] of Object.entries(X.assist)) {
      assert.deepEqual(sug.filter((x) => x.type === tid).map((x) => x.entity).sort(), [...want].sort(), at('assistant ' + tid));
      checks++;
    }
  }
  if (X.printer) {
    const c = window._casoraPrint.resolve({ entity_id: X.printer.entity }, {}, H.states, hass);
    for (const [k, want] of Object.entries(X.printer.fields || {})) { assert.equal(c[k], want, at('printer ' + k)); checks++; }
  }
  if (X.cameras) { assert.deepEqual(window._casoraCams({}, null, hass), X.cameras, at('cameras tile')); checks++; }
  // Room climate tile on a page: Zuhause = the house, a room = its own rows, an outdoor room = the outdoor
  // air only, a room without sensors = the empty state (issue #54). Names as the dashboard's room pages.
  const grp = window._casoraUI.group;
  window._casoraUI.group = (rows, label) => ({ rows, label });
  for (const [page, want] of Object.entries(X.vent || {})) {
    const here = /^(zuhause|home)$/i.test(page) ? null : { name: page };
    const m = VENT.model(H.states, {}, here);
    assert.equal(m.mode, want.mode, at('vent ' + page + ' mode'));
    assert.deepEqual(m.rooms.map((x) => x.n), want.rooms, at('vent ' + page + ' rows'));
    checks += 2;
    if (want.tile !== undefined) { assert.equal(VENT.tile(H.states, {}, here), want.tile, at('vent ' + page + ' tile')); checks++; }
    if (want.out) {
      const C = { hide: [], scope: m.scope };
      assert.deepEqual(VENT.sec('out', H.states, C).rows.map((r) => r.label), want.out, at('vent ' + page + ' outdoor rows'));
      assert.equal(VENT.sec('rooms', H.states, C), '', at('vent ' + page + ' no room rows'));
      assert.equal(VENT.sec('coach', H.states, C), '', at('vent ' + page + ' no house coach'));
      checks += 3;
    }
  }
  // Hidden rows per tile (variables.popup_hide): popup and tile skip them, the Studio list keeps them.
  for (const [tpl, want] of Object.entries(X.popup_hide || {})) {
    const vars = { popup_hide: want.hide };
    if (tpl === 'casora_vent') {
      assert.deepEqual(VENT.model(H.states, vars, null).rooms.map((x) => x.n), want.rooms, at('popup_hide vent rows'));
      assert.equal(VENT.tile(H.states, vars, null), want.tile, at('popup_hide vent tile'));
      checks += 2;
    } else if (tpl === 'casora_battery') {
      assert.deepEqual(HIDE.batteries(H.states, vars, hass).map((e) => e.entity_id), want.rows, at('popup_hide battery rows'));
      checks++;
    }
    assert.deepEqual(HIDE.entries(tpl, hass, vars, null).map((e) => e.id), want.studio, at('popup_hide Studio list ' + tpl));
    checks++;
  }
  window._casoraUI.group = grp;
  if (X.cameras_chosen) {
    assert.deepEqual(window._casoraCams({ cameras: X.cameras_chosen.pick }, null, hass), X.cameras_chosen.want, at('cameras tile, chosen'));
    checks++;
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
  // #44: HA's "individual devices" are the popup's consumers, by power; the sources' sensors and any other power
  // sensor (wallbox, inverter strings) never appear.
  if (X.energy_consumers) {
    const L = window.casoraEnergyConsumers(hass) || [];
    assert.deepEqual(L.map((x) => ({ id: x.id, power: x.power, name: x.name })), X.energy_consumers, at('energy consumers'));
    checks++;
  }
  if (X.energy_not_consumers) {
    const L = window.casoraEnergyConsumers(hass) || [];
    const used = L.map((x) => x.power).concat(L.map((x) => x.id));
    for (const id of X.energy_not_consumers) { assert.ok(used.indexOf(id) < 0, at('not a consumer: ' + id)); checks++; }
  }
  // #44: the battery's charge level for its power sensor, in the flow popups (peers) and the "Woher kommt der Strom" row.
  for (const [pw, want] of Object.entries(X.energy_battery_soc || {})) {
    assert.equal(window.casoraEnergyBatterySoc(hass, pw), want.soc, at('battery SoC for ' + pw));
    assert.equal(F.peers(hass, {}).battery.soc || null, want.soc, at('peers: battery SoC'));
    checks += 2;
    if (want.row) {
      const rows = [], grp0 = window._casoraUI.group;
      window._casoraUI.group = (r) => { rows.push(...r); return 'G'; };
      const ids = X.house_list || window.casoraEnergyHouse(hass).ids;
      SE.sec('sources', { sum: { energy_entities: ids }, sources: window.casoraEnergySources(hass, ids) }, H.states, hass);
      window._casoraUI.group = grp0;
      const row = rows.find((r) => r.entity === pw);
      assert.equal(row && row.sub, want.row, at('battery row with the charge level'));
      checks++;
    }
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
