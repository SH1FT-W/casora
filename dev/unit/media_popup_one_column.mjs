// V3 (optimisation round 14.11.2026, owner's go): the media popup of a player without sources beside the device and
// without speakers to group was 900 wide with one column of content – empty space left and right. Expected: one
// column is 552 (casora_cols: 1, read by the frame, §2); with sources (> 4, a column of their own) it stays as it was.
// And (V13) on the phone the empty slots under the wheel (title, sub line, progress) close while nothing plays – the
// keys sat ~130 px under the volume line; tablet and desktop keep the slots (keys do not move on „Play“, r64).
// Popup and its body evaluated with stand-ins.
//   node dev/unit/media_popup_one_column.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_media
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const strip = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const src = strip(tpl.casora_media.tap_action.casora_popup.content);

const any = () => '';
const UI = new Proxy({ soft: () => true, stage: (k, o) => 'STAGE' + (o && o.extra ? o.extra : ''), esc: (s) => String(s ?? ''), tokens: {},
  quick: () => 'QUICK', empty: () => 'EMPTY' }, { get: (o, k) => (k in o ? o[k] : any) });
globalThis.localStorage = { getItem: () => null };
const run = (entity, width, MX) => {
  const window = { _casoraUI: UI, innerWidth: width, _casoraMediaExtra: MX || null };
  return new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(window, { [entity.entity_id]: entity }, { entities: {} }, {}, entity, {});
};
const player = (attrs, state) => ({ entity_id: 'media_player.qa_speaker', state: state || 'idle',
  attributes: Object.assign({ supported_features: 1 | 4 | 16 | 32 | 16384 | 2048, volume_level: 0.2 }, attrs || {}) });

// Desktop: no sources, no grouping → one column, 552.
let out = run(player({ source_list: [] }), 1440);
assert.equal(out.casora_cols, 1, 'no sources, no grouping: one column (552)');
// Up to four sources are moons on the wheel – still nothing on the right.
out = run(player({ source_list: ['A', 'B'] }), 1440);
assert.equal(out.casora_cols, 1, 'sources as moons: one column');
// Many sources: their own column beside the settings → unchanged (no one-column mark).
out = run(player({ source_list: ['A', 'B', 'C', 'D', 'E', 'F'] }), 1440);
assert.notEqual(out.casora_cols, 1, 'many sources: not marked one column');
// Speakers to group: two columns (900) as before.
out = run(player({ source_list: [] }), 1440, { has: () => true, ids: () => [] });
assert.equal(out.casora_cols, 2, 'grouping: two columns');

// V13: the body of the wheel card, idle and playing.
// The body is a JS string literal inside the popup's code; evaluate the literal to get its text.
const lit = tpl.casora_media.tap_action.casora_popup.content.match(/custom_fields: \{ body: ("\[\[\[\\n  const UI = window\._casoraUI;[\s\S]*?\]\]\]") \}/);
assert.ok(lit, 'wheel body found');
const bodySrc = (0, eval)(lit[1]);
const runBody = (e) => new Function('window', 'states', 'hass', 'variables', 'entity', 'user', strip(bodySrc))(
  { _casoraUI: UI }, {}, {}, { v3: true }, e, {});
const idle = runBody(player({}, 'idle'));
assert.ok(/@media \(max-width:760px\)\{\.hm-idle\{display:none!important;\}\}/.test(idle), 'phone rule closes the idle slots');
for (const cls of ['hm-t hm-idle', 'hm-s hm-idle', 'hm-prog hm-idle']) assert.ok(idle.includes('class="' + cls), 'idle: ' + cls);
const play = runBody(player({ media_title: 'T', media_artist: 'A', media_duration: 200, media_position: 10 }, 'playing'));
assert.ok(!/class="[^"]*hm-idle/.test(play), 'playing: no slot is hidden');
// A source word under the wheel while idle stays visible.
const withSrc = runBody(player({ source: 'Radio' }, 'idle'));
assert.ok(withSrc.includes('class="hm-s">Radio'), 'idle with a source word: the sub line stays');
console.log('media_popup_one_column: ok');
