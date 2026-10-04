// Waschmaschine/Trockner: woher die Werte kommen (casoraLaundryFind in 00-finden.js).
// Reihenfolge: Hersteller-Integration > WashData > nur Zwischenstecker – erkannt über
// Plattform und translation_key, nie über Namen. Dazu Assistent und Kachel-Zustand.
//   node dev/unit/waesche_quelle.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
new Function(src('scripts/local/00-finden.js'))();
new Function(src('panel/casora-panel-assist.js'))();
const LF = window.casoraLaundryFind;
assert.ok(LF, 'casoraLaundryFind fehlt');

const hass = { entities: {}, devices: {}, states: {}, areas: { keller: { name: 'Keller' }, bad: { name: 'Bad' }, dach: { name: 'Dach' } } };
// Namen absichtlich irreführend: die Erkennung darf sie nie benutzen.
function dev(id, area, extra = {}) { hass.devices[id] = { id, name: 'Gerät ' + id, area_id: area, config_entries: ['entry_' + id], ...extra }; }
function ent(eid, device_id, platform, key, state = 'x', attributes = {}, category = null) {
  hass.entities[eid] = { entity_id: eid, device_id, platform, translation_key: key, entity_category: category };
  hass.states[eid] = { entity_id: eid, state, attributes };
}

// Keller: dieselbe Waschmaschine über Home Connect und über WashData – Home Connect gewinnt.
dev('hc', 'keller');
ent('sensor.a1', 'hc', 'home_connect', 'operation_state', 'run');
ent('sensor.a2', 'hc', 'home_connect', 'program_progress', '40', { unit_of_measurement: '%' });
ent('sensor.a3', 'hc', 'home_connect', 'program_finish_time', new Date(Date.now() + 3600e3).toISOString(), { device_class: 'timestamp' });
ent('select.a4', 'hc', 'home_connect', 'active_program', 'laundry_care_washer_program_cotton',
  { options: ['laundry_care_washer_program_cotton', 'laundry_care_washer_program_mix'] });
