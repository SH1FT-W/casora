// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/34-security-covers.js custom_components/casora/scripts/local/35-phone-hub.js dashboards/casora/button_card_templates.json
// Reported (owner, 27.10.2026, prod 26.10.63 pre): the Klima sub-badge „Jalousien“ opened a blinds popup that listed
// the HA cover GROUPS („Jalousien“, „Jalousien Wohnzimmer“) beside the single blinds, and its count could include
// them. Expected: the sub-badge counts single blinds only, and its popup is the dashboard's blinds tile popup if there
// is one (one place to set it up), else a popup over the single blinds – never a group row. Desktop 1440, states only
// in the browser (a fake HA cover group over the test house's blinds).
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
    && !['garage', 'gate', 'door'].includes(h.states[id].attributes.device_class)); });
await need('mindestens zwei Jalousien', covers.length >= 2, covers);
const GRP = 'cover.qa_alle_jalousien';
await fakeStates(page, {
  [GRP]: { state: 'open', attributes: { entity_id: covers, friendly_name: 'QA Gruppe Jalousien', current_position: 100 } },
  [covers[0]]: { state: 'open', attributes: { current_position: 100 } },
  ...Object.fromEntries(covers.slice(1).map((c) => [c, { state: 'closed', attributes: { current_position: 0 } }])),
}, { sticky: true });
const list = await page.evaluate(() => window.casoraClimateBlinds(document.querySelector('home-assistant').hass, null, true, true));
await check('Klima-Jalousien: keine Gruppe in der Liste', !list.includes('cover.qa_alle_jalousien') && list.length >= 2, list);
await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option', { entity_id: 'input_select.casora_expanded_row', option: 'climate' }));
await page.waitForTimeout(2500);
const badge = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_climate_covers') && x.getBoundingClientRect().width > 0);
  if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, sub: (b.shadowRoot.querySelector('.badge-sub') || {}).textContent }; });
await need('Unterbadge „Jalousien“ unter Klima', badge);
await check('Zählt nur einzelne Jalousien (1 geöffnet, nicht die Gruppe)', /^1 geöffnet$/.test(String(badge.sub || '').trim()), badge.sub);
const tile = await page.evaluate(() => !!window.casoraBlindsTile());
await page.mouse.click(badge.x, badge.y);
await page.waitForTimeout(2500);
const rows = await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
  return window.__pierce('.hui-srow', s).map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim()); });
await need('Jalousien-Popup offen', rows && rows.length, { rows, tile });
await check('Popup ohne Gruppen-Zeile', !rows.some((t) => /QA Gruppe Jalousien/.test(t)), { rows, tile });
console.log('  info   Jalousien-Kachel im Dashboard: ' + (tile ? 'ja (deren Popup)' : 'nein (einzelne Jalousien)'));
// Without a blinds tile (some dashboards have none): a popup over the single blinds, the group expanded, never a row.
await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(600);
await page.evaluate((g) => { window.__qaTile = window.casoraBlindsTile; window.casoraBlindsTile = () => null; window.casoraOpenBlinds([g]); }, GRP);
await page.waitForTimeout(2500);
const rows2 = await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
  return window.__pierce('.hui-srow', s).map((r) => (r.textContent || '').replace(/\s+/g, ' ').trim()); });
await page.evaluate(() => { window.casoraBlindsTile = window.__qaTile; });
await check('Ohne Kachel: Popup über die einzelnen Jalousien, keine Gruppe', rows2 && rows2.length >= covers.length && !rows2.some((t) => /QA Gruppe Jalousien/.test(t)), rows2);
await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option', { entity_id: 'input_select.casora_expanded_row', option: 'none' }).catch(() => {}));
await finish();
