// Reolink-Türklingel (Community-Karte, 24-klingel.js) ohne HA: Erkennen der Klingel (Kamera an einem Gerät mit
// Klingelknopf), Finder über translation_key, Verlauf aus history_during_period (erster Eintrag kein Ereignis),
// „Hat geklingelt“ halten (und nicht nach einem Neustart), Kachel-Text, Popup-Bereiche, Halten-Einträge,
// Antwort-SDP fürs Sprechen. Geräte, Namen und Nachrichten erfunden.   node dev/unit/klingel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Feste Uhr (Mittag, Ortszeit): „Heute“, „vor 3 Min.“ und Uhrzeiten hängen sonst an der echten Tageszeit –
// kurz nach Mitternacht oder in UTC (CI) fielen Testereignisse auf den Vortag.
const FIX = new Date(2026, 9, 14, 12, 0, 0).getTime();
const RealDate = Date;
// Läuft ab Mittag weiter (Ruhezeiten im Test brauchen vergehende Zeit).
const START = RealDate.now();
const clock = () => FIX + (RealDate.now() - START);
globalThis.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [clock()])); } static now() { return clock(); } };
globalThis.window = globalThis;
// Sprache wie im Dashboard aus HA (casoraLocale) – sonst nähme Intl die Systemsprache (CI: Englisch, 12-h-Uhr).
globalThis.casoraLocale = () => 'de-DE';
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('24-klingel.js'))();
const KL = window._casoraKlingel;
const n = (x) => (x == null ? x : String(x).replace(/\u00a0/g, ' '));
assert.ok(KL && KL.find && KL.status && KL.tileText && KL.hold && KL.sec, 'Modul geladen');

const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const entities = {}, states = {};
const devices = { d_bell: { id: 'd_bell', name: 'Gartenpforte' }, d_cam: { id: 'd_cam', name: 'Carport' } };
const add = (id, state, attributes = {}, tk = null, dev = 'd_bell', platform = 'reolink', changedMin = 120) => {
  entities[id] = { entity_id: id, platform, device_id: dev, translation_key: tk };
  states[id] = { entity_id: id, state, attributes, last_changed: iso(changedMin) };
};
add('camera.pforte_sub', 'idle', { supported_features: 2, friendly_name: 'Gartenpforte Fluent' }, 'sub');
add('camera.pforte_snapshots', 'idle', {}, 'snapshots_main');
add('binary_sensor.pforte_besucher', 'off', {}, 'visitor', 'd_bell', 'reolink', 0.1);  // frisch „off“ (Neustart)
add('binary_sensor.pforte_bewegung', 'off', { device_class: 'motion' });
add('binary_sensor.pforte_person', 'off', { device_class: 'motion' }, 'person');
add('binary_sensor.pforte_paket', 'off', { device_class: 'motion' }, 'package');
add('binary_sensor.pforte_tier', 'off', { device_class: 'motion' }, 'animal');
add('select.pforte_antwort', 'unknown', { options: ['Komme sofort', 'Bitte warten'] }, 'play_quick_reply_message');
add('select.pforte_auto', 'off', { options: ['off', 'Komme sofort'] }, 'auto_quick_reply_message');
add('number.pforte_auto_zeit', '20', { min: 1, max: 60 }, 'auto_quick_reply_time');
add('number.pforte_lautst', '80', { min: 0, max: 100, step: 1 }, 'volume');
add('number.pforte_sprechen', '50', { min: 0, max: 100, step: 1 }, 'volume_speak');
add('number.pforte_klingel', '40', { min: 0, max: 100, step: 1 }, 'volume_doorbell');
add('switch.pforte_ton_tuer', 'on', {}, 'doorbell_button_sound');
add('switch.pforte_ton', 'on', {}, 'record_audio');
add('switch.pforte_privat', 'off', {}, 'privacy_mode');
add('switch.pforte_ir', 'on', {}, 'ir_lights');
add('select.pforte_led', 'always', { options: ['stayoff', 'auto', 'always', 'alwayson'] }, 'doorbell_led');
add('siren.pforte_sirene', 'off', {}, 'siren');
add('sensor.pforte_akku', '15', { device_class: 'battery', unit_of_measurement: '%' });
add('sensor.pforte_wlan', '-72', { unit_of_measurement: 'dBm' }, 'wifi_signal');
add('sensor.pforte_tagnacht', 'night', {}, 'day_night_state');
// Andere Reolink-Kamera ohne Klingelknopf, eine fremde Kamera.
add('camera.carport_sub', 'idle', {}, 'sub', 'd_cam');
add('camera.fremd', 'idle', {}, null, 'd_bell', 'generic');
const hass = { states, entities, devices, areas: {}, config: { components: ['reolink', 'media_source'] } };
const ID = 'camera.pforte_sub';

