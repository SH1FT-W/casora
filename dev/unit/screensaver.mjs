// @deckt: custom_components/casora/scripts/local/46-screensaver.js#_casoraSaver
// Screensavers for wall tablets (46-screensaver.js): the time as people say it in nine languages, the sun's share of
// the day and the sky for it, the drawn landscapes, which minutes count, and what each screensaver draws.
//   node dev/unit/screensaver.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadCalendars } from './lib/calendars_block.mjs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
loadCalendars(win);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;
assert.ok(S, 'module loads');
assert.equal(S._booted, undefined, 'does not start without a document');

// The time as people say it.
const say = (l, h, m) => S.words(l, h, m).map((x) => x.t).join(' ');
assert.equal(say('de', 16, 42), 'Es ist zwanzig vor fünf');
assert.equal(say('de', 16, 0), 'Es ist vier Uhr');
assert.equal(say('de', 13, 0), 'Es ist ein Uhr');
assert.equal(say('de', 16, 25), 'Es ist fünf vor halb fünf');
assert.equal(say('de', 16, 30), 'Es ist halb fünf');
assert.equal(say('de', 23, 58), 'Es ist zwölf Uhr', 'rounds up over the hour, and over midnight');
assert.equal(say('en', 16, 42), 'It is twenty to five');
assert.equal(say('en', 9, 15), 'It is quarter past nine');
assert.equal(say('en', 12, 0), 'It is twelve o’clock');
assert.equal(say('nl', 15, 20), 'Het is tien voor half vier');
assert.equal(say('nl', 15, 45), 'Het is kwart voor vier');
assert.equal(say('nb', 15, 20), 'Klokken er ti på halv fire');
assert.equal(say('nb', 15, 0), 'Klokken er tre');
assert.equal(say('es', 15, 5), 'Son las tres y cinco');
assert.equal(say('es', 12, 40), 'Es la una menos veinte');
assert.equal(say('fr', 15, 15), 'Il est trois heures et quart');
assert.equal(say('fr', 12, 45), 'Il est une heure moins le quart');
assert.equal(say('it', 15, 30), 'Sono le tre e mezza');
assert.equal(say('it', 13, 0), 'È l’una in punto');
assert.equal(say('pt', 15, 35), 'São quatro menos vinte e cinco');
assert.equal(say('pl', 15, 5), 'Jest pięć po trzeciej');
assert.equal(say('pl', 15, 30), 'Jest wpół do czwartej');
assert.equal(say('pl', 15, 50), 'Jest za dziesięć czwarta');
assert.equal(say('xx', 9, 15), 'It is quarter past nine', 'unknown language: English');
for (const l of ['de', 'en', 'nl', 'nb', 'es', 'fr', 'it', 'pt', 'pl']) for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m++) {
  const w = S.words(l, h, m);
  assert.ok(w.length >= 2 && w.length <= 3 && w.every((x) => x.t && !/undefined/.test(x.t)) && w.filter((x) => x.acc).length === 1, l + ' ' + h + ':' + m);
}

// Sun and sky.
const rise = Date.parse('2026-11-10T07:22:00'), set = Date.parse('2026-11-10T17:05:00');
assert.ok(Math.abs(S.dayShare(Date.parse('2026-11-10T16:42:00'), rise, set) - 0.9605) < 0.001);
assert.equal(S.dayShare(Date.parse('2026-11-10T06:00:00'), rise, set), null, 'before sunrise: night');
assert.equal(S.dayShare(Date.parse('2026-11-10T18:00:00'), rise, set), null, 'after sunset: night');
assert.equal(S.sky(null).length, 4);
assert.notDeepEqual(S.sky(0.5), S.sky(0.96), 'noon and evening differ');
assert.deepEqual(S.sky(2), S.sky(1), 'never past the last colours');
// sun.sun gives the coming times: by day today's sunrise was a day earlier.
const sun = (state, r, s) => ({ states: { 'sun.sun': { state, attributes: { next_rising: r, next_setting: s } } } });
let t = S.sunTimes(sun('above_horizon', '2026-11-11T07:24:00', '2026-11-10T17:05:00'), new Date('2026-11-10T16:42:00'));
assert.ok(S.dayShare(new Date('2026-11-10T16:42:00'), t.rise, t.set) > 0.9, 'by day');
t = S.sunTimes(sun('below_horizon', '2026-11-11T07:24:00', '2026-11-11T17:03:00'), new Date('2026-11-10T22:00:00'));
assert.equal(S.dayShare(new Date('2026-11-10T22:00:00'), t.rise, t.set), null, 'evening: night');
assert.equal(S.sunTimes({ states: {} }, new Date()), null, 'no sun entity');

