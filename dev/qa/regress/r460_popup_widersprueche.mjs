// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/18-ziele.js custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/local/05-standard-medien.js custom_components/casora/scripts/local/09-weich-wiedergabe.js
// Popups that contradict themselves (01.11.2026, issues #103, #104, #106 and the media popup): one popup said
// „Seit 15:25“ in the head and „Seit 18:14“ in the dial, „Geschlossen“ in the dial and „Geöffnet“ as the newest
// history row, the same reading in the head and in the list, the eyebrow repeated the title, ring, bar and play
// button of the media stage had three different colours.
//
// For every popup reachable in the test house (tile popups as dev/qa/popup-inhalt.mjs enumerates them, one per
// template + domain, on every desktop view and every phone overlay of input_select.casora_mobile_filter; plus the
// measure/history popup of one toggled and one untouched entity per two-state kind), desktop and phone:
//   zustand   the state word of head, stage/dial, the tile it was opened from and the newest history row describe
//             the same current state (words from window.casoraStateWord / the history's own word list); in any other
//             popup head, stage and tile do not name two different Casora state words („Bereit“ vs „Fehlgeschlagen“)
//   zeit      every „Seit …“/„vor N Min.“ in head and stage names the same moment, which is the entity's
//             last_changed (after HA's start: no „Seit“ at all, the start is not a change)
//   doppelt   a reading (number + unit) of the head line is not repeated in the stage or a list of the same popup;
//             the eyebrow is not the title
//   verlauf   the entities are toggled via REST before (3 changes, ~1.5 s apart); the newest history row is the
//             current state, its time is last_changed, the „Letzte 24 Std.“ values (count, total, longest) match
//             the recorder history fetched independently via REST
//   farbe     ring, progress bar fill and play button of the media stage share one accent (a playing player gets a
//             duration via REST and its popup is opened directly)
//
// Known open findings: KNOWN below (issue number + popup/rule pattern). A known finding prints „bekannt #N“ and does
// not fail the test; one that no longer occurs prints „bekannt #N nicht mehr gesehen – Eintrag entfernen“.
// CASORA_QA_STRENG=1 treats known findings as failures. When the issue is fixed: delete its KNOWN entries, then the
// rule is strict for those popups too.
// Debugging: R460_NUR='<regex on popup name>', R460_VIEWS=desktop|handy, R460_DUMP=1 (snapshot of each popup as JSON).
// Gate: CASORA_QA_DASH=qa-arbeit (the gate sets it); about 9 min.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const KNOWN = [
  // Stage „Seit …“ of the history popup and the head's „Seit …“/„Vor N Min.“ name HA's start as a change; the newest
  // history row names the start of the 24 h window as a change (window popup of #106: head 15:25, dial 18:14).
  { issue: 106, popup: /^(verlauf|verlauf-alt|kachel):/, rule: 'zeit', text: /nennt HAs Start/ },
  { issue: 106, popup: /^verlauf-alt:/, rule: 'verlauf', text: /Beginn des 24-Std\.-Zeitraums/ },
  // Group badge popups (phone) take their head time from the UI helper the tile is bound to.
  { issue: 106, popup: /^kachel:casora_badge_\w+_group/, rule: 'zeit', text: /Bedien-Helfers/ },
];
const STRICT = process.env.CASORA_QA_STRENG === '1';

