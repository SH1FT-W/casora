// d-kacheln (Feinschliff 1.3): Ein langer Badge-Name lief über den Badge-Rand und wurde hart abgeschnitten
// („…im Wohnzimmer neben de“) statt mit „…“ zu enden – .badge-wrap ist eine Spalte mit
// align-items:flex-start, Titel/Unterzeile waren so breit wie ihr Text. Prüft: beide haben max-width:100%
// neben ihrer Ellipse. (Im Test-HA nachgemessen: Titel 370 → 307 px bei Badge-Innenbreite 307 px.)
//   node dev/unit/badge_langer_name.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const css = T.casora_badge_base.extra_styles;
assert.ok(/\.badge-wrap\{[^}]*align-items:flex-start/.test(css), 'Spalte wie erwartet');
for (const cls of ['badge-title', 'badge-sub']) {
  const m = css.match(new RegExp('\\n\\.' + cls + '\\{([^}]*)\\}'));
  assert.ok(m, cls + ' gefunden');
  assert.ok(/text-overflow:ellipsis/.test(m[1]) && /max-width:100%/.test(m[1]), cls + ': Ellipse braucht max-width:100%');
}
console.log('ok badge_langer_name');
