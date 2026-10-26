// #76: covers in "Security". Settings › Home & Devices › Security picks the covers that count (CASORA_SETTINGS.security);
// without any nothing changes. "Evening and night only" (default on) counts them from sunset to sunrise (sun.sun
// below_horizon, always without sun.sun). Open = state other than closed, or current_position > 0. Unavailable ones are
// left out of the count; garage doors/gates/doors already count as gates. Home only: the security badge counts them
// (summary icon "Jalousien offen"), the sub-badge "Jalousien · N geöffnet" opens a popup with "Schließen" / "Alle schließen".
//   node dev/unit/security_covers.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';
const groups = [];
window._casoraUI = {
  esc,
  line: (main, rest, o) => '<div class="hui-line" data-tone="' + esc((o && o.tone) || '') + '">' + esc(main) + (rest || []).map((r) => ' · ' + esc(r)).join('') + '</div>',
  group: (rows, label, act) => { groups.push({ label, rows, act }); return '<div class="g">' + esc(label) + '</div>'; },
  note: (t) => '<div class="note">' + esc(t) + '</div>',
};
window._casoraSoftKit = { secCard: (watch, code) => ({ watch, code }), layout: (o) => ({ o }) };
new Function(read('custom_components/casora/scripts/local/34-security-covers.js'))();
const C = window._casoraSecCovers;
assert.ok(C && C.scan && C.popup && C.sec, 'module loaded');
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'34-security-covers'"), 'module in MODULES');

const cv = (state, attrs) => ({ state, attributes: Object.assign({ friendly_name: 'X', supported_features: 15 }, attrs || {}) });
const states = {
  'cover.living': cv('open', { friendly_name: 'Wohnzimmer Terrasse', current_position: 100 }),
  'cover.kitchen': cv('open', { friendly_name: 'Küche', current_position: 40 }),
  'cover.bed': cv('closed', { friendly_name: 'Schlafzimmer', current_position: 0 }),
  'cover.office': cv('closed', { friendly_name: 'Büro' }),                     // no position attribute
  'cover.odd': cv('closed', { friendly_name: 'Klemmt', current_position: 5 }), // closed, but not fully: open
  'cover.moving': cv('closing', { friendly_name: 'Flur', current_position: 30 }),
  'cover.gone': cv('unavailable', { friendly_name: 'Bad' }),
  'cover.garage': cv('open', { friendly_name: 'Garage', device_class: 'garage' }),
  'cover.posonly': cv('open', { friendly_name: 'Dachfenster', current_position: 20, supported_features: 4 }),
  'sun.sun': { state: 'below_horizon', attributes: {} },
};
const hass = { states, entities: { 'cover.living': { area_id: 'wz' } }, devices: {}, areas: { wz: { name: 'Wohnzimmer' } } };
const set = (sec) => { window.CASORA_SETTINGS = sec === undefined ? {} : { security: sec }; };

// ── isOpen: not fully closed = open; unavailable = null ──
assert.equal(C.isOpen(states['cover.living']), true);
assert.equal(C.isOpen(states['cover.kitchen']), true, '40 % counts as open');
assert.equal(C.isOpen(states['cover.bed']), false);
assert.equal(C.isOpen(states['cover.office']), false, 'closed without position');
assert.equal(C.isOpen(states['cover.odd']), true, 'closed with position 5 is not fully closed');
assert.equal(C.isOpen(states['cover.moving']), true, 'closing is not closed yet');
assert.equal(C.isOpen(cv('open', { current_position: 0 })), true, 'state open counts even at position 0');
assert.equal(C.isOpen(cv('opening')), true);
assert.equal(C.isOpen(states['cover.gone']), null);
assert.equal(C.isOpen(cv('unknown')), null);
assert.equal(C.isOpen(undefined), null);

// ── off when nothing is picked: no count, no badge, nothing in the security badge ──
set(undefined);
assert.deepEqual(C.cfg(), { ids: [], night: true });
let r = C.scan(states, hass);
assert.equal(r.on, false); assert.equal(r.active, false); assert.equal(r.count, 0);
assert.equal(C.count(states, hass, null, { place: 'home' }), 0);
set({ covers: [] });
assert.equal(C.scan(states, hass).count, 0);

// ── picked covers, night window ──
const ALL = ['cover.living', 'cover.kitchen', 'cover.bed', 'cover.office', 'cover.odd', 'cover.moving', 'cover.gone', 'cover.garage', 'cover.posonly', 'cover.missing', 'light.no', 'cover.living'];
set({ covers: ALL });
assert.deepEqual(C.cfg().ids, ALL.filter((x, i) => x.startsWith('cover.') && ALL.indexOf(x) === i), 'covers only, no doubles');
r = C.scan(states, hass);
assert.deepEqual(r.open, ['cover.living', 'cover.kitchen', 'cover.odd', 'cover.moving', 'cover.posonly']);
assert.deepEqual(r.closed, ['cover.bed', 'cover.office']);
assert.deepEqual(r.dead, ['cover.gone', 'cover.missing'], 'unavailable and missing are left out of the count');
assert.ok(!r.ids.includes('cover.garage'), 'garage door counts as gate already');
assert.equal(r.count, 5, 'night: open ones count');
assert.equal(C.isNight(states), true);

