// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js#standing
// Owner (beta 26.11.28b6, phone): in the bell the waste row („Abfall morgen · Restabfall“) could not be tapped, every
// other row opens its popup. Expected (phone 393x852 and desktop 1440x900): tapping the waste row opens the waste popup,
// the same one the waste tile opens (casora_trash: month calendar #cal with the bins list #right).
// The row is forced in the browser only: notify hours wide open (CASORA_NOTIFY_LOCAL) and the first bin due tomorrow
// when no bin of the test house is due today or tomorrow. Nothing is saved.
import { open, usePage, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Fassung', dash && dash.phone, dash && dash.url);
const view = (d) => d.url + '/' + (d.config.views[0].path || '0');

const force = (pg) => pg.evaluate(async () => {
  window.CASORA_NOTIFY_LOCAL = Object.assign({}, window.CASORA_NOTIFY_LOCAL || {}, { waste: true, waste_from_hour: 0, waste_until_hour: 24 });
  const D = window.casoraDevice;
  if (D && D.waste && !D.__qa873) {
    const orig = D.waste;
    D.__qa873 = true;
    D.waste = function () {
      const W = orig.apply(this, arguments);
      if (W && W.bins && W.bins.length && !W.bins.some((b) => b.days === 0 || b.days === 1)) W.bins = [Object.assign({}, W.bins[0], { days: 1 })].concat(W.bins.slice(1));
      return W;
    };
  }
  // Wait for the rows: an open bell does not redraw when a later collect adds one (it shows the new rows on the next
  // open), so a bell tapped before this refresh ended missed the forced row (red at random, phone or desktop).
  if (window._casoraNotify && window._casoraNotify.refresh) await window._casoraNotify.refresh();
  const W = D && D.waste ? D.waste(document.querySelector('home-assistant').hass) : null;
  return { bins: W && W.bins ? W.bins.length : 0 };
});
const BELL = () => { const r = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
  return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const WASTE_ROW = () => {
  const r = window.__pierce('*').find((x) => x._casoraRow && /^casora:waste:/.test(x._casoraRow.id) && x.getBoundingClientRect().height > 0);
  if (!r) return null;
  r.scrollIntoView({ block: 'center' });
  const q = r.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2, text: r.textContent.replace(/\s+/g, ' ').trim(), open: r.dataset.casoraOpen || '', mi: r.dataset.casoraMi || '' };
};
// The waste popup: the waste card's month (#cal) and bins list (#right) inside the open popup.
const WASTE_POPUP = () => {
  const S = window.casoraPopup && window.casoraPopup.surface;
  if (!S) return null;
  const card = window.__pierce('button-card', S).find((b) => b.shadowRoot && b.shadowRoot.querySelector('#cal') && b.shadowRoot.querySelector('#right'));
  return card ? { title: (S.title || S.getAttribute && S.getAttribute('title') || '') } : null;
};
const OPEN_POPUP = () => !!window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));

const VIEWS = [
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }, view(dash.phone), true],
  ['Desktop', { width: 1440, height: 900, scale: 1, dark: false }, view(dash), false],
];
for (const [tag, o, url, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url, 3);
  const f = await force(page);
  await need(tag + ': Abfall-Tonnen im Testhaus', f.bins > 0, f);
  const at = await page.evaluate(BELL);
  await need(tag + ': Glocke gefunden', at);
  mobile ? await page.touchscreen.tap(at.x, at.y) : await page.mouse.click(at.x, at.y);
  const row = await stable(page, WASTE_ROW, null, { max: 8000, quiet: 800, until: (r) => !!r });
  await need(tag + ': Abfall-Zeile in der Glocke', row, row);
  await check(tag + ': Abfall-Zeile hat ein Ziel (data-casora-open)', !!row.open, row);
  mobile ? await page.touchscreen.tap(row.x, row.y) : await page.mouse.click(row.x, row.y);
  const pop = await stable(page, WASTE_POPUP, null, { max: 12000, quiet: 1000, until: (p) => !!p });
  await check(tag + ': Tipp auf die Abfall-Zeile öffnet das Abfall-Popup', !!pop, { row, pop, anyPopup: await page.evaluate(OPEN_POPUP) });
  await page.context().browser().close().catch(() => {});
}
await finish();
