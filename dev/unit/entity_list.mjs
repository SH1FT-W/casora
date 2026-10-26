// Entity list and "Mehr" (card request #59, scripts/local/34-entity-list.js) without HA: Studio settings, entries
// from a group (its order), a hand-picked list or an HA label (by name), row kinds and their controls, the count on
// the tile ("3 An" / "26 Einstellungen"), section headings, columns, popup assembly, Mehr's lists and charts and its
// row tap, template and Studio entries. All devices and names are invented.   node dev/unit/entity_list.mjs
import assert from 'node:assert/strict';
import { freeTileEnv, load, src } from './lib/free_tile_env.mjs';

const { states, entities, hass, add } = freeTileEnv();
load('34-entity-list.js');
const L = window._casoraEntityList;
assert.ok(L, 'module loaded');

// ── Invented house: shutter times as helpers, a group in its own order, labels ──
add('input_datetime.qa_frueh', '20:15:00', { has_time: true, has_date: false, friendly_name: 'Frühestens zu um' });
add('input_datetime.qa_spaet', '22:30:00', { has_time: true, has_date: false, friendly_name: 'Spätestens zu um' });
add('input_boolean.qa_abwesend', 'off', { friendly_name: 'Andere Schließzeit wenn abwesend' }, { labels: ['qa_rollo'] });
add('input_datetime.qa_jan', '20:00:00', { has_time: true, has_date: false, friendly_name: '1 - Januar' }, { labels: ['qa_rollo'] });
add('input_datetime.qa_okt', '21:00:00', { has_time: true, has_date: false, friendly_name: '10 - Oktober' }, { labels: ['qa_rollo'] });
add('input_datetime.qa_feb', '20:30:00', { has_time: true, has_date: false, friendly_name: '2 - Februar' }, { labels: ['qa_rollo'] });
add('input_datetime.qa_tag', '2026-12-24', { has_time: false, has_date: true, friendly_name: 'Urlaub ab' });
add('input_datetime.qa_beides', '2026-12-24 08:00:00', { has_time: true, has_date: true, friendly_name: 'Termin' });
add('input_number.qa_absenk', '17.5', { min: 15, max: 18, step: 0.5, unit_of_measurement: '°C', friendly_name: 'Absenktemperatur' });
add('number.qa_max', '100', { min: 0, max: 100, step: 5, friendly_name: 'Maximum' });
add('input_select.qa_modus', 'Eco', { options: ['Eco', 'Komfort <b>'], friendly_name: 'Modus' });
add('input_boolean.qa_sommer', 'on', { friendly_name: 'Heizung im Sommer aus' });
add('input_boolean.qa_versteckt', 'on', {}, { labels: ['qa_rollo'], hidden: true });
add('input_boolean.qa_weg', 'unavailable', { friendly_name: 'Weg' });
add('group.qa_rollo', 'on', { entity_id: ['input_datetime.qa_frueh', 'input_datetime.qa_spaet', 'input_boolean.qa_abwesend',
  'input_datetime.qa_jan', 'input_datetime.qa_feb', 'switch.qa_pumpe', 'sensor.qa_fehlt', 'input_datetime.qa_frueh'], friendly_name: 'Rollladen runter' });
add('group.qa_heizung', 'on', { entity_id: ['input_boolean.qa_sommer', 'input_number.qa_absenk', 'input_select.qa_modus'], friendly_name: 'Heizung: Optionen', icon: 'mdi:fire' });

// ── Studio settings ───────────────────────────────────────────────────────
assert.deepEqual(L.cfg({}), { source: 'group', group: null, entities: [], label: null, layout: 'auto', sections: [] }, 'defaults: group, auto');
let C = L.cfg({ list_source: 'pick', list_entities: ['input_boolean.qa_sommer', 'kein-id', 'input_boolean.qa_sommer', 'switch.qa_pumpe'],
  list_layout: '2', list_sections: [{ title: ' Pro Monat ', before: 'input_datetime.qa_jan' }, { title: '', before: 'switch.qa_pumpe' }, 'x', { title: 'Ohne' }] });
