// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/18-ziele.js custom_components/casora/scripts/local/13-schloss.js custom_components/casora/scripts/local/15-person.js
// Issue #106: a single window's page opened from the window group said „FENSTER“ over „Fenster“, „Seit 15:25“ in the
// head (the group's time) and „Geschlossen · Seit 18:14“ on the stage, and its history ended on „Geöffnet · seitdem“
// with „Insgesamt geöffnet 24 Std.“ – HA's history lacked the latest change. Here HA's history is served without the
// latest change (as a lagging recorder does) for a window, a door and a lock, each closed 2 h ago:
//  - the newest history row is the current state, the 24 h figures do not count the whole day as open,
//  - the head says no other time than the stage (one source: the page's own entity),
//  - the label above the title does not repeat the title.
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates, shot } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
// HA's history: the active state since before the period, the close 2 h ago missing.
const ACTIVE = { binary_sensor: 'on', lock: 'unlocked' };
await page.route('**/api/history/period/**', (route) => {
  const u = new URL(route.request().url()), id = u.searchParams.get('filter_entity_id') || '';
  const start = decodeURIComponent(u.pathname.split('/history/period/')[1] || '');
  const s = ACTIVE[id.split('.')[0]];
  if (!s) return route.continue();
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([[{ entity_id: id, state: s, attributes: {}, last_changed: start, last_updated: start }]]) });
});
await dashboard(page, dash.url + '/' + ((dash.config.views[0] || {}).path || '0'), 3);
const pick = await page.evaluate(() => {
  const st = document.querySelector('home-assistant').hass.states, ids = Object.keys(st);
  const dc = (id) => (st[id].attributes || {}).device_class;
  const group = ids.find((i) => /^binary_sensor\./.test(i) && Array.isArray(st[i].attributes.entity_id) && st[i].attributes.entity_id.some((m) => st[m] && dc(m) === 'window'));
  return { group, window: group ? st[group].attributes.entity_id.find((m) => st[m] && dc(m) === 'window') : ids.find((i) => /^binary_sensor\./.test(i) && dc(i) === 'window'),
    door: ids.find((i) => /^binary_sensor\./.test(i) && dc(i) === 'door'), lock: ids.find((i) => /^lock\./.test(i)) };
});
await need('Fenstergruppe, Fenster, Tür, Schloss', pick.group && pick.window && pick.door && pick.lock, pick);
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
await fakeStates(page, { [pick.group]: { state: 'on', last_changed: ago(300) }, [pick.window]: { state: 'off', last_changed: ago(120), attributes: { friendly_name: 'Fenster' } },
  [pick.door]: { state: 'off', last_changed: ago(120) }, [pick.lock]: { state: 'locked', last_changed: ago(120) } }, { sticky: true });

const read = () => page.evaluate(() => {
  const el = window.casoraPopup && window.casoraPopup.element;
  if (!el) return null;
  const txt = (n) => (n ? String(n.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const root = el.shadowRoot || el;
  const stage = window.__pierce('.hui-dl-c, .hui-st-stat', root)[0];
  const dot = window.__pierce('.cz-dot', root)[0];
  const row = dot && dot.parentElement && dot.parentElement.nextElementSibling;
  const vals = window.__pierce('.hui-row', root).map(txt).filter((t) => /Insgesamt/.test(t));
  return { eyebrow: txt(el._headerEyebrow), title: txt(el._headerTitle), head: el._headerStatus && !el._headerStatus.hidden ? txt(el._headerStatus) : '',
    stage: txt(stage), newest: row ? txt(row) : '', total: vals[0] || '' };
});
const page1 = async (id, viaGroup) => {
  await page.evaluate(([g, id, viaGroup]) => new Promise((res) => {
    if (window.casoraPopup) window.casoraPopup.close();
    setTimeout(() => {
      if (!viaGroup) { window._casoraZiele.openMeasure(id, '24h', null); res(); return; }
      // The group as a badge tile (its own popup, the group's „Seit …“ in the head), then the single window with ‹.
      window._casoraNotifyOpenViaCard(g, () => setTimeout(() => { window._casoraZiele.openMeasure(id, '24h'); res(); }, 1500),
        { type: 'custom:button-card', template: 'casora_badge_contact_group', entity: g, name: 'Fenster' });
    }, 400);
  }), [pick.group, id, viaGroup]);
  await page.waitForTimeout(3500);
  return read();
};
const times = (t) => (String(t).match(/\b\d{1,2}:\d{2}\b/g) || []);
for (const [id, word, via] of [[pick.window, 'Geschlossen', true], [pick.door, 'Geschlossen', false], [pick.lock, 'Verriegelt', false]]) {
  const r = await page1(id, via);
  await check(id + ': Seite offen', !!(r && r.stage), r);
  if (via) await check(id + ': mit ‹ aus der Gruppe geöffnet', await page.evaluate(() => !window.casoraPopup.element._headerBack.hidden), r);
  if (!r) continue;
  if (id === pick.window) await shot('fenster');
  await check(id + ': neuester Verlauf-Eintrag ist der jetzige Zustand', r.newest.indexOf(word) === 0 && /seitdem/.test(r.newest), r.newest);
  if (/^binary_sensor\./.test(id)) await check(id + ': 24 Std. nicht ganz aktiv', r.total && !/24 Std\./.test(r.total), r.total);
  const hs = times(r.head), ss = times(r.stage);
  await check(id + ': Kopf nennt keine andere Zeit als die Bühne', hs.every((t) => ss.includes(t)), { head: r.head, stage: r.stage });
  await check(id + ': Etikett wiederholt den Titel nicht', !r.eyebrow || r.eyebrow.toLowerCase() !== r.title.toLowerCase(), r);
}
await finish();
