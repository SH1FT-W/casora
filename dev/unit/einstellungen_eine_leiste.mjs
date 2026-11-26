// One save bar for a setting (Prüfrunde d04-01).   node dev/unit/einstellungen_eine_leiste.mjs
// Switching „Datum anzeigen“ under Settings › Appearance showed the settings bar „Ungespeicherte Änderungen –
// Einstellungen speichern“ and, on top, the Studio hint „Übernommen – Noch nicht gespeichert“ with „Jetzt speichern“.
// On a settings page the change belongs to the settings bar only.
// @deckt: casora-panel-b-plus.js#_bChanged
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-plus.js', import.meta.url), 'utf8');
const a = src.indexOf('    P._bChanged = function (snap) {');
assert.ok(a > 0);
const body = src.slice(a, src.indexOf('\n    };\n', a) + 7);
const P = {};
new Function('P', 'tr', 'isPhone', body)(P, (x) => x, () => false);

const run = async (page) => {
  const toasts = [];
  const self = Object.assign(Object.create(P), {
    _state: { compact: {} }, _bDiff: () => ({ kind: 'edit' }), _bToast: (t) => toasts.push(t), _bUndoTo() {},
    _csOpen: !!page, _csPage: page || '',
  });
  self._bChanged({ s: [{}] });
  await new Promise((r) => setTimeout(r, 1000));
  return toasts;
};
assert.deepEqual(await run(null), ['Change applied'], 'an edit in the Studio still says so');
assert.deepEqual(await run('n-look'), [], 'on a settings page: only the settings bar');
console.log('einstellungen_eine_leiste: ok');