// Erkennen
assert.equal(KL.is(hass, ID), true);
assert.equal(KL.is(hass, 'camera.carport_sub'), false, 'Reolink-Kamera ohne Klingelknopf');
assert.equal(KL.is(hass, 'camera.fremd'), false, 'fremde Integration am selben Gerät');
assert.equal(KL.liveCam(hass, ID), true);
assert.equal(KL.liveCam(hass, 'camera.pforte_snapshots'), false, 'Schnappschuss-Kamera ist keine Live-Kamera');
// Je Gerät eine Live-Kamera (Studio-Geräteliste): main nur ohne sub.
add('camera.pforte_main', 'idle', { supported_features: 2 }, 'main');
assert.equal(KL.liveCam(hass, 'camera.pforte_main'), false, 'main neben sub: nicht noch einmal');
entities[ID].disabled_by = 'user';
assert.equal(KL.liveCam(hass, 'camera.pforte_main'), true, 'sub abgeschaltet: main');
delete entities[ID].disabled_by;
delete entities['camera.pforte_main']; delete states['camera.pforte_main'];
entities[ID].platform = 'casora_mock';
assert.equal(KL.is(hass, ID), true, 'Test-HA (Mock) zählt mit');
entities[ID].platform = 'reolink';

// Finder – beim HA-Start (Registry da, Zustände noch nicht) nichts merken, sonst nie „Hat geklingelt“ (C2).
const allStates = Object.assign({}, states);
const early = KL.find(Object.assign({}, hass, { states: {} }), ID);
assert.equal(early.visitor, null, 'ohne Zustände kein Klingelknopf');
const c = KL.find(hass, ID);
assert.equal(c.visitor, 'binary_sensor.pforte_besucher', 'Zustände da: neu gesucht (nicht der leere Fund vom Start)');
void allStates;
assert.equal(c.motion, 'binary_sensor.pforte_bewegung', 'Bewegung ohne translation_key über device_class');
assert.deepEqual(c.order, ['person', 'package', 'pet'], 'Reihenfolge Person, Paket, Tier (animal = Tier)');
assert.equal(c.snap, 'camera.pforte_snapshots');
assert.equal(c.quick, 'select.pforte_antwort'); assert.equal(c.autoReply, 'select.pforte_auto'); assert.equal(c.autoTime, 'number.pforte_auto_zeit');
assert.deepEqual(c.vol, { spk: 'number.pforte_lautst', speak: 'number.pforte_sprechen', bell: 'number.pforte_klingel' });
assert.deepEqual(c.sw, { bell: 'switch.pforte_ton_tuer', audio: 'switch.pforte_ton', privacy: 'switch.pforte_privat', ir: 'switch.pforte_ir' });
assert.equal(c.led, 'select.pforte_led'); assert.equal(c.siren, 'siren.pforte_sirene');
assert.equal(c.battery, 'sensor.pforte_akku'); assert.equal(c.wifi, 'sensor.pforte_wlan'); assert.equal(c.dayNight, 'sensor.pforte_tagnacht');
assert.ok(KL.watch(c).includes('binary_sensor.pforte_besucher') && KL.watch(c).includes('switch.pforte_privat'));

// Neustart: visitor steht frisch auf „off“ – das ist kein Klingeln.
let s = KL.status(c, states, NOW);
assert.equal(s.ring, null, 'kein Klingeln nach Neustart'); assert.equal(KL.tileText(s, NOW), null, 'Kachel: Kamera-Text (Bereit)');

