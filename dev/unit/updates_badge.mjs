// Updates badge (#167): an optional badge on Home (desktop, tablet and the phone start page) that shows only while
// updates wait, with their number, split by kind (Home Assistant, Marketplace, devices) when more than one kind
// waits; a tap opens the Updates popup. Off by default, switched in the Studio under Badges on Home only.
// Without a browser: _casoraUpdX.pending from 03-popups.js and the template's own expressions.
//   node dev/unit/updates_badge.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_badge_updates, custom_components/casora/scripts/local/03-popups.js#pending, custom_components/casora/panel/casora-panel.js#updatesBadge
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const block = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n})();', i) + 6); };
const doc = { querySelector: () => null, addEventListener: () => {} };
const w = { addEventListener: () => {}, document: doc };
w.window = w;
new Function('window', 'document', 'setTimeout', block(read('custom_components/casora/scripts/local/03-popups.js'), '(function () {\n  if (window._casoraUpdX) return;'))(w, doc, () => 0);
const X = w._casoraUpdX;

const upd = (extra, state = 'on') => ({ state, attributes: { friendly_name: 'x', in_progress: false, ...extra } });
const states = {
  'update.core': upd(), 'update.mosquitto': upd(), 'update.card': upd(), 'update.router': upd(),
  'update.installing': upd({ in_progress: true }), 'update.current': upd({}, 'off'), 'light.on': { state: 'on', attributes: {} },
};
const hass = { entities: { 'update.core': { platform: 'hassio' }, 'update.mosquitto': { platform: 'hassio' }, 'update.card': { platform: 'hacs' },
  'update.router': { platform: 'unifi' } } };
assert.deepEqual(X.pending(states), ['update.card', 'update.core', 'update.mosquitto', 'update.router'],
  'waiting = on and not installing, only update entities');
assert.deepEqual(X.pending({}), []);

// The template: two kinds or more → a count per kind with its icon; one kind → "N verfügbar"; nothing → hidden.
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const B = tpl.casora_badge_updates;
assert.ok(B, 'casora_badge_updates');
assert.deepEqual(B.template, ['casora_badge_base', 'casora_popup_updates'], 'a tap opens the Updates popup');
assert.equal(B.triggers_update, 'all', 'follows every update entity');
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const evalTpl = (s, variables, st, h = hass) => new Function('window', 'states', 'hass', 'variables', 'user', js(s))(w, st, h, variables, {});
const name = (st, v = {}) => evalTpl(B.name, v, st);
const html = name(states);
assert.ok(/data-kind="ha"[^]*>2<\/span>/.test(html) && /data-kind="mp"[^]*>1<\/span>/.test(html) && /data-kind="dev"[^]*>1<\/span>/.test(html), html);
assert.ok(html.includes('mdi:home-assistant') && html.includes('mdi:storefront-outline') && html.includes('mdi:chip'), 'an icon per kind');
assert.ok(/<div class="badge-title">Updates<\/div>/.test(html), 'default name');
const one = name({ 'update.card': upd() });
assert.ok(one.includes('<div class="badge-sub">1 verfügbar</div>') && !one.includes('data-kind'), one);
assert.ok(name(states, { title: 'Neu <b>' }).includes('data-no-i18n>Neu &lt;b&gt;</div>'), 'own name, escaped');
const display = (v, st) => evalTpl(B.styles.card.find((c) => c.display).display, v, st);
assert.equal(display({ enabled: true }, states), 'inline-grid');
assert.equal(display({ enabled: true }, { 'update.current': upd({}, 'off') }), 'none', 'hidden while nothing waits');
assert.equal(display({ enabled: false }, states), 'none', 'hidden when switched off');
assert.ok(/display:\$\{enabled && n > 0 \? 'inline-block' : 'none'\}/.test(B.extra_styles), 'host hidden the same way');
// Without the module (template still works): the same rule inline.
const bare = { document: doc }; bare.window = bare;
assert.ok(new Function('window', 'states', 'hass', 'variables', 'user', js(B.name))(bare, states, hass, {}, {}).includes('4 verfügbar'), 'without the module: a plain count');

// Rows: Home's header (desktop, tablet) and the phone start page, both only with show_updates === true.
const rowCard = (cards) => cards.find((c) => c.template === 'casora_badge_updates');
const room = rowCard(tpl.casora_room.custom_fields.badges.card.cards);
const phone = rowCard(tpl.casora_mobile_filter_badges.custom_fields.badges.card.cards);
assert.ok(room && phone, 'in both rows');
const en = (c, variables) => evalTpl(c.variables.enabled, variables, {});
assert.equal(en(room, {}), false, 'off by default');
assert.equal(en(room, { show_updates: true }), true);
assert.equal(en(phone, { casora_hv: { show_updates: true } }), true, 'phone reads Home');
assert.equal(en(phone, { casora_hv: {} }), false);

// Studio: a badge section on Home only, off by default, stored as show_updates: true.
const src = read('custom_components/casora/panel/casora-panel.js');
const sec = src.slice(src.indexOf('label: "Updates badge"'), src.indexOf('label: "Updates badge"') + 500);
assert.ok(/bid: "updates"/.test(sec) && /homeOnly: true, toggleFn: "updatesBadge"/.test(sec), 'Studio section');
assert.ok(/T\("updates_title", "Name on the badge"\)/.test(sec), 'own name');
assert.ok(/if \(sec\.homeOnly && !onHome\) return;/.test(src) && /!\(sec\.homeOnly && !onHome\)\)/.test(src), 'only on Home');
assert.ok(/get: \(\) => room\.variables\.show_updates === true,/.test(src), 'off unless true');
// Phone start page: Home's variables reach it (phone_badges.py drops only its own prefixes).
assert.ok(!/show_updates|updates_title/.test(read('custom_components/casora/phone_badges.py')), 'not dropped for the phone');
console.log('updates_badge: ok');
