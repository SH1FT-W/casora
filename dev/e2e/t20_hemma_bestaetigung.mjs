// „Hemma entfernen“ → Neustart → Bestätigung beim ersten Öffnen des Studios (casora/hemma/verify).
// Startet das Test-HA bis zu dreimal neu – nur gegen ein Wegwerf-HA laufen lassen.
//
//   CASORA_URL=http://localhost:8150 CASORA_TOKENS=… [CASORA_CONFIG_DIR=<config des Test-HA>] node dev/e2e/t20_hemma_bestaetigung.mjs
//
// Mit CASORA_CONFIG_DIR legt der Test nach dem Entfernen einen Rest an (custom_components/hemma)
// und prüft erst „Hemma ist fast entfernt“ → „Rest entfernen“, nach dem nächsten Neustart den Erfolg.
// Ohne: nur der Erfolg. Jeweils: im selben HA-Lauf noch nichts, danach nur einmal.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { open, ready, BASE, OUT } from './harness.mjs';
import { ws, tokens } from '../qa/ws.mjs';

const CFG = process.env.CASORA_CONFIG_DIR || '';
const fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? ' – ' + extra : '')); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cmd(msg) { const c = await ws(); try { return await c.cmd(msg); } finally { c.close(); } }

async function restart() {
  const { access_token } = await tokens();
  await fetch(BASE + '/api/services/homeassistant/restart', { method: 'POST', headers: { Authorization: 'Bearer ' + access_token } }).catch(() => {});
  await sleep(10000);
  const r = spawnSync('node', [new URL('../qa/bereit.mjs', import.meta.url).pathname, '--max', '180'], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error('HA nach dem Neustart nicht bereit');
}

// Studio öffnen und auf das Bestätigungsfenster warten (oder feststellen, dass keins kommt).
async function studio(name, expect) {
  const { browser, page, errors } = await open({ width: 1440, height: 900 });
  await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && Array.isArray(p._dashList); });
  const sel = () => { const p = window.__panel(); const c = p && p.shadowRoot.querySelector('.askcard.chv'); if (!c) return null;
    return { title: c.querySelector('h3').textContent, text: [...c.querySelectorAll('p')].map((x) => x.textContent.replace(/​/g, '')).join(' '),
      items: [...c.querySelectorAll('.chr-item b')].map((b) => b.textContent), ok: !!c.querySelector('.chv-mark.ok'),
      buttons: [...c.querySelectorAll('.askacts button')].map((b) => b.textContent) }; };
  let got = null;
  try { await page.waitForFunction(sel, null, { timeout: expect ? 20000 : 6000 }); got = await page.evaluate(sel); } catch (e) { /* keins */ }
  if (got) await page.screenshot({ path: path.join(OUT, `t20_${name}.png`) });
  return { browser, page, errors, got };
}

const click = (page, which) => page.evaluate((which) => {
  const b = window.__panel().shadowRoot.querySelector('.askpane .askacts button' + (which === 'ok' ? ':not(.ghost)' : '.ghost'));
  b.click();
}, which);

// 1) Entfernen (ohne Dashboards, Dateien bleiben) → im selben Lauf nichts.
const r = await cmd({ type: 'casora/hemma/remove', remove_dashboards: [], keep_files: true });
check('Entfernen meldet Neustart', r.restart_required, r.backup);
const v0 = await cmd({ type: 'casora/hemma/verify' });
check('vor dem Neustart nicht fällig', v0.due === false && v0.restart_pending === true);

if (CFG) {
  const dir = path.join(CFG, 'custom_components/hemma');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ domain: 'hemma', name: 'Hemma', version: '0.0.0' }));
  await restart();
  const s = await studio('rest', true);
  check('Rest: Fenster „fast entfernt“', s.got && !s.got.ok && /fast entfernt/.test(s.got.title), s.got && s.got.title);
  check('Rest: Ordner genannt', s.got && s.got.items.some((x) => /custom_components\/hemma/.test(x)), s.got && s.got.items.join(' | '));
  check('Rest: Knöpfe', s.got && s.got.buttons.join('|') === 'Später|Rest entfernen', s.got && s.got.buttons.join('|'));
  await click(s.page, 'ok');
  await s.page.waitForFunction(() => { const c = window.__panel().shadowRoot.querySelector('.askcard:not(.chv) h3'); return c && /Hemma/.test(c.textContent); }, null, { timeout: 30000 });
  const res = await s.page.evaluate(() => window.__panel().shadowRoot.querySelector('.askcard h3').textContent);
  await s.page.screenshot({ path: path.join(OUT, 't20_rest_entfernt.png') });
  check('Rest entfernen: Ergebnis mit Neustart-Angebot', /Hemma/.test(res), res);
  check('Rest entfernen: Ordner weg', !fs.existsSync(dir));
  await click(s.page, 'cancel');
  await s.browser.close();
}

await restart();
const s = await studio('erfolg', true);
check('Erfolg: Fenster „vollständig entfernt“', s.got && s.got.ok && /vollständig entfernt/.test(s.got.title), s.got && s.got.title);
check('Erfolg: Sicherung genannt', s.got && /casora_sicherungen\/hemma_entfernt_/.test(s.got.text), s.got && s.got.text);
check('Erfolg: nur „Fertig“', s.got && s.got.buttons.join('|') === 'Fertig', s.got && s.got.buttons.join('|'));
await click(s.page, 'ok');
await s.browser.close();
const again = await studio('nochmal', false);
check('nur einmal: zweites Öffnen ohne Fenster', !again.got);
check('keine Browser-Fehler', !again.errors.filter((e) => !/addEventListener|404/.test(e)).length, again.errors.join(' | '));
await again.browser.close();

console.log('\n' + (fails.length ? `${fails.length} FEHLER: ${fails.join(', ')}` : 'ALLES OK'));
process.exit(fails.length ? 1 : 0);
