// Room search (scripts/local/38-search.js) without HA: folding (umlauts, accents), ranking (prefix before word start
// before part of a word, the room's name weaker than the name), what the index takes from a phone and a desktop
// dashboard ("Who sees this?" on rooms, headers and tiles, hidden rooms, tiles off on the phone, scenes of the scene
// menu), at most 8 per group, recently opened per device. All devices and names are invented.   node dev/unit/search.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/38-search.js', import.meta.url), 'utf8');
const store = {};
const listeners = {};
const box = {
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  document: { querySelector: () => null, addEventListener() {}, getElementById: () => null,
    documentElement: { style: { vars: {}, setProperty(k, v) { this.vars[k] = v; } }, scrollTop: 0 } },
  // The module's window listeners, to drive the pull-down below.
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, scrollY: 0, scrollBy(x, y) { box.scrollY += y; }, history: { pushState() {} }, location: { pathname: '/qa-haus-mobile/home' },
  CustomEvent: class {}, setTimeout, clearInterval, setInterval, customElements: { get: () => null },
};
box.window = box;
vm.createContext(box);
vm.runInContext(src, box);
const S = box._casoraSearch;
// Arrays from the module's realm: compare as plain data.
const deq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);
assert.ok(S, 'module loaded');

// ── Folding ────────────────────────────────────────────────────────────────
assert.equal(S.fold('Küche').s, 'kuche');
assert.equal(S.fold('Küche', true).s, 'kueche');
assert.equal(S.fold('Straße Café Ørsted').s, 'strasse cafe orsted');
deq(S.fold('Aß').map, [0, 1, 1], 'ß stands for two folded letters, both back to it');

// ── Matching and ranking ─────────────────────────────────────────────────
const m = S.match('Küche', 'kuche');
assert.ok(m, '"kuche" finds "Küche"');
deq(m.name, [[0, 5]], 'the whole name is marked');
assert.ok(S.match('Küche', 'kueche'), '"kueche" too');
assert.ok(S.match('Küche', 'KÜ'), 'upper case and umlaut typed');
deq(S.match('Waschküche', 'kü').name, [[5, 7]], 'part of a word, marked in the original');
assert.equal(S.match('Küche', 'bad'), null, 'no hit: null');
const pre = S.match('Küchenlicht', 'kü').score, word = S.match('Licht Küche', 'kü').score, part = S.match('Waschküche', 'kü').score;
assert.ok(pre > word && word > part, `prefix ${pre} > word start ${word} > part ${part}`);
const both = S.match('Decke', 'decke kuche', 'Küche');
assert.ok(both && both.room.length === 1 && both.name.length === 1, 'one word in the name, one in the room');
assert.ok(S.match('Decke', 'kuche', 'Küche').score < S.match('Decke Küche', 'kuche').score, 'the room weaker than the name');
assert.equal(S.match('Decke', 'uche', 'Küche'), null, 'the room only by a word start');
assert.equal(S.match('Decke', 'decke bad', 'Küche'), null, 'every word must be found');
assert.ok(S.match('Bad', 'bad').score > S.match('Badezimmer', 'bad').score, 'the exact name first');

