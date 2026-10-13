// Community-Karten (1.5): Die Prüfung lässt nur Daten durch, nie Code oder Aktionen.  node dev/unit/community_pruefung.mjs
// Gleiche Funktion prüft beim Teilen, in der GitHub-Action (tools/community-check.mjs) und beim Hinzufügen.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-community.js', import.meta.url), 'utf8');
const mod = { exports: {} };
new Function('module', 'window', src)(mod, {});
const C = mod.exports;
assert.ok(C.validate && C.share && C.materialize, 'Bausteine fehlen');

const good = { v: 1, template: 'casora_vacuum', name: 'Saugroboter', entity: '@slot:1',
  variables: { entity_status: '@slot:2', icon: 'robot-vacuum', show_toggle: true, levels: [1, 2, 3] },
  slots: [{ id: 1, domain: 'vacuum', label: 'Saugroboter' }, { id: 2, domain: 'sensor', label: 'Status' }] };
assert.equal(C.validate(good).ok, true, 'gute Karte geht durch: ' + C.validate(good).errors.join(', '));

const bad = (label, mut) => {
  const c = JSON.parse(JSON.stringify(good)); mut(c);
  const r = C.validate(c);
  assert.equal(r.ok, false, 'muss abgelehnt werden: ' + label);
};
// Code
bad('Formel im Namen', (c) => { c.name = '[[[ fetch("//x") ]]]'; });
bad('Formel in Variable', (c) => { c.variables.icon = '[[[ return 1 ]]]'; });
bad('Formel in Liste', (c) => { c.variables.levels = ['ok', ']]] x [[[']; });
bad('HTML', (c) => { c.name = '<img src=x onerror=alert(1)>'; });
bad('Event-Handler-Text', (c) => { c.variables.icon = 'x onload=alert(1)'; });
bad('Jinja', (c) => { c.variables.icon = '{{ states("lock.tuer") }}'; });
bad('Template-Literal', (c) => { c.variables.icon = '${alert(1)}'; });
bad('javascript-Link', (c) => { c.variables.icon = 'javascript:alert(1)'; });
bad('Link', (c) => { c.variables.icon = 'https://evil.example/x.js'; });
// Aktionen und Karten
bad('tap_action oben', (c) => { c.tap_action = { action: 'perform-action', perform_action: 'lock.unlock' }; });
bad('Aktion als Variable', (c) => { c.variables.tap_action = 'toggle'; });
bad('Dienst als Variable', (c) => { c.variables.service = 'lock.unlock'; });
bad('eigene Karte', (c) => { c.variables.card = 'x'; });
bad('custom_fields', (c) => { c.custom_fields = { x: '[[[ 1 ]]]' }; });
bad('styles', (c) => { c.styles = { card: [{ background: 'url(javascript:1)' }] }; });
bad('verschachteltes Objekt', (c) => { c.variables.icon = { a: 1 }; });
bad('Objekt in Liste', (c) => { c.variables.levels = [{ a: 1 }]; });
// Vorlagen
bad('Popup-Vorlage', (c) => { c.template = 'casora_popup_lock'; });
bad('fremde Vorlage', (c) => { c.template = 'evil_card'; });
bad('Raum-Vorlage', (c) => { c.template = 'casora_room'; });
bad('Vorlagen-Liste', (c) => { c.template = ['casora_vacuum', 'evil']; });
// Geräte
bad('echte Entität statt Platzhalter', (c) => { c.variables.entity_status = 'sensor.wohnzimmer_temperatur'; });
bad('Platzhalter ohne Gerät', (c) => { c.variables.entity_status = '@slot:9'; });
bad('entity ohne Platzhalter', (c) => { c.entity = 'vacuum.robo'; });
bad('falsche Slot-Felder', (c) => { c.slots[0].onclick = 'x'; });
bad('Text zu lang', (c) => { c.name = 'x'.repeat(201); });
bad('unbekannte Fassung', (c) => { c.v = 2; });

// Teilen: echte Geräte werden zu Platzhaltern, Studio-Merker und Größe bleiben hier.
const hass = { states: { 'vacuum.robo': { attributes: { device_class: '' } }, 'sensor.robo_status': { attributes: { device_class: 'enum' } } } };
const s = C.share({ type: 'custom:button-card', template: 'casora_vacuum', name: 'Saugi', entity: 'vacuum.robo',
  variables: { entity_status: 'sensor.robo_status', size: 'auto', casora_carousel: 'x', icon: 'robot-vacuum' } }, hass);
assert.equal(s.ok, true, 'Teilen klappt');
assert.equal(s.shared.entity, '@slot:1');
assert.equal(s.shared.variables.entity_status, '@slot:2');
assert.equal(s.shared.variables.size, undefined); assert.equal(s.shared.variables.casora_carousel, undefined);
assert.equal(JSON.stringify(s.shared).includes('vacuum.robo'), false, 'keine echte Entität in der geteilten Karte');
assert.equal(C.share({ type: 'custom:button-card', template: 'casora_vacuum', name: 'x', variables: { tap_action: 'toggle' } }, hass).ok, false, 'Aktion wird nicht geteilt');
assert.equal(C.share({ type: 'markdown', content: 'x' }, hass).ok, false, 'nur Casora-Kacheln');

// Hinzufügen: nur passende Geräte, Ergebnis ohne Platzhalter.
const m = C.materialize(s.shared, { 1: 'vacuum.mein', 2: 'sensor.mein_status' });
assert.equal(m.ok, true);
assert.equal(m.tile.entity, 'vacuum.mein'); assert.equal(m.tile.variables.entity_status, 'sensor.mein_status');
assert.equal(C.materialize(s.shared, { 1: 'lock.tuer', 2: 'sensor.x' }).ok, false, 'Gerät der falschen Art');
assert.equal(C.materialize(s.shared, { 1: 'vacuum.mein' }).ok, false, 'Gerät fehlt');
const evil = JSON.parse(JSON.stringify(s.shared)); evil.variables.tap_action = 'toggle';
assert.equal(C.materialize(evil, { 1: 'vacuum.mein', 2: 'sensor.x' }).ok, false, 'manipulierte Katalogkarte wird beim Hinzufügen abgelehnt');

// Issue-Link
const u = C.issueUrl('Titel', 'Text', ['kartenwunsch']);
assert.ok(u.startsWith('https://github.com/SH1FT-W/casora/issues/new?'));
console.log('community_pruefung: ok');
