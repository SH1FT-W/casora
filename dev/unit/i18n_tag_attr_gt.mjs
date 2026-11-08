// Issue #142: the HTML splitter of casoraTr ended a tag at the first ">", also inside a quoted attribute. A scene chip
// has „if(dx>8…“ in onpointerup, so its style was read as text and German percent formatting turned „18%“ into
// „18 %“: the background became invalid and the running scene's dark name stood on a transparent tile.
//   node dev/unit/i18n_tag_attr_gt.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const hass = { locale: { language: 'de' } };
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8'))();
const tr = window.casoraTr;

const chip = '<div onpointerup="if(dx>8||dy>8)return;" style="background:color-mix(in srgb, red var(--x, 18%), white);">62%</div>';
const out = tr(chip);
assert.ok(out.includes('var(--x, 18%)'), 'attribute values stay as written: ' + out);
assert.ok(out.includes('62 %</div>'), 'text between the tags is still formatted: ' + out);
assert.ok(tr("<i title='a>b' style='width:50%'>1%</i>").includes("style='width:50%'"), 'single quotes too');
assert.equal(tr('a < b und 5%'), 'a < b und 5 %', 'a stray < is text');
console.log('i18n_tag_attr_gt: ok');
