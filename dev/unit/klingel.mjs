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

// Studio-Optionen (#23): großes Bild beim Mithören/Sprechen standardmäßig an, zweite Kamera optional.
assert.deepEqual(KL.opts({}, ID), { talk: false, big: true, cam2: null }, 'Standard: Sprechen aus, groß an, ohne zweite Kamera');
assert.deepEqual(KL.opts({ talk: 'true', big_on_audio: false, camera2: 'camera.carport_sub' }, ID), { talk: true, big: false, cam2: 'camera.carport_sub' });
assert.equal(KL.opts({ big_on_audio: 'false' }).big, false, 'aus (Text)');
assert.equal(KL.opts({ camera2: ID }, ID).cam2, null, 'Klingel selbst ist keine zweite Kamera');
assert.equal(KL.opts({ camera2: 'sensor.x' }, ID).cam2, null, 'nur camera.*');
assert.equal(KL.opts({ camera2: '[[[ return 1 ]]]' }, ID).cam2, null, 'keine Vorlage');
// Name der zweiten Kamera: friendly_name ohne Gerätenamen; nur Stream-Wort übrig → Gerätename.
states['camera.carport_sub'].attributes = { friendly_name: 'Carport Fluent', supported_features: 2 };
assert.equal(KL.camName(hass, 'camera.carport_sub'), 'Carport', 'Reolink „<Gerät> Fluent“ → Gerätename');
devices.d_cam.name_by_user = 'Einfahrt';
assert.equal(KL.camName(hass, 'camera.carport_sub'), 'Carport', 'Gerät umbenannt, friendly_name noch alt: ohne Stream-Wort');
delete devices.d_cam.name_by_user;
states['camera.carport_sub'].attributes.friendly_name = 'Carport Hofeinfahrt';
assert.equal(KL.camName(hass, 'camera.carport_sub'), 'Hofeinfahrt', 'Entitätsname ohne Gerätenamen');
states['camera.carport_sub'].attributes.friendly_name = 'Carport Fluent';
states['camera.fremd'].attributes = { friendly_name: 'Gartenhaus' };
entities['camera.fremd'].device_id = null;
assert.equal(KL.camName(hass, 'camera.fremd'), 'Gartenhaus', 'ohne Gerät: friendly_name');
entities['camera.fremd'].device_id = 'd_bell';
// Popup gibt die zweite Kamera samt Namen und Option ans Live-Bild.
KL.forget(ID);
p = KL.popup(states[ID], states, Object.assign({}, hass, { entities: Object.assign({}, entities) }), { camera2: 'camera.carport_sub', big_on_audio: false });
assert.equal(p.fields.live.card.cam2, 'camera.carport_sub'); assert.equal(p.fields.live.card.cam2Name, 'Carport'); assert.equal(p.fields.live.card.big, false);
p = KL.popup(states[ID], states, hass, {});
assert.equal(p.fields.live.card.cam2, null, 'ohne Feld unverändert'); assert.equal(p.fields.live.card.big, true);

// Umschalter: was das Live-Bild zeigt.
const lcfg = { entity: ID, cam2: 'camera.carport_sub', audio: 'switch.pforte_ton', privacy: 'switch.pforte_privat' };
let vw = KL.view(lcfg, 0, states);
assert.equal(vw.id, ID); assert.equal(vw.bell, true); assert.equal(vw.two, true); assert.equal(vw.dead, false); assert.equal(vw.stream, true);
vw = KL.view(lcfg, 1, states);
assert.equal(vw.id, 'camera.carport_sub'); assert.equal(vw.idx, 1); assert.equal(vw.bell, false);
assert.notEqual(vw.key, KL.view(lcfg, 0, states).key, 'Wechsel bindet den Player neu ein');
states['switch.pforte_ton'].state = 'off'; states['switch.pforte_privat'].state = 'on';
assert.equal(KL.view(lcfg, 1, states).audioOff, false, '„Ton aufnehmen“ der Klingel gilt nicht für die zweite Kamera');
assert.equal(KL.view(lcfg, 1, states).dead, false, 'Privatsphäre der Klingel sperrt die zweite Kamera nicht');
assert.equal(KL.view(lcfg, 0, states).privacy, true); assert.equal(KL.view(lcfg, 0, states).audioOff, true);
states['switch.pforte_ton'].state = 'on'; states['switch.pforte_privat'].state = 'off';
assert.equal(KL.view(Object.assign({}, lcfg, { cam2: 'camera.weg' }), 1, states).idx, 0, 'zweite Kamera fehlt in HA: Klingel');
assert.equal(KL.view(Object.assign({}, lcfg, { cam2: 'camera.weg' }), 1, states).two, false, '… und kein Umschalter');
assert.equal(KL.view({ entity: ID }, 1, states).idx, 0, 'ohne zweite Kamera immer die Klingel');
states['camera.carport_sub'].state = 'unavailable';
assert.equal(KL.view(lcfg, 1, states).dead, true); assert.ok(/^1x/.test(KL.view(lcfg, 1, states).key));
states['camera.carport_sub'].state = 'idle';

