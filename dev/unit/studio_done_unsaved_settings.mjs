// Studio: "Done" with unsaved global settings asks first (Save / Discard / Back) instead of
// dropping them silently.
//   node dev/unit/studio_done_unsaved_settings.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.trLabel = (t) => t;

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const method = (head) => {
  const at = src.indexOf('\n  ' + head);
  assert.ok(at > 0, head + ' not found');
  const open = src.indexOf('{\n', at);
  return src.slice(open + 2, src.indexOf('\n  }\n', at));
};
const leaveSettingsOk = new Function('return async function () {' + method('async _leaveSettingsOk() {') + '\n};')();
const done = new Function('return async function () {' + method('async _done() {') + '\n};')();

const panel = (answer, { saveWorks = true } = {}) => {
  const p = {
    asked: [], saved: 0, opened: 0, closed: 0,
    _cs: { draft: true }, _csOpen: true,
    _csDirty() { return !!(this._cs && this._cs.draft); },
    async _csSave() { this.saved++; if (saveWorks) this._cs.draft = false; },
    _csClose() { this.closed++; this._csOpen = false; },
    async _ask(opts) { this.asked.push(opts); return answer; },
    $: () => null, _isDirty: () => false, _status() {},
    _openDash() { this.opened++; },
  };
  p._leaveSettingsOk = leaveSettingsOk;
  p._done = done;
  return p;
};

// Nothing unsaved: no question, leaves.
{
  const p = panel(true);
  p._cs.draft = false;
  await p._done();
  assert.equal(p.asked.length, 0, 'no question without unsaved settings');
  assert.equal(p.opened, 1);
}
// Back (cancel / Esc): stays, draft kept.
for (const answer of [false, null]) {
  const p = panel(answer);
  await p._done();
  assert.equal(p.asked.length, 1, 'asks');
  const q = p.asked[0];
  assert.equal(q.title, 'Save settings?');
  assert.deepEqual([q.confirmLabel, q.altLabel, q.cancelLabel], ['Save', 'Discard', 'Back']);
  assert.equal(p.opened, 0, 'Back stays in the Studio');
  assert.equal(p.saved, 0);
  assert.ok(p._csDirty(), 'draft kept');
}
// Save: saves, then leaves.
{
  const p = panel(true);
  await p._done();
  assert.equal(p.saved, 1);
  assert.equal(p.opened, 1);
}
// Save fails: stays.
{
  const p = panel(true, { saveWorks: false });
  await p._done();
  assert.equal(p.saved, 1);
  assert.equal(p.opened, 0, 'failed save stays');
}
// Discard: drops the draft without saving, closes the settings page, leaves.
{
  const p = panel({ alt: true });
  await p._done();
  assert.equal(p.saved, 0);
  assert.equal(p._cs, null, 'draft dropped');
  assert.equal(p.closed, 1);
  assert.equal(p.opened, 1);
}
console.log('studio_done_unsaved_settings: ok');
