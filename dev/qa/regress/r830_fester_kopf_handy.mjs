// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/filter-overlay.js#_ensureDashboardHeader,_headBWanted,_headBRowFree,_headBScreen,_headBFix,_headBFixPlace,_headBRow,_headBText,_makeHeadB,_restoreBadgeRow
// Fixed head on the phone's Home (1B, owner 14.11.2026): at the top the page looks as before; once the big
// greeting has scrolled away, a slim row (greeting left, weather right) and the badge row stay at the top on the
// bar's material (row 44 + badges 46 + edge 8 below the safe area). Badges stay tappable, nothing overlaps, the
// page never scrolls sideways, popups, the bell and the room page lie above it, tablet and desktop are unchanged.
// The row is held without a sticky layer (15.11.2026, r831): the card is position: fixed at the line, its wrapper
// stays in the flow as the placeholder, and HA's views keep their own overflow.
import { open, usePage, studio, casoraDashboard, dashboard, cards, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('dashboard with a phone twin', d && d.phone, d && d.url);
const SHOT = process.env.CASORA_SHOT_DIR;
let c = await ws();
const [desk0, phone0] = [await c.cmd({ type: 'lovelace/config', url_path: d.url }), await c.cmd({ type: 'lovelace/config', url_path: d.phone.url })];
c.close();
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: d.url, config: desk0 }); await c2.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone0 }); c2.close(); });

// Greeting by the time of day, as on a real Home.
{
  const { page, browser } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  usePage(page);
  await studio(page, d.url);
  const ok = await page.evaluate(async () => {
    const p = window.__panel(), V = p._state.compact.rooms[0].variables;
    V.casora_greeting = 'time';
    delete V.casora_greeting_next;
    return p._save();
  });
  await need('greeting saved', ok);
  await page.waitForTimeout(1000);
  await browser.close();
}
// The test house's Home is shorter than a phone screen: 40 more favourites make it scroll well past 500 px.
c = await ws();
const phone = await c.cmd({ type: 'lovelace/config', url_path: d.phone.url });
const rows = [];
const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.type === 'custom:casora-smart-row') rows.push(o); (o.cards || []).forEach(walk); };
(phone.views[0].cards || []).forEach(walk);
const fav = rows.find((r) => (r.cards || []).some((k) => [].concat(k.template || []).includes('casora_light')));
await need('favourites row with a light', fav, rows.length);
const light = fav.cards.find((k) => [].concat(k.template || []).includes('casora_light'));
for (let i = 0; i < 40; i++) fav.cards.push(JSON.parse(JSON.stringify(light)));
await c.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone });
c.close();

const HOME = d.phone.url + '/' + (d.phone.config.views[0].path || '0');

