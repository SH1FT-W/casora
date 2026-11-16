// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/05-standard-medien.js#_casoraVent,V.comfort,V.read,V.sensorsOf,V.sec,V.series,V.chartCfg,V.pick custom_components/casora/scripts/casora-chart.js custom_components/casora/scripts/local/01-basis.js#casoraComfortLevel,casoraComfortWord,casoraComfortHighSince
// #202 („Popup angleichen“): the Raumklima popup said „Gut“ for every room without an airing need – a bathroom at
// 33 % · 24 °C too – while the climate badges rate by room type. Expected on Home (desktop, dark, readings faked in
// this browser only): a bathroom at 33 % says „Etwas trocken“ (orange), the bedroom at 22 °C „Warm“ (orange), the
// bathroom at 72 % for over an hour „Zu feucht“ (red), the living room „Optimal“ (owner 16.11.2026, was „Gut“), the kitchen keeps „Jetzt lüften“, and
// the stage says „Lüften empfohlen“ (with the airing hint) or „Lüften nicht nötig“ (without it) instead of
// „Raumluft gut“. A copy of qa-arbeit with a room climate tile on Home (deleted at the end). Screenshots with
// R893_SHOT=<folder>. The Verlauf: temperature and humidity of the room picked by a tap on its row, the range switch
// 24 Std. / 7 Tage / 30 Tage (7/30 from the long-term statistics), the room type's comfort range as dotted lines.
import { open, casoraDashboard, dashboard, stable, check, need, finish, usePage, fakeStates, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const SHOT = process.env.R893_SHOT || '';
const dash = await casoraDashboard((d) => d.url === 'qa-arbeit' || (d.config.views || []).some((v) => v.path === 'badezimmer'));
await need('Casora dashboard with a Badezimmer', dash && dash.config.views.some((v) => v.path === 'badezimmer'), dash && dash.url);
const URL = 'qa-raumklima-r893';
const D = JSON.parse(JSON.stringify(dash.config));
const sr = D.views[0].cards.find((x) => x.type === 'custom:casora-smart-row');
await need('Home with a tile row', sr);
sr.cards.unshift({ type: 'custom:button-card', template: 'casora_vent', name: 'Raumklima' });
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
if (!list.some((d) => d.url_path === URL)) await c.cmd({ type: 'lovelace/dashboards/create', url_path: URL, title: 'QA Raumklima', mode: 'storage', show_in_sidebar: false, require_admin: false });
await c.cmd({ type: 'lovelace/config/save', url_path: URL, config: D });
const real = ((await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === 'sensor.casora_lueften') || { attributes: {} }).attributes;
c.close();
atFinish(async () => {
  const c2 = await ws();
  const l2 = await c2.cmd({ type: 'lovelace/dashboards/list' });
  const d = l2.find((x) => x.url_path === URL);
  if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c2.close();
});
await need('sensor.casora_lueften knows the Badezimmer', (real.rooms || []).some((r) => r.k === 'badezimmer'), (real.rooms || []).map((r) => r.k));

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const row = (k, n, status, x) => ({ k, n, status, grund: '', rh: 50, t: 21.5, co2: null, voc: null, ah: 9.5, fenster: false, offen_min: null,
  ziel_min: 10, heizt: false, co2_krit: false, ...x });
const rooms = (hint) => [
  ...(hint ? [row('kuche', 'Küche', 'jetzt', { grund: 'CO₂ 1450 ppm', co2: 1450, rh: 48, t: 22.5 })] : []),
  row('badezimmer', 'Badezimmer', 'feucht', { grund: 'Feuchte 72 % · draußen feuchter', rh: 72, t: 23 }),
  row('bad_og', 'Bad OG', 'ok', { rh: 33, t: 24, fenster: null }),
  row('schlafzimmer', 'Schlafzimmer', 'ok', { rh: 50, t: 22 }),
  row('wohnzimmer', 'Wohnzimmer', 'ok', { rh: 48, t: 21.5 }),
];
const popup = () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const all = [];
  (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
  const probe = (host, css) => { const d = document.createElement('span'); d.style.color = css; host.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
  const rows = all.filter((n) => n.classList && n.classList.contains('hui-srow')).map((r) => {
    const end = [...r.querySelectorAll('.hui-end')].pop();
    const lab = r.querySelector('.hui-lab, .hui-t') || r.querySelector('div div');
    return { text: r.innerText.replace(/\s+/g, ' ').trim(), value: end ? end.textContent.trim() : '', color: end ? getComputedStyle(end).color : '',
      orange: probe(r, 'var(--casora-popup-ui-warn, #FF9F0A)'), red: probe(r, 'var(--casora-popup-ui-bad, #FF453A)'), lab: lab ? lab.textContent : '' };
  });
  const stage = all.find((n) => n.classList && (n.classList.contains('hui-dl-t') || n.classList.contains('hui-st-text')));
  return { rows, stage: stage ? stage.innerText.replace(/\s+/g, ' ').trim() : '' };
};
const tile = () => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_vent'))
  .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }).filter((b) => b.w > 0);

