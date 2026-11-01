// Seekable progress bar in the media popup (owner 01.11.2026): a knob at the position, drag / tap / keys call
// media_player.media_seek, and the bar keeps the target until HA reports it; one accent from the cover for ring, bar,
// knob glow and play button.
//   node dev/unit/np_seek.mjs
// Checks without a browser: (1) _casoraNPSeekMark (casora-np-progress) holds the target, runs on while playing, is not
// pulled back by a stale report, clears on a report near the target or after the timeout; (2) the media popups'
// body draws the slider with knob only with SEEK (bit 2) and a duration; (3) the seek block (casora-np-seek) calls
// media_seek with seek_position from the keys (End, arrows) and paints the target; (4) the soft media CSS gives ring,
// bar and play button the same cover colour.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);
const core = fs.readFileSync(new URL('casora-core.js', root), 'utf8');
const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 0.01, msg + ': ' + x + ' vs ' + y);
const block = (name) => {
  const a = core.indexOf('// ' + name + ':start'), b = core.indexOf('// ' + name + ':end');
  assert.ok(a > 0 && b > a, 'block ' + name + ' missing');
  return core.slice(a, b);
};

// ── (1) pending seek ───────────────────────────────────────────────────────
const w = { dispatchEvent: () => {} };
w.window = w;
new Function('window', 'CustomEvent', block('casora-np-progress'))(w, class {});
assert.equal(typeof w._casoraNPSeekMark, 'function', '_casoraNPSeekMark');
const P = w._casoraNPPos, E = 'media_player.qa';
const T0 = Date.parse('2026-11-01T12:00:00Z');
const realNow = Date.now;
let fake = T0;
Date.now = () => fake;
const at0 = new Date(T0 - 2000).toISOString();
const states = { [E]: { attributes: { media_position: 11, media_position_updated_at: at0 } } };
w._casoraNPSeekMark(E, 100, states);
// Same report as at the seek: the target, running on while it plays.
near(P({ entity: E, pos: 11, dur: 129, posAt: at0, playing: true }, T0 + 1000).pos, 101, 'target runs on');
// A periodic report from before the seek landed (old place): still the target, no jump back.
near(P({ entity: E, pos: 12, dur: 129, posAt: T0 + 1500, playing: true }, T0 + 2000).pos, 102, 'stale report ignored');
// Paused: the target stands.
w._casoraNPSeekMark(E, 60, states);
near(P({ entity: E, pos: 11, dur: 129, posAt: at0, playing: false }, T0 + 3000).pos, 60, 'paused target');
// HA reports a position near the target: HA's value wins from then on.
w._casoraNPSeekMark(E, 100, states);
near(P({ entity: E, pos: 100.5, dur: 129, posAt: T0 + 500, playing: true }, T0 + 1000).pos, 101, 'reported near target');
assert.equal(w._casoraNPSkips[E], undefined, 'pending cleared after the report');
// Nothing reported in time: after the timeout HA's (old) value comes back.
w._casoraNPSeekMark(E, 100, states);
near(P({ entity: E, pos: 11, dur: 129, posAt: T0, playing: false }, T0 + w._casoraNPSeekMs + 100).pos, 11, 'timeout');
// ⏮/⏭ keep their old rule (any new report counts).
w._casoraNPSkipMark(E, states);
near(P({ entity: E, pos: 11, dur: 129, posAt: at0, playing: false }, T0 + 500).pos, 0, 'skip restart');
near(P({ entity: E, pos: 12, dur: 129, posAt: T0 + 400, playing: false }, T0 + 500).pos, 12, 'skip cleared by any report');
Date.now = realNow;

// ── (2) markup of the three media popups ─────────────────────────────────
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const bodyOf = (outer) => {
  const i = outer.indexOf('custom_fields: { body: "[[[');
  assert.ok(i > 0, 'body field');
  let j = i + 'custom_fields: { body: '.length + 1;
  while (outer[j] !== '"' || outer[j - 1] === '\\') j++;
  const lit = new Function('return ' + outer.slice(i + 'custom_fields: { body: '.length, j + 1))();
  return lit.replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
};
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const win = { _casoraUI: { tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222', fill2: '#eee' }, esc: esc, soft: () => false },
  _casoraNPPos: P, _casoraNPSeekMark: () => {}, casoraTr: (x) => x };
const run = (code, attrs, st) => new Function('window', 'entity', 'states', 'hass', 'variables', 'user', code)(win,
  { entity_id: E, state: st || 'playing', attributes: attrs }, {}, { states: {} }, {}, {});
const base = { media_title: 'T', media_artist: 'A', media_duration: 129, media_position: 11, media_position_updated_at: new Date().toISOString(), volume_level: 0.4 };
for (const k of ['casora_media', 'casora_now_playing_chip', 'casora_now_playing_primary']) {
  const code = bodyOf(tpl[k].tap_action.casora_popup.content);
  const seek = run(code, Object.assign({}, base, { supported_features: 2 | 1 | 16 | 32 | 4 | 16384 }));
  assert.match(seek, /<div class="hm-prog seek"><div class="hm-seek" role="slider" tabindex="0" aria-label="Wiedergabeposition"/, k + ': slider');
  assert.match(seek, /aria-valuemin="0" aria-valuemax="129" aria-valuenow="11"/, k + ': aria values');
  assert.match(seek, /data-np-seek="media_player\.qa" data-np-dur="129"/, k + ': seek data');
  assert.match(seek, /<i class="hm-knob"><\/i><\/div><\/div><\/div><div class="hm-times">/, k + ': knob inside the fill');
  assert.match(seek, /\.hm-knob\{/, k + ': knob style');
  // No SEEK bit: read-only bar as before.
  const ro = run(code, Object.assign({}, base, { supported_features: 1 | 16 | 32 | 4 | 16384 }));
  assert.ok(ro.indexOf('<div class="hm-prog"><div class="hm-track">') > -1, k + ': read-only bar');
  assert.ok(!/role="slider"|class="hm-knob"/.test(ro), k + ': no slider without SEEK');
  // No duration: no bar, no slider.
  const nd = run(code, Object.assign({}, base, { media_duration: null, supported_features: 2 | 1 | 16 | 32 }));
  assert.ok(!/role="slider"|class="hm-knob"/.test(nd), k + ': no slider without a duration');
}

// ── (3) seek block: keys call media_seek ─────────────────────────────────
const L = {};
const calls = [];
const cls = () => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: () => {} }; };
const fill = { dataset: { npEnt: E, npPos: '11', npDur: '129', npAt: String(T0), npPlay: '0' }, style: {}, closest: () => null };
const lbl = { dataset: {}, textContent: '0:11' };
const prog = { querySelector: (q) => (q === '.hm-pos' ? lbl : null) };
const attrs = {};
const el = { dataset: { npSeek: E, npDur: '129' }, classList: cls(), isConnected: true, getRootNode: () => null,
  setAttribute: (k, v) => { attrs[k] = v; }, closest: (q) => (q === '.hm-prog' ? prog : null),
  querySelector: (q) => (/hm-fill/.test(q) ? fill : null) };
