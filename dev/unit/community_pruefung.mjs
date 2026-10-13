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
  variables: { entity_status: '@slot:2', icon: 'robot-vacuum', compact: true, levels: [1, 2, 3] },
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
// Angriffe aus dem Sicherheitstest (13.10.)
bad('Entität groß geschrieben', (c) => { c.variables.entity_status = 'Cover.garage_door'; });
bad('Entität mit Leerzeichen', (c) => { c.variables.entity_status = ' lock . haustuer '; });
bad('Schalter-Ziel als Variable', (c) => { c.variables.show_toggle = true; c.variables.toggle_entity = '@slot:1'; });
bad('Schloss als Platzhalter', (c) => { c.slots[1].domain = 'lock'; });
bad('Alarm als Platzhalter', (c) => { c.slots[1].domain = 'alarm_control_panel'; });
bad('Tor als Platzhalter', (c) => { c.slots[1].domain = 'cover'; });
bad('Skript als Platzhalter', (c) => { c.slots[1].domain = 'script'; });
bad('doppelte Platzhalter-ID', (c) => { c.slots[1].id = 1; });
bad('Schloss-Vorlage', (c) => { c.template = 'casora_lock'; });
bad('Alarm-Vorlage', (c) => { c.template = 'casora_alarm'; });
bad('__proto__', (c) => { c.variables = JSON.parse('{"__proto__": {"icon": "x"}}'); });
bad('Anführungszeichen', (c) => { c.variables.icon = 'x" y'; });
bad('Backslash', (c) => { c.variables.icon = 'x\\u003c'; });
bad('Pfad nach oben', (c) => { c.variables.icon = '../../secrets'; });
bad('Doppel-Slash', (c) => { c.variables.icon = '//evil.example'; });
bad('Zeilenumbruch', (c) => { c.name = 'a\nb'; });
bad('Tabulator', (c) => { c.name = 'a\tb'; });
bad('unsichtbares Zeichen', (c) => { c.name = 'Sauger\u200b'; });
bad('Richtungszeichen', (c) => { c.name = 'Sauger\u202egnp.exe'; });
bad('zu groß', (c) => { for (let i = 0; i < 3; i++) c.variables['f' + i] = Array(20).fill('x'.repeat(190)); });
bad('zu viele Variablen', (c) => { for (let i = 0; i < 31; i++) c.variables['f' + i] = 1; });
// Apostroph bleibt erlaubt (Namen wie „Kid's Room“).
{ const c = JSON.parse(JSON.stringify(good)); c.name = "Kid's Room"; assert.equal(C.validate(c).ok, true, 'Apostroph erlaubt'); }
// Mit Vorlagenliste: vorhandene Vorlage geht, fehlende nicht.
assert.equal(C.validate(good, { templates: new Set(['casora_vacuum']) }).ok, true, 'vorhandene Vorlage');
assert.equal(C.validate(good, { templates: new Set(['casora_light']) }).ok, false, 'fehlende Vorlage');

// Teilen: echte Geräte werden zu Platzhaltern, Studio-Merker und Größe bleiben hier.
const hass = { states: { 'vacuum.robo': { attributes: { device_class: '' } }, 'sensor.robo_status': { attributes: { device_class: 'enum' } } } };
const s = C.share({ type: 'custom:button-card', template: 'casora_vacuum', name: 'Saugi', entity: 'vacuum.robo',
  variables: { entity_status: 'sensor.robo_status', size: 'auto', casora_carousel: 'x', icon: 'robot-vacuum' } }, hass);
assert.equal(s.ok, true, 'Teilen klappt');
assert.equal(s.shared.entity, '@slot:1');
assert.equal(s.shared.variables.entity_status, '@slot:2');
assert.equal(s.shared.variables.size, undefined); assert.equal(s.shared.variables.casora_carousel, undefined);
assert.equal(JSON.stringify(s.shared).includes('vacuum.robo'), false, 'keine echte Entität in der geteilten Karte');
{ // Aktionen und Schalter-Ziele bleiben beim Teilen zu Hause, der Rest geht mit.
  const a = C.share({ type: 'custom:button-card', template: 'casora_vacuum', name: 'x', entity: 'vacuum.robo',
    variables: { tap_action: 'toggle', toggle_entity: 'vacuum.robo', icon: 'robot-vacuum' } }, hass);
  assert.equal(a.ok, true, 'Teilen ohne Aktion klappt');
  assert.deepEqual(Object.keys(a.shared.variables), ['icon'], 'Aktion wird nicht geteilt');
}
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
