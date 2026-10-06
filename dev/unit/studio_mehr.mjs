// Studio „mehr Bedienung“ (06.10.2026) ohne Browser.  node dev/unit/studio_mehr.mjs
// QR-Kodierer (Format-Bits, Sucher, fester Abdruck – gegen jsQR geprüft), Änderungsliste in
// Klartext, Suche (Synonyme, Reihenfolge), Raum-Sichtbarkeit beim Speichern (Desktop/Handy),
// Geräteauswahl der Übersicht nach Raum, casora-smart-row (Bedingung „user“), Badge-Freigabe
// (casoraSeen) und die Rückfrage vor dem Schalten (welche Aktionen, welches Wort).
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');

// ── Modul laden (ohne customElements: nur die reinen Teile) ─────────────────────────
const win = {};
new Function('window', read('panel/casora-panel-b-mehr.js'))(win);
const M = win.__casoraStudioMehr;
assert.ok(M && M.qrMatrix && M.changeLines && M.searchRank, 'Bausteine fehlen');

// QR: Größe, Sucher, Format-Bits (BCH, Stufe M) und fester Abdruck
const url = 'http://homeassistant.local:8123/test-neu-mobile';
const m = M.qrMatrix(url);
assert.equal(m.length, 33, 'Version 4 (33×33) für diese Adresse');
const finder = (x, y) => [0, 1, 2, 3, 4, 5, 6].every((d) => m[y][x + d] && m[y + 6][x + d] && m[y + d][x] && m[y + d][x + 6]);
assert.ok(finder(0, 0) && finder(26, 0) && finder(0, 26), 'drei Suchmuster');
let fmt = 0;
for (let i = 0; i <= 5; i++) fmt |= (m[i][8] ? 1 : 0) << i;
fmt |= (m[7][8] ? 1 : 0) << 6; fmt |= (m[8][8] ? 1 : 0) << 7; fmt |= (m[8][7] ? 1 : 0) << 8;
for (let i = 9; i < 15; i++) fmt |= (m[8][14 - i] ? 1 : 0) << i;
const raw = fmt ^ 0x5412;
assert.equal(raw >>> 13, 0, 'Fehlerkorrektur M');
let rem = raw >>> 10;
for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
assert.equal(rem & 0x3ff, raw & 0x3ff, 'Format-Bits mit gültiger Prüfsumme');
const print = crypto.createHash('sha1').update(m.map((r) => r.map((c) => (c ? 1 : 0)).join('')).join('\n')).digest('hex').slice(0, 12);
assert.equal(print, '13abe7668d00', 'Abdruck wie beim Gegenlesen mit jsQR (bei Änderung neu prüfen)');
assert.ok(M.qrSvg(url).startsWith('<svg') && !/token|password/i.test(M.qrSvg(url)), 'SVG ohne Zugangsdaten');
{ const n = M.qrMatrix('x'.repeat(300)).length; assert.ok((n - 17) % 4 === 0 && n <= 4 * 20 + 17, 'lange Adresse passt'); }
assert.throws(() => M.qrMatrix('x'.repeat(800)), /too long/);

// Änderungsliste
const tile = (name, entity, extra) => ({ type: 'custom:button-card', template: 'casora_light', name, entity, ...(extra || {}) });
const room = (path, name, tiles, variables) => ({ path, name, tiles: tiles || [], variables: variables || {} });
const st = (rooms) => [{ rooms }, {}, {}, null, null];
const before = st([room('home', 'Home', [tile('A', 'light.a')]), room('kueche', 'Küche', [tile('Spüle', 'light.s'), tile('Herd', 'light.h')])]);
const after = st([room('home', 'Home', [tile('A', 'light.a'), tile('Neu', 'light.n')], { casora_badge_users: { lights: ['u1'] } }),
  room('kueche', 'Küche & Essen', [tile('Herd', 'light.h')], { casora_hidden: true }), room('bad', 'Bad')]);
