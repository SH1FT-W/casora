// Frigate (Community-Karte, 23-frigate.js) ohne HA: Erkennen der Frigate-Kamera, Finder am Gerät (ohne
// translation_key, über ID-Ende, Einheit „objects“, Symbol; umbenannte IDs über den Namen), Zustand und
// Kachel-Text, Ereignisliste der Integration (JSON-Text), Popup-Bereiche, Halten-Einträge, Wege nach Frigate.
// Kameras, Geräte und Namen erfunden.   node dev/unit/frigate.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(src('23-frigate.js'))();
const F = window._casoraFrigate;
const n = (x) => (x == null ? x : String(x).replace(/\u00a0/g, ' '));
assert.ok(F && F.find && F.status && F.tileText && F.hold, 'Modul geladen');

const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();
const entities = {}, states = {};
const devices = {
  d_srv: { id: 'd_srv', name: 'Frigate', configuration_url: 'http://frigate.local:5000' },
  d_cam: { id: 'd_cam', name: 'Gartentor', via_device_id: 'd_srv', configuration_url: 'http://frigate.local:5000/cameras/gartentor' },
  d_x: { id: 'd_x', name: 'Andere Kamera' },
};
const add = (id, state, attributes = {}, dev = 'd_cam', platform = 'frigate', changedMin = 60) => {
  entities[id] = { entity_id: id, platform, device_id: dev, translation_key: null };
  states[id] = { entity_id: id, state, attributes, last_changed: iso(changedMin) };
};
add('camera.gartentor', 'recording', { camera_name: 'gartentor', client_id: 'frigate', device_class: 'camera', friendly_name: 'Gartentor' });
add('binary_sensor.gartentor_person_occupancy', 'off', { device_class: 'occupancy', friendly_name: 'Gartentor Person occupancy' });
add('sensor.gartentor_person_count', '0', { unit_of_measurement: 'objects', friendly_name: 'Gartentor Person count' });
add('sensor.gartentor_person_active_count', '0', { unit_of_measurement: 'objects' });
add('image.gartentor_person', iso(3), { friendly_name: 'Gartentor Person', entity_picture: '/api/image_proxy/image.gartentor_person?token=x' });
add('binary_sensor.gartentor_car_occupancy', 'off', { device_class: 'occupancy' });
add('sensor.gartentor_car_count', '0', { unit_of_measurement: 'objects' });
add('image.gartentor_car', iso(47), { entity_picture: '/api/image_proxy/image.gartentor_car?token=x' });
add('binary_sensor.gartentor_all_occupancy', 'off', { device_class: 'occupancy' });
add('sensor.gartentor_all_count', '0', { unit_of_measurement: 'objects' });
add('binary_sensor.gartentor_motion', 'off', { device_class: 'motion' });
add('switch.gartentor_detect', 'on', { icon: 'mdi:motion-sensor' });
add('switch.gartentor_motion', 'on', { icon: 'mdi:motion-sensor' });
add('switch.gartentor_recordings', 'on', { icon: 'mdi:filmstrip-box-multiple' });
// Umbenannt: ID passt nicht mehr zum Kameranamen – über das Symbol der Integration gefunden.
add('switch.schnappschuesse_tor', 'on', { icon: 'mdi:image-multiple', friendly_name: 'Schnappschüsse Tor' });
// Umbenannte Belegung: über den Namen ohne Gerätenamen.
add('binary_sensor.tor_katze', 'off', { device_class: 'occupancy', friendly_name: 'Gartentor Cat occupancy' });
add('sensor.gartentor_review_status', 'NONE', {});
add('sensor.frigate_status', 'running', { icon: 'mdi:server' }, 'd_srv');
// Fremde Kamera ohne Frigate-Attribute.
add('camera.andere', 'idle', { friendly_name: 'Andere Kamera' }, 'd_x', 'generic');
const hass = { states, entities, devices, areas: {}, panels: {}, config: { components: ['frigate', 'media_source'] } };
const ID = 'camera.gartentor';

// Frigate-Kamera erkennen
assert.equal(F.is(hass, ID), true);
assert.equal(F.is(hass, 'camera.andere'), false, 'fremde Kamera');
entities[ID].platform = 'casora_mock';
assert.equal(F.is(hass, ID), true, 'auch ohne Plattform über camera_name + client_id (Test-HA)');
entities[ID].platform = 'frigate';
assert.equal(F.of(states['camera.andere'], hass, states), null);
// Birdseye: Kamera der Integration ohne camera_name/client_id – keine einzelne Frigate-Kamera (fix3 #4).
add('camera.birdseye', 'streaming', { device_class: 'camera', friendly_name: 'Birdseye' }, 'd_srv');
assert.equal(F.is(hass, 'camera.birdseye'), false, 'Birdseye ist keine Frigate-Kamera');
states['camera.birdseye'].state = 'unavailable';
assert.equal(F.is(hass, 'camera.birdseye'), false, 'auch nicht erreichbar nicht');
delete states['camera.birdseye']; delete entities['camera.birdseye'];

// Finder – beim HA-Start (Registry da, Zustand der Kamera noch nicht) nichts merken: sonst blieben Entitäten und
// der Kameraname (Rückfall Entity-ID, falsch für frigate/events/get) für immer so (C2).
const camSt = states[ID];
delete states[ID];
const early = F.find(hass, ID);
assert.equal(early.name, 'gartentor', 'Rückfall Entity-ID');
states[ID] = Object.assign({}, camSt, { attributes: Object.assign({}, camSt.attributes, { camera_name: 'tor_cam' }) });
hass.states = Object.assign({}, states);
assert.equal(F.find(hass, ID).name, 'tor_cam', 'Zustand da: neu gesucht, echter Kameraname');
states[ID] = camSt; hass.states = states;
F.find(Object.assign({}, hass, { entities: Object.assign({}, entities) }), ID);
const c = F.find(hass, ID);
assert.equal(c.name, 'gartentor'); assert.equal(c.inst, 'frigate');
assert.deepEqual(c.order, ['person', 'car', 'cat'], 'Reihenfolge Person, Auto, Katze');
assert.equal(c.objs.person.occ, 'binary_sensor.gartentor_person_occupancy');
assert.equal(c.objs.person.count, 'sensor.gartentor_person_count');
assert.equal(c.objs.person.active, 'sensor.gartentor_person_active_count');
assert.equal(c.objs.person.img, 'image.gartentor_person');
assert.equal(c.objs.cat.occ, 'binary_sensor.tor_katze', 'umbenannt: über den Namen');
assert.equal(c.all.occ, 'binary_sensor.gartentor_all_occupancy');
assert.equal(c.all.count, 'sensor.gartentor_all_count');
assert.equal(c.motion, 'binary_sensor.gartentor_motion');
assert.equal(c.sw.detect, 'switch.gartentor_detect');
assert.equal(c.sw.motion, 'switch.gartentor_motion', 'Bewegung über das ID-Ende, nicht über das gleiche Symbol wie detect');
assert.equal(c.sw.recordings, 'switch.gartentor_recordings');
assert.equal(c.sw.snapshots, 'switch.schnappschuesse_tor', 'umbenannt: über das Symbol');
assert.equal(c.review, 'sensor.gartentor_review_status');
assert.equal(c.server, 'sensor.frigate_status', 'Server-Status am via-Gerät');
assert.ok(F.watch(c).includes('image.gartentor_car') && F.watch(c).includes('switch.gartentor_detect'));
// Nicht erreichbar (Attribute weg): bleibt Frigate-Kamera mit dem gemerkten Namen, gemerkt (keine Registry-Suche je Zeichnung).
{
  const keep = states[ID];
  states[ID] = { entity_id: ID, state: 'unavailable', attributes: { friendly_name: 'Gartentor' }, last_changed: iso(1) };
  assert.equal(F.is(hass, ID), true, 'nicht erreichbar: weiter Frigate');
  const u1 = F.find(hass, ID);
  assert.equal(u1.name, 'gartentor', 'gemerkter Kameraname'); assert.equal(u1.inst, 'frigate');
  assert.equal(F.find(hass, ID), u1, 'aus dem Speicher (keine neue Suche)');
  states[ID] = keep;
  assert.notEqual(F.find(hass, ID), u1, 'wieder da: neu gesucht');
}
// Name für Titel und Dateien: der Kachelname, nicht der Gerätename (fix3 #2).
assert.equal(F.camName(hass, ID), 'Gartentor');
F.setName(ID, 'Hofkamera');
assert.equal(F.camName(hass, ID), 'Hofkamera');
F.setName(ID, '[[[ return 1 ]]]');
assert.equal(F.camName(hass, ID), 'Hofkamera', 'Vorlage ist kein Name');
assert.equal(F.fileName('Hofkamera', new Date(2026, 9, 16, 19, 19).getTime(), 'mp4', 300), 'Hofkamera 2026-10-16 19-19 (5 Min.).mp4', 'Länge im Namen');
assert.equal(F.fileName('Hof/kamera', new Date(2026, 9, 16, 19, 19).getTime(), 'mp4', 42), 'Hof kamera 2026-10-16 19-19 (42 s).mp4');
assert.equal(F.fileName('Hofkamera', new Date(2026, 9, 16, 19, 19).getTime(), 'jpg'), 'Hofkamera 2026-10-16 19-19.jpg');

