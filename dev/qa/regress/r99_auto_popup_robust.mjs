// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/local/12-tanken.js
// Gemeldet (1.2.2): Bei einem Nutzer öffnete sich das Auto-Popup nicht (bei uns schon). Andere Integrationen
// benennen ihre Entitäten anders, E-Autos haben keinen Tank, manche Autos nur einen device_tracker, Werte sind
// „unavailable“/„unknown“, Einheiten Meilen. Erwartet: Für jede Variante öffnet ein Tipp auf die Auto-Kachel
// das Popup (Titel, kein Fehler-Kärtchen), es bleibt sinnvoll leer statt abzustürzen, und die Konsole
// meldet keinen Fehler. Kachel zeigt einen Zustandstext. Je Theme Casora und Standard, deutsch und englisch.
// Die Autos sind erfunden und stehen nur im Browser (hass.entities/hass.states), nichts wird in HA gespeichert.
import { open, casoraDashboards, dashboard, check, need, finish, fakeStates, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

// Registereinträge (hass.entities) und Zustände je erfundenem Auto.
const reg = {}, st = {};
const add = (id, dev, state, attrs = {}, x = {}) => {
  reg[id] = { entity_id: id, device_id: dev, platform: x.platform || 'qa_auto', translation_key: x.tk || null, ...(x.noDev ? { device_id: null } : {}) };
  st[id] = { state, attributes: attrs };
};
// E-Auto (englisch benannt, Meilen), kein Tank, kein Standort.
add('sensor.qa_ev_battery_level', 'qa_dev_ev', '64', { unit_of_measurement: '%', friendly_name: 'QA EV Battery level' });
add('sensor.qa_ev_range', 'qa_dev_ev', '182', { unit_of_measurement: 'mi' });
add('sensor.qa_ev_odometer', 'qa_dev_ev', '12873', { unit_of_measurement: 'mi' });
add('binary_sensor.qa_ev_doors', 'qa_dev_ev', 'off');
add('lock.qa_ev_door_lock', 'qa_dev_ev', 'locked');
add('sensor.qa_ev_outside_temperature', 'qa_dev_ev', '54', { unit_of_measurement: '°F' });
// Tesla-artig: translation_keys, alles „unavailable“, Standort per device_tracker.
add('sensor.qa_tesla_battery', 'qa_dev_tesla', 'unavailable', {}, { tk: 'battery_level' });
add('sensor.qa_tesla_battery_range', 'qa_dev_tesla', 'unavailable', {}, { tk: 'battery_range' });
add('sensor.qa_tesla_odometer', 'qa_dev_tesla', 'unavailable', {}, { tk: 'odometer' });
add('lock.qa_tesla_lock', 'qa_dev_tesla', 'unavailable');
add('binary_sensor.qa_tesla_frunk', 'qa_dev_tesla', 'unavailable');
add('device_tracker.qa_tesla_location', 'qa_dev_tesla', 'unavailable', { friendly_name: 'QA Tesla Location' });
// Verbrenner mit „unknown“ und seltsamen Werten (Text statt Zahl, Zeitstempel als Zahl).
add('sensor.qa_ice_fuel_level', 'qa_dev_ice', 'unknown', { unit_of_measurement: '%' });
add('sensor.qa_ice_range', 'qa_dev_ice', 'n/a', { unit_of_measurement: 'km', data_captured_at: 1760000000 });
add('sensor.qa_ice_mileage', 'qa_dev_ice', 'unknown', { unit_of_measurement: 'km' });
add('sensor.qa_ice_next_service', 'qa_dev_ice', 'unknown', { unit_of_measurement: 'd' });
add('sensor.qa_ice_last_update', 'qa_dev_ice', 'gestern');
add('button.qa_ice_refresh', 'qa_dev_ice', 'unknown');
// Nur ein device_tracker am Gerät.
add('device_tracker.qa_trk_location', 'qa_dev_trk', 'home', { friendly_name: 'QA Car' });
// device_tracker ohne Gerät (z. B. generischer Tracker).
add('device_tracker.qa_loose', null, 'not_home', { friendly_name: 'QA Loose' }, { noDev: true });
// Nur drei deutsch benannte Sensoren, Präfix mit Bereich vorn und Ziffer mitten drin, „tankstand“ statt „tankfullstand“
// (so gemeldet, Namen hier erfunden): weder translation_key noch die Endungen des VW-Connect-Autos.
add('sensor.carport_kombi_7_tdi_kilometerstand', 'qa_dev_kombi', '48211', { unit_of_measurement: 'km' });
add('sensor.carport_kombi_7_tdi_reichweite', 'qa_dev_kombi', '412', { unit_of_measurement: 'km', friendly_name: 'Carport Kombi 7 TDI Reichweite' });
add('sensor.carport_kombi_7_tdi_tankstand', 'qa_dev_kombi', '55', { unit_of_measurement: '%' });
// Auto in Gallonen/Meilen mit Tankstand > 100 und negativen Werten (Rundungsfehler der Integration).
add('sensor.qa_gal_fuel_level', 'qa_dev_gal', '7.5', { unit_of_measurement: 'gal' });
add('sensor.qa_gal_range', 'qa_dev_gal', '-3', { unit_of_measurement: 'mi' });
add('sensor.qa_gal_odometer', 'qa_dev_gal', '0', { unit_of_measurement: 'mi' });

const VARIANTS = [
  ['E-Auto ohne Tank (Meilen)', { entity: 'sensor.qa_ev_battery_level' }, ['182 mi', '64 %']],
  ['Kombi mit drei Sensoren (Reichweite)', { entity: 'sensor.carport_kombi_7_tdi_reichweite' }, ['412', '55 %']],
  ['Kombi mit drei Sensoren (altes Präfix)', { variables: { car: 'carport_kombi_7_tdi' } }, ['412', '55 %']],
  ['E-Auto über das Schloss', { entity: 'lock.qa_ev_door_lock' }],
  ['Tesla-artig, alles unavailable', { entity: 'device_tracker.qa_tesla_location' }],
  ['Verbrenner unknown/Text', { entity: 'sensor.qa_ice_range' }],
  ['nur device_tracker', { entity: 'device_tracker.qa_trk_location' }],
  ['device_tracker ohne Gerät', { entity: 'device_tracker.qa_loose' }],
  ['Gallonen/Meilen, Tank 7,5 gal', { entity: 'sensor.qa_gal_fuel_level' }],
  ['Entität fehlt', { entity: 'sensor.qa_gibt_es_nicht' }],
  ['altes Präfix ohne Treffer', { variables: { car: 'qa_nope' } }],
  ['Präfix als Zahl', { variables: { car: 7 } }],
  ['ohne Entität', {}],
];

const mount = (pg, cfg) => pg.evaluate(async (cfg) => {
  const ha = document.querySelector('home-assistant');
  if (window.__qaTile) window.__qaTile.remove();
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig(Object.assign({ type: 'custom:button-card', template: 'casora_car', name: 'Auto' }, cfg));
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 900));
  const s = el.shadowRoot;
  return { state: s && s.querySelector('#state') ? s.querySelector('#state').textContent.trim() : null };
}, cfg);

