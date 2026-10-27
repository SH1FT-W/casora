// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Reported (owner, 27.10.2026, prod 26.10.62): the „Jalousien“ sub-badge under Sicherheit opened the blinds popup of an
// HA cover group at 552 px – two columns (Position | list) squeezed, names cut to „Jalou…“. Since stage 2 the cover
// popups set the one-column width unless a list was given; an HA group's members did not count. The sub-badge also
// showed a door glyph for a blind. Expected: HA cover group with several members → two-column width (≥ 880 on the
// desktop), a single cover → one column (≤ 600); the security sub-badge of a blind wears the cover tile's glyph.
import { open, dashboard, casoraDashboards, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
await page.waitForTimeout(1500);
const covers = await page.evaluate(() => { const h = document.querySelector('home-assistant').hass;
  return Object.keys(h.states).filter((id) => id.startsWith('cover.') && !Array.isArray(h.states[id].attributes.entity_id)
    && !['garage', 'gate', 'door'].includes(h.states[id].attributes.device_class)).slice(0, 4); });
await need('mindestens zwei Jalousien im Testhaus', covers.length >= 2, covers);
const grp = 'cover.qa_blinds_group';
await fakeStates(page, { [grp]: { state: 'open', attributes: { entity_id: covers, friendly_name: 'Jalousien' } },
  ...Object.fromEntries(covers.map((c) => [c, { state: 'open', attributes: { current_position: 100 } }])) }, { sticky: true });

const popupWidth = async (template, entity) => {
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await page.waitForTimeout(500);
  await page.evaluate(([t, e]) => window._casoraNotifyOpenViaCard(e, () => {}, { type: 'custom:button-card', template: t, entity: e }, true), [template, entity]);
  await page.waitForTimeout(2200);
  return page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const cut = window.__pierce('*', s).filter((n) => n.children && !n.children.length && /…$/.test((n.textContent || '').trim())).length;
    return { w: Math.round(s.getBoundingClientRect().width), cut }; });
};
for (const t of ['casora_cover', 'casora_popup_cover']) {
  const g = await popupWidth(t, grp);
  await check(`${t}: HA-Gruppe mit ${covers.length} Jalousien zweispaltig breit (≥ 880)`, g && g.w >= 880, g);
  const one = await popupWidth(t, covers[0]);
  await check(`${t}: eine Jalousie schmal (≤ 600)`, one && one.w <= 600, one);
}

// Security sub-badge of a blind: the cover glyph, not a door.
const glyph = await page.evaluate(async (id) => {
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_badge_security', entity: id });
  el.hass = document.querySelector('home-assistant').hass;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 1200));
  const css = [...(el.shadowRoot ? el.shadowRoot.querySelectorAll('style') : [])].map((s) => s.textContent).join('\n');
  el.remove();
  const m = css.match(/mask:\s*url\('([^']+)'/);
  return m ? m[1] : null;
}, covers[0]);
const expected = await page.evaluate((id) => { const h = document.querySelector('home-assistant').hass;
  return window.casoraCoverIconUrl ? window.casoraCoverIconUrl(h.states[id], {}) : null; }, covers[0]);
await check('Sicherheits-Unterbadge einer Jalousie zeigt das Jalousien-Symbol, keine Tür', !!glyph && glyph === expected && !/door/.test(glyph), { glyph, expected });
await finish();
