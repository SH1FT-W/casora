// Holt Anmelde-Tokens fürs Docker-Test-HA (casora-test) über den normalen Login-Ablauf.
// Zugang aus der Umgebung (CASORA_USER/CASORA_PASS) oder aus ~/casora-haus/ZUGANG.txt –
// nichts davon liegt im Repo. Ausgabe: JSON wie /auth/token (für CASORA_TOKENS).
//   node dev/qa/token.mjs > tok.json
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.CASORA_URL || 'http://localhost:8124';

function zugang() {
  let user = process.env.CASORA_USER, pass = process.env.CASORA_PASS;
  const f = path.join(os.homedir(), 'casora-haus', 'ZUGANG.txt');
  if ((!user || !pass) && fs.existsSync(f)) {
    const t = fs.readFileSync(f, 'utf8');
    user = user || (t.match(/^Benutzer:\s*(\S+)/m) || [])[1];
    pass = pass || (t.match(/^Passwort:\s*(\S+)/m) || [])[1];
  }
  if (!user || !pass) throw new Error('kein Zugang: CASORA_USER/CASORA_PASS setzen oder ~/casora-haus/ZUGANG.txt anlegen');
  return { user, pass };
}

export async function login() {
  const { user, pass } = zugang();
  const client_id = BASE + '/';
  const j = async (r) => { const b = await r.json(); if (!r.ok) throw new Error(JSON.stringify(b)); return b; };
  const flow = await j(await fetch(BASE + '/auth/login_flow', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, handler: ['homeassistant', null], redirect_uri: client_id }),
  }));
  const step = await j(await fetch(BASE + '/auth/login_flow/' + flow.flow_id, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id, username: user, password: pass }),
  }));
  if (step.type !== 'create_entry') throw new Error('Login fehlgeschlagen: ' + (step.errors ? JSON.stringify(step.errors) : step.type));
  return j(await fetch(BASE + '/auth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: step.result, client_id }),
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.stdout.write(JSON.stringify(await login()) + '\n');
}
