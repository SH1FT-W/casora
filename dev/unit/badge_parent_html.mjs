// #204: the phone room page's motion badge showed its markup as text („<div class="badge-wrap"><div class="badge-title">B…“).
// A button-card inside a custom_fields card gets its config evaluated by the outer card: its `name` [[[ … ]]] arrives
// as the finished HTML string, and casora-core.js's plain-name guard (__casoraPlainEsc) took that for a plain config
// name and escaped it. Same for the Discord/Steam activity badges of a room's media row (desktop and phone).
// Checked here, like button-card does it: every nested Casora button-card whose name/label template returns markup is
// evaluated by its outer card, then drawn through the guard; the markup must come out unchanged.
//   node dev/unit/badge_parent_html.mjs
// @deckt: custom_components/casora/scripts/casora-core.js dashboards/casora/button_card_templates.json#casora_mobile_sensor_chips,casora_room,casora_badge_base,casora_badge_activity
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const core = read('custom_components/casora/scripts/casora-core.js');

// The guard, on a stand-in for button-card's prototype.
const a = core.indexOf('// button-card renders a plain name');
const b = core.indexOf('\n})();\n', a) + 6;
assert.ok(a > 0 && b > a, 'plain-name guard in casora-core.js');
class Card {
  _buildName(st, cs) { return (cs && cs.name) || this._config.name; }
  _buildLabel(st, cs) { return (cs && cs.label) || this._config.label; }
  _buildStateString() { return ''; }
}
const w = {
  casoraEsc: (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
};
let ready;
w.customElements = { get: () => Card, whenDefined: () => ({ then: (f) => { ready = f; } }) };
new Function('window', 'customElements', core.slice(a, b))(w, w.customElements);
ready();

// Nested Casora button-cards in a custom_fields card the outer card evaluates (no do_not_eval), with a name or label
// template that returns markup.
const found = [];
const isTpl = (v) => typeof v === 'string' && /^\s*\[\[\[/.test(v);
const walk = (x, path, nested) => {
  if (Array.isArray(x)) { x.forEach((v, i) => walk(v, `${path}[${i}]`, nested)); return; }
  if (!x || typeof x !== 'object') return;
  if (nested && x.type === 'custom:button-card' && [].concat(x.template || []).some((t) => /^casora_/.test(String(t)))) {
    for (const k of ['name', 'label']) if (isTpl(x[k]) && x[k].includes('<')) found.push({ path: path + '.' + k, card: x, key: k });
  }
  for (const [k, v] of Object.entries(x)) {
    if (k === 'custom_fields' && v && typeof v === 'object') {
      for (const [f, fv] of Object.entries(v)) {
        if (fv && typeof fv === 'object' && fv.card) { if (fv.do_not_eval !== true) walk(fv.card, `${path}.${f}`, true); }
        else walk(fv, `${path}.${f}`, nested);
      }
    } else walk(v, `${path}.${k}`, nested);
  }
};
for (const [name, t] of Object.entries(T)) walk(t, name, false);
const paths = found.map((f) => f.path);
assert.ok(paths.some((p) => p.startsWith('casora_mobile_sensor_chips.rooms_row') && p.endsWith('.name')), 'phone motion badge found: ' + paths.join(', '));
assert.ok(paths.some((p) => p.startsWith('casora_room.badges_media.activity_discord')), 'Discord badge found');

// The outer card evaluates the template (button-card: new Function over states, entity, user, hass, variables, html).
const evalTpl = (src, ctx) => {
  const body = src.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  return new Function('window', 'states', 'entity', 'user', 'hass', 'variables', 'html', '"use strict";' + body)
    .call({}, ctx.window, ctx.states, undefined, { name: 'x' }, { states: ctx.states }, ctx.variables, undefined);
};
const M = 'binary_sensor.garden_motion';
const states = { 'input_select.casora_mobile_filter': { state: 'room_garden' }, [M]: { state: 'off', attributes: { device_class: 'motion' } } };
const tplWin = Object.assign({}, w, {
  casoraMotionOf: (o) => (o && o.motion_entity ? { ids: [o.motion_entity], entity: o.motion_entity, state: states[o.motion_entity].state } : null),
});
for (const f of found) {
  const html = evalTpl(f.card[f.key], { window: tplWin, states, variables: { room_chips: { room_garden: { motion_entity: M } }, casora_rv: {} } });
  assert.equal(typeof html, 'string', f.path + ': returns a string');
  assert.ok(html.includes('<div class="badge-wrap">'), f.path + ': markup expected, got ' + html);
  // The inner card's config as the outer card hands it on: the template replaced by its result.
  const inner = Object.assign(new Card(), { _config: Object.assign({}, f.card, { [f.key]: html }) });
  const shown = f.key === 'name' ? inner._buildName({}, null) : inner._buildLabel({}, null);
  assert.equal(shown, html, f.path + ': drawn as markup, not as escaped text');
}
const motion = found.find((f) => f.path.startsWith('casora_mobile_sensor_chips.rooms_row'));
const html = evalTpl(motion.card.name, { window: tplWin, states, variables: { room_chips: { room_garden: { motion_entity: M } } } });
assert.equal(html, '<div class="badge-wrap"><div class="badge-title">Bewegung</div><div class="badge-sub">Nicht erkannt</div></div>');

// A plain config name (text, not a template result) is still escaped.
const plain = Object.assign(new Card(), { _config: { template: 'casora_badge_base', name: '<b>x</b>' } });
assert.equal(plain._buildName({}, null), '&lt;b&gt;x&lt;/b&gt;', 'plain names stay escaped');
console.log('badge_parent_html: ok (' + found.length + ' nested badges)');
