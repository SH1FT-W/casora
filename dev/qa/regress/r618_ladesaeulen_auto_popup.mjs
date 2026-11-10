// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/charging.py custom_components/casora/scripts/local/45-charging.js custom_components/casora/scripts/local/03-popups.js#C.sec
// Issue 168: chargers near the car. Expected: without a key the electric car's popup has no row „Ladesäulen“. With a
// key (Studio settings, here set over the websocket) the section „Akku“ has the row; a tap shows the page
// „Ladesäulen“ in the same popup: a filter Alle / AC / DC / HPC / Kostenlos with the number each, the chargers
// nearest first with operator, power and number of plugs, the place searched and „Daten: Open Charge Map, CC BY 4.0“.
// A filter narrows the list, a row leads to the map. Chargers out of use and private ones are missing.
// The chargers come from the test house's fake Open Charge Map (dev/casora_mock/openchargemap.py); the key is removed
// again at the end. Pictures: R618_BILD=1.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, atFinish, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const KEY = '12345678-abcd-4ef0-9876-0123456789ab';
const CAR = 'sensor.testlimousine_state_of_charge';

const ws = (pg, msg) => pg.evaluate((m) => document.querySelector('home-assistant').hass.callWS(m), msg);
const popupText = (pg) => pg.evaluate(() => {
  const P = window.casoraPopup, s = P && P.surface;
  if (!s) return null;
  const deep = (n) => { let t = ''; for (const c of n.childNodes) t += c.nodeType === 3 ? c.data + ' ' : c.nodeType === 1 && c.tagName !== 'STYLE' ? deep(c) : '';
    if (n.shadowRoot) t += deep(n.shadowRoot); return t; };
  return { title: P.element.shadowRoot.querySelector('.header-title').textContent.trim(), text: deep(s).replace(/\s+/g, ' ').trim() };
});
// Centre of the smallest visible element in the popup whose own text is exactly the label.
const spot = (pg, label) => pg.evaluate((label) => {
  const P = window.casoraPopup, s = P && P.surface;
  if (!s) return null;
  let best = null;
  const walk = (n) => {
    for (const c of n.children || []) {
      if (c.tagName === 'STYLE') continue;
      const own = (c.textContent || '').replace(/\s+/g, ' ').trim();
      const r = c.getBoundingClientRect();
      if (own === label && r.width > 0 && r.height > 0 && (!best || r.width * r.height < best.a)) best = { x: r.x + r.width / 2, y: r.y + r.height / 2, a: r.width * r.height };
      walk(c);
      if (c.shadowRoot) walk(c.shadowRoot);
    }
  };
  walk(s);
  return best;
}, label);
const rows = (pg) => pg.evaluate(() => {
  const P = window.casoraPopup, out = [];
  const walk = (n) => { for (const c of n.children || []) { if (c.dataset && c.dataset.casoraChargeBox !== undefined) out.push(c); walk(c); if (c.shadowRoot) walk(c.shadowRoot); } };
  if (P && P.surface) walk(P.surface);
  const box = out.find((b) => b.getBoundingClientRect().width > 0) || out[0];
  if (!box) return null;
  return { segs: [...box.querySelectorAll('.hui-sg')].map((e) => e.textContent.trim() + (e.classList.contains('on') ? '*' : '')),
    go: [...box.querySelectorAll('[data-casora-go]')].map((e) => e.getAttribute('data-casora-go')),
    names: [...box.querySelectorAll('[data-casora-go]')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()) };
});
const mount = (pg) => pg.evaluate(async (ent) => {
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_car', name: 'Testlimousine', entity: ent });
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 900));
}, CAR);
const tap = async (pg) => {
  await pg.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
  await pg.waitForTimeout(500);
  await pg.evaluate(() => { const el = window.__qaTile; el.hass = document.querySelector('home-assistant').hass; el.scrollIntoView({ block: 'center' }); });
  await pg.waitForTimeout(300);
  const b = await pg.evaluate(() => { const r = window.__qaTile.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await pg.mouse.click(b.x, b.y);
  let res = null;
  for (let i = 0; i < 24; i++) {
    res = await popupText(pg);
    if (res && res.text.length > res.title.length + 5) break;
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(700);
  return res;
};
const untilText = async (pg, re, max = 8000) => {
  let t = null;
  for (let waited = 0; waited < max; waited += 250) {
    t = await popupText(pg);
    if (t && re.test(t.text)) return t;
    await pg.waitForTimeout(250);
  }
  return t;
};
const pic = async (label) => { if (process.env.R618_BILD) await shot(label); };

const RUNS = [{ tag: 'Desktop', o: { width: 1440, height: 900, theme: 'Casora' } },
  { tag: 'Handy', o: { width: 393, height: 852, mobile: true, theme: 'Casora' }, mobile: true },
  { tag: 'Englisch', o: { width: 1440, height: 900, theme: 'Casora', lang: 'en' }, en: true }];
let first = true;
for (const run of RUNS) {
  const { page } = await open(run.o);
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && /casora|button-card|_casoraCharge|TypeError/i.test(m.text())) errs.push(m.text()); });
  const url = run.mobile ? (all.find((d) => d.mobile && d.url === desk.url + '-mobile') || desk).url : desk.url;
  if (first) {
    first = false;
    await dashboard(page, url);
    await ws(page, { type: 'casora/charging/set', key: '' });
    atFinish(async () => { try { await ws(page, { type: 'casora/charging/set', key: '' }); } catch (e) { /* page gone */ } });
    await page.reload();
    await dashboard(page, url);
    await mount(page);
    const off = await tap(page);
    await check('ohne Schlüssel: Popup öffnet, keine Zeile Ladesäulen', off && off.title.length > 0 && !/Ladesäulen/.test(off.text), off);
    const set = await ws(page, { type: 'casora/charging/set', key: KEY });
    await check('Schlüssel gesetzt, kommt nicht zurück', set.key_set === true && !JSON.stringify(set).includes(KEY), set);
    await page.reload();
  }
  await dashboard(page, url);
  await page.waitForFunction(() => window._casoraCharge && window._casoraCharge.ready === true, null, { timeout: 15000 }).catch(() => {});
  await mount(page);
  const res = await tap(page);
  const W = run.en ? { row: 'Chargers', all: 'All 10', free: 'Free 3', data: 'Data: Open Charge Map, CC BY 4.0', near: 'Nearby', home: 'Around home · 10 km', pts: '2 charging points' }
    : { row: 'Ladesäulen', all: 'Alle 10', free: 'Kostenlos 3', data: 'Daten: Open Charge Map, CC BY 4.0', near: 'In der Nähe', home: 'Rund um Zuhause · 10 km', pts: '2 Ladepunkte' };
  await check(run.tag + ': Auto-Popup zeigt die Zeile ' + W.row, res && res.text.includes(W.row), res);
  await pic(run.tag + '_1_auto');
  const at = await spot(page, W.row);
  await need(run.tag + ': Zeile gefunden', at, res);
  await page.mouse.click(at.x, at.y);
  const pg = await untilText(page, /Rathausplatz/);
  await page.waitForTimeout(600);
  await check(run.tag + ': Seite ' + W.row + ' mit Liste', pg && pg.title === W.row && /Rathausplatz/.test(pg.text), pg);
  const r1 = await rows(page);
  await check(run.tag + ': Filter mit Anzahl, Alle gewählt', r1 && JSON.stringify(r1.segs) === JSON.stringify([W.all + '*', 'AC 8', 'DC 4', 'HPC 2', W.free]), r1 && r1.segs);
  await check(run.tag + ': 10 Ladesäulen, die nächste zuerst, stillgelegte und private fehlen',
    r1 && r1.names.length === 10 && /^Rathausplatz/.test(r1.names[0]) && !r1.names.some((n) => /stillgelegt|Firmenhof/.test(n)), r1 && r1.names);
  const flat = pg ? pg.text.replace(/ /g, ' ') : '';
  await check(run.tag + ': Betreiber, Leistung, Ladepunkte, Entfernung', /Stadtwerke Musterstadt · 22 kW AC · /.test(flat) && flat.includes(W.pts) && /0[.,]4 km/.test(flat), flat.slice(0, 500));
  await check(run.tag + ': Ort der Suche und Quelle', flat.includes(W.home) && flat.includes(W.data), flat.slice(-300));
  await check(run.tag + ': Zeile führt zur Karte', r1 && r1.go.length === 10 && r1.go.every((u) => /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-?\d/.test(u)), r1 && r1.go.slice(0, 2));
  await pic(run.tag + '_2_alle');
  const hp = await spot(page, 'HPC 2');
  await need(run.tag + ': Filter HPC gefunden', hp, r1);
  await page.mouse.click(hp.x, hp.y);
  await page.waitForTimeout(500);
  const r2 = await rows(page);
  await check(run.tag + ': HPC zeigt die zwei Schnelllader, nächster zuerst',
    r2 && r2.segs[3] === 'HPC 2*' && r2.names.length === 2 && /^Bahnhof Ostseite/.test(r2.names[0]) && /^Schnellladepark/.test(r2.names[1]), r2);
  await pic(run.tag + '_3_hpc');
  const fr = await spot(page, W.free);
  if (fr) { await page.mouse.click(fr.x, fr.y); await page.waitForTimeout(500); }
  const r3 = await rows(page);
  await check(run.tag + ': Kostenlos zeigt die drei mit kostenloser Angabe', r3 && r3.names.length === 3 && r3.names.every((n) => /Möbelhaus|Supermarkt|Hotel/.test(n)), r3);
  await pic(run.tag + '_4_kostenlos');
  await check(run.tag + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3));
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
}
await finish();
