// Sparkline on an active tile (issue 134): dark themes paint the spark light, but an active tile is light,
// so the line vanished. The active state of casora_entity hands the spark the tile's state ink instead.
//   node dev/unit/spark_active_tile.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_entity, custom_components/casora/scripts/casora-chart.js#color
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tpl = JSON.parse(src('dashboards/casora/button_card_templates.json'));

// The chart's spark colour reads --casora-chart-spark (so a tile can override it).
assert.ok(/c === 'spark'\) return 'var\(--casora-chart-spark,/.test(src('custom_components/casora/scripts/casora-chart.js')),
  'spark colour comes from --casora-chart-spark');

// Active state of the base tile (the one with active_override).
const active = tpl.casora_entity.state.find((s) => s.operator === 'template' && String(s.value).includes('active_override'));
assert.ok(active, 'active state of casora_entity');
const card = Object.assign({}, ...active.styles.card);
const spark = card['--casora-chart-spark'];
assert.ok(spark, 'active tile sets --casora-chart-spark');
const stateInk = Object.assign({}, ...active.styles.state).color;
assert.ok(spark.includes(stateInk), 'spark follows the state line of the active tile: ' + spark);
assert.ok(/^var\(--casora-chart-spark-active, /.test(spark), 'themes can still set their own active spark');

// Every tile with a sparkline sits on casora_entity, so it gets the active colour too.
const withSpark = Object.entries(tpl).filter(([, v]) => v.custom_fields && v.custom_fields.spark);
assert.ok(withSpark.length >= 4, 'tiles with a sparkline found');
for (const [name, v] of withSpark) assert.ok((v.template || []).includes('casora_entity'), name + ' builds on casora_entity');

console.log('spark_active_tile: ok');
