// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js#_livePreview
// #154: a live preview starts without HA's sidebar, but leaves the viewer's own sidebar setting alone. It used to write
// "always hidden" into the browser for a moment, and a reload in that moment left the sidebar hidden for good.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await studio(page, d.url);
const first = await page.evaluate((url) => {
  localStorage.setItem('dockedSidebar', JSON.stringify('docked'));
  const p = window.__panel(), box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:0;top:0;width:720px;height:450px;overflow:hidden;z-index:1';
  document.body.appendChild(box);
  window.__t154 = { box, frame: p._livePreview(box, '/' + url + '/0', 1440, 900) };
  return localStorage.getItem('dockedSidebar');
}, d.url);
await check('the moment a preview starts, the setting is untouched', first === '"docked"', first);
await page.waitForFunction(() => window.__t154.box.classList.contains('ready'), null, { timeout: 45000 });
const r = await page.evaluate(async () => {
  await new Promise((x) => setTimeout(x, 700));
  const doc = window.__t154.frame.contentDocument, ha = doc.querySelector('home-assistant');
  const side = ha.shadowRoot.querySelector('home-assistant-main').shadowRoot.querySelector('ha-sidebar');
  const q = side && side.getBoundingClientRect();
  return { stored: localStorage.getItem('dockedSidebar'), inner: ha.hass.dockedSidebar, left: q ? q.left + q.width : 0 };
});
await check('the preview runs without the sidebar', r.inner === 'always_hidden' && r.left <= 1, r);
await check('afterwards the setting is still the viewer\'s', r.stored === '"docked"', r);
await finish();
