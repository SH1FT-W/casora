// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js#WX_KEYS,WX_ATTR,attrUnit,weatherSources,weatherOptions,weatherChart,weatherRows,casoraSvc,casoraSettings,casoraContacts
// Owner (prod, 02.11.2026): weather popup "Details". The rows Regen, Wind, Taupunkt, Windböen and Bewölkung had no ›
// (no detail page, no history), only Regen heute, Niederschlag and Sonneneinstrahlung had one, although the weather
// entity's device has its own sensor for every one of these values. The rows took the weather entity's attribute
// before the sensor (and its slightly different value, gusts 13 instead of 12,6).
// Expected: a value with an own sensor on the weather device is that sensor's row (its value, › onto it); the attribute
// only fills in. Standard rows (Regen, Wind, humidity, pressure, UV, visibility) and the extra rows alike, desktop and
// phone width. Wind: speed (+ direction) opens the speed sensor.
// Test station weather.testwetter (dev/casora_mock/wetter.py, attributes + sensors by translation_key). Its missing
// sensors (wind speed and direction, humidity, pressure, visibility) are added in the browser only (registry copy +
// fakeStates), and sensor values are faked apart from the attributes so the check sees which one is shown. Nothing saved.
// R500_BILD=<prefix>: pictures of the details (<prefix>-desk.png, <prefix>-phone.png). CASORA_LOCAL=1: casora_weather
// from this checkout, in the browser only.
import fs from 'node:fs';
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const WX = 'weather.testwetter';
const P = 'sensor.testwetter_';
// Sensors added to the station's device in the browser: [entity, translation_key, state, unit].
const ADD = [
  [P + 'wind_speed', 'wind_speed', '12.3', 'km/h'],
  [P + 'wind_bearing', 'wind_bearing', '90', '°'],
  [P + 'humidity', 'humidity', '64', '%'],
  [P + 'pressure', 'pressure', '1008.4', 'hPa'],
  [P + 'visibility', 'visibility', '17.5', 'km'],
];
// Existing station sensors faked apart from the weather attributes (dew_point 6.2, wind_gust_speed 41, cloud 75).
const FAKE = { [P + 'dew_point']: '4.4', [P + 'wind_gust']: '27.4', [P + 'cloud_cover']: '58' };
// Row label → the sensor it must open and a pattern for its value.
const WANT = {
  'Regen heute': [P + 'precipitation_probability_today', /60\s*%/],
  Regen: [P + 'precipitation_probability', /35\s*%/],
  Wind: [P + 'wind_speed', /^12[,.]3\s*km\/h/],
  Taupunkt: [P + 'dew_point', /^4\s*°C/],
  Windböen: [P + 'wind_gust', /^27\s*km\/h/],
  Bewölkung: [P + 'cloud_cover', /^58\s*%/],
  Niederschlag: [P + 'precipitation', /0[,.]4/],
  Sonneneinstrahlung: [P + 'solar', /180/],
  Luftfeuchtigkeit: [P + 'humidity', /^64\s*%/],
  Luftdruck: [P + 'pressure', /^1\.?008\s*hPa/],
  Sichtweite: [P + 'visibility', /^17[,.]5\s*km/],
};
const LABELS = Object.keys(WANT).sort((a, b) => b.length - a.length);

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

