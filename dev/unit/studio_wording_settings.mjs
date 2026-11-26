// Wortliste in the Studio settings (Prüfrunde 26.11.2026, d04-07/09/10/12/15).   node dev/unit/studio_wording_settings.mjs
// - the start page is „Zuhause“, not „Startseite“ or „Home“ (d04-07),
// - „None selected:“ is always „Keine gewählt: …“ (d04-09),
// - a hint next to an entity picker that shows „Automatisch: …“ starts with „Automatisch:“, not „Leer:“ (d04-10),
// - one spelling „Wandtablet“ (d04-12),
// - the live activity probe names the field that is missing instead of „a recipient“ (d04-15).
// @deckt: casora-panel-settings.js#_csWeather, casora-panel-live.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('translations/panel/de.json'));
const vals = Object.entries(de.exact).filter(([k]) => k !== 'Use as Start Page');

// d04-07: „Startseite“ only where HA's default dashboard is meant.
assert.deepEqual(vals.filter(([, v]) => /Startseite|auf Home\b/.test(v)).map(([k]) => k), [], '„Startseite“/„Home“ for Zuhause');
// d04-09
assert.deepEqual(vals.filter(([, v]) => /(Keiner|Nichts|Keine) gewählt\s*=|Keiner gewählt|Nichts gewählt/.test(v)).map(([k]) => k), [],
  '„Keine gewählt:“ with a colon');
// d04-12
assert.deepEqual(JSON.stringify(de).match(/Wand-Tablet/g), null, 'one spelling „Wandtablet“');
// d04-10: the two hints under an entPick that shows „Automatic: …“ when empty.
const settings = read('panel/casora-panel-settings.js');
for (const k of ['Automatic: Casora finds outdoor sensors by their name.', 'Automatic: the default AI from Settings → AI tasks.']) {
  assert.ok(settings.includes(`t("${k}")`), 'settings uses ' + k);
  assert.match(de.exact[k] || '', /^Automatisch: /, k);
}
assert.ok(!/t\("Empty: (Casora finds outdoor|the default AI)/.test(settings), 'no „Empty:“ under an automatic picker');
// d04-15
const live = read('panel/casora-panel-live.js');
assert.ok(!live.includes('Choose a recipient first.'), 'probe names the missing phone, not „a recipient“');
const probe = 'Choose a phone under “Show live activities on” above and save.';
assert.equal((live.match(/Choose a phone under “Show live activities on” above and save\./g) || []).length, 2);
assert.ok(live.includes('t("Show live activities on")'), 'the named field exists');
assert.match(de.exact[probe], /„Live-Aktivitäten zeigen auf“/);
console.log('studio_wording_settings: ok');
