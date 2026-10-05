// @zustand: arbeit
// @parallel: allein   (setzt Player-Zustände per REST im Test-HA – andere Tests sähen sie)
// Gemeldet (05.10.2026): „Die Player sind bei der Wiedergabe nicht automatisch eingeblendet, und man
// sieht manchmal noch den alten Player vorher.“ Ursache: _casoraNP (casora-core.js) merkte sich die
// Liste nur nach Zustands-Signatur. Ein pausierter Player fällt aber nach der Pausen-Frist heraus,
// ohne dass sich ein Zustand ändert – er blieb in Welle, Menü und Listen stehen, bis irgendein
// Player wechselte (dann sprang die Anzeige auf einmal um), und nichts rechnete zur Frist neu.
// Erwartet (Casora-Look, Desktop): (1) Welle erscheint nach Start ohne Neuladen und verschwindet
// nach Stopp, je in ~2 s. (2) Eine abgelaufene Pause verschwindet von selbst. (3) Zwei Player mit
// gleichem Titel und Interpret = eine Zeile „Lautsprecher Küche + Bad · Interpret“, Kopf „Läuft
// gerade“, Play/Pause steuert beide. (4) Nach links wischen gibt „Ausblenden“ frei; Ausblenden
// entfernt die Zeile, und sind alle ausgeblendet, verschwindet die Welle. (5) Ein neuer Titel bringt
// den Player zurück. (6) Handy: dieselbe Gruppe als eine Zeile, Ausblenden blendet die Liste aus.
// Player: eigene Test-Entitäten per REST; die Raumkarten bekommen sie nur im Browser untergeschoben.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, usePage, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora-Dashboard mit Raumkarte und Handy-Gegenstück', dash && dash.phone);