// Zustand und Kachel
let s = F.status(c, states, NOW);
assert.equal(s.last.o, 'person'); assert.equal(n(F.tileText(s, NOW)), 'Person · vor 3 Min.');
assert.ok(/^Person \d\d:\d\d$/.test(n(F.tileText(s, NOW, true))), 'schmal: mit Uhrzeit');
assert.equal(s.objs.car.at, NOW - 47 * 60000);
states['binary_sensor.gartentor_car_occupancy'] = { state: 'on', attributes: {}, last_changed: iso(0.2) };
states['sensor.gartentor_car_count'] = { state: '1', attributes: { unit_of_measurement: 'objects' } };
s = F.status(c, states, NOW);
assert.deepEqual(s.live, ['car']); assert.equal(n(F.tileText(s, NOW)), 'Auto erkannt');
assert.equal(s.last.o, 'car', 'laufende Erkennung ist die letzte');
states['binary_sensor.gartentor_person_occupancy'] = { state: 'on', attributes: {}, last_changed: iso(0.1) };
assert.equal(n(F.tileText(F.status(c, states, NOW), NOW)), 'Person und Auto erkannt');
states['binary_sensor.gartentor_car_occupancy'].state = 'off'; states['sensor.gartentor_car_count'].state = '0';
states['binary_sensor.gartentor_person_occupancy'].state = 'off';
states['switch.gartentor_detect'].state = 'off';
assert.equal(n(F.tileText(F.status(c, states, NOW), NOW)), 'Objekterkennung aus'); assert.equal(n(F.tileText(F.status(c, states, NOW), NOW, true)), 'Erkennung aus', 'schmal kurz');
states['switch.gartentor_detect'].state = 'on';
// Lange her (> 24 Std.) oder nie: null → die Kachel zeigt den Kamera-Text (Aktuell/Online).
states['image.gartentor_person'].state = iso(3000); states['image.gartentor_car'].state = 'unknown';
states['binary_sensor.gartentor_person_occupancy'].state = 'off';
assert.equal(n(F.tileText(F.status(c, states, NOW), NOW)), null);
states['image.gartentor_person'].state = iso(3); states['image.gartentor_car'].state = iso(47);
// Offline / aus
states[ID].state = 'unavailable';
assert.equal(n(F.tileText(F.status(c, states, NOW), NOW)), null, 'offline: Kamera-Kachel sagt „Offline“');
states[ID].state = 'recording';
assert.equal(n(F.ago(NOW - 30000, NOW)), 'gerade eben'); assert.equal(n(F.ago(NOW - 90 * 60000, NOW)), 'vor 2 Std.');
assert.equal(n(F.ago(NOW - 5 * 60000, NOW, true)), '5 Min.', 'Kurzform ohne „vor“'); assert.ok(/vor\u00a05\u00a0Min\./.test(F.ago(NOW - 5 * 60000, NOW)), 'geschützte Leerzeichen');
assert.equal(F.label('license_plate'), 'Kennzeichen'); assert.equal(F.label('garbage_truck'), 'Garbage truck', 'unbekannt lesbar');
window.casoraLocale = () => 'en';
assert.equal(F.label('car'), 'Car', 'Englisch: Frigates Label, nicht „Auto“'); assert.equal(F.label('license_plate'), 'License plate');
delete window.casoraLocale;

// Ereignisse der Integration (JSON-Text, Zeit in Sekunden)
const raw = JSON.stringify([
  { id: '1760615820.1-a', camera: 'gartentor', label: 'person', start_time: 1760615820.1, end_time: 1760615862, has_clip: true, has_snapshot: true, zones: ['einfahrt'], data: { top_score: 0.874 } },
  { id: '1760616000.2-b', camera: 'gartentor', label: 'car', start_time: 1760616000.2, end_time: null, has_clip: false, has_snapshot: true, zones: [], top_score: 0.9 },
  { id: 'kaputt' },
]);
const ev = F.parse(raw);
assert.equal(ev.length, 2); assert.equal(ev[0].o, 'car', 'neueste zuerst'); assert.equal(ev[0].end, null);
assert.equal(ev[1].score, 0.874); assert.equal(ev[1].start, 1760615820100); assert.deepEqual(ev[1].zones, ['einfahrt']);
assert.deepEqual(F.parse('kein json'), []);
assert.equal(F.path(c, 'thumb', '1.2-a'), '/api/frigate/frigate/thumbnail/1.2-a');
assert.equal(F.path(c, 'clip', '1.2-a'), '/api/frigate/frigate/notifications/1.2-a/clip.mp4');

// Wege: Frigate-App in der Seitenleiste vor der Geräteadresse; Aufnahmen nur mit Frigate + Medien.
assert.deepEqual(F.ui(hass, c), { url: 'http://frigate.local:5000/cameras/gartentor' });
hass.panels = { ccab4aaf_frigate: { url_path: 'ccab4aaf_frigate', title: 'Frigate' } };
assert.deepEqual(F.ui(hass, c), { path: '/ccab4aaf_frigate' });
assert.equal(F.media(hass), '/media-browser/browser/app%2Cmedia-source%3A%2F%2Ffrigate');
assert.equal(F.media({ config: { components: ['media_source'] } }), null);

