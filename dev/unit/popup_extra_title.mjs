// Own cards in a popup with a heading (issue #32): the heading goes along with the cards in every
// popup, the thermostat's included, and the Studio takes it while typing, not only when the field is left.
//   node dev/unit/popup_extra_title.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const at = core.indexOf('window.casoraPopupExtras = function (card) {');
assert.ok(at > 0, 'casoraPopupExtras');
const window = {};
new Function('window', core.slice(at, core.indexOf('\n  };', at) + 4))(window);

const card = (variables) => ({ _config: { variables } });
assert.deepEqual(window.casoraPopupExtras(card({ popup_extra_cards: [{ type: 'markdown' }], popup_extra_title: ' Zeitplan ' })),
  { title: 'Zeitplan', cards: [{ type: 'markdown' }] });
assert.equal(window.casoraPopupExtras(card({ popup_extra_cards: [{ type: 'custom:example-card' }] })).title, '');
assert.equal(window.casoraPopupExtras(card({ popup_extra_title: 'Zeitplan' })), null, 'a heading without cards shows nothing');

// Every Casora popup (tap and hold) hands the cards and heading over, the thermostat included.
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const withPopup = [];
for (const [name, t] of Object.entries(T)) {
  for (const k of ['tap_action', 'hold_action']) {
    const p = t[k] && t[k].casora_popup;
    if (p && p.content) withPopup.push([name, k, String(p.extra || '')]);
  }
}
assert.ok(withPopup.some(([n]) => n === 'casora_thermostat'), 'thermostat has a popup');
for (const [n, k, extra] of withPopup.filter(([n]) => n === 'casora_thermostat')) {
  assert.ok(/casoraPopupExtras\(this\)/.test(extra), `${n}.${k}: extra cards and heading`);
}

// The popup draws the heading above the cards and keeps it above them.
assert.ok(/\.extra-title \{[^}]*position: relative;[^}]*z-index: 1;/.test(core), 'heading above the cards');

// Studio: the heading field writes while typing (debounced) and on change.
const pop = read('custom_components/casora/panel/casora-panel-popups.js');
assert.ok(/input\.oninput = \(\) => \{ clearTimeout\(wait\); wait = setTimeout\(put, 300\); \};/.test(pop), 'taken while typing');
assert.ok(/input\.onchange = \(\) => \{ clearTimeout\(wait\); put\(\); \};/.test(pop), 'and on change');

console.log('ok popup_extra_title');
