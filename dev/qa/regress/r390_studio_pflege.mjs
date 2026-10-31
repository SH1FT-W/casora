// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-b.js custom_components/casora/panel/casora-panel-personal.js custom_components/casora/panel/casora-panel-settings.js
// Found walking through the Studio (31.10.2026), nothing is saved:
//   sp-01 Phone, "Content": the room section "Now Playing" showed "Off" without its switch (only the desktop list
//         showed the section switches) – there was no way to turn it on from the list.
//   sp-02 Settings › Calendar: "Kalender" stood three times on top of each other (page title, group header, row label).
//   sp-03 Settings › Home & Devices: "Security: covers" showed the fallback icon (question mark).
//   sp-04 Settings start and topic pages: an empty band of ~40 px between the title and "‹ Settings" (the head kept the
//         height of pages with an "Applies to" line).
//   sp-05 Cover tile › Advanced: the icon fields showed their default as a file name ("curtain-open") instead of
//         its name ("Vorhang offen").
//   sp-06 Tile › Popup: the explanation under "Entities in popup" was cut off with "…".
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);

// sp-01: phone (WebKit).
{
  const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true });
  usePage(page);
  await studio(page, dash);
  const sw = await page.evaluate(async () => {
    const p = window.__panel();
    const card = () => p.shadowRoot.querySelector('#band-rooms section.card[data-k="Now Playing"]');
    for (let i = 0; i < 3 && !(card() && card().getBoundingClientRect().width); i++) { p._bShowList(); await new Promise((r) => setTimeout(r, 1500)); }
    const c = card();
    if (!c) return null;
    const s = c.querySelector(':scope > .chead .sw');
    const r = s ? s.getBoundingClientRect() : null;
    return { has: !!s, w: r ? Math.round(r.width) : 0, h: r ? Math.round(r.height) : 0, right: r ? Math.round(r.right) : 0 };
  });
  await need('Abschnitt „Aktuelle Wiedergabe“ in der Inhaltsliste am Handy', sw && sw.has, sw);
  await check('sp-01 Handy: Schalter von „Aktuelle Wiedergabe“ sichtbar und antippbar', sw.w >= 40 && sw.h >= 20 && sw.right <= 393, sw);
}

// sp-02, sp-03: desktop.
{
  const { page } = await open({ width: 1440, height: 900, dark: false });
  usePage(page);
  await studio(page, dash);
  await page.evaluate(() => window.__panel()._csShow('calendar'));
  await page.waitForTimeout(2500);
  const cal = await page.evaluate(() => {
    const pane = window.__panel().shadowRoot.getElementById('pane');
    return [...pane.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.getClientRects().length
      && /^(Kalender|Calendars?)$/.test(e.textContent.trim())).length;
  });
  // In the pane (the page title sits above it): only the group header.
  await check('sp-02 Einstellungen › Kalender: „Kalender“ unter dem Titel nur einmal (Gruppe)', cal === 1, { cal });
  await page.evaluate(() => window.__panel()._csShow('t-house'));
  await page.waitForTimeout(1500);
  const ic = await page.evaluate(() => {
    const p = window.__panel();
    const fallback = window.__casoraPanelInternals.iconUrl('default');
    const row = [...p.shadowRoot.querySelectorAll('.cs-hublist .frow')].find((r) => /Jalousien|covers/.test(r.textContent));
    const mk = row && row.querySelector('[style*="--i"], .mk, .rico');
    const st = mk ? (mk.getAttribute('style') || '') + (mk.querySelector('[style]') ? mk.querySelector('[style]').getAttribute('style') : '') : '';
    return { row: !!row, fallback: !!st && st.includes(fallback.slice(0, 120)), st: st.slice(0, 80) };
  });
  await need('Zeile „Sicherheit: Jalousien“', ic.row, ic);
  await check('sp-03 „Sicherheit: Jalousien“ mit eigenem Symbol (nicht dem Ersatzsymbol)', !ic.fallback, ic);
  const gap = await page.evaluate(() => {
    const R = window.__panel().shadowRoot;
    const h = R.querySelector('.insphead .cs-head h3'), b = R.querySelector('#pane .cs-hubback');
    return h && b ? Math.round(b.getBoundingClientRect().top - h.getBoundingClientRect().bottom) : null;
  });
  await check('sp-04 Themenseite: „‹ Einstellungen“ höchstens 30 px unter dem Titel', gap != null && gap <= 30, { gap });
}
// sp-05: a cover tile's icon fields.
{
  const { page } = await open({ width: 1440, height: 900, dark: true });
  usePage(page);
  await studio(page, dash);
  const ph = await page.evaluate(async () => {
    const p = window.__panel();
    let at = null;
    p._state.compact.rooms.some((r, ri) => (r.tiles || []).some((t) => {
      if ([].concat(t.template || []).includes('casora_cover')) { at = { ri, key: p._tileKey(t) }; return true; }
      return false;
    }));
    if (!at) return null;
    if (p._room !== at.ri) { p._room = at.ri; p._renderTabs(); p._renderForm(); }
    p._bOpen = true;
    p._select({ group: 'tiles', key: at.key });
    await new Promise((r) => setTimeout(r, 1200));
    return [...p.shadowRoot.querySelectorAll('.inspector .combo.hasicon input')].map((i) => i.placeholder);
  });
  await need('Jalousie-Kachel im Dashboard', ph && ph.length, ph);
  const raw = ph.filter((x) => /^[a-z0-9_]+(-[a-z0-9_]+)+$/.test(x));
  await check('sp-05 Symbolfelder zeigen Namen statt Dateinamen', raw.length === 0, { ph });
  const cut = await page.evaluate(async () => {
    const p = window.__panel();
    for (let i = 0; i < 3; i++) {
      p.shadowRoot.querySelectorAll('.inspector .adv:not(.open) > .advsum').forEach((s) => s.click());
      await new Promise((r) => setTimeout(r, 400));
    }
    const subs = [...p.shadowRoot.querySelectorAll('.inspector .row label .lsub')].filter((e) => e.getClientRects().length);
    return { n: subs.length, cut: subs.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.slice(0, 50)) };
  });
  await need('Erklärungen in den Zeilen des Inspektors', cut.n > 0, cut);
  await check('sp-06 Erklärungen unter Zeilen im Inspektor nicht abgeschnitten', cut.cut.length === 0, cut);
}
await finish();
