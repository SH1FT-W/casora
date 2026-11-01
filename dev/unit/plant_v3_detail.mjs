// Detail round 01.11.2026 (#25, #30): the plant popup – units with a space („21 °C“, „55 %“; only the bare degree
// without), the dial's centre says the reading, not the chart's span („7 Tage“), the list does not repeat the stage's
// reading and names it with the stage's word („Bodenfeuchte“).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const s = JSON.stringify(T.casora_popup_plant);
assert.ok(s.includes("unit === '\\\\u00b0' ? unit"), 'space before every unit but the bare degree');
assert.ok(!s.includes("(unit === '%' || unit.charAt(0) === '\\\\u00b0') ? unit"), 'no unit glued to the number');
assert.ok(s.includes('trend: m[0],') && !s.includes("trend: m[0] + ' · ' + (_SPAN"), 'no span in the dial');
assert.ok(s.includes("getSensorType(e) !== 'battery' && e !== _sid"), 'stage reading not listed again');
assert.ok(s.includes("moisture: 'Bodenfeuchte'"), 'one word for soil moisture');
console.log('plant_v3_detail: ok');
