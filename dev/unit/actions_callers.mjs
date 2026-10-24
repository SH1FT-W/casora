// Callers of the former scripts use Casora's services (actions.py).  node dev/unit/actions_callers.mjs
// HACS review (hacs/default#12143): the scripts in scripts.yaml are gone. No template, dashboard script or
// Studio file may call script.casora_* any more; every casora.* service a caller names is registered and
// described (services.yaml, translations), and the data matches the service's fields.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const cc = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, cc), 'utf8');
const OLD = /script\.casora_(light_smart_toggle|thermostat_overlay_toggle|actions_overlay_toggle|restart_toggle)|'casora_light_smart_toggle'/;

const files = ['panel/casora-templates.json', '../../dashboards/casora/button_card_templates.json', 'scripts/casora-core.js',
  ...fs.readdirSync(new URL('scripts/local/', cc)).filter((f) => f.endsWith('.js')).map((f) => 'scripts/local/' + f),
  ...fs.readdirSync(new URL('panel/', cc)).filter((f) => f.endsWith('.js')).map((f) => 'panel/' + f)];
for (const f of files) assert.ok(!OLD.test(read(f)), f + ' still calls a former Casora script');

const FIELDS = {
  light_smart_toggle: ['light_entity'],
  thermostat_overlay_toggle: ['thermostat_entity_id'],
  actions_overlay_toggle: ['actions_entity_id'],
  restart_toggle: ['button_entity', 'helper_entity', 'done_entity'],
};
const services = read('services.yaml');
const en = JSON.parse(read('translations/en.json')).services;
const py = read('actions.py');
for (const [svc, fields] of Object.entries(FIELDS)) {
  assert.ok(new RegExp('^' + svc + ':', 'm').test(services), 'services.yaml: ' + svc);
  assert.ok(en[svc] && fields.every((f) => en[svc].fields[f]), 'translations: ' + svc);
  for (const f of fields) assert.ok(py.includes('"' + f + '"'), 'actions.py schema: ' + f);
}
for (const l of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const t = JSON.parse(read('translations/' + l + '.json'));
  for (const svc of Object.keys(FIELDS)) assert.ok(t.services[svc] && t.services[svc].name, l + ': ' + svc);
  for (const i of ['leftover_scripts', 'leftover_theme_file']) assert.ok(t.issues[i] && t.issues[i].description, l + ': ' + i);
}

// Templates: every call-service to casora.* carries exactly the service's fields.
const bundle = JSON.parse(read('panel/casora-templates.json')).templates;
const found = {};
(function walk(x, where) {
  if (Array.isArray(x)) return x.forEach((v, i) => walk(v, where + '[' + i + ']'));
  if (x && typeof x === 'object') {
    const s = typeof x.service === 'string' && /^casora\.(\w+)$/.exec(x.service);
    if (s && FIELDS[s[1]]) {
      found[s[1]] = (found[s[1]] || 0) + 1;
      const keys = Object.keys(x.service_data || {});
      assert.deepEqual(keys.filter((k) => !FIELDS[s[1]].includes(k)), [], where + ': unknown data ' + keys);
    }
    return Object.entries(x).forEach(([k, v]) => walk(v, where + '.' + k));
  }
  if (typeof x === 'string') {
    for (const m of x.matchAll(/service: 'casora\.(\w+)', service_data: \{ ([^}]*) \}/g)) {
      found[m[1]] = (found[m[1]] || 0) + 1;
      const keys = m[2].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
      assert.deepEqual(keys.filter((k) => !FIELDS[m[1]].includes(k)), [], where + ': ' + m[0]);
    }
  }
})(bundle, 'templates');
for (const svc of Object.keys(FIELDS)) assert.ok(found[svc], 'a template calls casora.' + svc);

// Dashboard scripts: the inline actions and the light badges call the services the same way.
const core = read('scripts/casora-core.js');
assert.ok(/callService\('casora', 'actions_overlay_toggle', \{ actions_entity_id: key \}\)/.test(core), 'core: actions toggle');
const pop = read('scripts/local/03-popups.js');
assert.equal((pop.match(/callService\('casora', 'light_smart_toggle', \{ light_entity: /g) || []).length, 2, 'popups: light toggle');
assert.ok(/hh?\.services && hh?\.services\.casora && hh?\.services\.casora\.light_smart_toggle/.test(pop), 'popups: checks the service exists');

// Run the inline-actions click in core against a fake hass: one casora service call with the key.
const calls = [];
const at = core.indexOf('if (key) {', core.indexOf("var key = el.getAttribute('data-more-key');"));
assert.ok(at > 0);
const snippet = core.slice(at, core.indexOf('return;', at) + 7) + ' }';
vm.runInNewContext('(function(){ var key = "climate.a"; var card = { _hass: FAKE }; var hass = null; ' + snippet + ' })()',
  { FAKE: { callService: (...a) => calls.push(a) } });
assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['casora', 'actions_overlay_toggle', { actions_entity_id: 'climate.a' }]]);

// The Studio no longer waits for the scripts as setup entities.
const panel = read('panel/casora-panel.js');
const setup = panel.slice(panel.indexOf('const SETUP_ENTITIES = ['), panel.indexOf('];', panel.indexOf('const SETUP_ENTITIES = [')));
assert.ok(!/script\./.test(setup), 'no scripts in SETUP_ENTITIES');
console.log('ok actions_callers');
