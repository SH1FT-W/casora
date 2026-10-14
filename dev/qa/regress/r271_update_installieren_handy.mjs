// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/17-update-detail.js
// Update-Detailseite am Handy (14.10.2026): „Installieren“ reagierte auf einen Fingertipp nicht, „Überspringen“
// schon. Die Teilkarte (button-card) schluckt das Klick-Echo nach dem Fingertipp; der Knopf hörte nur auf click.
// Prüft per echtem Fingertipp (und Mausklick), dass genau EIN update.install ankommt. Der Dienstaufruf wird im
// Browser abgefangen, es wird nichts installiert.
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const ID = 'update.qa_r271_firmware';
const run = async (mobile) => {
  const { page } = await open(mobile ? { width: 393, height: 852, mobile: true, dark: true, theme: 'Casora' }
    : { width: 1440, height: 1000, theme: 'Casora', dark: false });
  await dashboard(page, dash.url, 3);
  await fakeStates(page, { [ID]: { state: 'on', attributes: { installed_version: '2.0.1', latest_version: '2.1.0', title: null,
    device_class: 'firmware', friendly_name: 'QA Firmware', in_progress: false, supported_features: 5 } } }, { sticky: true });
  await page.evaluate(() => {
    const hass = document.querySelector('home-assistant').hass;
    window.__qaCalls = [];
    hass.callService = function (d, s, data, target) { window.__qaCalls.push({ d, s, data, target }); return Promise.resolve(); };
  });
  const opened = await page.evaluate((id) => !!(window._casoraUpdDetail && window._casoraUpdDetail.open(id)), ID);
  await need('Detailseite geöffnet', opened);
  const at = await stable(page, () => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const b = p && window.__pierce('[data-casora-upd-install]', p.shadowRoot)[0];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return r.width ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  }, null, { max: 8000, quiet: 1000 });
  await need('Installieren-Knopf sichtbar', at, at);
  if (!at) return;
  await page.waitForTimeout(700);   // Öffnen-Sperre der Popup-Knöpfe
  if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(900);
  const calls = await page.evaluate(() => window.__qaCalls.filter((c) => c.d === 'update'));
  const tag = mobile ? 'Handy (Fingertipp)' : 'Desktop (Mausklick)';
  await check(tag + ': genau ein update.install', calls.length === 1 && calls[0].s === 'install' && calls[0].target.entity_id === ID, calls);
};
await run(true);
await run(false);
await finish();
