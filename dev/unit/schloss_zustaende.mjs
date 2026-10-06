// Schloss-Zustände jenseits von locked/unlocked (Nuki: open, opening, locking, unlocking).
//   node dev/unit/schloss_zustaende.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
globalThis.window = globalThis;
window.casoraIconUrl = (n) => n;

// B-TPL-07: Schloss-Kachel zeigt bei „open“ das offene Schloss.
{
  const pic = (state) => new Function('entity', 'variables', 'states', body(T.casora_lock.entity_picture))({ state }, {}, {});
  assert.equal(pic('open'), 'lock-open-fill');
  assert.equal(pic('opening'), 'lock-unlocking-fill');
  assert.equal(pic('locked'), 'lock-fill');
  const mask = T.casora_lock.styles.card.find((x) => x['--casora-icon-mask-image'])['--casora-icon-mask-image'];
  assert.match(new Function('entity', 'variables', 'states', body(mask))({ state: 'open' }, {}, {}), /lock-open-fill/);
}
console.log('ok B-TPL-07');

// B-TPL-06: Schloss-Badges sagen nur bei „jammed“ „Blockiert“.
for (const name of ['casora_badge_contact_group', 'casora_badge_security']) {
  const m = T[name].name.match(/sub = s === 'locked'[\s\S]*?\|\| s\);/)[0];
  const sub = (s) => new Function('s', 'hass', 'entity', 'let sub; ' + m + ' return sub;')(s, { formatEntityState: () => 'X' }, { state: s });
  assert.equal(sub('jammed'), 'Blockiert', name);
  assert.equal(sub('open'), 'Offen', name);
  assert.equal(sub('opening'), 'Offen', name);
  assert.equal(sub('locking'), 'Wird verriegelt…', name);
  assert.equal(sub('unlocking'), 'Wird entriegelt…', name);
  assert.equal(sub('locked'), 'Verriegelt', name);
}
console.log('ok B-TPL-06');