const IDS = ['media_player.qa_np_live_1', 'media_player.qa_np_live_2', 'media_player.qa_np_live_3'];
const NAMES = ['Lautsprecher Küche', 'Lautsprecher Bad', 'Lautsprecher Flur'];
const PAUSE_S = 6; // Pausen-Frist in diesem Test (pause_timeout_minutes = 0.1)
const { access_token: TK } = await tokens();
const rest = (id, body, method = 'POST') => fetch(BASE + '/api/states/' + id, { method,
  headers: { Authorization: 'Bearer ' + TK, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const off = (i) => rest(IDS[i], { state: 'off', attributes: { friendly_name: NAMES[i], supported_features: 4127295 } });
const play = (i, title, state = 'playing') => rest(IDS[i], { state, attributes: { friendly_name: NAMES[i], media_title: title,
  media_artist: 'QA Band', media_duration: 300, media_position: 40, media_position_updated_at: new Date().toISOString(),
  media_content_type: 'music', supported_features: 4127295 } });
for (let i = 0; i < IDS.length; i++) await off(i);
atFinish(async () => { for (const id of IDS) await rest(id, null, 'DELETE'); });

// Wiedergabe in den Raumkarten (Desktop) und der Handy-Liste einschalten, nur mit den Test-Playern.
const inject = (ids) => {
  const fix = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(fix); return; }
    const t = [].concat(o.template || []);
    if (o.variables && (t.includes('casora_room') || t.includes('casora_mobile_now_playing'))) {
      o.variables.show_now_playing = true;
      o.variables.pause_timeout_minutes = 0.1;
      for (let i = 1; i <= 10; i++) o.variables['media_player_' + i] = ids[i - 1] || null;
    }
    for (const k in o) fix(o[k]);
  };
  const add = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function (t, fn, opt) {
    if (t !== 'message') return add.call(this, t, fn, opt);
    return add.call(this, t, function (ev) {
      if (typeof ev.data === 'string' && ev.data.includes('"views"')
        && (ev.data.includes('"casora_room"') || ev.data.includes('casora_mobile_now_playing'))) {
        try { const d = JSON.parse(ev.data); fix(d); ev = new MessageEvent('message', { data: JSON.stringify(d) }); } catch (e) { /* unverändert */ }
      }
      return fn.call(this, ev);
    }, opt);
  };
  try { localStorage.removeItem('casora.np.hidden'); } catch (e) { /* egal */ }
};

const desk = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', scale: 1 });
const page = desk.page;
await desk.context.addInitScript(inject, IDS);
await dashboard(page, dash.url);

const wave = () => page.evaluate(() => {
  const w = window.__pierce('.np-head-wave').map((e) => ({ r: e.getBoundingClientRect(), o: +getComputedStyle(e).opacity }))
    .filter((x) => x.r.width >= 30 && x.o > 0.5)[0];
  return w ? { x: w.r.x + w.r.width / 2, y: w.r.y + w.r.height / 2 } : null;
});
// Bis zu ms warten, bis fn() den erwarteten Wahrheitswert liefert; gibt die Dauer zurück (oder -1).
const until = async (fn, want, ms = 2500) => {
  const t = Date.now();
  while (Date.now() - t <= ms) { if (!!(await fn()) === want) return Date.now() - t; await page.waitForTimeout(150); }
  return -1;
};
const menu = () => page.evaluate(() => {
  const m = document.querySelector('.casora-welle-menu');
  if (!m || m.style.opacity === '0') return null;
  const sr = [...m.querySelectorAll('div')].map((d) => d.shadowRoot).filter(Boolean)[0];
  const rows = sr ? [...sr.querySelectorAll('.r')] : [];
  return { head: (m.querySelector('.casora-welle-head') || {}).textContent || '',
    rows: rows.map((r) => ({ t: r.querySelector('.t').textContent, s: r.querySelector('.s').textContent, n: +r.dataset.n,
      box: r.getBoundingClientRect().toJSON() })) };
});
await page.evaluate(() => {
  window.__qaCalls = [];
  const h = document.querySelector('home-assistant').hass, orig = h.callService;
  h.callService = function (d, s, data) {
    window.__qaCalls.push({ s: d + '.' + s, e: data && data.entity_id });
    if (d === 'media_player') return Promise.resolve();
    return orig.apply(this, arguments);
  };
});

await check('Vorher: keine Welle', !(await wave()));
await play(0, 'Titel Eins');
let dt = await until(wave, true);
await check('Start: Welle erscheint ohne Neuladen (≤ 2,5 s)', dt >= 0, dt);
await off(0);
dt = await until(wave, false);
await check('Stopp: Welle verschwindet ohne Neuladen (≤ 2,5 s)', dt >= 0, dt);

await play(0, 'Titel Eins');
await until(wave, true);
await play(0, 'Titel Eins', 'paused');
await page.waitForTimeout(1500);
await check('Pause: zunächst noch sichtbar (innerhalb der Frist)', !!(await wave()));
dt = await until(wave, false, PAUSE_S * 1000 + 2500);
await check('Pause abgelaufen: Welle verschwindet von selbst, ohne Zustandsänderung', dt >= 0, dt);

// Gruppe: zwei Player, gleicher Titel und Interpret.
await play(0, 'Gemeinsam');
await play(1, 'Gemeinsam');
await until(wave, true);
await page.waitForTimeout(800);
let w = await wave();
await need('Welle für die Gruppe sichtbar', w);
await page.mouse.click(w.x, w.y);
await page.waitForTimeout(900);
let m = await menu();
await check('Gruppe: eine Zeile im Welle-Menü', m && m.rows.length === 1 && m.rows[0].n === 2, m);
await check('Gruppe: Unterzeile „Lautsprecher Küche + Bad · QA Band“', m && m.rows[0] && /^Lautsprecher (Küche \+ Bad|Bad \+ Küche) · QA Band$/.test(m.rows[0].s), m && m.rows[0]);
await check('Gruppe: Kopf zählt Gruppen („Läuft gerade“)', m && m.head === 'Läuft gerade', m && m.head);

const pbtn = await page.evaluate(() => {
  const sr = [...document.querySelector('.casora-welle-menu').querySelectorAll('div')].map((d) => d.shadowRoot).filter(Boolean)[0];
  const r = sr.querySelector('.r .p').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(pbtn.x, pbtn.y);
await page.waitForTimeout(500);
const calls = await page.evaluate(() => window.__qaCalls.filter((c) => c.s.startsWith('media_player')));
await check('Gruppe: Play/Pause steuert beide Player', calls.length === 1 && calls[0].s === 'media_player.media_pause'
  && [].concat(calls[0].e).sort().join() === IDS.slice(0, 2).join(), calls);

// Nach links wischen (Maus ziehen) → „Ausblenden“.
const hdBox = () => page.evaluate(() => {
  const mm = document.querySelector('.casora-welle-menu');
  const sr = mm && [...mm.querySelectorAll('div')].map((d) => d.shadowRoot).filter(Boolean)[0];
  const b = sr && sr.querySelector('.r .hd');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, o: +getComputedStyle(b).opacity, text: b.textContent,
    rc: sr.querySelector('.r .rc').getBoundingClientRect().x, row: sr.querySelector('.r').getBoundingClientRect().x };
});
const row = m.rows[0].box;
const drag = async (from, dx) => {
  await page.mouse.move(from, row.y + row.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from + i * dx / 8, row.y + row.height / 2 + (i % 2));
  await page.mouse.up();
  await page.waitForTimeout(450);
};
const isOpen = async () => { const h = await hdBox(); return !!h && h.rc < h.row - 40; };
await drag(row.x + row.width - 60, -176);
let hb = await hdBox();
await check('Wischen nach links: „Ausblenden“ sichtbar, Zeile eingerückt', hb && hb.o > 0.9 && hb.text === 'Ausblenden' && hb.rc < hb.row - 40, hb);
await check('Menü bleibt nach dem Wischen offen', !!(await menu()));
await drag(row.x + 60, 176);
await check('Nach rechts wischen schließt „Ausblenden“', !(await isOpen()) && !!(await menu()));
await drag(row.x + row.width - 60, -176);
await page.mouse.click(row.x + 40, row.y - 14);
await page.waitForTimeout(450);
await check('Tippen woanders schließt „Ausblenden“ (Menü bleibt offen)', !(await isOpen()) && !!(await menu()));
await drag(row.x + row.width - 60, -176);
hb = await hdBox();
await need('„Ausblenden“ freigelegt', hb && hb.o > 0.9, hb);
await page.mouse.click(hb.x, hb.y);
dt = await until(async () => !(await menu()), true);
await check('Ausblenden: Menü schließt (keine Wiedergabe mehr übrig)', dt >= 0, dt);
dt = await until(wave, false);
await check('Alle ausgeblendet: Welle verschwindet', dt >= 0, dt);
const stored = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('casora.np.hidden') || '{}')).sort().join());
await check('Ausgeblendet nur auf diesem Gerät (localStorage, beide Player)', stored === IDS.slice(0, 2).join(), stored);

