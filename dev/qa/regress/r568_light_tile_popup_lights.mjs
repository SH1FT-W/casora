// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraLightSoft,S.rowOrder,S.lampAlone custom_components/casora/scripts/local/01-basis.js#casoraLightTally,_casoraLightTallyIds
// Issue 126: a room with two lamps (no group) and no light tile. A light tile added by hand in the Studio
// („+ Kachel hinzufügen“ → „Andere Kachelart …“ → „Licht“), once with one of the lamps as its device and once without
// one, „Lichter im Popup“ = both lamps in the other order than the room's badge, saved.
// Reported: (1) tapping the first lamp in the tile's popup opened its page, where it jumped to the second place (the
// lamp page listed the room badge's order); (2) with one lamp on, the tile said „1 an“ but its icon stayed dark (only
// the tile's own entity counted for „active“). Expected: the tile is active (icon lit) whenever its count has a lamp
// on. Since 05.11.2026 (owner, issue 126) the lamp's page lists no lamps at all; ‹ leads back to the tile's list in its
// order. Desktop 1440×900 and phone 393×852. Saves both dashboards and writes them back at the end; the lamps get their states back.
import { open, studio, casoraDashboard, dashboard, check, need, finish, usePage, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone layout', dash && dash.phone);
const URLS = [dash.url, dash.phone.url];
const c0 = await ws();
const saved0 = {};
for (const u of URLS) saved0[u] = await c0.cmd({ type: 'lovelace/config', url_path: u });
const S0 = Object.fromEntries((await c0.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
c0.close();
const isGrp = (id) => S0[id] && Array.isArray(S0[id].attributes.entity_id);

// A room whose light badge lists two lamps or more one by one (no HA group): the reporter's room.
const room = (() => {
  for (const v of saved0[dash.url].views || []) {
    const hero = (v.cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
    const V = (hero && hero.variables) || {};
    const lamps = Object.keys(V).filter((k) => /^light_entity_\d+$/.test(k)).sort((a, b) => +a.split('_')[2] - +b.split('_')[2])
      .map((k) => V[k]).filter((x) => typeof x === 'string' && S0[x] && !isGrp(x));
    if (lamps.length >= 2 && !V.light_group_entity) return { path: v.path, title: v.title, A: lamps[0], B: lamps[1] };
  }
  return null;
})();
await need('a room whose badge lists two lamps without a group', room);
const nm = (id) => S0[id].attributes.friendly_name;
const A = room.A, B = room.B;   // badge order A, B; popup order B, A; device A (variant a)

const svc = async (service, id) => { const c = await ws(); try { await c.cmd({ type: 'call_service', domain: 'light', service, target: { entity_id: id } }); } finally { c.close(); } };
atFinish(async () => {
  const c = await ws();
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] });
  c.close();
  for (const id of [A, B]) await svc(S0[id].state === 'on' ? 'turn_on' : 'turn_off', id);
});

try {
  // ── Studio: the reporter's way, twice (with the first lamp as device, without device) ─────────────────────
  {
    const o = await open({ width: 1600, height: 1000, dark: true });
    usePage(o.page);
    const pg = o.page, H = (fn, a) => pg.evaluate(fn, a);
    await studio(pg, dash.url);
    const ri = await H(async (path) => {
      const p = window.__panel(), rooms = p._state.compact.rooms;
      const i = rooms.findIndex((r) => r.path === path);
      if (i < 0) return -1;
      p._room = i; p._sel = null; p._renderTabs(); p._syncPreview();
      await new Promise((r) => setTimeout(r, 1200));
      return i;
    }, room.path);
    await need('Studio: the room', ri > -1, room.path);
    const tiles = () => H(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].tiles.map((t) => ({ tpl: t.template, e: t.entity || null, v: t.variables || {} })); });
    for (const variant of ['a', 'b']) {
      // Back to the room (the inspector and its popup preview of the first tile closed).
      await H(async () => { const p = window.__panel(); p._bClose && p._bClose(); p._sel = null; p._renderForm && p._renderForm(); p._syncPreview && p._syncPreview();
        document.activeElement && document.activeElement.blur(); await new Promise((r) => setTimeout(r, 900)); });
      const n0 = (await tiles()).length;
      const ghost = await H(() => { const e = window.__pierce('.miniroom .mtile.ghost').find((x) => x.getBoundingClientRect().width > 4);
        if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await need(variant + ': „Kachel hinzufügen“ in the preview', ghost);
      await pg.mouse.click(ghost.x, ghost.y);
      await pg.waitForTimeout(1000);
      await H(() => window.__pierce('.uxadd .uxlink').find((b) => /Andere Kachelart|Other tile/.test(b.textContent)).click());
      await pg.waitForTimeout(1300);
      await pg.locator('.combo-menu:visible').getByText(/^(Licht|Light)$/).first().click();
      await pg.waitForTimeout(1500);
      // „Passendes Gerät gefunden“: a: the first lamp of the badge, b: „Ohne Gerät“.
      if (variant === 'a') {
        await pg.getByText(nm(A), { exact: true }).last().click();
        await pg.waitForTimeout(300);
        await pg.getByRole('button', { name: /^(Übernehmen|Apply)$/ }).last().click();
      } else await pg.getByRole('button', { name: /^(Ohne Gerät|Without device)$/ }).last().click();
      await pg.waitForTimeout(1800);
      // „Popup“ → „Lichter im Popup“: B, then A.
      await H(() => { const p = window.__panel();
        const open = [...p.shadowRoot.querySelectorAll('#pane input')].some((x) => x.getClientRects().length && /^(Licht hinzufügen|add light)/i.test(x.placeholder));
        const b = [...p.shadowRoot.querySelectorAll('#pane .tiletabs [data-tab=popup]')].find((x) => x.getClientRects().length);
        if (b && !open) b.click(); });
      await pg.waitForTimeout(1000);
      for (const id of [B, A]) {
        const ok = await H(() => { const p = window.__panel();
          const i = [...p.shadowRoot.querySelectorAll('#pane input')].find((x) => x.getClientRects().length && /^(Licht hinzufügen|add light)/i.test(x.placeholder));
          if (i) { i.setAttribute('data-qa', 'r568-add'); i.scrollIntoView({ block: 'center' }); } return !!i; });
        await need(variant + ': field „Lichter im Popup“', ok);
        await pg.locator('[data-qa=r568-add]').click();
        await pg.locator('[data-qa=r568-add]').fill(nm(id));
        await pg.waitForTimeout(700);
        await pg.locator('.combo-menu:visible .combo-opt').filter({ hasText: nm(id) }).first().click();
        await pg.waitForTimeout(900);
      }
      const t = (await tiles()).slice(-1)[0];
      await check(variant + ': light tile added with „Lichter im Popup“ ' + nm(B) + ', ' + nm(A),
        (await tiles()).length === n0 + 1 && t.tpl === 'casora_light' && JSON.stringify(t.v.lights) === JSON.stringify([B, A])
          && (variant === 'a' ? t.e === A : !t.e || t.e === ''), t);
      if (variant === 'a') await pg.screenshot({ path: (process.env.R568_SHOTS || '/tmp') + '/r568-studio.png' }).catch(() => {});
    }
    await H(() => { const p = window.__panel(); p._bClose && p._bClose(); document.activeElement && document.activeElement.blur(); });
    await pg.keyboard.press('Meta+s');
    const ok = await pg.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
    await need('Studio saved (⌘S)', ok);
    await pg.context().close();
  }

  // One lamp on: the tile's device (A) off, B on.
  await svc('turn_off', A);
  await svc('turn_on', B);

  // Phone room key (as r44): the room's overlay, else from its name.
  const kids = (((saved0[dash.phone.url].views || [])[0] || {}).cards || [])[1];
  const keyOf = (name) => {
    const ov = ((kids && kids.cards) || []).find((k) => k && k.type === 'custom:casora-filter-overlay' && k.room === name);
    return (ov && ov.filter_category) || 'room_' + String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  };

  for (const [label, size, url] of [
    ['desktop', { width: 1440, height: 900 }, dash.url + '/' + room.path],
    ['phone', { width: 393, height: 852, mobile: true, safari: true }, dash.phone.url + '/' + ((saved0[dash.phone.url].views[0] || {}).path || '0')],
  ]) {
    const o = await open({ ...size, dark: true, theme: 'Casora' });
    const pg = o.page; usePage(pg);
    await dashboard(pg, url, 3);
    if (label === 'phone') {
      const hero = (saved0[dash.url].views.find((v) => v.path === room.path).cards || [])[0];
      const key = keyOf((hero && typeof hero.name === 'string' && hero.name.indexOf('[[[') < 0 ? hero.name : null) || room.title);
      await pg.evaluate((k) => window._casoraFilter && window._casoraFilter.set(k), key);
      await pg.waitForTimeout(2500);
    }
    const tap = async (p) => { if (size.mobile) await pg.touchscreen.tap(p.x, p.y); else await pg.mouse.click(p.x, p.y); };
    // The two new tiles: casora_light with lights [B, A].
    const tileInfo = () => pg.evaluate(([A, B]) => window.__pierce('button-card').filter((b) => {
      const c = b._config || {}; const v = c.variables || {};
      return [].concat(c.template || []).includes('casora_light') && Array.isArray(v.lights) && v.lights.join() === [B, A].join()
        && b.getBoundingClientRect().width > 0;
    }).map((b) => {
      const card = b.shadowRoot.querySelector('ha-card'); const cs = getComputedStyle(card);
      const r = b.getBoundingClientRect();
      return { entity: (b._config || {}).entity || null, state: ((b.shadowRoot.querySelector('#state') || {}).textContent || '').trim(),
        active: cs.getPropertyValue('--casora-active-overlay-opacity').trim() === '1', ic: cs.getPropertyValue('--casora-icon-color-current').trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }), [A, B]);
    // The phone layout takes only tiles with a device (a tile without one counts as not set up, casora-panel.js).
    const want = label === 'phone' ? 1 : 2;
    let ti = [];
    for (let i = 0; i < 20 && ti.length < want; i++) { ti = await tileInfo(); if (ti.length < want) await pg.waitForTimeout(500); }
    await need(label + ': the new light tile' + (want > 1 ? 's' : '') + ' shown', ti.length >= want && ti.some((t) => t.entity === A), ti);
    await shot(label + '_tiles');
    for (const t of ti) {
      const v = t.entity ? 'device ' + (t.entity === A ? 'A' : t.entity) : 'no device';
      await check(label + ' (' + v + '): tile says „1 an“', /^1 (an|on)$/i.test(t.state), t);
      await check(label + ' (' + v + '): tile is active (icon lit) with one of its lamps on', t.active, t);
    }
    // Without a device the lit icon has the light colour too (it fell back to the neutral grey).
    const tA0 = ti.find((t) => t.entity === A), tN = ti.find((t) => !t.entity);
    if (tA0 && tN) await check(label + ': tile without device lit in the light colour', !!tN.ic && tN.ic === tA0.ic, { a: tA0.ic, none: tN.ic });

    // Popup of the tile with device A → tap the first lamp row (B) → its page keeps the order B, A with B marked.
    const rows = () => pg.evaluate(() => {
      const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
      const vis = (x) => x && x.getBoundingClientRect().width > 0;
      return window.__pierce('.lps-rows .lps-row', e.shadowRoot).filter(vis).map((r) => {
        let d = null; try { d = JSON.parse(r.getAttribute('data-lps-tap') || 'null'); } catch (err) { d = null; }
        const tg = r.querySelector('.lps-ic'); let id = null; try { id = JSON.parse(tg.getAttribute('data-lps-tap')).id; } catch (err) { id = null; }
        const tx = r.querySelector('.lps-tx').getBoundingClientRect();
        return { id, sel: r.classList.contains('sel'), mi: !!(d && d.a === 'mi'), x: tx.x + Math.min(30, tx.width / 3), y: tx.y + tx.height / 2 };
      });
    });
    const until = async (fn) => { let r = null; for (let i = 0; i < 30; i++) { await pg.waitForTimeout(250); r = await rows(); if (r && fn(r)) break; } await pg.waitForTimeout(400); return rows(); };
    const tA = ti.find((t) => t.entity === A) || ti[0];
    await tap(tA);
    const list = await until((r) => r.length >= 2);
    await need(label + ': tile popup lists the lamps', list && list.length >= 2, list);
    await check(label + ': tile popup lists „Lichter im Popup“ in their order (' + nm(B) + ', ' + nm(A) + ')',
      list[0].id === B && list[1].id === A, list.map((r) => r.id));
    const first = list.find((r) => r.id === B && r.mi);
    await need(label + ': first lamp row opens its page', first, list);
    await tap(first);
    // Issue 126 (owner, 05.11.2026): the lamp's page is the end of the chain – no list of lamps; ‹ back to the tile's list.
    const page2 = await until((r) => r.length === 0);
    await shot(label + '_lamp_page');
    if (process.env.R568_SHOTS) await pg.screenshot({ path: process.env.R568_SHOTS + '/r568-' + label + '-lamp.png' });
    const hd = await pg.evaluate(() => { const e = window.casoraPopup.element; const b = e._headerBack && !e._headerBack.hidden ? e._headerBack.getBoundingClientRect() : null;
      return { title: (e._headerTitle.textContent || '').replace(/\u200B/g, '').trim(), back: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null }; });
    await check(label + ': lamp page lists no lamps (single-device page) and has ‹', Array.isArray(page2) && page2.length === 0 && !!hd.back, { page2, hd });
    if (hd.back) {
      await tap(hd.back);
      const list2 = await until((r) => r.length >= 2);
      await check(label + ': ‹ leads back to the tile popup, in its order (' + nm(B) + ', ' + nm(A) + ')',
        list2 && list2[0].id === B && list2[1].id === A, list2 && list2.map((r) => r.id));
    }
    await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
    await pg.context().close();
  }
} catch (e) {
  await check('flow without abort', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
