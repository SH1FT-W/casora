// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/52-klingel-moment.js custom_components/casora/scripts/local/46-screensaver.js#S.wake custom_components/casora/scripts/casora-core.js#configureFrom dev/casora_mock/klingel.py
// Doorbell moment (52-klingel-moment.js) with the made-up Reolink test doorbell (dev/casora_mock/klingel.py,
// service casora_mock.klingel_druecken: the visitor sensor on for 2 s), a real ring through HA each time:
//   1. The doorbell is watched (subscribe_entities for binary_sensor.testklingel_visitor).
//   2. Wall tablet with the screensaver on (?casora_saver=1): a ring ends the screensaver and opens the doorbell popup
//      with the live picture (<casora-klingel-live>); without a touch it closes after the ring window (shortened here)
//      and the screensaver comes back.
//   3. A second ring within the debounce of the last ring (shortened here to outlast the ring window): nothing opens.
//   4. A popup open before the ring: after the ring window that popup is back.
//   5. Someone touches it (a key): it stays open after the ring window.
//   6. Someone typing in a text field: nothing opens, the field keeps the focus.
//   7. Switched off (notify_doorbell_front: false): nothing opens.
//   8. Phone width, dark: the popup opens and fits the screen.
// Light and dark, desktop/tablet and phone widths; screenshots with CASORA_SHOTS.
import { open, casoraDashboard, dashboard, check, need, finish, stable, shot, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const CAM = 'camera.testklingel_sub', BELL = 'binary_sensor.testklingel_visitor';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const tok = await tokens();
const svc = (d, s, data) => fetch(BASE + '/api/services/' + d + '/' + s,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });

const { page } = await open({ width: 1180, height: 820, theme: 'Casora', dark: false });
await dashboard(page, dash.url + '?casora_saver=1', 3);
await need('Testklingel im Testhaus (Mock)', await page.evaluate(([c, b]) => {
  const S = document.querySelector('home-assistant').hass.states;
  return !!(S[c] && S[b]);
}, [CAM, BELL]));
const watching = await stable(page, () => (window._casoraKlingelMoment && window._casoraKlingelMoment.watching()) || [],
  null, { max: 20000, quiet: 500, until: (v) => v.length > 0 });
await check('1. Klingel wird beobachtet (nur Klingeln mit Kamera)', watching.includes(BELL), watching);
// Short windows for the test (the product uses 90 s and 10 s; here the debounce outlasts the ring window on purpose).
await page.evaluate(() => { window._casoraKlingelMoment._ringMs = 5000; window._casoraKlingelMoment._quietMs = 15000; });

const state = () => page.evaluate(() => {
  const P = window.casoraPopup, el = P && P.element, open = !!(el && el.hasAttribute('open'));
  const live = open ? window.__pierce('casora-klingel-live', el.shadowRoot).length > 0 : false;
  const surf = open && el.surface ? el.surface.getBoundingClientRect() : null;
  return { open, entity: P && P.entity, live, title: open ? String((el._headerTitle && el._headerTitle.textContent) || '').replace(/​/g, '').trim() : '',
    saver: !!(window._casoraSaver && window._casoraSaver.shown()), moment: window._casoraKlingelMoment.current(),
    surf: surf && { x: surf.x, w: surf.width, r: surf.right }, vw: innerWidth,
    focus: (() => { const a = document.activeElement; return a ? a.className || a.tagName : null; })() };
});
const waitFor = (pred, max = 15000) => stable(page, () => {
  const P = window.casoraPopup, el = P && P.element, open = !!(el && el.hasAttribute('open'));
  return { open, live: open ? window.__pierce('casora-klingel-live', el.shadowRoot).length > 0 : false,
    saver: !!(window._casoraSaver && window._casoraSaver.shown()), title: open ? String((el._headerTitle && el._headerTitle.textContent) || '').trim() : '' };
}, null, { max, quiet: max, until: pred });   // quiet = max: wait for the predicate, not for a still picture
const closePop = async () => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(700); };
const ring = async () => { await svc('casora_mock', 'klingel_druecken', { dauer: 2, person: 3 }); };
const quiet = async () => { await page.waitForTimeout(16000); };   // past the shortened quiet time

