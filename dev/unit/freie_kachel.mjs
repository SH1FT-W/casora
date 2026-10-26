// Universal tile (issue #52, scripts/local/28-free-tile.js) without HA: Studio settings → sections, state text for
// any domain (words, numbers with unit, unavailable), icon toggle only for switchable domains, popup assembly
// (hero, chart, controls, values, more; never empty), live parts with the UI stubbed, template and Studio entry.
// All devices and names are invented.   node dev/unit/freie_kachel.mjs
import assert from 'node:assert/strict';
import { freeTileEnv, stubKit, stubUI } from './lib/free_tile_env.mjs';

// Modules and the invented house are shared with badge_popup.mjs (lib/free_tile_env.mjs).
const { F, states, entities, hass, src } = freeTileEnv();

// ── Studio settings ───────────────────────────────────────────────────────
let c = F.cfg({});
assert.deepEqual(c, { values: [], labels: {}, chart: false, chartEntity: null, controls: true }, 'defaults: controls on, nothing else');
c = F.cfg({ free_values: ['sensor.qa_temp', 'sensor.qa_temp', 'kein-id', 'a.1', 'a.2', 'a.3', 'a.4', 'a.5', 'a.6', 'a.7', 'a.8'],
  free_value_labels: { 'sensor.qa_temp': 'Innen' }, free_chart: 'true', free_chart_entity: 'sensor.qa_temp', free_controls: 'false' });
assert.equal(c.values.length, 8, 'at most 8 values, duplicates and non-ids dropped');
assert.equal(c.values[0], 'sensor.qa_temp');
assert.deepEqual(c.labels, { 'sensor.qa_temp': 'Innen' });
assert.equal(c.chart, true); assert.equal(c.chartEntity, 'sensor.qa_temp'); assert.equal(c.controls, false);
assert.equal(F.cfg({ free_controls: 0 }).controls, false);
assert.equal(F.cfg({ free_value_labels: ['x'] }).labels.constructor, Object, 'a list is no label map');

// ── State text ────────────────────────────────────────────────────────────
assert.equal(F.word(hass, states['switch.qa_pumpe']), 'An', 'HA "Ein" never shows');
assert.equal(F.word(hass, { ...states['switch.qa_pumpe'], state: 'off' }), 'Aus');
assert.equal(F.word(hass, states['sensor.qa_temp']), '21,5 °C', 'one decimal under 100, unit after a space');
assert.equal(F.word(hass, states['sensor.qa_energie']), '1.235 kWh', 'no decimals from 100 on');
assert.equal(F.word(hass, states['sensor.qa_zaehler']), '7', 'whole number stays whole');
assert.equal(F.word(hass, states['sensor.qa_prozent']), '62 %');
assert.equal(F.word(hass, states['sensor.qa_programm']), 'Bereit', 'text state as it is');
assert.equal(F.word(hass, states['sensor.qa_weg']), 'Nicht verfügbar');
assert.equal(F.word(hass, { entity_id: 'sensor.x', state: 'unknown', attributes: {} }), 'Unbekannt');
assert.equal(F.word(hass, null), 'Nicht verfügbar');
assert.equal(F.word(hass, states['binary_sensor.qa_tuer']), 'Geöffnet', 'binary sensors by device class (18-ziele.js)');
assert.equal(F.word(hass, states['cover.qa_rollo']), 'Geöffnet', 'the core module supplies the cover words');
assert.equal(F.word(hass, { ...states['lock.qa_tor'], state: 'jammed' }), 'Klemmt');
// Text domains: the state as written ("iPhone 15", not "Iphone 15"), HA's translation when it has one.
assert.equal(F.word(hass, states['sensor.qa_handy']), 'iPhone 15', 'text sensor keeps its case');
assert.equal(F.word(hass, states['sensor.qa_wlan']), 'WLAN_5G', 'underscores and capitals stay');
assert.equal(F.word(hass, states['input_text.qa_notiz']), 'Milch kaufen');
assert.equal(F.word(hass, states['select.qa_modus']), 'Eco Plus');
assert.equal(F.word({ ...hass, formatEntityState: () => 'Sparen' }, states['select.qa_modus']), 'Sparen', 'HA formats enum/select states');
assert.equal(F.word({ states, entities }, states['sensor.qa_handy']), 'iPhone 15', 'without formatEntityState: the raw state');
assert.equal(F.word({ states, entities }, states['switch.qa_pumpe']), 'An', 'binary domains keep their words');
entities['sensor.qa_temp'].display_precision = 2;
assert.equal(F.word(hass, states['sensor.qa_temp']), '21,47 °C', 'registry display precision wins');
delete entities['sensor.qa_temp'].display_precision;
assert.equal(F.tileState(states['sensor.qa_temp'], hass, states), '21,5 °C');
assert.equal(F.tileState(null, hass, states), '', 'no entity: empty subline');

