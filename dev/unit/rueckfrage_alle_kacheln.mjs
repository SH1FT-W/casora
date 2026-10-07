// Nutzertest 5 (P-T5) ohne Browser.  node dev/unit/rueckfrage_alle_kacheln.mjs
// „Vor dem Schalten fragen“ gibt es für jede Kachel, die etwas schaltet oder fährt (auch
// Garagentor/Jalousie ohne An/Aus-Schalter), und die Rückfrage greift auch bei den Knöpfen
// und dem Regler im Cover-Popup (data-casora-svc / data-casora-slider). Dazu ⌘K-Synonyme.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');

// ── Studio: welche Kacheln die Option bekommen ─────────────────────────────────────
const mehr = read('panel/casora-panel-b-mehr.js');
{
  const i = mehr.indexOf('const SWITCH_DOMAINS');
  const j = mehr.indexOf('P._mSwitchesSomething', i);
  assert.ok(i > 0 && j > i, 'switchesSomething fehlt');
  const sw = new Function(mehr.slice(i, j) + '\nreturn switchesSomething;')();
  assert.equal(sw({ template: 'casora_cover', entity: 'cover.garage' }), true, 'Garagentor (Cover ohne Schalter)');
  assert.equal(sw({ template: ['casora_cover', 'casora_popup_cover'], variables: { covers: ['cover.a', 'cover.b'] } }), true, 'Jalousie-Gruppe');
  for (const id of ['lock.tuer', 'valve.wasser', 'fan.bad', 'switch.pumpe', 'light.decke', 'scene.film', 'script.tor'])
    assert.equal(sw({ entity: id }), true, id);
  assert.equal(sw({ entity: 'sensor.temperatur' }), false, 'Sensor schaltet nichts');
  assert.equal(sw({ entity: 'sensor.x', variables: { action_1_entity: 'switch.y' } }), true, 'Kachel mit Knopf');
  assert.ok(/if \(tf \|\| switchesSomething\(inner\)\)/.test(mehr), 'Option nicht nur bei show_toggle');
}

// ── Studio: Liste beim Speichern enthält auch Mitglieder von Sammelkacheln ───────────
const src = read('panel/casora-panel.js');
{
  const i = src.indexOf('function confirmEntities(');
  const ce = new Function(src.slice(i, src.indexOf('\n}', i) + 2) + '\nreturn confirmEntities;')();
  const rooms = [{ tiles: [
    { template: 'casora_cover', entity: 'cover.garage', variables: { confirm_toggle: true } },
    { template: ['casora_cover', 'casora_popup_cover'], entity: 'cover.alle', variables: { confirm_toggle: true, covers: ['cover.a', 'cover.b'] } },
    { template: 'casora_cover', entity: 'cover.ohne' },
  ] }];
  assert.deepEqual(ce(rooms), ['cover.a', 'cover.alle', 'cover.b', 'cover.garage']);
}

