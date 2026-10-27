// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Reported (owner, 27.10.2026, prod 26.10.62): Home → „Beleuchtung“ badge → room sub-badge „Schlafzimmer“ opened the
// light popup as a house view: pills „Alle | Schlafzimmer ×4“ and a section „Räume“ with four rows all called
// „Schlafzimmer“. The room's light group held a nested group first and single lamps after it; only the first member
// was checked, so every member counted as a room and was named after its area. Expected: the room's own view – lamp
// rows under their own names, no row of identical room pills. Desktop 1440 and phone 393, states only in the browser.
import { open, dashboard, casoraDashboards, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url);
  await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
    { entity_id: 'input_select.casora_expanded_row', option: 'lights' }).catch(() => {}));
  await page.waitForTimeout(2500);
  // A room group in the light sub-row with at least two lamps; make its first member a nested group (as in the report).
  const room = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    for (const b of window.__pierce('button-card')) {
      const e = b._config && b._config.entity;
      if (!e || !/^light\./.test(e) || !b.getBoundingClientRect().width) continue;
      if (![].concat(b._config.template || []).includes('casora_badge_light')) continue;
      const m = (h.states[e]?.attributes?.entity_id || []).filter((x) => h.states[x] && !Array.isArray(h.states[x].attributes.entity_id));
      if (m.length >= 2) return { id: e, lamps: m, names: m.map((x) => h.states[x].attributes.friendly_name || x) };
    }
    return null;
  });
  // Phone Home badges open a popup since 26.10.63 (no light sub-row there); the room pages keep theirs.
  if (!room && size.mobile) { console.log('  info   Handy: keine Licht-Unterreihe auf Zuhause – übersprungen'); await page.context().close(); continue; }
  await need(label + ': Raum-Badge mit mehreren Lampen in der Licht-Unterreihe', room);
  const nested = 'light.qa_nested_' + room.lamps[0].split('.')[1];
  await fakeStates(page, {
    [nested]: { state: 'off', attributes: { entity_id: [room.lamps[0]], friendly_name: room.names[0] } },
    [room.id]: { state: 'off', attributes: { entity_id: [nested, ...room.lamps.slice(1)] } },
  }, { sticky: true });
  const at = await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id
    && [].concat(x._config.template || []).includes('casora_badge_light') && x.getBoundingClientRect().width > 0);
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, room.id);
  await need(label + ': Raum-Badge sichtbar', at);
  await page.waitForTimeout(500);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(2500);
  const p = await page.evaluate(() => {
    const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const txt = (el) => (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    const pills = window.__pierce('button-card', s).filter((b) => { const t = (b._config || {}).tap_action || {}; return t.event_data && t.event_data.casora_lf_gid && b.getBoundingClientRect().width > 20; })
      .map((b) => txt(b.shadowRoot && b.shadowRoot.querySelector('#name')));
    const rows = window.__pierce('.lps-row', s).map((r) => txt(r.querySelector('.lps-name') || r));
    return { pills, rows };
  });
  await need(label + ': Popup offen', p);
  const dupPills = p.pills.filter((n, i) => n && n !== 'Alle' && p.pills.indexOf(n) !== i);
  await check(label + ': keine Reihe gleicher Raum-Pillen', !dupPills.length, p);
  const named = room.names.filter((n) => p.rows.some((r) => r.includes(n)));
  await check(label + ': Lampen-Zeilen tragen ihre eigenen Namen', named.length >= Math.min(2, room.names.length), { rows: p.rows, want: room.names });
  await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
    { entity_id: 'input_select.casora_expanded_row', option: 'none' }).catch(() => {}));
  await page.context().close();
}
await finish();
