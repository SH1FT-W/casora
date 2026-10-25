// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/casora-chart.js custom_components/casora/panel/casora-panel.js dev/casora_mock/wetter.py
// Issue #56: felt temperature as a second curve in the weather popup's temperature chart, the further values of the
// weather source ("Wetter & Warnungen") in the popup, and the Studio's choice of which curves go into the chart and
// which extra rows show. Test station weather.testwetter (dev/casora_mock/wetter.py): sensors by translation_key on
// its device, with 48 h history for temperature and felt temperature.
// Expected, desktop 1440 dark and phone 393 (WebKit):
//   1. Default: the chart draws two curves at once (no switch) with a legend "Temperatur"/"Gefühlt", the felt one
//      from the station's apparent_temperature sensor, both with history.
//   2. "Details" lists Gefühlt first, Taupunkt after Luftfeuchtigkeit, Windböen after Wind, then Bewölkung, both rain
//      chances, Niederschlag and Sonneneinstrahlung; no "undefined"/"NaN", no console errors.
//   3. Older Studio settings "Felt temperature" and "Extra values" off (weather_feels/weather_extras false): one
//      curve, no extra rows. Curves of other units (humidity, gusts) get their own chart behind the switch.
//   4. A weather entity without these sources keeps its popup (no felt curve, no extra rows).
//   5. Studio, Weather: "In the chart" offers the station's values; picking "Taupunkt" and removing the row
//      "Bewölkung", then saving: the real weather card of the desktop dashboard and of the phone dashboard
//      (casora_mobile_weather) draws three curves with the legend Temperatur/Gefühlt/Taupunkt and has no row
//      "Bewölkung". Writes both dashboards (test HA only) and restores them.
// WX56_BILDER=<folder>: pictures of the popup (chart and details) on desktop and phone, and of the Studio section.
import { open, casoraDashboards, dashboard, studio, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const WX = 'weather.testwetter';
const FEELS = 'sensor.testwetter_apparent_temperature';
const OUT = process.env.WX56_BILDER;
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const phone = all.find((d) => d.url === desk.url + '-mobile');

const cfgOf = async (u) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } finally { c.close(); } };
const saveCfg = async (u, cfg) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg }); } finally { c.close(); } };
const URLS = [desk.url].concat(phone ? [phone.url] : []);
const saved0 = {};
for (const u of URLS) saved0[u] = await cfgOf(u);
let changed = false;
atFinish(async () => { if (changed) for (const u of URLS) await saveCfg(u, saved0[u]); });

// Opens the casora_weather popup for `entity`: from a button-card made for it (`variables`), or with real = true
// from the dashboard's own weather card (its variables as the room / phone header pass them). Returns what it shows.
const probe = async (page, entity, variables, shotName, real) => {
  const r = await page.evaluate(async ([entity, variables, real]) => {
    const ha = document.querySelector('home-assistant');
    if (!ha.hass.states[entity]) return { missing: entity };
    const tpl = (b) => [].concat((b._config || {}).template || []);
    let el;
    if (real) {
      for (let i = 0; i < 40 && !el; i++) {
        el = window.__pierce('button-card').find((b) => tpl(b).includes('casora_weather') && (b._config || {}).entity === entity && b.getBoundingClientRect().width > 0);
        if (!el) await new Promise((res) => setTimeout(res, 250));
      }
      if (!el) return { missing: 'casora_weather card of ' + entity };
      window.__wx56el = null;
    } else {
      const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
      el = document.createElement('button-card');
      el.setConfig({ type: 'custom:button-card', template: 'casora_weather', entity, variables });
      el.hass = ha.hass; old.parentNode.insertBefore(el, old); window.__wx56el = el;
      await new Promise((res) => setTimeout(res, 800));
    }
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
    const pills = S() ? window.__pierce('.hw-mp', S()).map((e) => e.textContent.trim()) : [];
    return { chart, rows, pills, text: S() ? window.__pierce('.hw', S()).map((e) => e.textContent).join(' ') : '' };
  }, [entity, variables, !!real]);
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
const VIEWS = [
  ['Desktop', { width: 1440, height: 900, dark: true }, desk.url],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, dark: true }, phone && phone.url],
];

