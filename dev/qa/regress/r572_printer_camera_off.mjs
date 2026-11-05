// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/02-devices.js#_casoraPrint
// Owner 05.11.2026 (iPhone screenshot, v3 popup of a Bambu Lab printer): with the camera switched off („Kamera
// aktivieren“ off, ha-bambulab then drops the camera entity) the camera area showed HA's yellow warning „Entität nicht
// gefunden“; the stage's dial at the top looked clipped. Expected (phone 393, desktop 1440), at rest, for the test house's
// printer with a camera and its switch (found by keys, no ids here; states faked in the browser):
//  - camera on: the picture, no placeholder
//  - switched off while the popup is open (switch off, camera gone): no warning, a calm „Kamera aus“ instead
//  - opened with the camera off: the same
//  - the stage (dial and its word) stays whole inside the sheet in each case.
//   R572_SHOTS=<dir> R572_TAG=<name>: picture of the phone popup after switching the camera off.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish, atFinish } from './lib.mjs';

const d = await casoraDashboard();
await need('ein Casora-Dashboard', d);

const findPrinter = (page) => page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, R = h.entities;
  const ids = Object.keys(R).filter((x) => R[x].translation_key === 'stage' && h.states[x]).sort();
  for (const id of ids) {
    const c = window._casoraPrint && window._casoraPrint.auto(h.states[id], h);
    if (c && c.status && c.cam && c.camSw && h.states[c.cam] && h.states[c.camSw]) return Object.assign({ stage: id }, c);
  }
  return null;
});
const openPrinter = (page, id) => page.evaluate((id) => {
  const ha = document.querySelector('home-assistant');
  const old = ha.shadowRoot.getElementById('qa-r572');
  if (old) old.remove();
  return window.loadCardHelpers().then((hp) => {
    const el = hp.createCardElement({ type: 'custom:button-card', template: 'casora_3d_printer', entity: id });
    el.id = 'qa-r572'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:20px;top:300px;width:200px;height:140px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
  });
}, id);
const tap = (page) => page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r572')
  ._handleAction({ detail: { action: 'tap' } }, { isIcon: false }));
const closePopup = async (page) => { await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* closed */ } }); await page.waitForTimeout(800); };

const info = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaves = window.__pierce('*', s).filter((e) => e.children.length === 0 && vis(e)).map((e) => (e.textContent || '').trim()).filter(Boolean);
  const warn = window.__pierce('hui-warning', s).filter(vis).length + leaves.filter((t) => /nicht gefunden|not found/i.test(t)).length;
  const pic = window.__pierce('hui-picture-entity-card', s).filter(vis).length;
  const st = window.__pierce('[data-casora-stage]', s).find(vis), dl = st && st.querySelector('.hui-dl');
  const sr = s.getBoundingClientRect(), dr = (dl || st) ? (dl || st).getBoundingClientRect() : null;
  // The dial's top must lie inside the sheet and not under a parent that clips it.
  let clip = null;
  for (let n = dl || st; n && n !== s; n = n.parentNode || n.host) {
    if (!(n instanceof Element)) continue;
    const cs = getComputedStyle(n), r = n.getBoundingClientRect();
    if (/hidden|clip/.test(cs.overflowY) && dr && r.top > dr.top + 1) { clip = (n.id || n.className || n.tagName) + ' ' + Math.round(r.top) + ' > ' + Math.round(dr.top); break; }
  }
  return { warn, pic, off: leaves.includes('Kamera aus'), dialTop: dr ? Math.round(dr.top) : null, sheetTop: Math.round(sr.top), clip, texts: leaves.slice(0, 40) };
});

for (const [mode, w, h] of [['phone', 393, 852], ['desk', 1440, 1000]]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora', mobile: mode === 'phone' });
  usePage(page);
  await dashboard(page, d.url, 3);
  const c = await findPrinter(page);
  await need(mode + ': printer with camera and camera switch in the test house', c, c);
  const reset = () => page.evaluate(() => { const ha = document.querySelector('home-assistant'); if (ha.__qaOrigUpdateHass) ha._updateHass = ha.__qaOrigUpdateHass; ha.__qaSticky = {}; });
  atFinish(reset);
  const camState = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id], c.cam);
  const rest = { [c.status]: { state: 'finish' }, [c.stage]: { state: 'idle' } };
  const ok = (pi) => pi && pi.dialTop != null && pi.dialTop >= pi.sheetTop && !pi.clip;

  // 1. Camera on.
  await fakeStates(page, { ...rest, [c.camSw]: { state: 'on' }, [c.cam]: camState }, { sticky: true });
  await openPrinter(page, c.stage);
  await page.waitForTimeout(1500);
  await tap(page);
  await page.waitForTimeout(4000);
  let pi = await info(page);
  await need(mode + ': popup open', pi);
  await check(mode + ' camera on: the picture, no placeholder, no warning', pi.pic === 1 && !pi.off && pi.warn === 0, pi);
  // 2. Switched off while open: the integration drops the camera entity.
  await fakeStates(page, { [c.camSw]: { state: 'off' }, [c.cam]: null }, { sticky: true });
  await page.waitForTimeout(2500);
  pi = await info(page);
  await check(mode + ' switched off: no „Entität nicht gefunden“', pi && pi.warn === 0, pi);
  await check(mode + ' switched off: a calm „Kamera aus“', pi && pi.off && pi.pic === 0, pi);
  await check(mode + ' switched off: the stage stays whole', ok(pi), pi);
  if (process.env.R572_SHOTS && mode === 'phone') await page.screenshot({ path: `${process.env.R572_SHOTS}/${process.env.R572_TAG || 'shot'}-handy.png` });
  await closePopup(page);
  // 3. Opened with the camera off.
  await tap(page);
  await page.waitForTimeout(4000);
  pi = await info(page);
  await check(mode + ' opened with the camera off: no warning, „Kamera aus“, stage whole', pi && pi.warn === 0 && pi.off && ok(pi), pi);
  // 4. Switched on again while open: the picture comes back.
  await fakeStates(page, { [c.camSw]: { state: 'on' }, [c.cam]: camState }, { sticky: true });
  await page.waitForTimeout(2500);
  pi = await info(page);
  await check(mode + ' switched on again: the picture, no placeholder', pi && pi.pic === 1 && !pi.off && pi.warn === 0, pi);
  await closePopup(page);
  await reset();
  await page.context().browser().close();
}
await finish();
