// Klima sub-badges in the air quality tones (owner, 27.10.2026): window.casoraComfortLevel (01-basis.js) –
// temperature by unit (°F converted to °C), humidity by percent. 0 green, 1 orange, 2 red.
//   node dev/unit/comfort_level.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const a = src.indexOf('window.casoraComfortLevel = function'), b = src.indexOf('window.casoraComfortColor', a);
assert.ok(a > 0 && b > a, 'casoraComfortLevel missing');
const w = {};
new Function('window', src.slice(a, b))(w);
const L = w.casoraComfortLevel;
assert.equal(L('temp', 21, '°C'), 0, '21 °C green');
assert.equal(L('temp', 18, '°C'), 1, '18 °C orange');
assert.equal(L('temp', 25, '°C'), 1, '25 °C orange');
assert.equal(L('temp', 16, '°C'), 2, '16 °C red');
assert.equal(L('temp', 27, '°C'), 2, '27 °C red');
assert.equal(L('temp', 72, '°F'), 0, '72 °F green');
assert.equal(L('temp', 80, '°F'), 2, '80 °F red');
assert.equal(L('temp', 64, '°F'), 1, '64 °F orange');
assert.equal(L('temp', 72, 'F'), 0, 'unit system „F“');
assert.equal(L('temp', 'unavailable', '°C'), null, 'no reading');
assert.equal(L('humidity', 50), 0, '50 % green');
assert.equal(L('humidity', 35), 1, '35 % orange');
assert.equal(L('humidity', 65), 1, '65 % orange');
assert.equal(L('humidity', 25), 2, '25 % red');
assert.equal(L('humidity', 75), 2, '75 % red');
console.log('comfort_level: ok');
