// Entities picked in the Studio for a tile's popup (#32): casoraPopupExtras hands them over as one card before the
// pasted cards – Casora's own rows (<casora-popup-entities>) when that element exists, else HA's entities card.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const src = core.slice(core.indexOf('window.casoraPopupExtras = function'), core.indexOf('window.casoraPopup = {'));
const card = { _config: { variables: { popup_extra_entities: ['switch.boost', 'nonsense'], popup_extra_cards: [{ type: 'markdown', content: 'x' }] } } };

// Without the element: HA's entities card stands in (no error card in the popup).
const w1 = {};
new Function('window', src)(w1);
const ex1 = w1.casoraPopupExtras(card);
assert.deepEqual(ex1.cards.map((c) => c.type), ['entities', 'markdown']);
assert.deepEqual(ex1.cards[0].entities, ['switch.boost'], 'only real entity ids');

// With the element: Casora's own rows.
const w2 = { customElements: { get: (n) => (n === 'casora-popup-entities' ? class {} : undefined) } };
new Function('window', src)(w2);
const ex2 = w2.casoraPopupExtras(card);
assert.deepEqual(ex2.cards.map((c) => c.type), ['custom:casora-popup-entities', 'markdown']);
assert.deepEqual(ex2.cards[0].entities, ['switch.boost']);
assert.equal(w2.casoraPopupExtras({ _config: { variables: { popup_extra_entities: [] } } }), null, 'nothing picked, nothing shown');

// Studio: the field stores variables.popup_extra_entities.
const pop = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-popups.js', import.meta.url), 'utf8');
assert.ok(/advRow\("Entities in popup"/.test(pop) && /popup_extra_entities = next/.test(pop), 'Studio field');
console.log('ok popup_extra_entities');