// ── casora-core: Popup-Knöpfe und Regler ────────────────────────────────────────────
const core = read('scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
const shown = [];
let host = null;
const states = {
  'cover.garage': { state: 'closed', attributes: { friendly_name: 'Garage', current_position: 0 } },
  'light.decke': { state: 'on', attributes: { friendly_name: 'Decke' } },
};
const doc = {
  querySelector: () => ({ hass: { states } }),
  addEventListener() {}, removeEventListener() {},
  body: { appendChild: (h) => { host = h; } },
  createElement: () => {
    const parts = {};
    const el = { classList: { add() {} }, addEventListener() {}, remove() { host = null; },
      attachShadow: () => ({ set innerHTML(v) {}, querySelector: (s) => (parts[s] = parts[s] || { focus() {}, set textContent(v) { shown.push(s + '=' + v); } }) }),
      parts };
    return el;
  },
};
const w = { addEventListener() {} };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, class {}, () => {});
assert.equal(typeof w.casoraConfirmSpec, 'function');
w.__casoraConfirmIds = ['cover.garage', 'light.decke'];
const tap = async (spec, yes) => {
  shown.length = 0; host = null;
  const p = w.casoraConfirmSpec(spec);
  if (host) host.parts[yes ? '.yes' : '.no'].onclick();
  return { ok: await p, asked: shown.slice() };
};
{
  // „Auf“ im Popup ohne Bestätigen: fährt nicht.
  const r = await tap({ domain: 'cover', service: 'set_cover_position', target: { entity_id: ['cover.garage'] }, data: { position: 100 } }, false);
  assert.equal(r.ok, false, 'Abbrechen → nicht fahren');
  assert.ok(r.asked.includes('h2=Garage') && r.asked.includes('.yes=Öffnen'), 'fragt „Öffnen“: ' + r.asked);
}
{
  const r = await tap({ domain: 'cover', service: 'set_cover_position', target: { entity_id: ['cover.garage'] }, data: { position: 100 } }, true);
  assert.equal(r.ok, true, 'Öffnen bestätigt → fahren');
}
{
  states['cover.garage'].attributes.current_position = 80;
  const r = await tap({ domain: 'cover', service: 'set_cover_position', target: { entity_id: 'cover.garage' }, data: { position: 25 } }, false);
  assert.ok(r.asked.includes('.yes=Schließen'), 'kleiner als jetzt = Schließen: ' + r.asked);
}
{
  const r = await tap({ domain: 'cover', service: 'stop_cover', target: { entity_id: 'cover.garage' } }, false);
  assert.ok(r.ok && !r.asked.length, 'Anhalten fragt nie');
}
{
  const r = await tap({ domain: 'cover', service: 'open_cover', target: { entity_id: 'cover.andere' } }, false);
  assert.ok(r.ok && !r.asked.length, 'andere Kachel ohne Rückfrage');
}
{
  const r = await tap({ domain: 'light', service: 'turn_on', target: { entity_id: 'light.decke' }, data: { brightness_pct: 40 } }, false);
  assert.ok(r.ok && !r.asked.length, 'Helligkeit verstellen ist kein Schalten');
}
// Knöpfe (data-casora-svc) und Regler (data-casora-slider) gehen über die Rückfrage.
assert.ok(/window\.casoraConfirmSpec\(spec\)\.then\(function \(ok\) \{ if \(ok\) go2\(\); \}\)/.test(core), 'Knöpfe');
assert.ok(/casoraConfirmSpec\(\{ domain: spec\.domain, service: spec\.service, target: spec\.target, data: data \}\)/.test(core)
  && /else if \(d\.from != null\) paint\(d\.el, d\.from\)/.test(core), 'Regler fragt und springt bei Abbrechen zurück');

// ── ⌘K: Synonyme ─────────────────────────────────────────────────────────────────
{
  const win = {};
  new Function('window', mehr)(win);
  const M = win.__casoraStudioMehr;
  const words = (id) => { const m = new RegExp('A\\("' + id + '", "[^"]+", "([^"]+)"(?:\\s*\\+\\s*"([^"]+)")?').exec(mehr); assert.ok(m, id); return m[1] + (m[2] || ''); };
  const items = [
    { kind: 'action', label: 'Vor dem Schalten fragen', words: words('askfirst') },
    { kind: 'action', label: 'Wer sieht das?', words: words('whosees') },
    { kind: 'action', label: 'Lüften-Hinweise aufs Handy', words: words('ventpush') },
    { kind: 'action', label: 'Auf Handy öffnen', words: 'handy qr code smartphone öffnen teilen iphone' },
    { kind: 'action', label: 'Handy-Vorschau', words: 'handy mobil vorschau iphone' },
    { kind: 'setting', label: 'Glocke & Meldungen', words: 'glocke meldungen benachrichtigung push' },
  ];
  for (const q of ['rückfrage', 'Rueckfrage', 'bestätigen', 'nachfragen', 'garagentor'])
    assert.equal((M.searchRank(items, q)[0] || {}).label, 'Vor dem Schalten fragen', q);
  for (const q of ['push', 'lüften handy', 'benachrichtigung lüften', 'empfänger'])
    assert.equal((M.searchRank(items, q)[0] || {}).label, 'Lüften-Hinweise aufs Handy', q);
  assert.ok(M.searchRank(items, 'handy').some((x) => x.label === 'Lüften-Hinweise aufs Handy'), 'handy');
  assert.equal((M.searchRank(items, 'kind')[0] || {}).label, 'Wer sieht das?');
}
console.log('rueckfrage_alle_kacheln: ok');
