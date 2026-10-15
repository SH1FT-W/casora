// Checkup 10/2026 (Prod): Die Abfallkarte (auch 3D-Drucker, Aquarium-Licht, Schalter) änderte aktiv beim
// Hovern ihre Fläche. Die Hover-Regel von casora_entity setzt --casora-entity-overlay-tint auf den hellen
// Hover-Ton; aktive Kacheln müssen ihren Aktiv-Ton selbst setzen, sonst gilt bei Deckkraft 1 der Hover-Ton.
// Erwartet: jeder Aktiv-Zustand mit Deckkraft 1 setzt auch den Ton.
//   node dev/unit/checkup_aktiv_hover.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const bad = [];
for (const [name, t] of Object.entries(tpl)) {
  (t.state || []).forEach((st, i) => {
    const card = (st.styles && st.styles.card) || [];
    const keys = card.flatMap((o) => Object.keys(o));
    const op = card.find((o) => o['--casora-active-overlay-opacity']);
    if (op && String(op['--casora-active-overlay-opacity']).trim() === '1' && !keys.includes('--casora-entity-overlay-tint')) bad.push(name + ' state[' + i + ']');
  });
}
assert.deepEqual(bad, [], 'Aktiv ohne Ton (Hover-Ton schlägt durch): ' + bad.join(', '));
console.log('ok aktiv_hover');
