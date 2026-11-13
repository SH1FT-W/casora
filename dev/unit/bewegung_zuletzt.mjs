// Hemma round #10: a motion sensor with nothing detected says since when („Zuletzt vor 11 Std.“), with the bell's
// relative time, on the tile, the security badges and the phone chip. Detected stays „Erkannt“.
//   node dev/unit/bewegung_zuletzt.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraMotionLast,casoraMotionWord,casoraMotionHtml,casoraAgo dashboards/casora/button_card_templates.json#casora_motion,casora_badge_security,casora_badge_contact_group,casora_mobile_sensor_chips
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', root), 'utf8');
const agoSrc = core.match(/\n  function ago\(ms\) \{[\s\S]*?\n  \}\n/);
assert.ok(agoSrc, 'the bell\'s ago() found');
const a = core.indexOf('  // Motion (Hemma round #10)');
const b = core.indexOf('  // <casora-ago data-since');
assert.ok(a > 0 && b > a, 'motion helpers found');

const H = 3600e3;
const NOW = Date.parse('2026-11-13T15:00:00Z');
const realNow = Date.now;
Date.now = () => NOW;
const window = { casoraEsc: (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) };
new Function('window', agoSrc[0] + 'window.casoraAgo = ago;\n' + core.slice(a, b))(window);
// casoraSinceMs filters HA's start; here every time is a real change.
window.casoraSinceMs = (x) => Date.parse(x.last_changed);

const iso = (ms) => new Date(ms).toISOString();
const M = 'binary_sensor.flur_bewegung', M2 = 'binary_sensor.flur_bewegung_2';

// Relative time: the bell's words, nothing new.
assert.equal(window.casoraAgo(NOW - 20e3), 'gerade eben');
assert.equal(window.casoraAgo(NOW - 5 * 60e3), 'vor 5 Min.');
assert.equal(window.casoraAgo(NOW - 11 * H), 'vor 11 Std.');

const last = (st, ids = [M]) => window.casoraMotionLast(ids, st, null);
let st = { [M]: { state: 'off', last_changed: iso(NOW - 11 * H) } };
assert.equal(window.casoraMotionWord(last(st)), 'Zuletzt vor 11 Std.', 'off: since when');
assert.equal(window.casoraMotionWord(last({ [M]: { state: 'on', last_changed: iso(NOW - 60e3) } })), 'Erkannt', 'on: Erkannt');
assert.equal(window.casoraMotionWord(last({ [M]: { state: 'unavailable', last_changed: iso(NOW) } })), 'Nicht verfügbar');
assert.equal(window.casoraMotionWord(last({})), 'Nicht verfügbar', 'sensor gone');
// No real change known (HA's start): the caller's idle word.
window.casoraSinceMs = () => null;
assert.equal(window.casoraMotionWord(last(st), 'Frei'), 'Frei', 'only HA start: idle word');
window.casoraSinceMs = (x) => Date.parse(x.last_changed);
// Several sensors: the newest end of a detection counts; any on = detected.
const two = { [M]: { state: 'off', last_changed: iso(NOW - 11 * H) }, [M2]: { state: 'off', last_changed: iso(NOW - 7 * 60e3) } };
assert.equal(window.casoraMotionWord(last(two, [M, M2])), 'Zuletzt vor 7 Min.');
assert.equal(window.casoraMotionWord(last({ ...two, [M2]: { state: 'on', last_changed: iso(NOW) } }, [M, M2])), 'Erkannt');
// HTML: a casora-ago that ticks on its own, the text already inside.
const html = window.casoraMotionHtml(last(st));
assert.match(html, /^<casora-ago data-since="\d+" data-pre="Zuletzt">Zuletzt vor 11 Std\.<\/casora-ago>$/);
assert.equal(window.casoraMotionHtml(last({ [M]: { state: 'on' } })), 'Erkannt', 'detected: plain text');

// Templates.
const tpl = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
const run = (t, ctx) => new Function(...Object.keys(ctx), t.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(...Object.values(ctx));
const tile = tpl.casora_motion.state_display;
const ctx = (states, variables, entity) => ({ states, variables, entity, hass: { states }, window });
assert.match(run(tile, ctx(st, { sensor_1: M }, st[M])), /Zuletzt vor 11 Std\./, 'tile: since when');
assert.equal(run(tile, ctx({ [M]: { state: 'on' } }, { sensor_1: M }, null)), 'Erkannt', 'tile: detected');
assert.match(run(tile, ctx(st, {}, { entity_id: M, ...st[M] })), /Zuletzt vor 11 Std\./, 'tile without sensor list: its entity');
assert.ok(!/triggers_update/.test(JSON.stringify(tpl.casora_motion)), 'no re-render storm: no triggers_update on the tile');
// Without the core helpers (Studio preview without modules): as before.
assert.equal(run(tile, { ...ctx(st, { sensor_1: M }, null), window: {} }), 'Frei');

for (const k of ['casora_badge_security', 'casora_badge_contact_group']) {
  const out = run(tpl[k].name, { ...ctx(st, {}, { entity_id: M, state: 'off', attributes: { device_class: 'motion', friendly_name: 'Flur' } }), hass: { states: st, formatEntityState: () => '' } });
  assert.match(out, /badge-sub"><casora-ago [^>]+>Zuletzt vor 11 Std\./, k + ': since when');
  const on = run(tpl[k].name, { ...ctx({ [M]: { state: 'on' } }, {}, { entity_id: M, state: 'on', attributes: { device_class: 'motion' } }), hass: { states: {} } });
  assert.match(on, /badge-sub">Erkannt</, k + ': detected');
}

const chip = tpl.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards.find((c) => c.icon === 'mdi:motion-sensor');
window.casoraMotionOf = (o, S) => ({ ids: [M], entity: M, state: S[M].state });
const cst = { 'input_select.casora_mobile_filter': { state: 'flur' }, ...st };
assert.match(run(chip.name, ctx(cst, { room_chips: { flur: { motion_entity: M } } }, null)), /Zuletzt vor 11 Std\./, 'phone chip: since when');

Date.now = realNow;
console.log('ok – motion says since when');
