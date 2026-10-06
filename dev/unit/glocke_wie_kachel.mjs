// B-NOTI: Ein Eintrag in der Glocke öffnet dasselbe Popup wie der Tipp auf die Kachel – die Kachel
// der Entität (eigene Entität vor Variable vor Liste, Kachel vor Badge, sichtbar vor versteckt),
// mit src (Ring/Kopf im Weich-Look); für Geräte mit eigener Kachel nie die Karte eines anderen Geräts.
//   node dev/unit/glocke_wie_kachel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const pick = (re) => { const m = core.match(re); assert.ok(m, String(re)); return m[0]; };
const src = [
  pick(/  function templatesOf\(cfg\) \{[\s\S]*?\n  \}\n/),
  pick(/  function wants\(cfg, names, entityId\) \{[\s\S]*?\n  \}\n/),
  pick(/  function tileFor\(entityId\) \{[\s\S]*?\n  \}\n/),
  pick(/  var OWN_TILE = [^\n]+\n/),
  pick(/  function cardWithTemplate\(names, entityId\) \{[\s\S]*?\n  \}\n/),
].join('\n');
const card = (template, cfg, shown = true) => ({ _config: { template, tap_action: { casora_popup: {} }, ...cfg },
  getClientRects: () => (shown ? [1] : []), shadowRoot: null });
const make = (cards) => {
  const document = { querySelectorAll: (sel) => (sel === 'button-card' ? cards : []) };
  return new Function('document', src + ' return { tileFor, wants, cardWithTemplate, OWN_TILE };')(document);
};
const lockGroup = card('casora_badge_lock_group', { variables: { locks: ['lock.a', 'lock.b'] } });
const lockB = card('casora_lock', { entity: 'lock.b' });
const alarmTile = card(['casora_alarm'], { variables: { alarm_entity: 'alarm_control_panel.x' } });
const alarmBadge = card('casora_badge_security', { entity: 'alarm_control_panel.x' });
let G = make([lockGroup, lockB, alarmBadge, alarmTile]);
assert.equal(G.tileFor('lock.b'), lockB, 'Schloss: eigene Kachel vor Gruppen-Badge');
assert.equal(G.tileFor('lock.a'), lockGroup, 'Schloss ohne Kachel: Gruppe, in deren Liste es steht');
assert.equal(G.tileFor('alarm_control_panel.x'), alarmTile, 'Alarm: Kachel (alarm_entity) vor Badge');
assert.equal(G.tileFor('lock.zzz'), null);
// Liste in Variablen zählt beim Suchen nach Vorlage; Gerät mit eigener Kachel nie fremde Karte.
G = make([card('casora_badge_lock_group', { variables: { locks: ['lock.a'] } })]);
assert.equal(G.cardWithTemplate(['casora_badge_lock_group'], 'lock.other'), null, 'fremde Tür: keine Karte');
assert.ok(G.cardWithTemplate(['casora_badge_lock_group'], 'lock.a'), 'eigene Tür in der Liste');
G = make([card('casora_battery', {})]);
assert.ok(G.cardWithTemplate(['casora_battery'], 'sensor.x_akku'), 'Sammel-Einträge (Akku) dürfen weiter jede Karte der Vorlage nehmen');
// Glocke öffnet mit src (Ring/Kopf wie beim Antippen)
assert.ok(core.includes("window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: card }));"), 'tapCard mit src');
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
assert.ok(basis.includes('window._casoraTapTile(entityId'), 'Einträge ohne opens: erst die sichtbare Kachel');
assert.ok(basis.includes("window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el }));"), 'verdeckte Karte mit src');
console.log('ok glocke_wie_kachel');
