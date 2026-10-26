// Popup blueprint v2, stage 2: the generic entity popup (casora_appliance), the media popups and the alarm.
//   node dev/unit/popup_stage2_generic_media.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const src = rd('custom_components/casora/scripts/local/05-standard-medien.js');
const cut = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a > 0 && b > a, from); return src.slice(a, b); };

// Media: the header switch is the TV's power (decision 2: no Einschalten/Ausschalten row).
new Function(cut('// ── Media popup: header switch', '// ── Medien-Popup: Apps umbrechen'))();
const head = window._casoraMediaHead;
assert.ok(window._casoraHeadSwitchHooks.includes(head), 'hook registered');
const card = (tpl, id, attrs) => ({ _config: { template: tpl }, _stateObj: { entity_id: id, state: 'playing', attributes: attrs } });
const calls = [];
const hass = { callService: (d, s, data) => calls.push([d, s, data.entity_id.join(',')]) };
const tv = head(card('casora_media', 'media_player.living_tv', { device_class: 'tv', supported_features: 384 }), hass);
assert.deepEqual(tv.entities, ['media_player.living_tv']);
tv.toggle(true, tv.entities, hass); tv.toggle(false, tv.entities, hass);
assert.deepEqual(calls, [['media_player', 'turn_off', 'media_player.living_tv'], ['media_player', 'turn_on', 'media_player.living_tv']]);
assert.ok(head(card(['casora_now_playing_chip'], 'media_player.living_tv', { device_class: 'receiver', supported_features: 384 }), hass), 'chip too');
assert.equal(head(card('casora_media', 'media_player.kitchen_speaker', { device_class: 'speaker', supported_features: 384 }), hass), null, 'speaker: no switch');
assert.equal(head(card('casora_media', 'media_player.living_tv', { device_class: 'tv', supported_features: 128 }), hass), null, 'cannot turn off');
assert.equal(head(card('casora_switch', 'media_player.living_tv', { device_class: 'tv', supported_features: 384 }), hass), null, 'other template');

const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
for (const n of ['casora_media', 'casora_now_playing_chip', 'casora_now_playing_primary']) {
  const c = T[n].tap_action.casora_popup.content;
  assert.ok(!/label: 'Einschalten'|label: 'Ausschalten'/.test(c), n + ': power row still there');
  assert.ok(/UI\.settings \? UI\.settings\(id, rows/.test(c), n + ': Einstellungen via UI.settings');
}

// Core: a media player counts as on in every state but off/standby.
const core = rd('custom_components/casora/scripts/casora-core.js');
assert.ok(/media_player\\\.\/\.test\(x\) && !\/\^\(off\|standby\|unavailable\|unknown\)\$\/\.test/.test(core), 'head switch: media on-state');

// Generic entity popup: one column (552) unless buttons and values sit side by side (900).
new Function(cut('// ── Generic entity popup', '// ── Media popup: header switch'))();
const E = window._casoraEntityPopup;
const ent = { entity_id: 'switch.box' };
const states = { 'switch.box': { state: 'on', attributes: {} }, 'sensor.box_power': { state: '3', attributes: {} } };
const reg = { entities: { 'switch.box': { device_id: 'd1' }, 'sensor.box_power': { device_id: 'd1' } } };
const acts = { action_1_action: 'toggle', action_1_entity: 'switch.box' };
assert.equal(E.kind(ent, acts, states, reg), 'two');
assert.equal(E.kind(ent, {}, states, reg), 'one', 'no buttons');
assert.equal(E.kind(ent, acts, states, { entities: {} }), 'one', 'no values');
assert.equal(E.kind(ent, { action_1_action: 'toggle', action_1_entity: 'switch.box', action_1_enabled: false }, states, reg), 'one', 'button off');
assert.ok(/casoraPopupWidth\(k\)/.test(T.casora_appliance.tap_action.casora_popup.style), 'appliance width from kind');

// Rendered with stub building blocks: Bedienung, Zustand, „Weitere Einstellungen“ last; state in the status line.
const seen = [];
window._casoraUI = {
  section: (kind, rows) => { seen.push(kind); return '<sec ' + kind + '>' + rows.map((r) => r.label + (r.noChev ? '·' : '')).join(';') + '</sec>'; },
  settingsRow: (id, o) => ({ label: 'Weitere Einstellungen', entity: id, sub: o && o.sub }),
  settings: (r) => { seen.push('settings'); return '<sec settings>' + r.label + '</sec>'; },
};
window._casoraStd = (card, o) => ({ split: o, card });
const out = E(ent, acts, states, Object.assign({ formatEntityState: (s) => s.state }, reg));
assert.deepEqual(out.split, { left: ['acts'], right: ['vals', 'more'] }, 'Bedienung left, Zustand and Einstellungen right');
assert.deepEqual(seen, ['control', 'settings']);
assert.equal(out.card.custom_fields.acts, '<sec control>switch.box·</sec>', 'toggle button: action row without arrow');
assert.ok(/_casoraUI\.line\(/.test(out.card.custom_fields.hero) && !/hero\(/.test(out.card.custom_fields.hero), 'state as status line');
assert.ok(/UI\.section\("state"/.test(out.card.custom_fields.vals));
const one = E(ent, {}, states, Object.assign({ formatEntityState: (s) => s.state }, reg));
assert.ok(!one.split, 'one column without buttons');
// Alarm (Weich): the state is the header's status line (rule 1), one column (552, rule 11).
for (const n of ['casora_popup_alarm', 'casora_badge_security']) {
  const p = T[n].tap_action.casora_popup;
  assert.ok(p.content.includes(`? '<div class="hui-line" style="letter-spacing:-0.01em;`), n + ': status line not marked .hui-line');
  assert.ok(/heroSub && !_soft/.test(p.content), n + ': open sensors only in the status line');
  assert.ok(/casoraPopupWidth\('one'\)/.test(p.style || ''), n + ': alarm width 552');
}
console.log('ok popup_stage2_generic_media');
