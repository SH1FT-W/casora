// Update detail page: „Nicht geprüft“ must not be a dead end – the action row offers „Jetzt prüfen“ (KI-Check),
// „Neu prüfen“ after a check, nothing while the check runs (owner report 01.11.2026, an update without a button).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/17-update-detail.js', import.meta.url), 'utf8');
const calls = [];
const win = {
  _casoraUI: { line: () => '', group: () => '', label: (t) => '<div>' + t + '</div>' },
  _casoraHH: { pillCss: '' },
  casoraSvc: (script, data) => { calls.push([script, data]); return { domain: 'script', service: script, data }; },
  _casoraMiHooks: [],
};
const ctx = { window: win, document: { addEventListener() {}, querySelectorAll: () => [] }, console, setTimeout, clearTimeout };
ctx.self = ctx.window;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const D = win._casoraUpdDetail;
assert.ok(D && D.sec, 'detail page loaded');

const id = 'update.flode_update';
const base = (ai) => ({
  [id]: { state: 'on', attributes: { installed_version: '26.10.17', latest_version: '26.10.18', supported_features: 1 + 16, title: 'FLODE' } },
  ...(ai ? { 'sensor.casora_update_ki_analyse': ai } : {}),
});
const act = (states) => D.sec('act', id, states, { states, entities: {}, devices: {}, areas: {} }, null);

// Without the KI sensor: no KI button.
assert.ok(!/prüfen/.test(act(base(null))), 'no KI-Check without the analysis sensor');
// Not checked yet: „Jetzt prüfen“ calls the KI script for this update.
let h = act(base({ state: 'ok', attributes: { items: {} } }));
assert.ok(/Jetzt prüfen/.test(h), 'not checked → „Jetzt prüfen“: ' + h.slice(0, 300));
assert.ok(h.includes('casora_update_ki_pruefen') && h.includes(id), 'button calls the KI script for this update');
console.log('ok update_detail_ki_button');