// 2. Screensaver → doorbell popup → back to the screensaver.
await page.evaluate(() => window._casoraSaver.start());
let s = await waitFor((v) => v.saver, 6000);
await need('Bildschirmschoner läuft', s && s.saver, s);
await ring();
s = await waitFor((v) => v.open && v.live && !v.saver, 12000);
await check('2. Klingeln: Bildschirmschoner weg, Klingel-Popup mit Live-Bild offen', s && s.open && s.live && !s.saver, s);
await shot('r945-tablet-hell');
const s2 = await state();
await check('2. Popup gehört zur Klingel-Kamera', s2.entity === CAM || s2.live, s2);
s = await waitFor((v) => !v.open && v.saver, 15000);
await check('2. Ohne Berührung: Popup schließt nach dem Klingelfenster, Bildschirmschoner wieder da', s && !s.open && s.saver, s);
await page.evaluate(() => window._casoraSaver.wake());
await closePop();

// 3. Debounce: a ring within the debounce of the last ring does not open it again (r946: after it, it does).
await page.waitForTimeout(800);
await ring();
await page.waitForTimeout(5000);
s = await state();
await check('3. Kurz nach dem letzten Klingeln erneut geklingelt: nichts öffnet sich (entprellt)', !s.open, s);
await quiet();

// 4. A popup open before: back after the ring window.
await page.evaluate(() => window.casoraPopup.open({ title: 'QA vorher', content: { type: 'vertical-stack', cards: [] } }));
await page.waitForTimeout(800);
await ring();
s = await waitFor((v) => v.open && v.live, 12000);
await check('4. Klingeln über einem offenen Popup: Klingel-Popup', s && s.open && s.live, s);
s = await waitFor((v) => v.open && !v.live && /QA vorher/.test(v.title), 15000);
await check('4. Nach dem Klingelfenster: das Popup von vorher ist wieder da', s && s.open && /QA vorher/.test(s.title), s);
await closePop();
await quiet();

// 5. Touched: it stays.
await ring();
s = await waitFor((v) => v.open && v.live, 12000);
await page.keyboard.press('Shift');
await page.waitForTimeout(8000);
s = await state();
await check('5. Berührt (Taste): bleibt nach dem Klingelfenster offen', s.open && s.live, s);
await closePop();
await quiet();

// 6. Typing: nothing opens, the field keeps the focus.
await page.evaluate(() => {
  const i = document.createElement('input');
  i.type = 'text'; i.className = 'qa-r945-input';
  i.style.cssText = 'position:fixed;left:10px;top:10px;z-index:2147483600;';
  document.body.appendChild(i);
  i.focus();
});
await ring();
await page.waitForTimeout(5000);
s = await state();
await check('6. Beim Tippen: nichts öffnet sich, Fokus bleibt im Feld', !s.open && s.focus === 'qa-r945-input', s);
await page.evaluate(() => { const i = document.querySelector('.qa-r945-input'); if (i) i.remove(); });
await quiet();

// 7. Switched off.
await page.evaluate(() => window._casoraNotify.configureFrom(Object.assign({}, window._casoraNotifyCfg || {}, { notify_doorbell_front: false })));
await ring();
await page.waitForTimeout(5000);
s = await state();
await check('7. Ausgeschaltet (notify_doorbell_front: false): nichts öffnet sich', !s.open, s);
await page.evaluate(() => window._casoraNotify.configureFrom(window._casoraNotifyCfg || {}));
await quiet();

// 8. Phone width, dark.
const ph = await open({ width: 393, height: 852, theme: 'Casora', dark: true, mobile: true });
const pp = ph.page;
await dashboard(pp, (dash.phone ? dash.phone.url : dash.url), 3);
await stable(pp, () => (window._casoraKlingelMoment && window._casoraKlingelMoment.watching()) || [], null, { max: 20000, quiet: 500, until: (v) => v.length > 0 });
await pp.evaluate(() => { window._casoraKlingelMoment._ringMs = 5000; });
await page.close();
await ring();
const p8 = await stable(pp, () => {
  const el = window.casoraPopup && window.casoraPopup.element, open = !!(el && el.hasAttribute('open'));
  const r = open && el.surface ? el.surface.getBoundingClientRect() : null;
  return { open, live: open ? window.__pierce('casora-klingel-live', el.shadowRoot).length > 0 : false, x: r && r.x, r: r && r.right, vw: innerWidth };
}, null, { max: 12000, quiet: 400, until: (v) => v.open });
await check('8. Handy, dunkel: Popup öffnet sich und passt in die Breite', p8 && p8.open && p8.x >= -1 && p8.r <= p8.vw + 1, p8);
await shot('r945-handy-dunkel');
await finish();
