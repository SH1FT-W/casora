// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/04-navigation.js
// Handy-Leiste B (1.3, Casora-Look, navbar nav-05): Glocke und ⋯ saßen oben außer Daumenreichweite in einer
// eigenen Kapsel, und „Zuhause“ stand doppelt (Titel + Leiste).
// Erwartet (Handy 393, WebKit, hell + dunkel): Kapsel unten in der Navigationsleiste hinter einem Trenner,
// oben keine Kapsel mehr; alle Leisten-Tasten ≥ 48 hoch und ≥ 48 breit, Kreise auf einer Linie; die aktive
// Taste ohne Namen; ⋯ öffnet sein Menü ganz im Bild über der Leiste; die Glocke ebenso.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora-Dashboard mit Handy-Gegenstück', d && d.phone, d && d.url);

for (const dark of [false, true]) {
  const tag = dark ? 'dunkel' : 'hell';
  const { page } = await open({ width: 393, height: 852, mobile: true, touch: true, safari: true, scale: 2, dark, theme: 'Casora' });
  usePage(page);
  await dashboard(page, d.phone.url, 3);
  await page.waitForFunction(() => !!document.querySelector('.hmn-bar.hmn-act .hmn-dock button-card'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const s = await page.evaluate(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
    const bar = document.querySelector('.hmn-bar');
    const card = bar && bar.querySelector('.hmn-dock button-card');
    if (!card) return null;
    const btns = [...bar.querySelectorAll('.hmn-btn')];
    const slots = ['bell', 'assist', 'edit'].map((k) => card.shadowRoot.getElementById(k)).filter((e) => e && e.getBoundingClientRect().width > 0);
    const circles = [...bar.querySelectorAll('.hmn-bic')].map(R).concat(slots.map((e) => R(e.querySelector('button-card').shadowRoot.querySelector('ha-card'))));
    const on = bar.querySelector('.hmn-btn.on');
    const lab = on && on.querySelector(':scope > span:not(.hmn-bic)');
    const top = window.__pierce('button-card').filter((b) => [].concat(b._config?.template || []).includes('casora_mobile_chrome') && b !== card && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top < 200);
    return { bar: R(bar), sep: R(bar.querySelector('.hmn-sep')), dock: R(bar.querySelector('.hmn-dock')), btns: btns.map(R), slots: slots.map(R), circles,
      onLabel: lab ? getComputedStyle(lab).display : 'fehlt', topCaps: top.length, vh: innerHeight };
  });
  await need(`${tag}: Kapsel in der Leiste`, s, s);
  await check(`${tag}: Kapsel unten, hinter dem Trenner`, s.dock.t > s.vh / 2 && s.sep.w > 0 && s.sep.r <= s.dock.l + 0.5 && s.btns.every((b) => b.r <= s.sep.l + 0.5), s);
  await check(`${tag}: oben keine Kapsel mehr`, s.topCaps === 0, s.topCaps);
  await check(`${tag}: Leisten-Tasten ≥ 48 × 48`, s.btns.every((b) => b.w >= 47.5 && b.h >= 47.5) && s.slots.every((b) => b.w >= 47.5), s.btns.concat(s.slots));
  const ys = s.circles.map((c) => Math.round((c.t + c.h / 2) * 2) / 2);
  await check(`${tag}: Kreise auf einer Linie (±0,5)`, Math.max(...ys) - Math.min(...ys) <= 0.5, ys);
  await check(`${tag}: aktive Taste ohne Namen (Titel steht darüber)`, s.onLabel === 'none', s.onLabel);
  await check(`${tag}: Leiste im Bild (16 px Rand)`, s.bar.l >= 15.5 && s.bar.r <= 393 - 15.5, s.bar);

  // ⋯ und Glocke: Menü ganz im Bild, über der Leiste. Angetippt wird 5 px ÜBER dem Kreis (36) – die
  // Trefferfläche ist trotzdem 48 hoch (unsichtbares ::before, --casora-chrome-hit).
  for (const [name, idx, sel] of [['⋯', -1, '.casora-settings-menu'], ['Glocke', 0, '.casora-notify-menu']]) {
    const p = await page.evaluate((idx) => { const c = document.querySelector('.hmn-dock button-card'); const bs = [...c.shadowRoot.querySelectorAll('button-card')].filter((b) => b.getBoundingClientRect().width > 0);
      const b = bs.at(idx); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y - 5 }; }, idx);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(1500);
    const m = await page.evaluate((sel) => { const m = document.querySelector(sel); if (!m) return null; const r = m.getBoundingClientRect(); const b = document.querySelector('.hmn-bar').getBoundingClientRect();
      return { t: r.top, b: r.bottom, h: r.height, barTop: b.top }; }, sel);
    await check(`${tag}: ${name} (5 px über dem Kreis angetippt) öffnet über der Leiste, ganz im Bild`, m && m.h > 40 && m.t >= 0 && m.b <= m.barTop + 1, m);
    // Schließen mit Escape (beide Menüs hören darauf): ein Tipp daneben, z. B. (200, 300), schließt zwar das Menü,
    // geht aber wie immer zur Kachel darunter durch (Testhaus: Fußball/Jalousie) – deren Popup fing dann den
    // nächsten Tipp auf die Leiste ab.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
  }
  await page.close();
}
await finish();
