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

// Finder
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

// Zustand und Kachel
let s = F.status(c, states, NOW);
assert.equal(s.last.o, 'person'); assert.equal(n(F.tileText(s, NOW)), 'Person, vor 3 Min.');
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
assert.equal(n(F.tileText(F.status(c, states, NOW), NOW)), 'Erkennung aus');
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
};
let h = n(F.sec('hero', c, states, hass));
assert.ok(/^<line>Zuletzt: Person\|vor \d+ Min\.<\/line>$/.test(h), h);
states['switch.gartentor_recordings'].state = 'off';
assert.ok(/Aufnahme aus/.test(n(F.sec('hero', c, states, hass))), 'nur „Aufnahme aus“ steht im Kopf');
states['switch.gartentor_recordings'].state = 'on';
states['binary_sensor.gartentor_person_occupancy'] = { state: 'on', attributes: {}, last_changed: new Date().toISOString() };
assert.ok(/^<line>Person erkannt\|/.test(n(F.sec('hero', c, states, hass))));
const ctl = n(F.sec('ctl', c, states, hass));
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
assert.ok(/In Frigate öffnen=~@frigate-go:\/ccab4aaf_frigate/.test(failTxt) && /Aufnahmen=~In den Medien/.test(failTxt), failTxt);


// Liste mit 10 Erkennungen: 8 sichtbar + „Mehr anzeigen“; Antippen eines Objekts filtert, noch einmal → alle.
const many = JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i, camera: 'gartentor', label: i % 3 ? 'car' : 'person',
  start_time: (Date.now() - (i + 1) * 3600000) / 1000, end_time: i ? (Date.now() - (i + 1) * 3600000) / 1000 + 30 : null, has_clip: true, has_snapshot: true, zones: [] })));
const okWs = Object.assign({}, hass, { callWS: (m) => Promise.resolve(m.type === 'auth/sign_path' ? { path: m.path + '?authSig=x' } : many) });
F.forget('camera.gartentor');
F.sec('ev', c, states, okWs);
await new Promise((r) => setTimeout(r, 10));
let evh = n(F.sec('ev', c, states, okWs));
assert.equal((evh.match(/@frigate-ev:/g) || []).length, 8, evh);
assert.ok(/data-casora-mi="frigate-more:camera\.gartentor"[^>]*>.*Mehr anzeigen/.test(evh) && /Person=Läuft~/.test(evh), evh);
const hook = (id) => window._casoraMiHooks.some((fn) => fn(id));
assert.ok(hook('frigate-more:camera.gartentor'));
assert.equal((n(F.sec('ev', c, states, okWs)).match(/@frigate-ev:/g) || []).length, 10, 'Mehr: alle');
assert.ok(hook('frigate-flt:camera.gartentor|person'));
evh = n(F.sec('ev', c, states, okWs));
assert.ok(/<group Letzte Erkennungen · Person>/.test(evh) && !/Auto=/.test(evh) && /Alle Objekte zeigen/.test(evh), evh);
assert.ok(/Person=[^;]*@frigate-flt:camera\.gartentor\|person/.test(n(F.sec('objs', c, states, okWs))), 'Objekt-Zeile filtert');
assert.ok(hook('frigate-flt:camera.gartentor|person'));
assert.equal(F.filter('camera.gartentor'), null, 'noch einmal: Filter aus');

// Halten-Menü: Erkennung/Aufnahme aus mit Rückfrage, an ohne; letzte Erkennung; Frigate öffnen.
states['binary_sensor.gartentor_person_occupancy'].state = 'off';
let m = F.hold(hass, ID);
assert.deepEqual(m.map((x) => x.t), ['Erkennung aus', 'Aufnahme aus', 'Letzte Erkennung', 'In Frigate öffnen']);
assert.equal(m[0].svc, 'switch.turn_off'); assert.equal(m[0].entity, 'switch.gartentor_detect'); assert.ok(m[0].ask);
states['switch.gartentor_recordings'].state = 'off';
m = F.hold(hass, ID);
assert.equal(m[1].t, 'Aufnahme an'); assert.equal(m[1].svc, 'switch.turn_on'); assert.equal(m[1].ask, null, 'einschalten ohne Rückfrage');
states['switch.gartentor_detect'].state = 'unavailable';
assert.ok(!F.hold(hass, ID).some((x) => /Erkennung (an|aus)/.test(x.t)), 'Schalter nicht verfügbar → kein Eintrag');
assert.deepEqual(F.hold(hass, 'camera.andere'), [], 'fremde Kamera: nichts');
console.log('frigate: ok');
