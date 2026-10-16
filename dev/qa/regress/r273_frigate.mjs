// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/23-frigate.js dev/casora_mock/frigate.py
// Community-Karte Frigate (#22) an der erfundenen Frigate-Testkamera camera.testhof (dev/casora_mock/frigate.py):
//   1. Kachel: „Person · vor N Min.“ aus dem letzten Schnappschuss.
//   2. Popup: Status im Kopf (Hauptschalter „Objekterkennung“), „Letzte Erkennungen“ mit Filter-Chips und den Ereignissen
//      aus frigate/events/get (Vorschaubild signiert), „Objekte“, Schalter unten unter „Einstellungen“;
//      Erkennung antippen → Detail mit Schnappschuss, ohne Clip mit Hinweis „Kein Clip vorhanden“ (Testhaus hat keine Clips).
//   3. Neue Erkennung (Testdienst casora_mock.frigate_erkennung) → Kachel „Person erkannt“ mit rotem Punkt, Liste oben „Live“.
// Die Kachel entsteht nur im Browser (nicht gespeichert).
import { open, casoraDashboard, dashboard, check, need, finish, stable, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'camera.testhof';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Frigate-Testkamera im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_frigate', entity: id, name: 'Hofkamera' });
  el.classList.add('qa-r273');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, ID);
const tile = () => stable(page, () => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r273');
  const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  if (!st) return null;
  const full = st.querySelector('.sf-f');
  return { text: String((full || st).textContent || '').replace(/\s+/g, ' ').trim(), dot: !!st.querySelector('span[aria-hidden="true"]') };
}, null, { max: 10000, quiet: 800 });
const popText = () => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  const hs = pop.shadowRoot.querySelector('.header-switch');
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 2500), hs: hs && !hs.hidden ? hs.title : null,
    chips: window.__pierce('[data-casora-mi^="frigate-flt:"][aria-pressed]', pop.shadowRoot).length, rows: window.__pierce('[data-casora-mi^="frigate-ev:"]', pop.shadowRoot).length,
    thumbs: window.__pierce('img', pop.shadowRoot).filter((i) => /\/api\/frigate\/.+\/thumbnail\/.+authSig=/.test(i.src)).length };
}, null, { max: 12000, quiet: 1200 });
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };

let t = await tile();
await check('Kachel: letzte Erkennung „Person · vor N Min.“', t && /^Person · vor \d+ Min\.$/.test(t.text.replace(/ /g, ' ')) && !t.dot, t);
const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r273').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(at.x, at.y);
let p = await popText();
await check('Popup: Status, Erkennungen mit Filter-Chips, Objekte, Einstellungen', p && /Zuletzt: Person/.test(p.txt) && /Einstellungen/.test(p.txt)
  && /Objekte/.test(p.txt) && /Letzte Erkennungen/.test(p.txt) && p.chips >= 3, p && { txt: p.txt, chips: p.chips });
await check('Hauptschalter im Kopf heißt „Objekterkennung“', p && p.hs === 'Objekterkennung', p && p.hs);
await check('Erkennungen aus frigate/events/get mit signierten Vorschaubildern', p && p.rows >= 6 && p.thumbs >= 6, p && { rows: p.rows, thumbs: p.thumbs });
await page.evaluate(() => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open')); window.__pierce('[data-casora-mi^="frigate-ev:"]', pop.shadowRoot)[0].click(); });
await page.waitForTimeout(2500);
const det = await page.evaluate(() => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  return pop ? window.__pierce('img', pop.shadowRoot).some((i) => /\/snapshot\/.+authSig=/.test(i.src)) || window.__pierce('video', pop.shadowRoot).length > 0 : false; });
await check('Erkennung antippen → Detail mit Schnappschuss/Clip', det);
const noClip = await stable(page, () => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const n = pop && window.__pierce('.frig-noclip', pop.shadowRoot)[0]; return n ? getComputedStyle(n).display !== 'none' : null; }, null, { max: 6000, quiet: 800 });
await check('Detail ohne Clip: Hinweis „Kein Clip vorhanden“', noClip === true, noClip);
await closePop();

const tok = await tokens();
await fetch(BASE + '/api/services/casora_mock/frigate_erkennung',
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'person', dauer: 8 }) });
await page.waitForTimeout(1500);
t = await tile();
await check('Neue Erkennung: Kachel „Person erkannt“ mit rotem Punkt', t && t.text === 'Person erkannt' && t.dot, t);
await page.mouse.click(at.x, at.y);
p = await popText();
await check('Popup: Kopf „Person erkannt“, oben „Live“', p && /Person erkannt/.test(p.txt) && /\bLive\b/.test(p.txt), p && p.txt);
await closePop();
await page.waitForTimeout(8000);
await finish();
