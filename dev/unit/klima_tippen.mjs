// Tipp-Feedback bei Klima/Fußbodenheizung wie bei Licht.
//   node dev/unit/klima_tippen.mjs
// Gemeldet 07.10.2026 (1.1.0): Die Thermostat-Kachel (auch mit Fußbodenheizungs-Popup) gab beim
// Antippen kein haptic, Plus/Minus der Zieltemperatur änderten sich beim Drücken nicht. Prüft ohne
// Browser: zusammengeführte Vorlagen haben haptic, beide Plus/Minus-Knöpfe haben eine :active-Regel.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const all = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const merge = (a, b) => { const out = { ...a }; for (const k of Object.keys(b)) out[k] = isObj(a[k]) && isObj(b[k]) ? merge(a[k], b[k]) : b[k]; return out; };
const resolve = (names) => [].concat(names).reduce((acc, n) => {
  const t = all[n]; if (!t) return acc;
  const own = { ...t }; delete own.template;
  return merge(merge(acc, resolve(t.template || [])), own);
}, {});

for (const tpl of [['casora_thermostat'], ['casora_thermostat', 'casora_popup_fbh']]) {
  const ta = resolve(tpl).tap_action || {};
  assert.ok(ta.action && ta.haptic, tpl.join('+') + ': Antippen ohne haptic');
}

const thermo = JSON.stringify(all.casora_thermostat);
assert.match(thermo, /\.hp-st-b:not\(\.dis\):active\{transform:scale/, 'Thermostat-Popup: Plus/Minus ohne Druck-Rückmeldung');
const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
assert.match(pop, /\.fb-st-b:not\(\.dis\):active\{transform:scale/, 'Fußbodenheizungs-Popup: Plus/Minus ohne Druck-Rückmeldung');
console.log('ok klima_tippen');
