// Prüfrunde u07-04 (part): a recording camera's tile said „Rec“, its popup head HA's word („Zeichnet auf“). The tile
// takes the same word as the head (window.casoraStateWord).
//   node dev/unit/kamera_rec_wort.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_camera
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const window = { casoraStateWord: (h, cur) => (cur.state === 'recording' ? 'Zeichnet auf' : cur.state) };
const sd = new Function('window', 'states', 'hass', 'variables', 'entity', 'user', body(T.casora_camera.state_display));
const cam = { entity_id: 'camera.qa_hof', state: 'recording', attributes: {} };
const out = sd.call({}, window, { [cam.entity_id]: cam }, { states: {} }, {}, cam, {});
assert.equal(out, 'Zeichnet auf', 'tile says the head\'s word');
console.log('kamera_rec_wort: ok');
