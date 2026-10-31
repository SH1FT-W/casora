// Setup hints point into the Studio, which only admins can open (Prüfung 2 fam-08): for everyone else UI.empty
// shows a neutral "Noch nicht verfügbar" without the Studio sentence, UI.note drops Studio hints, and the energy
// tile without a sensor says "Nicht verfügbar" instead of "Kein Sensor".
//   node dev/unit/studio_hints_admin_only.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const pick = (start, end) => { const a = core.indexOf(start); const b = core.indexOf(end, a); assert.ok(a > 0 && b > a, start); return core.slice(a, b); };
const src = pick('  var studioHint = function', '  function note(text)') + pick('  function note(text)', '\n  }\n') + '\n  }\n'
  + pick('  function empty(o) {', '\n  }\n') + '\n  }\n';
let admin = true;
globalThis.window = { casoraIsAdmin: () => admin };
const api = new Function('soft', 'group', 'esc', 'T', 'S', src + '\nreturn { note: note, empty: empty };')(
  () => true, (rows) => rows[0], (x) => x, { font: 'x' }, { sub: 'y' });

const o = { icon: 'mdi:solar-power-variant', text: 'Solar-Tipp zuordnen', sub: 'Im Casora Studio der Kachel den Solar-Tipp wählen', studio: true };
let r = api.empty(o);
assert.ok(r.studio && r.tappable && r.label === 'Solar-Tipp zuordnen' && /Studio/.test(r.sub), 'admin: setup step into the Studio');
assert.ok(/Studio/.test(api.note('Wähle im Studio eine Gruppe.')), 'admin: note stays');
admin = false;
r = api.empty(o);
assert.ok(!r.studio && !r.tappable && r.label === 'Noch nicht verfügbar' && !r.sub, 'non-admin: neutral line ' + JSON.stringify(r));
r = api.empty({ text: 'Hier gibt es noch keine Geräte', sub: 'Im Studio Kacheln zu Räumen hinzufügen', studio: true });
assert.ok(r.label === 'Hier gibt es noch keine Geräte' && !r.sub, 'non-admin: a plain fact stays, the Studio sentence goes');
assert.equal(api.note('Wähle im Studio eine Gruppe.'), '', 'non-admin: no Studio note');
assert.ok(api.note('Zuletzt aktualisiert vor 5 Min.').length > 0, 'other notes stay');

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
assert.match(T.casora_energy.state_display, /casoraIsAdmin\(\) \? 'Nicht verfügbar' : 'Kein Sensor'/, 'energy tile: no setup word for family');
console.log('studio_hints_admin_only: ok');
