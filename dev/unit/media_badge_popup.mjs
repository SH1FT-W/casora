// #64: the media badge said "1 läuft" (a TV that was only "on"), but its tap opened nothing – the row it expanded
// only showed players with a title. Now the badge counts with window._casoraMediaBadge (32-media-badge.js) and its tap
// opens casora_popup_media, which lists every configured player with the same rule: what "läuft" counts is exactly
// the "Läuft" list of the popup, and the tap always opens the popup (also when nothing plays).
//   node dev/unit/media_badge_popup.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

globalThis.window = globalThis;
const groups = [];
window._casoraUI = {
  esc,
  line: (main, rest) => '<div class="hui-line">' + esc(main) + (rest || []).map((r) => ' · ' + esc(r)).join('') + '</div>',
  group: (rows, label) => { groups.push({ label, rows }); return '<div class="g">' + esc(label) + rows.map((r) => '<div>' + esc(r.label) + '|' + esc(r.sub || '') + '|' + esc(r.value || r.action || '') + '</div>').join('') + '</div>'; },
  note: (t) => '<div class="note">' + esc(t) + '</div>',
};
window._casoraSoftKit = { secCard: (watch, code) => ({ watch, code }), layout: (o) => ({ o }) };
new Function(read('custom_components/casora/scripts/local/32-media-badge.js'))();
const B = window._casoraMediaBadge;
assert.ok(B && B.popup && B.count, 'module loaded');

const now = new Date().toISOString();
const old = new Date(Date.now() - 60 * 60000).toISOString();
const mk = (state, attrs, changed) => ({ state, last_changed: changed || now, attributes: Object.assign({ supported_features: 0 }, attrs || {}) });
const PLAY_PAUSE = 1 | 16384;
// Alexa Media Player shapes: an Echo plays with title/artist; idle Echos keep the last title; groups report standby.
const S = {
  playing: mk('playing', { friendly_name: 'Echo Kitchen', media_title: 'Song', media_artist: 'Band', supported_features: PLAY_PAUSE }),
  paused: mk('paused', { friendly_name: 'Echo Bath', media_title: 'Podcast', supported_features: PLAY_PAUSE }),
  pausedOld: mk('paused', { friendly_name: 'Echo Old', media_title: 'Podcast' }, old),
  tvOn: mk('on', { friendly_name: 'LG webOS TV', source: 'Live TV', supported_features: 21437 }),
  tvBare: mk('on', { friendly_name: 'Test TV' }),
  // LG webOS (integration webostv, #64): "on" with a source list, no media_title; on live TV the channel is the title.
  webos: mk('on', { friendly_name: 'LG webOS TV OLED55', source: 'HDMI 1', source_list: ['HDMI 1', 'Live TV', 'Netflix'],
    sound_output: 'tv_speaker', is_volume_muted: false, volume_level: 0.12, device_class: 'tv', supported_features: 24509 }),
  webosLive: mk('on', { friendly_name: 'LG webOS TV Live', source: 'Live TV', media_title: 'Das Erste HD', media_content_type: 'channel',
    device_class: 'tv', supported_features: 24509 }),
  idleTitle: mk('idle', { friendly_name: 'Echo Dot', media_title: 'Last song', media_artist: 'Band' }),
  standby: mk('standby', { friendly_name: 'Echo Group' }),
  off: mk('off', { friendly_name: 'Speaker Off' }),
  gone: mk('unavailable', { friendly_name: 'Speaker Gone' }),
};
const ID = Object.fromEntries(Object.keys(S).map((k) => [k, 'media_player.' + k]));
const states = Object.fromEntries(Object.keys(S).map((k) => [ID[k], Object.assign({ entity_id: ID[k] }, S[k])]));
states['media_player.no_title_playing'] = { entity_id: 'media_player.no_title_playing', state: 'playing', last_changed: now, attributes: { friendly_name: 'Echo Blank' } };
const hass = { states, entities: {}, devices: {}, areas: {} };

