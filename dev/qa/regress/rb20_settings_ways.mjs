// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-b.js
// Settings in eight tiles (03.11.2026, replaces the topics of variant B 26.10.62b5): the ways in and back.
//   1. "Einstellungen" stays marked in the toolbar on a tile page; a tile page has "‹ Einstellungen" back to the start.
//   2. This dashboard's sections are drawn in their tile (bell: "Nur dieses Dashboard"), no jump to the inspector.
//   3. Updates from the tile "Updates & Einrichtung" have "‹ Updates & Einrichtung".
//   4. Search: "Personen" finds the bell of this dashboard, "tueren" finds doors and windows and opens the tile at
//      that block, no match says so and keeps the tiles (nine with the screensaver); back from a hit returns to the search with its text.
//   5. A tile opened another way also leads back to the start.
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

  // 1. + 2. Tile "Glocke & Meldungen": marked toolbar, bell section in the tile, back to the start
  await H(() => window.__panel()._bOpenSettings());
  await page.waitForTimeout(1000);
  await page.locator('.cs-hubtile', { hasText: 'Glocke & Meldungen' }).first().click();
  await page.waitForTimeout(1800);
  if (!phone) {
    const on = await H(() => window.__panel().shadowRoot.querySelector('.btools [data-b=home]').classList.contains('on'));
    await check(tag + ': „Einstellungen“ bleibt in der Kachel markiert', on);
  }
  const bell = await H(() => { const b = window.__panel().shadowRoot.querySelector('#pane [data-pkey="nb-bell"]');
    return b ? { head: b.querySelector('.cn-bhead b').textContent.replace(/\s+/g, ' ').trim(), rows: b.querySelectorAll('.row[data-key]').length } : null; });
  let s = await state();
  await check(tag + ': Glocke dieses Dashboards in der Kachel (kein Sprung in den Inspektor)', s.cs && s.page === 'n-bell' && bell
    && /Nur dieses Dashboard/.test(bell.head) && bell.rows > 3, { s, bell });
  await check(tag + ': Kachel hat „‹ Einstellungen“', (await back()) === '‹ Einstellungen', await back());
  await clickBack();
  await page.waitForTimeout(1000);
  s = await state();
  await check(tag + ': zurück auf der Startseite', s.cs && s.page === 'n-start', s);

  // 3. Updates from the tile "Updates & Einrichtung"
  if (!phone) {
    await H(() => window.__panel()._csShow('n-system'));
    await page.waitForTimeout(1200);
    await page.locator('#pane [data-pkey="nb-updates"] .frow').first().click();
    await page.waitForTimeout(1800);
    await check(tag + ': Updates haben „‹ Updates & Einrichtung“', (await back()) === '‹ Updates & Einrichtung', await back());
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
  await check(tag + ': kein Treffer: Hinweis und die neun Kacheln bleiben', /Kein Treffer/.test(hint) && tiles === 9, { hint, tiles, none });
  await search('Türen');
  await page.locator('.frow').filter({ has: page.locator('b', { hasText: /^Türen und Fenster$/ }) }).first().click();
  await page.waitForTimeout(2200);
  s = await state();
  const focusTop = await H(() => { const g = window.__panel().shadowRoot.querySelector('#pane [data-pkey="nb-contacts"]'); if (!g) return null; const r = g.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  await check(tag + ': Treffer öffnet Haus & Geräte bei „Türen und Fenster“', s.page === 'n-house' && focusTop === true, { s, focusTop });
  await check(tag + ': „‹ Einstellungen“ nach einem Suchtreffer', (await back()) === '‹ Einstellungen', await back());
  await clickBack();
  await page.waitForTimeout(1200);
  const q = await H(() => window.__panel().shadowRoot.querySelector('.cs-hubsearch input').value);
  await check(tag + ': Suchtext bleibt nach dem Zurück', q === 'Türen', q);

  // 5. Opened another way: back still leads to the start
  await H(() => { const p = window.__panel(); p._bClose(); });
  await page.waitForTimeout(500);
  await H(() => { const p = window.__panel(); p._bOpen = true; p._csShow('ai'); });
  await page.waitForTimeout(1500);
  s = await state();
  await check(tag + ': „ai“ öffnet die Kachel KI mit „‹ Einstellungen“', s.page === 'n-ai' && (await back()) === '‹ Einstellungen', { s, back: await back() });
  await browser.close();
}
await finish();
