// Page transition inside an open popup (owner 03.11.2026): which way a page change goes, and that the frame wires
// it for every page that opens through it (navDirection in casora-core.js, CasoraPopup._navBegin).
//   node dev/unit/popup_nav_direction.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const m = src.match(/function navDirection\(wasOpen, backAt, now, prevBack, nextBack, optOut\) \{[\s\S]*?\n  \}/);
assert.ok(m, 'navDirection in casora-core.js');
const nav = new Function(m[0] + '\nreturn navDirection;')();
const a = () => {}, b = () => {};
assert.equal(nav(false, 0, 1000, null, a), 'none', 'a fresh opening has no transition');
assert.equal(nav(true, 0, 1000, null, a), 'forward', 'a sub page with a way back slides in');
assert.equal(nav(true, 0, 1000, a, b), 'forward', 'a page further in (another way back) slides in');
assert.equal(nav(true, 0, 1000, a, a), 'same', 'a page that redraws itself with the same way back stands');
assert.equal(nav(true, 0, 1000, a, null), 'same', 'a top page that redraws itself stands');
assert.equal(nav(true, 900, 1000, a, null), 'back', '‹ right before: back');
assert.equal(nav(true, 900, 1000, b, a), 'back', '‹ to a page that has its own ‹: still back');
assert.equal(nav(true, 900, 9000, a, b), 'forward', 'an old ‹ does not count');
assert.equal(nav(true, 0, 1000, null, a, false), 'same', 'cfg.nav === false opts out');
// The frame: ‹ marks the way, open() asks navDirection, the old page leaves after the new one has drawn.
assert.ok(/this\._navBackAt = Date\.now\(\);\s*if \(typeof fn === 'function'\) fn\(\);/.test(src), '‹ marks a back navigation');
assert.ok(/var navDir = navDirection\(wasOpen, stackAt >= 0 \? Date\.now\(\) : this\._navBackAt, Date\.now\(\), prevBackFn, nextBack, cfg\.nav\);/.test(src), 'open() decides the way');
assert.ok(/var nav = navDir === 'forward' \|\| navDir === 'back' \? this\._navBegin\(navDir\) : null;\s*this\.container\.textContent = '';/.test(src), 'the old page goes at once, the new one builds out of sight');
assert.ok(/if \(nav\) nav\.play\(\);/.test(src), 'the transition plays after the build');
assert.ok(/if \(this\._navAnim\) this\._navAnim\.finish\(\);\s*var prevBackFn/.test(src), 'a running transition ends at the next page');
assert.ok(/prefers-reduced-motion: reduce\)'\)\.matches/.test(src.slice(src.indexOf('_navBegin(dir) {'))), 'reduced motion is honoured');
// Scroll memory: a page left forward is remembered, ‹ restores it, close forgets.
assert.ok(/if \(navDir === 'forward'\) this\._navStack\.push\(\{ top: leftAt, cfg: this\._cfgCurrent/.test(src), 'forward remembers the scroll and config of the page left');
assert.ok(/this\._navStack\[si\]\.cfg === data/.test(src), 'a page opened again with its config is a way back');
assert.ok(/scrollBack = ent \? ent\.top : null;/.test(src), 'back takes its scroll again');
assert.ok(/this\.container\.textContent = '';\s*this\._navStack = \[\];/.test(src), 'closing forgets');
console.log('ok popup_nav_direction');
