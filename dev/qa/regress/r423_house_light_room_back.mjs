// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js
// Owner (01.11.2026, prod): in the house light popup („Beleuchtung“, the rooms as a list) a tapped room showed its
// lamps but had no ‹ and the head stayed „Beleuchtung“ – since the room chips went (review 2, DD-26) there was no way
// back to the room list. Popup v3 §4.4: a room is a sub page in the same popup – ‹ left, label = the group's title,
// title = the room; ‹ shows the room list again. Room → lamp → ‹ comes back to the room (title, label and its ‹).
// Desktop 1440×900 light (house tile, or the light badge held, on the overview) and phone 393×852 dark (light badge on Home).
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);

const readPopup = (page) => page.evaluate(() => {
  const P = window.casoraPopup; const el = P && P.element; if (!el || !P.surface) return null;
  const sr = el.shadowRoot, bk = sr.querySelector('.header-back');
  const rows = window.__pierce('.lps-row', P.surface).filter((r) => r.getBoundingClientRect().height > 0)
    .map((r) => { try { return JSON.parse(r.getAttribute('data-lps-tap') || 'null'); } catch (e) { return null; } }).filter(Boolean);
  return { back: !!(bk && !bk.hidden && bk.getBoundingClientRect().width > 0),
    title: String((sr.querySelector('.header-title') || {}).textContent || '').replace(/​/g, '').trim(),
    label: String((sr.querySelector('.header-eyebrow') || {}).textContent || '').trim(),
    rooms: rows.filter((d) => d.a === 'room').map((d) => d.name), lamps: rows.filter((d) => d.a === 'mi').map((d) => d.id) };
});
// The house popup: a light tile or badge whose popup lists rooms.
const openHouse = async (page, mobile) => {
  const cands = await page.evaluate(() => window.__pierce('button-card').map((b, i) => [b, i])
    .filter(([b]) => /casora_(light|badge_light_group)\b/.test([].concat((b._config || {}).template || []).join(' ')) && b.getBoundingClientRect().width > 20)
    .map(([b, i]) => [i, /badge_light_group/.test(JSON.stringify(b._config.template))]));
  for (const [i, badge] of cands) {
    const at = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; b.scrollIntoView({ block: 'center', inline: 'center' });
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
    await page.waitForTimeout(400);
    // Desktop: the light badge opens the popup on hold (a tap shows its sub-badges); the phone opens it on tap.
    if (mobile) await page.touchscreen.tap(at.x, at.y);
    else if (badge) { await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up(); }
    else await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(2500);
    const p = await readPopup(page);
    if (p && p.rooms.length > 1) return p;
    await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(900);
  }
  return null;
};
const tapIn = async (page, mobile, pick) => {
  const at = await page.evaluate((pick) => {
    const r = window.__pierce('.lps-row', window.casoraPopup.surface).find((x) => { try { const d = JSON.parse(x.getAttribute('data-lps-tap') || 'null');
      return d && d.a === pick.a && (pick.a === 'room' ? d.name === pick.v : d.id === pick.v); } catch (e) { return false; } });
    if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect();
    return { x: b.x + b.width * 0.5, y: b.y + b.height / 2 };
  }, pick);
  if (!at) return false;
  if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(2800);
  return true;
};
const back = async (page, mobile) => {
  const at = await page.evaluate(() => { const b = window.casoraPopup.element.shadowRoot.querySelector('.header-back'); if (!b || b.hidden) return null;
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (!at) return false;
  if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(2500);
  return true;
};

const run = async (tag, page, mobile) => {
  const house = await openHouse(page, mobile);
  await need(tag + ': house light popup with ≥ 2 rooms', house, house);
  await check(tag + ': house popup without ‹', !house.back, house);
  // A room with ≥ 1 lamp of its own (the lamp step needs one).
  let room = null;
  for (const name of house.rooms) {
    await tapIn(page, mobile, { a: 'room', v: name });
    const r = await readPopup(page);
    if (r && r.lamps.length) { room = { name, r }; break; }
    await back(page, mobile);
  }
  await need(tag + ': a room with lamps', room);
  const r = room.r;
  await check(tag + ': room page has ‹', r.back, r);
  await check(tag + ': room page titled with the room', r.title === room.name, { r, room: room.name });
  await check(tag + ': room page labelled with the group title', r.label === house.title, { r, house: house.title });
  await check(tag + ': room page lists the lamps, not the rooms', r.lamps.length > 0 && !r.rooms.length, r);
  // Room → lamp → ‹ → room.
  await tapIn(page, mobile, { a: 'mi', v: r.lamps[0] });
  const lamp = await readPopup(page);
  await check(tag + ': lamp page with ‹, labelled with the room', lamp && lamp.back && lamp.label === room.name, lamp);
  await back(page, mobile);
  const r2 = await readPopup(page);
  await check(tag + ': ‹ from the lamp: the room again (title, label, lamps)', r2 && r2.title === r.title && r2.label === r.label && r2.lamps.join() === r.lamps.join(), { r2, r });
  await check(tag + ': the room keeps its ‹', r2 && r2.back, r2);
  // Room → ‹ → the house with its room list.
  await back(page, mobile);
  const h2 = await readPopup(page);
  await check(tag + ': ‹ from the room: the room list again', h2 && h2.rooms.join() === house.rooms.join() && h2.title === house.title, { h2, house });
  await check(tag + ': the house has no ‹ again', h2 && !h2.back, h2);
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(900);
};

const desk = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
await dashboard(desk.page, dash.url, 3);
await desk.page.waitForTimeout(1500);
await run('desktop', desk.page, false);

if (dash.phone) {
  const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
  usePage(ph.page);
  await dashboard(ph.page, dash.phone.url + '/home', 2);
  await ph.page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
  await ph.page.waitForTimeout(1500);
  await run('phone', ph.page, true);
}
await finish();
