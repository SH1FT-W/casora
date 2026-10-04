// Vorlagen-Fingerabdruck ohne Browser: casora_room trägt eine Kopie der Navigation,
// deren routes retargetRoutes() je Dashboard umschreibt. Das darf die Vorlage nicht
// als „vom Nutzer geändert“ markieren.  node dev/unit/vorlagen_fingerabdruck.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');

// Top-level-Definition (bis zur schließenden Klammer auf Spalte 0) herausschneiden.
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = [
  one(/^const clone = .*$/m),
  grab(/^function stable\(/m),
  grab(/^const hashStr = /m),
  one(/^const templatePrint = .*$/m),
  grab(/^const fingerprintOf = /m),
  one(/^const derivedKeysOf = .*$/m),
  grab(/^function withoutDerived\(/m),
  one(/^const SCENE_KEYS = .*$/m),
  grab(/^const omit = /m),
  grab(/^function derivedFrom\(/m),
  grab(/^function printMatches\(/m),
  grab(/^function withoutRoutes\(/m),
  grab(/^function refreshTemplates\(/m),
  'const roomIcon = () => "mdi:home-variant";',
  one(/^const isDefaultHomeName = .*$/m),
  one(/^const isHomeRoom = [^;]*;/ms),
  one(/^const AUTO_HOME = .*$/m),
  one(/^const isLiteralName = .*$/m),
  one(/^const isAutoHome = .*$/m),
  one(/^const isDefaultHome = .*$/m),
  grab(/^function retargetRoutes\(/m),
  'return { fingerprintOf, refreshTemplates, retargetRoutes, templatePrint, hashStr, stable };',
].join('\n');
const { fingerprintOf, refreshTemplates, retargetRoutes, hashStr, stable } = new Function(code)();

// Bundle mit einer Raumkarte, die eine Navigation samt routes enthält.
const nav = (base) => ({ type: 'custom:casora-nav', routes: [
  { url: `/${base}/home`, label: 'Home', icon: 'mdi:home-variant' },
  { url: `/${base}/kueche`, label: 'Küche', icon: 'mdi:home-variant' },
  { label: 'Szenen', icon: 'mdi:palette', menu: 'scenes' },
] });
const bundleV1 = { templates: {
  casora_room: { variables: { a: 1 }, custom_fields: { navigation: { card: { card: nav('dashboard-casora') } } } },
  casora_light: { variables: { b: 1 } },
  casora_scene_row: { variables: { scenes: null, x: 1 } },
} };
const bundleV2 = { templates: {
  casora_room: { variables: { a: 1, neu: 2 }, custom_fields: { navigation: { card: { card: nav('dashboard-casora') } } } },
  casora_light: { variables: { b: 2 } },
  casora_scene_row: { variables: { scenes: null, x: 2 } },
} };
const rooms = [{ name: 'Home', path: 'home', variables: {} }, { name: 'Bad', path: 'bad', variables: {} }];

// 1) Neues Dashboard: Fingerabdruck vor retargetRoutes, gespeichert wird das umgeschriebene.
const created = retargetRoutes({ button_card_templates: bundleV1.templates }, 'mein-dash', rooms).config;
const stored = created.button_card_templates;
// applyScenePick(): Szenenwahl auf der Navigation und in casora_scene_row.
stored.casora_room.custom_fields.navigation.card.card.scenes = ['scene.a'];
stored.casora_scene_row.variables.scenes = ['scene.a'];
assert.notEqual(JSON.stringify(stored.casora_room), JSON.stringify(bundleV1.templates.casora_room), 'routes wurden umgeschrieben');
const printsNew = fingerprintOf(bundleV1.templates);
let r = refreshTemplates(stored, bundleV2.templates, printsNew);
assert.deepEqual(r.mine, [], 'casora_room darf nicht als eigene Änderung gelten');
assert.equal(r.updated, 3);
assert.deepEqual(r.templates.casora_room.variables, { a: 1, neu: 2 });

// Unverändertes Bundle: nichts zu tun, nichts „eigenes“.
r = refreshTemplates(stored, bundleV1.templates, printsNew);
assert.deepEqual(r.mine, []);
assert.equal(r.updated, 0);

// 2) Schon betroffene Dashboards (alter Fingerabdruck = ganzer Bundle-Hash inkl. routes).
const printsOld = {};
Object.keys(bundleV1.templates).forEach((k) => { printsOld[k] = hashStr(stable(bundleV1.templates[k])); });
r = refreshTemplates(stored, bundleV2.templates, printsOld);
assert.deepEqual(r.mine, [], 'alter Fingerabdruck: heilt beim nächsten Speichern');
assert.equal(r.updated, 3);
assert.equal(r.prints.casora_room, fingerprintOf(bundleV2.templates).casora_room);
// … und retargetRoutes schreibt die routes danach wieder aufs Dashboard um.
const again = retargetRoutes({ button_card_templates: r.templates }, 'mein-dash', rooms).config;
assert.equal(again.button_card_templates.casora_room.custom_fields.navigation.card.card.routes[1].url, '/mein-dash/bad');

// Alter Fingerabdruck nach einem Studio-Speichern (ganzer Hash des umgeschriebenen) gilt weiter.
const printsSaved = { casora_room: hashStr(stable(stored.casora_room)), casora_light: hashStr(stable(stored.casora_light)) };
r = refreshTemplates(stored, bundleV2.templates, printsSaved);
assert.deepEqual(r.mine, []);

// 3) Echte Nutzeränderung bleibt erhalten.
const edited = JSON.parse(JSON.stringify(stored));
edited.casora_room.variables.a = 99;
r = refreshTemplates(edited, bundleV2.templates, printsNew);
assert.deepEqual(r.mine, ['casora_room']);
assert.equal(r.templates.casora_room.variables.a, 99);
r = refreshTemplates(edited, bundleV2.templates, printsOld);
assert.deepEqual(r.mine, ['casora_room']);

console.log('vorlagen_fingerabdruck: ok');
