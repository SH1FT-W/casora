// Room photo upload (test 2): E16 no question for a technical "Image name" before uploading; E17 the photo list says
// "Own photo · Home" and "no night image" in the Studio's language instead of "Home 5007de19bd49   no night image".
//   node dev/unit/studio_photo_names.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const SRC = read('custom_components/casora/panel/casora-panel.js');
const i = SRC.indexOf('const send = async (blob, variantValue) => {');
const send = SRC.slice(i, SRC.indexOf('pick = (variantValue) => {', i));
assert.ok(i > 0 && send.includes('body.append("name", name)'), 'upload code found');
assert.ok(!/title: "Image name"/.test(send) && !/this\._ask\(/.test(send), 'E16: no name question');
// The automatic name: the room's own photo is replaced, otherwise the room's name; never a reserved suffix.
const auto = new Function('suggest', send.match(/const name = (.+);\n/)[1].replace(/^/, 'return '));
assert.equal(auto('kueche-3fa9c2d1e0b4'), 'kueche-3fa9c2d1e0b4', 'same photo replaced (night finds day)');
assert.equal(auto('office'), 'office');
assert.equal(auto('x-night'), 'x-photo', 'no night slot name');
assert.equal(auto(''), 'room');

// E17: labels.
const j = SRC.indexOf('const TAIL = /-[0-9a-f]{12}$/;');
assert.ok(j > 0, 'tail rule');
const TAIL = /-[0-9a-f]{12}$/;
assert.ok(TAIL.test('home-5007de19bd49') && !TAIL.test('kueche') && !TAIL.test('home-demo'));
assert.ok(/trLabel\("Own photo"\) \+ " \\u00b7 " \+ nice0\(n\.replace\(TAIL, ""\)\)/.test(SRC), 'own photo label');
assert.ok(/\(i\.night \? "" : " \\u00b7 " \+ trLabel\("no night image"\)\)/.test(SRC), 'translated night note');
assert.ok(!SRC.includes('"   no night image"'), 'no raw English note');
for (const l of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  const T = JSON.parse(read(`custom_components/casora/translations/panel/${l}.json`)).exact;
  ['Own photo', 'no night image', 'not on disk', 'Photo uploaded', 'Night photo uploaded'].forEach((k) => assert.ok(T[k], l + ': ' + k));
}
assert.equal(JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact['no night image'], 'ohne Nachtbild');
console.log('ok photo names');
