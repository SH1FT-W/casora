// dev/qa/bereit.mjs --recorder waits until the test house's history is written and the recorder keeps up (r303, r320).
//   node dev/unit/bereit_recorder.mjs
// A throwaway HA started from a saved state compiles its missed statistics first and records no state for 2-4
// minutes; bereit.mjs said "ready" right away and r303 read an empty history ("Änderungen 0"). A stand-in HA
// (login, WebSocket, states, history) whose history shows each probe state only after a delay:
// - with --recorder bereit waits for it, removes the probe state and says how long it took,
// - a probe that came back late (it waited behind a queue) is not enough: the next one has to come back quickly
//   (the test house's import queued after the statistics catch-up kept the recorder busy for another 2 minutes),
// - the test house's demo history (casora_mock/history) has to be written first: a probe can come back quickly in the
//   gap before the test house's import starts (r320 "Keine Daten" right after "ready"); without that command: skipped,
// - a history that never catches up only warns (exit 0, the HA is usable otherwise),
// - without --recorder nothing changes (no probe state, no wait).
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { timeScale } from '../qa/bereit_scale.mjs';

const BEREIT = fileURLToPath(new URL('../qa/bereit.mjs', import.meta.url));
let fails = 0;
// The child runs bereit.mjs at this time scale; the stand-in HA's delays are scaled the same way (S).
const SCALE = 0.01;
const S = (ms) => ms * SCALE;
const check = (name, ok, info) => { console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); if (!ok) fails++; };

// The time scale helper bereit.mjs uses (no real-time run): 1 by default, the factor when set, 1 for values
// that would turn the waits into nonsense.
{
  check('time scale is 1 without CASORA_BEREIT_SCALE', timeScale({}) === 1);
  check('time scale reads CASORA_BEREIT_SCALE', timeScale({ CASORA_BEREIT_SCALE: String(SCALE) }) === SCALE);
  const bad = ['0', '-1', 'abc', '', 'Infinity'];
  check('time scale: 0, negative, not a number, infinite fall back to 1', bad.every((v) => timeScale({ CASORA_BEREIT_SCALE: v }) === 1), bad);
}

// Minimal WebSocket server frames (text only; client frames are masked).
const frame = (s) => {
  const b = Buffer.from(s);
  const head = b.length < 126 ? Buffer.from([0x81, b.length]) : Buffer.from([0x81, 126, b.length >> 8, b.length & 255]);
  return Buffer.concat([head, b]);
};
function readFrames(buf) {
  const out = [];
  let i = 0;
  while (buf.length - i >= 2) {
    let len = buf[i + 1] & 127, off = i + 2;
    if (len === 126) { if (buf.length - i < 4) break; len = buf.readUInt16BE(i + 2); off = i + 4; }
    if (buf.length < off + 4 + len) break;
    const mask = buf.subarray(off, off + 4), data = Buffer.alloc(len);
    for (let k = 0; k < len; k++) data[k] = buf[off + 4 + k] ^ mask[k & 3];
    if ((buf[i] & 15) === 1) out.push(data.toString());
    i = off + 4 + len;
  }
  return { out, rest: buf.subarray(i) };
}

