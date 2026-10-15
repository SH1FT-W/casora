// Checkup 10/2026: Schloss-Popup zeigte bei unavailable „Entriegelt“ (Kopf und Schalter) und rief beim
// Tippen lock.unlock auf. Erwartet: alle offline → „Offline“, kein Dienst, kein Tipp-Hinweis.
// Dazu „Eigene Karte“: der Dialog nimmt laut Text auch button_card_templates-Einträge an.
//   node dev/unit/checkup_schloss_offline.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8'));
const lock = JSON.stringify((tpl.templates || {}).casora_popup_lock);
assert.ok(lock, 'casora_popup_lock gebaut');
assert.ok(lock.includes("off === tot ? 'Offline'"), 'Kopf: alle offline → Offline');
assert.ok(lock.includes('offAll ||'), 'Tippen: offline → kein Dienst');
assert.ok(lock.includes("? 'unavailable'"), 'Schalter bekommt den Zustand unavailable');

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/08-weich-kompakt.js', import.meta.url), 'utf8');
const a = src.indexOf('  window._casoraSoftLock = function (s, one) {');
const b = src.indexOf('\n  };', a);
const win = { casoraIconUrl: (n) => '/i/' + n + '.svg' };
const esc = (s) => String(s);
new Function('window', 'esc', src.slice(a, b + 4))(win, esc);
const off = win._casoraSoftLock('unavailable', true);
assert.ok(off.includes('>Offline<') && !/Entriegelt|Tippen/.test(off), 'Schalter offline: ' + off.replace(/<[^>]+>/g, ' '));
const un = win._casoraSoftLock('unlocked', true);
assert.ok(un.includes('>Entriegelt<') && un.includes('Tippen zum Verriegeln'), 'entriegelt wie bisher');

const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const c = panel.indexOf('placeholder: "type: custom:my-card');
const v = panel.slice(c, c + 800);
assert.ok(/validate: \(v\) => \{ try \{ parsePasted\(v\);/.test(v), 'Eigene Karte: Prüfung lässt Vorlagen zu');
assert.ok(panel.slice(c, c + 1400).includes('if (read.kind === "template") return this._installTemplate(room, read);'), 'Vorlage wird installiert');
console.log('ok schloss_offline');
