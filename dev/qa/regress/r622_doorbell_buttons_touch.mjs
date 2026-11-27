// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/24-klingel.js dev/casora_mock/klingel.py
// Issue #23: on a 10" Android tablet the doorbell popup's buttons on and under the live picture (full screen, the
// camera switch, listen, talk) did nothing on a tap, not even the press look; with a mouse on the Mac they worked,
// and the popup's other rows (siren, text to speech) worked on the tablet too. Expected: with real touch taps the
// full screen button opens the big picture, the camera switch changes the camera, × closes, and "Listen" turns
// the sound on. Tiles are built in the browser only (not saved).
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const ID = 'camera.testklingel_sub', HOF = 'camera.testhof';
const ANDROID_TABLET_UA = 'Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1280, height: 800, mobile: true, touch: true, userAgent: ANDROID_TABLET_UA, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('test doorbell and test yard camera in the test house (mock)', await page.evaluate(([a, b]) => {
  const S = document.querySelector('home-assistant').hass.states;
  return !!(S[a] && S[b]);
}, [ID, HOF]));
// The doorbell offers "Listen" only with a stream.
await fakeStates(page, { [ID]: { state: 'idle', attributes: { supported_features: 2, friendly_name: 'Test doorbell' } } }, { sticky: true });
const at = await page.evaluate(async ([id, hof]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_reolink_doorbell', entity: id, name: 'Door',
    variables: { camera2: hof, talk: true } });
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [ID, HOF]);
const live = () => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const el = pop && window.__pierce('casora-klingel-live', pop.shadowRoot)[0];
  if (!el || !el.shadowRoot) return null;
  const q = (s) => el.shadowRoot.querySelector(s);
  const rect = (x) => { const b = x && !x.hidden && x.getBoundingClientRect(); return b && b.width ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; };
  const sg = q('.sg');
  return { open: !!pop, big: q('.st').classList.contains('big'), view: el._v && el._v.id,
    fs: rect(q('.fs')), x: rect(q('.x')), snd: rect(q('.snd')), sndOn: q('.snd').getAttribute('aria-pressed'),
    seg: sg ? [...sg.querySelectorAll('.sgb')].map(rect) : [] };
}, null, { max: 8000, quiet: 600 });
const tap = async (r) => { await page.touchscreen.tap(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2)); await page.waitForTimeout(700); };

await page.touchscreen.tap(Math.round(at.x), Math.round(at.y));
let l = await live();
await need('doorbell popup open with full screen button, camera switch and Listen', l && l.fs && l.seg[1] && l.snd, l);

await tap(l.seg[1]);
l = await live();
await check('tap on the camera switch shows the second camera', l && l.view === HOF, l && { view: l.view });
await tap(l.seg[0]);
l = await live();

await tap(l.fs);
l = await live();
await check('tap on the full screen button opens the big picture', l && l.big, l && { big: l.big });
if (l && l.big && l.x) {
  await tap(l.x);
  l = await live();
  await check('tap on × closes the big picture, the popup stays', l && !l.big && l.open, l && { big: l.big, open: l.open });
}

await tap(l.snd);
l = await live();
await check('tap on "Listen" turns the sound on', l && l.sndOn === 'true', l && { snd: l.sndOn });
await finish();
