// Reolink-Türklingel (Community-Karte, 24-klingel.js) ohne HA: Erkennen der Klingel (Kamera an einem Gerät mit
// Klingelknopf), Finder über translation_key, Verlauf aus history_during_period (erster Eintrag kein Ereignis),
// „Hat geklingelt“ halten (und nicht nach einem Neustart), Kachel-Text, Popup-Bereiche, Halten-Einträge,
// Antwort-SDP fürs Sprechen. Geräte, Namen und Nachrichten erfunden.   node dev/unit/klingel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
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
entities[ID].platform = 'casora_mock';
assert.equal(KL.is(hass, ID), true, 'Test-HA (Mock) zählt mit');
entities[ID].platform = 'reolink';

// Finder
const c = KL.find(hass, ID);
assert.equal(c.visitor, 'binary_sensor.pforte_besucher');
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
assert.equal(s.ring, ev[0].at); assert.equal(n(KL.tileText(s, NOW)), 'Geklingelt vor 3 Min.');
assert.ok(KL.hot(s), 'hervorgehoben');
assert.equal(KL.tileText(s, NOW, true), 'Geklingelt', 'schmale Handy-Kachel: Kurzform');
// Personen zweimal innerhalb einer Minute → einmal.
assert.equal(KL.events(c, NOW).filter((e) => e.kind === 'person').length, 1);
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
assert.deepEqual(KL.hold(hass, ID).map((x) => x.t), ['Schnellantwort', 'Schnellantwort'], 'ohne Bild kein „Ton hören“');
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
  more: (id, html, o) => '<more ' + o.label + ' ' + o.count + '>' + html + '</more>',
};
let h = n(KL.sec('hero', c, states, hass));
assert.ok(/^<line>Bereit\|Akku 15 %!warn<\/line>$/.test(h), h);
states['switch.pforte_ton'].state = 'off';
assert.ok(/Ton aus/.test(n(KL.sec('hero', c, states, hass))), 'Ton an der Klingel aus steht im Kopf');
states['switch.pforte_ton'].state = 'on';
const say = n(KL.sec('say', c, states, hass));
assert.ok(/<group Schnellantworten>Komme sofort=~!Abspielen#select\.select_option\{"option":"Komme sofort"\}/.test(say), say);
assert.ok(/Sirene=~Laut an der Tür, 10 Sekunden!Auslösen#siren\.turn_on\{"duration":10\}/.test(say), say);
const mo = n(KL.sec('more', c, states, hass));
assert.ok(/<more Einstellungen 4>/.test(mo), mo);
assert.ok(/<slider Klingelton=40 \[0,100,1\]>.*<slider Sprechen=50.*<slider Lautsprecher=80/.test(mo), 'Lautstärken in der Reihenfolge Klingel, Sprechen, Lautsprecher');
assert.ok(/Ton aufnehmen=An~Ohne Ton hörst du die Tür nicht!Ausschalten/.test(mo) && /Klingelton an der Tür=An~[^!]/.test(mo), mo);
assert.ok(/Privatsphäre=Aus~Kamera und Ton aus!Einschalten/.test(mo), 'Privatsphäre einschalten fragt nach');
assert.ok(/<seg Licht am Klingelknopf>Aus,Automatisch,Immer an\*<\/seg>/.test(mo), 'always/alwayson einmal');
assert.ok(/Automatische Antwort=Aus~/.test(mo) && /Akku=15 %/.test(mo) && /WLAN=Schwach~-72 dBm/.test(mo) && /Bild=Schwarz-Weiß/.test(mo), mo);
// Verlauf: lädt … dann Liste mit „Neu“ beim frischen Klingeln, Aufnahmen über die Reolink-Medienquelle.
const pend = Object.assign({}, hass, { callWS: () => new Promise(() => {}) });
assert.ok(/Wird geladen/.test(KL.sec('hist', c, states, pend)), 'lädt');
KL.forget(ID);
KL.history(wsHass, c, null);
await new Promise((r) => setTimeout(r, 0));
let hist = n(KL.sec('hist', c, states, wsHass));
assert.ok(/<group Verlauf>Hat geklingelt=Neu~\d\d:\d\d · vor 3 Min\./.test(hist), hist);
assert.ok(/Paket erkannt=~/.test(hist) && /Aufnahmen=~In den Medien von Home Assistant@klingel-go:\/media-browser/.test(hist), hist);
// Leer und Fehler
const emptyHass = Object.assign({}, hass, { callWS: () => Promise.resolve({}) });
KL.forget(ID); KL.history(emptyHass, c, null); await new Promise((r) => setTimeout(r, 0));
assert.ok(/Niemand hat geklingelt=~In den letzten 3 Tagen/.test(n(KL.sec('hist', c, states, emptyHass))));
const failHass = Object.assign({}, hass, { callWS: () => Promise.reject(new Error('x')) });
KL.forget(ID); KL.history(failHass, c, null); await new Promise((r) => setTimeout(r, 0));
assert.ok(/Verlauf nicht abrufbar/.test(KL.sec('hist', c, states, failHass)));

// Halten-Menü: Ton hören, Schnellantworten mit Rückfrage.
const m = KL.hold(hass, ID);
assert.deepEqual(m.map((x) => x.t + (x.sub ? ':' + x.sub : '')), ['Ton hören', 'Schnellantwort:Komme sofort', 'Schnellantwort:Bitte warten']);
assert.equal(m[1].svc, 'select.select_option'); assert.deepEqual(m[1].data, { option: 'Komme sofort' }); assert.ok(m[1].ask && m[1].done);
assert.deepEqual(KL.hold(hass, 'camera.carport_sub'), [], 'normale Kamera: nichts');

// Sprechen: nimmt die Klingel das Mikrofon an? (Richtung der Audio-Spur aus Sicht der Klingel)
const sdp = (dir, port = 9) => 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\nm=audio ' + port + ' UDP/TLS/RTP/SAVPF 111\r\n' + (dir ? 'a=' + dir + '\r\n' : '');
assert.equal(KL.talkAccepted(sdp('recvonly')), true); assert.equal(KL.talkAccepted(sdp('sendrecv')), true);
assert.equal(KL.talkAccepted(sdp('sendonly')), false, 'nur senden = kein Rückkanal');
assert.equal(KL.talkAccepted(sdp('inactive')), false); assert.equal(KL.talkAccepted(sdp('recvonly', 0)), false, 'abgelehnt');
assert.equal(KL.talkAccepted('v=0\r\nm=video 9 X 96\r\na=sendonly\r\n'), false, 'ohne Audio');
assert.equal(KL.canTalk(), false, 'ohne Browser/HTTPS kein Sprechen-Knopf');

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
