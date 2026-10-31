// Waste tile on a narrow phone tile: the short form names the bin ("Bio in 2 T.") instead of
// "2 Tage +1", where the +1 was the hidden bin (Prüfung 2 E23).
//   node dev/unit/trash_short_form.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const code = T.casora_trash.state_display.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const calls = [];
globalThis.window = {
  _casoraTrashFetch: () => {},
  casoraStateFit: (t, w, alt) => { calls.push([t, alt]); return t; },
  casoraDevice: { waste: () => ({ days: 2, next: { label: 'Bio' }, bins: [{}], duty: true }) },
};
new Function('hass', 'variables', 'entity', code)({}, {}, null);
assert.deepEqual(calls.pop(), ['2 Tage · Bio', 'Bio in 2 T.']);
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
const p = en.patterns.find((x) => x[0] === '^(.+) in (\\d+) T\\.$');
assert.ok(p && 'Bio in 2 T.'.replace(new RegExp(p[0]), p[1].replace(/\{(\d)\}/g, '$$$1')) === 'Bio in 2 d', 'English pattern');
console.log('trash_short_form: ok');
