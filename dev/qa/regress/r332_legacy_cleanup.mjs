// @zustand: arbeit
// @parallel: allein   (rewrites configuration.yaml/scripts.yaml of the throwaway HA and reloads scripts, automations and Casora; all restored at the end)
// @deckt: custom_components/casora/legacy_cleanup.py custom_components/casora/scripts/casora-legacy-cleanup.js custom_components/casora/helfer.py custom_components/casora/theme.py
// Owner request: the repair notices about Casora's old scripts and theme file should not ask the user to clean
// up - Casora removes its own leftovers once and then only tells. HACS review (hacs/default#12143, point 3): no
// hand-editing of config files, nothing written on every start. Seeds what an update from 26.10.59 leaves
// behind (the four scripts exactly as Casora wrote them into scripts.yaml, dev/unit/legacy_scripts.yaml, plus
// themes/casora-themes.yaml with Casora's marker) and one automation that uses script.casora_restart_toggle.
// The Hemma fixture dashboards of "arbeit" still call all four old scripts; for the test only
// script.casora_thermostat_overlay_toggle stays referenced there (configs restored at the end).
// Then Casora is reloaded and an admin opens a dashboard. Expected: the two unused scripts deleted through HA's
// script config API (gone from the states and from the config API), the one used by the automation and the one
// used by a dashboard kept and named in the repair notice kept_scripts, the theme file gone, one persistent
// notification saying what was removed and what was kept and why, the former repair notices gone. Needs the throwaway HA's config folder on this machine (dev/qa/wegwerf-ha.sh).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, casoraDashboards, dashboard, ready, check, need, finish, atFinish, BASE } from './lib.mjs';
import { ws, tokens } from '../ws.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OLD = fs.readFileSync(path.join(HERE, '../../unit/legacy_scripts.yaml'), 'utf8');
const IDS = ['casora_light_smart_toggle', 'casora_thermostat_overlay_toggle', 'casora_actions_overlay_toggle', 'casora_restart_toggle'];
const USED = 'casora_restart_toggle';          // by the seeded automation
const ON_DASH = 'casora_thermostat_overlay_toggle';  // by a dashboard
const KEPT = [ON_DASH, USED];
const gone = IDS.filter((o) => !KEPT.includes(o));
const MARKER = '# Von der Casora-Integration geschrieben';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Config folder of the test HA on this machine. In Docker HA reports its own path (/config); the container
// carries the host folder as label ha-docker.config (tools/ha-docker.sh), found by the port of BASE.
async function hostConfigDir(c) {
  const dir = (await c.cmd({ type: 'get_config' })).config_dir;
  if (dir && fs.existsSync(path.join(dir, 'configuration.yaml'))) return dir;
  try {
    const { execFileSync } = await import('node:child_process');
    const os = await import('node:os');
    const port = new URL(BASE).port || '80';
    const docker = ['docker', path.join(os.homedir(), '.docker/bin/docker')].find((d) => {
      try { execFileSync(d, ['version', '--format', '{{.Client.Version}}'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
    });
    if (!docker) return dir;
    const id = execFileSync(docker, ['ps', '-q', '--filter', 'publish=' + port, '--filter', 'label=ha-docker.config'], { encoding: 'utf8' }).trim().split('\n')[0];
    if (!id) return dir;
    return execFileSync(docker, ['inspect', '-f', '{{index .Config.Labels "ha-docker.config"}}', id], { encoding: 'utf8' }).trim() || dir;
  } catch (e) { return dir; }
}

const c = await ws();
const CFG = await hostConfigDir(c);
await need('config folder of the test HA on this machine (throwaway HA)', !!CFG && fs.existsSync(path.join(CFG, 'configuration.yaml')), CFG);
const P = (f) => path.join(CFG, f);
const read = (f) => { try { return fs.readFileSync(P(f), 'utf8'); } catch (e) { return null; } };
const put = (f, text) => { if (text === null) fs.rmSync(P(f), { force: true }); else { fs.mkdirSync(path.dirname(P(f)), { recursive: true }); fs.writeFileSync(P(f), text); } };
const api = async (method, p) => {
  const { access_token } = await tokens();
  const r = await fetch(BASE + '/api/' + p, { method, headers: { Authorization: 'Bearer ' + access_token } });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const dismiss = (cx) => cx.cmd({ type: 'call_service', domain: 'persistent_notification', service: 'dismiss',
  service_data: { notification_id: 'casora_legacy_cleanup' } });
const states = async () => Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
const entry = (await c.cmd({ type: 'config_entries/get', domain: 'casora' }))[0];
await need('Casora set up', !!entry);
// The config entry is reloaded over REST (there is no WebSocket command for it).
const reloadCasora = async () => { await api('POST', `config/config_entries/entry/${entry.entry_id}/reload`); await sleep(4000); };

// Everything this test changes, restored at the end
const FILES = ['configuration.yaml', 'scripts.yaml', 'automations.yaml', 'themes/casora-themes.yaml', '.storage/casora.legacy_cleanup',
  ...fs.readdirSync(P('packages')).filter((f) => f.endsWith('.yaml')).map((f) => 'packages/' + f)];
const before = Object.fromEntries(FILES.map((f) => [f, read(f)]));
// Dashboards that call the old scripts (the Hemma fixture): saved as they are, restored at the end
const dashBefore = {};
for (const d of await c.cmd({ type: 'lovelace/dashboards/list' })) {
  if (d.mode !== 'storage') continue;
  const cfg = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }).catch(() => null);
  if (cfg && /script\.casora_/.test(JSON.stringify(cfg))) dashBefore[d.url_path] = cfg;
}
atFinish(async () => {
  for (const f of FILES) put(f, before[f]);
  const c2 = await ws();
  for (const d of ['script', 'automation']) await c2.cmd({ type: 'call_service', domain: d, service: 'reload', service_data: {} }).catch(() => null);
  await c2.cmd({ type: 'call_service', domain: 'frontend', service: 'reload_themes', service_data: {} }).catch(() => null);
  await reloadCasora().catch(() => null);
  for (const [url_path, config] of Object.entries(dashBefore)) await c2.cmd({ type: 'lovelace/config/save', url_path, config }).catch(() => null);
  await dismiss(c2).catch(() => null);
  c2.close();
});

// 1. Seed: the old scripts only in scripts.yaml (an old package copy of them goes for the test), one automation using one
for (const f of FILES.filter((x) => x.startsWith('packages/'))) {
  const t = before[f];
  if (t && /^script:/m.test(t)) put(f, t.replace(/^script:[^\n]*\n(?:(?:[ \t#][^\n]*)?\n)*/m, ''));
}
let conf = before['configuration.yaml'];
if (!/^script:/m.test(conf)) conf += '\nscript: !include scripts.yaml\n';
if (!/^automation:/m.test(conf)) conf += '\nautomation: !include automations.yaml\n';
put('configuration.yaml', conf);
put('scripts.yaml', OLD);
put('automations.yaml', [
  '- id: qa_r332_uses_old_script',
  '  alias: QA r332 uses an old Casora script',
  '  triggers: []',
  '  actions:',
  '    - action: script.turn_on',
  `      target: { entity_id: script.${USED} }`,
  '',
].join('\n'));
let dashUses = false;
for (const [url_path, config] of Object.entries(dashBefore)) {
  let t = JSON.stringify(config);
  for (const o of IDS.filter((x) => x !== ON_DASH)) t = t.split('script.' + o).join('script.qa_r332_' + o.slice(7));
  dashUses = dashUses || t.includes('script.' + ON_DASH);
  await c.cmd({ type: 'lovelace/config/save', url_path, config: JSON.parse(t) });
}
if (!dashUses) {
  // No fixture dashboard: a small one of our own uses the script.
  const url_path = 'qa-r332';
  await c.cmd({ type: 'lovelace/dashboards/create', url_path, title: 'QA r332', mode: 'storage', require_admin: true, show_in_sidebar: false }).catch(() => null);
  await c.cmd({ type: 'lovelace/config/save', url_path, config: { views: [{ cards: [{ type: 'button', entity: 'script.' + ON_DASH }] }] } });
  atFinish(async () => {
    const c2 = await ws();
    const d = (await c2.cmd({ type: 'lovelace/dashboards/list' })).find((x) => x.url_path === url_path);
    if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }).catch(() => null);
    c2.close();
  });
}
put('themes/casora-themes.yaml', MARKER + ' und bei jedem Start aktualisiert – nicht bearbeiten.\nQA r332: {}\n');
for (const d of ['script', 'automation']) await c.cmd({ type: 'call_service', domain: d, service: 'reload', service_data: {} });
await sleep(1500);
let st = await states();
await need('the four old scripts are loaded from scripts.yaml', IDS.every((o) => st['script.' + o] && !st['script.' + o].attributes.restored),
  IDS.filter((o) => !st['script.' + o]));
await need('automation using one of them loaded', Object.values(st).some((s) => s.entity_id.startsWith('automation.') && s.attributes.id === 'qa_r332_uses_old_script'));
// A fresh record (as on the first start after the update)
put('.storage/casora.legacy_cleanup', null);
await reloadCasora();
await check('theme file with Casora marker removed at setup', read('themes/casora-themes.yaml') === null);
await check('scripts.yaml not touched by Python', read('scripts.yaml') === OLD);
st = await states();
await check('old scripts still there until an admin browser runs the cleanup', IDS.every((o) => !!st['script.' + o]));

// 2. An admin opens a dashboard: the browser module runs the cleanup
const dash = (await casoraDashboards()).find((d) => !d.mobile);
const { page } = await open({});
if (dash) await dashboard(page, dash.url + '/0');
else await ready(page, '/casora-studio', () => !!window.casoraTheme);
await page.waitForFunction(() => !!window.casoraLegacyCleanup, null, { timeout: 20000 }).catch(() => {});
await check('cleanup module loaded on the page', await page.evaluate(() => !!window.casoraLegacyCleanup));
for (let i = 0; i < 60; i++) {
  st = await states();
  if (gone.every((o) => !st['script.' + o])) break;
  await sleep(1000);
}
for (const o of gone) {
  await check(`script.${o} removed (state)`, !st['script.' + o]);
  await check(`script.${o} removed (HA script config API)`, (await api('GET', 'config/script/config/' + o)).status === 404);
}
for (const o of KEPT) {
  await check(`script.${o} kept (${o === USED ? 'used by an automation' : 'used by a dashboard'})`,
    !!st['script.' + o] && (await api('GET', 'config/script/config/' + o)).status === 200);
}
const sy = read('scripts.yaml') || '';
await check('scripts.yaml keeps only the used scripts', KEPT.every((o) => sy.includes(o + ':')) && gone.every((o) => !sy.includes(o + ':')));

// 3. Told once, kept script in the repair notice, old notices gone
await sleep(1500);
const notes = await c.cmd({ type: 'persistent_notification/get' });
const note = notes.find((n) => n.notification_id === 'casora_legacy_cleanup');
await check('one notification about the cleanup', !!note, notes.map((n) => n.notification_id));
const text = note ? note.message : '';
await check('notification names 2 removed scripts and the theme file', /\b2 /.test(text) && text.includes('themes/casora-themes.yaml')
  && gone.every((o) => text.includes('script.' + o)), text);
await check('notification names the kept scripts and why', KEPT.every((o) => text.includes('script.' + o))
  && text.includes('automation.qa_r332') && text.includes('`dashboard '), text);
const issues = (await c.cmd({ type: 'repairs/list_issues' })).issues.filter((i) => i.domain === 'casora');
const ids = issues.map((i) => i.issue_id);
await check('repair notice for the kept script', ids.includes('kept_scripts')
  && (issues.find((i) => i.issue_id === 'kept_scripts').translation_placeholders || {}).scripts === KEPT.map((o) => 'script.' + o).join(', '), issues);
await check('former repair notices gone', !ids.includes('leftover_scripts') && !ids.includes('leftover_theme_file'), ids);

// 4. Next load: nothing runs again
const rec = JSON.parse(read('.storage/casora.legacy_cleanup') || '{}').data || {};
await check('cleanup recorded', rec.theme && rec.theme.removed && rec.scripts && (rec.scripts.removed || []).length === gone.length
  && KEPT.every((o) => rec.scripts.kept[o] && rec.scripts.kept[o].reason === 'in_use'), rec);
await dismiss(c);
const recText = read('.storage/casora.legacy_cleanup');
await reloadCasora();
await page.reload();
await sleep(6000);
await check('second load: record unchanged', read('.storage/casora.legacy_cleanup') === recText);
await check('second load: no new notification', !(await c.cmd({ type: 'persistent_notification/get' })).some((n) => n.notification_id === 'casora_legacy_cleanup'));
await check('second load: cleanup module not loaded any more', !(await page.evaluate(() => !!window.casoraLegacyCleanup)));
c.close();
await finish();
