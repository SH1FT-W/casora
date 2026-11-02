// @zustand: arbeit
// @parallel: ui
// Reported 02.11.2026 (iPhone): sometimes only the blurred scrim showed, no popup on it. One way there: a finger
// still dragging the sheet when the popup closed (a second flick while the first slides out). The drag ended after
// the teardown and left swipe-out and translateY(100%) on the sheet, which every popup shares: the next popup opened
// off screen. Expected: the next popup's sheet is on screen, without a leftover transform.
import { open, usePage, casoraDashboards, dashboard, cards, check, need, finish } from './lib.mjs';

const phones = (await casoraDashboards()).filter((d) => d.mobile);
await need('Casora-Handy-Dashboard', phones.length);

const popOpen = (page) => page.waitForFunction(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('shown')
  && !p.hasAttribute('closing')), null, { timeout: 8000 }).then(() => true, () => false);

const { page } = await open({ mobile: true, width: 393, height: 852, safari: true });
usePage(page);
let tile = null;
for (const ph of phones) {
  await dashboard(page, ph.url + '/' + (ph.config.views[0].path || '0'));
  // A tile that opens a Casora popup: tap the candidates until one does.
  for (const c of (await cards(page)).filter((c) => c.y > 150 && c.y < 700 && c.w > 120 && c.w < 300)) {
    await page.touchscreen.tap(c.x + c.w / 2, c.y + c.h / 2);
    if (await popOpen(page)) { tile = c; break; }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }
  if (tile) break;
}
await need('Popup am Handy offen', !!tile);
await page.waitForTimeout(800);

// Finger down on the sheet and moving; the popup closes meanwhile; the finger goes on and lifts after the teardown.
// (Touch events built by hand: WebKit has no Touch constructor; the sheet only reads touches[0].clientY.)
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const sf = pop.shadowRoot.querySelector('.surface');
  const r = sf.getBoundingClientRect(), x = r.left + 50, y0 = r.top + 20;
  const E = (type, y) => {
    const e = new Event(type, { bubbles: true, cancelable: true, composed: true });
    Object.defineProperty(e, 'touches', { value: y == null ? [] : [{ clientX: x, clientY: y }] });
    return e;
  };
  window.__r478 = { sf, E, y0 };
  sf.dispatchEvent(E('touchstart', y0));
  sf.dispatchEvent(E('touchmove', y0 + 20));
  window.casoraPopup.close();
});
await page.waitForFunction(() => !window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 3000 }).catch(() => {});
await page.evaluate(() => {
  const { sf, E, y0 } = window.__r478;
  for (let d = 40; d < 400; d += 40) sf.dispatchEvent(E('touchmove', y0 + d));
  sf.dispatchEvent(E('touchend'));
});
await page.waitForTimeout(400);

await page.touchscreen.tap(tile.x + tile.w / 2, tile.y + tile.h / 2);
await need('Popup wieder offen', await popOpen(page));
await page.waitForTimeout(900);
const s = await page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((q) => q.hasAttribute('open'));
  const sf = p.shadowRoot.querySelector('.surface');
  const r = sf.getBoundingClientRect();
  return { transform: sf.style.transform, swipeOut: p.hasAttribute('swipe-out'), top: Math.round(r.top), h: innerHeight };
});
await check('kein Wisch-Rest am Blatt (swipe-out, transform)', !s.swipeOut && !s.transform, s);
await check('Blatt des nächsten Popups steht im Bild', s.top < s.h - 200, s);
await finish();
