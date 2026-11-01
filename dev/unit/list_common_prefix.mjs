// Owner, 01.11.2026: list rows in popups drop the leading word(s) every name of the list shares („Jalousie Bad“,
// „Jalousie Küche“ → „Bad“, „Küche“). Display only, never an empty name or a bare number, never for one row, only
// for rows that name a device (entity or sub page). Used by UI.group (casora-core.js) and the light popup's lamp list.
//   node dev/unit/list_common_prefix.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  window.casoraDropCommonPrefix = function');
assert.ok(a > 0, 'helper exists');
const b = core.indexOf('  function group(rows, label', a);
const window = {};
const dropRowPrefix = new Function('window', core.slice(a, b) + '\nreturn dropRowPrefix;')(window);
const D = window.casoraDropCommonPrefix;

assert.deepEqual(D(['Jalousie Bad', 'Jalousie Küche']), ['Bad', 'Küche']);
assert.deepEqual(D(['Jalousie Bad links', 'Jalousie Bad rechts']), ['links', 'rechts'], 'several shared words');
assert.deepEqual(D(['jalousie Bad', 'Jalousie Küche']), ['Bad', 'Küche'], 'case does not matter');
assert.deepEqual(D(['Jalousie', 'Jalousie Küche']), ['Jalousie', 'Jalousie Küche'], 'never an empty name');
assert.deepEqual(D(['Lampe 1', 'Lampe 2']), ['Lampe 1', 'Lampe 2'], 'never a bare number');
assert.deepEqual(D(['Jalousie Bad']), ['Jalousie Bad'], 'one name stays');
assert.deepEqual(D(['Jalousie Bad', 'Rollo Küche']), ['Jalousie Bad', 'Rollo Küche'], 'nothing shared');
assert.deepEqual(D(['Jalousienbad', 'Jalousie Küche']), ['Jalousienbad', 'Jalousie Küche'], 'whole words only');

const rows = [{ entity: 'cover.a', label: 'Jalousie Bad' }, { entity: 'cover.b', label: 'Jalousie Küche', sub: 'Offen' }];
assert.deepEqual(dropRowPrefix(rows).map((r) => r.label), ['Bad', 'Küche'], 'device rows');
assert.equal(rows[0].label, 'Jalousie Bad', 'the rows given stay untouched');
assert.deepEqual(dropRowPrefix([{ label: 'Letzte Fahrt' }, { label: 'Letzte Wartung' }]).map((r) => r.label),
  ['Letzte Fahrt', 'Letzte Wartung'], 'rows that name no device keep their words');
assert.deepEqual(dropRowPrefix([{ page: 'x|1', label: 'Sensor Flur' }, { page: 'x|2', label: 'Sensor Bad' }]).map((r) => r.label), ['Flur', 'Bad']);
assert.ok(/function group\(rows, label, labelAction, opts\) \{\n    rows = dropRowPrefix\(rows \|\| \[\]\);/.test(core), 'UI.group uses it');

const pop = rd('custom_components/casora/scripts/local/03-popups.js');
assert.equal((pop.match(/= lampNamesOf\(/g) || []).length, 2, 'light popup: both lamp lists use it');
console.log('list_common_prefix: ok');