// Popup-Bereiche (UI-Bausteine als Platzhalter)
window._casoraUI = {
  esc: (t) => String(t), tokens: {},
  line: (m, r) => '<line>' + m + '|' + [].concat(r || []).join(';') + '</line>',
  group: (rows, label) => '<group ' + label + '>' + rows.map((r) => r.label + '=' + (r.value || '') + '~' + (r.sub || '') + (r.confirm ? '!' : '') + (r.entity ? '@' + r.entity : '')).join(';') + '</group>',
  label: (t) => '<label ' + t + '>',
  more: (id, html, o) => '<more ' + o.label + '/' + o.less + '>' + html + '</more>',
};
let h = n(F.sec('hero', c, states, hass));
assert.ok(/^<line>Person\|vor \d+ Min\.<\/line>$/.test(h), 'Kopf wie die Liste: „Person · vor 3 Min.“ (C10)');
states['switch.gartentor_recordings'].state = 'off';
assert.ok(/Aufnahme aus/.test(n(F.sec('hero', c, states, hass))), 'nur „Aufnahme aus“ steht im Kopf');
states['switch.gartentor_recordings'].state = 'on';
states['binary_sensor.gartentor_person_occupancy'] = { state: 'on', attributes: {}, last_changed: new Date().toISOString() };
assert.ok(/^<line>Person erkannt\|/.test(n(F.sec('hero', c, states, hass))));
const ctl = n(F.sec('ctl', c, states, hass));
assert.ok(/^<more Einstellungen\/Einstellungen>/.test(ctl), 'Schalter unten unter „Einstellungen“');
assert.ok(/<group Aufnahme & Erkennung>Aufnahme=An~!/.test(ctl) && /Schnappschüsse=An~[^!]/.test(ctl) && /Bewegungserkennung=An~Löst die Objekterkennung aus!/.test(ctl), ctl);
assert.ok(!/(>|;)(Objekterkennung|Erkennung|Detect)=/.test(ctl), 'Erkennung ist der Hauptschalter im Kopf, nicht doppelt');
const objs = n(F.sec('objs', c, states, hass));
assert.ok(/Person=~Gerade im Bild/.test(objs) && /Auto=~Zuletzt vor 4[67] Min\.@frigate-img:image\.gartentor_car/.test(objs) && /Katze=~Noch nicht erkannt/.test(objs), objs);
assert.equal(F.sec('sys', c, states, hass), '', 'Frigate läuft: kein Abschnitt (Kopf meldet Störungen)');
states['sensor.frigate_status'].state = 'error';
assert.ok(/<group System>Frigate=Fehler/.test(F.sec('sys', c, states, hass)));
assert.ok(/Frigate meldet Fehler/.test(F.sec('hero', c, states, hass)));
states['sensor.frigate_status'].state = 'running';
// Ereignisliste: lädt (Antwort steht aus) …
const pend = Object.assign({}, hass, { callWS: () => new Promise(() => {}) });
assert.ok(/Wird geladen/.test(F.sec('ev', c, states, pend)), 'lädt');
// … und Integration antwortet nicht.
const fail = Object.assign({}, hass, { callWS: () => Promise.reject(new Error('unknown_command')) });
F.sec('ev', F.find(fail, 'camera.gartentor'), states, fail);
await new Promise((r) => setTimeout(r, 0));
// (Cache je Kamera: nach dem Fehler steht der Hinweis da, bis 30 s um sind oder sich etwas ändert.)
states['image.gartentor_person'].last_changed = new Date().toISOString();
const failNow = F.sec('ev', c, states, fail);
await new Promise((r) => setTimeout(r, 0));
const failTxt = F.sec('ev', c, states, fail);
assert.ok(/Frigate antwortet nicht|Wird geladen/.test(failNow + failTxt), failNow + failTxt);
assert.ok(/In Frigate öffnen=~@frigate-go:\/ccab4aaf_frigate/.test(failTxt), failTxt);
// Aufnahmen: eigener Abschnitt; ohne Übersicht (Fehler) bleibt der Weg in HAs Medien als Fußzeile.
F.sec('rec', c, states, fail);
await new Promise((r) => setTimeout(r, 0));
const recFail = n(F.sec('rec', c, states, fail));
assert.ok(/<group Aufnahmen>Alle Aufnahmen=~In den Medien von Home Assistant@frigate-go:/.test(recFail), recFail);


// Liste mit 10 Erkennungen: 8 sichtbar + „Mehr anzeigen“; Antippen eines Objekts filtert, noch einmal → alle.
const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i, camera: 'gartentor', label: i % 3 ? 'car' : 'person',
  start_time: (Date.now() - (i + 1) * 3600000) / 1000, end_time: i ? (Date.now() - (i + 1) * 3600000) / 1000 + 30 : null, has_clip: true, has_snapshot: true, zones: [] })));
const okWs = Object.assign({}, hass, { callWS: (m) => Promise.resolve(m.type === 'auth/sign_path' ? { path: m.path + '?authSig=x' } : many) });
F.forget('camera.gartentor');
F.sec('ev', c, states, okWs);
await new Promise((r) => setTimeout(r, 10));
let evh = n(F.sec('ev', c, states, okWs));
assert.equal((evh.match(/@frigate-ev:/g) || []).length, 8, evh);
assert.ok(/data-casora-mi="frigate-more:camera\.gartentor"[^>]*>.*Mehr anzeigen/.test(evh) && /Person=Live~/.test(evh), evh);
// Ohne Reviews (die Antwort hat kein „severity“ – ältere Frigate-Version): Ereignisliste, nur die Pille „Filter“ (zu).
assert.ok(/<label Letzte Erkennungen>/.test(evh) && /data-casora-mi="frigate-fx:camera\.gartentor"/.test(evh) && /aria-expanded="false"/.test(evh)
  && !/kind\|/.test(evh) && !/frigate-flt:/.test(evh), 'Ereignis-Modus: Pille „Filter“ ohne Art-Chips, Bereich zu');
const hook = (id) => window._casoraMiHooks.some((fn) => fn(id));
assert.ok(hook('frigate-fx:camera.gartentor'));
evh = n(F.sec('ev', c, states, okWs));
assert.ok(/aria-expanded="true"/.test(evh) && /<div class="frig-fl">Zeitraum<\/div>/.test(evh) && /range\|today/.test(evh) && /fav\|/.test(evh)
  && /<div class="frig-fl">Objekte<\/div>/.test(evh) && /data-casora-mi="frigate-flt:camera\.gartentor\|car"/.test(evh), 'Filter aufgeklappt: Zeitraum, Favoriten, Objekte je eine Reihe');
assert.ok(hook('frigate-more:camera.gartentor'));
assert.equal((n(F.sec('ev', c, states, okWs)).match(/@frigate-ev:/g) || []).length, 10, 'Mehr: alle');
assert.ok(hook('frigate-flt:camera.gartentor|person'));
evh = n(F.sec('ev', c, states, okWs));
assert.ok(/aria-pressed="true" data-casora-mi="frigate-flt:camera\.gartentor\|person"/.test(evh) && !/Auto=/.test(evh), evh);
assert.ok(/1 Filter aktiv/.test(evh) && /frigate-f:camera\.gartentor\|clear\|/.test(evh) && /Filter · 1/.test(evh), 'gesetzter Filter sichtbar: „1 Filter aktiv · Zurücksetzen“, Pille mit Zähler');
assert.ok(/Person=[^;]*@frigate-flt:camera\.gartentor\|person/.test(n(F.sec('objs', c, states, okWs))), 'Objekt-Zeile filtert');
assert.ok(hook('frigate-flt:camera.gartentor|person'));
assert.equal(F.filter('camera.gartentor'), null, 'noch einmal: Filter aus');

// Halten-Menü: Erkennung/Aufnahme aus mit Rückfrage, an ohne; letzte Erkennung; Frigate öffnen.
states['binary_sensor.gartentor_person_occupancy'].state = 'off';
let m = F.hold(hass, ID);
assert.deepEqual(m.map((x) => x.t), ['Erkennung aus', 'Aufnahme aus', 'Letzte Erkennung', 'Aufnahmen', 'In Frigate öffnen'], 'kurz wie die übrigen Befehle (passte am Desktop nicht ins Menü)');
assert.equal(m[0].svc, 'switch.turn_off'); assert.equal(m[0].entity, 'switch.gartentor_detect'); assert.equal(m[0].ask, 'Erkennung ausschalten?', 'Rückfrage mit demselben Wort');
states['switch.gartentor_recordings'].state = 'off';
m = F.hold(hass, ID);
assert.equal(m[1].t, 'Aufnahme an'); assert.equal(m[1].svc, 'switch.turn_on'); assert.equal(m[1].ask, null, 'einschalten ohne Rückfrage');
states['switch.gartentor_detect'].state = 'unavailable';
assert.ok(!F.hold(hass, ID).some((x) => /^Erkennung (an|aus)$/.test(x.t)), 'Schalter nicht verfügbar → kein Eintrag');
assert.deepEqual(F.hold(hass, 'camera.andere'), [], 'fremde Kamera: nichts');
// Warteliste ohne Doppelte (C12): dieselbe Karte fragt mehrmals, während die Anfrage läuft.
F.forget('camera.gartentor');
const el = { isConnected: true };
let release, kicks = 0;
const slow = Object.assign({}, hass, { callWS: (m) => (m.type === 'auth/sign_path' ? Promise.resolve({ path: m.path }) : new Promise((r) => { release = () => r('[]'); })) });
window.casoraKick = (w) => { if (w === el) kicks++; };
F.events(slow, c, el); F.events(slow, c, el); F.events(slow, c, el);
release(); await new Promise((r) => setTimeout(r, 10));
assert.equal(kicks, 1, 'jede Karte einmal neu zeichnen');
delete window.casoraKick;
// Kopf: Ruhe = Sand, Erkennung = Rot; Hauptschalter = Objekterkennung in Bedien-Farbe mit Rückfrage beim Ausschalten (D7).
const tsrc = { _config: { template: ['casora_frigate'] }, _stateObj: states[ID] };
window.document.querySelector = (q) => (q === 'home-assistant' ? { hass } : null);
const hue = window._casoraRingHueHooks.map((f) => f(tsrc, 'casora_frigate camera.gartentor')).find(Boolean);
assert.deepEqual(hue, { off: true }, 'Ruhe: Sand');
const hs = window._casoraHeadSwitchHooks.map((f) => f(tsrc, hass)).find((x) => x != null);
assert.deepEqual(hs.entities, ['switch.gartentor_detect']); assert.equal(hs.label, 'Objekterkennung'); assert.ok(/ui-action/.test(hs.color));

