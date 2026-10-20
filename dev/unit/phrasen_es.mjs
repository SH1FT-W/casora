// Spanish phrases (casora-i18n.js from translations/dashboard/phrases/es.json) and Studio patterns
// (translations/panel/es.json): every pattern is played through with sample values.
//   node dev/unit/phrasen_es.mjs
// Checks per pattern: the sample reaches a translation, no placeholder is left ({1}, $1), every value the
// English text keeps is in the Spanish text too, and no word of the German (Studio: English) source
// survives unless English keeps it as well (names like Tankerkönig).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const J = (p) => JSON.parse(read('custom_components/casora/translations/' + p));
const SRC = read('custom_components/casora/scripts/casora-i18n.js');

function loadTr(language) {
  const win = {};
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language } } } : null), addEventListener() {} };
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', SRC)(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} });
  } catch (e) { /* DOM watcher without a browser */ }
  assert.ok(win.casoraTr, 'casoraTr loaded for ' + language);
  const tr = win.casoraTr;
  tr.missing = win.casoraTrMissing;
  return tr;
}

// Sample text for a pattern: walks the regex source and picks one simple match for every piece.
// Values are neutral (digits, "Alex") so German or English words in the result come from the table.
function sample(rx) {
  let i = 0;
  const s = rx;
  function atom() {
    const c = s[i];
    if (c === '\\') {
      const n = s[i + 1]; i += 2;
      if (n === 'd') return '5';
      if (n === 'S' || n === 'w') return 'X';
      if (n === 's') return ' ';
      return n;
    }
    if (c === '[') {
      let j = i + 1; const neg = s[j] === '^'; if (neg) j++;
      let first = null;
      while (j < s.length && (s[j] !== ']' || j === i + 1)) {
        if (first === null) first = s[j] === '\\' ? ({ d: '5', s: ' ', w: 'X', S: 'X' }[s[j + 1]] || s[j + 1]) : s[j];
        j += s[j] === '\\' ? 2 : 1;
      }
      i = j + 1;
      return neg ? 'X' : first;
    }
    if (c === '(') {
      i++;
      if (s[i] === '?' && s[i + 1] === ':') i += 2;
      const out = alt();
      i++; // ')'
      return out;
    }
    if (c === '.') { i++; return 'Alex'; }
    i++;
    return c;
  }
  function seq() {
    let out = '';
    while (i < s.length && s[i] !== '|' && s[i] !== ')') {
      if (s[i] === '^' || s[i] === '$') { i++; continue; }
      const start = i;
      let a = atom();
      const q = s[i];
      if (q === '?' || q === '*') { i++; if (s[i] === '?') i++; if (s.slice(start, start + 1) === '.') a = 'Alex'; }
      else if (q === '+') { i++; if (s[i] === '?') i++; }
      else if (q === '{') { const m = /^\{(\d+)(,\d*)?\}/.exec(s.slice(i)); i += m[0].length; a = a.repeat(Math.max(1, +m[1])); }
      out += a;
    }
    return out;
  }
  function alt() {
    const first = seq();
    while (s[i] === '|') { i++; seq(); }
    return first;
  }
  return alt();
}

const WORD = /[A-Za-zÄÖÜäöüßÁÉÍÓÚáéíóúÑñ]+/g;
const words = (x) => new Set(String(x).match(WORD) || []);
const SAMPLE_WORDS = new Set(['Alex', 'X', 'XX']);
// Same check as tools/i18ncheck.py: German-only letters, or a source word English does not keep.
const SHARED = new Set(['Portal', 'Foto', 'Fotos', 'Sensor', 'Sensores', 'number', 'Hemma', 'Casora', 'Studio', 'Pulse']);
function leftovers(es, source, en) {
  const keep = new Set([...words(en), ...SHARED, ...SAMPLE_WORDS]);
  const src = words(source);
  return [...words(es)].filter((w) => !keep.has(w) && (/[äöÄÖß]/.test(w) || (w.length >= 4 && src.has(w))));
}

const problems = [];
let played = 0;

