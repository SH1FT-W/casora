// per-10 (1.3): lange Szenennamen am Handy in der Mitte kürzen („WZ Dream…Aus“), damit An/Aus lesbar bleibt.
//   node dev/unit/name_mitte.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = core.indexOf('// casora-midfit:start'), j = core.indexOf('// casora-midfit:end');
assert.ok(i > -1 && j > i, 'Block casora-midfit fehlt');
const window = {};
new Function('window', core.slice(i, j))(window);
const M = window.casoraMidText;
assert.equal(M('WZ Dreamview Aus', 8), 'WZ Dream…Aus');
assert.equal(M('WZ Dreamview An', 8), 'WZ Dream…An');
// Leerzeichen am Schnitt fällt weg
assert.equal(M('WZ Dreamview Aus', 3), 'WZ…Aus');
// Ein Wort: die letzten 4 Zeichen bleiben
assert.equal(M('Hauswirtschaftsraumlicht', 6), 'Hauswi…icht');
// Sehr langes letztes Wort: ebenfalls die letzten 4 Zeichen
assert.equal(M('Licht Wohnzimmerdeckenfluter', 5), 'Licht…uter');
// Mindestens ein Zeichen vorn
assert.equal(M('A Aus', 0), 'A…Aus');
// Fit: misst über scrollWidth/clientWidth und kürzt, bis es passt
const el = { attrs: { 'data-casora-mid': 'WZ Dreamview Aus' }, textContent: 'WZ Dreamview Aus', clientWidth: 100, clientHeight: 20,
  getAttribute(k) { return this.attrs[k]; }, get scrollWidth() { return this.textContent.length * 10; }, get scrollHeight() { return 20; } };
window.casoraMidFit({ querySelectorAll: () => [el] });
assert.ok(el.textContent.length * 10 <= 100, 'passt danach: ' + el.textContent);
assert.ok(/…Aus$/.test(el.textContent), 'Ende bleibt: ' + el.textContent);
// Passt schon: unverändert
const ok = { ...el, attrs: { 'data-casora-mid': 'Ambiente' }, textContent: 'Ambiente', getAttribute: el.getAttribute };
Object.defineProperty(ok, 'scrollWidth', { get() { return 80; } });
window.casoraMidFit({ querySelectorAll: () => [ok] });
assert.equal(ok.textContent, 'Ambiente');
console.log('ok name_mitte');
