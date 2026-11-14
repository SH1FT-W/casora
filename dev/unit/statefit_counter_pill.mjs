// V12 (owner, 14.11.2026): on the narrow waste tile the short form „In 2 T. · Bio +1“ was one text, so the ellipsis
// cut the counter („Organi…“). A short form ending in " +N" now shows N as its own pill (like the counter of
// casoraStateFit's own short form); only the text before it is cut. Same for today/tomorrow with several bins.
//   node dev/unit/statefit_counter_pill.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraStateFit dashboards/casora/button_card_templates.json#casora_trash
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', root), 'utf8');
const a = core.indexOf('    window.casoraStateFit = function (text, weight, alt) {');
const b = core.indexOf('    // Statuszeile (1.4.1)');
assert.ok(a > 0 && b > a, 'casoraStateFit found');
const window = { casoraTextEm: () => 5, casoraEsc: (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
new Function('window', core.slice(a, b))(window);

const shortOf = (html) => /<span class="sf-s"[^>]*>([\s\S]*)<\/span><\/casora-statefit>$/.exec(html)[1];
const pillRe = /<span style="flex:none;[^"]*border-radius:999px[^"]*" data-no-i18n>\+(\d+)<\/span>/;

// Waste short form: the name in its own (cut) span, the counter as a pill behind it.
const w = shortOf(window.casoraStateFit('2 Tage · Bio + Papier', undefined, 'In 2 T. · Bio +1'));
assert.match(w, /^<span style="min-width:0;overflow:hidden;text-overflow:ellipsis">In 2 T\. · Bio<\/span>/, 'name span without the counter');
assert.equal((pillRe.exec(w) || [])[1], '1', 'counter pill +1');
// Short form without a counter (cover, thermostat): unchanged, no pill.
const c = shortOf(window.casoraStateFit('3 von 5 geöffnet · Ø 40 %', undefined, '3 von 5 geöffnet'));
assert.ok(!pillRe.test(c) && /3 von 5 geöffnet<\/span>$/.test(c), 'no pill without counter');
// casoraStateFit's own short form keeps the same pill.
assert.equal((pillRe.exec(shortOf(window.casoraStateFit('Trocknet · Mopp · Wasser'))) || [])[1], '2', 'own short form: +2');

// Waste tile, today/tomorrow with several bins: the first bin and a counter as the short form.
const T = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
const code = T.casora_trash.state_display.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (days, next) => {
  const calls = [];
  globalThis.window = {
    _casoraTrashFetch: () => {},
    casoraStateFit: (t, wgt, alt) => { calls.push([t, alt]); return t; },
    casoraDevice: { waste: () => ({ days, next, bins: [{}], duty: true }) },
  };
  new Function('hass', 'variables', 'entity', code)({}, {}, null);
  return calls.pop();
};
assert.deepEqual(run(1, { label: 'Bio + Papier', first: 'Bio', count: 2 }), ['Morgen Bio + Papier', 'Morgen Bio +1']);
assert.deepEqual(run(0, { label: 'Bio + Papier + Gelb', first: 'Bio', count: 3 }), ['Heute Bio + Papier + Gelb', 'Heute Bio +2']);
assert.deepEqual(run(0, { label: 'Bio', first: 'Bio', count: 1 }), ['Heute Bio', undefined], 'one bin: no short form');
console.log('statefit_counter_pill: ok');
