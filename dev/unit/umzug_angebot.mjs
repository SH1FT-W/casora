// Umzug Hemma → Casora: nach einem erfolgreichen Umzug kein erneutes Angebot.
//   node dev/unit/umzug_angebot.mjs
// Entscheidung 03.10.2026: Nach dem ersten Umzug bot das Studio beim nächsten Öffnen sofort die
// übrigen Hemma-Dashboards an. Jetzt Ruhe, solange ein umgezogenes Casora-Dashboard existiert
// (erreichbar bleibt alles über ⋯ → Einrichtungsassistent).
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8')
  .replace('new URL("./hemma-originals.json", import.meta.url).href', '"x"');
new Function(src)();
const { movedAny } = window.casoraUmzug;
const hass = (paths) => ({ callWS: async () => paths.map((url_path) => ({ url_path })) });

assert.equal(await movedAny(hass(['hemma-zuhause']), []), false, 'nichts umgezogen → anbieten');
assert.equal(await movedAny(hass(['hemma-zuhause', 'casora-mein-zuhause']), [{ src: 'hemma-zuhause', target: 'casora-mein-zuhause' }]), true,
  'umgezogen, Ziel da → kein Angebot');
assert.equal(await movedAny(hass(['hemma-zuhause']), [{ src: 'hemma-zuhause', target: 'casora-mein-zuhause' }]), false,
  'Ziel gelöscht → wieder anbieten');
assert.equal(await movedAny({ callWS: async () => { throw new Error('x'); } }, [{ src: 'a', target: 'b' }]), false, 'Fehler → wie bisher');
console.log('ok umzug_angebot');
