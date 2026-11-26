// Test round 26.11.2026: the popup and the hold menu read a device the same way.
//  u05-03: an air purifier at 67 % (its level 2 sets 67 %) – the popup marked level 3 (pct <= 66 ? 2 : 3).
//  u05-08: the popup says „1 2 3“, the hold menu „33 % 66 % 100 %“ (and 66 % against the device's 67 %); the purifier's
//          popup title was „Luftreiniger“, not the tile's name.
//  u05-07: a light at 5524 K – the light popup marks „Kalt“ (nearest preset 2700/4000/6000), the hold menu nothing
//          (only ±150 K around its own values, Neutral at 4400 K).
//   node dev/unit/stufen_lichtfarbe_gleich.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraFanLevel,CASORA_FAN_LEVELS custom_components/casora/scripts/local/22-halten.js#H.model custom_components/casora/scripts/local/03-popups.js#ctPresets,ctNearest,lampTones dashboards/casora/button_card_templates.json#casora_air_purifier,casora_fan
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {}, documentElement: {} };
globalThis.addEventListener = () => {};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.casoraLocale = () => 'de-DE';

const basis = read('custom_components/casora/scripts/local/01-basis.js');
const f0 = basis.indexOf('window.CASORA_FAN_LEVELS');
new Function(basis.slice(f0, basis.indexOf('window.casoraPopupTitle = function', f0)))();
const pop = read('custom_components/casora/scripts/local/03-popups.js');
const a = pop.lastIndexOf('(function () {', pop.indexOf('if (window._casoraLightSoft) return;'));
new Function(pop.slice(a, pop.indexOf('\n})();', a) + 6))();
new Function(read('custom_components/casora/scripts/local/22-halten.js'))();
const H = window._casoraHold;
const st = (id, state, attributes) => ({ entity_id: id, state, attributes: attributes || {} });

// u05-03: the level a percentage stands at, in both popups' templates.
assert.deepEqual([null, 10, 33, 34, 66, 67, 68, 100].map(window.casoraFanLevel), [null, 1, 1, 2, 2, 2, 3, 3]);
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
for (const k of ['casora_air_purifier', 'casora_fan']) {
  const c = T[k].tap_action.casora_popup.content;
  const line = c.slice(c.indexOf('const level'), c.indexOf(';', c.indexOf('const level')) + 1);
  assert.equal(new Function('pct', line + ' return level;')(67), 2, k + ': 67 % is level 2');
  assert.match(c, /\[\[1, 33\], \[2, 67\], \[3, 100\]\]/, k + ': the popup sets 33/67/100');
}

// u05-08: the hold menu's levels as in the popup, the one the device stands at marked.
{
  const m = H.model(st('fan.example_purifier', 'on', { supported_features: 1, percentage: 67 }), {});
  const q = m.quick.find((x) => x.label === 'Stufe');
  assert.deepEqual(q.items.map((x) => x.t), ['1', '2', '3']);
  assert.deepEqual(q.items.map((x) => x.data.percentage), [33, 67, 100]);
  assert.deepEqual(q.items.map((x) => !!x.on), [false, true, false]);
}
// u05-08: the purifier popup's title is the tile's name, else the device's name.
{
  const title = T.casora_air_purifier.tap_action.casora_popup.title.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
  const run = (card, entity) => new Function('entity', title).call(card, entity);
  assert.equal(run({ _config: { name: 'Luftreiniger Büro' } }, null), 'Luftreiniger Büro');
  assert.equal(run({ _config: {} }, { attributes: { friendly_name: 'Core 200S' } }), 'Core 200S');
  assert.equal(run({ _config: {} }, null), 'Luftreiniger');
}

// u05-07: the light's tone – the popup and the hold menu mark the same preset.
{
  const lamp = (k) => st('light.example_kitchen', 'on', { supported_color_modes: ['color_temp'], color_mode: 'color_temp', brightness: 200,
    color_temp_kelvin: k, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 });
  const S = window._casoraLightSoft;
  for (const [k, want] of [[5524, 2], [2700, 0], [4100, 1], [4400, 1], [6000, 2]]) {
    const l = lamp(k);
    const states = { [l.entity_id]: l };
    const pr = S.ctPresets([l.entity_id], states);
    assert.equal(S.lampTones([l.entity_id], states, pr)[0].kind, 'ct' + want, 'popup at ' + k + ' K');
    const q = H.model(l, {}).quick.find((x) => x.label === 'Lichtfarbe');
    assert.deepEqual(q.items.map((x) => x.t), ['Warm', 'Neutral', 'Kalt']);
    assert.deepEqual(q.items.map((x) => x.data.color_temp_kelvin), [2700, 4000, 6000], 'the popup\'s presets');
    assert.deepEqual(q.items.map((x) => !!x.on), [0, 1, 2].map((i) => i === want), 'hold menu at ' + k + ' K');
  }
}
console.log('ok popup and hold menu: same levels, same light tone');