// Drawn landscapes: ten, each a closed picture, the same every time.
assert.equal(S.SCENES.length, 10);
for (const sc of S.SCENES) {
  const a = S.landSvg(sc, 1180, 820);
  assert.ok(a.startsWith('<svg') && a.endsWith('</svg>') && !/NaN|undefined/.test(a), sc.id);
  assert.equal(a, S.landSvg(sc, 1180, 820), sc.id + ' is drawn the same every time');
}

// Minutes and settings.
assert.deepEqual([S.minutes(''), S.minutes('0'), S.minutes('5'), S.minutes('999'), S.minutes('x')], [0, 0, 5, 240, 0]);
const cfg = { views: [{ title: 'Zuhause', cards: [{ variables: { casora_screensaver: '5', weather_entity: 'weather.home' } }] },
  { title: 'Küche', cards: [{ variables: { casora_screensaver_kind: 'wort', image: 'kitchen-demo' } }] }] };
assert.deepEqual({ ...S.vars(cfg) }, { casora_screensaver: '5', casora_screensaver_kind: 'wort', weather_entity: 'weather.home' });
assert.deepEqual({ ...S.vars(null) }, {});

// What is drawn.
const hass = { locale: { time_format: '24' }, themes: { darkMode: true }, states: { 'weather.home': { state: 'partlycloudy', attributes: { temperature: 11.4 } } } };
const ctx = (o) => S.context({ hass, now: new Date('2026-11-10T16:42:00'), vars: { weather_entity: 'weather.home' }, sun: { rise, set }, rooms: [], ...o });
assert.equal(S.kindAt('quatsch', new Date()), 'himmel', 'unknown kind: the first');
assert.ok(S.KINDS.map((k) => k.id).includes(S.kindAt('mix', new Date())));
let h = S.html('himmel', ctx());
assert.ok(/16:42/.test(h) && /11°/.test(h) && /cs-sun/.test(h) && /07:22/.test(h) && /17:05/.test(h) && /Noch 23 Min\. Tageslicht/.test(h), 'sky: time, weather, sun on its path, rise and set');
// The big clock as the dashboard's clock (#191): the HA user's time format, else the dashboard language.
const clockOf = (time_format, lang) => {
  win.casoraLocale = () => lang;
  const out = S.html('himmel', S.context({ hass: { ...hass, locale: { time_format } }, now: new Date('2026-11-10T16:42:00'), sun: null, rooms: [] }));
  delete win.casoraLocale;
  return (out.match(/class="cs-time">([^<]*)</) || [])[1];
};
assert.equal(clockOf('language', 'en-US'), '4:42', 'English, no own format: 12 hours like the top bar');
assert.equal(clockOf('system', 'en-US'), '4:42', 'format "system": the language decides');
assert.equal(clockOf('language', 'de-DE'), '16:42');
assert.equal(clockOf('24', 'en-US'), '16:42', 'own 24-hour format wins');
assert.equal(clockOf('12', 'de-DE'), '4:42', 'own 12-hour format wins');
assert.ok(/class="cs-time">4:42</.test(S.html('himmel', S.context({ hass: { ...hass, locale: { time_format: 'language', language: 'en' } }, now: new Date('2026-11-10T16:42:00'), sun: null, rooms: [] }))),
  'the HA user language first, as the dashboard clock (use_12h in the templates)');
