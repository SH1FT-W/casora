// Screensaver gallery: every screensaver of 46-screensaver.js as a picture, without Home Assistant.
//   node dev/qa/schoner-galerie.mjs [--root <checkout>] [--out <dir>] [--size 1280x800] [--nur <regex>] [--lang de] [--check-calendar-filter]
// Draws each kind with the module's own examples (S.sample) at a fixed day and night time into <out>/<kind>-<tag>.png
// and the ten landscapes into land-<scene>.png. --root takes the module from another checkout (before / after).
// After those the situations of SCENES_EXTRA (a setting, own appointments, another time): <name>.png.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from '../e2e/harness.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(arg('root', here));
const out = path.resolve(arg('out', '/tmp/casora-qa/schoner'));
const [W, H] = arg('size', '1280x800').split('x').map(Number);
const only = arg('nur', '') ? new RegExp(arg('nur', '')) : null;
const lang = arg('lang', 'de');
const checkCalendarFilter = process.argv.includes('--check-calendar-filter');
fs.mkdirSync(out, { recursive: true });

const comp = path.join(root, 'custom_components/casora');
const mime = { '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
@font-face{font-family:"Inter";src:url('/casora_assets/fonts/inter-4.1-latin-var.woff2') format('woff2');font-weight:100 900;}
html,body{margin:0;height:100%;background:#000;}
:root{--primary-font-family:"Inter",-apple-system,system-ui,sans-serif;}
#box{position:fixed;inset:0;container-type:size;overflow:hidden;}
*{animation-play-state:paused !important;}
</style></head><body><div id="box"></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
  let f = null;
  if (u.pathname.startsWith('/casora_assets/')) f = path.join(comp, 'assets', decodeURIComponent(u.pathname.slice(15)));
  else if (u.pathname.startsWith('/scripts/')) f = path.join(comp, decodeURIComponent(u.pathname.slice(1)));
  if (f && fs.existsSync(f)) return route.fulfill({ contentType: mime[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  return route.fulfill({ status: 404, body: '' });
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://casora.test/');
// The translations of the dashboard, so another language than German shows its own words.
const i18n = path.join(comp, 'scripts/i18n', lang + '.json');
const dict = lang !== 'de' && fs.existsSync(i18n) ? JSON.parse(fs.readFileSync(i18n, 'utf8')) : null;
await page.evaluate(({ lang, dict }) => {
  const loc = { de: 'de-DE', en: 'en-GB', nl: 'nl-NL', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', nb: 'nb-NO' }[lang] || 'de-DE';
  window.casoraLocale = () => loc;
  const exact = (dict && (dict.exact || dict)) || {};
  window.casoraTr = (t) => exact[t] || t;
}, { lang, dict });
for (const f of ['scripts/local/06a-kalender-filter.js', 'scripts/local/06-kalender.js', 'scripts/local/46-screensaver.js']) {
  if (fs.existsSync(path.join(comp, f))) await page.addScriptTag({ url: '/' + f }).catch((e) => errors.push(f + ': ' + e));
}
const kinds = await page.evaluate(() => window._casoraSaver.KINDS.map((k) => k.id));
const scenes = await page.evaluate(() => window._casoraSaver.SCENES.map((s) => s.id));
const TIMES = { tag: '2026-11-20T13:42:00', abend: '2026-11-20T16:18:00', nacht: '2026-11-20T21:42:00' };
const rooms = ['living', 'kitchen', 'bedroom', 'dining'].filter((r) => fs.existsSync(path.join(comp, 'assets/rooms', r + '-demo.jpg')));

const shoot = async (name, kind, at, extra) => {
  if (only && !only.test(name)) return;
  await page.evaluate(({ kind, at, rooms, extra }) => {
    const S = window._casoraSaver, box = document.getElementById('box');
    if (window.__m) window.__m.destroy();
    const now = new Date(at), day = at.slice(0, 10);
    const night = now.getHours() >= 17 || now.getHours() < 7;
    const filterCheck = extra && extra.filterCheck;
    const filteredStart = +now + 60 * 60000;
    const base = { now, hass: { states: {}, themes: { darkMode: false }, locale: { language: document.documentElement.lang } },
      vars: Object.assign({ weather_entity: '' }, extra && extra.vars), sun: { rise: +new Date(day + 'T07:41:00'), set: +new Date(day + 'T16:34:00') },
      rooms: rooms.map((r) => ({ name: { living: 'Wohnzimmer', kitchen: 'Küche', bedroom: 'Schlafzimmer', dining: 'Esszimmer' }[r], url: '/casora_assets/rooms/' + r + '-demo' + (night ? '-night' : '') + '.jpg', ref: r })),
      wx: undefined, events: filterCheck ? [
        { title: filterCheck.hidden, start: filteredStart, end: filteredStart + 30 * 60000, allDay: false, cal: 'calendar.gallery' },
        { title: filterCheck.visible, start: filteredStart + 30 * 60000, end: filteredStart + 90 * 60000, allDay: false, cal: 'calendar.gallery' },
      ] : [], settings: filterCheck ? { calendar_filter: filterCheck.hidden } : {},
      hourly: [], daily: [], bins: extra && extra.bins ? extra.bins : [], media: undefined, energy: undefined, cams: [], bell: [], people: extra && extra.people ? extra.people : [] };
    if (extra && extra.scene != null) { const D = Date; base.now = new D(+now); }
    // Own appointments: [day from today, hour, minute, minutes long (0 = all day), title, calendar].
    if (extra && extra.events) {
      const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
      const at = (d, h, m) => +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + d, h, m);
      base.events = extra.events.map((e) => ({ title: e[4], start: at(e[0], e[1], e[2]), end: e[3] ? at(e[0], e[1], e[2]) + e[3] * 60000 : at(e[0] + 1, 0, 0), allDay: !e[3], cal: e[5] || 'a' }))
        .sort((x, y) => x.start - y.start);
      base.cals = ['a', 'b', 'c'];
    }
    window.__m = S.mount(box, kind, { context: () => base, sample: true, every: 3600000 });
  }, { kind, at: TIMES[at] || at, rooms, extra: extra || null });
  await page.waitForTimeout(350);
  if (extra && extra.filterCheck) {
    const text = await page.locator('#box').innerText();
    assert.ok(!text.includes(extra.filterCheck.hidden), `${kind} must hide the filtered title`);
    assert.ok(text.includes(extra.filterCheck.visible), `${kind} must keep the unfiltered title`);
  }
  await page.screenshot({ path: path.join(out, name + '.png') });
  // Boxes whose content is cut off at the bottom or sticks out of the picture (a one-line title cut with … is meant).
  const cut = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight, bad = [];
    document.querySelectorAll('#box .cs-kd, #box .cs-ev, #box .cs-col, #box .cs-li').forEach((el) => { if (el.scrollHeight > el.clientHeight + 1) bad.push(el.className + ' cut ' + (el.scrollHeight - el.clientHeight) + 'px'); });
    document.querySelectorAll('#box .cs-ev, #box .cs-sum, #box .cs-km, #box .cs-kc, #box .cs-clock, #box .cs-tick, #box .cs-done').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)) bad.push(el.className + ' outside');
    });
    const a = document.querySelector('#box .cs-kt'), b = document.querySelector('#box .cs-kc');
    if (a && b) { const x = a.lastElementChild.getBoundingClientRect(), y = b.getBoundingClientRect(); if (x.right > y.left && x.bottom > y.top && x.top < y.bottom) bad.push('title runs into the clock'); }
    return bad;
  });
  console.log(name + (cut.length ? '  !! ' + cut.join('; ') : ''));
};

