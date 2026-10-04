// Kamera-/Türklingel-Kachel: Name auf dem abgedunkelten Standbild lesbar.
//   node dev/unit/kamera_name_hell.mjs
// Gemeldet (Umzugstest, Design „Casora Weich“ hell): Name dunkel auf fast schwarzem Standbild.
// Gelöst über --casora-entity-name in casora_camera (Weich: mit Bild hell, ohne Bild/offline Theme-Farbe).
// Eine zusätzliche feste Namensfarbe darf es nicht geben – sie überschrieb den Offline-Fall (Name weiß auf hellem Grund).
import fs from 'node:fs';
import assert from 'node:assert/strict';

for (const f of ['../../dashboards/casora/button_card_templates.json', '../../custom_components/casora/panel/casora-templates.json']) {
  const raw = JSON.parse(fs.readFileSync(new URL(f, import.meta.url), 'utf8'));
  const T = raw.templates || raw;
  const cam = T.casora_camera;
  assert.ok(!(cam.styles.name || []).some((d) => d && d.color), f + ': keine feste Namensfarbe');
  assert.ok(JSON.stringify(cam.styles.card || []).includes('--casora-entity-name'), f + ': Namensfarbe über --casora-entity-name');
  assert.deepEqual(T.casora_doorbell.template, ['casora_camera'], f + ': Türklingel erbt die Kamera');
}
console.log('ok kamera_name_hell');
