// Eigene Kachelart (casora-panel-kachelart.js): Ableitung als Überlagerung, Erben nach
// button-card-Regeln, Updates der Grundlage wirken weiter, Studio-Speichern lässt die
// eigene Vorlage unberührt, Kachelart-Auswahl übernimmt Felder der Grundlage.
//   node dev/unit/kachelart.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const read = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
new Function(read('casora-panel-kachelart.js'))();
const L = window.casoraKachelart.lib;
const clone = (x) => JSON.parse(JSON.stringify(x));
const T = JSON.parse(read('casora-templates.json')).templates;

// button-card löst eine Vorlage so auf (vereinfachtes _configFromLLTemplates).
function resolve(templates, cfg) {
  const names = [].concat(cfg.template || []);
  let acc = {};
  names.forEach((n) => { acc = L.overlayApply(acc, resolve(templates, templates[n])); });
  const own = { ...cfg }; delete own.template;
  return names.length ? L.overlayApply(acc, own) : own;
}
const strip = (x) => { const o = clone(x); delete o.template; if (o.variables) delete o.variables.casora_tile; return o; };

// 1. Stil anhängen (so verlangt es Casora von der KI) → Überlagerung ist nur der neue Eintrag.
const base = T.casora_camera;
assert.ok(base, 'casora_camera im Bundle');
const red = { color: 'var(--casora-color-red, #FF453A)' };
const mod1 = clone(base);
mod1.styles = mod1.styles || {};
mod1.styles.name = (mod1.styles.name || []).concat([red]);
const own1 = L.buildOwn('casora_camera', base, mod1, { label: 'Kamera rot', wishes: ['Name rot'] });
assert.equal(own1.template, 'casora_camera', 'erbt von der Grundlage');
assert.deepEqual(own1.styles, { name: [red] }, 'nur die Änderung');
assert.deepEqual(own1.variables, { casora_tile: { label: 'Kamera rot', base: 'casora_camera', wishes: ['Name rot'] } });
assert.ok(!own1.custom_fields && !own1.tap_action && !own1.state, 'keine Kopie der Vorlage');
// Erben: aufgelöst = aufgelöste Fassung mit der Änderung.
const Tw = { ...T, own_kamera_rot: own1, __mod: { ...mod1 } };
assert.deepEqual(strip(resolve(Tw, { template: 'own_kamera_rot' })), strip(resolve(Tw, { template: '__mod' })), 'eigene Art = geänderte Casora-Fassung');

// 2. Casora-Update der Grundlage wirkt weiter (neuer Stil + neues Feld in Casoras Vorlage).
const upd = clone(base);
upd.styles.card = (upd.styles.card || []).concat([{ 'letter-spacing': '0.01em' }]);
upd.variables = { ...(upd.variables || {}), casora_neu_im_update: true };
const after = resolve({ ...T, casora_camera: upd, own_kamera_rot: own1 }, { template: 'own_kamera_rot' });
assert.ok(after.styles.card.some((s) => s['letter-spacing'] === '0.01em'), 'Update der Grundlage kommt an');
assert.equal(after.variables.casora_neu_im_update, true, 'neue Variable der Grundlage kommt an');
assert.ok(after.styles.name.some((s) => s.color === red.color), 'eigene Änderung bleibt');

// 3. Bestehenden Wert ersetzen, Schlüssel entfernen, Variable ändern.
const mod2 = clone(base);
mod2.show_name = !base.show_name;
mod2.variables = { ...(mod2.variables || {}), extra_flag: 'x' };
const someKey = Object.keys(base).find((k) => !['template', 'styles', 'variables', 'show_name'].includes(k));
delete mod2[someKey];
const ov2 = L.overlayOf(base, mod2);
assert.equal(ov2.show_name, mod2.show_name);
assert.equal(ov2[someKey], null, 'entfernter Schlüssel → null');
assert.deepEqual(ov2.variables, { extra_flag: 'x' });
assert.ok(!('styles' in ov2), 'unveränderte Teile fehlen');

// 4. Geänderter Style-Eintrag mitten in der Liste → späterer Eintrag gewinnt.
const b3 = { styles: { card: [{ padding: '10px' }, { color: 'red' }] } };
const m3 = { styles: { card: [{ padding: '12px' }, { color: 'red' }] } };
assert.deepEqual(L.overlayOf(b3, m3), { styles: { card: [{ padding: '12px' }] } });
const flat = (l) => Object.assign({}, ...l);
assert.equal(flat(L.overlayApply(b3, L.overlayOf(b3, m3)).styles.card).padding, '12px');

// 5. state über id.
const b4 = { state: [{ id: 'on', value: 'on', color: 'red' }, { id: 'off', value: 'off' }] };
const m4 = { state: [{ id: 'on', value: 'on', color: 'blue' }, { id: 'off', value: 'off' }] };
assert.deepEqual(L.overlayOf(b4, m4), { state: [{ color: 'blue', id: 'on' }] });

