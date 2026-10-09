// „Jetzt nach Updates suchen“ im Updates-Popup (09.10.2026, 03-popups.js): Admin fragt Supervisor
// (nur mit hassio), HACS (nur wenn geladen, je installiertes Repo) und danach update_entity für alle
// update.*; Nicht-Admins nur update_entity. Fehler einzelner Quellen werden geschluckt.
//   node dev/unit/updates_suchen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraUpdCheck) return;'));
const b = src.indexOf('\n})();', a) + 6;
assert.ok(a > 0 && b > a, 'Baustein gefunden');

const store = {};
let haHass = null;
globalThis.window = { addEventListener: () => {} };
globalThis.document = { querySelector: () => (haHass ? { hass: haHass } : null) };
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
new Function('window', 'document', 'localStorage', src.slice(a, b))(window, document, localStorage);
const K = window._casoraUpdCheck;
assert.ok(K && K.run && K.plan && K.html, 'window._casoraUpdCheck fehlt');
K.SETTLE = 0;

const upd = (on) => ({ state: on ? 'on' : 'off', attributes: {} });
const mk = (o = {}) => {
  const log = [];
  const states = { 'update.alpha': upd(false), 'update.beta': upd(true), 'sensor.x': { state: '1', attributes: {} } };
  const h = {
    states,
    user: { is_admin: o.admin !== false },
    config: { components: o.components || ['hassio', 'hacs', 'update'] },
    callWS: async (m) => {
      log.push(['ws', m]);
      if (o.wsFail && o.wsFail(m)) throw new Error('nein');
      if (m.type === 'hacs/repositories/list') return [{ id: 11, installed: true }, { id: 12, installed: false }, { id: '13', installed: true }];
      return {};
    },
    callService: async (d, s, data, target, notify) => {
      log.push(['svc', d, s, data.entity_id, notify]);
      if (o.svcFail && o.svcFail(data.entity_id)) throw new Error('kaputt');
      // Nach der Suche taucht ein neues Update auf.
      states['update.alpha'] = upd(true);
      return [];
    },
  };
  return { h, log };
};

// Plan je Benutzer und Installation.
{
  const { h } = mk();
  assert.deepEqual(K.plan(h), { admin: true, supervisor: true, hacs: true, entities: ['update.alpha', 'update.beta'] });
  assert.deepEqual(K.plan(mk({ admin: false }).h), { admin: false, supervisor: false, hacs: false, entities: ['update.alpha', 'update.beta'] });
  const core = K.plan(mk({ components: ['update'] }).h);
  assert.equal(core.supervisor, false, 'ohne hassio kein Supervisor');
  assert.equal(core.hacs, false, 'ohne HACS kein HACS');
}

// Admin: alle drei Quellen, update_entity zuletzt, ohne HA-Fehlerhinweis; Ergebnis „1 neues“.
{
  const { h, log } = mk();
  haHass = h;
  const p = K.run(h);
  assert.equal(K.busy, true, 'während der Suche busy');
  assert.ok(/Suche …/.test(K.html(true)) && /aria-busy="true"/.test(K.html(true)), 'Knopf zeigt „Suche …“');
  const r = await p;
  const ws = log.filter((x) => x[0] === 'ws').map((x) => x[1]);
  assert.deepEqual(ws.find((m) => m.type === 'supervisor/api'), { type: 'supervisor/api', endpoint: '/refresh_updates', method: 'post', timeout: null });
  assert.deepEqual(ws.filter((m) => m.type === 'hacs/repository/refresh').map((m) => m.repository).sort(), ['11', '13'], 'nur installierte HACS-Repos');
  const svc = log.filter((x) => x[0] === 'svc');
  assert.equal(svc.length, 1, 'ein Aufruf für alle');
  assert.deepEqual(svc[0], ['svc', 'homeassistant', 'update_entity', ['update.alpha', 'update.beta'], false]);
  assert.equal(log[log.length - 1][0], 'svc', 'update_entity nach Supervisor/HACS');
  assert.equal(r.found, 1);
  assert.equal(K.busy, false);
  const html = K.html(true);
  assert.ok(/Jetzt nach Updates suchen/.test(html), 'Beschriftung');
  assert.ok(/Zuletzt gesucht: gerade eben/.test(html), 'Zuletzt gesucht');
  assert.ok(/1 neues Update gefunden/.test(html), 'Ergebnis');
  assert.ok(JSON.parse(store['casora.updCheck']).t > 0, 'Zeitpunkt gemerkt');
}

// Nicht-Admin: nur update_entity, kein Supervisor-/HACS-Befehl.
{
  const { h, log } = mk({ admin: false });
  haHass = h;
  await K.run(h);
  assert.equal(log.filter((x) => x[0] === 'ws').length, 0, 'keine Admin-Befehle');
  assert.equal(log.filter((x) => x[0] === 'svc').length, 1);
}

// Fehler schlucken: Supervisor und HACS werfen, Sammelaufruf wirft → einzeln, kein Abbruch.
{
  const { h, log } = mk({ wsFail: () => true, svcFail: (ids) => Array.isArray(ids) || ids === 'update.beta' });
  haHass = h;
  const r = await K.run(h);
  assert.equal(r.supervisor, false); assert.equal(r.hacs, false); assert.equal(r.entities, true, 'einzeln teils geklappt');
  assert.deepEqual(log.filter((x) => x[0] === 'svc').map((x) => x[3]), [['update.alpha', 'update.beta'], 'update.alpha', 'update.beta']);
  assert.equal(K.err, false);
  assert.ok(!/fehlgeschlagen/.test(K.html(true)));
}

// Alles scheitert: „Suche fehlgeschlagen“, nichts wirft.
{
  const { h } = mk({ wsFail: () => true, svcFail: () => true });
  haHass = h;
  await K.run(h);
  assert.equal(K.err, true);
  assert.ok(/Suche fehlgeschlagen/.test(K.html(false)));
}

// Doppelt tippen startet keine zweite Suche.
{
  const { h, log } = mk({ components: ['update'] });
  haHass = h;
  const p1 = K.run(h), p2 = K.run(h);
  assert.equal(await p2, null);
  await p1;
  assert.equal(log.filter((x) => x[0] === 'svc').length, 1);
}
console.log('ok updates_suchen');
