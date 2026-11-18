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
let mobileUrl = null, mobileBefore = null;
atFinish(async () => {
  await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: before });
  if (mobileBefore) await c.cmd({ type: 'lovelace/config/save', url_path: mobileUrl, config: mobileBefore });
  c.close();
});

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
mobileUrl = await P(`return p._pair?.mobileUrl || null`);
if (mobileUrl) mobileBefore = await c.cmd({ type: 'lovelace/config', url_path: mobileUrl });
await P(`for (const r of p._state.compact.rooms) { r.variables.casora_screensaver = '5'; r.variables.casora_screensaver_kind = 'kameras'; delete r.variables.casora_screensaver_cameras; }`);
await P(`p._csShow('n-saver')`);
await wait(2000);
await check('Camera picker starts collapsed', await P(`return p.shadowRoot.querySelector('.cs-saver-camera-choose')?.getAttribute('aria-expanded') === 'false'`));
await P(`p.shadowRoot.querySelector('.cs-saver-camera-choose').click()`);
const list = () => P(`const r = p.shadowRoot; return { rows: [...r.querySelectorAll('.cs-saver-list[data-key="casora_screensaver_cameras"] .cs-saver-row')].map((x) => [x.dataset.id, x.getAttribute('aria-pressed'), (x.querySelector('.cs-saver-tx span') || {}).textContent || '']),
  vars: [...new Set(p._state.compact.rooms.map((x) => JSON.stringify(x.variables.casora_screensaver_cameras ?? null)))] };`);
const row = (l, id) => l.rows.find((x) => x[0] === id) || [];
let l = await list();
await check('„Automatisch“ oben und gewählt', l.rows[0] && l.rows[0][0] === 'auto' && l.rows[0][1] === 'true', JSON.stringify(l.rows.slice(0, 2)));
const reasons = await P(`const t = (s) => window.casoraI18n ? window.casoraI18n.t(s) : s; return {
  map: t('Map or robot vacuum, not taken automatically'), printer: t('3D printer, not taken automatically') };`);
await check('echte Kamera an, Karte und Drucker grau mit Grund', row(l, REAL)[1] === 'true' && row(l, MAP)[1] === 'false' && row(l, PRINTER)[1] === 'false'
  && row(l, MAP)[2] === reasons.map && row(l, PRINTER)[2] === reasons.printer, JSON.stringify([row(l, REAL), row(l, MAP), row(l, PRINTER)]));
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

// The same picker is available in rotation, independently of the kind and its inclusion.
const chooseKind = async (kind) => {
  await P(`p.shadowRoot.querySelector('.cs-saver-chip[data-kind="' + arg + '"]').click()`, kind);
  await page.waitForFunction((kind) => window.__panel().shadowRoot.querySelector('.cs-saver-chip[data-kind="' + kind + '"]')?.getAttribute('aria-pressed') === 'true', kind);
};
await chooseKind('mix');
await check('Rotation exposes an independent camera action', await P(`const b = p.shadowRoot.querySelector('.cs-saver-camera-choose'); return !!b && !!b.parentElement.querySelector('.cs-saver-row[data-id="kameras"]')`));
await P(`p.shadowRoot.querySelector('.cs-saver-camera-choose').click(); p.shadowRoot.querySelector('.cs-saver-list[data-key="casora_screensaver_cameras"] [data-id="${PRINTER}"]').click()`);
const rotationPick = (await list()).vars;
await check('Choosing cameras keeps rotation', await P(`return !p._state.compact.rooms[0].variables.casora_screensaver_kind`));
const toggleCameras = () => P(`p.shadowRoot.querySelector('.cs-saver-list[data-key="casora_screensaver_mix"] .cs-saver-row[data-id="kameras"]').click()`);
await toggleCameras();
await check('Excluding Cameras hides its picker', await P(`return !p.shadowRoot.querySelector('.cs-saver-camera-choose') && !p.shadowRoot.querySelector('.cs-saver-list[data-key="casora_screensaver_cameras"]')`));
await toggleCameras();
await check('Re-including Cameras retains camera choices', JSON.stringify((await list()).vars) === JSON.stringify(rotationPick));
await chooseKind('kameras');
await chooseKind('mix');
await check('Switching modes retains choices and starts collapsed', JSON.stringify((await list()).vars) === JSON.stringify(rotationPick)
  && await P(`return p.shadowRoot.querySelector('.cs-saver-camera-choose').getAttribute('aria-expanded') === 'false'`));

// Save through Settings, edit again, then discard through the real leave guard.
await P(`p.shadowRoot.querySelector('.cs-save').click()`);
await page.waitForFunction(() => {
  const p = window.__panel();
  return !p._cs?.busy && !p._saving && !p._isDirty() && !p._csDirty();
});
const saved = await c.cmd({ type: 'lovelace/config', url_path: dash });
const cameraPicks = (value) => !value || typeof value !== 'object' ? [] : [
  ...(Array.isArray(value.casora_screensaver_cameras) ? [value.casora_screensaver_cameras] : []),
  ...Object.values(value).flatMap(cameraPicks),
];
const persisted = (saved.views || []).map((v) => v.cards?.[0]?.variables).filter(Boolean).map((v) => v.casora_screensaver_cameras);
await check('Settings save persists the rotation camera choice', persisted.length > 0 && persisted.every((ids) => Array.isArray(ids) && ids.includes(PRINTER)));
if (mobileBefore) {
  const phoneSaved = await c.cmd({ type: 'lovelace/config', url_path: mobileUrl });
  await check('Tablet camera selection preserves the phone dashboard scope', JSON.stringify(cameraPicks(phoneSaved)) === JSON.stringify(cameraPicks(mobileBefore)));
}
await P(`p.shadowRoot.querySelector('.cs-saver-camera-choose').click(); p.shadowRoot.querySelector('.cs-saver-list[data-key="casora_screensaver_cameras"] [data-id="auto"]').click()`);
await check('The next camera edit marks the draft dirty', await P(`return p._isDirty() && p._csDirty()`));
await check('The next camera edit remains a draft', JSON.stringify(await c.cmd({ type: 'lovelace/config', url_path: dash })) === JSON.stringify(saved));
await page.emulateMedia({ reducedMotion: 'reduce' });
await P(`p.shadowRoot.querySelector('#donebtn').click()`);
await page.waitForFunction(() => !!window.__panel().shadowRoot.querySelector('.askpane .askalt'));
await P(`p.shadowRoot.querySelector('.askpane .askalt').click()`);
await page.waitForURL((url) => !url.pathname.includes('casora-studio'));
await studio(page, dash);
await check('Discard restores saved choices after reopening Studio', await P(`return !p._isDirty() && p._state.compact.rooms.every((r) => (r.variables.casora_screensaver_cameras || []).includes(arg))`, PRINTER));
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
