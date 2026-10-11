// @zustand: arbeit
// Gemeldet (11.10.2026): Am Handy (Glocke unten in der Leiste) lag das Glocken-Fenster nicht mittig, der
// Hintergrund wurde nicht unscharf wie bei Räumen/Szenen, und die Glocke war nicht aktiv markiert (Zuhause blieb es).
// Erwartet: Fenster mittig, Scrim offen, Glocke mit Ring (aktiv), Zuhause nicht aktiv; nach dem Schließen alles zurück.
// Nachtrag 11.10.: Szenen-Blatt offen → direkt Glocke – die Leiste lag danach unter dem Scrim (unscharf).
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await dashboard(page, dash.phone.url);
await page.waitForTimeout(2500);
const bell = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_notifications_button') && x.getBoundingClientRect().width > 0);
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, docked: r.top > 700 }; });
await need('Glocke unten in der Leiste', bell && bell.docked, bell);
const state = () => page.evaluate(() => {
  const m = window.__pierce('.casora-notify-menu').find((x) => x.getBoundingClientRect().height > 0);
  const r = m && m.getBoundingClientRect();
  const sc = document.querySelector('.hmn-scrim.open');
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_notifications_button') && x.getBoundingClientRect().width > 0);
  const home = document.querySelector('.hmn-bar .hmn-btn');
  return { menu: !!m, mid: r ? Math.round(r.left + r.width / 2) : null, scrim: !!sc, ring: b ? b.style.getPropertyValue('--casora-chrome-btn-shadow') : '',
    homeOn: !!(home && home.classList.contains('on')), vw: window.innerWidth };
});
await page.touchscreen.tap(bell.x, bell.y);
await page.waitForTimeout(1200);
const a = await state();
await need('Glocken-Fenster offen', a.menu, a);
await check('Fenster mittig', Math.abs(a.mid - a.vw / 2) <= 2, a);
await check('Hintergrund unscharf (Scrim offen)', a.scrim, a);
await check('Glocke aktiv markiert', /7px/.test(a.ring), a);
await check('Zuhause solange nicht aktiv', !a.homeOn, a);
await page.touchscreen.tap(a.vw / 2, 120);
await page.waitForTimeout(900);
const b = await state();
await check('nach dem Schließen: Scrim weg, Glocke normal, Zuhause aktiv', !b.menu && !b.scrim && !b.ring && b.homeOn, b);

// Szenen-Blatt offen, dann direkt die Glocke: die Leiste bleibt über dem Scrim.
const scenes = await page.evaluate(() => { const b = document.querySelectorAll('.hmn-bar .hmn-btn')[2].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
await page.touchscreen.tap(scenes.x, scenes.y);
await page.waitForTimeout(900);
await page.touchscreen.tap(bell.x, bell.y);
await page.waitForTimeout(1200);
const c = await page.evaluate(() => { const top = document.elementsFromPoint(40, document.querySelector('.hmn-bar').getBoundingClientRect().top + 30)[0];
  return { up: document.querySelector('.hmn-bar').classList.contains('hmn-up'), scrim: !!document.querySelector('.hmn-scrim.open'),
    barOben: !!(top && top.closest && top.closest('.hmn-bar')), menu: window.__pierce('.casora-notify-menu').some((m) => m.getBoundingClientRect().height > 0) }; });
await check('Szenen → Glocke: Glocke offen, Leiste über dem Scrim (nicht unscharf)', c.menu && c.scrim && c.up && c.barOben, c);
await finish();
