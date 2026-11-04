// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraDevice, custom_components/casora/scripts/local/02-devices.js#_casoraPrint, dev/casora_mock/halten.py
// 3D printer popup content (owner 04.11.2026, v3 popup of a Bambu Lab printer: „ein bisschen nackig, vielleicht ein
// bisschen mehr Infos“). Roles by ha-bambulab translation_key on the test house's printer (dev/casora_mock/halten.py),
// never by names:
//   temperatures  nozzle_temp/target_nozzle_temp, bed_temp/target_bed_temp, chamber_temp/target_chamber_temp
//   fans          cooling_fan/part_fan, aux_fan, chamber_fan (fan entities) or their *_fan_speed sensors
//   AMS           tray (sub device, attributes color/type/remain/active/empty), active_tray, humidity, humidity_index
//                 (ha-bambulab since 2024: 1 dry … 5 wet), ams_temp, external_spool
//   print         subtask_name, cover_image (image), print_bed_type, printable_objects/skipped_objects,
//                 printing_speed (select) / speed_profile, start_time
//   device        total_usage_hours, nozzle_diameter/nozzle_type, firmware_update
// and the v3 sections built from them: „Temperaturen“ (heating word below the target, fans only while printing,
// at rest only while cooling down), „Material“ (slots with colour, type, remaining, the active one named; the AMS air
// as one row with a word; the external spool only when in use), „Druck“ (cover image, plate, objects, speed picker
// only when the printer takes it), „Drucker“ at rest, the firmware hint at rest.
//   node dev/unit/printer_content.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { testhaus } from './lib/testhaus.mjs';

const hass = testhaus({ publicOnly: true });
globalThis.window = globalThis;
globalThis.innerWidth = 1400;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} },
  getElementById: () => null, createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), documentElement: { style: {} } };
globalThis.customElements = { get: () => null, define: () => {}, whenDefined: () => Promise.resolve() };
globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true });
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
const finder = src('00-finder.js');
const a = finder.indexOf('(function () {\n  if (window.casoraDevice) return;');
const b = finder.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'device finder found');
new Function(finder.slice(a, b + 6))();
try { new Function(src('02-devices.js'))(); } catch (e) { /* the rest needs a DOM – the printer exists before */ }
const P = window._casoraPrint, H = window._casoraHH, L = window._casoraLaundry;
assert.ok(P && H && L && window.casoraDevice, 'printer, layout helper and finder loaded');

// UI stub: groups as JSON, so rows can be read back; Soft + v3 on.
const groups = (html) => [...String(html).matchAll(/<G>(.*?)<\/G>/g)].map((m) => JSON.parse(m[1]));
window._casoraUI = {
  group: (rows, title) => '<G>' + JSON.stringify({ title: title || null, rows: rows.filter(Boolean) }) + '</G>',
  row: { toggle: (o) => Object.assign({ toggle: true }, o) },
  segments: () => '<SEG>', settings: () => '', settingsRow: () => null, empty: () => '<E>', stage: () => '<STAGE>',
  esc: (t) => String(t),
};
H.on = () => true;
window._casoraDish = Object.assign(window._casoraDish || {}, { v3: () => true });
L.fetch = () => {};

// The test house's printer: the stage sensor of a device with a print status (keys only).
const R = hass.entities;
const stageId = Object.keys(R).find((id) => R[id].translation_key === 'stage' && Object.keys(R).some((x) => R[x].device_id === R[id].device_id
  && R[x].translation_key === 'print_status'));
assert.ok(stageId, 'test house printer (stage + print_status)');
const base = JSON.parse(JSON.stringify(hass.states));
const ent = { entity_id: stageId };
const c = P.resolve(ent, {}, base, hass);

// ── Roles ──
const isKey = (id, key) => !!id && !!R[id] && R[id].translation_key === key;
assert.ok(isKey(c.nozT, 'target_nozzle_temp') && isKey(c.bedT, 'target_bed_temp'), 'targets of nozzle and bed');
assert.ok(isKey(c.chamber, 'chamber_temp'), 'chamber temperature');
assert.ok(isKey(c.cover, 'cover_image') && /^image\./.test(c.cover), 'cover image (image entity)');
assert.ok(isKey(c.objects, 'printable_objects') && isKey(c.skipped, 'skipped_objects'), 'printable and skipped objects');
assert.equal(c.slots.length, 4, 'four AMS slots from the sub device');
assert.ok(c.slots.every((x) => isKey(x, 'tray')), 'slots are tray sensors');
assert.ok(isKey(c.amsIdx, 'humidity_index') && isKey(c.amsHum, 'humidity') && isKey(c.amsTemp, 'ams_temp'), 'AMS air');
assert.ok(isKey(c.ext, 'external_spool') && isKey(c.activeSlot, 'active_tray'), 'external spool, active tray');
assert.ok(isKey(c.speedSel, 'printing_speed') && isKey(c.speed, 'speed_profile'), 'speed select and profile');
assert.ok(isKey(c.usage, 'total_usage_hours') && isKey(c.fw, 'firmware_update'), 'usage hours, firmware');
for (const k of ['cooling_fan', 'aux_fan', 'chamber_fan']) assert.ok(c.fans.some((f) => isKey(f[0], k)), 'fan ' + k);
for (const id of [c.cover, c.objects, c.skipped, c.chamber]) assert.ok(P.watch(c).includes(id), 'watched: ' + id);

