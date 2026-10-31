// Studio menus name the same action the same way: the dashboard menu said „Symbol …“ (Icon…), the room menu
// „Symbol ändern …“ (Change Icon…).   node dev/unit/studio_menu_words.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
const doc = read('casora-panel-b.js').match(/id: "doc:icon", label: "([^"]+)"/);
const room = read('casora-panel.js').match(/id: "icon", label: "(Change Icon[^"]*)", icon: "grid", group: "This Room"/);
assert.ok(doc && room, 'menu entries found');
assert.equal(doc[1], room[1], 'dashboard menu „icon“ entry has the room menu wording');
console.log('studio_menu_words: ok');
