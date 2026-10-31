// Popup v3 is clean (popup-richtlinien-v3.md §8): the popups no longer show automation switches, so the Studio must not
// offer fields that only fed them – they changed nothing any more.   node dev/unit/studio_popup_v3_clean.mjs
//   cover / cover group: "Shade automation", "Automation today" (smart_automation_entity, smart_automation_today_entity)
//   waste tile and Settings → Waste: "Reminder automation" (trash_reminder, waste.reminder – "Push the evening before")
//   doorbell / Frigate descriptions: "the doorbell's settings", "recordings … and the camera switches"
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const DEAD = ['smart_automation_entity', 'smart_automation_today_entity', 'trash_reminder'];
const { I } = await loadPanel();
const types = [].concat(I.TILE_TYPES || [], window.CASORA_TILE_TYPES || []);
assert.ok(types.length > 20, 'tile types loaded');
const hits = [];
for (const t of types) for (const f of t.fields || []) if (f && DEAD.includes(f.key)) hits.push((t.id || t.label) + '.' + f.key);
assert.deepEqual(hits, [], 'Studio fields for popup parts that v3 dropped');

// The waste section of Settings → Home & Devices.
const personal = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-personal.js', import.meta.url), 'utf8');
assert.ok(!/row\(g, "Reminder automation"/.test(personal), 'Settings → Waste still offers "Reminder automation"');

// The popup itself really dropped them in v3 (if this fails, the popup shows them again and the fields belong back).
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const cover = JSON.stringify(tpl.casora_popup_cover);
assert.ok(/HZ_SYS && states\[HZ_SYS\] && !_v3/.test(cover.replace(/\\n/g, ' ')), 'cover popup: shade switch only outside v3');
assert.ok(/states\[REMINDER\] && !_v3/.test(JSON.stringify(tpl.casora_trash)), 'waste popup: reminder switch only outside v3');
// Tile descriptions (Add a tile, Community) promise only what the v3 popup still shows: doorbell without its settings,
// Frigate without recordings, objects and camera switches (24-klingel.js, 23-frigate.js: "No settings", "just the picture").
const desc = Object.fromEntries(types.filter((t) => t.community && t.community.desc).map((t) => [t.id, t.community.desc]));
const promise = Object.entries(desc).filter(([id, d]) => /doorbell|frigate/i.test(id + ' ' + d)
  && /settings|camera switches|recordings of the last days/i.test(d)).map(([id]) => id)
  // Velair (31-velair.js): target and modes only, the schedule editing moved to Velair's own panel.
  .concat(Object.entries(desc).filter(([id, d]) => /velair/i.test(id) && /editing a day's slots|fan, presets and swing/.test(d)).map(([id]) => id));
assert.deepEqual(promise, [], 'descriptions promising popup parts v3 dropped');
console.log('studio_popup_v3_clean: ok');
