// Prüft den Markdown-Renderer des Studios (casora-panel-updates.js, window.casoraMarkdown):
// gleiche Ausgabe wie release_notes.py für die üblichen Fälle, nie rohes HTML.
//   node dev/unit/updates_markdown.mjs
import fs from 'node:fs';

globalThis.window = {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}) };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-updates.js', import.meta.url), 'utf8');
new Function(src)();
const md = window.casoraMarkdown;

let fails = 0;
const check = (name, cond, info) => { if (cond) console.log('ok     ' + name); else { fails++; console.log('FEHLER ' + name, info || ''); } };

const h = md('### Neu\n- **Updates ohne HACS:** Mit einem Token\n  in den Optionen.\n- zwei\n\n### Behoben\n- *kursiv* und `a<b`');
check('Überschrift + Liste + Folgezeile', h === '<h5>Neu</h5><ul><li><strong>Updates ohne HACS:</strong> Mit einem Token in den Optionen.</li><li>zwei</li></ul>'
  + '<h5>Behoben</h5><ul><li><em>kursiv</em> und <code>a&lt;b</code></li></ul>', h);
const nested = md('1. eins\n2. zwei\n   - unter\n   - unter2\n3. drei\n\nAbsatz');
check('nummeriert + verschachtelt', nested === '<ol><li>eins</li><li>zwei<ul><li>unter</li><li>unter2</li></ul></li><li>drei</li></ol><p>Absatz</p>', nested);
const evil = md('<script>alert(1)</script>\n\n- <img src=x onerror=alert(1)> [x](javascript:alert(1)) [ok](https://e.com/?a=1&b="2")');
check('kein rohes HTML', !/<script|<img/.test(evil), evil);
check('javascript-Link bleibt Text', !/href="javascript/.test(evil) && evil.includes('[x](javascript:alert(1))'), evil);
check('https-Link escapet', evil.includes('<a href="https://e.com/?a=1&amp;b=&quot;2&quot;">ok</a>'), evil);
check('Codeblock', md('```\n<b>\n```') === '<pre><code>&lt;b&gt;</code></pre>');
check('leer', md('') === '' && md(null) === '');

console.log(fails ? `\n${fails} Fehler` : '\nalles ok');
process.exit(fails ? 1 : 0);
