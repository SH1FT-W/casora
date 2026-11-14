// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js
// Keyboard and screen reader round (14.11.2026): the light popup's row switches (role switch, one per lamp or room)
// had no name – a screen reader said only „switch“ – and could not be reached or switched by keyboard (no tab stop, no
// key handler); the scene chips (role button) were not in the tab order either.
// Expected: every row switch is named by its lamp/room and in the tab order, Space on it switches that lamp (service
// call caught in the browser, nothing switched in HA); scene chips are in the tab order.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_light"/.test(JSON.stringify(d.config)));
await need('Casora dashboard with a light tile', dash);
const view = dash.config.views.find((v) => /"casora_light"/.test(JSON.stringify(v))) || dash.config.views[0];
const { page } = await open();
await dashboard(page, dash.url + '/' + (view.path || '0'));

// Where the focus is, through all shadow roots: is it inside the open popup / inside the given tile?
const focusIn = () => page.evaluate(() => {
  let a = document.activeElement;
  while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  const inside = (host) => { let n = a; while (n) { if (n === host) return true; n = n.parentNode || n.host; } return false; };
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const tile = window.__qaTile;
  return { tag: a ? a.tagName.toLowerCase() + '.' + String(a.className || '').split(' ')[0] : null,
    inPopup: !!(pop && inside(pop)), inTile: !!(tile && inside(tile)) };
});

// A light group tile (its popup lists the lamps with their own switches), built like the Studio builds one and laid over
// the view – the house's own tiles may be single lamps.
const gid = await page.evaluate(() => { const st = document.querySelector('home-assistant').hass.states;
  const g = Object.values(st).find((x) => x.entity_id.startsWith('light.') && Array.isArray(x.attributes.entity_id) && x.attributes.entity_id.length > 1);
  return g ? g.entity_id : null; });
await need('a light group in the test house', gid);
atFinish(() => page.evaluate(() => { if (window.__qaTile) window.__qaTile.remove(); window.casoraPopup && window.casoraPopup.close(); }).catch(() => {}));
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const helpers = await window.loadCardHelpers();
  const tile = helpers.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity: id });
  tile.style.cssText = 'position:fixed;left:400px;top:300px;width:300px;height:180px;z-index:5;';
  tile.hass = ha.hass;
  ha.shadowRoot.appendChild(tile);
  window.__qaTile = tile;
}, gid);
await page.waitForTimeout(1500);
const isOpen = () => page.evaluate(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('open')));
const rowSwitches = () => page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  return !!p && window.__pierce('.lps-sw', p.shadowRoot).some((s) => s.getBoundingClientRect().width > 0); });
await page.mouse.click(550, 390);
await page.waitForFunction(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 15000 }).catch(() => {});
for (let i = 0; i < 40 && !(await rowSwitches()); i++) await page.waitForTimeout(250);
const found = await rowSwitches();
await need('a light popup with row switches', found);
await page.waitForTimeout(800);

const sw = await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  return window.__pierce('[role=switch]', p.shadowRoot).filter((s) => s.getBoundingClientRect().width > 0)
    .map((s) => ({ cls: String(s.className).split(' ')[0], name: (s.getAttribute('aria-label') || s.textContent || '').trim(), tab: s.tabIndex })); });
await need('the light popup shows switches', sw.length > 0, sw);
const bad = sw.filter((s) => !s.name || s.tab < 0);
await check('every switch in the light popup has a name and is in the tab order', bad.length === 0, { bad: bad.slice(0, 4), all: sw.length });

// Space on a row switch switches it (service call caught in the browser, nothing switched in HA).
const lps = sw.find((s) => s.cls === 'lps-sw');
if (lps) {
  await page.evaluate(() => {
    const ha = document.querySelector('home-assistant');
    window.__qaCalls = [];
    const orig = ha.hass.callService;
    window.__qaOrigCall = orig;
    ha.hass.callService = function (d, s, data, target) { window.__qaCalls.push([d, s, target || data]); return Promise.resolve(); };
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const el = window.__pierce('.lps-sw', p.shadowRoot).find((s) => s.getBoundingClientRect().width > 0);
    el.focus();
  });
  const f = await focusIn();
  await check('a row switch takes the focus', /lps-sw/.test(f.tag || ''), f);
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => { const ha = document.querySelector('home-assistant'); ha.hass.callService = window.__qaOrigCall; return window.__qaCalls; });
  await check('Space on a light row switch toggles the lamp', calls.some((c) => c[0] === 'light' && c[1] === 'toggle'), calls);
}

const chips = await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  return window.__pierce('.lps-chip, .lps-sg', p.shadowRoot).filter((s) => s.getBoundingClientRect().width > 0).map((s) => s.tabIndex); });
if (chips.length) await check('scene chips are in the tab order', chips.every((t) => t >= 0), chips);
await finish();
