// @zustand: demo
// Gewünscht (07.10.2026): Beim Scharfschalten fragt Casora nach, wenn ein Fenster/eine Tür offen
// oder ein Schloss entriegelt ist („Achtung: 1 Fenster offen – Trotzdem scharf schalten?“).
// Erwartet: offenes Fenster → Dialog, „Abbrechen“ lässt die Anlage unscharf; alles zu → kein Dialog.
// Zustände werden nur im Browser untergeschoben; scharf geschaltet wird nie wirklich.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, call, BASE } from './lib.mjs';

const dash = await casoraDashboard((d) => /alarm_control_panel\./.test(JSON.stringify(d.config.views || [])));
await need('Casora-Dashboard mit Alarmanlage', dash);
const { page, token } = await open({ width: 1600, height: 1000, dark: false });
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));

const info = await page.evaluate(() => {
  const hass = document.querySelector('home-assistant').hass, S = hass.states;
  const ids = window.casoraArmIds(window._casoraLovelaceCfg(), hass.user);
  const flat = [].concat(...ids.map((id) => (id.startsWith('binary_sensor.') && Array.isArray(S[id]?.attributes?.entity_id)) ? S[id].attributes.entity_id : [id]));
  return { flat, alarm: Object.keys(S).find((e) => e.startsWith('alarm_control_panel.')) };
});
const contacts = info.flat.filter((e) => e.startsWith('binary_sensor.'));
const locks = info.flat.filter((e) => e.startsWith('lock.'));
await need('Alarmanlage und Fenster/Türen im Sicherheits-Badge', info.alarm && contacts.length, info);

// Echte Anlage unscharf (Ausgangslage), danach nur im Browser umstellen.
await call(token, 'alarm_control_panel', 'alarm_disarm', { entity_id: info.alarm });
const allClosed = Object.fromEntries([...contacts.map((e) => [e, { state: 'off' }]), ...locks.map((e) => [e, { state: 'locked' }])]);
const win = await page.evaluate((c) => {
  const S = document.querySelector('home-assistant').hass.states;
  return c.find((e) => S[e]?.attributes?.device_class === 'window' && !/kipp|tilt|kombi/i.test(e + ' ' + (S[e].attributes.friendly_name || ''))) || c[0];
}, contacts);
await fakeStates(page, { ...allClosed, [win]: { state: 'on' }, [info.alarm]: { state: 'disarmed' } }, { sticky: true });

const dialog = () => page.evaluate(() => {
  const h = document.querySelector('.casora-askfirst');
  return h && h.shadowRoot ? { title: h.shadowRoot.querySelector('h2').textContent, text: h.shadowRoot.querySelector('p').textContent } : null;
});
// 1) Offenes Fenster: der echte Dienstaufruf (wie Kachel/Popup) wartet auf die Rückfrage.
await page.evaluate((a) => { window.__qaArm = document.querySelector('home-assistant').hass
  .callService('alarm_control_panel', 'alarm_arm_away', { entity_id: a }).then((r) => r, (e) => ({ err: String(e && e.message || e) })); }, info.alarm);
await page.waitForTimeout(800);
const d1 = await dialog();
await check('offenes Fenster → Rückfrage vor dem Scharfschalten', d1 && /Achtung/.test(d1.title) && /Fenster/.test(d1.title)
  && /Trotzdem scharf schalten/.test(d1.text), d1);
if (d1) await page.locator('.casora-askfirst button.no').click();
const r1 = await page.evaluate(() => window.__qaArm);
await check('Abbrechen ist kein Fehler', r1 && !r1.err, r1);
await page.waitForTimeout(1500);
const real = await (await fetch(`${BASE}/api/states/${info.alarm}`, { headers: { Authorization: 'Bearer ' + token } })).json();
await check('Abbrechen lässt die Anlage unscharf', real.state === 'disarmed', real.state);

// 2) Alles zu: keine Rückfrage. Geprüft an einer Ersatz-Verbindung, damit nichts scharf geschaltet wird.
await fakeStates(page, { ...allClosed, [info.alarm]: { state: 'disarmed' } }, { sticky: true });
const r2 = await page.evaluate(async (a) => {
  const sent = [];
  const conn = { sendMessagePromise(m) { sent.push(m.service); return Promise.resolve({}); } };
  window.__casoraArmGuard(conn);
  await conn.sendMessagePromise({ type: 'call_service', domain: 'alarm_control_panel', service: 'alarm_arm_home', service_data: { entity_id: a } });
  return { sent, dialog: !!document.querySelector('.casora-askfirst') };
}, info.alarm);
await check('alles zu → kein Dialog, Scharfschalten geht durch', !r2.dialog && r2.sent.join() === 'alarm_arm_home', r2);
await finish();
