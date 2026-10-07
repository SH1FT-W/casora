// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026): Im Licht-Popup flackerte beim Einschalten eines ganzen Raums die Leiste
// mit den Räumen (Alle, Raum 1, Raum 2 …). Jede Zustandsänderung zeichnete die Leiste neu und
// blendete sie dabei für ein Bild aus. Erwartet (Desktop 1600×1000, Casora-Look): während mehrere
// Lichter kurz nacheinander angehen, bleibt die Leiste in jedem Bild sichtbar, sie wird nicht ersetzt,
// Scrollposition und Hervorhebung bleiben stehen. Andere Größe: R73_W=390 R73_H=844 (Handy, Touch).
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const W = Number(process.env.R73_W || 1600), Hh = Number(process.env.R73_H || 1000);
const dash = await casoraDashboard((d) => /casora_badge_light_group|light_group_entity/.test(JSON.stringify((d.config.views || [])[0] || {})));
await need('Casora-Dashboard mit Beleuchtungs-Badge auf der Startseite', dash);
const { page } = await open({ width: W, height: Hh, dark: false, theme: 'Casora', mobile: W < 700 });
const home = dash.config.views[0];
await dashboard(page, dash.url + '/' + (home.path || '0'), 3);
const lights = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => id.startsWith('light.')));
await fakeStates(page, Object.fromEntries(lights.map((id) => [id, { state: 'off' }])), { sticky: true });
await page.waitForTimeout(600);
const at = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group')
    && x.getBoundingClientRect().width > 0);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Beleuchtungs-Badge sichtbar', at);
await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
await page.waitForTimeout(2500);

// Raumleiste finden und einen Raum mit mehreren Lichtern wählen.
const info = await page.evaluate(() => {
  const row = window.__pierce('button-card').find((x) => x.shadowRoot && x.shadowRoot.querySelector('#pill_all')
    && x.getBoundingClientRect().width > 0);
  if (!row) return null;
  const st = document.querySelector('home-assistant').hass.states;
  const gid = row._config.entity;
  const rooms = (st[gid].attributes.entity_id || []);
  const exp = (id, seen = new Set()) => { if (seen.has(id) || !st[id]) return []; seen.add(id);
    const m = st[id].attributes.entity_id; return Array.isArray(m) ? m.flatMap((x) => exp(x, seen)) : [id]; };
  const room = rooms.map((r) => ({ r, l: exp(r) })).sort((a, b) => b.l.length - a.l.length)[0];
  window.__qaRow = row;
  const c = row.shadowRoot.querySelector('#container');
  if (c) c.scrollLeft = 40;
  return { gid, room: room && room.r, lights: room ? room.l : [], scroll: c ? c.scrollLeft : 0 };
});
await need('Haus-Licht-Popup mit Raumleiste', info && info.lights.length > 1, info);

// Jedes Bild abtasten: sichtbar? dieselbe Karte? Scrollposition, Hervorhebung von „Alle“.
await page.evaluate(() => {
  const row = window.__qaRow;
  const s = window.__qaS = { frames: 0, hidden: 0, replaced: 0, scroll: new Set(), sel: new Set(), on: true };
  const card0 = row.shadowRoot.querySelector('ha-card');
  const tick = () => {
    if (!s.on) return;
    const now = window.__pierce('button-card').find((x) => x.shadowRoot && x.shadowRoot.querySelector('#pill_all') && x.isConnected);
    const card = now && now.shadowRoot.querySelector('ha-card');
    s.frames++;
    if (now !== row || card !== card0) s.replaced++;
    if (!card || getComputedStyle(card).visibility !== 'visible') s.hidden++;
    const c = now && now.shadowRoot.querySelector('#container');
    if (c) s.scroll.add(Math.round(c.scrollLeft));
    const a = now && now.shadowRoot.querySelector('#pill_all');
    if (a) s.sel.add(a.style.getPropertyValue('--hp-bg'));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
// Raum geht an: die Lichter melden sich kurz nacheinander, dann der Raum und das Haus.
for (const id of info.lights) {
  await fakeStates(page, { [id]: { state: 'on', attributes: { brightness: 200 } } });
  await page.waitForTimeout(70);
}
await fakeStates(page, { [info.room]: { state: 'on' }, [info.gid]: { state: 'on' } });
await page.waitForTimeout(1200);
const s = await page.evaluate(() => { const s = window.__qaS; s.on = false;
  return { frames: s.frames, hidden: s.hidden, replaced: s.replaced, scroll: [...s.scroll], sel: [...s.sel] }; });
await check('Raumleiste in keinem Bild ausgeblendet', s.frames > 20 && s.hidden === 0, s);
await check('Raumleiste wird nicht ersetzt', s.replaced === 0, s);
await check('Scrollposition und Hervorhebung bleiben', s.scroll.length === 1 && s.sel.length === 1, s);
await finish();