// Icon tap toggles only what the house switches.
assert.equal(F.switchable(states['switch.qa_pumpe']), true);
assert.equal(F.switchable(states['light.qa_stehlampe']), true);
assert.equal(F.switchable(states['cover.qa_rollo']), true);
assert.equal(F.switchable(states['lock.qa_tor']), true);
assert.equal(F.switchable(states['sensor.qa_temp']), false);
assert.equal(F.switchable(states['climate.qa_thermostat']), false);
assert.equal(F.switchable(states['sensor.qa_weg']), false, 'unavailable: nothing to toggle');
assert.equal(F.switchable(null), false);
assert.equal(F.iconService(states['switch.qa_pumpe']), 'homeassistant.toggle');
assert.equal(F.iconService(states['cover.qa_rollo']), 'homeassistant.toggle');
assert.equal(F.iconService(states['lock.qa_tor']), 'lock.unlock');
assert.equal(F.iconService({ ...states['lock.qa_tor'], state: 'unlocked' }), 'lock.lock');
assert.equal(F.iconService({ ...states['lock.qa_tor'], state: 'jammed' }), 'none');
assert.equal(F.iconService({ entity_id: 'media_player.qa_tv', state: 'off', attributes: { supported_features: 128 } }), 'media_player.turn_on');
assert.equal(F.iconService({ entity_id: 'media_player.qa_tv', state: 'playing', attributes: { supported_features: 128 } }), 'none', 'no turn_off feature');
assert.equal(F.iconService({ entity_id: 'vacuum.qa_sauger', state: 'cleaning', attributes: {} }), 'vacuum.return_to_base');
assert.equal(F.iconService({ entity_id: 'vacuum.qa_sauger', state: 'docked', attributes: {} }), 'vacuum.start');
assert.equal(F.iconService(states['sensor.qa_temp']), 'none');
assert.equal(F.iconService(states['sensor.qa_weg']), 'none');
// Highlight and tone.
assert.equal(F.on(states['switch.qa_pumpe']), true); assert.equal(F.on(states['lock.qa_tor']), false);
assert.equal(F.on(states['cover.qa_rollo']), true); assert.equal(F.on(states['climate.qa_thermostat']), true);
assert.equal(F.on(states['sensor.qa_temp']), false); assert.equal(F.on(states['sensor.qa_weg']), false);
assert.match(F.color(states['light.qa_stehlampe']), /--casora-tone-light/);
assert.match(F.color(states['climate.qa_thermostat']), /--casora-tone-heat/);
assert.match(F.color(states['switch.qa_pumpe']), /--casora-tone-general/);
assert.match(F.color(null), /--casora-tone-general/);

// ── Plan: which sections the popup gets ──────────────────────────────────
const V = { free_values: ['sensor.qa_temp', 'binary_sensor.qa_tuer', 'sensor.qa_nicht_da'], free_chart: true, free_controls: true };
let C = F.plan(states['switch.qa_pumpe'], states, hass, V);
assert.deepEqual(C.values, ['sensor.qa_temp', 'binary_sensor.qa_tuer'], 'missing entities drop out of the rows');
assert.equal(C.controls, false, 'a pure switch: on/off is the header main switch (blueprint v2), nothing else to control');
assert.equal(F.plan(states['light.qa_stehlampe'], states, hass, V).controls, true, 'a dimmable lamp keeps its brightness');
assert.equal(C.chart, null, 'a switch has no numeric history');
assert.equal(C.chartMissing, true); assert.equal(C.chartWant, 'switch.qa_pumpe');
assert.equal(C.empty, false);
C = F.plan(states['switch.qa_pumpe'], states, hass, { ...V, free_chart_entity: 'sensor.qa_temp' });
assert.equal(C.chart, 'sensor.qa_temp', 'chosen numeric entity');
assert.equal(F.wide(states['light.qa_stehlampe'], states, V), true, 'controls + values → two columns');
assert.equal(F.wide(states['switch.qa_pumpe'], states, V), false, 'a switch has no controls of its own → one column');
assert.equal(F.wide(states['light.qa_stehlampe'], states, {}), false, 'controls alone → one column');
assert.equal(F.wide(states['sensor.qa_temp'], states, V), false, 'a sensor has no controls → one column');
C = F.plan(states['sensor.qa_temp'], states, hass, {});
assert.equal(C.controls, false); assert.equal(C.empty, true, 'nothing configured, nothing to switch → empty, hint follows');
C = F.plan(null, states, hass, {});
assert.equal(C.id, null); assert.equal(C.empty, true);
C = F.plan(states['sensor.qa_temp'], states, hass, { free_chart: true });
assert.equal(C.chart, 'sensor.qa_temp', 'history of the tile entity itself'); assert.equal(C.empty, false);

