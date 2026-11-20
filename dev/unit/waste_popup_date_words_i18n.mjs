// Waste popup in another language (#218): the month title ("Dezember 2026") and the day card's title
// ("Freitag, 4. Dezember") were built from German name lists; the phrase tables translate fixed texts, not dates,
// so they stayed German in a Dutch setup. Runs the popup's own code and the real translator with a fixed clock
// (Thursday 19.11.2026).
//   LC_ALL=en_US.UTF-8 TZ=UTC node dev/unit/waste_popup_date_words_i18n.mjs
// @deckt: 06-kalender.js#_casoraCalendar
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const RealDate = Date, NOW = new RealDate(2026, 10, 19, 12).getTime();
globalThis.Date = class extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
};
const state = { lang: 'nl' };
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: state.lang } } } : null), addEventListener() {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
globalThis.__casoraI18nPhrases = phrases();
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
try { new Function('window', 'document', 'customElements', 'MutationObserver', read('scripts/casora-i18n.js'))(globalThis, document, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
assert.ok(window.casoraTr && window.casoraLocale, 'translator loaded');
new Function(read('scripts/local/00-finder.js'))();
new Function(read('scripts/local/06-kalender.js'))();
window._casoraUI = {
  tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', fill: '#333', accent: '#0a84ff', green: '#30d158', font: 'system-ui' },
  esc: (t) => String(t), soft: () => false,
};

const states = { 'sensor.pmd': { entity_id: 'sensor.pmd', state: '1', attributes: { friendly_name: 'PMD', '2026-11-20': 'PMD', '2026-12-04': 'PMD' } } };
const hass = { states, entities: {}, devices: {} };
const vars = { trash_sensors: { 'sensor.pmd': 'PMD' } };
const K = window._casoraCalendar;
const text = (html) => window.casoraTr(html).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// What the popup shows: the month title of December and the day card of Friday 4 December.
const shown = (lang) => {
  state.lang = lang;
  K.wsec('wmonth', states, hass, vars);
  K.w.month = new Date(2026, 11, 1); K.w.sel = '2026-12-04';
  return { month: text(K.html('wmonth')), day: text(K.html('wday')) };
};

// German, the source language: as before.
let s = shown('de');
assert.match(s.month, /^Dezember 2026 /);
assert.match(s.day, /^Freitag, 4\. Dezember /);

// Dutch (the report): Dutch month and weekday words, the weekday row was Dutch already.
s = shown('nl');
assert.match(s.month, /^december 2026 /i, s.month);
assert.match(s.month, / ma di wo do vr za zo /);
assert.match(s.day, /^vrijdag 4 december /i, s.day);

// Every further language: no German month or weekday word left, and the translator leaves the date as built.
const GERMAN = /Dezember|Freitag/;
for (const lang of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  s = shown(lang);
  const d = new Date(2026, 11, 4);
  assert.ok(!GERMAN.test(s.month + ' ' + s.day), `${lang}: ${s.month.slice(0, 30)} | ${s.day.slice(0, 40)}`);
  assert.ok(s.month.startsWith(d.toLocaleDateString(lang, { month: 'long', year: 'numeric' }) + ' '), `${lang}: month title ${s.month.slice(0, 30)}`);
  assert.ok(s.day.startsWith(d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }) + ' '), `${lang}: day title ${s.day.slice(0, 40)}`);
}
// The calendar popup shares the month and builds its day title the same way.
state.lang = 'nl';
K.ev = []; K.sel = '2026-12-04'; K.month = new Date(2026, 11, 1);
assert.match(text(K.html('day', { calendars: [] })), /^vrijdag 4 december /i);
assert.match(text(K.html('month', { calendars: [] })), /^december 2026 /i);
console.log('waste_popup_date_words_i18n: ok');
