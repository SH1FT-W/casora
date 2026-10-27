// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/34-security-covers.js
// Issue #76 follow-up (27.10.2026): the security badge on Home counted an open security blind („▢ 1 ▤ 1“), but its tap
// opened „Türen & Fenster“ with only doors and windows – the blind was missing. Expected: the house's popup lists the
// counted blinds as a section „Jalousien“ with „Schließen“ (and „Alle schließen“ for several), only while they count
// („Nur abends und nachts“ off here so the test does not depend on the time); a room's doors popup stays without.
// Desktop 1440 and phone 393. Settings and states only in the browser.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);

const run = async (tag, url, o) => {
  const { page, browser } = await open(o);
  usePage(page);
  await dashboard(page, url, 2);
  const covers = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states)
    .filter((k) => k.startsWith('cover.') && !/garage|tor|gate/i.test(k)).slice(0, 2));
  await need(tag + ': two covers in the test house', covers.length === 2, covers);
  const now = new Date().toISOString();
  await fakeStates(page, { [covers[0]]: { state: 'open', attributes: { current_position: 100, supported_features: 15 }, last_changed: now },
    [covers[1]]: { state: 'closed', attributes: { current_position: 0, supported_features: 15 }, last_changed: now } }, { sticky: true });
  const pop = async (covOn) => {
    await page.evaluate(([ids, on]) => {
      const S = window.CASORA_SETTINGS || {};
      window.CASORA_SETTINGS = { ...S, security: { ...(S.security || {}), covers: on ? ids : [], covers_night: false } };
      window.casoraPopup && window.casoraPopup.close();
    }, [covers, covOn]);
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('ll-custom',
      { bubbles: true, composed: true, detail: { casora_contacts_open: true } })));
    await page.waitForTimeout(3000);
    return page.evaluate(() => {
      const s = window.casoraPopup && window.casoraPopup.surface;
      if (!s) return null;
      const txt = (n) => n.textContent.replace(/\s+/g, ' ').trim();
      return { labels: window.__pierce('*', s).filter((n) => !n.children.length && n.getBoundingClientRect().height > 0).map(txt).filter(Boolean),
        rows: window.__pierce('.hui-row', s).filter((n) => n.getBoundingClientRect().height > 0).map(txt) };
    });
  };
  const on = await pop(true);
  await need(tag + ': „Türen & Fenster“ opens', on);
  await check(tag + ': section „Jalousien“ with the open blind and „Schließen“', on.labels.includes('Jalousien') && on.rows.some((r) => /Schließen$/.test(r)), on);
  await check(tag + ': only the open blind is listed (one row with „Schließen“)', on.rows.filter((r) => /Schließen$/.test(r)).length === 1, on.rows);
  const off = await pop(false);
  await check(tag + ': without selected blinds no section „Jalousien“', off && !off.labels.includes('Jalousien'), off && off.labels);
  await browser.close();
};

await run('Desktop', dash.url + '/home', { width: 1440, height: 900, theme: 'Casora', dark: false });
await run('Phone', dash.phone.url + '/home', { width: 393, height: 852, mobile: true, safari: true, scale: 2, theme: 'Casora', dark: false });
await finish();
