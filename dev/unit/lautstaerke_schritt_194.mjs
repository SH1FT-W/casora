// @deckt: custom_components/casora/scripts/local/22-halten.js#model,act custom_components/casora/scripts/local/00-finder.js#casoraVolumeStep dashboards/casora/button_card_templates.json#casora_media,casora_now_playing_chip,casora_now_playing_primary custom_components/casora/panel/casora-panel-personal.js
// #194: „Leiser“/„Lauter“ always changed the volume by the player's fixed 10 % (volume_down/volume_up). A step set in
// the Studio (Settings › Home & devices › Music and players, media.volume_step: 1, 2, 5 or 10 %) now counts in the
// quick menu (hold) and the media popup's keys; without one everything stays as it was.
//   node dev/unit/lautstaerke_schritt_194.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const calls = [];
const player = { entity_id: 'media_player.living', state: 'playing', attributes: { volume_level: 0.4, supported_features: 16 | 32 | 4 | 1024 } };
const hass = { states: { 'media_player.living': player }, entities: {}, callService: (d, s, data) => { calls.push([d + '.' + s, data]); return Promise.resolve(); } };
const win = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener() {}, querySelectorAll: () => [] };
const box = { window: win, document: doc, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Promise, WeakMap,
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' },
  customElements: { define() {}, get: () => null, whenDefined: () => new Promise(() => {}) }, MutationObserver: class { observe() {} } };
vm.createContext(box);
win.document = doc;
vm.runInContext(read('custom_components/casora/scripts/local/00-finder.js'), box);
vm.runInContext(read('custom_components/casora/scripts/local/22-halten.js'), box);
const H = win._casoraHold;
const keys = () => H.model(player, {}).quick[0].items.filter((x) => /Leiser|Lauter/.test(x.t));
const J = (x) => JSON.parse(JSON.stringify(x));

// Without a step of one's own: the player's own volume_down / volume_up, as before.
assert.equal(win.casoraVolumeStep(), null, 'nothing stored: no step');
assert.deepEqual(J(keys().map((x) => [x.svc, x.data])), [['media_player.volume_down', null], ['media_player.volume_up', null]], 'unchanged without a setting');

// Step 5 %: volume_set by ±0.05 from the level now.
win.CASORA_SETTINGS = { media: { volume_step: 5 } };
assert.equal(win.casoraVolumeStep(), 0.05);
assert.deepEqual(J(keys().map((x) => [x.t, x.svc, x.data])), [
  ['Leiser', 'media_player.volume_set', { volume_level: 0.35 }],
  ['Lauter', 'media_player.volume_set', { volume_level: 0.45 }]], 'step 5 %: volume_set with ∓0.05');
// The tap counts from the level at the tap: two taps before the player reports would otherwise send the same level.
const up = keys()[1];
await H.act('media_player.living', up);
player.attributes = Object.assign({}, player.attributes, { volume_level: 0.45 });
await H.act('media_player.living', up);
assert.deepEqual(J(calls), [['media_player.volume_set', { entity_id: 'media_player.living', volume_level: 0.45 }],
  ['media_player.volume_set', { entity_id: 'media_player.living', volume_level: 0.5 }]], 'louder twice: 0.45, then 0.5');
// Clamped to 0…1, whole percent.
player.attributes = Object.assign({}, player.attributes, { volume_level: 0.98 });
assert.equal(keys()[1].data.volume_level, 1, 'not above 100 %');
player.attributes = Object.assign({}, player.attributes, { volume_level: 0.01 });
win.CASORA_SETTINGS = { media: { volume_step: 2 } };
assert.equal(keys()[0].data.volume_level, 0, 'not below 0 %');
win.CASORA_SETTINGS = { media: { volume_step: 1 } };
player.attributes = Object.assign({}, player.attributes, { volume_level: 0.14 });
assert.equal(keys()[1].data.volume_level, 0.15, 'whole percent (0.14 + 0.01)');

// A player that only steps (VOLUME_STEP, no VOLUME_SET) or reports no level keeps volume_down / volume_up.
player.attributes = { volume_level: 0.4, supported_features: 1024 };
assert.deepEqual(J(keys().map((x) => x.svc)), ['media_player.volume_down', 'media_player.volume_up'], 'step-only player');
player.attributes = { supported_features: 4 };
assert.deepEqual(J(keys().map((x) => x.svc)), ['media_player.volume_down', 'media_player.volume_up'], 'no level reported');
// Only the four offered steps count.
win.CASORA_SETTINGS = { media: { volume_step: 7 } };
assert.equal(win.casoraVolumeStep(), null, 'an unknown step is ignored');

// Media popup (Standard and Glass looks, older body): its keys use the same step, else 5 % as before.
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
for (const name of ['casora_media', 'casora_now_playing_chip', 'casora_now_playing_primary']) {
  const c = T[name].tap_action.casora_popup.content;
  assert.ok(c.includes('const vStep = (window.casoraVolumeStep && window.casoraVolumeStep()) || 0.05;'), name + ': step from the settings');
  assert.ok(c.includes('clamp(volLvl - vStep)') && c.includes('clamp(volLvl + vStep)') && !/clamp\(volLvl [+-] 0\.05\)/.test(c), name + ': both keys');
}

// Studio: Settings › Home & devices › Music and players offers 1, 2, 5 and 10 % (a draft like the rest).
const personal = read('custom_components/casora/panel/casora-panel-personal.js');
assert.ok(/row\(g, "Volume step", \[volChips\]/.test(personal) && /\[1, 2, 5, 10\]\.forEach/.test(personal) && /S\.media\.volume_step = v;/.test(personal),
  'Studio row with the four steps, written into the draft');
console.log('ok lautstaerke_schritt_194');
