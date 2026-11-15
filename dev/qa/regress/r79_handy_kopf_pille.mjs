// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026, 1.1.0): Die Kopfleiste am Handy beim Scrollen wird im Casora-Look eine
// schwebende Pille mit Mini-Status. Raumseite: statt des Vollbreiten-Balkens mit Zurück-Pfeil oben
// mittig „Raum · 21° · Licht aus“. Startseite: seit 1B (14.11.2026) fester Kopf statt Pille, siehe r830.
// Erwartet (iPhone 393×852, Theme „Casora“ hell und „Casora Nebel“ dunkel): Raum gescrollt = Pille
// sichtbar mit Raumnamen, schmaler als der Bildschirm, kein Vollbreiten-Balken, Zurück-Pfeil
// ausgeblendet; Startseite gescrollt = keine Pille „Zuhause“ (fester Kopf, r830). Ohne Casora-Theme (bis 1.6.0 „Hemma 2“): alter Balken unverändert (Vollbreite, keine Pille).
// Since the fixed head on room pages (1B, 15.11.2026, r832) the portrait phone shows the slim head row (back, room
// name) with the room's badges held under it instead of the pill or the bar, in every theme. The pill and the old bar
// stay where the fixed head does not apply: the phone in landscape (checked here after turning the phone).
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

// The fixed head of the open room page (portrait phone): slim row, name, back button, the held badge row.
const headState = (page) => page.evaluate(() => {
  const ov = window.__pierce('casora-filter-overlay').find((o) => o._showing);
  const el = ov?._headBO?.el;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const w = ov._subBadgesWrapper, card = w && w.parentNode === ov._contentEl ? ov._getBC(w) : null;
  const b = ov._backBtn ? ov._backBtn.getBoundingClientRect() : null;
  const hdr = ov._compactHeaderEl;
  return {
    op: parseFloat(getComputedStyle(el).opacity), name: el.firstChild.textContent.trim(), title: ov._titleEl?.textContent.trim(),
    top: r.top, h: r.height, w: r.width, vw: window.innerWidth,
    row: card ? { pos: getComputedStyle(card).position, top: card.getBoundingClientRect().top - r.top, bottom: card.getBoundingClientRect().bottom - r.top } : null,
    back: ov._backBtn ? parseFloat(getComputedStyle(ov._backBtn).opacity) : null, backMid: b ? (b.top + b.bottom) / 2 - r.top : null,
    old: hdr ? parseFloat(getComputedStyle(hdr).opacity) : null,
  };
});
// Portrait phone, room scrolled: the fixed head instead of the pill / the bar.
// band: where the fixed part ends (98 px; a taller badge row makes it taller, as without a Casora theme).
const checkHead = async (page, tag, band = 98) => {
  let s = null;
  for (let i = 0; i < 12 && !(s && s.op > 0.9); i++) {
    await page.waitForTimeout(500);
    await scrollRoom(page);
    await page.waitForTimeout(300);
    s = await headState(page);
  }
  console.log(tag, 'room, portrait', JSON.stringify(s));
  await need(`${tag}: room, portrait – the fixed head shows when the page scrolls`, s && s.op > 0.9, s);
  await check(`${tag}: room, portrait – slim head row at the top, full width`, Math.abs(s.top) < 1 && Math.abs(s.h - 44) < 1 && s.w >= s.vw - 1, s);
  await check(`${tag}: room, portrait – the head names the room`, s.title && s.name === s.title, s);
  await check(`${tag}: room, portrait – the room's badges are held under the head (fixed, inside ${band} px)`, s.row && s.row.pos === 'fixed' && s.row.top >= 44 - 0.5 && s.row.bottom <= band + 0.5, s);
  await check(`${tag}: room, portrait – back button stays, on the head row's centre line`, s.back !== null && s.back > 0.9 && Math.abs(s.backMid - 22) < 1.5, s);
  await check(`${tag}: room, portrait – no pill and no old bar next to the head`, s.old === 0, s);
};
// Turns the phone to landscape with the room open: the fixed head lets go, pill / bar as before.
const landscape = async (page) => {
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(900);
  let r = null;
  for (let i = 0; i < 12 && !(r && r.op > 0.9); i++) {
    await page.waitForTimeout(500);
    await scrollRoom(page);
    await page.waitForTimeout(300);
    r = await roomState(page);
  }
  return { r, head: await headState(page) };
};

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

  // Startseite: seit dem festen Kopf (1B, 14.11.2026) zeigt das Handy hochkant statt der Pille „Zuhause“ eine schmale
  // Zeile mit Begrüßung und Wetter über der festen Badge-Reihe (geprüft in r830_fester_kopf_handy). Die Pille bleibt
  // dort aus.
  let h = null;
  for (let i = 0; i < 4; i++) {
    await scrollHome(page);
    await page.waitForTimeout(400);
    h = await page.evaluate(() => {
      const pill = window.__pierce('.casora-head-pill').find((p) => !p.closest?.('casora-filter-overlay'));
      return pill ? { op: parseFloat(pill.style.opacity || '0'), head: !!window.__pierce('.casora-head-b').length } : null;
    });
  }
  console.log(tag, 'Startseite', JSON.stringify(h));
  await check(`${tag}: Startseite – feste Kopfzeile statt Pille „Zuhause“`, h && h.head && h.op === 0, h);

  // Raumseite
  await page.evaluate(() => window.scrollTo(0, 0));
  const label = await openRoom(page);
  await need(`${tag}: Raum öffnen`, label);
  await checkHead(page, tag);
  // Landscape: the floating pill with the room's mini status, as before the fixed head.
  const { r, head } = await landscape(page);
  console.log(tag, 'Raum quer', JSON.stringify(r), JSON.stringify(head));
  await need(`${tag}: Raum – Kopf erscheint beim Scrollen`, r && r.op > 0.9, r);
  await check(`${tag}: Raum quer – keine feste Kopfzeile, Badges nicht gehalten`, head && head.op === 0 && (!head.row || head.row.pos !== 'fixed'), head);
  await check(`${tag}: Raum – Pille statt Balken`, r.pill && r.w < r.vw - 40, r);
  await check(`${tag}: Raum – Pille nennt den Raum`, r.title && r.text.startsWith(r.title), r);
  await check(`${tag}: Raum – Zurück-Pfeil ausgeblendet`, r.back === null || r.back < 0.1, r);
  await check(`${tag}: Raum – weicher Verlauf statt Leinenfläche`, r.fade === 'casora-head-fade', r);
  if (process.env.R79_BILDER) await page.screenshot({ path: `${process.env.CASORA_OUT}/r79_${tag.replace(/ /g, '_')}.png` });
}