// ── kind / word ──
assert.equal(B.kind(states[ID.playing], 10, states), 'run');
assert.equal(B.kind(states[ID.tvOn], 10, states), 'run', 'a TV that is on counts as running (as the badge always did)');
assert.equal(B.kind(states['media_player.no_title_playing'], 10, states), 'run');
assert.equal(B.kind(states[ID.paused], 10, states), 'pause');
assert.equal(B.kind(states[ID.pausedOld], 10, states), 'rest', 'paused past the timeout rests');
assert.equal(B.kind(states[ID.pausedOld], 0, states), 'pause', 'timeout 0 = paused stays active');
assert.equal(B.kind(states[ID.webos], 10, states), 'run');
assert.equal(B.kind(states[ID.webosLive], 10, states), 'run');
{
  groups.length = 0;
  B.sec('list', { ids: [ID.webos, ID.webosLive, ID.standby] }, states, hass);
  const [w, wl] = groups[0].rows;
  assert.equal(groups[0].label, 'Läuft');
  assert.deepEqual([w.label, w.value, w.sub, w.svc], ['LG webOS TV OLED55', 'An', 'HDMI 1', undefined], 'webOS without title: source, „An“');
  assert.deepEqual([wl.value, wl.sub, wl.svc, wl.icon], ['An', 'Das Erste HD', undefined, 'mdi:television'],
    'webOS live TV: channel shown, no „Abspielen“ for a TV that is on');
  assert.equal(B.count([ID.webos, ID.standby], states, 10).sub, '1 läuft');
}
for (const k of ['idleTitle', 'standby', 'off', 'gone']) assert.equal(B.kind(states[ID[k]], 10, states), 'rest', k);
assert.equal(B.kind(undefined, 10, states), 'rest');
assert.equal(B.word(states[ID.tvOn]), 'An');
assert.equal(B.word(states[ID.idleTitle]), 'Bereit');
assert.equal(B.word(states[ID.standby]), 'Standby');
assert.equal(B.word(states[ID.gone]), 'Nicht verfügbar');
assert.equal(B.word(undefined), 'Nicht verfügbar');