// Tipp wie im Dashboard (button-card → hass-action → fire-dom-event → casoraPopup), danach Popup messen.
const tapAndRead = async (pg) => {
  await pg.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
  await pg.waitForTimeout(500);
  // Echter Klick auf die Kachelmitte (Zeiger-Ereignisse wie am Gerät); Fehler aus den Vorlagen landen in der Konsole.
  await pg.evaluate(() => {
    const el = window.__qaTile;
    el.hass = document.querySelector('home-assistant').hass;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
  });
  await pg.waitForTimeout(300);
  const b2 = await pg.evaluate(() => { const r = window.__qaTile.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; });
  const thrown = b2.w > 20 ? null : 'Kachel nicht sichtbar';
  if (!thrown) await pg.mouse.click(b2.x, b2.y);
  let res = null;
  for (let i = 0; i < 20; i++) {
    res = await pg.evaluate(() => {
      const P = window.casoraPopup, s = P && P.surface;
      if (!s) return null;
      const sr = P.element.shadowRoot;
      return { title: sr.querySelector('.header-title').textContent.trim(),
        errors: window.__pierce('hui-error-card, .hui-error-card', s).length + window.__pierce('ha-alert[alert-type="error"]', s).length,
        text: (function deep(n) { let t = ''; for (const c of n.childNodes) t += c.nodeType === 3 ? c.data + ' ' : c.nodeType === 1 && c.tagName !== 'STYLE' ? deep(c) : '';
          if (n.shadowRoot) t += deep(n.shadowRoot); return t; })(s).replace(/\s+/g, ' ').trim().slice(0, 400) };
    });
    if (res && res.text.length > res.title.length + 5) break;
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(700);
  return { thrown, res };
};

const RUNS = [{ theme: 'Casora', lang: null }, { theme: 'Hemma 2', lang: null }, { theme: 'Casora', lang: 'en' },
  { theme: 'Casora', lang: null, mobile: true }];
for (const run of RUNS) {
  const tag = run.theme + (run.lang ? ' ' + run.lang : '') + (run.mobile ? ' Handy' : '');
  const { page } = await open(run.mobile ? { width: 393, height: 852, mobile: true, theme: run.theme }
    : { width: 1440, height: 900, theme: run.theme, lang: run.lang || undefined });
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && /casora|button-card|ButtonCard|_casoraCar|_casoraTank|TypeError/i.test(m.text())) errs.push(m.text()); });
  await dashboard(page, run.mobile ? (all.find((d) => d.mobile && d.url === desk.url + '-mobile') || desk).url : desk.url);
  await page.evaluate((reg) => {
    const ha = document.querySelector('home-assistant');
    ha._updateHass({ entities: Object.assign({}, ha.hass.entities, reg) });
  }, reg);
  await fakeStates(page, st, { sticky: true });
  for (const [name, cfg, want] of VARIANTS) {
    errs.length = 0;
    const m = await mount(page, cfg);
    const { thrown, res } = await tapAndRead(page);
    if (process.env.R99_BILD) await page.screenshot({ path: process.env.CASORA_OUT + '/' + ('r99_' + tag + '_' + name).replace(/[^\w.-]+/g, '_') + '.png' });
    await check(tag + ' · ' + name + ': Kachel zeigt einen Zustand', m && m.state != null && m.state !== '', m);
    await check(tag + ' · ' + name + ': Popup öffnet mit Titel', !thrown && res && res.title.length > 0, { thrown, res });
    await check(tag + ' · ' + name + ': kein Fehler-Kärtchen im Popup', res && res.errors === 0, res);
    if (want) await check(tag + ' · ' + name + ': zeigt ' + want.join(', '), res && want.every((w) => res.text.replace(/\u00a0/g, ' ').replace(/(\d) ?%/g, '$1 %').includes(w)), res && res.text);
    await check(tag + ' · ' + name + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3));
  }
  // Kein Auto im Haus (Kachel „Automatisch“): Registereinträge mit Fahrzeug-Rollen nur im Browser ausblenden.
  await page.evaluate(() => {
    const ha = document.querySelector('home-assistant'), R = {};
    for (const [k, v] of Object.entries(ha.hass.entities)) if (!/(range|reichweite|odometer|mileage|kilometerstand|fuel|tank|battery|akku|soc|ladezustand)/.test(k)) R[k] = v;
    ha._updateHass({ entities: R });
  });
  // Nur das Kombi mit drei Sensoren im Haus, Kachel „Automatisch“: findet das Auto trotzdem.
  await page.evaluate((reg) => {
    const ha = document.querySelector('home-assistant');
    const R = Object.assign({}, ha.hass.entities);
    for (const k of Object.keys(reg)) if (k.indexOf('.carport_kombi_') > 0) R[k] = reg[k];
    ha._updateHass({ entities: R });
  }, reg);
  errs.length = 0;
  await mount(page, {});
  const rk = await tapAndRead(page);
  await check(tag + ' · nur Kombi, Kachel automatisch: Popup zeigt 412 und 55 %', rk.res && ['412', '55 %'].every((w) => rk.res.text.replace(/\u00a0/g, ' ').replace(/(\d) ?%/g, '$1 %').includes(w)), rk);
  await check(tag + ' · nur Kombi, Kachel automatisch: keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3));
  await page.evaluate(() => {
    const ha = document.querySelector('home-assistant'), R = {};
    for (const [k, v] of Object.entries(ha.hass.entities)) if (k.indexOf('.carport_kombi_') < 0) R[k] = v;
    ha._updateHass({ entities: R });
  });
  errs.length = 0;
  const m0 = await mount(page, {});
  const r0 = await tapAndRead(page);
  await check(tag + ' · kein Auto im Haus: Kachel zeigt einen Zustand', m0 && m0.state, m0);
  await check(tag + ' · kein Auto im Haus: Popup öffnet mit Titel', !r0.thrown && r0.res && r0.res.title.length > 0, r0);
  await check(tag + ' · kein Auto im Haus: keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3));
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__qaTile) window.__qaTile.remove(); });
}

await finish();
