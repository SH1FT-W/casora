// Kachelart als Unterzeile in der Studio-Vorschau (Vergleich 06.10., #f9).  node dev/unit/vorschau_kachelart.mjs
// Kacheln ohne eigenen Namen heißen wie das Gerät („P1S …“) – darunter klein die Art („3D-Drucker“).
// Nur in der Vorschau (Panel), nicht in den Dashboard-Vorlagen; keine Doppelung („Waschmaschine“ zweimal).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const panel = read('panel/casora-panel.js');
const i = panel.indexOf('  _paintTile(tile, ti, room) {');
const body = panel.slice(i, panel.indexOf('\n  }\n', i));
assert.ok(/k\.className = "mkind";/.test(body), 'Unterzeile in _paintTile');
assert.ok(/if \(own && kindWord && same\(own\) !== same\(kindWord\) && same\(own\) !== same\(type\.label\)\)/.test(body), 'nur ohne eigenen Namen, ohne Doppelung');
assert.ok(/\.miniphone \.mkind \{ display:none; \}/.test(panel), 'Handy-Vorschau: kein Platz');
assert.ok(!read('panel/casora-templates.json').includes('mkind') && !fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8').includes('mkind'), 'Dashboard unverändert');
console.log('ok vorschau_kachelart');
