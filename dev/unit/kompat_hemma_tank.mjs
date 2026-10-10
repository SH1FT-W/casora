// Issue #14: casora-kompat leitete window._casoraTank auf ein altes Nutzer-Modul window._hemmaTank um.
// 12-tanken.js brach dann ab („schon da“), und das Auto-Popup rief die fremde watch()/row() auf –
// Popup leer. Erwartet: Casoras Module gewinnen, alte Hemma-Namen ohne Casora-Gegenstück
// bleiben über den Zwilling erreichbar, ein fremdes _casoraTank kippt das Auto-Popup nicht.
// node dev/unit/kompat_hemma_tank.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/scripts/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, dir), 'utf8');
const KOMPAT = read('casora-kompat.js'), TANK = read('local/12-tanken.js'), POPUPS = read('local/03-popups.js');

function makeWin() {
  const listeners = {}, timers = [];
  const el = () => ({ style: {}, appendChild() {}, isConnected: false, textContent: '' });
  const ctx = {
    console, Object, Array, String, Number, Math, Date, JSON, RegExp, isNaN, parseFloat, Promise,
    performance: { now: () => 0 },
    setTimeout: (f, ms) => { timers.push([ms, f]); return timers.length; },
    clearTimeout() {},
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    dispatch: (n) => (listeners[n] || []).forEach((f) => f()),
    timers,
    customElements: { whenDefined: () => new Promise(() => {}), get: () => null, define() {} },
    MutationObserver: class { observe() {} },
    document: {
      querySelector: () => null, querySelectorAll: () => [], createElement: el, addEventListener() {},
      head: { appendChild() {} }, documentElement: { style: { length: 0 } },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  return ctx;
}

// Altes Nutzer-Modul aus der Hemma-Zeit (eigene API watch(c) / popup(...)).
const legacy = { watch(c) { return c.map((x) => x); }, popup() { return {}; } };

// 1) Ladereihenfolge wie im Browser: Ressource mit _hemmaTank, Kompat, dann Casoras Module.
{
  const w = makeWin();
  w._hemmaTank = legacy;
  w._hemmaAltesModul = { alt: true };
  vm.runInContext(KOMPAT, w);
  // Vor casora-local-loaded: kein Zwilling, der Casoras Modul verdecken könnte.
  assert.equal(Object.getOwnPropertyDescriptor(w, '_casoraTank'), undefined, 'Zwilling vor dem Laden der Module');
  vm.runInContext(TANK, w);
  assert.equal(w._casoraTank.casora, true, 'Casoras Tanken-Modul muss starten');
  w._casoraLocalLoaded = ['12-tanken'];
  w.dispatch('casora-local-loaded');
  assert.equal(w._casoraTank.casora, true, 'Casoras Fassung bleibt nach dem Sweep');
  assert.equal(w._hemmaTank, legacy, 'altes Modul bleibt unter seinem Namen');
  // Gegenrichtung bleibt: Name, den Casora nicht kennt, zeigt aufs alte Modul.
  assert.equal(w._casoraAltesModul, w._hemmaAltesModul, 'Zwilling für unbekannte Hemma-Namen');
}

// 2) Zwilling ist schon da (z. B. spät geladenes Modul nach 30 s): 12-tanken ersetzt ihn trotzdem.
{
  const w = makeWin();
  w._hemmaTank = legacy;
  vm.runInContext(KOMPAT, w);
  w._casoraLocalLoaded = [];
  w.__casoraKompatSweep();
  assert.equal(w._casoraTank, legacy, 'Testvoraussetzung: Zwilling zeigt aufs alte Modul');
  vm.runInContext(TANK, w);
  assert.equal(w._casoraTank.casora, true, '12-tanken erkennt den fremden Zwilling an der fehlenden Markierung');
  assert.equal(w._hemmaTank, legacy);
}

// 3) Auto-Popup mit fremdem _casoraTank: watch()/row() des Fremden werden nicht aufgerufen.
{
  const a = POPUPS.indexOf('(function () {\n  if (window._casoraCar) return;');
  const b = POPUPS.indexOf('\n})();', a);
  const block = POPUPS.slice(a, b + 6);
  const entities = {
    'sensor.auto_reichweite': { entity_id: 'sensor.auto_reichweite', device_id: 'car', translation_key: 'range_km' },
    'sensor.auto_tankstand': { entity_id: 'sensor.auto_tankstand', device_id: 'car', translation_key: 'fuel_level' },
    'sensor.auto_kilometerstand': { entity_id: 'sensor.auto_kilometerstand', device_id: 'car', translation_key: 'mileage' },
  };
  const states = Object.fromEntries(Object.keys(entities).map((id) => [id, { entity_id: id, state: '50', attributes: {} }]));
  const window = { _casoraUI: {}, _casoraTank: { watch() { throw new Error('fremd'); }, row() { throw new Error('fremd'); } } };
  const document = { querySelector: () => ({ hass: { entities, states } }) };
  new Function('window', 'document', block)(window, document);
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  const card = window._casoraCar.popup({ entity_id: 'sensor.auto_reichweite' }, {}, states, {});
  console.warn = warn;
  assert.equal(warned, 0, 'Popup darf nicht in den Schutz-Fallback fallen');
  assert.ok(card && card.type === 'custom:button-card', 'Popup wird gebaut');
  assert.ok(card.triggers_update.includes('sensor.auto_tankstand'));
}
console.log('kompat_hemma_tank: ok');
