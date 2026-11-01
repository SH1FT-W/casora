// Camera popup (owner, 01.11.2026): one word for a camera without a picture. „Offline“ / „Kamera offline“
// everywhere (wortliste.md: Offline for cameras, as casoraStateWord), never „Nicht verfügbar“ or „nicht erreichbar“
// next to it (camera popup, AI description box, doorbell popup, printer camera).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const tpl = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const strings = (src) => (src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || []);
const BAD = /nicht erreichbar|nicht verfügbar/i;

// casoraStateWord: an unavailable camera is „Offline“.
assert.ok(/if \(cur\.state === 'unavailable'\) txt = \/\^\(camera\|lock\)\\\.\/\.test\(cur\.entity_id\) \? tr\('Offline'\)/.test(core), 'state word Offline');

// Camera popup template: its words for a camera without a picture.
const pop = JSON.stringify(tpl.casora_popup_camera);
assert.ok(pop.includes("'Kamera offline'") && pop.includes("dead ? 'Offline'"), 'popup says Offline');
assert.ok(!/Kamera nicht (?:erreichbar|verfügbar)/i.test(pop), 'popup: no second word');

// The AI box in the camera popup, the doorbell popup and the printer camera.
const ai = rd('custom_components/casora/scripts/local/03-popups.js');
const b0 = ai.indexOf('var boxHtml = function (it)'), box = ai.slice(b0, ai.indexOf('var sweep = function ()', b0));
assert.ok(box.length > 100, 'AI box found');
assert.deepEqual(strings(box).filter((s) => BAD.test(s)), [], 'AI box: Offline only');
for (const f of ['24-klingel.js', '02-devices.js']) {
  const src = rd('custom_components/casora/scripts/local/' + f);
  assert.deepEqual(strings(src).filter((s) => /Kamera nicht (?:erreichbar|verfügbar)/i.test(s)), [], f + ': Kamera offline');
}
assert.ok(rd('custom_components/casora/scripts/local/24-klingel.js').includes("tr('Kamera offline')"), 'doorbell: Kamera offline');
console.log('camera_offline_word: ok');