// Verlauf: erster Eintrag = Zustand zu Beginn (auch wenn „on“), danach Wechsel auf „on“ = Ereignis.
const start = NOW - 3 * 86400000, sec = (minAgo) => (NOW - minAgo * 60000) / 1000;
const raw = {
  'binary_sensor.pforte_besucher': [{ s: 'on', lu: start / 1000 }, { s: 'off', lu: sec(4000) }, { s: 'on', lu: sec(95) }, { s: 'off', lu: sec(94.9) },
    { s: 'on', lu: sec(3) }, { s: 'off', lu: sec(2.95) }],
  'binary_sensor.pforte_person': [{ s: 'off', lu: start / 1000 }, { s: 'on', lu: sec(96) }, { s: 'off', lu: sec(90) }, { s: 'on', lu: sec(95.5) }],
  'binary_sensor.pforte_paket': [{ s: 'off', lu: start / 1000 }, { s: 'unavailable', lu: sec(500) }, { s: 'on', lu: sec(400), lc: sec(400) }],
};
const ev = KL.parse(raw, c, start);
assert.deepEqual(ev.map((e) => e.kind), ['ring', 'ring', 'person', 'person', 'package']);
assert.ok(Math.abs(ev[0].at - (NOW - 3 * 60000)) < 5, 'Zeit in ms');
// Verlauf über die WebSocket-Abfrage (Antwort sofort), dann Kachel.
let asked = null;
const wsHass = Object.assign({}, hass, { callWS: (m) => { asked = m; return Promise.resolve(raw); } });
KL.history(wsHass, c, null);
await new Promise((r) => setTimeout(r, 0));
assert.equal(asked.type, 'history/history_during_period'); assert.ok(asked.minimal_response && asked.no_attributes);
assert.ok(asked.entity_ids.includes('binary_sensor.pforte_besucher') && asked.entity_ids.includes('binary_sensor.pforte_paket'));
s = KL.status(c, states, NOW);
assert.equal(s.ring, ev[0].at); assert.equal(n(KL.tileText(s, NOW)), 'Geklingelt · vor 3 Min.');
assert.ok(KL.hot(s), 'hervorgehoben');
assert.ok(/^Geklingelt \d\d:\d\d$/.test(KL.tileText(s, NOW, true)), 'schmale Handy-Kachel: mit Uhrzeit, nicht nur „Geklingelt“');
assert.equal(KL.tileText(s, ev[0].at + 90000, true), 'Hat geklingelt', 'die ersten 2 Min.: „Hat geklingelt“, auch schmal');
// Personen zweimal innerhalb einer Minute → einmal.
assert.equal(KL.events(c, NOW).filter((e) => e.kind === 'person').length, 1);
// Gleiche Minute (gleiche Uhrzeit in der Zeitleiste): Klingeln vor Erkennung, auch wenn die Erkennung später kam.
{
  const m0 = Math.floor(NOW / 60000) * 60000 - 30 * 60000;
  const cc = { cam: 'camera.qa_reihe', visitor: 'v', order: ['person'], det: { person: 'p' }, sw: {}, vol: {} };
  KL.forget(cc.cam);
  KL.history(Object.assign({}, hass, { states: {}, callWS: () => Promise.resolve({ v: [{ s: 'off', lu: (m0 - 9e6) / 1000 }, { s: 'on', lu: (m0 + 5000) / 1000 }],
    p: [{ s: 'off', lu: (m0 - 9e6) / 1000 }, { s: 'on', lu: (m0 + 40000) / 1000 }, { s: 'off', lu: (m0 + 41000) / 1000 }, { s: 'on', lu: (m0 - 600000) / 1000 }] }) }), cc, null);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(KL.events(cc, NOW).map((e) => e.kind), ['ring', 'person', 'person'], 'Klingeln vor Person in derselben Minute');
  KL.forget(cc.cam);
}
// Verlauf neu fragen nur bei Änderung am Klingelknopf – eine Erkennung kommt live über „seen“ dazu.
{
  let calls = 0;
  const cnt = Object.assign({}, hass, { callWS: () => { calls++; return Promise.resolve(raw); } });
  KL.forget(ID); KL.history(cnt, c, null); await new Promise((r) => setTimeout(r, 0));
  const pp = states['binary_sensor.pforte_paket'];
  states['binary_sensor.pforte_paket'] = { state: 'on', attributes: {}, last_changed: new Date(NOW - 500).toISOString() };
  KL.history(cnt, c, null);
  assert.equal(calls, 1, 'Erkennung fragt den Verlauf nicht neu');
  assert.ok(KL.status(c, states, NOW).live.includes('package') && KL.events(c, NOW).some((e) => e.kind === 'package' && NOW - e.at < 2000), 'Erkennung live');
  states['binary_sensor.pforte_paket'] = pp;
  const vv = states['binary_sensor.pforte_besucher'];
  states['binary_sensor.pforte_besucher'] = Object.assign({}, vv, { last_changed: new Date(NOW - 300).toISOString() });
  KL.history(cnt, c, null);
  assert.equal(calls, 2, 'Klingelknopf fragt neu');
  await new Promise((r) => setTimeout(r, 0));
  states['binary_sensor.pforte_besucher'] = vv;
  KL.forget(ID);
  KL.history(wsHass, c, null); await new Promise((r) => setTimeout(r, 0));
}
// Nach HOLD (10 Min.) nicht mehr „geklingelt“.
assert.equal(KL.tileText(KL.status(c, states, NOW + 11 * 60000), NOW + 11 * 60000), null);
// Klingelknopf gerade gedrückt (selbst gesehen) → „Hat geklingelt“ sofort.
states['binary_sensor.pforte_besucher'] = { state: 'on', attributes: {}, last_changed: new Date(NOW - 2000).toISOString() };
s = KL.status(c, states, NOW);
assert.equal(KL.tileText(s, NOW), 'Hat geklingelt');
states['binary_sensor.pforte_besucher'] = { state: 'off', attributes: {}, last_changed: new Date(NOW - 1000).toISOString() };
assert.equal(KL.tileText(KL.status(c, states, NOW + 30000), NOW + 30000), 'Hat geklingelt', 'bleibt nach dem Loslassen (gesehen)');
KL.forget(ID);
// Person vor der Tür (ohne Klingeln)
states['binary_sensor.pforte_person'] = { state: 'on', attributes: {}, last_changed: iso(0.2) };
s = KL.status(c, states, NOW);
assert.equal(KL.tileText(s, NOW), 'Person erkannt'); assert.ok(KL.hot(s));
states['binary_sensor.pforte_paket'] = { state: 'on', attributes: {}, last_changed: iso(0.1) };
assert.equal(KL.tileText(KL.status(c, states, NOW), NOW), 'Person und Paket erkannt');
assert.equal(KL.tileText(KL.status(c, states, NOW), NOW, true), 'Person erkannt', 'schmal: nur das Erste');
states['binary_sensor.pforte_paket'].state = 'off'; states['binary_sensor.pforte_person'].state = 'off';
KL.forget(ID);
// Privatsphäre: Kamera nicht verfügbar, Kachel sagt es.
states['switch.pforte_privat'].state = 'on'; states[ID].state = 'unavailable';
s = KL.status(c, states, NOW);
assert.equal(KL.tileText(s, NOW), 'Privatsphäre an'); assert.equal(KL.hot(s), false);
assert.deepEqual(KL.hold(hass, ID).map((x) => x.t), [], 'Privatsphäre: weder Mithören noch Schnellantworten');
states['switch.pforte_privat'].state = 'off'; states[ID].state = 'idle';

