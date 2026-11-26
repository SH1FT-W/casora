// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/46-screensaver.js#wakeNow,wake,_wakeSync,nightHtml custom_components/casora/panel/casora-panel.js#tabletRoomFirst custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview
// Wake on presence: Studio › Settings › Screensaver has „Wake on“ (a binary_sensor; off by default, a draft like every
// setting). On the tablet (here ?casora_saver=1) the sensor turning on ends the screensaver and brings Home back; at
// night only the dimmed clock shows, a touch ends it; window.casoraScreensaver.wake() ends it from outside.
import { ws, tokens } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, dashboard, check, need, finish, atFinish, BASE } from './lib.mjs';

const dash = await studioDashboard();
await need('Dashboard fürs Studio', dash);
const SENSOR = 'binary_sensor.qa_wake_motion';
const { access_token: TK } = await tokens();
const rest = (method, body) => fetch(BASE + '/api/states/' + SENSOR, { method, headers: { Authorization: 'Bearer ' + TK, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
await rest('POST', { state: 'off', attributes: { friendly_name: 'QA Flur Bewegung', device_class: 'motion' } });
const c = await ws();
const before = await c.cmd({ type: 'lovelace/config', url_path: dash });
atFinish(async () => { await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: before }); c.close(); await rest('DELETE'); });
await need('Dashboard mit zwei Ansichten', (before.views || []).length >= 2);

const o = await open({ width: 1440, height: 900, dark: false });
const page = o.page;
usePage(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await dashboard(page, dash);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);

// Studio: the field is there, empty (off), the screen switch only once a sensor is picked; the test sensor is offered.
await P(`for (const r of p._state.compact.rooms) { r.variables.casora_screensaver = '5'; delete r.variables.casora_screensaver_wake; }`);
await P(`p._csShow('n-saver')`);
await wait(2000);
const field = await P(`const r = p.shadowRoot, row = r.querySelector('[data-key="casora_screensaver_wake"]');
  const list = p._rankedEntityList(['binary_sensor'], ['motion', 'occupancy', 'presence'], null, '', undefined);
  return { row: !!row, value: row ? (row.querySelector('input') || {}).value || '' : null, screen: !!r.querySelector('[data-key="casora_screensaver_wake_screen"]'),
    offered: list.includes(arg) };`, SENSOR);
await check('Studio: „Aufwecken bei“ da, leer; Bildschirm-Schalter erst mit Sensor; Testmelder wählbar',
  field.row && !field.value && !field.screen && field.offered, JSON.stringify(field));
await P('if (p._csDirty() || p._isDirty()) await p._csDiscardAll();').catch(() => {});
const mid = await c.cmd({ type: 'lovelace/config', url_path: dash });
await check('nichts gespeichert', JSON.stringify(mid) === JSON.stringify(before));

// Dashboard with the sensor picked, opened on the second view.
const cfg = JSON.parse(JSON.stringify(before));
for (const v of cfg.views || []) { const h = (v.cards || [])[0]; if (h && h.variables) { h.variables.casora_screensaver_wake = SENSOR; h.variables.casora_screensaver_kind = 'wort'; } }
await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: cfg });
const second = cfg.views[1].path || '1';
await dashboard(page, dash + '/' + second + '?casora_saver=1');
await wait(6000); // the five-second loop subscribes
await page.evaluate(() => window._casoraSaver.start());
await wait(1000);
await check('Bildschirmschoner läuft', await page.evaluate(() => window._casoraSaver.shown()));
const hour = await page.evaluate(() => new Date().getHours());
await rest('POST', { state: 'on', attributes: { friendly_name: 'QA Flur Bewegung', device_class: 'motion' } });
await wait(2500);
const after = await page.evaluate(() => ({ shown: window._casoraSaver.shown(), night: !!document.querySelector('.cs-sv-layer .cs-night'), path: location.pathname }));
const homePath = '/' + dash + '/' + ((cfg.views.find((v) => v.path === 'home') || cfg.views[0]).path || '0');
if (hour >= 22 || hour < 5) await check('Bewegung nachts: gedimmte Uhr', after.shown && after.night, JSON.stringify(after));
else await check('Bewegung am Tag: Schoner aus, Zuhause', !after.shown && after.path === homePath, JSON.stringify(after) + ' ' + homePath);
await rest('POST', { state: 'off', attributes: { friendly_name: 'QA Flur Bewegung', device_class: 'motion' } });
await page.evaluate(() => window.casoraScreensaver.wake('qa'));
await wait(500);

// Night, whatever the hour: the running screensaver gives way to the dimmed clock, black ground, low opacity; it stays through the loop, a touch ends it.
const night = await page.evaluate(() => {
  window._casoraSaver.start();
  const phase = window._casoraSaver.wakeNow(new Date(2026, 10, 22, 23, 30));
  const t = document.querySelector('.cs-sv-layer .cs-night-t');
  return { phase, shown: window._casoraSaver.shown(), text: t ? t.textContent : '', op: t ? getComputedStyle(t).opacity : '' };
});
await check('nachts: nur die gedimmte Uhr', night.phase === 'night' && night.shown && /\d:\d\d/.test(night.text) && Number(night.op) <= 0.35, JSON.stringify(night));
await wait(6000);
await check('bleibt über den 5-s-Takt', await page.evaluate(() => window._casoraSaver.shown()));
await page.mouse.click(400, 300);
await wait(800);
await check('Berührung beendet die Nachtuhr', !(await page.evaluate(() => window._casoraSaver.shown())));
const api = await page.evaluate(() => { window._casoraSaver.start(); const a = window._casoraSaver.shown(); const r = window.casoraScreensaver.wake('doorbell'); return { a, r, b: window._casoraSaver.shown() }; });
await check('casoraScreensaver.wake() beendet den Schoner von außen', api.a && api.r === true && !api.b, JSON.stringify(api));
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
