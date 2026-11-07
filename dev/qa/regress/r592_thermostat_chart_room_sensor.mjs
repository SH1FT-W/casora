// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraThermoChart custom_components/casora/scripts/local/01-basis.js#casoraThermoHistoryOf,casoraRoomTempIds,casoraRoomTempOf
// User test, 07.11.2026 (qa-arbeit, desktop): the popup of a thermostat without a sensor on its tile, in a room whose
// header lists one temperature sensor. Tile and dial read „Jetzt 21,4 °C“ (the room's sensor, as its Klima badge), the
// Verlauf under the dial „21,0 °C Jetzt“ (the thermostat's current_temperature). Expected: the Verlauf draws the sensor
// the dial reads, its „Jetzt“ is the dial's. Desktop 1440×900, nothing is switched or saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const dash = await casoraDashboard((d) => d.url === (process.env.CASORA_QA_DASH || 'qa-arbeit')) || await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
// A room whose header lists a thermostat and exactly one temperature sensor, the thermostat's tile without its own.
const heroOf = (v) => (v.cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
const tileIn = (x, id, d = 0) => {
  if (!x || typeof x !== 'object' || d > 8) return null;
  if (Array.isArray(x)) { for (const y of x) { const r = tileIn(y, id, d + 1); if (r) return r; } return null; }
  if ([].concat(x.template || []).includes('casora_thermostat') && x.entity === id) return x;
  return tileIn(x.cards, id, d + 1) || tileIn(x.card, id, d + 1);
};
let pick = null;
for (const v of (dash.config.views || []).slice(1)) {
  const V = (heroOf(v) || {}).variables || {};
  const sensors = Array.from({ length: 10 }, (_, i) => V['temp_sensor_' + (i + 1)]).filter(Boolean);
  if (sensors.length !== 1) continue;
  for (const k of Object.keys(V).filter((x) => /^climate_entity_\d+$/.test(x))) {
    const t = tileIn(v.cards, V[k]);
    if (t && !(t.variables || {}).temp_sensor) { pick = { path: v.path, id: V[k], sensor: sensors[0] }; break; }
  }
  if (pick) break;
}
await need('a thermostat tile without its own sensor in a room with one temperature sensor', pick);

const o = await open({ width: 1440, height: 900, dark: true });
const pg = o.page; usePage(pg);
await dashboard(pg, dash.url + '/' + pick.path, 3);
const st = await pg.evaluate((p) => { const S = document.querySelector('home-assistant').hass.states; return { s: S[p.sensor] && S[p.sensor].state, c: S[p.id] && S[p.id].attributes.current_temperature }; }, pick);
// Only telling when the room sensor and the thermostat read differently (the reported 21,4 against 21,0).
await need('room sensor and thermostat read differently', st.s != null && Math.round(parseFloat(st.s) * 10) !== Math.round(parseFloat(st.c) * 10), st);
const at = await pg.evaluate((id) => {
  const b = window.__pierce('button-card').find((x) => x.getBoundingClientRect().width > 40 && (x._config || {}).entity === id
    && [].concat((x._config || {}).template || []).includes('casora_thermostat'));
  if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 3 };
}, pick.id);
await need('thermostat tile', at);
await pg.mouse.click(at.x, at.y);
let r = null;
for (let i = 0; i < 40 && !(r && r.chart && r.head); i++) {
  await pg.waitForTimeout(300);
  r = await pg.evaluate(() => {
    const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
    const dial = window.__pierce('*').map((x) => x.textContent || '').find((t) => /^\s*Jetzt\s+-?\d+,\d\s*°C\s*$/.test(t)) || null;
    const ch = window.__pierce('casora-chart').find((x) => x.getBoundingClientRect().width > 40);
    const cfg = ch && ch._c;
    // The Verlauf's reading: the chart's own text (style left out) and its plate around it.
    const own = ch && ch.shadowRoot ? [...ch.shadowRoot.childNodes].filter((n) => n.nodeName !== 'STYLE').map((n) => n.textContent || '').join(' ') : '';
    const plate = ch && ch.parentElement && ch.parentElement.parentElement ? ch.parentElement.parentElement.textContent || '' : '';
    const head = (own + ' ' + plate).replace(/\s+/g, ' ');
    return { dial: dial && dial.trim(), chart: cfg && cfg.series && cfg.series[0] ? { entity: cfg.series[0].entity, attribute: cfg.series[0].attribute || null } : null, head: head.slice(0, 160) };
  });
}
await shot('thermostat_popup');
await need('popup with dial and Verlauf', r && r.dial && r.chart, r);
await check('the Verlauf draws the room sensor the dial reads', r.chart.entity === pick.sensor && !r.chart.attribute, { chart: r.chart, sensor: pick.sensor });
const dialV = (r.dial.match(/-?\d+,\d/) || [])[0];
await check('the Verlauf\'s „Jetzt“ is the dial\'s (' + r.dial + ')', !!dialV && r.head.includes(dialV), { dial: r.dial, chart: r.head });
await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
await finish();
