// #175 (English dashboard, 19.11.2026): the Updates popup showed „Update gesperrt“, „Zu tun“ and „geprüft vor 3 Std.“.
// Two phrases were missing; the third was a composed text without a pattern that also sat in one text node with the
// separator in front („ · geprüft vor 3 Std.“ after the release notes link), which no phrase can match.
// The reporter kept finding such texts one by one, so this test renders the whole popup in its states (nothing to
// do, updates on offer, blocked, checking, AI rows, skipped, restart, system, history, search) with the real code and
// the real translator and fails on every text that stays German.
//   LC_ALL=en_US.UTF-8 TZ=UTC node dev/unit/i18n_updates_popup.mjs
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraUpdAi,_casoraUpdX,_casoraUpdCheck,custom_components/casora/scripts/local/08-weich-kompakt.js#_casoraSoftUpd,custom_components/casora/translations/dashboard/phrases/en.json,dashboards/casora/button_card_templates.json#casora_popup_updates
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const i18n = read('custom_components/casora/scripts/casora-i18n.js');
const popups = read('custom_components/casora/scripts/local/03-popups.js');
const softSrc = read('custom_components/casora/scripts/local/08-weich-kompakt.js');
const LANGS = ['en', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt'];

function translator(lang) {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: lang } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', i18n)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
  assert.ok(win.casoraTr, 'casoraTr loaded');
  return win.casoraTr;
}

// ── The popup's code, without a browser ──
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const NOW = Date.parse('2026-11-19T09:23:00Z');
Date.now = () => NOW;
const iso = (ms) => new Date(NOW - ms).toISOString();

const store = {};
const doc = { querySelector: () => null, addEventListener: () => {} };
const w = { addEventListener: () => {}, document: doc, casoraLocale: () => 'en', casoraSvc: (s, d) => ({ script: s, data: d }) };
w.window = w;
const ls = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
// No timers: the AI block polls for casoraPopup for a minute, which would keep the test alive that long.
const run = (code) => new Function('window', 'document', 'setTimeout', 'setInterval', 'clearInterval', 'localStorage', code)(w, doc, () => 0, () => 0, () => {}, ls);
const block = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n})();', i) + 6); };
run(block(popups, "(function () {\n  var SENSOR = 'sensor.casora_update_ki_analyse';"));
run(block(popups, '(function () {\n  if (window._casoraUpdX) return;'));
const ck = popups.lastIndexOf('(function () {', popups.indexOf('if (window._casoraUpdCheck) return;'));
run(popups.slice(ck, popups.indexOf('\n})();', ck) + 6));
run(block(softSrc, '(function () {\n  if (window._casoraSoftBat) return;'));
const Ai = w._casoraUpdAi, X = w._casoraUpdX, K = w._casoraUpdCheck, U = w._casoraSoftUpd, H = w._casoraUpdHist5;
assert.ok(Ai && X && K && U && H, 'all blocks of the popup loaded');

// A stand-in for casora-core's UI: every text a row, stage, line or label carries becomes its own element, as the
// real builders do (label, sub line, value, action, confirm question, the live action's words, toast).
const TEXT_KEYS = ['label', 'sub', 'value', 'action', 'confirm', 'text', 'short', 'less', 'hint', 'done', 'facts', 'moons', 'extra',
  'actionLive', 'rules', 'svc'];
const flat = (v) => {
  if (v == null || typeof v === 'boolean' || typeof v === 'number') return '';
  if (typeof v === 'string') return v.indexOf('<') >= 0 ? v : '<div>' + v + '</div>';
  if (Array.isArray(v)) return v.map(flat).join('');
  return TEXT_KEYS.map((k) => flat(v[k])).join('');
};
let soft = true;
const UI = {
  soft: () => soft, v3: () => true,
  group: (rows, label) => flat(label) + flat(rows),
  label: (t) => flat(t),
  line: (head, subs) => flat(head) + flat(subs),
  stage: (kind, o) => flat(o),
  empty: (o) => flat(o),
  more: (id, html, o) => flat((o && o.label) || 'Mehr') + flat((o && o.less) || 'Weniger') + (html || ''),
  icon: () => '',
};
w._casoraUI = UI;

