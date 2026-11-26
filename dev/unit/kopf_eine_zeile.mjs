// d03-07 (§3, „Ein Kopf, eine Höhe“): on the phone the status line of weather, calendar, Frigate and scenes wrapped
// onto a second line and the head grew. Expected: one line in every popup; what does not fit goes from the end, each
// extra whole with its dot (never in the middle of a word), the state always stays and ends in „…“ only alone.
//   node dev/unit/kopf_eine_zeile.mjs
// @deckt: casora-core.js#headFit,headUnits,CasoraPopup,_mirrorHead
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');

// CSS of the head's line: no wrapping, overflow ends in „…“, dropped parts are gone.
const c0 = core.indexOf('    :host([soft]) .header-status {');
const css = core.slice(c0, core.indexOf(':host([soft]) .header-status b {', c0));
assert.ok(c0 > 0, 'head line CSS found');
const box = css.slice(0, css.indexOf('}'));
assert.match(box, /white-space: nowrap;/, 'one line');
assert.match(box, /overflow: hidden;/); assert.match(box, /text-overflow: ellipsis;/);
assert.ok(!/overflow-wrap: anywhere/.test(box), 'no breaking anywhere');
assert.ok(!/\.header-status span, :host\(\[soft\]\) \.header-status div \{[^}]*white-space: normal/.test(css), 'parts do not wrap either');
assert.match(css, /\.header-status \.hui-drop \{ display: none !important; \}/, 'dropped parts are hidden');

// headFit, run on a stand-in line: every element has a width, the line's box is narrower.
const f0 = core.indexOf('  function headUnits(el) {');
const f1 = core.indexOf('  window._casoraHeadFit = headFit;', f0);
assert.ok(f0 > 0 && f1 > f0, 'headFit found');
const headFit = new Function(core.slice(f0, f1) + '\nreturn headFit;')();

class El {
  constructor(cls, text, w, kids = []) {
    this.cls = new Set(cls ? cls.split(' ') : []); this.text = text || ''; this.w = w || 0; this.children = kids; this.tagName = 'SPAN';
    const self = this;
    this.classList = { contains: (c) => self.cls.has(c), add: (c) => self.cls.add(c), remove: (c) => self.cls.delete(c) };
  }
  get textContent() { return this.text + this.children.map((k) => k.textContent).join(''); }
  all() { return this.children.flatMap((k) => [k, ...k.all()]); }
  querySelectorAll(q) { const want = q.split(',').map((x) => x.trim().replace(/^\./, '')); return this.all().filter((k) => want.some((c) => k.cls.has(c))); }
  querySelector(q) { return this.querySelectorAll(q)[0] || null; }
  width() { return this.cls.has('hui-drop') ? 0 : this.w + this.children.reduce((s, k) => s + k.width(), 0); }
}
const line = (boxW, kids) => { const el = new El('header-status hui-line', '', 0, kids); el.hidden = false; el.clientWidth = boxW; Object.defineProperty(el, 'scrollWidth', { get: () => Math.max(boxW, el.width()) }); return el; };
const sep = () => new El('hui-sep', ' · ', 12);
const shown = (el) => el.children.filter((k) => !k.cls.has('hui-drop'))
  .flatMap((k) => (k.children.length ? shown(k) : (!k.cls.has('hui-sep') && k.text.trim() ? [k.text] : [])));

// Weather on a phone: state + wind + rain slot; only the state and the wind fit.
let w = line(250, [new El('', 'Teils bewölkt', 100), sep(), new El('', 'Wind 18,4 km/h / SW', 130), new El('hui-lslot', 'Regen ab 12 Uhr', 120)]);
headFit(w);
assert.deepEqual(shown(w), ['Teils bewölkt', 'Wind 18,4 km/h / SW'], 'the last extra goes first');
// Narrower: only the state is left – its dot goes with the wind.
w = line(150, [new El('', 'Teils bewölkt', 100), sep(), new El('', 'Wind 18,4 km/h / SW', 130), new El('hui-lslot', 'Regen ab 12 Uhr', 120)]);
headFit(w);
assert.deepEqual(shown(w), ['Teils bewölkt'], 'state only');
assert.ok(w.children[1].cls.has('hui-drop'), 'no dot left at the end');
// Wide enough: nothing goes; a later wider box brings the parts back.
w = line(600, w.children); headFit(w);
assert.deepEqual(shown(w), ['Teils bewölkt', 'Wind 18,4 km/h / SW', 'Regen ab 12 Uhr'], 'everything fits, nothing dropped');
// The state alone too long: it stays (CSS ends it in „…“).
w = line(80, [new El('', 'Als Nächstes: Heute 09:00', 180), sep(), new El('', 'Termin', 50)]);
headFit(w);
assert.deepEqual(shown(w), ['Als Nächstes: Heute 09:00'], 'the state never goes');
// A wrapper with dots inside (o.read) is opened; a name kept as written (litWrap) stays one part.
w = line(230, [new El('', '2 neue Alarme', 100), sep(), new El('', '', 0, [new El('', 'vor 37 Min.', 80), sep(), new El('', '', 0, [new El('', 'Garten', 60)])])]);
headFit(w);
assert.deepEqual(shown(w), ['2 neue Alarme', 'vor 37 Min.'], 'parts inside a wrapper drop one by one');

// Wired in the popup: the line is fitted on every change of its text, when shown and when its width changes.
const k0 = core.indexOf("      this._headerStatus = root.querySelector('.header-status');");
const ctor = core.slice(k0, k0 + 900);
assert.match(ctor, /new MutationObserver\(hsFit\)\.observe\(this\._headerStatus, \{ childList: true, subtree: true, characterData: true/, 'fits on new text');
assert.match(ctor, /new ResizeObserver\(hsFit\)\.observe\(this\._headerStatus\)/, 'fits on a new width');
console.log('kopf_eine_zeile: ok');
