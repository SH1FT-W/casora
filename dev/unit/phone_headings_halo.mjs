// Section headings on the phone sit on the room photo; dark text over a dark spot was unreadable outside
// (Prüfung 2 fam-16). Headings (casora_mobile_header, room group headings) carry the theme's halo
// --casora-mobile-title-halo, defined light and dark in Casora (and so in Nebel and Glas).
//   node dev/unit/phone_headings_halo.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
assert.ok(T.casora_mobile_header.styles.name.some((x) => x['text-shadow'] === 'var(--casora-mobile-title-halo, none)'), 'casora_mobile_header');
assert.match(read('custom_components/casora/scripts/filter-overlay.js'), /text-shadow:var\(--casora-mobile-title-halo, none\)/, 'room group headings');
for (const f of ['theme_weich.yaml', 'theme_nebel.yaml']) {
  const n = (read('custom_components/casora/' + f).match(/^\s+casora-mobile-title-halo: /gm) || []).length;
  assert.equal(n, 2, f + ': light and dark');
}
console.log('phone_headings_halo: ok');
