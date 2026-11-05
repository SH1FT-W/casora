// Update prompt for Casora itself (scripts/local/39-update-prompt.js): when does the dashboard show it?
// Expected: only admins, only with a newer version, once per version, "Später" asks again after 24 h,
// "Diese Version überspringen" only again for a newer version, the Studio toggle off shows nothing; the
// choice lands in HA's frontend user data (per user). Also: the popup is v3, one column, and its buttons
// carry the three choices. It says what is new: tagline, up to four items with a short line, a link to all changes.
//   node dev/unit/update_prompt.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/39-update-prompt.js', import.meta.url), 'utf8');

globalThis.window = globalThis;
const listeners = {};
globalThis.document = {
  readyState: 'loading',
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  querySelector: () => null,
};
globalThis.addEventListener = () => {};
const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
new Function(src)();
const U = window._casoraUpdPrompt;
assert.ok(U && typeof U.decide === 'function', 'module loaded');

const NOW = Date.UTC(2026, 10, 2, 8, 0, 0);
const info = { available: true, version: '26.11.6', installed: '26.11.5', can_install: true, entity_id: 'update.casora_update', lines: ['A', 'B'] };

// ── decision ────────────────────────────────────────────────────────────────
assert.equal(U.decide({ admin: true, info, mem: {}, now: NOW }), 'show', 'admin, new version: show');
assert.equal(U.decide({ admin: false, info, mem: {}, now: NOW }), 'not_admin', 'non-admin: never');
assert.equal(U.decide({ admin: true, info: { ...info, available: false }, mem: {}, now: NOW }), 'none', 'nothing new: no prompt');
assert.equal(U.decide({ admin: true, info: null, mem: {}, now: NOW }), 'none', 'no answer: no prompt');
assert.equal(U.decide({ admin: true, info, mem: U.setOff({}, true), now: NOW }), 'off', 'Studio toggle off: no prompt');
assert.equal(U.decide({ admin: true, info, mem: U.setOff(U.setOff({}, true), false), now: NOW }), 'show', 'toggle back on: prompt again');

// once per version
const seen = U.seen({}, '26.11.6');
assert.equal(U.decide({ admin: true, info, mem: seen, now: NOW }), 'seen', 'shown once: not again for the same version');
assert.equal(U.decide({ admin: true, info: { ...info, version: '26.11.7' }, mem: seen, now: NOW }), 'show', 'newer version: shown again');

// "Später": 24 h
const later = U.later(seen, NOW);
assert.equal(later.until, NOW + 24 * 3600e3, 'later = 24 h');
assert.equal(U.decide({ admin: true, info, mem: later, now: NOW + 23 * 3600e3 }), 'later', 'within 24 h: quiet');
assert.equal(U.decide({ admin: true, info, mem: later, now: NOW + 24 * 3600e3 + 1 }), 'show', 'after 24 h: asks again (same version)');

// skip
const skip = U.skip(later, '26.11.6');
assert.equal(U.decide({ admin: true, info, mem: skip, now: NOW + 3 * 864e5 }), 'skipped', 'skipped version: never again');
assert.equal(U.decide({ admin: true, info: { ...info, version: '26.11.7' }, mem: skip, now: NOW }), 'show', 'skipped: a newer version asks');
assert.equal(U.decide({ admin: true, info: { ...info, version: '26.11.7' }, mem: U.setOff(skip, true), now: NOW }), 'off', 'toggle wins over everything');

// junk memory never breaks it
assert.equal(U.decide({ admin: true, info, mem: 'x', now: NOW }), 'show');
assert.equal(U.decide({ admin: true, info, mem: [], now: NOW }), 'show');

// ── run(): per user in HA's frontend user data ────────────────────────────────
let uid = 0;
function fakeHass(admin, userData) {
  const sent = [];
  const h = {
    user: { is_admin: admin, id: 'u' + (++uid) }, language: 'de', states: {},
    connection: { sendMessagePromise: async (m) => {
      sent.push(m);
      if (m.type === 'frontend/get_user_data') return { value: userData[m.key] ?? null };
      if (m.type === 'frontend/set_user_data') { userData[m.key] = m.value; return null; }
      throw new Error('unexpected ' + m.type);
    } },
    callWS: async (m) => { sent.push(m); if (m.type === 'casora/updates/prompt') return h.__info; throw new Error('unexpected'); },
    __info: info,
  };
  return { h, sent };
}
const opened = [];
window.casoraPopup = { open: (cfg) => { opened.push(cfg); }, close() {}, current: null };
window._casoraUI = { actions: (list) => list.map((a) => `<div data-casora-updp="${a.attrs['data-casora-updp']}"><span>${a.text}</span></div>`).join('') };