// ── REST ────────────────────────────────────────────────────────────────────
let tok = null;
const api = async (method, p, body) => {
  if (!tok) tok = (await tokens()).access_token;
  const r = await fetch(BASE + '/api/' + p, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(method + ' ' + p + ' → ' + r.status);
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
let HA_START = 0;
const BAD = (s) => s == null || s === 'unknown' || s === 'unavailable';

// One entity per two-state kind: [label, filter, active, idle, preferred id]. Otherwise the first fitting one by id
// with a real state (no ids of the private test house in the repo).
const KINDS = [
  ['fenster', (x) => /^binary_sensor\./.test(x.entity_id) && x.attributes.device_class === 'window', 'on', 'off', null],
  ['tuer', (x) => /^binary_sensor\./.test(x.entity_id) && x.attributes.device_class === 'door', 'on', 'off', null],
  ['bewegung', (x) => /^binary_sensor\./.test(x.entity_id) && /^(motion|occupancy)$/.test(x.attributes.device_class || ''), 'on', 'off', null],
  ['schalter', (x) => /^switch\./.test(x.entity_id) && !x.attributes.device_class, 'on', 'off', null],
  ['licht', (x) => /^light\./.test(x.entity_id) && !Array.isArray(x.attributes.entity_id), 'on', 'off', null],
  ['schloss', (x) => /^lock\./.test(x.entity_id), 'unlocked', 'locked', null],
  ['rollo', (x) => /^cover\./.test(x.entity_id) && !Array.isArray(x.attributes.entity_id), 'open', 'closed', null],
  ['helfer', (x) => /^input_boolean\./.test(x.entity_id) && !/casora_/.test(x.entity_id), 'on', 'off', null],
  ['person', (x) => /^person\./.test(x.entity_id), 'home', 'not_home', null],
  ['tracker', (x) => /^device_tracker\./.test(x.entity_id), 'home', 'not_home', null],
];

const all = (await api('GET', 'states')).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
const byId = Object.fromEntries(all.map((x) => [x.entity_id, x]));
const picked = [], untouched = [];
for (const [kind, fit, on, off, pref] of KINDS) {
  const x = (pref && byId[pref] && fit(byId[pref]) && byId[pref]) || all.find((y) => fit(y) && !BAD(y.state)) || all.find(fit);
  if (x) picked.push({ kind, id: x.entity_id, on, off, orig: { state: x.state, attributes: x.attributes } });
  // A second one stays untouched: its last change is HA's start while the recorder knows the real one (issue #106).
  const y = all.find((z) => z !== x && fit(z) && !BAD(z.state));
  if (y) untouched.push({ kind, id: y.entity_id, on, off });
}
await need('Zweizustands-Entitäten im Testhaus', picked.length >= 6, picked.map((p) => p.id));
atFinish(async () => { for (const p of picked) await api('POST', 'states/' + p.id, p.orig).catch(() => {}); });
// Tapping group badges expands rows (input_select.casora_*), back to how they were.
const uiHelpers = all.filter((x) => /^input_(select|boolean)\.casora_/.test(x.entity_id)).map((x) => [x.entity_id, x.state]);
atFinish(async () => {
  const now = Object.fromEntries((await api('GET', 'states')).map((x) => [x.entity_id, x.state]));
  for (const [id, st] of uiHelpers) {
    if (now[id] === st) continue;
    if (/^input_select/.test(id)) await api('POST', 'services/input_select/select_option', { entity_id: id, option: st }).catch(() => {});
    else await api('POST', 'services/input_boolean/turn_' + (st === 'on' ? 'on' : 'off'), { entity_id: id }).catch(() => {});
  }
});

// HA's start: the minute most entities share as last_changed (Casora UI helpers left out, as casoraSinceMs does).
// casoraSinceMs takes the start minute and the minutes around it (2 before, 3 after) for the start: on a fresh test HA
// the toggles wait until that window is over, otherwise the test's own changes would read as HA's start.
{
  const m = {};
  for (const x of all) {
    if (/^input_\w+\.casora_/.test(x.entity_id)) continue;
    const k = Math.floor(Date.parse(x.last_changed) / 60e3); m[k] = (m[k] || 0) + 1;
  }
  HA_START = +Object.entries(m).sort((a, b) => b[1] - a[1])[0][0] * 60e3;
  const wait = HA_START + 5 * 60e3 - Date.now();
  if (wait > 0) { console.log(`  info   HA erst ${hm(HA_START)} gestartet – warte ${Math.round(wait / 1000)} s`); await sleep(wait); }
}
// Toggle every picked entity three times; it ends in the state opposite to the one it had (so last_changed is fresh
// and differs from HA's start). Writes go to the state machine (and the recorder), like an integration would.
const t0 = Date.now();
for (let step = 0; step < 3; step++) {
  for (const p of picked) {
    const startOn = p.orig.state === p.on;
    const val = (step % 2 === 0) === startOn ? p.off : p.on;
    // A cover's position says open/closed too: keep it in line with the state.
    const attrs = /^cover\./.test(p.id) && p.orig.attributes.current_position != null ? { ...p.orig.attributes, current_position: val === p.on ? 100 : 0 } : p.orig.attributes;
    await api('POST', 'states/' + p.id, { state: val, attributes: attrs });
  }
  await sleep(1500);
}
await sleep(2500); // recorder commit (1 s) with margin

// A playing player with a duration, so the media stage draws ring, progress bar and play button together.
const media0 = all.find((x) => /^media_player\./.test(x.entity_id) && x.state === 'playing');
const mediaId = media0 ? media0.entity_id : null;
if (media0) {
  await api('POST', 'states/' + mediaId, { state: 'playing', attributes: { ...media0.attributes, media_duration: 240, media_position: 60,
    media_position_updated_at: new Date().toISOString() } });
  atFinish(async () => { await api('POST', 'states/' + mediaId, { state: media0.state, attributes: media0.attributes }).catch(() => {}); });
}

// Independent 24 h numbers from the recorder: count of active periods, total and longest active time (ms).
const recStats = async (p, now) => {
  const start = new Date(now - 864e5).toISOString();
  const h = await api('GET', 'history/period/' + start + '?filter_entity_id=' + p.id + '&minimal_response&no_attributes');
  const rows = (h[0] || []).map((r) => ({ s: r.state, t: Date.parse(r.last_changed) })).filter((r) => !BAD(r.s));
  const segs = [];
  for (const r of rows) { const l = segs[segs.length - 1]; if (l && l.s === r.s) continue; if (l) l.end = r.t; segs.push({ s: r.s, start: Math.max(r.t, now - 864e5), end: null }); }
  const act = segs.filter((x) => x.s === p.on);
  const len = (x) => (x.end || now) - x.start;
  return { segs, count: act.length, total: act.reduce((a, x) => a + len(x), 0), longest: act.reduce((a, x) => Math.max(a, len(x)), 0) };
};

// ── in the browser ────────────────────────────────────────────────────────────
// Snapshot of the open Casora popup: head, stage, timeline, „Letzte 24 Std.“ rows, all visible texts of the content,
// the media stage's colours, and the word list for the popup's entity.
const SNAP = ([eid0, tileWord]) => {
  const P = window.casoraPopup, s = P && P.surface, E = P && P.element;
  if (!s || !E) return null;
  const h = document.querySelector('home-assistant').hass;
  const txt = (e) => (e ? String(e.textContent || '').replace(/[​]/g, '').replace(/\s+/g, ' ').trim() : '');
  const vis = (e) => !!e && e.getClientRects().length > 0 && (!e.checkVisibility || e.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true }));
  const els = [];
  (function walk(n) { for (const ch of n.children || []) { els.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } })(s);
  const loading = els.some((e) => e.childElementCount === 0 && /Wird geladen/.test(e.textContent || '') && vis(e));
  const hs = s.querySelector('.header-status');
  const head = { eyebrow: txt(s.querySelector('.header-eyebrow')), title: txt(s.querySelector('.header-title')), status: vis(hs) ? txt(hs) : '' };
  const content = s.querySelector('.content');
  const inContent = (e) => content && (content.contains(e) || (e.getRootNode() !== document && (() => { let n = e; while (n) { const r = n.getRootNode(); if (r === document) return false; if (content.contains(r.host)) return true; n = r.host; } return false; })()));
  // stage: the first visible dial centre or stage
  const stageEl = els.find((e) => e.classList && (e.classList.contains('hui-stage')) && vis(e)) || els.find((e) => e.classList && e.classList.contains('hui-dl-c') && vis(e));
  let stage = null;
  if (stageEl) {
    const q = (sel) => [...stageEl.querySelectorAll(sel)].filter(vis);
    const main = q('.hui-dl-c .hui-dl-t, .hui-dl-c .hui-st-val, .hui-st-head .hui-st-val, .hui-st-stat .hui-st-text')[0];
    const since = [];
    q('.hui-st-facts > div').forEach((f) => { const l = txt(f.querySelector('small')); if (/^(seit|since)$/i.test(l)) since.push(l + ' ' + txt(f.querySelector('b'))); });
    q('.hui-dl-w2, .hui-st-sub, .hui-st-w').forEach((w) => { const t = txt(w); if (/\b(seit|since|vor \d+ min|gerade eben)/i.test(t)) since.push(t); });
    stage = { main: txt(main), since, kind: stageEl.getAttribute('data-casora-stage') || '' };
  }
  // timeline rows (newest first)
  const tl = els.filter((e) => e.classList && e.classList.contains('cz-dot') && vis(e)).map((d) => {
    const row = d.parentElement && d.parentElement.parentElement;
    const c = row ? row.children : [];
    const tcell = c[0], body = c[2];
    return { time: tcell ? txt(tcell) : '', title: body && body.children[0] ? txt(body.children[0]) : '', sub: body && body.children[1] ? txt(body.children[1]) : '', on: d.classList.contains('on') };
  });
  // „Letzte 24 Std.“ group rows: [label, value]
  const stats = [];
  const lbl = els.find((e) => e.childElementCount === 0 && /^(Letzte 24 Std\.|Last 24 h)/.test(txt(e)) && vis(e));
  if (lbl) {
    let grp = lbl.closest('.hui-slbl');
    grp = grp ? grp.parentElement : lbl.parentElement;
    [...grp.querySelectorAll('.hui-row, .hui-srow')].filter(vis).forEach((r) => {
      const leaves = [...r.querySelectorAll('*')].filter((k) => !k.children.length && vis(k) && txt(k)).map(txt);
      if (leaves.length) stats.push(leaves);
    });
  }
  // visible text leaves of the content (for duplicate readings), outside the head
  const leaves = els.filter((e) => inContent(e) && e.childElementCount === 0 && vis(e) && txt(e) && !e.closest('style,script')).map(txt);
  // media stage colours: ring stroke, progress fill, play button
  const colour = (e, props) => { if (!e) return null; const c = getComputedStyle(e); for (const p of props) { const v = c[p]; if (v && !/rgba\(0, 0, 0, 0\)|transparent|none/.test(v)) return v; } return null; };
  // Media stage (dial S1 with the player under it): ring fill, progress fill and the large play/pause button.
  let media = null;
  const mStage = els.find((e) => e.classList && e.classList.contains('hui-stage') && vis(e) && e.querySelector('.hm-ctl'));
  if (mStage) {
    const ring = [...mStage.querySelectorAll('.hui-dl path.fl.ln')].find((c) => getComputedStyle(c).display !== 'none');
    const prog = mStage.querySelector('.hm-prog');
    const bar = prog && getComputedStyle(prog).visibility !== 'hidden' ? [...mStage.querySelectorAll('.hm-track *')].find((x) => vis(x) && colour(x, ['backgroundColor'])) : null;
    const play = [...mStage.querySelectorAll('.hm-b.lg')].find(vis);
    media = { ring: colour(ring, ['stroke']), bar: colour(bar, ['backgroundColor']), play: colour(play, ['backgroundColor']) };
  }
  // entity + words
  const eid = eid0 || P.entity || (E._ringSrc && E._ringSrc._stateObj && E._ringSrc._stateObj.entity_id) || '';
  const cur = eid && h.states[eid];
  const Z = window._casoraZiele;
  const wordsOf = (state) => {
    if (!cur) return [];
    const st = { ...cur, state };
    const out = new Set();
    try { const w = window.casoraStateWord(h, st); if (w) out.add(w); } catch (e) { /* none */ }
    try { if (Z && Z.stateWord) out.add(Z.stateWord({ ...h, states: { ...h.states, [eid]: st } }, eid, state)); } catch (e) { /* none */ }
    try { if (window._casoraStateText) out.add(window._casoraStateText(h, st)); } catch (e) { /* none */ }
    return [...out].filter((x) => x && x.length < 30);
  };
  const last = cur ? Date.parse(cur.last_changed) : NaN;
  // Casora's own words for common raw states (any domain): two of them side by side in one popup contradict.
  const RAWS = ['on', 'off', 'open', 'closed', 'locked', 'unlocked', 'home', 'not_home', 'idle', 'ready', 'playing', 'paused', 'failed',
    'finished', 'done', 'running', 'printing', 'standby', 'cleaning', 'docked', 'returning', 'mowing', 'heating', 'cooling', 'disarmed', 'triggered',
    'armed_home', 'armed_away', 'armed_night', 'charging', 'discharging', 'error', 'offline', 'online'];
  const tr = (x) => (window.casoraTr ? window.casoraTr(x) : x);
  const vocab = [...new Set(RAWS.map((r) => (window._casoraRawWord ? window._casoraRawWord(r) : r)).filter((w, i) => w && w !== RAWS[i]).map(tr))];
  return { eid, state: cur ? cur.state : null, vocab, last, now: Date.now(), loading, head, stage, tl, stats, leaves, media, tileWord,
    words: cur ? Object.fromEntries([...new Set([cur.state, 'on', 'off', 'open', 'closed', 'locked', 'unlocked', 'home', 'not_home', 'playing', 'paused', 'idle'])].map((x) => [x, wordsOf(x)])) : {},
    group: !!(cur && Array.isArray((cur.attributes || {}).entity_id)) };
};

