// @deckt: custom_components/casora/scripts/local/46-screensaver.js#rooms
// The photo screensaver names a room like the room bar (Prüfrunde u03-02): a Casora view's title is its path
// („kueche“), the room's name is the hero card's name („Küche“). The Studio preview passes its own names.
//   node dev/unit/screensaver_raumname.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array, Promise,
  setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/casora-core.js').match(/\(function \(\) \{\n  if \(window\.casoraRoomName\)[\s\S]*?\n\}\)\(\);/)[0], box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;
const cfg = { views: [
  { title: 'kueche', path: 'kueche', cards: [{ template: 'casora_room', name: 'Küche', variables: { image: 'kitchen' } }] },
  { title: 'Bad', cards: [{ template: 'casora_room', name: '[[[ return "x"; ]]]', variables: { image: 'bath' } }] },
  { title: 'Home', cards: [{ template: 'casora_room', name: 'Home', variables: { image: 'home', casora_auto_name: 'home' } }] },
] };
const names = S.rooms(cfg, {}, false, { url: (r) => '/p/' + r }).map((r) => r.name);
assert.equal(names[0], 'Küche', 'the room\'s name, not the view\'s path');
assert.equal(names[1], 'Bad', 'a template name falls back to the title');
assert.equal(names[2], 'Home', 'Casora\'s own home name goes through casoraRoomName');
console.log('screensaver_raumname: ok');
