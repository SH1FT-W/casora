// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Issue 127 (05.11.2026): the media popup's volume line showed „Lautstärke 14.000000000000002 %“ for a HomePod at
// volume_level 0.14 (0.14 * 100 in binary floating point) until the next redraw. Expected: a whole percent, on
// opening and after a live volume change, phone 393 and desktop 1440.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
for (const [w, h, dev, safari] of [[393, 852, 'Handy', false], [1440, 900, 'Desktop', false], [1966, 1440, 'Mac-App (WebKit)', true]]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora', dark: true, safari });
  usePage(page);
  await dashboard(page, desk.url);
  const mp = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).find((k) => k.startsWith('media_player.')));
  await need('Mediaplayer im Testhaus', mp, mp);
  const set = (vol) => fakeStates(page, { [mp]: { state: 'playing', attributes: { media_title: 'Nachrichten', media_artist: 'Sender',
    volume_level: vol, supported_features: 152511, entity_picture: null } } }, { sticky: true });
  await set(0.14);
  const line = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface;
    const v = s && window.__pierce('.hui-dl-vol', s).find((e) => e.getBoundingClientRect().width); return v ? v.textContent.replace(/\s+/g, ' ').trim() : null; });
  const opened = await page.evaluate(async (mp) => {
    const ha = document.querySelector('home-assistant');
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: 'casora_media', entity: mp });
    el.hass = ha.hass; el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 700));
    el.addEventListener('hass-action', (ev) => { ev.stopPropagation(); window.casoraPopup.open(ev.detail.config.tap_action.casora_popup); }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    await new Promise((r) => setTimeout(r, 2500));
    return !!(window.casoraPopup && window.casoraPopup.surface);
  }, mp);
  await need(dev + ': Medien-Popup offen', opened);
  const l1 = await line();
  await check(dev + ': beim Öffnen ganze Prozent („14 %“)', l1 && /\b14\s?%/.test(l1) && !/14[.,]0/.test(l1), l1);
  await set(0.29);   // 0.29 * 100 = 28.999999999999996
  await page.waitForTimeout(1500);
  const l2 = await line();
  await check(dev + ': nach Änderung ganze Prozent („29 %“)', l2 && /\b29\s?%/.test(l2) && !/28[.,]9/.test(l2), l2);
  await page.context().close();
}
await finish();
