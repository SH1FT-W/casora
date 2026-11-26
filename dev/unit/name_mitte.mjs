// per-10 (1.3): lange Szenennamen am Handy in der Mitte kürzen („WZ Dream…Aus“), damit An/Aus lesbar bleibt.
//   node dev/unit/name_mitte.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraMidFit,casoraMidText
import fs from 'node:fs';
import assert from 'node:assert/strict';
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = core.indexOf('// casora-midfit:start'), j = core.indexOf('// casora-midfit:end');
assert.ok(i > -1 && j > i, 'Block casora-midfit fehlt');
const window = {};
new Function('window', core.slice(i, j))(window);
const M = window.casoraMidText;
assert.equal(M('WZ Dreamview Aus', 8), 'WZ Dream…Aus');
assert.equal(M('WZ Dreamview An', 8), 'WZ Dream…An');
// Leerzeichen am Schnitt fällt weg
assert.equal(M('WZ Dreamview Aus', 3), 'WZ…Aus');
// Ein Wort: die letzten 4 Zeichen bleiben
assert.equal(M('Hauswirtschaftsraumlicht', 6), 'Hauswi…icht');
// Sehr langes letztes Wort: ebenfalls die letzten 4 Zeichen
assert.equal(M('Licht Wohnzimmerdeckenfluter', 5), 'Licht…uter');
// Mindestens ein Zeichen vorn
assert.equal(M('A Aus', 0), 'A…Aus');
// Fit: misst über scrollWidth/clientWidth und kürzt, bis es passt
const el = { attrs: { 'data-casora-mid': 'WZ Dreamview Aus' }, textContent: 'WZ Dreamview Aus', clientWidth: 100, clientHeight: 20,
  getAttribute(k) { return this.attrs[k]; }, get scrollWidth() { return this.textContent.length * 10; }, get scrollHeight() { return 20; } };
window.casoraMidFit({ querySelectorAll: () => [el] });
assert.ok(el.textContent.length * 10 <= 100, 'passt danach: ' + el.textContent);
assert.ok(/…Aus$/.test(el.textContent), 'Ende bleibt: ' + el.textContent);
// Passt schon: unverändert
const ok = { ...el, attrs: { 'data-casora-mid': 'Ambiente' }, textContent: 'Ambiente', getAttribute: el.getAttribute };
Object.defineProperty(ok, 'scrollWidth', { get() { return 80; } });
window.casoraMidFit({ querySelectorAll: () => [ok] });
assert.equal(ok.textContent, 'Ambiente');
// Prüfrunde u06-03 (360 px): the last word alone does not fit ("Ambiente Wohnzimmer" -> "A…Wohnzimmer", then cut
// again by the CSS). When no cut fits, or the head would keep fewer than 4 characters, the full name stays and the
// CSS cuts it at the end.
const mk = (full, width) => ({ attrs: { 'data-casora-mid': full }, textContent: full, clientWidth: width, clientHeight: 20,
  getAttribute(k) { return this.attrs[k]; }, get scrollWidth() { return this.textContent.length * 10; }, get scrollHeight() { return 20; } });
const wide = mk('Ambiente Wohnzimmer', 90);
window.casoraMidFit({ querySelectorAll: () => [wide] });
assert.equal(wide.textContent, 'Ambiente Wohnzimmer', 'no cut fits: full name, got ' + wide.textContent);
const short = mk('Ambiente Wohnzimmer', 140);
window.casoraMidFit({ querySelectorAll: () => [short] });
assert.equal(short.textContent, 'Ambiente Wohnzimmer', 'head of 3: full name, got ' + short.textContent);
const four = mk('Ambiente Wohnzimmer', 150);
window.casoraMidFit({ querySelectorAll: () => [four] });
assert.equal(four.textContent, 'Ambi…Wohnzimmer');
// Prüfrunde u06-03, second case (360 px, scene grid with two lines): "WZ Dreamview An" became "WZ" / "Dreamv…An",
// the cut in the middle of line 2 and glued to "An". Made-up two-line element (10 px per character, greedy wrap at
// spaces and after "…", forced at "\n" with pre-line, as Chromium and WebKit lay it out): the cut must end a line
// and the kept end must start line 2.
const twoLines = (full, width) => {
  const e = { attrs: { 'data-casora-mid': full }, textContent: full, clientWidth: width, clientHeight: 34,
    style: { whiteSpace: 'normal' }, getAttribute(k) { return this.attrs[k]; } };
  e.lines = () => {
    const pre = e.style.whiteSpace === 'pre-line', out = [];
    for (const para of pre ? e.textContent.split('\n') : [e.textContent.replace(/\n/g, ' ')]) {
      const parts = para.split(/(?<=[ …])/); let cur = '';
      for (const p of parts) {
        if (cur && (cur + p).trimEnd().length * 10 > width) { out.push(cur.trimEnd()); cur = p; } else cur += p;
      }
      out.push(cur.trimEnd());
    }
    return out;
  };
  Object.defineProperty(e, 'scrollWidth', { get() { return Math.max(...e.lines().map((l) => l.length * 10)); } });
  Object.defineProperty(e, 'scrollHeight', { get() { return e.lines().length * 17; } });
  return e;
};
for (const [name, end] of [['WZ Dreamview An', 'An'], ['WZ Dreamview Aus', 'Aus']]) {
  const e = twoLines(name, 90);
  window.casoraMidFit({ querySelectorAll: () => [e] });
  const lines = e.lines();
  assert.equal(lines.length, 2, `"${name}": two lines, got ${JSON.stringify(lines)}`);
  assert.ok(lines[0].endsWith('…') && lines[0].length > 3, `"${name}": the cut ends line 1, got ${JSON.stringify(lines)}`);
  assert.equal(lines[1], end, `"${name}": the kept end is line 2, got ${JSON.stringify(lines)}`);
}
// Fits on two lines: unchanged; a name whose end is too wide for a line keeps the full text (CSS cuts at the end).
{ const e = twoLines('WZ Dreamview An', 120); window.casoraMidFit({ querySelectorAll: () => [e] });
  assert.equal(e.textContent, 'WZ Dreamview An'); }
{ const e = twoLines('Ambiente Wohnzimmer', 90); window.casoraMidFit({ querySelectorAll: () => [e] });
  assert.equal(e.textContent, 'Ambiente Wohnzimmer'); }
// The separator goes between "…" and the kept end.
assert.equal(M('WZ Dreamview An', 8, '\n'), 'WZ Dream…\nAn');
console.log('ok name_mitte');
