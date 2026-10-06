// dashfix (06.10.2026): Beleuchtung-Sammel-Badge und Licht-Chips.
// - Halten auf „Beleuchtung“ öffnete ohne browser_mod HAs Dialog der Hilfsentität
//   („Expanded Badge Row / lights / none“) → jetzt Casora-Licht-Popup oder nichts.
// - Das Licht-Popup aus dem Sammel-Badge listete die Hilfsentität als Leuchte („Aus“, obwohl der
//   Badge „An“ sagte) → Lichter kommen aus den Badge-Variablen, nie eine Nicht-Licht-Entität.
// - Licht-Chips (Gruppe je Raum) reagierten auf Tippen nicht (fire-dom-event ohne Popup-Inhalt).
//   node dev/unit/licht_sammelbadge.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;

const hold = T.casora_badge_light_group.hold_action;
assert.ok(!('browser_mod' in hold), 'kein browser_mod-Altpfad mehr');
assert.ok(/casoraPopupAction\(\) === 'fire-dom-event' \? 'fire-dom-event' : 'none'/.test(hold.action), 'Halten: Casora-Popup oder nichts');
assert.ok(!/more-info/.test(hold.action), 'Halten: nie more-info der Hilfsentität');

const chip = T.casora_badge_light;
assert.deepEqual([].concat(chip.template), ['casora_badge_base', 'casora_popup_light'], 'Chip erbt den Popup-Inhalt');
assert.ok(T.casora_popup_light.tap_action.casora_popup, 'casora_popup_light liefert casora_popup');

const lpc = T.casora_popup_light.custom_fields.lpc_init;
const m = lpc.match(/        let variables = __vars \|\| \{\};[\s\S]*?variables = Object\.assign\(\{\}, variables, _vx\);\n        \}\n/);
assert.ok(m, 'Angleichung im LPC fehlt');
const norm = (entity, vars) => new Function('__vars', 'entity', m[0] + 'return variables;')(vars, entity);
const sel = { entity_id: 'input_select.casora_expanded_row', state: 'none' };
assert.equal(norm(sel, { light_group_entity: 'light.alle', entity_1: 'light.a', lights: [] }).popup_group, 'light.alle', 'Gruppe zuerst');
assert.equal(norm(sel, { entity_1: 'light.wz', lights: [] }).popup_group, 'light.wz', 'ein Raumlicht');
const two = norm(sel, { entity_1: 'light.a', entity_2: 'light.b', entity_10: 'light.c', lights: [] });
assert.deepEqual(two.lights, ['light.a', 'light.b', 'light.c'], 'mehrere Raumlichter als Liste');
assert.equal(norm({ entity_id: 'light.x' }, { lights: [] }).popup_group, undefined, 'echtes Licht bleibt unverändert');
assert.equal(norm(sel, { popup_group: 'light.g', entity_1: 'light.a' }).popup_group, 'light.g', 'eigene popup_group gewinnt');
assert.ok(lpc.includes("if (!lightIds.length && groupId && states[groupId] && String(groupId).startsWith('light.')) lightIds.push(groupId);"),
  'nie eine Nicht-Licht-Entität als Leuchte');
assert.ok(/window\._casoraLPCv !== (\d+)/.test(lpc) && Number(lpc.match(/window\._casoraLPCv !== (\d+)/)[1]) >= 79, 'LPC-Version erhöht');
console.log('ok licht_sammelbadge');
