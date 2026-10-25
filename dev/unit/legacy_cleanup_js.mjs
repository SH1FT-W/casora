// One-time removal of the former Casora scripts from an admin's browser (scripts/casora-legacy-cleanup.js),
// with a fake hass.  node dev/unit/legacy_cleanup_js.mjs
// Owner request: Casora removes its own leftovers instead of asking the user. HACS review (hacs/default#12143, point 3):
// no hand-editing of scripts.yaml - the browser uses HA's script config API (as the script editor does).
// Expected: asks the integration first, checks every script for users (search/related, automation and script
// configs, dashboards), lets the integration compare the configs, DELETEs only unused scripts Casora wrote
// unchanged, and reports what it removed and kept. Non-admins and "nothing pending" do nothing.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-legacy-cleanup.js', import.meta.url), 'utf8');
const plain = (x) => JSON.parse(JSON.stringify(x));

function load() {
  const ctx = { document: { querySelector: () => null }, setTimeout: () => 0, console, JSON, Object, Array, String, Promise, encodeURIComponent };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.casoraLegacyCleanup;
}

const ALL = ['casora_light_smart_toggle', 'casora_thermostat_overlay_toggle', 'casora_actions_overlay_toggle', 'casora_restart_toggle'];

function fakeHass({ admin = true, pending = ALL, related = {}, automations = {}, scripts = {}, dashboards = {}, yaml = {}, match = null, deleteFails = [] } = {}) {
  const log = [];
  const states = {};
  for (const id of Object.keys(automations)) states[id] = { state: 'on' };
  for (const id of Object.keys(scripts)) states[id] = { state: 'off' };
  for (const o of pending) states['script.' + o] = { state: 'off' };
  const hass = {
    user: { is_admin: admin },
    states,
    connection: {
      async sendMessagePromise(m) {
        log.push(plain(m));
        switch (m.type) {
          case 'casora/legacy/scripts': return { pending };
          case 'search/related': return related[m.item_id] || {};
          case 'automation/config': return { config: automations[m.entity_id] };
          case 'script/config': return { config: scripts[m.entity_id] };
          case 'lovelace/dashboards/list': return Object.keys(dashboards).filter((u) => u !== '').map((u) => ({ url_path: u, mode: 'storage' }));
          case 'lovelace/config': {
            const k = m.url_path || '';
            if (!(k in dashboards)) throw { code: 'config_not_found' };
            return dashboards[k];
          }
          case 'casora/legacy/match': return { match: match || Object.keys(m.configs) };
          case 'casora/legacy/report': return { ok: true };
          default: throw new Error('unexpected ' + m.type);
        }
      },
    },
    async callApi(method, path) {
      log.push({ api: method, path });
      const o = decodeURIComponent(path.split('/').pop());
      if (method === 'GET') {
        if (!(o in yaml)) throw { status_code: 404, body: { message: 'Resource not found' } };
        return yaml[o];
      }
      if (method === 'DELETE') {
        if (deleteFails.includes(o)) throw { status_code: 500 };
        return { result: 'ok' };
      }
      throw new Error('unexpected ' + method);
    },
  };
  return { hass, log };
}

const yamlAll = Object.fromEntries(ALL.map((o) => [o, { alias: o, sequence: [] }]));
const deletes = (log) => log.filter((x) => x.api === 'DELETE').map((x) => x.path);
const report = (log) => log.find((x) => x.type === 'casora/legacy/report');

// 1. Non-admin: nothing at all
{
  const api = load();
  const { hass, log } = fakeHass({ admin: false });
  assert.equal(await api.run(hass), null);
  assert.equal(log.length, 0, 'non-admin sends nothing');
}

// 2. Nothing pending: only the question
{
  const api = load();
  const { hass, log } = fakeHass({ pending: [] });
  assert.equal(await api.run(hass), null);
  assert.deepEqual(log.map((x) => x.type), ['casora/legacy/scripts']);
}