const run = async (pg, mobile, hint) => {
  usePage(pg);
  await dashboard(pg, URL + '/home');
  // The bathroom's humidity sensors read 72 % since 70 minutes (the duration rule); the backend's rows faked.
  const bath = await pg.evaluate(() => {
    const H = document.querySelector('home-assistant').hass;
    return window._casoraVent.sensorsOf ? window._casoraVent.sensorsOf(H, 'badezimmer') : { rh: [], t: [] };
  });
  const patch = { 'sensor.casora_lueften': { state: hint ? 'jetzt' : 'ok', attributes: { rooms: rooms(hint), aussen: { t: 8.5, rh: 88, ah: 7.6, pm25: 6 } } } };
  bath.rh.forEach((id) => { patch[id] = { state: '72', last_changed: ago(70) }; });
  bath.t.forEach((id) => { patch[id] = { state: '23', last_changed: ago(70) }; });
  await fakeStates(pg, patch, { sticky: true });
  const t = await stable(pg, tile);
  await need('room climate tile on Home', t.length, t);
  if (mobile) await pg.touchscreen.tap(t[0].x, t[0].y); else await pg.mouse.click(t[0].x, t[0].y);
  const p = await stable(pg, popup, undefined, { max: 9000, quiet: 1200 });
  return { p, bath };
};
const val = (p, name) => (p.rows.find((r) => r.text.startsWith(name + ' ')) || {});

const { page } = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
let { p, bath } = await run(page, false, true);
console.log('    rows', JSON.stringify(p && p.rows.map((r) => [r.text, r.value])), 'stage', p && p.stage, 'bath', JSON.stringify(bath));
await need('popup with room rows', p && p.rows.length >= 5, p);
await check('bathroom sensors found by area', bath.rh.length >= 1, bath);
await check(`Bad OG 33 % · 24 °C: „Etwas trocken“ (${val(p, 'Bad OG').value})`, val(p, 'Bad OG').value === 'Etwas trocken', val(p, 'Bad OG'));
await check('Bad OG: orange', val(p, 'Bad OG').color === val(p, 'Bad OG').orange, val(p, 'Bad OG'));
await check(`Schlafzimmer 22 °C: „Warm“ (${val(p, 'Schlafzimmer').value})`, val(p, 'Schlafzimmer').value === 'Warm', val(p, 'Schlafzimmer'));
await check(`Badezimmer 72 % for 70 min: „Zu feucht“ (${val(p, 'Badezimmer').value})`, val(p, 'Badezimmer').value === 'Zu feucht', val(p, 'Badezimmer'));
await check('bathroom sensors without the plant in it', !bath.rh.some((id) => /efeutute/.test(id)), bath);
await check(`Wohnzimmer: „Optimal“ (${val(p, 'Wohnzimmer').value})`, val(p, 'Wohnzimmer').value === 'Optimal', val(p, 'Wohnzimmer'));
await check(`Küche: the airing hint stays (${val(p, 'Küche').value})`, val(p, 'Küche').value === 'Jetzt lüften', val(p, 'Küche'));
await check(`stage with the airing hint: „Lüften empfohlen“ (${p.stage})`, /^Lüften empfohlen/.test(p.stage), p.stage);
if (SHOT) await page.screenshot({ path: SHOT + '/' + (process.env.R893_TAG || 'after') + '-desktop.png' });