const S = (patch) => {
  const s = JSON.parse(JSON.stringify(base));
  for (const [id, v] of Object.entries(patch || {})) s[id] = Object.assign({ entity_id: id, attributes: {} }, s[id] || {}, v);
  return s;
};
const sec = (kind, states) => groups(P.inner(kind, c, states));
const rowsOf = (gs, title) => ((gs.find((g) => g.title === title) || {}).rows || []);
const row = (rows, re) => rows.find((r) => re.test(String(r.label || '')));
const printing = { [c.status]: { state: 'running' }, [c.st]: { state: 'printing' } };
const idle = { [c.status]: { state: 'finish' }, [c.st]: { state: 'idle' }, [c.noz]: { state: '26' }, [c.nozT]: { state: '0' },
  [c.bed]: { state: '25' }, [c.bedT]: { state: '0' }, [c.chamber]: { state: '24' } };

// ── Temperatures ──
let st = S(printing);
let t = rowsOf(sec('p_temp3', st), 'Temperaturen');
assert.equal(row(t, /^Düse$/).value, '220 °C', 'nozzle now');
assert.equal(row(t, /^Düse$/).sub, 'Ziel 220 °C', 'nozzle at target: the target');
assert.equal(row(t, /^Druckbett$/).value, '60 °C', 'bed now');
assert.equal(row(t, /^Druckraum$/).value, '34 °C', 'chamber');
const fans = row(t, /^Lüfter$/);
assert.ok(fans && /Bauteil 80 %/.test(fans.sub) && /Zusatz 40 %/.test(fans.sub) && /Druckraum 30 %/.test(fans.sub), 'fans in one row: ' + JSON.stringify(fans));
st = S(Object.assign({}, printing, { [c.noz]: { state: '150' } }));
const heat = row(rowsOf(sec('p_temp3', st), 'Temperaturen'), /^Düse$/);
assert.equal(heat.sub, 'Heizt auf · Ziel 220 °C', 'below target: heating word');
assert.equal(heat.iconTone, 'warn', 'below target: warm tone');
assert.equal(sec('p_temp3', S(idle)).length, 0, 'at rest and cold: no temperatures');
const cool = rowsOf(sec('p_temp3', S(Object.assign({}, idle, { [c.noz]: { state: '84' } }))), 'Temperaturen');
assert.ok(row(cool, /^Düse$/) && row(cool, /^Düse$/).sub === 'Kühlt ab' && !row(cool, /^Lüfter$/), 'at rest and hot: cooling down, no fans');