// Live-Bild ohne DOM: großes Bild an/aus (Popover, Esc vor dem Popup), automatisch groß beim Mithören, Umschalter.
{
  const keys = [];
  globalThis.addEventListener = (t, fn, cap) => keys.push({ t, fn, cap });
  globalThis.removeEventListener = (t, fn) => { const i = keys.findIndex((k) => k.fn === fn); if (i >= 0) keys.splice(i, 1); };
  let Live = null;
  globalThis.HTMLElement = class {};
  globalThis.customElements = { get: () => null, define: (n, c) => { if (n === 'casora-klingel-live') Live = c; } };
  const mk = () => {
    const at = {}, cls = new Set(), style = { _: {}, removeProperty(k) { delete this._[k]; } };
    return { at, cls, style, hidden: false, open: false,
      classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
      setAttribute(k, v) { at[k] = String(v); }, removeAttribute(k) { delete at[k]; }, hasAttribute(k) { return k in at; },
      showPopover() { this.open = true; }, hidePopover() { this.open = false; }, matches(q) { return q === ':popover-open' && this.open; },
      focus() { focused = this; }, querySelector: (q) => (q === '.in' ? inn : null) };
  };
  let focused = null;
  const inn = mk(), stg = mk(), x = mk(), fsb = mk();
  // Modul neu laden, damit die Klasse mit den Stubs entsteht (Marker zuerst weg).
  delete window._casoraKlingel;
  new Function(src('24-klingel.js'))();
  assert.ok(Live, 'Live-Bild-Element definiert');
  const el = Object.create(Live.prototype);
  el.isConnected = true;
  el._root = { querySelector: (q) => ({ '.st': stg, '.x': x, '.fs': fsb })[q] || null };
  el._paint = () => {};
  el._cfg = { entity: ID, big: true, audio: 'switch.pforte_ton' };
  el._setBig(true);
  assert.ok(stg.cls.has('big') && stg.at.popover === 'manual' && stg.open, 'groß: Popover in der obersten Ebene');
  assert.ok('data-casora-esc' in stg.at && stg.at.role === 'dialog' && stg.at['aria-modal'] === 'true', 'Esc-Marke fürs Popup, Dialog-Rolle');
  assert.equal(focused, x, 'Fokus aufs ×');
  const k = keys.find((y) => y.t === 'keydown');
  assert.ok(k && k.cap === true, 'Esc im Capture vor dem Popup');
  let stopped = false;
  k.fn({ key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.ok(stopped && !el._big && !stg.cls.has('big') && !stg.open && !('popover' in stg.at), 'Esc schließt nur das große Bild');
  assert.equal(keys.filter((y) => y.t === 'keydown').length, 0, 'Esc-Wächter wieder weg');
  assert.equal(focused, fsb, 'Fokus zurück auf den Groß-Knopf');
  // Mithören an → automatisch groß (Option an); Mithören aus bleibt klein.
  el._hass = { states };
  el._stream = true; el._v = KL.view(el._cfg, 0, states); el._muted = true; el._native = false;
  el._toggleSound();
  assert.ok(el._muted === false && el._big, 'Mithören → groß');
  el._toggleSound();
  assert.ok(el._muted === true && el._big, 'Mithören aus: bleibt, wie es ist');
  el._setBig(false);
  el._cfg.big = false; el._muted = true;
  el._toggleSound();
  assert.ok(el._muted === false && !el._big, 'Option aus: Mithören bleibt klein');
  // Ohne Popover-API: fest über allem (Klasse genügt).
  delete stg.showPopover;
  el._setBig(true);
  assert.ok(stg.cls.has('big') && !('popover' in stg.at), 'Rückfall ohne Popover');
  el._setBig(false, true);
  // Umschalter: anderer Index → neu zeichnen; gleicher → nichts.
  let syncs = 0;
  el._sync = () => { syncs++; };
  el._view = 0; el._switch(1); el._switch(1);
  assert.equal(el._view, 1); assert.equal(syncs, 1, 'gleiches Segment noch einmal: nichts');
  // Sprechen bei der zweiten Kamera nicht (nur über die Klingel).
  el._v = KL.view({ entity: ID, cam2: 'camera.carport_sub' }, 1, states); el._hass = { states, callWS: () => { throw new Error('darf nicht'); } };
  el._talk();
  assert.equal(el._t, undefined, 'zweite Kamera: kein Sprechen');
  // Issue #23: listening must not switch itself off when HA reloads the stream, and pressing again after a mute
  // builds a player with sound instead of unmuting one without an audio track.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const vid = (rej, tracks) => ({ muted: true, paused: true, volume: 1, hasAttribute: () => false, removeAttribute() {},
    srcObject: tracks ? { getTracks: () => tracks, getAudioTracks: () => tracks.filter((t) => t.kind === 'audio') } : null,
    play() { return rej ? Promise.reject(Object.assign(new Error(rej), { name: rej })) : Promise.resolve(); } });
  const live = (v) => {
    const e = Object.create(Live.prototype);
    e.isConnected = true; e._paint = () => {}; e._cfg = { entity: ID }; e._hass = { states };
    e._stream = true; e._v = KL.view(e._cfg, 0, states); e._native = true; e._card = { muted: false };
    e._video = () => v; e._mounts = 0; e._teardown = () => {}; e._mount = () => { e._mounts++; e._mountedMuted = false; };
    return e;
  };
  // Reload interrupts play(): stays on.
  let lv = live(vid('AbortError')); lv._muted = false; lv._mountedMuted = false;
  lv._applyAudio(); await tick(); await tick();
  assert.equal(lv._muted, false, 'AbortError (stream reload): listening stays on');
  // The browser really refuses sound: off, and the card remembers the player lost its audio track.
  lv = live(vid('NotAllowedError')); lv._muted = false; lv._mountedMuted = false;
  lv._applyAudio(); await tick(); await tick();
  assert.equal(lv._muted, true, 'NotAllowedError: off');
  assert.equal(lv._card.muted, true); assert.equal(lv._mountedMuted, true, 'muted player marked');
  lv._toggleSound();
  assert.equal(lv._mounts, 1, 'listen again: new player with sound');
  // A WebRTC player without an audio track is rebuilt even if the card did not mute it itself.
  lv = live(vid(null, [{ kind: 'video' }])); lv._muted = true; lv._mountedMuted = false;
  lv._toggleSound();
  assert.equal(lv._mounts, 1, 'no audio track: rebuilt');
  lv = live(vid(null, [{ kind: 'video' }, { kind: 'audio' }])); lv._muted = true; lv._mountedMuted = false;
  lv._toggleSound();
  assert.equal(lv._mounts, 0, 'audio track present: only unmute');
  // #23 (talk): while the talk connection plays the doorbell, the player's video is silent but HA's player keeps
  // its audio track; ending talk while listening mounts the player fresh with sound and drops the talk audio.
  lv = live(vid(null, [{ kind: 'video' }, { kind: 'audio' }])); lv._muted = false; lv._mountedMuted = false;
  const ear = { muted: true, removed: false, pause() {}, remove() { this.removed = true; } };
  lv._t = { state: 'on', hearing: true, ear, mic: { getTracks: () => [] } };
  lv._applyAudio();
  assert.equal(lv._video().muted, true, 'talking: player video silent');
  assert.equal(lv._card.muted, false, 'talking: HA player keeps its audio track');
  assert.equal(ear.muted, false, 'talking: doorbell heard through the talk connection');
  lv._talkStop(true);
  assert.equal(lv._t, null);
  assert.ok(ear.removed, 'talk audio removed');
  assert.equal(lv._mounts, 1, 'listening again: player mounted fresh');
  // Not listening: talk audio stays muted, no remount afterwards.
  lv = live(vid(null, [{ kind: 'video' }, { kind: 'audio' }])); lv._muted = true;
  const ear2 = { muted: false, pause() {}, remove() {} };
  lv._t = { state: 'on', hearing: true, ear: ear2 };
  lv._applyAudio();
  assert.equal(ear2.muted, true, 'not listening: talk audio muted');
  lv._talkStop(true);
  assert.equal(lv._mounts, 0, 'not listening: no remount');
  assert.match(src('24-klingel.js'), /autoGainControl: false/, 'microphone without automatic gain');
  // 26.10.56 follow-up: the talk connection takes over only while its sound really flows.
  const ft = {};
  assert.equal(KL.flowStep(ft, 0, 1000), false, 'no bytes yet: player keeps the sound');
  assert.equal(KL.flowStep(ft, 500, 2000), true, 'bytes growing: talk connection');
  assert.equal(KL.flowStep(ft, 500, 3000), true, 'one quiet second: stays');
  assert.equal(KL.flowStep(ft, 500, 4600), false, 'no growth for 2.5 s: back to the player');
  assert.equal(KL.flowStep(ft, 900, 5000), true, 'flows again');
  assert.equal(KL.flowStep({}, null, 1000), false, 'stats unknown: player');
  // #23: bytes of silence do not take over; once real sound came, pauses keep the talk connection.
  const fs = {};
  assert.equal(KL.flowStep(fs, 500, 1000, 0.0001), false, 'only silence: player keeps the sound');
  assert.equal(KL.flowStep(fs, 900, 2000, 0.0002), false, 'still silence');
  assert.equal(KL.flowStep(fs, 1400, 3000, 0.05), true, 'real sound: talk connection');
  assert.equal(KL.flowStep(fs, 1900, 4000, 0.0001), true, 'pause between words: stays');
  assert.equal(KL.flowStep(fs, 1900, 6600, 0.0001), false, 'no data for 2.5 s: back to the player');
  // #23 (24.10.): pure silence (level 0, bytes growing) for 6 s → retry; any sound or unknown level resets.
  const ss = {};
  assert.equal(KL.silentStep(ss, 0, 1000, 1000), false);
  assert.equal(KL.silentStep(ss, 0, 2000, 4000), false, 'not yet 6 s');
  assert.equal(KL.silentStep(ss, 0, 3000, 7100), true, '6 s of silence: retry due');
  assert.equal(KL.silentStep(ss, 0.004, 4000, 8000), false, 'sound: reset');
  assert.equal(KL.silentStep(ss, 0, 5000, 9000), false, 'counting anew');
  assert.equal(KL.silentStep({}, null, 5000, 99000), false, 'level unknown: never');
  // The retry itself: once, first camera only, and only on a visible page (a hidden tab must not open the microphone).
  assert.equal(KL.retryWanted({ _v: { idx: 0 } }), true);
  assert.equal(KL.retryWanted({ _talkRetried: true, _v: { idx: 0 } }), false, 'once per press');
  assert.equal(KL.retryWanted({ _v: { idx: 1 } }), false, 'second camera: no retry, no note');
  assert.equal(KL.retryGo({ _t: null, isConnected: true }, { visibilityState: 'visible' }), true);
  assert.equal(KL.retryGo({ _t: {}, isConnected: true }, { visibilityState: 'visible' }), false, 'talking again already');
  assert.equal(KL.retryGo({ _t: null, isConnected: false }, { visibilityState: 'visible' }), false, 'card gone');
  assert.equal(KL.retryGo({ _t: null, isConnected: true }, { visibilityState: 'hidden' }), false, 'tab hidden: no retry');
  assert.match(src('24-klingel.js'), /if \(KL\.retryGo\(self, document\)\) self\._talk\(true\); \}, 1500\)/, 'the 1500 ms retry asks retryGo');
  assert.match(src('24-klingel.js'), /KL\.retryWanted\(self\) && KL\.silentStep\(/, 'the note and the retry ask retryWanted');
  const stats = (b) => ({ getStats: () => Promise.resolve(new Map([['a', { type: 'inbound-rtp', kind: 'audio', bytesReceived: b }], ['v', { type: 'inbound-rtp', kind: 'video', bytesReceived: 9e9 }]])) });
  assert.equal(await KL.audioIn(stats(1234)), 1234, 'audio bytes only');
  assert.equal(await KL.audioIn(null), null);
  // #23 diagnostics: levels and bytes in both directions.
  const both = { getStats: () => Promise.resolve(new Map([
    ['i', { type: 'inbound-rtp', kind: 'audio', bytesReceived: 4983, audioLevel: 0.0123 }],
    ['o', { type: 'outbound-rtp', kind: 'audio', bytesSent: 3100 }],
    ['m', { type: 'media-source', kind: 'audio', audioLevel: 0.2 }]])) };
  assert.deepEqual(KL.levelLine(await KL.audioStats(both)), { klingel_bytes: 4983, klingel_pegel: 0.012, mikro_bytes: 3100, mikro_pegel: 0.2 });
  assert.deepEqual(KL.levelLine(await KL.audioStats(null)), { klingel_bytes: null, klingel_pegel: null, mikro_bytes: null, mikro_pegel: null });
  delete globalThis.addEventListener; delete globalThis.removeEventListener;
}
console.log('klingel: ok');