const lines = M.changeLines(before, after, {});
assert.deepEqual(lines, [
  'Room added: Bad',
  'Who sees it changed: Home',
  'Tile added: Neu · Home',
  'Room renamed: Küche → Küche & Essen',
  'Room hidden: Küche & Essen',
  'Tile removed: Spüle · Küche & Essen',
], JSON.stringify(lines));
const moved = st([room('home', 'Home', [tile('B', 'light.b'), tile('A', 'light.a')])]);
assert.deepEqual(M.changeLines(st([room('home', 'Home', [tile('A', 'light.a'), tile('B', 'light.b')])]), moved, {}), ['Tile order changed: Home']);
const renamedTile = st([room('home', 'Home', [tile('A2', 'light.a')])]);
assert.deepEqual(M.changeLines(st([room('home', 'Home', [tile('A', 'light.a')])]), renamedTile, {}), ['Tile changed: A2 · Home']);
assert.deepEqual(M.changeLines(before, before, {}), [], 'nichts geändert');

// Suche: Alltagswörter, vorn im Namen zuerst, alle Wörter müssen passen
const items = [
  { kind: 'action', label: 'Zeitreise', words: 'verlauf backup version früher' },
  { kind: 'action', label: 'Look ändern', words: 'design theme farben' },
  { kind: 'tile', label: 'Deckenlicht', sub: 'Küche', words: 'light.decke' },
  { kind: 'room', label: 'Küche', words: 'raum' },
  { kind: 'badge', label: 'Beleuchtung', sub: 'Küche', words: 'licht lampen' },
];
assert.equal(M.searchRank(items, 'Verlauf')[0].label, 'Zeitreise');
assert.equal(M.searchRank(items, 'backup')[0].label, 'Zeitreise');
assert.equal(M.searchRank(items, 'theme')[0].label, 'Look ändern');
assert.equal(M.searchRank(items, 'kuche')[0].label, 'Küche', 'Umlaute egal, Raum vorn');
assert.deepEqual(M.searchRank(items, 'licht').map((x) => x.label), ['Deckenlicht', 'Beleuchtung']);
assert.deepEqual(M.searchRank(items, 'licht küche').map((x) => x.label), ['Deckenlicht', 'Beleuchtung']);
assert.equal(M.searchRank(items, '').length, 0);

// ── Panel: Raum-Sichtbarkeit, Geräteauswahl der Übersicht ───────────────────────────
const src = read('panel/casora-panel.js');
const grab = (name) => {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, name);
  return src.slice(i, src.indexOf('\n}', i) + 2);
};
const roomVisibility = new Function(grab('roomVisibility') + '\nreturn roomVisibility;')();
assert.deepEqual(roomVisibility({}).set, false);
assert.deepEqual(roomVisibility({ casora_hidden: true }).view, false);
assert.deepEqual(roomVisibility({ casora_hidden: true }).cond, [{ condition: 'user', users: [] }]);
assert.deepEqual(roomVisibility({ casora_users: ['a', 'b'] }).view, [{ user: 'a' }, { user: 'b' }]);
assert.deepEqual(roomVisibility({ casora_users: ['a'] }).cond, [{ condition: 'user', users: ['a'] }]);
assert.ok(/\.filter\(\(r\) => !roomVisibility\(r\.variables\)\.hidden\)/.test(src), 'Navigation ohne ausgeblendete Räume');
assert.ok(/if \(twin\.visibility !== undefined\) mt\.visibility = clone\(twin\.visibility\)/.test(src), 'Handy-Kachel übernimmt „Wer sieht das?“');
const homePickOrder = new Function(grab('homePickOrder') + '\nreturn homePickOrder;')();
const areas = { k: { name: 'Küche' }, w: { name: 'Wohnzimmer' }, g: { name: 'Garage' } };
const picked = homePickOrder([
  { id: 'light.x', area: '' }, { id: 'light.g', area: 'Garage' }, { id: 'light.w', area: 'Wohnzimmer' }, { id: 'light.k', area: 'Küche' },
], [null, 'w', 'k'], areas).map((c) => c.id);
assert.deepEqual(picked, ['light.w', 'light.k', 'light.g', 'light.x'], 'Räume wie im Studio, dann übrige, ohne Bereich zuletzt');

