// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026): Im Licht-Popup flackerte beim Einschalten eines ganzen Raums die Leiste
// mit den Räumen (Alle, Raum 1, Raum 2 …). Jede Zustandsänderung zeichnete die Leiste neu und
// blendete sie dabei für ein Bild aus. Erwartet (Desktop 1600×1000, Casora-Look): während mehrere
// Lichter kurz nacheinander angehen, bleibt die Leiste in jedem Bild sichtbar, sie wird nicht ersetzt,
// Scrollposition und Hervorhebung bleiben stehen. Andere Größe: R73_W=390 R73_H=844 (Handy, Touch).
// v3 (01.11.2026): the room bar (pills) is gone; the rooms are the list „Räume“ on the right (.lps-rows). The same
// promise holds for it: while a room's lights come on one by one, the list stays visible in every frame, is not
// replaced (same card), does not move (same place and height in every frame), keeps its rows and the popup's
// scroll position. The list element itself is rebuilt with each state change in v3 (the light body is one
// button-card field); that is logged as info – what users saw (a frame without the list, a jump) is checked.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const W = Number(process.env.R73_W || 1600), Hh = Number(process.env.R73_H || 1000);
// Home's light badge: the house group, or (setup since 26.11.9 when the house group holds more than the rooms) the rooms.
const dash = await casoraDashboard((d) => /casora_badge_light_group|light_group_entity|light_rooms_auto/.test(JSON.stringify((d.config.views || [])[0] || {})));
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

// Room list of the house light popup; a room with several lights.
const info = await page.evaluate(() => {
  const row = window.__pierce('button-card').find((x) => x.shadowRoot && x.shadowRoot.querySelector('.lps-rows')
    && x.getBoundingClientRect().width > 0);
  if (!row) return null;
  const st = document.querySelector('home-assistant').hass.states;
  const gid = row._config.entity;
  // Since 26.10.63 a badge with picked rooms shows those (#80): the card's entity is then a room, not the house group –
  // any room group of the house serves (the list must stay while its lights come on).
  const mem0 = (st[gid] && st[gid].attributes.entity_id) || [];
  const rooms = mem0.some((x) => Array.isArray(st[x] && st[x].attributes.entity_id)) ? mem0
    : Object.keys(st).filter((x) => x.startsWith('light.') && Array.isArray(st[x].attributes.entity_id));
  const exp = (id, seen = new Set()) => { if (seen.has(id) || !st[id]) return []; seen.add(id);
    const m = st[id].attributes.entity_id; return Array.isArray(m) ? m.flatMap((x) => exp(x, seen)) : [id]; };
  const room = rooms.map((r) => ({ r, l: exp(r) })).sort((a, b) => b.l.length - a.l.length)[0];
  window.__qaRow = row;
  const sc = window.__pierce('.content', window.__pierce('casora-popup')[0].shadowRoot)[0] || null;
  window.__qaSc = sc;
  return { gid, room: room && room.r, lights: room ? room.l : [], rows: row.shadowRoot.querySelectorAll('.lps-row').length };
});
await need('Haus-Licht-Popup mit Raumliste', info && info.lights.length > 1 && info.rows > 1, info);

// Sample every frame: visible? same card and list? row count, popup scroll position.
await page.evaluate(() => {
  const row = window.__qaRow;
  const s = window.__qaS = { frames: 0, hidden: 0, replaced: 0, scroll: new Set(), sel: new Set(), box: new Set(), on: true };
  const card0 = row.shadowRoot.querySelector('ha-card');
  const list0 = row.shadowRoot.querySelector('.lps-rows');
  const tick = () => {
    if (!s.on) return;
    const now = window.__pierce('button-card').find((x) => x.shadowRoot && x.shadowRoot.querySelector('.lps-rows') && x.isConnected && x.getBoundingClientRect().width > 0);
    const card = now && now.shadowRoot.querySelector('ha-card');
    const list = now && now.shadowRoot.querySelector('.lps-rows');
    s.frames++;
    if (now !== row || card !== card0) s.replaced++;
    if (list !== list0) s.rebuilt = (s.rebuilt || 0) + 1;
    if (list) { const q = list.getBoundingClientRect(); s.box.add(Math.round(q.top) + '/' + Math.round(q.height)); }
    if (!card || getComputedStyle(card).visibility !== 'visible' || !list || list.getBoundingClientRect().height < 20) s.hidden++;
    if (window.__qaSc) s.scroll.add(Math.round(window.__qaSc.scrollTop));
    if (list) s.sel.add(list.querySelectorAll('.lps-row').length);
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
  return { rebuilt: s.rebuilt || 0, box: [...s.box], frames: s.frames, hidden: s.hidden, replaced: s.replaced, scroll: [...s.scroll], sel: [...s.sel] }; });
await check('Raumliste in keinem Bild ausgeblendet', s.frames > 20 && s.hidden === 0, s);
console.log('  info   Raumliste neu aufgebaut in ' + (s.rebuilt || 0) + ' von ' + s.frames + ' Bildern (ohne sichtbare Lücke)');
await check('Raumliste wird nicht ersetzt (dieselbe Karte) und springt nicht (Lage und Höhe gleich)', s.replaced === 0 && s.box.length === 1, s);
await check('Scrollposition und Zeilenzahl bleiben', s.scroll.length === 1 && s.sel.length === 1, s);
await finish();