h = S.html('himmel', ctx({ now: new Date('2026-11-10T22:00:00') }));
assert.ok(!/cs-sun/.test(h) && /bis Sonnenaufgang/.test(h), 'sky at night: no sun, the middle counts to sunrise (#229)');
h = S.html('himmel', ctx({ sun: null, wx: null }));
assert.ok(/16:42/.test(h) && !/cs-arc/.test(h) && !/cs-wx/.test(h), 'sky without sun entity and weather: the time alone');
h = S.html('land', ctx());
assert.ok(/<svg class="cs-bg"/.test(h) && /Landschaften/.test(h) && !/Polarlicht|Winternacht/.test(h), 'landscape by day: no night scene');
h = S.html('land', ctx({ now: new Date('2026-11-10T22:00:00') }));
assert.ok(/Polarlicht|Winternacht/.test(h), 'landscape by night: a night scene');
h = S.html('fotos', ctx({ rooms: [{ name: 'Küche', url: '/casora_assets/rooms/kitchen-demo.jpg' }] }));
assert.ok(/kitchen-demo\.jpg/.test(h) && /Küche/.test(h), 'photos: the room photo with its name');
assert.ok(/<svg class="cs-bg"/.test(S.html('fotos', ctx())), 'photos without a room photo: a landscape instead');
h = S.html('wort', ctx());
assert.ok(/zwanzig vor/.test(h) || /twenty to/.test(h), 'word clock');
assert.ok(/cs-dark/.test(h), 'dark design by night theme');
h = S.html('fotos', ctx({ rooms: [{ name: '<b>x</b>', url: 'javascript:"x' }] }));
assert.ok(!/<b>x<\/b>/.test(h) && !/"x/.test(h.replace(/&quot;/g, '')), 'names and addresses are escaped');

// The six that show the house's data. Everything is handed in, nothing is asked for.
const at = (x) => Date.parse('2026-11-10T' + x);
const events = [
  { title: 'Zahnarzt', start: at('09:00:00'), end: at('09:45:00'), allDay: false },
  { title: 'Elternabend <i>', start: at('18:30:00'), end: at('20:00:00'), allDay: false },
  { title: 'Sperrmüll', start: Date.parse('2026-11-12T00:00:00'), end: null, allDay: true },
];
const daily = [0, 1, 2, 3, 4].map((i) => ({ datetime: new Date(at('12:00:00') + i * 86400000).toISOString(), condition: 'rainy', temperature: 10 + i, templow: 3 + i }));
const hourly = Array.from({ length: 24 }, (_, i) => ({ datetime: new Date(at('17:00:00') + i * 3600000).toISOString(), temperature: 8 + Math.sin(i / 4) * 4, precipitation: i === 3 ? 1.2 : 0 }));
h = S.html('wetter', ctx({ hourly, daily }));
assert.ok(/data-kind="wetter"/.test(h) && /cs-curve/.test(h) && /<rect /.test(h) && (h.match(/cs-wd"/g) || []).length === 5 && /11°/.test(h), 'weather: curve, rain, five days');
assert.ok(/data-kind="wetter"/.test(S.html('wetter', ctx({ hourly: [], daily: [] }))) && !/cs-curve/.test(S.html('wetter', ctx({ hourly: [], daily: [] }))), 'weather without forecast: now alone');
assert.ok(/data-kind="himmel"/.test(S.html('wetter', ctx({ wx: null }))), 'no weather entity: the sky');
// The day line shows three hours back and fifteen ahead (#233, more in screensaver_dayline.mjs).
h = S.html('linie', ctx({ events, now: new Date('2026-11-10T11:00:00') }));
assert.ok(/Zahnarzt/.test(h) && /cs-past/.test(h) && /cs-lead/.test(h) && /in 7 Std\. 30 Min\./.test(h) && /cs-now/.test(h), 'day line: past, next, now');
assert.ok(!/<i>"|Elternabend <i>/.test(h) && /Elternabend &lt;i&gt;/.test(h), 'appointment titles are escaped');
h = S.html('linie', ctx({ events: [] }));
assert.ok(/Heute keine Termine/.test(h) && !/cs-ev/.test(h), 'day line without appointments');
h = S.html('woche', ctx({ events, daily, bins: [{ label: 'Restmüll', days: 1 }] }));
assert.ok((h.match(/class="cs-col[ "]/g) || []).length === 7 && /cs-today/.test(h) && /Restmüll/.test(h) && /ganztägig/.test(h) && /2 Termine · 1 Abholung/.test(h) && !/Zahnarzt/.test(h), 'week: seven days, events, waste; what is over today is gone');
// #171: a waste integration gives the same pickup as a calendar event and as a sensor; it shows once.
h = S.html('woche', ctx({ events: [{ title: ' gelbe Tonne', start: Date.parse('2026-11-11T00:00:00'), end: null, allDay: true }], daily, bins: [{ label: 'Gelbe Tonne', days: 1 }] }));
assert.ok((h.match(/elbe Tonne/g) || []).length === 1 && /Abholung</.test(h) && /0 Termine · 1 Abholung/.test(h), 'week: a pickup also in a calendar shows once (#171)');
h = S.html('woche', ctx({ events: [{ title: 'Gelbe Tonne', start: Date.parse('2026-11-13T00:00:00'), end: null, allDay: true }], daily, bins: [{ label: 'Gelbe Tonne', days: 1 }] }));
assert.ok((h.match(/Gelbe Tonne/g) || []).length === 2, 'week: the same name on another day stays');
const media = { title: 'Song "A"', artist: 'Band', where: 'Wohnzimmer', cover: '/api/x.jpg', dur: 200, pos: 50 };
h = S.html('musik', ctx({ media }));
assert.ok(/data-kind="musik"/.test(h) && /Song &quot;A&quot;/.test(h) && /width:25\.0%/.test(h) && /0:50/.test(h) && /3:20/.test(h), 'music: title, progress');
assert.ok(/data-kind="himmel"/.test(S.html('musik', ctx({ media: null }))), 'nothing playing: the sky');
// Image addresses from media/camera attributes stay inside their CSS url("…"): a quote must not end the string
// (escaped HTML is decoded in the attribute, so &quot; alone would let "); position:fixed … through).
const evil = 'https://x/a.jpg?authSig=1&"); position:fixed; inset:0; background-image:url("https://evil/b.png';
const styles = (html) => [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
const outside = (html) => styles(html).map((st) => st.replace(/url\("(?:[^"\\]|\\.)*"\)/g, 'url()')).join(' ');
for (const [kind, o] of [['musik', { media: { ...media, cover: evil } }], ['fotos', { rooms: [{ name: 'K', url: evil }] }],
  ['kameras', { cams: [{ id: 'camera.a', name: 'A', url: evil }] }]]) {
  const out = outside(S.html(kind, ctx(o)));
  assert.ok(!/position:fixed|evil/.test(out), kind + ': image address stays inside url(): ' + out);
}
h = S.html('energie', ctx({ energy: { solar: 3200, grid: -1200, battery: -500, soc: 64, hasSolar: true, hasBattery: true, house: 1500 } }));
assert.ok(/3,2 kW|3\.2 kW/.test(h) && /ins Netz/.test(h) && /Akku lädt/.test(h) && /64 %/.test(h) && /100 %/.test(h), 'energy: sun, feed-in, battery, all own power');
h = S.html('energie', ctx({ energy: { solar: null, grid: 800, battery: null, soc: null, hasSolar: false, hasBattery: false, house: 800 } }));
assert.ok(/aus dem Netz/.test(h) && !/cs-sun|cs-bat/.test(h) && /0 %/.test(h), 'energy with the grid alone');
assert.ok(/data-kind="himmel"/.test(S.html('energie', ctx({ energy: null }))), 'energy not set up: the sky');
h = S.html('ruhe', ctx({ bell: [], people: [{ name: 'anna', home: true }, { name: 'ben', home: false }] }));
assert.ok(/Alles ruhig/.test(h) && /Nichts braucht dich/.test(h) && /cs-away/.test(h) && !/cs-right/.test(h), 'house at rest: nothing to do');
h = S.html('ruhe', ctx({ bell: [{ label: 'Fenster offen', sub: 'Bad', tone: 'warn' }, { label: 'Update', sub: '', tone: 'info' }], people: [] }));
assert.ok(/Fast alles ruhig/.test(h) && /Eine Sache braucht dich/.test(h) && /Fenster offen/.test(h), 'house at rest: one thing asks for someone');
// What the helpers read from Home Assistant.
const hs = { entities: { 'calendar.work': { platform: 'workday' }, 'calendar.hidden': { hidden: true } }, states: {
  'calendar.family': {}, 'calendar.work': {}, 'calendar.hidden': {},
  'media_player.a': { state: 'playing', last_updated: '2026-11-10T10:00:00', attributes: { media_title: 'A', friendly_name: 'Bad' } },
  'media_player.b': { state: 'paused', last_updated: '2026-11-10T11:00:00', attributes: { media_title: 'B' } },
  'person.x': { state: 'home', attributes: { friendly_name: 'X' } } } };
assert.deepEqual(Array.from(S.calendars(hs)), ['calendar.family'], 'calendars: no hidden ones, not the Workday one');
assert.equal(S.playing(hs).title, 'A', 'playing: the one that plays');
assert.equal(S.playing({ states: {} }), null);
assert.deepEqual(JSON.parse(JSON.stringify(S.people(hs))), [{ name: 'X', home: true }]);
assert.equal(S.energy(hs), null, 'energy: nothing without the energy helpers');
win.casoraEnergyHouse = () => ({ solar: ['sensor.pv'], grid: ['sensor.grid'], battery: [] });
const he = { states: { 'sensor.pv': { state: '2.5', attributes: { unit_of_measurement: 'kW' } }, 'sensor.grid': { state: '-700', attributes: { unit_of_measurement: 'W' } } } };
assert.deepEqual(JSON.parse(JSON.stringify(S.energy(he))), { solar: 2500, grid: -700, battery: null, soc: null, hasSolar: true, hasBattery: false, house: 1800 });
delete win.casoraEnergyHouse;
assert.equal(S.KINDS.length, 12, 'twelve screensavers');
// A preview shows an example where the house has nothing; what the house has stays.
const bare = S.sample(ctx({ wx: null, hourly: [], daily: [], events: [], bins: [], media: null, energy: null, bell: [], people: [] }));
for (const k of ['wetter', 'linie', 'woche', 'musik', 'energie', 'kameras', 'kalender']) assert.ok(new RegExp('data-kind="' + k + '"').test(S.html(k, bare)), 'example for ' + k);
assert.ok(/Golden Hour/.test(S.html('musik', bare)) && /Arzttermin|Einkaufen/.test(S.html('linie', bare)));
assert.equal(S.sample(ctx({ media, hourly, daily, events, energy: null })).media.title, 'Song "A"', 'real data wins over the example');

assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'46-screensaver'"), 'module in MODULES');

// Room photos (owner 11.11.2026). The Studio has no casoraPhotoUrl: it hands its own resolver (o.url), else the preview
// had no photo and drew a landscape. Picked photos (casora_screensaver_photos, the day photo's name) narrow the list.
const pcfg = { views: [['Bad', 'bad', 'bad-night'], ['Flur', 'flur'], ['Küche', 'kueche'], ['Leer']].map(([title, image, image_night]) =>
  ({ title, cards: [{ variables: { image, image_night, casora_screensaver_photos: title === 'Flur' ? ['bad', 'kueche'] : undefined } }] })) };
const J = (x) => JSON.parse(JSON.stringify(x));   // arrays from the vm context
const url = (ref) => '/p/' + ref + '.jpg';
assert.deepEqual(J(S.rooms(pcfg, null, false)), [], 'no resolver, no photos (the Studio before the fix)');
assert.deepEqual(J(S.rooms(pcfg, null, false, { url }).map((r) => r.url)), ['/p/bad.jpg', '/p/flur.jpg', '/p/kueche.jpg']);
assert.deepEqual(J(S.rooms(pcfg, null, true, { url }).map((r) => r.url)), ['/p/bad-night.jpg', '/p/flur.jpg', '/p/kueche.jpg'], 'dark: the night photo');
assert.deepEqual(J(S.rooms(pcfg, null, false, { url, only: ['kueche', 'bad'] }).map((r) => r.name)), ['Bad', 'Küche'], 'only the picked ones');
assert.equal(S.rooms(pcfg, null, false, { url, only: [] }).length, 3, 'none picked: all');
assert.deepEqual(J(S.vars(pcfg).casora_screensaver_photos), ['bad', 'kueche'], 'the pick is a dashboard setting');
const cx = S.context({ hass: { states: {} }, config: pcfg, vars: S.vars(pcfg), photoUrl: url, kind: 'fotos', now: new Date(2026, 10, 11, 12, 0) });
assert.deepEqual(J(cx.rooms.map((r) => r.name)), ['Bad', 'Küche'], 'the context passes resolver and pick on');

// The preview sits in the Studio's shadow root: no class of a screensaver may share a name with a Studio rule (the
// time bar was „.cs-bar“, the Studio's save bar, and showed as a white box over the photo).
const own = new Set();
for (const m of read('custom_components/casora/scripts/local/46-screensaver.js').matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach((c) => c && !/[^\w-]/.test(c) && own.add(c));
const studio = ['casora-panel.js', 'casora-panel-settings.js', 'casora-panel-b.js', 'casora-panel-b-ux.js'].map((f) => read('custom_components/casora/panel/' + f)).join('\n');
const clash = [...own].filter((c) => c !== 'cs-sv' && new RegExp('\\.' + c + '(?![\\w-])[^;(){}"\'=]*\\{').test(studio));
assert.deepEqual(clash, [], 'saver classes also styled by the Studio');
console.log('ok screensaver');

// ── Reading distance (owner, 20.11.2026: the screensavers looked cheap, the texts were tiny) ─────────────────────
// A wall tablet is read from across the room: no text under 19 units (a unit = 1/820 of the shorter side).
{
  const sizes = [...S.CSS.matchAll(/font-size:([\d.]+)cqmin/g)].map((m) => Number(m[1]) * 8.2);
  assert.ok(sizes.length > 60, 'the sizes are read from the stylesheet');
  const small = sizes.filter((n) => n < 18.99);
  assert.deepEqual(small, [], 'no text smaller than 19 units');
  // Every screensaver has one thing that is big (the time, the temperature, the words, the title, the month).
  for (const sel of ['.cs-top .cs-time', '.sv-bar .cs-time', '.cs-words', '.cs-wnow b', '.cs-sum b', '.cs-left .cs-time', '.cs-km', '.cs-meta h2']) {
    const m = S.CSS.match(new RegExp(sel.replace(/[.\s]/g, (c) => (c === '.' ? '\\.' : '\\s')) + '\\{[^}]*?font-size:([\\d.]+)cqmin'));
    assert.ok(m && Number(m[1]) * 8.2 >= 75, sel + ' is big');
  }
  // The grounds of their own are light by day and deep by night, and deep with a dark theme.
  const day = new Date('2026-11-10T13:00:00'), night = new Date('2026-11-10T22:00:00');
  const sunT = { rise: Date.parse('2026-11-10T07:22:00'), set: Date.parse('2026-11-10T17:05:00') };
  const base = (now, dark) => ({ now, dark: !!dark, sun: sunT, hass: null, vars: {}, wx: { temp: 11, text: 'Sonnig', icon: '/casora_assets/weather/clear-day.svg' }, rooms: [], cals: [], cams: [],
    hourly: [], daily: [], events: [], bins: [], bell: [], people: [], media: null, energy: { solar: 900, grid: -200, battery: 0, soc: null, hasSolar: true, hasBattery: false, house: 700 } });
  for (const k of ['wort', 'linie', 'woche', 'energie', 'ruhe', 'kalender']) {
    assert.match(S.html(k, base(day)), new RegExp('class="cs-sv cs-' + k + ' cs-light'), k + ': light by day');
    assert.match(S.html(k, base(night)), new RegExp('class="cs-sv cs-' + k + ' cs-dark'), k + ': deep by night');
    assert.match(S.html(k, base(day, true)), new RegExp('class="cs-sv cs-' + k + ' cs-dark'), k + ': deep with a dark theme');
  }
  assert.ok(!/cs-light/.test(S.html('wetter', base(day))) && /cs-wetter cs-dark/.test(S.html('wetter', base(night))), 'weather: the sky by day, deep by night');
  assert.match(S.html('wetter', Object.assign(base(day), { wx: { temp: 6, text: 'Regen', icon: '/casora_assets/weather/rain-fill.svg' } })), /cs-wetter cs-grey/, 'weather under clouds: a greyer sky');
  // The house at rest stands in the middle while nothing asks for anyone.
  assert.match(S.html('ruhe', base(day)), /cs-calm/);
  const busy = S.html('ruhe', Object.assign(base(day), { bell: [{ tone: 'warn', label: 'Fenster offen', sub: 'Bad' }] }));
  assert.ok(/cs-busy/.test(busy) && !/cs-calm/.test(busy), 'something asks for someone: not in the middle');
  // The sky by night: stars and the moon on the sun's path.
  assert.ok(Math.abs(S.nightShare(Date.parse('2026-11-10T17:05:00'), sunT.rise, sunT.set)) < 1e-9 && S.nightShare(day, sunT.rise, sunT.set) === null, 'the night starts at sunset');
  const mid = S.nightShare(Date.parse('2026-11-11T00:13:30'), sunT.rise, sunT.set);
  assert.ok(mid > 0.49 && mid < 0.51, 'half the night');
  assert.ok(/cs-moon/.test(S.html('himmel', base(night))) && /cs-stars/.test(S.html('himmel', base(night))) && !/cs-moon/.test(S.html('himmel', base(day))), 'moon and stars only by night');
  // Energy: the dots run the way the power goes.
  const en = (e) => S.html('energie', Object.assign(base(day), { energy: Object.assign({ solar: 900, grid: 0, battery: 0, soc: 50, hasSolar: true, hasBattery: true, house: 700 }, e) }));
  assert.ok(/cs-fl cs-r cs-rev/.test(en({ grid: 400 })) && /cs-fl cs-r"/.test(en({ grid: -400 })), 'grid: towards the house while buying, away while feeding in');
  assert.ok(/cs-fl cs-l"/.test(en({ battery: 300 })) && /cs-fl cs-l cs-rev/.test(en({ battery: -300 })), 'battery: towards the house while it gives, away while it charges');
  // Music without a cover: a note instead of an empty plate.
  assert.match(S.html('musik', Object.assign(base(day), { media: { title: 'A', artist: 'B', where: 'C', cover: '', dur: 100, pos: 10 } })), /class="cs-cover"><svg/);
}
console.log('screensaver: reading distance ok');
// Energy: the balance row is centred like the flow above it (owner, 20.11.2026: it was bound to the left).
assert.match(S.CSS, /\.cs-bal div\{[^}]*text-align:center/, 'energy balance values centred');
console.log('screensaver: energy balance centred');
// #229: by night the moon takes the path from tonight's sunset to the coming sunrise, and the two end labels name
// exactly those two ends (they kept the sun's day times: sunrise left, sunset right).
{
  const sunT = { rise: Date.parse('2026-11-10T07:22:00'), set: Date.parse('2026-11-10T17:05:00') };
  const at = (iso, sun) => S.html('himmel', S.context({ hass, now: new Date(iso), sun: sun || sunT, wx: null, rooms: [] }));
  const ends = (html) => [...html.match(/class="cs-ends">(.*?)<\/div>/)[1].matchAll(/<span>(.*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(ends(at('2026-11-10T13:00:00')), ['Aufgang 07:22', 'Noch 4 Std. 5 Min. Tageslicht', 'Untergang 17:05'], 'day: sunrise … sunset, as before');
  assert.deepEqual(ends(at('2026-11-10T21:00:00')), ['Untergang 17:05', 'Noch 10 Std. 22 Min. bis Sonnenaufgang', 'Aufgang 07:22'], 'evening: tonight\'s sunset left, the coming sunrise right');
  assert.deepEqual(ends(at('2026-11-10T06:40:00')), ['Untergang 17:05', 'Noch 42 Min. bis Sonnenaufgang', 'Aufgang 07:22'], 'after midnight: the same night, still sunset … sunrise');
  const span = S.nightSpan(Date.parse('2026-11-10T21:00:00'), sunT.rise, sunT.set);
  assert.deepEqual([span.start, span.end], [sunT.set, sunT.rise + 86400000], 'the night\'s two ends are the ones the moon\'s share is measured between');
  assert.equal(S.nightSpan(Date.parse('2026-11-10T13:00:00'), sunT.rise, sunT.set), null, 'no night by day');
}
console.log('screensaver: sky labels by night ok');
// #231: the Calendar screensaver can show two calendar weeks instead of the month (casora_screensaver_calendar_range
// '2w'); the month stays the default, the event fetch follows the grid, a day shows as many titles as it has room for.
{
  const TWO = { casora_screensaver_calendar_range: '2w' };
  const mon = { locale: { first_weekday: 'monday', time_format: '24' }, themes: {}, states: {} }, sunFirst = { ...mon, locale: { first_weekday: 'sunday', time_format: '24' } };
  const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-');
  const sat = new Date('2026-11-21T08:00:00'), last = new Date('2026-11-30T08:00:00');
  // The month stays what it was without the setting (nobody's layout changes on update).
  assert.deepEqual([ymd(S.calGrid(sat, mon, {}).start), S.calGrid(sat, mon, {}).weeks], ['2026-10-26', 6], 'default: the month');
  assert.deepEqual([ymd(S.calGrid(sat, mon, { casora_screensaver_calendar_range: 'x' }).start), S.calGrid(sat, mon, {}).two], ['2026-10-26', undefined], 'unknown value: the month');
  // Two weeks: this week and the next from the locale's first weekday.
  assert.deepEqual([ymd(S.calGrid(sat, mon, TWO).start), S.calGrid(sat, mon, TWO).weeks], ['2026-11-16', 2], '21 Nov, Monday first: 16–29 Nov');
  assert.equal(ymd(S.calGrid(last, mon, TWO).start), '2026-11-30', '30 Nov is a Monday: 30 Nov – 13 Dec');
  assert.equal(ymd(S.calGrid(sat, sunFirst, TWO).start), '2026-11-15', 'Sunday first: from the 15th');
  assert.equal(ymd(S.calGrid(new Date('2026-11-22T08:00:00'), mon, TWO).start), '2026-11-16', 'a Sunday belongs to the week that began on Monday');
  // The fetch asks for exactly the grid: fourteen days from the week's first day.
  {
    const asked = [];
    const hassApi = { ...mon, states: { 'calendar.a': { state: 'off', attributes: {} } }, callApi: (m, p) => { asked.push(p); return new Promise(() => {}); } };
    S.context({ hass: hassApi, now: sat, kind: 'kalender', vars: { ...TWO, casora_screensaver_calendars: ['calendar.a'] }, sun: null, wx: null, rooms: [] });
    assert.equal(asked.length, 1);
    const q = new URL('http://x/' + asked[0]).searchParams;
    assert.deepEqual([ymd(new Date(q.get('start'))), ymd(new Date(q.get('end')))], ['2026-11-16', '2026-11-30'], 'the fetch covers the two weeks');
  }
  // What is drawn: fourteen days, none greyed as another month, the titles with their time.
  const at = (d, h, m) => +new Date(2026, 10, d, h, m);
  const ev = (d, h, m, title) => ({ title, start: at(d, h, m), end: at(d, h, m) + 3600000, allDay: false });
  const events = [ev(21, 8, 30, 'A1'), ev(21, 10, 0, 'A2'), ev(21, 12, 0, 'A3'), ev(21, 18, 0, 'A4'),
    ev(24, 8, 0, 'B1'), ev(24, 9, 0, 'B2'), ev(24, 10, 0, 'B3'), ev(24, 11, 0, 'B4'), ev(24, 12, 0, 'B5'),
    { title: 'Ganz <b>', start: at(26, 0, 0), end: at(27, 0, 0), allDay: true }];
  const draw = (vars, now) => S.html('kalender', S.context({ hass: mon, now: now || sat, vars, events, sun: null, wx: null, rooms: [] }));
  const two = draw(TWO), month = draw({});
  const cells = (html) => html.split('<div class="cs-kd').slice(1);
  assert.equal(cells(two).length, 14, 'fourteen days');
  assert.equal(cells(month).length, 42, 'the month: all its weeks, as before');
  assert.ok(/cs-kg cs-k2/.test(two) && !/cs-k2|cs-ke2|cs-kr/.test(month) && !/cs-kout/.test(two), 'two weeks has its own layout and no days of another month');
  assert.deepEqual(cells(two).map((c) => Number(c.match(/<b>(\d+)<\/b>/)[1])), [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
  const day = (html, n) => cells(html).find((c) => new RegExp('<b>' + n + '</b>').test(c));
  const titles = (c) => [...c.matchAll(/<em data-no-i18n>(.*?)<\/em>/g)].map((m) => m[1]);
  assert.deepEqual(titles(day(two, 21)), ['A1', 'A2', 'A3', 'A4'], 'four appointments: four titles');
  assert.ok(!/cs-kmore/.test(day(two, 21)), 'never a bare +1 where the title fits');
  assert.deepEqual(titles(day(two, 24)), ['B1', 'B2', 'B3'], 'five appointments: three titles …');
  assert.match(day(two, 24), /cs-kmore">\+2</, '… and +2');
  assert.match(day(two, 21), /<em data-no-i18n>A1<\/em><small>08:30<\/small>/, 'each title with its time');
  assert.match(day(two, 26), /<em data-no-i18n>Ganz &lt;b&gt;<\/em><small>ganztägig<\/small>/, 'all day, and the title is escaped');
  assert.deepEqual(titles(day(month, 21)), ['A1'], 'the month of six weeks keeps one title');
  // The header names the span, in every language through Intl, also across a month and a year boundary.
  const clean = (t) => t.replace(/[\u2009\u202f\u00a0]/g, ' ');
  const head = (html) => clean(html.match(/class="cs-km cs-kr"[^>]*>(.*?)</)[1]);
  const LOCS = { de: 'de-DE', en: 'en-GB', nl: 'nl-NL', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', nb: 'nb-NO' };
  for (const [l, tag] of Object.entries(LOCS)) {
    win.casoraLocale = () => tag;
    const same = head(draw(TWO)), cross = head(draw(TWO, last)), year = head(draw(TWO, new Date('2026-12-30T08:00:00')));
    const fmt = (o, d) => new Intl.DateTimeFormat(tag, o).formatToParts(d).find((p) => p.type === 'month').value;
    const nov = new Date(2026, 10, 16), dec = new Date(2026, 11, 13);
    assert.ok(/16/.test(same) && /29/.test(same) && same.toLowerCase().split(fmt({ day: 'numeric', month: 'long' }, nov).toLowerCase()).length === 2, l + ': one month, named once: ' + same);
    assert.ok(/30/.test(cross) && /13/.test(cross), l + ': both days across the month boundary: ' + cross);
    if (!/^\d+\/\d+ . \d+\/\d+$/.test(cross)) assert.ok(cross.toLowerCase().includes(fmt({ day: 'numeric', month: 'short' }, nov).toLowerCase()) && cross.toLowerCase().includes(fmt({ day: 'numeric', month: 'short' }, dec).toLowerCase()), l + ': both months: ' + cross);
    assert.ok(/28/.test(year) && /10/.test(year) && !/2026|2027/.test(year + cross + same), l + ': across the year, no year in the title: ' + year);
  }
  win.casoraLocale = () => 'de-DE';
  assert.equal(head(draw(TWO)), '16.–29. November');
  assert.equal(head(draw(TWO, last)), '30. Nov. – 13. Dez.');
  win.casoraLocale = () => 'en-GB';
  assert.match(head(draw(TWO)), /^16 ?– ?29 November$/);
  delete win.casoraLocale;
  // The size of the span follows its length (the stylesheet fits it beside the clock) and never goes under 56 units.
  assert.match(two, /class="cs-km cs-kr" style="--cs-n:\d+"/);
  const fit = S.CSS.match(/\.cs-km\.cs-kr\{[^}]*font-size:clamp\(([\d.]+)cqmin/);
  assert.ok(fit && Number(fit[1]) * 8.2 >= 55.9, 'the span stays big');
  assert.equal(S.vars({ views: [{ cards: [{ variables: TWO }] }] }).casora_screensaver_calendar_range, '2w', 'read from the hero card');
}
console.log('screensaver: calendar two weeks ok');
