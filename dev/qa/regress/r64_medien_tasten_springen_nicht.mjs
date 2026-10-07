// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026, Nutzertests Handy und Tablet): Im Medien-Popup rutschten Zurück/Pause/
// Lautstärke nach „Play“ um ~50 px nach unten (der Fortschrittsbalken kam erst mit Titel und Dauer
// dazu) – der nächste Tipp ging daneben. Am iPad quer (1024×768) lag die Lautstärke beim Abspielen
// zudem unter dem Rand. Erwartet im Casora-Look (hell): der Wiedergabe-Knopf steht vor und nach dem
// Start an derselben Stelle (Handy 390×844 und Tablet 1024×768); am Tablet sind Tasten und
// Lautstärke ohne Scrollen ganz zu sehen. Zustände nur im Browser (fakeStates), am HA spielt nichts.
import { open, usePage, dashboard, casoraDashboards, fakeStates, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const isMedia = (t) => [].concat(t || []).includes('casora_media');
const VIEWS = [['Tablet', { width: 1024, height: 768, safari: true, touch: true, dark: false, theme: 'Casora' }, false],
  ['Handy', { width: 390, height: 844, mobile: true, safari: true, dark: false, theme: 'Casora' }, true]];
for (const [name, opts, mobile] of VIEWS) {
  // Ansicht mit einer Medien-Kachel (casora_media) – nicht nur die Vorlagen-Sammlung des Dashboards.
  const hasTile = (v) => /"template":"casora_media"|"template":\["casora_media"/.test(JSON.stringify(v));
  const d = all.find((x) => x.mobile === mobile && (x.config.views || []).some(hasTile));
  if (!d) { await check(`${name}: Dashboard mit Medien-Kachel`, false); continue; }
  const { page } = await open(opts);
  usePage(page);
  const views = d.config.views.map((v, i) => [v, v.path || String(i)]);
  const mv = views.find(([v]) => hasTile(v)) || views[0];
  await dashboard(page, d.url + '/' + mv[1], 3);
  if (mobile) await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'media' } })));
  await page.waitForTimeout(2000);
  // Kachel eines Players mit Abspielen/Pause; im Browser auf „inaktiv, ohne Titel“ setzen.
  const ent = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_media')
      && x.getBoundingClientRect().width > 50 && /^media_player\./.test(x._config.entity || '') && h.states[x._config.entity]);
    return b ? b._config.entity : null;
  });
  if (!ent) { await check(`${name}: Medien-Kachel mit Wiedergabe`, false); continue; }
  const base = { volume_level: 0.4, supported_features: 448439, media_title: null, media_artist: null, media_duration: null, media_position: null, entity_picture: null };
  await fakeStates(page, { [ent]: { state: 'idle', attributes: base } }, { sticky: true });
  const pos = await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id && x.getBoundingClientRect().width > 50);
    b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, ent);
  await page.waitForTimeout(800);
  if (mobile) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(2500);
  const m = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const one = (q) => { const e = window.__pierce(q, s).find((x) => x.getBoundingClientRect().width > 0); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
    return { play: one('.hm-b.lg'), vol: one('.hm-vol'), h: innerHeight }; });
  const vor = await m();
  if (!vor || !vor.play) { await check(`${name}: Medien-Popup mit Wiedergabe-Knopf`, false, vor); continue; }
  await fakeStates(page, { [ent]: { state: 'playing', attributes: { ...base, media_title: 'Beispiel-Titel', media_artist: 'Beispiel', media_duration: 200, media_position: 20, media_position_updated_at: new Date().toISOString() } } }, { sticky: true });
  await page.waitForTimeout(1500);
  const nach = await m();
  await check(`${name}: Wiedergabe-Knopf bleibt nach dem Start an seiner Stelle`, nach && nach.play && Math.abs(nach.play.top - vor.play.top) <= 2, { vor: vor.play, nach: nach && nach.play });
  if (!mobile) await check(`${name}: Tasten und Lautstärke beim Abspielen ohne Scrollen sichtbar`, nach && nach.vol && nach.vol.bottom <= nach.h, nach);
}
await finish();
