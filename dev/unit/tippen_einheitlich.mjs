// Einheitliches Tipp-Feedback: jede Vorlage, die beim Antippen etwas tut, gibt eine kurze Vibration.
//   node dev/unit/tippen_einheitlich.mjs
// Anlass 07.10.2026 (1.1.0): Die Thermostat-Kachel (auch mit Fußbodenheizungs-Popup) gab beim Antippen
// als einzige Klima-Kachel kein haptic; bei der Durchsicht fehlten es acht weiteren Vorlagen. Neue
// Vorlagen ohne haptic fallen hier sofort auf.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const ohne = [];
let mit = 0;
for (const [name, t] of Object.entries(src)) {
  if (!t || typeof t !== 'object') continue;
  for (const key of ['tap_action', 'hold_action', 'double_tap_action']) {
    const a = t[key];
    if (!a || typeof a !== 'object' || a.action === 'none' || a.action === undefined) continue;
    if (key === 'tap_action') { if (a.haptic) mit++; else ohne.push(name); }
  }
}
assert.ok(mit > 40, `zu wenige Vorlagen mit tap_action gefunden (${mit}) – Datei geändert?`);
assert.deepEqual(ohne, [], `Vorlagen ohne Vibration beim Antippen (tap_action.haptic fehlt): ${ohne.join(', ')}`);
console.log(`ok – ${mit} Vorlagen geben beim Antippen eine Vibration`);