// Ohne Casora-Theme (Rückfall-Look, bis 1.6.0 „Hemma 2“): alter Balken unverändert.
{
  const { page } = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: true, theme: 'default' });
  usePage(page);
  await dashboard(page, phone.url, 3);
  await page.waitForTimeout(1500);
  // Gate 1.1.1: einmal stand die Seite trotz „Hemma 2“ im Casora-Look (Messwerte wie Nebel) – das
  // Theme hatte noch nicht gegriffen. Erst messen, wenn der Rückfall-Look wirklich gilt; sonst neu setzen.
  const hemma = () => page.waitForFunction(() => window._casoraSoft && !window._casoraSoft(), null, { timeout: 8000 }).then(() => true, () => false);
  if (!(await hemma())) {
    await page.evaluate(() => document.querySelector('home-assistant')
      .dispatchEvent(new CustomEvent('settheme', { detail: { theme: 'default', dark: true }, bubbles: true, composed: true })));
    await need('Ohne Casora-Theme: Theme gilt', await hemma());
  }
  const label = await openRoom(page);
  await need('Ohne Casora-Theme: Raum öffnen', label);
  await checkHead(page, 'Ohne Casora-Theme', 108);
  // Landscape: the old full-width bar, unchanged.
  const { r, head } = await landscape(page);
  console.log('Ohne Casora-Theme Raum quer', JSON.stringify(r), JSON.stringify(head));
  await check('Ohne Casora-Theme: Raum quer – keine feste Kopfzeile', head && head.op === 0 && (!head.row || head.row.pos !== 'fixed'), head);
  await need('Ohne Casora-Theme: Raum – Kopf erscheint beim Scrollen', r && r.op > 0.9, r);
  await check('Ohne Casora-Theme: Raum – Vollbreiten-Balken wie bisher, keine Pille', !r.pill && r.w >= r.vw - 1, r);
  await check('Ohne Casora-Theme: Raum – Zurück-Pfeil bleibt', r.back !== null && r.back > 0.9, r);
}
await finish();
