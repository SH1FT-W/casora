// Toasts keep out of the way (Prüfung 2 DH-18, fam-20, E29): casoraNotice waits until no Casora popup is open,
// lifts HA's toast stack above the phone bar; the hold tip and the design notice use it, the design notice is short
// and names the Studio only for admins.
//   node dev/unit/notice_out_of_the_way.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Own small fake clock: setTimeout only collects the callbacks; advance(ms) runs the due ones in time order, so the
// test does not sleep.
// Date.now moves with it, so the code's own time checks see the same time.
const realNow = Date.now;
const realClear = globalThis.clearTimeout;
const FAKE = Symbol('fake timer');
let fakeNow = 0;
const fakeQueue = [];
globalThis.setTimeout = (fn, ms = 0, ...args) => {
  const t = { fn, args, at: fakeNow + (Number(ms) || 0), dead: false, [FAKE]: true };
  fakeQueue.push(t);
  return t;
};
globalThis.clearTimeout = (t) => (t && t[FAKE] ? (t.dead = true) : realClear(t));
Date.now = () => realNow() + fakeNow;
const advance = async (ms) => {
  const end = fakeNow + ms;
  await new Promise((r) => setImmediate(r));
  for (let due; (due = fakeQueue.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0]); ) {
    fakeQueue.splice(fakeQueue.indexOf(due), 1);
    fakeNow = Math.max(fakeNow, due.at);
    due.fn(...due.args);
    await new Promise((r) => setImmediate(r));
  }
  fakeNow = end;
};

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('// ── Notices (HA toasts)'), b = core.indexOf('// ── Notice after the design switch');
assert.ok(a > 0 && b > a, 'block found');

const sent = [];
const styles = [];
const sr = { getElementById: (id) => styles.find((s) => s.id === id) || null, appendChild: (s) => styles.push(s) };
const ha = { shadowRoot: { querySelector: () => ({ shadowRoot: sr }) }, dispatchEvent: (e) => sent.push(e.detail) };
globalThis.document = { querySelector: () => ha, createElement: () => ({}) };
globalThis.window = {};
globalThis.Event = class { constructor(t) { this.type = t; } };
new Function(core.slice(a, b))();
assert.ok(styles.length === 1 && /var\(--casora-toast-lift/.test(styles[0].textContent), 'toast stack lifted');

window.casoraPopup = { surface: {} };
window.casoraNotice({ message: 'Tipp' });
await advance(900);
assert.equal(sent.length, 0, 'waits while a popup is open');
window.casoraPopup.surface = null;
await advance(900);
assert.deepEqual(sent.map((d) => d.message), ['Tipp'], 'shown after the popup closed');

assert.match(read('custom_components/casora/scripts/local/04-navigation.js'), /--casora-toast-lift:\d+px/, 'phone bar sets the lift');
assert.match(read('custom_components/casora/scripts/local/22-halten.js'), /window\.casoraNotice\(\{ message: msg \}\)/, 'hold tip waits for the popup');
const design = core.slice(core.indexOf('// ── Notice after the design switch'), core.indexOf('// ── Now Playing collector'));
assert.ok(!/duration: -1/.test(design) && /casoraNotice\(/.test(design) && /is_admin/.test(design), 'design notice: timed, via casoraNotice, Studio hint for admins');
console.log('notice_out_of_the_way: ok');