const DOMAIN_STATES = { binary_sensor: ['on', 'off'], switch: ['on', 'off'], light: ['on', 'off'], input_boolean: ['on', 'off'], fan: ['on', 'off'],
  lock: ['locked', 'unlocked'], cover: ['open', 'closed'], person: ['home', 'not_home'], device_tracker: ['home', 'not_home'], media_player: ['playing', 'paused', 'off', 'idle'] };

// ── rules (Node side) ────────────────────────────────────────────────────────
const norm = (t) => String(t || '').toLowerCase().replace(/[\s  ]+/g, ' ').trim();
const hasWord = (text, w) => { const n = norm(text), x = norm(w); if (!x) return false; const i = n.indexOf(x); if (i < 0) return false;
  const a = n[i - 1], b = n[i + x.length]; return !(a && /[a-zäöüß]/.test(a)) && !(b && /[a-zäöüß]/.test(b)); };
// A „Seit …“ text → the moment it names (ms), or null. Ranges for „vor N Min.“ (rounded).
const parseSince = (t, now) => {
  const s = norm(t);
  if (/gerade eben|just now/.test(s)) return { lo: now - 90e3, hi: now };
  let m = s.match(/vor (\d+) min|(\d+) min\.? ago/);
  if (m) { const n = +(m[1] || m[2]); return { lo: now - (n + 1) * 60e3, hi: now - Math.max(0, n - 1) * 60e3 }; }
  m = s.match(/(gestern|yesterday)?\s*(\d{1,2}):(\d{2})/);
  if (m) { const d = new Date(now); d.setHours(+m[2], +m[3], 0, 0); if (m[1] || d.getTime() > now + 60e3) d.setDate(d.getDate() - 1); return { lo: d.getTime(), hi: d.getTime() + 60e3 }; }
  m = s.match(/(\d{1,2})\.(\d{1,2})\./);
  if (m) { const d = new Date(now); d.setMonth(+m[2] - 1, +m[1]); d.setHours(0, 0, 0, 0); if (d.getTime() > now) d.setFullYear(d.getFullYear() - 1); return { lo: d.getTime(), hi: d.getTime() + 864e5 }; }
  return null;
};
// „1 Std. 5 Min.“ / „12 Min.“ / „3 Tage“ → ms
const parseDur = (t) => { const s = norm(t); let ms = 0, hit = false;
  for (const [re, f] of [[/(\d+) tage?/, 864e5], [/(\d+) std/, 36e5], [/(\d+) min/, 6e4]]) { const m = s.match(re); if (m) { ms += +m[1] * f; hit = true; } }
  return hit ? ms : null; };