// Head, badge row, material and page width, measured in the page.
const measure = (pg) => pg.evaluate(() => {
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const head = (window.__pierce('.casora-head-b') || [])[0] || null;
  const badge = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_filter_badges') && b.getBoundingClientRect().height > 0);
  let wrap = badge;
  while (wrap && !(wrap.classList && wrap.classList.contains('card-wrapper'))) wrap = wrap.parentNode || wrap.host;
  const root = head && head.getRootNode();
  const grad = root ? [...root.children].find((e) => e.style && e.style.position === 'fixed' && /blur\(22px\)/.test(e.style.backdropFilter || e.style.webkitBackdropFilter || '')) : null;
  // The badges: button-cards 30–60 px high inside the row (nested in shadow roots), on screen.
  const pills = [];
  const dig = (n, d) => { if (!n || d > 10) return; for (const k of n.children || []) { if (k.tagName === 'BUTTON-CARD') { const r = k.getBoundingClientRect(); if (r.height >= 30 && r.height <= 60 && r.width > 0 && r.left < innerWidth - 20) { pills.push(k); continue; } } if (k.shadowRoot) dig(k.shadowRoot, d + 1); dig(k, d + 1); } };
  dig(badge && badge.shadowRoot && badge.shadowRoot.querySelector('#badges'), 0);
  const views = window.__pierce('hui-view, hui-view-container').map((v) => getComputedStyle(v).overflowX);
  const titleHost = window.__pierce('button-card').find((b) => b.shadowRoot && b.shadowRoot.querySelector('#weather'));
  const name = titleHost && titleHost.shadowRoot.querySelector('#name');
  return {
    y: scrollY, x: scrollX, sw: document.scrollingElement.scrollWidth, iw: innerWidth, sh: document.scrollingElement.scrollHeight,
    head: head && { op: parseFloat(getComputedStyle(head).opacity), pe: getComputedStyle(head).pointerEvents, box: box(head),
      greet: head.firstChild.textContent, weather: head.lastChild.textContent, g: box(head.firstChild), w: box(head.lastChild) },
    wrap: wrap && { box: box(wrap), pos: getComputedStyle(wrap).position, z: getComputedStyle(wrap).zIndex },
    row: badge && { box: box(badge), pos: getComputedStyle(badge).position },
    pills: pills.map((p) => ({ ...box(p), text: (p.shadowRoot && p.shadowRoot.querySelector('ha-card') || p).innerText.replace(/\s+/g, ' ').trim() })),
    grad: grad ? parseFloat(getComputedStyle(grad).opacity) : null,
    views, nameOp: name ? parseFloat(getComputedStyle(name).opacity) : null, nameText: name ? name.textContent.trim() : '',
  };
});
// Deepest element at a point, and whether it lies in the badge row / head / an open popup.
const hitAt = (pg, x, y) => pg.evaluate(([x, y]) => {
  let e = document.elementFromPoint(x, y);
  for (let i = 0; e && e.shadowRoot && i < 40; i++) { const k = e.shadowRoot.elementFromPoint(x, y); if (!k || k === e) break; e = k; }
  const path = [];
  for (let n = e; n; n = n.parentNode || n.host) { if (n.nodeType === 1) path.push(n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '')); }
  const tpl = (n) => [].concat((n._config || {}).template || []);
  let badges = false, tile = false;
  for (let n = e; n; n = n.parentNode || n.host) {
    if (n.tagName === 'BUTTON-CARD' && tpl(n).includes('casora_mobile_filter_badges')) badges = true;
    if (n.tagName === 'BUTTON-CARD' && tpl(n).some((t) => /casora_light|casora_lock|casora_cover|casora_trash|casora_football/.test(t))) tile = true;
  }
  return { badges, tile, head: path.some((p) => p.startsWith('div.casora-head-b')), popup: path.some((p) => /casora-popup|hmn-|bell|ha-dialog|dialog/.test(p)), path: path.slice(0, 6).join(' < ') };
}, [x, y]);
const scrollTo = async (pg, y) => { await pg.evaluate((y) => window.scrollTo(0, y), y); await pg.waitForTimeout(150); await pg.evaluate(() => window.dispatchEvent(new Event('scroll'))); await pg.waitForTimeout(500); };

