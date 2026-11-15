// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/46-screensaver.js#cameras,cameraChoices,has,pool custom_components/casora/scripts/local/00-finder.js#notSurveillance,isPrinter,deviceKinds
// Screensaver „Cameras“ (owner 15.11.2026): the 3D printer's camera is the only camera with a picture, every other
// camera is unavailable. „Automatic“ (no own list) must not fall back to the printer: the kind on its own shows the
// sky, the alternation skips it. Before: the printer camera stood on the screensaver.
import { ws } from '../ws.mjs';
import { open, usePage, studioDashboard, dashboard, check, need, finish, atFinish, fakeStates } from './lib.mjs';

const PRINTER = 'camera.testdrucker_kamera';
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

const setKind = async (kind) => {
  const cfg = JSON.parse(JSON.stringify(before));
  for (const v of cfg.views || []) {
    const h = (v.cards || [])[0];
    if (h && h.variables) {
      delete h.variables.casora_screensaver_cameras; delete h.variables.casora_screensaver_mix;
      if (kind) h.variables.casora_screensaver_kind = kind; else delete h.variables.casora_screensaver_kind;
    }
  }
  await c.cmd({ type: 'lovelace/config/save', url_path: dash, config: cfg });
};
// The house as reported: the printer idle after a print, every other camera unavailable.
const prepare = async () => {
  const others = await page.evaluate((p) => Object.keys(document.querySelector('home-assistant').hass.states)
    .filter((id) => id.indexOf('camera.') === 0 && id !== p), PRINTER);
  const patch = { 'sensor.testdrucker_druckstatus': { state: 'finish' } };
  others.forEach((id) => { patch[id] = { state: 'unavailable' }; });
  await fakeStates(page, patch, { sticky: true });
  await wait(400);
  return others;
};
const saver = () => page.evaluate(() => ({ kind: (document.querySelector('.cs-sv-layer .cs-sv') || {}).dataset?.kind || '',
  cams: [...document.querySelectorAll('.cs-sv-layer .cs-cam')].map((x) => x.dataset.cam),
  imgs: [...document.querySelectorAll('.cs-sv-layer img')].map((x) => x.getAttribute('src') || '').filter((s) => /camera_proxy/.test(s)) }));

// The kind on its own.
await setKind('kameras');
await dashboard(page, dash + '?casora_saver=1');
const has = await page.evaluate((p) => { const h = document.querySelector('home-assistant').hass; return !!h.states[p] && !!(h.entities[p] || {}).device_id; }, PRINTER);
await need('Testhaus mit Druckerkamera am Druckergerät', has);
const others = await prepare();
await need('weitere Kameras im Testhaus (werden unerreichbar)', others.length > 0, JSON.stringify(others));
const picks = await page.evaluate(() => { const S = window._casoraSaver, h = document.querySelector('home-assistant').hass;
  return { auto: S.cameras(h).map((x) => x.id), choices: S.cameraChoices(h).map((x) => [x.id, x.auto, x.why]) }; });
await check('Automatisch: keine Kamera (nicht der Drucker)', picks.auto.length === 0, JSON.stringify(picks));
await page.evaluate(() => window._casoraSaver.start());
await wait(2500);
let shown = await saver();
await check('allein: Himmel statt Druckerkamera', shown.kind === 'himmel' && !shown.cams.includes(PRINTER) && !shown.imgs.some((s) => s.includes(PRINTER)), JSON.stringify(shown));
await page.mouse.click(400, 300);
await wait(800);

// One after the other: the cameras are skipped.
await setKind('');
await dashboard(page, dash + '?casora_saver=1');
await prepare();
const pool = await page.evaluate(() => { const S = window._casoraSaver, h = document.querySelector('home-assistant').hass;
  return S.pool({}, (id) => S.has(id, { hass: h, vars: {} })); });
await check('Abwechselnd: Kameras ausgelassen', Array.isArray(pool) && !pool.includes('kameras'), JSON.stringify(pool));
await page.evaluate(() => window._casoraSaver.start());
await wait(2500);
shown = await saver();
await check('Abwechselnd: keine Druckerkamera auf dem Schoner', shown.kind !== 'kameras' && !shown.cams.includes(PRINTER) && !shown.imgs.some((s) => s.includes(PRINTER)), JSON.stringify(shown));
await page.mouse.click(400, 300);
await wait(600);
await check('keine Seitenfehler', errors.length === 0, errors.join(' | '));
await finish();
