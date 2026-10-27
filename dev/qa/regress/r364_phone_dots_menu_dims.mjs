// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Owner (26.10.2026): on the phone the bell's window dims the page behind it (the player steps back), the ⋯ menu did
// not – the player stayed sharp next to the menu. Expected (Casora, iPhone 393 × 852): ⋯ opens with the bar's scrim
// like the bell; closing the menu (Escape or a tap beside it) removes the scrim again.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.phone.url + '/home', 2);
const dots = await page.evaluate(() => { const c = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_settings_button') && b.getBoundingClientRect().width > 0);
  if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await need('⋯ in the phone bar', dots);
const state = () => page.evaluate(() => ({ menu: !!document.querySelector('.casora-settings-menu'), scrim: !!document.querySelector('.hmn-scrim.open') }));
await page.touchscreen.tap(dots.x, dots.y);
await page.waitForTimeout(1200);
const a = await state();
await check('⋯ open: the page behind is dimmed (scrim) like for the bell', a.menu && a.scrim, a);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
const b = await state();
await check('⋯ closed: scrim gone', !b.menu && !b.scrim, b);
await page.touchscreen.tap(dots.x, dots.y);
await page.waitForTimeout(1200);
await page.touchscreen.tap(196, 120);
await page.waitForTimeout(900);
const c = await state();
await check('tap beside the menu: menu and scrim gone', !c.menu && !c.scrim, c);
await finish();
