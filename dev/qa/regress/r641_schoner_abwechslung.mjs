// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview custom_components/casora/scripts/local/46-screensaver.js#canStart,start,pool dashboards/casora/button_card_templates.json#casora_settings_button
// Screensaver, Hemma comparison 13.11.2026:
//   - Studio: under „One after the other“ a list of the twelve kinds without ticks (picked row filled), all picked
//     by default; a tap leaves one out (casora_screensaver_mix in the draft, every room); the last one back = all again.
//   - Studio: „Cover colour“ is a switch, off by default; no light switch (removed again, owner 13.11.2026).
//   - Dashboard: the ⋯ menu offers „Start screensaver“ on a tablet (here ?casora_saver=1), also without a start
//     time, and it starts it; it stays until a touch.
import { ws } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, dashboard, check, need, finish, atFinish, BASE } from './lib.mjs';

const dash = await studioDashboard();
await need('Dashboard fürs Studio', dash);
const c = await ws();
const before = await c.cmd({ type: 'lovelace/config', url_path: dash });
atFinish(async () => { await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: before }); c.close(); });

const o = await open({ width: 1440, height: 900, dark: false });
const page = o.page;
usePage(page);
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await dashboard(page, dash);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);
await P(`for (const r of p._state.compact.rooms) { r.variables.casora_screensaver = '5'; delete r.variables.casora_screensaver_kind; delete r.variables.casora_screensaver_mix; }`);
await P(`p._csShow('n-saver')`);
await wait(2000);
const list = () => P(`const r = p.shadowRoot; return { rows: [...r.querySelectorAll('.cs-saver-list[data-key="casora_screensaver_mix"] .cs-saver-row')].map((x) => [x.dataset.id, x.getAttribute('aria-pressed')]),
  ticks: r.querySelectorAll('.cs-saver-list .rcheck').length,
  vars: [...new Set(p._state.compact.rooms.map((x) => JSON.stringify(x.variables.casora_screensaver_mix ?? null)))] };`);
let l = await list();
await check('zwölf Arten in der Liste, alle gewählt, keine Haken', l.rows.length === 12 && l.rows.every((x) => x[1] === 'true') && l.ticks === 0, JSON.stringify(l).slice(0, 300));
await P(`p.shadowRoot.querySelector('.cs-saver-list .cs-saver-row[data-id="musik"]').click();`);
await wait(500);
l = await list();
await check('Tipp lässt eine weg (Entwurf, jeder Raum)', l.rows.find((x) => x[0] === 'musik')[1] === 'false' && l.vars.length === 1 && JSON.parse(l.vars[0]).length === 11 && !JSON.parse(l.vars[0]).includes('musik'), JSON.stringify(l.vars));
await P(`p.shadowRoot.querySelector('.cs-saver-list .cs-saver-row[data-id="musik"]').click();`);
await wait(500);
l = await list();
await check('wieder dazu: alle (Variable weg)', l.rows.every((x) => x[1] === 'true') && l.vars.length === 1 && l.vars[0] === 'null', JSON.stringify(l.vars));
const sw = await P(`const r = p.shadowRoot; return ['casora_screensaver_light', 'casora_screensaver_tint'].map((k) => !!r.querySelector('[data-key="' + k + '"]'));`);
await check('Schalter Coverfarbe da, kein Licht-Schalter', !sw[0] && sw[1], JSON.stringify(sw));
const mid = await c.cmd({ type: 'lovelace/config', url_path: dash });
await check('nichts gespeichert', JSON.stringify(mid) === JSON.stringify(before));
await P('if (p._csDirty() || p._isDirty()) await p._csDiscardAll();').catch(() => {});

// The ⋯ menu: the entry also without a start time; it starts the screensaver, which stays until a touch.
const menu = async () => {
  await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_settings_button') && x.getBoundingClientRect().width > 0);
    (b.shadowRoot.querySelector('ha-card') || b).click(); });
  await wait(800);
  return page.evaluate(() => [...document.querySelectorAll('.casora-settings-menu button')].map((b) => b.textContent.trim()));
};
const noTime = JSON.parse(JSON.stringify(before));
for (const v of noTime.views || []) { const h = (v.cards || [])[0]; if (h && h.variables) { delete h.variables.casora_screensaver; h.variables.casora_screensaver_kind = 'kalender'; } }
await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: noTime });
await dashboard(page, dash + '?casora_saver=1');
const items = await menu();
await check('ohne Startzeit: „Bildschirmschoner starten“ im ⋯-Menü', items.some((t) => /Bildschirmschoner starten|Start screensaver/.test(t)), items.join(' | '));
await page.evaluate(() => { const b = [...document.querySelectorAll('.casora-settings-menu button')].find((x) => /Bildschirmschoner|Screensaver/.test(x.textContent)); b && b.click(); });
await wait(2000);
const on = await page.evaluate(() => ({ shown: window._casoraSaver.shown(), kind: (document.querySelector('.cs-sv-layer .cs-sv') || {}).dataset?.kind || '' }));
await check('Eintrag startet den Bildschirmschoner (Kalender)', on.shown && on.kind === 'kalender', JSON.stringify(on));
await wait(6500);
await check('bleibt ohne Startzeit stehen (nach dem 5-s-Takt)', await page.evaluate(() => window._casoraSaver.shown()));
await page.mouse.click(400, 300);
await wait(800);
await check('Berührung weckt', !(await page.evaluate(() => window._casoraSaver.shown())));
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
