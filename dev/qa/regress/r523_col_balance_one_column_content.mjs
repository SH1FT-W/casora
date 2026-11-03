// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js#balance custom_components/casora/scripts/local/02-devices.js dev/qa/popup-galerie.mjs
// 03.11.2026: the column balance's rule B (one column) rebuilt the room climate popup on its first opening and left it
// empty – only the header, no dial, no readings (the rebuilt card collapsed to 0 px). Rule B now applies from the next
// opening (the heights are kept). Expected: on the first and on a second opening the popup shows its content (dial and
// readings), desktop 1440×900, light.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { open, usePage, check, need, finish, ready } from './lib.mjs';

const tool = fileURLToPath(new URL('../popup-galerie.mjs', import.meta.url));
const made = spawnSync(process.execPath, [tool, 'anlegen'], { encoding: 'utf8', env: process.env, timeout: 10 * 60 * 1000 });
await need('Popup-Galerie angelegt', made.status === 0, (made.stdout + made.stderr).slice(-400));

const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(page);
await ready(page, '/popup-galerie/home', "() => window.__pierce('button-card').length >= 1", 60000);
await page.waitForFunction(() => !!window._casoraLocalLoaded, null, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(2500);
// A fresh browser: nothing measured yet, so the first opening rebuilds.
await page.evaluate(() => { try { localStorage.removeItem('casora_col_bal'); } catch (e) { /* none */ } });
const setRow = (o) => page.evaluate((o) => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
  { entity_id: 'input_select.casora_expanded_row', option: o }).catch(() => {}), o);
const box = (tpl) => page.evaluate((tpl) => {
  const b = window.__pierce('button-card').find((x) => { const t = [].concat((x._config || {}).template || []); const r = x.getBoundingClientRect();
    return t[t.length - 1] === tpl && r.width > 8 && r.height > 8; });
  if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, tpl);
const content = () => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
  const h = s.getBoundingClientRect().height;
  const dial = window.__pierce('svg, canvas', s).some((e) => { const r = e.getBoundingClientRect(); return r.width > 120 && r.height > 120; });
  return { height: Math.round(h), dial };
});
const openClimate = async () => {
  await setRow('none'); await page.waitForTimeout(1200);
  const g = await box('casora_badge_climate_group');
  if (!g) return false;
  await page.mouse.click(g.x, g.y);
  let t = null; for (let i = 0; i < 20 && !t; i++) { await page.waitForTimeout(300); t = await box('casora_badge_temp'); }
  if (!t) return false;
  await page.mouse.click(t.x, t.y);
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(250); if (await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface))) return true; }
  return false;
};
for (const pass of ['erstes Öffnen', 'zweites Öffnen']) {
  await need(pass + ': Klima-Popup des Raums offen', await openClimate());
  await page.waitForTimeout(7000); // two balance passes and the rebuild
  const c = await content();
  await check(pass + ': Inhalt da (Rad sichtbar, Popup höher als der Kopf)', c && c.dial && c.height > 300, c);
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {});
  await page.waitForTimeout(800);
}
await setRow('none');
await page.context().close();
await finish();
