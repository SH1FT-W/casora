// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js#_hpPlantShow,_hpChartInit
// Owner, Test-HA 06.11.2026: in the heating popup the temperature Verlauf did not react to the mouse or a finger –
// the reading stayed at „Jetzt“. The chart sits in a button-card without a tap action (ha-card „disabled“,
// pointer-events none), and the chart slot inherited that. Expected: pointing at the left of the chart reads an
// earlier time.
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
        && (e.attributes.hvac_modes || []).includes('heat') && (e.attributes || {}).current_temperature != null
        && x.getBoundingClientRect().width > 40;
    });
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { id: b._config.entity, x: r.x + 40, y: r.y + r.height - 30 };
  });
  if (hit) break;
}
await need('eine Thermostat-Kachel mit Temperatur', hit);
const before = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, hit.id);
const svc = (s, data) => page.evaluate(([s, data, id]) => document.querySelector('home-assistant').hass
  .callService('climate', s, data, { entity_id: id }).then(() => 1, () => 0), [s, data, hit.id]);
atFinish(() => svc('set_hvac_mode', { hvac_mode: before }));
await svc('set_hvac_mode', { hvac_mode: 'heat' });
await page.waitForTimeout(1200);
await page.mouse.click(hit.x, hit.y);
const big = () => window.__pierce('casora-chart').find((x) => x.getBoundingClientRect().height > 80);
const ch = await stable(page, () => {
  const c = window.__pierce('casora-chart').find((x) => x.getBoundingClientRect().height > 80);
  if (!c || !c.shadowRoot.querySelector('.ro')) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, def: c.shadowRoot.querySelector('.ro').textContent };
}, null, { max: 10000 });
await need('Verlauf mit eigener Anzeige im Heizungs-Popup', ch, ch);
await page.waitForTimeout(800);
await page.mouse.move(ch.x + ch.w * 0.08, ch.y + ch.h * 0.65);
await page.waitForTimeout(400);
const read = await page.evaluate(`(${big})().shadowRoot.querySelector('.ro').textContent`);
await check('Zeigen links im Verlauf liest eine frühere Zeit', read && read !== ch.def && !/Jetzt$/.test(read), { def: ch.def, read });
await finish();
