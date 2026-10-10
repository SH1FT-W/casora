// @zustand: frisch
// @parallel: allein   (Umzug legt Dashboards an und ändert Helfer; am Ende zurückgestellt)
// @deckt: custom_components/casora/panel/casora-panel-umzug.js
// Umzug Hemma → Casora übernimmt Einstellungen aus den Hemma-Helfern (Umzug-Prüfung 10.10.2026):
// 1. Erster Umzug: Hemmas Werte landen in den (unberührten) Casora-Helfern; die Zieltemperatur
//    in °F (Hemma 2.1.2: 68–75) wird im °C-Haus NICHT geschrieben – vorher kam dafür auf dem
//    Fertig-Bildschirm der Fehler-Toast „Invalid value … (range 15.0 - 30.0)“.
// 2. Erneuter Umzug: in Casora geänderte Werte bleiben, die Glocke („gelesen bis“) geht nicht zurück.
// Am Ende: neue Dashboards weg, Helfer und Umzugs-Merker wie vorher.
import { open, ready, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const SRC = 'hemma-zuhause';
const c = await ws();
const dashes = (await c.cmd({ type: 'lovelace/dashboards/list' })).map((d) => d.url_path);
await need('Hemma-2-Dashboard ' + SRC + ' im Zustand frisch', dashes.includes(SRC));
// Hemma-Helfer wie Hemma 2.1.2 sie anlegt (Paket hemma_helpers.yaml) – fehlen sie (Zustand frisch hat
// kein Hemma-Paket), legt der Test sie als Helfer an und am Ende wieder weg.
const HEMMA_HELPERS = [
  ['input_boolean', 'dashboard_redirect', {}], ['input_boolean', 'motion_badges', {}], ['input_boolean', 'now_playing_minimized', {}],
  ['input_select', 'thermostat_mode', { options: ['heat', 'cool'] }],
  ['input_number', 'thermostat_target_temperature', { min: 68, max: 75, step: 1, unit_of_measurement: '°F' }],
  ['input_datetime', 'notifications_read', { has_date: true, has_time: true }],
];
const created = [];
{
  const have = new Set((await c.cmd({ type: 'get_states' })).map((s) => s.entity_id));
  for (const [dom, key, extra] of HEMMA_HELPERS) {
    if (have.has(dom + '.hemma_' + key)) continue;
    const item = await c.cmd({ type: dom + '/create', name: 'hemma_' + key, ...extra });
    created.push([dom, item.id]);
  }
  if (created.length) await new Promise((res) => setTimeout(res, 1500));
}
atFinish(async () => { const c3 = await ws(); for (const [dom, id] of created) { try { await c3.cmd({ type: dom + '/delete', [dom + '_id']: id }); } catch (e) { /* weg */ } } c3.close(); });
const S0 = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
const H = (k) => S0['input_' + k.replace('.', '.hemma_')], C = (k) => S0['input_' + k.replace('.', '.casora_')];
const KEYS = ['boolean.dashboard_redirect', 'boolean.motion_badges', 'boolean.now_playing_minimized', 'select.thermostat_mode',
  'number.thermostat_target_temperature', 'datetime.notifications_read'];
await need('Hemma- und Casora-Helfer vorhanden', KEYS.every((k) => H(k) && C(k)), KEYS.filter((k) => !H(k) || !C(k)));
const settings0 = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
const made = [];

// Helfer setzen (WS ohne Toast) und am Ende zurückstellen.
const set = async (eid, st) => {
  const [dom] = eid.split('.');
  const call = (service, data) => c.cmd({ type: 'call_service', domain: dom, service, service_data: { entity_id: eid, ...data } });
  if (dom === 'input_boolean') return call(st === 'on' ? 'turn_on' : 'turn_off', {});
  if (dom === 'input_select') return call('select_option', { option: st });
  if (dom === 'input_number') return call('set_value', { value: Number(st) });
  if (dom === 'input_datetime') return call('set_datetime', { datetime: st });
};
atFinish(async () => {
  const c2 = await ws();
  for (const k of KEYS) for (const s of [H(k), C(k)]) {
    try { await c2.cmd({ type: 'call_service', domain: s.entity_id.split('.')[0], ...(() => {
      const d = s.entity_id.split('.')[0];
      if (d === 'input_boolean') return { service: s.state === 'on' ? 'turn_on' : 'turn_off', service_data: { entity_id: s.entity_id } };
      if (d === 'input_select') return { service: 'select_option', service_data: { entity_id: s.entity_id, option: s.state } };
      if (d === 'input_number') return { service: 'set_value', service_data: { entity_id: s.entity_id, value: Number(s.state) } };
      return { service: 'set_datetime', service_data: { entity_id: s.entity_id, datetime: s.state } };
    })() }); } catch (e) { /* weiter */ }
  }
  for (const d of await c2.cmd({ type: 'lovelace/dashboards/list' }))
    if (made.includes(d.url_path) && !dashes.includes(d.url_path)) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  const s1 = (await c2.cmd({ type: 'casora/settings/get' })).settings || {};
  if (settings0.umzug) s1.umzug = settings0.umzug; else delete s1.umzug;
  await c2.cmd({ type: 'casora/settings/set', settings: s1 });
  c2.close();
});

const tMin = C('number.thermostat_target_temperature').attributes.min;
const fahrenheit = H('number.thermostat_target_temperature').attributes.unit_of_measurement !== C('number.thermostat_target_temperature').attributes.unit_of_measurement;
// Ausgangslage 1: Casora unberührt, Hemma mit eigenen Werten.
await set('input_boolean.casora_dashboard_redirect', 'on'); await set('input_boolean.hemma_dashboard_redirect', 'off');
await set('input_boolean.casora_motion_badges', 'on'); await set('input_boolean.hemma_motion_badges', 'off');
await set('input_boolean.casora_now_playing_minimized', 'off'); await set('input_boolean.hemma_now_playing_minimized', 'on');
await set('input_select.casora_thermostat_mode', 'heat'); await set('input_select.hemma_thermostat_mode', 'cool');
await set('input_number.casora_thermostat_target_temperature', tMin);
const hT = H('number.thermostat_target_temperature').attributes;
await set('input_number.hemma_thermostat_target_temperature', Math.min(Number(hT.max), Number(hT.min) + 3));
await set('input_datetime.casora_notifications_read', '2026-09-01 08:00:00'); await set('input_datetime.hemma_notifications_read', '2026-10-01 09:30:00');

const { page } = await open({ width: 1440, height: 900, umzug: true });
const move = (title) => page.evaluate(async ({ SRC, title }) => {
  const p = window.__panel(); const U = window.casoraUmzug;
  const list = await U.candidates(p, { includeDone: true });
  const a = await U.analyze(list.find((x) => x.url_path === SRC), await p._bundleOnce(), p._hass);
  a.newTitle = title;
  p._flowOpen('full');
  const done = new Promise((resolve) => { const o = p._flowDone; p._flowDone = function (x) { p._flowDone = o; const r = o.call(this, x); resolve(x && x.url_path); return r; }; });
  // Fehler-Toasts mitschreiben (HA zeigt fehlgeschlagene callService-Aufrufe so an).
  window.__toasts = [];
  const seen = new Set();
  // Der Toast-Text steckt im Schatten von ha-toast: tief nach kurzen Textknoten suchen.
  const scan = () => (function walk(root, d) { if (!root || d > 14) return; for (const e of root.querySelectorAll('*')) {
    if (e.shadowRoot) walk(e.shadowRoot, d + 1);
    const x = (e.children.length < 3 && e.textContent || '').trim();
    if (x && /konnte nicht ausgeführt|could not be performed|failed to (call|perform)|invalid value/i.test(x) && !seen.has(x)) { seen.add(x); window.__toasts.push(x.slice(0, 160)); } } })(document, 0);
  const iv = setInterval(scan, 150);
  p._casoraUmzugRun(a, {});
  const url = await Promise.race([done, new Promise((r) => setTimeout(() => r(null), 90000))]);
  await new Promise((r) => setTimeout(r, 4000));  // Helfer laufen nach dem Fertig-Bildschirm
  clearInterval(iv);
  return { url, toasts: window.__toasts };
}, { SRC, title });
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzugRun && window.casoraUmzug; });
const states = async () => Object.fromEntries((await c.cmd({ type: 'get_states' })).filter((s) => /^input_\w+\.casora_/.test(s.entity_id)).map((s) => [s.entity_id, s.state]));