// ── Popup assembly (kit stubbed) ─────────────────────────────────────────
stubKit();
window._casoraUI = {};
let L = F.popup(states['light.qa_stehlampe'], states, hass, { ...V, free_chart_entity: 'sensor.qa_temp' });
assert.deepEqual(Object.keys(L.fields), ['hero', 'chart', 'ctl', 'vals', 'more']);
assert.deepEqual(L.top, ['hero', 'chart']); assert.deepEqual(L.left, ['ctl']); assert.deepEqual(L.right, ['vals', 'more']);
assert.deepEqual(L.narrowOrder, ['ctl', 'vals', 'more'], 'phone: controls, then values, then more');
const ch = L.fields.chart.card;
assert.equal(ch.type, 'custom:casora-chart'); assert.equal(ch.span, '24h'); assert.equal(ch.source, 'history');
assert.deepEqual(ch.series, [{ entity: 'sensor.qa_temp', name: 'temp', unit: '°C' }]);
assert.deepEqual(L.fields.hero.card.watch, ['light.qa_stehlampe', 'sensor.qa_temp', 'binary_sensor.qa_tuer'], 'every shown entity redraws the hero');
// A ticking value sensor must not rebuild the controls (slider drag) or the settings row.
assert.deepEqual(L.fields.ctl.card.watch, ['light.qa_stehlampe'], 'controls follow the main entity only');
assert.deepEqual(L.fields.more.card.watch, ['light.qa_stehlampe']);
L = F.popup(states['switch.qa_pumpe'], states, hass, V);
assert.deepEqual(Object.keys(L.fields), ['hero', 'vals', 'more'], 'switch: no controls section next to the header switch');
assert.deepEqual(L.fields.vals.card.watch, ['sensor.qa_temp', 'binary_sensor.qa_tuer'], 'value rows follow their own entities');
L = F.popup(states['sensor.qa_temp'], states, hass, {});
assert.deepEqual(Object.keys(L.fields), ['hero', 'more'], 'sensor without sections: state line and settings row');
L = F.popup(null, states, hass, {});
assert.deepEqual(Object.keys(L.fields), ['hero'], 'no entity: the hint alone, never nothing');
L = F.popup(states['switch.qa_pumpe'], states, hass, { free_controls: false });
assert.deepEqual(Object.keys(L.fields), ['hero', 'more'], 'controls switched off in the Studio');
assert.deepEqual(F.popup(states['switch.qa_pumpe'], { ...states }, { ...hass }, { free_chart: true }).top, ['hero'], 'wanted chart of a switch: none');

// ── Live parts ────────────────────────────────────────────────────────────
stubUI();
const sec = (part, ent, vars) => F.sec(part, F.plan(ent, states, hass, vars || {}), states, hass);

assert.equal(sec('hero', null), '<line>Kein Gerät gewählt|</line><note>Wähle im Studio ein Gerät oder ergänze Werte, Verlauf und eigene Karten.</note>');
assert.match(sec('hero', states['switch.qa_pumpe'], V), /^<line>An\|seit 2 Std\.<\/line>/);
assert.match(sec('hero', states['switch.qa_pumpe'], V), /<note>Kein Verlauf: pumpe ist kein Zahlenwert\.<\/note>/, 'wanted chart of a non-number: a note');
assert.equal(sec('hero', states['sensor.qa_temp']), '<line>21,5 °C|seit 2 Std.</line><note>Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.</note>');
assert.equal(sec('hero', states['sensor.qa_weg']), '<line>Nicht verfügbar|</line><note>Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.</note>');
assert.equal(F.sec('hero', { id: 'sensor.qa_fehlt', values: [], labels: {} }, states, hass), '<line>Gerät fehlt|sensor.qa_fehlt</line>');

