// Several temperature or humidity sensors on a climate badge: the sub-badges show their average (#96).
//   node dev/unit/climate_average.mjs
// 1. casoraAvgState (01-basis.js): average as text, the badge's own entity with fewer than two readings.
// 2. casora_badge_temp/_humidity read every state through it; casora_room and the phone chips pass the lists.
// 3. Studio: humidity is a list of five like the temperatures, its first field keeps the key humidity_sensor.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, documentElement: { style: {} } };
globalThis.addEventListener = () => {};
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const at = basis.indexOf('window.casoraAvgState = function');
new Function(basis.slice(at, basis.indexOf('\n};\n', at) + 3))();
const A = window.casoraAvgState;

// ── 1. Average ─────────────────────────────────────────────────────────────
const hass = { states: {
  'sensor.a': { state: '20.4' }, 'sensor.b': { state: '22' }, 'sensor.c': { state: 'unavailable' }, 'sensor.d': { state: '21.1' } } };
const own = { state: '20.4' };
assert.equal(A(hass, ['sensor.a', 'sensor.b', 'sensor.d'], own), '21.2', 'average of three, one decimal');
assert.equal(A(hass, ['sensor.a', 'sensor.c', 'sensor.b'], own), '21.2', 'unavailable left out');
assert.equal(A(hass, ['sensor.a', 'sensor.a', 'sensor.b'], own), '21.2', 'a sensor counts once');
assert.equal(A(hass, ['sensor.a'], own), '20.4', 'one sensor: its own state');
assert.equal(A(hass, null, own), '20.4', 'no list: its own state');
assert.equal(A(hass, ['sensor.c', 'sensor.b'], own), '22', 'one reading left: that reading');
assert.equal(A(hass, ['sensor.c', 'sensor.x'], { state: 'unknown' }), 'unknown', 'no reading: own state');
console.log('ok casoraAvgState');

// ── 2. Templates ───────────────────────────────────────────────────────────
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
for (const name of ['casora_badge_temp', 'casora_badge_humidity']) {
  const s = JSON.stringify(T[name]);
  const via = s.split('window.casoraAvgState(hass, variables.avg_sensors, entity) : entity?.state').length - 1;
  assert.ok(via > 0, name + ' uses the average');
  assert.equal(s.split('entity?.state').length - 1, via, name + ' reads no state past casoraAvgState');
}
for (const [top, tpl] of Object.entries(T)) {
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (['casora_badge_temp', 'casora_badge_humidity'].includes(o.template) && /temp_sensor_1|humidity_sensor/.test(String(o.entity))) {
      const l = String((o.variables || {}).avg_sensors || '');
      const want = o.template === 'casora_badge_temp' ? /temp_sensor_1.*temp_sensor_5/ : /humidity_sensor,.*humidity_sensor_5/;
      assert.ok(want.test(l), top + ' passes ' + o.template + ' its list: ' + l);
    }
    Object.values(o).forEach(walk);
  })(tpl);
}
console.log('ok templates pass the lists');

// ── 3. Studio fields ───────────────────────────────────────────────────────
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.ok(/R\("hum", "Humidity sensor", 5, \[\{ \.\.\.E\("humidity_sensor_%", "Humidity %", \["sensor"\]\), key1: "humidity_sensor"/.test(panel), 'humidity list of five');
assert.ok(panel.includes('key: n === 1 && f.key1 ? f.key1 : f.key.replace("%", n)'), 'first repeat field keeps its key');
assert.ok(!panel.includes('E("humidity_sensor", "Humidity", ["sensor"])'), 'no single humidity field left');
console.log('climate_average: ok');