for (const [tag, opts, url] of VIEWS) {
  if (!url) { await check(tag + ': Handy-Dashboard vorhanden', tag === 'Desktop', all.map((d) => d.url)); continue; }
  const { page, browser } = await open(opts);
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
    await check('Studio alt aus: eine Kurve', off.chart && off.chart.series.length === 1 && off.chart.legend.length === 0, off.chart);
    await check('Studio alt aus: keine Zusatzzeilen', ['Gefühlt', 'Taupunkt', 'Windböen', 'Bewölkung', 'Sonneneinstrahlung'].every((w) => label(off.rows, w) < 0), off.rows);
    // Other units: one chart per unit, the switch between them (humidity from the weather entity's attribute).
    const units = await probe(page, WX, { weather_chart: ['temperature', 'dew_point', 'humidity', 'gust'], weather_extras: ['gust'] });
    await check('Auswahl mit Einheiten: Temperatur + Taupunkt zusammen', units.chart && units.chart.series.map((s) => s.name).join('|') === 'Temperatur|Taupunkt', units.chart);
    await check('Auswahl mit Einheiten: Umschalter Temperatur / Luftfeuchtigkeit / Windböen',
      ['Temperatur', 'Luftfeuchtigkeit', 'Windböen'].every((w) => units.pills.includes(w)), units.pills);
    await check('Auswahl Zeilen: nur Windböen', label(units.rows, 'Windböen') > -1 && ['Gefühlt', 'Taupunkt', 'Bewölkung'].every((w) => label(units.rows, w) < 0), units.rows);
    const plain = await page.evaluate((wx) => Object.keys(document.querySelector('home-assistant').hass.states)
      .filter((k) => k.startsWith('weather.') && k !== wx && document.querySelector('home-assistant').hass.states[k].attributes.apparent_temperature == null).sort()[0] || null, WX);
    if (plain) {
      const p = await probe(page, plain, {});
      await check('Wetter ohne Zusatzquellen: keine gefühlte Kurve', !p.chart || p.chart.series.length === 1, p.chart);
      await check('Wetter ohne Zusatzquellen: keine Zeile „Gefühlt“', label(p.rows, 'Gefühlt') < 0, p.rows);
    }
  }
  await check(tag + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 2));
  await browser.close().catch(() => {});
}

