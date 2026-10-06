// dashfix2 (06.10.2026): Medien-Badge zeigte „1 läuft“, obwohl die Wiedergabe pausiert war.
//   node dev/unit/medien_pausiert.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = tpl.casora_badge_media_group.name.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const now = new Date().toISOString();
const run = (st) => {
  const states = Object.fromEntries(Object.entries(st).map(([id, s]) => [id, { state: s, last_changed: now, attributes: { media_title: 'Titel' } }]));
  const html = new Function('hass', 'states', 'variables', 'window', body)({ states }, states, { entity_1: 'media_player.a', entity_2: 'media_player.b' }, {});
  return html.match(/badge-sub">([^<]*)</)[1];
};
assert.equal(run({ 'media_player.a': 'paused', 'media_player.b': 'idle' }), '1 pausiert');
assert.equal(run({ 'media_player.a': 'paused', 'media_player.b': 'paused' }), '2 pausiert');
assert.equal(run({ 'media_player.a': 'playing', 'media_player.b': 'paused' }), '1 läuft');
assert.equal(run({ 'media_player.a': 'playing', 'media_player.b': 'playing' }), '2 laufen');
assert.equal(run({ 'media_player.a': 'off', 'media_player.b': 'idle' }), 'Nichts läuft');
// Englisch: Muster für „N pausiert“ / „N laufen“.
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
const pat = (de) => en.patterns.find(([re]) => new RegExp(re).test(de));
assert.ok(pat('2 pausiert') && pat('2 laufen'), 'en-Muster fehlen');
console.log('ok medien_pausiert');
