// Übergangsschicht in beide Richtungen (casora-kompat.js, 03.10.2026): Ein eigenes Modul des
// Nutzers (als Ressource geladen) setzt noch window._hemmaX, die umgezogenen Vorlagen rufen
// window._casoraX. Fehlt _casoraX, zeigt es auf _hemmaX; Casoras eigene Module bleiben unberührt
// (auch wenn sie _casoraX erst später anlegen), und die alte Richtung (_hemmaX → _casoraX) gilt weiter.
//   node dev/unit/kompat_beidseitig.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const code = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-kompat.js', import.meta.url), 'utf8');

function setup(hemmaInstalled) {
  const timers = [];
  const win = {};
  const doc = {
    querySelector: () => (hemmaInstalled ? {} : null),
    documentElement: { style: { length: 0 } },
    head: { appendChild() {} },
    createElement: () => ({ textContent: '', isConnected: true }),
  };
  const env = {
    window: win, document: doc,
    setTimeout: (fn) => { timers.push(fn); return 0; },
    customElements: { whenDefined: () => new Promise(() => {}), get: () => null, define() {} },
    MutationObserver: class { observe() {} },
  };
  win.addEventListener = () => {};
  const run = () => new Function(...Object.keys(env), code)(...Object.values(env));
  return { win, run, tick: () => timers.splice(0).forEach((f) => f()) };
}

{
  const { win, run, tick } = setup(false);
  // Casora selbst: ein eigenes Modul (wird wie bisher vorwärts gespiegelt).
  win._casoraLaundry = { own: 'casora' };
  // Eigenes Modul des Nutzers, alter Name.
  const mine = { popup: () => 'beispiel' };
  win._hemmaBeispiel = mine;
  run();

  assert.equal(win._casoraBeispiel, mine, '_casoraBeispiel → _hemmaBeispiel');
  assert.equal(win._casoraBeispiel.popup(), 'beispiel');
  assert.equal(win._hemmaLaundry, win._casoraLaundry, 'alte Richtung: _hemmaLaundry → _casoraLaundry');
  assert.deepEqual(win._casoraLaundry, { own: 'casora' }, 'Casoras Modul nicht überschrieben');

  // Ein später geladenes Modul des Nutzers wird beim nächsten Durchgang erfasst.
  const late = { tile: () => 'spaet' };
  win._hemmaSpaet = late;
  tick();
  assert.equal(win._casoraSpaet, late, 'später geladenes Modul wird nachgezogen');

  // Legt ein Casora-Modul _casoraBeispiel später selbst an: Casoras Fassung gewinnt,
  // das Modul des Nutzers bleibt unter seinem alten Namen unverändert.
  const casoraOwn = { popup: () => 'casora' };
  win._casoraBeispiel = casoraOwn;
  assert.equal(win._casoraBeispiel, casoraOwn, 'Casoras eigene Zuweisung gewinnt');
  assert.equal(win._hemmaBeispiel, mine, 'Modul des Nutzers unverändert');
  tick();
  assert.equal(win._casoraBeispiel, casoraOwn, 'auch nach dem nächsten Durchgang');

  // Ersetzt das Modul des Nutzers sein Objekt, sieht der Zwilling das neue.
  const late2 = { tile: () => 'neu' };
  win._hemmaSpaet = late2;
  assert.equal(win._casoraSpaet, late2);
}

{
  // Hemma noch installiert: nichts spiegeln (Hemmas Module sind eine eigene Welt).
  const { win, run } = setup(true);
  win._hemmaBeispiel = { x: 1 };
  run();
  assert.equal(win._casoraBeispiel, undefined, 'mit Hemma keine Gegenrichtung');
}
console.log('ok kompat_beidseitig');
