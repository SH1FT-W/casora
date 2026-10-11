// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js
// Gemeldet 10.10.2026: Im Gruppen-Thermostat (z. B. Fußbodenheizung über mehrere Räume) ergaben große
// Zieltemperatur, Balken und −/+ wenig Sinn – Räume werden meist unterschiedlich eingestellt.
// Erwartet (Theme „Casora“, Desktop): Gruppen-Popup (casora_popup_fbh und casora_thermostat, Gruppe über
// member_entities und über entity_id) ohne Sollwert-Stepper, Balken und −/+, dafür Raum-Zeilen und im Kopf
// die Spanne der Ziele („21–23°“). Ein Raum aus der Liste öffnet sein Popup mit Stepper und Balken;
// ein Einzel-Thermostat behält alle drei.
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';

process.env.CASORA_THEME = 'Casora';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
await dashboard(page, dash.url + '/' + ((dash.config.views[0] || {}).path || '0'), 3);

const pick = await page.evaluate(() => {
  const st = document.querySelector('home-assistant').hass.states;
  const ids = Object.keys(st).filter((i) => /^climate\./.test(i));
  const grp = ids.find((i) => Array.isArray(st[i].attributes.member_entities) || Array.isArray(st[i].attributes.entity_id));
  const mem = grp ? (st[grp].attributes.member_entities || st[grp].attributes.entity_id).filter((m) => st[m]) : [];
  const single = ids.find((i) => i !== grp && (st[i].attributes.hvac_modes || []).includes('heat'));
  return { grp, mem, single };
});
await need('eine Klima-Gruppe mit mindestens 2 Räumen und ein einzelnes Thermostat', pick.grp && pick.mem.length >= 2 && pick.single, pick);

// Gruppe an, Räume mit unterschiedlichen Zielen (nur im Browser).
const patch = { [pick.grp]: { state: 'heat', attributes: { temperature: 22, hvac_action: 'heating' } } };
pick.mem.forEach((m, i) => { patch[m] = { state: 'heat', attributes: { temperature: i % 2 ? 23 : 21, current_temperature: 20.5, hvac_action: 'idle' } }; });
if (!pick.mem.includes(pick.single)) patch[pick.single] = { state: 'heat', attributes: { temperature: 21, current_temperature: 20.5 } };
await fakeStates(page, patch, { sticky: true });

const openPop = async (id, tpl) => {
  await page.evaluate(([id, tpl]) => new Promise((res) => {
    if (window.casoraPopup) window.casoraPopup.close();
    setTimeout(() => window._casoraNotifyOpenViaCard(id, res, { type: 'custom:button-card', template: tpl, entity: id, name: 'Heizung', variables: {} }), 500);
  }), [id, tpl]);
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; const r = s && s.getBoundingClientRect(); return r && r.height > 100; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2200);
};
// Sichtbare Bedienteile im offenen Popup.
const parts = () => page.evaluate(() => {
  const vis = (sel) => window.__pierce(sel).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const pop = window.casoraPopup && window.casoraPopup.surface;
  const txt = [];
  (function walk(n) { for (const ch of (n.children || [])) { if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } if (n.nodeType === 1 && !n.children.length && n.textContent) txt.push(n.textContent); })(pop ? (pop.shadowRoot || pop) : document.body);
  return {
    plusMinus: vis('.fb-st-b, .hp-st-b').length,
    zahl: vis('.fb-st-v .n, .hp-st-v .n').length,
    balken: vis('.fb-tb, .hp-tb').length,
    raeume: vis('[data-fbh-room]').length + vis('.hui-row[data-casora-mi^="climate."]').length,
    text: txt.join(' | ').replace(/\s+/g, ' '),
  };
});

const FBH = ['casora_thermostat', 'casora_popup_fbh'];
const groupCase = async (label, tpl) => {
  await openPop(pick.grp, tpl);
  const p = await parts();
  await check(`${label}: kein −/+ (${p.plusMinus})`, p.plusMinus === 0, p);
  await check(`${label}: keine große Zieltemperatur (${p.zahl})`, p.zahl === 0, p);
  await check(`${label}: kein Balken (${p.balken})`, p.balken === 0, p);
  await check(`${label}: Raum-Zeilen da (${p.raeume})`, p.raeume >= 2, p);
  await check(`${label}: Kopf fasst die Ziele zusammen („21–23°“)`, /21–23°/.test(p.text), p.text.slice(0, 300));
};
await groupCase('Fußbodenheizung (member_entities)', FBH);
await groupCase('Thermostat-Popup Gruppe (member_entities)', ['casora_thermostat']);

// Raum-Zeile antippen → Raum-Popup mit Stepper und Balken.
await openPop(pick.grp, FBH);
const row = await page.evaluate(() => { const e = window.__pierce('[data-fbh-room]').find((x) => x.getBoundingClientRect().width > 0);
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await need('Raum-Zeile sichtbar', row);
await page.waitForTimeout(700);   // Popup-Tippschutz
await page.mouse.click(row.x, row.y);
await page.waitForTimeout(2600);
let p = await parts();
await check(`Raum aus der Liste: −/+ und Zieltemperatur (${p.plusMinus}/${p.zahl})`, p.plusMinus === 2 && p.zahl === 1, p);
await check(`Raum aus der Liste: Balken (${p.balken})`, p.balken === 1, p);

// Einzel-Thermostat unverändert.
await openPop(pick.single, ['casora_thermostat']);
p = await parts();
await check(`Einzel-Thermostat: −/+, Zieltemperatur, Balken (${p.plusMinus}/${p.zahl}/${p.balken})`, p.plusMinus === 2 && p.zahl === 1 && p.balken === 1, p);
await openPop(pick.single, FBH);
p = await parts();
await check(`Einzelraum (FBH-Popup): −/+, Zieltemperatur, Balken (${p.plusMinus}/${p.zahl}/${p.balken})`, p.plusMinus === 2 && p.zahl === 1 && p.balken === 1, p);

// Gruppe im HA-Gruppen-Stil (entity_id statt member_entities).
await fakeStates(page, { ...patch, [pick.grp]: { state: 'heat', attributes: { temperature: 22, member_entities: null, entity_id: pick.mem } } }, { sticky: true });
await groupCase('Fußbodenheizung (entity_id)', FBH);
await groupCase('Thermostat-Popup Gruppe (entity_id)', ['casora_thermostat']);

await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {});
await finish();