const READING = /(?<![\d,.])-?\d+(?:[.,]\d+)?\s?(?:%|°C|°F|°|kWh|kW|W|lx|ppm|µg\/m³|hPa|mbar|V|A|mm|dB)(?![\wäöü])/g;

const findings = [];
const evaluate = (popup, view, s, rec) => {
  const out = [];
  const add = (rule, msg) => out.push({ popup, view, rule, msg });
  const dom = (s.eid || '').split('.')[0];
  const now = s.now;
  // doppelt: eyebrow ≠ title
  if (s.head.eyebrow && norm(s.head.eyebrow) === norm(s.head.title)) add('doppelt', `Etikett wiederholt den Titel: „${s.head.eyebrow}“`);
  // doppelt: a reading of the head line again in the content
  const headReadings = (s.head.status.match(READING) || []).map(norm);
  if (headReadings.length) {
    for (const r of new Set(headReadings)) {
      const again = s.leaves.filter((l) => (l.match(READING) || []).map(norm).includes(r));
      if (again.length) add('doppelt', `Kopfzeile „${s.head.status}“ und Inhalt „${again[0]}“ zeigen beide ${r}`);
    }
  }
  // zustand: only for single entities of a two-state (or media) domain
  const states = DOMAIN_STATES[dom];
  if (states && s.state && !BAD(s.state) && !s.group) {
    const cur = new Set((s.words[s.state] || []).map(norm));
    const other = new Set(states.filter((x) => x !== s.state).flatMap((x) => s.words[x] || []).map(norm).filter((w) => w && !cur.has(w)));
    const say = (where, text) => {
      if (!text) return;
      const o = [...other].filter((w) => hasWord(text, w)), c = [...cur].filter((w) => hasWord(text, w));
      if (o.length && !c.length) add('zustand', `${where} „${text}“ sagt ${o[0]}, Zustand ist ${s.state} (${[...cur][0] || '?'})`);
    };
    say('Kopfzeile', s.head.status);
    if (s.stage) say('Bühne', s.stage.main);
    say('Kachel', s.tileWord);
    if (s.tl.length) {
      const n = norm(s.tl[0].title);
      if (!cur.has(n) && [...other].includes(n)) add('zustand', `neueste Verlaufszeile „${s.tl[0].title}“ (${s.tl[0].time}), Zustand ist ${s.state} (${[...cur][0] || '?'})`);
    }
  }
  // zustand (any popup): head, stage and tile each name one of Casora's state words – they must be the same word
  if (s.vocab && s.vocab.length && !(DOMAIN_STATES[dom] && !s.group)) {
    const V = new Map(s.vocab.map((w) => [norm(w), w]));
    const firstWord = (t) => { const p = norm(String(t || '').split('·')[0]); return V.has(p) ? p : null; };
    const parts = [['Kopfzeile', s.head.status], ['Bühne', s.stage && s.stage.main], ['Kachel', s.tileWord]].map(([w, t]) => [w, t, firstWord(t)]).filter((x) => x[2]);
    for (let i = 1; i < parts.length; i++) if (parts[i][2] !== parts[0][2]) add('zustand', `${parts[0][0]} „${parts[0][1]}“ ≠ ${parts[i][0]} „${parts[i][1]}“`);
  }
  // zeit: every „Seit“ in head and stage the same moment = last_changed (none at HA's start)
  const sinces = [];
  if (/\b(seit|since)\b|vor \d+ min|gerade eben/i.test(s.head.status)) {
    const m = s.head.status.match(/(seit|since)\s+[^·|]+|vor \d+ min\.?|gerade eben/i);
    if (m) sinces.push(['Kopfzeile', m[0]]);
  }
  for (const t of (s.stage && s.stage.since) || []) sinces.push(['Bühne', t]);
  const atStart = isFinite(s.last) && s.last >= HA_START - 120e3 && s.last < HA_START + 240e3;
  const parsed = sinces.map(([w, t]) => [w, t, parseSince(t, now)]).filter((x) => x[2]);
  for (let i = 1; i < parsed.length; i++) {
    const a = parsed[0][2], b = parsed[i][2];
    if (b.hi < a.lo - 60e3 || b.lo > a.hi + 60e3) add('zeit', `${parsed[0][0]} „${parsed[0][1]}“ ≠ ${parsed[i][0]} „${parsed[i][1]}“`);
  }
  // A Casora UI helper (expanded row, phone filter) is no device: its last change says nothing about the popup.
  if (/^input_\w+\.casora_/.test(s.eid)) for (const [w, t] of parsed) add('zeit', `${w} „${t}“ ist die letzte Änderung des Bedien-Helfers ${s.eid}`);
  else if (isFinite(s.last) && !s.group && s.eid) {
    for (const [w, t, r] of parsed) {
      if (atStart) add('zeit', `${w} „${t}“ nennt HAs Start (${hm(HA_START)}) als Änderung`);
      else if (r.hi < s.last - 60e3 || r.lo > s.last + 60e3) add('zeit', `${w} „${t}“, letzte Änderung war ${hm(s.last)}`);
    }
  }
  // verlauf: newest row = current state, its time = last_changed; stats = recorder
  if (rec && s.tl.length) {
    const top = s.tl[0];
    const tm = parseSince(top.time, now);
    // At HA's start last_changed is the start, not a change: then the recorder's time is the truth and not checked here.
    if (tm && isFinite(s.last) && !atStart && (tm.hi < s.last - 60e3 || tm.lo > s.last + 60e3)) add('verlauf', `neueste Verlaufszeile „${top.title}“ um ${top.time}, letzte Änderung war ${hm(s.last)}`);
    // Each row is a change; the start of the 24 h window is none (the state was already so before).
    for (const r of s.tl) { const t = parseSince(r.time, now); if (t && Math.abs(t.lo - (now - 864e5)) < 120e3) add('verlauf', `Verlaufszeile „${r.title}“ nennt den Beginn des 24-Std.-Zeitraums als Änderung`); }
    if (!/seitdem|since then|^$/i.test(top.sub)) add('verlauf', `neueste Verlaufszeile „${top.title}“ sagt „${top.sub}“ statt „seitdem“`);
    // rows alternate
    for (let i = 1; i < s.tl.length; i++) if (norm(s.tl[i].title) === norm(s.tl[i - 1].title)) add('verlauf', `zwei Verlaufszeilen nacheinander „${s.tl[i].title}“ (${s.tl[i - 1].time}, ${s.tl[i].time})`);
    // active rows filled, idle rows ring (issue 104)
    const onWords = new Set((s.words[rec.on] || []).map(norm));
    for (const r of s.tl) if (onWords.has(norm(r.title)) !== r.on) add('verlauf', `Verlaufszeile „${r.title}“ (${r.time}) ${r.on ? 'gefüllt' : 'leer'} gezeichnet`);
    const st = rec.stats;
    if (st && s.stats.length) {
      const val = (re) => { const row = s.stats.find((l) => re.test(norm(l[0]))); return row ? row[row.length - 1] : null; };
      if (dom === 'binary_sensor') {
        const cnt = val(/./); // first row: count „3×“
        const n = cnt && cnt.match(/(\d+)\s*×/);
        if (n && +n[1] !== st.count) add('verlauf', `„${s.stats[0][0]}“ zeigt ${cnt}, Recorder: ${st.count}× aktiv in 24 Std.`);
        const tot = val(/^insgesamt/), lng = val(/^am längsten|^longest/);
        const chk = (label, shown, ms) => {
          if (shown == null) return;
          const d = parseDur(shown);
          if (shown === '–' ? ms >= 60e3 : d == null ? true : Math.abs(d - Math.max(60e3, ms)) > Math.max(61e3, ms * 0.02)) add('verlauf', `${label} zeigt „${shown}“, Recorder: ${Math.round(ms / 6e4)} Min.`);
        };
        chk('Insgesamt', tot, st.total);
        chk('Am längsten', lng, st.longest);
      } else {
        const ch = val(/^änderungen|^changes/);
        if (ch != null && +ch !== Math.max(0, st.segs.length - 1)) add('verlauf', `„Änderungen“ zeigt ${ch}, Recorder: ${Math.max(0, st.segs.length - 1)}`);
      }
    }
  }
  // farbe: media stage
  if (s.media) {
    const vals = Object.entries(s.media).filter(([, v]) => v);
    const distinct = new Set(vals.map(([, v]) => v.replace(/\s+/g, '')));
    if (vals.length >= 2 && distinct.size > 1) add('farbe', 'Medien-Bühne: ' + vals.map(([k, v]) => k + ' ' + v).join(', '));
  }
  return out;
};

