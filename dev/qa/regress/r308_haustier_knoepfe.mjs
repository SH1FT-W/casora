// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/26-haustier.js dev/casora_mock/haustier.py
// Pet popup keys (issue #25): with the popup open, the tracker's light switches on in HA (as from the Tractive app or
// Casora) - the "Light" key must show on, like "Live tracking" does. The keys read their state from the states the
// popup part is drawn with, not from another hass. Then the switches go unavailable (Tractive in power saving):
// the keys stay, dimmed and without an action, with one line saying why.
// Test dog from dev/casora_mock/haustier.py; the light is switched off again at the end, unavailable only in the browser.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable, fakeStates, call } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'device_tracker.tracker_qxkz7plm';
const LED = 'switch.tracker_testhund_led', LIVE = 'switch.tracker_testhund_live_tracking', BUZ = 'switch.tracker_testhund_buzzer';
const sw = async (service, ids) => call((await tokens()).access_token, 'switch', service, { entity_id: ids });
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
atFinish(() => sw('turn_off', [LED, LIVE]).catch(() => {}));
await sw('turn_off', [LED, LIVE]);

const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('test dog in the test house (mock)', await page.evaluate((ids) => ids.every((id) => !!document.querySelector('home-assistant').hass.states[id]), [ID, LED, LIVE, BUZ]));
await page.evaluate(async (id) => {
    window.casoraCommunityOn = new Set([...(window.casoraCommunityOn || []), 'casora_pet']);
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_pet', entity: id, name: 'Testhund' });
    el.classList.add('qa-r307');
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, ID);
await page.waitForTimeout(1500);
const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r307').getBoundingClientRect();
  return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
await page.mouse.click(at.x, at.y);

// Keys of the open popup: label (caption or pill text), on, action, dimmed; plus the hint line.
const keys = () => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const round = window.__pierce('.hp-b', pop.shadowRoot), pills = window.__pierce('.hh-pill', pop.shadowRoot);
  const caps = window.__pierce('.hp-cap span', pop.shadowRoot).map((s) => s.textContent.trim());
  const list = round.length ? round.map((b, i) => ({ l: caps[i], on: b.classList.contains('on'), svc: !!b.getAttribute('data-casora-svc'),
    dim: b.getAttribute('aria-disabled') === 'true' }))
    : pills.map((b) => ({ l: b.textContent.trim(), on: b.classList.contains('pri'), svc: !!b.getAttribute('data-casora-svc'),
      dim: b.getAttribute('aria-disabled') === 'true' }));
  if (!list.length) return null;
  const txt = window.__pierce('div', pop.shadowRoot).map((d) => d.textContent).join(' ');
  return { list, hint: /Energiesparen ist an|Power saving is on/.test(txt) };
}, null, { max: 10000, quiet: 1000 });
const key = (r, re) => r && r.list.find((k) => re.test(k.l || ''));

let r = await keys();
await need('popup with light, sound and live tracking keys', r && key(r, /Licht|Light/) && key(r, /Ton|Sound/) && key(r, /Live/), r);
await check('light off: key off, with an action', !key(r, /Licht|Light/).on && key(r, /Licht|Light/).svc, r.list);

await sw('turn_on', LED);
r = await keys();
await check('light switched on in HA: the Light key shows on', key(r, /Licht|Light/) && key(r, /Licht|Light/).on, r && r.list);
await sw('turn_on', LIVE);
r = await keys();
await check('live tracking on: the Live key shows on', key(r, /Live/) && key(r, /Live/).on, r && r.list);
await check('light still on after another update', key(r, /Licht|Light/) && key(r, /Licht|Light/).on, r && r.list);

// Power saving: Tractive makes the switches unavailable (browser only).
await fakeStates(page, { [LED]: { state: 'unavailable' }, [BUZ]: { state: 'unavailable' }, [LIVE]: { state: 'unavailable' } }, { sticky: true });
r = await keys();
await check('unavailable: keys dimmed, no action', r && r.list.length === 3 && r.list.every((k) => k.dim && !k.svc), r && r.list);
await finish();