// ── The house: every kind of update row and every AI verdict ──
const RESTART = "<ha-alert alert-type='error'>Restart of Home Assistant required</ha-alert>";
const upd = (name, extra, state = 'on') => ({ state, attributes: { friendly_name: name, title: name, installed_version: '1.0', latest_version: '2.0',
  in_progress: false, supported_features: 1, ...extra } });
const AI = 'sensor.casora_update_ki_analyse';
const ai = (list, extra) => ({ state: 'ok', attributes: { analysen: list, ...extra } });
const an = (id, extra) => ({ id, to: '2.0', status: 'done', level: 'info', headline: 'Headline', summary: 'Summary', ...extra });
const C = {
  system: [['update.core', 'Home Assistant Core'], ['update.os', 'Betriebssystem'], ['update.supervisor', 'Supervisor']],
  backupLast: 'sensor.backup_last', backupNext: 'sensor.backup_next', backupState: 'sensor.backup_state',
};
const sensor = (state) => ({ state, attributes: {} });
const base = () => ({
  'update.core': upd('Home Assistant Core', {}, 'off'), 'update.os': upd('Home Assistant OS', { auto_update: true }, 'off'),
  'update.supervisor': upd('Supervisor', { auto_update: true }, 'off'),
  'update.hacs_update': upd('Marketplace', {}, 'off'), 'update.casora_update': upd('Casora', {}, 'off'),
  'sensor.backup_last': sensor(iso(4 * HOUR)), 'sensor.backup_next': sensor(iso(-20 * HOUR)), 'sensor.backup_state': sensor('idle'),
  [AI]: ai([]),
});
const hass = { entities: { 'update.core': { platform: 'hassio' }, 'update.os': { platform: 'hassio' }, 'update.supervisor': { platform: 'hassio' },
  'update.card': { platform: 'marketplace' }, 'update.casora_update': { platform: 'hacs' } } };

const HOUSES = [];
// Nothing to do.
HOUSES.push({ name: 'up to date', states: base() });
// The report: one update the AI wants a look at, checked three hours ago, with a to-do list and a link.
HOUSES.push({ name: 'one blocked update', states: { ...base(), 'update.portainer': upd('Portainer'),
  [AI]: ai([an('update.portainer', { level: 'action', affects: ['portainer integration'], todo: ['Review roles'],
    source: 'https://example.org/notes', checked: iso(3 * HOUR) })]) } });
// Every verdict next to each other, every age the relative time knows.
HOUSES.push({ name: 'all verdicts', states: { ...base(),
  'update.core': upd('Home Assistant Core'), 'update.card': upd('Card'), 'update.none': upd('Unchecked'),
  'update.running': upd('Running', { in_progress: true }), 'update.error': upd('Failing'), 'update.breaking': upd('Breaking one'),
  'update.breaking2': upd('Breaking two'), 'update.action': upd('Acting'), 'update.acked': upd('Acked'), 'update.acked2': upd('Acked two'),
  'update.info': upd('Harmless'), 'update.unknown': upd('Unclear one'), 'update.noinstall': upd('Read only', { supported_features: 0 }),
  'update.skipped': upd('Skipped one', { skipped_version: '2.0' }, 'off'),
  'update.restart': upd('Needs restart', { installed_version: '2.0', release_summary: RESTART }, 'off'),
  'sensor.backup_state': sensor('create_backup'),
  [AI]: ai([
    an('update.running', { status: 'running', checked: iso(5 * MIN) }),
    an('update.error', { status: 'error', checked: iso(0) }),
    an('update.breaking', { level: 'breaking', affects: ['One'], todo: ['Two'], source: 'https://example.org/a', checked: iso(26 * HOUR) }),
    an('update.breaking2', { level: 'breaking', headline: '', checked: iso(4 * DAY) }),
    an('update.action', { level: 'action', checked: iso(59 * MIN) }),
    an('update.acked', { level: 'action', ack: true, ack_at: iso(2 * HOUR), checked: iso(3 * HOUR) }),
    an('update.acked2', { level: 'breaking', ack: true, checked: iso(3 * HOUR) }),
    an('update.info', { checked: iso(3 * HOUR), source: 'https://example.org/b' }),
    an('update.unknown', { level: 'odd', checked: iso(3 * HOUR) }),
  ]) } });
