// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#S.headOf,roomV3,_casoraBackNext,_casoraSuppressDismiss,_casoraLF custom_components/casora/scripts/casora-core.js
// Review (03.11.2026) of the uniform light heads (r516): a house popup whose rooms come from an HA light group (its
// rooms are the group's room groups, not the dashboard's light badges) → a room of one lamp (#118) opened the lamp's
// page labelled „ZUHAUSE“ when the lamp sat in no room badge of the dashboard and in no area: the tapped room was
// dropped. Expected: label = the tapped room, title = the lamp without it. Desktop 1440 and phone 393; the room's group
// gets one made-up lamp in the browser, nothing is saved.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
const LAMP = 'light.qa_r517_lamp';

for (const [label, size] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 393, height: 852, mobile: true }]]) {
  const { page: pg } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(pg);
  await dashboard(pg, size.mobile ? dash.phone.url + '/' + (dash.phone.config.views[0].path || '0') : dash.url, 2);
  const tapAt = async (p, hold) => {
    if (size.mobile) return pg.touchscreen.tap(p.x, p.y);
    if (hold) { await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.waitForTimeout(900); return pg.mouse.up(); }
    return pg.mouse.click(p.x, p.y);
  };
  // The house popups of the page: a light tile or badge whose popup lists rooms from an HA group (cfg.rooms with rid).
  const cands = await pg.evaluate(() => window.__pierce('button-card').map((b, i) => [b, i])
    .filter(([b]) => /casora_(light|badge_light_group)\b/.test([].concat((b._config || {}).template || []).join(' ')) && b.getBoundingClientRect().width > 20)
    .map(([b, i]) => [i, /badge_light_group/.test(JSON.stringify(b._config.template))]));
  let pick = null, src = null;
  for (const [i, badge] of cands) {
    const at = await pg.evaluate((i) => { const b = window.__pierce('button-card')[i]; b.scrollIntoView({ block: 'center', inline: 'center' });
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
    await pg.waitForTimeout(400);
    await tapAt(at, badge && !size.mobile);
    await pg.waitForTimeout(2500);
    // A room of this house whose group is in no light badge of the dashboard (so the dashboard knows no room for it).
    pick = await pg.evaluate(() => {
      const LS = window._casoraLightSoft, h = document.querySelector('home-assistant').hass;
      const cfg = LS && LS.cur; if (!cfg || !cfg.rooms) return null;
      const known = [].concat(...(window._casoraHouseLights(h).rooms || []).map((r) => [r.rid].concat(r.lights || []))).filter(Boolean);
      const idx = cfg.rooms.findIndex((r) => r.rid && h.states[r.rid] && known.indexOf(r.rid) < 0);
      return idx < 0 ? null : { idx, name: cfg.rooms[idx].name, rid: cfg.rooms[idx].rid };
    });
    await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await pg.waitForTimeout(900);
    if (pick) { src = { at, badge }; break; }
  }
  await need(label + ': a house popup with a room the dashboard has no light badge for', pick);
  // That room gets one lamp (named after the room, in no area).
  await fakeStates(pg, { [LAMP]: { state: 'off', attributes: { friendly_name: 'Lichtleiste ' + pick.name, supported_color_modes: ['color_temp'], color_mode: 'color_temp' } },
    [pick.rid]: { state: 'off', attributes: { friendly_name: pick.name, entity_id: [LAMP], supported_color_modes: ['color_temp'] } } }, { sticky: true });
  await pg.waitForTimeout(1500);
  // Open that house again with the room's one lamp in place.
  await tapAt(src.at, src.badge && !size.mobile);
  await pg.waitForTimeout(2500);
  const row = await pg.evaluate((name) => {
    const r = window.__pierce('.lps-row', window.casoraPopup.surface).find((x) => { try { const d = JSON.parse(x.getAttribute('data-lps-tap') || 'null'); return d && d.a === 'room' && d.name === name; } catch (e) { return false; } });
    if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, pick.name);
  await need(label + ': the room row', row);
  await tapAt(row);
  let head = null;
  for (let k = 0; k < 24; k++) {
    await pg.waitForTimeout(250);
    head = await pg.evaluate(() => { const e = window.casoraPopup.element; return { eyebrow: (e._headerEyebrow.textContent || '').trim(), title: (e._headerTitle.textContent || '').replace(/​/g, '').trim(), back: !e._headerBack.hidden }; });
    if (head.back && /Lichtleiste/.test(head.title)) break;
  }
  await check(`${label}: the lamp's page names the tapped room „${pick.name} / Lichtleiste“`,
    head && head.back && head.eyebrow.toLowerCase() === pick.name.toLowerCase() && head.title === 'Lichtleiste', { head, pick });
  await pg.context().close();
}
await finish();