assert.equal(C.source, 'pick');
assert.deepEqual(C.entities, ['input_boolean.qa_sommer', 'switch.qa_pumpe'], 'ids only, no duplicates, own order');
assert.equal(C.layout, '2');
assert.deepEqual(C.sections, [{ title: 'Pro Monat', before: 'input_datetime.qa_jan' }], 'headings need a title and an entry');
assert.equal(L.cfg({ list_source: 'quatsch', list_layout: '7' }).source, 'group', 'unknown source: group');
assert.equal(L.cfg({ list_layout: '7' }).layout, 'auto');
assert.equal(L.cfg({ list_label: ' qa_rollo ' }).label, 'qa_rollo');

// ── Entries ───────────────────────────────────────────────────────────────
const grp = L.resolve(hass, states, L.cfg({ list_group: 'group.qa_rollo' }));
assert.deepEqual(grp, ['input_datetime.qa_frueh', 'input_datetime.qa_spaet', 'input_boolean.qa_abwesend', 'input_datetime.qa_jan',
  'input_datetime.qa_feb', 'switch.qa_pumpe'], "the group's order; missing members and duplicates dropped");
assert.deepEqual(L.resolve(hass, states, L.cfg({ list_group: 'group.qa_nichts' })), [], 'missing group: empty');
assert.deepEqual(L.resolve(hass, states, L.cfg({ list_source: 'pick', list_entities: ['switch.qa_pumpe', 'sensor.qa_fehlt', 'input_boolean.qa_sommer'] })),
  ['switch.qa_pumpe', 'input_boolean.qa_sommer'], 'pick: own order, missing ones dropped');
assert.deepEqual(L.resolve(hass, states, L.cfg({ list_source: 'label', list_label: 'qa_rollo' })),
  ['input_datetime.qa_jan', 'input_datetime.qa_feb', 'input_datetime.qa_okt', 'input_boolean.qa_abwesend'],
  'label: by name, numbers counted (2 before 10), hidden entities left out');
assert.deepEqual(L.resolve(hass, states, L.cfg({ list_source: 'label' })), [], 'label not chosen: empty');
// Every entry is read through the states handed in (button-card tracks what a template reads).
const seen = new Set();
const proxy = new Proxy(states, { get: (t, k) => { seen.add(k); return t[k]; } });
L.resolve(hass, proxy, L.cfg({ list_group: 'group.qa_rollo' }));
assert.ok(seen.has('group.qa_rollo') && seen.has('input_datetime.qa_feb') && seen.has('switch.qa_pumpe'), 'group and members read through states');

// ── Names ─────────────────────────────────────────────────────────────────
assert.equal(L.nameOf(states['input_datetime.qa_jan'], 'x'), 'Januar', 'sort number dropped');
assert.equal(L.nameOf(states['input_datetime.qa_okt'], 'x'), 'Oktober');
assert.equal(L.nameOf({ attributes: { friendly_name: '3. März' } }, 'x'), 'März');
assert.equal(L.nameOf({ attributes: { friendly_name: '2026 Plan' } }, 'x'), '2026 Plan', 'a year is no sort number');
assert.equal(L.nameOf(null, 'input_boolean.qa_x'), 'input_boolean.qa_x');

// ── Kinds ─────────────────────────────────────────────────────────────────
const kind = (id) => L.kind(states[id]);
assert.equal(kind('input_boolean.qa_sommer'), 'toggle');
assert.equal(kind('switch.qa_pumpe'), 'toggle');
assert.equal(kind('light.qa_stehlampe'), 'toggle');
assert.equal(kind('group.qa_heizung'), 'toggle', 'a group of switches switches all');
assert.equal(kind('input_datetime.qa_frueh'), 'time');
assert.equal(kind('input_datetime.qa_tag'), 'date');
assert.equal(kind('input_datetime.qa_beides'), 'state', 'date and time: Home Assistant dialog');
assert.equal(kind('input_number.qa_absenk'), 'number');
assert.equal(kind('number.qa_max'), 'number');
assert.equal(kind('input_select.qa_modus'), 'select');
assert.equal(kind('sensor.qa_temp'), 'state');
assert.equal(kind('input_boolean.qa_weg'), 'state', 'unavailable: no control');
assert.equal(L.kind(null), 'state');

