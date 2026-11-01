// Owner, 01.11.2026: the bell shows weather warnings only from the source picked in the dashboard's weather warning
// tile (it listed every warning sensor while the tile said „Keine Warnungen“ for its own); without a tile, all as before.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const a = src.indexOf('  function pickedWarnings() {');
const b = src.indexOf('  // Active as a warning source:', a);
assert.ok(a > 0 && b > a, 'pickedWarnings/isWarning in 01-basis.js');
let LC = null;
const window = { _casoraLovelaceCfg: () => LC,
  casoraWarnings: { isLevelSensor: (st, id) => /^sensor\..*warning_level$/.test(id), isAdvance: (st, id) => /advance/.test(id) } };
const cfg = () => ({ warn_prefix: 'binary_sensor.warnung_' });
const isWarning = new Function('window', 'cfg', src.slice(a, b) + '\nreturn isWarning;')(window, cfg);
const ids = ['binary_sensor.warnung_nina', 'sensor.dwd_current_warning_level', 'sensor.dwd_advance_warning_level', 'binary_sensor.other'];
const on = (cards) => { LC = { views: [{ cards }] }; return ids.filter((id) => isWarning(id, {})); };

LC = null;
assert.deepEqual(ids.filter((id) => isWarning(id, {})), ['binary_sensor.warnung_nina', 'sensor.dwd_current_warning_level'], 'no dashboard known: all sources');
assert.deepEqual(on([{ type: 'custom:button-card', template: 'casora_light', entity: 'light.x' }]),
  ['binary_sensor.warnung_nina', 'sensor.dwd_current_warning_level'], 'no warning tile: all sources');
assert.deepEqual(on([{ type: 'grid', cards: [{ type: 'custom:button-card', template: 'casora_weather_warning', entity: 'binary_sensor.warnung_nina' }] }]),
  ['binary_sensor.warnung_nina'], 'tile with NINA: only NINA (nested in a grid)');
assert.deepEqual(on([{ type: 'custom:button-card', template: ['casora_popup_weather_warning'], entity: 'binary_sensor.warnung_nina',
  variables: { sensors: ['sensor.dwd_current_warning_level'] } }]), ['binary_sensor.warnung_nina', 'sensor.dwd_current_warning_level'], 'tile with two sources');
assert.deepEqual(on([{ type: 'custom:button-card', template: 'casora_weather_warning', entity: 'sensor.dwd_current_warning_level' }]),
  ['sensor.dwd_current_warning_level'], 'tile with DWD: only DWD');
// A source the tile does not show still leaves the generic safety row (it came back as „Sicherheitswarnung“).
assert.ok(src.includes("return !(r.entity && isWarnSource(r.entity, S[r.entity]) && String(r.id || '').indexOf('casora:safety:') === 0);"), 'safety rows: every warning source');
console.log('bell_warning_source: ok');
