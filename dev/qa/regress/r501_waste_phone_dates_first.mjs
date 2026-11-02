// @zustand: arbeit
// @parallel: ui
// Issue #117 (stalakerob, 02.11.2026): on the phone the waste popup (v3, with the month calendar) showed the calendar
// first; the next pickup dates (bins list) only came after scrolling down. Asked for: the calendar at the end.
// Expected on the phone (393x852, WebKit), owner's variant B: a fixed card „Heute“ on top, then bins, duty, the month
// last. Tapping a day shows its card right under the month without the popup jumping up; tapping it again closes it.
// Desktop 1440 unchanged: month left, day card and bins list right, both columns start at the same height.
// The tile is built in the browser from the test house's casora_trash tile; nothing is saved. CASORA_LOCAL=1: the
// casora_trash template from this checkout, in the browser only. R501_BILD=<dir>: pictures of the popup (phone).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const tileOf = (o) => {
  if (!o || typeof o !== 'object') return null;
  if ([].concat(o.template || []).includes('casora_trash')) return o;
  for (const x of Object.values(o)) { const t = tileOf(x); if (t) return t; }
  return null;
};
const desk = all.find((d) => !d.mobile && !/importiert/.test(d.url) && tileOf(d.config));
await need('Casora-Dashboard mit Abfall-Kachel', desk);
const TILE = JSON.parse(JSON.stringify(tileOf(desk.config)));
const LOCAL = process.env.CASORA_LOCAL
  ? JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates.casora_trash
  : null;

async function measure(name, opts) {
  const { page } = await open({ dark: false, theme: 'Casora', ...opts });
  usePage(page);
  await dashboard(page, desk.url, 3);
  if (LOCAL) {
    const done = await page.evaluate((t) => {
      // The dashboard config is frozen: hand hui-root a copy with the local template (button-card reads it there).
      const root = window.__pierce('hui-root')[0], ll = root && root.lovelace, cfg = ll && ll.config;
      if (!cfg || !cfg.button_card_templates) return false;
      root.lovelace = Object.assign({}, ll, { config: Object.assign({}, cfg, { button_card_templates: Object.assign({}, cfg.button_card_templates, { casora_trash: t }) }) });
      return true;
    }, LOCAL);
    await need(name + ': casora_trash aus dem Checkout eingesetzt', done);
  }
  const opened = await page.evaluate(async (tile) => {
    const ha = document.querySelector('home-assistant');
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
    if (!old) return 'keine Kachel als Anker';
    const el = document.createElement('button-card');
    el.setConfig(Object.assign({ type: 'custom:button-card' }, tile));
    el.hass = ha.hass; old.parentNode.insertBefore(el, old);
    await new Promise((res) => setTimeout(res, 800));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    return 'ok';
  }, TILE);
  await need(name + ': Abfall-Popup geöffnet', opened === 'ok', opened);
  // Wait for the sections: the month (#cal) and the bins list (#right) inside the popup's trash card.
  let r = null;
  for (let i = 0; i < 60; i++) {
    r = await page.evaluate(() => {
      const S = window.casoraPopup && window.casoraPopup.surface;
      if (!S) return null;
      const card = window.__pierce('button-card', S).find((b) => b.shadowRoot && b.shadowRoot.querySelector('#cal') && b.shadowRoot.querySelector('#right'));
      if (!card) return null;
      const rect = (id) => { const n = card.shadowRoot.querySelector('#' + id); if (!n) return null;
        const q = n.getBoundingClientRect(); return q.height > 0 ? { top: Math.round(q.top), left: Math.round(q.left), bottom: Math.round(q.bottom), h: Math.round(q.height) } : null; };
      const out = { v3: !!(window._casoraUI && window._casoraUI.v3 && window._casoraUI.v3()) };
      ['cal', 'down', 'wday', 'right', 'duty', 'wtoday', 'wpick'].forEach((k) => { out[k] = rect(k); });
      const t = out.wtoday && card.shadowRoot.querySelector('#wtoday');
      out.todayText = t ? (window.__pierce('.hcal', t)[0] || {}).textContent || '' : '';
      return out.cal && out.right && out.cal.h > 100 ? out : null;
    });
    if (r) break;
    await page.waitForTimeout(250);
  }
  return { page, r };
}

// Phone (WebKit).
const ph = await measure('Handy', { width: 393, height: 852, mobile: true, safari: true });
await need('Handy: Monat und Tonnen-Liste im Popup gezeichnet', ph.r, ph.r);
await need('Handy: v3-Popups aktiv', ph.r.v3, ph.r);
const DIR = process.env.R501_BILD;
if (DIR) {
  fs.mkdirSync(DIR, { recursive: true });
  await ph.page.waitForTimeout(800);
  await ph.page.screenshot({ path: path.join(DIR, (LOCAL ? 'nachher' : 'vorher') + '-handy.png') });
}
await check('Handy: Tonnen-Liste steht über dem Monat', ph.r.right.bottom <= ph.r.cal.top, ph.r);
const others = ['down', 'wday', 'right', 'duty', 'wtoday'].filter((k) => ph.r[k]);
await check('Handy: der Monat ist der letzte Abschnitt', others.every((k) => ph.r[k].top < ph.r.cal.top), ph.r);
await check('Handy: oben die Karte „Heute“, dann Tonnen, Rausstellen, Monat',
  !!(ph.r.wtoday && /^\s*Heute/.test(ph.r.todayText) && ph.r.wtoday.bottom <= ph.r.right.top && ph.r.duty && ph.r.right.bottom <= ph.r.duty.top && ph.r.duty.bottom <= ph.r.cal.top), ph.r);
