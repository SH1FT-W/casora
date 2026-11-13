// @deckt: custom_components/casora/scripts/local/46-screensaver.js#kindAt,pool,selected,has,cameras,monthGrid,dominant,lightRooms,lightsOn,lightState,html,context,vars
// Screensavers (46-screensaver.js), the Hemma comparison of 13.11.2026: which kinds alternate („mix“, picked in the
// Studio, none picked = all), kinds without data are skipped in the alternation (music only while something plays),
// the two new kinds (cameras, month calendar), the light button and the cover colour.
//   node dev/unit/screensaver_mix.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;
const J = (x) => JSON.parse(JSON.stringify(x));
const ALL = J(S.KINDS.map((k) => k.id));
assert.deepEqual(J(ALL), ['himmel', 'land', 'fotos', 'wort', 'wetter', 'linie', 'woche', 'musik', 'energie', 'ruhe', 'kameras', 'kalender']);
assert.ok(S.KINDS.every((k) => /^mdi:/.test(k.icon) && /^#[0-9A-F]{6}$/i.test(k.tone)), 'every kind has an icon and a tone for the Studio list');

// kindAt: five minutes each, over the pool; without a pool over all (as before).
const slot = (i) => new Date(i * 300000 + 1000);
assert.deepEqual(ALL.map((_, i) => S.kindAt('mix', slot(i))), ALL, 'no pool: all, one after the other');
assert.deepEqual([0, 1, 2, 3].map((i) => S.kindAt('mix', slot(i), ['wort', 'ruhe'])), ['wort', 'ruhe', 'wort', 'ruhe'], 'pool: only those');
assert.equal(S.kindAt('mix', slot(7), []), ALL[7], 'empty pool: all');
assert.equal(S.kindAt('wort', slot(3), ['ruhe']), 'wort', 'a single kind ignores the pool');
assert.equal(S.kindAt('kalender', new Date()), 'kalender');

// selected: what the Studio picked, in the order of KINDS; nothing or nonsense = all.
assert.deepEqual(J(S.selected({})), ALL, 'default: all (as before)');
assert.deepEqual(J(S.selected({ casora_screensaver_mix: [] })), ALL);
assert.deepEqual(J(S.selected({ casora_screensaver_mix: ['ruhe', 'wort', 'quatsch'] })), ['wort', 'ruhe'], 'KINDS order, unknown ones dropped');
assert.deepEqual(J(S.selected({ casora_screensaver_mix: ['quatsch'] })), ALL, 'nothing valid: all');
assert.deepEqual(J(S.selected({ casora_screensaver_mix: 'wort' })), ALL, 'not a list: all');

// has: kinds without data. A house without weather, energy, cameras, photos and with nothing playing.
const bare = { states: { 'media_player.tv': { state: 'paused', attributes: { media_title: 'X' } } } };
const has = (h, v = {}, rooms = []) => (id) => S.has(id, { hass: h, vars: v, rooms });
assert.deepEqual(ALL.filter((id) => !has(bare)(id)), ['fotos', 'wetter', 'musik', 'energie', 'kameras'], 'skipped without data');
assert.deepEqual(J(S.pool({}, has(bare))), ['himmel', 'land', 'wort', 'linie', 'woche', 'ruhe', 'kalender'], 'the alternation skips them (no sky stand-in)');

// Music only while something plays (#6): in the alternation as soon as a player plays, gone when it pauses.
const playing = { states: { 'media_player.tv': { state: 'playing', last_updated: '2026-11-13T10:00:00', attributes: { media_title: 'Song', entity_picture: '/api/cover.jpg' } } } };
assert.ok(S.pool({ casora_screensaver_mix: ['musik', 'wort'] }, has(playing)).includes('musik'), 'playing: music takes its turn');
assert.deepEqual(J(S.pool({ casora_screensaver_mix: ['musik', 'wort'] }, has(bare))), ['wort'], 'paused: only the word clock');
// Music as the only pick and nothing plays: a calm stand-in (the sky), never an empty pool.
assert.deepEqual(J(S.pool({ casora_screensaver_mix: ['musik'] }, has(bare))), ['himmel']);
const now = new Date('2026-11-13T16:42:00'), rise = Date.parse('2026-11-13T07:30:00'), set = Date.parse('2026-11-13T16:55:00');
const ctx = (o) => S.context({ hass: bare, now, vars: {}, sun: { rise, set }, rooms: [], ...o });
assert.match(S.html('musik', ctx({ media: null })), /data-kind="himmel"/, 'music alone without playing: the sky');
// Weather with an entity, photos with a room photo, energy with the energy helpers count again.
assert.ok(has({ states: { 'weather.home': { state: 'sunny', attributes: { temperature: 9 } } } }, { weather_entity: 'weather.home' })('wetter'));
assert.ok(has(bare, {}, [{ name: 'Bad', url: '/x.jpg' }])('fotos'));

// Cameras: visible ones with a picture, the Studio's pick narrows it, none left = all.
const cams = { entities: { 'camera.hidden': { hidden: true } }, states: {
  'camera.garten': { state: 'idle', attributes: { friendly_name: 'Garten', entity_picture: '/api/camera_proxy/camera.garten?token=a', supported_features: 2 } },
  'camera.eingang': { state: 'streaming', attributes: { friendly_name: 'Eingang', entity_picture: '/api/camera_proxy/camera.eingang?token=b' } },
  'camera.weg': { state: 'unavailable', attributes: { entity_picture: '/x' } },
  'camera.hidden': { state: 'idle', attributes: { entity_picture: '/y' } } } };
assert.deepEqual(J(S.cameras(cams).map((c) => [c.id, c.name, c.stream])), [['camera.eingang', 'Eingang', false], ['camera.garten', 'Garten', true]]);
assert.deepEqual(J(S.cameras(cams, ['camera.garten']).map((c) => c.id)), ['camera.garten'], 'picked: only those');
assert.equal(S.cameras(cams, ['camera.gone']).length, 2, 'picked one gone: all');
assert.ok(has(cams)('kameras') && !has(bare)('kameras'));
let h = S.html('kameras', ctx({ hass: cams, kind: 'kameras', cams: S.cameras(cams) }));
assert.ok(/data-kind="kameras"/.test(h) && (h.match(/class="cs-cam"/g) || []).length === 2 && /--cs-cols:2;--cs-rows:1/.test(h) && /data-cam="camera.garten"/.test(h)
  && /camera_proxy\/camera\.garten\?token=a/.test(h) && /Tippen für das Livebild/.test(h), 'cameras: a grid of two with their pictures');
const many = Array.from({ length: 7 }, (_, i) => ({ id: 'camera.c' + i, name: 'C' + i, url: '/c' + i }));
assert.match(S.html('kameras', ctx({ cams: many })), /--cs-cols:3;--cs-rows:3;--cs-pcols:2;--cs-prows:4/, 'seven: three columns (portrait two)');
assert.match(S.html('kameras', ctx({ cams: [] })), /data-kind="himmel"/, 'no camera: the sky');
// The context: every camera with its picture (a fresh one is loaded by the browser, here none: the entity picture).
assert.deepEqual(J(ctx({ hass: cams, kind: 'kameras' }).cams.map((c) => c.shot)), ['/api/camera_proxy/camera.eingang?token=b', '/api/camera_proxy/camera.garten?token=a']);

// Month calendar: the grid from the week of the 1st (Monday first, Sunday where the locale says so).
let g = S.monthGrid(new Date(2026, 10, 13), { locale: { first_weekday: 'monday' } });
assert.deepEqual([g.start.getFullYear(), g.start.getMonth(), g.start.getDate(), g.weeks, g.month], [2026, 9, 26, 6, 10], 'November 2026 starts on a Sunday: six weeks from 26 October');
g = S.monthGrid(new Date(2026, 10, 13), { locale: { first_weekday: 'sunday' } });
assert.deepEqual([g.start.getMonth(), g.start.getDate(), g.weeks], [10, 1, 5], 'Sunday first: five weeks from 1 November');
g = S.monthGrid(new Date(2027, 1, 10), { locale: { first_weekday: 'monday' } });
assert.deepEqual([g.start.getMonth(), g.start.getDate(), g.weeks], [1, 1, 4], 'February 2027: exactly four weeks');
const at = (d, hh) => +new Date(2026, 10, d, hh, 0);
const events = [{ title: 'Zahnarzt', start: at(13, 9), end: at(13, 10), allDay: false, cal: 'calendar.a' },
  { title: 'Urlaub <b>', start: at(20, 0), end: at(23, 0), allDay: true, cal: 'calendar.b' },
  ...[1, 2, 3, 4].map((i) => ({ title: 'T' + i, start: at(25, 8 + i), end: at(25, 9 + i), allDay: false, cal: 'calendar.a' }))];
const kctx = (o) => ctx({ hass: { states: {}, locale: { first_weekday: 'monday', time_format: '24' } }, events, cals: ['calendar.a', 'calendar.b'], kind: 'kalender', ...o });
h = S.html('kalender', kctx());
assert.ok((h.match(/class="cs-kd/g) || []).length === 42 && (h.match(/cs-ktoday/g) || []).length === 1 && /cs-kout/.test(h), 'calendar: 42 days, today once, days of other months');
assert.ok(/November/.test(h) && /2026/.test(h) && /16:42/.test(h), 'calendar: month, year, time');
assert.ok(/Zahnarzt/.test(h) && !/Urlaub <b>/.test(h) && (h.match(/Urlaub &lt;b&gt;/g) || []).length === 3, 'an appointment over three days shows on each, escaped');
assert.ok(/--cs-c:#4E9E95/.test(h) && /--cs-c:#5B8FC9/.test(h), 'each calendar its colour');
assert.match(h, /\+1<\/span>/, 'more than three on a day: „+1“');
assert.ok(/data-kind="kalender"/.test(h) && !/cs-dark/.test(h), 'by day: light');
assert.match(S.html('kalender', kctx({ now: new Date('2026-11-13T21:00:00') })), /cs-kalender cs-dark/, 'by night: dark');
assert.match(S.html('kalender', kctx({ events: [] })), /cs-ktoday/, 'no appointments: still the month');
// The pick of calendars: only those (none, or none left = all that count).
const hc = { entities: {}, states: { 'calendar.a': {}, 'calendar.b': {}, 'calendar.c': {} } };
assert.deepEqual(J(S.calendars(hc, ['calendar.c', 'calendar.a'])), ['calendar.c', 'calendar.a']);
assert.deepEqual(J(S.calendars(hc, ['calendar.gone'])), ['calendar.a', 'calendar.b', 'calendar.c']);
assert.deepEqual(J(S.calendars(hc, [])), ['calendar.a', 'calendar.b', 'calendar.c']);
assert.deepEqual(J(S.context({ hass: hc, now, kind: 'kalender', vars: { casora_screensaver_calendars: ['calendar.b'] }, events: [] }).cals), ['calendar.b']);

// Light: the button only when the Studio turned it on, only on the calm ones, only with lights in the house.
const lit = { states: { 'light.a': { state: 'on', attributes: { brightness: 128, rgb_color: [255, 180, 90] } }, 'light.b': { state: 'off', attributes: {} },
  'light.g': { state: 'on', attributes: { entity_id: ['light.a', 'light.b'], brightness: 128 } } } };
const lv = { casora_screensaver_light: true };
assert.equal(S.context({ hass: lit, now, kind: 'ruhe', vars: {} }).light, null, 'off by default');
assert.deepEqual(J(S.context({ hass: lit, now, kind: 'ruhe', vars: lv }).light), { on: 1 }, 'on: the count of lights that are on (a group of counted members once)');
assert.equal(S.context({ hass: lit, now, kind: 'woche', vars: lv }).light, null, 'not on the busy ones');
assert.equal(S.context({ hass: { states: {} }, now, kind: 'wort', vars: lv }).light, null, 'no lights: no button');
for (const k of S.LIGHT_KINDS) {
  h = S.html(k, S.context({ hass: lit, now, kind: k, vars: lv, sun: { rise, set }, bell: [], people: [] }));
  assert.ok(/data-sv-act="light"/.test(h) && /cs-lon/.test(h) && /1 an/.test(h), 'light button on ' + k);
}
assert.ok(!/data-sv-act="light"/.test(S.html('ruhe', S.context({ hass: lit, now, kind: 'ruhe', vars: {}, bell: [], people: [] }))));
assert.deepEqual(J(S.lightsOn(lit)), ['light.a'], 'all that are on: the group only through its member');
assert.deepEqual(J(S.lightState(lit, ['light.a', 'light.b'])), { on: 1, pct: 50, color: 'rgb(255,180,90)' });
assert.deepEqual(J(S.lightState(lit, ['light.b'])), { on: 0, pct: 0, color: '#FFD58A' });
// The rooms' lights from the Studio: the light group, else the single lights; rooms without light are left out.
const rcfg = { views: [{ title: 'Wohnen', cards: [{ variables: { light_group_entity: 'light.g', light_entity_1: 'light.a' } }] },
  { title: 'Bad', cards: [{ variables: { light_entity_1: 'light.a', light_entity_2: 'light.b' } }] },
  { title: 'Flur', cards: [{ variables: {} }] }, { title: 'Doppelt', cards: [{ variables: { light_group_entity: 'light.g' } }] }] };
assert.deepEqual(J(S.lightRooms(rcfg)), [{ name: 'Wohnen', ids: ['light.g'] }, { name: 'Bad', ids: ['light.a', 'light.b'] }]);
// The name as the room menu shows it: the view's title is often only its path.
const ncfg = { views: [{ path: 'living-room', title: 'living-room', cards: [{ type: 'x', variables: { light_group_entity: 'light.g' }, routes: [{ url: '/d/living-room', label: 'Living Room' }] }] },
  { path: 'office', cards: [{ variables: { light_entity_1: 'light.a' } }] }] };
assert.deepEqual(J(S.lightRooms(ncfg).map((r) => r.name)), ['Living Room', 'office']);
assert.equal(J(S.lightState({ states: { 'light.w': { state: 'on', attributes: { brightness: 255, rgb_color: [255, 255, 255] } } } }, ['light.w'])).color, '#FFD58A', 'white shows warm white');

// Cover colour: off by default; on, the calm coloured ones take a wash of the playing cover, never the pictures.
const px = (rgb, n) => Array.from({ length: n }, () => [...rgb, 255]).flat();
const red = J(S.dominant(px([200, 40, 30], 50).concat(px([128, 128, 128], 200))));
assert.ok(red[0] > red[1] + 60 && red[0] > red[2] + 60, 'grey pixels hardly count: red wins ' + red);
const dark = J(S.dominant(px([10, 10, 60], 100)));
const L = (Math.max(...dark) + Math.min(...dark)) / 510;
assert.ok(L >= 0.41 && L <= 0.61, 'brought to a calm brightness ' + dark);
assert.equal(S.dominant([]), null);
const media = { title: 'Song', artist: 'B', where: 'Wohnen', cover: '/api/cover.jpg', dur: null, pos: null };
const wx = { temp: 9, text: 'Sonnig', icon: '/w.svg' }, energy = { solar: null, grid: 500, battery: null, soc: null, hasSolar: false, hasBattery: false, house: 500 };
const tctx = (k, o) => ctx({ kind: k, media, wx, energy, tint: 'rgb(176,104,72)', bell: [], people: [], ...o });
for (const k of S.TINT_KINDS) assert.match(S.html(k, tctx(k)), /data-tint="1"[^>]*><div class="cs-tint" style="--cs-t:rgb\(176,104,72\)">/, 'tint on ' + k);
for (const k of ['himmel', 'land', 'fotos', 'kameras', 'musik']) assert.ok(!/cs-tint/.test(S.html(k, tctx(k))), 'no tint on ' + k);
assert.ok(!/cs-tint/.test(S.html('ruhe', tctx('ruhe', { media: null }))), 'nothing playing: no tint');
assert.equal(S.context({ hass: playing, now, kind: 'ruhe', vars: {} }).tint, null, 'switch off: no tint');
assert.equal(S.context({ hass: playing, now, kind: 'ruhe', vars: {} }).media, null, 'switch off: the player is not even asked');
assert.equal(S.context({ hass: playing, now, kind: 'ruhe', vars: { casora_screensaver_tint: true } }).media.title, 'Song', 'switch on: the playing player');
// The preview: an example colour while the switch is on.
assert.equal(S.sample(ctx({ vars: { casora_screensaver_tint: true }, media: null })).tint, 'rgb(176,104,72)');
assert.equal(S.sample(ctx({ vars: {}, media: null })).tint, null);

// The new settings are dashboard settings like the others.
const vcfg = { views: [{ cards: [{ variables: { casora_screensaver_mix: ['wort'], casora_screensaver_cameras: ['camera.a'], casora_screensaver_calendars: ['calendar.a'], casora_screensaver_light: true, casora_screensaver_tint: false } }] }] };
assert.deepEqual(J(S.vars(vcfg)), { casora_screensaver_mix: ['wort'], casora_screensaver_cameras: ['camera.a'], casora_screensaver_calendars: ['calendar.a'], casora_screensaver_light: true, casora_screensaver_tint: false });
// The light's text: dark on a warm white, light on a deep blue.
assert.deepEqual([S.inkOn('#FFD58A'), S.inkOn('rgb(30,40,160)'), S.inkOn('rgb(255,180,90)')], ['#2A2520', '#F6EFE6', '#2A2520']);
console.log('ok screensaver_mix');
