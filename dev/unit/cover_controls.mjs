// Issue #145: the cover popup's buttons. Shade goes to a position you set or away, words fit the device, the percentage
// never reverses what is sent (first button 100, last 0), and the popup says when they move several covers.
//   node dev/unit/cover_controls.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {}, createElement: () => ({ style: {} }), head: { appendChild: () => {} }, documentElement: { style: {} } };
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  var COVER_WORDS = '), b = core.indexOf('  window.casoraCoverSummaryText = ', a);
new Function(core.slice(a, b))();
const C = window.casoraCoverControls;
const S = {
  'cover.left': { attributes: { device_class: 'shade', friendly_name: 'Left' } },
  'cover.vertical_screen': { attributes: { friendly_name: 'Vertical screen' } },
  'cover.terrace': { attributes: { device_class: 'awning', friendly_name: 'Terrace' } },
  'cover.blind': { attributes: { device_class: 'blind', friendly_name: 'Blind' } },
};
const w = (ids, v) => { const r = C(S, ids, v); return [r.open, r.close]; };
assert.deepEqual(w(['cover.blind']), ['Auf', 'Zu'], 'an ordinary blind keeps its words');
assert.deepEqual(w(['cover.terrace']), ['Ausfahren', 'Einfahren'], 'awning');
assert.deepEqual(w(['cover.left', 'cover.vertical_screen']), ['Heben', 'Senken'], 'screens, also by name');
assert.deepEqual(w(['cover.left', 'cover.terrace']), ['Auf', 'Zu'], 'mixed: the neutral words');
assert.deepEqual(w(['cover.blind'], { cover_words: 'extend' }), ['Ausfahren', 'Einfahren'], 'own choice wins');
assert.deepEqual(w(['cover.terrace'], { cover_words: 'open' }), ['Auf', 'Zu']);
assert.deepEqual(w(['cover.terrace'], { cover_words: 'nonsense' }), ['Ausfahren', 'Einfahren'], 'unknown value: by device');
assert.equal(C(S, ['cover.blind']).shade, 50, 'default as before');
assert.equal(C(S, ['cover.blind'], { shade_position: 35 }).shade, 35);
assert.equal(C(S, ['cover.blind'], { shade_position: 35 }).shadeText, 'Beschatten 35 %', 'the target is said');
for (const bad of [0, 100, 12.5, 'x', null]) assert.equal(C(S, ['cover.blind'], { shade_position: bad }).shade, 50, String(bad));
assert.equal(C(S, ['cover.blind'], { shade_hide: true }).shade, null, 'hidden');
assert.equal(C(S, ['cover.blind']).scope, null, 'one cover: nothing to say');
assert.equal(C(S, ['cover.left', 'cover.terrace']).scope, 'Gilt für alle 2');

const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
for (const k of ['casora_cover', 'casora_popup_cover']) {
  const c = T[k].tap_action.casora_popup.content;
  assert.match(c, /text: _cc\.open, svc: _setTo\(100\)/, k + ': the first button is always open');
  assert.match(c, /text: _cc\.close, svc: _setTo\(0\)/, k + ': the last is always close');
  assert.match(c, /svc: _setTo\(_cc\.shade\)/, k + ': shade goes to its position');
  assert.doesNotMatch(c, /text: 'Beschatten', svc: _setTo\(50\)/, k + ': the fixed 50 is gone');
}
for (const f of ['cover_words', 'shade_position', 'shade_hide']) assert.ok(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8').includes(`key: "${f}"`), f);
console.log('cover_controls: ok');
