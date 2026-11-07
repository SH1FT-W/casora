// Owner, 06.11.2026: „tapping the Verlauf does not say what value is there“ (e.g. the room climate's temperature).
// casora-chart's readout 'hero' writes value and time into the popup's number ([data-casora-read]); a v3 popup whose
// stage has no such number (climate wheel, network status wheel) showed only the hair line. Now:
//   1. a hero readout that finds no number shows the reading over the plot itself (casora-chart.js _fb);
//   2. a Verlauf plate under a wheel reads in its own head (readout 'own', richtlinien §7.2) – climate and network v3.
//   node dev/unit/chart_readout_target.mjs
// @deckt: custom_components/casora/scripts/casora-chart.js#_say,_hero,_fb,_release
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// 1. The element class without a browser: customElements.define hands it over.
let Chart = null;
const win = { casoraLocale: () => 'de', casoraTr: (s) => s, casoraEsc: (s) => String(s) };
new Function('window', 'customElements', 'HTMLElement', 'document', rd('custom_components/casora/scripts/casora-chart.js'))(
  win, { get: () => null, define: (n, c) => { Chart = c; } }, class {}, {});
assert.ok(Chart, 'casora-chart class defined');
const P = Chart.prototype;

const node = (attrs) => ({
  isConnected: true, textContent: 'orig', innerHTML: 'orig', _a: Object.assign({}, attrs),
  getAttribute(k) { return k in this._a ? this._a[k] : null; }, hasAttribute(k) { return k in this._a; },
  setAttribute(k, v) { this._a[k] = v; }, removeAttribute(k) { delete this._a[k]; }, nextElementSibling: null,
});
const fbEl = () => ({ children: [{}, {}, {}], style: {}, classList: { on: false, add() { this.on = true; }, remove() { this.on = false; } } });
const fake = (targets) => {
  const fb = fbEl();
  return {
    _c: { readout: 'hero' }, _tg: targets, _touched: [], _def: 'Jetzt', fb,
    shadowRoot: { querySelector: (q) => (q === '.fb' ? fb : null) },
    _hero: P._hero, _fb: P._fb, _release: P._release, _say: P._say,
  };
};
const vals = [{ entity: 'sensor.example_temp', text: '21,3 °C', num: '21,3' }];

// A popup with a number that reads along: it gets the value, nothing lies over the plot.
{
  const n = node({ 'data-casora-read': '*' }), w = node({ 'data-casora-read-when': '' });
  const me = fake([n, w]);
  P._say.call(me, null, '21,3', '°C', 'Heute, 14:00 Uhr', 'Temperatur', vals);
  assert.equal(n.textContent, '21,3 °C', 'hero number reads along');
  assert.equal(w.textContent, 'Heute, 14:00 Uhr', 'hero time reads along');
  assert.equal(me.fb.classList.on, false, 'no reading over the plot');
}
// No number in the popup (v3 status wheel): the reading shows over the plot – value, unit and time.
{
  const me = fake([]);
  P._say.call(me, null, '21,3', '°C', 'Heute, 14:00 Uhr', 'Temperatur', vals);
  assert.equal(me.fb.classList.on, true, 'reading over the plot');
  assert.deepEqual(me.fb.children.map((c) => c.textContent), ['21,3', '°C', 'Heute, 14:00 Uhr']);
  P._release.call(me);
  assert.equal(me.fb.classList.on, false, 'letting go hides it');
}
// A number for another entity only: still a reading over the plot.
{
  const me = fake([node({ 'data-casora-read': 'sensor.other' })]);
  P._say.call(me, null, '21,3', '°C', 'Heute, 14:00 Uhr', 'Temperatur', vals);
  assert.equal(me.fb.classList.on, true, 'no matching number → over the plot');
}
// The resting default (no series) never shows it.
{
  const me = fake([]);
  P._say.call(me, null, '21,3', '°C', 'Jetzt', null, null);
  assert.equal(me.fb.classList.on, false, 'not at rest');
}
console.log('ok hero fallback');

