// Studio-Meldung (.btoast) im Dunkeln lesbar.
//   node dev/unit/studio_toast_dunkel.mjs
// Personas 10.10.2026 (per-04): --toast setzt das Studio nur im hellen Modus (:host(.is-light)); die
// .btoast-Meldung fiel dunkel auf Weiß zurück, mit heller Schrift – unlesbar („Smart Sort is on“).
// Erwartet: dieselbe Rückfallfarbe wie die übrigen Studio-Meldungen (.status), nie ein heller Grund.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
const bplus = rd('casora-panel-b-plus.js');
const panel = rd('casora-panel.js');
const bg = (bplus.match(/\.btoast \{[\s\S]*?background:([^;]+);/) || [])[1];
assert.ok(bg, '.btoast hat einen Hintergrund');
const status = (panel.match(/\.status:not\(:empty\) \{[\s\S]*?background:([^;]+);/) || [])[1];
assert.ok(status, '.status-Meldung hat einen Hintergrund');
assert.equal(bg.trim(), status.trim(), '.btoast nutzt dieselbe Farbe wie .status');
assert.ok(!/rgba\(255,\s*255,\s*255/.test(bg), 'kein weißer Rückfall: ' + bg);
// --toast nur im hellen Block: darum zählt der Rückfall im Dunkeln.
assert.ok(/:host\(\.is-light\) \{[\s\S]*?--toast:/.test(panel), '--toast steht (nur) im hellen Block');
console.log('ok studio_toast_dunkel');
