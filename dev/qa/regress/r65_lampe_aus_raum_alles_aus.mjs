// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026, Nutzertest Tablet): Das Licht-Popup einer einzelnen Lampe aus der Raumseite
// hieß „Licht <Raum>“, zeigte aber nur diese Lampe und kein „Alles aus“ – nur über die Startseite gab es
// den Knopf. Erwartet im Casora-Look (Tablet 1024×768, hell): Popup einer Lampe, die zu einer
// Raumgruppe gehört, zeigt rechts alle Leuchten des Raums und „Alles aus“ für genau diese; der Titel ist
// die Lampe. Zustände nur im Browser (fakeStates).
import { open, dashboard, casoraDashboards as _cd, fakeStates, check, need, finish } from './lib.mjs';

// (eigene Liste: Räume mit aufklappbarer Licht-Reihe)
const desks = (await _cd()).filter((d) => !d.mobile && (d.config.views || []).length > 1);
await need('Casora-Dashboard mit Räumen', desks.length);
const { page } = await open({ width: 1024, height: 768, dark: false, theme: 'Casora' });
const expand = (opt) => page.evaluate((o) => document.querySelector('home-assistant').hass.callService('input_select', 'select_option', { entity_id: 'input_select.casora_expanded_row', option: o }).catch(() => {}), opt);
let done = false;
outer: for (const dash of desks) for (const [i, v] of dash.config.views.entries()) {
  if (!i || !/light\./.test(JSON.stringify(v))) continue;
  await dashboard(page, dash.url + '/' + (v.path || String(i)), 3);
  await expand('lights');
  await page.waitForTimeout(2500);
  // Einzel-Lampe in der Unter-Reihe, die zu einer Raumgruppe mit ≥ 2 Leuchten gehört.
  const grp = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    for (const b of window.__pierce('button-card')) {
      const e = b._config && b._config.entity;
      if (!e || !/^light\./.test(e) || !([].concat(b._config.template || []).includes('casora_badge_light')) || !b.getBoundingClientRect().width) continue;
      if (Array.isArray(h.states[e]?.attributes?.entity_id)) continue;
      let best = null;
      for (const id in h.states) { const m = id.startsWith('light.') && h.states[id].attributes.entity_id;
        if (Array.isArray(m) && m.includes(e)) { const ex = m.filter((x) => h.states[x]); if (ex.length >= 2 && (!best || ex.length < best.length)) best = ex; } }
      if (best) return { lamp: e, m: best };
    }
    return null;
  });
  if (!grp) continue;
  await fakeStates(page, Object.fromEntries(grp.m.map((id) => [id, { state: 'on', attributes: { brightness: 128 } }])), { sticky: true });
  const at = await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id
    && [].concat(x._config.template || []).includes('casora_badge_light') && x.getBoundingClientRect().width > 0);
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, grp.lamp);
  if (!at) continue;
  await page.waitForTimeout(600);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(2500);
  const p = await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    return { rows: window.__pierce('.lps-row', s).length, off: window.__pierce('.lps-off', s).map((e) => e.getAttribute('data-lps-tap')), title: (window.__pierce('.lps-t', s)[0] || {}).textContent }; });
  await check('Lampen-Popup zeigt alle Leuchten des Raums', p && p.rows === grp.m.length, { popup: p, raum: grp.m.length });
  const ids = p && p.off[0] ? JSON.parse(p.off[0]).ids : [];
  await check('„Alles aus“ da und für die Leuchten des Raums', !!ids.length && grp.m.every((x) => ids.includes(x)), { ids, raum: grp.m });
  await check('Titel ist die Lampe, nicht „Licht <Raum>“', p && p.title && !/^Licht /.test(p.title), p && p.title);
  done = true;
  break outer;
}
await check('Raum mit Lampen-Badge in der Unter-Reihe gefunden', done);
await expand('none');
await finish();
