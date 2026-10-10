// Issue #11 (Teil 1): „vor X T.“ / „vor X Tagen“ nach Kalendertagen, nicht nach 24-h-Blöcken.
// Mit Math.round(m / 1440) war vor 40 Stunden (gestern früh) schon „vor 2 T.“, mit floor war
// vor 47 Stunden (vorgestern) nur „vor 1 T.“. Geprüft: der gemeinsame Helfer window.casoraDaysAgo,
// die Kamera-Zeit (casoraCamAge), die Popups Netzwerk/Updates, das Weich-Kamerablatt und die
// englische Übersetzung der Wortlaute.   node dev/unit/kalendertage.mjs
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const weich = read('custom_components/casora/scripts/local/07-weich-spezial.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

let NOW = 0;
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { super(...(a.length ? a : [NOW])); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
const at = (h, min) => { NOW = new RealDate(2026, 9, 9, h, min || 0).getTime(); };  // Freitag, 09.10.2026

const grab = (src, start) => {
  const a = src.indexOf(start);
  assert.ok(a >= 0, 'nicht gefunden: ' + start);
  let i = src.indexOf('{', a), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(a, i + 1);
};
const window = { casoraCamFresh: () => false };
new Function('window', grab(core, 'window.casoraDaysAgo = function') + ';')(window);
new Function('window', grab(core, 'window.casoraCamAge = function') + ';')(window);
const weichAge = new Function('window', 'return {' + grab(weich, 'age: function (ms, motion)') + '}.age;')(window);
const tplAgo = (n) => {
  const c = T[n].tap_action.casora_popup.content;
  // Der Helfer steht dort als Text in einem String (eingebettetes Skript): \n zurückwandeln.
  const code = grab(c, 'const ago = (ts) =>').replace(/\\n/g, '\n');
  return new Function('window', code + '; return ago;')(window);
};
const netAgo = tplAgo('casora_popup_network'), updAgo = tplAgo('casora_popup_updates');

const H = 3600000;
const iso = (h) => new RealDate(NOW - h * H).toISOString();
const D = (h) => window.casoraDaysAgo(Math.round(h * 60));

// Freitag 22:00: vor 40 Std. = Donnerstag 06:00 → gestern (früher „vor 2 T.“).
at(22);
assert.equal(D(40), 1);
assert.equal(D(25), 1);
assert.equal(D(50), 2);
assert.equal(window.casoraCamAge(40 * H), 'vor 1 T.');
assert.equal(weichAge(40 * H), 'vor 1 T.');
assert.equal(netAgo(iso(40)), 'vor 1 T.');
assert.equal(updAgo(iso(40)), 'vor 1 T.');
assert.equal(netAgo(iso(20)), 'vor 20 Std.', 'unter 24 Std. weiter in Stunden');
// Freitag 08:00: vor 47 Std. = Mittwoch 09:00 → vorgestern (früher mit floor „vor 1 T.“).
at(8);
assert.equal(D(47), 2);
assert.equal(window.casoraCamAge(47 * H), 'vor 2 T.');
assert.equal(weichAge(47 * H), 'vor 2 T.');
// Monatswechsel und Zeitumstellung (25.10.2026): Kalendertage bleiben ganze Tage.
NOW = new RealDate(2026, 10, 1, 9, 0).getTime();
assert.equal(window.casoraDaysAgo(Math.round((NOW - new RealDate(2026, 9, 24, 23, 0).getTime()) / 60000)), 8);

// Englisch: dieselben Wortlaute über die Phrasen-Tabelle.
const i18n = read('custom_components/casora/scripts/casora-i18n.js');
const m = i18n.match(/var PHRASES = (\{.*?\});\n/s);
assert.ok(m, 'PHRASES nicht gefunden');
const EN = JSON.parse(m[1]).en;
const tr = (s) => {
  if (typeof EN.exact[s] === 'string') return EN.exact[s];
  for (const [re, out] of EN.patterns) { const x = s.match(new RegExp(re)); if (x) return out.replace(/\{(\d)\}/g, (_, n) => x[+n]); }
  return null;
};
assert.equal(tr('vor 1 T.'), '1 d ago');
assert.equal(tr('vor 2 T.'), '2 d ago');
assert.equal(tr('gestern'), 'yesterday');
assert.equal(tr('vor 3 Tagen'), '3 days ago');
assert.equal(tr('vor 20 Std.'), '20 h ago');
console.log('kalendertage: ok');