// The AI summary's other sentences: one harmless, all harmless, some open, none checked, still checking, off.
HOUSES.push({ name: 'one harmless', states: { ...base(), 'update.a': upd('Alpha'), [AI]: ai([an('update.a')]) } });
HOUSES.push({ name: 'all harmless', states: { ...base(), 'update.a': upd('Alpha'), 'update.b': upd('Beta'), [AI]: ai([an('update.a'), an('update.b')]) } });
HOUSES.push({ name: 'some open', states: { ...base(), 'update.a': upd('Alpha'), 'update.b': upd('Beta'), [AI]: ai([an('update.a')]) } });
HOUSES.push({ name: 'none checked', states: { ...base(), 'update.a': upd('Alpha') } });
HOUSES.push({ name: 'still checking', states: { ...base(), 'update.a': upd('Alpha'), [AI]: ai([an('update.a', { status: 'running', checked: iso(0) })]) } });
HOUSES.push({ name: 'one breaking', states: { ...base(), 'update.a': upd('Alpha'), [AI]: ai([an('update.a', { level: 'breaking' })]) } });
HOUSES.push({ name: 'two need attention', states: { ...base(), 'update.a': upd('Alpha'), 'update.b': upd('Beta'),
  [AI]: ai([an('update.a', { level: 'action' }), an('update.b', { level: 'action' })]) } });
HOUSES.push({ name: 'AI check off', states: { ...base(), 'update.a': upd('Alpha'), [AI]: ai([], { zeitplan: 'off' }) } });
// Only a restart is owed; the backup failed, is overdue, is old, is due today, tomorrow, next week.
HOUSES.push({ name: 'restart only', states: { ...base(), 'update.restart': upd('Needs restart', { installed_version: '2.0', release_summary: RESTART }, 'off') } });
HOUSES.push({ name: 'backup failed', states: { ...base(), 'sensor.backup_tried': sensor(iso(HOUR)) }, tried: 'sensor.backup_tried' });
HOUSES.push({ name: 'backup overdue', states: { ...base(), 'sensor.backup_last': sensor(iso(3 * DAY)), 'sensor.backup_next': sensor(iso(2 * HOUR)) } });
HOUSES.push({ name: 'backup old', states: { ...base(), 'sensor.backup_last': sensor(iso(30 * HOUR)), 'sensor.backup_next': sensor('unknown') } });
HOUSES.push({ name: 'backup today', states: { ...base(), 'sensor.backup_last': sensor(iso(2 * MIN)), 'sensor.backup_next': sensor(iso(-2 * HOUR)) } });
HOUSES.push({ name: 'backup next week', states: { ...base(), 'sensor.backup_last': sensor(iso(20 * 1000)), 'sensor.backup_next': sensor(iso(-5 * DAY)) } });
HOUSES.push({ name: 'no backup yet', states: { ...base(), 'sensor.backup_last': sensor('unknown'), 'sensor.backup_next': sensor('unknown') } });
// More than twelve updates: „Alle n anzeigen“.
const many = base();
for (let i = 1; i <= 14; i++) many['update.dev' + i] = upd('Device ' + i);
HOUSES.push({ name: 'fourteen updates', states: many });

