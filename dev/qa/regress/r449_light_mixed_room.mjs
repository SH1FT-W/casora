// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/03-popups.js#S.kColor,S.lampTones,v3Stage,rgbOf,v3Moons,v3SceneItems,roomV3,_casoraSuppressDismiss,_casoraLF,_casoraBackNext custom_components/casora/scripts/casora-core.js
// Owner report (01.11.2026), a room light popup with lamps in different colours: „Warm“ and „Farbe“ were chosen at once
// and the ring showed only the first lamp's colour. Now no field is chosen while the lamps differ, the ring blends their
// colours (gradient along the fill), and „Warm“ makes every lit lamp warm (then „Warm“ alone, one colour).
// Test house: the hub lamps in Garage (dev/casora_mock/hubs.py), room group light.hub_lampen_garage. Desktop.
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = await casoraDashboard();
await need('a Casora dashboard', d);
const desk = await open({ width: 1440, height: 900, dark: false });
const pg = desk.page;
usePage(pg);
await dashboard(pg, d.url, 3);
const room = await pg.evaluate(() => (document.querySelector('home-assistant').hass.states['light.hub_lampen_garage'] ? 'light.hub_lampen_garage' : null));
await need('room group of the hub lamps (private fixture)', room);
const call = (id, data) => pg.evaluate(([id, data]) => document.querySelector('home-assistant').hass.callService('light', 'turn_on', { entity_id: id, ...data }), [id, data]);
const openPopup = async () => {
  await pg.evaluate(async (entity) => {
    if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close();
    await new Promise((r) => setTimeout(r, 400));
    const ha = document.querySelector('home-assistant');
    const old = ha.shadowRoot.getElementById('qa-r449'); if (old) old.remove();
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity, variables: {} });
    el.id = 'qa-r449'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:10px;top:500px;width:200px;height:140px;z-index:1;';
    ha.shadowRoot.appendChild(el);
    await new Promise((r) => setTimeout(r, 1200));
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  }, room);
  await pg.waitForTimeout(3000);
};
const look = () => pg.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p) return null;
  const segs = window.__pierce('.hui-sg', p.shadowRoot).filter((x) => x.getBoundingClientRect().width > 0).map((x) => {
    const b = x.getBoundingClientRect(); return { t: x.textContent.trim(), on: x.classList.contains('on'), x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  const ln = window.__pierce('.hui-dl path.fl.ln', p.shadowRoot)[0];
  const stroke = ln ? (ln.getAttribute('stroke') || ln.style.stroke || '') : '';
  const m = /url\(["']?#([^"')]+)/.exec(stroke);
  const g = m ? ln.ownerSVGElement.querySelector('#' + CSS.escape(m[1])) : null;
  return { segs, stroke, stops: g ? [...g.querySelectorAll('stop')].map((s) => s.style.stopColor) : [] };
});

await call('light.werkbanklampe', { hs_color: [350, 90] });
await call('light.deckenlicht_garage', { color_temp_kelvin: 2700 });
await pg.waitForTimeout(1200);
await openPopup();
let l = await look();
await need('room popup with the segment', l && l.segs.length >= 4, l);
await check('mixed white tone and colour: no field chosen', l.segs.every((s) => !s.on), l.segs.filter((s) => s.on).map((s) => s.t));
await check('ring blends the lamps\' colours', /url\(/.test(l.stroke) && l.stops.length >= 2, l);
const warm = l.segs.find((s) => s.t === 'Warm');
await pg.mouse.click(warm.x, warm.y);
await pg.waitForTimeout(2000);
const modes = await pg.evaluate(() => ['light.werkbanklampe', 'light.deckenlicht_garage'].map((id) => document.querySelector('home-assistant').hass.states[id].attributes.color_mode));
await check('„Warm“ makes every lit lamp a white tone', modes.every((m) => m === 'color_temp'), modes);
await openPopup();
l = await look();
await check('all warm: „Warm“ alone', l.segs.filter((s) => s.on).map((s) => s.t).join() === 'Warm', l.segs.filter((s) => s.on));
await check('one tone: one colour, no gradient', !/url\(/.test(l.stroke), l.stroke);
await call('light.werkbanklampe', { color_temp_kelvin: 4000 });
await finish();
