// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js
// E32 (test 2): in a room with more tiles than fit, the desktop showed only two small dots under the row (Casora
// look: overflow "fade"). Expected: with a mouse the row shows the right arrow while tiles lie further right; on
// touch (iPad) fade + dots stay as they were (swiping).
import { open, usePage, ready, casoraDashboards, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const dash = all.filter((d) => !d.mobile).sort((a, b) => (b.config.views || []).length - (a.config.views || []).length)[0];
await need('Casora-Dashboard', dash, all.map((d) => d.url));
const views = (dash.config.views || []).map((v) => v.path).filter(Boolean);
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ROW = () => {
  const rows = window.__pierce('casora-smart-row').filter((e) => e.getClientRects().length && e.hasAttribute('casora-more-r'));
  const r = rows[0];
  if (!r) return null;
  const b = r.shadowRoot.querySelector('#arrows > .r'), c = getComputedStyle(b), a = getComputedStyle(r.shadowRoot.querySelector('#arrows'));
  return { mode: r.getAttribute('casora-row-mode'), shown: a.display !== 'none' && c.visibility === 'visible' && parseFloat(c.opacity) > 0.9 && b.getBoundingClientRect().width > 0 };
};
for (const [name, dev, want] of [['Desktop 1440', { width: 1440, height: 900 }, true],
  ['Tablet 1024 (touch)', { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA }, false]]) {
  const { page } = await open(dev);
  usePage(page);
  let s = null;
  for (const v of views) {
    await ready(page, '/' + dash.url + '/' + v, () => window.__pierce('casora-smart-row').some((e) => e.getClientRects().length), 60000).catch(() => {});
    await page.waitForTimeout(1800);
    s = await page.evaluate(ROW);
    if (s) break;
  }
  await need(name + ': a room whose tile row runs over', s, views);
  await check(name + (want ? ': right arrow shown' : ': no arrow on touch (fade + dots)'), s.shown === want, s);
  await page.close();
}
await finish();
