// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/52-klingel-moment.js custom_components/casora/scripts/casora-core.js#userGuard dev/casora_mock/klingel.py
// Doorbell moment, review findings of 26.11.2026, each with a real ring of the made-up Reolink test doorbell
// (casora_mock.klingel_druecken):
//   1. Nobody noticed the first ring, the moment closed by itself, the visitor rings again right away: it opens again
//      (the debounce counted from the auto close and swallowed exactly this ring).
//   2. Pressed again a few seconds after it was closed by hand: nothing opens (the debounce still works).
//   3. A wall tablet whose clock runs 10 minutes off: the ring still opens it (the change was compared with the
//      device's clock and dropped).
//   4. Doorbell camera hidden for the signed-in user („Wer sieht das?“): nothing at all, the screensaver stays and no
//      „hidden for you“ hint (the guard's hint came on every ring and the screensaver was gone for good).
// Ring's live_view before last_recording is covered by dev/unit/klingel_moment.mjs (no Ring in the test HA).
import { open, casoraDashboard, dashboard, check, need, finish, stable, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const CAM = 'camera.testklingel_sub', BELL = 'binary_sensor.testklingel_visitor';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const tok = await tokens();
const ring = (dauer = 2) => fetch(BASE + '/api/services/casora_mock/klingel_druecken',
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ dauer, person: 3 }) });

const { page } = await open({ width: 1180, height: 820, theme: 'Casora', dark: false });
await dashboard(page, dash.url + '?casora_saver=1', 3);
await need('Testklingel im Testhaus (Mock)', await page.evaluate(([c, b]) => {
  const S = document.querySelector('home-assistant').hass.states;
  return !!(S[c] && S[b]);
}, [CAM, BELL]));
const watching = await stable(page, () => (window._casoraKlingelMoment && window._casoraKlingelMoment.watching()) || [],
  null, { max: 20000, quiet: 500, until: (v) => v.length > 0 });
await need('Klingel wird beobachtet', watching.includes(BELL), watching);
// Shortened windows (product: 90 s ring window, 10 s debounce); the ring window stays longer than the debounce.
await page.evaluate(() => { window._casoraKlingelMoment._ringMs = 9000; window._casoraKlingelMoment._quietMs = 7000; });
await page.evaluate(() => {
  window.__qaNotes = [];
  document.querySelector('home-assistant').addEventListener('hass-notification', (e) => window.__qaNotes.push(String((e.detail && e.detail.message) || '')));
});

const look = () => {
  const P = window.casoraPopup, el = P && P.element, open = !!(el && el.hasAttribute('open'));
  return { open, live: open ? window.__pierce('casora-klingel-live', el.shadowRoot).length > 0 : false,
    saver: !!(window._casoraSaver && window._casoraSaver.shown()), notes: (window.__qaNotes || []).slice() };
};
const waitFor = (pred, max) => stable(page, look, null, { max, quiet: max, until: pred });
const state = () => page.evaluate(look);
const closePop = async () => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(700); };

// 1. Ring, nobody touches it, it closes itself, the screensaver is back; ring again right away: it opens again.
await page.evaluate(() => window._casoraSaver.start());
let s = await waitFor((v) => v.saver, 6000);
await need('Bildschirmschoner läuft', s && s.saver, s);
await ring();
s = await waitFor((v) => v.open && v.live && !v.saver, 12000);
await need('Klingeln öffnet das Klingel-Popup', s && s.open && s.live, s);
s = await waitFor((v) => !v.open && v.saver, 16000);
await need('ohne Berührung zu, Bildschirmschoner wieder da', s && !s.open && s.saver, s);
await ring();
s = await waitFor((v) => v.open && v.live && !v.saver, 12000);
await check('1. Gleich nach dem Selbst-Schließen erneut geklingelt: öffnet wieder (nicht entprellt)', s && s.open && s.live && !s.saver, s);
await closePop();
await page.waitForTimeout(8000);   // past the debounce

// 2. Opened, closed by hand at once, pressed again a few seconds after the last ring: nothing opens.
await ring(1);
s = await waitFor((v) => v.open && v.live, 12000);
await need('Klingeln öffnet', s && s.open, s);
await closePop();
await page.waitForTimeout(800);
await ring(1);
await page.waitForTimeout(4000);
s = await state();
await check('2. Kurz danach erneut gedrückt (von Hand zu): nichts öffnet sich (entprellt)', !s.open, s);
await page.waitForTimeout(8000);

// 3. The device's clock runs 10 minutes ahead.
await page.evaluate(() => { const real = Date.now.bind(Date); window.__qaRealNow = real; Date.now = () => real() + 10 * 60000; });
await ring();
s = await waitFor((v) => v.open && v.live, 12000);
await check('3. Geräteuhr 10 Minuten falsch: Klingeln öffnet trotzdem', s && s.open && s.live, s);
await closePop();
await page.evaluate(() => { if (window.__qaRealNow) Date.now = window.__qaRealNow; });
await page.waitForTimeout(8000);

// 4. The doorbell camera hidden for this user: every card naming it gets HA's user condition for someone else (the
//    dashboard config is only swapped in the page, the test HA keeps its own).
const hidden = await page.evaluate(async ([cam, bell]) => {
  const ha = document.querySelector('home-assistant'), h = ha.hass;
  const seg = location.pathname.split('/').filter(Boolean)[0] || 'lovelace';
  const real = window._casoraCfgOnce;
  const cfg = JSON.parse(JSON.stringify(await real(h, seg)));
  let named = 0;
  (function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const s = JSON.stringify(v.variables || {}) + JSON.stringify(v.entity || '') + JSON.stringify(v.entities || []);
    if (v.type && (s.includes(cam) || s.includes(bell))) { v.visibility = [{ condition: 'user', users: ['qa-somebody-else'] }]; named++; return; }
    Object.keys(v).forEach((k) => walk(v[k]));
  })(cfg.views);
  // The room card finds the camera by itself and names it nowhere: then a tile of its own, hidden for this user.
  if (!named && cfg.views && cfg.views[0]) {
    const v0 = cfg.views[0];
    (v0.cards = v0.cards || []).push({ type: 'custom:button-card', template: 'casora_reolink_doorbell', entity: cam,
      visibility: [{ condition: 'user', users: ['qa-somebody-else'] }] });
    named++;
  }
  window.__qaRealCfgOnce = real;
  const fake = function (hh, url) { return url === seg ? Promise.resolve(cfg) : real(hh, url); };
  fake.forget = real.forget;
  window._casoraCfgOnce = fake;
  window.__qaNotes = [];
  return named;
}, [CAM, BELL]);
await need('Klingel-Kamera im Dashboard für den Benutzer ausgeblendet', hidden > 0 && await page.evaluate(([cam]) => new Promise((res) => {
  let blocked = false;
  window.casoraUserGuard(cam, () => res(false), () => { blocked = true; res(true); });
  setTimeout(() => res(blocked), 3000);
}), [CAM]), hidden);
await page.evaluate(() => { window.__qaNotes = []; });
await page.evaluate(() => window._casoraSaver.start());
s = await waitFor((v) => v.saver, 6000);
await need('Bildschirmschoner läuft', s && s.saver, s);
await ring();
await page.waitForTimeout(5000);
s = await state();
await check('4. Für den Benutzer ausgeblendet: kein Popup, Bildschirmschoner bleibt, kein Hinweis',
  !s.open && s.saver && s.notes.length === 0, s);
await page.evaluate(() => { if (window.__qaRealCfgOnce) window._casoraCfgOnce = window.__qaRealCfgOnce; window._casoraSaver.wake(); });
await finish();
