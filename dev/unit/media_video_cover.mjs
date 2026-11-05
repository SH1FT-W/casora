// Video cover (01.11.2026): a film, series or TV channel fills the media wheel's middle with its cover – same size
// and circle as the record, no grooves, no turning. Music and podcasts keep the turning record.
//   node dev/unit/media_video_cover.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const cut = (from, to) => { const a = core.indexOf(from), b = core.indexOf(to, a); assert.ok(a > 0 && b > a, from); return core.slice(a, b); };

// 1. Detection.
const isVideo = new Function(cut('  var VIDEO_TYPES', '  function stage(type, o)') + '\nreturn mediaVideo;')();
const cases = [
  [{ media_content_type: 'tvshow', app_name: 'Prime Video' }, 'media_player.living_room_apple_tv', true, 'Apple TV, series'],
  [{ media_content_type: 'movie' }, 'media_player.box', true, 'movie'],
  [{ media_content_type: 'episode' }, 'media_player.box', true, 'episode'],
  [{ media_content_type: 'video' }, 'media_player.box', true, 'video'],
  [{ media_content_type: 'channel' }, 'media_player.box', true, 'channel'],
  [{ media_content_type: 'tv' }, 'media_player.box', true, 'tv'],
  [{ app_name: 'Netflix' }, 'media_player.box', true, 'video app without a type'],
  [{ app_name: 'Disney+' }, 'media_player.box', true, 'Disney+'],
  [{ source: 'YouTube' }, 'media_player.box', true, 'YouTube as source'],
  [{ app_name: 'MagentaTV' }, 'media_player.box', true, 'MagentaTV'],
  [{ app_name: 'Paramount+' }, 'media_player.box', true, 'Paramount+'],
  [{ app_name: 'HBO Max' }, 'media_player.box', true, 'HBO Max'],
  [{ app_id: 'com.amazon.aiv.AIVApp' }, 'media_player.box', true, 'Prime Video by app id'],
  [{ device_class: 'tv' }, 'media_player.box', true, 'a TV without more'],
  [{}, 'media_player.bedroom_apple_tv', true, 'Apple TV by its id'],
  [{ media_content_type: 'music', app_name: 'Apple Music' }, 'media_player.living_room_apple_tv', false, 'music on the Apple TV'],
  [{ media_content_type: 'music' }, 'media_player.kitchen', false, 'music'],
  [{ media_content_type: 'podcast' }, 'media_player.kitchen', false, 'podcast'],
  [{ app_name: 'Spotify', device_class: 'tv' }, 'media_player.living_tv', false, 'Spotify on a TV'],
  [{ app_name: 'YouTube Music' }, 'media_player.box', false, 'YouTube Music'],
  [{ device_class: 'speaker' }, 'media_player.kitchen_speaker', false, 'speaker'],
  [{}, 'media_player.kitchen', false, 'nothing known: the record'],
  [null, null, false, 'no attributes'],
];
for (const [a, id, want, msg] of cases) assert.equal(isVideo(a, id), want, msg);

