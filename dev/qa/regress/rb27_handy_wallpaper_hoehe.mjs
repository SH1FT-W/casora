// @zustand: arbeit
// @parallel: ui
// Handy-Vorschau im Studio (11.10.2026): Das Wallpaper endete bei etwa 60 % der Höhe, darunter war
// die Vorschau hell und leer bis zur Navigationsleiste – am echten Handy reicht es im Look „Casora“
// bis unten. Ursache: die Nachbildung hatte Fotohöhe (64 %) und Verlauf fest eingetragen statt die
// Theme-Werte (--casora-mobile-hero-height usw.) wie casora_mobile_bg zu lesen.
// Erwartet, hell und dunkel: Das Foto der Handy-Vorschau deckt die volle Höhe, seine Höhe folgt
// --casora-mobile-hero-height (+ sicherer Bereich + Überstand) wie am Handy, die Unschärfe folgt
// --casora-mobile-hero-blur. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

for (const dark of [false, true]) {
  const tag = dark ? 'dunkel' : 'hell';
  const o = await open({ width: 1440, height: 900, dark, theme: 'Casora', studio: 'b' });
  await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"always_hidden"'));
  await studio(o.page, dash.url);
  await o.page.evaluate((d) => { const p = window.__panel(); if (p._bClose) p._bClose();
    p._phoneFilter = null; p._miniDark = d; p._miniSize = 'phone'; p._rebuildPreview(); }, dark);
  await o.page.waitForTimeout(2500);
  const m = await o.page.evaluate(() => {
    const r = window.__panel().shadowRoot;
    const s = r.querySelector('.card.map .miniphone');
    const img = s && s.querySelector('.mp-photo:not(.mp-barveilimg)');
    if (!s || !img) return null;
    const cs = getComputedStyle(s), b = s.getBoundingClientRect(), f = img.getBoundingClientRect();
    const k = b.height / s.offsetHeight;
    const v = (n) => cs.getPropertyValue(n).trim();
    return { nophoto: s.classList.contains('nophoto'), H: s.offsetHeight, k,
      top: b.top, bottom: b.bottom, ftop: f.top, fbottom: f.bottom, fh: f.height / k,
      hero: v('--casora-mobile-hero-height'), safe: parseFloat(v('--ph-safe')), over: parseFloat(v('--ph-overscan')),
      blurVar: v('--casora-mobile-hero-blur'), filter: getComputedStyle(img).filter };
  });
  await need(tag + ': Handy-Vorschau mit Foto', m && !m.nophoto, m);
  await check(tag + ': Look „Casora“ will das Foto bis unten (Theme-Wert 100 %)', m.hero === '100%', m.hero);
  await check(tag + ': Foto deckt die Vorschau bis unten', m.ftop <= m.top + 1 && m.fbottom >= m.bottom - 1,
    { top: m.top, bottom: m.bottom, ftop: m.ftop, fbottom: m.fbottom });
  const want = (parseFloat(m.hero) / 100) * m.H + m.safe + m.over;
  await check(tag + ': Fotohöhe folgt --casora-mobile-hero-height wie am Handy', Math.abs(m.fh - want) <= 2, { fh: m.fh, want });
  await check(tag + ': Unschärfe folgt --casora-mobile-hero-blur', !m.blurVar || m.filter.includes('blur(' + m.blurVar + ')'),
    { blurVar: m.blurVar, filter: m.filter });
  await o.browser.close();
}
await finish();