const day = Object.assign({}, states, { 'sun.sun': { state: 'above_horizon', attributes: {} } });
assert.equal(C.isNight(day), false);
assert.equal(C.scan(day, hass).count, 0, 'by day nothing counts (evening and night only)');
assert.equal(C.scan(day, hass).active, false);
const noSun = Object.assign({}, states); delete noSun['sun.sun'];
assert.equal(C.isNight(noSun), true, 'without sun.sun: always');
assert.equal(C.scan(noSun, hass).count, 5);
set({ covers: ALL, covers_night: false });
assert.equal(C.scan(day, hass).count, 5, 'switch off: counts all day');

// ── Home only, "Wer sieht das?" ──
set({ covers: ['cover.living', 'cover.bed'] });
assert.equal(C.count(states, hass, null, { place: 'home' }), 1);
assert.equal(C.count(states, hass, null, { place: 'room' }), 0, 'a room badge does not count them');
assert.equal(C.count(states, hass, null, {}, 'home'), 1);
assert.equal(C.count(states, hass, null, {}, undefined), 0, 'phone room page (no card, no place): not Home');
window.casoraOnHomeView = (el) => el === 'HOME_CARD';
assert.equal(C.count(states, hass, null, {}, { x: 1 }), 0);
window.casoraOnHomeView = (el) => !!(el && el.home);
assert.equal(C.count(states, hass, null, {}, { home: true }), 1);
assert.equal(C.show(states, hass, null, {}, { home: true }), true);
assert.equal(C.show(day, hass, null, {}, { home: true }), false, 'no badge by day');
window.casoraSeesEntity = (id) => id !== 'cover.living';
assert.equal(C.count(states, hass, null, { place: 'home' }), 0, 'hidden for this user: not counted');
delete window.casoraSeesEntity;

// ── Summary of the security badge: icon with number, words ──
const sum = window.casoraSecuritySummary;
const base = { triggered: false, disarmed: false, locks: 0, lockDead: 0, doors: 0, windows: 1, doorsTilted: 0, windowsTilted: 0, gates: 0, camDead: 0 };
const s2 = Object.assign({}, base, { covers: 2, insecure: true, problem: false });
assert.equal(sum(s2, { summary: 'detailed' }).text, 'Fenster offen · 2 Jalousien offen');
assert.equal(sum(Object.assign({}, s2, { windows: 0, covers: 1 }), { summary: 'detailed' }).text, 'Jalousie offen');
const short = sum(s2, { summary: 'short' }).html;
assert.ok(short.includes('/i/cover_open.svg') && short.includes('>2</span>'), 'cover icon with its number');

// ── Security group badge: counts covers on Home (all four _sec copies), insecure in the night window ──
const G = T.casora_badge_security_group;
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
for (const k of ['extra_styles', 'icon', 'name']) assert.match(G[k], /_casoraSecCovers\.count\(states, hass, user, variables, this\)/, k);
assert.match(G.styles.card.find((e) => e['--casora-badge-icon-color'])['--casora-badge-icon-color'], /_casoraSecCovers\.count/);
const evalT = (src, vars, st) => new Function('states', 'hass', 'variables', 'user', 'entity', body(src))
  .call({}, st, Object.assign({}, hass, { states: st }), vars, null, null);
set({ covers: ['cover.living', 'cover.kitchen', 'cover.bed'] });
assert.equal(evalT(G.icon, { place: 'home' }, states), 'mdi:shield-alert', 'Home at night: open covers = not secure');
assert.equal(evalT(G.icon, { place: 'room' }, states), 'mdi:shield-check', 'room: covers do not count');
assert.equal(evalT(G.icon, { place: 'home' }, day), 'mdi:shield-check', 'by day: secure');
assert.match(evalT(G.name, { place: 'home' }, states), /2 Jalousien offen/, 'legacy sub-line names them');
set(undefined);
assert.equal(evalT(G.icon, { place: 'home' }, states), 'mdi:shield-check', 'feature off: nothing changes');

// ── Sub-badge and popup templates ──
const B = T.casora_badge_security_covers;
assert.deepEqual(B.template, ['casora_badge_base', 'casora_popup_security_covers']);
const P = T.casora_popup_security_covers;
assert.match(P.tap_action.casora_popup.content, /_casoraSecCovers\.popup/);
assert.match(P.tap_action.casora_popup.title, /'Jalousien'/);
set({ covers: ['cover.living', 'cover.kitchen', 'cover.bed'] });
const nm = new Function('states', 'hass', 'variables', 'user', 'entity', body(B.name)).call({}, states, hass, {}, null, null);
assert.match(nm, /badge-title">Jalousien</); assert.match(nm, /badge-sub">2 geöffnet</);
const disp = new Function('states', 'hass', 'variables', 'user', 'entity', body(B.styles.card[0].display));
assert.equal(disp.call({}, states, hass, { enabled: true }, null, null), 'inline-grid');
assert.equal(disp.call({}, day, hass, { enabled: true }, null, null), 'none', 'hidden by day');
assert.equal(disp.call({}, states, hass, { enabled: false }, null, null), 'none');

