// @deckt: custom_components/casora/panel/casora-panel-b-mehr.js#changeItems,settingText,dashSetting
// The change list names a dashboard setting that sits in one room only (Prüfrunde u04-05): switching the bell off
// (show_notifications, on Home only) read „Badges changed: Home“ because of its show_ prefix. Badges stay grouped,
// the line still takes back only its own change.
//   node dev/unit/aenderungsliste_glocke.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
const win = {};
new Function('window', src('casora-panel-b-mehr.js'))(win);
const { changeLines, revertLine } = win.__casoraStudioMehr;
const J = JSON.stringify;
const room = (path, variables) => ({ path, name: path, tiles: [], variables: variables || {} });
const st = (rooms) => [{ rooms }, {}, {}, null, null];
const clone = (x) => JSON.parse(J(x));

// The sections as in the panel (the ones checked here).
const sections = [
  { label: 'Notifications', scope: 'dashboard', toggle: 'show_notifications', toggleRow: 'Show the bell on this dashboard',
    fields: [{ key: 'notify_battery', label: 'Low battery', type: 'bool', boolDefault: true }] },
  { label: 'Climate', bid: 'climate', toggle: 'show_climate', fields: [] },
];
const panel = src('casora-panel.js');
assert.match(panel, /scope: "dashboard", toggle: "show_notifications",/);
assert.match(panel, /toggleRow: "Show the bell on this dashboard"/);

const base = st([room('home', { show_climate: true }), room('kueche'), room('bad')]);
const ctx = { sections };
const off = clone(base); off[0].rooms[0].variables.show_notifications = false;
assert.deepEqual(changeLines(base, off, ctx), ['Notifications: Show the bell on this dashboard off'], 'the bell by its name');
const bat = clone(base); bat[0].rooms[0].variables.notify_battery = false;
assert.deepEqual(changeLines(base, bat, ctx), ['Notifications: Low battery off']);
// A badge switch stays a badge change.
const cl = clone(base); cl[0].rooms[0].variables.show_climate = false;
assert.deepEqual(changeLines(base, cl, ctx), ['Badges changed: home']);
// Both: two lines, each takes back only itself.
const both = clone(off); both[0].rooms[0].variables.show_climate = false;
const lines = changeLines(base, both, ctx);
assert.equal(lines.length, 2, J(lines));
const i = lines.indexOf('Notifications: Show the bell on this dashboard off');
const back = revertLine(base, both, i, ctx);
assert.ok(back && !back.why, J(back));
assert.deepEqual(changeLines(base, back.state || back, ctx), ['Badges changed: home'], 'the bell taken back, the badge stays');
console.log('aenderungsliste_glocke: ok');
