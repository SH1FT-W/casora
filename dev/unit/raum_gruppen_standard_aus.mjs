// Phone room pages: no automatic grouping by category any more (owner decision 01.11.2026). Only the Studio switch
// „Group rooms by category on the phone“ (room_groups: true) turns it on; empty = off.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const fo = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
const m = /function _roomGroupOn\(cfg\) \{([\s\S]*?)\n  \}/.exec(fo);
assert.ok(m, '_roomGroupOn found');
const on = (css, cfg, ls) => new Function('cfg', 'getComputedStyle', 'document', 'localStorage', m[1])(
  cfg, () => ({ getPropertyValue: () => css }), { documentElement: {} }, { getItem: () => ls || null });
assert.equal(on('', {}), false, 'nothing set → not grouped');
assert.equal(on('on', {}), true, 'Studio switch on → grouped');
assert.equal(on('', { group_by_category: true }), true, 'room option on → grouped');
assert.equal(on('on', { group_by_category: false }), false, 'room option off wins');
const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.ok(/key: "room_groups"[^}]*boolDefault: false/.test(panel), 'Studio default off');
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
assert.ok(JSON.stringify(tpl.casora_mobile_bg).includes('--casora-room-groups:on'), 'mobile_bg sets „on“ only when switched on');
console.log('ok raum_gruppen_standard_aus');