// Popup-Bereiche (UI-Bausteine als Platzhalter)
window._casoraUI = {
  esc: (t) => String(t), tokens: {},
  line: (m, r) => '<line>' + m + '|' + [].concat(r || []).map((x) => (typeof x === 'object' ? x.text + '!' + x.tone : x)).join(';') + '</line>',
  group: (rows, label) => '<group ' + label + '>' + rows.map((r) => r.label + '=' + (r.value || '') + '~' + (r.sub || '') + (r.confirm ? '!' + r.confirm : '')
    + (r.svc ? '#' + r.svc.domain + '.' + r.svc.service + (r.svc.data ? JSON.stringify(r.svc.data) : '') : '') + (r.entity ? '@' + r.entity : '')).join(';') + '</group>',
  label: (t) => '<label ' + t + '>',
  slider: (o) => '<slider ' + o.label + '=' + o.value + ' ' + JSON.stringify(o.svc.scale) + '>',
  segments: (items, label) => '<seg ' + label + '>' + items.map((i) => i.label + (i.active ? '*' : '')).join(',') + '</seg>',
  more: (id, html, o) => '<more ' + o.label + ' ' + o.count + ' ' + o.less + '>' + html + '</more>',
};
let h = n(KL.sec('hero', c, states, hass));
assert.ok(/^<line>Bereit\|Akku 15 %!warn<\/line>$/.test(h), h);
states['switch.pforte_ton'].state = 'off';
assert.ok(!/Ton aus/.test(n(KL.sec('hero', c, states, hass))), 'Ton aus: nicht im Kopf (Hinweis unter dem Bild sagt es)');
states['switch.pforte_ton'].state = 'on';
const say = n(KL.sec('say', c, states, hass));
assert.ok(/<group Schnellantworten>Komme sofort=~!Abspielen#select\.select_option\{"option":"Komme sofort"\}/.test(say), say);
assert.ok(/Sirene=~Laut an der Tür, 10 Sekunden!Auslösen#siren\.turn_on\{"duration":10\}/.test(say), say);
// Privatsphäre: Schnellantworten und Sirene ruhen (ohne Dienst).
states['switch.pforte_privat'].state = 'on';
const sayP = n(KL.sec('say', c, states, hass));
assert.ok(!/#select|#siren/.test(sayP) && /Sirene=~Bei Privatsphäre aus/.test(sayP), sayP);
states['switch.pforte_privat'].state = 'off';
// Sirene eben gestoppt: 3 s „Gestoppt“ ohne Auslösen (der Stopp-Tipp landete sonst auf „Auslösen“), danach wieder auslösbar.
states['siren.pforte_sirene'].last_changed = new Date(Date.now() - 1000).toISOString();
const sayS = n(KL.sec('say', c, states, hass));
assert.ok(/Sirene=Aus~Gestoppt[;<]/.test(sayS) && !/#siren/.test(sayS), sayS);
states['siren.pforte_sirene'].last_changed = new Date(Date.now() - 4000).toISOString();
assert.ok(/Sirene=~Laut an der Tür, 10 Sekunden!Auslösen#siren\.turn_on/.test(n(KL.sec('say', c, states, hass))), 'nach 3 s wieder auslösbar');
states['siren.pforte_sirene'].last_changed = iso(120);
const mo = n(KL.sec('more', c, states, hass));
assert.ok(/<more Einstellungen undefined Einstellungen>/.test(mo), 'ohne Zähler, aufgeklappt bleibt „Einstellungen“');
assert.ok(/<slider Klingelton=40 \[0,100,1\]>.*<slider Sprechen=50.*<slider Lautsprecher=80/.test(mo), 'Lautstärken in der Reihenfolge Klingel, Sprechen, Lautsprecher');
assert.ok(/Ton aufnehmen=An~Ohne Ton hörst du die Tür nicht!Ausschalten/.test(mo) && /Klingelton an der Tür=An~[^!]/.test(mo), mo);
assert.ok(/Privatsphäre=Aus~Kamera und Ton aus!Einschalten/.test(mo), 'Privatsphäre einschalten fragt nach');
states['switch.pforte_privat'].state = 'on';
assert.ok(/Privatsphäre=An~Kamera und Ton aus!Ausschalten/.test(n(KL.sec('more', c, states, hass))), 'und ausschalten auch (gleiche Logik)');
states['switch.pforte_privat'].state = 'off';
assert.ok(/<seg Licht am Klingelknopf>Aus,Automatisch,Immer an\*<\/seg>/.test(mo), 'always/alwayson einmal');
assert.ok(/Automatische Antwort=Aus~/.test(mo) && /Akku=15 %/.test(mo) && /WLAN=Schwach~\u221272 dBm/.test(mo) && /Bild gerade=Schwarz-Weiß~/.test(mo), mo);
// Infrarot-Schalter, Tag/Nacht-Modus und Bild widersprechen sich nicht mehr („Infrarot bei Nacht: An“ neben „Nachtsicht: Aus“).
assert.ok(/Infrarot-LEDs nachts=An~#switch\.turn_off/.test(mo) && !/Nachtsicht/.test(mo), mo);
states['sensor.pforte_tagnacht'].state = 'day';
assert.ok(/Bild gerade=Farbe~/.test(n(KL.sec('more', c, states, hass))), 'tagsüber: Bild gerade Farbe');
add('select.pforte_tagnacht_modus', 'auto', { options: ['auto', 'color', 'blackwhite'] }, 'day_night');
KL.forget(ID);
const cdm = KL.find(Object.assign({}, hass, { entities: Object.assign({}, entities), states: Object.assign({}, states) }), ID);
assert.ok(/<seg Tag\/Nacht-Modus>Automatisch\*,Farbe,Schwarz-Weiß<\/seg>/.test(n(KL.sec('more', cdm, states, hass))), n(KL.sec('more', cdm, states, hass)));
delete states['select.pforte_tagnacht_modus']; delete entities['select.pforte_tagnacht_modus']; KL.forget(ID);
states['sensor.pforte_tagnacht'].state = 'night';
// Status-LED als light.* (C4): Dienst in der Domain der Entität, nicht switch.*.
add('light.pforte_led', 'on', {}, 'status_led');
KL.forget(ID);
const cl = KL.find(Object.assign({}, hass, { entities: Object.assign({}, entities), states: Object.assign({}, states) }), ID);
assert.equal(cl.ledLight, 'light.pforte_led');
assert.ok(/Status-LED=An~[^#]*#light\.turn_off/.test(n(KL.sec('more', cl, states, hass))), 'Status-LED schaltet über light.turn_off');
delete states['light.pforte_led']; delete entities['light.pforte_led'];
// Verlauf: lädt … dann Liste mit „Neu“ beim frischen Klingeln, Aufnahmen über die Reolink-Medienquelle.
const pend = Object.assign({}, hass, { callWS: () => new Promise(() => {}) });
assert.ok(/Wird geladen/.test(KL.sec('hist', c, states, pend)), 'lädt');
KL.forget(ID);
KL.history(wsHass, c, null);
await new Promise((r) => setTimeout(r, 0));
let hist = n(KL.sec('hist', c, states, wsHass));
// Zeitleiste wie Person/Schloss: Uhrzeit | Punkt | Was + „vor …“, „Neu“ rechts beim frischen Klingeln.
assert.ok(/^<label Verlauf><div class="kl-verlauf"/.test(hist) && />\d\d:\d\d<\/div>/.test(hist)
  && /Hat geklingelt<\/div><div[^>]*>vor 3 Min\.<\/div><\/div><div[^>]*>Neu<\/div>/.test(hist), hist);
assert.ok(/Paket erkannt/.test(hist) && /Aufnahmen=~In den Medien von Home Assistant@klingel-go:\/media-browser/.test(hist), hist);
// Zeile mit Tagesetikett („Gestern 18:31“): Punkt und Text rücken mit der Uhrzeit nach unten (Punkt verrutschte).
{
  const mid = new Date(NOW); mid.setHours(0, 0, 0, 0);
  const y = mid.getTime() - 5 * 3600000;
  const cy = { cam: 'camera.qa_gestern', visitor: 'v', order: [], det: {}, sw: {}, vol: {} };
  const hy = Object.assign({}, hass, { states: {}, callWS: () => Promise.resolve({ v: [{ s: 'off', lu: (y - 9e6) / 1000 }, { s: 'on', lu: y / 1000 }, { s: 'off', lu: y / 1000 + 1 }] }) });
  KL.forget(cy.cam); KL.history(hy, cy, null); await new Promise((r) => setTimeout(r, 0));
  const hh = KL.sec('hist', cy, {}, hy);
  const row = (hh.split('class="kl-ev"')[1] || '');
  assert.ok(/class="kl-day"[^>]*>Gestern</.test(row) && /class="kl-dot"[^>]*margin-top:20px/.test(row) && /padding-top:16px;"><div[^>]*>Hat geklingelt/.test(row), row);
  KL.forget(cy.cam);
}
// Leer und Fehler
const emptyHass = Object.assign({}, hass, { callWS: () => Promise.resolve({}) });
KL.forget(ID); KL.history(emptyHass, c, null); await new Promise((r) => setTimeout(r, 0));
assert.ok(/Niemand hat geklingelt=~In den letzten 3 Tagen/.test(n(KL.sec('hist', c, states, emptyHass))));
const failHass = Object.assign({}, hass, { callWS: () => Promise.reject(new Error('x')) });
KL.forget(ID); KL.history(failHass, c, null); await new Promise((r) => setTimeout(r, 0));
assert.ok(/Verlauf nicht abrufbar/.test(KL.sec('hist', c, states, failHass)));

// Halten-Menü: Ton hören, Schnellantworten mit Rückfrage.
const m = KL.hold(hass, ID);
assert.deepEqual(m.map((x) => x.t + (x.sub ? ':' + x.sub : '')), ['Mithören', 'Komme sofort', 'Bitte warten'], 'Nachricht selbst als Beschriftung');
assert.equal(m[1].svc, 'select.select_option'); assert.deepEqual(m[1].data, { option: 'Komme sofort' }); assert.equal(m[1].lit, true);
assert.equal(m[1].ask, '„Komme sofort“ an der Tür abspielen?'); assert.equal(m[1].done, 'Spielt ab: Komme sofort');
states[ID].attributes = { supported_features: 0 };
assert.ok(!KL.hold(hass, ID).some((x) => x.t === 'Mithören'), 'Standbild-Kamera: kein Mithören');
states[ID].attributes = { supported_features: 2 };
assert.deepEqual(KL.hold(hass, 'camera.carport_sub'), [], 'normale Kamera: nichts');

// Sprechen: nimmt die Klingel das Mikrofon an? (Richtung der Audio-Spur aus Sicht der Klingel)
const sdp = (dir, port = 9) => 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\nm=audio ' + port + ' UDP/TLS/RTP/SAVPF 111\r\n' + (dir ? 'a=' + dir + '\r\n' : '');
assert.equal(KL.talkAccepted(sdp('recvonly')), true); assert.equal(KL.talkAccepted(sdp('sendrecv')), true);
assert.equal(KL.talkAccepted(sdp('sendonly')), false, 'nur senden = kein Rückkanal');
assert.equal(KL.talkAccepted(sdp('inactive')), false); assert.equal(KL.talkAccepted(sdp('recvonly', 0)), false, 'abgelehnt');
assert.equal(KL.talkAccepted('v=0\r\nm=video 9 X 96\r\na=sendonly\r\n'), false, 'ohne Audio');
assert.equal(KL.canTalk(), false, 'ohne Browser/HTTPS kein Sprechen');
// go2rtc-Kandidaten ohne sdpMid/sdpMLineIndex (C3) – wie HAs Frontend der ersten Spur zuordnen.
assert.deepEqual(KL.candidate('candidate:1 1 udp 1 10.0.0.2 5000 typ host'), { candidate: 'candidate:1 1 udp 1 10.0.0.2 5000 typ host', sdpMid: '0' });
assert.deepEqual(KL.candidate({ candidate: 'candidate:2' }), { candidate: 'candidate:2', sdpMid: '0' });
assert.deepEqual(KL.candidate({ candidate: 'candidate:3', sdpMLineIndex: 1 }), { candidate: 'candidate:3', sdpMLineIndex: 1 }, 'vorhandene Angabe bleibt');

// Popup-Aufbau: Schnellantworten nur mit Nachrichten, Einstellungen als „Mehr“.
window._casoraSoftKit = { secCard: (w, code) => ({ code }), layout: (o) => o };
let p = KL.popup(states[ID], states, hass, { talk: true });
assert.deepEqual(Object.keys(p.fields), ['hero', 'live', 'hist', 'say', 'more']);
assert.equal(p.fields.live.card.type, 'custom:casora-klingel-live'); assert.equal(p.fields.live.card.talk, true);
assert.equal(p.fields.live.card.audio, 'switch.pforte_ton');
delete states['select.pforte_antwort']; delete states['siren.pforte_sirene'];
KL.forget(ID);
p = KL.popup(states[ID], states, Object.assign({}, hass, { entities: Object.assign({}, entities) }), {});
assert.ok(!p.fields.say, 'ohne Nachrichten und Sirene kein Abschnitt'); assert.equal(p.fields.live.card.talk, false, 'Sprechen standardmäßig aus');
console.log('klingel: ok');
