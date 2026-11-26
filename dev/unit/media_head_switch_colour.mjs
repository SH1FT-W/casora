// Test round 26.11.2026 (u07-08): a paused TV's popup drew its head switch blue (the ring's fixed stand-in colour for
// media) while the tile is pink and the stage takes the cover's colour – three colours in one popup. Decision: the head
// switch in the device colour (the tile's media colour), the cover's colour only on the stage.
//   node dev/unit/media_head_switch_colour.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#RING_HUES,ringFor custom_components/casora/scripts/local/07-weich-spezial.js#tintRule
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  var RING_HUES = [');
const b = core.indexOf('];', a) + 2;
const HUES = new Function(core.slice(a, b) + '\nreturn RING_HUES;')();
// ringFor's stand-in colour when the tile shows none (paused or off): the first match of template + entity.
const keyHue = (key) => { for (const [re, hue] of HUES) if (re.test(key)) return hue; return 'teal'; };

const MEDIA = 'var(--casora-tile-media-color, var(--casora-color-blue, #5B8FC9))';
for (const key of ['casora_media media_player.example_tv', 'casora_media media_player.example_speaker', 'casora_badge_media_player media_player.example_tv']) {
  assert.equal(keyHue(key), MEDIA, key + ': the tile\'s media colour, not the fixed blue');
}
// The tile's own active colour is that variable as well (casora_entity: media_player → --casora-tile-media-color).
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const cur = T.casora_entity.state.find((s) => !s.id).styles.card.find((o) => o['--casora-icon-color-current'])['--casora-icon-color-current'];
assert.match(cur, /media_player: 'var\(--casora-tile-media-color/, 'tile colour of a player');
// Network and updates keep blue.
assert.equal(keyHue('casora_network sensor.example_net'), 'var(--casora-color-blue, #5B8FC9)');
assert.equal(keyHue('casora_updates update.example'), 'var(--casora-color-blue, #5B8FC9)');
// The cover's colour stays on the stage: tintRule tints .hui-stage and the player, never the frame's accent.
const ws = read('custom_components/casora/scripts/local/07-weich-spezial.js');
const tr = /var tintRule = function \(col\) \{[\s\S]*?\n  \};/.exec(ws)[0];
assert.match(tr, /'\.hui-stage\{--casora-popup-accent:'/);
assert.doesNotMatch(tr, /:host|casora-popup-frame|setProperty/, 'no cover colour on the head');
console.log('media_head_switch_colour: ok');
