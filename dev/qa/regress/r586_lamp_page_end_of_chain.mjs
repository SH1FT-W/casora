// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#S.alone,S.lampAlone,roomV3,act
// Issue 126 (owner decision, 05.11.2026): room lighting popup („WOHNZIMMER / Beleuchtung“) → tap a lamp → its page
// listed every lamp of the room again („Lampen im Raum · 1 von 3 an“); from there one jumped lamp to lamp and ‹ went
// back to the lamp before instead of the overview. Expected: the lamp's page is the end of the chain and looks like a
// single-device popup (thermostat, blinds): its dial with brightness and white tone, no list of the room's lamps, one
// column (552 on the desktop); ‹ always leads back to the room's overview, which keeps its list.
// The test house's living room gets made-up lamps in the browser (as r516). Desktop 1440 and phone 393. Nothing is saved.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage, shot } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone layout', dash && dash.phone);
const V = (p) => dash.config.views.find((v) => v.path === p && ((v.cards || [])[0] || {}).template === 'casora_room');
const wz = V('wohnzimmer');
await need('room „wohnzimmer“ with a light badge', wz && wz.cards[0].variables.light_entity_1);
const WZ = wz.cards[0].name, wzGroup = wz.cards[0].variables.light_entity_1;
const ct = { supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', color_temp_kelvin: 2700, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 };
const L = { a: 'light.qa_r586_steh', b: 'light.qa_r586_lese', c: 'light.qa_r586_decke' };
const FAKE = {
  [L.a]: { state: 'on', attributes: { friendly_name: 'Stehlampe ' + WZ, brightness: 204, ...ct } },
  [L.b]: { state: 'off', attributes: { friendly_name: 'Leselampe ' + WZ, ...ct } },
  [L.c]: { state: 'off', attributes: { friendly_name: 'Deckenlampe ' + WZ, ...ct } },
  [wzGroup]: { state: 'on', attributes: { friendly_name: WZ, entity_id: [L.a, L.b, L.c], ...ct } },
};
const shots = process.env.R586_SHOTS;

for (const [label, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 393, height: 852, mobile: true }]]) {
  const { page: pg } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(pg);
  const tap = async (p, hold) => {
    if (size.mobile) { await pg.touchscreen.tap(p.x, p.y); return; }
    if (hold) { await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); return; }
    await pg.mouse.click(p.x, p.y);
  };
  const info = () => pg.evaluate(() => {
    const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
    const vis = (x) => { if (!x) return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; };
    const P = (s) => window.__pierce(s, e.shadowRoot).filter(vis);
    const t = (x) => (x.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
    const b = e._headerBack && !e._headerBack.hidden ? e._headerBack.getBoundingClientRect() : null;
    return { eyebrow: t(e._headerEyebrow || {}), title: t(e._headerTitle || {}), back: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null,
      lbl: P('.lps-lbl').map(t), rows: P('.lps-row').length, dial: P('.hui-dl').length > 0,
      width: e.surface ? Math.round(e.surface.getBoundingClientRect().width) : 0 };
  });
  const until = async (fn, max = 30) => { let h = null; for (let i = 0; i < max; i++) { await pg.waitForTimeout(250); h = await info(); if (h && fn(h)) break; } await pg.waitForTimeout(600); return info(); };
  const rowAt = (id) => pg.evaluate((id) => {
    const e = window.casoraPopup.element; const vis = (x) => x && x.getBoundingClientRect().width > 0;
    const r = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis).find((x) => { try { const d = JSON.parse(x.getAttribute('data-lps-tap')); return d.a === 'mi' && d.id === id; } catch (err) { return false; } });
    if (!r) return null; r.scrollIntoView({ block: 'center' });
    const b = (r.querySelector('.lps-tx') || r).getBoundingClientRect();
    return { x: b.x + Math.min(30, b.width / 3), y: b.y + b.height / 2 };
  }, id);

  // The room's page with its light badge (phone: the room filter of the one phone view, as r516).
  if (size.mobile) {
    await dashboard(pg, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 2);
    await fakeStates(pg, FAKE, { sticky: true });
    await pg.evaluate(([name]) => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._items === 'function');
      const r = n && (n._rooms.find((x) => (x.label || x.name) === name) || n._rooms.find((x) => x.key === 'room_wohnzimmer'));
      if (r) window._casoraFilter.set(r.key); }, [WZ]);
    await pg.waitForTimeout(3000);
  } else {
    await dashboard(pg, dash.url + '/wohnzimmer', 2);
    await fakeStates(pg, FAKE, { sticky: true });
    await pg.waitForTimeout(1200);
  }
  const at = await pg.evaluate((last) => {
    const all = window.__pierce('button-card').filter((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group')
      && x.getBoundingClientRect().width > 20 && getComputedStyle(x).display !== 'none');
    const b = last ? all.sort((p, q) => q.getBoundingClientRect().y - p.getBoundingClientRect().y)[0] : all[0];
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, !!size.mobile);
  await need(label + ': light badge of the room', at);
  await tap(at, !size.mobile);
  const isOverview = (h) => h && h.title === 'Beleuchtung' && h.rows >= 3;
  const ov = await until(isOverview);
  await need(label + ': room lighting overview with its lamps', isOverview(ov), ov);
  if (shots) await pg.screenshot({ path: `${shots}/${label}-overview.png` });

  // Overview → lamp A: its page is a single-device page.
  for (const [id, nm] of [[L.a, 'Stehlampe'], [L.b, 'Leselampe']]) {
    const r = await rowAt(id);
    await need(`${label}: row „${nm}“ in the overview`, r);
    await tap(r);
    const lp = await until((h) => h.title === nm && h.dial);
    if (shots && id === L.a) await pg.screenshot({ path: `${shots}/${label}-lamp.png` });
    await shot(label + '_lamp_' + nm);
    await check(`${label} ${nm}: lamp page „${WZ} / ${nm}“ with ‹ and its dial`, lp && lp.title === nm && !!lp.back && lp.dial
      && lp.eyebrow.toLowerCase() === WZ.toLowerCase(), lp);
    await check(`${label} ${nm}: no list of the room's lamps (no rows, no „Lampen im Raum“)`, lp && lp.rows === 0
      && !lp.lbl.some((x) => /^Lampen/.test(x)), lp);
    if (!size.mobile) await check(`${label} ${nm}: one column, 552 wide`, lp && lp.width <= 560, lp && lp.width);
    if (!lp || !lp.back) break;
    await tap(lp.back);
    const bk = await until((h) => isOverview(h) || (h.title !== nm && !h.dial));
    await check(`${label} ${nm}: ‹ leads back to the room's overview (its list, no ‹)`, isOverview(bk) && !bk.back
      && bk.lbl.some((x) => /^Lampen im Raum/.test(x)), bk);
  }
  await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await pg.context().close();
}
await finish();
