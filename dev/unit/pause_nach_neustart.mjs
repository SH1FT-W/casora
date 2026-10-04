// Pausierter Player tauchte nach jedem HA-Neustart zehn Minuten wieder auf (04.10.2026):
// paused → unavailable → paused setzt last_changed neu. Die Integration merkt sich den echten
// Zeitpunkt (sensor.casora_media_paused); _casoraPausedSince nutzt ihn bei gleichem Titel.
//   node dev/unit/pause_nach_neustart.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  // casora-paused-since:start');
const b = core.indexOf('  // casora-paused-since:end');
assert.ok(a > 0 && b > a, 'Helfer gefunden');
const np0 = core.indexOf("  if (typeof window._casoraNPSources !== 'function') {");
const np1 = core.indexOf('\n  }\n', core.indexOf('    };\n', core.indexOf('return out', np0)));
assert.ok(np0 > 0 && np1 > np0, 'Now-Playing-Quellen gefunden');

globalThis.window = globalThis;
globalThis.location = { origin: 'http://ha' };
globalThis.document = { querySelector: () => null };
new Function(core.slice(a, b))();
new Function(core.slice(np0, np1 + 4))();

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const player = (title, min) => ({
  entity_id: 'media_player.speaker', state: 'paused', last_changed: ago(min),
  attributes: { media_title: title, media_artist: 'Bruce Springsteen', supported_features: 16384 | 1 | 32 | 16 },
});
const memo = (since, title) => ({
  'sensor.casora_media_paused': { attributes: { players: { 'media_player.speaker': { since, title } } } },
});
const V = { show_media_player_1: true, media_player_1: 'media_player.speaker', pause_timeout_minutes: 10 };
const shown = (states) => window._casoraNPSources(states, V).length > 0;

// Seit 3 h pausiert, nach Neustart vor 1 Min wieder paused (gleicher Titel): bleibt weg.
const s1 = player("I'm On Fire", 1);
let states = { 'media_player.speaker': s1, ...memo(ago(180), "I'm On Fire") };
assert.equal(window._casoraPausedSince(s1, states), states['sensor.casora_media_paused'].attributes.players['media_player.speaker'].since);
assert.equal(shown(states), false, 'nach Neustart nicht wieder sichtbar');

// Anderer Titel: der gemerkte Zeitpunkt gilt nicht, last_changed zählt.
states = { 'media_player.speaker': s1, ...memo(ago(180), 'Born to Run') };
assert.equal(window._casoraPausedSince(s1, states), s1.last_changed);
assert.equal(shown(states), true, 'anderer Titel: sichtbar wie bisher');

// Ohne Daten (neue Installation): wie bisher.
states = { 'media_player.speaker': s1 };
assert.equal(window._casoraPausedSince(s1, states), s1.last_changed);
assert.equal(shown(states), true, 'ohne Sensor: last_changed');

// Frisch pausiert (Merkwert = jetzt): sichtbar.
states = { 'media_player.speaker': s1, ...memo(ago(1), "I'm On Fire") };
assert.equal(shown(states), true, 'frisch pausiert sichtbar');

// Ohne states: über home-assistant (wie in Vorlagen ohne Übergabe).
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass: { states: memo(ago(180), "I'm On Fire") } } : null) };
assert.notEqual(window._casoraPausedSince(s1), s1.last_changed, 'liest hass aus home-assistant');

// Vorlagen, Bundle und Studio-Vorschau rechnen nicht mehr mit nacktem last_changed.
for (const p of ['dashboards/casora/button_card_templates.json', 'custom_components/casora/panel/casora-templates.json']) {
  const src = read(p);
  assert.ok(!/new Date\(s2?\.last_changed\)/.test(src), p + ': kein new Date(s.last_changed) mehr');
  assert.ok(!src.includes('ms(s.last_changed) + (pauseTimeout'), p + ': Now Playing nutzt Pausenbeginn');
  assert.ok(src.split('_casoraPausedSince').length > 20, p + ': Helfer genutzt');
}
assert.ok(read('custom_components/casora/panel/casora-panel.js').includes('new Date(pausedSince(e))'), 'Studio-Vorschau');

console.log('pause_nach_neustart: ok');
