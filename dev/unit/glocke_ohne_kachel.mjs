// dashfix (06.10.2026): Glocken-Eintrag ohne passende Kachel im Dashboard (z. B. „Pflanze steht zu nass“
// ohne Pflanzen-Kachel) öffnete HAs Dialog mit dem Rohzustand „problem“. Jetzt eine unsichtbare
// Kachel der ersten Vorlage für genau diese Entität – dasselbe Casora-Popup wie auf einer Kachel.
//   node dev/unit/glocke_ohne_kachel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const m = core.match(/  function cardSynth\(names, entityId\) \{[\s\S]*?\n  \}\n/);
assert.ok(m, 'cardSynth fehlt');
const added = [];
const document = {
  createElement: () => ({ style: {}, setConfig(c) { this.cfg = c; } }),
  body: { appendChild: (el) => added.push(el) },
};
const hass = { states: { 'plant.beispiel': { state: 'problem' } } };
const synth = new Function('document', 'hassOf', m[0] + ' return cardSynth;')(document, () => hass);
const el = synth(['casora_plant', 'casora_popup_plant'], 'plant.beispiel');
assert.deepEqual(el.cfg, { type: 'custom:button-card', template: 'casora_plant', entity: 'plant.beispiel' }, 'Kachel-Vorlage, nicht Popup-Baustein');
assert.equal(added.length, 1);
assert.equal(synth(['casora_badge_air_quality'], 'plant.beispiel'), null, 'Badges nie nachbauen');
assert.equal(synth(['casora_plant'], 'plant.fehlt'), null, 'nur vorhandene Entitäten');
assert.equal(synth([], 'plant.beispiel'), null);
// Reihenfolge: echte Kachel → Kachel aus der Konfiguration → nachgebaute Kachel → HA-Dialog.
assert.ok(/cardFromConfig\(names, fallbackEntity\)\.then\(function \(el\) \{[\s\S]{0,400}if \(!el\) el = cardSynth\(names, fallbackEntity\);\s*if \(!el\) return fall\(\);/.test(core));
console.log('ok glocke_ohne_kachel');
