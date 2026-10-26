// Energy flow like HA's energy dashboard (#62, design E1) and the consumer list's top five (05-weich-mehr.js).
//   node dev/unit/energy_flow_e1.mjs
// Expected: circles only for the sources that exist (tile fields first, HA's energy settings for the house), the
// signs of tile and HA sensors read right, who feeds whom like HA (feed-in from solar first, battery charging from
// solar first), the dots' direction and calm speed, the home ring's shares adding up to 100, and long consumer lists
// cut to five with the rest behind "Alle N anzeigen".
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
new Function(src)();
const E = window._casoraSoftEnergy;
const M = E.flowE1Model;
for (const f of ['flowE1Model', 'flowSources', 'flowValues', 'flowDur', 'flowE1Geo', 'consSplit']) assert.equal(typeof E[f], 'function', f + ' missing');

const ALL = { solar: true, grid: true, battery: true, co2: false };
const on = (m) => Object.keys(m.edges).filter((k) => m.edges[k].on).sort();
const shown = (m) => Object.keys(m.nodes).filter((k) => m.nodes[k].show).sort();
const W = (m, k) => Math.round(m.edges[k].w);

// 1. Noon: solar 2412 W, battery charging 804 W, feed-in 712 W, home 896 W (the demo house).
let m = M({ has: ALL, solar: 2412, imp: 0, exp: 712, chg: 804, dis: 0, home: 896, soc: 64, lade: true });
assert.deepEqual(shown(m), ['battery', 'grid', 'home', 'solar'], 'noon: four circles, no CO2 without its sensor');
assert.deepEqual(on(m), ['sb', 'sg', 'sh'], 'noon: solar feeds home, battery and grid');
assert.deepEqual([W(m, 'sh'), W(m, 'sb'), W(m, 'sg')], [896, 804, 712]);
assert.equal(m.nodes.grid.label, 'Einspeisung');
assert.equal(m.nodes.grid.w, 712);
assert.equal(m.nodes.battery.label, 'Akku lädt');
assert.deepEqual([m.nodes.battery.soc, m.nodes.battery.w], [64, 804]);
assert.deepEqual(m.ring, [{ k: 'solar', pct: 100 }]);
assert.ok(m.top && m.bottom, 'top and bottom row');

// 2. Evening: no solar, battery discharges 380 W, grid 230 W; the ring shares add up to 100.
m = M({ has: ALL, solar: 0, imp: 230, exp: 0, chg: 0, dis: 380, home: 610, soc: 41, lade: true });
assert.deepEqual(on(m), ['bh', 'gh']);
assert.equal(m.nodes.grid.label, 'Netz');
assert.equal(m.nodes.battery.label, 'Akku entlädt');
assert.deepEqual(m.ring, [{ k: 'battery', pct: 62 }, { k: 'grid', pct: 38 }]);
assert.equal(m.ring.reduce((s, p) => s + p.pct, 0), 100);

// 3. Battery charges from the grid at night: the grid-battery line runs grid → battery.
m = M({ has: ALL, solar: 0, imp: 1500, exp: 0, chg: 1000, dis: 0, home: 500, lade: true });
assert.deepEqual(on(m), ['gb', 'gh']);
assert.deepEqual([W(m, 'gb'), W(m, 'gh'), m.edges.gb.rev], [1000, 500, false]);

// 4. Battery feeds the grid (more feed-in than solar): the same line runs battery → grid (reversed dots).
m = M({ has: ALL, solar: 200, imp: 0, exp: 700, chg: 0, dis: 900, home: 400, lade: true });
assert.deepEqual([W(m, 'sg'), W(m, 'gb'), m.edges.gb.rev, W(m, 'bh')], [200, 500, true, 400]);
assert.equal(m.edges.sh.on, false, 'all solar goes to the grid');

// 5. No battery: no battery circle, no bottom row, no battery lines.
m = M({ has: { solar: true, grid: true, battery: false }, solar: 400, imp: 200, exp: 0, home: 600 });
assert.deepEqual(shown(m), ['grid', 'home', 'solar']);
assert.ok(!m.bottom && !m.edges.sb.show && !m.edges.bh.show && !m.edges.gb.show);
assert.deepEqual(on(m), ['gh', 'sh']);
assert.deepEqual(m.ring, [{ k: 'solar', pct: 67 }, { k: 'grid', pct: 33 }]);

// 6. No solar (battery and grid): no top row, no solar lines.
m = M({ has: { solar: false, grid: true, battery: true }, imp: 100, dis: 300, home: 400, soc: 80, lade: true });
assert.deepEqual(shown(m), ['battery', 'grid', 'home']);
assert.ok(!m.top && m.bottom && !m.edges.sh.show && !m.edges.sg.show && !m.edges.sb.show);

