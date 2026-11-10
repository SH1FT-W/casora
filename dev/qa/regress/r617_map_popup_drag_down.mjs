// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#_bindSheetDrag custom_components/casora/scripts/local/44-landkarte.js#_casoraMapCard
// GitHub issue 159 (10.11.2026, phone): in the map popup, moving the map down closed the popup. Left, right, up and
// zoom worked; a finger going down on the map was taken as the sheet's swipe-to-close.
// Expected (phone 393×852, touch; Chromium, because Playwright's WebKit cannot build touch moves, see r440):
//   - a drag down that starts on the map leaves the sheet where it is and the popup open
//   - a drag down that starts on the popup's head still slides the sheet out and closes it
// Nothing is saved: the tile only exists in this browser (fakeStates, createCardElement).
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);

const PEOPLE = {
  'person.qa_kartenperson': { state: 'home', attributes: { friendly_name: 'Probe', latitude: 52.4, longitude: 13.4, gps_accuracy: 5 } },
  'zone.qa_kartenzone': { state: '0', attributes: { friendly_name: 'Probezone', latitude: 52.5, longitude: 13.45, radius: 300, passive: false, persons: [] } },
};

const { page, browser } = await open({ width: 393, height: 852, mobile: true, touch: true, scale: 3 });
await dashboard(page, dash.url, 3);
await need('the map module', await page.evaluate(() => !!window._casoraMapCard && !!window._casoraUI));
await fakeStates(page, PEOPLE, { sticky: true });

const openPopup = async () => {
  await page.evaluate(async () => {
    const ha = document.querySelector('home-assistant');
    ha.shadowRoot.querySelectorAll('.qa-r617').forEach((x) => x.remove());
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_map', name: 'Landkarte', variables: { map_tile: false } });
    el.classList.add('qa-r617');
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:20px;top:40px;width:177px;height:110px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    for (let i = 0; i < 60 && !(el.shadowRoot && el.shadowRoot.querySelector('ha-card')); i++) await new Promise((r) => setTimeout(r, 100));
    el.shadowRoot.querySelector('ha-card').click();
  });
  const seen = await page.waitForFunction(() => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    const map = pop && window.__pierce('ha-map', pop.shadowRoot).find((c) => c.getBoundingClientRect().width > 0);
    return !!(map && map.shadowRoot && map.shadowRoot.querySelector('canvas'));
  }, null, { timeout: 25000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(1200);
  return seen;
};

// One finger from (x, y0) down by `by` px; reports how far the sheet travelled and whether the popup is still open.
const dragDown = (from, by) => page.evaluate(async ({ from, by }) => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return { none: true };
  const surface = window.__pierce('.surface', pop.shadowRoot).find((c) => c.getBoundingClientRect().width > 0);
  const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
  let x, y;
  if (from === 'map') {
    const map = window.__pierce('ha-map', pop.shadowRoot).find((c) => c.getBoundingClientRect().width > 0);
    const r = map.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top + Math.min(90, r.height / 3);
  } else {
    const r = surface.getBoundingClientRect();
    x = r.left + r.width / 2; y = r.top + 14;
  }
  const target = deepAt(x, y);
  const onMap = (function up(n) { for (; n; n = n.parentNode || n.host) if (n.localName === 'ha-map') return true; return false; })(target);
  const travel = () => { const m = /translateY\(([-\d.]+)(px|%)\)/.exec(surface.style.transform || ''); return m ? (m[2] === '%' ? 9999 : parseFloat(m[1])) : 0; };
  let max = 0;
  const fire = (type, cy) => {
    const t = new Touch({ identifier: 9, target, clientX: x, clientY: cy });
    const end = type === 'touchend';
    target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] }));
    max = Math.max(max, travel());
  };
  fire('touchstart', y);
  for (let i = 1; i <= 10; i++) { await new Promise((r) => setTimeout(r, 24)); fire('touchmove', y + (by * i) / 10); }
  fire('touchend', y + by);
  await new Promise((r) => setTimeout(r, 700));
  return { onMap, max, open: pop.hasAttribute('open') && !pop.hasAttribute('closing'), sheet: surface.getBoundingClientRect().height > 0 };
}, { from, by });

await need('the popup with the map', await openPopup());
const a = await dragDown('map', 220);
await need('the finger starts on the map', a && a.onMap, a);
await check('a drag down on the map leaves the sheet where it is', a.max === 0, a);
await check('the popup stays open', a.open === true, a);

if (!a.open) await need('the popup again', await openPopup());
const b = await dragDown('head', 260);
await check('a drag down on the head still closes the sheet', b && b.onMap === false && b.max > 100 && b.open === false, b);

await browser.close();
await finish();