// Stand-in HA. recordAfter: ms after a probe state's POST until the history has it (Infinity: never); a list gives
// one delay per probe (the last one for all further).
// mockDoneAfter: ms after the first casora_mock/history request until it says "done" (undefined: no such command).
function fakeHA(recordAfter, mockDoneAfter) {
  const delays = [].concat(recordAfter);
  const log = { posted: null, deleted: false, deletedAt: null, historyCalls: 0, probes: [], mockAsked: null, mockDoneAt: null };
  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const srv = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname === '/auth/login_flow') return json(res, 200, { flow_id: 'f1' });
      if (u.pathname === '/auth/login_flow/f1') return json(res, 200, { type: 'create_entry', result: 'code' });
      if (u.pathname === '/auth/token') return json(res, 200, { access_token: 'tok', refresh_token: 'r', expires_in: 1800 });
      if (u.pathname.startsWith('/api/states/')) {
        if (req.method === 'POST') {
          log.posted = Date.now(); log.id = u.pathname.slice(12);
          log.probes.push({ state: JSON.parse(body).state, at: Date.now(), after: delays[Math.min(log.probes.length, delays.length - 1)] });
          return json(res, 200, {});
        }
        if (req.method === 'DELETE') { log.deleted = true; log.deletedAt = Date.now(); return json(res, 200, {}); }
      }
      if (u.pathname.startsWith('/api/history/period/')) {
        log.historyCalls++;
        const rows = u.searchParams.get('filter_entity_id') !== log.id ? []
          : log.probes.filter((p) => Date.now() - p.at >= p.after).map((p) => ({ state: p.state, last_changed: new Date(p.at).toISOString() }));
        return json(res, 200, rows.length ? [rows] : []);
      }
      json(res, 404, {});
    });
  });
  srv.on('upgrade', (req, sock) => {
    const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    sock.write(frame(JSON.stringify({ type: 'auth_required' })));
    let buf = Buffer.alloc(0);
    sock.on('data', (d) => {
      const r = readFrames(Buffer.concat([buf, d]));
      buf = r.rest;
      r.out.forEach((t) => {
        const m = JSON.parse(t);
        if (m.type === 'auth') return sock.write(frame(JSON.stringify({ type: 'auth_ok' })));
        if (m.type === 'casora_mock/history') {
          if (mockDoneAfter === undefined) {
            return sock.write(frame(JSON.stringify({ id: m.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command.' } })));
          }
          log.mockAsked = log.mockAsked || Date.now();
          const done = Date.now() - log.mockAsked >= mockDoneAfter;
          if (done && !log.mockDoneAt) log.mockDoneAt = Date.now();
          return sock.write(frame(JSON.stringify({ id: m.id, type: 'result', success: true, result: { state: done ? 'done' : 'pending' } })));
        }
        const result = m.type === 'get_config' ? { state: 'RUNNING' } : null;
        sock.write(frame(JSON.stringify({ id: m.id, type: 'result', success: true, result })));
      });
    });
    sock.on('error', () => {});
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, log, url: 'http://127.0.0.1:' + srv.address().port })));
}

function bereit(url, args) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [BEREIT, '--max', '2000', '--quiet', '1', ...args],
      { env: { ...process.env, CASORA_URL: url, CASORA_USER: 'qa', CASORA_PASS: 'qa', CASORA_BEREIT_SCALE: String(SCALE) } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out: out.trim(), ms: Date.now() - t0 }));
  });
}

// 1. The recorder catches up 4 s after the probe state: bereit waits for it.
{
  const h = await fakeHA(S(4000));
  const r = await bereit(h.url, ['--recorder', '300']);
  check('--recorder: ready (exit 0)', r.code === 0, r);
  check('--recorder: a probe state went in', !!h.log.posted, h.log);
  // The child removes the probe state only after the history has it: the stand-in's own clock, no Node start-up.
  check('--recorder: waits until the history has the probe state', h.log.probes.length > 0
    && h.log.deletedAt - h.log.probes[0].at >= S(4000) && /Recorder: hält mit nach/.test(r.out), r);
  check('--recorder: the probe state is removed again', h.log.deleted, h.log);
  h.srv.close();
}
// 2. The first probe comes back after 12 s (behind a queue), the second one at once: bereit waits for the second.
{
  const h = await fakeHA([S(12000), S(1000)]);
  const r = await bereit(h.url, ['--recorder', '300']);
  check('slow probe, then a fast one: two probes, waits for the fast one', r.code === 0 && h.log.probes.length === 2
    && h.log.deletedAt - h.log.probes[0].at >= S(13000) && /Recorder: hält mit .*2 Proben/.test(r.out), { r, probes: h.log.probes.length });
  check('slow probe, then a fast one: the probe state is removed', h.log.deleted, h.log.deleted);
  h.srv.close();
}
// 3. The test house writes its demo history for 5 s; probes would come back at once: bereit waits for the test house
//    first, the probe goes in only after it.
{
  const h = await fakeHA(S(500), S(5000));
  const r = await bereit(h.url, ['--recorder', '300']);
  check('test house pending: waits until its history is written', r.code === 0 && h.log.deletedAt - h.log.mockAsked >= S(5000)
    && /Testhaus-Verlauf done/.test(r.out) && /Recorder: hält mit/.test(r.out), r);
  check('test house pending: the probe goes in only after it', h.log.mockDoneAt && h.log.probes.length
    && h.log.probes[0].at >= h.log.mockDoneAt, { probes: h.log.probes, doneAt: h.log.mockDoneAt });
  h.srv.close();
}
// 4. The history never has it: a warning after the budget, still ready.
{
  const h = await fakeHA(Infinity);
  const r = await bereit(h.url, ['--recorder', '3']);
  check('--recorder never caught up: exit 0 with a warning', r.code === 0 && /Recorder: WARNUNG/.test(r.out), r);
  check('--recorder never caught up: the probe state is removed', h.log.deleted, h.log);
  h.srv.close();
}
// 5. Without --recorder: no probe state, no history request.
{
  const h = await fakeHA(S(4000), 0);
  const r = await bereit(h.url, []);
  check('without --recorder: ready, no probe state, no history request', r.code === 0 && !h.log.posted && h.log.historyCalls === 0
    && !/Recorder/.test(r.out) && h.log.mockAsked === null, { r, log: h.log });
  h.srv.close();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL OK');
process.exit(fails ? 1 : 0);
