// Test round 26.11.2026 (d01-03): in the light Casora design the phone's scene pill was the tiles' see-through sand
// without a shadow and blurred into a light room photo. Decision: a denser background in light, clearly off the photo.
// The off pill takes --casora-scene-off-bg / -rim (Casora light: a darker, nearly opaque sand and the tiles' rest
// shadow; the colour designs get it recoloured by tools/build-color-themes.py); dark and Glas keep their look.
//   node dev/unit/scene_pill_light.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_scene_core,casora_scene_row custom_components/casora/theme_weich.yaml custom_components/casora/theme_glas.yaml
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const core = JSON.stringify(T.casora_scene_core);
assert.ok(core.includes("offBg: 'var(--casora-scene-off-bg, var(--casora-entity-background, rgba(0,0,0,0.40)))'"), 'off pill: theme token first');
assert.ok(core.includes("rim: 'var(--casora-scene-off-rim, var(--casora-tile-glass-rim,"), 'pill shadow: theme token first');

// The mode blocks of a theme file: light / dark token maps (two-space YAML, values as written).
const modes = (file) => {
  const out = { base: {}, light: {}, dark: {} };
  let cur = 'base';
  for (const line of read(file).split('\n')) {
    const m = /^ {4}(light|dark):\s*$/.exec(line);
    if (m) { cur = m[1]; continue; }
    const kv = /^ {2,6}([a-z0-9-]+):\s*(.+?)\s*(#.*)?$/.exec(line);
    if (kv && !/^ {4}(light|dark):/.test(line)) out[cur][kv[1]] = kv[2];
  }
  return out;
};
const W = modes('custom_components/casora/theme_weich.yaml');
assert.ok(W.light['casora-scene-off-bg'], 'light: own pill colour');
assert.match(W.light['casora-scene-off-rim'], /var\(--casora-shadow-rest\)/, 'light: the tiles\' rest shadow');
assert.equal(W.dark['casora-scene-off-bg'], undefined, 'dark: unchanged');
assert.equal(W.base['casora-scene-off-bg'], undefined, 'not for every mode');

// Denser in numbers: more opaque and darker than the tiles' sand, in Casora and in the colour designs.
const rgba = (s) => s.match(/[\d.]+/g).map(Number);
for (const f of ['weich', 'salbei', 'nebel', 'farbe', 'daemmerung']) {
  const M = f === 'weich' ? W : modes('custom_components/casora/theme_' + f + '.yaml');
  const tile = rgba(M.light['casora-entity-background'] || W.light['casora-entity-background']);
  const pill = rgba(M.light['casora-scene-off-bg']);
  assert.ok(pill[3] >= tile[3] + 0.1, f + ': more opaque (' + pill[3] + ')');
  assert.ok(pill.slice(0, 3).every((c, i) => c < tile[i] - 5), f + ': darker (' + pill.slice(0, 3).join(',') + ')');
}

// Glas keeps its glass pill.
const G = modes('custom_components/casora/theme_glas.yaml');
assert.equal(G.light['casora-scene-off-bg'], 'var(--casora-entity-background)');
assert.equal(G.light['casora-scene-off-rim'], 'var(--casora-tile-glass-rim)');
console.log('scene_pill_light: ok');
