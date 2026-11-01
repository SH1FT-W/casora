// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/share.py custom_components/casora/panel/casora-panel-share.js
// Studio → ⋯ → „Exportieren …“ / „Aus Datei importieren …“ (Wunsch Marco, 01.11.2026).
// Expected: (1) Export with phone layout, settings and photos gives a .casora file. (2) Importing it as a new
// dashboard under a second name shows the preview (rooms, tiles, photos) and creates desktop + phone with the
// same rooms, tiles and entities, links pointing at the new address; the dashboard draws as many tiles as the
// original. (3) A file with a missing entity lists it („Fehlt hier (1)“) with a same-domain suggestion; „Replace“
// asks first – Cancel leaves the dashboard untouched – and after confirming, the state before is under Rewind and
// the suggestion is in the config. (4) A damaged file is refused with a message. Everything created is removed.
// CASORA_SHARE_SHOTS=<dir>: screenshots of the dialogs (desktop + phone) for the review.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { open, studio, casoraDashboard, check, need, finish, usePage, atFinish, ready, BASE } from './lib.mjs';
import { ws } from '../ws.mjs';

const SHOTS = process.env.CASORA_SHARE_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'casora-share-'));
const dash = await casoraDashboard((d) => /^test-neu$/.test(d.url)) || await casoraDashboard();
await need('Casora dashboard with phone layout', dash && dash.phone, dash && dash.url);
const cmd = async (m) => { const c = await ws(); try { return await c.cmd(m); } finally { c.close(); } };
const made = [];
atFinish(async () => {
  const list = await cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) {
    const d = list.find((x) => x.url_path === u);
    if (d) await cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }).catch(() => {});
  }
  fs.rmSync(TMP, { recursive: true, force: true });
});

// Same counting as share.py: button-cards in the views without the room cards; entities as whole values.
const tiles = (cfg) => { let n = 0; const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== 'object') return;
  if (o.type === 'custom:button-card') { const t = [].concat(o.template || [])[0]; if (t !== 'casora_room') n++; return; }
  Object.values(o).forEach(walk); }; walk((cfg || {}).views || []); return n; };
const ents = (cfg) => { const out = new Set(); const walk = (o, k) => {
  if (Array.isArray(o)) return o.forEach((v) => walk(v, k));
  if (o && typeof o === 'object') return Object.entries(o).forEach(([kk, v]) => walk(v, kk));
  if (typeof o === 'string' && /^(light|switch|sensor|binary_sensor|cover|climate|media_player|lock|camera|scene|script|fan|vacuum|person)\.[a-z0-9_]+$/.test(o)
    && !['service', 'action', 'perform_action'].includes(k)) out.add(o); };
  walk((cfg || {}).views || []); return [...out].sort(); };

const o = await open({ width: 1440, height: 1000 });
usePage(o.page);
const pg = o.page;
const H = (fn, a) => pg.evaluate(fn, a);
await studio(pg, dash.url);

const snap = async (name, page = pg) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const openMore = (page = pg) => page.evaluate(() => window.__panel().$('more').click());
const menuItems = (page = pg) => page.evaluate(() => window.__pierce('.combo-menu .combo-opt').map((x) => x.textContent.replace(/\s+/g, ' ').replace(/^✓/, '').trim()));
const pick = (re, page = pg) => page.evaluate((src) => {
  const it = window.__pierce('.combo-menu .combo-opt').find((x) => new RegExp(src).test(x.textContent.replace(/^✓/, "").trim()));
  if (!it) return false;
  it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  return true;
}, re.source);
const flowText = (page = pg) => page.evaluate(() => { const f = window.__pierce('.flowin')[0]; return f ? f.innerText.replace(/\s+/g, ' ') : ''; });
const tapRow = (re, page = pg) => page.evaluate((src) => {
  const r = window.__pierce('.flowin .frow').find((x) => new RegExp(src).test(x.textContent.replace(/^✓/, "").trim()));
  if (r) r.click();
  return !!r;
}, re.source);
const tapFoot = (re, page = pg) => page.evaluate((src) => {
  const b = window.__pierce('button').find((x) => x.offsetParent !== null && new RegExp(src).test(x.textContent.trim()) && x.closest('.ffoot, .flowfoot, .ffooter, [class*=foot]'));
  const any = b || window.__pierce('button').filter((x) => x.offsetParent !== null && new RegExp(src).test(x.textContent.trim())).pop();
  if (any) any.click();
  return !!any;
}, re.source);

