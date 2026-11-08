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
  assert.match(c, /svc: _setTo\(_cc\.shown\(_cc\.shade\)\)/, k + ': shade goes to its position');
  assert.doesNotMatch(c, /text: 'Beschatten', svc: _setTo\(50\)/, k + ': the fixed 50 is gone');
}
for (const f of ['cover_words', 'shade_position', 'shade_hide']) assert.ok(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8').includes(`key: "${f}"`), f);
// #145 point 1: percent shown as closed, per device. Only display and input turn around, and only if every cover of the
// tile is on the list; what goes to HA stays HA's position (shown() works both ways).
window.CASORA_SETTINGS = { security: { percent_closed: ['cover.left', 'cover.blind'] } };
const flip = C(S, ['cover.left', 'cover.blind'], {});
assert.ok(flip.flip && flip.attr === 'current_position|closed' && flip.closedWord === 'geschlossen', 'all on the list: shown as closed');
assert.equal(flip.shown(40), 60, 'HA 40 reads 60 % closed');
assert.equal(flip.shown(60), 40, 'choosing 60 % closed sends 40');
assert.ok(!C(S, ['cover.left', 'cover.terrace'], {}).flip, 'a mixed tile keeps Home Assistant\'s percentage');
assert.ok(!C(S, ['cover.terrace'], {}).flip, 'a cover not on the list is unchanged');
const WORDS = { attr: 'current_position', exact: { 0: 'Geschlossen', 100: 'Geöffnet' }, tpl: '{n} % geöffnet' };
assert.equal(window.casoraCoverRowWords(WORDS, 'cover.terrace'), WORDS, 'row not on the list: same words');
const rw = window.casoraCoverRowWords(WORDS, 'cover.left');
assert.deepEqual([rw.attr, rw.tpl, rw.exact['0'], rw.exact['100']], ['current_position|closed', '{n} % geschlossen', 'Geöffnet', 'Geschlossen'], 'row on the list reads the closed percentage');
const c2 = core.indexOf('  window.casoraCoverSummaryText = '), d2 = core.indexOf('  // Als URL;', c2);
new Function(core.slice(c2, d2))();
const sumText = window.casoraCoverSummaryText;
assert.equal(sumText({ total: 1, open: 1, avg: 40, positions: 1 }, ['cover.left']).full, '60 % geschlossen', 'one cover');
assert.equal(sumText({ total: 2, open: 2, avg: 40, positions: 2 }, ['cover.left', 'cover.blind']).full, 'Teilweise geschlossen · Ø 60 %', 'a group');
assert.equal(sumText({ total: 2, open: 2, avg: 40, positions: 2 }, ['cover.left', 'cover.terrace']).full, 'Teilweise geöffnet · Ø 40 %', 'mixed: as before');
assert.equal(sumText({ total: 1, open: 0, avg: 0, positions: 1 }, ['cover.left']).full, 'Geschlossen', 'the state words do not change');
window.CASORA_SETTINGS = {};
// #145 follow-up: a cover shown as closed reports 100 while retracted or up. Its awning's words swap (the first button still
// sends 100), and it lights up only while it is out, also at 0 where HA says "closed".
window.CASORA_SETTINGS = { security: { percent_closed: ['cover.terrace', 'cover.left'] } };
assert.deepEqual(w(['cover.terrace']), ['Einfahren', 'Ausfahren'], 'awning shown as closed: 100 retracts');
assert.deepEqual(w(['cover.left']), ['Heben', 'Senken'], 'screen shown as closed: 100 is up, the words stay');
const st = (state, pos) => ({ state, attributes: { current_position: pos } });
const A = window.casoraCoverActive;
assert.equal(A(st('open', 100), 'cover.terrace'), false, 'retracted: at rest');
assert.equal(A(st('open', 40), 'cover.terrace'), true, 'partly out');
assert.equal(A(st('closed', 0), 'cover.terrace'), true, 'fully out, though HA says closed');
assert.equal(A(st('open', 100), 'cover.blind'), true, 'not listed: as before');
assert.equal(A(st('closed', 0), 'cover.blind'), false, 'not listed: as before');
assert.equal(A({ state: 'open', attributes: {} }, 'cover.terrace'), true, 'no position: by state');
window.casoraCoverSummary = (states, ids) => ({ ids });
const O = window.casoraCoverActiveOverride, T2 = { 'cover.terrace': st('open', 100), 'cover.left': st('open', 70), 'cover.blind': st('open', 100) };
assert.equal(O(T2, ['cover.terrace']), false, 'tile: retracted is not active');
assert.equal(O(T2, ['cover.terrace', 'cover.left']), true, 'tile: one of them is out');
assert.equal(O(T2, ['cover.blind']), null, 'tile: not listed, the default rule decides');
assert.equal(O(T2, ['cover.terrace', 'cover.blind']), null, 'tile: mixed list, the default rule decides');
console.log('cover_controls: ok');
