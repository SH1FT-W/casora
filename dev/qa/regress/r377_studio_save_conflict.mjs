// @zustand: arbeit
// @parallel: allein
// T02 (26.10.70): with the Studio open in two windows, saving in the second one silently put its older
// rooms back over what the first one had just saved (the conflict only went to the internal log).
// Expected: saving notices that the dashboard changed elsewhere since it was loaded and asks
// ("changed in another window": Cancel / Reload / Save anyway); Cancel keeps the other window's change,
// Reload shows it (the edits here are dropped), Save anyway writes this window. Saving twice in one window
// never asks. Two separate browsers; the dashboard is written back at the end.
import { open, studio, casoraDashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);
const URLS = [dash.url, dash.phone && dash.phone.url].filter(Boolean);
const saved0 = {};
{ const c = await ws(); for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u }); c.close(); }
atFinish(async () => { const c = await ws();
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] }); c.close(); });
const live = async () => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: dash.url }); } finally { c.close(); } };
const titles = (cfg) => (cfg.views || []).map((v) => v.title);

const A = (await open({ width: 1500, height: 950, dark: false })).page;
const B = (await open({ width: 1500, height: 950, dark: false })).page;
usePage(B);
await studio(A, dash.url);
await studio(B, dash.url);

// Rename room #i (the view title follows the room name) without saving yet.
const rename = (pg, i, name) => pg.evaluate(({ i, name }) => { const p = window.__panel(); const r = p._state.compact.rooms[i];
  r.name = name; if (r.title !== undefined) r.title = name; p._markDirty(); return p._isDirty(); }, { i, name });
// Start a save and leave it running (it may wait for the question).
const startSave = (pg) => pg.evaluate(() => { window.__qaSave = window.__panel()._save().then((ok) => (window.__qaSaved = ok)); window.__qaSaved = undefined; });
const settled = (pg) => pg.waitForFunction(() => window.__qaSaved !== undefined, null, { timeout: 30000 }).then(() => pg.evaluate(() => window.__qaSaved)).catch(() => 'timeout');
const question = (pg) => pg.waitForFunction(() => { const c = window.__panel().shadowRoot.querySelector('.askcard'); return c && c.isConnected; }, null, { timeout: 15000 })
  .then(() => pg.evaluate(() => { const c = window.__panel().shadowRoot.querySelector('.askcard');
    return { title: c.querySelector('h3').textContent, text: (c.querySelector('p') || {}).textContent || '', buttons: [...c.querySelectorAll('.askacts button')].map((b) => b.textContent) }; }))
  .catch(() => null);
const press = (pg, re) => pg.evaluate((src) => { const c = window.__panel().shadowRoot.querySelector('.askcard');
  const b = c && [...c.querySelectorAll('.askacts button')].find((x) => new RegExp(src).test(x.textContent)); if (b) b.click(); return !!b; }, re);
const roomName = (pg, i) => pg.evaluate((i) => window.__panel()._state.compact.rooms[i].name, i);

// 0) One window saving twice never asks.
await rename(A, 0, 'QA T02 first');
await startSave(A);
await check('window A: first save goes through without a question', (await settled(A)) === true);
await rename(A, 0, 'QA T02 A');
await startSave(A);
await check('window A: second save goes through without a question', (await settled(A)) === true);
await check('HA has A\'s name', titles(await live()).includes('QA T02 A'), titles(await live()));

// 1) Window B (loaded before A saved) changes another room and saves → question, Cancel keeps A's change.
await rename(B, 1, 'QA T02 B');
await startSave(B);
const q = await question(B);
await check('window B: saving asks', !!q, q);
await check('question: "changed in another window" with Reload and Save anyway',
  q && /anderen Fenster|another window/.test(q.title) && q.buttons.some((t) => /Neu laden|Reload/.test(t)) && q.buttons.some((t) => /Trotzdem speichern|Save anyway/.test(t)), q);
await press(B, '^(Abbrechen|Cancel)$');
await check('Cancel: not saved', (await settled(B)) === false);
let cfg = await live();
await check('Cancel: A\'s change is still in HA, B\'s is not', titles(cfg).includes('QA T02 A') && !titles(cfg).includes('QA T02 B'), titles(cfg));

// 2) Reload: B now shows A's change, B's own edit is gone and nothing is unsaved.
await startSave(B);
await question(B);
await press(B, '^(Neu laden|Reload)$');
await settled(B);
await B.waitForFunction(() => { const p = window.__panel(); return p._state && !p._saving; }, null, { timeout: 30000 }).catch(() => {});
await B.waitForTimeout(1500);
await check('Reload: B shows A\'s room name', (await roomName(B, 0)) === 'QA T02 A', await roomName(B, 0));
await check('Reload: B\'s own edit dropped, nothing unsaved', (await roomName(B, 1)) !== 'QA T02 B' && !(await B.evaluate(() => window.__panel()._isDirty())));

// 3) After A saves again, Save anyway in B writes B.
await rename(A, 0, 'QA T02 A2');
await startSave(A);
await settled(A);
await rename(B, 1, 'QA T02 B2');
await startSave(B);
await check('B asks again after A saved again', !!(await question(B)));
await press(B, '^(Trotzdem speichern|Save anyway)$');
await check('Save anyway: saved', (await settled(B)) === true);
cfg = await live();
await check('Save anyway: B\'s change is in HA', titles(cfg).includes('QA T02 B2'), titles(cfg));
// And from now on B is in step with HA: saving again does not ask.
await rename(B, 1, 'QA T02 B3');
await startSave(B);
await check('B saving again: no question', (await settled(B)) === true);

await finish();