// ── Index: phone dashboard ───────────────────────────────────────────────
const KID = 'u-kind', ME = 'u-admin';
const st = (id, state, name, extra = {}) => ({ entity_id: id, state, attributes: { friendly_name: name, ...extra } });
const states = {};
[
  st('light.qa_decke_kueche', 'on', 'Decke Küche'), st('light.qa_spiegel_bad', 'off', 'Spiegel Bad'),
  st('switch.qa_kaffee', 'off', 'Kaffeemaschine'), st('cover.qa_jalousie_bad', 'open', 'Jalousie Bad'),
  st('sensor.qa_tresor', '1', 'Tresor'), st('light.qa_geheim', 'off', 'Geheimlicht'), st('light.qa_desk_only', 'off', 'Nur Desktop'),
  st('climate.qa_bad', 'heat', 'Heizkörper Bad'), st('scene.qa_kochen', 'scening', 'Kochen'), st('scene.qa_film', 'scening', 'Filmabend'),
  st('scene.qa_versteckt', 'scening', 'Ausgeschlossen'), st('script.qa_gute_nacht', 'off', 'Gute Nacht'),
  st('light.qa_kinderzimmer', 'off', 'Kinderlicht'),
].forEach((x) => { states[x.entity_id] = x; });
const tile = (tpl, entity, extra = {}) => ({ type: 'custom:button-card', template: tpl, entity, ...extra });
const header = (name, extra = {}) => ({ type: 'custom:button-card', template: 'casora_mobile_header', name, ...extra });
const row = (cards, extra = {}) => ({ type: 'custom:casora-smart-row', cards, ...extra });
const phoneCfg = { views: [{ path: 'home', cards: [
  { type: 'custom:button-card', template: 'casora_mobile_bg' },
  row([
    { type: 'custom:button-card', template: 'casora_mobile_weather' },
    { type: 'custom:button-card', template: 'casora_mobile_filter_badges', variables: { light_entity_1: 'light.qa_decke_kueche' } },
    { type: 'custom:casora-filter-overlay', room: 'Küche', filter_category: 'room_kche' },
    header('Favoriten'), row([tile('casora_switch', 'switch.qa_kaffee')]),
    header('Küche'), row([tile('casora_light', 'light.qa_decke_kueche'), tile('casora_light', 'light.qa_desk_only', { variables: { surfaces: 'desktop' } }),
      tile('casora_scene', 'scene.qa_kochen'), tile('casora_script', 'script.qa_gute_nacht')]),
    header('Bad'), row([tile('casora_light', 'light.qa_spiegel_bad', { name: 'Spiegel' }), tile('casora_cover', 'cover.qa_jalousie_bad'),
      { type: 'conditional', conditions: [], card: tile('casora_sensor', 'sensor.qa_tresor', { visibility: [{ condition: 'user', users: [ME] }] }) },
      tile('casora_light', 'light.qa_geheim', { variables: { enabled: false } })]),
    header('Kinderzimmer', { visibility: [{ condition: 'user', users: [KID] }] }), row([tile('casora_light', 'light.qa_kinderzimmer')]),
  ]),
  { type: 'custom:casora-mobile-nav', scene_exclude: ['scene.qa_versteckt'], rooms: [
    { key: 'room_kche', name: 'Küche', icon: '/casora_assets/icons/kitchen.svg' },
    { key: 'room_bad', name: 'Bad' },
    { key: 'room_kinderzimmer', name: 'Kinderzimmer', users: [KID] },
  ] },
] }] };
// The room badges' devices come from the server (casoraPhoneRoom.rooms(): desktop room variables).
box.casoraPhoneRoom = { rooms: () => [{ name: 'Bad', vars: { climate_entity_1: 'climate.qa_bad' } }, { name: 'Kinderzimmer', vars: { light_entity_1: 'light.qa_kinderzimmer' } }] };
// The scene menu's list (04-navigation.js): every scene minus the exclusions.
box.casoraNavScenes = (h, ex) => Object.keys(h.states).filter((id) => id.startsWith('scene.') && !(ex || []).includes(id));
const hass = { states, entities: {}, areas: {}, devices: {} };

assert.equal(S.isPhoneCfg(phoneCfg), true);
assert.equal(S.isCasoraCfg(phoneCfg), true);
assert.equal(S.isCasoraCfg({ views: [{ cards: [{ type: 'entities' }] }] }), false, 'not a Casora dashboard: no Cmd+K');
let idx = S.index(phoneCfg, hass, { id: ME });
const ids = (g) => idx[g].map((x) => x.id).sort();
deq(idx.rooms.map((r) => r.name), ['Küche', 'Bad'], 'rooms of the nav, the child\'s room hidden for the admin');
assert.equal(idx.rooms[0].key, 'room_kche', 'the room opens by the nav\'s key');
deq(ids('devices'), ['climate.qa_bad', 'cover.qa_jalousie_bad', 'light.qa_decke_kueche', 'light.qa_spiegel_bad', 'sensor.qa_tresor', 'switch.qa_kaffee'],
  'tiles and room badges; switched-off, desktop-only and hidden rooms\' tiles left out');
