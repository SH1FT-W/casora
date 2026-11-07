// Issue #141: an alarm panel leaves bedroom windows out while someone is home (open for air) and watches them all
// when everyone is away. Casora's security badge called such a window "not secure" all evening.
// Settings › Doors and windows › "Counts only when nobody is home" (contacts.away_only). Expected: while the house is
// not away (securityAway) the window drops out of every group (the counts) but stays listed as quiet for the popups; with everyone gone or the alarm armed
// away it counts again; without any person or alarm panel nobody can tell, so it counts. Names made up.
//   node dev/unit/contacts_away_only.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#contacts,casoraContacts,casoraHouseContacts
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();

const st = (state, attrs) => ({ state, attributes: attrs || {} });
const WIN = 'binary_sensor.bedroom_window', DOOR = 'binary_sensor.front_door';
const base = () => ({ [WIN]: st('on', { device_class: 'window' }), [DOOR]: st('off', { device_class: 'door' }) });
const counted = (states) => window.casoraHouseContacts({ states, entities: {}, devices: {}, areas: {} }).sort();

window.CASORA_SETTINGS = { contacts: { away_only: [WIN] } };
const home = { ...base(), 'person.alex': st('home'), 'person.sam': st('not_home') };
assert.deepEqual(counted(home), [DOOR], 'someone home: the airing window does not count');
const quietOf = (states) => window.casoraContacts({ states, entities: {}, devices: {}, areas: {} }).quiet;
assert.deepEqual(quietOf(home), [WIN], 'someone home: it stays listed (quiet) for the popups');
assert.deepEqual(quietOf({ ...base(), 'person.alex': st('not_home') }), [], 'all away: nothing quiet');
assert.deepEqual(counted({ ...base(), 'person.alex': st('not_home'), 'person.sam': st('work') }), [DOOR, WIN].sort(), 'all away: it counts');
assert.deepEqual(counted({ ...home, 'alarm_control_panel.house': st('armed_away') }), [DOOR, WIN].sort(), 'alarm armed away: it counts');
assert.deepEqual(counted({ ...home, 'alarm_control_panel.house': st('armed_home') }), [DOOR], 'alarm armed home: still left out');
assert.deepEqual(counted(base()), [DOOR, WIN].sort(), 'no person, no alarm: nobody can tell, it counts');

window.CASORA_SETTINGS = {};
assert.deepEqual(counted(home), [DOOR, WIN].sort(), 'without the setting: as before');
window.CASORA_SETTINGS = { contacts: { away_only: [WIN], hidden: [DOOR] } };
assert.deepEqual(counted(home), [], 'hidden and away-only together');
window.CASORA_SETTINGS = { contacts: { away_only: [WIN], hidden: [WIN] } };
assert.deepEqual([counted(home), quietOf(home)], [[DOOR], []], 'hidden wins: not listed as quiet');
window.CASORA_SETTINGS = { contacts: { away_only: 'nonsense' } };
assert.deepEqual(counted(home), [DOOR, WIN].sort(), 'an odd value changes nothing');

// The card asks through its own states: it must read the persons, or it would not redraw when someone leaves.
window.CASORA_SETTINGS = { contacts: { away_only: [WIN] } };
const read = new Set();
const raw = { ...home };
const proxy = new Proxy(raw, { get: (t, k) => { read.add(k); return t[k]; } });
window.casoraContacts({ states: proxy, entities: {}, devices: {}, areas: {} });
assert.ok(read.has('person.alex') && read.has('person.sam'), 'persons read through the card');
// Sub-badge „Fenster“ on Home keeps it (shown, not warning): listed, and its level is ok while someone is home.
window.CASORA_SETTINGS = { contacts: { away_only: [WIN] } };
const hh = { states: home, entities: {}, devices: {}, areas: {} };
assert.ok(window.casoraHouseContactsOf(hh, { place: 'home' }, 'window').includes(WIN), 'the window sub-badge lists it');
assert.equal(window.casoraSecurityLevel(hh, [WIN]), 'ok', 'someone home: no warning colour');
const ha = { states: { ...base(), 'person.alex': st('not_home') }, entities: {}, devices: {}, areas: {} };
assert.equal(window.casoraSecurityLevel(ha, [WIN]), 'alarm', 'everyone away: open window is an alarm again');
// The doors/windows popups (house popup, alarm popup, security badge popup) list the quiet one in a group of its own,
// open but without the warning tone.
{
  const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
  const hp = { states: home, entities: {}, devices: {}, areas: {} };
  for (const name of ['casora_popup_contacts', 'casora_popup_alarm', 'casora_badge_security']) {
    for (const soft of [true, false]) {
      const groups = [];
      window._casoraUI = { soft: () => soft, hero: () => '', line: () => '', group: (r, label) => { groups.push({ label, rows: r }); return ''; },
        col: () => '', cols: () => '', rows: () => '', label: () => '' };
      const body = tpl[name].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
      try { new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body)(hp.states, { entity_id: DOOR }, {}, hp, {}, null); } catch (e) { /* the rest needs more */ }
      const q = groups.find((g) => g.label === 'Zählt nur bei Abwesenheit');
      const tag = name + (soft ? ' soft' : '');
      assert.ok(q, tag + ': group „Zählt nur bei Abwesenheit“ ' + JSON.stringify(groups.map((g) => g.label)));
      const row = q.rows.find((r) => r.entity === WIN);
      assert.ok(row && /Geöffnet|Gekippt/.test(row.value), tag + ': the window, open');
      assert.ok(!row.valueTone && !row.iconTone && !row.active, tag + ': no warning tone');
      assert.ok(!groups.some((g) => g !== q && g.rows.some((r) => r.entity === WIN)), tag + ': only there');
    }
  }
}
console.log('ok contacts_away_only');
