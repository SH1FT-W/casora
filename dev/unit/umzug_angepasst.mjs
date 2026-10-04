// Umzug Hemma → Casora: selbst erweiterte Kacheln gehen nicht verloren (03.10.2026).
//   node dev/unit/umzug_angepasst.mjs
// 1. Angepasste Popup-Vorlage (nur über die Vorlagen-Kette der Kachel eingebunden) wird erkannt
//    und mit ihrer Kachel als eine Frage gestellt (vorher: still durch Casoras Fassung ersetzt).
// 2. Übergibt eine Kachel Variablen, die Casoras Vorlage nicht kennt, gilt die Kachelart als
//    angepasst – auch wenn ihre Vorlage ein Original ist.
// 3. „Meine Fassung“ wird eine eigene Kachelart own_<name> (Kachel + Popup, Verweise angepasst);
//    die Kacheln zeigen darauf, casora_<name> bleibt Casoras.
// 4. Eigene Module (Ressourcen) werden als solche erkannt.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8')
  .replace('new URL("./hemma-originals.json", import.meta.url).href', '"x"');
new Function(src)();
const { classify, ownPlan, retarget, isOwnModule, foreignVars } = window.casoraUmzug.lib;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── Synthetisches Hemma-2-Dashboard (nach der Umbenennung hemma_ → casora_) ──
// Originale (wie Hemma sie auslieferte):
const ORIG = {
  casora_entity: { variables: { icon: null, size: 'small' }, show_name: true },
  casora_popup_base: { variables: { popup_title: null } },
  casora_camera: { template: ['casora_entity', 'casora_popup_camera'], variables: { icon: 'camera', show_toggle: true, toggle_entity: null } },
  casora_popup_camera: { template: 'casora_popup_base', tap_action: { casora_popup: { content: '[[[ return {type: "vertical-stack", cards: []}; ]]]' } } },
  casora_light: { template: 'casora_entity', variables: { icon: 'light' } },
  casora_popup_light: { template: 'casora_popup_base', variables: { brightness_step: 10 } },
  casora_lock: { template: 'casora_entity', variables: { icon: 'lock' } },
};
// Casoras aktuelle Fassungen (Bundle):
const SHIPPED = {
  casora_entity: { variables: { icon: null, size: 'small', accent: null }, show_name: true },
  casora_popup_base: { variables: { popup_title: null } },
  casora_camera: { template: ['casora_entity', 'casora_popup_camera'], variables: { icon: 'camera' } },
  casora_popup_camera: { template: 'casora_popup_base', tap_action: { casora_popup: { content: '[[[ return {type: "vertical-stack", cards: [{type: "picture-entity"}]}; ]]]' } } },
  casora_light: { template: ['casora_entity', 'casora_popup_light'], variables: { icon: 'light' } },
  casora_popup_light: { template: 'casora_popup_base', variables: { brightness_step: 5 } },
  casora_lock: { template: 'casora_entity', variables: { icon: 'lock' } },
};
const print = (def) => JSON.stringify(def);
const O = Object.fromEntries(Object.entries(ORIG).map(([k, v]) => [k.replace(/^casora_/, 'hemma_'), [print(v)]]));

// Der Nutzer hat das Kamera-Popup erweitert (Standbild aus snapshot_path), die Kachel selbst nicht.
const defs = clone(ORIG);
defs.casora_popup_camera = { template: 'casora_popup_base', variables: { snapshot_dir: '/local/hemma/snapshots/' },
  tap_action: { casora_popup: { content: "[[[ return window._casoraBeispiel ? window._casoraBeispiel.popup(variables.snapshot_path) : {type: 'vertical-stack', cards: []}; ]]]" } } };
// Hemmas rohe Vorlagen (vor der Umbenennung) – nur die Schlüssel zählen für die Zuordnung.
const rawTpl = Object.fromEntries(Object.entries(defs).map(([k, v]) => [k.replace(/^casora_/, 'hemma_'), JSON.parse(JSON.stringify(v).replace(/casora_/g, 'hemma_'))]));
const asCasora = (def) => JSON.parse(JSON.stringify(def).replace(/hemma_/g, 'casora_'));

const room = { name: 'Garten' };
const tile = (template, entity, variables) => ({ room, tile: { type: 'custom:button-card', template, entity, variables } });
const tiles = [
  tile('casora_camera', 'camera.beispiel_garten', { toggle_entity: 'input_boolean.beispiel_live', snapshot_path: '/local/hemma/snapshots/beispiel_garten.jpg', size: 'large' }),
  tile('casora_camera', 'camera.beispiel_hof', { snapshot_path: '/local/hemma/snapshots/beispiel_hof.jpg' }),
  tile('casora_light', 'light.beispiel', { size: 'small' }),
  // Unveränderte Vorlage, aber eine eigene Schwelle, die nur ein eigenes Modul liest.
  tile('casora_lock', 'lock.beispiel', { warn_after_min: 15 }),
  // In einer bedingten Hülle.
  { room, tile: { type: 'conditional', conditions: [], card: { type: 'custom:button-card', template: 'casora_light', entity: 'light.zwei' } } },
];
const fields = (head) => new Set(head === 'casora_light' ? ['light_group'] : []);
const r = classify({ rawTpl, defs, tiles, shipped: SHIPPED, O, rawFp: {}, pre: 'hemma', fields, print: (def) => print(asCasora(def)) });

