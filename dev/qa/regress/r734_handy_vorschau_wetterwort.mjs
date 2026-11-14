// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js#_phoneMap
// Newcomer round (14.11.2026): the Studio's phone preview wrote the weather's raw state under Home ("Partlycloudy",
// in every language) where the dashboard says "Teilweise bewölkt" / "Partly cloudy". It takes HA's word now.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
for (const locale of ['de-DE', 'en-US']) {
  const { page } = await open({ width: 393, height: 852, mobile: true, dark: false, locale, lang: locale.slice(0, 2) });
  usePage(page);
  await studio(page, d.url);
  const ok = await page.waitForFunction(() => window.__pierce('.mp-wcond').some((e) => e.textContent.trim()), null, { timeout: 30000 }).then(() => true, () => false);
  await need('phone preview with a weather word (' + locale + ')', ok);
  const r = await page.evaluate(() => {
    const p = window.__panel(), h = p._hass;
    const shown = window.__pierce('.mp-wcond').map((e) => e.textContent.trim()).find(Boolean);
    const words = Object.values(h.states).filter((s) => s.entity_id.startsWith('weather.'))
      .map((s) => h.localize('component.weather.entity_component._.state.' + s.state)).filter(Boolean);
    return { shown, words };
  });
  await check('the phone preview names the weather as HA does (' + locale + ')',
    r.words.some((x) => x.toLowerCase() === String(r.shown).toLowerCase()), r);
}
await finish();
