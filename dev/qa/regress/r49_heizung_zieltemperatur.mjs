// @zustand: arbeit
// @parallel: ui
// Heizungs-Popup (Nutzertest 06.10.2026): Plus/Minus und Balken der Zieltemperatur reagierten nicht
// (Tablet und Handy, Touch und Maus). Ursache: Die Zieltemperatur steht in einer eigenen Karte ohne
// Casora-Baustein; button-card setzt dort ha-card.disabled (pointer-events:none). Außerdem fehlte die
// Zieltemperatur ganz, wenn die Heizung aus war. Prüft: im Modus „Aus“ ist die Zieltemperatur da,
// Antippen von Plus stellt sie ein und schaltet auf Heizen.
import { open, casoraDashboard, dashboard, cards, check, need, finish, atFinish, stable } from './lib.mjs';

const dash = await casoraDashboard();
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
const st = () => page.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return { m: s.state, t: s.attributes.temperature }; }, hit.id);
const before = await st();
const svc = (d, s, data) => page.evaluate(([d, s, data, id]) => document.querySelector('home-assistant').hass
  .callService(d, s, data, { entity_id: id }).then(() => 1, () => 0), [d, s, data, hit.id]);
atFinish(async () => {
  if (before.t != null) await svc('climate', 'set_temperature', { temperature: before.t });
  await svc('climate', 'set_hvac_mode', { hvac_mode: before.m });
});
await svc('climate', 'set_hvac_mode', { hvac_mode: 'off' });
await page.waitForTimeout(1200);
const tile = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect(); return { x: r.x + 40, y: r.y + r.height - 30 }; }, hit.i);
await page.waitForTimeout(500);
await page.touchscreen.tap(tile.x, tile.y);
const btns = await stable(page, () => window.__pierce('.hp-st-b').map((b) => { const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }).filter((b) => b.w > 0), null, { max: 5000 });
await check('Heizung aus: Zieltemperatur mit Plus/Minus sichtbar', btns && btns.length === 2, btns);
if (btns && btns.length === 2) {
  const plus = btns[1];
  // Der Tipp muss den Knopf selbst treffen, nicht eine Fläche darüber/darunter.
  const onBtn = await page.evaluate(({ x, y }) => { let d = document.elementFromPoint(x, y);
    for (let k = 0; k < 30 && d && d.shadowRoot; k++) { const n = d.shadowRoot.elementFromPoint(x, y); if (!n || n === d) break; d = n; }
    return !!(d && d.closest && d.closest('.hp-st-b')); }, plus);
  await check('Plus ist antippbar (Treffer liegt auf dem Knopf)', onBtn);
  await page.waitForTimeout(700);   // Popup-Tippschutz (600 ms nach dem Öffnen)
  await page.touchscreen.tap(plus.x, plus.y);
  let after = await st();
  for (let k = 0; k < 20 && after.m === 'off'; k++) { await page.waitForTimeout(250); after = await st(); }
  await check('Plus schaltet auf Heizen', after.m === 'heat', after);
}
await finish();
