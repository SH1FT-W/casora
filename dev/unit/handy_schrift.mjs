// Gewählte Schrift auch am Handy (Funktionstest F-04, 06.10.2026).   node dev/unit/handy_schrift.mjs
// Gemeldet: Schrift „Hanken Grotesk“ bzw. „Systemschrift“ galt am Desktop und Tablet, das Handy
// blieb bei Inter – nur die Raumkarte casora_room setzte sie, das Handy-Layout hat keine.
// Erwartet: casora_mobile_bg (Handy-Hintergrund, in jedem Handy-Dashboard) erklärt font/font_family,
// damit das Studio die Schrift der Übersicht beim Speichern dorthin spiegelt (mobileTargetsFor),
// und setzt sie wie casora_room (html --primary-font-family).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/panel/casora-panel.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const B = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;

const m = /^function mobileTargetsFor\(/m.exec(src);
assert.ok(m, 'mobileTargetsFor im Studio');
const mobileTargetsFor = new Function(src.slice(m.index, src.indexOf('\n}', m.index) + 2) + '\nreturn mobileTargetsFor;')();

for (const [name, tpl] of [['Quelle', T], ['Paket', B]]) {
  for (const k of ['font', 'font_family']) {
    assert.ok(mobileTargetsFor(k, tpl).includes('casora_mobile_bg'), `${name}: ${k} wird ans Handy (casora_mobile_bg) gespiegelt`);
  }
}

// Ausdruck der Vorlage mit einem kleinen Dokument auswerten.
function fakeDoc() {
  const byId = {};
  const mk = (tag) => ({ tag, id: '', textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this[k] !== undefined ? this[k] : this.attrs[k]; },
    remove() { delete byId[this.id]; } });
  return { byId, head: { appendChild(el) { byId[el.id] = el; return el; } },
    getElementById: (id) => byId[id] || null, createElement: mk };
}
const styles = (T.casora_mobile_bg.styles || {}).card || [];
const expr = (styles.find((s) => s['--casora-font-set']) || {})['--casora-font-set'];
assert.ok(expr, 'casora_mobile_bg setzt --casora-font-set');
const body = expr.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (variables) => { const document = fakeDoc(); new Function('variables', 'document', body)(variables, document); return document; };

let d = run({ font: 'hanken' });
assert.match((d.byId['casora-font-v1'] || {}).textContent || '', /--primary-font-family:"Hanken Grotesk"/, 'Hanken am Handy');
d = run({ font: 'system' });
assert.match((d.byId['casora-font-v1'] || {}).textContent || '', /--primary-font-family:-apple-system/, 'Systemschrift am Handy');
d = run({ font: 'custom', font_family: 'Gilroy' });
assert.match((d.byId['casora-font-v1'] || {}).textContent || '', /"Gilroy"/, 'eigene Schrift am Handy');
d = run({});
assert.equal(d.byId['casora-font-v1'], undefined, 'ohne Wahl: Theme-Schrift (nichts gesetzt)');

console.log('ok handy_schrift');
