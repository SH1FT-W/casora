// Studio → Settings → „Live Activities“ (casora-panel-live.js) without a browser.  node dev/unit/studio_live.mjs
// Pure parts (subline per device, draft with deviations only, log line), the wiring into the
// settings page (PAGES entry, load/dirty/save, icon color, search, loader in __init__.py) and
// the German texts in translations/panel/de.json.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('translations/panel/de.json')).exact;

// ── Load module (without customElements: only the pure parts) ───────────────────────
const win = { casoraI18n: { t: (s) => de[s] || s } };
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, setAttribute() {}, appendChild() {} }) };
new Function('window', 'document', 'customElements', read('panel/casora-panel-live.js'))(win, doc, { whenDefined: () => ({ then() {} }) });
const M = win.__casoraStudioLive;
assert.ok(M && M.deviceSub && M.cleanDevices && M.draftOf && M.logLine, 'Bausteine fehlen');

// Subline: kind · source · grade (· state), translated
assert.equal(M.deviceSub({ kind: 'dishwasher', source: 'homeconnect_ws', grade: 'sehr gut', phase: 'off' }),
  'Geschirrspüler · Home Connect Local · Geprüft');
assert.equal(M.deviceSub({ kind: 'washer', source: 'home_connect_alt', grade: 'ungetestet', phase: null }),
  'Waschmaschine · Home Connect Alt · Ungetestet');
assert.equal(M.deviceSub({ kind: 'washer', source: 'washdata', grade: 'sehr gut', phase: 'run' }), 'Waschmaschine · WashData · Geprüft · Läuft');
assert.equal(M.deviceSub({ kind: 'printer', source: 'bambu_lab', grade: 'ungetestet', phase: null }), '3D-Drucker · Bambu Lab · Ungetestet');

// Draft: only deviations from the default, sorted – like live_activity.merge_settings
assert.deepEqual(M.cleanDevices({ b: { on: true, done_min: 10, quiet: true, interval_min: 10 }, a: { on: false, done_min: 60 } }),
  { a: { on: false, done_min: 60 } });
assert.equal(M.draftOf({ targets: ['notify.mobile_app_b', 'notify.mobile_app_a'], devices: { x: { on: true } } }),
  M.draftOf({ targets: ['notify.mobile_app_a', 'notify.mobile_app_b'], devices: {} }), 'Reihenfolge der Empfänger und Standardwerte ändern nichts');
assert.notEqual(M.draftOf({ targets: ['notify.mobile_app_a'], devices: {} }), M.draftOf({ targets: [], devices: {} }));
assert.deepEqual(M.settingsOf({ devices: { x: { quiet: false } } }, 'x'), { on: true, done_min: 10, quiet: false, interval_min: 10, color: 'auto' });
assert.deepEqual(M.settingsOf({ devices: {} }, 'y'), M.DEFAULTS);
// Color: "auto" is the default and is not saved; palette like live_activity.PALETTE
assert.deepEqual(M.cleanDevices({ a: { color: 'auto' }, b: { color: 'violet' } }), { b: { color: 'violet' } });
assert.deepEqual(Object.keys(M.COLORS), ['blue', 'teal', 'green', 'honey', 'orange', 'red', 'violet', 'rose']);
{
  const py = read('live_activity.py');
  for (const k of Object.keys(M.COLORS)) assert.ok(py.includes(`"${k}": "#`), 'Palette gleich in Python: ' + k);
}

// Log line: time, title · phase, text, progress; end without progress
const sent = M.logLine({ time: '2026-10-17T12:34:00+00:00', title: 'Waschmaschine Test', phase: 'run', message: 'Baumwolle 40 · Spülen · 58 %',
  progress: 58, silent: true, tag: 'casora-live-washer-abc' }, 'de-DE');