// Own head (v3 network Verlauf, owner 07.11.2026): two series, the legend pills bound to one each. Pointing set only the
// head; the pills must read their series too – but not a '*' number or the time (the head shows the time itself).
{
  const ro = { children: [{}, {}, {}] };
  const dl = node({ 'data-casora-read': 'sensor.example_dl', 'data-casora-read-bare': '' });
  const ul = node({ 'data-casora-read': 'sensor.example_ul', 'data-casora-read-bare': '' });
  const any = node({ 'data-casora-read': '*' }), when = node({ 'data-casora-read-when': '' });
  const me = fake([dl, ul, any, when]); me._c = { readout: 'own' };
  const two = [{ entity: 'sensor.example_dl', text: '486 Mbit/s', num: '486' }, { entity: 'sensor.example_ul', text: '41 Mbit/s', num: '41' }];
  P._say.call(me, ro, '486', 'Mbit/s', 'Fr, 03:06 Uhr', 'Download', two);
  assert.equal(ro.children[0].textContent, '486', 'own head reads');
  assert.equal(dl.textContent, '486', 'download pill reads its series');
  assert.equal(ul.textContent, '41', 'upload pill reads its series');
  assert.equal(any.textContent, 'orig', 'a * number stays (own head)');
  assert.equal(when.textContent, 'orig', 'no time outside the own head');
  P._release.call(me);
  assert.equal(dl.innerHTML, 'orig', 'letting go restores the pill');
  assert.equal(dl.hasAttribute('data-casora-reading'), false);
  // At rest (no series values) nothing is written.
  P._say.call(me, ro, '263', 'Mbit/s', 'Jetzt', null, null);
  assert.equal(ul.hasAttribute('data-casora-reading'), false, 'resting default writes no pill');
}
console.log('ok own head reads pills');

// The network template marks both pills (the Casora look's pills write a bare <b>, which a replace of '<b style=' missed).
{
  const T0 = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
  const c = T0.casora_popup_network.tap_action.casora_popup.content;
  const a = c.indexOf("addMetric('legend'"), b = c.indexOf(';', c.indexOf('data-casora-read-bare', c.indexOf('data-casora-read-bare', a) + 1));
  const expr = c.slice(c.indexOf('UI.legend(', a), b).replace(/\)\s*$/, '');
  const esc = (v) => String(v);
  const dlId = 'sensor.example_dl', ulId = 'sensor.example_ul', dlCol = 'c1', ulCol = 'c2', fmt = (v) => String(v), dl = 1, ul = 2;
  for (const legend of [
    (ss) => ss.map((x) => '<div class="hui-lgp"><i></i><b>' + x.value + '</b><span>' + x.label + '</span></div>').join(''),
    (ss) => ss.map((x) => '<div><b style="color:red">' + x.value + '</b>' + x.label + '</div>').join(''),
  ]) {
    const html = new Function('UI', 'esc', 'dlId', 'ulId', 'dlCol', 'ulCol', 'fmt', 'dl', 'ul', 'return ' + expr)({ legend }, esc, dlId, ulId, dlCol, ulCol, fmt, dl, ul);
    assert.match(html, /<b data-hp-live="sensor\.example_dl" data-casora-read="sensor\.example_dl" data-casora-read-bare=""[ >]/, 'download pill marked: ' + html);
    assert.match(html, /<b data-hp-live="sensor\.example_ul" data-casora-read="sensor\.example_ul" data-casora-read-bare=""[ >]/, 'upload pill marked: ' + html);
  }
}
console.log('ok network pills marked');

// 2. v3 Verlauf plates under a wheel read in their own head.
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
{
  const c = T.casora_climate_popup.tap_action.casora_popup.content;
  const a = c.indexOf('const _v3k ='), b = c.indexOf('areas.forEach(', a);
  assert.ok(a > 0 && b > a, 'climate v3 branch found');
  const v3 = c.slice(a, b);
  // The stage gets no number to read (S6 wheel without read, S7 for air quality) – the chart has to read itself.
  assert.ok(!/UI\.stage\('chart', \{[^;]*\bread:/.test(v3), 'climate wheel has no read target (else this test is moot)');
  assert.match(v3, /graphCard\.readout = 'own'/, 'climate v3: Verlauf reads in its own head');
}
for (const name of ['casora_popup_network', 'casora_network']) {
  for (const k of ['tap_action', 'icon_tap_action']) {
    const a = T[name][k];
    if (!a || !a.casora_popup || typeof a.casora_popup.content !== 'string') continue;
    const c = a.casora_popup.content;
    if (!c.includes('const _gc = JSON.parse(JSON.stringify(graphCard));')) continue;
    assert.match(c, /if \(UI\.v3 && UI\.v3\(\)\) (?:_gc\.readout = 'own';|Object\.assign\(_gc, \{ readout: 'own')/, name + '.' + k + ': v3 throughput chart reads in its own head');
  }
}
console.log('chart_readout_target: ok');
