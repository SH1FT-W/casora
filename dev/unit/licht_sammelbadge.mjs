// dashfix (06.10.2026): Beleuchtung-Sammel-Badge und Licht-Chips.
// - Halten auf „Beleuchtung“ öffnete ohne browser_mod HAs Dialog der Hilfsentität
//   („Expanded Badge Row / lights / none“) → jetzt Casora-Licht-Popup oder nichts.
// - Das Licht-Popup aus dem Sammel-Badge listete die Hilfsentität als Leuchte („Aus“, obwohl der
//   Badge „An“ sagte) → Lichter kommen aus den Badge-Variablen, nie eine Nicht-Licht-Entität.
// - Licht-Chips (Gruppe je Raum) reagierten auf Tippen nicht (fire-dom-event ohne Popup-Inhalt).
//   node dev/unit/licht_sammelbadge.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Quelle statt Paket: das Paket ist seit 1.3 ohne Einrückung/Kommentare (tools/js_schlank.py).
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));

const hold = T.casora_badge_light_group.hold_action;
assert.ok(!('browser_mod' in hold), 'kein browser_mod-Altpfad mehr');
assert.ok(/casoraPopupAction\(\) === 'fire-dom-event' \? 'fire-dom-event' : 'none'/.test(hold.action), 'Halten: Casora-Popup oder nichts');
assert.ok(!/more-info/.test(hold.action), 'Halten: nie more-info der Hilfsentität');

const chip = T.casora_badge_light;
assert.deepEqual([].concat(chip.template), ['casora_badge_base', 'casora_popup_light'], 'Chip erbt den Popup-Inhalt');
assert.ok(T.casora_popup_light.tap_action.casora_popup, 'casora_popup_light liefert casora_popup');

const lpc = T.casora_popup_light.custom_fields.lpc_init;
// Review 2 (E08): the badge's lights are resolved in window._casoraLightScope (01-basis.js), shared by tile, badge,
// popup and Studio; the popup calls it.
assert.ok(lpc.includes('window._casoraLightScope(entity, states, hass, variables)'), 'LPC uses the shared scope');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const b0 = basis.indexOf('window._casoraLightScope = function');
new Function(basis.slice(b0, basis.indexOf('window.casoraRoomTempOf = function', b0)))();
window._casoraHouseLights = () => ({ rooms: [], ids: [], subs: [] });
const norm = (entity, vars) => window._casoraLightScope(entity, {}, null, vars).variables;
const sel = { entity_id: 'input_select.casora_expanded_row', state: 'none' };
// #80 (26.10.63): lamps picked in the badge win over its HA group; the group alone still shows the group.
assert.equal(norm(sel, { light_group_entity: 'light.alle', entity_1: 'light.a', lights: [] }).popup_group, 'light.a', 'picked lamp before the group');
assert.equal(norm(sel, { light_group_entity: 'light.alle', lights: [] }).popup_group, 'light.alle', 'group alone');
assert.equal(norm(sel, { entity_1: 'light.wz', lights: [] }).popup_group, 'light.wz', 'ein Raumlicht');
const two = norm(sel, { entity_1: 'light.a', entity_2: 'light.b', entity_10: 'light.c', lights: [] });
assert.deepEqual(two.lights, ['light.a', 'light.b', 'light.c'], 'mehrere Raumlichter als Liste');
assert.equal(norm({ entity_id: 'light.x' }, { lights: [] }).popup_group, undefined, 'echtes Licht bleibt unverändert');
assert.equal(norm(sel, { popup_group: 'light.g', entity_1: 'light.a' }).popup_group, 'light.g', 'eigene popup_group gewinnt');
assert.ok(basis.includes("if (!lightIds.length && groupId && S[groupId] && String(groupId).indexOf('light.') === 0) lightIds.push(groupId);"),
  'nie eine Nicht-Licht-Entität als Leuchte');

// One count (review 2, E08/fam-09/DH-16): rooms for a house or a group of room groups, lamps otherwise; words with
// the unit. Badge, tile and popup status line all go through casoraLightTally.
{
  const on = (id) => ({ entity_id: id, state: 'on', attributes: { brightness: 255 } });
  const off = (id) => ({ entity_id: id, state: 'off', attributes: {} });
  const grp = (id, m, st) => ({ entity_id: id, state: st, attributes: { entity_id: m } });
  const S = {
    'light.ku_1': on('light.ku_1'), 'light.ga_1': on('light.ga_1'), 'light.ga_2': on('light.ga_2'), 'light.ga_3': off('light.ga_3'),
    'light.wz_1': off('light.wz_1'),
    'light.kueche': grp('light.kueche', ['light.ku_1'], 'on'), 'light.garage': grp('light.garage', ['light.ga_1', 'light.ga_2', 'light.ga_3'], 'on'),
    'light.wohnzimmer': grp('light.wohnzimmer', ['light.wz_1'], 'off'),
    'light.haus': grp('light.haus', ['light.kueche', 'light.garage', 'light.wohnzimmer'], 'on'),
  };
  const T1 = (e, v) => window.casoraLightTally(e, S, null, v);
  const W = window.casoraLightTallyText;
  // House tile over a group of room groups with rooms: 2 of 3 rooms (3 lamps on).
  assert.deepEqual(T1(S['light.haus'], { group_rooms: true }), { kind: 'rooms', tot: 3, on: 2 });
  assert.equal(W(T1(S['light.haus'], { group_rooms: true })), '2 Räume an');
  // The badge with the same group as its rooms counts the same.
  assert.equal(W(T1(sel, { entity_1: 'light.kueche', entity_2: 'light.garage', entity_3: 'light.wohnzimmer' })), '2 Räume an');
  // A room: its lamps.
  assert.deepEqual(T1(S['light.garage'], {}), { kind: 'lamps', tot: 3, on: 2 });
  assert.equal(W(T1(S['light.garage'], {})), '2 An');
  assert.equal(W({ kind: 'rooms', tot: 3, on: 1 }), '1 Raum an');
  assert.equal(W({ kind: 'rooms', tot: 3, on: 0 }), 'Alle aus');
  assert.equal(W({ kind: 'rooms', tot: 3, on: 3 }), 'Alle An');
  assert.equal(W({ kind: 'lamps', tot: 1, on: 1 }), 'An');
  // Tile and badge templates use it; the popup's house line says the same rooms.
  assert.ok(T.casora_light.state_display.includes('window.casoraLightTally('), 'tile');
  assert.ok(T.casora_badge_light_group.name.includes('window.casoraLightTally('), 'badge');
  const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
  assert.ok(pop.includes("' von ' + cfg.rooms.length + ' Räumen an'"), 'popup: n of m rooms');
  const studio = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
  assert.ok(studio.includes('window.casoraLightTally(ent, states || {}, hass, V)'), 'Studio preview');
  console.log('ok one light count');
}
assert.ok(/window\._casoraLPCv !== (\d+)/.test(lpc) && Number(lpc.match(/window\._casoraLPCv !== (\d+)/)[1]) >= 79, 'LPC-Version erhöht');
console.log('ok licht_sammelbadge');