// ── run ──────────────────────────────────────────────────────────────────────

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const VIEWS = { desktop: { width: 1440, height: 900 }, handy: { width: 393, height: 852, mobile: true, safari: true, scale: 3, phone: true } };
const SKIP = /^casora_(badge_scene\b|notifications_button|scene|script|button|toggle|switch_tap|favorite|room|menu_icon|settings_button|nav|chip|assist_button|mobile_(nav|room|filter|header|chrome|weather))/;
const popupKey = (t) => t.filter((x) => /^casora_/.test(x) && x !== 'casora_entity' && x !== 'casora_default').join('+');
let popups = 0;
const popupNames = new Set();

const popupOpen = (pg) => pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
const closeAll = async (pg) => {
  for (let i = 0; i < 4 && await popupOpen(pg); i++) {
    await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {});
    await pg.waitForTimeout(450);
  }
};
// Settled snapshot: the same (without the clock) for 1.2 s and nothing loading, at most 12 s.
const settled = async (pg, eid, tileWord) => {
  let last = '', since = Date.now(), v = null;
  for (const t0 = Date.now(); Date.now() - t0 < 12000; await pg.waitForTimeout(250)) {
    v = await pg.evaluate(SNAP, [eid, tileWord]).catch(() => null);
    if (!v) return null;
    const k = JSON.stringify({ ...v, now: 0, leaves: v.leaves.length });
    if (k !== last || v.loading) { last = k; since = Date.now(); } else if (Date.now() - since >= 1200) return v;
  }
  return v;
};

