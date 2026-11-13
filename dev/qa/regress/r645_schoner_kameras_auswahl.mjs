// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview custom_components/casora/scripts/local/46-screensaver.js#cameras,cameraChoices,pickNext,has dev/casora_mock/halten.py
// Screensaver „Cameras“ (owner 13.11.2026):
//   - Dashboard: by default („Automatic“) only cameras with a real picture; the made-up map camera
//     (camera.testkehrer_karte) and the printer camera (camera.testdrucker_kamera) stay out (before: dark tiles).
//   - Studio: under „Cameras“ the row „Automatic“ (picked by default) and every camera; the map and the printer are
//     grey with their reason. A tap on the printer picks it by hand (casora_screensaver_cameras in the draft, every
//     room, nothing saved); „Automatic“ goes back (variable gone).
import { ws } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';

const MAP = 'camera.testkehrer_karte', PRINTER = 'camera.testdrucker_kamera', REAL = 'camera.testkamera';
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
const wait = (ms) => page.waitForTimeout(ms);

// Dashboard: the screensaver's cameras on its own, started by hand.
const cfg = JSON.parse(JSON.stringify(before));
for (const v of cfg.views || []) {
  const h = (v.cards || [])[0];
  if (h && h.variables) { h.variables.casora_screensaver_kind = 'kameras'; delete h.variables.casora_screensaver_cameras; }
}
await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: cfg });
await dashboard(page, dash + '?casora_saver=1');
const has = await page.evaluate(([m, p, r]) => { const s = document.querySelector('home-assistant').hass.states; return [m, p, r].map((x) => !!s[x]); }, [MAP, PRINTER, REAL]);
await need('Testhaus mit Karten-, Drucker- und echter Kamera', has.every(Boolean), JSON.stringify(has));
await page.evaluate(() => window._casoraSaver.start());
await wait(2500);
const shown = await page.evaluate(() => ({ kind: (document.querySelector('.cs-sv-layer .cs-sv') || {}).dataset?.kind || '',
  cams: [...document.querySelectorAll('.cs-sv-layer .cs-cam')].map((x) => x.dataset.cam) }));
await check('Schoner zeigt Kameras', shown.kind === 'kameras' && shown.cams.length > 0, JSON.stringify(shown));
await check('Automatisch: ohne Karte und Druckerkamera', !shown.cams.includes(MAP) && !shown.cams.includes(PRINTER) && shown.cams.includes(REAL), JSON.stringify(shown.cams));
await page.mouse.click(400, 300);
await wait(600);
await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: before });

// Studio: the list.
await dashboard(page, dash);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
await P(`for (const r of p._state.compact.rooms) { r.variables.casora_screensaver = '5'; r.variables.casora_screensaver_kind = 'kameras'; delete r.variables.casora_screensaver_cameras; }`);
await P(`p._csShow('n-saver')`);
await wait(2000);
const list = () => P(`const r = p.shadowRoot; return { rows: [...r.querySelectorAll('.cs-saver-list[data-key="casora_screensaver_cameras"] .cs-saver-row')].map((x) => [x.dataset.id, x.getAttribute('aria-pressed'), (x.querySelector('.cs-saver-tx span') || {}).textContent || '']),
  vars: [...new Set(p._state.compact.rooms.map((x) => JSON.stringify(x.variables.casora_screensaver_cameras ?? null)))] };`);
const row = (l, id) => l.rows.find((x) => x[0] === id) || [];
let l = await list();
await check('„Automatisch“ oben und gewählt', l.rows[0] && l.rows[0][0] === 'auto' && l.rows[0][1] === 'true', JSON.stringify(l.rows.slice(0, 2)));
await check('echte Kamera an, Karte und Drucker grau mit Grund', row(l, REAL)[1] === 'true' && row(l, MAP)[1] === 'false' && row(l, PRINTER)[1] === 'false'
  && /Karte|Map/.test(row(l, MAP)[2]) && /Drucker|printer/.test(row(l, PRINTER)[2]), JSON.stringify([row(l, REAL), row(l, MAP), row(l, PRINTER)]));
await P(`p.shadowRoot.querySelector('.cs-saver-list[data-key="casora_screensaver_cameras"] .cs-saver-row[data-id="${PRINTER}"]').click();`);
await wait(500);
l = await list();
const picked = l.vars.length === 1 && JSON.parse(l.vars[0]);
await check('Tipp auf den Drucker: eigene Liste im Entwurf (jeder Raum)', Array.isArray(picked) && picked.includes(PRINTER) && picked.includes(REAL) && !picked.includes(MAP)
  && row(l, PRINTER)[1] === 'true' && row(l, 'auto')[1] === 'false', JSON.stringify(l.vars).slice(0, 300));
const mid = await c.cmd({ type: 'lovelace/config', url_path: dash });
await check('nichts gespeichert (Entwurf)', JSON.stringify(mid) === JSON.stringify(before));
await P(`p.shadowRoot.querySelector('.cs-saver-list[data-key="casora_screensaver_cameras"] .cs-saver-row[data-id="auto"]').click();`);
await wait(500);
l = await list();
await check('„Automatisch“ wieder: Variable weg', l.vars.length === 1 && l.vars[0] === 'null' && row(l, 'auto')[1] === 'true' && row(l, PRINTER)[1] === 'false', JSON.stringify(l.vars));
await P('if (p._csDirty() || p._isDirty()) await p._csDiscardAll();').catch(() => {});
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