// 7. No grid sensor: solar beyond the home's need is not invented as home power.
m = M({ has: { solar: true, grid: false, battery: false }, solar: 900, home: 300 });
assert.deepEqual(shown(m), ['home', 'solar']);
assert.equal(W(m, 'sh'), 300);
assert.ok(!m.edges.gh.show && !m.edges.sg.show);

// 8. Home without its own sensor: the sum of what flows in.
m = M({ has: ALL, solar: 1000, imp: 50, exp: 300, chg: 200, dis: 0, home: null, lade: true });
assert.equal(m.nodes.home.w, 550);

// 9. Nothing known yet: "—" (null), no dots, plain ring; a battery without power sensors says just "Akku".
m = M({ has: ALL, solar: null, imp: null, exp: null, chg: null, dis: null, home: null, soc: 50, lade: false });
assert.deepEqual([m.nodes.home.w, m.nodes.grid.w, m.nodes.solar.w, m.nodes.battery.w], [null, null, null, null]);
assert.deepEqual(on(m), []);
assert.deepEqual(m.ring, []);
assert.equal(m.nodes.battery.label, 'Akku');
// Small values (≤ 5 W) count as no flow.
m = M({ has: ALL, solar: 4, imp: 3, exp: 0, chg: 2, dis: 0, home: 7, lade: true });
assert.deepEqual(on(m), []);
assert.equal(m.nodes.battery.label, 'Akku bereit');

// 10. CO2 circle only with its sensor and a grid; it keeps the top row without solar.
m = M({ has: { solar: false, grid: true, battery: true, co2: true }, imp: 300, dis: 0, home: 300, co2: 76, lade: true });
assert.ok(m.nodes.co2.show && m.top && m.edges.co2.show && !m.edges.co2.on);
assert.equal(m.nodes.co2.pct, 76);

// 11. Dots: calm, a little faster with more power, never slower; in quarter seconds.
const d = [0, 50, 300, 1000, 3000, 10000].map(E.flowDur);
for (let i = 1; i < d.length; i++) assert.ok(d[i] <= d[i - 1], 'faster with more power ' + d);
assert.ok(d[0] <= 3.25 && d[d.length - 1] >= 1.25, 'calm range ' + d);
assert.ok(d.every((x) => Math.round(x * 4) === x * 4), 'quarter seconds');
assert.equal(E.flowDur(1000), E.flowDur(1010), 'small changes keep the pace');

// 12. Geometry: height follows the rows (no top row → lower), fixed per set of sources.
const g = E.flowE1Geo(true, true), g2 = E.flowE1Geo(false, true), g3 = E.flowE1Geo(true, false);
assert.ok(g.H > g2.H && g.H > g3.H && g.y0 < g.y1 && g.y1 < g.y2);

