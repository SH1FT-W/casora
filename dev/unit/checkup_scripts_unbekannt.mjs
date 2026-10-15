// Checkup 10/2026: Lecksensor im Zustand „unknown“ meldete „Trocken“ (Ton gut), die Gerätetür
// „Geschlossen“. Erwartet: unknown wie unavailable – Lecksensor „Offline“ wie Kachel und Kopf (Ton warn), keine Türzeile.
// Alle Entitäten erfunden.   node dev/unit/checkup_scripts_unbekannt.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-geraete.js', import.meta.url), 'utf8');
const c = { leak: 'binary_sensor.leck_test', temp: 'sensor.wasser_test' };
let last = null;
const window = {
  _casoraUI: { group: (rows, title) => { last = { rows, title }; return 'x'; } },
  _casoraAqWrap: (h) => h,
};
// Vorlage aus dem Quelltext: Text zwischen Anfang und Ende, ${_c} durch die Konfiguration ersetzt.
const tpl = (start, end) => {
  const a = src.indexOf(start);
  assert.ok(a > 0, 'Vorlage gefunden: ' + start);
  const b = src.indexOf(end, a + start.length);
  const body = src.slice(a + start.length, b).replace('${_c}', JSON.stringify(c));
  return new Function('states', 'window', body);
};
const gsafe = tpl("add('gsafe', `[[[", ']]]`);');
const gleak = tpl('f2.gleak = `[[[', ']]]`;');
const st = (s) => ({ [c.leak]: { entity_id: c.leak, state: s, attributes: {} }, [c.temp]: { state: '24.5', attributes: {} } });
const leakRow = () => last.rows.find((r) => r.label === 'Lecksensor');

for (const [fn, name] of [[gsafe, 'Sensoren'], [gleak, 'Sicherheit']]) {
  fn(st('unknown'), window);
  assert.equal(leakRow().value, 'Offline', name + ': unknown nicht „Trocken“');
  assert.equal(leakRow().iconTone, 'warn', name + ': unknown Symbol warn');
  assert.equal(leakRow().valueTone, 'warn', name + ': unknown Wert warn');
  fn(st('unavailable'), window);
  assert.equal(leakRow().value, 'Offline', name + ': unavailable');
  assert.equal(leakRow().valueTone, 'warn');
  fn(st('off'), window);
  assert.equal(leakRow().value, 'Trocken', name + ': off');
  assert.equal(leakRow().iconTone, 'good');
  fn(st('on'), window);
  assert.equal(leakRow().value, 'Wasser erkannt!', name + ': on');
  assert.equal(leakRow().valueTone, 'bad');
}
console.log('ok Lecksensor');

// Gerätetür (Waschmaschine, Hersteller-Integration): unknown → keine Zeile „Geschlossen“.
{
  const a = src.indexOf('(function () {\n  if (window._casoraLaundry) return;');
  const b = src.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'Wäsche-Block gefunden');
  globalThis.window = globalThis;
  globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
  globalThis.addEventListener = () => {};
  globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
  let rows = null;
  globalThis._casoraUI = { group: (r) => { rows = r; return 'x'; } };
  new Function(src.slice(a, b + 6))();
  const L = globalThis._casoraLaundry;
  const cc = { official: true, st: 'sensor.waschen_test', door: 'binary_sensor.tuer_test' };
  const states = (door) => ({
    [cc.st]: { entity_id: cc.st, state: 'off', attributes: {} },
    [cc.door]: { entity_id: cc.door, state: door, attributes: {} },
  });
  const door = (s) => { rows = null; L.inner('dev', cc, states(s)); return (rows || []).find((r) => r.label === 'Tür'); };
  assert.equal(door('unknown'), undefined, 'unknown: keine Türzeile');
  assert.equal(door('unavailable'), undefined, 'unavailable: keine Türzeile');
  assert.equal(door('off').value, 'Geschlossen');
  assert.equal(door('on').value, 'Geöffnet');
}
console.log('ok Gerätetür');
