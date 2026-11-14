// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel-b-plus.js#_bIntro custom_components/casora/panel/casora-panel-umzug.js#offer
// First visit of the Studio on a new device (newcomer round, 14.11.2026): the "New in Casora" sheet, the Studio intro
// and the automatic offer to move a Hemma dashboard all opened at once, on top of each other. The intro looked for
// the sheet under a name it never had, and the offer did not wait for either. Only one of them may show at a time.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
const { page, context } = await open({ width: 1440, height: 900, dark: false, umzug: true });
usePage(page);
// A new device: intro not seen, an older version seen (so "New in Casora" shows), the offer not snoozed.
await context.addInitScript(() => {
  if (window !== window.top) return;
  try {
    localStorage.removeItem('casora.studio.intro'); localStorage.setItem('casora.seenVersion', '26.1.1');
    localStorage.removeItem('casora.umzug.snooze');
  } catch (e) { /* private mode */ }
});
await studio(page, d.url);
const layers = () => page.evaluate(() => {
  const p = window.__panel(), r = p && p.shadowRoot;
  const vis = (e) => !!(e && e.getClientRects().length);
  const sheet = r && [...r.querySelectorAll('.flowsheet, .flowpane')].some(vis);
  return { news: !!document.querySelector('[data-casora-welcome]'), intro: vis(r && r.querySelector('.bintro')),
    offer: !!(p && p._flowMode) && !!sheet };
});
const seen = { news: false, intro: false, offer: false };
const both = [];
const watch = async (ms) => {
  for (const end = Date.now() + ms; Date.now() < end;) {
    const l = await layers();
    for (const k of Object.keys(seen)) seen[k] = seen[k] || l[k];
    if ([l.news, l.intro, l.offer].filter(Boolean).length > 1) both.push(l);
    await page.waitForTimeout(250);
  }
};
await watch(6000);
await check('"New in Casora" shows on the new device', seen.news, seen);
// Close the sheet like a user; then the intro or the offer follows, one after the other.
await page.evaluate(() => { const h = document.querySelector('[data-casora-welcome]'); const b = h && h.shadowRoot.querySelector('.cw-go'); if (b) b.click(); });
await watch(8000);
await check('after it, the intro or the offer shows', seen.intro || seen.offer, seen);
// Put away whichever is open (intro: Skip, offer: Later) and watch what comes next.
for (let i = 0; i < 2; i++) {
  await page.evaluate(() => { const r = window.__panel().shadowRoot;
    const all = [...r.querySelectorAll('.bintro button, .flowsheet button, .flowpane button')].filter((x) => x.getClientRects().length);
    const b = all.find((x) => /^(Überspringen|Skip|Später|Not Now|Later)$/.test(x.textContent.trim())); if (b) b.click(); });
  await watch(5000);
}
await check('never two of them on top of each other', both.length === 0, both.slice(0, 3));
await finish();
