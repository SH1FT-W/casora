// Prüfrunde d03-09 (part): the section „Verlauf“ shows 24 h (richtlinien §7.2, owner 06.11.2026), but the air purifier
// and fan popups drew „Feinstaub PM2,5 · 48 Std.“ in blue (air quality is teal, §7.3) and the weather popup
// „Außentemperatur · 48 Std.“. Expected: 24 h, PM2.5 in the teal chart step (c3).
//   node dev/unit/verlauf_24h_feinstaub_wetter.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_air_purifier,casora_fan,casora_weather
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const calls = (name) => {
  const s = JSON.stringify(T[name]);
  return [...s.matchAll(/_hpChartCfg\(([^;]*?)\);/g)].map((m) => m[1]);
};
for (const name of ['casora_air_purifier', 'casora_fan']) {
  const pm = calls(name).filter((c) => /Feinstaub PM2,5/.test(c));
  assert.ok(pm.length, name + ': PM2.5 chart found');
  for (const c of pm) {
    assert.match(c, /'24h'/, name + ': 24 h — ' + c);
    assert.match(c, /'c3'/, name + ': teal — ' + c);
  }
}
const wx = Object.keys(T).filter((k) => JSON.stringify(T[k]).includes("'Außentemperatur'") && JSON.stringify(T[k]).includes('_wxG'));
assert.ok(wx.length, 'weather popup found');
for (const k of wx) assert.ok(!calls(k).some((c) => /'48h'/.test(c)), k + ': no 48 h section chart');
console.log('verlauf_24h_feinstaub_wetter: ok');
