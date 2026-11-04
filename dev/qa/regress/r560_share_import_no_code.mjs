// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/share.py custom_components/casora/panel/casora-panel-share.js
// HACS review round 5, point 3: importing a .casora file must not install the other person's JavaScript.
// Expected: (1) A Casora export carries no button_card_templates, no template fingerprint and no [[[ ]]] code
// besides the Studio's own expressions. (2) A hostile file built from it (a foreign template, a modified
// casora_light with a fingerprint that would keep it, [[[ ]]] in a tile name, a variable, a nested custom_fields
// card, kiosk_mode and the settings) shows in the preview „Eigene Vorlagen und Code aus der Datei werden nicht
// übernommen“ with the counts. (3) Imported as a new dashboard: exactly the templates this Casora ships
// (casora_light as shipped, no foreign one), not the file's fingerprint, none of the file's code anywhere, and
// opening the dashboard runs none of it (a page flag the code would set stays unset). Rooms and tiles as in the
// export. Everything created is removed.
// CASORA_SHARE_SHOTS=<dir>: screenshot of the preview.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { open, studio, casoraDashboard, check, need, finish, usePage, atFinish, ready, BASE } from './lib.mjs';
import { ws, tokens } from '../ws.mjs';

const SHOTS = process.env.CASORA_SHARE_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'casora-share-code-'));
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

const codes = (o) => { const out = []; const walk = (x) => {
  if (Array.isArray(x)) return x.forEach(walk);
  if (x && typeof x === 'object') {
    Object.keys(x).forEach((k) => { if (/\[\[\[|\]\]\]/.test(k)) out.push(k); });
    return Object.values(x).forEach(walk);
  }
  if (typeof x === 'string' && /\[\[\[|\]\]\]/.test(x)) out.push(x); };
  walk(o); return out; };
