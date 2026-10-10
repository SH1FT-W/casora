// „Alles aus“ im Haus-Licht-Popup (Startseite › Beleuchtung, 07.10.2026; seit 1.3 Hauptschalter im Kopf):
// wie im Raum-Popup, aber mit Rückfrage „Alle N Lichter im Haus ausschalten?“ (N = gerade eingeschaltete,
// sichtbare Lichter; Einzahl „1 Licht …“). Nur Lichter, die der Benutzer sieht – auch nicht aus
// vorübergehend ausgeblendeten Räumen. Abbrechen schaltet nichts.
//   node dev/unit/licht_alles_aus_haus.mjs
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
['light.k1', 'light.k2', 'light.w1', 'light.w2', 'light.gast'].forEach((id) => L(id, true));
L('light.w3', false);
states['switch.tv'] = { entity_id: 'switch.tv', state: 'on', attributes: {} };
const cfg = { gid: 'light.alle', init: -1, rooms: [
  { name: 'Küche', rid: 'light.kueche', lights: ['light.k1', 'light.k2'] },
  { name: 'Wohnen', rid: 'light.wohnen', lights: ['light.w1', 'light.w2', 'light.w3', 'switch.tv'] },
  { name: 'Gast', rid: 'light.gastraum', lights: ['light.gast'] },
] };

// Sichtbarkeit: Gastraum ausgeblendet (nur mit rooms: true), light.w2 per „Wer sieht das?“ weg.
const asked = [];
window.casoraVisibleIdsNow = (ids, o) => { asked.push(o); return ids.filter((x) => x !== 'light.w2' && !(o && o.rooms && x === 'light.gast')); };
window.casoraVisibleIds = (ids, o) => Promise.resolve(window.casoraVisibleIdsNow(ids, o));
let answer = false;
const dialogs = [];
window.casoraAsk = (w) => { dialogs.push(w); return Promise.resolve(answer); };

// 1.3 Kopfzeile A: Hauptschalter im Kopf statt „Alles aus“-Knopf (S.head → S.headFor).
S.render(cfg, 'hero', states, hass, null);
let hs = S.headFor(cfg, hass);
assert.ok(hs && hs.disabled, 'Haus: nur ausschalten (ausgegraut, wenn alles aus)');
assert.deepEqual(hs.entities, ['light.k1', 'light.k2', 'light.w1', 'light.w3'], 'sichtbare Lichter aller Räume, kein Schalter');
assert.ok(asked.some((o) => o && o.rooms), 'ausgeblendete Räume zählen mit');

const tap = async () => { hs.toggle(true); await new Promise((r) => setTimeout(r, 10)); };
// Abbrechen: Rückfrage mit Anzahl, nichts geschaltet.
await tap();
assert.equal(dialogs.length, 1, 'Rückfrage erscheint');
assert.equal(dialogs[0].title, 'Alle 3 Lichter im Haus ausschalten?', dialogs[0].title);
assert.equal(dialogs[0].yes, 'Ausschalten');
assert.equal(calls.length, 0, 'Abbrechen schaltet nichts');

// Ausschalten: nur sichtbare, eingeschaltete Lichter.
answer = true;
await tap();
assert.deepEqual(calls, [['light', 'turn_off', ['light.k1', 'light.k2', 'light.w1']]], JSON.stringify(calls));

// Einzahl.
calls.length = 0; dialogs.length = 0;
L('light.k1', false); L('light.k2', false);
await tap();
assert.equal(dialogs[0].title, '1 Licht im Haus ausschalten?', dialogs[0].title);
assert.deepEqual(calls, [['light', 'turn_off', ['light.w1']]]);

// Nur noch Lichter an, die der Benutzer nicht sieht: Tippen fragt nicht, schaltet nicht.
L('light.w1', false);
calls.length = 0; dialogs.length = 0;
await tap();
assert.equal(dialogs.length + calls.length, 0, 'nichts Sichtbares an: keine Rückfrage, kein Schalten');
// Einschalten gibt es im Haus nicht.
hs.toggle(false);
assert.equal(calls.length, 0);

// Raum-Popup bleibt ohne Rückfrage.
L('light.k1', true);
window._casoraLF = { 'light.alle': 0 };
hs = S.headFor(cfg, hass);
assert.ok(!hs.disabled, 'Raum: ohne Haus-Sperre');
await tap();
assert.equal(dialogs.length, 0, 'Raum: keine Rückfrage');
assert.deepEqual(calls, [['light', 'turn_off', ['light.k1']]]);

// Englisch und Kern-Teile.
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.equal(en.exact['1 Licht im Haus ausschalten?'], 'Turn off 1 light in the home?');
const p = en.patterns.find((x) => new RegExp(x[0]).test('Alle 6 Lichter im Haus ausschalten?'));
assert.ok(p && p[1] === 'Turn off all {1} lights in the home?', 'Mehrzahl englisch');
assert.equal(en.exact['Ausschalten'], 'Turn off');

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const hm = core.match(/  function hiddenForUser\(cfg, entityId, uid, rooms\) \{[\s\S]*?\n  \}\n/);
assert.ok(hm, 'hiddenForUser mit rooms fehlt');
const hiddenForUser = new Function(hm[0] + ' return hiddenForUser;')();
const tile = { type: 'custom:button-card', entity: 'light.gast' };
const hidView = { views: [{ path: 'home', cards: [] }, { path: 'gast', visible: false, cards: [tile] }] };
assert.equal(hiddenForUser(hidView, 'light.gast', 'A'), false, 'ohne rooms wie bisher');
assert.equal(hiddenForUser(hidView, 'light.gast', 'A', true), true, 'ausgeblendeter Raum (Desktop)');
const hidRow = { views: [{ path: 'm', cards: [{ type: 'custom:casora-smart-row', visibility: [{ condition: 'user', users: [] }], cards: [tile] }] }] };
assert.equal(hiddenForUser(hidRow, 'light.gast', 'A', true), true, 'ausgeblendeter Raum (Handy)');
assert.ok(core.includes('window.casoraAsk = function (w)'), 'casoraAsk fehlt');
console.log('ok licht_alles_aus_haus');
