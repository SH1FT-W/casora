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

assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'46-screensaver'"), 'module in MODULES');
console.log('ok screensaver');