// The two expressions the Studio writes itself (share.py casora_code).
const own = (s) => /^\[\[\[ const ids = window\.casoraNavScenes/.test(s) || /^\[\[\[ const b = states\['input_boolean\.casora_motion_badges'\];/.test(s);
const tiles = (cfg) => { let n = 0; const walk = (o) => {
  if (Array.isArray(o)) return o.forEach(walk);
  if (!o || typeof o !== 'object') return;
  if (o.type === 'custom:button-card') { const t = [].concat(o.template || [])[0]; if (t !== 'casora_room') n++; return; }
  Object.values(o).forEach(walk); }; walk((cfg || {}).views || []); return n; };
const py = (src, ...args) => execFileSync('python3', ['-c', src, ...args]).toString();
const readZip = (f, n) => JSON.parse(py('import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]).decode())', f, n));

// ── (1) Export ───────────────────────────────────────────────────────────────
const { access_token } = await tokens();
const res = await fetch(`${BASE}/api/casora/share/export?url_path=${dash.url}&mobile_url=${dash.phone.url}&settings=1&photos=0`,
  { headers: { Authorization: 'Bearer ' + access_token } });
await need('export answers', res.ok, res.status);
const file = path.join(TMP, 'export.casora');
fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
const expCfg = readZip(file, 'dashboard.json');
await check('export: no templates and no fingerprint in the file',
  !('button_card_templates' in expCfg) && !('casora_template_fingerprint' in expCfg), Object.keys(expCfg));
await check('export: no code besides the Studio\'s own expressions', codes(expCfg).every(own) && codes(readZip(file, 'mobile.json')).every(own),
  codes(expCfg).filter((s) => !own(s)).slice(0, 3));

// ── (2) A hostile file built from it ────────────────────────────────────────
const bundle = (await (await fetch(BASE + '/casora_panel/casora-templates.json')).json()).templates;
fs.writeFileSync(path.join(TMP, 'bundle.json'), JSON.stringify(bundle));
const hostile = path.join(TMP, 'hostile.casora');
py(`import sys,zipfile,json
src,dst,ship=sys.argv[1:4]
light=json.load(open(ship))["casora_light"]
EVIL="[[[ window.__casoraPwned = (window.__casoraPwned || 0) + 1; return 'pwned' ]]]"
zi=zipfile.ZipFile(src); zo=zipfile.ZipFile(dst,'w',zipfile.ZIP_DEFLATED)
for n in zi.namelist():
    d=zi.read(n)
    if n in ('dashboard.json','mobile.json'):
        c=json.loads(d)
        c['button_card_templates']={'casora_light':dict(light,name=EVIL),'qa_evil':{'name':EVIL}}
        c['casora_template_fingerprint']={'casora_light':'fake'}
        c['kiosk_mode']=dict(c.get('kiosk_mode') or {}, hide_header=EVIL)
        c['views'][-1].setdefault('cards',[]).append({'type':'custom:button-card','template':'casora_light',
            'entity':'light.qa_none','name':EVIL,'variables':{'qa':EVIL},
            'custom_fields':{'f':{'card':{'type':'custom:button-card','name':EVIL}}}})
        d=json.dumps(c).encode()
    if n=='settings.json':
        s=json.loads(d)
        for k,v in s.items():
            if isinstance(v,dict): v['qa']=EVIL
        d=json.dumps(s).encode()
    zo.writestr(n,d)
zo.close()`, file, hostile, path.join(TMP, 'bundle.json'));

const o = await open({ width: 1440, height: 1000 });
usePage(o.page);
const pg = o.page;
await studio(pg, dash.url);
const flowText = () => pg.evaluate(() => { const f = window.__pierce('.flowin')[0]; return f ? f.innerText.replace(/\s+/g, ' ') : ''; });
const pick = (re) => pg.evaluate((src) => {
  const it = window.__pierce('.combo-menu .combo-opt').find((x) => new RegExp(src).test(x.textContent.replace(/^✓/, '').trim()));
  if (it) it.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  return !!it;
}, re.source);
const [fc] = await Promise.all([pg.waitForEvent('filechooser', { timeout: 15000 }), (async () => {
  await pg.evaluate(() => window.__panel().$('more').click()); await pg.waitForTimeout(400); await pick(/Aus Datei importieren/); })()]);
await fc.setFiles(hostile);
await pg.waitForFunction(() => /Dashboard importieren|nicht importieren/.test((window.__pierce('.flowin')[0] || {}).innerText || ''), null, { timeout: 60000 }).catch(() => {});
const pv = await flowText();
const m = pv.match(/werden nicht übernommen: (\d+) eigene Vorlagen, (\d+) Einträge mit Code/);
await check('preview: „Kein Code aus der Datei“ – „Eigene Vorlagen und Code aus der Datei werden nicht übernommen“',
  /Kein Code aus der Datei/.test(pv) && /Eigene Vorlagen und Code aus der Datei werden nicht übernommen/.test(pv), pv.slice(0, 500));
// qa_evil is the one own template; code: name, variable, nested card, kiosk_mode, settings – desktop and phone.
await check('preview: counts', !!m && Number(m[1]) === 1 && Number(m[2]) >= 8, m && m.slice(1));
if (SHOTS) {
  await pg.evaluate(() => { const r = window.__pierce('[data-k="share-left-out"]')[0]; if (r) r.scrollIntoView({ block: 'center' }); });
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: path.join(SHOTS, 'r560-preview.png') });
}

// ── (3) Import as a new dashboard ───────────────────────────────────────────
const NAME = 'Code Test ' + Date.now().toString(36);
await pg.evaluate((n) => { const i = window.__pierce('.flowin input.fin')[0]; i.value = n; i.dispatchEvent(new Event('input')); }, NAME);
await pg.evaluate(() => {
  const b = window.__pierce('button').filter((x) => x.offsetParent !== null && /^Importieren$/.test(x.textContent.trim())).pop();
  if (b) b.click();
});
await pg.waitForFunction(() => !window.__panel()._flowMode, null, { timeout: 180000 }).catch(() => {});
const list = await cmd({ type: 'lovelace/dashboards/list' });
const nd = list.find((d) => d.title === NAME);
if (nd) made.push(nd.url_path, nd.url_path + '-mobile');
await need('new dashboard created', !!nd, list.map((d) => d.title));
const nc = await cmd({ type: 'lovelace/config', url_path: nd.url_path });
const np = await cmd({ type: 'lovelace/config', url_path: nd.url_path + '-mobile' });
for (const [label, c] of [['desktop', nc], ['phone', np]]) {
  const tpl = c.button_card_templates || {};
  await check(`${label}: only templates Casora ships (no qa_evil)`, !('qa_evil' in tpl) && Object.keys(tpl).every((k) => k in bundle)
    && Object.keys(tpl).length === Object.keys(bundle).length, Object.keys(tpl).filter((k) => !(k in bundle)));
  await check(`${label}: casora_light as shipped`, JSON.stringify(tpl.casora_light) === JSON.stringify(bundle.casora_light));
  await check(`${label}: fingerprint not the file's`, (c.casora_template_fingerprint || {}).casora_light
    && c.casora_template_fingerprint.casora_light !== 'fake');
  const { button_card_templates: _t, ...rest } = c;
  await check(`${label}: none of the file's code`, !JSON.stringify(c).includes('__casoraPwned') && codes(rest).every(own),
    codes(rest).filter((s) => !own(s)).slice(0, 3));
}
const settings = (await cmd({ type: 'casora/settings/get' })).settings || {};
await check('settings: none of the file\'s code', !JSON.stringify(settings).includes('__casoraPwned'));
await check('rooms and tiles as in the export', JSON.stringify(nc.views.map((v) => v.path)) === JSON.stringify(expCfg.views.map((v) => v.path))
  && tiles(nc) === tiles(expCfg) + 1, [tiles(nc), tiles(expCfg)]);

// Opening the imported dashboard runs none of the file's code.
const p2 = await o.context.newPage();
await ready(p2, '/' + nd.url_path + '/' + nc.views[nc.views.length - 1].path, () => window.__pierce('button-card').length > 1).catch(() => {});
await p2.waitForTimeout(2500);
const pwned = await p2.evaluate(() => window.__casoraPwned || 0);
const drawn = await p2.evaluate(() => window.__pierce('button-card').length);
await check('dashboard drawn, the file\'s code never ran', drawn > 1 && !pwned, { drawn, pwned });
await p2.close();

await finish();
