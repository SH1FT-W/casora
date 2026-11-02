// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/casora-i18n.js
// Gate 26.11.7 (r68 red, alone green): with an English interface the dashboard's room bar kept the German room names
// („Badezimmer“, „Küche“) while the Studio preview and every tile showed them translated. Since 71ec4422 the English
// phrases are fetched on first use; the room bar (casora-nav-bar) translates its labels once when it is built and
// never again, so on a fresh page load it was built before the phrases arrived.
// Expected: once the phrases are there the bar shows the translated names (as casoraTr gives them); names marked
// literal stay. The phrase file is held back 3 s in the browser so the bar is surely built first. Nothing saved.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const desk = (await casoraDashboards()).find((d) => !d.mobile);
await need('a Casora dashboard', desk);
const { page } = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora', lang: 'en', locale: 'en-US' });
usePage(page);
let held = 0;
await page.route(/\/casora_scripts\/i18n\/en\.json/, async (r) => { held++; await new Promise((x) => setTimeout(x, 3000)); await r.continue(); });
await dashboard(page, desk.url + '/' + (desk.config.views[0].path || '0'));

const read = () => page.evaluate(() => {
  const labels = window.__pierce('.route .label').filter((l) => !l.hasAttribute('data-no-i18n'));
  const tr = window.casoraTr || ((x) => x);
  return labels.map((l) => { const t = l.textContent.trim(); return { shown: t, want: tr(t) }; });
});
let r = [];
for (let i = 0; i < 40; i++) {
  r = await read();
  if (r.length && r.every((x) => x.shown === x.want) && r.some((x) => /Bathroom|Kitchen|Office/.test(x.shown))) break;
  await page.waitForTimeout(250);
}
await need('the English phrases were fetched (held back)', held > 0, held);
await need('room bar with room names', r.length > 2, r);
await check('room bar: no German room name left after the phrases arrived', r.every((x) => x.shown === x.want), r.filter((x) => x.shown !== x.want));
await check('room bar: shows translated room names („Bathroom“, „Kitchen“ …)', r.some((x) => /Bathroom|Kitchen|Office/.test(x.shown)), r.map((x) => x.shown));
await finish();
