// 07.10.2026 (klein1):
// - Licht-Chip mit einem einzelnen Licht öffnet das Casora-Licht-Popup (vorher HAs Dialog), wie
//   die Gruppen-Chips; andere Geräte und ausgeschaltete Popups bleiben beim HA-Dialog.
// - Gewählte Lichtfarbe im Gruppen-Licht-Popup (Weich) als dunkle Pille wie Weißton/Effekte im
//   Einzel-Licht-Popup (vorher helle Pille).
// - Name der Handy-Übersicht/Raumname: nur den Textknoten ändern, nie textContent (löschte Lits
//   Platzhalter → Fehler „nextSibling“ auf der Sicherheit-Seite, r54).
//   node dev/unit/licht_chip_markierung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

// Licht-Chip: Aktion je Entität
const act = body(T.casora_badge_light.tap_action.action);
const run = (id, states, popup = 'fire-dom-event') =>
  new Function('window', 'entity', 'states', act)({ casoraPopupAction: () => popup }, id ? { entity_id: id } : null, states);
const S = {
  'light.flur': { state: 'on', attributes: { entity_id: ['light.a', 'light.b'] } },
  'light.a': { state: 'on', attributes: {} },
  'switch.lampe': { state: 'on', attributes: {} },
};
assert.equal(run('light.flur', S), 'fire-dom-event', 'Gruppe: Casora-Popup');
assert.equal(run('light.a', S), 'fire-dom-event', 'einzelnes Licht: Casora-Popup');
assert.equal(run('switch.lampe', S), 'more-info', 'kein Licht: HA-Dialog');
assert.equal(run('light.fehlt', S), 'more-info', 'Licht fehlt: HA-Dialog');
assert.equal(run('light.a', S, 'more-info'), 'more-info', 'Casora-Popups aus: HA-Dialog');
assert.ok(JSON.stringify(T.casora_badge_light.template).includes('casora_popup_light'), 'Chip bringt das Licht-Popup mit');

// Markierung der Lichtfarbe (Gruppe) = Weißton/Effekte (Einzel)
const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const on = pop.match(/'\.lps-sg\.on\{([^}]*)\}'/);
assert.ok(on, '.lps-sg.on-Stil fehlt');
assert.ok(/background:var\(--casora-popup-tiles-text-primary/.test(on[1]) && /color:var\(--casora-popup-ui-on-ink/.test(on[1]),
  'Gruppe: dunkle Pille wie im Einzel-Licht-Popup – ' + on[1]);
const single = T.casora_light.tap_action.casora_popup.content;
assert.ok(single.includes(".hl-seg .hui-sg.on{background:' + T.ink + ';color:var(--casora-popup-ui-on-ink"), 'Einzel: Weißton/Effekte wie bisher');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.ok(/ink:\s+'var\(--casora-popup-tiles-text-primary/.test(core), 'T.ink = --casora-popup-tiles-text-primary');

// Namen ohne textContent setzen
for (const [tpl, key] of [['casora_mobile_weather', '--casora-name-literal'], ['casora_room', '--casora-name-literal']]) {
  const s = JSON.stringify(T[tpl].styles.card.find((x) => x[key]));
  assert.ok(!/\.textContent = want/.test(s) && s.includes('tn.data = want'), tpl + ': Name über den Textknoten');
}
console.log('ok licht_chip_markierung');
