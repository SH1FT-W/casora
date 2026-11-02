// @zustand: arbeit
// @parallel: ui
// Reported 02.11.2026 (iPhone, Companion app): sometimes the whole phone dashboard stayed blurred and dimmed with
// nothing on top of it, and taps did nothing. Cause: the bell's window in the phone bar lays the bar's scrim over the
// page. When HA rebuilds the dashboard while that window is open (lovelace_updated: the dashboard was saved anywhere,
// e.g. on another device), a new bar and a new bell are drawn; closing the window asked the new bar (which held no
// scrim) or was not passed on at all, because the old bell no longer sat in the bar. The old scrim stayed for good.
// Expected: after closing the bell's window no scrim is left and the centre of the page is the dashboard again.
import { open, usePage, casoraDashboards, dashboard, check, need, finish } from './lib.mjs';

const phones = (await casoraDashboards()).filter((d) => d.mobile);
await need('Casora-Handy-Dashboard', phones.length);
const ph = phones[0];

const bellXY = (page) => page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat(x._config?.template || []).includes('casora_notifications_button'));
  if (!b) return null;
  let docked = false;
  for (let u = b; u; u = u.parentNode || u.host) if (u.classList && u.classList.contains('hmn-dock')) docked = true;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, docked };
});

const state = (page) => page.evaluate(() => {
  const scrims = document.querySelectorAll('.hmn-scrim').length;
  const menus = document.querySelectorAll('.casora-notify-menu').length;
  // The topmost element at the centre, through shadow roots.
  let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2), path = [];
  while (el) {
    path.push(el.localName + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''));
    const inner = el.shadowRoot && el.shadowRoot.elementFromPoint(innerWidth / 2, innerHeight / 2);
    if (!inner || inner === el) break;
    el = inner;
  }
  const free = path.some((p) => p.startsWith('hui-root')) && !path.some((p) => /scrim|veil|casora-popup/.test(p));
  return { scrims, menus, centre: path.join(' > '), free };
});

// Two ways to close the window: Escape and a tap beside it (on the scrim).
const closers = {
  escape: (page) => page.keyboard.press('Escape'),
  // Above the window, which stands over the bar and can reach far up.
  tap: async (page) => {
    const top = await page.evaluate(() => document.querySelector('.casora-notify-menu').getBoundingClientRect().top);
    await page.touchscreen.tap(196, Math.max(8, Math.min(40, top - 12)));
  },
};

for (const [name, close] of Object.entries(closers)) {
  const { page, browser } = await open({ mobile: true, width: 393, height: 852, safari: true });
  usePage(page);
  await dashboard(page, ph.url + '/' + (ph.config.views[0].path || '0'));
  const bell = await bellXY(page);
  await need(name + ': Glocke in der Handy-Leiste', bell && bell.docked, bell);
  await page.touchscreen.tap(bell.x, bell.y);
  const opened = await page.waitForFunction(() => document.querySelector('.casora-notify-menu')
    && document.querySelector('.hmn-scrim.open'), null, { timeout: 8000 }).then(() => true, () => false);
  await need(name + ': Glocken-Fenster offen mit Scrim', opened, await state(page));

  // HA rebuilds the dashboard (same as after a save elsewhere): new bar, new bell.
  await page.evaluate(() => { window.__r477Owner = window._hmnOwner; });
  await page.evaluate((u) => document.querySelector('home-assistant').hass.callApi('POST', 'events/lovelace_updated', { url_path: u }), ph.url);
  const rebuilt = await page.waitForFunction(() => window._hmnOwner && window._hmnOwner !== window.__r477Owner,
    null, { timeout: 10000 }).then(() => true, () => false);
  await need(name + ': Dashboard neu aufgebaut (neue Leiste)', rebuilt);
  await page.waitForTimeout(1200);

  await close(page);
  await page.waitForFunction(() => !document.querySelector('.casora-notify-menu'), null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(800);
  const s = await state(page);
  await check(name + ': Glocken-Fenster zu', s.menus === 0, s);
  await check(name + ': kein Scrim bleibt über der Seite', s.scrims === 0, s);
  await check(name + ': Mitte der Seite ist wieder das Dashboard', s.free, s);
  await browser.close();
}
await finish();
