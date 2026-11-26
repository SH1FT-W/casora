// Redo keeps its place next to undo (Prüfrunde u02-04).   node dev/unit/redo_platz.mjs
// Redo was display:none until the first undo; then it appeared right of undo, undo moved left, and a second click on
// the same spot redid the change. Now it is always there on desktop/tablet (greyed out when empty), like undo.
// @deckt: casora-panel-b-mehr.js#CSS,_mPaintRedo
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8');
const css = src.slice(src.indexOf('const CSS = `'), src.indexOf('`;', src.indexOf('const CSS = `')));
// Rules that set display on #mredo, in order.
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(([, sel, body]) => ({ sel: sel.trim(), display: (/display:\s*([a-z-]+)/.exec(body) || [])[1] }))
  .filter((r) => r.display && /#mredo/.test(r.sel));
// Host classes and element classes of one state → the display the cascade ends at (same specificity order is
// approximated by source order, which these rules follow).
const matches = (sel, host, el) => sel.split(',').some((one) => {
  if (!/#mredo/.test(one)) return false;
  const hm = /:host\(((?:[^()]|\([^)]*\))*)\)/.exec(one);
  const hs = hm ? hm[1] : '';
  const need = [...hs.matchAll(/(?<!:not\()\.([\w-]+)/g)].map((m) => m[1]).filter((c) => !new RegExp(':not\\(\\.' + c + '\\)').test(hs));
  const not = [...hs.matchAll(/:not\(\.([\w-]+)\)/g)].map((m) => m[1]);
  const elc = [...one.slice(one.indexOf('#mredo')).matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const elNot = /#mredo:disabled/.test(one) ? !el.disabled : false;
  return need.every((c) => host.includes(c)) && not.every((c) => !host.includes(c)) && elc.every((c) => el.cls.includes(c)) && !elNot;
});
const display = (host, el) => rules.reduce((d, r) => (matches(r.sel, host, el) ? r.display : d), 'inline-block');

const empty = { cls: [], disabled: true };
const has = { cls: ['has'], disabled: false };
assert.equal(display(['bmode'], empty), 'grid', 'desktop, nothing to redo: still in its place');
assert.equal(display(['bmode'], has), 'grid');
assert.equal(display(['bmode', 'btight'], empty), 'grid', 'tight header too');
assert.equal(display(['bmode', 'phone'], has), 'none', 'phone: not in the top row');
assert.match(css, /#mredo:disabled \{ opacity:\.62;/, 'greyed out like undo');
assert.match(src, /b\.disabled = !n;/, 'disabled when nothing to redo');
console.log('redo_platz: ok');