// ── 5. Studio: pick "Taupunkt" into the chart, remove the row "Bewölkung", save ─────────────────────
{
  const o = await open({ width: 1440, height: 900, dark: true });
  usePage(o.page);
  const pg = o.page;
  const H = (fn, a) => pg.evaluate(fn, a);
  const clickAt = async (r) => { if (!r) return false; await pg.mouse.click(r.x, r.y); await pg.waitForTimeout(900); return true; };
  const clickOpt = (re) => H((src) => { const rx = new RegExp(src, 'i');
    const e = window.__pierce('.combo-opt').find((x) => x.getClientRects().length && rx.test(x.textContent.replace('✓', '').trim()));
    if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, re.source).then(clickAt);
  const chips = (key) => H((key) => { const row = window.__pierce('.row').find((r) => r.dataset.key === key && r.getClientRects().length);
    return row ? [...row.querySelectorAll('.chip')].map((c) => ({ k: c.dataset.pick, t: c.firstChild.textContent, x: !!c.querySelector('button') })) : null; }, key);
  await studio(pg, desk.url);
  changed = true;
  // The station as the dashboard's weather source (every room, the phone header with it), older choices cleared.
  await H((wx) => { const p = window.__panel(), rooms = p._state.compact.rooms;
    rooms.forEach((r) => { r.variables = r.variables || {}; r.variables.weather_entity = wx;
      ['weather_chart', 'weather_extras', 'weather_feels'].forEach((k) => delete r.variables[k]); });
    p._mirrorToPair('weather_entity', wx, rooms);
    ['weather_chart', 'weather_extras', 'weather_feels'].forEach((k) => p._mirrorToPair(k, undefined, rooms));
    p._select({ group: 'rooms', key: 'Weather', label: 'Weather' }); p._renderForm(); }, WX);
  await pg.waitForTimeout(1500);
  const c0 = await chips('weather_chart');
  await need('Studio: Feld „Im Diagramm“ im Abschnitt Wetter', c0, c0);
  await check('Studio: Standard Temperatur + Gefühlt', c0.map((c) => c.k).join(',') === 'temperature,feels', c0);
  const r0 = await chips('weather_extras');
  await check('Studio: „Zusätzliche Werte“ zeigt alle Werte der Station', r0 && ['feels', 'dew_point', 'gust', 'cloud', 'solar'].every((k) => r0.some((c) => c.k === k)), r0);
  const input = (key) => H((key) => { const row = window.__pierce('.row').find((r) => r.dataset.key === key && r.getClientRects().length);
    const i = row && row.querySelector('.combo input'); if (!i) return null; i.scrollIntoView({ block: 'center' }); const b = i.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, key);
  await need('Studio: Liste zum Hinzufügen', await clickAt(await input('weather_chart')));
  const offered = await H(() => window.__pierce('.combo-opt').filter((x) => x.getClientRects().length).map((x) => x.textContent.trim()));
  await check('Studio: angeboten nur, was die Station hat (Taupunkt, Windböen, Sonneneinstrahlung; kein UV)',
    offered.some((t) => /Taupunkt|Dew point/.test(t)) && offered.some((t) => /Windböen|Wind gusts/.test(t)) && !offered.some((t) => /UV/.test(t)), offered);
  await need('Studio: „Taupunkt“ gewählt', await clickOpt(/^(Taupunkt|Dew point)$/));
  const c1 = await chips('weather_chart');
  await check('Studio: drei Kurven gewählt', c1 && c1.map((c) => c.k).join(',') === 'temperature,feels,dew_point', c1);
  const cloud = await H(() => { const row = window.__pierce('.row').find((r) => r.dataset.key === 'weather_extras' && r.getClientRects().length);
    const b = row && row.querySelector('.chip[data-pick="cloud"] button'); if (!b) return null; b.scrollIntoView({ block: 'center' });
    const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  await need('Studio: Zeile „Bewölkung“ entfernt', await clickAt(cloud));
  const r1 = await chips('weather_extras');
  await check('Studio: Bewölkung nicht mehr in den Zeilen', r1 && !r1.some((c) => c.k === 'cloud') && r1.some((c) => c.k === 'dew_point'), r1);
  if (OUT) {
    await H(() => { const row = window.__pierce('.row').find((r) => r.dataset.key === 'weather_chart' && r.getClientRects().length); if (row) row.scrollIntoView({ block: 'start' }); });
    await pg.waitForTimeout(500);
    await pg.screenshot({ path: `${OUT}/studio-wetter.png` });
  }
  const stored = await H(() => { const p = window.__panel(), r = p._state.compact.rooms[0].variables;
    return { chart: r.weather_chart, extras: r.weather_extras }; });
  await check('Studio: gespeichert als Listen', JSON.stringify(stored.chart) === '["temperature","feels","dew_point"]'
    && Array.isArray(stored.extras) && !stored.extras.includes('cloud'), stored);
  const saved = await H(async () => { const p = window.__panel(); await p._saveNow(); return !p._isDirty(); });
  await check('Studio: gespeichert', saved);
  if (phone) {
    const m = JSON.stringify(await cfgOf(phone.url));
    await check('Handy-Dashboard: Kopfzeile trägt die Auswahl', /"weather_chart":\["temperature","feels","dew_point"\]/.test(m) && /"weather_entity":"weather\.testwetter"/.test(m), m.length);
  }
  await o.browser.close().catch(() => {});

  for (const [tag, opts, url] of VIEWS) {
    if (!url) continue;
    const { page, browser } = await open(opts);
    usePage(page);
    await dashboard(page, url, 3);
    const r = await probe(page, WX, null, tag === 'Desktop' ? 'desktop-auswahl' : 'handy-auswahl', true);
    await need(tag + ': Wetterkarte des Dashboards', r && !r.missing && r.chart, r);
    await check(tag + ' (Dashboard): drei Kurven mit Legende Temperatur/Gefühlt/Taupunkt',
      r.chart.series.length === 3 && r.chart.legend.join('|') === 'Temperatur|Gefühlt|Taupunkt' && r.chart.lines.length === 3, r.chart);
    await check(tag + ' (Dashboard): keine Zeile „Bewölkung“, Taupunkt bleibt', label(r.rows, 'Bewölkung') < 0 && label(r.rows, 'Taupunkt') > -1, r.rows);
    await browser.close().catch(() => {});
  }
}
await finish();
