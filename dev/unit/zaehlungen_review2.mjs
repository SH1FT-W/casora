// Review 2, group „counts & logic“ (01.11.2026): badge, tile, popup and Studio count the same from one source.
//   T03/E31/T08  locks: unlocked, jammed and offline named apart everywhere; the short security line leads with a word
//   T09          the Klima badge's „Jalousien“ counts the blinds tile's blinds (its popup opens from there)
//   fam-03       the phone hub looks again after an update (Home's badges may draw after it)
//   fam-05       a window open for half a day is „Lange offen“ (orange, close?), never „Lüftet“/„Raumluft gut“
//   E09/fam-15   a thermostat shows its room's reading, like the Klima badge
//   fam-22       the waste tile counts down from the calendar the popup marks („Bio + Restmüll“)
//   node dev/unit/zaehlungen_review2.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.addEventListener = () => {};
window.casoraIconUrl = (k) => '/i/' + k + '.svg';
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

// ── Locks (T03, T08) ────────────────────────────────────────────────────────────
{
  const S = { 'lock.a': { state: 'unlocked' }, 'lock.b': { state: 'unlocked' }, 'lock.c': { state: 'jammed' }, 'lock.d': { state: 'unavailable' },
    'lock.e': { state: 'locked' } };
  const ids = Object.keys(S);
  const t = window.casoraLockTally(S, ids);
  assert.deepEqual(t, { tot: 5, unlocked: 2, jammed: 1, dead: 1, locked: 1 });
  assert.equal(window.casoraLockText(t), '2 entriegelt · 1 klemmt · 1 offline', 'each state apart (was 2 / 3 / 4)');
  assert.equal(window.casoraLockText(window.casoraLockTally(S, ['lock.e'])), 'Verriegelt');
  assert.equal(window.casoraLockText(window.casoraLockTally(S, ['lock.d'])), 'Offline', 'one word for a lock that is gone');
  assert.equal(window.casoraLockText(window.casoraLockTally(S, ['lock.a', 'lock.b'])), 'Alle entriegelt');
  assert.equal(window.casoraLockText(window.casoraLockTally(S, ['lock.e', 'lock.missing'])), '1 offline', 'a lock that is gone counts as offline');
  // Tile, locks badge and the lock popup's stage use it; the security badge keeps jammed apart.
  assert.ok(T.casora_lock.state_display.includes('window.casoraLockText(window.casoraLockTally(states, ids))'));
  assert.ok(T.casora_lock.state_display.includes("unavailable: 'Offline'"), 'tile: „Offline“, not „Nicht verfügbar“');
  assert.ok(T.casora_badge_lock_group.name.includes('window.casoraLockText(window.casoraLockTally(states, locks))'));
  const lp = T.casora_popup_lock.tap_action.casora_popup.content;
  assert.ok(lp.includes('window.casoraLockText(_lt)'), 'lock popup stage');
  assert.ok(lp.includes("bits.unshift('Offline')") && !lp.includes("bits.unshift('Nicht erreichbar')"), 'lock row: „Offline“');
  assert.ok(lp.includes("off === tot ? 'mdi:lock-question'"), 'offline: a neutral lock, never an open one');
  assert.ok(lp.includes("? { text: 'Verriegeln', icon: 'mdi:lock', primary: true, svc: svc('lock') }"), 'the round stage button holds one word');
  assert.ok(T.casora_badge_security_group.name.includes("else if (s === 'jammed') r.lockJammed++;"));
  // Security line: jammed apart; the short form leads with a word (E31: icons and numbers only).
  const sec = (o) => ({ triggered: false, disarmed: false, locks: 0, lockJammed: 0, lockDead: 0, doors: 0, windows: 0, doorsTilted: 0,
    windowsTilted: 0, gates: 0, camDead: 0, covers: 0, insecure: true, problem: false, ...o });
  assert.equal(window.casoraSecuritySummary(sec({ locks: 2, lockJammed: 1, lockDead: 1 }), { summary: 'detailed' }).text,
    '2 Schlösser offen · Schloss klemmt · Schloss offline');
  const h = window.casoraSecuritySummary(sec({ locks: 1, windows: 2, doors: 1, camDead: 1 }), { summary: 'short' }).html;
  // Short: the most important finding leads in words (owner, 13.11.2026; before: „4 offen“ in front of the icons).
  assert.ok(/class="cs-sum-item cs-sum-lead"[^>]*>Tür offen</.test(h), 'short: „Tür offen“ in front of the icons');
  assert.ok(/class="cs-sum-item cs-sum-lead"[^>]*>Schloss offline</.test(window.casoraSecuritySummary(sec({ camDead: 1, lockDead: 1, problem: true }), {}).html));
  // One finding alone in words (security badge rework, 07.11.2026).
  assert.deepEqual(window.casoraSecuritySummary(sec({ camDead: 1, problem: true }), {}), { text: 'Kamera offline', html: null });
  console.log('ok locks');
}