assert.equal(idx.devices.find((d) => d.id === 'switch.qa_kaffee').room, null, 'a favourite has no room');
assert.equal(idx.devices.find((d) => d.id === 'light.qa_spiegel_bad').name, 'Spiegel', 'the tile\'s own name');
assert.equal(idx.devices.find((d) => d.id === 'light.qa_spiegel_bad').room, 'Bad');
assert.ok(idx.devices.find((d) => d.id === 'light.qa_spiegel_bad').card, 'the tile\'s config opens its popup');
deq(ids('scenes'), ['scene.qa_film', 'scene.qa_kochen', 'script.qa_gute_nacht'], 'scene menu without the excluded, scene and script tiles');

idx = S.index(phoneCfg, hass, { id: KID });
deq(idx.rooms.map((r) => r.name), ['Küche', 'Bad', 'Kinderzimmer'], 'the child sees its room');
assert.ok(ids('devices').includes('light.qa_kinderzimmer') && !ids('devices').includes('sensor.qa_tresor'), '"Who sees this?" per user');

// "Who sees this?" on single entities (casora_entity_users) also hides them.
box.casoraSeesEntity = (id, user) => !(id === 'cover.qa_jalousie_bad' && user && user.id === KID);
idx = S.index(phoneCfg, hass, { id: KID });
assert.ok(!ids('devices').includes('cover.qa_jalousie_bad'), 'entity hidden for this user');
delete box.casoraSeesEntity;

// ── Query ─────────────────────────────────────────────────────────────────
idx = S.index(phoneCfg, hass, { id: ME });
let q = S.query(idx, 'kuche');
assert.equal(q.rooms[0].item.name, 'Küche', 'room first');
assert.equal(q.devices[0].item.id, 'light.qa_decke_kueche', 'the device named after the kitchen');
deq(q.scenes.map((x) => x.item.id).sort(), ['scene.qa_kochen', 'script.qa_gute_nacht'], 'scenes of the kitchen by their room');
q = S.query(idx, 'bad');
deq(q.devices.map((x) => x.item.id).slice(0, 2).sort(), ['climate.qa_bad', 'cover.qa_jalousie_bad'], 'hits in the name first');
assert.ok(q.devices.slice(2).some((x) => x.item.id === 'light.qa_spiegel_bad'), 'then the room\'s devices ("Spiegel" in Bad)');
assert.equal(S.query(idx, '   ').total, 0, 'empty query: nothing');
// At most 8 per group.
const many = { rooms: [], scenes: [], devices: Array.from({ length: 20 }, (_, i) => ({ kind: 'device', id: 'light.qa_l' + i, name: 'Lampe ' + i, room: null })) };
assert.equal(S.query(many, 'lampe').devices.length, 8);
assert.equal(S.query(many, 'lampe', 3).devices.length, 3);

// ── Index: desktop dashboard ─────────────────────────────────────────────
const deskCfg = { views: [
  { path: 'home', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Home' }, { type: 'vertical-stack', cards: [
    { type: 'conditional', conditions: [], card: { type: 'custom:casora-nav', routes: [
      { url: '/qa-haus/home', label: 'Home', auto: 'home' }, { url: '/qa-haus/kueche', label: 'Küche', icon: 'mdi:fridge' },
      { url: '/qa-haus/geheim', label: 'Geheim', users: [KID] }] } }] },
    row([tile('casora_switch', 'switch.qa_kaffee'), { type: 'custom:button-card', template: 'casora_scene_row', variables: { scenes: ['scene.qa_film'] } }])] },
  { path: 'kueche', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Küche', variables: { light_entity_1: 'light.qa_decke_kueche' } }, { type: 'vertical-stack', cards: [] },
    row([tile('casora_badge_light', 'light.qa_spiegel_bad'), tile('casora_cover', 'cover.qa_jalousie_bad')])] },
  { path: 'geheim', visible: [{ user: KID }], cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Geheim' }, { type: 'vertical-stack', cards: [] }, row([tile('casora_light', 'light.qa_geheim')])] },
] };
assert.equal(S.isPhoneCfg(deskCfg), false);
idx = S.index(deskCfg, hass, { id: ME }, { url: 'qa-haus' });
deq(idx.rooms.map((r) => [r.name, r.url]), [['Küche', '/qa-haus/kueche']], 'home is no room; the hidden view left out');
deq(ids('devices'), ['cover.qa_jalousie_bad', 'light.qa_decke_kueche', 'switch.qa_kaffee'], 'tiles and room badges, no badge cards, nothing from the hidden view');
deq(ids('scenes'), ['scene.qa_film'], 'the scene row\'s own selection');
idx = S.index(deskCfg, hass, { id: KID }, { url: 'qa-haus' });
assert.ok(idx.rooms.some((r) => r.name === 'Geheim') && ids('devices').includes('light.qa_geheim'), 'the child sees its view');

