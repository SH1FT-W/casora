// Prüfrunde d05-03: with HA in Polish the Studio preview titled the overview "Home" and the inspector said
// "… okna: Home", while the dashboard shows "Dom" (nl: "Thuis"). Studio only knew de "Zuhause" and es "Casa".
// Expected: Casora's own overview name shows the Studio's translation of "Home"; keeping that word as the name
// still counts as the standard name (not saved as an own name).
//   node dev/unit/studio_home_wort.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#homeRoomWord,roomLabel,setHomeName
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const one = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return m[0]; };
const grab = (re) => {
  const m = re.exec(src); assert.ok(m, 'not found: ' + re);
  const end = src.indexOf('\n}', m.index), semi = src.indexOf('\n};', m.index);
  return src.slice(m.index, semi >= 0 && semi <= end ? semi + 3 : end + 2);
};
const WORDS = { pl: 'Dom', nl: 'Thuis', fr: 'Maison', en: 'Home', de: 'Zuhause' };
let LANG = 'pl';
globalThis.window = { casoraI18n: { t: (s) => (s === 'Home' ? WORDS[LANG] : s) } };
const S = new Function([
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
  grab(/^const setHomeName = /m),
  'return { roomLabel, setHomeName };',
].join('\n'))();

const home = () => ({ name: 'Home', path: 'home', variables: { casora_auto_name: 'home' } });
for (const l of ['pl', 'nl', 'fr']) {
  LANG = l;
  const hass = { language: l };
  const r = home();
  assert.equal(S.roomLabel(r, [r], hass), WORDS[l], l + ': overview shows the translated word');
  // Leaving the shown word unchanged keeps the mark (stored as "Home").
  assert.equal(S.setHomeName(r, WORDS[l], hass), 'Home', l + ': unchanged word stays the standard');
  assert.equal(r.variables.casora_auto_name, 'home');
  assert.ok(!r.variables.name_literal, l + ': not an own name');
}
LANG = 'de';
assert.equal(S.roomLabel(home(), [home()], { language: 'de' }), 'Zuhause');
LANG = 'en';
assert.equal(S.roomLabel(home(), [home()], { language: 'en' }), 'Home');
// An own name stays as typed.
LANG = 'pl';
const own = home();
S.setHomeName(own, 'Nasz dom', { language: 'pl' });
assert.equal(S.roomLabel(own, [own], { language: 'pl' }), 'Nasz dom');
console.log('studio_home_wort: ok');
