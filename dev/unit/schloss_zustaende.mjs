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