// ── Desktop as the Studio builds it (#102): scenes as the Home room's badge (show_scenes), no scene row; the weather
// in the room's head (weather_entity), no tile of its own; a tile named without its room ("Markise" in Schlafzimmer)
// whose entity is called "SZ Markise". All three were missing from the search.
Object.assign(states, { 'weather.qa_station': st('weather.qa_station', 'sunny', 'Messpunkt Nord'),
  'cover.qa_markise': st('cover.qa_markise', 'open', 'SZ Markise'), 'scene.qa_kino': st('scene.qa_kino', 'scening', 'Kinoabend') });
const deskStudio = { views: [
  { path: 'home', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Home',
    variables: { show_scenes: true, scene_entities: '[[[ return []; ]]]', scene_exclude: ['scene.qa_versteckt'], weather_entity: 'weather.qa_station' } },
  { type: 'vertical-stack', cards: [{ type: 'conditional', conditions: [], card: { type: 'custom:casora-nav', routes: [
    { url: '/qa-haus/home', label: 'Home', auto: 'home' }, { url: '/qa-haus/schlafen', label: 'Schlafzimmer' }] } }] },
  row([tile('casora_switch', 'switch.qa_kaffee')])] },
  { path: 'schlafen', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Schlafzimmer', variables: { weather_entity: 'weather.qa_station' } },
    { type: 'vertical-stack', cards: [] }, row([tile('casora_cover', 'cover.qa_markise', { name: 'Markise' })])] },
] };
idx = S.index(deskStudio, hass, { id: ME }, { url: 'qa-haus' });
assert.ok(ids('scenes').includes('scene.qa_kino'), 'scenes of the Home badge (show_scenes) are searchable');
assert.ok(!ids('scenes').includes('scene.qa_versteckt'), 'with the badge\'s exclusions');
assert.equal(S.query(idx, 'kino').scenes[0]?.item.id, 'scene.qa_kino', '"kino" finds the scene');
assert.equal(S.query(idx, 'wetter').devices[0]?.item.id, 'weather.qa_station', '"wetter" finds the weather of the room\'s head');
assert.equal(S.query(idx, 'messpunkt').devices[0]?.item.id, 'weather.qa_station', 'and by its own name');
assert.equal(S.query(idx, 'sz markise').devices[0]?.item.id, 'cover.qa_markise', 'the entity\'s name finds a tile named otherwise');
assert.equal(S.query(idx, 'markise').devices[0]?.item.name, 'Markise', 'shown with the tile\'s name');
deq(S.query(idx, 'markise').devices[0].m.name, [[0, 7]], 'a hit in the tile\'s name is marked there');
assert.ok(S.match('Markise', 'markise').score > S.match('Rollo', 'markise', null, 'Markise').score, 'the name ranks before another name');
assert.equal(S.query(idx, 'sz kino').total, 0, 'every word must still be found');
// A desktop scene menu in the bar (casora-nav route menu: scenes) counts as well.
const deskMenu = JSON.parse(JSON.stringify(deskStudio));
delete deskMenu.views[0].cards[0].variables.show_scenes;
assert.equal(S.index(deskMenu, hass, { id: ME }, { url: 'qa-haus' }).scenes.length, 0, 'no scene surface: no scenes');
deskMenu.views[0].cards[1].cards[0].card.routes.push({ label: 'Szenen', menu: 'scenes' });
assert.ok(S.index(deskMenu, hass, { id: ME }, { url: 'qa-haus' }).scenes.some((x) => x.id === 'scene.qa_kino'), 'scene menu in the bar');
// The phone's title carries the weather too.
const phoneW = JSON.parse(JSON.stringify(phoneCfg));
phoneW.views[0].cards[1].cards[0].variables = { weather_entity: 'weather.qa_station' };
assert.equal(S.query(S.index(phoneW, hass, { id: ME }), 'wetter').devices[0]?.item.id, 'weather.qa_station', 'phone: "wetter" finds the weather');
['weather.qa_station', 'cover.qa_markise', 'scene.qa_kino'].forEach((k) => { delete states[k]; });