// Controls per domain.
let ctl = sec('ctl', states['switch.qa_pumpe']);
assert.equal(ctl, '', 'switch: on/off only in the header (blueprint v2, decision 2)');
ctl = sec('ctl', states['light.qa_stehlampe']);
assert.doesNotMatch(ctl, /homeassistant\.turn_off/, 'no second on/off next to the header switch');
assert.match(ctl, /<slider 50 turn_on\/brightness_pct>/, 'dimmable light: brightness slider');
assert.match(ctl, /<seg Helligkeit · 50 %>25 %>light\.turn_on\{"brightness_pct":25\};\*50 %>/, 'hold menu pills as segments');
ctl = sec('ctl', states['cover.qa_rollo']);
assert.match(ctl, /<seg Bedienung>Auf>cover\.open_cover;Stopp>cover\.stop_cover;Zu>cover\.close_cover<\/seg>/);
assert.match(ctl, /<seg Position · 60 %>25 %>cover\.set_cover_position\{"position":25\}/);
assert.doesNotMatch(ctl, /<group/, 'cover with buttons: no extra main row');
ctl = sec('ctl', states['lock.qa_tor']);
assert.equal(ctl, '<group Bedienung>Entriegeln=>lock.unlock?Wirklich entriegeln?</group>', 'risky action asks first');
ctl = sec('ctl', states['climate.qa_thermostat']);
assert.match(ctl, /<seg Zieltemperatur · 21°>20°>climate\.set_temperature\{"temperature":20\};20,5°>[^;]*;\*21°>[^;]*;21,5°>[^;]*;22°>/);
assert.equal(sec('ctl', states['sensor.qa_temp']), '', 'nothing to control');
assert.equal(sec('ctl', states['sensor.qa_weg']), '');
delete window._casoraHold;
assert.equal(sec('ctl', states['cover.qa_rollo']), '', 'without the hold module no cover controls, no error');
assert.equal(sec('ctl', states['switch.qa_pumpe']), '', 'switch without the hold module: still nothing (header switch)');

// Value rows: own label, entity for the tap, state with unit, unavailable marked.
const vals = sec('vals', states['switch.qa_pumpe'], { free_values: ['sensor.qa_temp', 'binary_sensor.qa_tuer', 'sensor.qa_weg'], free_value_labels: { 'sensor.qa_temp': ' Innen ' } });
assert.equal(vals, '<group Werte>sensor.qa_temp:Innen=21,5 °C;binary_sensor.qa_tuer:tuer=Geöffnet;sensor.qa_weg:weg=Nicht verfügbar</group>');
assert.equal(sec('vals', states['switch.qa_pumpe']), '', 'no values configured: no section');
window._casoraUI.settings = (id) => window._casoraUI.group([{ entity: id, label: 'Weitere Einstellungen' }], 'Einstellungen');
assert.equal(sec('more', states['switch.qa_pumpe']), '<group Einstellungen>switch.qa_pumpe:Weitere Einstellungen=</group>');
assert.equal(sec('more', null), '');

