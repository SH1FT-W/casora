// @zustand: arbeit
// Gemeldet (dashfix 25, 07.10.2026): Szenen mit Symbolen aus einem nicht installierten Satz (z. B.
// „ios:…“) zeigten leere Kreise. Erwartet: Nach der Wartezeit (Seite geladen + 6 s) zeichnet ein
// Symbol aus einem fehlenden Satz ein Standardsymbol. Ein Satz, der sich in der Wartezeit noch
// anmeldet (langsam ladend), bekommt nie den Ersatz (kein Flackern) und zeichnet sein echtes Symbol;
// einer, der sich erst danach anmeldet, ersetzt den Ersatz wieder.
// Die Symbole legt der Test selbst an (eigene Satz-Namen „qa-…“), unabhängig vom Haus.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const m = await open({ width: 1280, height: 900, dark: false, theme: 'Casora' });
const REAL = 'M2,2H22V22H2Z';
await m.context.addInitScript((REAL) => {
  window.__qaFake = {};
  setInterval(() => { const cs = window.customIconsets || {}; for (const k of ['qa-fehlt', 'qa-spaet', 'qa-sehrspaet']) if (cs[k] && !window.__qaFake[k]) window.__qaFake[k] = 1; }, 100);
  const reg = (name, at) => setTimeout(() => { window.customIcons = window.customIcons || {}; window.customIcons[name] = { getIcon: async () => ({ path: REAL }) }; }, at);
  reg('qa-spaet', 3000);
  reg('qa-sehrspaet', 11000);
}, REAL);
const pg = m.page;
await dashboard(pg, dash.url, 3);
await pg.evaluate(() => {
  for (const n of ['qa-fehlt:lampe', 'qa-spaet:lampe', 'qa-sehrspaet:lampe']) {
    const e = document.createElement('ha-icon'); e.icon = n; e.dataset.qa = n.split(':')[0];
    e.style.cssText = 'position:fixed;left:0;top:0;'; document.body.appendChild(e);
  }
});
const read = () => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('ha-icon[data-qa]')].map((e) => {
  const s = e.shadowRoot && e.shadowRoot.querySelector('ha-svg-icon');
  return [e.dataset.qa, { path: s ? (s.path || '') : '', fake: !!window.__qaFake[e.dataset.qa] }];
})));
await pg.waitForTimeout(9000);
const a = await read();
await pg.waitForTimeout(6000);
const b = await read();
await check('fehlender Satz zeichnet ein Standardsymbol', a['qa-fehlt'].path.length > 20 && a['qa-fehlt'].path !== REAL, a['qa-fehlt']);
await check('Satz, der in der Wartezeit kommt: echtes Symbol, nie Ersatz', a['qa-spaet'].path === REAL && !a['qa-spaet'].fake, a['qa-spaet']);
await check('Satz, der später kommt: Ersatz wird durch das echte Symbol abgelöst', b['qa-sehrspaet'].path === REAL, b['qa-sehrspaet']);
await finish();
