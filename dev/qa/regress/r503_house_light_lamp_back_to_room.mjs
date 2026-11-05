// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/casora-core.js
// Issue #118: house light popup (ZUHAUSE · Beleuchtung) → a room („Ankleide“, its own sub page with ‹) → tap a lamp row
// (not its switch) → the lamp's page. ‹ from there landed on the house's room list instead of the room's page.
// Expected: ‹ goes back one level – lamp page → room page (label = the room, title „Beleuchtung“ since 03.11.2026,
// „Lampen im Raum“) → ‹ → the house's list.
// Not reproduced on the test HA (26.11.7 candidate, rooms with several lamps and with one): kept as a guard for the
// back path. Since 05.11.2026 (issue 126) the lamp's page lists no lamps of its room. Phone 393×852 and desktop 1440×900. Nothing is switched or saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

// test-neu first (as r495): its house light badge covers every room; the gate's qa-arbeit keeps a fixed lamp list.
const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with a phone layout', dash && dash.phone, dash && dash.url);
const shots = process.env.R503_SHOTS;

for (const [label, size, url] of [
  ['phone', { width: 393, height: 852, mobile: true, safari: true }, dash.phone && dash.phone.url + '/home'],
  ['desktop', { width: 1440, height: 900 }, dash.url],
]) {
  const ph = await open({ ...size, dark: false, theme: 'Casora' });
  const pg = ph.page; usePage(pg);
  await dashboard(pg, url, 2);
  await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
  await pg.waitForTimeout(1500);

  const tap = async (p) => { if (size.mobile) await pg.touchscreen.tap(p.x, p.y); else await pg.mouse.click(p.x, p.y); };
  const head = () => pg.evaluate(() => {
    const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
    const vis = (x) => x && x.getBoundingClientRect().width > 0;
    const lbl = window.__pierce('.lps-lbl', e.shadowRoot).filter(vis).map((x) => x.textContent.trim());
    const rooms = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis)
      .filter((r) => /"a":"room"/.test(r.getAttribute('data-lps-tap'))).length;
    const b = e._headerBack && !e._headerBack.hidden ? e._headerBack.getBoundingClientRect() : null;
    return { title: e._headerTitle ? e._headerTitle.textContent.replace(/​/g, '').trim() : null,
      eyebrow: e._headerEyebrow ? e._headerEyebrow.textContent.trim() : '', back: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null,
      lbl, rooms, sel: window.__pierce('.lps-row.sel', e.shadowRoot).filter(vis).length };
  });
  const until = async (fn) => { let h = null; for (let i = 0; i < 25; i++) { await pg.waitForTimeout(250); h = await head(); if (h && fn(h)) break; } await pg.waitForTimeout(400); return head(); };
  // A visible row of the open popup (kind „room“ or „mi“).
  const row = (kind) => pg.evaluate((kind) => {
    const e = window.casoraPopup.element; const vis = (x) => x && x.getBoundingClientRect().width > 0;
    const R = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis).map((r) => {
      let d = null; try { d = JSON.parse(r.getAttribute('data-lps-tap')); } catch (err) { d = null; }
      return { r, d };
    }).filter((x) => x.d && x.d.a === kind);
    const h = document.querySelector('home-assistant').hass, hl = window._casoraHouseLights && window._casoraHouseLights(h);
    // A room with two lamps or more: a room of one lamp named like the room shows that lamp's page as the room's.
    const lamps = (x) => ((hl && hl.rooms || []).find((rm) => rm.name === x.d.name) || { lights: [] }).lights
      .filter((id) => h.states[id] && !Array.isArray(h.states[id].attributes.entity_id)).length;
    const it = kind === 'room' ? R.find((x) => lamps(x) >= 2) : R[0];
    if (!it) return null;
    it.r.scrollIntoView({ block: 'center' });
    const tx = it.r.querySelector('.lps-tx') || it.r; const b = tx.getBoundingClientRect();
    return { name: (it.r.querySelector('.lps-tx b') || it.r).textContent.trim(), x: b.x + Math.min(30, b.width / 3), y: b.y + b.height / 2 };
  }, kind);

  // House light popup (as r495): phone taps the badge, desktop holds it (or a house badge made in the browser).
  await pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 700)); });
  let at = await pg.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => /casora_badge_light_group\b/.test([].concat((x._config || {}).template || []).join(' ')) && x.getBoundingClientRect().width > 20);
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!at) {
    at = await pg.evaluate(async () => {
      const ha = document.querySelector('home-assistant');
      const h = await window.loadCardHelpers();
      const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_badge_light_group', entity: 'input_select.casora_expanded_row',
        variables: { enabled: true, light_rooms_auto: true } });
      el.id = 'qa-r503-badge'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:300px;top:300px;z-index:99990;';
      ha.shadowRoot.appendChild(el);
      await new Promise((r) => setTimeout(r, 1500));
      const r = el.getBoundingClientRect();
      return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    });
  }
  await need(label + ': a house light badge', at);
  if (size.mobile) await pg.touchscreen.tap(at.x, at.y);
  else { await pg.mouse.move(at.x, at.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); }
  const house = await until((h) => h.rooms > 0);
  await pg.evaluate(() => { const b = document.querySelector('home-assistant').shadowRoot.getElementById('qa-r503-badge'); if (b) b.remove(); });
  await need(label + ': house light popup lists rooms', house && house.rooms > 0, house);

  const rr = await row('room');
  await need(label + ': a room row with two lamps', rr, house);
  await pg.waitForTimeout(500);
  await tap(rr);
  // The room's page: labelled with the room (owner, 03.11.2026: one head for every light popup, r516).
  const isRoom = (h) => h && String(h.eyebrow || '').toLowerCase() === String(rr.name).toLowerCase() && h.title === 'Beleuchtung';
  const room = await until((h) => h.back && isRoom(h));
  await need(label + ': room page opened', room && room.back && isRoom(room), { rr, room });

  const lr = await row('mi');
  await need(label + ': a lamp row on the room page', lr, room);
  await pg.waitForTimeout(500);
  await tap(lr);
  // Issue 126 (owner, 05.11.2026): the lamp's page is a single-device page – no list of the room's lamps.
  const isLamp = (h) => h && h.back && h.title !== 'Beleuchtung' && h.rooms === 0 && !h.lbl.some((x) => /^Lampen/.test(x));
  const lamp = await until(isLamp);
  if (shots) await pg.screenshot({ path: `${shots}/${label}-lamp.png` });
  await need(label + ': lamp page with ‹ (no list of the room\'s lamps)', isLamp(lamp), { lr, lamp });

  await pg.waitForTimeout(500);
  await tap(lamp.back);
  const back1 = await until((h) => isRoom(h) || h.rooms > 0);
  if (shots) await pg.screenshot({ path: `${shots}/${label}-back1.png` });
  await shot(label + '_back1');
  await check(label + ': ‹ from the lamp is the room page („' + rr.name + '“, ‹, „Lampen im Raum“)',
    back1 && isRoom(back1) && !!back1.back && back1.rooms === 0 && !back1.sel, { rr, back1 });

  if (back1 && back1.back) {
    await pg.waitForTimeout(500);
    await tap(back1.back);
    const back2 = await until((h) => h.rooms > 0);
    await check(label + ': ‹ again is the house list', back2 && back2.rooms > 0 && back2.title === house.title, { house, back2 });
  }
  await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await pg.context().close();
}
await finish();
