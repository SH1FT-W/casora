// @zustand: arbeit
// @parallel: ui
// Owner wish (01.11.2026, phone, Apple TV playing a series in Prime Video): the media wheel showed a record with a
// small round cover even for a film. Expected (Casora look, phone 390, light and dark): video (series, film, TV app)
// → the cover fills the whole disc (same size as the record), no grooves, not turning; music → the turning record.
import { open, usePage, dashboard, casoraDashboards, fakeStates, check, need, finish, shot } from './lib.mjs';

const all = await casoraDashboards();
const hasTile = (v) => /"template":"casora_media"|"template":\["casora_media"/.test(JSON.stringify(v));
const d = all.find((x) => x.mobile && (x.config.views || []).some(hasTile));
await need('Handy-Dashboard mit Medien-Kachel', d, all.map((x) => x.url));
const cover = (pg) => pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 160, 90); g.addColorStop(0, '#1d3557'); g.addColorStop(1, '#e76f51'); x.fillStyle = g; x.fillRect(0, 0, 160, 90);
  x.fillStyle = '#f1faee'; x.fillRect(70, 30, 20, 30); return c.toDataURL('image/png'); });
for (const dark of [false, true]) {
  const look = dark ? 'dunkel' : 'hell';
  const { page } = await open({ width: 390, height: 844, mobile: true, safari: true, dark, theme: 'Casora' });
  usePage(page);
  const views = d.config.views.map((v, i) => [v, v.path || String(i)]);
  const mv = views.find(([v]) => hasTile(v)) || views[0];
  await dashboard(page, d.url + '/' + mv[1], 3);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'media' } })));
  await page.waitForTimeout(1500);
  const ent = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_media')
      && x.getBoundingClientRect().width > 50 && /^media_player\./.test(x._config.entity || '') && h.states[x._config.entity]);
    return b ? b._config.entity : null;
  });
  await need(look + ': Medien-Kachel', ent, ent);
  const pic = await cover(page);
  const base = { volume_level: 0.35, supported_features: 448439, entity_picture: pic, entity_picture_local: null, media_duration: 3000, media_position: 600,
    media_position_updated_at: new Date().toISOString() };
  const video = { ...base, media_content_type: 'tvshow', app_name: 'Prime Video', media_title: 'Beispiel-Serie', media_series_title: 'Beispiel' };
  const music = { ...base, media_content_type: 'music', app_name: 'Music', device_class: 'speaker', media_title: 'Beispiel-Titel', media_artist: 'Beispiel' };
  await fakeStates(page, { [ent]: { state: 'playing', attributes: video } }, { sticky: true });
  const pos = await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id && x.getBoundingClientRect().width > 50);
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, ent);
  await page.waitForTimeout(800);
  await page.touchscreen.tap(pos.x, pos.y);
  const disc = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const c = window.__pierce('.hui-dl-cover', s).find((x) => x.getBoundingClientRect().width > 0); if (!c) return null;
    const r = c.getBoundingClientRect(), img = c.querySelector('img'), ir = img && img.getBoundingClientRect();
    return { cls: c.className, w: Math.round(r.width), h: Math.round(r.height), anim: getComputedStyle(c).animationName,
      grooves: getComputedStyle(c, '::before').display, label: !!c.querySelector('.hui-dl-lbl'), imgW: ir ? Math.round(ir.width) : 0,
      fit: img ? getComputedStyle(img).objectFit : '', round: getComputedStyle(c).borderRadius }; });
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return s && window.__pierce('.hui-dl-cover', s).some((x) => x.getBoundingClientRect().width > 0); }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const v = await disc();
  await shot('Handy ' + look + ' Video');
  await need(look + ': Medien-Rad mit Cover', v, v);
  await check(look + ': Video → Cover füllt die Scheibe', /\bvideo\b/.test(v.cls) && !v.label && Math.abs(v.imgW - v.w) <= 1 && v.fit === 'cover', v);
  await check(look + ': Video → keine Rillen, dreht nicht', v.grooves === 'none' && (v.anim === 'none' || !v.anim), v);
  await fakeStates(page, { [ent]: { state: 'playing', attributes: music } }, { sticky: true });
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return s && window.__pierce('.hui-dl-cover.spin', s).length > 0; }, null, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  const m = await disc();
  await shot('Handy ' + look + ' Musik');
  await check(look + ': Musik → Schallplatte, dreht', m && /\bspin\b/.test(m.cls) && m.label && m.grooves !== 'none' && m.round === v.round, { m, v });
}
await finish();