// ── Toggle only for switchable domains, not with "ask before switching" ──
assert.equal(S.canToggle(hass, 'light.qa_spiegel_bad'), true);
assert.equal(S.canToggle(hass, 'cover.qa_jalousie_bad'), false, 'covers open their popup');
assert.equal(S.canToggle(hass, 'sensor.qa_tresor'), false);
box.__casoraConfirmIds = ['light.qa_spiegel_bad'];
assert.equal(S.canToggle(hass, 'light.qa_spiegel_bad'), false, 'confirm_toggle: the popup asks');
delete box.__casoraConfirmIds;

// ── Recently opened ──────────────────────────────────────────────────────
idx = S.index(phoneCfg, hass, { id: ME });
S.remember({ kind: 'room', id: 'room_bad' });
S.remember({ kind: 'device', id: 'light.qa_spiegel_bad' });
S.remember({ kind: 'room', id: 'room_bad' });
S.remember({ kind: 'device', id: 'light.qa_gibt_es_nicht' });
deq(S.recentItems(idx).map((x) => x.id), ['room_bad', 'light.qa_spiegel_bad'], 'newest first, once each, gone ones dropped');
for (let i = 0; i < 10; i++) S.remember({ kind: 'scene', id: 'scene.qa_' + i });
assert.equal(S.recent().length, 6, 'at most 6');
box.localStorage.getItem = () => { throw new Error('private mode'); };
deq(S.recent(), [], 'storage blocked: empty, no error');
S.remember({ kind: 'room', id: 'room_bad' });

// ── Shown on the phone: Studio switch on the phone's header or the desktop's overview room ──
box.casoraPhoneRoom = { home: () => null };
assert.equal(S.shown({}), true, 'default on');
assert.equal(S.shown({ show_search: false }), false);
box.casoraPhoneRoom = { home: () => ({ show_search: false }) };
assert.equal(S.shown({}), false, 'switched off in the Studio, before the phone was saved');
// ── State words as the popup head says them (casoraStateWord in casora-core.js) ──
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const stI = core.indexOf('if (window._casoraStateText) return;');
vm.runInContext(core.slice(core.lastIndexOf('(function () {', stI), core.indexOf('})();', stI) + 5), box);
assert.equal(typeof box.casoraStateWord, 'function', 'core state word loaded');
const fmt = { on: 'Ein', off: 'Aus', idle: 'Leerlauf', playing: 'Wiedergabe', ready: 'ready', heat: 'Heizen', '21.5': '21,5 °C' };
const hz = { formatEntityState: (e) => fmt[e.state] ?? e.state };
const sword = (id, state, attrs = {}) => S.stateWord(hz, { entity_id: id, state, attributes: attrs });
assert.equal(sword('light.qa_a', 'on'), 'An', 'HA\'s „Ein“ → „An“');
assert.equal(sword('switch.qa_a', 'off'), 'Aus');
assert.equal(sword('media_player.qa_a', 'idle'), 'Inaktiv', 'idle is inactive, not ready to start');
assert.equal(sword('sensor.qa_spueler', 'ready'), 'Bereit', 'raw „ready“ → „Bereit“');
assert.equal(sword('media_player.qa_a', 'playing'), 'Wiedergabe', 'HA\'s word where the list has none');
assert.equal(sword('sensor.qa_temp', '21.5'), '21,5 °C', 'a measurement shows its value');
assert.equal(sword('light.qa_gruppe', 'on', { entity_id: ['light.qa_a'] }), 'An', 'a group on/off: its word');
assert.equal(sword('sensor.qa_code', 'pre_wash_x'), '', 'a raw code: nothing');
assert.equal(sword('lock.qa_tor', 'unavailable'), 'Offline');
assert.equal(sword('light.qa_a', 'unavailable'), 'Nicht verfügbar');

