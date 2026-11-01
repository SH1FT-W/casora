// Rule (owner, 01.11.2026; richtlinien §3): the status line never repeats the stage's value. Alarm: „Aktiviert (Zuhause)“
// stood in the head (HA's state word, the frame's fallback) and as the sentence in the wheel – the v3 alarm popup now
// has its own line („Seit 14:42“). The energy popup's words are covered by energy_status_words.mjs. popup-geo.mjs
// checks every opened popup („doppelt“).
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {} };
window.casoraLocale = () => 'de-DE';
const lines = [];
window._casoraUI = { line: (main, rest) => { lines.push([main, rest]); return '<div class="hui-line"><b>' + main + '</b></div>'; } };
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/07-weich-spezial.js', import.meta.url), 'utf8');
try { new Function(src)(); } catch (e) { /* the rest needs a DOM – the alarm helpers exist before */ }
const AL = window._casoraAlarmSoft;
assert.ok(AL && AL.since && AL.line, 'alarm helpers loaded');

const now = new Date(2026, 10, 1, 18, 0);
assert.equal(AL.since(new Date(2026, 10, 1, 14, 42).toISOString(), now), 'Seit 14:42', 'today: the clock');
assert.equal(AL.since(new Date(2026, 9, 28, 9, 5).toISOString(), now), 'Seit 28.10.', 'earlier: the date');
assert.equal(AL.since(null, now), '', 'no time, no line');

const S = { 'alarm_control_panel.house': { state: 'armed_home', last_changed: new Date().toISOString(), attributes: {} } };
const html = AL.line('alarm_control_panel.house', S);
assert.ok(/^<div class="hui-line"><b>Seit \d\d:\d\d<\/b>/.test(html), 'status line says since when');
assert.ok(!/Aktiviert|Zuhause/.test(html), 'not the stage sentence');

// The v3 alarm popup puts that line on top (lifted into the head) before its stage.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const c = T.casora_popup_alarm.tap_action.casora_popup.content;
const v3 = c.slice(c.indexOf('if (_v3a) {'));
assert.ok(v3.indexOf("add('hero'") > -1 && v3.indexOf("add('hero'") < v3.indexOf("add('stage'"), 'alarm v3: status line field before the stage');
assert.ok(/_casoraAlarmSoft\.line\(/.test(v3), 'alarm v3: uses AL.line');

// The frame replaces a head that reads like the stage (fallback „Aus“/„Verriegelt“ …) with since when.
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const dd = core.slice(core.indexOf('    _dedupeHead() {'), core.indexOf('    _findHeadLine() {'));
assert.ok(dd.length > 100, 'frame: _dedupeHead');
const st = core.slice(core.indexOf('    _sinceText(cur) {'), core.indexOf('    _dedupeHead() {'));
assert.ok(/norm\(mainTxt\) !== norm\(stage\)/.test(dd) && /this\._sinceText\(/.test(dd) && /var since = 'Seit ' \+/.test(st), 'frame: same text → „Seit …“');
// A state HA has no word for (enum sensor without translations: „failed“) never stands raw in the head (final review).
const fb = core.slice(core.indexOf('    _headFallback(again) {'), core.indexOf('    _sinceText(cur) {'));
assert.ok(/txt === cur\.state && \/\^\(\?:\[a-z\]\[a-z0-9_\]\*\|\[A-Z\]\[A-Z0-9_\]\{2,\}\)\$\/\.test\(txt\)\) \{ txt = this\._sinceText\(cur\)/.test(fb) && /_casoraRawWord\(cur\.state\)/.test(fb),
  'frame: raw state word → Casora\'s word („ready“ → „Bereit“), else „Seit …“');
assert.ok(/this\._headerStatus\.hidden = !this\._headerStatus\.textContent\.trim\(\);\n      this\._dedupeHead\(\);/.test(core), 'mirrored line compared');
assert.ok(/if \(again\) this\._dedupeHead\(\);/.test(core), 'fallback compared');
const norm = (t) => String(t || '').toLowerCase().replace(/[\s\u00a0\u202f()·.,:–-]+/g, '');
assert.equal(norm('Aktiviert (Zuhause)'), norm('Aktiviert · Zuhause'), 'HA word and stage sentence count as the same');
assert.equal(norm('513 W'), norm('513\u202fW'));
// popup-geo carries the check, and the rule is written down.
const geo = fs.readFileSync(new URL('../qa/popup-geo.mjs', import.meta.url), 'utf8');
assert.ok(/add\('doppelt'/.test(geo), 'popup-geo: check „doppelt“');
const rl = fs.readFileSync(new URL('../../docs/handbuch/popup-richtlinien-v3.md', import.meta.url), 'utf8');
assert.ok(/Die Statuszeile wiederholt nie den Bühnenwert/.test(rl), 'richtlinien §3: rule');
console.log('status_line_not_stage: ok');
process.exit(0);