// 1. Popup-Vorlage erkannt, Kamera-Kachel + Popup als eine Gruppe.
const cam = r.groups.find((g) => g.key === 'casora_camera');
assert.ok(cam, 'Kamera als angepasste Kachelart: ' + JSON.stringify(r.groups.map((g) => g.key)));
assert.ok(cam.names.includes('casora_popup_camera'), 'Popup gehört zur Kamera-Gruppe');
assert.equal(cam.uses.length, 2, 'beide Kamera-Kacheln betroffen');
assert.ok(!r.structural.includes('casora_popup_camera'), 'Popup nicht mehr still ersetzt');
assert.ok(r.unchanged.includes('casora_light') && r.unchanged.includes('casora_entity'), 'Originale bleiben unverändert');
assert.ok(!r.groups.some((g) => g.key === 'casora_light'), 'Licht ist nicht angepasst (size ist eine Studio-Variable)');

// 2. Unbekannte Variablen → angepasst, auch bei Original-Vorlage.
assert.ok(cam.vars.includes('snapshot_path'), 'snapshot_path ist eigene Logik');
// toggle_entity kennt nur Hemmas unverändertes Original (Casora hat es abgelöst) → zählt nicht.
assert.ok(!cam.vars.includes('toggle_entity'), 'abgelöste Hemma-Variable zählt nicht');
const lock = r.groups.find((g) => g.key === 'casora_lock');
assert.ok(lock && lock.vars.includes('warn_after_min'), 'Original-Vorlage mit fremder Variable gilt als angepasst');
assert.deepEqual(lock.names, ['casora_lock']);
assert.deepEqual(foreignVars(tiles[2], { shipped: SHIPPED, defs, unchanged: new Set(r.unchanged), fields }), [], 'bekannte Variablen nicht');

// Basis-Vorlagen werden nie zur Kachelfrage, auch wenn verändert.
const defs2 = clone(defs); defs2.casora_entity = { variables: { icon: null, size: 'small', mein: 1 }, show_name: true };
const raw2 = clone(rawTpl); raw2.hemma_entity = defs2.casora_entity;
const r2 = classify({ rawTpl: raw2, defs: defs2, tiles, shipped: SHIPPED, O, rawFp: {}, pre: 'hemma', fields, print: (def) => print(asCasora(def)) });
assert.ok(r2.structural.includes('casora_entity'), 'Basis bleibt strukturell');

// 3. „Meine“ → eigene Kachelart own_*.
const plan = ownPlan(cam, defs, Object.assign({}, SHIPPED, defs), 'Kamera (meine)');
assert.equal(plan.map.casora_camera, 'own_camera');
assert.equal(plan.map.casora_popup_camera, 'own_popup_camera');
const ownCam = plan.templates.own_camera;
assert.deepEqual(ownCam.template, ['casora_entity', 'own_popup_camera'], 'Kachel bindet das eigene Popup ein, Basis bleibt Casoras');
assert.deepEqual(ownCam.variables.casora_tile, { label: 'Kamera (meine)', base: 'casora_camera', wishes: [], copy: true, kept: true });
assert.ok(/_casoraBeispiel/.test(JSON.stringify(plan.templates.own_popup_camera)), 'eigene Popup-Logik bleibt');
assert.ok(!Object.keys(plan.templates).some((n) => /^casora_/.test(n)), 'nichts unter casora_* gespeichert');
// Name schon vergeben → Nummer.
const plan2 = ownPlan(cam, defs, Object.assign({ own_camera: {} }, defs), 'X');
assert.equal(plan2.map.casora_camera, 'own_camera_2');
// Verweise im JavaScript werden mit umbenannt.
const js = ownPlan({ key: 'casora_camera', names: ['casora_camera'] },
  { ...defs, casora_camera: { ...defs.casora_camera, custom_fields: { x: "[[[ return {type: 'custom:button-card', template: 'casora_popup_camera'}; ]]]" } } }, {}, 'K');
assert.ok(/'own_popup_camera'/.test(js.templates.own_camera.custom_fields.x), 'JS-Verweis umbenannt');

// Kacheln (Desktop + Handy) zeigen auf die eigene Kachelart, Vorlagen des Dashboards bleiben.
const cfg = { button_card_templates: { casora_camera: {} }, views: [{ cards: [{ type: 'custom:casora-smart-row', cards: [
  { type: 'custom:button-card', template: 'casora_camera', entity: 'camera.beispiel_garten' },
  { type: 'conditional', card: { type: 'custom:button-card', template: ['casora_camera'], entity: 'camera.beispiel_hof' } },
  { type: 'custom:button-card', template: 'casora_light', entity: 'light.beispiel' }] }] }] };
assert.equal(retarget(cfg, plan.map), 2);
assert.equal(cfg.views[0].cards[0].cards[0].template, 'own_camera');
assert.deepEqual(cfg.views[0].cards[0].cards[1].card.template, ['own_camera']);
assert.equal(cfg.views[0].cards[0].cards[2].template, 'casora_light');
assert.ok(cfg.button_card_templates.casora_camera, 'Vorlagen selbst nicht umgestellt');

// 4. Eigene Module.
assert.ok(isOwnModule('/local/hemma-local/beispiel.js?v=2'));
assert.ok(isOwnModule('/hemma_scripts/mein-modul.js'));
assert.ok(!isOwnModule('/hemma_scripts/hemma-core.js'));
assert.ok(!isOwnModule('/casora_scripts/casora-core.js?v=1'));
assert.ok(!isOwnModule('/hacsfiles/button-card/button-card.js'));
console.log('ok umzug_angepasst');
