// Studio menus name the same action the same way: the dashboard menu said „Symbol …“ (Icon…), the room menu
// „Symbol ändern …“ (Change Icon…); the search said „Look ändern“ for the topic „Aussehen“.   node dev/unit/studio_menu_words.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
const doc = read('casora-panel-b.js').match(/id: "doc:icon", label: "([^"]+)"/);
const room = read('casora-panel.js').match(/id: "icon", label: "(Change Icon[^"]*)", icon: "grid", group: "This Room"/);
assert.ok(doc && room, 'menu entries found');
assert.equal(doc[1], room[1], 'dashboard menu „icon“ entry has the room menu wording');
// The search action „Change the look“ said „Look ändern“; the topic and the phone tab say „Aussehen“ (Look & feel).
const de = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/panel/de.json', import.meta.url), 'utf8')).exact;
assert.equal(de['Look & feel'], 'Aussehen');
assert.equal(de['Change the look'], 'Aussehen ändern', 'search action named like the topic');
console.log('studio_menu_words: ok');
