// @zustand: arbeit
// @parallel: ui
// Bug #111 (26.11.5, iPhone, HomePod idle „Bereit“): the media popup's record without artwork showed its music-note
// placeholder off-centre on the round label (pushed up onto the spindle hole, looked half outside the label).
// Expected: the note sits exactly in the middle of the label (within 1 px), on the phone (WebKit) and on the desktop
// (Chromium), and no spindle hole is drawn over it. With artwork the hole stays.
import { open, usePage, dashboard, casoraDashboards, fakeStates, check, need, finish, shot } from './lib.mjs';

const all = await casoraDashboards();
const hasTile = (v) => /"template":"casora_media"|"template":\["casora_media"/.test(JSON.stringify(v));
const cover = (pg) => pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 90; c.height = 90; const x = c.getContext('2d');
  x.fillStyle = '#e76f51'; x.fillRect(0, 0, 90, 90); return c.toDataURL('image/png'); });

for (const phone of [true, false]) {
  const look = phone ? 'Handy' : 'Desktop';
  const d = all.find((x) => !!x.mobile === phone && (x.config.views || []).some(hasTile));
  await need(look + '-Dashboard mit Medien-Kachel', d, all.map((x) => x.url));
  const { page } = await open(phone ? { width: 390, height: 844, mobile: true, safari: true, theme: 'Casora' } : { width: 1440, height: 900, theme: 'Casora' });
  usePage(page);
  const views = d.config.views.map((v, i) => [v, v.path || String(i)]);
  const mv = views.find(([v]) => hasTile(v)) || views[0];
  await dashboard(page, d.url + '/' + mv[1], 3);
  if (phone) { await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'media' } }))); await page.waitForTimeout(1500); }
  const ent = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_media')
      && x.getBoundingClientRect().width > 50 && /^media_player\./.test(x._config.entity || '') && h.states[x._config.entity]);
    return b ? b._config.entity : null;
  });
  await need(look + ': Medien-Kachel', ent, ent);
  // A HomePod at rest: idle, nothing playing, no artwork.
  const idle = { volume_level: 0.6, supported_features: 448439, device_class: 'speaker', entity_picture: null, entity_picture_local: null,
    media_title: null, media_artist: null, media_content_type: null, app_name: null, media_duration: null, media_position: null };
  await fakeStates(page, { [ent]: { state: 'idle', attributes: idle } }, { sticky: true });
  const pos = await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id && x.getBoundingClientRect().width > 50);
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, ent);
  await page.waitForTimeout(800);
  if (phone) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return s && window.__pierce('.hui-dl-lbl', s).some((x) => x.getBoundingClientRect().width > 0); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const measure = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const l = window.__pierce('.hui-dl-lbl', s).find((x) => x.getBoundingClientRect().width > 0); if (!l) return null;
    const c = l.closest('.hui-dl-cover'), ic = l.querySelector('ha-icon'), img = l.querySelector('img');
    // The drawn glyph box: the svg inside ha-icon (falls back to ha-icon itself).
    const svg = ic && window.__pierce('svg', ic)[0];
    const mid = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height });
    return { lbl: mid(l.getBoundingClientRect()), icon: ic ? mid(ic.getBoundingClientRect()) : null, svg: svg ? mid(svg.getBoundingClientRect()) : null,
      img: !!img, hole: getComputedStyle(c, '::after').display };
  });
  const m = await measure();
  await shot(look + ' ohne Cover');
  await need(look + ': Schallplatte mit Etikett und Note', m && m.icon, m);
  const g = m.svg && m.svg.w > 0 ? m.svg : m.icon;
  await check(look + ': Note waagrecht in der Mitte des Etiketts (±1 px)', Math.abs(g.x - m.lbl.x) <= 1, m);
  await check(look + ': Note senkrecht in der Mitte des Etiketts (±1 px)', Math.abs(g.y - m.lbl.y) <= 1, m);
  await check(look + ': Note ganz im Etikett', g.w > 4 && g.w < m.lbl.w * 0.6 && g.h < m.lbl.h * 0.6, m);
  await check(look + ': kein Mittelloch über der Note', m.hole === 'none', m);
  // With artwork the record keeps its spindle hole.
  const pic = await cover(page);
  await fakeStates(page, { [ent]: { state: 'playing', attributes: { ...idle, entity_picture: pic, media_content_type: 'music', media_title: 'Titel', media_artist: 'Künstler' } } }, { sticky: true });
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return s && window.__pierce('.hui-dl-lbl img', s).length > 0; }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  const a = await measure();
  await check(look + ': mit Cover bleibt das Mittelloch', a && a.img && a.hole !== 'none', a);
}
await finish();
