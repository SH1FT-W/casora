// Badge-Reihe am Handy (07.10.2026): Endet ein Badge genau am Rand, sah man nicht, dass die Reihe
// weitergeht. window._casoraPeekPlan (01-basis.js) macht die sichtbaren Badges gleichmäßig breiter,
// bis eines deutlich über den Rand ragt (mind. 20 px sichtbar und 20 px verdeckt).
//   node dev/unit/badge_anschnitt.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const a = src.indexOf('window._casoraPeekPlan = function');
const b = src.indexOf('\n};\n', a) + 4;
globalThis.window = globalThis;
new Function(src.slice(a, b))();
const plan = window._casoraPeekPlan;
const row = (...w) => { let x = 16; return w.map((v) => { const r = { l: x, r: x + v }; x += v + 10; return r; }); };
const ok = (boxes, edge, p) => {
  const shifted = boxes.map((bx, i) => {
    const add = p ? p.slice(0, i).reduce((s, v) => s + v, 0) : 0;
    return { l: bx.l + add, r: bx.r + add + (p ? p[i] : 0) };
  });
  return shifted.some((x) => edge - x.l >= 20 && x.r - edge >= 20);
};
// iPhone 430: Sicherheit, Klima, Beleuchtung, Energie – Beleuchtung endet 3 px vor dem Rand.
const r430 = row(169, 89, 133, 101);
assert.equal(r430[2].r, 427);
let p = plan(r430, 430);
assert.ok(p, '430: braucht Zugabe');
assert.deepEqual(p, [9, 9, 9, 0], JSON.stringify(p));
assert.ok(ok(r430, 430, p), '430: danach deutlich angeschnitten');
// 375/390/393: Beleuchtung ist schon deutlich angeschnitten – nichts ändern.
for (const w of [375, 390, 393]) assert.equal(plan(r430, w), null, w + ': unverändert');
// Alles passt: nichts tun.
assert.equal(plan(row(100, 100), 430), null);
// Badge ragt nur 3 px über den Rand: es wird breiter, bis es ~24 px übersteht.
const r2 = row(150, 150, 120);
p = plan(r2, r2[2].r - 3);
assert.ok(p && ok(r2, r2[2].r - 3, p), 'knapp verdeckt → deutlich');
// Nächstes Badge nur 8 px zu sehen: das davor ragt dann über den Rand.
const r3 = row(170, 170, 120);
p = plan(r3, r3[2].l + 8);
assert.ok(p && p[2] === 0 && ok(r3, r3[2].l + 8, p), 'kaum sichtbar → Vorgänger ragt über');
// Mehr als 24 px je Badge wäre zu viel: dann lieber nichts ändern.
assert.equal(plan(row(300, 120), 16 + 300 + 10 + 2), null);
console.log('ok badge_anschnitt');
