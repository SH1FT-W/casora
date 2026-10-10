// fix3 (Feinschliff 1.3, AB-01): Im Umzug-Schritt „Einige Kacheln hast du angepasst“ ragte das Segment
// „Meine | Casora | ✦ KI (≈ 0,05 €)“ einer Karte allein in der Reihe (Karte 256 px) ≈ 26 px über Pille und
// Karte hinaus. Prüft mit dem echten CSS aus chooseCss (Chromium): bei Rasterbreiten von Handy bis Desktop
// bleibt jeder Segment-Knopf in Pille und Karte (de + en, mit Preis).
//   node dev/unit/umzug_segment_passt.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('st.id = "casora-choose-css"'), src.indexOf('root.appendChild(st)', src.indexOf('st.id = "casora-choose-css"')));
const css = [...block.matchAll(/^\s*(?:st\.textContent = |\+ )("(?:[^"\\]|\\.)*")/gm)].map((m) => JSON.parse(m[1])).join('');
assert.ok(css.includes('.cc-grid{') && css.includes('.cc-card .cc-seg'), 'chooseCss gefunden');
const pw = (() => {
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs'); if (fs.existsSync(f)) return f; }
  return 'playwright';
})();
const { chromium } = await import(pw);
const b = await chromium.launch();
const pg = await b.newPage();
const svg = '<svg viewBox="0 0 24 24"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/></svg>';
const card = (l) => `<div class="cc-card"><div class="cc-seg"><button class="on">${l[0]}</button><button>${l[1]}</button>`
  + `<button class="cc-seg-ai">${svg}<span>${l[2]}</span><span class="cc-cost"> (${l[3]})</span></button></div></div>`;
const fails = [];
for (const [lang, l] of [['de', ['Meine', 'Casora', 'KI', '≈ 0,05 €']], ['en', ['Mine', 'Casora', 'AI', '≈ €0.05']]]) {
  for (const w of [330, 361, 600, 736, 1052]) {
    await pg.setContent(`<style>:root{--t-foot:13px;--t-callout:15px;--r-l:18px}body{margin:0;font-family:system-ui}${css}</style>`
      + `<div class="cc-grid" style="width:${w}px">${card(l)}</div>`);
    const m = await pg.evaluate(() => {
      const c = document.querySelector('.cc-card').getBoundingClientRect(), s = document.querySelector('.cc-seg').getBoundingClientRect();
      const r = Math.max(...[...document.querySelectorAll('.cc-seg button')].map((x) => x.getBoundingClientRect().right));
      return { karte: c.right, pille: s.right, knopf: r, breite: c.width };
    });
    if (m.knopf > m.pille + 0.5 || m.pille > m.karte + 0.5) fails.push(`${lang} Raster ${w}px (Karte ${Math.round(m.breite)}): Knopf ${m.knopf - m.pille | 0} px über der Pille, Pille ${m.pille - m.karte | 0} px über der Karte`);
  }
}
await b.close();
assert.deepEqual(fails, [], fails.join('\n'));
console.log('ok umzug_segment_passt');