// What the history and the search button can say.
const HISTORIES = [
  { ts: NOW }, { ts: NOW, err: true }, { ts: NOW, list: [] },
  { ts: NOW, list: [{ id: 'update.core', from: '1.0', to: '2.0', t: NOW - 20 * 1000 }, { id: 'update.os', from: '', to: '2.0', t: NOW - 7 * MIN },
    { id: 'update.gone', from: '1.0', to: '2.0', t: NOW - 5 * HOUR }, { id: 'update.casora_update', from: '1.0', to: '2.0', t: NOW - 26 * HOUR },
    { id: 'update.supervisor', from: '1.0', to: '2.0', t: NOW - 9 * DAY }] },
];
const SEARCHES = [
  { busy: false, last: null }, { busy: true, last: NOW - HOUR },
  { busy: false, last: NOW - 20 * 1000, found: 0 }, { busy: false, last: NOW - 5 * MIN, found: 1 }, { busy: false, last: NOW - 10 * MIN, found: 3 },
  { busy: false, last: NOW - 2 * MIN, err: true }, { busy: false, last: NOW - 3 * HOUR, found: 0 }, { busy: false, last: NOW - 26 * HOUR, found: 0 },
  { busy: false, last: NOW - 4 * DAY, found: 0 },
];

// Every piece of the popup as HTML, in German (the source language).
function render() {
  const out = [];
  const add = (where, html) => { if (html) out.push([where, String(html)]); };
  for (const house of HOUSES) {
    const st = house.states;
    w.casoraDevice = house.tried ? { keyAny: () => house.tried } : undefined;
    for (const hist of HISTORIES) {
      for (const k of Object.keys(H)) delete H[k];
      Object.assign(H, hist);
      for (const isSoft of [true, false]) {
        soft = isSoft;
        const h = { UI, C, hass, states: st, headOut: (t) => flat(t), logoOf: () => null };
        const tag = house.name + (isSoft ? ' (Casora look)' : ' (standard)');
        for (const part of ['hero', 'stage', 'list', 'chk', 'more']) {
          add(tag + ' › ' + part, U.sec(part, { ...C, aiInMore: true }, st, hass));
        }
        add(tag + ' › AI check', Ai(st, { nameOf: (id) => st[id].attributes.friendly_name }));
        add(tag + ' › status line', X.ov(st, hass));
        add(tag + ' › list', X.list(st, h));
        add(tag + ' › restart', X.restart(st, h));
        add(tag + ' › skipped', X.skip(st, h));
        add(tag + ' › system', X.sys(st, h));
        add(tag + ' › history', X.hist(st, hass, h));
      }
    }
  }
  for (const s of SEARCHES) {
    Object.assign(K, { busy: false, last: null, found: null, foundIds: null, err: false }, s);
    add('search', K.html(false)); add('search', K.html(true)); add('search', K.html('row')); add('search', K.v3Status());
    add('search', flat(K.status({})));
  }
  // The sweep's words on a blocked row and the popup's own frame (title, head of the list).
  for (const t of ['Freigeben', 'Bestätigen', 'Aktualisieren']) add('blocked row', flat(t));
  const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_popup_updates;
  const title = String(tpl.tap_action.casora_popup.title).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  add('title', flat(new Function('variables', 'window', title)({}, {})));
  const content = String(tpl.tap_action.casora_popup.content);
  for (const t of ['Verfügbare Updates', 'Wartet auf Neustart', 'Jetzt neu starten', 'Alle aktualisieren', 'Home Assistant jetzt neu starten?']) {
    assert.ok(content.includes(t), 'the template still says „' + t + '“');
    add('template', flat(t));
  }
  // Older text variants the template still carries.
  // They sit in code the template keeps as a string, with \uXXXX escapes.
  const escaped = (t) => t.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  for (const t of ['Zurückholen', 'Aktuell · automatische Updates']) {
    assert.ok(content.includes(escaped(t)), 'the template still says „' + t + '“');
    add('template', flat(t));
  }
  return out;
}

