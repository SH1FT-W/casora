// Prüfrunde d03-13: the same TV playing – its volume ring was blue in the media badge's popup and in the cover's colour
// in its own popup (owner 01.11.2026: one accent from the cover for the whole player). Expected: the badge's wheel takes
// the cover's accent as well (the same tint the player's popup sets on its stage).
//   node dev/unit/media_badge_ring_farbe.mjs
// @deckt: custom_components/casora/scripts/local/32-media-badge.js#B.stage custom_components/casora/scripts/local/07-weich-spezial.js#_casoraMediaSoft
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { addEventListener: () => {}, removeEventListener: () => {} };
let stageOpts = null;
win._casoraUI = { esc: String, stage: (t, o) => { stageOpts = o; return 'S'; }, quick: () => '', page: () => {} };
win._casoraNPSoft = { tintOf: () => 'hsl(178,52%,38%)' };
new Function('window', 'document', 'CSS', read('custom_components/casora/scripts/local/07-weich-spezial.js'))(win, { querySelector: () => null, addEventListener: () => {} }, null);
new Function('window', 'document', read('custom_components/casora/scripts/local/32-media-badge.js'))(win, { querySelector: () => null, addEventListener: () => {} });
const B = win._casoraMediaBadge;
const states = { 'media_player.qa_tv': { state: 'playing', attributes: { volume_level: 0.24, entity_picture: '/cover.jpg', media_title: 'Film' } } };
B.stage([{ id: 'media_player.qa_tv', kind: 'play', playing: true, line: 'Film', name: 'Fernseher' }], {}, 1, states);
assert.ok(stageOpts, 'slider stage built');
assert.match(String(stageOpts.extra), /--casora-popup-accent:hsl\(178,52%,38%\)/, 'the wheel takes the cover\'s accent');
// Without a cover nothing is tinted.
states['media_player.qa_tv'].attributes.entity_picture = null;
B.stage([{ id: 'media_player.qa_tv', kind: 'play', playing: true, line: 'Film', name: 'Fernseher' }], {}, 1, states);
assert.ok(!/--casora-popup-accent/.test(String(stageOpts.extra)), 'no cover: device colour as before');
console.log('media_badge_ring_farbe: ok');
