// @deckt: custom_components/casora/scripts/local/46-screensaver.js#dayLine,plates,html,CSS
// Day line screensaver (#233, 46-screensaver.js). Before: the headline only ever named an appointment that starts
// later (a running one never led), close appointments shrank to a bare dot without a title, the accent filled the
// part of the day that was over, the light plates had no edge, and the finished day kept its room until midnight.
//   node dev/unit/screensaver_dayline.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array, setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), box);
const S = win._casoraSaver;

const hass = { locale: { time_format: '24' }, themes: { darkMode: false }, states: {} };
const at = (d, h, m) => +new Date(2026, 10, d, h, m || 0);
const ev = (title, d, h, m, mins, cal) => ({ title, start: at(d, h, m), end: at(d, h, m) + mins * 60000, allDay: false, cal });
const draw = (events, now, o) => S.html('linie', S.context({ hass, now: new Date(now), vars: {}, sun: null, wx: null, rooms: [], cals: ['a', 'b'], events, ...o }));
const headOf = (html) => { const m = html.match(/class="cs-sum cs-accent"><b>(.*?)<\/b>(.*?)<\/div>/); return [m[1], m[2]]; };
// One layout's part of the markup (wide boxes and narrow ones each have their own plates).
const layout = (html, name) => html.split('<div class="cs-lay cs-' + name + '">')[1].split('<div class="cs-lay')[0].split('<div class="cs-now"')[0];
const plates = (part) => part.split('<div class="cs-ev').slice(1).map((p) => ({ left: Number(p.match(/left:([\d.]+)%/)[1]), lead: /^ ?[^"]*cs-lead/.test(p.split('"')[0]),
  rows: [...p.matchAll(/<div class="cs-r([^"]*)"><b data-no-i18n>(.*?)<\/b><span><i[^>]*><\/i>(.*?)<\/span>/g)].map((m) => ({ cls: m[1], title: m[2], time: m[3] })),
  more: Number((p.match(/class="cs-more">\+(\d+)</) || [0, 0])[1]) }));

const day = [ev('Schule', 20, 7, 45, 300), ev('Schwimmkurs', 20, 18, 45, 45), ev('Abendessen', 20, 20, 0, 60), ev('Zahnarzt', 21, 9, 0, 45), ev('Markt', 23, 10, 0, 60)];

// 1. The headline: what is running leads, else the next one; after today's last one, tomorrow's first.
assert.deepEqual(headOf(draw(day, at(20, 19, 12))), ['Schwimmkurs', 'jetzt · bis 19:30'], 'a running appointment leads, with its end');
assert.deepEqual(headOf(draw(day, at(20, 18, 20))), ['Schwimmkurs', 'in 25 Min.'], 'nothing running: the next one');
assert.deepEqual(headOf(draw(day, at(20, 13, 0))), ['Schwimmkurs', 'in 5 Std. 45 Min.']);
assert.deepEqual(headOf(draw(day, at(20, 21, 30))), ['Zahnarzt', 'Morgen · 09:00'], 'the day is over: tomorrow\'s first');
assert.deepEqual(headOf(draw(day, at(21, 10, 0))), ['Markt', 'Montag 10:00'], 'a later day: its name');
assert.deepEqual(headOf(draw(day, at(23, 12, 0))), ['Heute nichts mehr', ''], 'nothing ahead after today\'s appointments: a calm line');
assert.deepEqual(headOf(draw([{ title: 'Feiertag', start: at(20, 0), end: at(21, 0), allDay: true }], at(20, 12, 0))), ['Heute keine Termine', ''], 'only an all-day entry: no appointments');
{
  // Two running at once: the one that ends first. One that runs past midnight says the day.
  const two = [ev('Lang', 20, 18, 0, 180), ev('Kurz', 20, 18, 30, 60)];
  assert.deepEqual(headOf(draw(two, at(20, 19, 0))), ['Kurz', 'jetzt · bis 19:30']);
  assert.deepEqual(headOf(draw([ev('Nachtschicht', 20, 22, 0, 480)], at(20, 23, 0))), ['Nachtschicht', 'jetzt · bis Sa 06:00']);
  const led = plates(layout(draw(day, at(20, 19, 12)), 'wide')).flatMap((p) => p.rows).filter((r) => /cs-lead/.test(r.cls)).map((r) => r.title);
  assert.deepEqual(led, ['Schwimmkurs'], 'the running one carries the accent on the line too');
}

// 2. No loss of information: close appointments keep their titles (they shrank to a bare dot), in both layouts.
{
  const close = [ev('Arzt', 20, 8, 30, 45), ev('Elterngespräch', 20, 9, 0, 30), ev('Markt', 20, 9, 45, 60), ev('Friseur', 20, 10, 15, 30)];
  const html = draw(close, at(20, 8, 10));
  for (const name of ['wide', 'tall']) {
    const p = plates(layout(html, name));
    assert.deepEqual(p.flatMap((x) => x.rows.map((r) => r.title)), ['Arzt', 'Elterngespräch', 'Markt', 'Friseur'], name + ': every title is there, in order');
    assert.deepEqual(p.flatMap((x) => x.rows.map((r) => r.time)), ['08:30 – 09:15', '09:00 – 09:30', '09:45 – 10:45', '10:15 – 10:45'], name + ': and every time');
    assert.equal(p.reduce((n, x) => n + x.more, 0), 0, name + ': nothing counted away');
  }
  assert.equal(plates(layout(html, 'wide')).length, 1, 'they share one plate, a row each');
  assert.equal((html.match(/class="cs-seg/g) || []).length, 4, 'and each has its stretch on the line');
  assert.ok(!/sv-dot/.test(html), 'no bare dots');
}
// Truly too many: the count says so (never a bare +1), what leads always keeps its row.
{
  const many = [ev('Früh', 20, 7, 0, 30), ...Array.from({ length: 8 }, (_, i) => ev('T' + i, 20, 8, 30 + i * 10, 10))];
  const p = plates(layout(draw(many, at(20, 8, 10)), 'wide'));
  assert.equal(p.length, 1);
  assert.deepEqual(p[0].rows.map((r) => r.title), ['T0', 'T1', 'T2', 'T3'], 'the next ones stay, what is over goes first');
  assert.equal(p[0].more, 5, 'the rest is counted: 9 appointments, 4 rows, +5');
  assert.ok(/cs-lead/.test(p[0].rows[0].cls));
  const tall = plates(layout(draw(many, at(20, 8, 10)), 'tall'));
  assert.equal(tall[0].rows.length + tall[0].more, 9, 'narrow box: rows and count add up as well');
  // The model: every appointment is in exactly one plate or counted, plates never overlap, the lead is never dropped.
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let round = 0; round < 300; round++) {
    const n = 1 + Math.floor(rnd() * 14), lead = Math.floor(rnd() * n);
    const items = Array.from({ length: n }, (_, i) => ({ x: rnd() * 110 - 8, i })).sort((a, b) => a.x - b.x).map((it, i) => ({ ...it, past: it.x < 16.67, lead: i === lead }));
    for (const cfg of [S.LINE.wide, S.LINE.tall]) {
      const out = S.plates(items, cfg.w, cfg.rows);
      assert.equal(out.reduce((k, p) => k + p.rows.length + p.more, 0), n, 'all accounted for');
      out.forEach((p, i) => {
        assert.ok(p.left >= 0 && p.left + cfg.w <= 100.0001, 'inside the line');
        if (i) assert.ok(p.left >= out[i - 1].left + cfg.w + S.LINE.gap - 1e-9, 'plates do not overlap');
        assert.ok(p.rows.length + (p.more ? 1 : 0) <= cfg.rows && p.more !== 1, 'no more rows than fit, never +1');
      });
      assert.ok(out.some((p) => p.rows.some((it) => it.lead)), 'what leads keeps its row');
    }
  }
}

// 3. The colour points forward: the accent starts at now and runs to the end; what is over is the quiet track.
{
  const html = draw(day, at(20, 19, 12));
  assert.match(html, /<div class="cs-line"><u style="left:16\.67%"><\/u><\/div>/, 'the accent part starts at now');
  assert.match(S.CSS, /\.cs-line u\{[^}]*right:0[^}]*var\(--acc\)/, 'and runs to the right end in the accent colour');
  assert.match(S.CSS, /\.cs-line\{[^}]*var\(--line\)/, 'the track itself is the quiet one');
  assert.ok(!/\.cs-line\{[^}]*var\(--acc\)/.test(S.CSS));
}

// 4. The light variant: plates with a clear edge and their own ground, times in full ink; contrast checked.
{
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const light = S.CSS.match(/\.cs-sv\.cs-linie\.cs-light\{([^}]*)\}/)[1], dark = S.CSS.match(/\.cs-sv\.cs-linie\{([^}]*)\}/)[1];
  const v = (block, name) => (block.match(new RegExp(name + ':([^;]+);')) || [])[1];
  const inkLight = S.CSS.match(/\.cs-sv\.cs-light\{[^}]*--ink:(#[0-9A-Fa-f]{6})/)[1], inkDark = S.CSS.match(/\.cs-sv\{[^}]*--ink:(#[0-9A-Fa-f]{6})/)[1];
  assert.match(S.CSS, /\.cs-sv \.cs-ev\{[^}]*background:var\(--cs-pl\);border:[\d.]+cqmin solid var\(--cs-pe\)/, 'a plate has its own ground and an edge');
  assert.ok(Number(v(light, '--cs-pe').match(/,\s*([\d.]+)\)$/)[1]) >= 0.2, 'light: the edge is a clear hairline');
  assert.match(v(light, '--cs-sh'), /rgba/, 'light: a soft shade lifts the plate');
  assert.match(S.CSS, /\.cs-sv \.cs-r span\{[^}]*color:var\(--ink\)/, 'times in full ink');
  assert.ok(ratio(inkLight, v(light, '--cs-pl')) >= 12, 'light: ink on the plate ' + ratio(inkLight, v(light, '--cs-pl')).toFixed(1));
  assert.ok(ratio('#FFFFFF', v(light, '--acc')) >= 4.5, 'light: white on the leading plate ' + ratio('#FFFFFF', v(light, '--acc')).toFixed(1));
  assert.ok(ratio(inkDark, v(dark, '--cs-pl')) >= 9, 'dark: ink on the plate');
  assert.ok(ratio('#10201F', v(dark, '--acc')) >= 7, 'dark: ink on the leading plate');
  assert.match(draw(day, at(20, 13, 0)), /class="cs-sv cs-linie cs-light"/);
}

// 5. The finished day takes no room: a window that travels with the clock, the same scale at every hour.
{
  for (const now of [at(20, 7, 0), at(20, 13, 42), at(20, 19, 12), at(20, 23, 30)]) {
    const m = S.dayLine(day, now);
    assert.ok(Math.abs(m.now - 100 / 6) < 1e-9 && m.to - m.from === 18 * 3600000, 'now stands at a sixth, eighteen hours wide');
    const ticks = [...draw(day, now).matchAll(/class="cs-tick[^"]*" style="left:([\d.]+)%"/g)].map((x) => Number(x[1]));
    assert.ok(ticks.length >= 5 && ticks.every((t, i) => !i || Math.abs(t - ticks[i - 1] - 100 / 6) < 0.02), 'the hours stand evenly, three hours a sixth');
  }
  const evening = draw(day, at(20, 19, 12));
  assert.ok(!/Schule/.test(evening), 'what ended six hours ago is gone from the line');
  assert.ok(/Zahnarzt/.test(layout(evening, 'wide')), 'tomorrow morning is already on it');
  assert.match(evening, /class="cs-tick cs-day" style="left:[\d.]+%">Sa</, 'midnight carries the coming day\'s name');
  const noon = plates(layout(draw(day, at(20, 13, 30)), 'wide'));
  assert.ok(/cs-past/.test(noon[0].rows[0].cls) && noon[0].rows[0].title === 'Schule', 'what ended less than three hours ago stays, quiet');
  assert.ok(S.dayLine(day, at(20, 13, 30)).items[0].x < 0, 'it began before the window');
  assert.equal(noon[0].left, 0, 'its plate stands at the left end');
}

// Within a minute nothing is drawn anew (the tablet asks every five seconds).
assert.equal(draw(day, at(20, 19, 12) + 5000), draw(day, at(20, 19, 12) + 55000));

// 6. Titles come from the calendars: escaped everywhere they are written.
{
  const html = draw([ev('<img src=x onerror=1>', 20, 14, 0, 60), ev('A & B', 20, 14, 30, 30)], at(20, 13, 0));
  assert.ok(!/<img src=x/.test(html) && (html.match(/&lt;img src=x onerror=1&gt;/g) || []).length === 3, 'headline and both layouts');
  assert.match(html, /A &amp; B/);
  // The calendar's colour as a dot (the context carries the calendar of each appointment).
  const dots = [...draw([ev('Eins', 20, 14, 0, 60, 'a'), ev('Zwei', 20, 15, 0, 60, 'b')], at(20, 13, 0)).matchAll(/<i style="--cs-c:(#[0-9A-F]{6})"><\/i>/g)].map((m) => m[1]);
  assert.ok(dots.length === 4 && dots[0] !== dots[1], 'two calendars, two colours');
}
// 7. The headline in another language: its pieces go through the dashboard's translation (the real runtime, English).
{
  const { phrases } = await import('./lib/i18n_phrases.mjs');
  const w2 = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: 'en' } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', read('custom_components/casora/scripts/casora-i18n.js'))(w2, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* no DOM */ }
  assert.equal(typeof w2.casoraTr, 'function');
  win.casoraTr = w2.casoraTr;
  win.casoraLocale = () => 'en-GB';
  try {
    assert.deepEqual(headOf(draw(day, at(20, 19, 12))), ['Schwimmkurs', 'now · until 19:30']);
    assert.deepEqual(headOf(draw(day, at(20, 21, 30))), ['Zahnarzt', 'Tomorrow · 09:00']);
    assert.deepEqual(headOf(draw(day, at(20, 18, 20))), ['Schwimmkurs', 'in 25 min']);
    assert.deepEqual(headOf(draw(day, at(23, 12, 0)))[0], 'Nothing more today');
  } finally { delete win.casoraTr; delete win.casoraLocale; }
}
console.log('ok screensaver_dayline');