// ── Frigate 2: Reviews, Filter, Gesehen, Behalten, Rückfälle ──────────────
states['switch.gartentor_detect'].state = 'on'; states['switch.gartentor_recordings'].state = 'on';
const T0 = Math.floor(Date.now() / 1000);
const rvRaw = [
  { id: 'r1', camera: 'gartentor', start_time: T0 - 120, end_time: T0 - 60, has_been_reviewed: false, severity: 'alert',
    data: { detections: ['e1'], objects: ['person-verified', 'car'], sub_labels: [['Kim', 0.9]], zones: ['einfahrt'], audio: [] } },
  { id: 'r2', camera: 'gartentor', start_time: T0 - 3600, end_time: T0 - 3500, has_been_reviewed: false, severity: 'alert',
    data: { detections: ['e2'], objects: ['person'], sub_labels: [], zones: [], audio: [] } },
  { id: 'r3', camera: 'gartentor', start_time: T0 - 7200, end_time: null, has_been_reviewed: true, severity: 'detection',
    data: { detections: ['e3'], objects: ['cat'], sub_labels: [], zones: ['garten'], audio: [] } },
  { id: 'r4', camera: 'gartentor', start_time: T0 - 3 * 86400, end_time: T0 - 3 * 86400 + 30, has_been_reviewed: false, severity: 'detection',
    data: { detections: [], objects: [], sub_labels: [], zones: [], audio: ['speech'] } },
];
const rv = F.parseReviews(JSON.stringify(rvRaw));
assert.deepEqual(rv.map((r) => r.id), ['r1', 'r2', 'r3', 'r4'], 'neueste zuerst');
assert.deepEqual(rv[0].objs, ['person', 'car'], '„-verified“ weg'); assert.equal(rv[0].o, 'person'); assert.equal(rv[0].sub, 'Kim', 'Gesicht aus [Name, Treffer]');
assert.equal(rv[0].sev, 'alert'); assert.equal(rv[0].seen, false); assert.deepEqual(rv[0].dets, ['e1']); assert.equal(rv[0].start, (T0 - 120) * 1000);
assert.equal(rv[2].end, null, 'läuft noch'); assert.equal(rv[3].o, 'speech', 'nur Geräusch: das Geräusch');
assert.equal(F.parseReviews(JSON.stringify([{ id: 'x', label: 'person', start_time: 1 }])), null, 'Ereignis-Antwort (ohne severity) ist keine Review-Liste');
assert.deepEqual(F.parseReviews('[]'), [], 'leer bleibt leer'); assert.equal(F.parseReviews('kaputt'), null);
const evRaw = [
  { id: 'e1', camera: 'gartentor', label: 'person', sub_label: 'Kim', start_time: T0 - 120, end_time: T0 - 60, has_clip: true, has_snapshot: true, zones: ['einfahrt'], data: { top_score: 0.91 } },
  { id: 'e2', camera: 'gartentor', label: 'person', start_time: T0 - 3600, end_time: T0 - 3500, has_clip: true, has_snapshot: true, zones: [], retain_indefinitely: true },
  { id: 'e3', camera: 'gartentor', label: 'cat', start_time: T0 - 7200, end_time: null, has_clip: false, has_snapshot: true, zones: ['garten'] },
];
const calls = [];
const SUM = [{ day: '2026-10-15', events: 3, hours: [{ hour: '09', duration: 3600, events: 1 }, { hour: '08', duration: 1800, events: 2 }] },
  { day: '2026-10-16', events: 1, hours: [{ hour: '07', duration: 900, events: 1 }, { hour: '06', duration: 0, events: 0 }] }, { day: 'kaputt' }];
