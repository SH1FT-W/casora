// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/charging.py custom_components/casora/scripts/local/45-charging.js custom_components/casora/scripts/local/03-popups.js#C.sec
// Issue 168: chargers near the car. Expected: without a key the electric car's popup has no row „Ladesäulen“. With a
// key (Studio settings, here set over the websocket) the section „Akku“ has the row; a tap shows the page
// „Ladesäulen“ in the same popup, built like the fuel view: the head says from how near, how many and where searched;
// left „Empfehlung“ from the battery level with the battery scale, „Ladeleistung · im Umkreis“ with a column per
// speed class and „Beste Wahl“ with three tiles (nearest, fastest, free); right „In der Nähe“ with a dot map, the
// switch Nächste / Schnellste / Gratis and the list with the power as a pill in the class colour; at the bottom
// „Daten: Open Charge Map, CC BY 4.0“. A row or tile leads to the map. Chargers out of use and private ones are missing.
// The chargers come from the test house's fake Open Charge Map (dev/casora_mock/openchargemap.py); the key is removed
// again at the end. Pictures: R618_BILD=1.
// #176: on an Android phone the switch did not react to a finger; the run „Android“ taps with the touch screen.
import zlib from 'node:zlib';
import { open, casoraDashboards, dashboard, check, need, finish, usePage, atFinish, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const KEY = '12345678-abcd-4ef0-9876-0123456789ab';
const CAR = 'sensor.testlimousine_state_of_charge';

// One-coloured PNG of any size for the caught logo addresses: nothing depends on the net. be emobil gets the
// service's 16 px placeholder (the bolt has to stay), the others a logo. R618_ECHT=1 loads the real logos (pictures).
const png = (w, h) => {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x40)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
};
const routeLogos = (pg) => process.env.R618_ECHT ? null : pg.route(/s2\/favicons/, (r) => r.fulfill({ status: 200, contentType: 'image/png',
  body: /domain=be-emobil\.de/.test(r.request().url()) ? png(16, 16) : png(128, 128) }));