await play(1, 'Neuer Titel');
dt = await until(wave, true);
await check('Neuer Titel bringt die Welle zurück', dt >= 0, dt);
w = await wave();
await page.mouse.click(w.x, w.y);
await page.waitForTimeout(900);
m = await menu();
await check('Neuer Titel: nur dieser Player in der Liste', m && m.rows.length === 1 && m.rows[0].t === 'Neuer Titel', m);
await page.keyboard.press('Escape');

// Handy: dieselbe Gruppe als eine Zeile; Ausblenden blendet die Liste aus.
await play(0, 'Zu zweit');
await play(1, 'Zu zweit');
const ph = await open({ width: 390, height: 844, mobile: true, dark: false, theme: 'Casora', scale: 1 });
usePage(ph.page);
await ph.context.addInitScript(inject, IDS);
await dashboard(ph.page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'));
const plist = () => ph.page.evaluate(() => {
  const e = (window._casoraNPSoft && window._casoraNPSoft._entries() || []).filter((x) => x.kind === 'phone')[0];
  const rows = e && e.host && e.host.shadowRoot ? [...e.host.shadowRoot.querySelectorAll('.r')] : [];
  const h = e ? e.card.getBoundingClientRect().height : 0;
  return { h, rows: rows.map((r) => ({ s: r.querySelector('.s').textContent, n: +r.dataset.n, box: r.getBoundingClientRect().toJSON() })) };
});
await ph.page.waitForTimeout(1500);
let pl = await plist();
await check('Handy: Gruppe als eine Zeile mit „+“', pl.rows.length === 1 && pl.rows[0].n === 2 && / \+ /.test(pl.rows[0].s), pl);
if (pl.rows[0]) {
  const b = pl.rows[0].box;
  await ph.page.mouse.move(b.x + b.width - 40, b.y + b.height / 2);
  await ph.page.mouse.down();
  for (let i = 1; i <= 8; i++) await ph.page.mouse.move(b.x + b.width - 40 - i * 22, b.y + b.height / 2);
  await ph.page.mouse.up();
  await ph.page.waitForTimeout(450);
  const hp = await ph.page.evaluate(() => {
    const e = window._casoraNPSoft._entries().filter((x) => x.kind === 'phone')[0];
    const bt = e.host.shadowRoot.querySelector('.r.sw .hd');
    if (!bt) return null;
    const r = bt.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await check('Handy: Wischen gibt „Ausblenden“ frei', !!hp, hp);
  if (hp) {
    await ph.page.mouse.click(hp.x, hp.y);
    const t = Date.now();
    while (Date.now() - t < 3000 && (await plist()).h > 2) await ph.page.waitForTimeout(150);
    pl = await plist();
    await check('Handy: alle ausgeblendet → Liste verschwindet', pl.h <= 2 && !pl.rows.length, pl);
  }
}
await finish();
