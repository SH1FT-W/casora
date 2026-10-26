// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-b.js
// Settings by topic (variant B, 26.10.62b5), findings of the user and code review:
//   1. A section of this dashboard opened from a topic has a way back to that topic (desktop: link "‹ Meldungen";
//      phone: the round ‹ of the sheet leads there instead of to the room).
//   2. A page opened from a section's link ("Einstellungen für alle Dashboards ›") leads back to that section.
//   3. Updates from the topics have "‹ Einstellungen".
//   4. Search: "Personen" finds the bell of this dashboard, "tueren" finds doors and windows and opens the page at
//      that group, no match says so and keeps the topics; back from a hit returns to the search with its text.
//   5. A page opened another way (not from the topics) has no stale "‹" (code review 1).
//   6. "Einstellungen" stays marked in the toolbar on topic pages.
// Desktop 1440 and phone 393 (WebKit). Nothing is saved.
import { open, studio, studioDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard für das Studio', dash, dash);

for (const [tag, opts] of [['Desktop', { width: 1440, height: 900, dark: true }], ['Handy', { width: 393, height: 852, mobile: true, safari: true, dark: true }]]) {
  const phone = tag === 'Handy';
  const { page, browser } = await open(opts);
  usePage(page);
  await studio(page, dash);
  const H = (fn, a) => page.evaluate(fn, a);
  const back = () => H(() => { const r = window.__panel().shadowRoot; const b = [...r.querySelectorAll('.cs-hubback')].find((x) => x.getClientRects().length); return b ? b.textContent.trim() : null; });
  const clickBack = () => H(() => { const r = window.__panel().shadowRoot; [...r.querySelectorAll('.cs-hubback')].find((x) => x.getClientRects().length).click(); });
  const state = () => H(() => { const p = window.__panel(); return { cs: !!p._csOpen, page: p._csPage, sel: p._sel && p._sel.key, cu: !!p._cuOpen }; });
  const go = (g) => H((g) => window.__panel()._csHubGo(g), g);

  // 1. Section from a topic → back to the topic
  await H(() => window.__panel()._bOpenSettings());
  await page.waitForTimeout(1000);
  await H(() => window.__panel()._csShow('t-msg'));
  await page.waitForTimeout(800);
  if (!phone) {
    const on = await H(() => window.__panel().shadowRoot.querySelector('.btools [data-b=home]').classList.contains('on'));
    await check(tag + ': „Einstellungen“ bleibt im Thema markiert', on);
  }
  await go({ sec: 'Notifications', back: 't-msg' });
  await page.waitForTimeout(1200);
  if (phone) {
    const lab = await H(() => { const b = [...window.__panel().shadowRoot.querySelectorAll('.detailbar .back')].find((x) => x.getClientRects().length); return b ? b.getAttribute('aria-label') : null; });
    await check(tag + ': runder Zurück-Knopf führt zum Thema', lab === '‹ Meldungen'.slice(2) || lab === 'Meldungen', lab);
    await H(() => [...window.__panel().shadowRoot.querySelectorAll('.detailbar .back')].find((x) => x.getClientRects().length).click());
  } else {
    await check(tag + ': Abschnitt hat „‹ Meldungen“', (await back()) === '‹ Meldungen', await back());
    await clickBack();
  }
  await page.waitForTimeout(1000);
  let s = await state();
  await check(tag + ': zurück im Thema Meldungen', s.cs && s.page === 't-msg', s);

  // 2. Link in the section → page → back to the section
  await go({ sec: 'Notifications', back: 't-msg' });
  await page.waitForTimeout(1000);
  await H(() => window.__panel()._csShow('alerts'));
  await page.waitForTimeout(1500);
  await check(tag + ': Seite aus dem Abschnitt hat „‹ Glocke auf diesem Dashboard“', (await back()) === '‹ Glocke auf diesem Dashboard', await back());
  await clickBack();
  await page.waitForTimeout(1200);
  s = await state();
  await check(tag + ': zurück im Abschnitt', !s.cs && s.sel === 'Notifications', s);

  // 3. Updates from the start
  if (!phone) {
    await H(() => window.__panel()._csShow('start'));
    await page.waitForTimeout(800);
    await go({ updates: true, back: 'start' });
    await page.waitForTimeout(1500);
    await check(tag + ': Updates haben „‹ Einstellungen“', (await back()) === '‹ Einstellungen', await back());
  }

  // 4. Search
  await H(() => { const p = window.__panel(); p._bClose(); });
  await page.waitForTimeout(500);
  await H(() => window.__panel()._bOpenSettings());
  await page.waitForTimeout(1000);
  const search = async (q) => { await page.locator('.cs-hubsearch input').fill(q); await page.waitForTimeout(400);
    return H(() => [...window.__panel().shadowRoot.querySelectorAll('#pane .frow b')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim())); };
  const r1 = await search('Personen');
  await check(tag + ': „Personen“ findet die Glocke dieses Dashboards zuerst', r1[0] === 'Glocke auf diesem Dashboard', r1);
  const r2 = await search('tueren');
  await check(tag + ': „tueren“ findet „Türen und Fenster“', r2.includes('Türen und Fenster'), r2);
  const none = await search('xyzabc');
  const hint = await H(() => [...window.__panel().shadowRoot.querySelectorAll('#pane .cs-lede')].map((x) => x.textContent).join(' | '));
  const tiles = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.cs-hubtile')].filter((x) => x.getClientRects().length).length);
  await check(tag + ': kein Treffer: Hinweis und Themen bleiben', /Kein Treffer – schau in eines der Themen/.test(hint) && tiles === 6, { hint, tiles, none });
  await search('Türen');
  await page.locator('.frow').filter({ has: page.locator('b', { hasText: /^Türen und Fenster$/ }) }).first().click();
  await page.waitForTimeout(2200);
  s = await state();
  const focusTop = await H(() => { const g = window.__panel().shadowRoot.querySelector('#pane [data-pkey="contacts"]'); if (!g) return null; const r = g.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  await check(tag + ': Treffer öffnet Haus & Geräte bei „Türen und Fenster“', s.page === 'home' && focusTop === true, { s, focusTop });
  await check(tag + ': „‹ Einstellungen“ nach einem Suchtreffer', (await back()) === '‹ Einstellungen', await back());
  await clickBack();
  await page.waitForTimeout(1200);
  const q = await H(() => window.__panel().shadowRoot.querySelector('.cs-hubsearch input').value);
  await check(tag + ': Suchtext bleibt nach dem Zurück', q === 'Türen', q);

  // 5. Opened another way: no stale back
  await H(() => { const p = window.__panel(); p._bClose(); });
  await page.waitForTimeout(500);
  await H(() => { const p = window.__panel(); p._bOpen = true; p._csShow('ai'); });
  await page.waitForTimeout(1500);
  await check(tag + ': Seite von anderswo: kein alter Rückweg', (await back()) === null, await back());
  await browser.close();
}
await finish();
