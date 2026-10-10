// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/04-navigation.js custom_components/casora/scripts/filter-overlay.js custom_components/casora/theme_weich.yaml
// P-V6 (1.3): Szenen-Knopf der Handy-Leiste in einem Raum – oben „<Raum>“ mit den Szenen des Raums
// (dieselben wie auf der Raumseite), darunter „Ganzes Haus“ mit den Haus-Szenen, je mit Überschrift.
// Vorher hing es an der festen Startseiten-Auswahl: mit ihr fehlten die Raum-Szenen, ohne sie die
// Haus-Szenen. Auf der Startseite: nur die Haus-Szenen, ohne Überschrift.
// AB-03 (1.3): Badges am Handy (Casora) mindestens 40 px hoch.
import { open, ready, check, need, finish } from './lib.mjs';

const DASH = process.env.CASORA_QA_DASH || 'qa-arbeit';
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, theme: 'Casora', dark: false });
await ready(page, '/' + DASH + '-mobile/home', () => window.__pierce && window.__pierce('button-card').length > 3);
await page.waitForTimeout(3500);
const nav = () => page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._items === 'function'); return !!n; });
await need('Handy-Leiste', await nav());

const badges = await page.evaluate(() => window.__pierce('button-card').filter((b) => /casora_badge/.test(JSON.stringify((b._config || {}).template || '')) && b.getBoundingClientRect().width > 30 && b.getBoundingClientRect().top < innerHeight)
  .map((b) => Math.round(b.shadowRoot.querySelector('ha-card').getBoundingClientRect().height * 10) / 10));
await need('Badges sichtbar', badges.length > 0, badges);
await check('AB-03 Badges am Handy ≥ 40 px', badges.every((h) => h >= 39.9), badges);

const items = () => page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._items === 'function'); return n._items('scenes').map((i) => (i.header ? '# ' + i.header : i.id)); });
const home = await items();
await check('P-V6 Startseite: nur Haus-Szenen, ohne Überschrift', home.length > 0 && !home.some((x) => x.startsWith('# ')), home);

const room = await page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._items === 'function');
  const r = n._rooms.find((x) => /wohnzimmer/i.test(x.key)) || n._rooms[0]; window._casoraFilter.set(r.key); return r.label || r.name; });
await page.waitForTimeout(3000);
const onPage = await page.evaluate(() => [...new Set(window.__pierce('[data-scene]').filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('data-scene')))]);
const list = await items();
if (onPage.length) {
  await check('P-V6 Raum: erste Überschrift ist der Raum', list[0] === '# ' + room, list);
  const roomPart = list.slice(1, list.findIndex((x, i) => i > 0 && x.startsWith('# ')) >>> 0);
  await check('P-V6 Raum-Gruppe = Szenen der Raumseite', onPage.every((id) => roomPart.includes(id)), { onPage, roomPart });
  const hi = list.indexOf('# Ganzes Haus');
  await check('P-V6 darunter „Ganzes Haus“ mit Haus-Szenen', hi > 0 && list.slice(hi + 1).length > 0 && list.slice(hi + 1).every((id) => home.includes(id)), list);
} else {
  await check('P-V6 Raum ohne Szenen: nur Haus-Gruppe', !list.some((x) => x.startsWith('# ')), list);
}
await finish();