el.classList.add('hm-seek');
const doc = { addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); },
  querySelector: (q) => (q === 'home-assistant' ? { hass: { states: {}, callService: (...x) => calls.push(x) } } : null) };
const w2 = Object.assign({}, w, { _casoraNPSeekUI: false, casoraHaptic: () => {}, _casoraNPBarsFor: () => [], _casoraNPBarSync: () => {} });
w2.window = w2;
new Function('window', 'document', block('casora-np-seek'))(w2, doc);
for (const t of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'keydown']) assert.ok(L[t] && L[t].length, 'listens to ' + t);
const key = (k) => { let prevented = false; L.keydown[0]({ key: k, composedPath: () => [el], preventDefault: () => { prevented = true; }, stopPropagation: () => {} }); return prevented; };
const timers = [];
const realST = globalThis.setTimeout;
globalThis.setTimeout = (f, ms) => { timers.push([f, ms]); return timers.length; };
assert.ok(key('End'), 'End handled');
assert.equal(lbl.textContent, '2:09', 'target time shown while choosing');
assert.equal(lbl.dataset.npHold, '1', 'label held from the 1-s tick');
assert.equal(attrs['aria-valuenow'], '129');
assert.equal(fill.style.width, '100.00%');
timers.splice(timers.findIndex((t) => t[1] === 400), 1)[0][0]();
assert.deepEqual(calls.at(-1), ['media_player', 'media_seek', { seek_position: 129 }, { entity_id: E }], 'End seeks to the end');
assert.ok(timers.some((t) => t[1] > 10000), 'bars re-synced after the pending time');
// Arrow left: 5 s back from what the bar shows – the pending target (paused at 129 s → 124 s), not HA's old 11 s.
assert.ok(key('ArrowLeft'));
timers.splice(timers.findIndex((t) => t[1] === 400), 1)[0][0]();
assert.deepEqual(calls.at(-1)[2], { seek_position: 124 }, 'arrow left −5 s from the pending target');
assert.ok(!key('a'), 'other keys pass');
globalThis.setTimeout = realST;

// ── (4) one cover accent for ring, bar, knob and play button ─────────────
const soft = fs.readFileSync(new URL('local/07-weich-spezial.js', root), 'utf8');
const w3 = { _casoraNPSoft: { tintOf: () => 'hsl(270,60%,40%)' }, addEventListener: () => {}, _casoraAlarmTap: true };
w3.window = w3;
new Function('window', 'CSS', soft)(w3, undefined);
const css = w3._casoraMediaSoft.css('/pic.jpg');
assert.ok(css.indexOf('.hui-stage{--casora-popup-accent:hsl(270,60%,40%);}') > -1, 'ring (dial) takes the cover colour');
assert.ok(css.indexOf('.hm-wrap{--hm-acc:hsl(270,60%,40%);}') > -1, 'bar, knob and play take the cover colour');
assert.ok(/\.hm-fill\{background:var\(--hm-acc\);\}/.test(css), 'bar fill uses the accent');
assert.ok(/\.hm-b\.lg\{width:72px;height:72px;background:var\(--hm-acc\);/.test(css), 'play button uses the accent');
assert.ok(!/\.hm-b\.lg\{background:hsl/.test(css), 'no separate play colour');
// Contrast: a light cover colour turns the play icon dark, a dark one keeps it white.
w3._casoraNPSoft.tintOf = () => 'hsl(60,70%,52%)';
assert.ok(/\.hm-b\.lg > div\{background-color:var\(--casora-popup-ui-on-ink, #000\) !important;\}<\/style>$/.test(w3._casoraMediaSoft.css('/b.jpg')), 'dark icon on a light colour');
w3._casoraNPSoft.tintOf = () => 'hsl(270,60%,40%)';
assert.ok(!/#000\) !important;\}<\/style>$/.test(w3._casoraMediaSoft.css('/c.jpg')), 'white icon on a dark colour');
console.log('ok np_seek');