// 3. All unused and unchanged: all four deleted through the config API, reported
{
  const api = load();
  const { hass, log } = fakeHass({ yaml: yamlAll, dashboards: { '': { views: [] } } });
  const r = plain(await api.run(hass));
  assert.deepEqual(r, { removed: ALL, kept: {} });
  assert.deepEqual(deletes(log), ALL.map((o) => 'config/script/config/' + o));
  const rel = log.filter((x) => x.type === 'search/related');
  assert.deepEqual(rel.map((x) => x.item_id), ALL.map((o) => 'script.' + o));
  assert.ok(rel.every((x) => x.item_type === 'entity'), 'search/related asks who uses the script entity');
  const firstDelete = log.findIndex((x) => x.api === 'DELETE');
  assert.ok(log.findIndex((x) => x.type === 'casora/legacy/match') < firstDelete, 'compared before any delete');
  assert.ok(log.findIndex((x) => x.type === 'search/related') < firstDelete, 'usage checked before any delete');
  assert.deepEqual(report(log), { type: 'casora/legacy/report', removed: ALL, kept: {} });
}

// 4. Used / edited / elsewhere / delete failing: only the unused, matching one is deleted
{
  const api = load();
  const yaml = { ...yamlAll };
  delete yaml.casora_actions_overlay_toggle;  // e.g. in a package
  const { hass, log } = fakeHass({
    yaml,
    related: { 'script.casora_restart_toggle': { automation: ['automation.restart_button'], label: ['x'] } },
    automations: { 'automation.morning': { actions: [{ action: 'script.casora_light_smart_toggle_2' }] } },
    scripts: { 'script.mine': { sequence: [{ action: 'script.casora_light_smart_toggle', data: {} }] } },
    dashboards: { '': { views: [] }, 'my-dash': { views: [{ cards: [{ tap_action: { perform_action: 'script.casora_thermostat_overlay_toggle' } }] }] } },
    match: [],
  });
  const r = plain(await api.run(hass));
  assert.deepEqual(r.removed, [], 'nothing deleted');
  assert.deepEqual(deletes(log), []);
  assert.deepEqual(r.kept, {
    casora_restart_toggle: { reason: 'in_use', by: ['automation.restart_button'] },
    casora_light_smart_toggle: { reason: 'in_use', by: ['script.mine'] },
    casora_thermostat_overlay_toggle: { reason: 'in_use', by: ['dashboard my-dash'] },
    casora_actions_overlay_toggle: { reason: 'not_in_scripts_yaml' },
  });
  // A script id that only shares the beginning (…_toggle_2) is no use of the old one.
  assert.ok(!r.kept.casora_light_smart_toggle.by.includes('automation.morning'));
  assert.ok(!log.some((x) => x.type === 'casora/legacy/match'), 'nothing to compare: no match call');
}

// 5. Mixed: an edited script stays, a failing DELETE is reported as failed
{
  const api = load();
  const { hass, log } = fakeHass({
    yaml: yamlAll,
    match: ['casora_light_smart_toggle', 'casora_restart_toggle', 'casora_actions_overlay_toggle'],
    deleteFails: ['casora_actions_overlay_toggle'],
  });
  const r = plain(await api.run(hass));
  assert.deepEqual(r.removed, ['casora_light_smart_toggle', 'casora_restart_toggle']);
  assert.deepEqual(r.kept, { casora_thermostat_overlay_toggle: { reason: 'edited' }, casora_actions_overlay_toggle: { reason: 'failed' } });
  assert.ok(!deletes(log).includes('config/script/config/casora_thermostat_overlay_toggle'), 'edited script never deleted');
  const m = log.find((x) => x.type === 'casora/legacy/match');
  assert.deepEqual(Object.keys(m.configs), ALL, 'all four configs sent for comparison');
}

// 6. search/related failing counts as "in use" (never delete on doubt)
{
  const api = load();
  const { hass, log } = fakeHass({ yaml: yamlAll, pending: ['casora_restart_toggle'] });
  const orig = hass.connection.sendMessagePromise;
  hass.connection.sendMessagePromise = async (m) => { if (m.type === 'search/related') { log.push(plain(m)); throw new Error('x'); } return orig(m); };
  const r = plain(await api.run(hass));
  assert.deepEqual(r, { removed: [], kept: { casora_restart_toggle: { reason: 'in_use', by: ['?'] } } });
  assert.deepEqual(deletes(log), []);
}

console.log('legacy_cleanup_js: OK');