const ONLY = process.env.R460_NUR ? new RegExp(process.env.R460_NUR) : null;
const record = async (popup, view, s) => {
  if (!s) { console.log(`  info   ${view} ${popup}: kein Popup-Inhalt`); return; }
  if (process.env.R460_DUMP) console.log(JSON.stringify({ popup, view, ...s, words: undefined, leaves: s.leaves.slice(0, 30) }));
  popups++; popupNames.add(popup);
  const p = picked.find((x) => x.id === s.eid) || untouched.find((x) => x.id === s.eid);
  let rec = null;
  if (p) rec = { on: p.on, stats: await recStats(p, s.now) };
  const fs0 = evaluate(popup, view, s, rec);
  for (const f of fs0) findings.push(f);
  console.log(`  info   ${view} ${popup}: ${fs0.length} Befunde`);
};

for (const vn of Object.keys(VIEWS).filter((v) => !process.env.R460_VIEWS || process.env.R460_VIEWS.split(',').includes(v))) {
  const V = VIEWS[vn];
  const { page } = await open({ ...V, dark: false });
  const dUrl = V.phone && dash.phone ? dash.phone.url : dash.url;
  const dCfg = V.phone && dash.phone ? dash.phone.config : dash.config;
  const views = (dCfg.views || []).map((v, i) => v.path || String(i));
  const done = new Set();
  // The phone dashboard has one view; its rooms and categories are overlays chosen by input_select.casora_mobile_filter.
  const FILTER = 'input_select.casora_mobile_filter';
  const filters = V.phone && dash.phone && byId[FILTER] ? byId[FILTER].attributes.options || [] : [null];
  const steps = V.phone && dash.phone ? filters.map((f) => [views[0], f]) : views.map((v) => [v, null]);
  let loaded = null;
  for (const [v, f] of steps) {
    if (loaded !== v) { await dashboard(page, dUrl + '/' + v, 3); loaded = v; }
    if (f) { await closeAll(page); await api('POST', 'services/input_select/select_option', { entity_id: FILTER, option: f }); await page.waitForTimeout(2500); }
    // Re-read the tiles after every tap: a group badge expands its row and shows further badges (temperature,
    // humidity: issue #103), which then get their turn.
    const tried = new Set();
    for (let guard = 0; guard < 120; guard++) {
      const tiles = await page.evaluate(() => window.__pierce('button-card').map((b, i) => {
        const t = [].concat((b._config || {}).template || []); const r = b.getBoundingClientRect();
        return { i, t, e: (b._config || {}).entity || '', w: r.width, h: r.height };
      }).filter((x) => x.w > 20 && x.h > 20 && x.t.some((y) => /^casora_/.test(y))));
      const tile = tiles.map((x) => { const k0 = popupKey(x.t); return { ...x, k0, key: k0 + (x.e ? ':' + x.e.split('.')[0] : '') }; })
        .find((x) => x.k0 && !SKIP.test(x.k0) && !done.has(x.key) && !tried.has(x.key + '|' + x.e) && !(ONLY && !ONLY.test('kachel:' + x.key)));
      if (!tile) break;
      const key = tile.key;
      tried.add(key + '|' + tile.e);
      if (process.env.R460_DUMP) console.log('  tile ' + key + ' ' + tile.e + ' ' + tile.w + 'x' + tile.h);
      const at = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; if (!b) return null; b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect(); const sr = b.shadowRoot, el = sr && sr.querySelector('#state');
        const vis = (n) => !!(n.getClientRects && n.getClientRects().length);
        const leaves = el ? [...el.querySelectorAll('*')].filter((k) => !k.children.length && vis(k) && String(k.textContent || '').trim()) : [];
        const word = el ? (leaves.length ? leaves.map((k) => String(k.textContent).trim()).join(' ') : String(el.textContent || '')).replace(/\s+/g, ' ').trim() : '';
        return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, word } : null; }, tile.i);
      if (!at) continue;
      await page.waitForTimeout(250);
      if (V.phone) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      let opened = false;
      for (let t1 = Date.now(); Date.now() - t1 < 3500; await page.waitForTimeout(200)) if (await popupOpen(page)) { opened = true; break; }
      if (!opened) { if (process.env.R460_DUMP) console.log('  ohne Popup ' + key + ' ' + tile.e + ' ' + await page.evaluate(() => location.pathname)); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500); continue; }
      done.add(key);
      const s = await settled(page, tile.e, at.word);
      await record('kachel:' + key, vn, s);
      await closeAll(page);
    }
  }
  // measure / history popups of the toggled entities (the window popup of #106 is one)
  await dashboard(page, dUrl + '/' + views[0], 3);
  for (const p of picked) {
    if (ONLY && !ONLY.test('verlauf:' + p.id)) continue;
    await closeAll(page);
    const ok = await page.evaluate((id) => !!(window._casoraZiele && window._casoraZiele.openMeasure(id)), p.id).catch(() => false);
    if (!ok) { findings.push({ popup: 'verlauf:' + p.id, view: vn, rule: 'öffnen', msg: 'Verlaufs-Popup ließ sich nicht öffnen' }); continue; }
    await page.waitForTimeout(600);
    await record('verlauf:' + p.id, vn, await settled(page, p.id, ''));
  }
  if (mediaId) {
    await closeAll(page);
    await page.evaluate((id) => window.casoraPopup.moreInfo(id), mediaId).catch(() => {});
    for (let t1 = Date.now(); Date.now() - t1 < 6000 && !await popupOpen(page); ) await page.waitForTimeout(200);
    await record('medien:' + mediaId, vn, await settled(page, mediaId, ''));
  }
  for (const p of untouched) {
    if (ONLY && !ONLY.test('verlauf-alt:' + p.id)) continue;
    await closeAll(page);
    if (!await page.evaluate((id) => !!(window._casoraZiele && window._casoraZiele.openMeasure(id)), p.id).catch(() => false)) continue;
    await page.waitForTimeout(600);
    await record('verlauf-alt:' + p.id, vn, await settled(page, p.id, ''));
  }
  await closeAll(page);
  await page.context().browser().close().catch(() => {});
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`  info   ${popups} Popups geprüft (${popupNames.size} verschiedene), Laufzeit ${Math.round((Date.now() - t0) / 1000)} s, umgeschaltet: ${picked.map((p) => p.id).join(', ')}`);
await check(`mindestens 20 Popups geprüft`, popups >= 20, popups);
// same finding on desktop and phone → one line with both views
const merged = new Map();
for (const f of findings) { const k = f.popup + '|' + f.rule + '|' + f.msg; const m = merged.get(k); if (m) m.views.push(f.view); else merged.set(k, { ...f, views: [f.view] }); }
const usedKnown = new Set();
let bad = 0;
for (const f of merged.values()) {
  const kn = KNOWN.find((k) => k.rule === f.rule && k.popup.test(f.popup) && (!k.text || k.text.test(f.msg)));
  const line = `${f.popup} [${f.views.join('+')}] ${f.rule}: ${f.msg}`;
  if (kn) { usedKnown.add(kn); if (!STRICT) { console.log(`  bekannt #${kn.issue} ${line}`); continue; } }
  bad++;
  await check(line, false);
}
for (const k of KNOWN) if (!usedKnown.has(k)) console.log(`  info   bekannt #${k.issue} (${k.rule}, ${k.popup}) nicht mehr gesehen – Eintrag in KNOWN entfernen`);
await check('keine widersprüchlichen Popups', bad === 0, bad + ' Befunde');
await finish();