// Rows: after „Fenster" in the expanded row (desktop), the inline row (Home only) and the phone's Home row.
const after = (cards) => {
  const i = cards.findIndex((c) => c.template === 'casora_badge_security_covers');
  assert.ok(i > 0, 'card present');
  assert.equal(cards[i - 1].variables.contacts_kind, 'window', 'right after Fenster');
  return cards[i];
};
const R = T.casora_room.custom_fields;
assert.match(after(R.badges_security.card.cards).variables.enabled, /_casoraSecCovers\.show\(states,hass,user,variables,this\)/);
const inl = after(R.badges.card.cards);
assert.equal(inl.variables.inline, true); assert.match(inl.variables.enabled, /show_security_inline/);
const M = T.casora_mobile_sensor_chips.custom_fields;
assert.match(after(M.security_row.card.cards).variables.enabled, /_casoraSecCovers\.show\(states,hass,user,variables,'home'\)/);
// Phone room pages (derived from the room header) never ask for Home.
for (const k of ['rooms_row', 'room_sub_security']) {
  const c = M[k].card.cards.find((x) => x.template === 'casora_badge_security_covers');
  assert.ok(c, k);
  assert.match(c.variables.enabled, /_casoraSecCovers\.show\(states,hass,user,_rv\)/, k + ': no card, no Home');
}

// ── Popup: open ones first with „Schließen", „Alle schließen" for the open ones, then „Geschlossen" ──
set({ covers: ['cover.living', 'cover.kitchen', 'cover.bed', 'cover.gone', 'cover.posonly', 'cover.moving'] });
const pop = C.popup(states, hass, {});
assert.deepEqual(pop.o.top, ['hero']);
assert.ok(pop.o.fields.list.card.watch.includes('sun.sun') && pop.o.fields.list.card.watch.includes('cover.kitchen'), 'live on covers and sun');
const hero = C.sec('hero', null, states, hass);
assert.match(hero, /4 von 6 geöffnet · Bis Sonnenaufgang/);
assert.match(hero, /data-tone="warn"/);
groups.length = 0;
C.sec('list', null, states, hass);
assert.deepEqual(groups.map((g) => g.label), ['Offen', 'Geschlossen', 'Nicht verfügbar']);
const open = groups[0];
assert.deepEqual(open.rows.map((x) => x.label), ['Wohnzimmer Terrasse', 'Küche', 'Dachfenster', 'Flur']);
assert.equal(open.rows[0].action, 'Schließen');
assert.deepEqual(open.rows[0].svc, { domain: 'cover', service: 'close_cover', data: { entity_id: 'cover.living' } });
assert.equal(open.rows[0].sub, 'Wohnzimmer · Geöffnet');
assert.equal(open.rows[1].sub, '40 % geöffnet');
assert.deepEqual(open.rows[2].svc, { domain: 'cover', service: 'set_cover_position', data: { entity_id: 'cover.posonly', position: 0 } },
  'without CLOSE: position 0');
assert.equal(open.rows[3].action, undefined, 'already closing: no button');
assert.equal(open.rows[3].value, 'Schließt');
assert.deepEqual(open.act.svc, { domain: 'cover', service: 'close_cover', data: { entity_id: ['cover.living', 'cover.kitchen', 'cover.moving'] } },
  '„Alle schließen" only for covers with CLOSE');
assert.equal(open.act.text, 'Alle schließen');
assert.equal(groups[1].rows[0].value, 'Geschlossen');
assert.equal(groups[2].rows[0].value, 'Nicht verfügbar');
// One open cover: no „Alle schließen".
set({ covers: ['cover.living', 'cover.bed'] });
groups.length = 0;
C.sec('list', null, states, hass);
assert.equal(groups[0].act, null);
// Everything closed / by day.
set({ covers: ['cover.bed', 'cover.office'] });
assert.match(C.sec('hero', null, day, hass), /Alle geschlossen · Ab Sonnenuntergang/);
set({ covers: ['cover.bed'], covers_night: false });
assert.equal(C.sec('hero', null, day, hass), '<div class="hui-line" data-tone="">Geschlossen</div>');

// ── Studio and storage: section "security" is stored by the integration and listed under Home & Devices ──
assert.match(read('custom_components/casora/settings.py'), /SECTIONS = \([^)]*"security"/);
const st = read('custom_components/casora/panel/casora-panel-settings.js');
assert.match(st, /personal: \["waste", "contacts", "security"/);
assert.match(st, /focus: "security"[^}]*kw: "[^"]*rollo[^"]*rollladen[^"]*jalousie/);
const pers = read('custom_components/casora/panel/casora-panel-personal.js');
assert.match(pers, /want\("security"\)/);
assert.match(pers, /covers_night = false/);

console.log('security_covers: ok');
