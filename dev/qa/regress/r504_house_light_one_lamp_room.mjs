// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/casora-core.js
// Issue #118 (maintainer, 02.11.2026): house light popup (ZUHAUSE · Beleuchtung) → a room with ONE lamp opened the
// room's page with just that lamp's row – a page almost the same as the lamp's. Expected: the tap opens the lamp's page
// straight away (kicker = room, title = lamp, ‹ visible); ‹ goes back to the house's room list. Covers a room light
// group with one member (its member is the lamp). Rooms of two lamps or more keep their room page (r503).
// Phone 393×852 and desktop 1440×900. States only in the browser, nothing is switched or saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, shot, fakeStates } from './lib.mjs';

const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with a phone layout', dash && dash.phone, dash && dash.url);
const shots = process.env.R504_SHOTS;
const LAMP = 'light.qa_r504_mirror', LAMP_NAME = 'Spiegelleuchte';

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
    const rooms = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis)
      .filter((r) => /"a":"room"/.test(r.getAttribute('data-lps-tap'))).length;
    const b = e._headerBack && !e._headerBack.hidden ? e._headerBack.getBoundingClientRect() : null;
    return { title: e._headerTitle ? e._headerTitle.textContent.replace(/​/g, '').trim() : null,
      eyebrow: e._headerEyebrow ? e._headerEyebrow.textContent.trim() : '', back: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null,
      lbl: window.__pierce('.lps-lbl', e.shadowRoot).filter(vis).map((x) => x.textContent.trim()), rooms };
  });
  const until = async (fn) => { let h = null; for (let i = 0; i < 25; i++) { await pg.waitForTimeout(250); h = await head(); if (h && fn(h)) break; } await pg.waitForTimeout(400); return head(); };
  const close = () => pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 700)); });

  // House light popup (as r503): phone taps the badge, desktop holds it (or a house badge made in the browser).
  const openHouse = async () => {
    await close();
    let at = await pg.evaluate(() => {
      const b = window.__pierce('button-card').find((x) => /casora_badge_light_group\b/.test([].concat((x._config || {}).template || []).join(' ')) && x.getBoundingClientRect().width > 20);
      if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (!at) {
      at = await pg.evaluate(async () => {
        const ha = document.querySelector('home-assistant');
        let el = ha.shadowRoot.getElementById('qa-r504-badge');
        if (!el) {
          const h = await window.loadCardHelpers();
          el = h.createCardElement({ type: 'custom:button-card', template: 'casora_badge_light_group', entity: 'input_select.casora_expanded_row',
            variables: { enabled: true, light_rooms_auto: true } });
          el.id = 'qa-r504-badge'; el.style.cssText = 'position:fixed;left:300px;top:300px;z-index:99990;';
          ha.shadowRoot.appendChild(el);
        }
        el.hass = ha.hass;
        await new Promise((r) => setTimeout(r, 1500));
        const r = el.getBoundingClientRect();
        return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      });
    }
    if (!at) return null;
    if (size.mobile) await pg.touchscreen.tap(at.x, at.y);
    else { await pg.mouse.move(at.x, at.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); }
    return until((h) => h.rooms > 0);
  };

  let house = await openHouse();
  await need(label + ': house light popup lists rooms', house && house.rooms > 0, house);
  // A room standing for an HA light group: make that group one of a single member (only in the browser).
  const room = await pg.evaluate(() => {
    const c = window._casoraLightSoft && window._casoraLightSoft.cur;
    const r = c && c.rooms && c.rooms.find((x) => x.rid);
    return r ? { name: r.name, rid: r.rid } : null;
  });
  await need(label + ': a room of the house with its own light group', room, house);
  await fakeStates(pg, {
    [room.rid]: { state: 'on', attributes: { entity_id: [LAMP] } },
    [LAMP]: { state: 'on', attributes: { friendly_name: LAMP_NAME, brightness: 128, supported_color_modes: ['brightness'], color_mode: 'brightness' } },
  }, { sticky: true });
  await pg.waitForTimeout(800);
  house = await openHouse();
  await need(label + ': house light popup again', house && house.rooms > 0, house);

  const rr = await pg.evaluate((name) => {
    const e = window.casoraPopup.element; const vis = (x) => x && x.getBoundingClientRect().width > 0;
    const r = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis).find((x) => {
      try { const d = JSON.parse(x.getAttribute('data-lps-tap')); return d.a === 'room' && d.name === name; } catch (err) { return false; }
    });
    if (!r) return null;
    r.scrollIntoView({ block: 'center' });
    const b = (r.querySelector('.lps-tx') || r).getBoundingClientRect();
    return { x: b.x + Math.min(30, b.width / 3), y: b.y + b.height / 2 };
  }, room.name);
  await need(label + ': row of the room „' + room.name + '“', rr, house);
  await pg.waitForTimeout(500);
  await tap(rr);
  const lamp = await until((h) => h.back && h.title !== house.title);
  if (shots) await pg.screenshot({ path: `${shots}/${label}-one-lamp.png` });
  await shot(label + '_one_lamp');
  await check(label + ': one tap opens the lamp\'s page (title „' + LAMP_NAME + '“, kicker „' + room.name + '“, ‹)',
    lamp && lamp.title === LAMP_NAME && lamp.eyebrow.toLowerCase() === room.name.toLowerCase() && !!lamp.back && lamp.rooms === 0,
    { room, lamp });

  if (lamp && lamp.back) {
    await pg.waitForTimeout(500);
    await tap(lamp.back);
    const back = await until((h) => h.rooms > 0);
    if (shots) await pg.screenshot({ path: `${shots}/${label}-back.png` });
    await check(label + ': ‹ is the house list', back && back.rooms > 0 && back.title === house.title && !back.back, { house, back });
  }
  await close();
  await pg.context().close();
}
await finish();
