// HA notifications in the bell (Prüfrunde 26.11.2026):
//  u09-10 a message with simple HTML showed „<bjetzt</b“ in the bell row and the raw tags in the popup; HA itself
//         shows such tags as formatting. Now the row drops tags, the popup keeps b/strong/i/em/br and drops the rest
//         (never an img or script).
//  u09-09 a long title was cut in the bell row and in the popup's head, so it could not be read anywhere; the popup
//         now repeats it in full as its first line.
//   node dev/unit/bell_ha_notification_text.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#pnText,pnHtml,pnTags,showPn
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const cut = (name) => { const a = core.indexOf('  function ' + name + '('); assert.ok(a > 0, name); return core.slice(a, core.indexOf('\n  }\n', a) + 4); };
const opened = [];
const win = {
  casoraPopup: { open: (o) => opened.push(o), close() {} },
  _casoraUI: { group: () => '<div class="hui-row"></div>' },
};
const doc = { documentElement: { lang: 'de' }, addEventListener() {} };
const names = ['pnText', 'pnHtml', 'showPn'].concat(core.includes('  function pnTags(') ? ['pnTags'] : []);
const env = new Function('window', 'document', '_pn', 'PN_OWN',
  'var isAdmin = function () { return true; }, hassOf = function () { return null; }, hideRows = function () {}, _rows = [];\n'
  + 'function esc0(x) { return String(x == null ? "" : x).replace(/[&<>"\']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\\"": "&quot;", "\'": "&#39;" }[c]; }); }\n'
  + names.map(cut).join('\n') + '\nreturn { pnText: pnText, pnHtml: pnHtml, showPn: showPn };');

const MSG = 'Bitte ausräumen <b>jetzt</b> 🍽️ <img src=x onerror=alert(1)>';
const TITLE = 'Die Spülmaschine im Hauswirtschaftsraum hat ihr Programm beendet';
const pn = { n1: { title: TITLE, message: MSG, created_at: '' }, n2: { title: 'Kurz', message: 'Hallo', created_at: '' } };
const P = env(win, doc, pn, {});

// u09-10: the bell row is plain text without tags.
assert.equal(P.pnText(MSG), 'Bitte ausräumen jetzt 🍽️', 'bell row: tags removed, not half removed');
assert.equal(P.pnText('a <br>b'), 'a b', 'a line break is a space');
assert.equal(P.pnText('Wert < 5 und b>2'), 'Wert < 5 und b2', 'a lone < is no tag');
// The popup: simple formatting kept, everything else gone.
const h = P.pnHtml(MSG);
assert.match(h, /Bitte ausräumen <b>jetzt<\/b> 🍽️/, 'bold kept as bold');
assert.doesNotMatch(h, /img|onerror|&lt;/, 'no img, no raw tags');
assert.equal(P.pnHtml('<strong>A</strong> und <em>B</em><br>C'), '<p><b>A</b> und <i>B</i></p><p>C</p>');
assert.equal(P.pnHtml('<script>alert(1)</script>x'), '<p>alert(1)x</p>', 'script tag dropped, its text is plain');
assert.equal(P.pnHtml('**fett** & `code`'), '<p><b>fett</b> &amp; <code>code</code></p>', 'markdown as before');

// u09-09: a long title is readable in full inside the popup.
P.showPn('n1');
const html = opened[0].content.custom_fields.b;
assert.ok(html.includes('<b>' + TITLE + '</b>'), 'full title in the content');
P.showPn('n2');
assert.ok(!opened[1].content.custom_fields.b.includes('<b>Kurz</b>'), 'a short title fits the head, not repeated');
console.log('ok bell ha notification text');