const data = {};
const A = fakeHass(true, data);
assert.equal(await U.run(A.h), 'show', 'admin with a new version: popup');
assert.equal(opened.length, 1);
const cfg = opened[0];
assert.equal(cfg.title, 'Casora 26.11.6 ist da', 'title names the version');
assert.equal(cfg.variant, 'v3', 'v3 popup');
assert.equal(cfg.content.casora_cols, 1, 'one column (552)');
const html = cfg.content.cards[0].custom_fields.b;
// Owner 05.11.2026: hovering the buttons showed a second frame in the popup – the theme's card hover (shadow and
// filter on every ha-card) reached the content card. The card switches both off through the theme's own variables.
const mod = cfg.content.cards[0].card_mod.style;
assert.match(mod, /--casora-card-hover-shadow:\s*none/, 'no hover shadow on the content card');
assert.match(mod, /--casora-card-hover-filter:\s*none/, 'no hover filter on the content card');
for (const w of ['install', 'later', 'skip']) assert.ok(html.includes(`data-casora-updp="${w}"`), 'button ' + w);
assert.ok(html.includes('<li>A</li>') && html.includes('<li>B</li>'), 'release-note lines');
assert.ok(A.sent.some((m) => m.type === 'casora/updates/prompt' && m.language === 'de'), 'asks in the user language');
assert.equal(data[U.KEY].seen, '26.11.6', 'remembered per user (frontend user data)');
assert.equal(await U.run(A.h), 'seen', 'next load: not again');
assert.equal(opened.length, 1);

// "Später" via the button handler
window.casoraPopup.current = null;
document.querySelector = () => ({ hass: A.h });
await U.choose('later');
assert.ok(data[U.KEY].until > Date.now() + 23 * 3600e3, 'Später stored 24 h');
assert.equal(await U.run(A.h), 'later', 'after Später: quiet');
// 24 h later: again
data[U.KEY].until = Date.now() - 1;
assert.equal(await U.run(A.h), 'show', 'after 24 h: again');
await U.choose('skip');
assert.equal(data[U.KEY].skip, '26.11.6');
assert.equal(await U.run(A.h), 'skipped');
A.h.__info = { ...info, version: '26.11.7' };
assert.equal(await U.run(A.h), 'show', 'newer than the skipped one');

// another user on the same browser does not inherit the first one's choice from the localStorage mirror
const C = fakeHass(true, {});
C.h.__info = info;
assert.equal(await U.run(C.h), 'show', 'second user: own memory');

// non-admin: no request at all
const N = fakeHass(false, {});
assert.equal(await U.run(N.h), 'not_admin');
assert.equal(N.sent.length, 0, 'a non-admin sends nothing');

// toggle off (as the Studio writes it): no WS call for the version
const O = fakeHass(true, { [U.KEY]: { off: true } });
assert.equal(await U.run(O.h), 'off');
assert.ok(!O.sent.some((m) => m.type === 'casora/updates/prompt'), 'toggle off: not even asked');

// another popup open: wait for the next load, remember nothing
const B = fakeHass(true, {});
window.casoraPopup.current = { title: 'Licht' };
assert.equal(await U.run(B.h), 'busy');
window.casoraPopup.current = null;