const rvWs = Object.assign({}, hass, { callWS: (m) => {
  calls.push(m);
  if (m.type === 'auth/sign_path') return Promise.resolve({ path: m.path + (m.path.includes('?') ? '&' : '?') + 'authSig=x' });
  if (m.type === 'frigate/reviews/get') return Promise.resolve(JSON.stringify(rvRaw));
  if (m.type === 'frigate/events/get') return Promise.resolve(JSON.stringify(m.favorites ? evRaw.filter((e) => e.retain_indefinitely) : evRaw));
  if (m.type === 'frigate/reviews/viewed') return Promise.resolve({ success: true });
  if (m.type === 'frigate/event/retain') {
    const e = evRaw.find((x) => x.id === m.event_id); if (e) e.retain_indefinitely = m.retain;
    return Promise.resolve(JSON.stringify({ success: true, message: 'ok' }));
  }
  if (m.type === 'frigate/recordings/summary') return Promise.resolve(JSON.stringify(SUM));
  return Promise.reject(new Error('unknown_command'));
} });
globalThis.fetch = () => Promise.resolve({ ok: true });
F.forget(ID); F.setFilter(ID, 'reset');
F.sec('ev', c, states, rvWs);
await new Promise((r) => setTimeout(r, 20));
let rh = n(F.sec('ev', c, states, rvWs));
assert.ok(/kind\|alert/.test(rh) && /kind\|detection/.test(rh) && /kind\|unseen/.test(rh) && /frigate-fx:/.test(rh), 'Review-Chips: eine Reihe Alle · Alarme · Erkennungen · Neu, dahinter „Filter“');
// B10: „Neu“ zählt die ungesehenen Alarme – dieselbe Zahl wie Kachel und Kopf.
assert.ok(/>Neu<\/span><span[^>]*>2<\/span>/.test(rh), 'Neu mit Anzahl 2');
assert.equal(F.unseen(ID), 2, 'Chip = F.unseen');
assert.ok(/^<line>2 neue Alarme\|/.test(n(F.sec('hero', c, states, rvWs))), 'Kopf zählt gleich');
assert.ok(!/frig-fl/.test(rh.replace(/<style>[\s\S]*?<\/style>/g, '')) || /aria-expanded="true"/.test(rh), 'Bereich zu: keine Gruppen');
if (!/aria-expanded="true"/.test(rh)) assert.ok(hook('frigate-fx:camera.gartentor'));
rh = n(F.sec('ev', c, states, rvWs));
assert.ok(/zone\|einfahrt/.test(rh) && /zone\|garten/.test(rh) && /face\|Kim/.test(rh), 'Zonen- und Gesicht-Chips aus den Daten');
assert.ok(/<span data-no-i18n[^>]*>Kim<\/span>/.test(rh), 'Gesichtsname nicht übersetzt (A14)');
assert.ok(/face\|%E2%88%85/.test(rh) && />Unbekannt</.test(rh), 'Gesichter: „Unbekannt“ als Gegenstück (Person ohne Namen)');
assert.ok(/Person, Auto · Kim=Neu~/.test(rh) && /@frigate-rv:camera\.gartentor\|r1/.test(rh), 'Review-Zeile: Objekte, Gesicht, „Neu“, öffnet als Review');
assert.ok(/Person ★=Neu~/.test(rh), 'Favorit (über das Ereignis der Erkennung): Stern');
assert.ok(/=~[^;]*@frigate-rv:camera\.gartentor\|r4/.test(rh), 'ungesehene Erkennung: kein „Neu“ (nur Alarme)');
assert.ok(/Katze=Live~/.test(rh), 'laufend: Live');
const r1 = calls.find((m) => m.type === 'frigate/reviews/get');
assert.ok(r1 && r1.instance_id === 'frigate' && r1.cameras[0] === 'gartentor' && r1.after > 0, 'reviews/get mit Instanz, Kamera, 7 Tage');
assert.ok(F.items(ID).list.some((x) => /\/api\/frigate\/frigate\/clips\/review\/thumb-gartentor-r1\.webp\?authSig=x$/.test(x.thumb)), 'Vorschaubild zuerst über den Clips-Proxy (signiert)');
assert.ok(calls.some((m) => m.type === 'frigate/reviews/get' && m.reviewed === false && m.severity === 'alert'), 'Neu-Zähler: eigene Abfrage ungesehener Alarme');
assert.ok(calls.some((m) => m.type === 'frigate/events/get' && m.favorites === true), 'Favoriten immer mitgeladen (Stern an älteren Reviews)');
// Gesehen-Rennen: lokal gesetztes „Gesehen“ gilt vor einer älteren Antwort (~10 s).
F._localSeen.r2 = { v: true, at: Date.now() };
assert.ok(!F.unseenIds(ID).includes('r2'), 'lokal gesehen zählt nicht als neu');
delete F._localSeen.r2;
assert.equal(F.path(c, 'rclip', 'r9', '/media/frigate/clips/review/thumb-gartentor-r9.webp'), '/api/frigate/frigate/clips/review/thumb-gartentor-r9.webp', 'thumb_path der Review');
// Rückfälle des Vorschaubilds: Clips-Proxy fehlt → review_thumbnail.webp; Notification-Proxy aus → Bild der Erkennung,
// eine Review ohne Erkennung ohne Bild (nicht über den gesperrten Proxy).
{
  const r4 = F.parseReviews(JSON.stringify(rvRaw))[3], r1x = F.parseReviews(JSON.stringify(rvRaw))[0];
  assert.ok(/review_thumbnail\.webp$/.test(F.thumbPath(c, r1x, false, true)), 'ohne Clips-Proxy: review_thumbnail.webp');
  assert.ok(/\/thumbnail\/e1$/.test(F.thumbPath(c, r1x, false, false)), 'Proxy aus: Bild der Erkennung');
  assert.equal(F.thumbPath(c, r4, false, false), null, 'Review ohne Erkennung bei gesperrtem Proxy: kein Bild');
}
// Filter
assert.ok(hook('frigate-f:camera.gartentor|kind|alert'));
assert.deepEqual(F.shown(ID).map((x) => x.id), ['r1', 'r2'], 'Alarme');
assert.ok(hook('frigate-f:camera.gartentor|kind|unseen'));
assert.deepEqual(F.shown(ID).map((x) => x.id), ['r1', 'r2'], 'Neu = ungesehene Alarme');
assert.ok(hook('frigate-f:camera.gartentor|kind|'));
assert.ok(hook('frigate-f:camera.gartentor|range|today'));
assert.ok(!F.shown(ID).some((x) => x.id === 'r4'), 'Heute ohne die vor 3 Tagen');
assert.ok(hook('frigate-f:camera.gartentor|face|' + encodeURIComponent(F.NOFACE)));
assert.deepEqual(F.shown(ID).map((x) => x.id), ['r2'], 'Unbekannt: Person ohne Gesicht');
assert.ok(hook('frigate-f:camera.gartentor|face|' + encodeURIComponent(F.NOFACE)));
assert.ok(hook('frigate-f:camera.gartentor|zone|einfahrt'));
assert.deepEqual(F.shown(ID).map((x) => x.id), ['r1'], 'Zone');
assert.ok(hook('frigate-f:camera.gartentor|reset|'));
assert.deepEqual(F.filters(ID), { kind: '', range: 'week', fav: false, o: null, zone: null, face: null }, 'zurückgesetzt');
// A14: „|“ im Wert (Zone, Gesicht) bleibt heil.
assert.ok(hook('frigate-f:camera.gartentor|zone|' + encodeURIComponent('a|b'))); assert.equal(F.filters(ID).zone, 'a|b');
assert.ok(hook('frigate-f:camera.gartentor|clear|')); assert.equal(F.filters(ID).zone, null, 'Zurücksetzen (Bereich)');
assert.ok(hook('frigate-f:camera.gartentor|face|Kim')); assert.deepEqual(F.shown(ID).map((x) => x.id), ['r1'], 'Gesicht');
assert.ok(hook('frigate-f:camera.gartentor|face|Kim')); assert.equal(F.filters(ID).face, null, 'noch einmal: aus');
assert.ok(hook('frigate-f:camera.gartentor|kind|detection')); assert.ok(hook('frigate-f:camera.gartentor|range|today'));
F.setFilter(ID, 'o', 'dog');
const none = n(F.sec('ev', c, states, rvWs));
assert.ok(/Nichts gefunden=~Filter ändern oder zurücksetzen/.test(none) && /frigate-f:camera\.gartentor\|reset\|/.test(none), 'leer mit Filter: Zurücksetzen');
F.setFilter(ID, 'reset');
// Kachel: ungesehene Alarme nach „Person erkannt“; Gesehen markiert und meldet es Frigate.
assert.equal(F.unseen(ID), 2, '2 ungesehene Alarme');
assert.equal(n(F.tileText(F.status(c, states))), '2 neue Alarme'); assert.equal(n(F.tileText(F.status(c, states), null, 175)), '2 Alarme', 'sehr schmal (Handy ~175 px)');
assert.equal(n(F.tileText(F.status(c, states), null, 228)), '2 neue Alarme', 'Tablet-Kachel (~230 px): sinnerhaltend „2 neue Alarme“');
assert.ok(/^<line>2 neue Alarme\|/.test(n(F.sec('hero', c, states, rvWs))), 'Kopf');
await F.seen(rvWs, c, 'r2');
assert.ok(calls.some((m) => m.type === 'frigate/reviews/viewed' && m.ids[0] === 'r2' && m.viewed === true), 'reviews/viewed');
assert.equal(n(F.tileText(F.status(c, states))), '1 neuer Alarm');
states['binary_sensor.gartentor_person_occupancy'] = { state: 'on', attributes: {}, last_changed: new Date().toISOString() };
assert.equal(n(F.tileText(F.status(c, states))), 'Person erkannt', 'live geht vor');
states['binary_sensor.gartentor_person_occupancy'].state = 'off';
// Behalten: event/retain, Liste sofort, Chip „Behalten“ fragt favorites:true.
assert.ok(await F.retain(rvWs, c, 'e1', true));
assert.ok(calls.some((m) => m.type === 'frigate/event/retain' && m.event_id === 'e1' && m.retain === true));
assert.ok(F.items(ID).list.find((x) => x.id === 'r1').fav, 'sofort behalten');
assert.ok(hook('frigate-f:camera.gartentor|fav|'));
F.sec('ev', c, states, rvWs); await new Promise((r) => setTimeout(r, 20));
assert.ok(calls.some((m) => m.type === 'frigate/events/get' && m.favorites === true), 'favorites:true');
assert.deepEqual(F.shown(ID).map((x) => x.id).sort(), ['e1', 'e2'], 'Favoriten: Ereignisse');
F.setFilter(ID, 'reset');
// Rückfall: reviews/get scheitert → Ereignisliste ohne Fehlermeldung, ohne Alarm-Chips.
const oldWs = Object.assign({}, rvWs, { callWS: (m) => (m.type === 'frigate/reviews/get' ? Promise.reject(new Error('unknown_command')) : rvWs.callWS(m)) });
F.forget(ID);
F.sec('ev', c, states, oldWs); await new Promise((r) => setTimeout(r, 20));
rh = n(F.sec('ev', c, states, oldWs));
assert.ok(!/antwortet nicht/.test(rh) && /@frigate-ev:camera\.gartentor\|e1/.test(rh) && !/kind\|alert/.test(rh), rh);
assert.equal(F.items(ID).mode, 'event');
assert.equal(F.unseen(ID), 0, 'ohne Reviews keine Alarm-Zahl');

