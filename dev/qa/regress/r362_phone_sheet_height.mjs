// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Owner (27.10.2026): on the phone popups sometimes opened all the way to the top instead of only as tall as their
// content. Cause: the light popup's old browser_mod drawer fix wrote height/min-height inline onto Casora's shared
// sheet (every later popup then opened full height), and its CSS min-height (!important) beat the Weich rule (a lamp's
// sheet stood at the top with empty space below). Expected (Casora theme, iPhone 393 × 852): a single lamp's sheet is
// as tall as its content; after the house light popup the next short popup is short again; no inline size is left.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.phone.url + '/home', 2);

// Empty space under the last visible element of the open sheet, and the sheet's top.
const sheet = () => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const R = s.getBoundingClientRect();
  let bottom = R.top;
  const all = [];
  const deep = (root) => root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) deep(n.shadowRoot); });
  deep(s);
  all.forEach((n) => {
    const q = n.getBoundingClientRect();
    if (!q.width || !q.height || q.height > R.height * 0.8) return;
    const cs = getComputedStyle(n);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const vis = (!n.children.length && (n.textContent || '').trim()) || /^(img|svg|canvas|ha-icon|ha-state-icon)$/i.test(n.localName)
      || (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor));
    if (vis && q.bottom > bottom && q.top < R.bottom) bottom = q.bottom;
  });
  return { top: Math.round(R.top), empty: Math.round(R.bottom - bottom), inline: s.getAttribute('style') || '' };
});
const lamp = await page.evaluate(() => { const st = document.querySelector('home-assistant').hass.states;
  return Object.keys(st).find((k) => k.startsWith('light.') && !Array.isArray(st[k].attributes.entity_id) && st[k].state !== 'unavailable'); });
await need('a single lamp in the test house', lamp);
const openLamp = () => page.evaluate((id) => new Promise((res) => window._casoraNotifyOpenViaCard(id, res,
  { type: 'custom:button-card', template: 'casora_light', entity: id, variables: { icon: 'light' } })), lamp);
const close = async () => { await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(900); };

await openLamp();
await page.waitForTimeout(2500);
const a = await sheet();
await check('single lamp: the sheet is as tall as its content (< 80 px empty below)', a && a.empty < 80, a);
await check('single lamp: the sheet does not start at the top', a && a.top > 120, a);
await check('no inline size on the shared sheet', a && !/height|--size/.test(a.inline), a);
await close();

// House light popup first, then a short popup: short again.
const at = (t) => page.evaluate((t) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t) && x.getBoundingClientRect().width > 20);
  if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, t);
const lg = await at('casora_badge_light_group');
await need('phone Home has the light badge', lg);
await page.touchscreen.tap(lg.x, lg.y);
await page.waitForTimeout(2500);
await close();
await openLamp();
await page.waitForTimeout(2500);
const b = await sheet();
await check('after the house light popup a single lamp is still as tall as its content', b && b.empty < 80 && b.top > 120, b);
await close();
await finish();
