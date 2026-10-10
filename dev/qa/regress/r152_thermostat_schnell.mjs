// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet (Personas 10.10.2026, per-02): Thermostat-Popup – 4 schnelle Tipps auf „+“ (150 ms Abstand)
// ergaben +1,0 °C statt +2,0. Die 400-ms-Sperre schluckte Tipps, und bis zum Neuzeichnen trug die Taste
// noch das alte Ziel. Erwartet: jeder Tipp zählt – per Finger (Plus) und per Maus (Minus).
// CASORA_LOCAL=1: casora_thermostat aus diesem Checkout nur im Browser unterschieben.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';

const LOCAL_TPL = process.env.CASORA_LOCAL
  ? JSON.parse(fs.readFileSync(new URL('../../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'))
  : null;
const dash = await casoraDashboard((d) => !d.mobile && JSON.stringify(d.config).includes('casora_thermostat'));
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1180, height: 820, touch: true });
let hit = null;
for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
  await dashboard(page, dash.url + '/' + v, 3);
  const list = await page.evaluate(() => window.__pierce('button-card').map((b, i) => {
    const c = b._config || {}; const t = [].concat(c.template || []);
    const e = b._stateObj || (b.hass && b.hass.states[c.entity]);
    const r = b.getBoundingClientRect();
    return { i, t, id: c.entity, grp: !!(e && e.attributes && e.attributes.member_entities), heat: !!(e && (e.attributes.hvac_modes || []).includes('heat')), w: r.width };
  }).filter((c) => c.t.includes('casora_thermostat') && !c.t.includes('casora_popup_fbh') && c.id && !c.grp && c.heat && c.w > 40));
  if (list.length) { hit = { v, ...list[0] }; break; }
}
await need('eine Thermostat-Kachel (einzelnes Gerät mit Heizen)', hit);
if (LOCAL_TPL) {
  await page.evaluate((T) => {
    const pl = window.__pierce('ha-panel-lovelace')[0];
    const L = pl.lovelace;
    pl._setLovelaceConfig({ ...L.config, button_card_templates: { ...(L.config.button_card_templates || {}), casora_thermostat: T.casora_thermostat } }, L.rawConfig, L.mode);
  }, LOCAL_TPL);
  await page.waitForTimeout(2500);
}
const st = () => page.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return { m: s.state, t: s.attributes.temperature, step: s.attributes.target_temp_step || 0.5 }; }, hit.id);
const before = await st();
const svc = (d, s, data) => page.evaluate(([d, s, data, id]) => document.querySelector('home-assistant').hass
  .callService(d, s, data, { entity_id: id }).then(() => 1, () => 0), [d, s, data, hit.id]);
atFinish(async () => {
  if (before.t != null) await svc('climate', 'set_temperature', { temperature: before.t });
  await svc('climate', 'set_hvac_mode', { hvac_mode: before.m });
});
await svc('climate', 'set_hvac_mode', { hvac_mode: 'heat' });
await svc('climate', 'set_temperature', { temperature: 20 });
await page.waitForTimeout(1200);
const tile = await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id
    && [].concat(x._config.template || []).includes('casora_thermostat') && x.getBoundingClientRect().width > 40);
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height - 30 }; }, hit.id);
await page.waitForTimeout(500);
await page.touchscreen.tap(tile.x, tile.y);
const btns = await stable(page, () => window.__pierce('.hp-st-b').map((b) => { const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }).filter((b) => b.w > 0), null, { max: 5000 });
await need('Plus/Minus sichtbar', btns && btns.length === 2, btns);
await page.waitForTimeout(700);   // Popup-Tippschutz
const settle = async (want) => { let s = await st(); for (let k = 0; k < 20 && s.t !== want; k++) { await page.waitForTimeout(250); s = await st(); } await page.waitForTimeout(800); return st(); };
const step = (await st()).step;
for (let k = 0; k < 4; k++) { await page.touchscreen.tap(btns[1].x, btns[1].y); await page.waitForTimeout(150); }
let s = await settle(20 + 4 * step);
await check('4 schnelle Finger-Tipps auf Plus: 20 → ' + (20 + 4 * step) + ' (ist ' + s.t + ')', s.t === 20 + 4 * step, s);
const shown = await page.evaluate(() => { const n = window.__pierce('.hp-st-v .n').find((e) => e.getBoundingClientRect().width > 0); return n ? n.textContent : null; });
await check('Anzeige zeigt das neue Ziel (' + shown + ')', shown && shown.replace(',', '.').includes(String((20 + 4 * step).toFixed(1))), shown);
const b2 = await page.evaluate(() => window.__pierce('.hp-st-b').map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }).filter((b) => b.w > 0));
for (let k = 0; k < 4; k++) { await page.mouse.click(b2[0].x, b2[0].y); await page.waitForTimeout(150); }
s = await settle(20);
await check('4 schnelle Mausklicks auf Minus: zurück auf 20 (ist ' + s.t + ')', s.t === 20, s);
await finish();