const r1 = await move('QA Helfer eins');
await check('erster Umzug läuft durch', !!r1.url, r1);
if (r1.url) made.push(r1.url, r1.url + '-mobile');
await check('kein Fehler-Toast beim Umzug', !r1.toasts.some((t) => /invalid|ungültig|konnte nicht|failed/i.test(t)), r1.toasts);
let s = await states();
await check('Weiterleitung aufs Handy wie in Hemma (aus)', s['input_boolean.casora_dashboard_redirect'] === 'off', s['input_boolean.casora_dashboard_redirect']);
await check('Bewegungs-Badges wie in Hemma (aus)', s['input_boolean.casora_motion_badges'] === 'off');
await check('Player eingeklappt wie in Hemma', s['input_boolean.casora_now_playing_minimized'] === 'on');
await check('Thermostat-Modus wie in Hemma', s['input_select.casora_thermostat_mode'] === 'cool', s['input_select.casora_thermostat_mode']);
await check('Glocke: gelesen bis wie in Hemma (später)', s['input_datetime.casora_notifications_read'] === '2026-10-01 09:30:00', s['input_datetime.casora_notifications_read']);
if (fahrenheit) await check('Zieltemperatur in anderer Einheit nicht übernommen', Number(s['input_number.casora_thermostat_target_temperature']) === Number(tMin), s['input_number.casora_thermostat_target_temperature']);

// Ausgangslage 2: in Casora inzwischen geändert, Hemma unverändert alt → erneuter Umzug.
await set('input_boolean.casora_dashboard_redirect', 'on'); await set('input_boolean.hemma_dashboard_redirect', 'off');
await set('input_select.casora_thermostat_mode', 'heat');  // = Ausgangswert → darf wieder übernommen werden
await set('input_boolean.casora_motion_badges', 'on'); await set('input_boolean.hemma_motion_badges', 'on');
await set('input_boolean.casora_now_playing_minimized', 'on'); await set('input_boolean.hemma_now_playing_minimized', 'off');
await set('input_datetime.casora_notifications_read', '2026-10-05 07:00:00');
const r2 = await move('QA Helfer zwei');
await check('erneuter Umzug läuft durch', !!r2.url, r2);
if (r2.url) made.push(r2.url, r2.url + '-mobile');
s = await states();
await check('erneut: in Casora eingeklappter Player bleibt (Hemma „aus“ überschreibt nicht)', s['input_boolean.casora_now_playing_minimized'] === 'on');
await check('erneut: Glocke geht nicht zurück', s['input_datetime.casora_notifications_read'] === '2026-10-05 07:00:00', s['input_datetime.casora_notifications_read']);
await check('erneut: unberührter Wert kommt weiter mit (Modus)', s['input_select.casora_thermostat_mode'] === 'cool', s['input_select.casora_thermostat_mode']);
c.close();
await finish();
