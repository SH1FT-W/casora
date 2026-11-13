// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraSecLead,casoraSecuritySummary
// Security badge sub-line, several findings (owner, 13.11.2026): the most important one in words, icons only for the
// rest. Rank: lock jammed, then open (alarm off, doors, windows, gates, locks, blinds), then tilted, then offline;
// within a rank the line's order (usual or the Studio's). One finding alone and the calm state stay as they were.
//   node dev/unit/security_lead.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
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
// Lead words and the icons after it, as the badge shows them.
const parts = (html) => ({
  lead: (html.match(/class="cs-sum-item cs-sum-lead"[^>]*>([^<]*)</) || [])[1],
  leadFirst: /^<span class="cs-sum"[^>]*><span class="cs-sum-item cs-sum-lead"/.test(html),
  leads: (html.match(/cs-sum-lead/g) || []).length,
  icons: [...html.matchAll(/;mask:url\('\/i\/([\w-]+)\.svg'\)/g)].map((m) => m[1]),
});

// The owner's example: door open, window tilted, lock unlocked, camera offline → „Tür offen“ + three icons.
let p = parts(sum({ doors: 1, windowsTilted: 1, locks: 1, camDead: 1 }).html);
assert.equal(p.lead, 'Tür offen');
assert.ok(p.leadFirst && p.leads === 1);
assert.deepEqual(p.icons, ['window-tilt', 'lock-open', 'camera'], 'the rest as icons, in the usual order');

// Rank, highest first. Each row: findings → lead words.
for (const [o, lead] of [
  [{ lockJammed: 1, doors: 2, windows: 1, camDead: 1 }, 'Schloss klemmt'],
  [{ lockJammed: 2, disarmed: true }, '2 Schlösser klemmen'],
  [{ disarmed: true, doors: 1, lockDead: 1 }, 'Alarm aus'],
  [{ doors: 2, windows: 1 }, '2 Türen offen'],
  [{ windows: 3, locks: 1 }, '3 Fenster offen'],
  [{ windowsTilted: 2, gates: 1 }, 'Tor offen'],
  [{ windowsTilted: 1, locks: 2, camDead: 1 }, '2 Schlösser offen'],
  [{ windowsTilted: 1, covers: 2 }, '2 Jalousien offen'],
  [{ doorsTilted: 1, windowsTilted: 1, camDead: 2 }, 'Fenster gekippt'],
  [{ doorsTilted: 1, lockDead: 1 }, 'Tür gekippt'],
  [{ lockDead: 1, camDead: 3 }, 'Schloss offline'],
]) assert.equal(parts(sum(o).html).lead, lead, JSON.stringify(o));

// Jammed leads and leaves the rest in their order; „Alarm aus“ has no icon and stays a word there.
p = parts(sum({ lockJammed: 1, disarmed: true, windows: 2, camDead: 1 }).html);
assert.equal(p.lead, 'Schloss klemmt');
assert.deepEqual(p.icons, ['window-open', 'camera']);
assert.ok(sum({ lockJammed: 1, disarmed: true, windows: 2 }).html.indexOf('>Alarm aus<') > 0);
assert.ok(!sum({ lockJammed: 1, windows: 2 }).html.includes('lock-unlocking'), 'the lead has no icon of its own');
// No number words like „4 offen“ any more.
assert.ok(!/>\d+ (offen|offline|gekippt|klemm)/.test(sum({ doors: 1, windows: 1, locks: 1, camDead: 1 }).html));

// The Studio's order decides within a rank, never above it.
assert.equal(parts(sum({ doors: 1, locks: 1, camDead: 1 }, { order: ['cameras', 'locks'] }).html).lead, 'Schloss offen');
assert.deepEqual(parts(sum({ doors: 1, locks: 1, camDead: 1 }, { order: ['cameras', 'locks'] }).html).icons, ['camera', 'door-open']);
assert.equal(parts(sum({ lockJammed: 1, doors: 1 }, { order: ['doors'] }).html).lead, 'Schloss klemmt');

// Text (tooltip, screen reader, detailed) stays the full list in the line's order.
assert.equal(sum({ doors: 1, windowsTilted: 1, locks: 1, camDead: 1 }).text, 'Tür offen · Fenster gekippt · Schloss offen · Kamera offline');
assert.deepEqual(sum({ doors: 1, locks: 1 }, { summary: 'detailed' }), { text: 'Tür offen · Schloss offen', html: null });
// One finding, calm, triggered: as before.
assert.deepEqual(sum({ windows: 2 }), { text: '2 Fenster offen', html: null });
assert.deepEqual(sum({}), { text: 'Alles sicher', html: null });
assert.deepEqual(sum({ triggered: true, doors: 1, lockJammed: 1 }), { text: 'Alarm!', html: null });

// casoraSecLead itself: unknown kinds last, empty list -1.
assert.equal(window.casoraSecLead([]), -1);
assert.equal(window.casoraSecLead([['x', null, 0, false, 'other'], ['y', null, 0, false, 'doors', 'offline']]), 1);

// Every lead word has an English phrase (phrases/en.json, exact or pattern).
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json'));
const enTr = (t) => en.exact[t] || en.patterns.map(([q, r]) => { const m = t.match(new RegExp(q)); return m && m[0] === t ? r : null; }).find(Boolean);
for (const w of ['Schloss klemmt', '2 Schlösser klemmen', 'Alarm aus', 'Tür offen', '2 Türen offen', 'Fenster offen', '3 Fenster offen',
  'Fenster gekippt', '2 Fenster gekippt', 'Tür gekippt', '2 Türen gekippt', 'Tor offen', '2 Tore offen', 'Schloss offen', '2 Schlösser offen',
  'Jalousie offen', '2 Jalousien offen', 'Schloss offline', '2 Schlösser offline', 'Kamera offline', '2 Kameras offline']) {
  assert.ok(enTr(w), 'English missing: ' + w);
}
console.log('ok security_lead');
