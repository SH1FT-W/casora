// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js
// Gemeldet 10.10.2026: Im Gruppen-Thermostat (z. B. Fußbodenheizung über mehrere Räume) ergaben große
// Zieltemperatur, Balken und −/+ wenig Sinn – Räume werden meist unterschiedlich eingestellt.
// Erwartet (Theme „Casora“, Desktop): Gruppen-Popup (casora_popup_fbh und casora_thermostat, Gruppe über
// member_entities und über entity_id) ohne Sollwert-Stepper, Balken und −/+, dafür Raum-Zeilen und im Kopf
// die Spanne der Ziele („21–23°“). Ein Raum aus der Liste öffnet sein Popup mit Stepper und Balken;
// ein Einzel-Thermostat behält alle drei.
// Popup v3 (richtlinien §4.4, 28.10.2026) reverses the group part on purpose: the group stage is the shared target
// („Ziel aller Räume“, different targets their mean with „Ø“) and − / + move every room; the bar is now the dial.
// Kept: room rows that open the room with its own stepper, the head sums up the targets, single thermostats keep all.
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
    plusMinus: vis('.fb-st-b, .hp-st-b, .hui-st-b').length,
    zahl: vis('.fb-st-v .n, .hp-st-v .n').length,
    balken: vis('.fb-tb, .hp-tb, .hui-dl[role="slider"]').length,
    rad: vis('.hui-dl').length,
    cap: vis('.hui-dl-cap').map((e) => e.textContent.trim()).join(' '),
    raeume: vis('[data-fbh-room]').length + vis('.hui-row[data-casora-mi^="climate."]').length,
    text: txt.join(' | ').replace(/\s+/g, ' '),
  };
});

const FBH = ['casora_thermostat', 'casora_popup_fbh'];
// shared: the floor heating popup (FBH) follows §4.4 with a shared target; the thermostat template's group view
// still has no shared target (1.3 rule, rooms one by one) – its stage is the group line without − / +.
const groupCase = async (label, tpl, shared) => {
  await openPop(pick.grp, tpl);
  const p = await parts();
  if (shared) {
    await check(`${label}: −/+ für alle Räume (${p.plusMinus})`, p.plusMinus === 2, p);
    await check(`${label}: eine Zieltemperatur auf dem Rad (${p.zahl}/${p.rad})`, p.zahl === 1 && p.rad === 1, p);
    await check(`${label}: Rad sagt „Ø Ziel aller Räume“ bei unterschiedlichen Zielen (${p.cap})`, /Ø Ziel aller Räume/.test(p.cap), p.cap);
  } else {
    await check(`${label}: kein −/+ (${p.plusMinus})`, p.plusMinus === 0, p);
    await check(`${label}: keine einzelne Zieltemperatur (${p.zahl})`, p.zahl === 0, p);
  }
  await check(`${label}: Raum-Zeilen da (${p.raeume})`, p.raeume >= 2, p);
  await check(`${label}: Kopf fasst die Ziele zusammen („21–23°“)`, /21–23°/.test(p.text), p.text.slice(0, 300));
};
await groupCase('Fußbodenheizung (member_entities)', FBH, true);
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
await groupCase('Fußbodenheizung (entity_id)', FBH, true);
await groupCase('Thermostat-Popup Gruppe (entity_id)', ['casora_thermostat']);

await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {});
await finish();
