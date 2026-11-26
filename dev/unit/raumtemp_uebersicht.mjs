// Test round 26.11.2026 (u05-01): the bath thermostat stands on Home (the overview lists every thermostat of the house)
// and in the bath. Tile, popup and Verlauf read the room temperature of the first room whose header lists it – that was
// Home, so the bath showed the house mean instead of the bath sensor its Klima badge shows. The overview only counts
// when no other room lists the thermostat.
//   node dev/unit/raumtemp_uebersicht.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraRoomTempOf,casoraRoomTempIds,casoraThermoHistoryOf
import fs from 'node:fs';
import assert from 'node:assert/strict';

const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const b0 = basis.indexOf('window.casoraRoomTempOf = function');
const part = basis.slice(b0, basis.indexOf('window.casoraPopupTitle = function', b0));
const mk = (cfg) => { const window = { _casoraLovelaceCfg: () => cfg }; new Function('window', part)(window); return window; };

const T = (v) => ({ state: String(v), attributes: { device_class: 'temperature' } });
const S = {
  'climate.example_bath': { state: 'off', attributes: { current_temperature: 21.0 } },
  'climate.example_hall': { state: 'heat', attributes: { current_temperature: 20.0 } },
  'sensor.example_house_mean': T(21.37),
  'sensor.example_bath_floor': T(21.1),
};
const homeVars = { climate_entity_1: 'climate.example_bath', climate_entity_2: 'climate.example_hall', temp_sensor_1: 'sensor.example_house_mean' };
const bathVars = { climate_entity_1: 'climate.example_bath', temp_sensor_1: 'sensor.example_bath_floor' };
const view = (path, vars) => ({ path, cards: [{ type: 'vertical-stack', cards: [{ template: 'casora_room', variables: vars }] }] });

// The reported case: Home first (path home), the bath after it.
{
  const w = mk({ views: [view('home', homeVars), view('bad', bathVars)] });
  assert.equal(w.casoraRoomTempOf('climate.example_bath', S), 21.1, 'the bath reads the bath sensor, not the house mean');
  assert.deepEqual(w.casoraThermoHistoryOf('climate.example_bath', null, S), { entity: 'sensor.example_bath_floor', attribute: null });
  // A thermostat only Home lists keeps the house reading.
  assert.equal(w.casoraRoomTempOf('climate.example_hall', S), 21.4);
}
// Without a view on path home the first view is the overview.
{
  const w = mk({ views: [view('start', homeVars), view('bad', bathVars)] });
  assert.equal(w.casoraRoomTempOf('climate.example_bath', S), 21.1);
}
// Explicit room lists (phone) keep their order; a room marked home goes last.
{
  const w = mk(null);
  const rooms = [{ vars: homeVars }, { vars: bathVars }];
  assert.equal(w.casoraRoomTempOf('climate.example_bath', S, rooms), 21.4, 'no overview mark: the first room as before');
  rooms[0].home = true;
  assert.equal(w.casoraRoomTempOf('climate.example_bath', S, rooms), 21.1);
}
console.log('raumtemp_uebersicht: ok');
