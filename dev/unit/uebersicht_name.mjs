// Name der Übersicht – eine Regel überall (04.10.2026).   node dev/unit/uebersicht_name.mjs
// Gemeldet: Wer die Übersicht auf deutscher Oberfläche bewusst „Home“ nennt, sah mal „Home“,
// mal „Zuhause“. Regel: übersetzt wird nur ein Name, den Casora selbst angelegt hat
// (variables.casora_auto_name) und der unverändert ist; alles andere steht wie gespeichert –
// ohne erneutes Speichern, also auch bei Dashboards ohne Markierung.
// Geprüft ohne Browser: Studio (roomLabel), Desktop-Leiste (retargetRoutes + casora-core),
// Raumtitel (casora_room), Handy-Leiste (casora-mobile-nav) und Handy-Kopf (casora_mobile_weather).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/panel/casora-panel.js');
const core = read('custom_components/casora/scripts/casora-core.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };

// ── Dashboard-Laufzeit: window.casoraRoomName + casora-i18n (Wortliste wie PHRASES.de) ──
let LANG = 'de';
const DE = { Home: 'Zuhause', Favorites: 'Favoriten' };
const tr = (s) => (LANG === 'de' && DE[s]) || s;
globalThis.window = { casoraTr: tr };
const a = core.indexOf('// casora-room-name:start');
const b = core.indexOf('// casora-room-name:end');
assert.ok(a >= 0 && b > a, 'casoraRoomName in casora-core.js');
new Function(core.slice(a, b))();
const roomName = window.casoraRoomName;

// ── Studio ──
const code = [
  one(/^const clone = .*$/m),
  one(/^const MOBILE_NAV = .*$/m),
  one(/^const HOME_ROOM_NAME = .*$/m),
  one(/^const isDefaultHomeName = .*$/m),
  'const haLang = (hass) => hass.language;',
  one(/^const homeRoomWord = .*$/m),
  one(/^const isHomeRoom = [^;]*;/ms),
  one(/^const AUTO_HOME = .*$/m),
  one(/^const isLiteralName = .*$/m),
  one(/^const isAutoHome = .*$/m),
  one(/^const isDefaultHome = .*$/m),
  grab(/^const markAutoHome = /m),
  grab(/^const roomLabel = /m),
  one(/^const storedRoomName = .*$/m),
  grab(/^const setHomeName = /m),
  grab(/^function markPhoneManaged\(/m),
  'const roomIcon = () => "mdi:home-variant";',
  grab(/^function roomVisibility\(/m),
  grab(/^function retargetRoutes\(/m),
  'return { roomLabel, setHomeName, markPhoneManaged, retargetRoutes, markAutoHome };',
].join('\n');
const S = new Function(code)();

// Was jede Stelle anzeigt, für eine Raumliste in einer Sprache.
const strip = (t) => t.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const headName = new Function('states', 'variables', strip(T.casora_mobile_weather.name));
const roomLit = T.casora_room.styles.card.find((s) => s['--casora-name-literal'])['--casora-name-literal'];
assert.ok(/casoraRoomName/.test(roomLit), 'Raumtitel nutzt casoraRoomName');
const navSrc = read('custom_components/casora/scripts/local/04-navigation.js');
assert.ok(/casoraRoomName/.test(navSrc), 'Handy-Leiste nutzt casoraRoomName');
const coreRoute = /window\.casoraRoomName\(route\.label/.test(core);
assert.ok(coreRoute, 'Desktop-Leiste nutzt casoraRoomName');

function shown(rooms) {
  const hass = { language: LANG };
  const home = rooms[0];
  // Studio: Raumliste, Vorschau, Editor.
  const studio = S.roomLabel(home, rooms, hass);
  // Desktop/Tablet: Leiste (Route wie casora-core) und Raumtitel (casora_room + casora-i18n).
  const cfg = S.retargetRoutes({ views: [{ cards: [{ type: 'custom:casora-nav', routes: [] }] }] }, 'd', rooms).config
    || S.retargetRoutes({ views: [{ cards: [{ type: 'custom:casora-nav', routes: [] }] }] }, 'd', rooms);
  const route = JSON.stringify(cfg).includes('"routes"') ? findRoutes(cfg)[0] : null;
  const rn = roomName(route.label, { casora_auto_name: route.auto, name_literal: route.literal === true });
  const bar = rn.auto ? rn.text : (rn.literal ? route.label : tr(route.label));
  const t = roomName(home.name, home.variables);
  const title = t.literal ? home.name : tr(home.name);
  // Handy: untere Leiste und Kopf (Studio schreibt home_label / home_name / home_auto).
  const phone = S.markPhoneManaged({ views: [{ cards: [{ type: 'custom:casora-mobile-nav' },
    { type: 'custom:button-card', template: 'casora_mobile_weather', variables: {} }] }] }, true, true, rooms);
  const [navCard, head] = phone.views[0].cards;
  const own = (navCard.home_label || '').trim();
  const nr = roomName(own || 'Home', { casora_auto_name: !own && navCard.home_auto ? 'home' : undefined, name_literal: !!own });
  const navTxt = nr.literal ? nr.text : tr(nr.text);
  const hv = { home_auto: false, name_literal: false, ...head.variables };
  const hr = roomName(String(hv.home_name || '').trim() || 'Home', { casora_auto_name: !hv.home_name && hv.home_auto ? 'home' : undefined,
    name_literal: !!hv.home_name || hv.name_literal === true });
  const headRaw = headName({}, hv);
  // Wörtlicher Name kommt in <span data-no-i18n> (casora-i18n lässt ihn aus, 07.10.2026) – gezeigt wird der Text.
  if (hr.literal && !/^<span data-no-i18n>[\s\S]*<\/span>$/.test(headRaw)) throw new Error('wörtlicher Kopf-Name ohne data-no-i18n: ' + headRaw);
  const headTxt = (hr.literal ? headRaw : tr(headRaw)).replace(/^<span data-no-i18n>([\s\S]*)<\/span>$/, '$1');
  return { studio, bar, title, nav: navTxt, head: headTxt };
}
function findRoutes(o) {
  let out = null;
  (function walk(n) { if (out || !n || typeof n !== 'object') return; if (Array.isArray(n.routes)) { out = n.routes; return; } Object.values(n).forEach(walk); })(o);
  return out;
}
const all = (rooms, want, msg) => {
  const got = shown(rooms);
  Object.entries(got).forEach(([k, v]) => assert.equal(v, want, `${msg} (${LANG}) – ${k}: ${JSON.stringify(got)}`));
};
const R = (name, variables) => [{ path: 'home', name, variables: { ...(variables || {}) } }, { path: 'kueche', name: 'Küche', variables: {} }];

// 1. Markiert und unverändert → übersetzt, Handy und Desktop gleich.
LANG = 'de'; all(R('Home', { casora_auto_name: 'home' }), 'Zuhause', 'markiert, unverändert');
LANG = 'en'; all(R('Home', { casora_auto_name: 'home' }), 'Home', 'markiert, unverändert');
// 2. Markiert, aber geändert → bleibt.
LANG = 'de'; all(R('Unser Haus', { casora_auto_name: 'home' }), 'Unser Haus', 'markiert, geändert');
// 3. Ohne Markierung → bleibt wie gespeichert (auch „Home“ auf Deutsch, ohne erneutes Speichern).
LANG = 'de'; all(R('Home'), 'Home', 'ohne Markierung');
LANG = 'de'; all(R('Zuhause'), 'Zuhause', 'ohne Markierung');
LANG = 'en'; all(R('Zuhause'), 'Zuhause', 'ohne Markierung');
LANG = 'de'; all(R('Unser Haus'), 'Unser Haus', 'ohne Markierung');
// name_literal (Fix vom 04.10. vormittags) geht in der Regel auf.
LANG = 'de'; all(R('Home', { casora_auto_name: 'home', name_literal: true }), 'Home', 'name_literal');

// ── Umbenennen im Studio ──
{
  LANG = 'de';
  const hass = { language: 'de' };
  const r = R('Home', { casora_auto_name: 'home' });
  S.setHomeName(r[0], 'Home', hass);   // auf Deutsch bewusst „Home“ getippt
  assert.equal(r[0].variables.casora_auto_name, undefined, '„Home“ getippt → Markierung weg');
  all(r, 'Home', 'umbenannt in „Home“');
  const r2 = R('Home', { casora_auto_name: 'home' });
  S.setHomeName(r2[0], 'Zuhause', hass); // angezeigtes Standardwort stehen gelassen
  assert.equal(r2[0].variables.casora_auto_name, 'home', 'Standardwort → Markierung bleibt');
  all(r2, 'Zuhause', 'Standardwort stehen gelassen');
  LANG = 'en'; all(r2, 'Home', 'Standardwort stehen gelassen');
  LANG = 'de';
  const r3 = R('Unser Haus');
  S.setHomeName(r3[0], '', hass);      // leer = Casoras Standard
  assert.equal(r3[0].variables.casora_auto_name, 'home', 'leer → wieder Standard');
  all(r3, 'Zuhause', 'leer → Standard');
  const r4 = R('Home');                  // ohne Markierung, „Zuhause“ getippt
  S.setHomeName(r4[0], 'Zuhause', hass);
  all(r4, 'Zuhause', 'ohne Markierung „Zuhause“ getippt');
  LANG = 'en'; all(r4, 'Zuhause', 'ohne Markierung „Zuhause“ getippt');
}

// ── Anlegen durch Casora: blankRoom markiert die Übersicht, „Neuer Raum“ nicht ──
assert.ok(/if \(path === "home" && name === HOME_ROOM_NAME\) variables\.casora_auto_name = AUTO_HOME;/.test(src), 'blankRoom markiert');
assert.ok(/delete added\.variables\.casora_auto_name;/.test(src), 'Neuer Raum „Home“ bleibt eigener Name');
assert.ok(/markAutoHome\(r\)/.test(src), 'Umzug (Hemma 2) markiert');
assert.ok(/I\.markAutoHome\(room\)/.test(read('custom_components/casora/panel/casora-panel-import.js')), 'Umzug (Hemma 1) markiert');

console.log('uebersicht_name: ok');