// ── The badge's sub-line, with and without the module, equals the popup's "Läuft" list ──
const tpl = T.casora_badge_media_group;
const body = tpl.name.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const badge = (ids, win, extra) => {
  const v = Object.assign({}, extra || {});
  ids.forEach((id, i) => { v['entity_' + (i + 1)] = id; });
  const html = new Function('hass', 'states', 'variables', 'window', body)({ states }, states, v, win);
  return html.match(/badge-sub">([^<]*)</)[1];
};
const scenarios = [
  [ID.webos, ID.idleTitle, ID.standby, ID.off],              // the report: webOS TV on, Echos idle/standby
  [ID.playing, ID.paused, ID.tvOn],
  [ID.paused, ID.pausedOld, ID.off],
  [ID.standby, ID.off, ID.gone],
  [ID.playing, 'media_player.no_title_playing', ID.tvBare],
  [ID.idleTitle],
  [],
];
for (const ids of scenarios) {
  const withMod = badge(ids, window);
  const without = badge(ids, {});
  assert.equal(withMod, without, 'module and inline rule agree: ' + ids.join(','));
  const rows = B.rows(ids, states, hass, 10, null);
  const run = rows.filter((r) => r.kind === 'run').length, paused = rows.filter((r) => r.kind === 'pause').length;
  assert.equal(withMod, B.subText(run + paused, paused), 'badge text = popup list: ' + ids.join(','));
  assert.equal(rows.length, ids.length, 'popup lists every configured player');
}
assert.equal(badge(scenarios[0], window), '1 läuft');
assert.equal(badge(scenarios[3], window), 'Nichts läuft');
assert.equal(badge(scenarios[2], window), '1 pausiert');
assert.equal(badge([ID.playing], window, { pc_count: 1 }), '2 laufen', 'Discord/Steam count as running');

// ── Popup content: running first, controls, the rest with their word ──
const C = { ids: [ID.off, ID.standby, ID.idleTitle, ID.tvOn, ID.playing, ID.paused], timeout: 10, pc: null };
groups.length = 0;
const list = B.sec('list', C, states, hass);
assert.deepEqual(groups.map((g) => g.label), ['Läuft', 'Weitere Geräte']);
assert.deepEqual(groups[0].rows.map((r) => r.label), ['Echo Kitchen', 'LG webOS TV', 'Echo Bath'], 'playing first, then a device that is on, then paused');
assert.deepEqual(groups[1].rows.map((r) => r.label), ['Echo Dot', 'Speaker Off', 'Echo Group'], 'ready first, then standby/off in config order');
const song = groups[0].rows[0], tv = groups[0].rows[1], bath = groups[0].rows[2];
assert.equal(tv.value, 'An');
assert.equal(tv.svc, undefined, 'a TV without a title has nothing to pause – the row opens the player');
assert.equal(tv.entity, ID.tvOn);
assert.equal(tv.sub, 'Live TV', 'source as sub-line');
assert.deepEqual(song.svc, { domain: 'media_player', service: 'media_play_pause', data: { entity_id: ID.playing } });
assert.equal(song.action, 'Pausieren');
assert.equal(song.sub, 'Song – Band');
assert.equal(bath.action, 'Abspielen');
assert.equal(groups[1].rows[0].value, 'Bereit');
assert.equal(groups[1].rows[0].sub, undefined, 'a resting player does not show its old title');
assert.ok(list.indexOf('LG webOS TV') < list.indexOf('Echo Dot'));
assert.equal(B.sec('hero', C, states, hass), '<div class="hui-line">2 laufen · 6 Geräte</div>');

// Nothing plays: the popup still lists the devices (with Aus/Bereit) instead of opening nothing.
groups.length = 0;
B.sec('list', { ids: [ID.off, ID.idleTitle], timeout: 10 }, states, hass);
assert.deepEqual(groups.map((g) => g.label), ['Geräte']);
assert.deepEqual(groups[0].rows.map((r) => r.value), ['Bereit', 'Aus']);
assert.match(B.sec('hero', { ids: [ID.off, ID.idleTitle] }, states, hass), /Nichts läuft · 2 Geräte/);
assert.match(B.sec('list', { ids: [] }, states, hass), /Noch kein Gerät zugeordnet/);
// Escaping: names come from HA.
states['media_player.x'] = { state: 'playing', last_changed: now, attributes: { friendly_name: '<b>x</b>', media_title: '"t"' } };
assert.ok(!B.sec('list', { ids: ['media_player.x'] }, states, hass).includes('<b>x'), 'escaped');

// popup(): hero + one live list, watching every player.
const P = B.popup(states, hass, { entity_1: ID.tvOn, entity_2: ID.playing, entity_3: ID.tvOn, pause_timeout_minutes: 5 });
assert.deepEqual(Object.keys(P.o.fields), ['hero', 'list']);
assert.deepEqual(P.o.fields.list.card.watch, [ID.tvOn, ID.playing], 'unique players watched');
assert.match(P.o.fields.list.card.code, /"timeout":5/);

// ── Templates: the tap always opens the popup ──
assert.ok(T.casora_popup_media, 'casora_popup_media');
assert.match(T.casora_popup_media.tap_action.casora_popup.content, /_casoraMediaBadge\.popup/);
assert.deepEqual(tpl.template, ['casora_badge_base', 'casora_popup_media']);
assert.equal(tpl.tap_action, undefined, 'no own tap (the expanded row stayed empty for a TV that was on)');
const uses = [];
const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.template === 'casora_badge_media_group') uses.push(o); Object.values(o).forEach(walk); } };
walk(T);
assert.ok(uses.length >= 3, 'room, phone room, phone home');
for (const u of uses) {
  assert.equal(u.tap_action, undefined, 'no tap override');
  assert.ok(u.variables && u.variables.pc_cfg, 'pc_cfg for the Discord/Steam rows');
}
console.log('media_badge_popup: ok');
