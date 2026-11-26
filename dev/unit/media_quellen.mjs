// Prüfrunde u07-06 / u07-12 / u07-13 (media tile and popup):
//  - u07-06: after switching the TV to „YouTube“ (source) the popup still marked „Mediathek“, because it read app_name
//    first. The selected source counts when it is in the source list; app_name only otherwise.
//  - u07-12: the tile wrote „Artist - Title“; Casora separates with „ · “.
//  - u07-13: video apps (YouTube, Mediathek) on a TV had a speaker icon.
//   node dev/unit/media_quellen.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_media,casora_now_playing_chip,casora_now_playing_primary
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const strip = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tv = (attrs) => ({ entity_id: 'media_player.qa_fernseher', state: 'playing',
  attributes: Object.assign({ device_class: 'tv', supported_features: 1 | 4 | 16 | 32 | 16384 | 2048, volume_level: 0.2,
    source_list: ['Live-TV', 'HDMI 1', 'YouTube', 'Mediathek'] }, attrs || {}) });

for (const name of ['casora_media', 'casora_now_playing_chip', 'casora_now_playing_primary']) {
  const content = tpl[name].tap_action.casora_popup.content;
  const lit = content.match(/custom_fields: \{ body: ("\[\[\[\\n  const UI = window\._casoraUI;[\s\S]*?\]\]\]") \}/);
  assert.ok(lit, name + ': wheel body found');
  const bodySrc = (0, eval)(lit[1]);
  let moons = null;
  const UI = new Proxy({ stage: (k, o) => { moons = o.moons; return 'STAGE'; }, esc: (s) => String(s ?? ''), tokens: {} },
    { get: (o, k) => (k in o ? o[k] : () => '') });
  new Function('window', 'states', 'hass', 'variables', 'entity', 'user', strip(bodySrc))(
    { _casoraUI: UI }, {}, {}, { v3: true }, tv({ source: 'YouTube', app_name: 'Mediathek' }), {});
  assert.ok(Array.isArray(moons) && moons.length === 4, name + ': four sources as moons');
  assert.deepEqual(moons.filter((m) => m.active).map((m) => m.text), ['YouTube'], name + ': the selected source is marked');
  const ic = Object.fromEntries(moons.map((m) => [m.text, m.icon]));
  assert.equal(ic.YouTube, 'mdi:youtube', name + ': YouTube icon');
  assert.notEqual(ic.Mediathek, 'mdi:speaker', name + ': a video app on a TV is no speaker');
  assert.equal(ic['Live-TV'], 'mdi:television', name + ': TV stays');
  // A player that reports only app_name keeps marking it.
  new Function('window', 'states', 'hass', 'variables', 'entity', 'user', strip(bodySrc))(
    { _casoraUI: UI }, {}, {}, { v3: true }, tv({ source: null, app_name: 'Mediathek' }), {});
  assert.deepEqual(moons.filter((m) => m.active).map((m) => m.text), ['Mediathek'], name + ': app_name alone still marks');
}

// u07-12: the tile's line „Artist · Title“.
const sd = new Function('window', 'states', 'hass', 'variables', 'entity', 'user', strip(tpl.casora_media.state_display));
const line = sd({}, {}, {}, {}, { entity_id: 'media_player.qa_speaker', state: 'playing',
  attributes: { media_content_type: 'music', media_artist: 'Testband', media_title: 'Testlied 1' } }, {});
assert.ok(line.includes('Testband · Testlied 1'), 'tile: artist · title — ' + line);
console.log('media_quellen: ok');
