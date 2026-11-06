// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#stage
// Owner, Test-HA 06.11.2026: the glow under the active mode of a heating dial („Heizen“) ended in a straight edge –
// the stage card's own ha-card (overflow hidden) cut it off just below the moon. Expected: no ancestor up to the
// popup's surface clips within the glow (30 px below the moon).
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile && JSON.stringify(d.config).includes('casora_thermostat'));
await need('ein Casora-Dashboard mit Thermostat', dash);
const { page } = await open({ width: 1440, height: 900 });
let hit = null;
for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
  await dashboard(page, dash.url + '/' + v, 3);
  hit = await page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => {
      const c = x._config || {}, e = document.querySelector('home-assistant').hass.states[c.entity];
      return [].concat(c.template || []).includes('casora_thermostat') && e && !(e.attributes || {}).member_entities
        && (e.attributes.hvac_modes || []).includes('heat') && x.getBoundingClientRect().width > 40;
    });
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { id: b._config.entity, x: r.x + 40, y: r.y + r.height - 30 };
  });
  if (hit) break;
}
await need('eine Thermostat-Kachel mit Heizen', hit);
const svc = (s, data) => page.evaluate(([s, data, id]) => document.querySelector('home-assistant').hass
  .callService('climate', s, data, { entity_id: id }).then(() => 1, () => 0), [s, data, hit.id]);
const before = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, hit.id);
atFinish(() => svc('set_hvac_mode', { hvac_mode: before }));
await svc('set_hvac_mode', { hvac_mode: 'heat' });
await page.waitForTimeout(1200);
await page.mouse.click(hit.x, hit.y);
const clip = await stable(page, () => {
  const m = window.__pierce('.hui-moon.on')[0];
  if (!m) return null;
  const glow = m.getBoundingClientRect().bottom + 30, out = [];
  for (let n = m; n && n.localName !== 'html'; ) {
    if (n.nodeType === 1 && n.classList && n.classList.contains('surface')) break;
    const cs = n.nodeType === 1 ? getComputedStyle(n) : null;
    if (cs && cs.overflowY !== 'visible' && n.getBoundingClientRect().bottom < glow) out.push(n.localName + '.' + String(n.className || '').slice(0, 30));
    n = n.parentNode || n.host;
    if (n && n.nodeType === 11) n = n.host;
  }
  return out;
}, null, { max: 8000 });
await need('Drehrad mit aktivem Modus', Array.isArray(clip), clip);
await check('kein Rahmen schneidet den Schein unter dem aktiven Modus ab', clip.length === 0, clip);
await finish();
