// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026, 1.1.0): Die Kopfleiste am Handy beim Scrollen wird im Casora-Look eine
// schwebende Pille mit Mini-Status. Raumseite: statt des Vollbreiten-Balkens mit Zurück-Pfeil oben
// mittig „Raum · 21° · Licht aus“; Startseite: statt einer deckenden Fläche mit harter Unterkante ein
// weicher Verlauf und links die Pille „Zuhause · Kurzstatus“, die Glocke/Menü nie überlappt.
// Erwartet (iPhone 393×852, Theme „Casora“ hell und „Casora Nebel“ dunkel): Raum gescrollt = Pille
// sichtbar mit Raumnamen, schmaler als der Bildschirm, kein Vollbreiten-Balken, Zurück-Pfeil
// ausgeblendet; Startseite gescrollt = weicher Verlauf statt Glasbalken mit Kante, Pille endet vor
// Glocke/Menü. Hemma 2: alter Balken unverändert (Vollbreite, keine Pille).
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const phone = all.find((d) => d.mobile);
await need('Handy-Dashboard', phone);

// Seite künstlich verlängern, damit sich auch ein kurzes Testhaus ganz scrollen lässt.
const scrollHome = (page) => page.evaluate(() => {
  if (!document.getElementById('r79-spacer')) {
    const d = document.createElement('div');
    d.id = 'r79-spacer';
    d.style.height = '1400px';
    document.body.appendChild(d);
  }
  const se = document.scrollingElement;
  se.scrollTop = 600;
  window.dispatchEvent(new Event('scroll'));
  for (const el of window.__pierce('*')) {
    if (el.scrollHeight > el.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(el).overflowY)) {
      el.scrollTop = 600;
      el.dispatchEvent(new Event('scroll'));
    }
  }
  document.dispatchEvent(new Event('touchmove'));
});

const openRoom = (page) => page.evaluate(() => {
  const nav = window.__pierce('casora-mobile-nav')[0];
  const k = (nav?._items('rooms') || []).filter((x) => x.label);
  if (!k.length) return null;
  k[0].run();
  return k[0].label;
});

const scrollRoom = (page) => page.evaluate(() => {
  const ov = window.__pierce('casora-filter-overlay').find((o) => o._showing && o._scrollHandler);
  if (!ov) return false;
  if (!ov._contentEl.querySelector('#r79-spacer')) {
    const d = document.createElement('div');
    d.id = 'r79-spacer';
    d.style.height = '1400px';
    ov._contentEl.appendChild(d);
  }
  ov._overlayEl.scrollTop = 500;
  ov._overlayEl.dispatchEvent(new Event('scroll'));
  return true;
});

const roomState = (page) => page.evaluate(() => {
  const ov = window.__pierce('casora-filter-overlay').find((o) => o._showing);
  const hdr = ov?._compactHeaderEl;
  if (!hdr) return null;
  const r = hdr.getBoundingClientRect();
  return {
    pill: hdr.classList.contains('casora-head-pill'),
    text: hdr.textContent.trim(),
    title: ov._titleEl?.textContent.trim(),
    op: parseFloat(hdr.style.opacity || '0'),
    w: r.width, vw: window.innerWidth, top: r.top,
    back: ov._backBtn ? parseFloat(getComputedStyle(ov._backBtn).opacity) : null,
    fade: ov._headFillEl?.className || null,
  };
});