for (const [tag, width, height] of [['desk', 1440, 900], ['phone', 390, 844]]) {
  const { page } = await open({ width, height, dark: true });
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => { const t = String(e && e.stack || e); if (/casora|button-card/i.test(t)) errs.push('pageerror: ' + t.slice(0, 300)); });
  await dashboard(page, desk.url, 3);
  const dev = await page.evaluate((w) => { const h = document.querySelector('home-assistant').hass; return h.states[w] && h.entities[w] && h.entities[w].device_id; }, WX);
  await need(`[${tag}] Wetterstation mit Gerät`, dev, dev);

  // The added sensors join the station's device in a registry copy (HA's own _updateHass; later state patches keep it).
  const regOk = await page.evaluate(([add, dev]) => {
    const ha = document.querySelector('home-assistant');
    if (typeof ha._updateHass !== 'function') return false;
    const extra = Object.fromEntries(add.map(([id, key]) => [id, { entity_id: id, device_id: dev, translation_key: key, platform: 'casora_mock' }]));
    ha._updateHass({ entities: Object.assign({}, ha.hass.entities, extra) });
    return true;
  }, [ADD, dev]);
  await need(`[${tag}] Sensoren im Browser ergänzt`, regOk);
  const patch = Object.fromEntries(ADD.map(([id, , v, unit]) => [id, { state: v, attributes: { unit_of_measurement: unit, friendly_name: 'Testwetter ' + id.slice(P.length) } }]));
  Object.entries(FAKE).forEach(([id, v]) => { patch[id] = { state: v }; });
  await fakeStates(page, patch, { sticky: true });
  await page.waitForTimeout(300);
  if (process.env.CASORA_LOCAL) {
    const T = JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
    const done = await page.evaluate((t) => {
      // The dashboard config is frozen: hand hui-root a copy with the local template (button-card reads it there).
      const root = window.__pierce('hui-root')[0], ll = root && root.lovelace, cfg = ll && ll.config;
      if (!cfg || !cfg.button_card_templates) return false;
      root.lovelace = Object.assign({}, ll, { config: Object.assign({}, cfg, { button_card_templates: Object.assign({}, cfg.button_card_templates, { casora_weather: t }) }) });
      return true;
    }, T.casora_weather);
    await need('casora_weather aus dem Checkout eingesetzt', done);
  }

  const opened = await page.evaluate(async (entity) => {
    const ha = document.querySelector('home-assistant');
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: 'casora_weather', entity,
      variables: { weather_extras: ['dew_point', 'gust', 'cloud', 'rain_chance', 'rain_chance_today', 'precipitation', 'solar'] } });
    el.hass = ha.hass; old.parentNode.insertBefore(el, old); window.__r500 = el;
    await new Promise((res) => setTimeout(res, 800));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    return 'ok';
  }, WX);
  await need(`[${tag}] Wetter-Popup geöffnet`, opened === 'ok', opened);

  // The detail rows: label, value, the entity it opens (data-casora-mi) and whether it carries a ›.
  let rows = [];
  for (let i = 0; i < 40; i++) {
    rows = await page.evaluate((labels) => {
      const S = window.casoraPopup && window.casoraPopup.surface;
      if (!S) return [];
      return window.__pierce('.hui-inner', S).map((n) => {
        const txt = n.textContent.replace(/\s+/g, ' ').trim();
        const label = labels.find((l) => txt.startsWith(l));
        if (!label) return null;
        const host = n.closest('[data-casora-mi]');
        const ends = [...n.querySelectorAll('.hui-end')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
        return { label, value: ends.join(' ') || txt.slice(label.length).trim(), mi: host ? host.getAttribute('data-casora-mi') : null, chev: !!n.querySelector('.hui-chev') };
      }).filter(Boolean);
    }, LABELS);
    if (rows.some((r) => r.label === 'Taupunkt')) break;
    await page.waitForTimeout(200);
  }
  await need(`[${tag}] Details gezeichnet`, rows.length >= 3, rows);
  const seen = {};
  for (const r of rows) {
    if (seen[r.label]) continue;
    seen[r.label] = 1;
    const [ent, val] = WANT[r.label];
    await check(`[${tag}] „${r.label}“ öffnet ${ent} mit ›`, r.mi === ent && r.chev, r);
    await check(`[${tag}] „${r.label}“ zeigt den Sensorwert`, val.test(r.value), r);
  }
  for (const must of ['Regen', 'Wind', 'Taupunkt', 'Windböen', 'Bewölkung', 'Regen heute', 'Niederschlag', 'Sonneneinstrahlung']) {
    await check(`[${tag}] Zeile „${must}“ vorhanden`, !!seen[must], rows.map((r) => r.label));
  }
  if (process.env.R500_BILD) {
    // Playwright locators pierce the popup's shadow roots: the "Details" list alone.
    const plate = page.locator('.hui-plate').filter({ hasText: 'Taupunkt' }).last();
    await plate.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await plate.screenshot({ path: `${process.env.R500_BILD}-${tag}.png` }).catch((e) => console.log('Bild:', String(e).slice(0, 200)));
  }
  await check(`[${tag}] keine Seitenfehler`, !errs.length, errs);
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r500) window.__r500.remove(); });
}
await finish();
