// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/23-frigate.js dev/casora_mock/frigate.py
// Community-Karte Frigate (#22, „Frigate 2“) an der erfundenen Frigate-Testkamera camera.testhof (dev/casora_mock/frigate.py):
//   1. Kachel: „2 neue Alarme“ (ungesehene Alarme aus frigate/reviews/get).
//   2. Popup: Status im Kopf (Hauptschalter „Objekterkennung“), Reviews mit EINER Chip-Reihe (Alle · Alarme ·
//      Erkennungen · Neu n) und der Pille „Filter“ (Zeitraum, Favoriten, Objekte/Zonen/Gesicht), signierte
//      review_thumbnail.webp, Aufnahmen der letzten Tage. Wieder geöffnet: Filter zurück auf „Alle“.
//   3. Review öffnen → gesehen (Kachel „1 neuer Alarm“), Clip = Review-Zeitraum über HLS – gegen den strengen Mock
//      (Unter-Liste pfadgenau signiert, A1); „Favorit“ (frigate/event/retain); ohne HLS → Clip des Ereignisses (MP4);
//      ohne beides → „Kein Clip vorhanden“.
//   4. Aufnahmen: Tag antippen → Wiedergabe (HLS) mit Zeitleiste; Antippen und Pfeiltasten springen; Ausschnitt
//      „ab hier 1 Min.“ mit lesbarem Dateinamen; ohne HLS MP4-Rückfall mit „Springen nicht möglich“.
//   4b. Halten „Letzte Erkennung“ öffnet die Review (mit Zurück, Tippen ins Leere schließt nicht).
//   5. Frigate ohne Reviews → Ereignisliste wie bisher, ohne Fehlermeldung.
//   6. Live auf der Kachel: nur sichtbar und mit Stream-Funktion eingebaut, aus dem Bild/weg → abgebaut, kein Leck.
//   7. Neue Erkennung (Testdienst) → Kachel „Person erkannt“ mit rotem Punkt; offenes Popup über das Abo „Live“.
// Die Kacheln entstehen nur im Browser (nicht gespeichert).
import { open, casoraDashboard, dashboard, check, need, finish, stable, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'camera.testhof';
const tok = await tokens();
const svc = (name, data) => fetch(BASE + '/api/services/casora_mock/' + name,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
await svc('frigate_proxy', { notifications: true, vod: true, reviews: true, stream: false, zuruecksetzen: true });
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Frigate-Testkamera im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
const addTile = (cls, vars, top) => page.evaluate(async ([id, cls, vars, top]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_frigate', entity: id, name: 'Hofkamera', variables: vars });
  el.classList.add(cls);
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:' + top + 'px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  el._qaT = setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, [ID, cls, vars || {}, top]);
await addTile('qa-r273', {}, 300);
const tile = (cls = 'qa-r273') => stable(page, (c) => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.' + c);
  const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  if (!st) return null;
  const full = st.querySelector('.sf-f');
  return { text: String((full || st).textContent || '').replace(/\s+/g, ' ').trim(), dot: !!st.querySelector('span[aria-hidden="true"]') };
}, cls, { max: 10000, quiet: 800 });
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
  const P = (q) => window.__pierce(q, pop.shadowRoot);
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 3000), hs: hs && !hs.hidden ? hs.title : null,
    chips: P('[data-casora-mi^="frigate-f:"][aria-pressed]').map((x) => x.textContent.trim()),
    rv: P('[data-casora-mi^="frigate-rv:"]').length, ev: P('[data-casora-mi^="frigate-ev:"]').length,
    rec: P('[data-casora-mi^="frigate-rec:"]').length,
    thumbs: P('img').filter((i) => /\/api\/frigate\/.+\/(review_thumbnail\.webp|thumbnail\/.+)\?authSig=|authSig=.*review_thumbnail/.test(i.src) || /review_thumbnail\.webp\?authSig=/.test(i.src)).length };
}, null, { max: 12000, quiet: 1200 });
const clickMi = (prefix, i = 0) => page.evaluate(([p, i]) => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = window.__pierce('[data-casora-mi^="' + p + '"]', pop.shadowRoot)[i];
  if (el) el.click();
  return !!el;
}, [prefix, i]);
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };
const tileAt = () => page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r273').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const clipSrc = (want) => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('casora-frigate-clip', pop.shadowRoot)[0];
  const n = el && el.shadowRoot.querySelector('.frig-noclip');
  return el ? { src: el.getAttribute('data-src'), noclip: n ? getComputedStyle(n).display !== 'none' : null } : null;
}, null, { max: 30000, quiet: 1500, until: (v) => v && v.src !== 'lädt' });