// ── casora-smart-row: Bedingung „user“ ─────────────────────────────────────────────
const row = read('scripts/smart-row.js');
const pick = (s, name) => { const i = s.indexOf('function ' + name + '('); return s.slice(i, s.indexOf('\n}', i) + 2); };
const isOff = new Function('document', [pick(row, 'resolveCardConfig'), pick(row, 'userHides'), pick(row, 'currentUser'),
  pick(row, 'isCardDisabled'), 'return isCardDisabled;'].join('\n'))({ querySelector: () => null });
const me = { id: 'me' };
assert.equal(isOff({ template: 'x' }, false, me), false);
assert.equal(isOff({ template: 'x', visibility: [{ condition: 'user', users: ['me'] }] }, false, me), false);
assert.equal(isOff({ template: 'x', visibility: [{ condition: 'user', users: ['other'] }] }, false, me), true);
assert.equal(isOff({ type: 'custom:casora-smart-row', visibility: [{ condition: 'user', users: [] }] }, false, me), true, 'ausgeblendeter Raum');
assert.equal(isOff({ type: 'conditional', card: { template: 'x', visibility: [{ condition: 'user', users: ['other'] }] } }, false, me), true);
assert.equal(isOff({ template: 'x', visibility: [{ condition: 'state', entity: 'a', state: 'on' }] }, false, me), false, 'andere Bedingungen unberührt');

// ── casora-core: casoraSeen, Rückfrage ──────────────────────────────────────────────
const core = read('scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
const w2 = { addEventListener: () => {} };
const doc = { querySelector: () => ({ hass: { user: { id: 'me' }, states: { 'light.k': { state: 'on', attributes: { friendly_name: 'Küchenlicht' } },
  'cover.r': { state: 'closed', attributes: {} } } } }) };
new Function('window', 'document', 'WeakSet', 'CustomEvent',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w2, doc, WeakSet, class {});
assert.equal(w2.casoraSeen({ casora_badge_users: { lights: ['other'] } }, 'lights', { id: 'me' }, true), false);
assert.equal(w2.casoraSeen({ casora_badge_users: { lights: ['me'] } }, 'lights', { id: 'me' }, true), true);
assert.equal(w2.casoraSeen({}, 'lights', { id: 'me' }, true), true);
assert.equal(w2.casoraSeen({ casora_badge_users: { lights: ['other'] } }, 'climate', { id: 'me' }, undefined), undefined, 'andere Badges unberührt');
assert.equal(w2.casoraSeesRoute({ users: ['other'] }), false);
assert.equal(w2.casoraSeesRoute({ users: ['me'] }), true);
const A = w2.__casoraAskFirstParts;
assert.ok(A.switching({ action: 'tap', config: { tap_action: { action: 'toggle' } } }));
assert.ok(A.switching({ action: 'tap', config: { tap_action: { action: 'call-service', service: 'light.toggle' } } }));
assert.equal(A.switching({ action: 'tap', config: { tap_action: { action: 'call-service', service: 'none' } } }), null);
assert.equal(A.switching({ action: 'tap', config: { tap_action: { action: 'more-info' } } }), null, 'Mehr-Infos ohne Rückfrage');
assert.equal(A.switching({ action: 'tap', config: { tap_action: { action: 'call-service', service: 'x', casora_popup: {} } } }), null, 'Popup ohne Rückfrage');
assert.deepEqual(A.word({ action: 'call-service', service: 'light.toggle', target: { entity_id: 'light.k' } }, {}), { name: 'Küchenlicht', verb: 'Ausschalten' });
assert.equal(A.word({ action: 'call-service', service: 'cover.toggle', target: { entity_id: 'cover.r' } }, {}).verb, 'Öffnen');
assert.equal(A.word({ action: 'toggle' }, { entity: 'light.k', name: 'Spot' }).name, 'Spot');

// ── Vorlagen: Badge-Schalter fragen casoraSeen ──────────────────────────────────────
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const name of ['casora_room', 'casora_mobile_sensor_chips']) {
  const s = JSON.stringify(tpl[name]);
  assert.ok(!/(?<![\w.$(,])(variables|_rv)\.show_(lights|climate|people|media|security|energy|scenes)\b(?!:)/.test(
    s.replace(/window\.casoraSeen\((variables|_rv),'\w+',user,\1\.show_\w+\):\1\.show_\w+/g, '')), name + ': jeder Badge-Schalter über casoraSeen');
}
console.log('studio_mehr: ok');