assert.equal(sent.title, 'Waschmaschine Test · Läuft');
assert.equal(sent.text, 'Baumwolle 40 · Spülen · 58 %');
assert.equal(sent.progress, '58%');
assert.ok(/^\d{2}:\d{2}$/.test(sent.time), 'Uhrzeit kurz: ' + sent.time);
const done = M.logLine({ time: '2026-10-17T12:40:00+00:00', title: 'W', phase: 'done', message: 'Fertig', progress: 100 }, 'de');
assert.equal(done.tone, 'ok');
const clear = M.logLine({ time: '2026-10-17T13:10:00+00:00', title: 'W', phase: 'clear', clear: true, progress: 100 }, 'de');
assert.equal(clear.title, 'W · Beendet');
assert.equal(clear.text, 'Live-Aktivität beendet');
assert.equal(clear.progress, '', 'Ende zeigt keinen Fortschritt');
assert.equal(M.logLine({ time: 'kaputt', title: 'W', phase: 'probe' }, 'de').time, '', 'ungültige Zeit bleibt leer');
assert.equal(M.logLine({ time: '2026-10-17T12:00:00+00:00', title: 'W · Probe', phase: 'probe' }, 'de').title, 'W · Probe', 'Probe-Titel nicht doppelt');

// ── Wiring ─────────────────────────────────────────────────────────────────────────
const settings = read('panel/casora-panel-settings.js');
assert.ok(/\{ id: "live", label: "Live Activities", icon: "iphone", tone: "set-live", live: true,/.test(settings), 'PAGES-Eintrag');
assert.ok(settings.indexOf('id: "live"') > settings.indexOf('id: "vent"') && settings.indexOf('id: "live"') < settings.indexOf('id: "fuel"'),
  'zwischen Lüften und Tanken');
assert.ok(/if \(typeof this\._csLiveLoad === "function"\) await this\._csLiveLoad\(cs\);/.test(settings), 'wird mit den Einstellungen geladen');
assert.ok(/liveDirty\(this\)/.test(settings) && /await this\._csLiveSave\(\);/.test(settings), 'ein Speichern für alles');
assert.ok(/if \(page\.live\) \{\s*if \(typeof this\._csFillLive === "function"\) this\._csFillLive\(host\);\s*return;/.test(settings), 'Seite füllt sich aus casora-panel-live.js');
const live = read('panel/casora-panel-live.js');
assert.ok(/callWS\(\{ type: "casora\/live\/get" \}\)/.test(live) && /type: "casora\/live\/set"/.test(live) && /type: "casora\/live\/probe"/.test(live), 'WS-Befehle');
assert.ok(/setAttribute\("role", "switch"\)/.test(live) && /ev\.stopPropagation\(\)/.test(live), 'Schalter je Gerät, öffnet nicht die Zeile');
assert.ok(/cs-note", t\("No phone with the Home Assistant app found/.test(live), 'Hinweis ohne HA-App-Empfänger');
assert.ok(/pb\.disabled = !!cs\.lvBusy \|\| unsaved \|\| !\(lv\.targets \|\| \[\]\)\.length;/.test(live), 'Probe nur mit gespeicherten Empfängern');
assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(live.replace(/\/\/.*$/gm, '')), 'keine festen Farben – nur Studio-Token');
assert.ok(/const runs = lv\.test_runs \|\| \{\};[\s\S]*if \(runDevs\.length\) \{[\s\S]*callService\("casora_mock", "live_lauf"/.test(live),
  'Testlauf-Knopf nur, wenn get test_runs liefert (Testhaus)');

// ── User tests 17.10. ──────────────────────────────────────────────────────────────
// Finding 1: off → save → on → save. Every device is saved in full (devices_replace),
// including "on" (the default) – otherwise the old "off" stayed on the server.
const L1 = { targets: [], devices: { a: { on: false } } };
assert.deepEqual(M.saveDevices(L1, ['a', 'b']), { a: { on: false, done_min: 10, quiet: true, interval_min: 10, color: 'auto' },
  b: { on: true, done_min: 10, quiet: true, interval_min: 10, color: 'auto' } });
L1.devices.a = { on: true };
assert.equal(M.saveDevices(L1, ['a']).a.on, true, 'wieder an wird mitgeschickt');
assert.ok(/type: "casora\/live\/set", targets: cs\.L\.targets, devices: saveDevices\(cs\.L, ids\), devices_replace: true/.test(live), 'set ersetzt die Geräte');
// Finding 3: phone (no split) redraws the page – tapping a device row opens its settings.
assert.ok(/P\._csRepaint = function \(\) \{[\s\S]{0,300}if \(this\._csOpen && this\.\$\("pane"\)\) this\._csRender\(\);/.test(settings), 'Neuzeichnen auch ohne split');
// Finding 8: sublines wrap
assert.ok(/\.cs-live-row \.rtext span[^"]*\{white-space:normal/.test(live), 'Geräte-Unterzeile bricht um');
// Finding 9: singular/plural
assert.equal(M.sentText(1), 'An ein Handy geschickt.');
assert.equal(M.sentText(2), 'An 2 Handys geschickt.');
// Finding 10: test run as its own block before the log, „Aktualisieren“ in the log header (not below the entries)
assert.ok(live.indexOf('header: t("Test run")') > 0 && live.indexOf('header: t("Test run")') < live.indexOf('header: t("Last sent")'), 'Testlauf vor Protokoll');
assert.ok(!/t\("Protocol"\)/.test(live) && /cs-live-refresh/.test(live), 'Aktualisieren im Kopf');
// Finding 11: per-device settings on the right in the row (optRow), not as casora-prow below
assert.equal((live.match(/optRow\(this, g,/g) || []).length, 4, 'vier Einstellungen mit Steuerung rechts');
// Finding 12: test run locked without saved recipients
assert.ok(/tb\.disabled = !!cs\.lvRun \|\| noTargets;/.test(live), 'Testlauf ohne Empfänger gesperrt');
const panel = read('panel/casora-panel.js');
assert.ok(/"set-live": \["energy", "var\(--casora-color-green, #30D158\)"\]/.test(panel), 'Symbolfarbe in STUDIO_ICON');
const mehr = read('panel/casora-panel-b-mehr.js');
assert.ok(/\["live", "Live Activities", "live aktivität aktivitäten sperrbildschirm/.test(mehr), 'über die Suche findbar');
const init = read('__init__.py');
assert.equal((init.match(/casora-panel-live\.js/g) || []).length, 2, 'in __init__.py an beiden Stellen (Stempel + Lader)');
assert.ok(/async_setup_live\(hass\)/.test(init) && /live\.stop\(\)/.test(init), 'Start und Stopp der Integration');

// ── Texts: everything t("…") uses in the module has a German version ───────────────────
const keys = new Set();
for (const m of live.matchAll(/\bt\("((?:[^"\\]|\\.)+)"\)/g)) keys.add(m[1].replace(/\\"/g, '"'));
for (const v of [...Object.values(M.KIND_LABEL), ...Object.values(M.GRADE_LABEL), ...Object.values(M.PHASE_LABEL)]) keys.add(v);
keys.add('Live Activities');
keys.add('Saved – live activities follow the devices from now on');
const missing = [...keys].filter((k) => !de[k]);
assert.deepEqual(missing, [], 'fehlende deutsche Texte');
assert.equal(de['Live Activities'], 'Live-Aktivitäten');
for (const k of keys) assert.ok(!/\bSie (können|haben|müssen|sollten|wählen|finden)\b|\bIhre?[nms]?\b/.test(de[k]), 'du-Form: ' + de[k]);
console.log('studio_live: ok (' + keys.size + ' Texte)');
// The page dropdown in the Studio (casora-panel-b.js) keeps its own list – „Live Activities“ must be there
// (17.10.: found via search, missing from the „Einstellungen“ menu).
assert.match(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b.js', import.meta.url), 'utf8'), /\["live", "Live Activities", "iphone"\]/, 'Dropdown kennt die Seite');
console.log('studio_live: Dropdown ok');
