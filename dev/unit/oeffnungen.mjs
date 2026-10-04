// Türen/Fenster mit zwei Sensoren (Kontakt + Kippsensor) und Kombi-Sensor: eine Öffnung
// zählt einmal, „gekippt“ kommt vom Kippsensor bzw. vom tilt-Attribut des Kombi-Sensors.
// Prüft die Laufzeit (window.casoraOpenings, 00-finden.js), die Studio-Fassung
// (casoraBasis.openings, casora-panel-basis.js), das Sicherheits-Badge (Text wie im
// Produktiv-Dashboard) und das Befüllen der Badges im Studio.
//   node dev/unit/oeffnungen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/00-finden.js'))();
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();

// Synthetisches Haus: Balkontür mit Kontakt + Kippsensor (ein Gerät) + Kombi-Vorlage ohne Gerät,
// Küchenfenster mit Kontakt + Kippsensor (zwei Geräte, gleicher Namenskern) ohne Kombi,
// Bürofenster einfach, Haustür einfach, Bewegungsmelder (zählt nicht).
function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  h.areas.wz = { area_id: 'wz', name: 'Wohnzimmer' };
  h.areas.ku = { area_id: 'ku', name: 'Küche' };
  h.areas.bu = { area_id: 'bu', name: 'Büro' };
  h.areas.fl = { area_id: 'fl', name: 'Flur' };
  const dev = (id, area, name) => { h.devices[id] = { id, area_id: area, name }; };
  const ent = (eid, { dev: d = null, area = null, dc, name, state = 'off', attrs = {} } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: d, area_id: area, platform: d ? 'zha' : 'template' };
    h.states[eid] = { entity_id: eid, state, attributes: { device_class: dc, friendly_name: name, ...attrs } };
  };
  dev('d_balkon', 'wz', 'Balkontür Sensor');
  ent('binary_sensor.balkontuer_contact', { dev: 'd_balkon', dc: 'door', name: 'Balkontür' });
  ent('binary_sensor.balkontuer_kippsensor_contact', { dev: 'd_balkon', dc: 'window', name: 'Balkontür Kippsensor' });
  ent('binary_sensor.balkontuer_kombi', { area: 'wz', dc: 'door', name: 'Balkontür', attrs: { tilt: false } });
  dev('d_kf1', 'ku', 'Küchenfenster'); dev('d_kf2', 'ku', 'Küchenfenster gekippt');
  ent('binary_sensor.kuechenfenster_contact', { dev: 'd_kf1', dc: 'window', name: 'Küchenfenster' });
  ent('binary_sensor.kuechenfenster_kipp', { dev: 'd_kf2', dc: 'window', name: 'Küchenfenster Kipp' });
  dev('d_bf', 'bu', 'Bürofenster');
  ent('binary_sensor.buerofenster', { dev: 'd_bf', dc: 'window', name: 'Bürofenster' });
  dev('d_ht', 'fl', 'Haustür');
  ent('binary_sensor.haustuer', { dev: 'd_ht', dc: 'door', name: 'Haustür' });
  ent('binary_sensor.flur_bewegung', { dev: 'd_ht', dc: 'motion', name: 'Flur Bewegung', state: 'on' });
  dev('d_lock', 'fl', 'Schloss');
  h.entities['lock.haustuer'] = { entity_id: 'lock.haustuer', device_id: 'd_lock', area_id: null };
  h.states['lock.haustuer'] = { entity_id: 'lock.haustuer', state: 'locked', attributes: { friendly_name: 'Haustür' } };
  return h;
}
const set = (h, id, state, attrs) => { h.states[id] = { ...h.states[id], state, attributes: { ...h.states[id].attributes, ...(attrs || {}) } }; };
const ALL = ['binary_sensor.balkontuer_contact', 'binary_sensor.balkontuer_kippsensor_contact', 'binary_sensor.balkontuer_kombi',
  'binary_sensor.kuechenfenster_contact', 'binary_sensor.kuechenfenster_kipp', 'binary_sensor.buerofenster',
  'binary_sensor.haustuer', 'binary_sensor.flur_bewegung'];
const brief = (us) => us.map((u) => ({ main: u.main, ids: u.ids.slice().sort(), combo: u.combo, kind: u.kind, state: u.state }));

