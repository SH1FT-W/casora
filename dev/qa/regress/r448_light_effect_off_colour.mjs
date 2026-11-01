// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/local/33-color-wheel.js
// Owner report (01.11.2026): an effect started from the v3 light popup's „Effekte“ menu could not be stopped on a lamp
// whose effect list has no none/off entry (Govee/Tuya scene lists), and a colour lamp offered only Warm/Neutral/Kalt.
// Now „Ohne Effekt“ is always the first row (none entry, else a plain colour that ends the scene), a white tone ends a
// running effect on lamps that keep it on a colour change (Hue: the none entry is sent along), and the segment has
// „Farbe“ for colour lamps, which opens the colour wheel page.
// Test house: light.palmenleuchte (colour + scenes, no "off") and light.werkbanklampe (Hue-like, "off") of
// dev/casora_mock/hubs.py. Desktop (mouse) and phone (WebKit, touch).
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const SCENE_LAMP = 'light.palmenleuchte', HUE_LAMP = 'light.werkbanklampe';
const d = await casoraDashboard();
await need('a Casora dashboard', d);

const openPopup = async (pg, entity) => {
  await pg.evaluate(async (entity) => {
    if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close();
    await new Promise((r) => setTimeout(r, 400));
    const ha = document.querySelector('home-assistant');
    const old = ha.shadowRoot.getElementById('qa-r448'); if (old) old.remove();
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity, variables: {} });
    el.id = 'qa-r448'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:10px;top:500px;width:200px;height:140px;z-index:1;';
    ha.shadowRoot.appendChild(el);
    await new Promise((r) => setTimeout(r, 1200));
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  }, entity);
  await pg.waitForTimeout(3000);
};
const attrs = (pg, id) => pg.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return s && { ...s.attributes, state: s.state }; }, id);
const svc = (pg, id, data) => pg.evaluate(([id, data]) => document.querySelector('home-assistant').hass.callService('light', 'turn_on', { entity_id: id, ...data }), [id, data]);
const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const fxMoon = (pg) => pg.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  const m = p && window.__pierce('.hui-moon', p.shadowRoot).find((x) => x.getAttribute('aria-label') === 'Effekte' && x.getBoundingClientRect().width > 0);
  if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const menuRows = (pg) => pg.evaluate(() => {
  const host = document.querySelector('[data-casora-moonmenu-pane]');
  return host ? [...host.shadowRoot.querySelectorAll('.row')].map((x) => { const b = x.getBoundingClientRect(); return { t: x.textContent.trim(), on: x.classList.contains('on'), x: b.x + b.width / 2, y: b.y + b.height / 2 }; }) : null;
});
const segs = (pg) => pg.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  return p ? window.__pierce('.hui-sg', p.shadowRoot).filter((x) => x.getBoundingClientRect().width > 0).map((x) => {
    const b = x.getBoundingClientRect(); return { t: x.textContent.trim(), on: x.classList.contains('on'), wheel: x.getAttribute('data-casora-wheel'), x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }) : [];
});
const wheel = (pg) => pg.evaluate(() => {
  const w = window.__pierce('casora-color-wheel', document)[0];
  const el = w && w.shadowRoot && w.shadowRoot.querySelector('.w');
  if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
});

const run = async (label, pg, tap) => {
  usePage(pg);
  // 1. Scene lamp without "off": „Ohne Effekt“ ends the scene.
  await svc(pg, SCENE_LAMP, { color_temp_kelvin: 3000 });
  await pg.waitForTimeout(500);
  await svc(pg, SCENE_LAMP, { effect: 'Aurora' });
  await pg.waitForTimeout(800);
  await openPopup(pg, SCENE_LAMP);
  const m = await fxMoon(pg);
  await need(label + ': moon „Effekte“', m);
  await tap(m);
  await pg.waitForTimeout(700);
  let rows = await menuRows(pg);
  await need(label + ': menu opens', rows && rows.length, rows);
  await check(label + ': „Ohne Effekt“ first although the lamp has no off entry', rows[0].t === 'Ohne Effekt', rows.map((r) => r.t));
  await check(label + ': the running effect is marked', rows.filter((r) => r.on).map((r) => r.t).join() === 'Aurora', rows.filter((r) => r.on));
  await tap(rows[0]);
  await pg.waitForTimeout(1500);
  let a = await attrs(pg, SCENE_LAMP);
  await check(label + ': „Ohne Effekt“ ended the scene', !a.effect, a.effect);
  await check(label + ': back to the white tone from before the effect', a.color_temp_kelvin === 3000, a.color_temp_kelvin);
  // 2. „Farbe“ in the segment opens the colour wheel; a tap on it sets a colour.
  let sg = await segs(pg);
  await check(label + ': segment Warm/Neutral/Kalt/Farbe for a colour lamp', sg.map((s) => s.t).join() === 'Warm,Neutral,Kalt,Farbe', sg.map((s) => s.t));
  const f = sg.find((s) => s.t === 'Farbe');
  await need(label + ': „Farbe“ in the segment', f, sg.map((s) => s.t));
  await tap(f);
  await pg.waitForTimeout(1500);
  const w = await wheel(pg);
  await need(label + ': „Farbe“ opens the colour wheel', w, w);
  await tap({ x: w.x + w.width * 0.95, y: w.y + w.height / 2 });   // right edge: red
  await pg.waitForTimeout(1500);
  a = await attrs(pg, SCENE_LAMP);
  await check(label + ': wheel set a colour', a.color_mode === 'rgb' && Array.isArray(a.rgb_color) && a.rgb_color[0] > 200 && a.rgb_color[2] < 80, [a.color_mode, a.rgb_color]);
  await openPopup(pg, SCENE_LAMP);
  sg = await segs(pg);
  await check(label + ': „Farbe“ marked while a colour is set', sg.filter((s) => s.on).map((s) => s.t).join() === 'Farbe', sg.filter((s) => s.on));
  // 3. Hue-like lamp keeps its effect on a colour change: „Warm“ sends its off along and ends it.
  await svc(pg, HUE_LAMP, { effect: 'candle' });
  await pg.waitForTimeout(800);
  await openPopup(pg, HUE_LAMP);
  sg = await segs(pg);
  const warm = sg.find((s) => s.t === 'Warm');
  await need(label + ': Hue lamp has „Warm“', warm, sg);
  await tap(warm);
  await pg.waitForTimeout(1500);
  a = await attrs(pg, HUE_LAMP);
  await check(label + ': „Warm“ ended the running effect', a.effect === 'off' && a.color_mode === 'color_temp', [a.effect, a.color_mode]);
  await pg.keyboard.press('Escape').catch(() => {});
};

const desk = await open({ width: 1440, height: 900, dark: false });
await dashboard(desk.page, d.url, 3);
await run('desktop', desk.page, (p) => desk.page.mouse.click(p.x, p.y));

const phone = await open({ width: 393, height: 852, mobile: true, scale: 2, safari: true, dark: false });
await dashboard(phone.page, d.url, 3);
await run('phone', phone.page, (p) => phone.page.touchscreen.tap(p.x, p.y));

usePage(desk.page);
await svc(desk.page, HUE_LAMP, { effect: 'off', color_temp_kelvin: 4000 });
await svc(desk.page, SCENE_LAMP, { color_temp_kelvin: 3000 });
await finish();
