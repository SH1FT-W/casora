// Waste tile on a narrow phone tile: the short form names the bin instead of "2 Tage +1", where the +1 was the
// hidden bin (Prüfung 2 E23). Issue #137: with three bins on one day and long calendar names the short form was
// „Altpapier -4 wö.- + Restabfall -2 wö.- + … in 5 T.“ and the ellipsis cut the days off. The days come first now
// („In 5 T. · Altpapier -4 wö.- +2“): what is cut is a name, never the days.
//   node dev/unit/trash_short_form.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const code = T.casora_trash.state_display.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (next, days = 2) => {
  const calls = [];
  globalThis.window = {
    _casoraTrashFetch: () => {},
    casoraStateFit: (t, w, alt) => { calls.push([t, alt]); return t; },
    casoraDevice: { waste: () => ({ days, next, bins: [{}], duty: true }) },
  };
  new Function('hass', 'variables', 'entity', code)({}, {}, null);
  return calls.pop();
};
assert.deepEqual(run({ label: 'Bio', first: 'Bio', count: 1 }), ['2 Tage · Bio', 'In 2 T. · Bio']);
const many = run({ label: 'Altpapier -4 wö.- + Restabfall -2 wö.- + Restabfall -4 wö.-', first: 'Altpapier -4 wö.-', count: 3 }, 5);
assert.ok(many[1].startsWith('In 5 T. · '), 'days first: ' + many[1]);
assert.equal(many[1], 'In 5 T. · Altpapier -4 wö.- +2', 'first bin and a counter');
// The finder hands the template the first bin and the count.
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
assert.match(finder, /first: nextBins\[0\]\.label, count: nextBins\.length/, 'W.next.first / W.next.count');
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
const p = en.patterns.find((x) => x[0] === '^In (\\d+) T\\. · (.+)$');
assert.ok(p && 'In 2 T. · Bio'.replace(new RegExp(p[0]), p[1].replace(/\{(\d)\}/g, '$$$1')) === 'In 2 d · Bio', 'English pattern');
console.log('trash_short_form: ok');