// What is new (owner 04.11.2026): tagline, up to four items with a short line, "Alle Änderungen", the install hint after them.
{
  const rich = { ...info, release_url: 'https://example.invalid/r', notes_lang: 'de', intro: 'Küche & Wäsche mit echtem Inhalt.',
    items: [{ title: 'Backofen', text: 'Kacheltyp „Backofen“ im Studio' }, { title: 'Waschmaschine <und> Trockner', text: 'Die Popups zeigen Pflege' },
      { title: 'C', text: 'c' }, { title: 'D', text: '' }, { title: 'E', text: 'never shown' }],
    lines: ['Backofen', 'Waschmaschine und Trockner', 'C'] };
  const R = U.html(rich);
  assert.ok(R.includes('<p class="cup-intro" lang="de">Küche &amp; Wäsche mit echtem Inhalt.</p>'), 'tagline as intro, escaped');
  assert.ok(R.includes('<span class="cup-t">Backofen</span><span class="cup-x">Kacheltyp „Backofen“ im Studio</span>'), 'title + short line');
  assert.ok(R.includes('Waschmaschine &lt;und&gt; Trockner') && !R.includes('<und>'), 'item text escaped');
  assert.equal((R.match(/<li>/g) || []).length, 4, 'four items at most');
  assert.ok(R.includes('<li><span class="cup-t">D</span></li>'), 'an item without text: title only');
  assert.ok(R.includes('data-casora-updp="notes"') && R.includes('Alle Änderungen'), 'link to all changes');
  assert.ok(R.indexOf('<ul class="cup-lines') < R.indexOf('Wird über den Marketplace installiert') && R.indexOf('Wird über den Marketplace installiert') < R.indexOf('data-casora-updp="install"'),
    'install hint after the list, before the buttons');
  assert.ok(R.includes('<p class="cup-hint">'), 'install hint small');
  // An older backend sends only lines: shown as before (hint on top, one line each).
  const O = U.html({ ...info, lines: ['A', 'B'] });
  assert.ok(O.includes('<li>A</li>') && O.indexOf('<p class="cup-sub">') < O.indexOf('<ul class="cup-lines') && !O.includes('<p class="cup-intro"') && !O.includes('data-casora-updp="notes"'), 'lines only: old look');
  // "Alle Änderungen" opens the release page and keeps the prompt.
  const opened2 = [];
  const wo = window.open;
  window.open = (u, t) => { opened2.push([u, t]); };
  const P0 = window.casoraPopup;
  let closed = 0;
  window.casoraPopup = { open() {}, close() { closed++; }, current: null };
  const E = fakeHass(true, {});
  E.h.__info = rich;
  document.querySelector = () => ({ hass: E.h });
  assert.equal(await U.run(E.h), 'show');
  window.casoraPopup.current = null;
  assert.equal(await U.choose('notes'), 'notes');
  assert.deepEqual(opened2, [['https://example.invalid/r', '_blank']], 'release page in a new tab');
  assert.equal(closed, 0, 'prompt stays open');
  window.open = wo;
  window.casoraPopup = P0;
}

// without HACS the main button opens the page instead of installing
const H2 = U.html({ ...info, can_install: false, hacs_url: null, release_url: 'https://example.invalid/r' });
assert.ok(H2.includes('Release-Seite öffnen') && !H2.includes('>Installieren<'), 'no install without HACS');

// ── Installieren: as the Studio, update.install on HACS' entry, then the restart only if HACS reports it installed
{
  const D = fakeHass(true, {});
  const calls = [];
  const asks = [];
  let closed = 0;
  window.casoraAsk = async (w) => { asks.push(w.title); return true; };
  window.casoraNotice = () => {};
  D.h.states = { 'update.casora_update': { state: 'on', attributes: { latest_version: '26.11.6' } } };
  D.h.callService = async (d, s, data) => { calls.push([d, s, data]); if (s === 'restart') { const e = new Error(''); e.code = 3; throw e; } return {}; };
  document.querySelector = () => ({ hass: D.h });
  let cur = null;
  window.casoraPopup = { open: (c) => { cur = c; }, close: () => { closed++; cur = null; }, get current() { return cur; } };
  D.h.__info = info;
  assert.equal(await U.run(D.h), 'show');
  // HACS says nothing was installed: no restart question.
  D.h.__info = { ...info, pending_restart: null };
  assert.equal(await U.choose('install'), 'not_installed', 'no restart without HACS reporting the install');
  assert.deepEqual(calls.map((c) => c[1]), ['install'], 'only update.install');
  assert.deepEqual(calls[0][2], { entity_id: 'update.casora_update' }, "HACS' newest: no version tag");
  assert.equal(closed, 0, 'popup stays for another try');
  // Installed (waiting for restart): close, ask, restart (connection drop = fine).
  D.h.__info = { ...info, pending_restart: '26.11.6' };
  assert.equal(await U.choose('install'), 'restart');
  assert.deepEqual(calls.map((c) => c[1]), ['install', 'install', 'restart']);
  assert.equal(asks.length, 3, 'first try: confirm only; second: confirm + restart question');
  // A beta (not HACS' newest) goes by its tag.
  D.h.__info = { ...info, version: '26.11.7b1' };
  cur = null;
  await U.run(D.h);
  D.h.__info = { ...info, version: '26.11.7b1', pending_restart: '26.11.7b1' };
  await U.choose('install');
  assert.equal(calls[3][2].version, 'v26.11.7b1', 'beta by its tag');
  // Another popup opened meanwhile: never closed by the prompt.
  cur = { title: 'Licht' };
  await U.choose('later');
  assert.ok(cur && cur.title === 'Licht', "the prompt does not close someone else's popup");
}

console.log('update_prompt: ok');
