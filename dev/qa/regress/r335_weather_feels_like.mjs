// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/casora-chart.js dev/casora_mock/wetter.py
// Issue #56: felt temperature as a second curve in the weather popup's temperature chart, and the further values of
// the weather source ("Wetter & Warnungen") in the popup. Test station weather.testwetter (dev/casora_mock/wetter.py):
// sensors by translation_key on its device, with 48 h history for temperature and felt temperature.
// Expected, desktop 1440 dark and phone 393 (WebKit):
//   1. The chart draws two curves at once (no switch) with a legend "Temperatur"/"Gefühlt", the felt one from the
//      station's apparent_temperature sensor, both with history.
//   2. "Details" lists Gefühlt first, Taupunkt after Luftfeuchtigkeit, Windböen after Wind, then Bewölkung, both rain
//      chances, Niederschlag and Sonneneinstrahlung; no "undefined"/"NaN", no console errors.
//   3. Studio "Felt temperature" and "Extra values" off (weather_feels/weather_extras false): one curve, no extra rows.
//   4. A weather entity without these sources keeps its popup (no felt curve, no extra rows).
// WX56_BILDER=<folder>: pictures of the popup (chart and details) on desktop and phone.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const WX = 'weather.testwetter';
const FEELS = 'sensor.testwetter_apparent_temperature';
const OUT = process.env.WX56_BILDER;
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const phone = all.find((d) => d.url === desk.url + '-mobile');

