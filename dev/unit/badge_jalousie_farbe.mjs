// d-kacheln (Feinschliff 1.3): Das Jalousien-Badge war im Casora-Design offen/teilweise/fährt grell
// Türkis (#00c3d0, Hemma-Farbe), die Jalousien-Kachel daneben Casora-Teal (#4E9E95). Beide nehmen jetzt
// --casora-color-teal (in den Grundwerten theme.yaml = #00C3D0, Casora überschreibt).
//   node dev/unit/badge_jalousie_farbe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const s = JSON.stringify(T.casora_badge_cover);
for (const k of ['open', 'partial', 'moving']) {
  assert.ok(s.includes(`var(--casora-badge-cover-${k}-color, var(--casora-color-teal, #00c3d0))`), k + ': Teal-Token als Standard');
  assert.ok(!s.includes(`var(--casora-badge-cover-${k}-color, #00c3d0)`), k + ': kein festes Hemma-Türkis mehr');
}
// The cover tiles this compared against were the popup's renderer without window._casoraUI; it went with HACS
// review 5 (the popup is built from the shared rows since).
assert.ok(!JSON.stringify(T.casora_cover).includes('var(--casora-badge-cover-open-color, #00c3d0)'), 'no fixed Hemma turquoise in the cover template');
assert.ok(/casora-color-teal:\s*'#00C3D0'/.test(read('custom_components/casora/theme.yaml')), 'Grundwerte (Rückfall unter Casora): Teal = #00C3D0');
console.log('ok badge_jalousie_farbe');