let t = await tile();
await check('Kachel: „2 neue Alarme“ (ungesehene Alarme)', t && t.text === '2 neue Alarme' && !t.dot, t);
const at = await tileAt();
await page.mouse.click(at.x, at.y);
let p = await popText();
await check('Popup: Kopf, Aufnahmen, Objekte, Einstellungen', p && /2 neue Alarme/.test(p.txt) && /Aufnahmen/.test(p.txt) && /Einstellungen/.test(p.txt)
  && /Objekte/.test(p.txt) && /Letzte Erkennungen/.test(p.txt), p && p.txt);
await check('Hauptschalter im Kopf heißt „Objekterkennung“', p && p.hs === 'Objekterkennung', p && p.hs);
await check('Chips: eine Reihe Alle · Alarme · Erkennungen · Neu 2 (wie Kachel/Kopf), Filter zu', p && ['Alle', 'Alarme', 'Erkennungen']
  .every((x) => p.chips.includes(x)) && p.chips.some((x) => /^Neu\s*2$/.test(x)) && !p.chips.includes('Heute'), p && p.chips);
await clickMi('frigate-fx:' + ID);
await page.waitForTimeout(600);
p = await popText();
await check('Filter aufgeklappt: Zeitraum, Favoriten, Objekte, Zonen, Gesichter', p && ['7 Tage', 'Heute', 'Nur Favoriten', 'Einfahrt', 'Garten', 'Unbekannt']
  .every((x) => p.chips.includes(x)), p && p.chips);