ent('button.a5', 'hc', 'home_connect', 'stop_program', 'unknown');
dev('wd', 'keller');
ent('sensor.b1', 'wd', 'ha_washdata', 'washer_state', 'running', { icon: 'mdi:washing-machine' });
ent('sensor.b2', 'wd', 'ha_washdata', 'cycle_progress', '35', { unit_of_measurement: '%' });
ent('select.b3', 'wd', 'ha_washdata', 'program_select', 'auto_detect', { options: ['auto_detect', 'Baumwolle'] });
ent('button.b4', 'wd', 'ha_washdata', 'mark_unloaded', 'unknown');
ent('sensor.b5', 'wd', 'ha_washdata', 'profile_cycle_count', '3', {}, 'diagnostic');
// Keller: Trockner nur über WashData (Symbol sagt Trockner) – bleibt.
dev('wdt', 'keller');
ent('sensor.c1', 'wdt', 'ha_washdata', 'washer_state', 'off', { icon: 'mdi:tumble-dryer' });
ent('sensor.c2', 'wdt', 'ha_washdata', 'time_remaining', '0', { unit_of_measurement: 'min' });
// WashData-Geschirrspüler und Home-Connect-Geschirrspüler sind keine Wäschegeräte.
dev('wdd', 'keller');
ent('sensor.d1', 'wdd', 'ha_washdata', 'washer_state', 'off', { icon: 'mdi:dishwasher' });
ent('sensor.d2', 'wdd', 'ha_washdata', 'cycle_progress', '0');
dev('hcd', 'keller');
ent('sensor.e1', 'hcd', 'home_connect', 'operation_state', 'ready');
ent('select.e2', 'hcd', 'home_connect', 'active_program', 'dishcare_dishwasher_program_eco50', { options: ['dishcare_dishwasher_program_eco50'] });
// Bad: Miele-Waschmaschine (Schleuderdrehzahl) und Miele-Trockner (Trocknungsstufe).
dev('mw', 'bad');
ent('sensor.f1', 'mw', 'miele', 'status', 'in_use');
ent('sensor.f2', 'mw', 'miele', 'spin_speed', '1400', {}, 'diagnostic');
ent('sensor.f3', 'mw', 'miele', 'remaining_time', '42', { device_class: 'duration', unit_of_measurement: 'min' });
dev('mt', 'bad');
ent('sensor.g1', 'mt', 'miele', 'status', 'off');
ent('sensor.g2', 'mt', 'miele', 'drying_step', 'normal', {}, 'diagnostic');
// Ohne Bereich: SmartThings-Trockner, Whirlpool-Waschmaschine, LG ThinQ-Trockner (Modell).
dev('st', null);
ent('sensor.h1', 'st', 'smartthings', 'dryer_machine_state', 'run');
ent('sensor.h2', 'st', 'smartthings', 'dryer_job_state', 'drying');
dev('wp', null);
ent('sensor.i1', 'wp', 'whirlpool', 'washer_state', 'standby');
ent('sensor.i2', 'wp', 'whirlpool', 'end_time', new Date().toISOString(), { device_class: 'timestamp' });
dev('lg', null, { model: 'RH90V9 (DEVICE_DRYER)' });
ent('sensor.j1', 'lg', 'lg_thinq', 'current_state', 'drying');
ent('sensor.j2', 'lg', 'lg_thinq', 'cycle_count', '12');
// Testhaus (Mock): alles unter einer fremden Plattform, nur die Schlüssel zählen.
dev('mock', 'dach');
ent('sensor.k1', 'mock', 'casora_mock', 'operation_state', 'finished');
ent('sensor.k2', 'mock', 'casora_mock', 'program_progress', '100');
ent('select.k3', 'mock', 'casora_mock', 'selected_program', 'laundry_care_dryer_program_cotton', { options: ['laundry_care_dryer_program_cotton'] });
// Dach: nur ein Zwischenstecker.
dev('plug', 'dach');
ent('switch.l1', 'plug', 'shelly', null, 'on', { device_class: 'outlet' });
ent('sensor.l2', 'plug', 'shelly', null, '1830', { device_class: 'power', unit_of_measurement: 'W' });
ent('sensor.l3', 'plug', 'powercalc', null, '2', { device_class: 'power', unit_of_measurement: 'W' });

const cl = (id) => LF.classify(hass, id);
assert.deepEqual([cl('hc').source, cl('hc').rank, cl('hc').role, cl('hc').state], ['home_connect', 0, 'washer', 'sensor.a1']);
assert.equal(cl('hc').f.remaining, 'sensor.a3');
assert.equal(cl('hc').f.stop, 'button.a5');
assert.deepEqual([cl('wd').source, cl('wd').rank, cl('wd').role, cl('wd').entry], ['washdata', 1, 'washer', 'entry_wd']);
assert.equal(cl('wd').f.unload, 'button.b4');
assert.deepEqual(cl('wd').f.profiles, ['sensor.b5']);
assert.equal(cl('wdt').role, 'dryer');
assert.equal(cl('wdd'), null, 'WashData-Geschirrspüler ist keine Waschmaschine');
assert.equal(cl('hcd'), null, 'Home-Connect-Geschirrspüler ist keine Waschmaschine');
assert.deepEqual([cl('mw').source, cl('mw').role], ['miele', 'washer']);
assert.deepEqual([cl('mt').source, cl('mt').role], ['miele', 'dryer']);
assert.deepEqual([cl('st').source, cl('st').role, cl('st').f.phase], ['smartthings', 'dryer', 'sensor.h2']);
assert.deepEqual([cl('wp').source, cl('wp').role, cl('wp').rank], ['whirlpool', 'washer', 0]);
assert.deepEqual([cl('lg').source, cl('lg').role], ['lg_thinq', 'dryer']);
assert.deepEqual([cl('mock').source, cl('mock').how, cl('mock').role], ['home_connect', 'keys', 'dryer']);
assert.equal(cl('plug'), null);

