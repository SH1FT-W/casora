// Detail round #9: a person HA does not know (unknown) is not „unterwegs“ – the badge and the people popup count it
// as „unbekannt“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const expr = T.casora_badge_presence_group.name.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
globalThis.window = {};
const sub = (st) => {
  const hass = { states: {} };
  const variables = {};
  st.forEach((s, i) => { hass.states['person.p' + i] = { state: s, attributes: { friendly_name: 'P' + i } }; variables['entity_' + (i + 1)] = 'person.p' + i; });
  return /badge-sub">([^<]*)</.exec(new Function('hass', 'variables', expr)(hass, variables))[1];
};
assert.equal(sub(['home', 'home', 'unknown']), '1 unbekannt');
assert.equal(sub(['home', 'not_home', 'unknown']), '1 unterwegs');
assert.equal(sub(['not_home', 'not_home']), 'Alle unterwegs');
assert.equal(sub(['home', 'home']), 'Alle zuhause');
assert.equal(sub(['unknown']), 'Unbekannt');
const hub = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/35-phone-hub.js', import.meta.url), 'utf8');
assert.ok(hub.includes("String(rows.length - home - unk)") && hub.includes("label: 'unbekannt'"), 'popup counts unknown apart');
console.log('presence_unknown: ok');
