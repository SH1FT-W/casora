// The S7 dial's facts (design audit, 14.11.2026): a long value in the wheel's middle was cut off without „…“ – the
// weather warning read „Gebiet / Landkreis Musterberg N“ on the phone and the desktop, because every fact value was kept on
// one line (white-space: nowrap) inside the clamped facts box. A short value still stays together („1.192 km“,
// „vor 42 Tagen“), a long one may wrap at its spaces (richtlinien §4.8: facts at most two lines, nothing cut).
// Renders the real DIAL_CSS and the facts markup from casora-core.js in Chromium at phone and desktop wheel sizes.
//   node dev/unit/dial_fact_long_value.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');

// DIAL_CSS as the core builds it; its token objects become plain colours.
const a = core.indexOf('  var DIAL_CSS = ');
assert.ok(a > 0, 'DIAL_CSS found');
const b = core.indexOf("}}';\n", a) + "}}';".length;
const tok = new Proxy({}, { get: () => '#888' });
const css = new Function('S', 'T', 'return ' + core.slice(a + '  var DIAL_CSS = '.length, b).replace(/;$/, ''))(tok, tok);
assert.ok(css.includes('.hui-dl-w2'), 'facts rule in DIAL_CSS');

// The facts markup of the S7 dial (UI.stage), with the core's esc.
const m0 = core.indexOf("(facts.length ? '<div class=\"hui-dl-w2 fx\">'");
assert.ok(m0 > 0, 'facts markup found');
const m1 = core.indexOf("}).join('') + '</div>' : '')", m0) + "}).join('') + '</div>' : '')".length;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const factsHtml = new Function('facts', 'esc', 'return ' + core.slice(m0, m1) + ';');

const CASES = [
  { name: 'weather warning region', facts: [{ label: 'Gebiet', value: 'Landkreis Musterberg Nordwest' }] },
  { name: 'e-bike', facts: [{ label: 'Kilometerstand', value: '1.192 km' }, { label: 'Letzte Fahrt', value: 'vor 42 Tagen' }] },
  { name: 'warning until + region', facts: [{ label: 'Bis', value: 'Mo., 14:00' }, { label: 'Gebiet', value: 'Landkreis Beispieltal-Oberland Süd' }] },
];

const pw = (() => {
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs'); if (fs.existsSync(f)) return f; }
  return 'playwright';
})();
let chromium;
try { ({ chromium } = await import(pw)); } catch (e) { console.log('übersprungen: kein Playwright'); process.exit(0); }

const fails = [];
const br = await chromium.launch();
for (const wheel of [305, 348]) {
  const pg = await br.newPage({ viewport: { width: 600, height: 700 } });
  for (const c of CASES) {
    const html = '<style>' + css + 'body{margin:0;font-family:sans-serif;}</style>'
      + '<div class="hui-dl" style="width:' + wheel + 'px"><div class="hui-dl-c"><div class="hui-dl-t">Keine Warnungen</div>'
      + factsHtml(c.facts, esc) + '</div></div>';
    await pg.setContent(html);
    const r = await pg.evaluate(() => {
      const box = document.querySelector('.hui-dl-w2'), br0 = box.getBoundingClientRect();
      const vals = [...box.querySelectorAll('b')].map((v) => { const q = v.getBoundingClientRect(); return { t: v.textContent, right: q.right, left: q.left, sw: v.scrollWidth, cw: v.clientWidth }; });
      return { box: { left: br0.left, right: br0.right, sh: box.scrollHeight, ch: box.clientHeight }, vals };
    });
    for (const v of r.vals) {
      if (v.right > r.box.right + 0.5 || v.left < r.box.left - 0.5)
        fails.push(`${c.name} (${wheel}): „${v.t}“ runs out of the facts box (${Math.round(v.left)}–${Math.round(v.right)} vs ${Math.round(r.box.left)}–${Math.round(r.box.right)})`);
    }
    if (r.box.sh > r.box.ch + 1) fails.push(`${c.name} (${wheel}): facts cut at the bottom (${r.box.sh} > ${r.box.ch})`);
    // A short value keeps its parts together.
    if (c.name === 'e-bike') for (const v of await pg.evaluate(() => [...document.querySelectorAll('.hui-dl-w2 b')].map((x) => x.getClientRects().length)))
      if (v > 1) fails.push(`${c.name} (${wheel}): a short value broke over two lines`);
  }
  await pg.close();
}
await br.close();
if (fails.length) { console.error('FEHLER\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('dial_fact_long_value: ok');