// 13. Sensors: the tile's fields first; HA's energy settings fill in only for the house; a room gets none.
const st = (v, unit = 'W') => ({ state: String(v), attributes: { unit_of_measurement: unit, device_class: unit === '%' ? 'battery' : 'power' } });
const states = {
  'sensor.home': st(896), 'sensor.solar': st(2.412, 'kW'), 'sensor.bat': st(804), 'sensor.soc': st(64, '%'),
  'sensor.netz': st(0), 'sensor.einsp': st(712),
  'sensor.ha_grid': st(-712), 'sensor.ha_solar': { state: 'unavailable', attributes: { unit_of_measurement: 'W', device_class: 'power' } },
  'sensor.ha_bat': st(-804), 'sensor.ha_soc': st(64, '%'), 'sensor.co2_fossil': st(24, '%'),
};
const hass = { states, entities: { 'sensor.co2_fossil': { entity_id: 'sensor.co2_fossil', platform: 'co2signal' } } };
window.casoraEnergyPowers = () => ({ grid: ['sensor.ha_grid'], solar: ['sensor.ha_solar'], battery: ['sensor.ha_bat'] });
window.casoraEnergyBatterySoc = () => 'sensor.ha_soc';
// Tile (Studio): battery power positive while charging, separate feed-in sensor.
let F = E.flowSources({ home: 'sensor.home', solar: 'sensor.solar', battery: 'sensor.bat', soc: 'sensor.soc', grid: 'sensor.netz', export: 'sensor.einsp' }, hass, states, true);
assert.deepEqual(F.has, { solar: true, battery: true, grid: true, co2: true });
let v = E.flowValues(F, states);
assert.deepEqual([v.solar, v.chg, v.dis, v.imp, v.exp, v.home, v.soc, v.co2], [2412, 804, 0, 0, 712, 896, 64, 76], 'tile signs, kW → W');
assert.ok(E.flowSources.ids(F).includes('sensor.co2_fossil') && E.flowSources.ids(F).includes('sensor.bat'));
// House sensor only: HA's settings give solar, battery (positive = discharge) and grid (negative = feed-in).
F = E.flowSources({ home: 'sensor.home' }, hass, states, true);
v = E.flowValues(F, states);
assert.deepEqual([v.solar, v.chg, v.dis, v.imp, v.exp, v.soc], [0, 804, 0, 0, 712, 64], 'HA signs; solar asleep = 0 W');
// b7: the auto-detected Anker Solix charge/discharge sensors (C.charge/C.discharge) are only the fallback – HA's
// battery wins for the house; without a battery in the settings (or for a room) Anker stays.
states['sensor.anker_chg'] = st(999); states['sensor.anker_dis'] = st(0);
F = E.flowSources({ home: 'sensor.home', charge: 'sensor.anker_chg', discharge: 'sensor.anker_dis' }, hass, states, true);
assert.deepEqual([F.batHa, F.chg, F.dis], [['sensor.ha_bat'], undefined, undefined], 'HA battery before Anker');
v = E.flowValues(F, states);
assert.deepEqual([v.chg, v.dis], [804, 0], 'values from HA, not 999 W from Anker');
window.casoraEnergyPowers = () => ({ grid: ['sensor.ha_grid'], solar: ['sensor.ha_solar'], battery: [] });
F = E.flowSources({ home: 'sensor.home', charge: 'sensor.anker_chg', discharge: 'sensor.anker_dis' }, hass, states, true);
assert.deepEqual([F.batHa, F.chg], [undefined, 'sensor.anker_chg'], 'no battery in the settings: Anker as fallback');
window.casoraEnergyPowers = () => ({ grid: ['sensor.ha_grid'], solar: ['sensor.ha_solar'], battery: ['sensor.ha_bat'] });
// A battery field of the tile (Studio) stays first.
F = E.flowSources({ home: 'sensor.home', battery: 'sensor.bat', charge: 'sensor.anker_chg' }, hass, states, true);
assert.deepEqual([F.batHa, F.chg], [undefined, 'sensor.anker_chg'], 'Studio battery field: settings do not replace it');
// A room (not the house): nothing from the settings, so no flow without the tile's fields.
assert.equal(E.flowSources({ home: 'sensor.home' }, hass, states, false), null);
// Grid alone draws no flow (it would only repeat the house's power).
window.casoraEnergyPowers = () => ({ grid: ['sensor.ha_grid'], solar: [], battery: [] });
assert.equal(E.flowSources({ home: 'sensor.home' }, hass, states, true), null);
// The tile's grid sensor alone: negative = feed-in.
F = E.flowSources({ home: 'sensor.home', solar: 'sensor.solar', grid: 'sensor.ha_grid' }, hass, states, false);
v = E.flowValues(F, states);
assert.deepEqual([v.imp, v.exp, F.has.battery, F.has.co2], [0, 712, false, false]);

// 14. Consumers: up to five as they are, more → five plus the rest.
const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: 'R' + i }));
assert.deepEqual(E.consSplit(rows(5)), { top: rows(5), rest: [] });
assert.deepEqual(E.consSplit(rows(3)).rest, []);
const s23 = E.consSplit(rows(23));
assert.deepEqual([s23.top.length, s23.rest.length, s23.top[4].label, s23.rest[0].label], [5, 18, 'R4', 'R5']);
// The popup's list: "Alle 23 anzeigen" with the rest inside, nothing extra for five.
const more = [];
window._casoraUI = { label: (t) => '[' + t + ']', group: (r) => 'G' + r.length, more: (id, html, o) => { more.push([id, html, o.label, o.less]); return 'M'; } };
const L = rows(23).map((r, i) => ({ id: 'sensor.e' + i, name: 'Gerät ' + i, power: 'sensor.p' + i, w: 100 - i }));
window.casoraEnergyConsumers = () => L;
window.casoraVisibleIdsNow = (ids) => ids;
const html = E.sec('auto', { auto: { ha: true }, home: 'sensor.home' }, states, hass);
assert.match(html, /^\[Verbraucher\]G5/);
assert.deepEqual(more, [['energy-cons', 'G18', 'Alle 23 anzeigen', 'Weniger anzeigen']]);
window.casoraEnergyConsumers = () => L.slice(0, 5);
more.length = 0;
assert.equal(E.sec('auto', { auto: { ha: true }, home: 'sensor.home' }, states, hass), '[Verbraucher]G5');
assert.equal(more.length, 0);

console.log('energy_flow_e1: ok');
