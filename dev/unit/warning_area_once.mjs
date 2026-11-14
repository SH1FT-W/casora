// V15 (optimisation round 14.11.2026, owner's go): the weather warning popup named the warning area twice, in the
// status line and as the fact „Gebiet“ in the middle of the wheel. Expected: the area only in the head; the wheel keeps
// the sentence and „Bis …“ (and the count with several warnings). Popup evaluated with stand-ins.
//   node dev/unit/warning_area_once.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_popup_weather_warning
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const src = tpl.casora_popup_weather_warning.tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');

const run = (warnings) => {
  let stage = null, line = null;
  const any = () => '';
  const UI = new Proxy({ v3: () => true, soft: () => true, esc: (s) => String(s), tokens: {},
    stage: (kind, o) => { stage = o; return 'STAGE'; }, line: (a, b) => { line = [a].concat(b || []); return 'LINE'; } },
  { get: (o, k) => (k in o ? o[k] : any) });
  const W = { list: () => warnings, active: () => warnings.length > 0, region: () => 'Landkreis Musterberg' };
  const window = { _casoraUI: UI, casoraWarnings: W, casoraLocale: () => 'de-DE' };
  const states = { 'binary_sensor.nina_warning_musterberg_1': { state: warnings.length ? 'on' : 'off', attributes: {}, last_changed: new Date().toISOString() } };
  new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(window, states, {}, { sensors: Object.keys(states) }, null, {});
  return { stage, line };
};

const end = new Date(Date.now() + 3600e3).toISOString();
const warn = (level) => ({ headline: 'Amtliche WARNUNG vor GEWITTER', description: 'D', level, severity: 'Moderate', end, updated: new Date().toISOString() });
for (const [name, list] of [['one warning', [warn(2)]], ['two warnings', [warn(3), Object.assign(warn(2), { headline: 'B' })]], ['none', []]]) {
  const r = run(list);
  assert.ok(r.stage, name + ': stage drawn');
  assert.ok(r.line && r.line[0] === 'Landkreis Musterberg', name + ': area in the status line, got ' + JSON.stringify(r.line));
  const facts = (r.stage.facts || []).filter(Boolean);
  assert.ok(!facts.some((f) => f.label === 'Gebiet' || f.value === 'Landkreis Musterberg'), name + ': area not again in the wheel ' + JSON.stringify(facts));
  if (list.length) assert.ok(facts.some((f) => f.label === 'Bis'), name + ': „Bis …“ stays');
  if (list.length > 1) assert.ok(facts.some((f) => f.label === 'Warnungen'), name + ': the count stays');
}
console.log('warning_area_once: ok');
