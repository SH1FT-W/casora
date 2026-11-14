// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#CasoraPopup,deepFocus,focusChain,focusBack
// Keyboard and screen reader round (14.11.2026): a Casora popup left the focus on the page behind it – Tab walked the
// tiles under the scrim, after Escape the focus was lost (body), the sheet had no dialog role.
// Expected: focus moves into the popup, Tab stays inside, Escape closes and puts the focus back on the tile; the sheet
// is a modal dialog named by its title. (Opened from a light group tile laid over the view; nothing is switched.)
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

const dlg = await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const s = p.shadowRoot.querySelector('.surface');
  const lb = s.getAttribute('aria-labelledby'); const t = lb && p.shadowRoot.getElementById(lb);
  return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), name: (t ? t.textContent : s.getAttribute('aria-label') || '').trim() }; });
await check('popup sheet is a modal dialog with a name', dlg.role === 'dialog' && dlg.modal === 'true' && !!dlg.name, dlg);

const f0 = await focusIn();
await check('focus moves into the popup when it opens', f0.inPopup, f0);

const out = [];
for (let i = 0; i < 24; i++) { await page.keyboard.press('Tab'); const f = await focusIn(); if (!f.inPopup) out.push(i + ':' + f.tag); }
for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Tab'); const f = await focusIn(); if (!f.inPopup) out.push('S' + i + ':' + f.tag); }
await check('Tab and Shift+Tab stay inside the popup', out.length === 0, out.slice(0, 6));

await page.keyboard.press('Escape');
await page.waitForFunction(() => !window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(300);
const closed = await page.evaluate(() => !window.__pierce('casora-popup').some((p) => p.hasAttribute('open')));
await check('Escape closes the popup', closed);
const f1 = await focusIn();
await check('after closing, the focus is back on the tile that opened the popup', f1.inTile, f1);
await finish();
