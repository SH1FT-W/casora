// Detail round 01.11.2026 #1: the energy tile and the house badge showed the battery in opposite directions for the same
// values (tile „Akku entlädt“, badge „Akku lädt“). A battery power sensor that is also in HA's energy settings has HA's
// sign (positive = discharging) – the tile reads it that way too; a sensor only the tile names keeps the tile's sign
// (positive = charging). Both views then add up: solar 1840 = home 620 + feed-in 520 + charging 700.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
new Function(src)();
const E = window._casoraSoftEnergy;
const W = (s) => ({ state: String(s), attributes: { unit_of_measurement: 'W', device_class: 'power' } });
const S = { 'sensor.solar': W(1840), 'sensor.home': W(620), 'sensor.bat': W(-700), 'sensor.grid': W(-520) };
const hass = { states: S, entities: {} };
const C = { solar: 'sensor.solar', home: 'sensor.home', battery: 'sensor.bat', grid: 'sensor.grid' };
const run = (prefsBattery) => {
  window.casoraEnergyPowers = () => ({ grid: ['sensor.grid'], solar: ['sensor.solar'], battery: prefsBattery });
  const F = E.flowSources(C, hass, S, false);
  return { F, v: E.flowValues(F, S) };
};
// In HA's settings: −700 = charging.
let r = run(['sensor.bat']);
assert.deepEqual(r.F.batHa, ['sensor.bat'], 'tile battery read with HA sign when HA knows the sensor');
assert.equal(r.v.chg, 700, 'charging 700 W'); assert.equal(r.v.dis, 0, 'not discharging');
assert.ok(Math.abs(r.v.solar - (r.v.home + r.v.exp + r.v.chg)) < 1, 'balance: solar = home + feed-in + charging');
// The house badge (HA's settings) and the tile agree.
const house = E.flowSources({ home: 'sensor.home' }, hass, S, true);
const vh = E.flowValues(house, S);
assert.equal(vh.chg, r.v.chg, 'badge and tile: same charging'); assert.equal(vh.dis, r.v.dis, 'badge and tile: same discharging');
// A sensor HA does not know keeps the tile's sign (positive = charging).
r = run([]);
assert.equal(r.F.batTile, 'sensor.bat', 'own sensor: tile sign');
assert.equal(r.v.dis, 700, 'tile sign: −700 discharging');
console.log('energy_battery_sign: ok');