const ws = (pg, msg) => pg.evaluate((m) => document.querySelector('home-assistant').hass.callWS(m), msg);
const popupText = (pg) => pg.evaluate(() => {
  const P = window.casoraPopup, s = P && P.surface;
  if (!s) return null;
  const deep = (n) => { let t = ''; for (const c of n.childNodes) t += c.nodeType === 3 ? c.data + ' ' : c.nodeType === 1 && c.tagName !== 'STYLE' ? deep(c) : '';
    if (n.shadowRoot) t += deep(n.shadowRoot); return t; };
  const hs = P.element.shadowRoot.querySelector('.header-status');
  return { title: P.element.shadowRoot.querySelector('.header-title').textContent.trim(),
    status: hs && !hs.hidden ? hs.textContent.replace(/\s+/g, ' ').trim() : '', text: deep(s).replace(/\s+/g, ' ').trim() };
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
      if (own === label && r.width > 0 && r.height > 0 && (!best || r.width * r.height < best.a)) best = { el: c, a: r.width * r.height };
      walk(c);
      if (c.shadowRoot) walk(c.shadowRoot);
    }
  };
  walk(s);
  if (!best) return null;
  best.el.scrollIntoView({ block: 'center' });
  const q = best.el.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
}, label);
const rows = (pg) => pg.evaluate(() => {
  const P = window.casoraPopup, out = [];
  const walk = (n) => { for (const c of n.children || []) { if (c.dataset && c.dataset.casoraChargeBox !== undefined) out.push(c); walk(c); if (c.shadowRoot) walk(c.shadowRoot); } };
  if (P && P.surface) walk(P.surface);
  const box = out.find((b) => b.getBoundingClientRect().width > 0) || out[0];
  if (!box) return null;
  const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  const rect = (sel) => { const e = box.querySelector(sel); const r = e && e.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null; };
  return { segs: [...box.querySelectorAll('.hui-sg')].map((e) => e.textContent.trim() + (e.classList.contains('on') ? '*' : '')),
    go: [...box.querySelectorAll('.ch-list [data-casora-go]')].map((e) => e.getAttribute('data-casora-go')),
    names: [...box.querySelectorAll('.ch-list [data-casora-go]')].map(txt),
    more: box.querySelector('.ch-more') ? txt(box.querySelector('.ch-more')) : '',
    cards: [...box.querySelectorAll('.ch-c')].map((e) => ({ t: txt(e), go: e.getAttribute('data-casora-go'), over: e.scrollWidth > e.clientWidth + 1 })),
    pills: [...new Set([...box.querySelectorAll('.ch-list .hui-end span')].map((e) => getComputedStyle(e).backgroundColor))].length,
    bolt: [...box.querySelectorAll('.ch-logo[data-logo="blitz"]')].map((e) => { const a = e.getBoundingClientRect(), b = e.querySelector('i').getBoundingClientRect();
      return { dx: Math.round((b.x + b.width / 2) - (a.x + a.width / 2)), dy: Math.round((b.y + b.height / 2) - (a.y + a.height / 2)) }; }),
    fit: [...box.querySelectorAll('.ch-list .ch-logo')].map((e) => { const a = e.getBoundingClientRect(), p = e.parentElement.getBoundingClientRect();
      return Math.abs(a.x - p.x) <= 1 && Math.abs(a.y - p.y) <= 1 && Math.abs(a.width - p.width) <= 1 && Math.abs(a.height - p.height) <= 1; }),
    logos: [...box.querySelectorAll('.ch-list .ch-logo')].map((e) => e.getAttribute('data-logo') + (e.querySelector('img') ? '+img' : '')),
    bars: [...box.querySelectorAll('.ch-bar')].map((e) => e.dataset.k + ':' + e.dataset.n),
    verdict: box.querySelector('.ch-verdict') ? txt(box.querySelector('.ch-verdict')) : '', scale: !!box.querySelector('.ch-scale'),
    power: box.querySelector('.ch-power') ? txt(box.querySelector('.ch-power')) : '',
    dots: box.querySelectorAll('.ch-dot').length, pins: [...box.querySelectorAll('.ch-pin')].map(txt),
    src: box.querySelector('.ch-src') ? txt(box.querySelector('.ch-src')) : '',
    left: rect('.ch-verdict'), map: rect('.ch-map'),
    pinBoxes: [...box.querySelectorAll('.ch-pin')].map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }),
    out: [...box.querySelectorAll('*')].filter((e) => e.tagName !== 'STYLE' && !e.closest('.ch-map') && e.getBoundingClientRect().width > 0
      && e.getBoundingClientRect().right > box.getBoundingClientRect().right + 1).slice(0, 4).map((e) => (e.className || e.tagName) + ' ' + txt(e).slice(0, 30)),
    wide: box.scrollWidth > box.clientWidth + 1 };
});
// Centre of the switch field with this label.
const seg = (pg, label) => pg.evaluate((label) => {
  const P = window.casoraPopup, out = [];
  const walk = (n) => { for (const c of n.children || []) { if (c.classList && c.classList.contains('hui-sg')) out.push(c); walk(c); if (c.shadowRoot) walk(c.shadowRoot); } };
  if (P && P.surface) walk(P.surface);
  const el = out.find((e) => e.textContent.trim() === label && e.getBoundingClientRect().width > 0);
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const q = el.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
}, label);
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
  { tag: 'Englisch', o: { width: 1440, height: 900, theme: 'Casora', lang: 'en' }, en: true },
  { tag: 'Android', o: { width: 412, height: 915, mobile: true, theme: 'Casora',
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' }, mobile: true, touch: true }];
let first = true;
for (const run of RUNS) {
  const { page } = await open(run.o);
  usePage(page);
  await routeLogos(page);
  const errs = [];
  const press = (q) => run.touch ? page.touchscreen.tap(q.x, q.y) : page.mouse.click(q.x, q.y);
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
  const W = run.en ? { row: 'Chargers', segs: ['Nearest*', 'Fastest', 'Free'], data: 'Data: Open Charge Map, CC BY 4.0', home: 'Around home', pts: '2 charging points',
      n: '10 chargers', tops: ['Nearest', 'Fastest', 'Free'], v: ['Battery 64', 'No need to charge', '312 km'], p: 'Charging power', fast: 'Fastest', free: 'Free' }
    : { row: 'Ladesäulen', segs: ['Nächste*', 'Schnellste', 'Kostenlos'], data: 'Daten: Open Charge Map, CC BY 4.0', home: 'Rund um Zuhause', pts: '2 Ladepunkte',
      n: '10 Ladesäulen', tops: ['Nächste', 'Schnellste', 'Kostenlos'], v: ['Akku 64', 'Laden nicht nötig', '312 km'], p: 'Ladeleistung', fast: 'Schnellste', free: 'Kostenlos' };
  await check(run.tag + ': Auto-Popup zeigt die Zeile ' + W.row, res && res.text.includes(W.row), res);
  await pic(run.tag + '_1_auto');
  const at = await spot(page, W.row);
  await need(run.tag + ': Zeile gefunden', at, res);
  await press(at);
  const pg = await untilText(page, /Rathausplatz/);
  await page.waitForTimeout(700);
  await check(run.tag + ': Seite ' + W.row + ' mit Liste', pg && pg.title === W.row && /Rathausplatz/.test(pg.text), pg);
  const r1 = await rows(page);
  await need(run.tag + ': Seite gezeichnet', r1, pg);
  const flat = pg.text.replace(/\u00a0/g, ' ');
  const head = pg.status.replace(/\u00a0/g, ' ');
  await check(run.tag + ': Kopf nennt Nähe, Anzahl und Suchort', /0[.,]4 km/.test(head) && head.includes(W.n) && head.includes(W.home) && head.includes('10 km'), head);
  await check(run.tag + ': Empfehlung aus dem Akku mit Skala', W.v.every((x) => r1.verdict.includes(x)) && r1.scale, r1.verdict);
  await check(run.tag + ': Ladeleistung im Umkreis, eine Säule je Klasse', r1.power.includes(W.p) && /300 ?kW/.test(r1.power) && /4[.,]6 km/.test(r1.power)
    && JSON.stringify(r1.bars) === JSON.stringify(['slow:3', 'mid:3', 'fast:2', 'hpc:2']), { power: r1.power, bars: r1.bars });
  await check(run.tag + ': drei Kacheln Nächste, Schnellste, Gratis, jede zur Karte, nichts abgeschnitten',
    r1.cards.length === 3 && r1.cards.every((c, i) => c.t.startsWith(W.tops[i]) && /maps/.test(c.go) && !c.over)
      && /Rathausplatz/.test(r1.cards[0].t) && /Autohof Nord/.test(r1.cards[1].t) && /Möbelhaus Nordpark/.test(r1.cards[2].t) && !r1.out.length, { cards: r1.cards, out: r1.out });
  await check(run.tag + ': Punktkarte mit allen zehn und den drei Pillen', r1.dots === 10 && JSON.stringify(r1.pins) === JSON.stringify(['22 kW', '300 kW', '22 kW'])
    && r1.pinBoxes.every((a, i) => r1.pinBoxes.every((b, j) => i >= j || a[0] >= b[0] + b[2] || b[0] >= a[0] + a[2] || a[1] >= b[1] + b[3] || b[1] >= a[1] + a[3])), { dots: r1.dots, pins: r1.pins, boxes: r1.pinBoxes });
  await check(run.tag + ': Umschalter, Nächste gewählt', JSON.stringify(r1.segs) === JSON.stringify(W.segs), r1.segs);
  await check(run.tag + ': 10 Ladesäulen, die nächste zuerst, stillgelegte und private fehlen',
    r1.names.length === 10 && /^Rathausplatz/.test(r1.names[0]) && !r1.names.some((n) => /stillgelegt|Firmenhof/.test(n)), r1.names);
  await check(run.tag + ': Entfernung, Betreiber, Ladepunkte, Leistung in vier Farben',
    /0[.,]4 km · EnBW · /.test(r1.names[0]) && r1.names[0].includes(W.pts) && r1.names[0].includes('22 kW AC') && r1.pills === 4, { row: r1.names[0], pills: r1.pills });
  // EnBW, Tesla, Allego and IONITY show their logo; no operator, a placeholder operator or a 16 px placeholder picture
  // (be emobil at Alte Molkerei) keep the bolt.
  await check(run.tag + ': Betreiber-Logo, wo es eines gibt, sonst der Blitz',
    JSON.stringify(r1.logos) === JSON.stringify(['bild+img', 'blitz', 'bild+img', 'blitz', 'bild+img', 'blitz', 'blitz', 'blitz', 'bild+img', 'bild+img']), r1.logos);
  await check(run.tag + ': Logo und Blitz füllen ihr Feld genau', r1.fit.every((f) => f), r1.fit);
  await check(run.tag + ': Blitz mittig im Feld', r1.bolt.every((b) => Math.abs(b.dx) <= 1 && Math.abs(b.dy) <= 1), r1.bolt);
  // The phone run is an iPhone: Apple Maps there, Google Maps elsewhere (Android too).
  const mapRe = run.mobile && !run.touch ? /^https:\/\/maps\.apple\.com\/\?ll=-?\d[^&]*&q=./ : /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-?\d/;
  await check(run.tag + ': Zeile führt zur Karte', r1.go.length === 10 && r1.go.every((u) => mapRe.test(u)), r1.go.slice(0, 2));
  await check(run.tag + ': Fußzeile mit Suchort, Stand und Quelle', r1.src.includes(W.home) && r1.src.includes('10 km') && r1.src.includes(W.data), r1.src);
  if (!run.mobile) await check(run.tag + ': zwei Spalten, Karte rechts neben der Empfehlung', r1.left && r1.map && r1.map.x > r1.left.x + r1.left.w - 2 && Math.abs(r1.map.y - r1.left.y) < 12, { left: r1.left, map: r1.map });
  else await check(run.tag + ': eine Spalte, Karte unter der Empfehlung', r1.left && r1.map && r1.map.y > r1.left.y + r1.left.h && Math.abs(r1.map.x - r1.left.x) < 12, { left: r1.left, map: r1.map });
  await pic(run.tag + '_2_seite');
  const fa = await seg(page, W.fast);
  await need(run.tag + ': Umschalter Schnellste gefunden', fa, r1.segs);
  await press(fa);
  await page.waitForTimeout(500);
  const r2 = await rows(page);
  await check(run.tag + ': Schnellste sortiert nach Leistung', r2 && r2.segs[1] === W.fast + '*' && r2.names.length === 10 && /^Schnellladepark/.test(r2.names[0]) && /^Bahnhof Ostseite/.test(r2.names[1]), r2 && { segs: r2.segs, names: r2.names.slice(0, 3) });
  await pic(run.tag + '_3_schnellste');
  const fr = await seg(page, W.free);
  await need(run.tag + ': Umschalter Gratis gefunden', fr, r2 && r2.segs);
  await press(fr);
  await page.waitForTimeout(500);
  const r3 = await rows(page);
  await check(run.tag + ': Gratis zeigt die drei mit kostenloser Angabe', r3 && r3.names.length === 3 && r3.names.every((n) => /Möbelhaus|Supermarkt|Hotel/.test(n)), r3 && r3.names);
  await pic(run.tag + '_4_gratis');
  const gearShown = await page.evaluate(() => { const g = window.casoraPopup.element.shadowRoot.querySelector('.header-gear'); return !!g && !g.hidden; });
  await check(run.tag + ': Zahnrad im Kopf der Ladesäulen-Seite', gearShown);
  if (run.tag === 'Desktop') {
    // The gear opens Studio › Settings › Chargers nearby.
    await page.evaluate(() => window.casoraPopup.element.shadowRoot.querySelector('.header-gear').click());
    const studioOk = await page.waitForFunction(() => /^\/casora-studio/.test(location.pathname)
      && window.__pierce && window.__pierce('.cs-ch-key').some((e) => e.getBoundingClientRect().width > 0), null, { timeout: 20000 }).then(() => true, () => false);
    await check(run.tag + ': Zahnrad führt zu den Ladesäulen-Einstellungen', studioOk, await page.evaluate(() => location.pathname + location.search));
    await pic(run.tag + '_5_studio');
    errs.length = 0;
  }
  await check(run.tag + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3));
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
}
await finish();
