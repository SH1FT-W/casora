// R-01: „Wer sieht das?“ ist nur Ausblenden – aber Casora selbst holt eine für den Benutzer
// ausgeblendete Kachel nicht über die Glocke oder ein Sammel-Popup wieder hervor.
// hiddenForUser (casora-core.js): verborgen nur, wenn die Entität im Dashboard ausschließlich in
// Karten/Ansichten steht, die die Bedingung „user“ für diesen Benutzer ausblendet.
//   node dev/unit/wer_sieht_glocke.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const m = core.match(/  function hiddenForUser\(cfg, entityId, uid(?:, rooms)?\) \{[\s\S]*?\n  \}\n/);
assert.ok(m, 'hiddenForUser fehlt');
const hiddenForUser = new Function(m[0] + ' return hiddenForUser;')();

const only = (...users) => [{ condition: 'user', users }];
const lockTile = (extra) => ({ type: 'custom:button-card', template: 'casora_lock', entity: 'lock.tuer', ...extra });
const cfg = (cards, view) => ({ views: [{ path: 'a', cards, ...(view || {}) }] });

// Kachel nur für A: B sieht sie nicht, A schon.
let c = cfg([lockTile({ visibility: only('A') })]);
assert.equal(hiddenForUser(c, 'lock.tuer', 'B'), true, 'B ausgeschlossen');
assert.equal(hiddenForUser(c, 'lock.tuer', 'A'), false, 'A erlaubt');
assert.equal(hiddenForUser(c, 'lock.tuer', null), true, 'ohne Benutzer: verborgen');
// Bedingung an der Hülle (conditional) bzw. an der Kachelreihe vererbt sich nach innen.
c = cfg([{ type: 'conditional', visibility: only('A'), conditions: [], card: lockTile() }]);
assert.equal(hiddenForUser(c, 'lock.tuer', 'B'), true, 'Hülle');
c = cfg([{ type: 'custom:casora-smart-row', cards: [lockTile({ visibility: only('A') }), lockTile({ entity: 'lock.keller' })] }]);
assert.equal(hiddenForUser(c, 'lock.tuer', 'B'), true, 'in der Reihe');
assert.equal(hiddenForUser(c, 'lock.keller', 'B'), false, 'Nachbar in der Reihe bleibt');
// Raum (Ansicht) nur für A: alles darin für B verborgen.
c = cfg([lockTile()], { visible: [{ user: 'A' }] });
assert.equal(hiddenForUser(c, 'lock.tuer', 'B'), true, 'Ansicht');
assert.equal(hiddenForUser(c, 'lock.tuer', 'A'), false);
// Steht die Entität noch irgendwo sichtbar (z. B. Gruppen-Badge mit Liste), darf sie aufgehen.
c = cfg([lockTile({ visibility: only('A') }),
  { type: 'custom:button-card', template: 'casora_badge_lock_group', variables: { locks: ['lock.tuer'] } }]);
assert.equal(hiddenForUser(c, 'lock.tuer', 'B'), false, 'anderswo sichtbar');
// Alarm über Variable (alarm_entity) und Liste „entities“.
c = cfg([{ type: 'custom:button-card', template: 'casora_alarm', variables: { alarm_entity: 'alarm_control_panel.x' }, visibility: only('A') }]);
assert.equal(hiddenForUser(c, 'alarm_control_panel.x', 'B'), true, 'Variable');
c = cfg([{ type: 'entities', entities: [{ entity: 'light.a' }, 'light.b'], visibility: only('A') }]);
assert.equal(hiddenForUser(c, 'light.b', 'B'), true, 'entities-Liste');
// Nirgends im Dashboard: nicht eingeschränkt (Glocke darf wie bisher eine Kachel nachbauen).
assert.equal(hiddenForUser(c, 'lock.irgendwo', 'B'), false, 'nicht im Dashboard');
// Raum für alle ausgeblendet (users: [], visible: false) ist keine Frage, wer es sieht.
c = cfg([lockTile({ visibility: only() })], { visible: false });
assert.equal(hiddenForUser(c, 'lock.tuer', 'B'), false, 'vorübergehend ausgeblendeter Raum');

// Einbau: Glocke (openTarget) und Einträge/Sammel-Popups (openViaCard) fragen erst den Wächter;
// verborgen → kein Popup und kein HA-Dialog.
assert.ok(/function openTarget\(what, fallbackEntity\) \{\n    userGuard\(fallbackEntity,/.test(core), 'openTarget über userGuard');
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
assert.ok(basis.includes('if (!checked && window.casoraUserGuard)') && basis.includes('function () { done(true); }'), 'openViaCard über casoraUserGuard');
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.ok(en.exact['Dieses Gerät ist für dich ausgeblendet'], 'Hinweis auf Englisch');
console.log('ok wer_sieht_glocke');
