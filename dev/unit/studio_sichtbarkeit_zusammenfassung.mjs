// Studio tile editor (Prüfrunde u10-09): beside the long title "Sichtbarkeit, Rückfrage & Halten" the summary got
// about 47 px and read "All…" / "Nu…" even at 1920 px, so nobody could tell whether a tile was restricted. The
// summary of that group now stands on a line of its own below the title, in full (no ellipsis).
//   node dev/unit/studio_sichtbarkeit_zusammenfassung.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-ux.js#uxvis,uxsum
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-ux.js', import.meta.url), 'utf8');
const css = (sel) => {
  const i = src.indexOf('\n    ' + sel + ' {');
  assert.ok(i > 0, sel);
  return src.slice(i, src.indexOf('}', i));
};
const head = css('.adv.uxvis .advsum');
assert.ok(/flex-wrap:\s*wrap/.test(head), 'the group head wraps');
const sum = css('.adv.uxvis .advsum .uxsum');
assert.ok(/flex:\s*1 0 100%/.test(sum), 'summary on its own line');
assert.ok(/max-width:\s*none/.test(sum) && /white-space:\s*normal/.test(sum), 'summary not cut: ' + sum);
console.log('ok studio_sichtbarkeit_zusammenfassung');