for (const width of [360, 390, 393]) {
  for (const dark of [false, true]) {
    const tag = `${width} ${dark ? 'dark' : 'light'}`;
    const { page: pg, browser } = await open({ width, height: 852, mobile: true, scale: 3, dark, theme: 'Casora' });
    usePage(pg);
    await dashboard(pg, HOME, 3);
    await pg.waitForFunction(() => (window.__pierce('.casora-head-b') || []).length > 0, null, { timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(800);
    const top = await measure(pg);
    await need(`${tag}: page scrolls more than 500 px`, top.sh - 852 > 520, top.sh);
    await check(`${tag}: top: slim head hidden`, top.head && top.head.op === 0 && top.head.pe === 'none', top.head);
    await check(`${tag}: top: no material over the big greeting`, top.grad === 0, top.grad);
    await check(`${tag}: top: big greeting shown`, top.nameOp >= 0.85 && top.nameText.length > 0, { op: top.nameOp, t: top.nameText });
    await check(`${tag}: top: badge row below the greeting as before`, top.wrap && top.wrap.box.t > 60, top.wrap);
    if (SHOT && width === 393) await pg.screenshot({ path: `${SHOT}/oben_${dark ? 'dunkel' : 'hell'}.png` });

    for (const y of [500, 900]) {
      await scrollTo(pg, y);
      const m = await measure(pg);
      const t2 = `${tag} scrolled ${y}`;
      await check(`${t2}: page scrolled`, Math.abs(m.y - y) < 2, m.y);
      await check(`${t2}: slim head shown`, m.head && m.head.op === 1 && m.head.pe === 'auto', m.head);
      await check(`${t2}: head row 44 px at the top`, m.head && Math.abs(m.head.box.t) < 1 && Math.abs(m.head.box.h - 44) < 1, m.head && m.head.box);
      await check(`${t2}: greeting "${top.nameText}" on the left`, m.head && m.head.greet === top.nameText && m.head.g.w > 20 && m.head.g.l < 30, m.head);
      await check(`${t2}: weather on the right ("${m.head && m.head.weather}")`, m.head && /\d°/.test(m.head.weather) && m.head.weather.includes(' · ') && m.head.w.r > width - 30 && m.head.w.r <= width - 12, m.head);
      await check(`${t2}: greeting and weather do not overlap`, m.head && m.head.g.r <= m.head.w.l + 0.5, m.head && [m.head.g, m.head.w]);
      await check(`${t2}: badge row fixed under the head`, m.row && Math.abs(m.row.box.t - 44) < 1 && m.row.pos === 'fixed' && m.wrap.pos !== 'sticky', [m.row, m.wrap]);
      await check(`${t2}: fixed part ends at 98 px`, m.row && m.row.box.b <= 98 + 0.5, m.row && m.row.box);
      await check(`${t2}: the row's place in the flow keeps its height and has scrolled on`, m.wrap && Math.abs(m.wrap.box.h - top.wrap.box.h) < 0.5 && m.wrap.box.t < 44 && m.sh === top.sh, [m.wrap, top.wrap, m.sh, top.sh]);
      await check(`${t2}: material shown`, m.grad === 1, m.grad);
      await check(`${t2}: no sideways scrolling`, m.x === 0 && m.sw <= m.iw, { x: m.x, sw: m.sw, iw: m.iw });
      await check(`${t2}: badges inside the fixed part`, m.pills.length >= 2 && m.pills.every((p) => p.t >= 44 - 4 && p.b <= 98), m.pills);
      // A badge answers a finger over 44 px; the tile scrolling under the head does not get the tap.
      const p0 = m.pills[0];
      const cx = Math.max(p0.l, 0) + Math.min(p0.w, width - p0.l) / 2;
      const hits = [];
      for (const dy of [-21, 0, 21]) hits.push(await hitAt(pg, cx, (p0.t + p0.b) / 2 + dy));
      await check(`${t2}: badge "${p0.text}" tappable over 44 px`, p0.b - p0.t >= 40 && hits.every((h) => h.badges && !h.tile), hits);
      const hh = await hitAt(pg, width / 2, 22);
      await check(`${t2}: head row takes the tap, not the tile under it`, hh.head && !hh.tile, hh);
      if (SHOT && width === 393 && y === 500) await pg.screenshot({ path: `${SHOT}/500_${dark ? 'dunkel' : 'hell'}.png` });
    }
    await check(`${tag}: HA's views keep their own overflow (nothing sticky needs clip)`, (await measure(pg)).views.every((v) => v === 'hidden'), (await measure(pg)).views);

    // Back to the top: as before.
    await scrollTo(pg, 0);
    const back = await measure(pg);
    await check(`${tag}: back at the top: head hidden again`, back.head && back.head.op === 0 && back.grad === 0, back.head);
    await check(`${tag}: back at the top: badge row where it was, in the flow`, back.wrap && Math.abs(back.wrap.box.t - top.wrap.box.t) < 1 && Math.abs(back.row.box.t - top.row.box.t) < 1 && back.row.pos === 'relative', [back.wrap, top.wrap, back.row, top.row]);

    if (width === 393) {
      // Popup over the fixed head.
      await scrollTo(pg, 500);
      const tiles = (await cards(pg, 'casora_light')).filter((k) => k.y > 200 && k.y + k.h < 700);
      await need(`${tag}: light tile on screen`, tiles.length, null);
      const opened = () => pg.waitForFunction(() => window.__pierce('casora-popup').some((p) => {
        const el = p.shadowRoot && p.shadowRoot.querySelector('.glass'); const r = el && el.getBoundingClientRect();
        return r && r.width > 100 && r.height > 100; }), null, { timeout: 8000 }).then(() => true, () => false);
      await pg.mouse.click(tiles[0].x + tiles[0].w / 2, tiles[0].y + tiles[0].h / 2);
      const isOpen = await opened();
      await check(`${tag}: popup opens from a tile under the fixed head`, isOpen);
      await pg.waitForTimeout(700);
      if (isOpen) {
        const ph = await hitAt(pg, width / 2, 66), pt = await hitAt(pg, 30, 22);
        await check(`${tag}: popup lies above the badge row and the head`, !ph.badges && !ph.head && !pt.head, [ph, pt]);
        if (SHOT) await pg.screenshot({ path: `${SHOT}/popup_${dark ? 'dunkel' : 'hell'}.png` });
        await pg.keyboard.press('Escape');
        await pg.waitForTimeout(900);
        if (await pg.evaluate(() => window.__pierce('casora-popup').some((p) => { const el = p.shadowRoot && p.shadowRoot.querySelector('.glass'); return el && el.getBoundingClientRect().height > 100; }))) {
          await pg.goBack().catch(() => {});
          await pg.waitForTimeout(900);
        }
      }
      if (!dark) {
        // Bell in the bottom bar: its sheet lies above the fixed head.
        await scrollTo(pg, 500);
        const bell = await pg.evaluate(() => {
          const card = document.querySelector('.hmn-dock button-card');
          const s = card && card.shadowRoot && card.shadowRoot.getElementById('bell');
          const b = s && s.querySelector('button-card');
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        if (bell) {
          await pg.mouse.click(bell.x, bell.y);
          await pg.waitForTimeout(1500);
          const bh = await hitAt(pg, width / 2, 66);
          const bt = await hitAt(pg, 30, 22);
          await check(`${tag}: bell sheet lies above the badge row and the head`, !bh.badges && !bt.head, [bh, bt]);
          await pg.keyboard.press('Escape');
          await pg.waitForTimeout(900);
          await pg.goto(pg.url()).catch(() => {});
          await dashboard(pg, HOME, 3);
        } else await check(`${tag}: bell in the bottom bar`, false);

        // A badge's sheet (tap on "Klima") lies above the fixed head.
        await scrollTo(pg, 500);
        const m = await measure(pg);
        const pill = m.pills[1] || m.pills[0];
        await pg.mouse.click(pill.l + Math.min(pill.w, width - pill.l) / 2, (pill.t + pill.b) / 2);
        await pg.waitForFunction(() => { const s = document.querySelector('home-assistant').hass.states['input_select.casora_mobile_filter']; return s && s.state !== 'all'; }, null, { timeout: 8000 }).catch(() => {});
        await pg.waitForTimeout(1500);
        const sh = await hitAt(pg, width / 2, 66), st = await hitAt(pg, 30, 22);
        await check(`${tag}: badge "${pill.text}" opens its page, which lies above the fixed head`, !sh.badges && !sh.head && !st.head, [sh, st]);
        const back = async () => {
          await pg.evaluate(() => { window._casoraFilter.set('all'); window._casoraFilter.share(document.querySelector('home-assistant').hass, 'all'); });
          await pg.waitForTimeout(1800);
        };
        await pg.keyboard.press('Escape');
        await pg.waitForTimeout(900);
        await back();
        const sheetOpen = () => pg.evaluate(() => window.__pierce('casora-popup').some((p) => { const el = p.shadowRoot && p.shadowRoot.querySelector('.glass'); return el && el.getBoundingClientRect().height > 100; }));
        if (await sheetOpen()) { await pg.goBack().catch(() => {}); await pg.waitForTimeout(900); }
        await check(`${tag}: badge page closed again`, !(await sheetOpen()));
        // Room page: the room overlay covers the page, the fixed head and the badge row stay under it.
        await scrollTo(pg, 500);
        const room = (phone.views[0].cards[1].cards || []).find((k) => k.type === 'custom:casora-filter-overlay' && k.room && k.room !== 'Scenes');
        await need(`${tag}: a room page`, room, null);
        const key = 'room_' + String(room.room).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
        await pg.evaluate((k) => window._casoraFilter.set(k), key);
        await pg.waitForTimeout(1800);
        const rm = await measure(pg);
        const rh = await hitAt(pg, width / 2, 66), rt = await hitAt(pg, 30, 22);
        await check(`${tag}: room page "${room.room}": slim head hidden`, rm.head && rm.head.op === 0, rm.head);
        await check(`${tag}: room page "${room.room}": lies above the badge row and the head`, !rh.badges && !rh.head && !rt.head && !rt.badges, [rh, rt]);
        if (SHOT) await pg.screenshot({ path: `${SHOT}/raum_hell.png` });
        await back();
        await scrollTo(pg, 600);
        const home = await measure(pg);
        await check(`${tag}: back on Home: head and badges fixed again`, home.head && home.head.op === 1 && home.row && Math.abs(home.row.box.t - 44) < 1 && home.row.pos === 'fixed' && home.wrap.z === '113', home);
      }
    }
    await browser.close();
  }
}

// Tablet and desktop: no fixed head, views keep HA's overflow.
for (const [w, h, url, mobile] of [[820, 1180, d.url, true], [1440, 900, d.url, false], [820, 1180, HOME, true]]) {
  const { page: pg, browser } = await open({ width: w, height: h, mobile, scale: 2, dark: false, theme: 'Casora' });
  usePage(pg);
  await dashboard(pg, url + (url === d.url ? '/' + (d.config.views[0].path || '0') : ''), 3);
  await pg.waitForTimeout(800);
  await scrollTo(pg, 500);
  const m = await measure(pg);
  const tag = `${w}x${h} ${url === HOME ? 'phone dashboard' : 'dashboard'}`;
  await check(`${tag}: no slim head`, !m.head || m.head.op === 0, m.head);
  await check(`${tag}: views keep overflow-x hidden`, m.views.every((v) => v === 'hidden'), m.views);
  await check(`${tag}: badge row not held at the top`, !m.wrap || m.wrap.z !== '113', m.wrap);
  await browser.close();
}
await finish();