await check('Reviews mit signierten Vorschaubildern (review_thumbnail.webp)', p && p.rv >= 6 && p.thumbs >= 6, p && { rv: p.rv, thumbs: p.thumbs });
await check('Aufnahmen: drei Tage', p && p.rec >= 3, p && p.rec);
await clickMi('frigate-f:' + ID + '|kind|alert');
await page.waitForTimeout(800);
p = await popText();
await check('Chip „Alarme“: nur Alarme (Person/Auto in der Einfahrt)', p && p.rv === 4, p && p.rv);
await clickMi('frigate-f:' + ID + '|zone|einfahrt');
await page.waitForTimeout(800);
p = await popText();
await check('Zonen-Filter sichtbar: „1 Filter aktiv · Zurücksetzen“, Pille „Filter · 1“', p && /1 Filter aktiv/.test(p.txt) && /Filter · 1/.test(p.txt) && /Zurücksetzen/.test(p.txt), p && p.txt.slice(0, 400));
await closePop();
await page.mouse.click(at.x, at.y);
p = await popText();
await check('Wieder geöffnet: Filter zurück auf „Alle“ (kein hängender Filter)', p && !/Filter aktiv/.test(p.txt) && p.rv >= 6, p && { rv: p.rv });
// Review öffnen: gesehen, Clip (Review-Zeitraum über HLS, strenger Mock), Favorit
await clickMi('frigate-rv:');
let cs = await clipSrc();
await check('Detail: Clip = Review-Zeitraum über HLS (Unter-Liste signiert, strenger Mock)', cs && cs.src === 'hls', cs);
const hlsUrl = await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const pl = window.__pierce('ha-hls-player', pop.shadowRoot)[0];
  return pl ? String(pl.url || '') : null;
});
await check('Player bekommt die pfadgenau signierte Unter-Liste (index.m3u8?authSig=…)', /\/vod\/testhof\/start\/\d+\/end\/\d+\/index\.m3u8\?authSig=/.test(hlsUrl || ''), hlsUrl);
const fav = await page.evaluate(async () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const b = window.__pierce('casora-frigate-clip', pop.shadowRoot)[0].shadowRoot.querySelector('.fv');
  b.click();
  for (let i = 0; i < 30 && b.getAttribute('aria-pressed') !== 'true'; i++) await new Promise((r) => setTimeout(r, 100));
  const ha = document.querySelector('home-assistant');
  const raw = await ha.hass.callWS({ type: 'frigate/events/get', instance_id: 'frigate', cameras: ['testhof'], favorites: true, limit: 50 });
  return { pressed: b.getAttribute('aria-pressed'), favs: JSON.parse(raw).length };
});
await check('„Favorit“: gedrückt, Frigate merkt es (favorites)', fav.pressed === 'true' && fav.favs === 2, fav);
await closePop();
t = await tile();
await check('Geöffneter Alarm gilt als gesehen: Kachel „1 neuer Alarm“', t && t.text === '1 neuer Alarm', t);
// Clip-Rückfall
await svc('frigate_proxy', { vod: false });
await page.mouse.click(at.x, at.y);
await popText();
await clickMi('frigate-rv:', 1);
cs = await clipSrc();
await check('Ohne HLS: Clip des Ereignisses als MP4 (Notification-Proxy)', cs && cs.src === 'mp4', cs);
await closePop();
await svc('frigate_proxy', { notifications: false });
await page.mouse.click(at.x, at.y);
await popText();
await clickMi('frigate-rv:', 2);
cs = await clipSrc();
await check('Auch ohne HLS: „Kein Clip vorhanden“', cs && cs.src === 'none' && cs.noclip === true, cs);
await closePop();
await svc('frigate_proxy', { notifications: true, vod: true });
// Aufnahmen
await page.mouse.click(at.x, at.y);
await popText();
// Gestern 10 Uhr: ganze Stunde (heute endet die letzte Stunde jetzt).
await page.evaluate((id) => { const d = new Date(Date.now() - 86400000); const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  window._casoraMiHooks.some((f) => f('frigate-rec:' + id + '|' + day + '|10')); }, ID);
const rec = await stable(page, () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('casora-frigate-rec', pop.shadowRoot)[0];
  return el ? { src: el.getAttribute('data-src'), t: Number(el.getAttribute('data-t')), segs: el.shadowRoot.querySelectorAll('.sg').length,
    dots: el.shadowRoot.querySelectorAll('.dt').length, hours: window.__pierce('[data-casora-mi^="frigate-rec:"]', pop.shadowRoot).length } : null;
}, null, { max: 30000, quiet: 1500, until: (v) => v && v.src && v.src !== 'lädt' });
await check('Aufnahmen: Wiedergabe über HLS, Zeitleiste mit Abschnitten, Tage und Stunden als Chips', rec && rec.src === 'hls' && rec.segs >= 1 && rec.hours >= 4, rec);
const jump = await page.evaluate(async () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = window.__pierce('casora-frigate-rec', pop.shadowRoot)[0];
  const tl = el.shadowRoot.querySelector('.tl'), r = tl.getBoundingClientRect();
  const t0 = Number(el.getAttribute('data-t'));
  const o = { bubbles: true, composed: true, pointerId: 1, clientX: r.left + r.width * 0.75, clientY: r.top + r.height / 2 };
  tl.dispatchEvent(new PointerEvent('pointerdown', o)); tl.dispatchEvent(new PointerEvent('pointerup', o));
  await new Promise((res) => setTimeout(res, 300));
  const t1 = Number(el.getAttribute('data-t'));
  tl.focus(); tl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, composed: true }));
  await new Promise((res) => setTimeout(res, 600));
  const t2 = Number(el.getAttribute('data-t'));
  return { t0, t1, t2, h: Math.round(r.height), a: Number(tl.getAttribute('aria-valuemin')) };
});
await check('Zeitleiste: Antippen springt (¾ der Stunde), Pfeil → +10 s, 44 px hoch', jump.h >= 44 && Math.abs(jump.t1 - (jump.a + 2700)) <= 2 && jump.t2 - jump.t1 === 10, jump);
// Ausschnitt „ab hier 1 Min.“: Datei mit lesbarem Namen.
const dlP = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = window.__pierce('casora-frigate-rec', pop.shadowRoot)[0];
  el.shadowRoot.querySelector('.dl').click();
  el.shadowRoot.querySelector('.cut [data-min="1"]').click();
});
const dl = await dlP;
await check('Ausschnitt ab hier (1 Min.): Datei „<Kamera> JJJJ-MM-TT HH-MM.mp4“', dl && /^.+ \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.mp4$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
await closePop();
// MP4-Rückfall (ohne HLS): spielt, aber springen geht nicht – die Leiste sagt es.
await svc('frigate_proxy', { vod: false });
await page.mouse.click(at.x, at.y);
await popText();
await page.evaluate((id) => { const d = new Date(Date.now() - 86400000); const day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  window._casoraMiHooks.some((f) => f('frigate-rec:' + id + '|' + day + '|11')); }, ID);
const mp4 = await stable(page, () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('casora-frigate-rec', pop.shadowRoot)[0];
  return el ? { src: el.getAttribute('data-src'), off: el.shadowRoot.querySelector('.tl').classList.contains('off'), txt: el.shadowRoot.querySelector('.now').textContent } : null;
}, null, { max: 30000, quiet: 1500, until: (v) => v && v.src && v.src !== 'lädt' });
await check('Ohne HLS: MP4-Rückfall, Zeitleiste aus, „Springen nicht möglich“', mp4 && mp4.src === 'mp4' && mp4.off && /Springen nicht möglich/.test(mp4.txt), mp4);
await closePop();
await svc('frigate_proxy', { vod: true });
// Halten „Letzte Erkennung“: die Review, mit Weg zurück, Tippen ins Leere schließt nicht.
const lat = await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const it = window._casoraFrigate.hold(ha.hass, id).find((x) => x.t === 'Letzte Erkennung');
  if (!it) return null;
  it.fn();
  for (let i = 0; i < 60; i++) {
    const cur = window.casoraPopup.current;
    if (cur && cur._frigView === 'detail') return { view: cur._frigView, back: typeof cur.back === 'function', bg: cur.dismiss_on_background, rv: !!(cur.content && JSON.stringify(cur.content).includes('"rv":"')) };
    await new Promise((r) => setTimeout(r, 100));
  }
  return { view: (window.casoraPopup.current || {})._frigView || null };
}, ID);
await check('Halten „Letzte Erkennung“: Review-Detail mit Zurück, Tippen ins Leere schließt nicht', lat && lat.view === 'detail' && lat.back && lat.bg === false && lat.rv, lat);
await closePop();
// Ältere Frigate-Version ohne Reviews
await svc('frigate_proxy', { reviews: false });
await page.evaluate((id) => window._casoraFrigate.forget(id), ID);
await page.mouse.click(at.x, at.y);
p = await popText();
await check('Ohne Reviews: Ereignisliste wie bisher, ohne Fehler und ohne Alarm-Chips', p && p.ev >= 6 && p.rv === 0 && !p.chips.includes('Alarme') && !/antwortet nicht/.test(p.txt), p && { ev: p.ev, rv: p.rv, chips: p.chips });
await closePop();
await svc('frigate_proxy', { reviews: true });
await page.evaluate((id) => window._casoraFrigate.forget(id), ID);
// Live auf der Kachel
await svc('frigate_proxy', { stream: true });
await page.waitForTimeout(800);
await addTile('qa-r273-live', { live_tile: true }, 540);
const dbg = () => page.evaluate(() => window._casoraFrigate._dbg());
let d = await stable(page, () => window._casoraFrigate._dbg(), null, { max: 6000, quiet: 800, until: (v) => v.live === 1 });
await check('Live auf der Kachel: sichtbar + Stream → HAs ha-camera-stream eingebaut', d.live === 1, d);
await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r273-live'); el.style.top = '-3000px'; });
d = await stable(page, () => window._casoraFrigate._dbg(), null, { max: 6000, quiet: 800, until: (v) => v.live === 0 });
await check('Aus dem Bild gescrollt: Live-Bild abgebaut', d.live === 0, d);
await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r273-live'); el.style.top = '540px'; });
d = await stable(page, () => window._casoraFrigate._dbg(), null, { max: 6000, quiet: 800, until: (v) => v.live === 1 });
await check('Wieder sichtbar: wieder eingebaut', d.live === 1, d);
await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r273-live'); clearInterval(el._qaT); el.remove(); });
d = await stable(page, () => window._casoraFrigate._dbg(), null, { max: 8000, quiet: 800, until: (v) => v.tiles === 1 });
await check('Kachel entfernt: aufgeräumt (kein Live-Bild, nur die andere Kachel)', d.live === 0 && d.tiles === 1, d);
await svc('frigate_proxy', { stream: false });
// Neue Erkennung, Abo
await page.mouse.click(at.x, at.y);
await popText();
d = await dbg();
await check('Popup offen: Abo frigate/reviews/subscribe', d.subs.includes('frigate') && d.subKind.includes('reviews'), d);
await svc('frigate_erkennung', { label: 'person', dauer: 8 });
p = await stable(page, () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  return pop ? window.__pierce('[data-casora-mi^="frigate-rv:"]', pop.shadowRoot).slice(0, 1).map((r) => r.textContent.replace(/\s+/g, ' ')).join('') : null;
}, null, { max: 6000, quiet: 800, until: (v) => /Live/.test(v || '') });
await check('Neue Erkennung: offenes Popup zeigt sie über das Abo oben mit „Live“', /Person/.test(p || '') && /Live/.test(p || ''), p);
await closePop();
t = await tile();
await check('Neue Erkennung: Kachel „Person erkannt“ mit rotem Punkt', t && t.text === 'Person erkannt' && t.dot, t);
await page.waitForTimeout(8000);
await svc('frigate_proxy', { zuruecksetzen: true });
await finish();
