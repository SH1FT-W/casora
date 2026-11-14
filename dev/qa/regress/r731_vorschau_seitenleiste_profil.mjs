// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel.js#_livePreview
// #154 follow-up (first setup, 14.11.2026): a live preview drops HA's sidebar only in its frame, but the frame shares
// the viewer's localStorage, and HA writes its whole state there again on every profile change (the design step of
// the setup sets the profile theme while a preview is loaded). The frame then wrote "always hidden", and after a
// reload the viewer's sidebar was gone. The frame must never write the sidebar setting.
import { open, usePage, studio, casoraDashboard, check, need, finish, atFinish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
const { page, context } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
// Record every write of the sidebar setting from a frame (each frame has its own Storage prototype).
await context.addInitScript(() => {
  const o = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'dockedSidebar') { try { (window.top.__frameDock = window.top.__frameDock || []).push((window === window.top ? 'top:' : 'frame:') + v); } catch (e) { /* other origin */ } }
    return o.call(this, k, v);
  };
});
await studio(page, d.url);
const before = await page.evaluate(() => document.querySelector('home-assistant').hass.selectedTheme || null);
atFinish(async () => { await page.evaluate((t) => document.querySelector('home-assistant')
  .dispatchEvent(new CustomEvent('settheme', { detail: t || { theme: '' } })), before).catch(() => {}); });
await page.evaluate((url) => {
  localStorage.setItem('dockedSidebar', JSON.stringify('docked'));
  const p = window.__panel(), box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:450px;overflow:hidden;z-index:1';
  document.body.appendChild(box);
  window.__t731 = { box, frame: p._livePreview(box, '/' + url + '/0', 1440, 900) };
}, d.url);
await page.waitForFunction(() => window.__t731.box.classList.contains('ready'), null, { timeout: 45000 });
// A profile change, as the setup's design step makes it. HA in the frame then stores its whole state; which window
// hears of it first varies (server subscription), so the frame's HA is told directly, through HA's own event.
const other = await page.evaluate(() => { const h = document.querySelector('home-assistant').hass;
  const cur = h.selectedTheme && h.selectedTheme.theme;
  return Object.keys((h.themes && h.themes.themes) || {}).find((n) => n !== cur) || 'default'; });
await page.evaluate((t) => window.__t731.frame.contentDocument.querySelector('home-assistant')
  .dispatchEvent(new CustomEvent('settheme', { detail: { theme: t } })), other);
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const ha = window.__t731.frame.contentDocument.querySelector('home-assistant');
  return { writes: window.__frameDock || [], inner: ha && ha.hass.dockedSidebar, stored: localStorage.getItem('dockedSidebar') };
});
await check('the preview frame never writes "always hidden" into the browser', !r.writes.some((v) => /always_hidden/.test(v)), r);
await check('the preview still runs without the sidebar', r.inner === 'always_hidden', r);
await finish();
