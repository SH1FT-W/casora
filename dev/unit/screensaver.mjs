// @deckt: custom_components/casora/scripts/local/46-screensaver.js#_casoraSaver
// Screensavers for wall tablets (46-screensaver.js): the time as people say it in nine languages, the sun's share of
// the day and the sky for it, the drawn landscapes, which minutes count, and what each screensaver draws.
//   node dev/unit/screensaver.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
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
h = S.html('himmel', ctx({ now: new Date('2026-11-10T22:00:00') }));
assert.ok(!/cs-sun/.test(h) && /Nacht/.test(h), 'sky at night: no sun');
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
h = S.html('linie', ctx({ events }));
assert.ok(/Zahnarzt/.test(h) && /cs-past/.test(h) && /cs-next/.test(h) && /in 1 Std\. 48 Min\./.test(h) && /cs-now/.test(h), 'day line: past, next, now');
assert.ok(!/<i>"|Elternabend <i>/.test(h) && /Elternabend &lt;i&gt;/.test(h), 'appointment titles are escaped');
h = S.html('linie', ctx({ events: [] }));
assert.ok(/Heute nichts mehr/.test(h) && /Heute keine Termine/.test(h), 'day line without appointments');
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