// Aufnahmen-Übersicht und Zeitleiste
const sum = F.parseSummary(JSON.stringify(SUM));
assert.deepEqual(sum.map((d) => d.day), ['2026-10-16', '2026-10-15'], 'neuester Tag zuerst');
assert.deepEqual(sum[1].hours.map((h) => h.h), [8, 9], 'Stunden aufsteigend'); assert.equal(sum[0].hours.length, 1, 'Stunde ohne Aufnahme weg');
assert.equal(sum[1].hours[0].n, 2);
F.sec('rec', c, states, rvWs); await new Promise((r) => setTimeout(r, 20));
const recH = n(F.sec('rec', c, states, rvWs));
assert.ok(/<group Aufnahmen>/.test(recH) && /@frigate-rec:camera\.gartentor\|2026-10-16/.test(recH) && /15 Min\. aufgenommen · 1 Erkennung/.test(recH)
  && /2 Std\. aufgenommen · 3 Erkennungen/.test(recH) && /Alle Aufnahmen=~In den Medien/.test(recH), recH);
const segs = F.parseSegments(JSON.stringify([{ start_time: 110, end_time: 120 }, { start_time: 100, end_time: 110 }, { start_time: 130, end_time: 140 }, { start_time: 5 }]));
assert.deepEqual(segs, [{ s: 100, e: 110 }, { s: 110, e: 120 }, { s: 130, e: 140 }]);
assert.deepEqual(F.recRanges(segs), [{ s: 100, e: 120 }, { s: 130, e: 140 }], 'Lücke 10 s bleibt, angrenzend zusammen');
assert.deepEqual(F.recOffset(segs, 115), { off: 15, t: 115 });
assert.deepEqual(F.recOffset(segs, 125), { off: 20, t: 130 }, 'in der Lücke: nächstes Segment');
assert.deepEqual(F.recOffset(segs, 50), { off: 0, t: 100 }, 'vor dem Anfang');
assert.deepEqual(F.recOffset(segs, 999), { off: 30, t: 140 }, 'nach dem Ende');
assert.equal(F.recAt(segs, 25), 135); assert.equal(F.recAt(segs, 0), 100); assert.equal(F.recAt(segs, 99), 140);
assert.equal(F.recDur(segs), 30);
assert.equal(F.tlFrac(1800, 0, 3600), 0.5); assert.equal(F.tlTime(1.4, 0, 3600), 3600); assert.equal(F.tlTime(0.25, 0, 3600), 900);
assert.equal(F.tlKey('ArrowRight', false, 100, 0, 3600), 110); assert.equal(F.tlKey('ArrowLeft', true, 100, 0, 3600), 40);
assert.equal(F.tlKey('ArrowLeft', false, 5, 0, 3600), 0, 'nicht vor den Anfang'); assert.equal(F.tlKey('PageUp', false, 100, 0, 3600), 400);
assert.equal(F.tlKey('End', false, 100, 0, 3600), 3600); assert.equal(F.tlKey('a', false, 100, 0, 3600), null);
assert.equal(F.path(c, 'vod', 100, 200), '/api/frigate/frigate/vod/gartentor/start/100/end/200/master.m3u8');
assert.equal(F.path(c, 'vodev', 'e1'), '/api/frigate/frigate/vod/event/e1/master.m3u8');
assert.equal(F.path(c, 'rec', 100, 200), '/api/frigate/frigate/recording/gartentor/start/100/end/200');
assert.equal(F.path(c, 'rthumb', 'r1'), '/api/frigate/frigate/notifications/r1/gartentor/review_thumbnail.webp');

// Abo: nur solange ein Popup-Bereich hängt (und die Seite vorn ist); sauber abgemeldet; Rückfall auf events/subscribe.
const subLog = [];
let pushMsg = null;
const conn = { subscribeMessage: (cb, msg) => {
  subLog.push('+' + msg.type);
  if (msg.type === 'frigate/reviews/subscribe' && conn.noReviews) return Promise.reject(new Error('unknown_command'));
  pushMsg = cb; return Promise.resolve(() => subLog.push('-' + msg.type));
} };
const subWs = Object.assign({}, rvWs, { connection: conn });
const pop = { isConnected: true };
F.forget(ID);
F.sec('ev', c, states, subWs, pop);
await new Promise((r) => setTimeout(r, 20));
assert.deepEqual(subLog, ['+frigate/reviews/subscribe'], 'Popup offen: Abo');
assert.ok(F.subOn('frigate'));
let kicked = 0;
window.casoraKick = (w) => { if (w === pop) kicked++; };
const nGet0 = calls.filter((m) => m.type === 'frigate/reviews/get' && m.reviewed == null).length;
F.sec('ev', c, states, subWs, pop); await new Promise((r) => setTimeout(r, 20));
assert.equal(calls.filter((m) => m.type === 'frigate/reviews/get' && m.reviewed == null).length, nGet0, 'mit Abo: kein Abfrage-Takt');
pushMsg(JSON.stringify({ type: 'new', after: { id: 'r9', camera: 'gartentor' } }));
await new Promise((r) => setTimeout(r, 700));
assert.ok(kicked >= 1, 'Meldung: Bereich neu zeichnen');
F.sec('ev', c, states, subWs, pop); await new Promise((r) => setTimeout(r, 20));
assert.equal(calls.filter((m) => m.type === 'frigate/reviews/get' && m.reviewed == null).length, nGet0 + 1, 'nach der Meldung neu gefragt');
pushMsg(JSON.stringify({ type: 'new', after: { id: 'x', camera: 'andere_kamera' } }));
await new Promise((r) => setTimeout(r, 700));
F.sec('ev', c, states, subWs, pop); await new Promise((r) => setTimeout(r, 20));
assert.equal(calls.filter((m) => m.type === 'frigate/reviews/get' && m.reviewed == null).length, nGet0 + 1, 'andere Kamera: nichts');
pop.isConnected = false; F.sweep();
assert.deepEqual(subLog, ['+frigate/reviews/subscribe', '-frigate/reviews/subscribe'], 'Popup zu: abgemeldet');
assert.equal(F._dbg().holders, 0); assert.equal(F._dbg().timer, false, 'kein Takt mehr');
conn.noReviews = true; subLog.length = 0;
const pop2 = { isConnected: true };
F.sec('ev', c, states, subWs, pop2); await new Promise((r) => setTimeout(r, 20));
assert.deepEqual(subLog, ['+frigate/reviews/subscribe', '+frigate/events/subscribe'], 'ohne Review-Abo: Ereignis-Abo');
assert.deepEqual(F._dbg().subKind, ['events']);
document.hidden = true; F.sweep();
assert.equal(subLog[subLog.length - 1], '-frigate/events/subscribe', 'Seite im Hintergrund: abgemeldet');
document.hidden = false; F.sweep(); await new Promise((r) => setTimeout(r, 20));
assert.ok(F.subOn('frigate'), 'wieder vorn: wieder angemeldet');
pop2.isConnected = false; F.sweep();
assert.ok(!F.subOn('frigate'));
// Kachel: angemeldet (IntersectionObserver fehlt in Node → sichtbar), weg aus dem DOM → aufgeräumt; ohne Studio-Feld kein Live-Bild.
const host = { isConnected: true };
F.tileWatch(host, states[ID], subWs, {});
assert.equal(F._dbg().tiles, 1); assert.equal(F._dbg().live, 0, 'Live auf der Kachel aus');
assert.equal(F.liveWanted({ live_tile: true }), true); assert.equal(F.liveWanted({}), false); assert.equal(F.liveWanted({ live_tile: 'true' }), true);
await new Promise((r) => setTimeout(r, 20));
host.isConnected = false; F.sweep();
assert.equal(F._dbg().tiles, 0, 'Kachel weg: aufgeräumt'); assert.equal(F._dbg().holders, 0); assert.ok(!host._frig);
assert.equal(F._dbg().timer, false);
delete window.casoraKick;