// 1. Dashboard phrases: German source, played through the real runtime.
{
  const trEs = loadTr('es');
  const trEn = loadTr('en');
  const es = J('dashboard/phrases/es.json');
  const en = J('dashboard/phrases/en.json');
  assert.deepEqual(es.patterns.map((p) => p[0]), en.patterns.map((p) => p[0]), 'es patterns = en patterns, same order');
  for (const [rx] of es.patterns) {
    const re = new RegExp(rx);
    const text = sample(rx);
    const m = re.exec(text);
    if (!m) { problems.push(`phrases: no sample for ${rx} (got ${JSON.stringify(text)})`); continue; }
    played++;
    const outEs = trEs(text);
    const outEn = trEn(text);
    if (/\{\d\}|\$\d/.test(outEs)) problems.push(`phrases: placeholder left in ${JSON.stringify(outEs)} (${rx})`);
    for (const g of m.slice(1)) {
      if (g && /^[\d:.,]+$/.test(g) && outEn.includes(g) && !outEs.includes(g)) problems.push(`phrases: value ${g} lost in ${JSON.stringify(outEs)} (${rx})`);
    }
    const bad = leftovers(outEs, text, outEn);
    if (bad.length) problems.push(`phrases: German ${bad.join(', ')} in ${JSON.stringify(outEs)} (from ${JSON.stringify(text)})`);
  }
  // Every sample reached an entry (the runtime collects German text it could not translate).
  for (const t of trEs.missing()) problems.push(`phrases: no entry reached for ${JSON.stringify(t)}`);
  // Exact entries: the table itself, without the runtime (i18ncheck checks markup and placeholders).
  for (const [de, v] of Object.entries(es.exact)) {
    const bad = leftovers(v, de, en.exact[de]);
    if (bad.length) problems.push(`phrases: German ${bad.join(', ')} in ${JSON.stringify(v)}`);
  }
  // A few fixed results (runtime behaviour, not just the table).
  const EXPECT = [
    ['Leuchten', 'Luces'],
    ['Beleuchtung', 'Iluminación'],
    ['62 %', '62 %'],
    ['Home', 'Casa'],
    // Singular before the plural pattern (exact entries win).
    ['1 entriegelt', '1 desbloqueada'],
    ['3 entriegelt', '3 desbloqueadas'],
    ['1 An', '1 encendida'],
    ['2 aktiv', '2 activas'],
    ['Favorites', 'Favoritos'],
  ];
  for (const [de, want] of EXPECT) assert.equal(trEs(de), want, de);
}

// 2. Studio patterns: English source; same lookup as tools/panel-i18n-runtime.js.
{
  const es = J('panel/es.json');
  const de = J('panel/de.json');
  assert.deepEqual(es.patterns.map((p) => p[0]), de.patterns.map((p) => p[0]), 'es Studio patterns = de patterns, same order');
  const deRep = Object.fromEntries(de.patterns);
  for (const [rx, rep] of es.patterns) {
    const re = new RegExp(rx);
    const text = sample(rx);
    const m = re.exec(text);
    if (!m) { problems.push(`panel: no sample for ${rx} (got ${JSON.stringify(text)})`); continue; }
    played++;
    const fill = (r) => r.replace(/\{(\d+)\}/g, (_, n) => m[+n] || '');
    const out = fill(rep);
    if (/\{\d+\}|\$\d/.test(out)) problems.push(`panel: placeholder left in ${JSON.stringify(out)} (${rx})`);
    const want = new Set((deRep[rx].match(/\{\d+\}/g) || []));
    const have = new Set((rep.match(/\{\d+\}/g) || []));
    if ([...want].some((x) => !have.has(x))) problems.push(`panel: ${rx} drops ${[...want].filter((x) => !have.has(x))}`);
    // German in a Studio text: a word of the German translation that English does not have.
    const bad = leftovers(out, fill(deRep[rx]), text);
    if (bad.length) problems.push(`panel: German ${bad.join(', ')} in ${JSON.stringify(out)} (${rx})`);
  }
}

// No chain: a translation is never another German key (the DOM watcher would translate it again).
{
  const ex = J('dashboard/phrases/es.json').exact;
  const chains = Object.entries(ex).filter(([k, v]) => v !== k && ex[v] !== undefined && ex[v] !== v).map(([k, v]) => k + ' → ' + v + ' → ' + ex[v]);
  for (const c of chains) problems.push('phrases: chain ' + c);
}
assert.deepEqual(problems, [], problems.join('\n'));
assert.ok(played > 600, 'patterns played through: ' + played);
console.log('ok phrasen_es (' + played + ' patterns)');
