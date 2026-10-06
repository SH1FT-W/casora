// dashfix2 (06.10.2026): Schlösser-Popup widersprach sich – oben „1 verriegelt“, der Sammelschalter
// „Entriegelt“ stand auf AN, „Verriegelt“ auf AUS. Jetzt: Schalter an = verriegelt (folgt dem Wort),
// Kopf bei gemischtem Zustand „N entriegelt“ wie Badge und Kachel.
//   node dev/unit/schloss_schalter.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/08-weich-kompakt.js', import.meta.url), 'utf8');
const m = src.match(/  window\._casoraSoftLock = function \(s, one\) \{[\s\S]*?\n  \};\n/);
assert.ok(m, '_casoraSoftLock fehlt');
const window = { casoraIconUrl: (n) => n };
new Function('window', 'esc', m[0])(window, (x) => String(x));
const lk = window._casoraSoftLock;
const knobLeft = (h) => (h.match(/position:absolute;top:3px;left:(\d+)px/) || [])[1];
const on = lk('locked', false), off = lk('unlocked', false);
assert.ok(/aria-checked="true"/.test(on) && />Verriegelt</.test(on), 'verriegelt: Schalter an, Wort „Verriegelt“');
assert.equal(knobLeft(on), '21', 'verriegelt: Knopf rechts');
assert.ok(/aria-checked="false"/.test(off) && />Entriegelt</.test(off), 'entriegelt: Schalter aus, Wort „Entriegelt“');
assert.equal(knobLeft(off), '3', 'entriegelt: Knopf links');
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const c = tpl.casora_popup_lock.tap_action.casora_popup.content;
assert.ok(c.includes(": (tot - lk) + ' entriegelt';"), 'Kopf gemischt: „N entriegelt“');
assert.ok(!c.includes(": lk + ' verriegelt';"), 'nicht mehr „N verriegelt“');
console.log('ok schloss_schalter');