// ── Material ──
const m = rowsOf(sec('p_ams3', S(printing)), 'Material');
const s1 = row(m, /^Testfilament PLA$/);
assert.ok(s1 && /Slot 1/.test(s1.sub) && /PLA/.test(s1.sub) && /Wird genutzt/.test(s1.sub), 'active slot named: ' + JSON.stringify(s1));
assert.equal(s1.value, '62 %', 'remaining of the slot');
assert.match(String(s1.iconTone), /^rgb\(/, 'slot colour from the attributes');
const s2 = row(m, /^Testfilament PETG$/);
assert.ok(s2 && !/Wird genutzt/.test(s2.sub) && s2.valueTone === 'warn', 'low slot warns, not active');
assert.equal(row(m, /^Testfilament Weiß$/).value, null, 'unknown remaining: no value');
assert.ok(row(m, /^Leer$/), 'empty slot');
const air = row(m, /^Luft im AMS$/);
assert.ok(air && air.value === '31 %' && /^Trocken · 27,5 °C$/.test(air.sub), 'AMS air, index 2 = dry: ' + JSON.stringify(air));
const word = (idx) => row(rowsOf(sec('p_ams3', S({ [c.amsIdx]: { state: String(idx) } })), 'Material'), /^Luft im AMS$/).sub;
assert.match(word(3), /^In Ordnung/, 'index 3: ok');
assert.match(word(5), /^Feucht · Trockenmittel tauschen$/, 'index 5: wet');
assert.ok(!row(m, /^Externe Spule/), 'empty external spool not shown');
const ext = rowsOf(sec('p_ams3', S({ [c.ext]: { state: 'Testfilament TPU', attributes: { active: true, empty: false, name: 'Testfilament TPU',
  type: 'TPU', color: '#264653FF', remain: -1 } } })), 'Material');
assert.ok(row(ext, /^Testfilament TPU$/) && /Externe Spule/.test(row(ext, /^Testfilament TPU$/).sub), 'external spool in use');
// The former list (no v3) read the index the old way round: 2 (dry) asked for new desiccant.
const old = (idx) => JSON.stringify(sec('p_ams', S({ [c.amsIdx]: { state: String(idx) } })));
assert.ok(!/Trockenmittel tauschen/.test(old(2)), 'index 2 is dry, no desiccant hint');
assert.ok(/Trockenmittel tauschen/.test(old(5)), 'index 5 is wet: desiccant hint');

// ── Print ──
const pic = { [c.cover]: { state: '2026-11-04T10:00:00+00:00', attributes: { entity_picture: '/api/image_proxy/' + c.cover + '?token=x' } } };
const d = rowsOf(sec('p_job3', S(Object.assign({}, printing, pic))), 'Druck');
const task = row(d, /^Aufgabe$/);
assert.ok(task && task.image === '/api/image_proxy/' + c.cover + '?token=x' && task.imageFit === 'cover', 'cover image at the job: ' + JSON.stringify(task));
assert.equal(row(d, /^Druckplatte$/).value, 'Texturiert (PEI)', 'plate');
const obj = row(d, /^Objekte$/);
assert.ok(obj && obj.value === '4' && obj.sub === '1 übersprungen', 'objects: ' + JSON.stringify(obj));
const spd = row(d, /^Geschwindigkeit$/);
assert.ok(spd && spd.value === 'Standard' && spd.page === 'print-speed|' + c.st, 'speed as a picker row: ' + JSON.stringify(spd));
assert.ok(row(d, /^Gestartet$/), 'start time');
const noCtl = row(rowsOf(sec('p_job3', S(Object.assign({}, printing, { [c.speedSel]: { state: 'unavailable' } }))), 'Druck'), /^Geschwindigkeit$/);
assert.ok(noCtl && !noCtl.page && noCtl.value === 'Standard', 'speed without control: a value row');
const dz = rowsOf(sec('p_job3', S(idle)), 'Zuletzt gedruckt');
assert.ok(row(dz, /^Letzte Aufgabe$/) && !row(dz, /^Geschwindigkeit$/) && !row(dz, /^Objekte$/), 'at rest: the last job');
const opts = sec('p_speed_all', S(printing));
assert.deepEqual(opts[0].rows.map((r) => r.label), ['Leise', 'Standard', 'Sport', 'Turbo'], 'speed page lists the profiles');
assert.ok(opts[0].rows.find((r) => r.label === 'Sport').svc.service === 'select_option', 'a profile picks the option');

// ── At rest: device and firmware ──
const dev = rowsOf(sec('p_dev3', S(idle)), 'Drucker');
assert.equal(row(dev, /^Druckzeit insgesamt$/).value, '512 Std.', 'total print hours');
assert.ok(row(dev, /^Düse$/) && /0,4 mm/.test(row(dev, /^Düse$/).value), 'nozzle size');
assert.equal(sec('p_dev3', S(printing)).length, 0, 'printing: no device section');
const fwOn = { [c.fw]: { state: 'on', attributes: { installed_version: '1.2.3', latest_version: '1.2.4' } } };
assert.ok(row(rowsOf(sec('p_alerts', S(Object.assign({}, idle, fwOn))), 'Hinweise'), /^Firmware-Update verfügbar$/), 'at rest: firmware hint');

// ── v3 layout: sections on the right, nothing under „Mehr“ ──
const keysOf = (card) => {
  const g = ((card.styles || {}).grid || []).find((x) => x['grid-template-areas']);
  return g ? g['grid-template-areas'].replace(/"/g, '').split(/\s+/).filter(Boolean) : [];
};
const lay = (states) => {
  const pop = P.popup(ent, {}, states, Object.assign({}, hass, { states }));
  const cf = pop.custom_fields;
  return { left: keysOf(cf.left.card), right: cf.right ? keysOf(cf.right.card) : [], top: keysOf(pop) };
};
const lp = lay(S(printing)), li = lay(S(idle));
const all = (l) => l.left.concat(l.right);
for (const k of ['ctrl', 'job3', 'temp3', 'ams3']) assert.ok(all(lp).includes(k), 'printing: section ' + k + ' (' + all(lp) + ')');
for (const k of ['job3', 'temp3', 'ams3', 'dev3']) assert.ok(all(li).includes(k), 'at rest: section ' + k + ' (' + all(li) + ')');
assert.ok(!all(lp).includes('more') && !lp.top.includes('more'), 'v3: no „Mehr“');
assert.equal(lp.left[0], 'stage', 'the dial stays first');
console.log('printer_content: ok');
process.exit(0);