// ── Template and Studio entry ────────────────────────────────────────────
const T = JSON.parse(src('dashboards/casora/button_card_templates.json'));
const tile = T.casora_free, pop = T.casora_popup_free;
assert.ok(tile && pop, 'templates exist');
assert.deepEqual(tile.template, ['casora_entity', 'casora_popup_free']);
assert.equal(tile.variables.show_toggle, undefined, 'no toggle control in the tile corner');
assert.match(tile.icon_tap_action.service, /_casoraFree\.iconService/);
// The icon calls a service only when there is one; a jammed lock or a TV without a power feature opens the popup.
const iconAction = (ent) => new Function('entity', 'window', 'states', 'hass', tile.icon_tap_action.action.replace(/^\s*\[\[\[|\]\]\]\s*$/g, ''))(ent, window, states, hass);
assert.equal(iconAction(states['switch.qa_pumpe']), 'call-service');
assert.equal(iconAction(states['lock.qa_tor']), 'call-service');
assert.equal(iconAction({ ...states['lock.qa_tor'], state: 'jammed' }), 'none', 'switchable but no service: no error toast');
assert.equal(iconAction({ ...states['lock.qa_tor'], state: 'locking' }), 'none');
assert.equal(iconAction({ entity_id: 'media_player.qa_tv', state: 'playing', attributes: { supported_features: 128 } }), 'none');
assert.equal(iconAction(states['sensor.qa_temp']), 'none');
assert.equal(iconAction(null), 'none');
assert.equal(tile.icon_tap_action.haptic, 'light');
assert.equal(tile.variables.casora_default_name, 'Universal-Kachel');
assert.match(tile.state_display, /tileState/);
// Highlighting is casora_entity's (its active state wins for on/open/…): only extra words and the circle colour here.
assert.equal(tile.state, undefined, 'no own state block – casora_entity highlights');
assert.ok(tile.variables.active_states.includes('home') && tile.variables.active_states.includes('mowing'));
assert.ok(tile.styles.card.some((o) => /_casoraFree[\s\S]*F\.color\(/.test(o['--casora-icon-fallback-color'] || '')), 'circle colour by domain tone');
assert.match(pop.tap_action.casora_popup.content, /_casoraFree\.popup\(entity, states, hass, variables\)/);
assert.match(pop.tap_action.casora_popup.extra, /casoraPopupExtras/, 'own cards work here too');
assert.match(pop.tap_action.casora_popup.title, /'Universal-Kachel'/);
assert.match(pop.tap_action.casora_popup.popup_styles[0].styles, /prefers-reduced-motion/);
assert.equal(pop.tap_action.haptic, undefined, 'haptic comes from casora_popup_base');
assert.deepEqual(pop.template, ['casora_popup_base']);
const built = JSON.parse(src('custom_components/casora/panel/casora-templates.json')).templates;
assert.ok(built.casora_free && built.casora_popup_free, 'built templates contain the tile (tools/build-templates.py)');
assert.match(src('custom_components/casora/scripts/casora-local.js'), /'28-free-tile'/, 'module is loaded');

const typesSrc = src('custom_components/casora/panel/casora-panel-types.js');
new Function(typesSrc.slice(0, typesSrc.indexOf('// Symbole, die Casora mitliefert')))();
const type = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_free');
assert.ok(type, 'Studio offers the tile');
assert.equal(type.template, 'casora_free');
assert.equal(type.ownData, true, 'entity optional: added without a device');
assert.equal(type.emptyWord, '', 'preview says nothing instead of "Automatic"');
assert.equal(type.community, undefined, 'a core tile, not a community card');
assert.ok(['switch', 'sensor', 'light', 'cover', 'lock', 'climate', 'binary_sensor', 'person', 'media_player'].every((d) => type.domains.includes(d)));
assert.deepEqual(type.fields.map((f) => f.key), ['icon', 'room_name', 'free_values', 'free_value_labels', 'free_chart', 'free_chart_entity', 'free_controls']);
const fld = Object.fromEntries(type.fields.map((f) => [f.key, f]));
assert.equal(fld.free_values.type, 'list'); assert.equal(fld.free_value_labels.over, 'free_values');
assert.equal(fld.free_value_labels.when({ free_values: [] }), false); assert.equal(fld.free_value_labels.when({ free_values: ['a.b'] }), true);
assert.equal(fld.free_chart.type, 'bool'); assert.equal(fld.free_chart_entity.when({ free_chart: true }), true); assert.equal(fld.free_chart_entity.when({}), false);
assert.equal(fld.free_controls.boolDefault, true);
assert.equal(fld.room_name.advanced, false, 'title visible right away');
for (const lang of ['de', 'es']) {
  const tr = JSON.parse(src('custom_components/casora/translations/panel/' + lang + '.json')).exact;
  for (const s of [type.label, type.entityPlaceholder].concat(type.fields.flatMap((f) => [f.label, f.hint, f.placeholder]).filter(Boolean)))
    assert.ok(tr[s], lang + ' translation missing for: ' + s);
}
for (const lang of ['en', 'es']) {
  const ph = JSON.parse(src('custom_components/casora/translations/dashboard/phrases/' + lang + '.json')).exact;
  for (const s of ['Universal-Kachel', 'Kein Gerät gewählt', 'Werte', 'Bedienung', 'Kein Verlauf: {name} ist kein Zahlenwert.',
    'Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.', 'Wähle im Studio ein Gerät oder ergänze Werte, Verlauf und eigene Karten.'])
    assert.ok(ph[s], lang + ' phrase missing for: ' + s);
}
console.log('freie_kachel: ok');