// ── Verlauf: temperature and humidity of the picked room, 24 h / 7 / 30 days, the comfort range as dotted lines ──
const chart = () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const all = [];
  (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
  const ch = all.find((n) => n.localName === 'casora-chart');
  const slot = all.find((n) => n.classList && n.classList.contains('hp-chart-slot'));
  const head = slot && slot.previousElementSibling;
  const segs = all.filter((n) => n.hasAttribute && n.hasAttribute('data-casora-vspan')).map((n) => ({ sp: n.getAttribute('data-casora-vspan'), on: n.classList.contains('on') }));
  const sel = all.filter((n) => n.classList && n.classList.contains('hui-sel')).map((n) => n.innerText.split('\n')[0].trim());
  const c = ch && ch._c;
  return { title: head ? head.textContent.trim() : '', span: c && c.span, source: c && c.source, series: c ? c.series.map((x) => [x.entity, x.name, x.guides]) : [],
    lines: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('path').length : 0, guides: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('line.gd').length : 0, segs, sel };
};
const tapIn = async (pg, sel, mobile) => {
  const at = await pg.evaluate((s) => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const all = [];
    (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
    const n = all.find((x) => x.matches && x.matches(s));
    if (!n) return null;
    n.scrollIntoView({ block: 'center' });
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!at) return false;
  await pg.waitForTimeout(400);
  const at2 = await pg.evaluate((s) => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const all = [];
    (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
    const r = all.find((x) => x.matches && x.matches(s)).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (mobile) await pg.touchscreen.tap(at2.x, at2.y); else await pg.mouse.click(at2.x, at2.y);
  await pg.waitForTimeout(1500);
  return true;
};
let ch = await stable(page, chart, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.lines > 1 });
console.log('    chart', JSON.stringify(ch));
await check(`Verlauf of the first room: Küche (${ch && ch.title})`, ch && ch.title === 'Verlauf · Küche', ch);
await check('Verlauf: temperature and humidity, 24 h from the history', ch && ch.span === '24h' && ch.source === 'history'
  && ch.series.map((x) => x[1]).join(',') === 'Temperatur,Luftfeuchtigkeit', ch);
await check('Verlauf: a line is drawn, the comfort range as dotted lines', ch && ch.lines >= 1 && ch.guides === 2, ch);
await check('Verlauf: the range switch 24 Std. / 7 Tage / 30 Tage, 24 h on', ch && ch.segs.map((x) => x.sp).join(',') === '24h,7d,30d' && ch.segs[0].on, ch && ch.segs);
await check('Küche row lit', ch && ch.sel.includes('Küche'), ch && ch.sel);
await tapIn(page, '[data-casora-vroom="schlafzimmer"]');
ch = await stable(page, chart, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.title === 'Verlauf · Schlafzimmer' && v.lines > 1 });
await check(`tap Schlafzimmer: its Verlauf (${ch && ch.title})`, ch && ch.title === 'Verlauf · Schlafzimmer' && ch.sel.includes('Schlafzimmer'), ch);
const own = await page.evaluate(() => { const o = window._casoraVent.sensorsOf(document.querySelector('home-assistant').hass, 'schlafzimmer'); return o.t.concat(o.rh); });
await check('Schlafzimmer: sensors of its HA area, the bedroom range 17–20 °C', ch && ch.series.length === 2 && ch.series.every((x) => own.includes(x[0]))
  && JSON.stringify(ch.series[0][2]) === '[17,20]', { series: ch && ch.series, own });
if (SHOT) await page.screenshot({ path: SHOT + '/after-chart-desktop.png' });
await tapIn(page, '[data-casora-vspan="7d"]');
ch = await stable(page, chart, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.span === '7d' && v.lines > 1 });
await check(`7 Tage: long-term statistics (${ch && ch.span}/${ch && ch.source})`, ch && ch.span === '7d' && ch.source === 'stats' && ch.segs[1].on, ch);
await check('7 Tage: still the Schlafzimmer', ch && ch.title === 'Verlauf · Schlafzimmer', ch && ch.title);
await page.keyboard.press('Escape');

({ p } = await run(page, false, false));
await check(`stage without an airing hint, rooms off: „Lüften nicht nötig“ (${p && p.stage})`, p && /^Lüften nicht nötig/.test(p.stage), p && p.stage);
await check('no „Raumluft gut“ while rooms are off', p && !/Raumluft gut/.test(p.stage), p && p.stage);

// Phone: the rows, the Verlauf right under the stage, a tap on a row and on „30 Tage“ by finger.
const ph = await open({ width: 393, height: 852, mobile: true, dark: true, theme: 'Casora' });
await run(ph.page, true, true);
if (SHOT) {
  // The room rows in view (the stage and the Verlauf come first on the phone).
  await ph.page.evaluate(() => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const all = [];
    (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
    const r = all.find((x) => x.hasAttribute && x.hasAttribute('data-casora-vroom'));
    if (r) r.scrollIntoView({ block: 'start' });
  });
  await ph.page.waitForTimeout(800);
  await ph.page.screenshot({ path: SHOT + '/after-phone.png' });
}
await tapIn(ph.page, '[data-casora-vroom="badezimmer"]', true);
await tapIn(ph.page, '[data-casora-vspan="30d"]', true);
usePage(ph.page);
ch = await stable(ph.page, chart, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.span === '30d' && v.lines > 1 });
await check(`phone: finger taps pick the room and 30 Tage (${ch && ch.title} ${ch && ch.span})`, ch && ch.title === 'Verlauf · Badezimmer' && ch.span === '30d', ch);
if (SHOT) await ph.page.screenshot({ path: SHOT + '/after-chart-phone.png' });
await finish();
