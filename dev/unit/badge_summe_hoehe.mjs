// d-kacheln (Feinschliff 1.3): Die Symbol-Unterzeile des Sicherheits-Sammelbadges („🔓1 📵1“) war
// 1.25em hoch, die Unterzeile aller Badges hat line-height 1.2 – das Badge stand 0,6 px höher als
// Klima/Licht/Energie (Desktop 43,2 statt 42,6 px, Handy 39,8 statt 39,2 px). Prüft: Höhe der
// Summenzeile ≤ Zeilenhöhe von .badge-sub.
//   node dev/unit/badge_summe_hoehe.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/local/00-finder.js');
const window = {};
try { vm.runInNewContext(src, { window, document: { addEventListener() {}, querySelector() { return null; } }, console, setTimeout, clearTimeout }); } catch (e) { /* Rest des Moduls braucht HA */ }
assert.equal(typeof window.casoraSecuritySummary, 'function', 'casoraSecuritySummary geladen');
const r = window.casoraSecuritySummary({ insecure: 1, locks: 1, camDead: 1 }, {});
assert.ok(r.html, 'Kurzform mit Symbolen');
const h = parseFloat((r.html.match(/class="cs-sum"[^>]*height:([\d.]+)em/) || [])[1]);
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const lh = parseFloat((JSON.stringify(T.casora_badge_base).match(/\.badge-sub\{[^}]*?line-height: ([\d.]+)/) || [])[1]);
assert.ok(lh > 0, '.badge-sub line-height gefunden');
assert.ok(h > 0 && h <= lh, `Summenzeile ${h}em höher als Badge-Unterzeile ${lh}`);
console.log('ok badge_summe_hoehe');
