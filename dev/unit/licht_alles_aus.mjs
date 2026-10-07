// „Alles aus“ im Licht-Popup eines Raums (07.10.2026, Casora-Look): ein Knopf unter „x von y An“
// schaltet alle Lichter dieses Raums aus – nur Licht, nur was der Benutzer sieht („Wer sieht das?“),
// ohne Rückfrage. Ist alles aus, bleibt er ausgegraut stehen; mit nur einer Leuchte gibt es ihn nicht.
//   node dev/unit/licht_alles_aus.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraLightSoft) return;'));
const b = src.indexOf('\n})();', a) + 6;
const listeners = {};
const calls = [];
const states = {};
const hass = { states, callService: (d, s, data, target) => calls.push([d, s, target.entity_id]) };
globalThis.window = { addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
globalThis.document = { querySelector: () => ({ hass }), documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
new Function('window', 'document', src.slice(a, b))(window, document);
const S = window._casoraLightSoft;
assert.ok(S && S.render, 'Baustein fehlt');

const L = (id, on) => { states[id] = { entity_id: id, state: on ? 'on' : 'off', attributes: { friendly_name: id, brightness: on ? 128 : null, supported_color_modes: ['brightness'] } }; };
L('light.decke', true); L('light.stehlampe', true); L('light.spots', false); L('light.geheim', true);
states['switch.tv'] = { entity_id: 'switch.tv', state: 'on', attributes: {} };
const cfg = { gid: 'light.wohnzimmer', flat: { name: 'Wohnzimmer', rid: 'light.wohnzimmer', lights: ['light.decke', 'light.stehlampe', 'light.spots', 'light.geheim', 'switch.tv'] } };

const unq = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
let html = S.render(cfg, 'hero', states, hass, null);
const m = html.match(/<div class="lps-off( dis)?"[^>]*data-lps-tap="([^"]+)"[^>]*>/);
assert.ok(m, 'Knopf „Alles aus“ fehlt');
assert.ok(!m[1], 'nicht ausgegraut, solange ein Licht an ist');
assert.ok(/Alles aus<\/div>/.test(html), 'Beschriftung');
const spec = JSON.parse(unq(m[2]));
assert.equal(spec.a, 'alloff');
assert.deepEqual(spec.ids, ['light.decke', 'light.stehlampe', 'light.spots', 'light.geheim'], 'nur Lichter, kein Schalter');

// Tippen: nur sichtbare und eingeschaltete Lichter, ohne Rückfrage.
window.casoraAsksFirst = () => true;
window.casoraVisibleIds = (ids) => Promise.resolve(ids.filter((x) => x !== 'light.geheim'));
const el = { hasAttribute: (x) => x === 'data-lps-tap', getAttribute: () => unq(m[2]), classList: { contains: () => false } };
const ev = { composedPath: () => [el], preventDefault() {}, stopPropagation() {} };
listeners.click.forEach((f) => f(ev));
await new Promise((r) => setTimeout(r, 10));
assert.deepEqual(calls, [['light', 'turn_off', ['light.decke', 'light.stehlampe']]], JSON.stringify(calls));

// Alles aus: ausgegraut, Tippen tut nichts.
L('light.decke', false); L('light.stehlampe', false); L('light.geheim', false);
html = S.render(cfg, 'hero', states, hass, null);
assert.ok(/class="lps-off dis"/.test(html), 'ausgegraut, wenn alles aus ist');
calls.length = 0;
const el2 = { ...el, classList: { contains: (c) => c === 'dis' } };
listeners.click.forEach((f) => f({ ...ev, composedPath: () => [el2] }));
await new Promise((r) => setTimeout(r, 10));
assert.equal(calls.length, 0, 'ausgegraut schaltet nicht');

// Eine Leuchte: kein Knopf (der Ring schaltet schon).
html = S.render({ gid: 'light.x', flat: { name: 'Flur', rid: 'light.decke', lights: ['light.decke'] } }, 'hero', states, hass, null);
assert.ok(!/lps-off/.test(html.replace(/<style>[\s\S]*?<\/style>/, '')), 'mit einer Leuchte kein Knopf');
console.log('ok licht_alles_aus');
