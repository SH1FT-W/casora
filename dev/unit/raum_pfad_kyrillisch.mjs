// #51: rooms with Cyrillic names all got the path "room" – only the first could be opened. The slug transliterates
// Cyrillic now, new rooms get paths of their own, and dashboards saved that way are repaired when the Studio opens.
//   node dev/unit/raum_pfad_kyrillisch.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('// #51: Cyrillic room names');
const b = src.indexOf('// Im Erststart gewählter Performance-Modus');
assert.ok(a > 0 && b > a, 'slug block found');
const { slug, uniquePath, fixDuplicatePaths } = new Function(src.slice(a, b) + '\nreturn { slug, uniquePath, fixDuplicatePaths };')();

assert.equal(slug('Ванная комната'), 'vannaya-komnata');
assert.equal(slug('Второй этаж'), 'vtoroy-etazh');
assert.equal(slug('Гостиная'), 'gostinaya');
assert.equal(slug('Кухня'), 'kukhnya');
assert.equal(slug('Küche'), 'kueche', 'German unchanged');
assert.equal(slug('日本'), 'room', 'no Latin letters at all: fallback');
assert.equal(uniquePath([{ path: 'room' }, { path: 'room-2' }], 'room'), 'room-3');

// A dashboard saved before the fix: Home plus three Cyrillic rooms, all "room".
const rooms = [{ name: 'Это наш дом', path: 'home' }, { name: 'Ванная комната', path: 'room' },
  { name: 'Второй этаж', path: 'room' }, { name: 'Гостевая', path: 'room' }];
const changed = fixDuplicatePaths(rooms);
assert.deepEqual(rooms.map((r) => r.path), ['home', 'vannaya-komnata', 'vtoroy-etazh', 'gostevaya']);
assert.equal(changed.length, 3);
assert.equal(fixDuplicatePaths(rooms).length, 0, 'runs once');
// Two rooms whose names give the same slug: the second gets -2.
const same = [{ name: 'Bad', path: 'bad' }, { name: 'Bad ', path: 'bad' }];
fixDuplicatePaths(same);
assert.deepEqual(same.map((r) => r.path), ['bad', 'bad-2']);
// Nothing to do for normal dashboards.
assert.equal(fixDuplicatePaths([{ name: 'Home', path: 'home' }, { name: 'Küche', path: 'kueche' }]).length, 0);
console.log('raum_pfad_kyrillisch: ok');
