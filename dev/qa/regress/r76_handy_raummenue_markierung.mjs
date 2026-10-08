// @zustand: demo
// @parallel: ui
// Gemeldet (07.10.2026): Im Räume-Menü der Handy-Leiste (Theme „Casora“, dunkel, iPhone) saß die
// Markierung der offenen Zeile nicht sauber in der Menü-Fläche: oben war weniger Luft als links und
// rechts, die Ecken waren nicht zur Menü-Rundung passend (konzentrisch), und der Symbolkreis klebte
// links fast an der Kante der Markierung.
// Erwartet (Casora hell und dunkel, Casora Nebel hell, 393 px): Abstand der Markierung zum Menürand oben = links = rechts (±1 px),
// Radius der Markierung = Menü-Radius minus dieser Abstand (±1 px), Symbolkreis links mit demselben
// Abstand zur Markierung wie zwischen Kreis und Text (±1 px), Symbol und Text in jeder Zeile auf
// derselben Linie (offene und andere Zeilen gleich).
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const phone = all.find((d) => d.mobile);
await need('Handy-Dashboard', phone);

const close = (a, b, t = 1) => Math.abs(a - b) <= t;

for (const [theme, dark] of [['Casora', false], ['Casora', true], ['Casora Nebel', false]]) {
  const tag = theme + ' ' + (dark ? 'dunkel' : 'hell');
  const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark, theme });
  usePage(page);
  await dashboard(page, phone.url, 3);
  let m = null;
  for (let i = 0; i < 15 && !(m && m.on); i++) {
    m = await page.evaluate(() => {
      const nav = window.__pierce('casora-mobile-nav')[0];
      if (!nav || !nav._hass || !nav._bRooms) return null;
      // Ersten Raum öffnen, damit es eine offene (markierte) Zeile gibt.
      if (!document.querySelector('.hmn-menu')) {
        const keys = (nav._items('rooms') || []).filter((x) => x.on !== undefined);
        if (!keys.some((x) => x.on)) { const first = keys.find((x) => x.label); if (first) { first.run(); return { wait: true }; } }
        nav._bRooms.click();
        return { wait: true };
      }
      const menu = document.querySelector('.hmn-menu');
      const on = menu.querySelector('.hmn-item.on');
      if (!on) { nav._closeMenu(); return { wait: true }; }
      const off = [...menu.querySelectorAll('.hmn-item:not(.on)')][0];
      // Seit Entwurf A (08.10.2026) ist das Menü im Casora-Look ein Blatt von unten: die Zeilen liegen
      // in .hmn-list unter Griff und Überschrift. Oben zählt dort der Kopf, nicht der Rand (r82 misst das Blatt).
      const sheet = menu.classList.contains('hmn-sheet'), box = sheet ? menu.querySelector('.hmn-list') : menu;
      const R = (e) => e.getBoundingClientRect();
      const cs = (e) => getComputedStyle(e);
      const mr = R(box), or = R(on), bw = sheet ? 0 : (parseFloat(cs(menu).borderTopWidth) || 0);
      const row = (b) => {
        const ic = b.querySelector('.hmn-ic,.casora-mi') || b.querySelector('ha-icon,.hmn-svg');
        const tx = b.querySelector('.hmn-txt') || b.querySelector(':scope>span:not(.casora-mi)');
        const r = R(b), i = R(ic), t = R(tx);
        return { icL: i.left - r.left, icW: i.width, gap: t.left - i.right, txL: t.left - r.left, icTop: i.top - r.top, icH: i.height, rowH: r.height };
      };
      return {
        on: true, sheet,
        top: sheet ? null : or.top - mr.top - bw + menu.scrollTop, left: or.left - mr.left - bw, right: mr.right - or.right - bw,
        menuR: parseFloat(cs(menu).borderTopLeftRadius), onR: parseFloat(cs(on).borderTopLeftRadius),
        a: row(on), b: off ? row(off) : null,
      };
    });
    if (!(m && m.on)) await page.waitForTimeout(700);
  }
  await need(`${tag}: Räume-Menü mit markierter Zeile`, m && m.on, m);
  console.log(tag, JSON.stringify(m));
  const pad = m.left;
  await check(`${tag}: Abstand oben = links = rechts`, (m.sheet || close(m.top, pad)) && close(m.right, pad), m);
  await check(`${tag}: Radius konzentrisch (Menü ${m.menuR} − ${pad} = Markierung ${m.onR})`, close(m.onR, m.menuR - pad), m);
  await check(`${tag}: Symbolkreis links so weit wie zum Text`, close(m.a.icL, m.a.gap), m.a);
  await check(`${tag}: Symbolkreis oben/unten mittig`, close(m.a.icTop, (m.a.rowH - m.a.icH) / 2), m.a);
  await check(`${tag}: Symbol und Text springen nicht zwischen den Zeilen`, m.b && close(m.a.icL, m.b.icL) && close(m.a.txL, m.b.txL), [m.a, m.b]);
  if (process.env.R76_BILDER) await page.screenshot({ path: `${process.env.CASORA_OUT}/r76_${tag.replace(/ /g, '_')}.png` });
}
await finish();
