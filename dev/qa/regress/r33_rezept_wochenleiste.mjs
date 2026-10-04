// @zustand: arbeit
// @parallel: frei
// Gemeldet (Issue #3, Küche · Rezepte, Weich, Desktop): In der Speiseplan-Wochenleiste wurde der
// Rezeptname einzeilig mitten im Wort abgeschnitten, ohne „…“ – button-card vererbt nowrap, .hrk-n
// setzte kein white-space:normal. Erwartet: höchstens zwei Zeilen, bei Überlänge mit Ellipse.
// Rendert R.weekHtml() (03-popups.js, wie im Test-HA geladen) mit einem langen Namen in einem
// nowrap-Rahmen in Popup-Breite und misst die Zeilen. Nichts wird in HA gespeichert.
import { open, usePage, casoraDashboard, studioDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = (await casoraDashboard()) || { url: await studioDashboard(), config: { views: [{}] } };
await need('Dashboard', dash && dash.url);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora Weich', dark: false });
usePage(page);
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'), 1);
await need('Rezept-Skript geladen', await page.evaluate(() => !!(window._casoraRecipe && window._casoraRecipe.weekHtml && window._casoraHH)));

const r = await page.evaluate(() => {
  const R = window._casoraRecipe;
  const keep = R.cal.list;
  const now = new Date();
  R.cal.list = [{ when: now, name: 'Zucchini-Käse-Lasagne mit Ricotta und Basilikum', min: 60 },
    { when: new Date(now.getTime() + 86400000), name: 'Kürbissuppe', min: 30 }];
  const html = R.weekHtml();
  R.cal.list = keep;
  const box = document.createElement('div');
  // wie im Popup: button-card vererbt white-space:nowrap, Inhaltsbreite ~1150 px
  box.style.cssText = 'position:fixed;left:0;top:0;width:1150px;white-space:nowrap;z-index:99999;background:#fff;';
  box.innerHTML = html;
  document.body.appendChild(box);
  const out = [...box.querySelectorAll('.hrk-n:not(.off)')].map((n) => {
    const cs = getComputedStyle(n);
    const lh = parseFloat(cs.lineHeight);
    return { t: n.textContent, lines: Math.round((n.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh), clamped: n.scrollHeight > n.clientHeight + 1, ws: cs.whiteSpace };
  });
  box.remove();
  return out;
});
await need('Wochenleiste mit Rezeptnamen', r.length === 2, r);
const [long, short] = r;
await check('langer Rezeptname bricht auf zwei Zeilen um', long.lines === 2, long);
await check('langer Rezeptname endet mit Ellipse (gekürzt, nicht hart abgeschnitten)', long.clamped && long.ws !== 'nowrap', long);
await check('kurzer Rezeptname bleibt einzeilig', short.lines === 1 && !short.clamped, short);
await finish();
