// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraSecLead,casoraSecuritySummary, dashboards/casora/button_card_templates.json#casora_badge_security_group
// „Alarm aus“ behind the real findings (owner, 14.11.2026, „2B“): since V11 „Neu beginnen“ puts the alarm panel into
// Home's security group, and an alarm that is off (normal by day) pushed „2 Fenster offen“ out of the lead. Open or
// tilted windows, doors, gates, locks, blinds and offline devices go first; „Alarm aus“ is the last icon (shield_off,
// tooltip „Alarm aus“); a jammed lock still leads; „Alarm aus“ alone stays in words. Detailed list and the classic
// template's long/short line: „Alarm aus“ last, unless the Studio's security_sub_order says otherwise.
//   node dev/unit/security_alarm_off_last.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, documentElement: {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';

const sec = (o = {}) => {
  const r = { triggered: false, disarmed: false, locks: 0, lockJammed: 0, lockDead: 0, doors: 0, windows: 0, doorsTilted: 0,
    windowsTilted: 0, gates: 0, covers: 0, camDead: 0, ...o };
  r.insecure = r.triggered || r.disarmed || !!(r.locks || r.lockJammed || r.doors || r.windows || r.doorsTilted || r.windowsTilted || r.gates || r.covers);
  r.problem = !!(r.camDead || r.lockDead);
  return r;
};
const sum = (o, opt = {}) => window.casoraSecuritySummary(sec(o), opt);
const lead = (html) => (html.match(/class="cs-sum-item cs-sum-lead"[^>]*>([^<]*)</) || [])[1];
const icons = (html) => [...html.matchAll(/;mask:url\('\/i\/([\w-]+)\.svg'\)/g)].map((m) => m[1]);

// The reported case: two windows open, alarm off → „2 Fenster offen“ leads, the shield after it.
let r = sum({ disarmed: true, windows: 2 });
assert.equal(lead(r.html), '2 Fenster offen');
assert.deepEqual(icons(r.html), ['shield_off']);
assert.ok(r.html.includes('aria-label="Alarm aus" title="Alarm aus"'), 'tooltip and screen reader say „Alarm aus“');
assert.ok(!r.html.includes('>Alarm aus<'), 'no longer a word');
assert.ok(!/shield_off[^]*font-weight:700">0</.test(r.html), 'no number „0“ next to the shield');
assert.equal(r.text, '2 Fenster offen · Alarm aus');

// Every other finding goes first, whatever its rank; „Alarm aus“ is always the last icon.
for (const [o, w] of [[{ doors: 1 }, 'Tür offen'], [{ windowsTilted: 1 }, 'Fenster gekippt'], [{ doorsTilted: 2 }, '2 Türen gekippt'],
  [{ gates: 1 }, 'Tor offen'], [{ locks: 1 }, 'Schloss offen'], [{ covers: 2 }, '2 Jalousien offen'],
  [{ lockDead: 1 }, 'Schloss offline'], [{ camDead: 1 }, 'Kamera offline'], [{ lockJammed: 1 }, 'Schloss klemmt']]) {
  const h = sum({ disarmed: true, ...o }).html;
  assert.equal(lead(h), w, JSON.stringify(o));
  assert.equal(icons(h).at(-1), 'shield_off', JSON.stringify(o));
}
r = sum({ disarmed: true, lockJammed: 1, windows: 1, camDead: 1 });
assert.equal(lead(r.html), 'Schloss klemmt');
assert.deepEqual(icons(r.html), ['window-open', 'camera', 'shield_off']);

// Alone it stays in words, like any single finding.
assert.deepEqual(sum({ disarmed: true }), { text: 'Alarm aus', html: null });
// Detailed: last without a Studio order; the Studio's order still decides.
assert.equal(sum({ disarmed: true, windows: 2, camDead: 1 }, { summary: 'detailed' }).text, '2 Fenster offen · Kamera offline · Alarm aus');
assert.equal(sum({ disarmed: true, windows: 2 }, { summary: 'detailed', order: ['alarm', 'windows'] }).text, 'Alarm aus · 2 Fenster offen');

// Classic template line (without Soft/Fog): long list and short form put the alarm last too.
const T = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_badge_security_group;
const body = String(T.name).replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (states, variables) => new Function('entity', 'states', 'variables', 'hass', body)
  .call({}, null, states, { place: 'room', ...variables }, { states });
const saved = { opens: window.casoraOpenings, soft: window._casoraSoft };
window.casoraOpenings = undefined; window._casoraSoft = undefined;
globalThis.requestAnimationFrame = () => 0;
const st = { 'alarm_control_panel.a': { state: 'disarmed', attributes: {} },
  'binary_sensor.w1': { state: 'on', attributes: { device_class: 'window' } }, 'binary_sensor.w2': { state: 'on', attributes: { device_class: 'window' } },
  'camera.c': { state: 'unavailable', attributes: {} } };
const vars = { alarm_entity: 'alarm_control_panel.a', entities: ['binary_sensor.w1', 'binary_sensor.w2'], cameras: ['camera.c'] };
let out = run(st, vars);
assert.ok(out.includes('<span class="sec-lang">2 Fenster offen · Kamera offline · Alarm deaktiviert</span>'), out);
assert.ok(out.includes('<span class="sec-kurz">2 offen · 1 offline · Alarm aus</span>'), out);
out = run(st, { ...vars, sub_order: ['alarm', 'windows'] });
assert.ok(out.includes('<span class="sec-lang">Alarm deaktiviert · 2 Fenster offen · Kamera offline</span>'), out);
Object.assign(window, { casoraOpenings: saved.opens, _casoraSoft: saved.soft });
console.log('ok security_alarm_off_last');