for (const k of kinds) for (const t of k === 'himmel' ? ['tag', 'abend', 'nacht'] : ['tag', 'nacht']) await shoot(k + '-' + t, k, t);
// Situations the examples do not show: [name, kind, time (a TIMES key or a local ISO time), { vars, events }].
const TWO = { casora_screensaver_calendar_range: '2w' };
const FULL = [[-3, 9, 0, 45, 'Zahnarzt', 'b'], [-1, 19, 0, 90, 'Elternabend', 'c'], [0, 8, 30, 45, 'Arzttermin', 'b'], [0, 12, 30, 60, 'Mittagessen'], [0, 18, 30, 90, 'Einkaufen'], [0, 20, 45, 75, 'Kino', 'c'],
  [1, 9, 0, 60, 'Wochenmarkt'], [1, 14, 0, 105, 'Fußballtraining', 'c'], [2, 11, 0, 120, 'Brunch bei Oma'], [4, 0, 0, 0, 'Papiertonne', 'b'], [4, 16, 30, 45, 'Schwimmkurs', 'c'], [4, 18, 0, 60, 'Yoga'],
  [4, 19, 30, 45, 'Elterngespräch', 'c'], [4, 20, 15, 90, 'Chorprobe'], [5, 10, 15, 45, 'Friseur', 'b'], [7, 0, 0, 0, 'Geburtstag Oma'], [7, 19, 0, 120, 'Abendessen', 'c'], [8, 0, 0, 0, 'Ausflug'], [11, 15, 0, 60, 'Kinderarzt', 'b']];