// ── Count, tile text, active ──────────────────────────────────────────────
const heiz = L.resolve(hass, states, L.cfg({ list_group: 'group.qa_heizung' }));
assert.deepEqual(L.count(states, heiz), { n: 3, on: 1, toggles: 1 });
assert.deepEqual(L.summary(L.count(states, heiz)), ['3 Einstellungen', '1 An']);
assert.deepEqual(L.summary(L.count(states, grp)), ['6 Einstellungen', '1 An'], 'pump on');
states['switch.qa_pumpe'].state = 'off';
assert.deepEqual(L.summary(L.count(states, grp)), ['6 Einstellungen', 'Aus'], 'switches all off');
assert.deepEqual(L.summary(L.count(states, ['input_datetime.qa_frueh'])), ['1 Einstellung'], 'no switch: count only');
assert.deepEqual(L.summary(L.count(states, [])), ['Keine Einträge']);
assert.equal(L.tileState(hass, states, { list_group: 'group.qa_rollo' }), '6 Einstellungen');
assert.equal(L.tileActive(hass, states, { list_group: 'group.qa_rollo' }), false);
states['input_boolean.qa_abwesend'].state = 'on';
states['switch.qa_pumpe'].state = 'on';
assert.equal(L.tileState(hass, states, { list_group: 'group.qa_rollo' }), '2 An', 'something on: the number on ("2 An", word list)');
assert.equal(L.tileActive(hass, states, { list_group: 'group.qa_rollo' }), true);
assert.equal(L.tileState(hass, states, {}), 'Keine Einträge');
states['input_boolean.qa_abwesend'].state = 'off';

// ── Sections and columns ──────────────────────────────────────────────────
assert.deepEqual(L.split(['a.1', 'a.2', 'a.3'], []), [{ title: null, ids: ['a.1', 'a.2', 'a.3'] }]);
assert.deepEqual(L.split(['a.1', 'a.2', 'a.3'], [{ title: 'Pro Monat', before: 'a.2' }, { title: 'Weg', before: 'b.9' }]),
  [{ title: null, ids: ['a.1'] }, { title: 'Pro Monat', ids: ['a.2', 'a.3'] }], 'heading before its entry; unknown entry ignored');
assert.deepEqual(L.split(['a.1', 'a.2'], [{ title: 'Oben', before: 'a.1' }]), [{ title: 'Oben', ids: ['a.1', 'a.2'] }], 'heading at the top: no empty first part');
assert.equal(L.cols(''), 'auto'); assert.equal(L.cols('1'), '1'); assert.equal(L.cols('2'), '2'); assert.equal(L.cols(null), 'auto');
assert.equal(L.width({ list_layout: '1' }), 552, 'one column: narrow popup');
assert.equal(L.width({ list_layout: '2' }), 900);
assert.equal(L.width({}), 900, 'auto: wide (the phone is one column anyway)');

