// The Studio shows a tile's default name in the UI language, as the dashboard does.
//   node dev/unit/studio_default_name_tr.mjs
// A tile without an entity shows the template's fixed German name (casora_reolink_doorbell: „Klingel“). The Studio showed it
// untranslated in a Dutch UI while the dashboard said „Deurbel“. A typed name stays as typed (the form translates it).
// @deckt: casora-panel-types.js#casoraTileName
import fs from 'node:fs';
import assert from 'node:assert/strict';

const noop = () => {};
globalThis.window = { addEventListener: noop };
globalThis.document = { createElement: () => ({}), documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
window.matchMedia = () => ({ matches: false });
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url), 'utf8');
new Function(src.replace(/import\.meta\.url/g, '"http://x/casora-panel-types.js"').replace(/import\(([^)]*)\)/g, 'Promise.resolve()'))();
const { templates } = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8'));
const nl = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/nl.json', import.meta.url), 'utf8'));
const phrases = nl.exact;
assert.equal(phrases['Klingel'], 'Deurbel', 'the dashboard phrase list holds the Dutch name');

// The design shows the fallback name (--casora-tile-fallback-name: 1).
window.casoraRootVar = (n) => (n === '--casora-tile-fallback-name' ? '1' : '');
const tile = { type: 'custom:button-card', template: 'casora_reolink_doorbell', variables: {} };
const hass = { states: {} };

// Dutch UI: the default name is translated.
window.casoraTr = (t) => phrases[t] || t;
assert.equal(window.casoraTileName(tile, null, hass, templates), 'Deurbel');
// A typed name is not the default name: nothing of its own, the form handles it.
assert.equal(window.casoraTileName({ ...tile, name: 'Klingel' }, null, hass, templates), null);
// Unknown words stay as they are.
assert.equal(window.casoraTileName({ type: 'custom:button-card', template: 'casora_recipe' }, null, hass, templates),
  window.casoraTr('Rezept'));
// Without the translation (German UI or not loaded yet) the German name stays.
delete window.casoraTr;
assert.equal(window.casoraTileName(tile, null, hass, templates), 'Klingel');

console.log('ok studio_default_name_tr');
