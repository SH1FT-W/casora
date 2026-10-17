// Studio → Einstellungen → „Live Activities“ (casora-panel-live.js) ohne Browser.  node dev/unit/studio_live.mjs
// Reine Teile (Unterzeile je Gerät, Entwurf nur mit Abweichungen, Protokollzeile), die Anbindung an die
// Einstellungen-Seite (PAGES-Eintrag, Laden/Dirty/Speichern, Symbolfarbe, Suche, Lader in __init__.py) und
// die deutschen Texte in translations/panel/de.json.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('translations/panel/de.json')).exact;

// ── Modul laden (ohne customElements: nur die reinen Teile) ─────────────────────────
const win = { casoraI18n: { t: (s) => de[s] || s } };
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, setAttribute() {}, appendChild() {} }) };
new Function('window', 'document', 'customElements', read('panel/casora-panel-live.js'))(win, doc, { whenDefined: () => ({ then() {} }) });
const M = win.__casoraStudioLive;
assert.ok(M && M.deviceSub && M.cleanDevices && M.draftOf && M.logLine, 'Bausteine fehlen');

// Unterzeile: Art · Quelle · Stufe (· Zustand), übersetzt
assert.equal(M.deviceSub({ kind: 'dishwasher', source: 'home_connect_alt', grade: 'sehr gut', phase: 'off' }),
  'Geschirrspüler · Home Connect (HACS) · Geprüft');
assert.equal(M.deviceSub({ kind: 'washer', source: 'washdata', grade: 'sehr gut', phase: 'run' }), 'Waschmaschine · WashData · Geprüft · Läuft');
assert.equal(M.deviceSub({ kind: 'printer', source: 'bambu_lab', grade: 'ungetestet', phase: null }), '3D-Drucker · Bambu Lab · Ungetestet');

// Entwurf: nur Abweichungen vom Standard, sortiert – wie live_activity.merge_settings
assert.deepEqual(M.cleanDevices({ b: { on: true, done_min: 30, quiet: true, interval_min: 10 }, a: { on: false, done_min: 60 } }),
  { a: { on: false, done_min: 60 } });
assert.equal(M.draftOf({ targets: ['notify.mobile_app_b', 'notify.mobile_app_a'], devices: { x: { on: true } } }),
  M.draftOf({ targets: ['notify.mobile_app_a', 'notify.mobile_app_b'], devices: {} }), 'Reihenfolge der Empfänger und Standardwerte ändern nichts');
assert.notEqual(M.draftOf({ targets: ['notify.mobile_app_a'], devices: {} }), M.draftOf({ targets: [], devices: {} }));
assert.deepEqual(M.settingsOf({ devices: { x: { quiet: false } } }, 'x'), { on: true, done_min: 30, quiet: false, interval_min: 10 });
assert.deepEqual(M.settingsOf({ devices: {} }, 'y'), M.DEFAULTS);

// Protokollzeile: Zeit, Titel · Phase, Text, Fortschritt; Ende ohne Fortschritt
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

// ── Anbindung ──────────────────────────────────────────────────────────────────────
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
assert.ok(/const runs = lv\.test_runs \|\| \{\};[\s\S]*if \(!runDevs\.length\) return;[\s\S]*callService\("casora_mock", "live_lauf"/.test(live),
  'Testlauf-Knopf nur, wenn get test_runs liefert (Testhaus)');
const panel = read('panel/casora-panel.js');
assert.ok(/"set-live": \["energy", "var\(--casora-color-green, #30D158\)"\]/.test(panel), 'Symbolfarbe in STUDIO_ICON');
const mehr = read('panel/casora-panel-b-mehr.js');
assert.ok(/\["live", "Live Activities", "live aktivität aktivitäten sperrbildschirm/.test(mehr), 'über die Suche findbar');
const init = read('__init__.py');
assert.equal((init.match(/casora-panel-live\.js/g) || []).length, 2, 'in __init__.py an beiden Stellen (Stempel + Lader)');
assert.ok(/async_setup_live\(hass\)/.test(init) && /live\.stop\(\)/.test(init), 'Start und Stopp der Integration');

// ── Texte: alles, was t("…") im Modul nutzt, hat eine deutsche Fassung ─────────────────
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
// Der Seiten-Dropdown im Studio (casora-panel-b.js) führt seine eigene Liste – „Live Activities“ muss dort stehen
// (17.10.: über die Suche gefunden, im Menü „Einstellungen“ gefehlt).
assert.match(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b.js', import.meta.url), 'utf8'), /\["live", "Live Activities", "iphone"\]/, 'Dropdown kennt die Seite');
console.log('studio_live: Dropdown ok');
