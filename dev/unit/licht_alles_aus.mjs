// „Alles aus“ im Licht-Popup eines Raums (07.10.2026, Casora-Look) – seit 1.3 der Hauptschalter im Kopf:
// schaltet alle Lichter dieses Raums aus (bzw. an) – nur Licht, nur was der Benutzer sieht („Wer sieht das?“),
// ohne Rückfrage. Mit nur einer Leuchte schaltet er diese Leuchte.
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
const cfg = { gid: 'light.testraum_decke', flat: { name: 'Wohnzimmer', rid: 'light.testraum_decke', lights: ['light.decke', 'light.stehlampe', 'light.spots', 'light.geheim', 'switch.tv'] } };

// 1.3 Kopfzeile A: „Alles aus“ ist jetzt der Hauptschalter oben rechts im Popup-Kopf (casora-core.js,
// Haken window._casoraHeadSwitchHooks → S.head). Der Inhalt zeigt keinen eigenen Knopf mehr.
let html = S.render(cfg, 'hero', states, hass, null);
assert.ok(!/lps-off|Alles aus/.test(html.replace(/<style>[\s\S]*?<\/style>/, '')), 'kein eigener „Alles aus“-Knopf mehr');
assert.ok(/class="lps-s hui-line"/.test(html), 'Statuszeile als .hui-line (der Kopf spiegelt sie)');
assert.ok((window._casoraHeadSwitchHooks || []).indexOf(S.head) > -1, 'Haken für den Hauptschalter angemeldet');

window.casoraAsksFirst = () => true;
window.casoraVisibleIdsNow = (ids) => ids.filter((x) => x !== 'light.geheim');
const tileSrc = { _config: { template: ['casora_light'] } };
let hs = S.head(tileSrc, hass);
assert.deepEqual(hs.entities, ['light.decke', 'light.stehlampe', 'light.spots'], 'nur sichtbare Lichter, kein Schalter');
assert.ok(!hs.disabled, 'Raum: auch einschaltbar');
// An → aus: nur eingeschaltete, sichtbare Lichter, ohne Rückfrage.
hs.toggle(true);
assert.deepEqual(calls, [['light', 'turn_off', ['light.decke', 'light.stehlampe']]], JSON.stringify(calls));
// Aus → an: Raumgruppe einschalten.
calls.length = 0;
states['light.testraum_decke'] = { entity_id: 'light.testraum_decke', state: 'off', attributes: {} };
hs.toggle(false);
assert.deepEqual(calls, [['light', 'turn_on', 'light.testraum_decke']], JSON.stringify(calls));
// Fremde Popups bleiben unberührt.
assert.equal(S.head({ _config: { template: ['casora_switch'] } }, hass), null);

// Eine Leuchte: Schalter für diese Leuchte.
S.render({ gid: 'light.x', flat: { name: 'Flur', rid: 'light.decke', lights: ['light.decke'] } }, 'hero', states, hass, null);
hs = S.head(tileSrc, hass);
assert.deepEqual(hs.entities, ['light.decke']);
calls.length = 0;
hs.toggle(false);
assert.deepEqual(calls, [['light', 'turn_on', ['light.decke']]]);
// Raum einer einzelnen Leuchte (Review 1.1.1): kleinste Lichtgruppe in einem Bereich, nie die
// Gruppe „alle Lichter“ über mehrere Bereiche – sonst schaltete „Alles aus“ das ganze Haus.
{
  const st = {};
  const G = (id, members) => { st[id] = { entity_id: id, state: 'on', attributes: { entity_id: members } }; };
  ['light.a1', 'light.a2', 'light.b1', 'light.c1'].forEach((id) => { st[id] = { entity_id: id, state: 'on', attributes: {} }; });
  G('light.alle', ['light.a1', 'light.a2', 'light.b1', 'light.c1']);
  const h = { entities: { 'light.a1': { area_id: 'raum_a' }, 'light.a2': { area_id: 'raum_a' }, 'light.b1': { area_id: 'raum_b' },
    'light.c1': { device_id: 'dev_c' } }, devices: { dev_c: { area_id: 'raum_c' } } };
  assert.equal(S.roomOf('light.a1', st, h), null, 'Haus-Gruppe über mehrere Bereiche ist kein Raum');
  G('light.raum_a', ['light.a1', 'light.a2']);
  assert.deepEqual(S.roomOf('light.a1', st, h), ['light.a1', 'light.a2'], 'Raumgruppe wird gefunden');
  assert.equal(S.roomOf('light.c1', st, h), null, 'Bereich über das Gerät zählt mit');
  assert.equal(S.roomOf('light.raum_a', st, h), null, 'eine Gruppe selbst hat keinen Raum');
  // Ohne Bereiche (nichts zugeordnet): wie bisher die kleinste Gruppe.
  assert.deepEqual(S.roomOf('light.b1', st, {}), ['light.a1', 'light.a2', 'light.b1', 'light.c1']);
}
console.log('ok licht_alles_aus');