// ── Frigate 2, Fix-Runde ───────────────────────────────────────────────────
// A1: HLS – Master selbst laden, die Unter-Liste pfadgenau signieren (die Signatur des Masters gilt dort nicht).
assert.equal(F.childList('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,CODECS="avc1.4d401f"\nindex-v1.m3u8\n'), 'index-v1.m3u8');
assert.equal(F.childList('#EXTM3U\n#EXTINF:10,\nseg-1.ts\n'), null, 'schon eine Medienliste: keine Unter-Liste');
{
  const signs = [], fetched = [];
  let deny = 0;
  const hh = { hassUrl: (x) => 'http://ha.local' + x, callWS: (m) => { signs.push(m); return Promise.resolve({ path: m.path + '?authSig=s' + signs.length }); } };
  globalThis.fetch = (url) => {
    fetched.push(url);
    if (deny > 0) { deny--; return Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('') }); }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nindex-v1.m3u8\n') });
  };
  const master = '/api/frigate/frigate/vod/gartentor/start/100/end/200/master.m3u8';
  const u = await F.hlsUrl(hh, master);
  assert.equal(u, 'http://ha.local/api/frigate/frigate/vod/gartentor/start/100/end/200/index-v1.m3u8?authSig=s2', 'Player bekommt die signierte Unter-Liste');
  assert.deepEqual(signs.map((m) => [m.path, m.expires]), [[master, 3600], ['/api/frigate/frigate/vod/gartentor/start/100/end/200/index-v1.m3u8', 3600]], 'beide pfadgenau, 1 Std.');
  assert.ok(/master\.m3u8\?authSig=s1$/.test(fetched[0]), 'Master signiert geladen');
  // Master-Zeile mit eigener Signatur (Frigates nginx hängt ?authSig an): signiert wird nur der Pfad der Unter-Liste.
  {
    const old = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nindex-v1.m3u8?authSig=alt\n') });
    signs.length = 0;
    const m3 = '/api/frigate/frigate/vod/gartentor/start/500/end/600/master.m3u8';
    const u3 = await F.hlsUrl(hh, m3);
    assert.equal(F.childList('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nindex-v1.m3u8?authSig=alt\n'), 'index-v1.m3u8?authSig=alt');
    assert.equal(signs[1].path, '/api/frigate/frigate/vod/gartentor/start/500/end/600/index-v1.m3u8', 'Unter-Liste ohne alte Signatur signiert');
    assert.ok(/index-v1\.m3u8\?authSig=s2$/.test(u3) && !/authSig=alt/.test(u3), 'Player bekommt nur die neue Signatur: ' + u3);
    globalThis.fetch = old;
  }
  // A6: 403 auf den Master → einmal frisch signieren, dann klappt es.
  deny = 1; signs.length = 0;
  const m2 = '/api/frigate/frigate/vod/gartentor/start/300/end/400/master.m3u8';
  const u2 = await F.hlsUrl(hh, m2);
  assert.ok(/index-v1\.m3u8\?authSig=/.test(u2) && signs.filter((m) => m.path === m2).length === 2, 'nach 403 neu signiert');
  // A6: Fehlschlag (null) wird nicht gemerkt; Bilder 10 Min., Videos 1 Std.
  let fail = true;
  const h2 = { callWS: (m) => (fail ? Promise.reject(new Error('x')) : Promise.resolve({ path: m.path + '?authSig=ok' })) };
  assert.equal(await F.sign(h2, '/x.jpg'), null);
  assert.equal(F.signAge('/x.jpg'), null, 'null nicht gemerkt');
  fail = false;
  assert.equal(await F.sign(h2, '/x.jpg'), '/x.jpg?authSig=ok', 'gleich danach neu versucht');
  // A16: Speicher begrenzt.
  for (let i = 0; i < 400; i++) F.sign(h2, '/many/' + i);
  assert.ok(F._signedN() <= 300, 'höchstens 300 Signaturen gemerkt: ' + F._signedN());
  // A5: Review-Clip = ganzer Review-Zeitraum, danach der Clip des Ereignisses (MP4 → HLS über den Proxy → vod/event).
  const srcs = F.clipSources(c, { rv: 'r1', ev: 'e1', clip: true, start: 1000000, end: 1060500 });
  assert.deepEqual(srcs.map((x) => x.k + ' ' + x.path.replace('/api/frigate/frigate/', '')), ['hls vod/gartentor/start/1000/end/1061/master.m3u8',
    'mp4 notifications/e1/clip.mp4', 'hls notifications/e1/master.m3u8', 'hls vod/event/e1/master.m3u8']);
  assert.deepEqual(F.clipSources(c, { ev: 'e1', clip: true, start: 1 }).map((x) => x.k), ['mp4', 'hls', 'hls'], 'Ereignis ohne Review: Clip zuerst');
  globalThis.fetch = () => Promise.resolve({ ok: true });
}
// C4: lesbarer Dateiname.
assert.equal(F.fileName('Hof/Kamera', new Date(2026, 9, 15, 16, 22).getTime(), 'mp4'), 'Hof Kamera 2026-10-15 16-22.mp4');
// C7: Ausschnitt ab hier, in den aufgenommenen Bereich gelegt.
assert.deepEqual(F.cut([{ s: 100, e: 200 }, { s: 300, e: 1000 }], 150, 5), { a: 150, b: 450 });
assert.deepEqual(F.cut([{ s: 100, e: 200 }], 150, 10), { a: 150, b: 200 }, 'nicht über das Ende');
// A17/C3: Startstelle der Aufnahmen.
const sg = [{ s: 3600, e: 7000 }];
assert.equal(F.recStart({ at: 'end' }, sg, [], 3600, 7200), 6940, 'Halten „Aufnahmen“: jetzt (Ende − 60 s)');
assert.equal(F.recStart({}, sg, [{ start: 5000000 }], 3600, 7200), 4997, 'erste Erkennung der Stunde, 3 s davor');
assert.equal(F.recStart({}, sg, [], 3600, 7200, 1e9), 3600, 'alte Stunde ohne Erkennung: Anfang');
assert.equal(F.recStart({ at: 5000 }, sg, [], 3600, 7200), 5000);
// C3: Tag ohne Stunde → letzte Stunde mit Erkennung (nicht 23 Uhr).
const dd = { day: '2026-10-15', hours: [{ h: 9, n: 2, dur: 3600 }, { h: 16, n: 1, dur: 3600 }, { h: 23, n: 0, dur: 3600 }] };
assert.equal(F.recDefault(dd, null).h, 16); assert.equal(F.recDefault(dd, 9).h, 9); assert.equal(F.recDefault(dd, null, true).h, 23, 'jetzt: neueste Stunde');
// B8: Stunden ohne führende Null.
assert.equal(n(F.hourName('2026-10-15', 9)), '9 Uhr');
assert.equal(n(F.hourRange(new Date(2026, 9, 15, 10).getTime() / 1000, new Date(2026, 9, 15, 11).getTime() / 1000)), '10–11 Uhr');
window.casoraLocale = () => 'en-US';
assert.equal(F.hourName('2026-10-15', 9), '9 AM');
assert.equal(n(F.hourRange(new Date(2026, 9, 15, 10).getTime() / 1000, new Date(2026, 9, 15, 11).getTime() / 1000)), '10–11 AM');
delete window.casoraLocale;
// A11/A12: Zeitumstellung – doppelte Stunde zusammengelegt und 2 Std. lang; sub_only-Stunden weg.
{
  const sum2 = F.parseSummary(JSON.stringify([{ day: '2026-10-25', events: 3, hours: [{ hour: '02', duration: 3600, events: 1 }, { hour: '02', duration: 3000, events: 2 },
    { hour: '05', duration: 1200, events: 0, sub_only: true }, { hour: '04', duration: 3600, events: 0 }] }]));
  assert.deepEqual(sum2[0].hours.map((h) => [h.h, h.dur, h.n]), [[2, 6600, 3], [4, 3600, 0]]);
  const tz = process.env.TZ;
  process.env.TZ = 'Europe/Berlin';
  assert.equal(F.hourSpan('2026-10-25', 2), 7200, 'Herbst: die Stunde 2 Uhr dauert 2 Std.');
  assert.equal(F.hourSpan('2026-10-25', 4), 3600);
  assert.equal(F.hourSpan('2026-10-25', 23), 3600, 'letzte Stunde bis Mitternacht');
  if (tz == null) delete process.env.TZ; else process.env.TZ = tz;
}
// A7: Mit Abo zählen Bewegung/Belegung nicht; „update“ höchstens alle 5 s, „new“/„end“ sofort.
{
  F.forget(ID);
  let nGet = 0, cb = null;
  const conn2 = { subscribeMessage: (fn) => { cb = fn; return Promise.resolve(() => {}); } };
  const ws7 = Object.assign({}, rvWs, { connection: conn2, callWS: (m) => { if (m.type === 'frigate/reviews/get' && m.reviewed == null) nGet++; return rvWs.callWS(m); } });
  const pop7 = { isConnected: true };
  F.sec('ev', c, states, ws7, pop7); await new Promise((r) => setTimeout(r, 30));
  assert.ok(F.subOn('frigate')); assert.equal(F.keyOf(ws7, c), 'abo', 'mit Abo: Schlüssel unabhängig vom Zustand');
  const n0 = nGet;
  states['binary_sensor.gartentor_motion'] = Object.assign({}, states['binary_sensor.gartentor_motion'], { last_changed: new Date().toISOString() });
  states['image.gartentor_person'] = Object.assign({}, states['image.gartentor_person'], { last_changed: new Date().toISOString() });
  F.sec('ev', c, states, ws7, pop7); await new Promise((r) => setTimeout(r, 30));
  assert.equal(nGet, n0, 'Bewegung/Schnappschuss mit Abo: keine neue Abfrage');
  cb(JSON.stringify({ type: 'update', after: { camera: 'gartentor' } }));
  F.sec('ev', c, states, ws7, pop7); await new Promise((r) => setTimeout(r, 30));
  assert.equal(nGet, n0, '„update“ innerhalb von 5 s: später');
  cb(JSON.stringify({ type: 'end', after: { camera: 'gartentor' } }));
  F.sec('ev', c, states, ws7, pop7); await new Promise((r) => setTimeout(r, 30));
  assert.equal(nGet, n0 + 1, '„end“: sofort');
  pop7.isConnected = false; F.sweep();
}
// Abo nach langer Sitzung (fix3 #5): WebSocket neu verbunden („ready“), neues hass.connection oder stummes Abo trotz
// neuer Erkennung → neu angemeldet; zweimal stumm → Abfrage-Takt.
{
  F.forget(ID);
  const mk = () => {
    const on = {}, log = [];
    const cn = { log, on, subscribeMessage: (fn, msg) => { log.push('+' + msg.type); cn.cb = fn; return Promise.resolve(() => log.push('-' + msg.type)); },
      addEventListener: (k, fn) => { (on[k] = on[k] || []).push(fn); }, fire: (k) => (on[k] || []).forEach((f) => f()) };
    return cn;
  };
  const cA = mk();
  const wsA = Object.assign({}, rvWs, { connection: cA, states });
  const pA = { isConnected: true };
  F.sec('ev', c, states, wsA, pA); await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(cA.log, ['+frigate/reviews/subscribe'], 'angemeldet');
  cA.fire('disconnected');
  assert.ok(!F.subOn('frigate'), 'Verbindung weg: Abo gilt nicht mehr (Abfrage-Takt)');
  assert.notEqual(F.keyOf(wsA, c), 'abo');
  cA.fire('ready'); await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(cA.log, ['+frigate/reviews/subscribe', '-frigate/reviews/subscribe', '+frigate/reviews/subscribe'], 'wieder verbunden: neu angemeldet');
  assert.ok(F.subOn('frigate'));
  // Neues connection-Objekt (Seite/Verbindung neu aufgebaut).
  const cB = mk();
  const wsB = Object.assign({}, wsA, { connection: cB });
  F.sec('ev', c, states, wsB, pA); F.sweep(); await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(cB.log, ['+frigate/reviews/subscribe'], 'neues hass.connection: dort angemeldet');
  // Stummes Abo: neuer Schnappschuss, aber keine Meldung → nach der Ruhezeit neu angemeldet.
  F._aboQuiet.quiet = 40;
  F.sweep();
  states['image.gartentor_person'] = Object.assign({}, states['image.gartentor_person'], { last_changed: new Date(Date.now() + 1000).toISOString() });
  F.sweep(); await new Promise((r) => setTimeout(r, 60)); F.sweep(); await new Promise((r) => setTimeout(r, 30)); F.sweep(); await new Promise((r) => setTimeout(r, 30));
  assert.equal(cB.log.filter((x) => x === '+frigate/reviews/subscribe').length, 2, 'stumm trotz Erkennung: neu angemeldet ' + cB.log.join(','));
  // Meldet sich das Abo, bleibt es.
  cB.cb(JSON.stringify({ type: 'update', after: { camera: 'gartentor' } }));
  states['image.gartentor_car'] = Object.assign({}, states['image.gartentor_car'], { last_changed: new Date(Date.now() + 2000).toISOString() });
  F.sweep(); await new Promise((r) => setTimeout(r, 10));
  cB.cb(JSON.stringify({ type: 'new', after: { camera: 'gartentor' } }));
  await new Promise((r) => setTimeout(r, 60)); F.sweep(); await new Promise((r) => setTimeout(r, 20));
  assert.equal(cB.log.filter((x) => x === '+frigate/reviews/subscribe').length, 2, 'Abo meldet sich: bleibt');
  F._aboQuiet.quiet = 12000;
  pA.isConnected = false; F.sweep();
  assert.ok(!F.subOn('frigate'));
}
// A13: „gesehen“ scheitert → wieder neu.
{
  F.forget(ID);
  F.sec('ev', c, states, rvWs); await new Promise((r) => setTimeout(r, 20));
  const bad = Object.assign({}, rvWs, { callWS: (m) => (m.type === 'frigate/reviews/viewed' ? Promise.reject(new Error('x')) : rvWs.callWS(m)) });
  const u0 = F.unseen(ID);
  const p = F.seen(bad, c, 'r1');
  assert.equal(F.unseen(ID), u0 - 1, 'sofort gesehen');
  assert.equal(await p, false);
  assert.equal(F.unseen(ID), u0, 'Fehler: wieder neu');
}
// C1: Halten „Letzte Erkennung“ öffnet die Review (nicht nur das Ereignis) und markiert sie gesehen; mit Weg zurück.
{
  const opened = [];
  window.casoraPopup = { _cur: null, open(cfg) { this._cur = cfg; opened.push(cfg); }, close() { this._cur = null; }, get current() { return this._cur; } };
  window._casoraSoftKit = { layout: (o) => ({ type: 'layout', fields: o.fields }), bare: () => ({}) };
  window._casoraTapTile = (id, done) => done(true);
  window.document.querySelector = (q) => (q === 'home-assistant' ? { hass: rvWs } : null);
  F.forget(ID);
  calls.length = 0;
  const lat = F.hold(rvWs, ID).find((x) => x.t === 'Letzte Erkennung');
  assert.ok(lat, 'Eintrag da');
  lat.fn();
  assert.equal(opened[0].title, 'Letzte Erkennung', 'sofort ein Popup mit „Wird geladen …“ (A8)');
  for (let i = 0; i < 30 && opened.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  const det = opened[opened.length - 1];
  assert.equal(det._frigView, 'detail', 'Detail geöffnet');
  assert.equal(det.content.fields.m.card.rv, 'r1', 'die neueste Review');
  assert.ok(typeof det.back === 'function', 'Weg zurück zum Kamera-Popup');
  assert.equal(det.dismiss_on_background, false, 'Tippen ins Leere schließt nicht');
  assert.equal(det.eyebrow, 'Hofkamera', 'Name der Kachel über dem Titel (B13, fix3 #2)');
  assert.equal(det.content.fields.m.card.camName, 'Hofkamera', 'Dateinamen mit dem Kachelnamen');
  assert.ok(calls.some((m) => m.type === 'frigate/reviews/viewed' && m.ids[0] === 'r1'), 'als gesehen markiert');
  // Geschlossen, bevor die Daten da sind: nichts öffnet sich später (A8).
  F.forget(ID); opened.length = 0;
  F.hold(rvWs, ID).find((x) => x.t === 'Letzte Erkennung').fn();
  window.casoraPopup.close();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(opened.length, 1, 'kein spätes Popup');
  delete window.casoraPopup; delete window._casoraTapTile;
}
console.log('frigate: ok');
