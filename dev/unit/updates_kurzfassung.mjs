// SEC-06: Kurzfassung im Updates-Popup (03-popups.js) – erst Entities auflösen, dann Tags
// entfernen, sonst wird aus „&lt;img …&gt;“ wieder echtes Markup.
//   node dev/unit/updates_kurzfassung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const m = src.match(/var sum = (String\(a\.release_summary[\s\S]*?\.filter\(Boolean\)\[0\]);/);
assert.ok(m, 'Kurzfassung gefunden');
const sum = (summary) => new Function('a', 'return ' + m[1])({ release_summary: summary });
assert.ok(!/<img/i.test(sum('&lt;img src=x onerror=alert(1)&gt; Neu')), 'kein <img> aus &lt;…&gt;');
assert.equal(sum('&lt;img src=x onerror=alert(1)&gt; Neu'), 'Neu');
assert.equal(sum('## Neu: **Schnell** &amp; [Link](https://x)'), 'Neu: Schnell & Link');
assert.equal(sum('<p>Fix</p>\n- zwei'), 'Fix');
console.log('ok updates_kurzfassung');
