// Hold menu, running timer (Prüfrunde u10-08): "Aus in 15 Min." was cut to "Aus in 1…" because the button
// "Zeitschalter aus" beside it took the room. The time left keeps its full width (no shrinking); the row wraps, so
// the button moves below when both do not fit.
//   node dev/unit/halten_restzeit_ganz.mjs
// @deckt: custom_components/casora/scripts/local/22-halten.js#tm
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/22-halten.js', import.meta.url), 'utf8');
const rule = (sel) => {
  const m = new RegExp("'" + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "\\{([^}]*)\\}").exec(src);
  assert.ok(m, sel);
  return m[1];
};
const row = rule('.tm'), span = rule('.tm span');
assert.ok(/flex-wrap:wrap/.test(row), 'the row wraps: ' + row);
const flex = /(?:^|;)flex:([^;]+)/.exec(span);
assert.ok(flex, 'span has a flex value');
const parts = flex[1].trim().split(/\s+/);
assert.ok(parts.length >= 2 && parts[1] === '0', 'the time left does not shrink: flex:' + flex[1]);
console.log('ok halten_restzeit_ganz');
