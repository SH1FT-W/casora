// u07-04: camera tile and popup named different states – tile „Kein Bild“, popup head „Bereit“ over an empty grey area;
// tile „Rec“, popup „Zeichnet auf“. Expected: the head says the tile's word, the tile says „Zeichnet auf“, and a popup
// without a picture shows „Kein Bild“ with „Erneut versuchen“ (as offline) instead of an empty area.
//   node dev/unit/kamera_ein_wort.mjs
// @deckt: casora-core.js#_headFallback,casoraCamHasPicture,casoraCamBlankPixels, button_card_templates.json#casora_camera,casora_popup_camera
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const tpl = JSON.parse(rd('dashboards/casora/button_card_templates.json'));

// 1) The tile: recording is „Zeichnet auf“ (the popup's word), never „Rec“.
const sd = tpl.casora_camera.state_display.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const tileWord = (state, self = {}) => new Function('window', 'entity', 'states', 'variables', 'hass', sd).call(self,
  { casoraEsc: String, casoraCamOffline: () => false }, { entity_id: 'camera.x', state, attributes: {} }, {}, {}, {});
assert.equal(tileWord('recording'), 'Zeichnet auf', 'tile: recording');
assert.equal(tileWord('off'), 'Aus', 'tile: off');
const en = JSON.parse(rd('custom_components/casora/translations/dashboard/phrases/en.json'));
assert.equal(en.exact['Zeichnet auf'], 'Recording', 'English phrase');

// 2) The popup head of a camera: the tile's word, or the popup's own „Kein Bild“ – not HA's „Bereit“.
const h0 = core.indexOf('    _headFallback(again) {');
const h1 = core.indexOf('\n    // The state line the tile shows', h0);
assert.ok(h0 > 0 && h1 > h0, '_headFallback found');
const Head = new Function('document', 'window', 'setTimeout', 'return class {' + core.slice(h0, h1) + '\n}')(
  { querySelector: () => ({ hass: { states: {} } }) },
  { casoraEsc: String, casoraStateWord: () => 'Bereit', casoraTr: (x) => x }, () => 0);
const head = (tileText, camWord, id = 'camera.x') => {
  const p = new Head();
  Object.assign(p, {
    _headerStatus: { innerHTML: '', hidden: true }, hasAttribute: (n) => n === 'soft' || n === 'open',
    _headCur: () => ({ entity_id: id, state: 'idle', attributes: {} }), _tileWord: () => tileText,
    _camWord: camWord, _dedupeHead() {}, _sinceText: () => '',
  });
  p._headFallback(true);
  return p._headerStatus.innerHTML.replace(/<\/?b>/g, '');
};
assert.equal(head('Kein Bild', null), 'Kein Bild', 'head: tile without a picture');
assert.equal(head('Aktuell', null), 'Aktuell', 'head: fresh still');
assert.equal(head('Aktuell', 'Kein Bild'), 'Kein Bild', 'head: the popup found no picture');
assert.equal(head('', null), 'Bereit', 'head: no tile word – the state word');
assert.equal(head('An', null, 'switch.x'), 'Bereit', 'head: other devices unchanged');
assert.ok(/this\._camWord = null;/.test(core.slice(core.indexOf('    async open(data) {'), h0)), 'open() forgets the last camera word');

// 3) A one-colour / black still is no picture (as the tile's check); a real one is.
const cs0 = core.indexOf('  window.casoraCamBlankPixels = function');
const win = {};
new Function('window', core.slice(cs0, core.indexOf('  window.casoraCamAge = function', cs0)))(win);
const px = (f) => { const a = new Uint8ClampedArray(8 * 8 * 4); for (let i = 0; i < 64; i++) { const c = f(i); a.set([c[0], c[1], c[2], 255], i * 4); } return a; };
assert.equal(win.casoraCamBlankPixels(px(() => [80, 80, 80])), true, 'grey placeholder');
assert.equal(win.casoraCamBlankPixels(px(() => [3, 3, 3])), true, 'black');
assert.equal(win.casoraCamBlankPixels(px((i) => [i * 3, 120, 200 - i])), false, 'a real picture');

// 4) The popup: a still camera asks for a picture first; without one the hint „Kein Bild“ with „Erneut versuchen“.
for (const k of ['tap_action', 'icon_tap_action']) {
  const c = tpl.casora_popup_camera[k].casora_popup.content;
  assert.ok(c.includes('return window.casoraCamHasPicture(_pic);'), k + ': asks for a picture');
  assert.ok(c.includes("self.hint(camId, mountEl, 'Kein Bild', 'mdi:image-off-outline', 'Kein Bild', '');"), k + ': Kein Bild hint');
  assert.ok(/hint: function[\s\S]*?Erneut versuchen[\s\S]*?if \(mode === 'Kein Bild'\) this\.headWord\(mountEl, 'Kein Bild'\);/.test(c), k + ': hint with retry tells the head');
  assert.ok(!/const TPL = 27;/.test(c), k + ': TPL bumped');
}
console.log('kamera_ein_wort: ok');
