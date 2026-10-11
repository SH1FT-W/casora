// @zustand: arbeit
// Gewünscht (11.10.2026): Assist aus der Handy-Leiste öffnet nicht als Blatt bis oben, sondern wie Glocke und
// Räume als Fenster über der Leiste. Erwartet: Fenster mittig über der Leiste, ringsum rund, Leiste scharf und
// darüber, Assist-Knopf aktiv, Zuhause nicht; zweiter Tipp schließt; Tipp auf Räume schließt Assist.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await dashboard(page, dash.phone.url);
await page.waitForTimeout(2500);
const btn = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_assist_button') && x.getBoundingClientRect().width > 0);
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, docked: r.top > 700 }; });
await need('Assist unten in der Leiste', btn && btn.docked, btn);
const st = () => page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const s = p && p.surface ? p.surface.getBoundingClientRect() : null;
  const bar = document.querySelector('.hmn-bar'), br = bar.getBoundingClientRect();
  const top = document.elementsFromPoint(br.left + 30, br.top + 30)[0];
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_assist_button') && x.getBoundingClientRect().width > 0);
  return { open: !!p, float: !!(p && p.hasAttribute('float')), mid: s ? Math.round(s.left + s.width / 2) : null, bottom: s ? Math.round(s.bottom) : null,
    sTop: s ? Math.round(s.top) : null, barTop: Math.round(br.top), barOben: !!(top && top.closest && top.closest('.hmn-bar')),
    mark: b ? b.style.getPropertyValue('--casora-chrome-btn-shadow') : '', homeOn: document.querySelector('.hmn-bar .hmn-btn').classList.contains('on'), vw: innerWidth };
});
await page.touchscreen.tap(btn.x, btn.y);
await page.waitForTimeout(1500);
const a = await st();
await need('Assist offen', a.open, a);
await check('als Fenster (float)', a.float, a);
await check('mittig', Math.abs(a.mid - a.vw / 2) <= 2, a);
await check('über der Leiste, nicht bis oben', a.bottom <= a.barTop && a.sTop > 60, a);
await check('Leiste scharf darüber', a.barOben, a);
await check('Assist-Knopf aktiv, Zuhause nicht', /7px/.test(a.mark) && !a.homeOn, a);
await page.touchscreen.tap(btn.x, btn.y);
await page.waitForTimeout(900);
const b = await st();
await check('zweiter Tipp schließt, Knopf wieder normal, Zuhause aktiv', !b.open && !b.mark && b.homeOn, b);
await page.touchscreen.tap(btn.x, btn.y);
await page.waitForTimeout(1300);
const rooms = await page.evaluate(() => { const r = document.querySelectorAll('.hmn-bar .hmn-btn')[1].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.touchscreen.tap(rooms.x, rooms.y);
await page.waitForTimeout(1200);
const c = await page.evaluate(() => ({ assist: !!window.__pierce('casora-popup').find((x) => x.hasAttribute('open')), sheet: !!document.querySelector('.hmn-menu.open') }));
await check('Tipp auf Räume: Assist zu, Räume offen', !c.assist && c.sheet, c);
await finish();
