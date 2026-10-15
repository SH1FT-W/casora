// Checkup 10/2026: Jeder Studio-Besuch hielt das ganze Panel im Speicher (~20 MB): _pinAncestors meldete
// scroll an window/HA-Vorfahren und resize an visualViewport direkt an, disconnectedCallback nie ab.
// Erwartet: alle drei über _gOn (beim Aushängen abgemeldet).
//   node dev/unit/checkup_studio_leck.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('  _pinAncestors() {');
const b = src.indexOf('\n  _restoreScroll(', a);
assert.ok(a > 0 && b > a, '_pinAncestors gefunden');
const body = src.slice(a, b);
assert.ok(!/(window|visualViewport|\bn)\.addEventListener\(/.test(body), 'keine direkten Listener an window/visualViewport/Vorfahren');
assert.ok(body.includes('this._gOn(n, "scroll", later'), 'Vorfahren über _gOn');
assert.ok(body.includes('this._gOn(window, "scroll", later'), 'window über _gOn');
assert.ok(body.includes('this._gOn(window.visualViewport, "resize", afterKeyboard)'), 'visualViewport über _gOn');
console.log('ok studio_leck');