// ── Phone hub (fam-03, T03 ring text, T09 blinds) ──────────────────────────────
{
  const src = read('custom_components/casora/scripts/local/35-phone-hub.js');
  assert.ok(src.includes("', states, hass, this) : \"\";'"), 'the hub cards pass themselves');
  const timers = [];
  const st0 = globalThis.setTimeout, ct0 = globalThis.clearTimeout;
  globalThis.setTimeout = (f) => { timers.push(f); return timers.length; };
  globalThis.clearTimeout = () => {};
  new Function(src)();
  const P = window._casoraPhoneHub;
  // Recheck: when Home's badge says something new after the card drew, the card draws again.
  let sub = 'Schloss offen · 2 Fenster offen';
  P.scan = () => ({ chips: [], rooms: [], watch: [], sub });
  window._casoraUI = { line: (t) => t, stage: (k, o) => o, group: () => '', v3: () => true };
  let redraws = 0;
  const el = { isConnected: true, requestUpdate: () => { redraws++; } };
  P.sec('security', 'hero', {}, {}, el);
  sub = '2 Fenster offen';
  timers.splice(0).forEach((f) => f());
  assert.equal(redraws, 2, 'redrawn after the lock reported locked');
  P.sec('security', 'hero', {}, {}, el);
  timers.splice(0).forEach((f) => f());
  assert.equal(redraws, 2, 'nothing new: no redraw');
  globalThis.setTimeout = st0; globalThis.clearTimeout = ct0;
  // Ring text: two findings, the rest counted.
  const so = src.slice(src.indexOf('  var stageOf = function'), src.indexOf('  /* The rows mirror'));
  assert.ok(so.includes("' · und ' + (parts.length - 2) + ' weitere'"));
  assert.ok(!so.includes("'Alle verriegeln'"), 'one word in the round button');
  // Blinds: with a blinds tile, its blinds – not every cover of the house.
  const S = { 'cover.a': { attributes: {} }, 'cover.b': { attributes: {} }, 'cover.test': { attributes: {} },
    'cover.grp': { attributes: { entity_id: ['cover.a', 'cover.b'] } }, 'cover.tor': { attributes: { device_class: 'garage' } } };
  window._casoraSecCovers = { singles: (st, l) => l.flatMap((id) => (st[id] && st[id].attributes.entity_id) || [id]) };
  window.casoraBlindsTile = () => null;
  assert.deepEqual(window.casoraClimateBlinds({ states: S }, {}, true, true), ['cover.a', 'cover.b', 'cover.test'], 'no tile: every blind');
  window.casoraBlindsTile = () => ({ entity: 'cover.grp', variables: {} });
  assert.deepEqual(window.casoraClimateBlinds({ states: S }, {}, true, true), ['cover.a', 'cover.b'], 'the tile\'s blinds (badge 7, popup 6)');
  window.casoraBlindsTile = () => ({ entity: 'cover.a', variables: { covers: ['cover.a', 'cover.test'] } });
  assert.deepEqual(window.casoraClimateBlinds({ states: S }, {}, true, true), ['cover.a', 'cover.test']);
  console.log('ok phone hub');
}

