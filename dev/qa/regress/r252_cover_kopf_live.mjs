// @zustand: arbeit
// Gemeldet (11.10.2026): Im Jalousie-Popup folgte das Symbol im Kopf nicht der Position – die Kachel zeigte
// schon das neue Symbol, der Kopf noch das alte (er zeichnete nur bei An/Aus-Wechsel neu).
// Erwartet: Position ändern (offen bleibt offen) → Kopf-Symbol gleich dem Kachel-Symbol.
// Die Positionen gibt es nur im Browser (fakeStates).
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"entity":"cover\./.test(JSON.stringify(d.config.views || [])));
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
// Jalousie-Kacheln baut Casora in den Raumansichten: die erste Ansicht mit einer nehmen.
const findTile = () => page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => /^cover\./.test((x._config || {}).entity || '')
    && [].concat(x._config.template || []).some((t) => /casora_cover/.test(t)) && x.getBoundingClientRect().width > 0);
  if (!b) return null; b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect(); return { e: b._config.entity, x: r.x + r.width / 2, y: r.y + r.height / 3 };
});
let tile = null;
for (const v of dash.config.views) {
  await dashboard(page, dash.url + '/' + (v.path || ''), 3);
  tile = await findTile();
  if (tile) { await page.waitForTimeout(300); tile = await findTile(); break; }
}
await need('Jalousie-Kachel', tile);
const sym = () => page.evaluate((e) => {
  const b = window.__pierce('button-card').find((x) => (x._config || {}).entity === e && x.getBoundingClientRect().width > 0);
  const ic = b && b.shadowRoot && b.shadowRoot.querySelector('#icon');
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const ring = p && (p.shadowRoot || p).querySelector('.header-ring');
  const iconOf = (el) => { if (!el) return ''; const h = el.getAttribute('icon') || ''; if (h) return h;
    const m = (el.outerHTML || '').match(/icon="([^"]+)"|url\((?:&quot;|'|")?([^)'"&]+)/); return m ? (m[1] || m[2]) : ''; };
  return { tile: iconOf(ic), ring: ring ? ring.innerHTML.slice(0, 400) : null };
}, tile.e);
await fakeStates(page, { [tile.e]: { state: 'open', attributes: { current_position: 100 } } }, { sticky: true });
await page.mouse.click(tile.x, tile.y);
await page.waitForTimeout(1800);
const a = await sym();
await need('Popup mit Kopf-Symbol offen', a.ring, a);
await fakeStates(page, { [tile.e]: { state: 'open', attributes: { current_position: 30 } } }, { sticky: true });
await page.waitForTimeout(1500);
const b = await sym();
await check('Kopf-Symbol folgt der Position', b.ring !== a.ring, { vorher: a.ring, nachher: b.ring, kachel: b.tile });
await finish();