// Text nodes of a piece of HTML as the translator sees them (style blocks and data-no-i18n spans left out).
function textNodes(html) {
  const nodes = [];
  let skip = 0, style = false;
  for (const p of html.split(/(<(?:[^>"']|"[^"]*"|'[^']*')*>)/)) {
    if (p.charAt(0) === '<') {
      style = /^<(style|script)\b/i.test(p) || (style && !/^<\/(style|script)/i.test(p));
      if (skip) { if (/^<span\b/i.test(p)) skip++; else if (/^<\/span/i.test(p)) skip--; } else if (/^<span\b[^>]*\bdata-no-i18n\b/i.test(p)) skip = 1;
    } else if (!style && !skip && /[A-Za-zÄÖÜäöüß]{2}/.test(p)) nodes.push(p);
  }
  return nodes;
}

// Words that read the same in the language, names of the fixtures and the AI's own (already English) text.
const NAMES = new Set(['Home Assistant', 'Home Assistant Core', 'Home Assistant OS', 'Supervisor', 'Marketplace', 'Casora', 'Portainer', 'Card',
  'Unchecked', 'Running', 'Failing', 'Breaking one', 'Breaking two', 'Acting', 'Acked', 'Acked two', 'Harmless', 'Unclear one', 'Read only',
  'Skipped one', 'Needs restart', 'Alpha', 'Beta', 'Headline', 'Summary', 'One', 'Two', 'Review roles', 'portainer integration', 'gone']);
for (let i = 1; i <= 14; i++) NAMES.add('Device ' + i);
const SAME = {
  en: ['Backup', 'System', 'Status', '● Breaking'], es: [], fr: [], it: ['Backup'], nb: ['System', 'Status', 'Alle'], nl: ['Automatisch', 'Status', 'automatisch', '● Breaking', 'Starten'],
  pl: ['System', 'Status'], pt: ['Backup'],
};
// German that must not be left inside a translated English text (a pattern whose inner part found no phrase).
const GERMAN_LEFT = /[äöüÄÖÜß]|\b(vor|seit|noch|nicht|gerade|eben|gestern|heute|morgen|Std\.|Min\.|Tagen?|geprüft|gesperrt|läuft|von|auf|erst|lesen|übersprungen|neue[sr]?|Suche|Zuletzt|Nächstes)\b/;

const pieces = render();
const nodes = new Map();
for (const [where, html] of pieces) for (const n of textNodes(html)) if (!nodes.has(n)) nodes.set(n, where);
assert.ok(nodes.size > 120, 'the popup rendered its texts: ' + nodes.size);
// The three texts of the report are among them, as the popup builds them.
const all = [...nodes.keys()].map((n) => n.trim());
for (const t of ['Headline · Update gesperrt', 'Zu tun', 'geprüft vor 3 Std.', 'Release-Notes', 'Software-Updates']) {
  assert.ok(all.includes(t), 'rendered as its own text: „' + t + '“');
}

for (const lang of LANGS) {
  const tr = translator(lang);
  const same = new Set(SAME[lang]);
  const bad = [];
  for (const [node, where] of nodes) {
    const out = tr(node);
    const got = out.split('·').map((p) => p.trim());
    for (const part of node.split('·').map((p) => p.trim())) {
      if (!/[A-Za-zÄÖÜäöüß]{2}/.test(part) || NAMES.has(part) || same.has(part)) continue;
      // A name with a count („Home Assistant · 2“) or a version is split off above; what is left must have changed.
      if (got.includes(part)) bad.push(`${where}: „${node.trim()}“ → „${out.trim()}“`);
    }
    if (lang === 'en' && GERMAN_LEFT.test(out)) bad.push(`${where}: German left in „${out.trim()}“ (from „${node.trim()}“)`);
  }
  assert.deepEqual([...new Set(bad)], [], lang + ': texts of the Updates popup that stay German');
}
console.log('i18n_updates_popup: ok (' + nodes.size + ' texts, ' + LANGS.length + ' languages)');
