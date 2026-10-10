// Glocke: lange offene Fenster in Tagen, Popup „Türen & Fenster“ mit derselben Zeitbasis.
//   node dev/unit/glocke_offen_tage.mjs
// Personas 10.10.2026 (per-07): „seit 137 Std.“ ohne Umrechnung; Antippen öffnete „Türen & Fenster“
// mit „vor 5 Minuten“ (last_changed nach dem HA-Neustart statt echtem Öffnungszeitpunkt).
// Erwartet: ab 48 Std. „seit N Tagen“ (englisch „for N days“); das Popup zählt bei offenen Kontakten
// den echten Öffnungszeitpunkt (window._casoraOpenSince) wie die Glocke.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const win = (id, name) => ({ entity_id: id, state: 'on', last_changed: ago(5), attributes: { friendly_name: name, device_class: 'window' } });
const states = {
  'binary_sensor.fenster_a': win('binary_sensor.fenster_a', 'Fenster Atelier'),
  'binary_sensor.fenster_b': win('binary_sensor.fenster_b', 'Fenster Dachboden'),
  'sensor.casora_media_paused': { entity_id: 'sensor.casora_media_paused', state: '0', attributes: {
    players: {}, contacts: { 'binary_sensor.fenster_a': { since: ago(47 * 60) }, 'binary_sensor.fenster_b': { since: ago(137 * 60) } } } },
};
const hass = { states, callWS: () => Promise.resolve([]), entities: {}, devices: {}, areas: {} };
const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
window.casoraSecurityIcon = () => 'window-open';
new Function(mod)();

const rows = await window._casoraNotify.refresh();
const by = Object.fromEntries(rows.filter((r) => r.entity).map((r) => [r.entity, r]));
assert.equal(by['binary_sensor.fenster_a'].sub, 'seit 47 Std.', 'unter 48 Std. bleibt es bei Stunden');
assert.equal(by['binary_sensor.fenster_b'].sub, 'seit 5 Tagen', 'ab 48 Std. in Tagen');

// Englisch: erstes passendes Muster (die Reihenfolge zählt – „^seit (.+)$“ fängt sonst alles).
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
const tr = (s) => { for (const [re, out] of en.patterns) { const m = s.match(new RegExp(re)); if (m) return out.replace(/\{(\d+)\}/g, (_, i) => m[i]); } return s; };
assert.equal(tr('seit 5 Tagen'), 'for 5 days');
assert.equal(tr('seit 47 Std.'), 'for 47 h');

// Popup „Türen & Fenster“: Zeitbasis wie die Glocke.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const pc = JSON.stringify(T.casora_popup_contacts);
assert.ok(pc.includes('window._casoraOpenSince(states[id], states)'), 'Popup nutzt den Öffnungszeitpunkt');
assert.ok(pc.includes('(oc ? openIds : allMembers).map(_since)'), 'bei offenen Kontakten zählt das zuletzt Geöffnete');
assert.equal(typeof window._casoraOpenSince, 'function');
assert.equal(window._casoraOpenSince(states['binary_sensor.fenster_b'], states), states['sensor.casora_media_paused'].attributes.contacts['binary_sensor.fenster_b'].since);
console.log('glocke_offen_tage: ok');
