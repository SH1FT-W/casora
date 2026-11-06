// Scene names cut in the middle (casoraMidFit, scene row): every try sets the text and reads scrollWidth/scrollHeight,
// which forces a layout. It used to step down one character at a time (up to n layouts per name, again on every
// redraw of the row): the phone dashboard of the test house spent ~80 ms in it while loading. Expected: the same
// cut as the step-by-step search, found by bisection with at most ~log2(n) + 1 layouts.
//   node dev/unit/name_mitte_messungen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = core.indexOf('// casora-midfit:start'), j = core.indexOf('// casora-midfit:end');
assert.ok(i > -1 && j > i, 'block casora-midfit missing');
const window = {};
new Function('window', core.slice(i, j))(window);
const M = window.casoraMidText;

// Made-up element: per-character widths (narrow i/l, wide m/w), one line; reads of scrollWidth count as layouts.
const W = (c) => (/[il.,' ]/.test(c) ? 4 : /[mwMW]/.test(c) ? 13 : /[A-Z]/.test(c) ? 10 : 8);
const elem = (full, width) => {
  const e = { full, textContent: full, clientWidth: width, clientHeight: 20, reads: 0, sets: 0 };
  return new Proxy(e, {
    get(t, k) {
      if (k === 'getAttribute') return () => t.full;
      if (k === 'scrollWidth') { t.reads++; return [...t.textContent].reduce((s, c) => s + W(c), 0); }
      if (k === 'scrollHeight') return 20;
      return t[k];
    },
    set(t, k, v) { if (k === 'textContent') t.sets++; t[k] = v; return true; },
  });
};
// The former step-by-step search, as the reference for the result.
const linear = (full, width) => {
  const e = elem(full, width);
  const over = () => e.scrollWidth > e.clientWidth + 1;
  if (!over()) return e.textContent;
  for (let k = full.length - 2; k >= 1; k--) { e.textContent = M(full, k); if (!over()) break; }
  return e.textContent;
};

const NAMES = ['WZ Dreamview Aus', 'Wohnzimmer Abendstimmung gemütlich An', 'Hauswirtschaftsraumlicht',
  'Licht Wohnzimmerdeckenfluter', 'Kinderzimmer Gute Nacht Geschichte Lesen', 'A Aus', 'Ab', 'Küche',
  'Terrasse Grillabend mit Freunden und Lichterkette Warmweiß An'];
let maxReads = 0;
for (const full of NAMES) {
  for (let width = 20; width <= 400; width += 7) {
    const e = elem(full, width);
    window.casoraMidFit({ querySelectorAll: () => [e] });
    assert.equal(e.textContent, linear(full, width), `same cut as before: "${full}" at ${width}px`);
    const bound = Math.ceil(Math.log2(Math.max(2, full.length))) + 2;
    assert.ok(e.reads <= bound, `"${full}" at ${width}px: ${e.reads} layouts (at most ${bound})`);
    maxReads = Math.max(maxReads, e.reads);
  }
}
// A long name in a narrow tile: the old search needed one layout per dropped character.
{
  const full = NAMES[8], e = elem(full, 120);
  window.casoraMidFit({ querySelectorAll: () => [e] });
  assert.ok(e.reads <= 8, `long name: ${e.reads} layouts (step by step: ~${full.length - 12})`);
}
console.log('ok name_mitte_messungen (max ' + maxReads + ' layouts per name)');