// 6. Umgebaute Liste (kein Stil, kein Anhängen) → vollständige Kopie, die von den Eltern erbt.
const b5 = { template: ['casora_entity'], custom_fields: { x: { list: [1, 2, 3] } } };
const m5 = { template: ['casora_entity'], custom_fields: { x: { list: [3, 2] } } };
assert.equal(L.overlayOf(b5, m5), null);
const own5 = L.buildOwn('casora_x', b5, m5, { label: 'X' });
assert.deepEqual(own5.template, ['casora_entity'], 'Kopie erbt von den Eltern');
assert.equal(own5.variables.casora_tile.copy, true);
assert.deepEqual(own5.custom_fields, m5.custom_fields);

// 7. Bearbeitbare Fassung → erneut ableiten ergibt dieselbe Vorlage (KI erneut anpassen).
const eff = L.effectiveOf(base, own1);
assert.deepEqual(eff.template, base.template);
assert.deepEqual(L.buildOwn('casora_camera', base, eff, { label: 'Kamera rot', wishes: ['Name rot'] }), own1, 'Rundweg stabil');

// 8. Namen: own_ + Umlaute ausgeschrieben, eindeutig.
assert.equal(L.ownName('Kamera mit Standbild', {}), 'own_kamera_mit_standbild');
assert.equal(L.ownName('Küche Licht', { own_kueche_licht: {} }), 'own_kueche_licht_2');
assert.ok(L.brokenJs({ a: '[[[ return ( ]]]' }) && !L.brokenJs({ a: '[[[ return 1 ]]]' }));

// 9. Studio-Speichern (refreshTemplates) lässt own_ unberührt, auch wenn die Grundlage neu ist.
const src = read('casora-panel.js');
function grab(re) {
  const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index), semi = src.indexOf('\n};', m.index);
  return src.slice(m.index, semi >= 0 && semi <= end ? semi + 3 : end + 2);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const { refreshTemplates, fingerprintOf } = new Function([
  one(/^const clone = .*$/m), grab(/^function stable\(/m), grab(/^const hashStr = /m), one(/^const templatePrint = .*$/m),
  grab(/^const fingerprintOf = /m), one(/^const derivedKeysOf = .*$/m), grab(/^function withoutDerived\(/m),
  one(/^const SCENE_KEYS = .*$/m), grab(/^const omit = /m), grab(/^function derivedFrom\(/m), grab(/^function printMatches\(/m),
  grab(/^function refreshTemplates\(/m), 'return { refreshTemplates, fingerprintOf };'].join('\n'))();
const dash = { casora_camera: base, own_kamera_rot: own1 };
const r = refreshTemplates(dash, { ...T, casora_camera: upd }, fingerprintOf({ casora_camera: base }));
assert.deepEqual(r.templates.own_kamera_rot, own1, 'eigene Vorlage unverändert');
assert.deepEqual(r.templates.casora_camera, upd, 'Grundlage aufgefrischt');
assert.ok(r.foreign.includes('own_kamera_rot') && !(own1 && r.prints.own_kamera_rot), 'als eigene erkannt, ohne Fingerabdruck');

// 10. Kachelart-Auswahl: syncUserTileTypes nimmt Felder, Symbol und Farbe der Grundlage.
const sync = grab(/^function syncUserTileTypes\(/m);
const types = [{ id: 'camera', label: 'Camera', template: 'casora_camera', domains: ['camera'], fields: [{ key: 'icon' }] }];
const env = new Function('TILE_TYPES', 'TILE_ICON', 'TILE_COLOR', [
  'const USER_TILE_TYPES = []; const ACTION_DOMAINS = []; const TILE_OWN_KEYS = new Set(["casora_tile"]);',
  'const prettyKey = (k) => k; const ENTITY_ID = /^[a-z_]+\\.[a-z0-9_]+$/;',
  grab(/^function userTypeFields\(/m),
  one(/^const findType = [\s\S]*?\n};/m),
  sync, 'return { sync: syncUserTileTypes, USER_TILE_TYPES };'].join('\n'));
const ICON = { camera: 'camera' }, COLOR = {};
const e = env(types, ICON, COLOR);
e.sync({ own_kamera_rot: own1 }, [], null, {});
const ty = e.USER_TILE_TYPES[0];
assert.equal(ty.id, 'own:own_kamera_rot');
assert.equal(ty.label, 'Kamera rot');
assert.equal(ty.template, 'own_kamera_rot');
assert.equal(ty.baseTemplate, 'casora_camera');
assert.deepEqual(ty.fields, types[0].fields, 'Felder der Grundlage');
assert.equal(ICON['own:own_kamera_rot'], 'camera', 'Symbol der Grundlage');
console.log('ok kachelart');
