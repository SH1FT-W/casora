// Stil-Abdruck: berechnete Stile aller Elemente (auch in Shadow-Roots) von Dashboard (Desktop +
// Handy) und Studio als JSON – für „Optik unverändert“ bei reinen Aufräum-Änderungen (tote CSS-
// Regeln, tote Funktionen). Zwei Läufe vergleichen: vorher ohne, nachher mit CASORA_LOCAL=1.
//
//   node dev/qa/stilabdruck.mjs --out /pfad/vorher.json
//   CASORA_LOCAL=1 node dev/qa/stilabdruck.mjs --out /pfad/nachher.json
//   node dev/qa/stilabdruck.mjs --vergleich /pfad/vorher.json /pfad/nachher.json
//
// Bewusst ohne Breite/Höhe/Transform/Opacity (Uhr, Animationen); Text zählt nicht.
import fs from 'node:fs';
import { open, studio, casoraDashboard, dashboard } from './regress/lib.mjs';

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const PROPS = ['display', 'position', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-left-radius',
  'border-bottom-right-radius', 'background-color', 'background-image', 'color', 'font-size', 'font-weight',
  'line-height', 'gap', 'box-shadow', 'border-top-width', 'border-top-color', 'text-align', 'flex-direction',
  'justify-content', 'align-items', 'grid-template-columns', 'z-index', 'cursor', 'filter', 'letter-spacing'];

if (process.argv.includes('--vergleich')) {
  const i = process.argv.indexOf('--vergleich');
  const a = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8'));
  const b = JSON.parse(fs.readFileSync(process.argv[i + 2], 'utf8'));
  let diff = 0;
  for (const k of Object.keys(a)) {
    const x = a[k] || {}, y = b[k] || {};
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    let d = 0, n = 0;
    for (const e of keys) {
      n++;
      if (x[e] !== y[e]) { d++; if (d <= 5) console.log('  ' + k + ' ' + e.slice(0, 160) + '\n    vorher ' + String(x[e]).slice(0, 200) + '\n    nachher ' + String(y[e]).slice(0, 200)); }
    }
    console.log(k + ': ' + n + ' Elemente, ' + d + ' abweichend');
    diff += d;
  }
  process.exit(diff ? 1 : 0);
}

const OUTF = arg('out');
const collect = (pg, props) => pg.evaluate((props) => {
  const out = {};
  const seen = {};
  const walk = (root, path) => {
    for (const el of root.querySelectorAll('*')) {
      const id = path + '>' + el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).sort().join('.') : '');
      const n = (seen[id] = (seen[id] || 0) + 1);
      const cs = getComputedStyle(el);
      out[id + '#' + n] = props.map((p) => cs.getPropertyValue(p)).join('|');
      if (el.shadowRoot) walk(el.shadowRoot, id);
    }
  };
  walk(document, '');
  return out;
}, props);

const settle = (pg) => pg.waitForTimeout(4000);
const dash = await casoraDashboard();
const res = {};
{
  const { page } = await open({ width: 1440, height: 900, dark: false });
  await dashboard(page, dash.url); await settle(page);
  res.desktop = await collect(page, PROPS);
  await studio(page, dash.url); await settle(page);
  res.studio = await collect(page, PROPS);
  await page.context().close();
}
if (dash.phone) {
  const { page } = await open({ width: 393, height: 852, mobile: true, dark: true });
  await dashboard(page, dash.phone.url); await settle(page);
  res.handy = await collect(page, PROPS);
  await page.context().close();
}
fs.writeFileSync(OUTF, JSON.stringify(res));
console.log('geschrieben', OUTF, Object.fromEntries(Object.entries(res).map(([k, v]) => [k, Object.keys(v).length])));
process.exit(0);