// ── (1) Export ───────────────────────────────────────────────────────────────
await openMore();
await pg.waitForTimeout(400);
const items = await menuItems();
await check('menu: „Exportieren …“ and „Aus Datei importieren …“', items.some((x) => /^Exportieren …/.test(x)) && items.some((x) => /Aus Datei importieren …/.test(x)), items);
await pick(/^Exportieren …/);
await pg.waitForFunction(() => /Dashboard exportieren/.test((window.__pierce('.flowin')[0] || {}).innerText || ''), null, { timeout: 10000 }).catch(() => {});
const exp = await flowText();
await check('export sheet: photos, settings, no-secrets note', /Fotos mitnehmen/.test(exp) && /Einstellungen mitnehmen/.test(exp) && /keine Passwörter/.test(exp), exp.slice(0, 300));
await snap('1-export-desktop');
const [download] = await Promise.all([pg.waitForEvent('download', { timeout: 180000 }), tapFoot(/^Exportieren$/)]);
const file = path.join(TMP, download.suggestedFilename());
await download.saveAs(file);
await check('file name casora-<name>-<date>.casora', /^casora-[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.casora$/.test(download.suggestedFilename()), download.suggestedFilename());
const listing = execFileSync('python3', ['-c', 'import sys,zipfile,json;z=zipfile.ZipFile(sys.argv[1]);print(json.dumps({"names":z.namelist(),"m":json.loads(z.read("manifest.json"))}))', file]).toString();
const zip = JSON.parse(listing);
await check('file: dashboard, phone layout, settings, photos', ['dashboard.json', 'mobile.json'].every((n) => zip.names.includes(n))
  && zip.names.some((n) => n.startsWith('photos/')) && zip.m.format === 1, zip.names.slice(0, 8));

// ── (2) Import as a new dashboard ───────────────────────────────────────────
const chooseFile = async (f, page = pg) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), (async () => {
    await openMore(page); await page.waitForTimeout(400); await pick(/Aus Datei importieren/, page); })()]);
  await fc.setFiles(f);
  await page.waitForFunction(() => /Dashboard importieren|nicht importieren/.test((window.__pierce('.flowin')[0] || {}).innerText || ''), null, { timeout: 60000 }).catch(() => {});
};
await chooseFile(file);
const pv = await flowText();
const orig = await cmd({ type: 'lovelace/config', url_path: dash.url });
const origPhone = await cmd({ type: 'lovelace/config', url_path: dash.phone.url });
await check('preview: rooms, tiles, phone, photos', pv.includes(`${zip.m.rooms.length} Räume`) && pv.includes(`${tiles(orig)} Kacheln`)
  && /Handy-Layout mit \d+ Kacheln/.test(pv) && /\d+ Fotos/.test(pv), pv.slice(0, 400));