// Opens the casora_weather popup for `entity` from a button-card made for it; returns what the popup shows.
const probe = async (page, entity, variables, shotName) => {
  const r = await page.evaluate(async ([entity, variables]) => {
    const ha = document.querySelector('home-assistant');
    if (!ha.hass.states[entity]) return { missing: entity };
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: 'casora_weather', entity, variables });
    el.hass = ha.hass; old.parentNode.insertBefore(el, old); window.__wx56el = el;
    await new Promise((res) => setTimeout(res, 800));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    const S = () => window.casoraPopup && window.casoraPopup.surface;
    for (let i = 0; i < 40 && !(S() && window.__pierce('.hui-row', S()).length); i++) await new Promise((res) => setTimeout(res, 200));
    // The chart: data loaded and drawn (lines are paths with a stroke and fill:none).
    let chart = null;
    for (let i = 0; i < 50; i++) {
      const c = S() && window.__pierce('casora-chart', S())[0];
      const lines = c && c.shadowRoot ? [...c.shadowRoot.querySelectorAll('path')].filter((p) => /fill:none/.test(p.getAttribute('style') || '')) : [];
      if (c && c._data && lines.length) {
        chart = { series: (c._c.series || []).map((s) => ({ entity: s.entity, attribute: s.attribute || null, name: s.name })), switch: c._c.switch,
          lines: lines.map((p) => (p.getAttribute('d') || '').split(/[LC]/).length), colors: lines.map((p) => getComputedStyle(p).stroke), legend: [...c.shadowRoot.querySelectorAll('.lg span')].map((x) => x.textContent),
          tabs: c.shadowRoot.querySelectorAll('.sw button').length };
        break;
      }
      await new Promise((res) => setTimeout(res, 200));
    }
    await new Promise((res) => setTimeout(res, 600));
    const rows = S() ? window.__pierce('.hui-row', S()).map((e) => e.textContent.replace(/\s+/g, ' ').trim()) : [];
    return { chart, rows, text: S() ? window.__pierce('.hw', S()).map((e) => e.textContent).join(' ') : '' };
  }, [entity, variables]);
  if (shotName && OUT && r && !r.missing) {
    for (const [part, sel] of [['diagramm', '.hp-chart-slot'], ['details', '.hui-row']]) {
      await page.evaluate((sel) => { const s = window.casoraPopup.surface; const e = window.__pierce(sel, s)[0];
        if (e) e.scrollIntoView({ block: sel === '.hui-row' ? 'start' : 'center', behavior: 'instant' }); }, sel);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/${shotName}-${part}.png` });
    }
  }
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__wx56el) window.__wx56el.remove(); });
  await page.waitForTimeout(400);
  return r;
};

const label = (rows, word) => rows.findIndex((t) => t.startsWith(word));

for (const [tag, opts, url] of [
  ['Desktop', { width: 1440, height: 900, dark: true }, desk.url],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, dark: true }, phone && phone.url],
]) {
  if (!url) { await check(tag + ': Handy-Dashboard vorhanden', tag === 'Desktop', all.map((d) => d.url)); continue; }
  const { page } = await open(opts);
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && /casora|button-card|TypeError/i.test(m.text())) errs.push(m.text()); });
  await dashboard(page, url, 3);
  // The mock writes the history after HA has started (backfill_history), up to a minute or two after "ready".
  const hist = await page.evaluate(async (id) => {
    const h = document.querySelector('home-assistant').hass;
    for (let i = 0; i < 90; i++) {
      const r = await h.callWS({ type: 'history/history_during_period', start_time: new Date(Date.now() - 24 * 3600000).toISOString(),
        entity_ids: [id], minimal_response: true, no_attributes: true }).catch(() => ({}));
      const n = ((r && r[id]) || []).length;
      if (n > 10) return n;
      await new Promise((res) => setTimeout(res, 2000));
    }
    return 0;
  }, FEELS);
  await need(tag + ': Verlauf der gefühlten Temperatur im Testhaus', hist > 10, hist);
  const r = await probe(page, WX, {}, tag === 'Desktop' ? 'desktop-dunkel' : 'handy-dunkel');
  await need(tag + ': Teststation ' + WX + ' im Testhaus (Mock)', r && !r.missing, r);
  await need(tag + ': Diagramm gezeichnet', r.chart, r);
  const c = r.chart;
  await check(tag + ': zwei Kurven (Temperatur + Gefühlt)', c.series.length === 2 && c.series[1].entity === FEELS && c.series[1].name === 'Gefühlt', c.series);
  await check(tag + ': gemessene Kurve aus derselben Quelle (Station)', c.series[0].entity === 'sensor.testwetter_temperature', c.series);
  await check(tag + ': zwei verschiedene Farben', c.colors.length === 2 && c.colors[0] !== c.colors[1], c.colors);
  await check(tag + ': beide gleichzeitig, kein Umschalter', c.switch === false && c.tabs === 0 && c.lines.length === 2, c);
  await check(tag + ': Legende Temperatur/Gefühlt', c.legend.join('|') === 'Temperatur|Gefühlt', c.legend);
  await check(tag + ': beide Kurven mit Verlauf (viele Punkte)', c.lines.every((n) => n > 10), c.lines);
  const rows = r.rows;
  await check(tag + ': Gefühlt als erste Zeile', label(rows, 'Gefühlt') === 0, rows);
  await check(tag + ': Taupunkt nach Luftfeuchtigkeit', label(rows, 'Taupunkt') === label(rows, 'Luftfeuchtigkeit') + 1 && label(rows, 'Taupunkt') > 0, rows);
  await check(tag + ': Windböen nach Wind', label(rows, 'Windböen') === label(rows, 'Wind') + 1 && label(rows, 'Windböen') > 0, rows);
  for (const w of ['Bewölkung', 'Regenwahrscheinlichkeit', 'Regen heute', 'Niederschlag', 'Sonneneinstrahlung']) {
    await check(tag + ': Zeile ' + w, label(rows, w) > -1, rows);
  }
  await check(tag + ': Werte mit Einheit (41 km/h, 0,4 mm/h, 180 W/m²)',
    rows.some((t) => /Windböen\s*41 km\/h/.test(t)) && rows.some((t) => /Niederschlag\s*0,4 mm\/h/.test(t)) && rows.some((t) => /180 W\/m²/.test(t)), rows);
  await check(tag + ': kein undefined/NaN', !/undefined|NaN/.test(r.text), r.text.slice(0, 200));

  if (tag === 'Desktop') {
    const off = await probe(page, WX, { weather_feels: false, weather_extras: false });
    await check('Studio aus: eine Kurve', off.chart && off.chart.series.length === 1 && off.chart.legend.length === 0, off.chart);
    await check('Studio aus: keine Zusatzzeilen', ['Gefühlt', 'Taupunkt', 'Windböen', 'Bewölkung', 'Sonneneinstrahlung'].every((w) => label(off.rows, w) < 0), off.rows);
    const plain = await page.evaluate((wx) => Object.keys(document.querySelector('home-assistant').hass.states)
      .filter((k) => k.startsWith('weather.') && k !== wx && document.querySelector('home-assistant').hass.states[k].attributes.apparent_temperature == null).sort()[0] || null, WX);
    if (plain) {
      const p = await probe(page, plain, {});
      await check('Wetter ohne Zusatzquellen: keine gefühlte Kurve', !p.chart || p.chart.series.length === 1, p.chart);
      await check('Wetter ohne Zusatzquellen: keine Zeile „Gefühlt“', label(p.rows, 'Gefühlt') < 0, p.rows);
    }
  }
  await check(tag + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 2));
}
await finish();