// ── Rows and their controls ───────────────────────────────────────────────
window.casoraLocale = () => 'de-DE';
let r = L.row(hass, states['input_boolean.qa_sommer'], 'input_boolean.qa_sommer');
assert.equal(r.active, true, 'on: active row (DP-07)');
assert.deepEqual(r.svc, { domain: 'homeassistant', service: 'toggle', target: { entity_id: 'input_boolean.qa_sommer' } }, 'the row toggles');
assert.match(r.endHtml, /role="switch" aria-checked="true"/);
assert.equal(r.labelLit, true, 'names are not translated');
r = L.row(hass, states['input_boolean.qa_abwesend'], 'input_boolean.qa_abwesend');
assert.equal(r.active, false); assert.match(r.endHtml, /aria-checked="false"/);
r = L.row(hass, states['input_datetime.qa_frueh'], 'input_datetime.qa_frueh');
assert.equal(r.svc, undefined); assert.equal(r.entity, undefined, 'the time field takes the tap, not the row');
assert.match(r.endHtml, /<span data-no-i18n>20:15<\/span><input type="time" data-casora-el="input_datetime.qa_frueh" value="20:15"/);
assert.match(r.endHtml, /onchange="window\._casoraEntityList&&window\._casoraEntityList\.input\(this\)"/);
r = L.row(hass, states['input_datetime.qa_tag'], 'input_datetime.qa_tag');
assert.match(r.endHtml, /type="date"[^>]*value="2026-12-24"/);
r = L.row(hass, states['input_number.qa_absenk'], 'input_number.qa_absenk');
assert.match(r.endHtml, /17,5 °C/, 'value with unit in the locale');
assert.match(r.endHtml, /&quot;service&quot;:&quot;decrement&quot;/); assert.match(r.endHtml, /&quot;service&quot;:&quot;increment&quot;/);
states['input_number.qa_absenk'].state = '18';
r = L.row(hass, states['input_number.qa_absenk'], 'input_number.qa_absenk');
assert.doesNotMatch(r.endHtml, /increment/, 'at the maximum: no +');
assert.match(r.endHtml, /opacity:\.4;pointer-events:none;/);
r = L.row(hass, states['number.qa_max'], 'number.qa_max');
assert.match(r.endHtml, /&quot;service&quot;:&quot;set_value&quot;,&quot;data&quot;:\{&quot;value&quot;:95\}/, 'number: − sets the value one step down');
assert.equal(L.stepTo(states['number.qa_max'], 1), null, 'above the maximum: nothing');
assert.equal(L.stepTo({ state: '0.3', attributes: { step: 0.1 } }, 1), 0.4, 'no float noise');
r = L.row(hass, states['input_select.qa_modus'], 'input_select.qa_modus');
assert.match(r.endHtml, /<option value="Eco" selected>Eco<\/option><option value="Komfort &lt;b&gt;">Komfort &lt;b&gt;<\/option>/, 'options escaped, current selected');
r = L.row(hass, states['sensor.qa_temp'], 'sensor.qa_temp');
assert.equal(r.entity, 'sensor.qa_temp', 'anything else: state text, tap opens the details');
assert.equal(r.value, '21,5 °C'); assert.equal(r.endHtml, undefined);
r = L.row(hass, states['input_boolean.qa_weg'], 'input_boolean.qa_weg');
assert.equal(r.value, 'Nicht verfügbar'); assert.equal(r.valueTone, 'warn'); assert.equal(r.svc, undefined);
assert.equal(L.iconOf(states['input_datetime.qa_frueh']), 'mdi:clock-outline');
assert.equal(L.iconOf(states['input_datetime.qa_tag']), 'mdi:calendar');
assert.equal(L.iconOf(states['group.qa_heizung']), 'mdi:fire', 'own icon wins');

// Changed fields → service.
assert.deepEqual(L.serviceFor('input_datetime.qa_frueh', 'time', '21:05'), { domain: 'input_datetime', service: 'set_datetime', data: { time: '21:05:00' } });
assert.deepEqual(L.serviceFor('time.qa_wecker', 'time', '06:15:00'), { domain: 'time', service: 'set_value', data: { time: '06:15:00' } });
assert.deepEqual(L.serviceFor('input_datetime.qa_tag', 'date', '2026-12-31'), { domain: 'input_datetime', service: 'set_datetime', data: { date: '2026-12-31' } });
assert.deepEqual(L.serviceFor('input_select.qa_modus', 'select', 'Komfort'), { domain: 'input_select', service: 'select_option', data: { option: 'Komfort' } });
assert.deepEqual(L.serviceFor('select.qa_x', 'select', 'A'), { domain: 'select', service: 'select_option', data: { option: 'A' } });
assert.equal(L.serviceFor('input_datetime.qa_frueh', 'time', ''), null, 'cleared field: nothing');
assert.equal(L.serviceFor('input_datetime.qa_frueh', 'time', 'abc'), null);
assert.equal(L.serviceFor('sensor.qa_temp', 'select', 'A'), null);
assert.equal(L.timeText('07:05:00'), '07:05'); assert.equal(L.timeText('x'), '');