// The test house itself misses a few entities the dashboard uses: those are the baseline.
const missing0 = Number((pv.match(/Fehlt hier \((\d+)\)/) || [])[1] || 0);
await check('preview: new dashboard is the default', /Als neues Dashboard/.test(pv), pv.slice(0, 600));
await snap('2-import-preview-desktop');
const NAME = 'Export Test ' + Date.now().toString(36);
await H((n) => { const i = window.__pierce('.flowin input.fin')[0]; i.value = n; i.dispatchEvent(new Event('input')); }, NAME);
await tapFoot(/^Importieren$/);
await pg.waitForFunction(() => !window.__panel()._flowMode, null, { timeout: 180000 }).catch(() => {});
const list = await cmd({ type: 'lovelace/dashboards/list' });
const nd = list.find((d) => d.title === NAME);
if (nd) made.push(nd.url_path, nd.url_path + '-mobile');
await need('new dashboard created', !!nd, list.map((d) => d.title));
const nc = await cmd({ type: 'lovelace/config', url_path: nd.url_path });
const np = await cmd({ type: 'lovelace/config', url_path: nd.url_path + '-mobile' }).catch(() => null);
await check('same rooms', JSON.stringify(nc.views.map((v) => v.path)) === JSON.stringify(orig.views.map((v) => v.path)));
await check('same tiles (desktop)', tiles(nc) === tiles(orig), [tiles(nc), tiles(orig)]);
await check('same tiles (phone)', !!np && tiles(np) === tiles(origPhone), [np && tiles(np), tiles(origPhone)]);
await check('same entities', JSON.stringify(ents(nc)) === JSON.stringify(ents(orig)));
const links = JSON.stringify(nc.views);
await check('links point at the new dashboard', !links.includes('"/' + dash.url + '/') && (!JSON.stringify(orig.views).includes('"/' + dash.url + '/') || links.includes('"/' + nd.url_path + '/')));
const vers = await cmd({ type: 'casora/versions/list', url_path: nd.url_path });
await check('Rewind: „Importiert“ entry', (vers.versions || []).some((v) => /imported/.test(v.summary || '')), vers.versions && vers.versions.slice(0, 2));

// Drawn like the original: same number of tiles on the first room page.
const count = async (url) => {
  const p2 = await o.context.newPage();
  await ready(p2, '/' + url + '/' + (orig.views[1] || orig.views[0]).path, () => window.__pierce('button-card').length > 3).catch(() => {});
  await p2.waitForTimeout(2500);
  const n = await p2.evaluate(() => window.__pierce('button-card').filter((b) => b.getBoundingClientRect().width > 0).length);
  await p2.close();
  return n;
};
const [a, b] = [await count(dash.url), await count(nd.url_path)];
await check('imported dashboard draws as many tiles as the original', a > 3 && a === b, [a, b]);