for (const [theme, dark] of [['Casora', false], ['Casora Nebel', true]]) {
  const tag = `${theme} ${dark ? 'dunkel' : 'hell'}`;
  const { page } = await open({ width: 393, height: 852, mobile: true, scale: 2, dark, theme });
  usePage(page);
  await dashboard(page, phone.url, 3);
  await page.waitForTimeout(1500);

  // Startseite
  let h = null;
  for (let i = 0; i < 12 && !(h && h.op > 0.9); i++) {
    await scrollHome(page);
    await page.waitForTimeout(400);
    h = await page.evaluate(() => {
      const pill = window.__pierce('.casora-head-pill').find((p) => !p.closest?.('casora-filter-overlay'));
      const fade = window.__pierce('.casora-head-fade')[0];
      if (!pill) return null;
      // Alter Glasbalken: fest oben, über die ganze Breite, mit Unschärfe – muss unsichtbar bleiben.
      const hard = window.__pierce('div').filter((d) => {
        const cs = getComputedStyle(d);
        return cs.position === 'fixed' && d.getBoundingClientRect().top <= 0 && d.getBoundingClientRect().width >= window.innerWidth - 1
          && /blur\(22px\)/.test(cs.backdropFilter || cs.webkitBackdropFilter || '') && parseFloat(cs.opacity) > 0.05;
      }).length;
      // Halter von Glocke/Menü (fest oben rechts, über der Pille).
      const chrome = window.__pierce('div').find((d) => {
        const cs = getComputedStyle(d);
        return cs.position === 'fixed' && cs.zIndex === '113' && d.getBoundingClientRect().width > 0;
      });
      const pr = pill.getBoundingClientRect(), cr = chrome?.getBoundingClientRect();
      return {
        op: parseFloat(pill.style.opacity || '0'), text: pill.textContent.trim(),
        right: pr.right, chromeLeft: cr ? cr.left : null, top: pr.top,
        fadeOp: fade ? parseFloat(fade.style.opacity || '0') : null,
        fadeBg: fade ? getComputedStyle(fade).maskImage || getComputedStyle(fade).webkitMaskImage : null,
        hard,
      };
    });
  }
  console.log(tag, 'Startseite', JSON.stringify(h));
  await need(`${tag}: Startseite – Pille erscheint beim Scrollen`, h && h.op > 0.9, h);
  await check(`${tag}: Startseite – Pille sagt „Zuhause …“`, /^(Zuhause|Home)/.test(h.text), h.text);
  await check(`${tag}: Startseite – Pille endet vor Glocke/Menü`, h.chromeLeft != null && h.right <= h.chromeLeft - 4, h);
  await check(`${tag}: Startseite – weicher Verlauf sichtbar`, h.fadeOp > 0.9 && /gradient/.test(h.fadeBg || ''), h);
  await check(`${tag}: Startseite – keine deckende Fläche mit harter Kante`, h.hard === 0, h);

  // Raumseite
  await page.evaluate(() => window.scrollTo(0, 0));
  const label = await openRoom(page);
  await need(`${tag}: Raum öffnen`, label);
  let r = null;
  for (let i = 0; i < 12 && !(r && r.op > 0.9); i++) {
    await page.waitForTimeout(500);
    await scrollRoom(page);
    await page.waitForTimeout(300);
    r = await roomState(page);
  }
  console.log(tag, 'Raum', JSON.stringify(r));
  await need(`${tag}: Raum – Kopf erscheint beim Scrollen`, r && r.op > 0.9, r);
  await check(`${tag}: Raum – Pille statt Balken`, r.pill && r.w < r.vw - 40, r);
  await check(`${tag}: Raum – Pille nennt den Raum`, r.title && r.text.startsWith(r.title), r);
  await check(`${tag}: Raum – Zurück-Pfeil ausgeblendet`, r.back === null || r.back < 0.1, r);
  await check(`${tag}: Raum – weicher Verlauf statt Leinenfläche`, r.fade === 'casora-head-fade', r);
  if (process.env.R79_BILDER) await page.screenshot({ path: `${process.env.CASORA_OUT}/r79_${tag.replace(/ /g, '_')}.png` });
}

// Hemma 2: alter Balken unverändert.
{
  const { page } = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: true, theme: 'Hemma 2' });
  usePage(page);
  await dashboard(page, phone.url, 3);
  await page.waitForTimeout(1500);
  const label = await openRoom(page);
  await need('Hemma 2: Raum öffnen', label);
  let r = null;
  for (let i = 0; i < 12 && !(r && r.op > 0.9); i++) {
    await page.waitForTimeout(500);
    await scrollRoom(page);
    await page.waitForTimeout(300);
    r = await roomState(page);
  }
  console.log('Hemma 2 Raum', JSON.stringify(r));
  await need('Hemma 2: Raum – Kopf erscheint beim Scrollen', r && r.op > 0.9, r);
  await check('Hemma 2: Raum – Vollbreiten-Balken wie bisher, keine Pille', !r.pill && r.w >= r.vw - 1, r);
  await check('Hemma 2: Raum – Zurück-Pfeil bleibt', r.back !== null && r.back > 0.9, r);
}
await finish();