const RUN = [[0, 7, 45, 300, 'Schule', 'c'], [0, 15, 0, 45, 'Schwimmkurs', 'c'], [0, 17, 0, 60, 'Hausaufgaben'], [0, 18, 45, 45, 'Musikschule', 'c'], [0, 20, 0, 75, 'Abendessen mit Oma'],
  [1, 9, 0, 45, 'Zahnarzt', 'b'], [1, 10, 30, 60, 'Wochenmarkt'], [2, 11, 0, 120, 'Brunch']];
const CLOSE = [[0, 7, 0, 45, 'Frühsport'], [0, 8, 30, 45, 'Arzttermin', 'b'], [0, 9, 0, 30, 'Elterngespräch', 'c'], [0, 9, 45, 60, 'Wochenmarkt'], [0, 12, 30, 60, 'Mittagessen'],
  [0, 15, 0, 45, 'Kinderarzt', 'b'], [0, 18, 30, 90, 'Einkaufen'], [0, 20, 45, 75, 'Kino', 'c']];
const SCENES_EXTRA = [
  ['kalender-voll-tag', 'kalender', 'tag', { events: FULL }],
  ['kalender-2wochen-tag', 'kalender', 'tag', { vars: TWO, events: FULL }],
  ['kalender-2wochen-nacht', 'kalender', 'nacht', { vars: TWO, events: FULL }],
  ['kalender-2wochen-monatswechsel', 'kalender', '2026-11-30T09:12:00', { vars: TWO, events: FULL }],
  // Day line: an appointment is running; several close together; the day is over and tomorrow leads; nothing at all.
  ['linie-laeuft-tag', 'linie', '2026-11-20T15:20:00', { events: RUN }],
  ['linie-laeuft-abend', 'linie', '2026-11-20T19:12:00', { events: RUN }],
  ['linie-dicht', 'linie', '2026-11-20T08:10:00', { events: CLOSE }],
  ['linie-sehr-dicht', 'linie', '2026-11-20T08:10:00', { events: CLOSE.concat([[0, 9, 15, 30, 'Paket abholen'], [0, 10, 0, 30, 'Anruf Schule', 'b'], [0, 11, 15, 45, 'Apotheke']]) }],
  ['linie-tag-vorbei', 'linie', '2026-11-20T22:40:00', { events: RUN }],
  ['linie-leer', 'linie', 'tag', { events: [[0, 0, 0, 0, 'Feiertag']] }],
];
for (const [name, kind, at, extra] of SCENES_EXTRA) await shoot(name, kind, at, extra);
if (checkCalendarFilter) {
  for (const k of ['linie', 'woche', 'kalender']) for (const t of ['tag', 'nacht']) {
    await shoot(k + '-' + t + '-filter', k, t, { filterCheck: { hidden: 'Filtered fixture event', visible: 'Visible fixture event' } });
  }
}
// Every landscape, drawn directly (the screensaver shows one after the other by the clock).
for (const id of scenes) {
  if (only && !only.test('land-' + id)) continue;
  await page.evaluate(({ id }) => {
    const S = window._casoraSaver, box = document.getElementById('box');
    if (window.__m) { window.__m.destroy(); window.__m = null; }
    box.innerHTML = S.landSvg(S.SCENES.find((s) => s.id === id), 1312, 820).replace('<svg ', '<svg style="position:absolute;inset:0;width:100%;height:100%" ');
  }, { id });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'land-' + id + '.png') });
  console.log('land-' + id);
}
if (errors.length) console.log('ERRORS\n' + errors.join('\n'));
await browser.close();