// ── (3) Missing entity, replace with question ───────────────────────────────
const light = ents(orig).find((e) => e.startsWith('light.'));
await need('a light on the dashboard', !!light);
const gone = light + '_9';
const file2 = path.join(TMP, 'missing.casora');
execFileSync('python3', ['-c', `import sys,zipfile,json
src,dst,old,new=sys.argv[1:5]
zi=zipfile.ZipFile(src); zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
for n in zi.namelist():
    d=zi.read(n)
    if n=='dashboard.json':
        d=d.replace(('"'+old+'"').encode(),('"'+new+'"').encode())
        c=json.loads(d); v=c['views'][-1]; v['title']=(v.get('title') or v.get('path'))+' QA'; d=json.dumps(c).encode()
    zo.writestr(n,d)
zo.close()`, file, file2, light, gone]);
await studio(pg, dash.url);
await chooseFile(file2);
const pv2 = await flowText();
await check('missing entity listed with its ID', pv2.includes(`Fehlt hier (${missing0 + 1})`) && pv2.includes(gone), pv2.slice(-500));
await check('same-domain suggestion preselected', await H((g) => {
  const r = window.__pierce('.frow.csh-ent').find((x) => x.textContent.includes(g));
  return !!r && !r.querySelector('.rdetail').classList.contains('warn');
}, gone));
await H(() => { const f = window.__pierce('.frow.csh-ent').pop(); if (f) f.scrollIntoView({ block: 'center' }); });
await pg.waitForTimeout(500);
await snap('3-mapping-desktop');
await tapRow(/^Ein Dashboard ersetzen/);
await pg.waitForTimeout(500);
await H((u) => { const r = window.__pierce('.frow.csh-target').find((x) => x.textContent.includes(u)); if (r) r.click(); }, NAME);
await pg.waitForTimeout(500);
await snap('4-replace-target-desktop');
const before = JSON.stringify(await cmd({ type: 'lovelace/config', url_path: nd.url_path }));
await tapFoot(/^Ersetzen$/);
await pg.waitForFunction(() => window.__pierce('.askcard').length > 0, null, { timeout: 10000 }).catch(() => {});
const ask = await H(() => { const c = window.__pierce('.askcard')[0]; return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
await check('replace asks first and names Rewind', /ersetzen\?/.test(ask) && /Zeitreise/.test(ask), ask);
await snap('5-replace-question-desktop');
await H(() => { const c = window.__pierce('.askcard')[0]; const b = [...c.querySelectorAll('button')].find((x) => /Abbrechen/.test(x.textContent)); b.click(); });
await pg.waitForTimeout(1500);
await check('Cancel: nothing replaced', JSON.stringify(await cmd({ type: 'lovelace/config', url_path: nd.url_path })) === before);
await tapFoot(/^Ersetzen$/);
await pg.waitForFunction(() => window.__pierce('.askcard').length > 0, null, { timeout: 10000 }).catch(() => {});
await H(() => { const c = window.__pierce('.askcard')[0]; const b = [...c.querySelectorAll('button')].find((x) => /Ersetzen/.test(x.textContent)); b.click(); });
await pg.waitForFunction(() => !window.__panel()._flowMode, null, { timeout: 180000 }).catch(() => {});
const after = await cmd({ type: 'lovelace/config', url_path: nd.url_path });
await check('replaced: suggestion written instead of the missing entity', !JSON.stringify(after).includes('"' + gone + '"') && ents(after).includes(light));
const vers2 = await cmd({ type: 'casora/versions/list', url_path: nd.url_path });
const ids0 = (vers.versions || []).map((v) => v.id), ids2 = (vers2.versions || []).map((v) => v.id);
await check('state before kept under Rewind (earlier entry still there, a new one on top)', ids0.length > 0 && ids0.every((x) => ids2.includes(x)) && ids2.length > ids0.length, [ids0, ids2]);
await check('replaced: renamed room arrived', JSON.stringify(after.views.map((v) => v.title)).includes(' QA'));

// ── (4) Damaged file ────────────────────────────────────────────────────────
const bad = path.join(TMP, 'kaputt.casora');
fs.writeFileSync(bad, fs.readFileSync(file).subarray(0, 50000));
await chooseFile(bad);
const pv3 = await flowText();
await check('damaged file refused with a message', /lässt sich nicht importieren/.test(pv3) && /beschädigt/.test(pv3), pv3.slice(0, 200));
await H(() => window.__panel()._exitFlow(false));

// ── Phone: preview and mapping ──────────────────────────────────────────────
if (SHOTS) {
  const m = await open({ width: 393, height: 852, mobile: true });
  const mp = m.page;
  await studio(mp, dash.url);
  await openMore(mp); await mp.waitForTimeout(500);
  await pick(/^Exportieren …/, mp);
  await mp.waitForTimeout(1200);
  await snap('6-export-phone', mp);
  await mp.evaluate(() => window.__panel()._exitFlow(false));
  await chooseFile(file2, mp);
  await mp.waitForTimeout(1200);
  await snap('7-import-preview-phone', mp);
  await mp.evaluate(() => { const f = window.__pierce('.frow.csh-ent')[0]; if (f) f.scrollIntoView({ block: 'center' }); });
  await mp.waitForTimeout(600);
  await snap('8-mapping-phone', mp);
  await mp.evaluate(() => { const f = window.__pierce('.frow.csh-ent')[0]; if (f) f.click(); });
  await mp.waitForTimeout(800);
  await snap('9-mapping-menu-phone', mp);
  // Light mode: the same preview.
  const l = await open({ width: 1440, height: 1000, dark: false });
  await studio(l.page, dash.url);
  await chooseFile(file2, l.page);
  await l.page.evaluate(() => { const f = window.__pierce('.frow.csh-ent').pop(); if (f) f.scrollIntoView({ block: 'center' }); });
  await l.page.waitForTimeout(800);
  await snap('10-mapping-desktop-light', l.page);
}

await finish();