// ── Gruppierung: beide Fassungen gleich ──
for (const [name, fn] of [['Laufzeit', window.casoraOpenings], ['Studio', window.casoraBasis.openings]]) {
  const h = house();
  const u = fn(h, ALL);
  assert.equal(u.length, 4, name + ': 4 Öffnungen (Balkontür, Küchenfenster, Bürofenster, Haustür)');
  const balkon = u.find((x) => x.main === 'binary_sensor.balkontuer_kombi');
  assert.ok(balkon && balkon.combo, name + ': Kombi-Sensor vertritt die Balkontür');
  assert.deepEqual(balkon.ids.slice().sort(), ['binary_sensor.balkontuer_contact', 'binary_sensor.balkontuer_kippsensor_contact', 'binary_sensor.balkontuer_kombi']);
  const kf = u.find((x) => x.main === 'binary_sensor.kuechenfenster_contact');
  assert.equal(kf.tilt, 'binary_sensor.kuechenfenster_kipp', name + ': Kippsensor gehört zum Küchenfenster (Namenskern)');
  assert.equal(kf.kind, 'window');
  assert.equal(balkon.kind, 'door');
  // Zustände
  set(h, 'binary_sensor.kuechenfenster_contact', 'on'); set(h, 'binary_sensor.kuechenfenster_kipp', 'on');
  set(h, 'binary_sensor.balkontuer_kombi', 'on', { tilt: true });
  set(h, 'binary_sensor.buerofenster', 'on');
  const s = Object.fromEntries(fn(h, ALL).map((x) => [x.main, x.state]));
  assert.equal(s['binary_sensor.kuechenfenster_contact'], 'tilted', name + ': Kontakt + Kipp an = gekippt');
  assert.equal(s['binary_sensor.balkontuer_kombi'], 'tilted', name + ': Kombi mit tilt = gekippt');
  assert.equal(s['binary_sensor.buerofenster'], 'open');
  assert.equal(s['binary_sensor.haustuer'], 'closed');
  set(h, 'binary_sensor.kuechenfenster_kipp', 'off');
  assert.equal(fn(h, ALL).find((x) => x.main === 'binary_sensor.kuechenfenster_contact').state, 'open', name + ': nur Kontakt an = offen');
  // Ohne Kombi-Sensor: Kontakt + Kippsensor als ein Paar
  const pair = fn(h, ['binary_sensor.balkontuer_contact', 'binary_sensor.balkontuer_kippsensor_contact']);
  assert.equal(pair.length, 1, name + ': Paar ohne Kombi = eine Öffnung');
  assert.equal(pair[0].main, 'binary_sensor.balkontuer_contact');
}
assert.deepEqual(brief(window.casoraOpenings(house(), ALL)), brief(window.casoraBasis.openings(house(), ALL)), 'Laufzeit und Studio gleich');

// ── Kontakt-Popups: Kombi ersetzt die Einzelsensoren, Kippsensor ohne Kombi fällt weg ──
{
  const h = house();
  window.CASORA_SETTINGS = {};
  const cc = window.casoraContacts(h);
  const mem = (arr) => arr.filter((x) => !cc.excl.includes(x)).map((x) => cc.sub[x] || x).filter((x, i, a) => a.indexOf(x) === i);
  const shown = [].concat(...cc.groups.map((g) => mem(g.members)));
  assert.equal(shown.filter((x) => x.startsWith('binary_sensor.balkontuer')).length, 1, 'Balkontür einmal: ' + shown);
  assert.ok(shown.includes('binary_sensor.balkontuer_kombi'));
  assert.ok(!shown.includes('binary_sensor.kuechenfenster_kipp'), 'Kippsensor ohne Kombi ausgeblendet');
  assert.equal(cc.tilt['binary_sensor.kuechenfenster_contact'], 'binary_sensor.kuechenfenster_kipp');
}

// ── Studio: Badges befüllen trägt nur den Kombi-Sensor ein, sonst das Paar ──
{
  const h = house();
  const T = [{ name: 'Wohnzimmer', vars: {} }, { name: 'Küche', vars: {} }];
  window.casoraBasis.fillBadges(h, T);
  const sec = (v) => Object.keys(v).filter((k) => /^security_entity_\d+$/.test(k)).map((k) => v[k]);
  assert.deepEqual(sec(T[0].vars), ['binary_sensor.balkontuer_kombi'], 'Wohnzimmer: nur der Kombi-Sensor');
  assert.deepEqual(sec(T[1].vars).sort(), ['binary_sensor.kuechenfenster_contact', 'binary_sensor.kuechenfenster_kipp'], 'Küche: Paar');
}

