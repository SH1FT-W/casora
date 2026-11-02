// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/casora-chart.js
// Issue #115 (stalakerob, 02.11.2026): weather popup with an own temperature sensor (Studio "Own temperature sensor",
// weather_temp_sensor) and the chart curves Temperatur + Gefühlt. The wheel showed the own sensor (6°), the chart's
// "Temperatur" curve, its "Jetzt" value and the legend the weather source's own temperature (5,0 °C).
// Expected: the wheel, the chart's temperature curve (series entity), "Jetzt" and the legend all read the own sensor.
// Test station weather.testwetter (dev/casora_mock/wetter.py, temperature 11.4); the own sensor is another temperature
// sensor of the test house, its value faked to 6.2 in the browser only. Nothing is saved. Desktop 1440 dark.
// R486_BILD=<file.png>: picture of the popup. CASORA_LOCAL=1: casora_weather from this checkout, in the browser only.
import fs from 'node:fs';
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const WX = 'weather.testwetter';
const FEELS = 'sensor.testwetter_apparent_temperature';
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
const errs = [];
page.on('pageerror', (e) => { const t = String(e && e.stack || e); if (/casora|button-card/i.test(t)) errs.push('pageerror: ' + t.slice(0, 300)); });
await dashboard(page, desk.url, 3);

// An own outdoor-like temperature sensor: any numeric temperature sensor not on the test station.
const OWN = await page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).sort().find((id) => id.startsWith('sensor.') && !id.startsWith('sensor.testwetter')
    && S[id].attributes.device_class === 'temperature' && /°C/.test(S[id].attributes.unit_of_measurement || '') && isFinite(parseFloat(S[id].state))) || null;
});
await need('Wetterstation und ein eigener Temperatursensor', OWN && (await page.evaluate((w) => !!document.querySelector('home-assistant').hass.states[w], WX)), OWN);
await fakeStates(page, { [OWN]: { state: '6.2' } }, { sticky: true });
await page.waitForTimeout(300);
if (process.env.CASORA_LOCAL) {
  const T = JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
  const done = await page.evaluate((t) => {
    // After fakeStates (a new hass re-renders hui-root). The dashboard config is frozen: hand hui-root a copy with the local template (button-card reads it there).
    const root = window.__pierce('hui-root')[0], ll = root && root.lovelace, cfg = ll && ll.config;
    if (!cfg || !cfg.button_card_templates) return false;
    root.lovelace = Object.assign({}, ll, { config: Object.assign({}, cfg, { button_card_templates: Object.assign({}, cfg.button_card_templates, { casora_weather: t }) }) });
    return true;
  }, T.casora_weather);
  await need('casora_weather aus dem Checkout eingesetzt', done);
}

const opened = await page.evaluate(async ([entity, own, feels]) => {
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_weather', entity,
    variables: { weather_temp_sensor: own, weather_feels_sensor: feels, weather_chart: ['temperature', 'feels', 'humidity'] } });
  el.hass = ha.hass; old.parentNode.insertBefore(el, old); window.__r486 = el;
  await new Promise((res) => setTimeout(res, 800));
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  return 'ok';
}, [WX, OWN, FEELS]);
await need('Wetter-Popup geöffnet', opened === 'ok', opened);

// What the popup shows: the wheel's number, the chart's series, its "Jetzt" readout and the legend.
let r = null;
for (let i = 0; i < 50; i++) {
  r = await page.evaluate(() => {
    const S = window.casoraPopup && window.casoraPopup.surface;
    if (!S) return null;
    const stage = window.__pierce('.hui-stage', S)[0];
    const c = window.__pierce('casora-chart', S)[0];
    if (!stage || !c || !c.shadowRoot || !c._data) return null;
    const ro = c.shadowRoot.querySelector('.ro');
    return { wheel: stage.textContent.replace(/\s+/g, ' ').trim(),
      series: (c._c.series || []).map((s) => ({ entity: s.entity, attribute: s.attribute || null, name: s.name })),
      now: ro ? ro.textContent.replace(/\s+/g, ' ').trim() : null,
      legend: [...c.shadowRoot.querySelectorAll('.lg span')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()) };
  });
  if (r && r.now && /\d/.test(r.now)) break;
  await page.waitForTimeout(200);
}
await need('Rad und Diagramm gezeichnet', r && r.now, r);
const temp = r.series.find((s) => /Temperatur/.test(s.name || ''));
await check('Rad zeigt den eigenen Sensor (6°)', /(^|\D)6\s*°/.test(r.wheel), r.wheel);
await check('Kurve „Temperatur“ ist der eigene Sensor', temp && temp.entity === OWN && !temp.attribute, { own: OWN, series: r.series });
await check('„Jetzt“ zeigt den eigenen Sensor (6,2 °C)', /^6[,.]2\b/.test(r.now), r.now);
await check('Legende „Temperatur“ vorhanden, „Gefühlt“ daneben', r.legend.some((t) => /^Temperatur/.test(t)) && r.legend.some((t) => /^Gefühlt/.test(t)), r.legend);
const feelsS = r.series.find((s) => /Gefühlt/.test(s.name || ''));
await check('Kurve „Gefühlt“ ist der gewählte Sensor', feelsS && feelsS.entity === FEELS, r.series);
if (process.env.R486_BILD) {
  await page.evaluate(() => { const c = window.__pierce('casora-chart', window.casoraPopup.surface)[0]; c.scrollIntoView({ block: 'end', behavior: 'instant' }); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.env.R486_BILD });
}
await check('keine Seitenfehler', !errs.length, errs);
await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r486) window.__r486.remove(); });
await finish();
