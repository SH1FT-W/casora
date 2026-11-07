// casora-chart formats numbers and times with one cached Intl formatter per language and options (the reading formats
// a number and a time on every pointer move; toLocaleString with options built a new formatter each call, 10–80 µs).
// The text must stay exactly what toLocaleString / toLocale(Date|Time)String gave, in every language.
//   TZ=Europe/Berlin node dev/unit/chart_formatters.mjs
// @deckt: custom_components/casora/scripts/casora-chart.js#C.nf,C.hm,C.wd,C.dm,C.dayLong,C.mon,C.monLong
import fs from 'node:fs';
import assert from 'node:assert/strict';
process.env.TZ = process.env.TZ || 'Europe/Berlin';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-chart.js', import.meta.url), 'utf8');
let lang = 'de';
const win = { casoraLocale: () => lang, casoraTr: (s) => s };
new Function('window', 'customElements', src)(win, undefined);
const C = win.casoraChart;

// The reference: the formatting before the cache.
const ref = {
  nf: (v, d) => { if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0; return v.toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d }); },
  hm: (t, h12) => {
    const o = { hour: '2-digit', minute: '2-digit' }; if (h12 != null) o.hour12 = h12;
    try { if (new Intl.DateTimeFormat(lang, o).resolvedOptions().hour12) o.hour = 'numeric'; } catch (e) { /* as before */ }
    return new Date(t).toLocaleTimeString(lang, o);
  },
  wd: (t) => new Date(t).toLocaleDateString(lang, { weekday: 'short' }).replace('.', ''),
  dm: (t) => new Date(t).toLocaleDateString(lang, { day: 'numeric', month: 'numeric' }),
  dayLong: (t) => new Date(t).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' }),
  mon: (t) => new Date(t).toLocaleDateString(lang, { month: 'short' }).replace('.', ''),
  monLong: (t) => new Date(t).toLocaleDateString(lang, { month: 'long', year: 'numeric' }),
};
const nums = [0, -0.04, 0.04, 1, 21.35, -3.25, 1234.5, 98765.4321, 1e6, -0.0004];
const t0 = new Date(2026, 9, 25, 0, 30).getTime();
const times = [];
for (let h = 0; h < 72; h += 5) times.push(t0 + h * 36e5 + h * 7 * 6e4);
let n = 0;
for (lang of ['de', 'en', 'en-US', 'en-GB', 'fr', 'nl', 'sv']) {
  for (const v of nums) for (const d of [0, 1, 2]) { assert.equal(C.nf(v, d), ref.nf(v, d), `${lang} nf(${v}, ${d})`); n++; }
  for (const t of times) {
    for (const h12 of [undefined, true, false]) { assert.equal(C.hm(t, h12), ref.hm(t, h12), `${lang} hm(${t}, ${h12})`); n++; }
    for (const k of ['wd', 'dm', 'dayLong', 'mon', 'monLong']) { assert.equal(C[k](t), ref[k](t), `${lang} ${k}(${t})`); n++; }
  }
}
// The language can change while the page runs: the formatter follows it.
lang = 'de'; const de = C.nf(1234.5, 1);
lang = 'en'; assert.notEqual(C.nf(1234.5, 1), de, 'language switch reaches the cached formatter');
console.log(`chart_formatters: ok (${n} comparisons)`);
