// B-SZENE: Studio-Szenenfarbe wirkt im Dashboard – Badges, Weich-Szenen-Popup, Menüs (Desktop/Handy).
//   node dev/unit/szenen_farbe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

// Helfer casoraSceneColor (01-basis.js): Dashboard-Vorlage gilt, auch leer (zurückgesetzt).
const src = read('custom_components/casora/scripts/local/01-basis.js');
const helper = src.match(/window\.casoraSceneColor = function \(id\) \{[\s\S]*?\n\};/)[0];
const make = (cfg, sc) => { const w = { _casoraLovelaceCfg: () => cfg, _casoraSC: sc }; new Function('window', helper)(w); return w.casoraSceneColor; };
const PURPLE = 'var(--casora-color-purple, #9B6BD6)';
let col = make({ button_card_templates: { casora_scene_row: { variables: { scene_colors: { 'scene.abend': PURPLE } } } } }, { iconColors: {} });
assert.equal(col('scene.abend'), PURPLE);
col = make({ button_card_templates: { casora_scene_row: { variables: { scene_colors: {} } } } }, { iconColors: { 'scene.abend': PURPLE } });
assert.equal(col('scene.abend'), null, 'im Studio zurückgesetzt: keine alte Farbe');
col = make(null, { iconColors: { 'scene.abend': PURPLE } });
assert.equal(col('scene.abend'), PURPLE, 'YAML-Dashboard: Farbe aus Leiste/Szenenreihe');
assert.equal(make({ button_card_templates: { casora_scene_row: { variables: { scene_colors: { x: 'red;}<script>' } } } } })('x'), 'redscript', 'CSS-Wert bereinigt');

// Badges
globalThis.window = globalThis;
window.casoraSceneColor = (id) => (id === 'scene.abend' ? PURPLE : null);
window._casoraSC = { prefetch() {}, isActive: (id) => id === 'scene.abend' };
const iconColor = (name) => body(T[name].styles.card.find((x) => x['--casora-badge-icon-color'])['--casora-badge-icon-color']);
const single = (id) => new Function('entity', 'states', 'variables', iconColor('casora_badge_scene'))({ entity_id: id }, { [id]: {} }, {});
assert.equal(single('scene.abend'), PURPLE, 'Einzel-Badge: aktive Szene in ihrer Farbe');
assert.match(single('scene.morgen'), /scene-badge-color,/, 'inaktiv: wie bisher');
const group = (ids) => new Function('entity', 'states', 'variables', iconColor('casora_badge_scene_group'))(null,
  Object.fromEntries(ids.map((i) => [i, {}])), { scene_entities: ids, row_entity: 'input_select.casora_expanded_row' });
assert.equal(group(['scene.morgen', 'scene.abend']), PURPLE, 'Gruppen-Badge: Farbe der laufenden Szene');
assert.match(group(['scene.morgen']), /scene-badge-color,/);

// Weich-Popup und Menüs nutzen denselben Helfer
assert.ok(read('custom_components/casora/scripts/local/08-weich-szenen.js').includes('window.casoraSceneColor(id)'), 'Weich-Popup');
assert.ok(read('custom_components/casora/scripts/casora-core.js').includes("mi.style.setProperty('--casora-mi-tone', it.color)"), 'Desktop-Menü');
assert.ok(read('custom_components/casora/scripts/local/04-navigation.js').includes('color: window.casoraSceneColor ? window.casoraSceneColor(id) : null'), 'Handy-Menü');
// Szenenreihe: Farben vor frozenHtml und ersetzend
const row = T.casora_scene_row.custom_fields.scenes_row;
assert.ok(row.indexOf('SC.noteColors(variables.scene_colors)') < row.indexOf('SC.frozenHtml(_key)'), 'noteColors vor frozenHtml');
console.log('ok szenen_farbe');
