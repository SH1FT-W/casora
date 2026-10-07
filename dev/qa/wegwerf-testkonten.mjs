// Test-Vorbereitung für ein Wegwerf-Test-HA (dev/qa/wegwerf-ha.sh, Zustand „arbeit“): legt an, was
// Nutzertests brauchen und die Zustände nicht haben (Nutzertest 4: T4 und T3 waren nicht prüfbar).
//   - Benutzer „Kind“ (kein Admin) – Anmeldung kind / kind-nur-test, nur für lokale Wegwerf-HAs
//   - Lüften-Coach: Handy-Empfänger (erster notify.mobile_app_*-Dienst), falls noch keiner gewählt ist
// Läuft nur gegen localhost und nie gegen 8123/8124 (echtes HA, casora-test). Mehrfach aufrufbar.
//   CASORA_URL=http://localhost:<port> node dev/qa/wegwerf-testkonten.mjs
import { ws } from './ws.mjs';

const BASE = process.env.CASORA_URL || '';
const m = /^http:\/\/(localhost|127\.0\.0\.1):(\d+)\/?$/.exec(BASE);
if (!m || m[2] === '8123' || m[2] === '8124') {
  console.error('wegwerf-testkonten: nur für Wegwerf-HAs auf localhost (nicht 8123/8124) – CASORA_URL=' + BASE);
  process.exit(2);
}
export const KIND = { name: 'Kind', username: 'kind', password: 'kind-nur-test' };

const c = await ws();
try {
  const users = await c.cmd({ type: 'config/auth/list' });
  if (users.some((u) => u.name === KIND.name)) console.log('Benutzer „Kind“ gibt es schon');
  else {
    const { user } = await c.cmd({ type: 'config/auth/create', name: KIND.name, group_ids: ['system-users'], local_only: true });
    await c.cmd({ type: 'config/auth_provider/homeassistant/create', user_id: user.id, username: KIND.username, password: KIND.password });
    console.log('Benutzer „Kind“ angelegt (kein Admin, Anmeldung ' + KIND.username + ')');
  }
  const svc = await c.cmd({ type: 'get_services' });
  const phone = Object.keys(svc.notify || {}).filter((s) => s.startsWith('mobile_app_')).sort()[0];
  let p = null;
  try { p = await c.cmd({ type: 'casora/options/get' }); } catch (e) { console.log('Casora-Optionen nicht lesbar: ' + e.message); }
  const O = (p && p.options) || null;
  if (!phone || !O) console.log('Lüften-Coach: kein Handy-Dienst oder keine Optionen – nichts gesetzt');
  else if ((O.lueften_push || []).length) console.log('Lüften-Coach: Empfänger schon gewählt');
  else {
    await c.cmd({ type: 'casora/options/set', options: { ...O, lueften_push: ['notify.' + phone] } });
    console.log('Lüften-Coach: Empfänger notify.' + phone + ' gewählt');
  }
} finally { c.close(); }
