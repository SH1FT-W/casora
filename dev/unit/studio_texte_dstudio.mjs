// Studio-Texte aus dem Studio-Audit (d-studio, 10.10.2026) ohne Browser.  node dev/unit/studio_texte_dstudio.mjs
//  ds-08 „Wähle dein Design“ nannte einen Ort, den es nicht mehr gibt („Dashboard → Design & Bedienung“);
//        das Design steht seit 1.1 unter „Einstellungen → Design“.
//  ds-09 „z. B.“ brach im Studio um („(z.“ / „B. Hemma)“): Abkürzungen mit geschütztem Leerzeichen (U+00A0).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const panel = read('panel/casora-panel.js');
const de = JSON.parse(read('translations/panel/de.json'));
const flat = [];
(function walk(o) { for (const v of Object.values(o)) { if (typeof v === 'string') flat.push(v); else if (v && typeof v === 'object') walk(v); } })(de);

// ds-08
assert.ok(!/Look & Controls/.test(panel), 'Studio-Code verweist noch auf „Look & Controls“');
assert.ok(/under Settings → Design\./.test(panel), 'Design-Schritt nennt „Settings → Design“');
assert.ok(flat.some((s) => /unter Einstellungen → Design\./.test(s)), 'deutsche Fassung „Einstellungen → Design“');
assert.ok(!flat.some((s) => /Design & Bedienung/.test(s)), 'kein „Design & Bedienung“ mehr in den Studio-Texten');

// ds-09: keine trennbaren Abkürzungen in sichtbaren Studio-Texten
const bad = flat.filter((s) => /\b(z\. B\.|d\. h\.|u\. a\.|z\. T\.|u\. U\.)/.test(s));
assert.deepEqual(bad, [], 'Abkürzung mit normalem Leerzeichen: ' + bad.slice(0, 3).join(' | '));
assert.ok(flat.some((s) => s.includes('z. B.')), 'z. B. mit geschütztem Leerzeichen vorhanden');
const assist = read('panel/casora-panel-assist.js');
assert.ok(!/placeholder: de \? "z\. B\./.test(assist), 'Geräte-Assistent: Platzhalter ohne geschütztes Leerzeichen');
// Die gebaute Laufzeit-Tabelle trägt dieselben Texte (tools/build-panel-i18n.py).
const i18n = read('panel/casora-panel-i18n.js');
assert.ok(!/z\. B\./.test(i18n.replace(/\\u00a0/g, ' ')), 'casora-panel-i18n.js nicht neu gebaut');

console.log('studio_texte_dstudio: ok');