// ── Room symbols: the Studio's own (room_icon), else the bar's, else none (the sheet draws a house) ──
const deskIcons = { views: [
  { path: 'home', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Home' }] },
  { path: 'kueche', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Küche', variables: { room_icon: 'kitchen' } }] },
  { path: 'bad', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Bad', variables: { room_icon: '/local/own/bad.svg' } }] },
  { path: 'flur', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Flur' }] },
] };
deq(S.index(deskIcons, hass, { id: ME }, { url: 'qa-haus' }).rooms.map((r) => r.icon),
  ['/casora_assets/icons/kitchen.svg', '/local/own/bad.svg', null]);

// ── Pull down on Home shows the field (iOS style), scrolling past it hides it again ──
const vars = box.document.documentElement.style.vars;
const fire = (type, y, extra = {}) => (listeners[type] || []).forEach((fn) => fn({ type, touches: type === 'touchend' ? [] : [{ clientX: 200, clientY: y }],
  composedPath: () => [], preventDefault() {}, stopPropagation() {}, ...extra }));
const pullTo = (y0, y1) => { fire('touchstart', y0); for (let i = 1; i <= 6; i++) fire('touchmove', y0 + (y1 - y0) * i / 6); fire('touchend', y1); };
assert.equal(vars['--casora-search-reveal'], '0px', 'hidden at first');
pullTo(300, 340);
assert.equal(vars['--casora-search-reveal'], '0px', 'not on Home (no field): nothing');
box._casoraSearchHead = { isConnected: true };
box._casoraSearchOn = true;
pullTo(300, 330);
assert.equal(vars['--casora-search-reveal'], '0px', 'pulled a little: back to hidden');
pullTo(300, 360);
assert.equal(vars['--casora-search-reveal'], S.REVEAL + 'px', 'pulled past half: shown');
assert.equal(S.revealed(), true);
pullTo(400, 330);
assert.equal(vars['--casora-search-reveal'], '0px', 'pushed back up: hidden');
pullTo(300, 450);
box.scrollY = 200;
fire('scroll', 0);
assert.equal(vars['--casora-search-reveal'], '0px', 'scrolled down past it: hidden');
assert.equal(box.scrollY, 200 - S.REVEAL, 'the content keeps its place');
box.scrollY = 0;
pullTo(300, 450);
pullTo(300, 450);
assert.equal(S.revealed(), true);
box._casoraSearchOn = false;
S.reveal(false);
pullTo(300, 450);
assert.equal(S.revealed(), false, 'switched off in the Studio: no pull-down');
pullTo(300, 450);
box._casoraSearchOn = true;
box.scrollY = 120;
pullTo(300, 450);
assert.equal(S.revealed(), false, 'not at the top: no pull-down');
box.scrollY = 0;

// While pulling, only the field's card gets the values (a custom property on the page's root restyles every card on
// each move: the field stuttered on the iPhone); at rest the root follows, for a card drawn anew.
const cardVars = {};
box._casoraSearchHead = { isConnected: true, style: { setProperty(k, v) { cardVars[k] = v; } } };
S.reveal(false);
fire('touchstart', 300);
fire('touchmove', 320);
fire('touchmove', 360);
assert.equal(cardVars['--casora-search-reveal'], '36px', 'the card follows the finger');
assert.equal(vars['--casora-search-reveal'], '0px', 'the root stays untouched while pulling');
fire('touchend', 360);
assert.equal(cardVars['--casora-search-reveal'], S.REVEAL + 'px', 'let go past half: shown on the card');
assert.equal(vars['--casora-search-reveal'], S.REVEAL + 'px', 'and on the root');
// With frames: several moves in one frame draw once, with the latest position.
const frames = [];
box.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
box.cancelAnimationFrame = () => {};
S.reveal(false);
fire('touchstart', 300);
fire('touchmove', 310);
fire('touchmove', 320);
fire('touchmove', 330);
assert.equal(frames.length, 1, 'one frame for three moves');
assert.equal(cardVars['--casora-search-reveal'], '0px', 'nothing drawn before the frame');
frames.shift()();
assert.equal(cardVars['--casora-search-reveal'], '18px', 'the frame draws the latest position');
fire('touchmove', 360);
fire('touchend', 360);
assert.equal(cardVars['--casora-search-reveal'], S.REVEAL + 'px', 'let go before the next frame: the latest position decides');
delete box.requestAnimationFrame;
delete box.cancelAnimationFrame;
S.reveal(false);
box._casoraSearchHead = null;

console.log('search: ok');
