// dashfix2 (06.10.2026): Im Jalousie-Popup (Kachel casora_cover) blieb nach „50 %“ weiter „Auf“ markiert –
// die Auswahl wurde beim Öffnen fest berechnet. Wie casora_popup_cover: value + live je Feld.
//   node dev/unit/jalousie_auswahl_live.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const k of ['casora_cover', 'casora_popup_cover']) {
  const c = tpl[k].tap_action.casora_popup.content;
  const m = c.match(/add\('presets', UI\.segments\(\[([\s\S]*?)\], null, \{ live: \{ entities: coverIds, attr: 'current_position' \} \}\)\);/);
  assert.ok(m, k + ': Auswahl ohne live');
  for (const v of [0, 25, 50, 75, 100]) assert.ok(m[1].includes('value: ' + v + ' }'), k + ': Feld ' + v + ' ohne value');
}
console.log('ok jalousie_auswahl_live');