// 2. Render: video → the cover is the whole disc, no label, no spin; music → the record with its label.
const branch = cut("      var quiet = ", "    } else if (code === 'S2')");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const render = (cover, off, svc) => new Function('o', 'esc', 'window', 'off', 'var coverHtml = "", belowHtml = "", v = 0;\n' + branch + '\nreturn coverHtml + belowHtml;')({ cover, svc }, esc, {}, !!off);
const vid = render({ image: '/api/media_player_proxy/x', spin: true, tv: false, video: true });
assert.match(vid, /class="hui-dl-cover video"/);
assert.ok(!/spin|hui-dl-lbl/.test(vid), 'video: no turning, no label');
assert.match(vid, /<img src="\/api\/media_player_proxy\/x"/);
const rec = render({ image: '/api/media_player_proxy/y', spin: true, video: false });
assert.match(rec, /class="hui-dl-cover spin"><div class="hui-dl-lbl"><img/, 'music: turning record with the label');
assert.match(render({ image: '/x', spin: true, tv: true, video: false }), /hui-dl-cover spin"/, 'music on a TV: the record turns');
assert.match(render({ image: null, spin: true, video: true }), /hui-dl-cover bare"><div class="hui-dl-lbl"><ha-icon/, "video without a cover: a still record with a note, no spindle hole");

// A game console (owner 05.11.2026): no record – its game's picture fills the disc, else its symbol on the quiet disc;
// off or without a volume of its own, no volume line.
const conOff = render({ image: null, console: 'mdi:sony-playstation' }, true, null);
assert.match(conOff, /class="hui-dl-cover tv"><div class="hui-dl-lbl"><ha-icon icon="mdi:sony-playstation">/, 'console off: its symbol, no record');
assert.ok(!/hui-dl-vol/.test(conOff), 'console off: no volume line');
const conGame = render({ image: '/game.png', spin: true, console: 'mdi:sony-playstation' }, false, null);
assert.match(conGame, /class="hui-dl-cover video"><img src="\/game\.png"/, 'console in a game: the picture fills the disc');
assert.ok(!/spin|hui-dl-vol/.test(conGame), 'console in a game: no turning, no volume line without volume control');
assert.match(render({ image: null, spin: true }, false, {}), /hui-dl-vol/, 'music player: the volume line stays');

// Which players are consoles: the integration first, then name, id or app; music players and TVs are none.
const mc = new Function('document', cut("  var CONSOLE_PLATFORMS", "  function stage(type, o)") + ' return mediaConsole;')({ querySelector: () => null });
const reg = (id, platform) => ({ entities: { [id]: { platform } } });
assert.equal(mc({}, 'media_player.living_room', reg('media_player.living_room', 'playstation_network')), 'mdi:sony-playstation', 'PSN platform → console');
assert.equal(mc({ friendly_name: 'PlayStation 5' }, 'media_player.ps5', null), 'mdi:sony-playstation', 'PS5 by name');
assert.equal(mc({ friendly_name: 'Xbox Series X' }, 'media_player.xbox', reg('media_player.xbox', 'xbox')), 'mdi:microsoft-xbox', 'Xbox');
assert.equal(mc({ friendly_name: 'Switch' }, 'media_player.switch', reg('media_player.switch', 'nintendo_parental_controls')), 'mdi:nintendo-switch', 'Nintendo');
assert.equal(mc({ friendly_name: 'HomePod Küche', app_name: 'Spotify' }, 'media_player.homepod', null), null, 'music player: none');
assert.equal(mc({ friendly_name: 'Wohnzimmer TV', device_class: 'tv' }, 'media_player.tv', reg('media_player.tv', 'webostv')), null, 'TV: none');
assert.equal(mc({ friendly_name: 'Caps4 Lautsprecher' }, 'media_player.caps4', null), null, 'no word boundary: none');

// 3. CSS: the video disc hides grooves and hole, fills with object-fit cover, never animates.
assert.match(core, /\.hui-dl-cover\.video::before,\.hui-dl-cover\.video::after\{display:none;\}/);
assert.match(core, /\.hui-dl-cover\.video img\{[^}]*object-fit:cover;object-position:50% 50%/);
assert.ok(!/\.hui-dl-cover\.video[^{]*\{[^}]*animation/.test(core), 'video: no animation');

// 4. Every media dial passes the flag.
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
for (const n of ['casora_media', 'casora_now_playing_chip', 'casora_now_playing_primary'])
  assert.ok(T[n].tap_action.casora_popup.content.includes('video: !!(UI.mediaVideo && UI.mediaVideo(a, id))'), n + ': video flag');
assert.ok(rd('custom_components/casora/scripts/local/32-media-badge.js').includes('video: !!(UI.mediaVideo && UI.mediaVideo(a, top.id))'), 'media badge');
console.log('media_video_cover: ok');