// ── Popup ─────────────────────────────────────────────────────────────────
const UI = window._casoraUI = {
  line: (main, rest) => '<line>' + main + '|' + (rest || []).join(' · ') + '</line>',
  note: (t) => '<note>' + t + '</note>',
  group: (rows, label) => '<group ' + (label || '') + '>' + rows.map((x) => (x.entity || '') + ':' + x.label + (x.endHtml ? '+ctl' : '')
    + (x.active ? '*' : '') + (x.sub ? '/' + [].concat(x.sub).join(' · ') : '')).join(';') + '</group>',
};
window._casoraSoftKit = { secCard: (watch, code, st) => ({ sec: /[sS]ec\("(\w+)"/.exec(code)[1], watch: watch.filter((id) => st[id]) }), layout: (o) => o };
let lay = L.popup({ list_group: 'group.qa_rollo' }, states, hass);
assert.deepEqual(lay.top, ['hero', 'list']);
assert.ok(lay.fields.list.card.watch.includes('input_datetime.qa_feb') && lay.fields.list.card.watch.includes('group.qa_rollo'), 'live with every entry and the group');
lay = L.popup({ list_group: 'group.qa_nichts' }, states, hass);
assert.deepEqual(Object.keys(lay.fields), ['hero'], 'empty: no list section');
const C1 = L.cfg({ list_group: 'group.qa_rollo', list_layout: '2', list_sections: [{ title: 'Pro Monat', before: 'input_datetime.qa_jan' }] });
assert.equal(L.sec('hero', C1, states, hass), '<line>6 Einstellungen|1 An</line>');
const html = L.sec('list', C1, states, hass);
assert.match(html, /data-casora-cols="2"/);
assert.match(html, /<group >:Frühestens zu um\+ctl;:Spätestens zu um\+ctl;:Andere Schließzeit wenn abwesend\+ctl<\/group>/);
assert.match(html, /<group Pro Monat>:Januar\+ctl;:Februar\+ctl;:pumpe\+ctl\*<\/group>/, 'section from its entry on');
assert.equal(L.sec('hero', L.cfg({ list_group: 'group.qa_nichts' }), states, hass),
  '<line>Keine Einträge|</line><note>Die Gruppe gibt es nicht mehr. Wähle im Studio eine andere.</note>');
assert.equal(L.sec('hero', L.cfg({ list_source: 'pick' }), states, hass), '<line>Keine Einträge|</line><note>Wähle im Studio eine Gruppe, Geräte oder ein Label.</note>');

// ── Mehr ──────────────────────────────────────────────────────────────────
const MV = { more_lists: ['group.qa_rollo', 'group.qa_heizung', 'kein-id', 'group.qa_rollo'], more_list_labels: { 'group.qa_heizung': ' Heizung ', x: 'y' },
  more_charts: ['sensor.qa_temp', 'sensor.qa_energie'], more_chart_labels: ['falsch'] };
const M = L.moreCfg(MV);
assert.deepEqual(M, { lists: ['group.qa_rollo', 'group.qa_heizung'], charts: ['sensor.qa_temp', 'sensor.qa_energie'],
  listNames: { 'group.qa_heizung': 'Heizung' }, chartNames: {} });
assert.equal(L.moreWord(3, 4), '3 Listen · 4 Diagramme');
assert.equal(L.moreWord(1, 0), '1 Liste'); assert.equal(L.moreWord(0, 1), '1 Diagramm'); assert.equal(L.moreWord(0, 0), 'Nichts gewählt');
assert.equal(L.moreTile(hass, states, MV), '2 Listen · 2 Diagramme');
assert.equal(L.moreTile(hass, states, { more_lists: ['group.qa_weg'] }), 'Nichts gewählt', 'missing groups do not count');
const mlay = L.morePopup(MV, states, hass);
assert.deepEqual(mlay.top, ['hero', 'lists', 'charts']);
assert.deepEqual(mlay.variables.casora_more, M, 'the popup carries what its rows open');
assert.ok(mlay.fields.lists.card.watch.includes('input_boolean.qa_sommer'), 'list previews follow their members');
assert.equal(L.moreSec('lists', M, states, hass),
  '<group Einstellungen>group.qa_rollo:Rollladen runter/6 Einstellungen · 1 An;group.qa_heizung:Heizung/3 Einstellungen · 1 An</group>');
window._casoraChartCard = { LABEL: { '24h': '24 Std.' }, value: () => '21,5 °C', popup: (st, S, h, V) => ({ chart: st.entity_id, V }) };
assert.match(L.moreSec('charts', M, states, hass), /data-casora-cols="auto"><group Diagramme>sensor\.qa_temp:temp\/24 Std\. · 21,5 °C;/);
assert.equal(L.moreSec('hero', M, states, hass), '<line>2 Listen · 2 Diagramme|</line>');
assert.equal(L.moreSec('hero', L.moreCfg({}), states, hass), '<line>Nichts gewählt|</line><note>Wähle im Studio Gruppen und Sensoren für diese Kachel.</note>');

// A tapped row in Mehr opens its list or chart in the same popup with ‹ back to Mehr.
const opened = [];
const cur = { title: 'Mehr', content: mlay, popup_styles: [{ style: 'all', styles: 'x' }], dismiss_on_background: true };
window.casoraPopup = { current: cur, open: (cfg) => opened.push(cfg) };
document.querySelector = (q) => (q === 'home-assistant' ? { hass } : null);
assert.ok(window._casoraMiHooks.includes(L.moreHook), 'hooked into the row tap');
assert.equal(L.moreHook('group.qa_heizung'), true);
assert.equal(opened[0].title, 'Heizung', 'own name from the Studio');
assert.deepEqual(opened[0].content.top, ['hero', 'list']);
assert.match(opened[0].style, /min\(900px, 92vw\)/);
assert.equal(opened[0].popup_styles, cur.popup_styles);
opened[0].back();
assert.equal(opened[1], cur, '‹ reopens Mehr as it was');
assert.equal(L.moreHook('sensor.qa_temp'), true);
assert.deepEqual(opened[2].content, { chart: 'sensor.qa_temp', V: {} }, "the chart card's own popup");
assert.equal(opened[2].title, 'temp');
assert.equal(L.moreHook('sensor.qa_prozent'), false, 'not in this Mehr: the normal tap');
window.casoraPopup.current = { content: lay };
assert.equal(L.moreHook('group.qa_heizung'), false, 'another popup: the normal tap');

// ── Templates and Studio entries ──────────────────────────────────────────
const TPL = JSON.parse(src('dashboards/casora/button_card_templates.json'));
const run = (code, ctx) => new Function(...Object.keys(ctx), code.replace(/^\s*\[\[\[|\]\]\]\s*$/g, ''))(...Object.values(ctx));
const el = TPL.casora_entity_list, more = TPL.casora_more;
assert.deepEqual(el.template, ['casora_entity', 'casora_popup_entity_list']);
assert.deepEqual(more.template, ['casora_entity', 'casora_popup_more']);
assert.equal(el.variables.icon, 'list'); assert.equal(more.variables.icon, 'grid');
assert.deepEqual(el.icon_tap_action, { action: 'none' }, 'nothing to switch from the icon: the tap opens the popup');
window.casoraStateFit = (t) => t;
const ctx = { hass, states, variables: { list_group: 'group.qa_rollo' }, entity: undefined, user: {}, html: '' };
assert.equal(run(el.state_display, ctx), '1 An');
assert.equal(run(el.variables.active_override, ctx), true);
assert.equal(run(more.state_display, { ...ctx, variables: MV }), '2 Listen · 2 Diagramme');
for (const p of ['casora_popup_entity_list', 'casora_popup_more']) {
  const cp = TPL[p].tap_action.casora_popup;
  assert.deepEqual(TPL[p].template, ['casora_popup_base'], p + ': haptic from the base');
  assert.match(cp.popup_styles[0].styles, /prefers-reduced-motion/);
  assert.match(cp.extra, /casoraPopupExtras/);
}
assert.equal(run(TPL.casora_popup_entity_list.tap_action.casora_popup.style, { variables: { list_layout: '1' } }),
  '--popup-min-width: min(552px, 92vw); --popup-max-width: min(552px, 92vw);');
const built = JSON.parse(src('custom_components/casora/panel/casora-templates.json')).templates;
assert.ok(built.casora_entity_list && built.casora_more && built.casora_popup_entity_list && built.casora_popup_more, 'built (tools/build-templates.py)');
assert.match(src('custom_components/casora/scripts/casora-local.js'), /'34-entity-list'/, 'module is loaded');

const typesSrc = src('custom_components/casora/panel/casora-panel-types.js');
new Function(typesSrc.slice(0, typesSrc.indexOf('// Symbole, die Casora mitliefert')))();
const tList = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_entity_list');
const tMore = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_more');
assert.ok(tList && tMore, 'Studio offers both tiles');
assert.equal(tList.noEntity, true); assert.equal(tMore.noEntity, true);
assert.equal(tList.community, undefined, 'core tiles, not community cards');
assert.deepEqual(tList.fields.map((f) => f.key), ['icon', 'room_name', 'list_source', 'list_group', 'list_entities', 'list_label', 'list_layout', 'list_sections']);
assert.deepEqual(tMore.fields.map((f) => f.key), ['icon', 'room_name', 'more_lists', 'more_list_labels', 'more_charts', 'more_chart_labels']);
const fl = Object.fromEntries(tList.fields.map((f) => [f.key, f]));
assert.equal(fl.list_source.seg, true); assert.deepEqual(fl.list_source.options, ['', 'pick', 'label']);
assert.equal(fl.list_layout.seg, true); assert.deepEqual(fl.list_layout.options, ['1', '2', '']);
assert.equal(fl.list_group.when({}), true); assert.equal(fl.list_group.when({ list_source: 'pick' }), false);
assert.equal(fl.list_entities.when({ list_source: 'pick' }), true); assert.equal(fl.list_entities.when({}), false);
assert.equal(fl.list_label.when({ list_source: 'label' }), true);
assert.equal(fl.list_sections.type, 'headings');
assert.equal(typeof fl.list_label.dynOptions, 'function');
let redrawn = 0;
const labHass = { callWS: () => Promise.resolve([{ label_id: 'qa_rollo', name: 'Rollladen' }]) };
assert.equal(fl.list_label.dynOptions(labHass, null, () => { redrawn++; }), null, 'loading: placeholder only');
await new Promise((res) => setImmediate(res));
assert.equal(redrawn, 1);
assert.deepEqual(fl.list_label.dynOptions(labHass, null, null), { options: ['qa_rollo'], labels: { qa_rollo: 'Rollladen' } });
const fm = Object.fromEntries(tMore.fields.map((f) => [f.key, f]));
assert.ok(fm.more_lists.domains.includes('group') && fm.more_lists.domains.includes('light') && fm.more_lists.accept === 'group'); assert.equal(fm.more_list_labels.over, 'more_lists');
assert.deepEqual(fm.more_charts.domains, ['sensor']); assert.equal(fm.more_chart_labels.over, 'more_charts');
for (const lang of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const tr = JSON.parse(src('custom_components/casora/translations/panel/' + lang + '.json')).exact;
  const words = [tList.label, tMore.label].concat([tList, tMore].flatMap((t) => t.fields.flatMap((f) => [f.label, f.hint, f.placeholder]
    .concat(Object.values(f.optionLabels || {})))).filter(Boolean), ['Heading, e.g. Per month', 'Before which entry?', 'Choose the entries first.']);
  for (const s of words) assert.ok(tr[s], lang + ' translation missing for: ' + s);
}
const phr = (lang) => JSON.parse(src('custom_components/casora/translations/dashboard/phrases/' + lang + '.json'));
for (const lang of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ph = phr(lang);
  for (const s of ['Liste', 'Mehr', 'Keine Einträge', '1 Einstellung', 'Nichts gewählt', '1 Liste', '1 Diagramm', 'Diagramme',
    'Die Gruppe gibt es nicht mehr. Wähle im Studio eine andere.', 'Wähle im Studio eine Gruppe, Geräte oder ein Label.',
    'Wähle im Studio Gruppen und Sensoren für diese Kachel.'])
    assert.ok(ph.exact[s], lang + ' phrase missing for: ' + s);
  for (const s of ['26 Einstellungen', '3 Listen', '4 Diagramme'])
    assert.ok(ph.patterns.some(([re]) => new RegExp(re).test(s)), lang + ' pattern missing for: ' + s);
}
console.log('entity_list: ok');
