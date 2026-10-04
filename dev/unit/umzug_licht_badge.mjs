// Umzug Hemma → Casora: Beleuchtungs-Badge mit nur einer Lichtgruppe.
//   node dev/unit/umzug_licht_badge.mjs
// Gemeldet (Umzugstest): Hemma 2 trägt in der Übersicht nur light_group_entity ein (kein
// light_entity_N). Hemma zeigte dort „Lights“, Casora blendete das Badge aus (zählte nur
// entity_1…8), obwohl die Studio-Vorschau es zeigte. Erwartet: sichtbar, zählt die Lichter der
// Gruppe, Symbol leuchtet, wenn eins an ist.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const B = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const js = (s) => String(s).replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (expr, variables, states) => new Function('variables', 'hass', 'states', 'entity', js(expr))(variables, { states }, states, null);

const states = {
  'light.alle_lichter_test': { state: 'on', attributes: { entity_id: ['light.a', 'light.b', 'light.c'] } },
  'light.a': { state: 'on', attributes: {} },
  'light.b': { state: 'off', attributes: {} },
  'light.c': { state: 'off', attributes: {} },
};
for (const [name, tpls] of [['Quelle', T], ['Paket', B]]) {
  const t = tpls.casora_badge_light_group;
  const card = t.styles.card;
  const style = (k) => card.find((d) => k in d)[k];
  const v = { enabled: true, light_group_entity: 'light.alle_lichter_test' };
  assert.equal(run(style('display'), v, states), 'inline-grid', name + ': Badge mit nur Lichtgruppe sichtbar');
  assert.match(run(t.extra_styles, v, states), /display:inline-block/, name + ': extra_styles blendet nicht aus');
  assert.match(run(t.name, v, states), /1 An/, name + ': zählt die Lichter der Gruppe');
  assert.equal(run(style('--casora-badge-tone'), v, states), 'initial', name + ': Symbol leuchtet bei einem Licht an');
  // Ohne alles bleibt es aus, mit Einzel-Lichtern wie bisher.
  assert.equal(run(style('display'), { enabled: true }, states), 'none', name + ': ohne Lichter aus');
  assert.match(run(t.name, { enabled: true, entity_1: 'light.b', entity_2: 'light.c' }, states), /Aus/, name + ': Einzel-Lichter wie bisher');
}

console.log('ok umzug_licht_badge');