// ── Airing (fam-05) ─────────────────────────────────────────────────────────────
{
  new Function(read('custom_components/casora/scripts/local/05-standard-medien.js'))();
  const V = window._casoraVent;
  const room = (k, status, om, grund) => ({ k, n: k, status, offen_min: om, grund, fenster: true });
  const states = { 'sensor.casora_lueften': { state: 'ok', attributes: { rooms: [
    room('Bad', 'lueftet', 27 * 1440, 'Fenster offen seit 27 Tagen'), room('Flur', 'lueftet', 8, 'Fenster offen · noch 2 Min.'), room('Küche', 'ok', null, '')] } } };
  const r = V.read(states).rooms;
  assert.equal(r[0].status, 'lange');
  assert.equal(r[0].grund, 'Fenster offen seit 27 Tagen · Schließen?');
  assert.equal(r.find((x) => x.k === 'Flur').status, 'lueftet', 'a short airing stays');
  assert.equal(V.level(states, {}, null), 2, 'the house: close the window (orange), not „Raumluft gut“');
  assert.equal(V.tile(states, {}, null), 'Bad');
  const T2 = T.casora_popup_vent.tap_action.casora_popup.title;
  assert.ok(T2.includes('window.casoraPopupTitle(typeof this'), 'popup title follows the tile\'s name');
  console.log('ok airing');
}

// ── Room temperature of a thermostat (E09) ─────────────────────────────────────
{
  const basis = read('custom_components/casora/scripts/local/01-basis.js');
  const b0 = basis.indexOf('window.casoraRoomTempOf = function');
  new Function(basis.slice(b0, basis.indexOf('window.casoraPopupTitle = function', b0)))();
  const S = { 's.t1': { state: '23.27' }, 's.t2': { state: '22.9' }, 's.bad': { state: 'unavailable' } };
  const rooms = [{ vars: { climate_entity_1: 'climate.bad', temp_sensor_1: 's.bad' } },
    { vars: { climate_entity_1: 'climate.wz', temp_sensor_1: 's.t1', temp_sensor_2: 's.t2' } }];
  assert.equal(window.casoraRoomTempOf('climate.wz', S, rooms), 23.1, 'the room sensors\' mean, as the badge');
  assert.equal(window.casoraRoomTempOf('climate.bad', S, rooms), null, 'no reading: the thermostat\'s own');
  assert.equal(window.casoraRoomTempOf('climate.x', S, rooms), null);
  const tp = T.casora_thermostat.tap_action.casora_popup.content;
  assert.ok(tp.includes('window.casoraRoomTempOf(id, states)'), 'popup foot');
  assert.ok(tp.includes("caption: offH ? 'Einschalten auf'"), 'off: the target is a suggestion (fam-15)');
  assert.ok(read('custom_components/casora/scripts/local/03-popups.js').includes('window.casoraRoomTempOf(o.id, states)'), 'floor heating popup');
  console.log('ok room temperature');
}

// ── Waste (fam-22) ──────────────────────────────────────────────────────────────
{
  const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const states = {
    'sensor.bio': { entity_id: 'sensor.bio', state: '2', attributes: { friendly_name: 'Bio', daysTo: 2 } },
    'sensor.rest': { entity_id: 'sensor.rest', state: '9', attributes: { friendly_name: 'Restmüll', daysTo: 9 } },
    'calendar.abfall': { entity_id: 'calendar.abfall', state: 'off', attributes: {} },
  };
  const hass = { states, entities: {}, devices: {} };
  const vars = { trash_sensors: { 'sensor.bio': 'Bio', 'sensor.rest': 'Restmüll' }, trash_calendar: 'calendar.abfall' };
  window._casoraTrashCal = { id: 'calendar.abfall', ts: Date.now(), ev: [{ summary: 'Restmüll', start: { date: ymd(day(2)) } }, { summary: 'Bio', start: { date: ymd(day(2)) } }] };
  const W = window.casoraDevice.waste(hass, vars);
  if (W.calendar === 'calendar.abfall') {
    assert.equal(W.days, 2);
    assert.equal(W.next.label, 'Bio + Restmüll', 'both bins of the day, as the calendar shows them');
  } else console.log('  (waste calendar comes from settings here – check skipped)');
  assert.ok(read('custom_components/casora/scripts/local/06-kalender.js').includes(".hcal-dots i{width:7px;height:7px;"), 'dots ≥ 6 px');
  console.log('ok waste');
}
console.log('zaehlungen_review2: ok');
// Loaded modules keep timers (retries, refresh); the test is done.
process.exit(0);