// Reihenfolge: im Keller nur Home Connect als Waschmaschine, WashData-Waschmaschine fällt weg.
const washers = LF.all(hass, 'washer').map((c) => c.device);
assert.ok(washers.includes('hc') && !washers.includes('wd'), 'offiziell vor WashData: ' + washers);
assert.equal(washers[0], 'hc', 'Hersteller-Integrationen zuerst');
const dryers = LF.all(hass, 'dryer').map((c) => c.device);
assert.ok(dryers.includes('wdt'), 'WashData-Trockner bleibt, wenn es keinen offiziellen gibt');
// Ohne offizielle Waschmaschine gewinnt WashData.
const noHc = JSON.parse(JSON.stringify(hass));
Object.keys(noHc.entities).forEach((k) => { if (noHc.entities[k].device_id === 'hc') { delete noHc.entities[k]; delete noHc.states[k]; } });
delete noHc.devices.hc;
assert.ok(LF.all(noHc, 'washer').some((c) => c.device === 'wd'), 'WashData als Ersatz');
// Zuletzt der Zwischenstecker: gemessene Leistung, nicht powercalc.
const plugs = LF.plugs(hass, 'dach');
assert.equal(plugs.length, 1);
assert.deepEqual([plugs[0].rank, plugs[0].f.power, plugs[0].f.plug], [2, 'sensor.l2', 'switch.l1']);
assert.equal(LF.forEntity(hass, 'sensor.l2').source, 'plug');
assert.equal(LF.forEntity(hass, 'sensor.b2').source, 'washdata', 'jede Entität des Geräts führt zur Quelle');

// Assistent: schlägt im Keller die Home-Connect-Maschine vor, nicht WashData.
const types = ['casora_washer', 'casora_dryer', 'casora_dishwasher'].map((id) => ({ id, label: id }));
const sug = window.casoraAssist.suggest(hass, [{ name: 'Keller', tiles: [] }, { name: 'Bad', tiles: [] }], types);
const kellerWasher = sug.filter((x) => x.type === 'casora_washer' && x.area === 'Keller');
assert.deepEqual(kellerWasher.map((x) => x.entity), ['sensor.a1'], JSON.stringify(sug));
assert.ok(sug.some((x) => x.type === 'casora_dryer' && x.entity === 'sensor.c1'), 'WashData-Trockner vorgeschlagen');
assert.ok(sug.some((x) => x.type === 'casora_dryer' && x.entity === 'sensor.g1'), 'Miele-Trockner vorgeschlagen');
assert.ok(!sug.some((x) => x.entity === 'sensor.d1'), 'WashData-Geschirrspüler nicht als Waschmaschine');

// Kachel/Popup (02-geraete.js): Zustände der Hersteller sprachunabhängig, Quelle im Popup.
window._casoraUI = null;
try { new Function(src('scripts/local/02-geraete.js'))(); } catch (e) { /* andere Module brauchen den Browser */ }
const L = window._casoraLaundry;
assert.ok(L, '_casoraLaundry fehlt');
assert.deepEqual(L.state(hass.states, 'sensor.a1').slice(2), [true, 'run'], 'Home Connect „run“ läuft');
assert.deepEqual(L.state(hass.states, 'sensor.f1').slice(2), [true, 'run'], 'Miele „in_use“ läuft');
hass.states['sensor.b1'].state = 'clean';
assert.equal(L.state(hass.states, 'sensor.b1')[3], 'clean');
assert.equal(L.tile({ entity_id: 'sensor.b1' }, {}, hass.states), 'Fertig · Wäsche drin');
assert.equal(L.tileActive({ entity_id: 'sensor.b1' }, {}, hass.states), true, 'Wäsche drin: Kachel leuchtet');
assert.deepEqual(L.state(hass.states, 'sensor.l2').slice(2), [true, 'run'], 'Stecker > 5 W = läuft');
const c = L.resolve({ entity_id: 'sensor.a1' }, { device_type: 'washing_machine' }, hass.states, hass);
assert.deepEqual([c.source, c.official, c.remaining, c.program, c.stop], ['home_connect', true, 'sensor.a3', 'select.a4', 'button.a5']);
const w = L.resolve({ entity_id: 'sensor.b1' }, {}, hass.states, hass);
assert.deepEqual([w.source, w.official, w.unload, w.select, w.entry], ['washdata', false, 'button.b4', 'select.b3', 'entry_wd']);
console.log('waesche_quelle: ok');
