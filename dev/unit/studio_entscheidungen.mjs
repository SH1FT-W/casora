// Studio: freigegebene Entscheidungen aus den Nutzertests (Runde 06.10.2026), ohne Browser.
//   node dev/unit/studio_entscheidungen.mjs
// 1) „Speichern“ neben „Fertig“ (Studio bleibt offen), Meldungen mit „Jetzt speichern“ statt Verweis auf „Fertig“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('translations/panel/de.json')).exact;
const need = (keys) => keys.forEach((k) => assert.ok(de[k], 'de.json: ' + k));

// 1) Speichern ohne Verlassen
{
  const main = read('panel/casora-panel.js');
  const plus = read('panel/casora-panel-b-plus.js');
  const mehr = read('panel/casora-panel-b-mehr.js');
  assert.ok(/<button id="savenow"[^>]*hidden>/.test(main), 'Knopf „Speichern“ steht neben „Fertig“, anfangs versteckt');
  assert.ok(main.indexOf('id="savenow"') < main.indexOf('id="donebtn"'), '… vor „Fertig“');
  assert.ok(/now\.hidden = !dirty \|\| !!this\._saveBlocked;/.test(main), 'sichtbar nur mit ungespeicherten Änderungen');
  assert.ok(/async _saveNow\(\) \{[\s\S]{0,200}await this\._save\(\);/.test(main), 'speichert über _save (wie ⌘S), ohne _openDash');
  assert.ok(!/async _saveNow\(\) \{[^}]*_openDash/.test(main), 'verlässt das Studio nicht');
  assert.ok(/button#savenow span \{ display:none; \}/.test(main), 'Handy: nur Symbol');
  assert.ok(/canSave = !!o\.save/.test(plus) && /tr\("Save now"\)/.test(plus), 'Meldung kann „Jetzt speichern“');
  // Keine Meldung verweist mehr allein auf „Fertig“ (Szenenfarbe, Raum ausblenden, Rückfrage, Wer sieht das?)
  for (const old of ['(“Done”)', 'Done hides it on the dashboard', 'Done removes it for good', 'asks too. Done saves it']) {
    assert.ok(!plus.includes(old) && !mehr.includes(old), 'alter Verweis weg: ' + old);
  }
  assert.ok(/action: undo, save: true, ms: 9000/.test(plus), 'Szene: „Jetzt speichern“ neben „Rückgängig“');
  need(['Save now', 'Save – the Studio stays open', 'Not saved yet – “Save now” or Done saves it.',
    'Scene saved in Home Assistant. The color is saved with the dashboard.', 'Gone for good once you save.']);
  console.log('studio_entscheidungen: 1 Speichern ok');
}

// 2) Ausprobieren: langes Drücken / Rechtsklick / Alt+Klick öffnet das echte Popup
{
  const pop = read('panel/casora-panel-popups.js');
  const b = read('panel/casora-panel-b.js');
  assert.ok(/const TRY_MS = 500;/.test(pop), 'langes Drücken ≈ 0,5 s');
  assert.ok(/await window\.casoraPopup\.open\(cfg\)/.test(pop), 'öffnet das echte Popup (wie im Dashboard, bedienbar)');
  assert.ok(/cfg = await this\._cpConfig\(target\)/.test(pop), 'mit dem ungespeicherten Stand (Rückfrage-Liste aus _cpConfig)');
  assert.ok(/me\.armed && !this\._tileDragged && !this\._bDragged/.test(pop), 'Ziehen hat Vorrang');
  assert.ok(/Math\.abs\(e2\.clientX - sx\) > 8/.test(pop), 'Bewegen bricht das Ausprobieren ab');
  assert.ok(/if \(ev\.altKey\) \{ ev\.stopPropagation\(\); ev\.preventDefault\(\); this\._tryOpen\(el\)/.test(pop), 'Alt+Klick');
  assert.ok(/addEventListener\("contextmenu"[\s\S]{0,260}if \(press\) return;\s*this\._tryOpen\(el\)/.test(pop), 'Rechtsklick, aber nicht doppelt beim Finger');
  assert.ok(/this\._tryWire\(map\)/.test(b), 'in der Vorschau verdrahtet');
  assert.ok(/casora\.studio\.tryHint/.test(pop) && /tr?\("Press and hold to try it"\)|t\("Press and hold to try it"\)/.test(pop), 'einmaliger Hinweis');
  need(['Press and hold to try it', 'The real popup opens – devices really switch.', 'Or right-click. The real popup opens – devices really switch.',
    'This tile has no popup – tap it to edit it.']);
  console.log('studio_entscheidungen: 2 Ausprobieren ok');
}