await check('Handy: keine Tageskarte über den Tonnen (wday ausgeblendet)', !ph.r.wday, ph.r);

// Tap a day of the shown month that is not today (prefer one with a pickup): its card shows right under the month,
// nothing jumps up; tapping it again closes it.
const pickDay = () => ph.page.evaluate(() => {
  const S = window.casoraPopup && window.casoraPopup.surface;
  const ds = window.__pierce('.hcal-d', S).filter((n) => /^wday:/.test(n.dataset.hcal || '') && !n.classList.contains('t')
    && !n.classList.contains('o') && n.getBoundingClientRect().width > 0);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const fut = ds.filter((n) => new Date(n.dataset.hcal.slice(5) + 'T00:00:00') > now);
  const d = fut.find((n) => n.querySelector('.hcal-dots i')) || fut[0] || ds[0];
  if (!d) return null;
  d.scrollIntoView({ block: 'center' });
  const r = d.getBoundingClientRect();
  return { key: d.dataset.hcal, x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const sections = async () => (await ph.page.evaluate(() => {
  const S = window.casoraPopup && window.casoraPopup.surface;
  const card = window.__pierce('button-card', S).find((b) => b.shadowRoot && b.shadowRoot.querySelector('#cal') && b.shadowRoot.querySelector('#right'));
  const q = (id) => { const n = card && card.shadowRoot.querySelector('#' + id); const r = n && n.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null; };
  const sel = window.__pierce('.hcal-d.s', S).filter((n) => !n.classList.contains('sa')).map((n) => n.dataset.hcal);
  return { cal: q('cal'), wpick: q('wpick'), vh: innerHeight, sel };
}));
const day = await pickDay();
await need('Handy: ein Tag im Monat zum Antippen', day, day);
await ph.page.waitForTimeout(400);
const before = await sections();
await ph.page.touchscreen.tap(day.x, day.y);
let after = null;
for (let i = 0; i < 20; i++) { await ph.page.waitForTimeout(150); after = await sections(); if (after.wpick && after.wpick.h > 40) break; }
await ph.page.waitForTimeout(700);   // smooth scroll settles
after = await sections();
await check('Handy: Tipp auf einen Tag zeigt seine Karte direkt unter dem Monat', !!(after.wpick && after.wpick.h > 40 && after.wpick.top >= after.cal.bottom - 1 && after.wpick.top - after.cal.bottom <= 40), { day, before, after });
await check('Handy: die Karte ist sichtbar', !!(after.wpick && after.wpick.bottom <= after.vh + 1), { after });
await check('Handy: das Popup springt nicht nach oben', after.cal.top <= before.cal.top + 2, { before, after });
await check('Handy: der getippte Tag ist markiert', after.sel.includes(day.key), after.sel);
if (DIR) await ph.page.screenshot({ path: path.join(DIR, (LOCAL ? 'nachher' : 'vorher') + '-handy-tipp.png') });
const again = await pickDay();
await ph.page.touchscreen.tap(again.x, again.y);
let closed = null;
for (let i = 0; i < 20; i++) { await ph.page.waitForTimeout(150); closed = await sections(); if (!closed.wpick || closed.wpick.h < 5) break; }
await check('Handy: erneuter Tipp auf denselben Tag schließt die Karte', !!(again.key === day.key && (!closed.wpick || closed.wpick.h < 5)), { again, closed });

// Desktop: unchanged two columns, month left, list right, same top.
const dk = await measure('Desktop', { width: 1440, height: 900 });
await need('Desktop: Monat und Tonnen-Liste im Popup gezeichnet', dk.r, dk.r);
await check('Desktop: Monat links, Tonnen-Liste rechts', dk.r.cal.left < dk.r.right.left && dk.r.cal.bottom > dk.r.right.top, dk.r);
const firstRight = ['down', 'wday', 'right', 'duty'].filter((k) => dk.r[k]).map((k) => dk.r[k].top);
await check('Desktop: beide Spalten beginnen auf derselben Höhe', Math.abs(Math.min(...firstRight) - dk.r.cal.top) <= 2, dk.r);
await check('Desktop: Tageskarte rechts oben, keine Handy-Karten', !!(dk.r.wday && dk.r.wday.left > dk.r.cal.left && !dk.r.wtoday && !dk.r.wpick), dk.r);
await finish();