// ── Sicherheits-Badge: Text wie im Produktiv-Dashboard ──
const tpl = JSON.parse(src('dashboards/casora/button_card_templates.json')).casora_badge_security_group;
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const nameFn = new Function('hass', 'states', 'entity', 'variables', 'user', body(tpl.name));
const sub = (h, variables) => {
  const html = nameFn(h, h.states, null, { enabled: true, ...variables }, {});
  return /badge-sub">([^<]*)</.exec(html)[1];
};
{
  const h = house();
  const V = { locks: ['lock.haustuer'], entities: ['binary_sensor.balkontuer_kombi', 'binary_sensor.kuechenfenster_contact', 'binary_sensor.kuechenfenster_kipp', 'binary_sensor.buerofenster', 'binary_sensor.haustuer', 'binary_sensor.flur_bewegung'] };
  assert.equal(sub(h, V), 'Gesichert');
  set(h, 'lock.haustuer', 'unlocked');
  assert.equal(sub(h, V), '1 Schloss');
  set(h, 'binary_sensor.buerofenster', 'on');
  assert.equal(sub(h, V), '1 Schloss · Fenster offen', 'Schloss offen + Fenster offen');
  set(h, 'lock.haustuer', 'locked');
  assert.equal(sub(h, V), 'Fenster offen');
  set(h, 'binary_sensor.buerofenster', 'off');
  set(h, 'binary_sensor.kuechenfenster_contact', 'on'); set(h, 'binary_sensor.kuechenfenster_kipp', 'on');
  assert.equal(sub(h, V), 'Fenster gekippt', 'Paar gekippt zählt einmal');
  set(h, 'binary_sensor.balkontuer_kombi', 'on', { tilt: true });
  assert.equal(sub(h, V), 'Fenster gekippt · Tür gekippt');
  set(h, 'binary_sensor.balkontuer_kombi', 'on', { tilt: false });
  assert.equal(sub(h, V), 'Tür offen · Fenster gekippt');
  set(h, 'binary_sensor.kuechenfenster_kipp', 'off');
  assert.equal(sub(h, V), 'Tür offen · Fenster offen');
  set(h, 'binary_sensor.buerofenster', 'on');
  assert.equal(sub(h, V), 'Tür offen · 2 Fenster offen');
  // Gruppen-Helfer ohne Geräteklasse (z. B. „Fenster“) zählen ihre Mitglieder, nie „Geöffnet“.
  h.states['binary_sensor.fenster_gruppe'] = { entity_id: 'binary_sensor.fenster_gruppe', state: 'on',
    attributes: { friendly_name: 'Fenster', entity_id: ['binary_sensor.buerofenster', 'binary_sensor.kuechenfenster_contact', 'binary_sensor.kuechenfenster_kipp'] } };
  set(h, 'binary_sensor.balkontuer_kombi', 'off', { tilt: false });
  set(h, 'lock.haustuer', 'unlocked');
  assert.equal(sub(h, { locks: ['lock.haustuer'], entities: ['binary_sensor.fenster_gruppe'] }), '1 Schloss · 2 Fenster offen');
  // Kamera offline
  h.states['camera.flur'] = { entity_id: 'camera.flur', state: 'unavailable', attributes: {} };
  set(h, 'lock.haustuer', 'locked');
  assert.equal(sub(h, { locks: ['lock.haustuer'], cameras: ['camera.flur'] }), 'Kamera offline');
}
// Ohne geladene Module (Rückfall im Badge selbst): gleicher Wortlaut für die Hauptfälle.
{
  const keep = window.casoraOpenings;
  delete window.casoraOpenings;
  const h = house();
  const V = { locks: ['lock.haustuer'], entities: ['binary_sensor.buerofenster', 'binary_sensor.haustuer'] };
  set(h, 'lock.haustuer', 'unlocked'); set(h, 'binary_sensor.buerofenster', 'on');
  assert.equal(sub(h, V), '1 Schloss · Fenster offen');
  set(h, 'binary_sensor.buerofenster', 'on', { tilt: true });
  assert.equal(sub(h, V), '1 Schloss · Fenster gekippt');
  window.casoraOpenings = keep;
}
console.log('ok oeffnungen');
